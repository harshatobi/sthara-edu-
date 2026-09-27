import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { whatsappStaff } from '@/lib/staff/notify';
import { alertCoordinators } from '@/lib/schedule/notify';
import { hhmm } from '@/lib/schedule/engine';
import { dayOf, hm, localOf, parseLocalDateTime, type Punch } from './engine';
import { loadAttendance } from './load';

/**
 * Punches from a biometric export or a device push, matched to people by employee code on the staff register
 * (a register row linked to an account carries that account's code). Duplicates (same person, time and source)
 * are skipped, so importing the same file twice is harmless.
 */
export async function importPunches(db: SupabaseClient, schoolId: string, raw: { code?: unknown; at?: unknown; direction?: unknown }[],
  opts: { createdBy: string | null; deviceId: string | null }): Promise<{ imported: number; duplicates: number; unmatched: string[] } | { error: string }> {
  const { data: staff } = await db.from('staff_members').select('id, user_id, employee_code, active').eq('school_id', schoolId).not('employee_code', 'is', null);
  const byCode = new Map((staff || []).filter(s => s.active).map(s => [String(s.employee_code).trim().toLowerCase(), s]));
  const unmatched = new Set<string>();
  const rows: any[] = [];
  for (const p of raw) {
    const code = String(p?.code ?? '').trim();
    const at = typeof p?.at === 'string' ? (/[zZ]|[+-]\d\d:?\d\d$/.test(p.at) ? new Date(p.at).toISOString() : parseLocalDateTime(p.at)) : null;
    if (!code || !at || Number.isNaN(Date.parse(at))) continue;
    const s = byCode.get(code.toLowerCase());
    if (!s) { unmatched.add(code); continue; }
    const direction = p.direction === 'in' || p.direction === 'out' ? p.direction : 'unknown';
    rows.push({ school_id: schoolId, user_id: s.user_id, staff_member_id: s.user_id ? null : s.id, at, direction, source: 'biometric', device_id: opts.deviceId, created_by: opts.createdBy });
  }
  if (!rows.length) return unmatched.size ? { imported: 0, duplicates: 0, unmatched: [...unmatched] } : { error: 'No rows had an employee code and a time.' };
  // Skip what is already stored.
  const times = rows.map(r => r.at).sort();
  const { data: have } = await db.from('staff_punches').select('user_id, staff_member_id, at').eq('school_id', schoolId).eq('source', 'biometric')
    .gte('at', times[0]).lte('at', times[times.length - 1]);
  const seen = new Set((have || []).map(h => `${h.user_id ?? ''}|${h.staff_member_id ?? ''}|${new Date(h.at).toISOString()}`));
  const fresh = rows.filter(r => { const k = `${r.user_id ?? ''}|${r.staff_member_id ?? ''}|${r.at}`; if (seen.has(k)) return false; seen.add(k); return true; });
  for (let i = 0; i < fresh.length; i += 500) {
    const { error } = await db.from('staff_punches').insert(fresh.slice(i, i + 500));
    if (error) return { error: `Could not save the punches: ${error.message}` };
  }
  return { imported: fresh.length, duplicates: rows.length - fresh.length, unmatched: [...unmatched] };
}

/**
 * Teachers who haven't checked in by their reporting time + grace (and aren't on leave, absent, off or marked):
 * each is WhatsApped once a day ("reply IN or ABSENT") and the people who arrange cover are alerted. Idempotent:
 * run by the scheduler and whenever someone opens the cover or attendance board.
 */
export async function runNoShowCheck(db: SupabaseClient, schoolId: string): Promise<{ checked: number; alerted: number }> {
  const now = localOf(Date.now());
  const data = await loadAttendance(db, schoolId, now.date, now.date);
  if (!data.rows.settings.noshow_alerts) return { checked: 0, alerted: 0 };
  const late: { id: string; name: string; start: number }[] = [];
  for (const p of data.people) {
    if (p.kind !== 'teacher') continue;
    const d = dayOf(now.date, p, data.rows, now.min);
    const grace = data.rows.plans.find(x => x.user_id === p.key)?.grace_min ?? data.rows.settings.grace_min;
    if (d.status === 'not_in' && d.expected.kind === 'work' && now.min > d.expected.start + grace) late.push({ id: p.key, name: p.name, start: d.expected.start });
  }
  if (!late.length) return { checked: data.people.length, alerted: 0 };
  const { data: done } = await db.from('staff_noshow_alerts').select('user_id').eq('school_id', schoolId).eq('on_date', now.date).in('user_id', late.map(l => l.id));
  const already = new Set((done || []).map(d => d.user_id));
  const fresh = late.filter(l => !already.has(l.id));
  if (!fresh.length) return { checked: data.people.length, alerted: 0 };
  const { error } = await db.from('staff_noshow_alerts').insert(fresh.map(l => ({ school_id: schoolId, user_id: l.id, on_date: now.date })));
  if (error) { console.warn('[noshow]', error.message); return { checked: data.people.length, alerted: 0 }; }
  for (const l of fresh) {
    await whatsappStaff(db, schoolId, [l.id], 'alerts',
      `Good morning ${l.name.split(' ')[0]}. You haven't checked in yet (reporting time ${hhmm(hm(l.start), true)}). Reply *IN* if you're at school, or *ABSENT* if you're off today so your classes can be covered.`, { noshow: now.date });
  }
  await alertCoordinators(db, schoolId, 'Not checked in', `${fresh.map(l => l.name).join(', ')} ${fresh.length === 1 ? 'hasn\'t' : 'haven\'t'} checked in. Their lessons are flagged on the cover board.`, { noshow: now.date });
  return { checked: data.people.length, alerted: fresh.length };
}

/** A punch from the app or WhatsApp for an account. */
export async function recordPunch(db: SupabaseClient, p: { schoolId: string; userId: string | null; staffMemberId?: string | null; direction: Punch['direction']; source: 'app' | 'whatsapp'; onCampus: boolean | null }) {
  return db.from('staff_punches').insert({
    school_id: p.schoolId, user_id: p.userId, staff_member_id: p.userId ? null : p.staffMemberId ?? null, at: new Date().toISOString(),
    direction: p.direction, source: p.source, on_campus: p.onCampus, created_by: p.userId,
  });
}
