/**
 * Rule-based "Ask" for the Platform Manager: turns a plain question into a
 * filter and sort over the schools' health metrics, with no AI call.
 *
 *   "which schools have fee collection under 50%"
 *   "pilots ending in 30 days"
 *   "lowest adoption" · "top 3 by AI cost" · "schools with students without a parent"
 *
 * It says how it read the question, so an operator can tell when it guessed.
 * Pure (no I/O); the console runs it over data it already has.
 */
import type { Health, SchoolMetrics } from './health';

export interface AskSchool {
  id: string; name: string; plan: string; active: boolean; testSchool: boolean;
  trialDaysLeft: number | null; trialExpired: boolean; contractStudents: number | null;
  health: Health; metrics: SchoolMetrics; usdToInr: number;
}

type Unit = 'score' | 'pct' | 'count' | 'inr' | 'days';
interface Metric {
  key: string; label: string; unit: Unit;
  /** Phrases that name the metric; the longest match wins. */
  words: string[];
  /** Which way is bad, for "worst" and bare "which schools have …" questions. */
  bad: 'low' | 'high';
  get: (s: AskSchool) => number | null;
}

const rate = (a: number | undefined, b: number | undefined) => (b ? (a ?? 0) / b : null);
const pillar = (s: AskSchool, k: string) => s.health.pillars.find(p => p.key === k)?.score ?? null;

export const METRICS: Metric[] = [
  { key: 'health', label: 'Health score', unit: 'score', bad: 'low', words: ['health', 'health score', 'overall', 'score'], get: s => s.health.score },
  { key: 'adoption', label: 'Adoption score', unit: 'score', bad: 'low', words: ['adoption', 'usage', 'engagement'], get: s => pillar(s, 'adoption') },
  { key: 'operations', label: 'Operations score', unit: 'score', bad: 'low', words: ['operations', 'operational'], get: s => pillar(s, 'operations') },
  { key: 'data', label: 'Data quality score', unit: 'score', bad: 'low', words: ['data quality', 'data'], get: s => pillar(s, 'data') },
  { key: 'commercial', label: 'Commercial score', unit: 'score', bad: 'low', words: ['commercial', 'renewal risk', 'renewal'], get: s => pillar(s, 'commercial') },
  { key: 'teacherActive', label: 'Teachers active this week', unit: 'pct', bad: 'low', words: ['teacher activity', 'teachers active', 'active teachers', 'teacher adoption', 'teachers using', 'inactive teachers', 'teachers inactive', 'teachers'], get: s => rate(s.metrics.roles.teacher?.active7, s.metrics.roles.teacher?.total) },
  { key: 'studentActive', label: 'Students active this week', unit: 'pct', bad: 'low', words: ['student activity', 'students active', 'active students', 'student adoption', 'students using', 'inactive students', 'students inactive'], get: s => rate(s.metrics.roles.student?.active7, s.metrics.roles.student?.total) },
  { key: 'parentSignIn', label: 'Parents signed in this month', unit: 'pct', bad: 'low', words: ['parent sign in', 'parents signed in', 'parent logins', 'parent adoption', 'parents using', 'parent activity', 'parents'], get: s => rate(s.metrics.roles.parent?.signedIn30, s.metrics.roles.parent?.total) },
  { key: 'neverSignedIn', label: 'People who never signed in', unit: 'count', bad: 'high', words: ['never signed in', 'never logged in', 'not signed in', 'never logged'], get: s => Object.values(s.metrics.roles).reduce((n, r) => n + (r?.never ?? 0), 0) },
  { key: 'feeCollection', label: 'Fee collection', unit: 'pct', bad: 'low', words: ['fee collection', 'fees collected', 'collection rate', 'collection', 'fees', 'fee'], get: s => rate(s.metrics.ops.feeCollected, s.metrics.ops.feeDue) },
  { key: 'feeOutstanding', label: 'Fees outstanding', unit: 'inr', bad: 'high', words: ['outstanding', 'fees due', 'dues', 'unpaid', 'arrears'], get: s => s.metrics.ops.feeDue ? Math.max(0, s.metrics.ops.feeDue - s.metrics.ops.feeCollected) : null },
  { key: 'attendance', label: 'Attendance days marked (14 days)', unit: 'count', bad: 'low', words: ['attendance'], get: s => (s.metrics.roles.student?.total ? s.metrics.ops.attendanceDays14 : null) },
  { key: 'gradingBacklog', label: 'Submissions waiting over a week', unit: 'count', bad: 'high', words: ['grading backlog', 'backlog', 'ungraded', 'grading', 'marking'], get: s => s.metrics.ops.gradingBacklog },
  { key: 'noParent', label: 'Students with no verified parent', unit: 'count', bad: 'high', words: ['without a parent', 'without parent', 'no parent', 'no verified parent', 'unlinked students', 'missing parents', 'unverified parents', 'guardian'], get: s => s.metrics.data.studentsNoParent },
  { key: 'students', label: 'Students', unit: 'count', bad: 'low', words: ['students', 'student count', 'size', 'biggest', 'largest', 'smallest'], get: s => s.metrics.roles.student?.total ?? 0 },
  { key: 'aiCost', label: 'AI cost, last 30 days', unit: 'inr', bad: 'high', words: ['ai cost', 'ai spend', 'ai usage', 'gemini', 'cost', 'spend'], get: s => s.metrics.ops.aiCostUsd30 * s.usdToInr },
  { key: 'aiPerStudent', label: 'AI cost per student, 30 days', unit: 'inr', bad: 'high', words: ['ai cost per student', 'cost per student', 'ai per student'], get: s => (s.metrics.roles.student?.total ? (s.metrics.ops.aiCostUsd30 * s.usdToInr) / s.metrics.roles.student.total : null) },
  { key: 'pilotDays', label: 'Pilot days left', unit: 'days', bad: 'low', words: ['pilot ending', 'pilots ending', 'ending pilot', 'pilot days', 'days left', 'pilot', 'pilots', 'expiring', 'trial'], get: s => (s.plan === 'pilot' ? (s.trialExpired ? 0 : s.trialDaysLeft) : null) },
  { key: 'seatUse', label: 'Seats in use', unit: 'pct', bad: 'low', words: ['seat use', 'seats used', 'seats', 'seat', 'contract'], get: s => (s.contractStudents ? (s.metrics.roles.student?.total ?? 0) / s.contractStudents : null) },
  { key: 'errors', label: 'App errors this week', unit: 'count', bad: 'high', words: ['errors', 'error', 'bugs', 'crashes'], get: s => s.metrics.ops.errors7 },
];

export const ASK_EXAMPLES = [
  'Which schools have fee collection under 50%?',
  'Pilots ending in 30 days',
  'Lowest adoption',
  'Schools with students without a parent',
  'Top 3 by AI cost',
  'Teachers active under 60%',
];

export interface AskAnswer {
  ok: boolean;
  /** How the question was read, in plain words. */
  reading: string;
  metric?: { key: string; label: string; unit: Unit };
  rows: { id: string; name: string; value: number | null; display: string }[];
  /** When nothing was understood: what can be asked. */
  help?: string[];
}

export function formatValue(unit: Unit, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  if (unit === 'pct') return `${Math.round(v * 100)}%`;
  if (unit === 'inr') return `₹${Math.round(v).toLocaleString('en-IN')}`;
  if (unit === 'days') return `${Math.round(v)} days`;
  return Math.round(v).toLocaleString('en-IN');
}

const norm = (s: string) => ` ${s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9%.<>=₹ ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

function findMetric(q: string): Metric | null {
  let best: { m: Metric; len: number } | null = null;
  for (const m of METRICS) {
    for (const w of m.words) {
      if (q.includes(` ${w} `) || q.includes(` ${w}s `)) {
        if (!best || w.length > best.len) best = { m, len: w.length };
      }
    }
  }
  return best?.m ?? null;
}

type Cmp = { op: 'lt' | 'gt' | 'lte' | 'gte' | 'eq'; value: number } | null;
function findComparison(q: string, unit: Unit): Cmp {
  const num = String.raw`₹?\s?(\d[\d,]*(?:\.\d+)?)\s*(%|percent|k|l|lakh|lakhs|cr|crore)?`;
  const pats: [RegExp, NonNullable<Cmp>['op']][] = [
    [new RegExp(String.raw` (?:under|below|less than|lower than|fewer than|<) ${num}`), 'lt'],
    [new RegExp(String.raw` (?:over|above|more than|greater than|higher than|>) ${num}`), 'gt'],
    [new RegExp(String.raw` (?:at least|minimum|min|>=) ${num}`), 'gte'],
    [new RegExp(String.raw` (?:at most|maximum|max|<=|within|in the next|in|next) ${num}`), 'lte'],
    [new RegExp(String.raw` (?:exactly|equal to|=) ${num}`), 'eq'],
  ];
  for (const [re, op] of pats) {
    const m = q.match(re);
    if (!m) continue;
    let v = Number(m[1].replace(/,/g, ''));
    const suffix = m[2];
    if (suffix === 'k') v *= 1e3;
    else if (suffix === 'l' || suffix === 'lakh' || suffix === 'lakhs') v *= 1e5;
    else if (suffix === 'cr' || suffix === 'crore') v *= 1e7;
    // Percent metrics compare as fractions: "under 50" and "under 50%" both mean 0.5.
    if (unit === 'pct') v = v > 1 || suffix === '%' || suffix === 'percent' ? v / 100 : v;
    return { op, value: v };
  }
  return null;
}

const OP_WORD = { lt: 'under', gt: 'over', lte: 'at most', gte: 'at least', eq: 'exactly' } as const;

export function ask(question: string, schools: AskSchool[], opts: { includeTest?: boolean } = {}): AskAnswer {
  const q = norm(question);
  const metric = findMetric(q);
  const pool = schools.filter(s => opts.includeTest || !s.testSchool || / test /.test(q));
  if (!metric) {
    return { ok: false, reading: 'I couldn’t tell which measure you mean.', rows: [], help: ASK_EXAMPLES };
  }
  const cmp = findComparison(q, metric.unit);
  const top = q.match(/ (?:top|bottom|first|worst|best|lowest|highest) (\d{1,2}) /) ?? q.match(/ (\d{1,2}) (?:schools|worst|best|lowest|highest) /);
  const limit = top ? Math.min(50, Number(top[1])) : null;
  const wantsHigh = / (?:highest|most|top|best|biggest|largest|greatest|max) /.test(q);
  const wantsLow = / (?:lowest|least|bottom|worst|smallest|fewest|min) /.test(q);
  // "worst" means the bad end of this metric; "top"/"best" the good end, unless the metric is a raw amount.
  const badHigh = metric.bad === 'high';
  let dir: 'asc' | 'desc' = metric.bad === 'low' ? 'asc' : 'desc';
  if (/ worst /.test(q)) dir = badHigh ? 'desc' : 'asc';
  else if (/ best /.test(q)) dir = badHigh ? 'asc' : 'desc';
  else if (wantsHigh) dir = 'desc';
  else if (wantsLow) dir = 'asc';

  // Plan filter: "pilot schools", "shikhara schools".
  const plan = ['pilot', 'aadhara', 'sthamba', 'shikhara', 'mandala'].find(p => q.includes(` ${p} `) && metric.key !== 'pilotDays');
  // A school named in the question narrows to that school.
  const named = pool.filter(s => s.name.length >= 4 && q.includes(norm(s.name)));

  let rows = (named.length ? named : pool)
    .filter(s => !plan || s.plan === plan)
    .map(s => ({ s, v: metric.get(s) }))
    .filter(r => r.v !== null);

  // Count metrics asked as "with any / with no-parent students" mean > 0.
  let implied: Cmp = cmp;
  if (!implied && metric.unit === 'count' && metric.bad === 'high' && !wantsHigh && !wantsLow && !limit && !named.length) implied = { op: 'gt', value: 0 };
  if (!implied && metric.key === 'pilotDays' && / (?:ending|expiring|ends|expire) /.test(q)) implied = { op: 'lte', value: 30 };
  if (implied) {
    const c = implied;
    rows = rows.filter(r => {
      const v = r.v!;
      return c.op === 'lt' ? v < c.value : c.op === 'gt' ? v > c.value : c.op === 'lte' ? v <= c.value : c.op === 'gte' ? v >= c.value : Math.abs(v - c.value) < 1e-9;
    });
  }
  rows.sort((a, b) => (dir === 'asc' ? a.v! - b.v! : b.v! - a.v!));
  if (limit) rows = rows.slice(0, limit);

  const bits = [`Schools${plan ? ` on ${plan[0].toUpperCase()}${plan.slice(1)}` : ''}${named.length ? ` named ${named.map(n => n.name).join(', ')}` : ''}`];
  bits.push(`by ${metric.label.toLowerCase()}`);
  if (implied) bits.push(`${OP_WORD[implied.op]} ${formatValue(metric.unit, implied.value)}`);
  bits.push(dir === 'asc' ? 'lowest first' : 'highest first');
  if (limit) bits.push(`top ${limit}`);
  return {
    ok: true,
    reading: bits.join(', '),
    metric: { key: metric.key, label: metric.label, unit: metric.unit },
    rows: rows.map(r => ({ id: r.s.id, name: r.s.name, value: r.v, display: formatValue(metric.unit, r.v) })),
  };
}
