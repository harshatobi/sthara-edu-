/**
 * Scheduling engine: which bells ring on a date, which timetable is in force, clashes,
 * teaching load, and anyone's day / week / month agenda. Pure, shared by the admin
 * scheduler, "My schedule", the API routes and the parent portal.
 */
import { displayClass, normClass, normSubject, teachingScope } from '@/lib/teacher/scope';
import { gradeOf } from '@/lib/admin/format';
import { personKey, slotPerson, type Absence, type AcademicEvent, type BellPeriod, type BellSchedule, type PersonKey, type Room, type ScheduleRows, type Slot, type TimetableVersion, type Weekday, type Wing } from './types';

// ── Dates ───────────────────────────────────────────────────────────────────
const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const isoOfUtc = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => isoOfUtc(utc(iso) + n * 86_400_000);
/** ISO weekday of a YYYY-MM-DD: 1 = Monday .. 7 = Sunday. */
export const weekdayOf = (iso: string): Weekday => (((new Date(utc(iso)).getUTCDay() + 6) % 7) + 1) as Weekday;
/** The Monday of the week containing `iso`. */
export const weekStart = (iso: string) => addDays(iso, 1 - weekdayOf(iso));
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
export function monthEnd(iso: string) {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7));
  return isoOfUtc(Date.UTC(y, m, 0));
}
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}
/** "08:05:00" / "8:05" -> minutes after midnight. */
export function minutes(t: string | null | undefined): number {
  const m = (t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}
/** "08:05:00" -> "8:05"; with ampm "8:05 am". */
export function hhmm(t: string | null | undefined, ampm = false): string {
  const v = minutes(t);
  const h = Math.floor(v / 60), mm = String(v % 60).padStart(2, '0');
  if (!ampm) return `${h}:${mm}`;
  return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'am' : 'pm'}`;
}

// ── Sections and wings ──────────────────────────────────────────────────────
/** Grade of a section for wing mapping; nursery, LKG and UKG count as 0. */
export function gradeForWing(cls: string): number | null {
  if (/nur|lkg|ukg|pre|kg/i.test(cls)) return 0;
  return gradeOf(cls);
}
export function wingOf(cls: string, wings: Wing[]): Wing | null {
  const g = gradeForWing(cls);
  if (g === null) return null;
  return wings.find(w => g >= w.grade_from && g <= w.grade_to) ?? null;
}

/** Sort key for sections: grade, then the rest ("Class 9-B" before "Class 10-A"). */
export function classOrder(a: string, b: string) {
  const ga = gradeForWing(a) ?? 99, gb = gradeForWing(b) ?? 99;
  return ga - gb || normClass(a).localeCompare(normClass(b));
}

/** Every section the school has: on students, in teachers' scopes, in timetables, as home rooms. */
export function sectionsOf(rows: Pick<ScheduleRows, 'studentClasses' | 'slots' | 'people' | 'rooms'>): string[] {
  const seen = new Map<string, string>();
  const add = (c: string | null | undefined) => {
    const k = normClass(c);
    if (k && !seen.has(k)) seen.set(k, displayClass(c));
  };
  rows.studentClasses.forEach(add);
  rows.slots.forEach(s => add(s.class));
  rows.rooms.forEach(r => add(r.home_class));
  for (const p of rows.people) if (p.role === 'teacher') teachingScope(p).forEach(e => add(e.cls));
  return [...seen.values()].sort(classOrder);
}

// ── Which bells, which timetable ───────────────────────────────────────────
const appliesToWing = (e: AcademicEvent, wingId: string | null) => !e.wing_ids?.length || (wingId !== null && e.wing_ids.includes(wingId));
export const eventsOn = (date: string, events: AcademicEvent[], wingId?: string | null) =>
  events.filter(e => e.starts_on <= date && e.ends_on >= date && (wingId === undefined || appliesToWing(e, wingId)));

export interface DayBells {
  schedule: BellSchedule | null;
  /** The event that swapped in a variant schedule. */
  variantFrom: AcademicEvent | null;
  /** The event that suspends classes (a holiday), when there is one. */
  off: AcademicEvent | null;
}

/** The bells for a wing on a date: a holiday suspends them, an event may swap in a variant, else the regular schedule for the weekday. */
export function bellsFor(date: string, wingId: string | null, bells: BellSchedule[], events: AcademicEvent[]): DayBells {
  const today = eventsOn(date, events, wingId);
  const off = today.find(e => e.suspends_classes) ?? null;
  if (off) return { schedule: null, variantFrom: null, off };
  const variantEvent = today.find(e => e.bell_schedule_id && bells.some(b => b.id === e.bell_schedule_id));
  if (variantEvent) return { schedule: bells.find(b => b.id === variantEvent.bell_schedule_id)!, variantFrom: variantEvent, off: null };
  const wd = weekdayOf(date);
  const regular = bells.filter(b => b.kind === 'regular' && b.weekdays.includes(wd));
  const schedule = regular.find(b => wingId !== null && b.wing_id === wingId) ?? regular.find(b => b.wing_id === null) ?? null;
  return { schedule, variantFrom: null, off: null };
}

export const periodOf = (s: BellSchedule | null, no: number): BellPeriod | null => s?.periods.find(p => p.period_no === no) ?? null;
/** The highest period number any schedule has (the timetable grid's height). */
export const maxPeriods = (bells: BellSchedule[]) => Math.max(0, ...bells.flatMap(b => b.periods.map(p => p.period_no ?? 0)));
/** Teaching days: weekdays with a regular schedule, Monday to Saturday when none are set yet. */
export function teachingDays(bells: BellSchedule[]): Weekday[] {
  const days = new Set(bells.filter(b => b.kind === 'regular').flatMap(b => b.weekdays));
  return (days.size ? [...days].sort() : [1, 2, 3, 4, 5, 6]) as Weekday[];
}

/** The published timetable in force on a date: the latest effective_from on or before it. */
export function versionOn(versions: TimetableVersion[], date: string): TimetableVersion | null {
  return versions
    .filter(v => v.status === 'published' && v.effective_from && v.effective_from <= date)
    .sort((a, b) => b.effective_from!.localeCompare(a.effective_from!))[0] ?? null;
}

export const homeRoom = (cls: string, rooms: Room[]) => rooms.find(r => r.active && r.home_class && normClass(r.home_class) === normClass(cls)) ?? null;
/** A lesson's room: its own, else the section's home room. */
export const roomOf = (s: Pick<Slot, 'room_id' | 'class'>, rooms: Room[]) =>
  (s.room_id ? rooms.find(r => r.id === s.room_id) : null) ?? homeRoom(s.class, rooms);

// ── Clashes and load ────────────────────────────────────────────────────────
export interface Clash { kind: 'teacher' | 'room' | 'section'; weekday: number; period_no: number; key: string; slots: Slot[] }

const combinedOk = (xs: Slot[]) => xs.every(s => s.combined) && new Set(xs.map(s => normSubject(s.subject))).size === 1;

/**
 * Clashes in a set of lessons. A teacher or room in two sections at once is a clash unless every row is the
 * same combined lesson. A section can't have two whole-class lessons, or a whole-class lesson beside a group.
 * The room check uses the lesson's effective room (its own, else the home room for a whole-class lesson).
 */
export function findClashes(slots: Slot[], rooms: Room[] = []): Clash[] {
  const out: Clash[] = [];
  const group = (key: (s: Slot) => string | null) => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = key(s);
      if (k === null) continue;
      const g = m.get(k);
      if (g) g.push(s); else m.set(k, [s]);
    }
    return m;
  };
  for (const [k, xs] of group(s => { const p = slotPerson(s); return p ? `${s.weekday}|${s.period_no}|${p}` : null; })) {
    if (xs.length > 1 && !combinedOk(xs)) out.push({ kind: 'teacher', weekday: xs[0].weekday, period_no: xs[0].period_no, key: k.split('|')[2], slots: xs });
  }
  // A split group with no room of its own doesn't claim the home room (its groups go to different rooms).
  for (const [k, xs] of group(s => { const r = s.room_id || !s.group_label ? roomOf(s, rooms) : null; return r ? `${s.weekday}|${s.period_no}|${r.id}` : null; })) {
    if (xs.length > 1 && !combinedOk(xs)) out.push({ kind: 'room', weekday: xs[0].weekday, period_no: xs[0].period_no, key: k.split('|')[2], slots: xs });
  }
  for (const [k, xs] of group(s => `${s.weekday}|${s.period_no}|${normClass(s.class)}`)) {
    if (xs.length < 2) continue;
    const whole = xs.filter(s => !s.group_label);
    const labels = xs.map(s => s.group_label.toLowerCase());
    if (whole.length || new Set(labels).size < labels.length) {
      out.push({ kind: 'section', weekday: xs[0].weekday, period_no: xs[0].period_no, key: k.split('|')[2], slots: xs });
    }
  }
  return out;
}

/** Does putting `s` into `slots` (replacing the lesson with the same id) clash? */
export function clashesFor(s: Slot, slots: Slot[], rooms: Room[] = []): Clash[] {
  const others = slots.filter(x => x.weekday === s.weekday && x.period_no === s.period_no && !(s.id && x.id === s.id));
  return findClashes([...others, s], rooms).filter(c => c.slots.includes(s));
}

/** Periods a week per teacher, accounts and register members alike (a combined lesson counts once). */
export function teacherLoad(slots: Slot[]): Map<PersonKey, number> {
  const seen = new Set<string>();
  const m = new Map<PersonKey, number>();
  for (const s of slots) {
    const p = slotPerson(s);
    if (!p) continue;
    const k = `${p}|${s.weekday}|${s.period_no}`;
    if (seen.has(k)) continue;
    seen.add(k);
    m.set(p, (m.get(p) || 0) + 1);
  }
  return m;
}

/** Display names for every person key: accounts by id, register members by "s:" + id. */
export function namesOf(rows: Pick<ScheduleRows, 'people' | 'staff'>): Map<PersonKey, string> {
  const m = new Map<PersonKey, string>();
  for (const s of rows.staff) m.set(`s:${s.id}`, s.name);
  for (const p of rows.people) m.set(p.id, p.name || 'Teacher');
  return m;
}

/** Is a register member within their contract on a date (no dates means always)? */
export const inContract = (m: { contract_from?: string | null; contract_to?: string | null; active: boolean }, date: string) =>
  m.active && (!m.contract_from || m.contract_from <= date) && (!m.contract_to || m.contract_to >= date);

/** Periods a week per section + subject (what pacing reads). Split groups of one subject count once per period. */
export function periodsPerWeek(slots: Slot[]): { cls: string; subject: string; periods: number }[] {
  const m = new Map<string, { cls: string; subject: string; cells: Set<string> }>();
  for (const s of slots) {
    const k = `${normClass(s.class)}::${normSubject(s.subject)}`;
    const e = m.get(k) ?? { cls: displayClass(s.class), subject: s.subject.trim(), cells: new Set<string>() };
    e.cells.add(`${s.weekday}|${s.period_no}`);
    m.set(k, e);
  }
  return [...m.values()].map(e => ({ cls: e.cls, subject: e.subject, periods: e.cells.size }));
}

/** The teacher of each section + subject in a timetable (the most periods wins), for the parent portal. */
export function subjectTeachers(slots: Slot[]): Map<string, string> {
  const count = new Map<string, Map<string, number>>();
  for (const s of slots) {
    if (!s.teacher_id) continue;
    const k = `${normClass(s.class)}::${normSubject(s.subject)}`;
    const c = count.get(k) ?? new Map<string, number>();
    c.set(s.teacher_id, (c.get(s.teacher_id) || 0) + 1);
    count.set(k, c);
  }
  return new Map([...count].map(([k, c]) => [k, [...c].sort((a, b) => b[1] - a[1])[0][0]]));
}

// ── Bell schedule checks (the UI and the API share these) ─────────────────
export function bellProblems(periods: BellPeriod[]): string[] {
  const out: string[] = [];
  const sorted = [...periods].sort((a, b) => minutes(a.starts_at) - minutes(b.starts_at));
  for (const p of sorted) {
    if (minutes(p.ends_at) <= minutes(p.starts_at)) out.push(`${p.label} ends before it starts.`);
  }
  for (let i = 1; i < sorted.length; i++) {
    if (minutes(sorted[i].starts_at) < minutes(sorted[i - 1].ends_at)) out.push(`${sorted[i - 1].label} and ${sorted[i].label} overlap.`);
  }
  const nos = periods.filter(p => p.kind === 'period').map(p => p.period_no);
  if (nos.some(n => !n)) out.push('Every teaching period needs a number.');
  if (new Set(nos).size !== nos.length) out.push('Two teaching periods share a number.');
  return out;
}

// ── Who is away ────────────────────────────────────────────────────────────
export interface Away {
  reason: 'leave' | 'absent' | 'release';
  /** Full day, the morning or afternoon half, or named periods (a release). */
  portion: Absence['portion'];
  periods: number[];
  /** Half-day leave doesn't say which half: the office decides which periods need cover. */
  unsureHalf: boolean;
  leaveType?: string;
  absenceId?: string;
}

/** Why a person is away on a date: approved leave and confirmed absences or releases. */
export function awayOn(date: string, who: PersonKey, rows: Pick<ScheduleRows, 'leave' | 'absences'>): Away[] {
  const out: Away[] = [];
  if (!who.startsWith('s:')) {
    for (const l of rows.leave) {
      if (l.staff_id === who && l.status === 'approved' && l.from_date <= date && l.to_date >= date) {
        out.push({ reason: 'leave', portion: 'full', periods: [], unsureHalf: l.half_day, leaveType: l.leave_type });
      }
    }
  }
  for (const a of rows.absences) {
    if (a.status === 'confirmed' && a.on_date === date && personKey(a.user_id, a.staff_member_id) === who) {
      out.push({ reason: a.kind === 'release' ? 'release' : 'absent', portion: a.portion, periods: a.period_nos.map(Number), unsureHalf: false, absenceId: a.id });
    }
  }
  return out;
}

/** Minute of the day that splits morning from afternoon on a bell schedule: lunch, else the middle period. */
export function halfDaySplit(s: BellSchedule | null): number {
  if (!s?.periods.length) return 12 * 60;
  const lunch = s.periods.find(p => p.kind === 'lunch');
  if (lunch) return minutes(lunch.starts_at);
  const teaching = s.periods.filter(p => p.kind === 'period').sort((a, b) => minutes(a.starts_at) - minutes(b.starts_at));
  return teaching.length ? minutes(teaching[Math.ceil(teaching.length / 2)]?.starts_at ?? teaching[teaching.length - 1].ends_at) : 12 * 60;
}

/** Does being away take this lesson (period number, start minute, the day's bells for its wing)? */
export function awayTakes(a: Away, periodNo: number, startMin: number, bells: BellSchedule | null): boolean {
  if (a.portion === 'full') return true;
  if (a.portion === 'periods') return a.periods.includes(periodNo);
  const split = halfDaySplit(bells);
  return a.portion === 'am' ? startMin < split : startMin >= split;
}

// ── Agenda ──────────────────────────────────────────────────────────────────
export type AgendaItem =
  | {
    kind: 'lesson'; start: string; end: string; slot: Slot; room: Room | null; teacherName: string | null;
    /** The teacher is away for this lesson. */ covered: boolean;
    /** Who takes it instead, when cover is assigned. */ coveredBy?: string | null;
    /** A lesson this person takes as cover, and for whom. */ coverFor?: string | null; coverId?: string; flagged?: boolean;
  }
  | { kind: 'bell'; start: string; end: string; label: string; periodKind: BellPeriod['kind'] }
  | { kind: 'event'; start: string | null; end: string | null; event: AcademicEvent; required: boolean }
  | { kind: 'duty'; start: string; end: string; title: string; where: string | null; dutyKind: string }
  | { kind: 'leave'; halfDay: boolean; leaveType: string; portion?: Absence['portion']; periods?: number[] };

export interface AgendaDay {
  date: string;
  weekday: Weekday;
  /** Set when the day is a holiday for everything this agenda covers. */
  off: AcademicEvent | null;
  /** Lessons that don't happen (holiday for that wing) or have no bell time yet. */
  cancelled: number;
  items: AgendaItem[];
}

/** userId is a person key: an account id, or "s:" + a register id for staff with no login. */
export type Subject =
  | { kind: 'teacher'; userId: PersonKey }
  | { kind: 'office'; userId: PersonKey }
  | { kind: 'class'; cls: string }
  | { kind: 'room'; roomId: string };

const itemStart = (i: AgendaItem) => (i.kind === 'leave' ? -2 : i.kind === 'event' ? (i.start ? minutes(i.start) : -1) : minutes(i.start));

/**
 * A day-by-day agenda between two dates for a teacher, an office account, a section or a room.
 * Lessons come from the timetable in force on each date and take their times from their own
 * section's wing bells, so a teacher across Primary and Senior sees the right clock for each.
 * A person's agenda also carries their absences, the lessons they cover, who covers theirs,
 * and their duties (weekly roster and dated duties such as invigilation).
 */
export function agenda(who: Subject, from: string, to: string, rows: ScheduleRows): AgendaDay[] {
  const names = namesOf(rows);
  const wingByClass = (cls: string) => wingOf(cls, rows.wings)?.id ?? null;
  const me = who.kind === 'teacher' || who.kind === 'office' ? who.userId : null;
  const myWings = (() => {
    if (who.kind === 'class') return new Set([wingByClass(who.cls)]);
    if (who.kind === 'teacher') {
      const ws = new Set<string | null>();
      for (const s of rows.slots) if (slotPerson(s) === who.userId) ws.add(wingByClass(s.class));
      for (const p of rows.people) if (p.id === who.userId) teachingScope(p).forEach(e => ws.add(wingByClass(e.cls)));
      return ws;
    }
    return null; // office and rooms: the whole school
  })();
  const slotsByVersion = new Map<string, Slot[]>();
  for (const s of rows.slots) {
    const list = slotsByVersion.get(s.version_id || '');
    if (list) list.push(s); else slotsByVersion.set(s.version_id || '', [s]);
  }
  const slotById = new Map(rows.slots.filter(s => s.id).map(s => [s.id!, s]));
  const mine = (s: Slot) =>
    who.kind === 'teacher' ? slotPerson(s) === who.userId
      : who.kind === 'class' ? normClass(s.class) === normClass(who.cls)
        : who.kind === 'room' ? roomOf(s, rows.rooms)?.id === who.roomId
          : false;
  const register = me?.startsWith('s:') ? rows.staff.find(m => m.id === me.slice(2)) : undefined;
  const posts = new Map(rows.dutyPosts.map(p => [p.id, p]));

  return datesBetween(from, to).map(date => {
    const wd = weekdayOf(date);
    const items: AgendaItem[] = [];
    let cancelled = 0;
    // Outside a visiting or contract teacher's dates there's nothing to show.
    if (register && !inContract(register, date)) return { date, weekday: wd, off: null, cancelled: 0, items };

    const away = me ? awayOn(date, me, rows) : [];
    for (const a of away) {
      items.push(a.reason === 'leave'
        ? { kind: 'leave', halfDay: a.unsureHalf, leaveType: a.leaveType || 'leave' }
        : { kind: 'leave', halfDay: a.portion === 'am' || a.portion === 'pm', leaveType: a.reason, portion: a.portion, periods: a.periods });
    }

    // Events: whole-school ones, and those for the wings this agenda touches.
    const evs = rows.events.filter(e => e.starts_on <= date && e.ends_on >= date
      && (!e.wing_ids?.length || !myWings || [...myWings].some(w => w && e.wing_ids!.includes(w))));
    for (const e of evs) {
      const required = who.kind === 'teacher' ? e.staff_scope === 'all' || e.staff_scope === 'teaching'
        : who.kind === 'office' ? e.staff_scope === 'all' || e.staff_scope === 'office' : false;
      items.push({ kind: 'event', start: e.starts_at, end: e.ends_at, event: e, required });
    }

    const coversToday = rows.covers.filter(c => c.on_date === date && c.status === 'assigned');
    const v = versionOn(rows.versions, date);
    const lessons = v ? (slotsByVersion.get(v.id) || []).filter(s => s.weekday === wd && mine(s)) : [];
    const seenCombined = new Set<string>();
    for (const s of lessons) {
      const bells = bellsFor(date, wingByClass(s.class), rows.bells, rows.events);
      const p = periodOf(bells.schedule, s.period_no);
      if (!p) { cancelled++; continue; }
      // A combined lesson shows once for the teacher, with every section it covers in the slot's class.
      if (who.kind === 'teacher' && s.combined) {
        const k = `${s.period_no}|${normSubject(s.subject)}`;
        if (seenCombined.has(k)) {
          const prev = items.find(i => i.kind === 'lesson' && i.slot.period_no === s.period_no && i.slot.combined) as Extract<AgendaItem, { kind: 'lesson' }> | undefined;
          if (prev) prev.slot = { ...prev.slot, class: `${prev.slot.class}, ${displayClass(s.class)}` };
          continue;
        }
        seenCombined.add(k);
      }
      // Half-day leave doesn't say which half, so the lessons aren't marked until the office arranges cover.
      const takenAway = who.kind === 'teacher' && away.some(a => !a.unsureHalf && awayTakes(a, s.period_no, minutes(p.starts_at), bells.schedule));
      const cover = coversToday.find(c => c.slot_id === s.id);
      const sub = cover ? personKey(cover.sub_user_id, cover.sub_staff_member_id) : null;
      const teacher = slotPerson(s);
      items.push({
        kind: 'lesson', start: p.starts_at, end: p.ends_at, slot: s, room: roomOf(s, rows.rooms),
        teacherName: teacher ? names.get(teacher) ?? null : null, covered: takenAway, coveredBy: sub ? names.get(sub) ?? 'a colleague' : null,
      });
    }

    // Lessons this person takes as cover.
    if (me) {
      for (const c of coversToday) {
        if (personKey(c.sub_user_id, c.sub_staff_member_id) !== me) continue;
        const s = slotById.get(c.slot_id);
        if (!s) continue;
        const p = periodOf(bellsFor(date, wingByClass(s.class), rows.bells, rows.events).schedule, s.period_no);
        if (!p) continue;
        const absent = personKey(c.absent_user_id, c.absent_staff_member_id);
        items.push({
          kind: 'lesson', start: p.starts_at, end: p.ends_at, slot: s, room: roomOf(s, rows.rooms), teacherName: null, covered: false,
          coverFor: absent ? names.get(absent) ?? 'a colleague' : 'a colleague', coverId: c.id, flagged: !!c.flagged_at,
        });
      }
    }

    // A section's day also shows its breaks, lunch and assembly.
    let off: AcademicEvent | null = null;
    if (who.kind === 'class') {
      const bells = bellsFor(date, wingByClass(who.cls), rows.bells, rows.events);
      off = bells.off;
      for (const p of bells.schedule?.periods || []) {
        if (p.kind !== 'period') items.push({ kind: 'bell', start: p.starts_at, end: p.ends_at, label: p.label, periodKind: p.kind });
      }
    } else {
      const holidays = evs.filter(e => e.suspends_classes);
      // Off for everyone this agenda touches: a whole-school holiday, or one covering each of the teacher's wings.
      off = holidays.find(e => !e.wing_ids?.length)
        ?? (myWings?.size ? holidays.find(e => [...myWings].every(w => !!w && e.wing_ids!.includes(w))) : undefined) ?? null;
    }

    // Duties: the weekly roster (not on a whole-school holiday) and dated duties.
    if (me) {
      const schoolOff = evs.some(e => e.suspends_classes && !e.wing_ids?.length);
      if (!schoolOff) {
        for (const r of rows.roster) {
          const post = posts.get(r.post_id);
          if (!post?.active || r.weekday !== wd || !post.weekdays.includes(wd) || personKey(r.user_id, r.staff_member_id) !== me) continue;
          items.push({ kind: 'duty', start: post.starts_at, end: post.ends_at, title: post.name, where: post.location, dutyKind: post.kind });
        }
      }
      for (const d of rows.duties) {
        if (d.on_date !== date || personKey(d.user_id, d.staff_member_id) !== me) continue;
        const room = d.room_id ? rows.rooms.find(x => x.id === d.room_id)?.name ?? null : null;
        items.push({ kind: 'duty', start: d.starts_at, end: d.ends_at, title: d.title, where: room, dutyKind: d.kind });
      }
    }
    items.sort((a, b) => itemStart(a) - itemStart(b));
    return { date, weekday: wd, off, cancelled, items };
  });
}

/** Lessons in a week for the weekly grid view: weekday -> period -> lessons. */
export function weekGrid(slots: Slot[]) {
  const m = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = `${s.weekday}|${s.period_no}`;
    const g = m.get(k);
    if (g) g.push(s); else m.set(k, [s]);
  }
  return (weekday: number, period: number) => m.get(`${weekday}|${period}`) || [];
}
