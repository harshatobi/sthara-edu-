/**
 * Exams and report cards: the scheme a school assesses by, how marks become a term result and a final result,
 * grades, best-of-N, pass and compartment, and the Sthara CBSE presets a school starts from. Pure, no I/O.
 *
 * A scheme has terms; each term has its own report card. A term's result per subject is built from components
 * (Periodic tests 10, Half-yearly exam 80, ...), each a weight and the assessments it draws on by code, combined by
 * sum, average or best-N. An assessment from an earlier term can count again later (CBSE's "best two of three
 * periodic tests" in the annual result). A component with weight 0 is shown on the card but not counted.
 * The final result weights the terms (a term with weight 0 is a progress report only).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type MarkCode = 'AB' | 'ML' | 'EX';
export const MARK_CODES: Record<MarkCode, string> = { AB: 'Absent', ML: 'Medical', EX: 'Exempt' };

export interface GradeBand { min: number; grade: string; point?: number; label?: string }
export type CombineRule = 'sum' | 'avg' | 'best';
export interface Component { key: string; name: string; weight: number; codes: string[]; rule: CombineRule; best?: number }
export interface SubjectOverride { max?: number; skip?: boolean }

export interface Term {
  id: string; name: string; seq: number; startsOn: string; endsOn: string; weight: number;
  components: Component[];
  /** subject key -> component key -> weight for that subject (theory 70 / practical 30). */
  subjectWeights: Record<string, Record<string, number>>;
}

export type AssessmentKind = 'written' | 'internal' | 'practical' | 'project' | 'oral';
export interface Assessment {
  id: string; termId: string; code: string; name: string; kind: AssessmentKind; maxMarks: number; seq: number;
  /** Per-subject max marks or "not assessed"; the key "*" is the default for every subject not listed. */
  subjects: Record<string, SubjectOverride>;
  heldFrom: string | null; heldTo: string | null;
}

export interface CoArea { key: string; name: string }
export interface Rules {
  passPct: number;
  /** Decide pass / compartment / fail on the last term's card. */
  result: 'pass_fail' | 'none';
  /** Count only the best N subjects (CBSE best five); null counts every subject. */
  bestOf: number | null;
  /** Subjects always counted and never replaced (the languages in Class 10, English in Class 12). */
  mandatory: string[];
  /** Components that must reach the pass mark on their own (theory and practical in Class 12). */
  passEach: string[];
  /** Up to this many failed subjects is a compartment, more is a fail. */
  compartmentMax: number;
  /** ML (medical): leave the assessment out and rescale ('scale'), or count it as zero. */
  medical: 'scale' | 'zero';
  /** Print marks (otherwise grades only, as for the foundational years). */
  showMarks: boolean;
  /** Ranks on the report card. Off unless the school turns it on (CBSE discourages ranking). */
  showRank: boolean;
  showAttendance: boolean;
  showTml: boolean;
  coScholastic: CoArea[];
  coGrades: string[];
}

export interface Scheme {
  id: string; session: string; name: string; grades: number[]; preset: PresetKey | null;
  grading: GradeBand[]; rules: Rules; status: 'active' | 'archived';
}

export interface Mark { marks: number | null; code: MarkCode | null }
/** A student's marks in one subject: assessment code -> mark and the sheet's maximum. */
export type SubjectMarks = Map<string, Mark & { max: number }>;

// ── Rules and grading ─────────────────────────────────────────────────────────

export const DEFAULT_RULES: Rules = {
  passPct: 33, result: 'none', bestOf: null, mandatory: [], passEach: [], compartmentMax: 2, medical: 'scale',
  showMarks: true, showRank: false, showAttendance: true, showTml: true, coScholastic: [], coGrades: ['A', 'B', 'C'],
};

export function toRules(raw: unknown): Rules {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Rules>;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    passPct: num(r.passPct, 0, 100) ?? DEFAULT_RULES.passPct,
    result: r.result === 'pass_fail' ? 'pass_fail' : 'none',
    bestOf: r.bestOf === null || r.bestOf === undefined ? null : (num(r.bestOf, 1, 15) ?? null),
    mandatory: strs(r.mandatory),
    passEach: strs(r.passEach),
    compartmentMax: num(r.compartmentMax, 0, 5) ?? DEFAULT_RULES.compartmentMax,
    medical: r.medical === 'zero' ? 'zero' : 'scale',
    showMarks: r.showMarks !== false,
    showRank: r.showRank === true,
    showAttendance: r.showAttendance !== false,
    showTml: r.showTml !== false,
    coScholastic: (Array.isArray(r.coScholastic) ? r.coScholastic : [])
      .filter((a: any) => a && typeof a.key === 'string' && typeof a.name === 'string').map((a: any) => ({ key: a.key, name: a.name })),
    coGrades: strs(r.coGrades).length ? strs(r.coGrades) : DEFAULT_RULES.coGrades,
  };
}

function num(v: unknown, lo: number, hi: number): number | null {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}

/** CBSE eight-point scale. */
export const CBSE_EIGHT_POINT: GradeBand[] = [
  { min: 91, grade: 'A1', point: 10, label: 'Outstanding' }, { min: 81, grade: 'A2', point: 9, label: 'Excellent' },
  { min: 71, grade: 'B1', point: 8, label: 'Very good' }, { min: 61, grade: 'B2', point: 7, label: 'Good' },
  { min: 51, grade: 'C1', point: 6, label: 'Fair' }, { min: 41, grade: 'C2', point: 5, label: 'Satisfactory' },
  { min: 33, grade: 'D', point: 4, label: 'Pass' }, { min: 0, grade: 'E', label: 'Needs improvement' },
];
/** Descriptive scale for the foundational years. */
export const FOUNDATIONAL_SCALE: GradeBand[] = [
  { min: 91, grade: 'A+', label: 'Outstanding' }, { min: 75, grade: 'A', label: 'Excellent' }, { min: 56, grade: 'B', label: 'Very good' },
  { min: 35, grade: 'C', label: 'Good' }, { min: 0, grade: 'D', label: 'Needs support' },
];

export function toGrading(raw: unknown): GradeBand[] {
  const bands = (Array.isArray(raw) ? raw : [])
    .map((b: any) => ({ min: Number(b?.min), grade: String(b?.grade ?? '').trim().slice(0, 6), point: b?.point === undefined || b?.point === null || b?.point === '' ? undefined : Number(b.point), label: typeof b?.label === 'string' ? b.label.slice(0, 40) : undefined }))
    .filter(b => Number.isFinite(b.min) && b.min >= 0 && b.min <= 100 && b.grade);
  return bands.sort((a, b) => b.min - a.min);
}

/** Problems with a grading scale, or null. */
export function gradingProblem(bands: GradeBand[]): string | null {
  if (!bands.length) return 'Add at least one grade.';
  if (bands[bands.length - 1].min !== 0) return 'The lowest grade must start at 0.';
  if (new Set(bands.map(b => b.min)).size !== bands.length) return 'Two grades start at the same mark.';
  if (new Set(bands.map(b => b.grade)).size !== bands.length) return 'Two grades have the same name.';
  return null;
}

/** The grade for a percentage (rounded to a whole number, as marks are graded). */
export function gradeFor(pct: number | null, bands: GradeBand[]): GradeBand | null {
  if (pct === null) return null;
  const p = Math.round(pct);
  return bands.find(b => p >= b.min) ?? bands[bands.length - 1] ?? null;
}

// ── Assessments per subject ───────────────────────────────────────────────────

/** Is this assessment taken in this subject, and out of how many marks. */
export function assessmentFor(a: Pick<Assessment, 'maxMarks' | 'subjects'>, subjectKey: string): { max: number } | null {
  const o = a.subjects[subjectKey] ?? a.subjects['*'] ?? {};
  if (o.skip) return null;
  return { max: o.max && o.max > 0 ? o.max : a.maxMarks };
}

export function componentWeight(term: Pick<Term, 'subjectWeights'>, c: Component, subjectKey: string): number {
  const w = term.subjectWeights[subjectKey]?.[c.key];
  return typeof w === 'number' && w >= 0 ? w : c.weight;
}

// ── Results ──────────────────────────────────────────────────────────────────

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ComponentResult {
  key: string; name: string; weight: number;
  /** Marks out of the weight, or null when every assessment in it was left out (exempt / medical). */
  score: number | null;
  pct: number | null;
  /** The assessments behind it, as entered. */
  parts: { code: string; name: string; max: number; marks: number | null; code2: MarkCode | null; used: boolean }[];
}
export interface SubjectTermResult {
  components: ComponentResult[];
  /** Counted total, scaled to the term's full weight when something was left out. */
  total: number | null; outOf: number; pct: number | null; grade: string | null; point: number | null;
  /** Assessment codes with no mark yet: the result is not final. */
  missing: string[];
  /** Every counted assessment was left out (medical or exempt): no result for this subject this term. */
  excused: boolean;
}

/** One subject's result for one term. */
export function subjectTerm(term: Term, assessments: Map<string, Assessment>, subjectKey: string, marks: SubjectMarks, rules: Pick<Rules, 'medical'>, grading: GradeBand[]): SubjectTermResult {
  const missing: string[] = [];
  const components: ComponentResult[] = [];
  for (const c of term.components) {
    const weight = componentWeight(term, c, subjectKey);
    const parts: ComponentResult['parts'] = [];
    const fractions: number[] = [];
    let sumMarks = 0, sumMax = 0;
    for (const code of c.codes) {
      const a = assessments.get(code);
      if (!a) continue;
      const applies = assessmentFor(a, subjectKey);
      if (!applies) continue;
      const m = marks.get(code);
      const max = m?.max ?? applies.max;
      const part = { code, name: a.name, max, marks: m?.marks ?? null, code2: m?.code ?? null, used: false };
      parts.push(part);
      if (!m || (m.marks === null && !m.code)) { missing.push(code); continue; }
      if (m.code === 'EX' || (m.code === 'ML' && rules.medical === 'scale')) continue;
      const got = m.code ? 0 : Math.min(m.marks ?? 0, max);
      part.used = true;
      fractions.push(got / max);
      sumMarks += got; sumMax += max;
    }
    let frac: number | null = null;
    if (fractions.length) {
      if (c.rule === 'sum') frac = sumMarks / sumMax;
      else if (c.rule === 'avg') frac = fractions.reduce((n, f) => n + f, 0) / fractions.length;
      else {
        const n = Math.max(1, Math.min(c.best ?? 1, fractions.length));
        const top = [...fractions].sort((x, y) => y - x).slice(0, n);
        frac = top.reduce((s, f) => s + f, 0) / n;
        // Only the best ones count: mark the others as not used.
        const kept = new Set<number>();
        const order = parts.map((p, i) => ({ p, i, f: p.used ? (p.code2 ? 0 : Math.min(p.marks ?? 0, p.max)) / p.max : -1 })).filter(x => x.p.used).sort((x, y) => y.f - x.f).slice(0, n);
        order.forEach(x => kept.add(x.i));
        parts.forEach((p, i) => { if (p.used && !kept.has(i)) p.used = false; });
      }
    }
    if (parts.length === 0) continue; // nothing in this component applies to the subject
    components.push({ key: c.key, name: c.name, weight, score: frac === null ? null : round2(frac * weight), pct: frac === null ? null : round2(frac * 100), parts });
  }
  const counted = components.filter(c => c.weight > 0);
  const outOf = counted.reduce((n, c) => n + c.weight, 0);
  const avail = counted.filter(c => c.score !== null);
  const availW = avail.reduce((n, c) => n + c.weight, 0);
  const raw = avail.reduce((n, c) => n + (c.score ?? 0), 0);
  const pct = missing.length || !availW ? null : round2((raw / availW) * 100);
  const total = pct === null ? null : round2((pct / 100) * outOf);
  const g = gradeFor(pct, grading);
  const excused = !missing.length && outOf > 0 && !availW;
  return { components, total, outOf, pct, grade: g?.grade ?? null, point: g?.point ?? null, missing: [...new Set(missing)], excused };
}

export interface SubjectInfo { key: string; name: string }
export interface SubjectResult {
  key: string; name: string;
  terms: Record<string, SubjectTermResult>;
  /** Weighted across the terms so far that count (null until every counted term is complete). */
  final: { pct: number; grade: string | null; point: number | null } | null;
  passed: boolean | null;
  /** Left out of every counted term (medical or exempt): no result, not counted, neither passed nor failed. */
  excused: boolean;
}
export type ResultStatus = 'pass' | 'compartment' | 'fail';
export interface StudentResult {
  subjects: SubjectResult[];
  /** Mean of the counted subjects (best N when the scheme says so). */
  aggregate: { pct: number; counted: string[] } | null;
  result: ResultStatus | null;
  /** Subjects the student must clear (compartment or fail). */
  toClear: string[];
  complete: boolean;
}

/**
 * A student's results for every term up to `uptoSeq` (the card being issued), and the final result when that is
 * the scheme's last term.
 */
export function studentResult(scheme: Pick<Scheme, 'grading' | 'rules'>, terms: Term[], assessments: Assessment[], subjects: SubjectInfo[],
  marksBySubject: Map<string, SubjectMarks>, uptoSeq: number): StudentResult {
  const byCode = new Map(assessments.map(a => [a.code, a]));
  const sorted = [...terms].sort((a, b) => a.seq - b.seq);
  const upto = sorted.filter(t => t.seq <= uptoSeq);
  const isLast = sorted.length > 0 && uptoSeq >= sorted[sorted.length - 1].seq;
  const rows: SubjectResult[] = subjects.map(s => {
    const m = marksBySubject.get(s.key) ?? new Map();
    const res: Record<string, SubjectTermResult> = {};
    for (const t of upto) res[t.id] = subjectTerm(t, byCode, s.key, m, scheme.rules, scheme.grading);
    const weighted = upto.filter(t => t.weight > 0);
    // A term the subject was excused from (medical / exempt throughout) drops out and the others are reweighted.
    const scored = weighted.filter(t => !res[t.id].excused);
    const excused = weighted.length > 0 && scored.length === 0;
    let final: SubjectResult['final'] = null;
    if (scored.length && scored.every(t => res[t.id].pct !== null)) {
      const w = scored.reduce((n, t) => n + t.weight, 0);
      const pct = round2(scored.reduce((n, t) => n + t.weight * (res[t.id].pct ?? 0), 0) / w);
      const g = gradeFor(pct, scheme.grading);
      final = { pct, grade: g?.grade ?? null, point: g?.point ?? null };
    }
    let passed: boolean | null = null;
    if (final) {
      const lastRes = res[upto[upto.length - 1].id];
      passed = final.pct >= scheme.rules.passPct
        && scheme.rules.passEach.every(k => { const c = lastRes.components.find(x => x.key === k); return !c || c.weight === 0 || c.pct === null || c.pct >= scheme.rules.passPct; });
    }
    return { key: s.key, name: s.name, terms: res, final, passed, excused };
  });

  const complete = rows.every(r => Object.values(r.terms).every(t => !t.missing.length));
  const withFinal = rows.filter(r => r.final);
  let aggregate: StudentResult['aggregate'] = null;
  if (withFinal.length && rows.every(r => r.final || r.excused)) {
    const counted = countedSubjects(rows, scheme.rules);
    aggregate = { pct: round2(counted.reduce((n, r) => n + r.final!.pct, 0) / counted.length), counted: counted.map(r => r.key) };
  }

  let result: ResultStatus | null = null, toClear: string[] = [];
  if (isLast && scheme.rules.result === 'pass_fail' && aggregate) {
    toClear = mustClear(withFinal, scheme.rules);
    result = toClear.length === 0 ? 'pass' : toClear.length <= scheme.rules.compartmentMax ? 'compartment' : 'fail';
  }
  return { subjects: rows, aggregate, result, toClear, complete };
}

/** The subjects that count: all, or the mandatory ones plus the best of the rest up to N. */
export function countedSubjects<T extends { key: string; final: { pct: number } | null }>(rows: T[], rules: Pick<Rules, 'bestOf' | 'mandatory'>): T[] {
  const graded = rows.filter(r => r.final);
  if (!rules.bestOf || graded.length <= rules.bestOf) return graded;
  const must = graded.filter(r => rules.mandatory.includes(r.key));
  const rest = graded.filter(r => !rules.mandatory.includes(r.key)).sort((a, b) => b.final!.pct - a.final!.pct);
  return [...must, ...rest].slice(0, Math.max(rules.bestOf, must.length));
}

/**
 * Failed subjects the student still has to clear. With best-of-N, a failed subject that isn't mandatory is
 * covered by an extra subject passed (CBSE: the additional subject replaces a failed one).
 */
export function mustClear(rows: { key: string; passed: boolean | null }[], rules: Pick<Rules, 'bestOf' | 'mandatory'>): string[] {
  const failed = rows.filter(r => r.passed === false);
  if (!rules.bestOf) return failed.map(r => r.key);
  const spare = Math.max(0, rows.length - rules.bestOf);
  const mandatoryFails = failed.filter(r => rules.mandatory.includes(r.key));
  const others = failed.filter(r => !rules.mandatory.includes(r.key));
  return [...mandatoryFails, ...others.slice(spare)].map(r => r.key);
}

/** Competition ranking (1, 2, 2, 4) by a score, highest first; null scores are unranked. */
export function rankBy<T>(items: T[], score: (x: T) => number | null): Map<T, number> {
  const scored = items.map(x => ({ x, s: score(x) })).filter((v): v is { x: T; s: number } => v.s !== null).sort((a, b) => b.s - a.s);
  const out = new Map<T, number>();
  scored.forEach((v, i) => out.set(v.x, i > 0 && v.s === scored[i - 1].s ? out.get(scored[i - 1].x)! : i + 1));
  return out;
}

// ── Validation ────────────────────────────────────────────────────────────────

export const CODE_RE = /^[A-Z][A-Z0-9]{0,11}$/;

/** Problems with a term's components against the scheme's assessments, or null. */
export function termProblem(t: Pick<Term, 'name' | 'components' | 'weight'>, codes: Set<string>): string | null {
  if (!t.components.length) return `${t.name}: add at least one component.`;
  const keys = new Set<string>();
  for (const c of t.components) {
    if (!c.name.trim()) return `${t.name}: every component needs a name.`;
    if (keys.has(c.key)) return `${t.name}: two components share the key ${c.key}.`;
    keys.add(c.key);
    if (!(c.weight >= 0 && c.weight <= 1000)) return `${t.name}: ${c.name} needs a weight from 0 to 1000.`;
    if (!c.codes.length) return `${t.name}: ${c.name} draws on no assessment.`;
    const unknown = c.codes.find(x => !codes.has(x));
    if (unknown) return `${t.name}: ${c.name} uses ${unknown}, which isn't an assessment in this scheme.`;
    if (c.rule === 'best' && !(c.best && c.best >= 1 && c.best <= c.codes.length)) return `${t.name}: ${c.name} counts the best of how many?`;
  }
  if (!t.components.some(c => c.weight > 0)) return `${t.name}: at least one component must count (weight above 0).`;
  return null;
}

// ── Presets ───────────────────────────────────────────────────────────────────

export type PresetKey = 'foundational' | 'primary' | 'middle' | 'secondary' | 'senior';
export const PRESETS: Record<PresetKey, { label: string; grades: number[]; summary: string }> = {
  foundational: { label: 'Foundational (Classes 1-2)', grades: [1, 2], summary: 'Two terms of oral, activity and written assessment. Grades only, no marks on the card.' },
  primary: { label: 'Primary (Classes 3-5)', grades: [3, 4, 5], summary: 'Two terms: periodic test 10, notebook 5, subject enrichment 5, term exam 80. The year is half of each term.' },
  middle: { label: 'Middle (Classes 6-8)', grades: [6, 7, 8], summary: 'The CBSE two-term structure: periodic test 10, notebook 5, subject enrichment 5, half-yearly or annual exam 80.' },
  secondary: { label: 'Secondary (Classes 9-10)', grades: [9, 10], summary: 'Half-yearly progress card, then the annual result: internal assessment 20 (best two of three periodic tests, multiple assessment, portfolio, subject enrichment) and the annual exam 80. Best five subjects, the additional subject can replace a failed one.' },
  senior: { label: 'Senior secondary (Classes 11-12)', grades: [11, 12], summary: 'Theory 70 and practical 30 in practical subjects, 80 and 20 in the rest; unit tests shown. Theory and practical must each be passed. Best five subjects with English always counted.' },
};

export function presetFor(grade: number): PresetKey {
  return grade <= 2 ? 'foundational' : grade <= 5 ? 'primary' : grade <= 8 ? 'middle' : grade <= 10 ? 'secondary' : 'senior';
}

const LANGUAGE = /english|hindi|sanskrit|telugu|tamil|kannada|malayalam|marathi|bengali|gujarati|punjabi|urdu|odia|assamese|french|german|spanish|japanese|language/i;
const SKILL_9_10 = /artificial-intelligence|information-technology|computer-applications|^skill|retail|tourism|beauty|agriculture|food|banking|marketing|health-care|apparel|multi-media|multimedia|physical-activity|electronics|data-science|design-thinking|coding/;
const PRACTICAL_11_12 = /physics|chemistry|biology|computer-science|informatics-practices|physical-education|geography|psychology|home-science|biotechnology|painting|graphics|sculpture|music|dance|engineering-graphics|fashion|nutrition|agriculture|web-application|artificial-intelligence|information-technology/;

export interface PresetAssessment { code: string; name: string; kind: AssessmentKind; maxMarks: number; termSeq: number; subjects: Record<string, SubjectOverride> }
export interface PresetTerm { seq: number; name: string; startsOn: string; endsOn: string; weight: number; components: Component[]; subjectWeights: Record<string, Record<string, number>> }
export interface PresetScheme { name: string; grades: number[]; preset: PresetKey; grading: GradeBand[]; rules: Rules; terms: PresetTerm[]; assessments: PresetAssessment[] }

const comp = (key: string, name: string, weight: number, codes: string[], rule: CombineRule = 'sum', best?: number): Component => ({ key, name, weight, codes, rule, ...(best ? { best } : {}) });
const asmt = (code: string, name: string, kind: AssessmentKind, maxMarks: number, termSeq: number, subjects: Record<string, SubjectOverride> = {}): PresetAssessment => ({ code, name, kind, maxMarks, termSeq, subjects });

const MIDDLE_CO: CoArea[] = [
  { key: 'work_education', name: 'Work education' }, { key: 'art_education', name: 'Art education' },
  { key: 'health_pe', name: 'Health and physical education' }, { key: 'discipline', name: 'Discipline' },
];

/**
 * A Sthara CBSE preset for a session, shaped to the subjects the school's classes actually take (which subjects
 * have practicals, which are languages, which are skill subjects).
 */
export function presetScheme(key: PresetKey, session: string, subjectKeys: string[], grades: number[] = PRESETS[key].grades): PresetScheme {
  const y = Number(session.slice(0, 4));
  const t1 = { startsOn: `${y}-04-01`, endsOn: `${y}-09-30` }, t2 = { startsOn: `${y}-10-01`, endsOn: `${y + 1}-03-31` };
  const langs = subjectKeys.filter(k => LANGUAGE.test(k));
  const base = { name: `${PRESETS[key].label.replace(/ \(.*/, '')} ${session}`, grades, preset: key };

  if (key === 'foundational') {
    return {
      ...base, grading: FOUNDATIONAL_SCALE,
      rules: { ...DEFAULT_RULES, showMarks: false, coScholastic: [{ key: 'art_education', name: 'Art education' }, { key: 'health_pe', name: 'Health and physical education' }, { key: 'discipline', name: 'Discipline' }] },
      terms: [1, 2].map(s => ({
        seq: s, name: `Term ${s}`, ...(s === 1 ? t1 : t2), weight: 50, subjectWeights: {},
        components: [comp('oral', 'Oral and activity', 50, [`OA${s}`]), comp('written', 'Written', 50, [`WA${s}`])],
      })),
      assessments: [1, 2].flatMap(s => [asmt(`OA${s}`, `Oral and activity, term ${s}`, 'oral', 50, s), asmt(`WA${s}`, `Written, term ${s}`, 'written', 50, s)]),
    };
  }

  if (key === 'primary' || key === 'middle') {
    return {
      ...base, grading: CBSE_EIGHT_POINT, rules: { ...DEFAULT_RULES, coScholastic: MIDDLE_CO },
      terms: [1, 2].map(s => ({
        seq: s, name: `Term ${s}`, ...(s === 1 ? t1 : t2), weight: 50, subjectWeights: {},
        components: [
          comp('pt', 'Periodic test', 10, [`PT${s}`]), comp('nb', 'Notebook', 5, [`NB${s}`]),
          comp('se', 'Subject enrichment', 5, [`SE${s}`]), comp('exam', s === 1 ? 'Half-yearly exam' : 'Annual exam', 80, [s === 1 ? 'HY' : 'AN']),
        ],
      })),
      assessments: [1, 2].flatMap(s => [
        asmt(`PT${s}`, `Periodic test ${s}`, 'written', key === 'primary' ? 20 : 40, s), asmt(`NB${s}`, `Notebook, term ${s}`, 'internal', 5, s),
        asmt(`SE${s}`, `Subject enrichment, term ${s}`, 'internal', 5, s), asmt(s === 1 ? 'HY' : 'AN', s === 1 ? 'Half-yearly exam' : 'Annual exam', 'written', 80, s),
      ]),
    };
  }

  if (key === 'secondary') {
    const skills = subjectKeys.filter(k => SKILL_9_10.test(k));
    // Skill subjects: 50 theory and 50 practical; the internal assessment components don't apply.
    const skillWeights = Object.fromEntries(skills.map(k => [k, { pt: 0, ma: 0, pf: 0, se: 0, exam: 50, pr: 50 }]));
    const skillT1 = Object.fromEntries(skills.map(k => [k, { pt: 0, pf: 0, se: 0, exam: 100 }]));
    const onlySkills: Record<string, SubjectOverride> = { '*': { skip: true }, ...Object.fromEntries(skills.map(k => [k, {}])) };
    const notSkills: Record<string, SubjectOverride> = Object.fromEntries(skills.map(k => [k, { skip: true }]));
    return {
      ...base, grading: CBSE_EIGHT_POINT,
      rules: { ...DEFAULT_RULES, result: 'pass_fail', bestOf: 5, mandatory: langs, compartmentMax: 2, coScholastic: MIDDLE_CO },
      terms: [
        {
          seq: 1, name: 'Half-yearly', ...t1, weight: 0, subjectWeights: skillT1,
          components: [comp('pt', 'Periodic test', 10, ['PT1']), comp('pf', 'Portfolio', 5, ['PF1']), comp('se', 'Subject enrichment', 5, ['SE1']), comp('exam', 'Half-yearly exam', 80, ['HY'])],
        },
        {
          seq: 2, name: 'Annual', ...t2, weight: 100, subjectWeights: skillWeights,
          components: [
            comp('pt', 'Periodic tests (best two of three)', 5, ['PT1', 'PT2', 'PT3'], 'best', 2), comp('ma', 'Multiple assessment', 5, ['MA']),
            comp('pf', 'Portfolio', 5, ['PF2']), comp('se', 'Subject enrichment', 5, ['SE2']), comp('exam', 'Annual exam', 80, ['AN']),
            ...(skills.length ? [comp('pr', 'Practical', 0, ['PR'])] : []),
          ],
        },
      ],
      assessments: [
        asmt('PT1', 'Periodic test 1', 'written', 40, 1, notSkills), asmt('PF1', 'Portfolio, term 1', 'internal', 5, 1, notSkills), asmt('SE1', 'Subject enrichment, term 1', 'internal', 5, 1, notSkills),
        asmt('HY', 'Half-yearly exam', 'written', 80, 1), asmt('PT2', 'Periodic test 2', 'written', 40, 2, notSkills), asmt('PT3', 'Periodic test 3', 'written', 40, 2, notSkills),
        asmt('MA', 'Multiple assessment', 'internal', 5, 2, notSkills), asmt('PF2', 'Portfolio, term 2', 'internal', 5, 2, notSkills),
        asmt('SE2', 'Subject enrichment, term 2', 'internal', 5, 2, notSkills), asmt('AN', 'Annual exam', 'written', 80, 2),
        ...(skills.length ? [asmt('PR', 'Practical', 'practical', 50, 2, onlySkills)] : []),
      ],
    };
  }

  // Senior secondary
  const practical = subjectKeys.filter(k => PRACTICAL_11_12.test(k));
  const theoryMax: Record<string, SubjectOverride> = { '*': { max: 80 }, ...Object.fromEntries(practical.map(k => [k, { max: 70 }])) };
  const prMax: Record<string, SubjectOverride> = { '*': { max: 20 }, ...Object.fromEntries(practical.map(k => [k, { max: 30 }])) };
  const weights = Object.fromEntries(practical.map(k => [k, { th: 70, pr: 30 }]));
  return {
    ...base, grading: CBSE_EIGHT_POINT,
    rules: {
      ...DEFAULT_RULES, result: 'pass_fail', bestOf: 5, mandatory: langs, passEach: ['th', 'pr'], compartmentMax: 1,
      coScholastic: [{ key: 'work_experience', name: 'Work experience' }, { key: 'general_studies', name: 'General studies' }, { key: 'health_pe', name: 'Health and physical education' }, { key: 'discipline', name: 'Discipline' }],
      coGrades: ['A', 'B', 'C', 'D', 'E'],
    },
    terms: [
      { seq: 1, name: 'Half-yearly', ...t1, weight: 0, subjectWeights: weights, components: [comp('ut', 'Unit test 1', 0, ['UT1']), comp('th', 'Theory', 80, ['HY']), comp('pr', 'Practical / project', 20, ['PR1'])] },
      { seq: 2, name: 'Annual', ...t2, weight: 100, subjectWeights: weights, components: [comp('ut', 'Unit tests', 0, ['UT1', 'UT2'], 'avg'), comp('th', 'Theory', 80, ['AN']), comp('pr', 'Practical / project', 20, ['PR2'])] },
    ],
    assessments: [
      asmt('UT1', 'Unit test 1', 'written', 25, 1), asmt('HY', 'Half-yearly exam (theory)', 'written', 80, 1, theoryMax), asmt('PR1', 'Practical / project, term 1', 'practical', 20, 1, prMax),
      asmt('UT2', 'Unit test 2', 'written', 25, 2), asmt('AN', 'Annual exam (theory)', 'written', 80, 2, theoryMax), asmt('PR2', 'Practical / project, term 2', 'practical', 20, 2, prMax),
    ],
  };
}

// ── Sheets and workflow ───────────────────────────────────────────────────────

export type SheetStatus = 'open' | 'submitted' | 'locked';
export type ClassTermStatus = 'open' | 'reviewed' | 'published';

/** A sheet can be submitted when every student has marks or a code. Returns the names of those without. */
export function unmarked(students: { id: string; name: string }[], marks: Map<string, Mark>): string[] {
  return students.filter(s => { const m = marks.get(s.id); return !m || (m.marks === null && !m.code); }).map(s => s.name);
}

/** Parses what a teacher typed in a marks cell: a number, AB / ML / EX, or blank. */
export function parseCell(raw: string, max: number): { ok: true; mark: Mark } | { ok: false; error: string } {
  const v = raw.trim().toUpperCase();
  if (!v) return { ok: true, mark: { marks: null, code: null } };
  if (v === 'A' || v === 'AB' || v === 'ABS') return { ok: true, mark: { marks: null, code: 'AB' } };
  if (v === 'ML' || v === 'M' || v === 'MED') return { ok: true, mark: { marks: null, code: 'ML' } };
  if (v === 'EX' || v === 'E' || v === 'EXEMPT') return { ok: true, mark: { marks: null, code: 'EX' } };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: `"${raw.trim()}" isn't a mark. Use a number, AB, ML or EX.` };
  if (n > max) return { ok: false, error: `${n} is more than the maximum of ${max}.` };
  if (Math.round(n * 100) !== n * 100) return { ok: false, error: 'Marks go to at most two decimals.' };
  return { ok: true, mark: { marks: n, code: null } };
}

/** Scales a test score (out of the test's maximum) to the sheet's maximum, to the nearest half mark. */
export function scaleScore(score: number, outOf: number, max: number): number {
  if (!(outOf > 0)) return 0;
  return Math.min(max, Math.round((score / outOf) * max * 2) / 2);
}

// ── CSV import ────────────────────────────────────────────────────────────────

/** Splits CSV text into rows (quoted fields, commas or tabs). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const delim = (text.split('\n')[0] || '').includes('\t') && !(text.split('\n')[0] || '').includes(',') ? '\t' : ',';
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim())) rows.push(row);
  return rows.map(r => r.map(c => c.trim()));
}

export interface ImportStudent { id: string; name: string; admissionNo: string | null; rollNo: string | null }
export interface ImportMatch { studentId: string; name: string; raw: string; mark: Mark }
export interface ImportResult { matched: ImportMatch[]; problems: string[] }

const normName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/**
 * Matches an imported sheet to the class: by admission number, then roll number, then exact name. The marks
 * column is the one headed "marks" (or the last column). Every row is either matched or reported.
 */
export function matchImport(rows: string[][], students: ImportStudent[], max: number): ImportResult {
  const problems: string[] = [];
  if (!rows.length) return { matched: [], problems: ['The file is empty.'] };
  const head = rows[0].map(h => h.toLowerCase());
  const hasHead = head.some(h => /name|adm|roll|mark|score/.test(h));
  const col = (re: RegExp) => (hasHead ? head.findIndex(h => re.test(h)) : -1);
  const iAdm = col(/adm|student id|enrol|^id$/), iRoll = col(/roll/), iName = col(/name/);
  let iMark = col(/mark|score|total|obtained/);
  if (iMark < 0) iMark = rows[0].length - 1;
  const body = hasHead ? rows.slice(1) : rows;
  const byAdm = new Map(students.filter(s => s.admissionNo).map(s => [s.admissionNo!.toLowerCase(), s]));
  const byRoll = new Map(students.filter(s => s.rollNo).map(s => [s.rollNo!.toLowerCase(), s]));
  const byName = new Map<string, ImportStudent[]>();
  for (const s of students) { const k = normName(s.name); byName.set(k, [...(byName.get(k) ?? []), s]); }
  const seen = new Set<string>();
  const matched: ImportMatch[] = [];
  body.forEach((r, i) => {
    const line = i + (hasHead ? 2 : 1);
    let s: ImportStudent | undefined;
    if (iAdm >= 0 && r[iAdm]) s = byAdm.get(r[iAdm].toLowerCase());
    if (!s && iRoll >= 0 && r[iRoll]) s = byRoll.get(r[iRoll].toLowerCase());
    if (!s && iName >= 0 && r[iName]) {
      const hits = byName.get(normName(r[iName])) ?? [];
      if (hits.length > 1) { problems.push(`Line ${line}: more than one ${r[iName]} in the class. Add the admission number.`); return; }
      s = hits[0];
    }
    if (!s && !hasHead && r.length >= 2) {
      const hits = byName.get(normName(r[0])) ?? [];
      s = byAdm.get(r[0].toLowerCase()) ?? (hits.length === 1 ? hits[0] : undefined);
    }
    if (!s) { problems.push(`Line ${line}: no student in this class matches ${r.filter(Boolean).slice(0, 2).join(' / ') || 'this row'}.`); return; }
    if (seen.has(s.id)) { problems.push(`Line ${line}: ${s.name} appears twice.`); return; }
    const p = parseCell(r[iMark] ?? '', max);
    if (!p.ok) { problems.push(`Line ${line} (${s.name}): ${p.error}`); return; }
    seen.add(s.id);
    matched.push({ studentId: s.id, name: s.name, raw: r[iMark] ?? '', mark: p.mark });
  });
  return { matched, problems };
}
