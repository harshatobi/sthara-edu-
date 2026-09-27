/**
 * Between the school's scheduling rows and the solver: section grids from the bells, requirement and rule rows in
 * the solver's shape, the solver's lessons back as timetable slots, and a first requirements sheet suggested from
 * the current timetable or the teachers' assignments. Pure.
 */
import { normClass, displayClass, normSubject, teachingScope } from '@/lib/teacher/scope';
import { classOrder, sectionsOf, wingOf } from './engine';
import type { SolverInput, SolverLesson, SolverRequirement, SolverRule, SolverSection } from './solver';
import { personKey, slotPerson, slotTeacher, type BellSchedule, type PersonKey, type RoomKind, type ScheduleRows, type Slot } from './types';

/** A requirement row as stored (sched_requirements). */
export interface RequirementRow {
  id: string; session: string; class: string; subject: string; group_label: string;
  teacher_id: string | null; staff_member_id: string | null; periods_per_week: number; doubles: number;
  room_kind: RoomKind | null; room_id: string | null; max_per_day: number; combined_key: string | null; notes: string | null;
}
/** A load rule row as stored (teacher_load_rules). */
export interface LoadRuleRow {
  id: string; user_id: string | null; staff_member_id: string | null; target_per_week: number | null;
  max_per_day: number | null; max_per_week: number | null; max_consecutive: number | null;
  unavailable: { weekday: number; periods: number[] }[];
}
export interface SolverSettingsRow {
  default_target_per_week: number; default_max_per_day: number; default_max_consecutive: number;
  class_teacher_first: boolean; subject_spread: boolean;
}
export const DEFAULT_SOLVER_SETTINGS: SolverSettingsRow = {
  default_target_per_week: 30, default_max_per_day: 7, default_max_consecutive: 4, class_teacher_first: true, subject_spread: true,
};

export const ruleKey = (r: Pick<LoadRuleRow, 'user_id' | 'staff_member_id'>) => personKey(r.user_id, r.staff_member_id)!;
export const reqTeacher = (r: Pick<RequirementRow, 'teacher_id' | 'staff_member_id'>) => personKey(r.teacher_id, r.staff_member_id);

/** A section's teaching grid from its wing's regular bells: days, period numbers, and back-to-back pairs. */
export function gridFor(cls: string, rows: Pick<ScheduleRows, 'wings' | 'bells'>): SolverSection['days'] {
  const wing = wingOf(cls, rows.wings)?.id ?? null;
  const regular = rows.bells.filter(b => b.kind === 'regular');
  const days: SolverSection['days'] = [];
  for (let wd = 1; wd <= 7; wd++) {
    const sched: BellSchedule | undefined = regular.find(b => b.weekdays.includes(wd) && wing !== null && b.wing_id === wing)
      ?? regular.find(b => b.weekdays.includes(wd) && b.wing_id === null);
    if (!sched) continue;
    const ordered = [...sched.periods].sort((a, b) => a.seq - b.seq);
    const periods = ordered.filter(p => p.kind === 'period' && p.period_no).map(p => p.period_no!);
    if (!periods.length) continue;
    const pairs: [number, number][] = [];
    for (let i = 0; i + 1 < ordered.length; i++) {
      const a = ordered[i], b = ordered[i + 1];
      if (a.kind === 'period' && b.kind === 'period' && a.period_no && b.period_no) pairs.push([a.period_no, b.period_no]);
    }
    days.push({ weekday: wd, periods, pairs });
  }
  return days;
}

const asLesson = (s: Slot, locked: boolean): SolverLesson => ({
  cls: displayClass(s.class), group: s.group_label || '', subject: s.subject, weekday: s.weekday, period: s.period_no,
  teacher: slotPerson(s), roomId: s.room_id, combined: s.combined, locked,
});

/** The solver's input for a school: every section with requirements, the rules, the rooms, and what to keep. */
export function buildInput(rows: ScheduleRows, reqs: RequirementRow[], rules: LoadRuleRow[], settings: SolverSettingsRow, opts: {
  /** Repair: this version's locked lessons stay put and the others are the starting point. Fresh: nothing kept. */
  base?: { slots: Slot[]; mode: 'repair' | 'fresh' };
  seed?: number; timeLimitMs?: number;
}): SolverInput {
  const classTeacher = new Map<string, PersonKey>();
  for (const p of rows.people) if (p.role === 'teacher' && p.teacher_class) classTeacher.set(normClass(p.teacher_class), p.id);
  const sectionKeys = [...new Set(reqs.map(r => normClass(r.class)))];
  const displayByKey = new Map(reqs.map(r => [normClass(r.class), displayClass(r.class)]));
  const sections: SolverSection[] = sectionKeys.map(k => ({ cls: displayByKey.get(k)!, classTeacher: classTeacher.get(k) ?? null, days: gridFor(displayByKey.get(k)!, rows) }))
    .filter(s => s.days.length);
  const baseSlots = opts.base?.slots ?? [];
  const keep = keptLessons(baseSlots, reqs);
  const locked = opts.base ? baseSlots.filter(s => keep.has(s)).map(s => asLesson(s, true)) : [];
  const start = opts.base?.mode === 'repair' ? baseSlots.filter(s => !keep.has(s)).map(s => asLesson(s, false)) : undefined;
  return {
    sections,
    requirements: reqs.map<SolverRequirement>(r => ({
      id: r.id, cls: displayClass(r.class), subject: r.subject, group: r.group_label || '', teacher: reqTeacher(r),
      periods: r.periods_per_week, doubles: r.doubles, roomKind: r.room_kind, roomId: r.room_id, maxPerDay: r.max_per_day, combinedKey: r.combined_key,
    })),
    rules: rules.map<SolverRule>(r => ({
      person: ruleKey(r), maxPerDay: r.max_per_day, maxPerWeek: r.max_per_week, maxConsecutive: r.max_consecutive,
      unavailable: (r.unavailable || []).map(u => ({ weekday: Number(u.weekday), periods: (u.periods || []).map(Number) })),
    })),
    defaults: { maxPerDay: settings.default_max_per_day, maxConsecutive: settings.default_max_consecutive, classTeacherFirst: settings.class_teacher_first, spread: settings.subject_spread },
    rooms: rows.rooms.map(r => ({ id: r.id, kind: r.kind, active: r.active, homeClass: r.home_class })),
    locked, start, seed: opts.seed, timeLimitMs: opts.timeLimitMs,
  };
}

/**
 * The base timetable's lessons the solver must keep where they are:
 *  - locked lessons, and every section's copy of a locked combined lesson (one lesson taught to several sections is
 *    locked as a whole, even if only one section's copy was ticked);
 *  - lessons the requirements sheet doesn't cover (a section or subject with no row): the solver can't place those
 *    again, so re-solving keeps them rather than dropping them.
 */
export function keptLessons(slots: Slot[], reqs: Pick<RequirementRow, 'class' | 'subject' | 'group_label'>[]): Set<Slot> {
  const covered = new Set(reqs.map(r => `${normClass(r.class)}|${normSubject(r.subject)}|${(r.group_label || '').toLowerCase()}`));
  const cell = (s: Slot) => `${s.weekday}|${s.period_no}|${slotPerson(s) ?? ''}|${normSubject(s.subject)}`;
  const lockedCombined = new Set(slots.filter(s => s.locked && s.combined).map(cell));
  return new Set(slots.filter(s => s.locked
    || (s.combined && lockedCombined.has(cell(s)))
    || !covered.has(`${normClass(s.class)}|${normSubject(s.subject)}|${(s.group_label || '').toLowerCase()}`)));
}

/** The solver's lessons as timetable slots (for saving as a draft and for the clash check). */
export function toSlots(lessons: SolverLesson[]): (Slot & { locked: boolean })[] {
  return lessons.map(l => ({
    class: l.cls, group_label: l.group, weekday: l.weekday, period_no: l.period, subject: l.subject,
    ...slotTeacher(l.teacher), room_id: l.roomId, combined: l.combined, locked: !!l.locked,
  }));
}

export interface SuggestedRequirement {
  class: string; subject: string; group_label: string; teacher: PersonKey | null; periods_per_week: number; doubles: number;
  room_kind: RoomKind | null; combined_key: string | null; source: 'timetable' | 'assignment';
}

/**
 * A first requirements sheet: from a timetable where there is one (periods a week, teacher, groups, rooms used,
 * combined lessons and doubles as they are now), else from each teacher's assignments with `defaultPeriods`.
 */
export function suggestRequirements(rows: ScheduleRows, slots: Slot[], defaultPeriods = 5): SuggestedRequirement[] {
  const out = new Map<string, SuggestedRequirement & { cells: Set<string>; teachers: Map<string, number>; kinds: Map<string, number>; doublesSeen: number }>();
  const roomKind = new Map(rows.rooms.map(r => [r.id, r.kind]));
  // Combined lessons: the same teacher, subject and period across sections.
  const combinedKey = new Map<string, string>();
  const byCell = new Map<string, Slot[]>();
  for (const s of slots) if (s.combined) {
    const k = `${slotPerson(s) ?? '?'}|${s.weekday}|${s.period_no}|${normSubject(s.subject)}`;
    byCell.set(k, [...(byCell.get(k) ?? []), s]);
  }
  for (const group of byCell.values()) {
    const key = `${group[0].subject.slice(0, 20)} ${group.map(s => displayClass(s.class).replace('Class ', '')).sort(classOrder).join('+')}`.slice(0, 40);
    for (const s of group) combinedKey.set(`${normClass(s.class)}|${normSubject(s.subject)}|${(s.group_label || '').toLowerCase()}`, key);
  }
  for (const s of slots) {
    const k = `${normClass(s.class)}|${normSubject(s.subject)}|${(s.group_label || '').toLowerCase()}`;
    const e = out.get(k) ?? {
      class: displayClass(s.class), subject: s.subject.trim(), group_label: s.group_label || '', teacher: null, periods_per_week: 0, doubles: 0,
      room_kind: null, combined_key: combinedKey.get(k) ?? null, source: 'timetable' as const,
      cells: new Set<string>(), teachers: new Map<string, number>(), kinds: new Map<string, number>(), doublesSeen: 0,
    };
    e.cells.add(`${s.weekday}|${s.period_no}`);
    const t = slotPerson(s);
    if (t) e.teachers.set(t, (e.teachers.get(t) || 0) + 1);
    const kind = s.room_id ? roomKind.get(s.room_id) : null;
    if (kind && kind !== 'classroom') e.kinds.set(kind, (e.kinds.get(kind) || 0) + 1);
    out.set(k, e);
  }
  for (const e of out.values()) {
    e.periods_per_week = Math.min(20, e.cells.size);
    e.teacher = [...e.teachers].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const kind = [...e.kinds].sort((a, b) => b[1] - a[1])[0];
    e.room_kind = kind && kind[1] * 2 >= e.cells.size ? kind[0] as RoomKind : null;
    // Doubles as they are now: the same subject in back-to-back periods on a day.
    const byDay = new Map<number, number[]>();
    for (const c of e.cells) { const [d, p] = c.split('|').map(Number); byDay.set(d, [...(byDay.get(d) ?? []), p]); }
    let doubles = 0;
    for (const ps of byDay.values()) { ps.sort((a, b) => a - b); for (let i = 0; i + 1 < ps.length; i++) if (ps[i + 1] === ps[i] + 1) { doubles++; i++; } }
    e.doubles = Math.min(doubles, Math.floor(e.periods_per_week / 2));
  }
  // Sections and subjects no timetable covers yet: from the teachers' assignments.
  for (const p of rows.people) {
    if (p.role !== 'teacher') continue;
    for (const a of teachingScope(p)) {
      if (!a.subject) continue;
      const k = `${normClass(a.cls)}|${normSubject(a.subject)}|`;
      if (out.has(k) || [...out.keys()].some(x => x.startsWith(`${normClass(a.cls)}|${normSubject(a.subject)}|`))) continue;
      out.set(k, {
        class: displayClass(a.cls), subject: a.subject, group_label: '', teacher: p.id, periods_per_week: defaultPeriods, doubles: 0, room_kind: null,
        combined_key: null, source: 'assignment', cells: new Set(), teachers: new Map(), kinds: new Map(), doublesSeen: 0,
      });
    }
  }
  const sectionsKnown = new Set(sectionsOf(rows).map(normClass));
  return [...out.values()]
    .filter(e => sectionsKnown.has(normClass(e.class)) || e.source === 'timetable')
    .map(e => ({ class: e.class, subject: e.subject, group_label: e.group_label, teacher: e.teacher, periods_per_week: e.periods_per_week, doubles: e.doubles, room_kind: e.room_kind, combined_key: e.combined_key, source: e.source }))
    .sort((a, b) => classOrder(a.class, b.class) || a.subject.localeCompare(b.subject) || a.group_label.localeCompare(b.group_label));
}
