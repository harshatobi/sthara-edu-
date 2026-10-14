import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { byIds, pageAll } from '@/lib/ops/page';
import { gradeOf, isoDay } from '@/lib/admin/format';
import { normClass } from '@/lib/teacher/scope';
import { notifyGuardians } from '@/lib/parent/notify';
import {
  assessmentFor, rankBy, studentResult, toGrading, toRules, type Assessment, type Component, type Mark, type MarkCode, type Scheme,
  type SubjectMarks, type Term,
} from './engine';
import { buildCard, type CardBranding, type ReportCardSnapshot } from './card';

type Db = SupabaseClient;

// ── Shaping ───────────────────────────────────────────────────────────────────

export type SchemeRow = Scheme & { schoolId: string };
export type TermRow = Term & { schemeId: string };
export type AssessmentRow = Assessment & { schemeId: string };

export const toScheme = (r: any): SchemeRow => ({
  id: r.id, schoolId: r.school_id, session: r.session, name: r.name, grades: (r.grades || []).map(Number), preset: r.preset ?? null,
  grading: toGrading(r.grading), rules: toRules(r.rules), status: r.status,
});
export const toTerm = (r: any): TermRow => ({
  id: r.id, schemeId: r.scheme_id, name: r.name, seq: r.seq, startsOn: r.starts_on, endsOn: r.ends_on, weight: Number(r.weight),
  components: (Array.isArray(r.components) ? r.components : []).map((c: any): Component => ({
    key: String(c.key), name: String(c.name), weight: Number(c.weight), codes: (c.codes || []).map(String), rule: c.rule === 'avg' || c.rule === 'best' ? c.rule : 'sum', ...(c.best ? { best: Number(c.best) } : {}),
  })),
  subjectWeights: r.subject_weights && typeof r.subject_weights === 'object' ? r.subject_weights : {},
});
export const toAssessment = (r: any): AssessmentRow => ({
  id: r.id, schemeId: r.scheme_id, termId: r.term_id, code: r.code, name: r.name, kind: r.kind, maxMarks: Number(r.max_marks), seq: r.seq,
  subjects: r.subjects && typeof r.subjects === 'object' ? r.subjects : {}, heldFrom: r.held_from ?? null, heldTo: r.held_to ?? null,
});

export interface SchemeBundle { schemes: SchemeRow[]; terms: TermRow[]; assessments: AssessmentRow[] }

export async function loadSchemes(db: Db, schoolId: string, session: string): Promise<SchemeBundle> {
  const { data: s, error } = await db.from('exam_schemes').select('*').eq('school_id', schoolId).eq('session', session).order('created_at');
  if (error) throw error;
  const ids = (s || []).map(x => x.id);
  if (!ids.length) return { schemes: [], terms: [], assessments: [] };
  const [t, a] = await Promise.all([
    db.from('exam_terms').select('*').in('scheme_id', ids).order('seq'),
    db.from('exam_assessments').select('*').in('scheme_id', ids).order('seq'),
  ]);
  if (t.error) throw t.error;
  if (a.error) throw a.error;
  return { schemes: (s || []).map(toScheme), terms: (t.data || []).map(toTerm), assessments: (a.data || []).map(toAssessment) };
}

/** The active scheme a class follows this session. */
export function schemeForGrade(b: SchemeBundle, grade: number | null): SchemeRow | null {
  return grade === null ? null : b.schemes.find(s => s.status === 'active' && s.grades.includes(grade)) ?? null;
}

// ── Roster ────────────────────────────────────────────────────────────────────

export interface ExamClass { id: string; name: string; grade: number | null; classTeacherId: string | null; classTeacher: string | null }
export interface ExamStudent { id: string; name: string; cls: string; admissionNo: string | null; rollNo: string | null }
export interface ExamClassSubject { id: string; classId: string; key: string; name: string; kind: 'core' | 'elective' }
export interface Roster {
  classes: ExamClass[]; students: ExamStudent[]; classSubjects: ExamClassSubject[];
  /** class_subject id -> enrolled student ids. */
  enrol: Map<string, Set<string>>;
  teachers: Map<string, string[]>; // class_subject id -> teacher ids
  names: Map<string, string>; // user id -> name
}

export async function loadRoster(db: Db, schoolId: string): Promise<Roster> {
  const [classes, cs, ts, ss, users] = await Promise.all([
    db.from('classes').select('id, name').eq('school_id', schoolId).order('name'),
    db.from('class_subjects').select('id, class_id, subject_key, subject_name, kind').eq('school_id', schoolId),
    db.from('teacher_subjects').select('teacher_id, class_subject_id').eq('school_id', schoolId),
    pageAll<any>((f, t) => db.from('student_subjects').select('student_id, class_subject_id').eq('school_id', schoolId).order('student_id').order('class_subject_id').range(f, t), 200_000),
    pageAll<any>((f, t) => db.from('users').select('id, name, role, student_class, teacher_class, custom_student_id, metadata').eq('school_id', schoolId).in('role', ['student', 'teacher', 'admin']).order('id').range(f, t), 50_000),
  ]);
  const err = [classes, cs, ts, ss, users].find(r => r.error)?.error;
  if (err) throw err;
  const people = users.data;
  const ct = new Map<string, { id: string; name: string }>();
  for (const u of people) if (u.role === 'teacher' && u.teacher_class) ct.set(normClass(u.teacher_class), { id: u.id, name: u.name });
  const enrol = new Map<string, Set<string>>();
  for (const r of ss.data) { if (!enrol.has(r.class_subject_id)) enrol.set(r.class_subject_id, new Set()); enrol.get(r.class_subject_id)!.add(r.student_id); }
  const teachers = new Map<string, string[]>();
  for (const r of ts.data || []) teachers.set(r.class_subject_id, [...(teachers.get(r.class_subject_id) ?? []), r.teacher_id]);
  return {
    classes: (classes.data || []).map(c => ({ id: c.id, name: c.name, grade: gradeOf(c.name), classTeacherId: ct.get(normClass(c.name))?.id ?? null, classTeacher: ct.get(normClass(c.name))?.name ?? null })),
    students: people.filter(u => u.role === 'student').map(u => ({
      id: u.id, name: u.name || 'Student', cls: u.student_class || '', admissionNo: u.custom_student_id || null,
      rollNo: (u.metadata && (u.metadata.rollNo || u.metadata.roll_no)) ? String(u.metadata.rollNo || u.metadata.roll_no) : null,
    })),
    classSubjects: (cs.data || []).map(r => ({ id: r.id, classId: r.class_id, key: r.subject_key, name: r.subject_name, kind: r.kind })),
    enrol, teachers,
    names: new Map(people.map(u => [u.id, u.name || ''])),
  };
}

const byRoll = (a: ExamStudent, b: ExamStudent) =>
  (a.rollNo || a.admissionNo || '').localeCompare(b.rollNo || b.admissionNo || '', 'en', { numeric: true }) || a.name.localeCompare(b.name);

export function classStudents(r: Roster, classId: string): ExamStudent[] {
  const c = r.classes.find(x => x.id === classId);
  if (!c) return [];
  const k = normClass(c.name);
  return r.students.filter(s => normClass(s.cls) === k).sort(byRoll);
}

/** The students on a class-subject's marks sheet: those enrolled, or the whole class for a core subject nobody is enrolled in yet. */
export function sheetStudents(r: Roster, cs: ExamClassSubject): ExamStudent[] {
  const all = classStudents(r, cs.classId);
  const e = r.enrol.get(cs.id);
  if (e && e.size) return all.filter(s => e.has(s.id));
  return cs.kind === 'core' ? all : [];
}

/** The class-subjects a student takes in their class. */
export function studentSubjects(r: Roster, classId: string, studentId: string): ExamClassSubject[] {
  return r.classSubjects.filter(cs => cs.classId === classId && sheetStudents(r, cs).some(s => s.id === studentId));
}

// ── Sheets ────────────────────────────────────────────────────────────────────

export interface SheetRow {
  id: string; assessmentId: string; classSubjectId: string; classId: string; status: 'open' | 'submitted' | 'locked'; maxMarks: number;
  submittedBy: string | null; submittedAt: string | null; returnedNote: string | null; reopenedReason: string | null; updatedAt: string;
}
export const toSheet = (r: any): SheetRow => ({
  id: r.id, assessmentId: r.assessment_id, classSubjectId: r.class_subject_id, classId: r.class_id, status: r.status, maxMarks: Number(r.max_marks),
  submittedBy: r.submitted_by, submittedAt: r.submitted_at, returnedNote: r.returned_note, reopenedReason: r.reopened_reason, updatedAt: r.updated_at,
});

/** Creates the marks sheets for an assessment in every class the scheme covers (existing sheets are left alone). */
export async function openSheets(db: Db, schoolId: string, scheme: SchemeRow, a: AssessmentRow, r: Roster): Promise<{ created: number; error?: string }> {
  const rows = r.classSubjects
    .filter(cs => { const c = r.classes.find(x => x.id === cs.classId); return c && c.grade !== null && scheme.grades.includes(c.grade); })
    .map(cs => ({ cs, applies: assessmentFor(a, cs.key) }))
    .filter(x => x.applies)
    .map(x => ({ school_id: schoolId, assessment_id: a.id, class_subject_id: x.cs.id, class_id: x.cs.classId, max_marks: x.applies!.max }));
  if (!rows.length) return { created: 0 };
  const { data, error } = await db.from('exam_sheets').upsert(rows, { onConflict: 'assessment_id,class_subject_id', ignoreDuplicates: true }).select('id');
  if (error) return { created: 0, error: error.message };
  return { created: (data || []).length };
}

export async function loadMarks(db: Db, sheetIds: string[]): Promise<Map<string, Map<string, Mark & { questions: unknown; source: string }>>> {
  const { data, error } = await byIds<any>(sheetIds, (chunk, f, t) => db.from('exam_marks').select('sheet_id, student_id, marks, code, questions, source').in('sheet_id', chunk).order('id').range(f, t));
  if (error) throw error;
  const out = new Map<string, Map<string, Mark & { questions: unknown; source: string }>>();
  for (const m of data) {
    if (!out.has(m.sheet_id)) out.set(m.sheet_id, new Map());
    out.get(m.sheet_id)!.set(m.student_id, { marks: m.marks === null ? null : Number(m.marks), code: m.code as MarkCode | null, questions: m.questions, source: m.source });
  }
  return out;
}

// ── A class's term ────────────────────────────────────────────────────────────

export interface ClassTermRow { id: string | null; status: 'open' | 'reviewed' | 'published'; version: number; reviewedAt: string | null; publishedAt: string | null; reopenReason: string | null }
export const toClassTerm = (r: any): ClassTermRow => (r
  ? { id: r.id, status: r.status, version: r.version, reviewedAt: r.reviewed_at, publishedAt: r.published_at, reopenReason: r.reopen_reason }
  : { id: null, status: 'open', version: 0, reviewedAt: null, publishedAt: null, reopenReason: null });

/** Codes a term's result draws on (its own assessments and any earlier ones its components reuse). */
export const termCodes = (t: Term, as: Assessment[]) => new Set([...t.components.flatMap(c => c.codes), ...as.filter(a => a.termId === t.id).map(a => a.code)]);

/** The mean of a student's subject percentages in one term (null until every subject has one). */
export function termPctOf(r: ReturnType<typeof studentResult>, termId: string): number | null {
  const ts = r.subjects.map(x => x.terms[termId]).filter(Boolean);
  if (ts.some(t => t.missing.length)) return null;
  // Subjects excused this term (medical or exempt throughout) are left out of the average.
  const xs = ts.map(t => t.pct).filter((v): v is number => typeof v === 'number');
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;
}

export interface ClassTermData {
  scheme: SchemeRow; term: TermRow; terms: TermRow[]; assessments: AssessmentRow[];
  cls: ExamClass; students: ExamStudent[];
  classTerm: ClassTermRow;
  /** Every sheet the term needs in this class, with what's missing. */
  sheets: (SheetRow & { code: string; assessment: string; subject: string; subjectKey: string; teachers: string[]; marked: number; of: number })[];
  /** Sheets the term needs that were never opened. */
  unopened: { code: string; subject: string }[];
  results: Map<string, ReturnType<typeof studentResult>>;
  ranks: Map<string, number>;
  extras: Map<string, { remark: string | null; coscholastic: Record<string, string> }>;
  subjectsOf: Map<string, { key: string; name: string; csId: string }[]>;
}

export async function loadClassTerm(db: Db, schoolId: string, b: SchemeBundle, r: Roster, classId: string, termId: string): Promise<ClassTermData | { error: string; status: number }> {
  const cls = r.classes.find(c => c.id === classId);
  const term = b.terms.find(t => t.id === termId);
  if (!cls || !term) return { error: 'That class or term is not in this school.', status: 404 };
  const scheme = b.schemes.find(s => s.id === term.schemeId)!;
  if (cls.grade === null || !scheme.grades.includes(cls.grade)) return { error: `${cls.name} doesn't follow ${scheme.name}.`, status: 400 };
  const terms = b.terms.filter(t => t.schemeId === scheme.id).sort((x, y) => x.seq - y.seq);
  const assessments = b.assessments.filter(a => a.schemeId === scheme.id);
  const byCode = new Map(assessments.map(a => [a.code, a]));
  // Everything the results up to this term draw on.
  const upto = terms.filter(t => t.seq <= term.seq);
  const codes = new Set(upto.flatMap(t => [...termCodes(t, assessments)]));
  const need = termCodes(term, assessments);
  const students = classStudents(r, classId);
  const css = r.classSubjects.filter(cs => cs.classId === classId);

  const [sheetsQ, ctQ, extrasQ] = await Promise.all([
    db.from('exam_sheets').select('*').eq('school_id', schoolId).eq('class_id', classId).in('assessment_id', assessments.filter(a => codes.has(a.code)).map(a => a.id)),
    db.from('exam_class_terms').select('*').eq('term_id', termId).eq('class_id', classId).maybeSingle(),
    byIds<any>(students.map(s => s.id), (chunk, f, t) => db.from('exam_student_terms').select('student_id, remark, coscholastic').eq('term_id', termId).in('student_id', chunk).order('id').range(f, t)),
  ]);
  if (sheetsQ.error) throw sheetsQ.error;
  const sheets = (sheetsQ.data || []).map(toSheet);
  const marks = await loadMarks(db, sheets.map(s => s.id));
  const aById = new Map(assessments.map(a => [a.id, a]));
  const csById = new Map(css.map(c => [c.id, c]));

  // Per student per subject: code -> mark.
  const subjectsOf = new Map<string, { key: string; name: string; csId: string }[]>();
  for (const s of students) subjectsOf.set(s.id, css.filter(cs => sheetStudents(r, cs).some(x => x.id === s.id)).map(cs => ({ key: cs.key, name: cs.name, csId: cs.id })));
  const results = new Map<string, ReturnType<typeof studentResult>>();
  for (const s of students) {
    const per = new Map<string, SubjectMarks>();
    for (const sub of subjectsOf.get(s.id)!) {
      const m: SubjectMarks = new Map();
      for (const sh of sheets.filter(x => x.classSubjectId === sub.csId)) {
        const a = aById.get(sh.assessmentId);
        const got = marks.get(sh.id)?.get(s.id);
        if (a && got) m.set(a.code, { marks: got.marks, code: got.code, max: sh.maxMarks });
      }
      per.set(sub.key, m);
    }
    results.set(s.id, studentResult(scheme, terms, assessments, subjectsOf.get(s.id)!.map(x => ({ key: x.key, name: x.name })), per, term.seq));
  }
  // Rank on the year's result once there is one, otherwise on this term (a progress report has no year result).
  const rankMap = rankBy(students, s => { const r = results.get(s.id); return r?.aggregate?.pct ?? (r ? termPctOf(r, term.id) : null); });
  const ranks = new Map(students.map(s => [s.id, rankMap.get(s) ?? 0]).filter(([, v]) => v) as [string, number][]);

  const sheetRows = sheets
    .filter(sh => { const a = aById.get(sh.assessmentId); return a && need.has(a.code) && csById.has(sh.classSubjectId); })
    .map(sh => {
      const a = aById.get(sh.assessmentId)!, cs = csById.get(sh.classSubjectId)!;
      const roster = sheetStudents(r, cs);
      const m = marks.get(sh.id) ?? new Map();
      return {
        ...sh, code: a.code, assessment: a.name, subject: cs.name, subjectKey: cs.key, teachers: (r.teachers.get(cs.id) ?? []).map(id => r.names.get(id) || 'Teacher'),
        marked: roster.filter(s => { const x = m.get(s.id); return x && (x.marks !== null || x.code); }).length, of: roster.length,
      };
    })
    .sort((x, y) => x.subject.localeCompare(y.subject) || (byCode.get(x.code)!.seq - byCode.get(y.code)!.seq));
  const have = new Set(sheets.map(s => `${s.assessmentId}:${s.classSubjectId}`));
  const unopened = [...need].flatMap(code => {
    const a = byCode.get(code);
    if (!a) return [];
    return css.filter(cs => assessmentFor(a, cs.key) && !have.has(`${a.id}:${cs.id}`) && sheetStudents(r, cs).length).map(cs => ({ code, subject: cs.name }));
  });
  const extras = new Map<string, { remark: string | null; coscholastic: Record<string, string> }>((extrasQ.data || []).map((x: any) => [x.student_id, { remark: x.remark, coscholastic: x.coscholastic || {} }]));
  return { scheme, term, terms, assessments, cls, students, classTerm: toClassTerm(ctQ.data), sheets: sheetRows, unopened, results, ranks, extras, subjectsOf };
}

// ── Publishing ────────────────────────────────────────────────────────────────

export interface CardSettings extends CardBranding { holdOnDues: boolean; holdMinAmount: number }
export async function loadCardSettings(db: Db, schoolId: string): Promise<CardSettings> {
  const { data } = await db.from('report_card_settings').select('*').eq('school_id', schoolId).maybeSingle();
  return {
    logo: data?.logo ?? null, accent: data?.accent ?? '#002147', affiliation: data?.affiliation ?? null, address: data?.address ?? null,
    signatures: Array.isArray(data?.signatures) ? data!.signatures.map(String) : ['Class teacher', 'Principal', 'Parent'],
    holdOnDues: !!data?.hold_on_dues, holdMinAmount: Number(data?.hold_min_amount ?? 1),
  };
}

/** Attendance for the session so far: from the scheme's first term to this term's end (to today while it runs). */
async function termAttendance(db: Db, schoolId: string, term: Term, from: string): Promise<Map<string, { present: number; workingDays: number }>> {
  const today = isoDay();
  const to = term.endsOn < today ? term.endsOn : today;
  if (to < from) return new Map();
  const { data, error } = await db.rpc('exam_attendance', { p_school: schoolId, p_from: from, p_to: to });
  if (error) { console.warn('[exams] attendance', error.message); return new Map(); }
  return new Map((data || []).map((r: any) => [r.student_id, { present: Number(r.present) + Number(r.late), workingDays: Number(r.class_days) }]));
}

async function subjectTml(db: Db, studentIds: string[]): Promise<Map<string, Map<string, number>>> {
  const { data } = await byIds<any>(studentIds, (chunk, f, t) => db.from('tml_scores').select('student_id, subject, score').in('student_id', chunk).order('id').range(f, t));
  const acc = new Map<string, Map<string, { n: number; s: number }>>();
  for (const r of data) {
    if (r.score === null) continue;
    if (!acc.has(r.student_id)) acc.set(r.student_id, new Map());
    const m = acc.get(r.student_id)!, k = String(r.subject || '').trim().toLowerCase();
    const v = m.get(k) ?? { n: 0, s: 0 };
    v.n++; v.s += Number(r.score);
    m.set(k, v);
  }
  return new Map([...acc].map(([id, m]) => [id, new Map([...m].map(([k, v]) => [k, v.s / v.n]))]));
}

/** Report cards for some of a class's students, as they would be published now. */
export async function buildCards(db: Db, schoolId: string, schoolName: string, board: string, session: string, d: ClassTermData, studentIds: string[],
  version: number, revised: boolean, settings?: CardSettings): Promise<Map<string, ReportCardSnapshot>> {
  const st = settings ?? await loadCardSettings(db, schoolId);
  const [att, tml] = await Promise.all([termAttendance(db, schoolId, d.term, d.terms[0].startsOn), subjectTml(db, studentIds)]);
  const ranked = d.students.filter(s => d.ranks.has(s.id)).length;
  const out = new Map<string, ReportCardSnapshot>();
  for (const s of d.students.filter(x => studentIds.includes(x.id))) {
    const ex = d.extras.get(s.id);
    const t = tml.get(s.id);
    out.set(s.id, buildCard({
      school: { name: schoolName, board, logo: st.logo, accent: st.accent, affiliation: st.affiliation, address: st.address, signatures: st.signatures },
      session, schemeName: d.scheme.name, rules: d.scheme.rules, grading: d.scheme.grading, terms: d.terms, termId: d.term.id,
      student: { id: s.id, name: s.name, admissionNo: s.admissionNo, rollNo: s.rollNo, cls: d.cls.name },
      result: d.results.get(s.id)!,
      rank: d.ranks.has(s.id) ? { rank: d.ranks.get(s.id)!, of: ranked } : null,
      coscholastic: ex?.coscholastic ?? {}, remark: ex?.remark ?? null,
      attendance: att.get(s.id) ?? null,
      tml: (d.subjectsOf.get(s.id) ?? []).map(x => ({ subject: x.name, score: t?.get(x.name.toLowerCase()) })).filter((x): x is { subject: string; score: number } => typeof x.score === 'number'),
      issuedOn: isoDay(), version, revised,
    }));
  }
  return out;
}

/** A class's term for the review and publish screens: sheets, readiness and each student's standing. */
export function summarizeClassTerm(d: ClassTermData) {
  const open = d.sheets.filter(s => s.status === 'open');
  const incomplete = d.students.filter(s => !d.results.get(s.id)?.complete);
  return {
    scheme: { id: d.scheme.id, name: d.scheme.name, rules: d.scheme.rules, grading: d.scheme.grading },
    term: { id: d.term.id, name: d.term.name, seq: d.term.seq, isFinal: d.term.seq === d.terms[d.terms.length - 1].seq },
    cls: d.cls, classTerm: d.classTerm,
    sheets: d.sheets.map(s => ({ id: s.id, code: s.code, assessment: s.assessment, subject: s.subject, status: s.status, marked: s.marked, of: s.of, teachers: s.teachers, maxMarks: s.maxMarks, returnedNote: s.returnedNote, submittedAt: s.submittedAt, classSubjectId: s.classSubjectId })),
    unopened: d.unopened,
    ready: { sheetsOpen: open.length, unopened: d.unopened.length, incomplete: incomplete.length, canReview: !open.length && !d.unopened.length && !incomplete.length && d.students.length > 0 },
    students: d.students.map(s => {
      const r = d.results.get(s.id)!;
      const ex = d.extras.get(s.id);
      return {
        id: s.id, name: s.name, admissionNo: s.admissionNo, rollNo: s.rollNo, complete: r.complete,
        pct: r.aggregate?.pct ?? null, result: r.result, toClear: r.toClear, rank: d.ranks.get(s.id) ?? null,
        termPct: termPctOf(r, d.term.id),
        subjects: r.subjects.map(x => ({ key: x.key, name: x.name, pct: x.terms[d.term.id]?.pct ?? null, grade: x.terms[d.term.id]?.grade ?? null, missing: x.terms[d.term.id]?.missing ?? [], finalPct: x.final?.pct ?? null, passed: x.passed })),
        remark: ex?.remark ?? '', coscholastic: ex?.coscholastic ?? {},
      };
    }),
  };
}

export interface PublishOutcome { published: number; held: number; version: number; notified: number }

/**
 * Freezes a reviewed class-term into report cards: one snapshot per student, a new version (the old one marked
 * superseded), sheets locked, held where the school holds cards for overdue fees, parents and students told.
 */
export async function publishClassTerm(db: Db, schoolId: string, schoolName: string, board: string, d: ClassTermData, by: string, session: string): Promise<PublishOutcome | { error: string; status: number }> {
  if (d.classTerm.status === 'published') return { error: 'This term is already published for the class.', status: 409 };
  if (d.classTerm.status !== 'reviewed') return { error: 'The class teacher hasn\'t reviewed this term yet.', status: 409 };
  if (d.unopened.length) return { error: `Marks were never opened for ${d.unopened.slice(0, 3).map(u => `${u.subject} ${u.code}`).join(', ')}.`, status: 409 };
  const open = d.sheets.filter(s => s.status === 'open');
  if (open.length) return { error: `${open.length} marks sheet${open.length === 1 ? ' is' : 's are'} not submitted (${open.slice(0, 3).map(s => `${s.subject} ${s.code}`).join(', ')}).`, status: 409 };
  const incomplete = d.students.filter(s => !d.results.get(s.id)?.complete);
  if (incomplete.length) return { error: `Marks are missing for ${incomplete.slice(0, 3).map(s => s.name).join(', ')}${incomplete.length > 3 ? ` and ${incomplete.length - 3} more` : ''}.`, status: 409 };
  if (!d.students.length) return { error: 'There are no students in this class.', status: 409 };

  const settings = await loadCardSettings(db, schoolId);
  const version = d.classTerm.version + 1;
  const revised = version > 1;
  const [cards, dues, prev] = await Promise.all([
    buildCards(db, schoolId, schoolName, board, session, d, d.students.map(s => s.id), version, revised, settings),
    settings.holdOnDues ? db.rpc('exam_fee_dues', { p_school: schoolId, p_today: isoDay() }) : Promise.resolve({ data: [], error: null }),
    byIds<any>(d.students.map(s => s.id), (chunk, f, t) => db.from('report_cards').select('id, student_id, version, released_at').eq('term_id', d.term.id).is('superseded_at', null).in('student_id', chunk).order('id').range(f, t)),
  ]);
  const overdue = new Map<string, number>(((dues as any).data || []).map((r: any) => [r.student_id, Number(r.overdue)]));
  const released = new Set(prev.data.filter(p => p.released_at).map(p => p.student_id));
  const now = new Date().toISOString();

  const rows = d.students.map(s => {
    const owes = overdue.get(s.id) ?? 0;
    const held = settings.holdOnDues && owes >= Math.max(settings.holdMinAmount, 0.01) && !released.has(s.id);
    return {
      school_id: schoolId, student_id: s.id, term_id: d.term.id, class_id: d.cls.id, version, snapshot: cards.get(s.id)!, revised,
      revision_reason: revised ? d.classTerm.reopenReason : null, published_by: by, published_at: now,
      held, hold_reason: held ? 'Fees overdue' : null, held_at: held ? now : null,
    };
  });

  const ins = await db.from('report_cards').insert(rows);
  if (ins.error) return { error: ins.error.code === '23505' ? 'These report cards were just published by someone else. Reload.' : 'Could not publish the report cards.', status: ins.error.code === '23505' ? 409 : 500 };
  const ids = d.students.map(s => s.id);
  for (let i = 0; i < ids.length; i += 150) {
    await db.from('report_cards').update({ superseded_at: now }).eq('term_id', d.term.id).lt('version', version).is('superseded_at', null).in('student_id', ids.slice(i, i + 150));
  }
  const sheetIds = d.sheets.map(s => s.id);
  for (let i = 0; i < sheetIds.length; i += 150) await db.from('exam_sheets').update({ status: 'locked' }).in('id', sheetIds.slice(i, i + 150));
  const ctRow = { school_id: schoolId, term_id: d.term.id, class_id: d.cls.id, status: 'published', version, published_by: by, published_at: now };
  const ct = d.classTerm.id ? await db.from('exam_class_terms').update(ctRow).eq('id', d.classTerm.id) : await db.from('exam_class_terms').insert(ctRow);
  if (ct.error) console.error('[exams] class term after publish', ct.error.message);

  // Tell families. A held card is announced without the result; the office shares it once fees are settled.
  let notified = 0;
  const label = `${d.term.name} report card`;
  for (const row of rows) {
    const s = d.students.find(x => x.id === row.student_id)!;
    const title = revised ? `${label} revised` : `${label} is ready`;
    const body = row.held
      ? `${s.name}'s ${label.toLowerCase()} is ready. Please contact the school office to receive it.`
      : revised ? `The school has revised ${s.name}'s ${label.toLowerCase()}${d.classTerm.reopenReason ? `: ${d.classTerm.reopenReason}` : ''}. Open Results to see it.`
        : `${s.name}'s ${label.toLowerCase()} for ${session} is published. Open Results to see it.`;
    const n = await notifyGuardians(db, { schoolId, studentId: s.id, type: 'report_card', title, body, pref: 'grades', metadata: { termId: d.term.id, version } });
    notified += n.parents;
    await db.from('notifications').insert({ school_id: schoolId, user_id: s.id, student_id: s.id, type: 'report_card', title, body: row.held ? `Your ${label.toLowerCase()} is ready. The school office will share it.` : `Your ${label.toLowerCase()} is published. Open Results to see it.`, metadata: { termId: d.term.id, version } });
  }
  return { published: rows.length, held: rows.filter(r => r.held).length, version, notified };
}

// ── Errors ────────────────────────────────────────────────────────────────────

export function examError(e: { code?: string; message?: string } | null, fallback: string): NextResponse {
  const m = e?.message || '';
  if (e?.code === '42P01' || e?.code === 'PGRST205' || e?.code === 'PGRST202') return NextResponse.json({ error: 'Exams aren\'t in this database yet. They arrive with the exams migration.' }, { status: 503 });
  if (/marks sheet is not open/.test(m)) return NextResponse.json({ error: 'That marks sheet is submitted or locked. It has to be returned or reopened before marks change.' }, { status: 409 });
  if (/class term is published/.test(m)) return NextResponse.json({ error: 'This term is published for the class. The principal has to reopen it first.' }, { status: 409 });
  if (/marks above the maximum/.test(m)) return NextResponse.json({ error: 'A mark is above the maximum for the sheet.' }, { status: 400 });
  if (/another active scheme/.test(m)) return NextResponse.json({ error: 'Another active scheme already covers one of those classes this session. Archive it or take the class out of it first.' }, { status: 409 });
  if (/frozen|are kept/.test(m)) return NextResponse.json({ error: 'Published report cards can\'t be changed. Reopen the term and publish a revision.' }, { status: 409 });
  if (e?.code === '23505') return NextResponse.json({ error: /exam_assessments_scheme_id_code/.test(m) ? 'Another assessment in this scheme has that code.' : /exam_terms_scheme_id_seq/.test(m) ? 'Two terms can\'t have the same order.' : 'That already exists.' }, { status: 409 });
  if (e?.code === '23514') return NextResponse.json({ error: 'Some of those values aren\'t allowed. Check the marks, codes and dates.' }, { status: 400 });
  console.error('[exams]', e?.code, m);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function auditExam(db: Db, schoolId: string, actorId: string, actorRole: string, action: string, table: string, rowId: string, values: Record<string, unknown>) {
  const { error } = await db.from('audit_log').insert({ actor_id: actorId, actor_role: actorRole, action, table_name: table, row_id: rowId, school_id: schoolId, new_values: values });
  if (error) console.warn('[exams audit]', error.message);
}

/** A returned or reopened sheet undoes the class teacher's review of any term that draws on it. */
export async function reviewBackToOpen(db: Db, classId: string, assessmentId: string) {
  const { data: a } = await db.from('exam_assessments').select('code, scheme_id, term_id').eq('id', assessmentId).maybeSingle();
  if (!a) return;
  const { data: terms } = await db.from('exam_terms').select('id, components').eq('scheme_id', a.scheme_id);
  const termIds = (terms || []).filter((t: any) => t.id === a.term_id || (t.components || []).some((c: any) => (c.codes || []).includes(a.code))).map((t: any) => t.id);
  if (termIds.length) await db.from('exam_class_terms').update({ status: 'open', reviewed_at: null, reviewed_by: null }).eq('class_id', classId).in('term_id', termIds).eq('status', 'reviewed');
}
