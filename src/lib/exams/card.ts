/**
 * The report card: what is frozen when a class's term is published, and the shaping from a student's results.
 * Pure, no I/O. The snapshot carries everything the card shows, so a card reads the same years later whatever
 * happens to the scheme, the marks or the school's branding.
 */
import { mapMasteryBand } from '@/lib/tml/engine';
import { gradeFor, MARK_CODES, type GradeBand, type Rules, type StudentResult, type Term } from './engine';

export interface CardBranding {
  logo: string | null; accent: string; affiliation: string | null; address: string | null; signatures: string[];
}
/** varies: some subjects weigh this component differently (theory and practical in skill subjects). */
export interface CardComponentHead { key: string; name: string; weight: number; varies?: boolean }
/** counted: false when the component doesn't count for this subject (weight 0). Older snapshots leave it out. */
export interface CardCell { score: number | null; text: string; counted?: boolean }
export interface CardSubjectRow {
  key: string; name: string;
  /** Per term shown: one cell per component head, then the total and grade. */
  terms: { termId: string; cells: CardCell[]; total: number | null; outOf: number; grade: string | null }[];
  final: { pct: number; grade: string | null } | null;
  counted: boolean;
  status: 'pass' | 'fail' | null;
}
export interface ReportCardSnapshot {
  v: 1;
  school: { name: string; board: string } & CardBranding;
  session: string;
  scheme: string;
  term: { id: string; name: string; seq: number; isFinal: boolean };
  /** compact: an earlier term on a later card, shown as its total and grade only. */
  terms: { id: string; name: string; heads: CardComponentHead[]; compact?: boolean }[];
  showFinal: boolean;
  student: { id: string; name: string; admissionNo: string | null; rollNo: string | null; cls: string };
  show: { marks: boolean; rank: boolean; attendance: boolean; tml: boolean };
  subjects: CardSubjectRow[];
  aggregate: { pct: number; grade: string | null; counted: number } | null;
  result: { status: 'pass' | 'compartment' | 'fail'; toClear: string[] } | null;
  rank: { rank: number; of: number } | null;
  coScholastic: { name: string; grade: string | null }[];
  coGrades: string[];
  attendance: { present: number; workingDays: number; pct: number | null } | null;
  tml: { subject: string; score: number; band: string; color: string }[];
  remark: string | null;
  grading: GradeBand[];
  issuedOn: string;
  version: number;
  revised: boolean;
}

export interface CardInput {
  school: { name: string; board: string } & CardBranding;
  session: string; schemeName: string; rules: Rules; grading: GradeBand[];
  terms: Term[]; termId: string;
  student: { id: string; name: string; admissionNo: string | null; rollNo: string | null; cls: string };
  result: StudentResult;
  rank: { rank: number; of: number } | null;
  coscholastic: Record<string, string>;
  remark: string | null;
  attendance: { present: number; workingDays: number } | null;
  tml: { subject: string; score: number }[];
  issuedOn: string; version: number; revised: boolean;
}

/** The component columns of a term: every component that applies to at least one of the class's subjects. */
function headsOf(term: Term, r: StudentResult): CardComponentHead[] {
  const seen = new Map<string, CardComponentHead>();
  for (const c of term.components) {
    for (const s of r.subjects) {
      const got = s.terms[term.id]?.components.find(x => x.key === c.key);
      if (!got) continue;
      if (!seen.has(c.key)) seen.set(c.key, { key: c.key, name: c.name, weight: c.weight });
      if (got.weight !== c.weight) seen.get(c.key)!.varies = true;
    }
  }
  return term.components.filter(c => seen.has(c.key)).map(c => seen.get(c.key)!);
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(n * 10 === Math.round(n * 10) ? 1 : 2));

export function buildCard(i: CardInput): ReportCardSnapshot {
  const sorted = [...i.terms].sort((a, b) => a.seq - b.seq);
  const term = sorted.find(t => t.id === i.termId)!;
  const isFinal = term.seq === sorted[sorted.length - 1].seq;
  // The card shows every term so far (the annual card carries the half-yearly beside it).
  const shown = sorted.filter(t => t.seq <= term.seq);
  const heads = new Map(shown.map(t => [t.id, headsOf(t, i.result)]));
  const counted = new Set(i.result.aggregate?.counted ?? []);
  const weighted = shown.filter(t => t.weight > 0);
  const showFinal = weighted.length > 1 || (weighted.length === 1 && weighted[0].id !== term.id);

  const subjects: CardSubjectRow[] = i.result.subjects.map(s => ({
    key: s.key, name: s.name,
    terms: shown.map(t => {
      const tr = s.terms[t.id];
      const cells = (heads.get(t.id) ?? []).map(h => {
        const c = tr?.components.find(x => x.key === h.key);
        if (!c) return { score: null, text: '', counted: true };
        if (c.score !== null) return { score: c.score, text: fmt(c.score), counted: c.weight > 0 };
        const code = c.parts.find(p => p.code2)?.code2;
        return { score: null, text: code ? code : '', counted: c.weight > 0 };
      });
      return { termId: t.id, cells, total: tr?.total ?? null, outOf: tr?.outOf ?? 0, grade: tr?.excused ? 'Excused' : tr?.grade ?? null };
    }),
    final: s.final ? { pct: s.final.pct, grade: s.final.grade } : null,
    counted: counted.has(s.key),
    status: s.passed === null ? null : s.passed ? 'pass' : 'fail',
  }));

  const agg = i.result.aggregate;
  const att = i.attendance && i.attendance.workingDays > 0
    ? { present: i.attendance.present, workingDays: i.attendance.workingDays, pct: Math.round((i.attendance.present / i.attendance.workingDays) * 1000) / 10 }
    : i.attendance ? { ...i.attendance, pct: null } : null;
  const names = new Map(i.result.subjects.map(s => [s.key, s.name]));

  return {
    v: 1,
    school: i.school,
    session: i.session,
    scheme: i.schemeName,
    term: { id: term.id, name: term.name, seq: term.seq, isFinal },
    terms: shown.map(t => ({ id: t.id, name: t.name, heads: heads.get(t.id) ?? [], compact: t.id !== term.id })),
    showFinal,
    student: i.student,
    show: { marks: i.rules.showMarks, rank: i.rules.showRank && !!i.rank, attendance: i.rules.showAttendance && !!att, tml: i.rules.showTml && i.tml.length > 0 },
    subjects,
    aggregate: agg ? { pct: agg.pct, grade: gradeFor(agg.pct, i.grading)?.grade ?? null, counted: agg.counted.length } : null,
    result: i.result.result ? { status: i.result.result, toClear: i.result.toClear.map(k => names.get(k) ?? k) } : null,
    rank: i.rules.showRank ? i.rank : null,
    coScholastic: i.rules.coScholastic.map(a => ({ name: a.name, grade: i.coscholastic[a.key] ?? null })),
    coGrades: i.rules.coGrades,
    attendance: i.rules.showAttendance ? att : null,
    tml: i.rules.showTml ? i.tml.map(t => { const b = mapMasteryBand(t.score)!; return { subject: t.subject, score: Math.round(t.score), band: b.band, color: b.color }; }) : [],
    remark: i.remark,
    grading: i.grading,
    issuedOn: i.issuedOn,
    version: i.version,
    revised: i.revised,
  };
}

export const RESULT_LABEL = { pass: 'Passed', compartment: 'Compartment', fail: 'Not passed' } as const;
export const codeLabel = (c: string) => MARK_CODES[c as keyof typeof MARK_CODES] ?? c;
