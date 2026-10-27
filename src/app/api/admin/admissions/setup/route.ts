import { NextResponse, type NextRequest } from 'next/server';
import { bad, requireAdmin, str } from '@/lib/admin/serverAuth';
import { admissionError } from '@/lib/admin/admissionsServer';
import { isSession, nextSession, sessionOf } from '@/lib/admin/format';

export const dynamic = 'force-dynamic';

/**
 * Admissions set-up (admissions.setup).
 *   POST { kind: 'stages', own: [{ key?, label, active }], offer: { label, respondDays }, enrolled: { label } }
 *        the school's stages in order; Offer and Enrolled can be renamed, not moved or removed
 *   POST { kind: 'seats', session?, seats: [{ grade, capacity | null }] }
 *        seats for new admissions per grade (null: no limit); more seats fill from the waitlist at once
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.setup');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');

  if (b.kind === 'stages') {
    if (!Array.isArray(b.own)) return bad('Send the stages in order.');
    const own = b.own.slice(0, 13).map((s: any) => ({ key: str(s?.key, 40) || null, label: str(s?.label, 60), active: s?.active !== false }));
    const days = Number(b.offer?.respondDays);
    const { error } = await db.rpc('admission_set_stages', {
      p_school: admin.schoolId,
      p_stages: {
        own,
        offer: { label: str(b.offer?.label, 60), respondDays: Number.isInteger(days) ? days : null },
        enrolled: { label: str(b.enrolled?.label, 60) },
      },
    });
    if (error) return admissionError(error, 'Could not save the stages.');
    return NextResponse.json({ ok: true });
  }

  if (b.kind === 'seats') {
    const session = isSession(b.session) ? b.session : nextSession(sessionOf());
    if (!Array.isArray(b.seats)) return bad('Send the seats per grade.');
    const set: { grade: number; capacity: number }[] = [];
    const cleared: number[] = [];
    for (const s of b.seats) {
      const g = Number(s?.grade);
      if (!Number.isInteger(g) || g < 1 || g > 12) return bad('Grades run from 1 to 12.');
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
    return NextResponse.json({ ok: true, issued });
  }

  return bad('Unknown set-up.');
}
