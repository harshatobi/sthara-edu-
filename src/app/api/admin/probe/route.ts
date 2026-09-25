import { NextResponse, type NextRequest } from 'next/server';
import { bad, deny, ISO_DAY, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { CONSENT_TYPES } from '@/lib/admin/constants';
import { isoDay } from '@/lib/admin/format';

export const dynamic = 'force-dynamic';

/**
 * Probe workflow (probe.view, plus each action's own permission).
 *   POST { action: 'ack', key, fingerprint, note? }                 hide until the finding gets worse
 *   POST { action: 'snooze', key, fingerprint, until, note? }       hide until a date
 *   POST { action: 'unack', key }
 *   POST { action: 'nudge_teacher', teacherId, message }            workforce.read; one nudge per teacher per day
 *   POST { action: 'request_consent', consentType, studentIds }     compliance.act; only families still missing it
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'probe.view');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');

  switch (b.action) {
    case 'ack':
    case 'snooze': {
      const key = str(b.key, 200);
      const fingerprint = str(b.fingerprint, 200);
      if (!key || !fingerprint) return bad('Pick a finding.');
      const until = str(b.until, 10);
      if (b.action === 'snooze' && (!ISO_DAY.test(until) || until <= isoDay())) return bad('Pick a date after today.');
      const { error } = await db.from('probe_acks').upsert({
        school_id: admin.schoolId, finding_key: key, fingerprint, status: b.action === 'ack' ? 'acknowledged' : 'snoozed',
        snooze_until: b.action === 'snooze' ? until : null, note: str(b.note, 500) || null, acked_by: admin.id, acked_at: new Date().toISOString(),
      }, { onConflict: 'school_id,finding_key' });
      if (error) return bad(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    case 'unack': {
      const { error } = await db.from('probe_acks').delete().eq('school_id', admin.schoolId).eq('finding_key', str(b.key, 200));
      if (error) return bad(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    case 'nudge_teacher': {
      const no = deny(admin, 'workforce.read');
      if (no) return no;
      if (!isUuid(b.teacherId)) return bad('Pick a teacher.');
      const message = str(b.message, 600);
      if (!message) return bad('Write the message.');
      const { data: t } = await db.from('users').select('id, name').eq('id', b.teacherId).eq('school_id', admin.schoolId).eq('role', 'teacher').maybeSingle();
      if (!t) return bad('Teacher not found in this school.', 404);
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const { count } = await db.from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', t.id).eq('type', 'nudge').gte('created_at', since);
      if (count) return bad(`${t.name} was already nudged in the last 24 hours.`, 429);
      const { error } = await db.from('notifications').insert({
        school_id: admin.schoolId, user_id: t.id, type: 'nudge', title: `A note from ${admin.name}`, body: message, metadata: { from: admin.id },
      });
      if (error) return bad(error.message, 500);
      return NextResponse.json({ sent: 1 });
    }

    case 'request_consent': {
      const no = deny(admin, 'compliance.act');
      if (no) return no;
      const type = str(b.consentType, 40);
      if (!(type in CONSENT_TYPES)) return bad('Unknown consent type.');
      const ids: string[] = (Array.isArray(b.studentIds) ? b.studentIds : []).filter(isUuid).slice(0, 1000);
      if (!ids.length) return bad('Pick at least one family.');
      // Recomputed here: students of this school, with a verified parent, still missing this consent.
      const [students, guardians, consents, recent] = await Promise.all([
        db.from('users').select('id, name').eq('school_id', admin.schoolId).eq('role', 'student').in('id', ids),
        db.from('guardians').select('parent_id, student_id').eq('verified', true).in('student_id', ids),
        db.from('consents').select('student_id').eq('consent_type', type).eq('granted', true).is('revoked_at', null).in('student_id', ids),
        db.from('notifications').select('student_id').eq('type', 'consent_request').gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString()).in('student_id', ids),
      ]);
      const has = new Set((consents.data || []).map(c => c.student_id));
      const asked = new Set((recent.data || []).map(n => n.student_id));
      const meta = CONSENT_TYPES[type];
      const rowsOut: any[] = [];
      let skipped = 0;
      for (const s of students.data || []) {
        const parents = (guardians.data || []).filter(g => g.student_id === s.id).map(g => g.parent_id);
        if (has.has(s.id) || asked.has(s.id) || !parents.length) { skipped++; continue; }
        const first = (s.name || 'your child').split(' ')[0];
        for (const pid of parents) {
          rowsOut.push({
            school_id: admin.schoolId, user_id: pid, student_id: s.id, type: 'consent_request',
            title: `Your consent is needed for ${first}`,
            body: `${admin.schoolName} would like your permission for ${meta.label.toLowerCase()} (${meta.purpose.toLowerCase()}). You can give or refuse it, and change your mind at any time, from Consent & Privacy in your Sthara parent account.`,
            metadata: { consentType: type },
          });
        }
      }
      if (rowsOut.length) {
        const { error } = await db.from('notifications').insert(rowsOut);
        if (error) return bad(error.message, 500);
      }
      return NextResponse.json({ sent: new Set(rowsOut.map(r => r.student_id)).size, skipped });
    }

    default:
      return bad('Unknown action.');
  }
}
