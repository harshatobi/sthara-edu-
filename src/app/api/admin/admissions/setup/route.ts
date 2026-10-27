import { NextResponse, type NextRequest } from 'next/server';
import { bad, requireAdmin, str } from '@/lib/admin/serverAuth';
import { admissionError } from '@/lib/admin/admissionsServer';
import { isSession, nextSession, sessionOf } from '@/lib/admin/format';
import { checkAgeRules } from '@/lib/admin/application';
import { GRADES } from '@/lib/students/register';
import { applyPath, onlineOf } from '@/lib/admin/familyAccess';
import { flushSoon } from '@/lib/admin/crmServer';

export const dynamic = 'force-dynamic';

/**
 * Admissions set-up (admissions.setup).
 *   POST { kind: 'stages', own: [{ key?, label, active, requires?, message? }], offer: { label, respondDays, message? }, enrolled: { label, message? } }
 *        message: the WhatsApp message a family gets on reaching the stage ({child}, {school}, {stage}); blank: none
 *        the school's stages in order; Offer and Enrolled can be renamed, not moved or removed; requires: the checks
 *        ('documents', 'age') an applicant must pass before leaving the stage
 *   POST { kind: 'age', cutoff: 'MM-DD', min: { grade: years }, max: { grade: years } }
 *        the age for each class on the cut-off date of the admission year (blank min: Class 1 at 6, a year a class)
 *   POST { kind: 'seats', session?, seats: [{ grade, capacity | null }] }
 *        seats for new admissions per grade (null: no limit); more seats fill from the waitlist at once
 *   POST { kind: 'online', open, enquiries, note? }
 *        whether families can apply on the school's apply page and from the parent portal, whether anyone can ask
 *        about admission there without signing in (and from the QR poster), and a note shown to them
 *   GET  (admissions.read) online applications: open or not, the note, the apply link, and how many families have
 *        an application started but not yet sent. Also sends any stage messages still queued (the overnight sweep
 *        queues them when a waitlisted family gets a seat), so they go out when the office next opens admissions.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.read');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const [{ data }, { count }] = await Promise.all([
    db.from('schools').select('settings').eq('id', admin.schoolId).maybeSingle(),
    db.from('admission_applicants').select('id', { count: 'exact', head: true }).eq('school_id', admin.schoolId)
      .in('channel', ['online', 'portal']).is('submitted_at', null).not('stage', 'in', '(rejected,withdrawn)'),
  ]);
  flushSoon(db, admin.schoolId);
  const code = typeof (data?.settings as Record<string, unknown> | null)?.code === 'string' ? (data!.settings as Record<string, string>).code : null;
  return NextResponse.json({ ...onlineOf(data?.settings), path: code ? applyPath(code) : null, drafts: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.setup');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');

  if (b.kind === 'stages') {
    if (!Array.isArray(b.own)) return bad('Send the stages in order.');
    const own = b.own.slice(0, 13).map((s: any) => ({
      key: str(s?.key, 40) || null, label: str(s?.label, 60), active: s?.active !== false,
      requires: Array.isArray(s?.requires) ? s.requires.filter((r: unknown) => r === 'documents' || r === 'age') : [],
      message: str(s?.message, 600) || null,
    }));
    const msg = (x: any) => (x && 'message' in x ? { message: str(x.message, 600) || null } : {});
    const days = Number(b.offer?.respondDays);
    const { error } = await db.rpc('admission_set_stages', {
      p_school: admin.schoolId,
      p_stages: {
        own,
        offer: { label: str(b.offer?.label, 60), respondDays: Number.isInteger(days) ? days : null, ...msg(b.offer) },
        enrolled: { label: str(b.enrolled?.label, 60), ...msg(b.enrolled) },
      },
    });
    if (error) return admissionError(error, 'Could not save the stages.');
    return NextResponse.json({ ok: true });
  }

  if (b.kind === 'age') {
    const r = checkAgeRules(b);
    if ('error' in r) return bad(r.error);
    const { data } = await db.from('schools').select('settings').eq('id', admin.schoolId).maybeSingle();
    const st = (data?.settings as Record<string, any>) || {};
    const { error } = await db.from('schools').update({ settings: { ...st, admissions: { ...(st.admissions || {}), age: r.value } } }).eq('id', admin.schoolId);
    if (error) return bad('Could not save the age rules.', 500);
    await db.from('audit_log').insert({ actor_id: admin.id, actor_role: 'admin', action: 'admissions.age_rules_changed', table_name: 'schools', row_id: admin.schoolId, school_id: admin.schoolId, new_values: r.value });
    return NextResponse.json({ ok: true });
  }

  if (b.kind === 'seats') {
    const session = isSession(b.session) ? b.session : nextSession(sessionOf());
    if (!Array.isArray(b.seats)) return bad('Send the seats per grade.');
    const set: { grade: number; capacity: number }[] = [];
    const cleared: number[] = [];
    for (const s of b.seats) {
      const g = Number(s?.grade);
      if (!GRADES.includes(g)) return bad('Classes run from Nursery to 12.');
      if (s.capacity === null || s.capacity === '') { cleared.push(g); continue; }
      const c = Number(s.capacity);
      if (!Number.isInteger(c) || c < 0 || c > 5000) return bad(`Grade ${g}: seats must be a whole number from 0 to 5,000.`);
      set.push({ grade: g, capacity: c });
    }
    if (set.length) {
      const { error } = await db.from('admission_seats').upsert(
        set.map(s => ({ school_id: admin.schoolId, session, grade: s.grade, capacity: s.capacity, updated_by: admin.id })),
        { onConflict: 'school_id,session,grade' });
      if (error) return admissionError(error, 'Could not save the seats.');
    }
    if (cleared.length) {
      const { error } = await db.from('admission_seats').delete().eq('school_id', admin.schoolId).eq('session', session).in('grade', cleared);
      if (error) return admissionError(error, 'Could not save the seats.');
    }
    // More seats (or no limit) let the waitlist move up straight away.
    let issued = 0;
    for (const g of [...set.map(s => s.grade), ...cleared]) {
      const { data, error } = await db.rpc('admission_promote', { p_school: admin.schoolId, p_session: session, p_grade: g, p_actor: admin.id });
      if (error) return admissionError(error, 'The seats were saved, but the waitlist could not move up. Reload and try again.');
      issued += Number(data) || 0;
    }
    if (issued) flushSoon(db, admin.schoolId);
    return NextResponse.json({ ok: true, issued });
  }

  if (b.kind === 'online') {
    const value = { open: b.open === true, enquiries: b.enquiries === true, note: str(b.note, 500) || null };
    const { data } = await db.from('schools').select('settings').eq('id', admin.schoolId).maybeSingle();
    const st = (data?.settings as Record<string, any>) || {};
    if ((value.open || value.enquiries) && !st.code) return bad('Your school has no sign-in code yet, so it has no apply page. Ask Sthara support.', 409);
    const { error } = await db.from('schools').update({ settings: { ...st, admissions: { ...(st.admissions || {}), online: value } } }).eq('id', admin.schoolId);
    if (error) return bad('Could not save.', 500);
    await db.from('audit_log').insert({ actor_id: admin.id, actor_role: 'admin', action: 'admissions.online_changed', table_name: 'schools', row_id: admin.schoolId, school_id: admin.schoolId, new_values: value });
    return NextResponse.json({ ok: true });
  }

  return bad('Unknown set-up.');
}
