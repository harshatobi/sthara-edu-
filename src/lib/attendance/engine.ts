/**
 * Staff attendance: what each person was expected to do on a day (shift, reporting time, weekly off,
 * holiday, leave), what happened (punches and register marks), and the month the payroll reads.
 * Pure, shared by the attendance board, "My attendance", the API routes, the no-show job and tests.
 *
 * Times are school-local (India, UTC+05:30). Sources rank: an HR/principal/supervisor mark beats the
 * biometric device, which beats the app and WhatsApp; every punch is kept for the record.
 */
import { addDays, awayOn, datesBetween, minutes, weekStart, weekdayOf } from '@/lib/schedule/engine';
import { personKey, type AcademicEvent, type Absence, type PersonKey } from '@/lib/schedule/types';

export const IST_OFFSET_MIN = 330;

/** A timestamp as the school-local date and minute of the day. */
export function localOf(ts: string | number | Date): { date: string; min: number } {
  const t = new Date(typeof ts === 'string' || typeof ts === 'number' ? ts : ts.getTime()).getTime() + IST_OFFSET_MIN * 60_000;
  const d = new Date(t);
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
/** School-local date + "HH:MM" as an ISO timestamp. */
export function atLocal(date: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m) - IST_OFFSET_MIN * 60_000).toISOString();
}
export const hm = (min: number) => `${String(Math.floor(((min % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((min % 60) + 60) % 60).padStart(2, '0')}`;

export interface Settings {
  teacher_start: string; teacher_end: string; office_start: string; office_end: string;
  grace_min: number; lates_rule: boolean; lates_per_half_day: number; short_rule: boolean; min_full_hours: number; absent_rule: boolean;
  geofence_lat: number | null; geofence_lng: number | null; geofence_radius_m: number; noshow_alerts: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  teacher_start: '07:45', teacher_end: '15:00', office_start: '09:00', office_end: '17:00', grace_min: 10,
  lates_rule: true, lates_per_half_day: 3, short_rule: true, min_full_hours: 6, absent_rule: true,
  geofence_lat: null, geofence_lng: null, geofence_radius_m: 200, noshow_alerts: true,
};

export interface Shift { id: string; name: string; starts_at: string; ends_at: string; active: boolean }
export interface Plan {
  user_id: string | null; staff_member_id: string | null; mode: 'fixed' | 'rotating'; shift_id: string | null; rotation: string[];
  off_mode: 'fixed' | 'rotating' | 'none'; off_days: number[]; off_cycle: number[]; anchor_date: string;
  works_holidays: boolean; rules_exempt: boolean; grace_min: number | null;
}
export interface Override { user_id: string | null; staff_member_id: string | null; on_date: string; kind: 'shift' | 'off' | 'work'; shift_id: string | null; reason: string; swap_group?: string | null }
export interface Punch { user_id: string | null; staff_member_id: string | null; at: string; direction: 'in' | 'out' | 'unknown'; source: 'biometric' | 'app' | 'whatsapp'; on_campus: boolean | null }
export interface Mark { user_id: string | null; staff_member_id: string | null; on_date: string; status: 'present' | 'absent' | 'half_day' | 'off'; in_at: string | null; out_at: string | null; source: 'register' | 'override'; reason: string | null }
export interface LeaveRow { staff_id: string | null; staff_member_id?: string | null; leave_type: string; from_date: string; to_date: string; half_day: boolean; status: string }

/** Who the board and the month cover: accounts (teachers and office) and register members with no login. */
export interface Person {
  key: PersonKey; name: string; kind: 'teacher' | 'office' | 'register'; employeeCode: string | null;
  /** The first day they were on the staff here (contract start or when they were added); no absences before it. */
  since?: string | null;
}

export interface AttendanceRows {
  settings: Settings;
  shifts: Shift[];
  plans: Plan[];
  overrides: Override[];
  punches: Punch[];
  marks: Mark[];
  leave: LeaveRow[];
  absences: Absence[];
  events: AcademicEvent[];
  /** Teaching weekdays (from the regular bells); teachers and office are off on the others. */
  workingDays: number[];
  /**
   * The first day the school recorded any staff attendance (its earliest punch or register mark), or null when it
   * never has. A day before it, or before the person joined, with nothing recorded is "not tracked", never an absence.
   */
  trackedFrom?: string | null;
}

const planKey = (p: { user_id: string | null; staff_member_id: string | null }) => personKey(p.user_id, p.staff_member_id)!;

/** Whole weeks from the Monday of `anchor` to the Monday of `date` (negative before the anchor). */
export function weeksSince(anchor: string, date: string): number {
  const a = Date.parse(`${weekStart(anchor)}T00:00:00Z`), d = Date.parse(`${weekStart(date)}T00:00:00Z`);
  return Math.round((d - a) / (7 * 86_400_000));
}
const cyc = <T>(xs: T[], i: number) => xs[((i % xs.length) + xs.length) % xs.length];

export type Expected =
  | { kind: 'work'; start: number; end: number; label: string; overnight: boolean }
  | { kind: 'off'; why: 'weekly_off' | 'holiday' | 'override' | 'not_working_day' }
  | { kind: 'leave'; label: string; half: boolean };

/**
 * What a person was expected to do on a date. Overrides win; then leave and confirmed absences; then
 * holidays (unless their plan works holidays); then their plan's shift and weekly off, or for accounts
 * with no plan the school's teacher / office hours on teaching weekdays.
 */
export function expectedOn(date: string, who: Person, rows: AttendanceRows): Expected {
  const s = rows.settings;
  const plan = rows.plans.find(p => planKey(p) === who.key);
  const shiftById = new Map(rows.shifts.map(x => [x.id, x]));
  const shiftExpected = (sh: Shift | undefined): Expected => {
    if (!sh) return { kind: 'off', why: 'not_working_day' };
    const start = minutes(sh.starts_at);
    let end = minutes(sh.ends_at);
    const overnight = end <= start;
    if (overnight) end += 1440;
    return { kind: 'work', start, end, label: sh.name, overnight };
  };

  const ov = rows.overrides.find(o => o.on_date === date && planKey(o) === who.key);
  if (ov?.kind === 'off') return { kind: 'off', why: 'override' };
  if (ov?.kind === 'shift') return shiftExpected(shiftById.get(ov.shift_id!));

  const away = awayOn(date, who.key, { leave: rows.leave as any, absences: rows.absences });
  const leave = away.find(a => a.reason === 'leave' || (a.reason === 'absent' && a.portion === 'full'));
  if (leave) return { kind: 'leave', label: leave.reason === 'leave' ? leave.leaveType || 'leave' : 'absent', half: leave.unsureHalf };

  const holiday = rows.events.some(e => e.suspends_classes && !e.wing_ids?.length && e.starts_on <= date && e.ends_on >= date);
  const wd = weekdayOf(date);
  if (plan) {
    if (holiday && !plan.works_holidays && ov?.kind !== 'work') return { kind: 'off', why: 'holiday' };
    const w = weeksSince(plan.anchor_date, date);
    if (ov?.kind !== 'work') {
      if (plan.off_mode === 'fixed' && plan.off_days.map(Number).includes(wd)) return { kind: 'off', why: 'weekly_off' };
      if (plan.off_mode === 'rotating' && plan.off_cycle.length && Number(cyc(plan.off_cycle, w)) === wd) return { kind: 'off', why: 'weekly_off' };
    }
    return shiftExpected(shiftById.get(plan.mode === 'rotating' ? cyc(plan.rotation, w) : plan.shift_id!));
  }
  if (who.kind === 'register') return { kind: 'off', why: 'not_working_day' };  // no plan, no expectations
  if (holiday && ov?.kind !== 'work') return { kind: 'off', why: 'holiday' };
  if (!rows.workingDays.includes(wd) && ov?.kind !== 'work') return { kind: 'off', why: 'not_working_day' };
  const [a, b] = who.kind === 'teacher' ? [s.teacher_start, s.teacher_end] : [s.office_start, s.office_end];
  return { kind: 'work', start: minutes(a), end: minutes(b), label: who.kind === 'teacher' ? 'Teaching day' : 'Office hours', overnight: false };
}

export type DayStatus = 'present' | 'late' | 'half_day' | 'absent' | 'not_in' | 'off' | 'leave' | 'unexpected' | 'untracked';

/** Whether attendance was being kept for this person on this day (see AttendanceRows.trackedFrom). */
export function trackedOn(date: string, who: Person, rows: AttendanceRows): boolean {
  if (rows.trackedFrom === undefined) return true;  // callers that don't load it (tests, the no-show check for today)
  if (!rows.trackedFrom || date < rows.trackedFrom) return false;
  return !who.since || date >= who.since;
}

export interface Day {
  date: string;
  expected: Expected;
  status: DayStatus;
  inMin: number | null;
  outMin: number | null;
  lateMin: number;
  hours: number | null;
  /** Where in/out came from: the mark, or the punch source that won. */
  source: 'register' | 'override' | 'biometric' | 'app' | 'whatsapp' | null;
  flags: ('late' | 'short' | 'no_out' | 'off_campus' | 'early_out')[];
  mark: Mark | null;
}

const RANK: Record<Punch['source'], number> = { biometric: 3, app: 2, whatsapp: 2 };

/**
 * One person's day. `nowMin` is the current school-local minute when `date` is today (so a day still
 * under way reads "not in yet" rather than "absent"), or null for a finished day.
 */
export function dayOf(date: string, who: Person, rows: AttendanceRows, nowMin: number | null, ctx?: { punches?: Punch[] }): Day {
  const expected = expectedOn(date, who, rows);
  const plan = rows.plans.find(p => planKey(p) === who.key);
  const grace = plan?.grace_min ?? rows.settings.grace_min;
  const mark = rows.marks.find(m => m.on_date === date && planKey(m) === who.key) ?? null;
  const base: Day = { date, expected, status: 'absent', inMin: null, outMin: null, lateMin: 0, hours: null, source: null, flags: [], mark };

  // A shift that crosses midnight takes punches up to noon the next day.
  const overnight = expected.kind === 'work' && expected.overnight;
  const mine = (ctx?.punches ?? rows.punches).filter(p => {
    if (planKey(p) !== who.key) return false;
    const l = localOf(p.at);
    return l.date === date || (overnight && l.date === addDays(date, 1) && l.min < 12 * 60);
  }).map(p => { const l = localOf(p.at); return { ...p, min: l.date === date ? l.min : l.min + 1440 }; });

  if (mark) {
    const inMin = mark.in_at ? minutes(mark.in_at) : null, outMin = mark.out_at ? minutes(mark.out_at) : null;
    const status: DayStatus = mark.status === 'off' ? 'off' : mark.status === 'absent' ? 'absent' : mark.status === 'half_day' ? 'half_day' : 'present';
    const d: Day = { ...base, status, inMin, outMin, source: mark.source, hours: inMin !== null && outMin !== null ? (outMin - inMin) / 60 : null };
    if (status === 'present' && expected.kind === 'work' && inMin !== null && inMin > expected.start + grace) { d.status = 'late'; d.lateMin = inMin - expected.start; d.flags.push('late'); }
    return d;
  }

  if (expected.kind === 'leave') return { ...base, status: mine.length ? 'present' : 'leave' };
  if (expected.kind === 'off') {
    if (!mine.length) return { ...base, status: 'off' };
  }

  // The highest-ranked source that has punches that day.
  const best = Math.max(0, ...mine.map(p => RANK[p.source]));
  const use = mine.filter(p => RANK[p.source] === best).sort((a, b) => a.min - b.min);
  if (!use.length) {
    if (expected.kind === 'work' && nowMin !== null && nowMin < expected.end) {
      return { ...base, status: 'not_in' };
    }
    if (expected.kind === 'work' && !trackedOn(date, who, rows)) return { ...base, status: 'untracked' };
    return { ...base, status: expected.kind === 'work' ? 'absent' : 'off' };
  }
  const ins = use.filter(p => p.direction !== 'out');
  const inMin = (ins[0] ?? use[0]).min;
  const outs = use.filter(p => p.direction !== 'in' && p.min > inMin);
  const outMin = outs.length ? outs[outs.length - 1].min : null;
  const d: Day = { ...base, status: 'present', inMin, outMin, source: use[0].source, hours: outMin !== null ? (outMin - inMin) / 60 : null };
  if (use.some(p => p.on_campus === false)) d.flags.push('off_campus');
  if (expected.kind !== 'work') { d.status = 'unexpected'; return d; }
  if (inMin > expected.start + grace) { d.status = 'late'; d.lateMin = inMin - expected.start; d.flags.push('late'); }
  if (outMin === null && (nowMin === null || nowMin >= expected.end)) d.flags.push('no_out');
  if (outMin !== null && outMin < expected.end) d.flags.push('early_out');
  // Short only against a day long enough to need the full hours (a half-day shift isn't "short").
  if (d.hours !== null && (expected.end - expected.start) / 60 >= rows.settings.min_full_hours && d.hours < rows.settings.min_full_hours) d.flags.push('short');
  return d;
}

export interface Proposal { key: string; date: string; kind: 'absent' | 'lates' | 'short' | 'half_day'; days: number; detail: string }
export interface MonthSummary {
  month: string;
  workDays: number; present: number; late: number; halfDays: number; absent: number; leaveDays: number; offDays: number; unexpected: number;
  /** Working days before attendance was kept for them: neither present nor absent, and never a deduction. */
  untracked: number;
  proposals: Proposal[];
  /** Loss of pay proposed by the rules, before HR waives any. */
  lopProposed: number;
  days: Day[];
}

/**
 * A person's month and the deductions the rules propose: an unexplained absence is a day's loss of pay,
 * every N lates a half day, a short day a half day, a half-day mark a half day. Rules switched off in the
 * settings, and people exempt from them, propose nothing for that rule. Only finished days count.
 */
export function monthOf(month: string, who: Person, rows: AttendanceRows, today: string): MonthSummary {
  const first = `${month.slice(0, 7)}-01`;
  const last = (() => { const y = Number(first.slice(0, 4)), m = Number(first.slice(5, 7)); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); })();
  const s = rows.settings;
  const exempt = !!rows.plans.find(p => planKey(p) === who.key)?.rules_exempt;
  const end = last < today ? last : addDays(today, -1);
  const days = end < first ? [] : datesBetween(first, end).map(d => dayOf(d, who, rows, null));
  const out: MonthSummary = { month: first, workDays: 0, present: 0, late: 0, halfDays: 0, absent: 0, leaveDays: 0, offDays: 0, unexpected: 0, untracked: 0, proposals: [], lopProposed: 0, days };
  const lateDates: string[] = [];
  for (const d of days) {
    if (d.status === 'untracked') { out.untracked++; continue; }
    if (d.expected.kind === 'work') out.workDays++;
    if (d.status === 'present' || d.status === 'late') out.present++;
    if (d.status === 'late') { out.late++; lateDates.push(d.date); }
    if (d.status === 'half_day') { out.halfDays++; if (!exempt) out.proposals.push({ key: `half:${d.date}`, date: d.date, kind: 'half_day', days: 0.5, detail: 'Marked half day' }); }
    if (d.status === 'absent') {
      out.absent++;
      if (s.absent_rule && !exempt) out.proposals.push({ key: `absent:${d.date}`, date: d.date, kind: 'absent', days: 1, detail: 'Absent without leave' });
    }
    if (d.status === 'leave') out.leaveDays++;
    if (d.status === 'off') out.offDays++;
    if (d.status === 'unexpected') out.unexpected++;
    if (s.short_rule && !exempt && d.flags.includes('short') && (d.status === 'present' || d.status === 'late')) {
      out.proposals.push({ key: `short:${d.date}`, date: d.date, kind: 'short', days: 0.5, detail: `${d.hours?.toFixed(1)} hours (under ${s.min_full_hours})` });
    }
  }
  if (s.lates_rule && !exempt && s.lates_per_half_day > 0) {
    for (let i = s.lates_per_half_day; i <= lateDates.length; i += s.lates_per_half_day) {
      const group = lateDates.slice(i - s.lates_per_half_day, i);
      out.proposals.push({ key: `lates:${group[group.length - 1]}`, date: group[group.length - 1], kind: 'lates', days: 0.5, detail: `${s.lates_per_half_day} lates: ${group.map(x => x.slice(8)).join(', ')}` });
    }
  }
  out.lopProposed = out.proposals.reduce((n, p) => n + p.days, 0);
  return out;
}

/** Metres between two points (haversine): for the geofence, computed server-side; coordinates are never stored. */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ── Biometric import ────────────────────────────────────────────────────────
export interface ImportPunch { code: string; at: string; direction: Punch['direction'] }

/**
 * Rows from a device export (CSV or Excel): an employee code column, and either one date-time column or a date and
 * a time column; optionally a direction (In/Out, 0/1, C/In). Times are school-local. Unreadable rows are reported.
 */
export function parsePunchTable(table: string[][]): { punches: ImportPunch[]; problems: string[] } {
  const problems: string[] = [];
  if (table.length < 2) return { punches: [], problems: ['The file has no rows under the header.'] };
  const H = table[0].map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...names: string[]) => H.findIndex(h => names.includes(h));
  const iCode = col('employeecode', 'empcode', 'code', 'employeeid', 'empid', 'userid', 'id', 'cardno', 'badgenumber', 'enrollno', 'pin', 'acno');
  const iDateTime = col('datetime', 'punchtime', 'logtime', 'checktime', 'timestamp', 'time', 'punchdatetime');
  const iDate = col('date', 'logdate', 'punchdate', 'attendancedate');
  const iTime = col('time', 'logtime', 'punchtime', 'intime');
  const iDir = col('direction', 'inout', 'status', 'type', 'checktype', 'punchtype', 'io');
  if (iCode < 0) return { punches: [], problems: ['No employee code column (Employee Code, Emp ID, User ID, Enroll No).'] };
  const punches: ImportPunch[] = [];
  for (const [n, r] of table.slice(1).entries()) {
    const code = (r[iCode] || '').trim();
    let raw = iDate >= 0 && iTime >= 0 && iDate !== iTime ? `${r[iDate]} ${r[iTime]}` : iDateTime >= 0 ? r[iDateTime] : '';
    raw = (raw || '').trim();
    const at = parseLocalDateTime(raw);
    if (!code || !at) { problems.push(`Row ${n + 2}: needs an employee code and a date and time.`); continue; }
    const d = (iDir >= 0 ? r[iDir] || '' : '').trim().toLowerCase();
    const direction: Punch['direction'] = /^(in|i|0|c\/in|checkin|check in|entry)$/.test(d) ? 'in' : /^(out|o|1|c\/out|checkout|check out|exit)$/.test(d) ? 'out' : 'unknown';
    punches.push({ code, at, direction });
  }
  return { punches, problems: problems.length > 12 ? [...problems.slice(0, 12), `and ${problems.length - 12} more`] : problems };
}

/** "2026-10-05 08:03", "05/10/2026 8:03 AM", "05-10-2026 08:03:12", or an Excel serial -> ISO timestamp (school-local input). */
export function parseLocalDateTime(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) {  // Excel serial days since 1899-12-30
    const ms = Math.round((Number(s) - 25569) * 86_400_000);
    const d = new Date(ms);
    return atLocal(d.toISOString().slice(0, 10), `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`);
  }
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i)
    ?? s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})[ T](\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!m) return null;
  const iso = m[1].length === 4;
  const [y, mo, d] = iso ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];  // dd/mm/yyyy, as Indian devices export
  let h = Number(m[4]);
  const ap = (m[6] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31 || h > 23) return null;
  return atLocal(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`, `${String(h).padStart(2, '0')}:${m[5]}`);
}

/** Everyone the attendance covers, from accounts and the register (register rows linked to an account don't repeat). */
export function peopleOf(
  people: { id: string; name: string; role: string; created_at?: string | null }[],
  staff: { id: string; user_id: string | null; name: string; active: boolean; employee_code: string | null; contract_from?: string | null; created_at?: string | null }[],
): Person[] {
  const reg = new Map(staff.filter(s => s.user_id).map(s => [s.user_id!, s]));
  // Joining day: a contract start wins; otherwise the day they were added (school-local).
  const since = (contractFrom?: string | null, created?: string | null) => contractFrom || (created ? localOf(created).date : null);
  return [
    ...people.filter(p => p.role === 'teacher' || p.role === 'admin').map(p => {
      const r = reg.get(p.id);
      return { key: p.id, name: p.name || 'Staff', kind: (p.role === 'teacher' ? 'teacher' : 'office') as Person['kind'], employeeCode: r?.employee_code ?? null, since: since(r?.contract_from, p.created_at) };
    }),
    ...staff.filter(s => !s.user_id && s.active).map(s => ({ key: `s:${s.id}`, name: s.name, kind: 'register' as const, employeeCode: s.employee_code, since: since(s.contract_from, s.created_at) })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

export { personKey };
