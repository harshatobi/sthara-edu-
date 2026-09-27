/**
 * Staff load analytics (leadership and HR only). Pure: from the scheduling rows, each teacher's load rules and the
 * school defaults, for any date range.
 *
 * Per person: the timetable's periods a week against their target, what they actually taught in the range (their
 * own lessons that weren't covered for them), covers they took, duties (roster and dated), invigilation, event duty,
 * leave, and late days when attendance is passed in. Flags: over the target or the weekly cap, well under the target,
 * and far more covers or duties than colleagues. Weekly series for the trend.
 */
import { agenda, datesBetween, minutes, teacherLoad, versionOn, weekStart } from './engine';
import { ruleKey, type LoadRuleRow, type SolverSettingsRow } from './solverInput';
import { slotPerson, type PersonKey, type ScheduleRows } from './types';

export type LoadFlag = 'over' | 'over_cap' | 'under' | 'covers' | 'duties';
export interface PersonLoad {
  key: PersonKey;
  name: string;
  department: string;           // their main subject in the timetable
  target: number;               // periods a week
  targetFromRule: boolean;
  maxPerWeek: number | null;
  timetable: number;            // periods a week in the timetable in force at the end of the range
  taught: number;               // own lessons taught in the range
  covers: number;               // lessons taken as cover
  coveredForThem: number;       // their lessons someone else covered (or that needed cover)
  duties: number;               // roster and other duties
  dutyHours: number;
  invigilation: number;
  eventDuty: number;
  leaveDays: number;
  lateDays: number | null;
  perWeek: number;              // (taught + covers) per week in the range
  weeks: { week: string; periods: number }[];
  flags: LoadFlag[];
}
export interface LoadSummary {
  people: PersonLoad[];
  weeks: number;
  averages: { timetable: number; perWeek: number; covers: number; duties: number };
  counts: Record<LoadFlag, number>;
  departments: { name: string; people: number; timetable: number; target: number; covers: number }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function staffLoad(rows: ScheduleRows, rules: LoadRuleRow[], settings: SolverSettingsRow, range: { from: string; to: string },
  opts: { lateDays?: Map<PersonKey, number> } = {}): LoadSummary {
  const ruleOf = new Map(rules.map(r => [ruleKey(r), r]));
  const version = versionOn(rows.versions.filter(v => v.status === 'published'), range.to);
  const current = version ? rows.slots.filter(s => s.version_id === version.id) : [];
  const ttLoad = teacherLoad(current);

  // Everyone who teaches: teacher accounts, teaching register members, and anyone holding a lesson.
  const names = new Map<PersonKey, string>();
  for (const p of rows.people) if (p.role === 'teacher') names.set(p.id, p.name || 'Teacher');
  for (const m of rows.staff) if (!m.user_id && m.active && m.category === 'teaching') names.set(`s:${m.id}`, m.name);
  for (const s of current) { const k = slotPerson(s); if (k && !names.has(k)) names.set(k, rows.people.find(p => p.id === k)?.name ?? rows.staff.find(m => `s:${m.id}` === k)?.name ?? 'Staff'); }

  const subjectCount = new Map<PersonKey, Map<string, number>>();
  for (const s of current) {
    const k = slotPerson(s);
    if (!k) continue;
    const m = subjectCount.get(k) ?? new Map<string, number>();
    m.set(s.subject, (m.get(s.subject) || 0) + 1);
    subjectCount.set(k, m);
  }

  const days = datesBetween(range.from, range.to);
  const weeks = Math.max(1, days.length / 7);
  const people: PersonLoad[] = [];
  for (const [key, name] of names) {
    const rule = ruleOf.get(key);
    const target = rule?.target_per_week ?? settings.default_target_per_week;
    const p: PersonLoad = {
      key, name,
      department: [...(subjectCount.get(key) ?? new Map())].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'No lessons',
      target, targetFromRule: rule?.target_per_week != null, maxPerWeek: rule?.max_per_week ?? null,
      timetable: ttLoad.get(key) ?? 0, taught: 0, covers: 0, coveredForThem: 0, duties: 0, dutyHours: 0, invigilation: 0, eventDuty: 0, leaveDays: 0,
      lateDays: opts.lateDays ? opts.lateDays.get(key) ?? 0 : null, perWeek: 0, weeks: [], flags: [],
    };
    const byWeek = new Map<string, number>();
    for (const d of agenda({ kind: 'teacher', userId: key }, range.from, range.to, rows)) {
      const wk = weekStart(d.date);
      if (!byWeek.has(wk)) byWeek.set(wk, 0);
      for (const it of d.items) {
        if (it.kind === 'lesson') {
          if (it.coverFor) { p.covers++; byWeek.set(wk, byWeek.get(wk)! + 1); }
          else if (it.covered) p.coveredForThem++;
          else { p.taught++; byWeek.set(wk, byWeek.get(wk)! + 1); }
        } else if (it.kind === 'duty') {
          const hours = Math.max(0, (minutes(it.end) - minutes(it.start)) / 60);
          if (it.dutyKind === 'invigilation') p.invigilation++;
          else if (it.dutyKind === 'event') p.eventDuty++;
          else p.duties++;
          p.dutyHours += hours;
        } else if (it.kind === 'leave') {
          p.leaveDays += it.halfDay || (it.portion && it.portion !== 'full') ? 0.5 : 1;
        }
      }
    }
    p.dutyHours = round1(p.dutyHours);
    p.perWeek = round1((p.taught + p.covers) / weeks);
    p.weeks = [...byWeek].sort((a, b) => a[0].localeCompare(b[0])).map(([week, periods]) => ({ week, periods }));
    people.push(p);
  }

  // Flags against their own target and against colleagues.
  const teaching = people.filter(p => p.timetable > 0);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const meanCovers = mean(teaching.map(p => p.covers));
  const meanDuties = mean(teaching.map(p => p.duties + p.invigilation + p.eventDuty));
  for (const p of people) {
    if (p.timetable > p.target) p.flags.push('over');
    if (p.maxPerWeek !== null && p.perWeek > p.maxPerWeek) p.flags.push('over_cap');
    if (p.target > 0 && p.timetable > 0 && p.timetable < p.target * 0.7) p.flags.push('under');
    if (p.covers >= meanCovers * 1.5 && p.covers >= meanCovers + 2) p.flags.push('covers');
    const d = p.duties + p.invigilation + p.eventDuty;
    if (d >= meanDuties * 1.5 && d >= meanDuties + 2) p.flags.push('duties');
  }
  people.sort((a, b) => b.flags.length - a.flags.length || b.timetable - a.timetable || a.name.localeCompare(b.name));

  const deps = new Map<string, PersonLoad[]>();
  for (const p of teaching) deps.set(p.department, [...(deps.get(p.department) ?? []), p]);
  const counts = { over: 0, over_cap: 0, under: 0, covers: 0, duties: 0 } as Record<LoadFlag, number>;
  for (const p of people) for (const f of p.flags) counts[f]++;
  return {
    people, weeks: round1(weeks),
    averages: { timetable: round1(mean(teaching.map(p => p.timetable))), perWeek: round1(mean(teaching.map(p => p.perWeek))), covers: round1(meanCovers), duties: round1(meanDuties) },
    counts,
    departments: [...deps].map(([name, ps]) => ({
      name, people: ps.length, timetable: round1(mean(ps.map(p => p.timetable))), target: round1(mean(ps.map(p => p.target))), covers: ps.reduce((n, p) => n + p.covers, 0),
    })).sort((a, b) => b.people - a.people || a.name.localeCompare(b.name)),
  };
}
