/**
 * The timetable auto-solver. Pure (no I/O), so it runs in a Web Worker in the browser and in the tests.
 *
 * Input: what each section needs taught (requirements), when each section has periods (from its wing's bells),
 * teachers' load rules, rooms, lessons to keep where they are (locked), and optionally a timetable to start from
 * (repair mode). Output: a clash-free set of lessons, what couldn't be placed and why, and a score.
 *
 * Hard rules (never broken): no teacher, section or room in two places at once; a teacher's times off, caps per
 * day / week and in a row; a subject at most `max_per_day` times a day (a double counts once); doubles in two
 * back-to-back periods with no break between; the right kind of room (or the named room).
 * Soft rules (scored, lower is better): the class teacher takes the first period; a subject spread across the week;
 * teachers' days balanced and without long gaps.
 *
 * Method: place the hardest lessons first in their best spot, moving others aside when one has nowhere to go
 * (bounded), then improve by moving lessons while the score gets better (simulated annealing, time-bounded).
 */
import type { PersonKey, RoomKind } from './types';

export interface SolverRequirement {
  id: string;
  cls: string;            // display form, e.g. "Class 10-A"
  subject: string;
  group: string;          // '' = the whole class; else a split group (Biology / Computer Science)
  teacher: PersonKey | null;
  periods: number;        // per week
  doubles: number;        // how many of them are double periods
  roomKind: RoomKind | null;
  roomId: string | null;
  maxPerDay: number;
  combinedKey: string | null;  // requirements that share it are one lesson taught to several sections together
}
export interface SolverRule {
  person: PersonKey;
  maxPerDay: number | null; maxPerWeek: number | null; maxConsecutive: number | null;
  unavailable: { weekday: number; periods: number[] }[];  // no periods = the whole day
}
export interface SolverSection {
  cls: string;
  classTeacher: PersonKey | null;
  /** Teaching days and their period numbers in order; `pairs` are back-to-back periods (no break between). */
  days: { weekday: number; periods: number[]; pairs: [number, number][] }[];
}
/** homeClass: a section's home room, which the solver never hands to another lesson. */
export interface SolverRoom { id: string; kind: RoomKind; active: boolean; homeClass?: string | null }
export interface SolverLesson {
  cls: string; group: string; subject: string; weekday: number; period: number;
  teacher: PersonKey | null; roomId: string | null; combined: boolean; locked?: boolean;
}
export interface SolverInput {
  sections: SolverSection[];
  requirements: SolverRequirement[];
  rules: SolverRule[];
  defaults: { maxPerDay: number; maxConsecutive: number; classTeacherFirst: boolean; spread: boolean };
  rooms: SolverRoom[];
  locked: SolverLesson[];
  /** Repair mode: the current (unlocked) lessons, used as starting positions where they still fit. */
  start?: SolverLesson[];
  seed?: number;
  timeLimitMs?: number;
}
export interface Unplaced { requirementId: string; cls: string; subject: string; group: string; periods: number; reason: string }
export interface SolverResult {
  lessons: SolverLesson[];
  unplaced: Unplaced[];
  score: { total: number; soft: Record<string, number> };
  stats: { units: number; placed: number; iterations: number; ms: number; moved: number };
  warnings: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const norm = (s: string) => s.toLowerCase().replace(/class|[^a-z0-9]/g, '');
const subj = (s: string) => s.trim().toLowerCase();

/** A small seeded random generator (mulberry32), so a run can be repeated. */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Unit {
  id: number;
  req: SolverRequirement;        // the first requirement (subject, teacher, room needs)
  reqIds: string[];               // all requirements it serves (a combined lesson serves one per section)
  sections: string[];             // class keys
  group: string;
  len: 1 | 2;
  teacher: PersonKey | null;
  // placement
  day: number | null;
  start: number | null;
  periods: number[];              // the period numbers it occupies
  room: string | null;
}

interface Pos { day: number; start: number; periods: number[] }

// ── The solver ──────────────────────────────────────────────────────────────
export function solve(input: SolverInput): SolverResult {
  const t0 = Date.now();
  const rand = rng(input.seed ?? 1);
  const warnings: string[] = [];
  const sectionByKey = new Map(input.sections.map(s => [norm(s.cls), s]));
  const reqById = new Map(input.requirements.map(r => [r.id, r]));
  const ruleOf = new Map(input.rules.map(r => [r.person, r]));
  const maxDay = (p: PersonKey) => ruleOf.get(p)?.maxPerDay ?? input.defaults.maxPerDay;
  const maxWeek = (p: PersonKey) => ruleOf.get(p)?.maxPerWeek ?? Infinity;
  const maxRun = (p: PersonKey) => ruleOf.get(p)?.maxConsecutive ?? input.defaults.maxConsecutive;
  const off = (p: PersonKey, day: number, period: number) =>
    (ruleOf.get(p)?.unavailable ?? []).some(u => u.weekday === day && (!u.periods.length || u.periods.includes(period)));

  // Occupancy.
  const teacherAt = new Map<string, number>();                  // teacher|day|period -> unit id (-1 locked)
  const sectionAt = new Map<string, Map<string, number>>();      // cls|day|period -> group ('' whole) -> unit id
  const roomAt = new Map<string, number>();                      // room|day|period -> unit id
  const reqDay = new Map<string, number>();                      // reqId|day -> occurrences (a double counts once)
  const teacherDay = new Map<string, number>();                  // teacher|day -> periods
  const teacherWeek = new Map<string, number>();                 // teacher -> periods
  const key3 = (a: string, d: number, p: number) => `${a}|${d}|${p}`;
  const lockedReqCount = new Map<string, number>();

  // Locked lessons: they occupy their places and count towards their requirement.
  const reqKey = (cls: string, subject: string, group: string) => `${norm(cls)}|${subj(subject)}|${group.toLowerCase()}`;
  const reqByLesson = new Map(input.requirements.map(r => [reqKey(r.cls, r.subject, r.group), r]));
  const reqFor = (cls: string, subject: string, group: string) => reqByLesson.get(reqKey(cls, subject, group));
  const lockedSeen = new Set<string>();
  for (const l of input.locked) {
    const ck = norm(l.cls);
    const cell = sectionAt.get(key3(ck, l.weekday, l.period)) ?? new Map<string, number>();
    cell.set(l.group.toLowerCase(), -1);
    sectionAt.set(key3(ck, l.weekday, l.period), cell);
    if (l.teacher) {
      // A combined lesson is one teaching period for the teacher.
      const tk = key3(l.teacher, l.weekday, l.period);
      if (!teacherAt.has(tk)) {
        teacherAt.set(tk, -1);
        teacherDay.set(`${l.teacher}|${l.weekday}`, (teacherDay.get(`${l.teacher}|${l.weekday}`) || 0) + 1);
        teacherWeek.set(l.teacher, (teacherWeek.get(l.teacher) || 0) + 1);
      }
    }
    if (l.roomId) roomAt.set(key3(l.roomId, l.weekday, l.period), -1);
    const r = reqFor(l.cls, l.subject, l.group);
    if (r) {
      lockedReqCount.set(r.id, (lockedReqCount.get(r.id) || 0) + 1);
      const dk = `${r.id}|${l.weekday}`;
      if (!lockedSeen.has(`${dk}|${l.period - 1}`)) reqDay.set(dk, (reqDay.get(dk) || 0) + 1);  // a locked double counts once
      lockedSeen.add(`${dk}|${l.period}`);
    }
  }

  // Units: requirements sharing a combined key are taught together; otherwise one requirement each.
  const units: Unit[] = [];
  const groups = new Map<string, SolverRequirement[]>();
  for (const r of input.requirements) {
    if (!sectionByKey.has(norm(r.cls))) { warnings.push(`${r.cls} has no bells set up, so ${r.subject} can't be placed.`); continue; }
    const k = r.combinedKey ? `c:${r.combinedKey.toLowerCase()}` : `r:${r.id}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const [k, rs] of groups) {
    const r = rs[0];
    if (k.startsWith('c:') && new Set(rs.map(x => x.teacher)).size > 1) {
      warnings.push(`The combined lesson "${r.combinedKey}" has different teachers in its sections; ${r.cls}'s teacher is used for all.`);
    }
    const already = Math.min(...rs.map(x => lockedReqCount.get(x.id) || 0));
    const need = Math.max(0, r.periods - already);
    const doubles = Math.min(r.doubles, Math.floor(need / 2));
    for (let i = 0; i < need - doubles * 2 + doubles; i++) {
      units.push({
        id: units.length, req: r, reqIds: rs.map(x => x.id), sections: [...new Set(rs.map(x => norm(x.cls)))], group: r.group.toLowerCase(),
        len: i < doubles ? 2 : 1, teacher: r.teacher, day: null, start: null, periods: [], room: null,
      });
    }
  }

  // Where a unit could go (ignoring what's placed): days every section has, runs of back-to-back periods.
  const shapeOf = (u: Unit): Pos[] => {
    const secs = u.sections.map(k => sectionByKey.get(k)!);
    const out: Pos[] = [];
    for (const d of secs[0].days) {
      const others = secs.slice(1).map(s => s.days.find(x => x.weekday === d.weekday));
      if (others.some(o => !o)) continue;
      for (const p of d.periods) {
        const periods = u.len === 1 ? [p] : (() => { const pr = d.pairs.find(x => x[0] === p); return pr ? [pr[0], pr[1]] : null; })();
        if (!periods) continue;
        if (others.some(o => !periods.every(q => o!.periods.includes(q)))) continue;
        if (u.len === 2 && others.some(o => !o!.pairs.some(x => x[0] === periods[0] && x[1] === periods[1]))) continue;
        out.push({ day: d.weekday, start: p, periods });
      }
    }
    return out;
  };
  const shapes = units.map(shapeOf);

  // Every period number taught on each weekday, across sections.
  const dayPeriods = new Map<number, number[]>();
  for (const s of input.sections) for (const d of s.days) dayPeriods.set(d.weekday, [...new Set([...(dayPeriods.get(d.weekday) ?? []), ...d.periods])].sort((a, b) => a - b));

  // The longest run of consecutive teaching periods a teacher would have on a day if `add` were added.
  const runWith = (t: PersonKey, day: number, add: number[]) => {
    const periodsOfDay = new Set(dayPeriods.get(day) ?? []);
    const busy = (p: number) => add.includes(p) || teacherAt.has(key3(t, day, p));
    let best = 0;
    for (const a of add) {
      let n = 1;
      for (let p = a - 1; periodsOfDay.has(p) && busy(p); p--) n++;
      for (let p = a + 1; periodsOfDay.has(p) && busy(p); p++) n++;
      best = Math.max(best, n);
    }
    return best;
  };

  const kindRooms = (kind: RoomKind) => input.rooms.filter(r => r.active && r.kind === kind && !r.homeClass).map(r => r.id);

  /** Why a unit can't go at a position (null = it can, with the room it would get). */
  const blockers = (u: Unit, pos: Pos): { ok: true; room: string | null } | { ok: false; conflicts: Set<number>; hard: string } => {
    const conflicts = new Set<number>();
    let hard = '';
    for (const p of pos.periods) {
      for (const sk of u.sections) {
        const cell = sectionAt.get(key3(sk, pos.day, p));
        if (!cell) continue;
        for (const [g, id] of cell) {
          if (u.group === '' || g === '' || g === u.group) { if (id < 0) hard = 'section'; else if (id !== u.id) conflicts.add(id); }
        }
      }
      if (u.teacher) {
        if (off(u.teacher, pos.day, p)) hard = 'teacher off';
        const id = teacherAt.get(key3(u.teacher, pos.day, p));
        if (id !== undefined && id !== u.id) { if (id < 0) hard = 'teacher'; else conflicts.add(id); }
      }
    }
    if (hard) return { ok: false, conflicts, hard };
    // Room: the named room, a free room of the kind, or none (the home room for a whole-class lesson).
    let room: string | null = null;
    if (u.req.roomId || u.req.roomKind) {
      const pool = u.req.roomId ? [u.req.roomId] : kindRooms(u.req.roomKind!);
      if (!pool.length) return { ok: false, conflicts, hard: `no ${u.req.roomKind} room` };
      const free = pool.find(r => pos.periods.every(p => { const id = roomAt.get(key3(r, pos.day, p)); return id === undefined || id === u.id; }));
      if (free) room = free;
      else {
        // Every room of the kind is taken: the lessons in the first one are what's in the way.
        const holder = pos.periods.map(p => roomAt.get(key3(pool[0], pos.day, p))).find(id => id !== undefined && id !== u.id);
        if (holder === undefined || holder < 0) return { ok: false, conflicts, hard: 'room' };
        conflicts.add(holder);
      }
    }
    if (conflicts.size) return { ok: false, conflicts, hard: '' };
    // Caps that depend on the placed load (these don't name a unit to move).
    const counted = (u.day === pos.day ? 0 : 1);
    for (const id of u.reqIds) {
      const r = reqById.get(id)!;
      if ((reqDay.get(`${id}|${pos.day}`) || 0) + counted > r.maxPerDay) return { ok: false, conflicts, hard: 'per day' };
    }
    if (u.teacher) {
      const mine = u.day === pos.day ? u.periods.length : 0;
      if ((teacherDay.get(`${u.teacher}|${pos.day}`) || 0) - mine + u.len > maxDay(u.teacher)) return { ok: false, conflicts, hard: 'teacher day cap' };
      const week = (teacherWeek.get(u.teacher) || 0) - (u.day !== null ? u.periods.length : 0) + u.len;
      if (week > maxWeek(u.teacher)) return { ok: false, conflicts, hard: 'teacher week cap' };
      if (runWith(u.teacher, pos.day, pos.periods) > maxRun(u.teacher)) return { ok: false, conflicts, hard: 'in a row' };
    }
    return { ok: true, room };
  };

  const place = (u: Unit, pos: Pos, room: string | null) => {
    u.day = pos.day; u.start = pos.start; u.periods = pos.periods; u.room = room;
    for (const p of pos.periods) {
      for (const sk of u.sections) {
        const cell = sectionAt.get(key3(sk, pos.day, p)) ?? new Map<string, number>();
        cell.set(u.group, u.id);
        sectionAt.set(key3(sk, pos.day, p), cell);
      }
      if (u.teacher) teacherAt.set(key3(u.teacher, pos.day, p), u.id);
      if (room) roomAt.set(key3(room, pos.day, p), u.id);
    }
    for (const id of u.reqIds) reqDay.set(`${id}|${pos.day}`, (reqDay.get(`${id}|${pos.day}`) || 0) + 1);
    if (u.teacher) {
      teacherDay.set(`${u.teacher}|${pos.day}`, (teacherDay.get(`${u.teacher}|${pos.day}`) || 0) + u.len);
      teacherWeek.set(u.teacher, (teacherWeek.get(u.teacher) || 0) + u.len);
    }
  };
  const lift = (u: Unit) => {
    if (u.day === null) return;
    const day = u.day;
    for (const p of u.periods) {
      for (const sk of u.sections) sectionAt.get(key3(sk, day, p))?.delete(u.group);
      if (u.teacher && teacherAt.get(key3(u.teacher, day, p)) === u.id) teacherAt.delete(key3(u.teacher, day, p));
      if (u.room && roomAt.get(key3(u.room, day, p)) === u.id) roomAt.delete(key3(u.room, day, p));
    }
    for (const id of u.reqIds) reqDay.set(`${id}|${day}`, (reqDay.get(`${id}|${day}`) || 1) - 1);
    if (u.teacher) {
      teacherDay.set(`${u.teacher}|${day}`, (teacherDay.get(`${u.teacher}|${day}`) || u.len) - u.len);
      teacherWeek.set(u.teacher, (teacherWeek.get(u.teacher) || u.len) - u.len);
    }
    u.day = null; u.start = null; u.periods = []; u.room = null;
  };

  // ── Soft score ──
  const firstPeriod = new Map<string, number>();  // cls|day -> first teaching period
  for (const s of input.sections) for (const d of s.days) if (d.periods.length) firstPeriod.set(`${norm(s.cls)}|${d.weekday}`, d.periods[0]);
  const teachers = [...new Set(units.map(u => u.teacher).filter((t): t is PersonKey => !!t))];
  const unitsOfTeacher = new Map<PersonKey, Unit[]>();
  for (const u of units) if (u.teacher) unitsOfTeacher.set(u.teacher, [...(unitsOfTeacher.get(u.teacher) ?? []), u]);
  const unitsOfReq = new Map<string, Unit[]>();
  for (const u of units) unitsOfReq.set(u.req.id, [...(unitsOfReq.get(u.req.id) ?? []), u]);

  const W = { classTeacher: 30, spread: 6, gaps: 1, balance: 2 };
  /** Soft cost of one teacher's week: idle gaps inside each day, and days far from their average load. */
  const teacherCost = (t: PersonKey) => {
    let gaps = 0, balance = 0;
    const loads: number[] = [];
    for (const [d, periods] of dayPeriods) {
      const uniq = periods.filter(p => teacherAt.has(key3(t, d, p)));
      loads.push(uniq.length);
      if (uniq.length > 1) gaps += (uniq[uniq.length - 1] - uniq[0] + 1) - uniq.length;
    }
    const avg = loads.reduce((a, b) => a + b, 0) / Math.max(1, loads.length);
    for (const l of loads) balance += (l - avg) ** 2;
    return W.gaps * gaps + W.balance * balance / Math.max(1, loads.length);
  };
  /** A requirement's spread: days it lands on beyond what it needs, and back-to-back days when it meets only a few times. */
  const spreadCost = (reqId: string) => {
    if (!input.defaults.spread) return 0;
    const us = (unitsOfReq.get(reqId) ?? []).filter(u => u.day !== null);
    if (us.length < 2) return 0;
    const days = us.map(u => u.day!).sort((a, b) => a - b);
    let c = 0;
    const distinct = new Set(days).size;
    c += (Math.min(us.length, 6) - distinct) * 3;
    if (us.length <= 3) for (let i = 1; i < days.length; i++) if (days[i] - days[i - 1] === 1) c += 1;
    return W.spread * c;
  };
  /** The class teacher isn't in period 1 on this section's day. */
  const classTeacherCost = (sk: string, day: number) => {
    if (!input.defaults.classTeacherFirst) return 0;
    const sec = sectionByKey.get(sk);
    const fp = firstPeriod.get(`${sk}|${day}`);
    if (!sec?.classTeacher || fp === undefined) return 0;
    const cell = sectionAt.get(key3(sk, day, fp));
    if (!cell) return W.classTeacher;
    for (const id of cell.values()) {
      if (id < 0) { if (input.locked.some(l => norm(l.cls) === sk && l.weekday === day && l.period === fp && l.teacher === sec.classTeacher)) return 0; continue; }
      if (units[id]?.teacher === sec.classTeacher) return 0;
    }
    return W.classTeacher;
  };
  // Whether the class teacher can teach period 1 at all (they need a lesson in the section).
  for (const s of input.sections) {
    if (!s.classTeacher || !input.defaults.classTeacherFirst) continue;
    const theirs = units.filter(u => u.teacher === s.classTeacher && u.sections.includes(norm(s.cls))).length
      + input.locked.filter(l => norm(l.cls) === norm(s.cls) && l.teacher === s.classTeacher).length;
    if (theirs < s.days.length) warnings.push(`${s.cls}: the class teacher has ${theirs} lesson${theirs === 1 ? '' : 's'} a week with the class, so can't take period 1 on all ${s.days.length} days.`);
  }

  const totalSoft = () => {
    const out = { classTeacher: 0, spread: 0, teachers: 0 };
    for (const s of input.sections) for (const d of s.days) out.classTeacher += classTeacherCost(norm(s.cls), d.weekday);
    for (const r of unitsOfReq.keys()) out.spread += spreadCost(r);
    for (const t of teachers) out.teachers += teacherCost(t);
    return out;
  };
  /** Soft cost of what a unit's position touches (for comparing two positions of one unit). */
  const localCost = (u: Unit, day: number | null) => {
    let c = spreadCost(u.req.id);
    if (u.teacher) c += teacherCost(u.teacher);
    if (day !== null) for (const sk of u.sections) c += classTeacherCost(sk, day);
    return c;
  };

  // ── Construction ──
  const difficulty = (u: Unit) => u.sections.length * 100 + u.len * 40 + (u.req.roomKind || u.req.roomId ? 30 : 0)
    + (u.teacher ? (unitsOfTeacher.get(u.teacher)?.length ?? 0) : 0) - shapes[u.id].length;
  const tryBest = (u: Unit, noise: number): boolean => {
    let best: { pos: Pos; room: string | null; cost: number } | null = null;
    for (const pos of shapes[u.id]) {
      const b = blockers(u, pos);
      if (!b.ok) continue;
      place(u, pos, b.room);
      const cost = localCost(u, pos.day) + rand() * noise;
      lift(u);
      if (!best || cost < best.cost) best = { pos, room: b.room, cost };
    }
    if (!best) return false;
    place(u, best.pos, best.room);
    return true;
  };

  // Repair mode: start where each lesson was, when that still fits.
  if (input.start?.length) {
    const byReq = new Map<string, SolverLesson[]>();
    for (const l of input.start) {
      const r = reqFor(l.cls, l.subject, l.group);
      if (r) byReq.set(r.id, [...(byReq.get(r.id) ?? []), l]);
    }
    for (const u of units) {
      const pool = byReq.get(u.req.id);
      if (!pool?.length) continue;
      for (const l of pool) {
        const pos = shapes[u.id].find(p => p.day === l.weekday && p.start === l.period);
        if (!pos) continue;
        const b = blockers(u, pos);
        if (!b.ok) continue;
        place(u, pos, b.room);
        // Those periods of the old timetable are used up.
        for (const q of pos.periods) { const i = pool.findIndex(x => x.weekday === pos.day && x.period === q); if (i >= 0) pool.splice(i, 1); }
        break;
      }
    }
  }

  const kicks = new Map<number, number>();
  let moved = 0;
  /** Places the queued lessons, moving aside a few others when one has nowhere to go (bounded by `budget`). */
  const construct = (queue: Unit[], budget: number) => {
  while (queue.length) {
    const u = queue.shift()!;
    if (u.day !== null) continue;
    if (tryBest(u, 0.5)) continue;
    if (budget-- <= 0 || (kicks.get(u.id) ?? 0) > 6) continue;  // stays unplaced
    // Move aside the fewest movable lessons in the way, then place this one and requeue them.
    let best: { pos: Pos; conflicts: Set<number> } | null = null;
    for (const pos of shapes[u.id]) {
      const b = blockers(u, pos);
      if (b.ok || b.hard) continue;
      if ([...b.conflicts].some(id => (kicks.get(id) ?? 0) > 6)) continue;
      if (!best || b.conflicts.size < best.conflicts.size || (b.conflicts.size === best.conflicts.size && rand() < 0.3)) best = { pos, conflicts: b.conflicts };
    }
    if (!best || best.conflicts.size > 3) continue;
    for (const id of best.conflicts) { lift(units[id]); kicks.set(id, (kicks.get(id) ?? 0) + 1); queue.push(units[id]); moved++; }
    const b = blockers(u, best.pos);
    if (b.ok) place(u, best.pos, b.room);
    else queue.push(u);
    kicks.set(u.id, (kicks.get(u.id) ?? 0) + 1);
  }
  };
  construct(units.filter(u => u.day === null).sort((a, b) => difficulty(b) - difficulty(a)), units.length * 6);

  // ── Improvement: move lessons while the score improves (occasionally accepting a worse move to escape). ──
  const limit = input.timeLimitMs ?? 3000;
  let iterations = 0;
  let temp = 4;
  const placed = () => units.filter(u => u.day !== null);
  let pool = placed();
  while (Date.now() - t0 < limit && pool.length) {
    iterations++;
    if (iterations % 400 === 0) {
      temp *= 0.9;
      // Give unplaced lessons another chance, moving others aside if needed (with a fresh, small allowance).
      const left = units.filter(u => u.day === null);
      if (left.length) { for (const u of left) kicks.set(u.id, 0); construct(left, left.length * 4); }
      pool = placed();
    }
    const u = pool[Math.floor(rand() * pool.length)];
    const options = shapes[u.id];
    const pos = options[Math.floor(rand() * options.length)];
    if (!pos || (pos.day === u.day && pos.start === u.start)) continue;
    const from = { day: u.day!, start: u.start!, periods: u.periods, room: u.room };
    // Cost of what the move touches: this lesson's spread and teacher, and the class-teacher rule on both days.
    const before = localCost(u, from.day);
    const beforeDayCost = u.sections.reduce((n, sk) => n + classTeacherCost(sk, pos.day), 0);
    lift(u);
    const b = blockers(u, pos);
    if (!b.ok) { place(u, from, from.room); continue; }
    place(u, pos, b.room);
    const after = localCost(u, pos.day) + u.sections.reduce((n, sk) => n + classTeacherCost(sk, from.day), 0);
    const delta = after - (before + beforeDayCost);
    if (delta <= 0 || rand() < Math.exp(-delta / Math.max(0.05, temp))) continue;
    lift(u);
    place(u, from, from.room);
  }

  // ── Result ──
  const displayOf = new Map(input.sections.map(s => [norm(s.cls), s.cls]));
  const lessons: SolverLesson[] = input.locked.map(l => ({ ...l, locked: true }));
  for (const u of units) {
    if (u.day === null) continue;
    for (const p of u.periods) for (const sk of u.sections) {
      const r = u.reqIds.map(id => reqById.get(id)!).find(x => norm(x.cls) === sk) ?? u.req;
      lessons.push({ cls: displayOf.get(sk) ?? r.cls, group: r.group, subject: u.req.subject, weekday: u.day, period: p, teacher: u.teacher, roomId: u.room, combined: u.sections.length > 1 });
    }
  }
  const unplaced = new Map<string, Unplaced>();
  for (const u of units) {
    if (u.day !== null) continue;
    const reason = explain(u);
    const k = u.req.id;
    const e = unplaced.get(k) ?? { requirementId: k, cls: u.req.cls, subject: u.req.subject, group: u.req.group, periods: 0, reason };
    e.periods += u.len;
    unplaced.set(k, e);
  }
  function explain(u: Unit): string {
    const counts = new Map<string, number>();
    for (const pos of shapes[u.id]) {
      const b = blockers(u, pos);
      const why = b.ok ? 'free' : b.hard || 'busy';
      counts.set(why, (counts.get(why) || 0) + 1);
    }
    if (!shapes[u.id].length) return u.len === 2 ? 'No two back-to-back periods without a break in between.' : 'The section has no teaching periods.';
    const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    return ({
      'teacher': 'The teacher is teaching elsewhere at every free period.',
      'teacher off': 'The teacher is off at the periods the section is free.',
      'teacher day cap': 'The teacher would go over their periods-a-day cap.',
      'teacher week cap': 'The teacher would go over their periods-a-week cap.',
      'in a row': 'The teacher would teach too many periods in a row.',
      'per day': 'The subject already meets as often as allowed on every free day.',
      'section': 'The section is full at every period the teacher is free.',
      'room': `Every ${u.req.roomKind ?? 'named'} room is taken at the free periods.`,
      'busy': 'Every free period clashes with another lesson.',
      'free': 'It ran out of time; run again with more time.',
    } as Record<string, string>)[top ?? 'busy'] ?? (top?.startsWith('no ') ? `The school has ${top.replace(' room', '')} room set up (Bells & rooms).` : 'No free period fits.');
  }

  const soft = totalSoft();
  const unplacedPeriods = [...unplaced.values()].reduce((n, x) => n + x.periods, 0);
  return {
    lessons,
    unplaced: [...unplaced.values()],
    score: { total: Math.round((unplacedPeriods * 1000 + soft.classTeacher + soft.spread + soft.teachers) * 10) / 10, soft: { classTeacher: soft.classTeacher, spread: soft.spread, teachers: Math.round(soft.teachers * 10) / 10 } },
    stats: { units: units.length, placed: units.filter(u => u.day !== null).length, iterations, ms: Date.now() - t0, moved },
    warnings,
  };
}
