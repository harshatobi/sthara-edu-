/**
 * How good a timetable is, measured the same way whichever engine built it: what the office would look for by eye.
 * Pure. Used to compare alternatives side by side and to pick between the engines' results.
 */
import type { SolverInput, SolverLesson, SolverResult } from './solver';

const norm = (s: string) => s.toLowerCase().replace(/class|[^a-z0-9]/g, '');
const subj = (s: string) => s.trim().toLowerCase();

export interface Quality {
  /** Periods asked for that have no place. */
  unplaced: number;
  /** Idle periods teachers sit through between two lessons, across the week. */
  teacherGaps: number;
  /** Teachers with at least one such gap. */
  teachersWithGaps: number;
  /** Days the class teacher opens, out of the days they could. */
  classTeacherFirst: { met: number; of: number };
  /** Subjects that meet twice on a day while another day goes without (beyond what their periods force). */
  bunched: number;
  /** Morning / afternoon subjects, never-after pairs and teachers' first / last wishes that weren't met. */
  prefsMissed: number;
  /** Free periods inside a section's day (before its last lesson). */
  studentGaps: number;
  /** The busiest teacher day, in periods. */
  heaviestDay: number;
  /** One number, lower is better: what the comparison sorts by when the same periods are placed. */
  cost: number;
}

export function timetableQuality(input: SolverInput, result: Pick<SolverResult, 'lessons' | 'unplaced'>): Quality {
  const lessons = result.lessons;
  const sectionByKey = new Map(input.sections.map(s => [norm(s.cls), s]));
  const anyTime = new Map<string, [number, number]>();
  for (const s of input.sections) for (const d of s.days) for (const [p, t] of Object.entries(d.times ?? {})) if (!anyTime.has(`${d.weekday}|${p}`)) anyTime.set(`${d.weekday}|${p}`, t);
  const timeOf = (sk: string, day: number, p: number): [number, number] =>
    sectionByKey.get(sk)?.days.find(d => d.weekday === day)?.times?.[p] ?? anyTime.get(`${day}|${p}`) ?? [-100_000 + p * 45, -100_000 + p * 45 + 45];

  // Teachers: the school's distinct period times each day, and which of them each teacher teaches.
  const dayGrid = new Map<number, [number, number][]>();
  for (const s of input.sections) for (const d of s.days) {
    const g = dayGrid.get(d.weekday) ?? [];
    for (const p of d.periods) { const t = timeOf(norm(s.cls), d.weekday, p); if (!g.some(x => x[0] === t[0] && x[1] === t[1])) g.push(t); }
    dayGrid.set(d.weekday, g.sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  }
  const teaching = new Map<string, [number, number][]>();
  for (const l of lessons) {
    if (!l.teacher) continue;
    const k = `${l.teacher}|${l.weekday}`;
    teaching.set(k, [...(teaching.get(k) ?? []), timeOf(norm(l.cls), l.weekday, l.period)]);
  }
  let teacherGaps = 0, heaviestDay = 0;
  const gappy = new Set<string>();
  for (const [k, mine] of teaching) {
    const [who, day] = k.split('|');
    const busy = (dayGrid.get(Number(day)) ?? []).map(([a, b]) => mine.some(x => x[0] < b && a < x[1]));
    const n = busy.filter(Boolean).length;
    heaviestDay = Math.max(heaviestDay, n);
    const gaps = n > 1 ? busy.lastIndexOf(true) - busy.indexOf(true) + 1 - n : 0;
    if (gaps) { teacherGaps += gaps; gappy.add(who); }
  }

  // Sections: who opens the day, and free periods before the last lesson.
  const at = new Map<string, SolverLesson[]>();
  for (const l of lessons) { const k = `${norm(l.cls)}|${l.weekday}|${l.period}`; at.set(k, [...(at.get(k) ?? []), l]); }
  let met = 0, of = 0, studentGaps = 0;
  for (const s of input.sections) {
    const sk = norm(s.cls);
    for (const d of s.days) {
      if (!d.periods.length) continue;
      if (s.classTeacher && lessons.some(l => norm(l.cls) === sk && l.teacher === s.classTeacher)) {
        of++;
        if ((at.get(`${sk}|${d.weekday}|${d.periods[0]}`) ?? []).some(l => l.teacher === s.classTeacher)) met++;
      }
      const occ = d.periods.map(p => at.has(`${sk}|${d.weekday}|${p}`));
      const last = occ.lastIndexOf(true);
      for (let i = 0; i < last; i++) if (!occ[i]) studentGaps++;
    }
  }

  // Requirements: bunching, and the wishes on where a lesson sits.
  const ruleOf = new Map(input.rules.map(r => [r.person, r]));
  let bunched = 0, prefsMissed = 0;
  for (const r of input.requirements) {
    const sk = norm(r.cls);
    const sec = sectionByKey.get(sk);
    if (!sec) continue;
    const mine = lessons.filter(l => norm(l.cls) === sk && subj(l.subject) === subj(r.subject) && (l.group || '').toLowerCase() === (r.group || '').toLowerCase());
    const byDay = new Map<number, number[]>();
    for (const l of mine) byDay.set(l.weekday, [...(byDay.get(l.weekday) ?? []), l.period]);
    // Occurrences a day (a double counts once): two on one day while a teaching day has none is bunching.
    let occurrences = 0, crowded = 0;
    for (const [day, ps] of byDay) {
      const pairs = sec.days.find(d => d.weekday === day)?.pairs ?? [];
      ps.sort((a, b) => a - b);
      let n = 0;
      for (let i = 0; i < ps.length; i++) { n++; if (pairs.some(x => x[0] === ps[i] && x[1] === ps[i + 1])) i++; }
      occurrences += n;
      if (n > 1) crowded++;
    }
    if (crowded && occurrences <= sec.days.length && byDay.size < Math.min(occurrences, sec.days.length)) bunched++;
    for (const l of mine) {
      const periods = sec.days.find(d => d.weekday === l.weekday)?.periods ?? [];
      const i = periods.indexOf(l.period);
      if (r.timePref === 'morning' && i >= Math.ceil(periods.length / 2)) prefsMissed++;
      if (r.timePref === 'afternoon' && i < Math.floor(periods.length / 2)) prefsMissed++;
      if (r.notAfter && i > 0 && (at.get(`${sk}|${l.weekday}|${periods[i - 1]}`) ?? []).some(x => subj(x.subject) === subj(r.notAfter!))) prefsMissed++;
    }
  }
  const seen = new Set<string>();
  for (const l of lessons) {
    const rule = l.teacher ? ruleOf.get(l.teacher) : undefined;
    if (!rule?.avoidFirst && !rule?.avoidLast) continue;
    const k = `${l.teacher}|${l.weekday}|${l.period}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const periods = sectionByKey.get(norm(l.cls))?.days.find(d => d.weekday === l.weekday)?.periods ?? [];
    if (rule.avoidFirst && periods[0] === l.period) prefsMissed++;
    if (rule.avoidLast && periods[periods.length - 1] === l.period) prefsMissed++;
  }

  const unplaced = result.unplaced.reduce((n, u) => n + u.periods, 0);
  const w = { classTeacher: 2, spread: 2, gaps: 2, balance: 2, prefs: 2, ...(input.defaults.weights ?? {}) };
  const m = (k: keyof typeof w) => [0, 0.5, 1, 2][Math.max(0, Math.min(3, Math.round(w[k])))] ?? 1;
  const cost = Math.round(
    unplaced * 1000
    + (input.defaults.classTeacherFirst ? (of - met) * 30 * m('classTeacher') : 0)
    + (input.defaults.spread ? bunched * 18 * m('spread') : 0)
    + teacherGaps * 2 * m('gaps')
    + prefsMissed * 4 * m('prefs')
    + (input.defaults.noStudentGaps ? studentGaps * 20 * m('prefs') : 0));
  return { unplaced, teacherGaps, teachersWithGaps: gappy.size, classTeacherFirst: { met, of }, bunched, prefsMissed, studentGaps, heaviestDay, cost };
}
