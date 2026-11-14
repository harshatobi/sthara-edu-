/**
 * What the solver can't possibly satisfy, found by arithmetic before it runs: a section asked for more periods than
 * its week has, a teacher asked for more than their caps allow, a lab the school doesn't have. Pure.
 *
 * `block` means some periods will certainly be left unplaced; `warn` means the result will be weaker than it could be.
 */
import type { SolverInput, SolverRequirement } from './solver';
import type { PersonKey } from './types';

const norm = (s: string) => s.toLowerCase().replace(/class|[^a-z0-9]/g, '');
const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export interface Finding {
  level: 'block' | 'warn';
  /** What it is about, for grouping and for jumping to the row. */
  about: { kind: 'section' | 'teacher' | 'room' | 'sheet'; key: string };
  title: string;
  /** The arithmetic, in a sentence. */
  detail: string;
  /** What to change. */
  fix: string;
  /** Periods that certainly can't be placed because of it (0 for a warning). */
  short: number;
}

export function precheck(input: SolverInput, names: Map<PersonKey, string> = new Map(), roomNames: Map<string, string> = new Map()): Finding[] {
  const out: Finding[] = [];
  const sections = new Map(input.sections.map(s => [norm(s.cls), s]));
  const ruleOf = new Map(input.rules.map(r => [r.person, r]));
  const who = (t: PersonKey) => names.get(t) || 'A teacher';
  const lockedFor = (r: SolverRequirement) => input.locked.filter(l => norm(l.cls) === norm(r.cls) && l.subject.trim().toLowerCase() === r.subject.trim().toLowerCase() && (l.group || '').toLowerCase() === (r.group || '').toLowerCase()).length;

  // ── Sections ──
  const bySection = new Map<string, SolverRequirement[]>();
  for (const r of input.requirements) bySection.set(norm(r.cls), [...(bySection.get(norm(r.cls)) ?? []), r]);
  for (const [sk, reqs] of bySection) {
    const sec = sections.get(sk);
    const cls = reqs[0].cls;
    if (!sec) {
      out.push({ level: 'block', about: { kind: 'section', key: cls }, title: `${cls} has no bell timings`, detail: `Its ${n(reqs.reduce((a, r) => a + r.periods, 0), 'period')} have no week to go into.`, fix: 'Set the bells for its wing in Bells & rooms.', short: reqs.reduce((a, r) => a + r.periods, 0) });
      continue;
    }
    const capacity = sec.days.reduce((a, d) => a + d.periods.length, 0);
    // Split groups share periods: a group's periods count once, at the largest group's size.
    const whole = reqs.filter(r => !r.group).reduce((a, r) => a + r.periods, 0);
    const groups = new Map<string, number>();
    for (const r of reqs) if (r.group) groups.set(r.group.toLowerCase(), (groups.get(r.group.toLowerCase()) ?? 0) + r.periods);
    const needed = whole + Math.max(0, ...groups.values());
    if (needed > capacity) {
      out.push({ level: 'block', about: { kind: 'section', key: cls }, title: `${cls} is asked for more periods than its week has`, detail: `${n(needed, 'period')} asked for, ${capacity} in the week.`, fix: `Take ${n(needed - capacity, 'period')} off its subjects, or add a period to its bells.`, short: needed - capacity });
    }
    for (const r of reqs) {
      const occurrences = r.periods - Math.min(r.doubles, Math.floor(r.periods / 2));
      const room = sec.days.length * r.maxPerDay;
      if (occurrences > room) {
        out.push({ level: 'block', about: { kind: 'section', key: cls }, title: `${cls} ${r.subject} can't fit its days`, detail: `${n(r.periods, 'period')} a week at ${r.maxPerDay} a day over ${n(sec.days.length, 'day')} leaves ${n(occurrences - room, 'lesson')} with no day.`, fix: `Allow ${r.subject} ${r.maxPerDay + 1} times a day, or make some of them doubles.`, short: occurrences - room });
      }
      if (r.doubles > 0 && !sec.days.some(d => d.pairs.length)) {
        out.push({ level: 'block', about: { kind: 'section', key: cls }, title: `${cls} ${r.subject} has doubles but no back-to-back periods`, detail: 'Every period in its bells is followed by a break.', fix: 'Set its doubles to 0, or put two periods together in the bells.', short: r.doubles * 2 });
      }
      if (!r.teacher) out.push({ level: 'warn', about: { kind: 'section', key: cls }, title: `${cls} ${r.subject} has no teacher yet`, detail: 'It will be placed, but nothing stops it landing where the teacher you pick later is busy.', fix: 'Pick the teacher on the sheet.', short: 0 });
    }
    if (sec.classTeacher && input.defaults.classTeacherFirst) {
      const theirs = reqs.filter(r => r.teacher === sec.classTeacher).reduce((a, r) => a + r.periods - Math.min(r.doubles, Math.floor(r.periods / 2)), 0);
      if (theirs && theirs < sec.days.length) out.push({ level: 'warn', about: { kind: 'section', key: cls }, title: `${cls}'s class teacher can't open every day`, detail: `${who(sec.classTeacher)} has ${n(theirs, 'lesson')} a week with the class and the week has ${n(sec.days.length, 'day')}.`, fix: 'Nothing to fix; period 1 goes to someone else on the other days.', short: 0 });
    }
  }

  // ── Combined lessons ──
  const combined = new Map<string, SolverRequirement[]>();
  for (const r of input.requirements) if (r.combinedKey) combined.set(r.combinedKey.toLowerCase(), [...(combined.get(r.combinedKey.toLowerCase()) ?? []), r]);
  for (const rs of combined.values()) {
    const label = `"${rs[0].combinedKey}"`;
    if (rs.length < 2) out.push({ level: 'warn', about: { kind: 'sheet', key: rs[0].cls }, title: `The combined lesson ${label} has only one section`, detail: `${rs[0].cls} ${rs[0].subject} is the only row with that key.`, fix: 'Give the other section the same combined key, or clear it.', short: 0 });
    if (new Set(rs.map(r => r.periods)).size > 1) out.push({ level: 'warn', about: { kind: 'sheet', key: rs[0].cls }, title: `The combined lesson ${label} has different periods in its sections`, detail: rs.map(r => `${r.cls} ${r.periods}`).join(', ') + `. ${rs[0].cls}'s number is used for all.`, fix: 'Make the periods a week the same in each section.', short: 0 });
    if (new Set(rs.map(r => r.teacher)).size > 1) out.push({ level: 'warn', about: { kind: 'sheet', key: rs[0].cls }, title: `The combined lesson ${label} has different teachers`, detail: `${rs[0].cls}'s teacher takes all its sections.`, fix: 'Pick the same teacher in each section.', short: 0 });
  }

  // ── Teachers ──
  const load = new Map<PersonKey, number>();
  const seenCombined = new Set<string>();
  for (const r of input.requirements) {
    if (!r.teacher || !sections.has(norm(r.cls))) continue;
    if (r.combinedKey) { const k = `${r.teacher}|${r.combinedKey.toLowerCase()}`; if (seenCombined.has(k)) continue; seenCombined.add(k); }
    load.set(r.teacher, (load.get(r.teacher) ?? 0) + r.periods);
  }
  // The school's teaching times each day, to count what a teacher's times off leave.
  const grid = new Map<number, Map<string, { p: number; t: [number, number] | null }>>();
  for (const s of input.sections) for (const d of s.days) {
    const g = grid.get(d.weekday) ?? new Map();
    for (const p of d.periods) { const t = d.times?.[p] ?? null; g.set(t ? `${t[0]}-${t[1]}` : `p${p}`, { p, t }); }
    grid.set(d.weekday, g);
  }
  for (const [t, periods] of load) {
    const rule = ruleOf.get(t);
    const perDay = rule?.maxPerDay ?? input.defaults.maxPerDay;
    const free: number[] = [];
    for (const [day, g] of grid) {
      let open = 0;
      for (const { p, t: iv } of g.values()) {
        const off = (rule?.unavailable ?? []).some(u => u.weekday === day && (u.window ? !!iv && u.window[0] < iv[1] && iv[0] < u.window[1] : !u.periods.length || u.periods.includes(p)));
        if (!off) open++;
      }
      if (open) free.push(Math.min(open, perDay));
    }
    free.sort((a, b) => b - a);
    const days = rule?.maxDays ? free.slice(0, rule.maxDays) : free;
    const reach = Math.min(days.reduce((a, b) => a + b, 0), rule?.maxPerWeek ?? Infinity);
    if (periods > reach) {
      const why = rule?.maxPerWeek && rule.maxPerWeek === reach ? `their cap is ${rule.maxPerWeek} a week`
        : `${perDay} a day over ${n(days.length, 'day')} they are in comes to ${reach}`;
      out.push({ level: 'block', about: { kind: 'teacher', key: t }, title: `${who(t)} is asked for more periods than they can teach`, detail: `${n(periods, 'period')} on the sheet; ${why}.`, fix: `Move ${n(periods - reach, 'period')} to another teacher, or raise their caps.`, short: periods - reach });
    }
  }

  // ── Rooms ──
  const kindRooms = (kind: string) => input.rooms.filter(r => r.active && r.kind === kind && !r.homeClass).length;
  const slotsAWeek = Math.max(0, ...input.sections.map(s => s.days.reduce((a, d) => a + d.periods.length, 0)));
  const byKind = new Map<string, number>();
  const byRoom = new Map<string, number>();
  const seenRoom = new Set<string>();
  for (const r of input.requirements) {
    if (!sections.has(norm(r.cls))) continue;
    if (r.combinedKey) { const k = r.combinedKey.toLowerCase(); if (seenRoom.has(k)) continue; seenRoom.add(k); }
    const left = Math.max(0, r.periods - lockedFor(r));
    if (r.roomId) byRoom.set(r.roomId, (byRoom.get(r.roomId) ?? 0) + left);
    else if (r.roomKind) byKind.set(r.roomKind, (byKind.get(r.roomKind) ?? 0) + left);
  }
  for (const [kind, periods] of byKind) {
    const have = kindRooms(kind);
    if (!have) out.push({ level: 'block', about: { kind: 'room', key: kind }, title: `No ${kind} is set up`, detail: `${n(periods, 'period')} on the sheet need one.`, fix: `Add the ${kind} in Bells & rooms, or change those subjects to the home room.`, short: periods });
    else if (periods > have * slotsAWeek) out.push({ level: 'block', about: { kind: 'room', key: kind }, title: `Not enough ${kind} time`, detail: `${n(periods, 'period')} need a ${kind}; ${n(have, kind)} over a ${slotsAWeek}-period week holds ${have * slotsAWeek}.`, fix: `Add a ${kind}, or keep only the practical periods in it.`, short: periods - have * slotsAWeek });
    else if (periods > have * slotsAWeek * 0.85) out.push({ level: 'warn', about: { kind: 'room', key: kind }, title: `The ${kind} is nearly full`, detail: `${n(periods, 'period')} of the ${have * slotsAWeek} it holds a week.`, fix: 'It will work, with little room to move lessons later.', short: 0 });
  }
  for (const [room, periods] of byRoom) {
    if (periods > slotsAWeek) out.push({ level: 'block', about: { kind: 'room', key: room }, title: `${roomNames.get(room) || 'A room'} is asked for more periods than the week has`, detail: `${n(periods, 'period')} named for it; the week has ${slotsAWeek}.`, fix: 'Let some of those subjects use any room of its kind.', short: periods - slotsAWeek });
  }

  return out.sort((a, b) => (a.level === 'block' ? 0 : 1) - (b.level === 'block' ? 0 : 1) || b.short - a.short);
}
