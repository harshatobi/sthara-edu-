/**
 * Cover for absent teachers, and fairness across cover and duties. Pure: the cover board, the
 * cover API route (which re-checks every assignment) and the tests share it.
 *
 * A need is one lesson (or the sections of one combined lesson) whose teacher is away: on approved
 * leave, marked absent (full day, morning or afternoon), or released for named periods. Candidates
 * are teachers free for that lesson's time, ranked by: teaches the subject, teaches the class, fewest
 * covers this term, lightest day. Nobody takes more than COVER_CAP covers in a day.
 */
import { sessionOf, sessionStart } from '@/lib/admin/format';
import { normClass, normSubject, teachingScope } from '@/lib/teacher/scope';
import { awayOn, awayTakes, bellsFor, inContract, minutes, namesOf, periodOf, teacherLoad, versionOn, weekdayOf, wingOf, type Away } from './engine';
import { personKey, slotPerson, type Cover, type PersonKey, type ScheduleRows, type Slot } from './types';

export const COVER_CAP = 2;

export interface LessonAt { slot: Slot; start: number; end: number; startAt: string; endAt: string }

/** Every lesson taught on a date, from the timetable in force, at its own wing's bell times (holidays drop out). */
export function lessonsOn(date: string, rows: ScheduleRows): LessonAt[] {
  const v = versionOn(rows.versions, date);
  if (!v) return [];
  const wd = weekdayOf(date);
  const out: LessonAt[] = [];
  for (const s of rows.slots) {
    if (s.version_id !== v.id || s.weekday !== wd) continue;
    const p = periodOf(bellsFor(date, wingOf(s.class, rows.wings)?.id ?? null, rows.bells, rows.events).schedule, s.period_no);
    if (p) out.push({ slot: s, start: minutes(p.starts_at), end: minutes(p.ends_at), startAt: p.starts_at, endAt: p.ends_at });
  }
  return out;
}

export interface Need {
  key: string;
  person: PersonKey;
  reason: Away['reason'];
  /** Half-day leave: the office decides whether this period needs cover. */
  unsureHalf: boolean;
  /** One lesson, or each section of a combined lesson. */
  lessons: LessonAt[];
  period_no: number;
  start: number; end: number; startAt: string; endAt: string;
  subject: string;
  classes: string;
  state: 'open' | 'assigned' | 'not_needed';
  sub: PersonKey | null;
  covers: Cover[];
  flagged: string | null;
}

/** Lessons that need cover on a date, with where each stands, plus covers that no longer match an absence. */
export function needsOn(date: string, rows: ScheduleRows): { needs: Need[]; stale: Cover[] } {
  const lessons = lessonsOn(date, rows);
  const covers = rows.covers.filter(c => c.on_date === date);
  const bySlot = new Map(covers.map(c => [c.slot_id, c]));
  const groups = new Map<string, Need>();
  for (const l of lessons) {
    const person = slotPerson(l.slot);
    if (!person) continue;
    const bells = bellsFor(date, wingOf(l.slot.class, rows.wings)?.id ?? null, rows.bells, rows.events).schedule;
    const a = awayOn(date, person, rows).find(x => awayTakes(x, l.slot.period_no, l.start, bells));
    if (!a) continue;
    const key = l.slot.combined ? `${person}|${l.start}|${normSubject(l.slot.subject)}` : `${person}|${l.slot.id}`;
    const n = groups.get(key) ?? {
      key, person, reason: a.reason, unsureHalf: a.unsureHalf, lessons: [], period_no: l.slot.period_no, start: l.start, end: l.end,
      startAt: l.startAt, endAt: l.endAt, subject: l.slot.subject, classes: '', state: 'open' as const, sub: null, covers: [], flagged: null,
    };
    n.lessons.push(l);
    const c = l.slot.id ? bySlot.get(l.slot.id) : undefined;
    if (c) n.covers.push(c);
    groups.set(key, n);
  }
  const needs = [...groups.values()].map(n => {
    n.classes = n.lessons.map(l => l.slot.class).join(', ');
    const assigned = n.covers.filter(c => c.status === 'assigned');
    if (assigned.length === n.lessons.length && new Set(assigned.map(c => personKey(c.sub_user_id, c.sub_staff_member_id))).size === 1) {
      n.state = 'assigned';
      n.sub = personKey(assigned[0].sub_user_id, assigned[0].sub_staff_member_id);
    } else if (n.covers.length === n.lessons.length && n.covers.every(c => c.status === 'not_needed')) n.state = 'not_needed';
    n.flagged = n.covers.find(c => c.flagged_at)?.flag_note ?? (n.covers.some(c => c.flagged_at) ? '' : null);
    return n;
  }).sort((a, b) => a.start - b.start || a.classes.localeCompare(b.classes));
  const used = new Set(needs.flatMap(n => n.covers.map(c => c.id)));
  return { needs, stale: covers.filter(c => !used.has(c.id)) };
}

/** A weekday's usual lessons (regular bells, no calendar changes), from the timetable in force on `asOf`: for the weekly roster. */
export function regularLessons(rows: ScheduleRows, weekday: number, asOf: string): LessonAt[] {
  const v = versionOn(rows.versions, asOf) ?? rows.versions.filter(x => x.status === 'published').sort((a, b) => (a.effective_from || '').localeCompare(b.effective_from || ''))[0];
  if (!v) return [];
  const out: LessonAt[] = [];
  for (const s of rows.slots) {
    if (s.version_id !== v.id || s.weekday !== weekday) continue;
    const wing = wingOf(s.class, rows.wings)?.id ?? null;
    const regular = rows.bells.filter(b => b.kind === 'regular' && b.weekdays.includes(weekday));
    const p = periodOf(regular.find(b => b.wing_id === wing) ?? regular.find(b => b.wing_id === null) ?? null, s.period_no);
    if (p) out.push({ slot: s, start: minutes(p.starts_at), end: minutes(p.ends_at), startAt: p.starts_at, endAt: p.ends_at });
  }
  return out;
}

export interface Busy { start: number; end: number; what: string; coverId?: string; dutyId?: string }

/** What each person is already doing on a date: their lessons, covers, and duties. */
export function busyOn(date: string, rows: ScheduleRows): Map<PersonKey, Busy[]> {
  const m = new Map<PersonKey, Busy[]>();
  const add = (k: PersonKey | null, b: Busy) => { if (!k) return; const list = m.get(k); if (list) list.push(b); else m.set(k, [b]); };
  const lessons = lessonsOn(date, rows);
  const bySlot = new Map(lessons.filter(l => l.slot.id).map(l => [l.slot.id!, l]));
  for (const l of lessons) add(slotPerson(l.slot), { start: l.start, end: l.end, what: `${l.slot.subject} in ${l.slot.class}` });
  for (const c of rows.covers) {
    if (c.on_date !== date || c.status !== 'assigned') continue;
    const l = bySlot.get(c.slot_id);
    if (l) add(personKey(c.sub_user_id, c.sub_staff_member_id), { start: l.start, end: l.end, what: `cover for ${c.class}`, coverId: c.id });
  }
  const wd = weekdayOf(date);
  const schoolOff = rows.events.some(e => e.suspends_classes && !e.wing_ids?.length && e.starts_on <= date && e.ends_on >= date);
  const posts = new Map(rows.dutyPosts.map(p => [p.id, p]));
  if (!schoolOff) {
    for (const r of rows.roster) {
      const p = posts.get(r.post_id);
      if (p?.active && r.weekday === wd && p.weekdays.includes(wd)) add(personKey(r.user_id, r.staff_member_id), { start: minutes(p.starts_at), end: minutes(p.ends_at), what: `${p.name} duty` });
    }
  }
  for (const d of rows.duties) {
    if (d.on_date === date) add(personKey(d.user_id, d.staff_member_id), { start: minutes(d.starts_at), end: minutes(d.ends_at), what: d.title, dutyId: d.id });
  }
  return m;
}

export interface Candidate {
  person: PersonKey; name: string;
  sameSubject: boolean; teachesClass: boolean;
  coversTerm: number; coversToday: number; lessonsToday: number;
}

/** What each teacher teaches: their directory scope plus their lessons in the timetable in force. */
function teachingOf(rows: ScheduleRows, date: string) {
  const v = versionOn(rows.versions, date);
  const m = new Map<PersonKey, { subjects: Set<string>; classes: Set<string> }>();
  const get = (k: PersonKey) => { let e = m.get(k); if (!e) { e = { subjects: new Set(), classes: new Set() }; m.set(k, e); } return e; };
  for (const p of rows.people) for (const e of teachingScope(p)) { const t = get(p.id); if (e.subject) t.subjects.add(normSubject(e.subject)); t.classes.add(normClass(e.cls)); }
  for (const s of rows.slots) {
    const k = slotPerson(s);
    if (!k || s.version_id !== v?.id) continue;
    const t = get(k);
    t.subjects.add(normSubject(s.subject));
    t.classes.add(normClass(s.class));
  }
  return m;
}

/** People who could take cover: teachers with a login, and teaching staff on the register (not visiting specialists) within their dates. */
export function coverPool(rows: ScheduleRows, date: string): PersonKey[] {
  const out: PersonKey[] = rows.people.filter(p => p.role === 'teacher').map(p => p.id);
  for (const m of rows.staff) {
    if (m.user_id || m.category !== 'teaching' || m.employment === 'visiting' || !inContract(m, date)) continue;
    out.push(`s:${m.id}`);
  }
  return out;
}

/**
 * Who can take a need, ranked; those already at the day's cap come back separately. A person on
 * half-day leave counts as away all day (their half isn't known).
 */
export function candidatesFor(need: Pick<Need, 'person' | 'start' | 'end' | 'period_no' | 'subject' | 'lessons' | 'covers'>, date: string, rows: ScheduleRows,
  ctx?: { busy?: Map<PersonKey, Busy[]>; cap?: number }): { ranked: Candidate[]; atCap: Candidate[] } {
  const cap = ctx?.cap ?? COVER_CAP;
  const busy = ctx?.busy ?? busyOn(date, rows);
  const names = namesOf(rows);
  const teach = teachingOf(rows, date);
  const mine = new Set(need.covers.map(c => c.id));
  const session = sessionOf(new Date(`${date}T12:00:00`));
  const since = sessionStart(session);
  const bells = bellsFor(date, need.lessons[0] ? wingOf(need.lessons[0].slot.class, rows.wings)?.id ?? null : null, rows.bells, rows.events).schedule;
  const subject = normSubject(need.subject);
  const classes = new Set(need.lessons.map(l => normClass(l.slot.class)));
  const termCovers = new Map<PersonKey, number>();
  const dayCovers = new Map<PersonKey, number>();
  for (const c of rows.covers) {
    if (c.status !== 'assigned' || c.on_date < since || c.on_date > date) continue;
    const k = personKey(c.sub_user_id, c.sub_staff_member_id)!;
    termCovers.set(k, (termCovers.get(k) || 0) + 1);
    if (c.on_date === date && !mine.has(c.id)) dayCovers.set(k, (dayCovers.get(k) || 0) + 1);
  }
  const lessonsToday = new Map<PersonKey, number>();
  for (const l of lessonsOn(date, rows)) { const k = slotPerson(l.slot); if (k) lessonsToday.set(k, (lessonsToday.get(k) || 0) + 1); }

  const ranked: Candidate[] = [];
  const atCap: Candidate[] = [];
  for (const k of coverPool(rows, date)) {
    if (k === need.person) continue;
    const away = awayOn(date, k, rows);
    if (away.some(a => a.unsureHalf || awayTakes(a, need.period_no, need.start, bells))) continue;
    if ((busy.get(k) || []).some(b => !(b.coverId && mine.has(b.coverId)) && b.start < need.end && need.start < b.end)) continue;
    const t = teach.get(k);
    const c: Candidate = {
      person: k, name: names.get(k) || 'Teacher',
      sameSubject: !!t?.subjects.has(subject), teachesClass: !!t && [...classes].some(x => t.classes.has(x)),
      coversTerm: termCovers.get(k) || 0, coversToday: dayCovers.get(k) || 0, lessonsToday: lessonsToday.get(k) || 0,
    };
    (c.coversToday >= cap ? atCap : ranked).push(c);
  }
  const order = (a: Candidate, b: Candidate) => Number(b.sameSubject) - Number(a.sameSubject) || Number(b.teachesClass) - Number(a.teachesClass)
    || a.coversTerm - b.coversTerm || a.lessonsToday - b.lessonsToday || a.name.localeCompare(b.name);
  return { ranked: ranked.sort(order), atCap: atCap.sort(order) };
}

export interface FairRow {
  person: PersonKey; name: string;
  periodsPerWeek: number;
  covers: number;
  rosterPerWeek: number;
  duties: number;
  compOffDays: number;
}

/** Cover, duty and comp-off counts per person between two dates, with their weekly teaching load. */
export function fairness(rows: ScheduleRows, from: string, to: string): FairRow[] {
  const names = namesOf(rows);
  const v = versionOn(rows.versions, to);
  const load = teacherLoad(rows.slots.filter(s => s.version_id === v?.id));
  const m = new Map<PersonKey, FairRow>();
  const get = (k: PersonKey) => {
    let r = m.get(k);
    if (!r) { r = { person: k, name: names.get(k) || 'Staff', periodsPerWeek: load.get(k) || 0, covers: 0, rosterPerWeek: 0, duties: 0, compOffDays: 0 }; m.set(k, r); }
    return r;
  };
  for (const k of coverPool(rows, to)) get(k);
  for (const c of rows.covers) if (c.status === 'assigned' && c.on_date >= from && c.on_date <= to) get(personKey(c.sub_user_id, c.sub_staff_member_id)!).covers++;
  const posts = new Map(rows.dutyPosts.map(p => [p.id, p]));
  for (const r of rows.roster) if (posts.get(r.post_id)?.active) get(personKey(r.user_id, r.staff_member_id)!).rosterPerWeek++;
  for (const d of rows.duties) if (d.on_date >= from && d.on_date <= to) get(personKey(d.user_id, d.staff_member_id)!).duties++;
  for (const g of rows.compOffs) if (!g.revoked_at && g.duty_on >= from && g.duty_on <= to) get(personKey(g.user_id, g.staff_member_id)!).compOffDays += Number(g.days);
  return [...m.values()].sort((a, b) => (b.covers + b.rosterPerWeek + b.duties) - (a.covers + a.rosterPerWeek + a.duties) || a.name.localeCompare(b.name));
}
