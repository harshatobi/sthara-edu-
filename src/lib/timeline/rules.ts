/**
 * The unified timeline (Living Record brief 08): one student across every year, filtered by who is looking. Pure, no
 * I/O: src/lib/timeline/server.ts loads only the sources the viewer's lens allows, and this shapes them into a
 * year-by-year summary and each year's events. Shaping checks the lens again, so a source loaded by mistake still
 * never reaches the screen, the student file or the AI.
 */
import { mapMasteryBand } from '@/lib/tml/engine';
import { fmtDate, inr, plural } from '@/lib/admin/format';
import { normSubject } from '@/lib/teacher/scope';
import { topicKey } from '@/lib/teacher/topicKey';
import { ACTION_LABEL, CASE_LABEL, archived, parentSees, type ActionKind, type CaseStatus } from '@/lib/conduct/rules';
import { OUTCOME_LABEL, type Outcome } from '@/lib/students/register';
import { CATEGORY_LABEL, LEVEL_LABEL, placeOf, type Category, type Level, type Position } from '@/lib/cocurricular/kirti';
import { docLabel } from '@/lib/students/documents';

export const SOURCES = ['enrolment', 'before', 'attendance', 'results', 'tml', 'homework', 'fees', 'kirti', 'certificates', 'documents', 'health', 'discipline', 'incidents', 'counselling', 'wellness'] as const;
export type Source = typeof SOURCES[number];
export const SOURCE_LABEL: Record<Source, string> = {
  enrolment: 'Class', before: 'Before joining', attendance: 'Attendance', results: 'Results', tml: 'Mastery (TML)', homework: 'Homework',
  fees: 'Fees', kirti: 'Kirti', certificates: 'Certificates', documents: 'Documents', health: 'Health', discipline: 'Discipline',
  incidents: 'Incidents', counselling: 'Counselling', wellness: 'Wellbeing',
};

export type Who = 'office' | 'class_teacher' | 'subject_teacher' | 'parent' | 'student';
export interface Lens {
  who: Who;
  sources: Source[];
  /** A subject teacher's subjects; null = every subject. */
  subjects: string[] | null;
  /** Past sessions' warnings and detentions (discipline.archive). */
  archive: boolean;
  /** May print the student file. */
  print: boolean;
}

// ── Who sees what (decided with Moses, brief 08) ─────────────────────────────
interface OfficeAccess { can(p: string): boolean; roles: readonly string[] }

/** An office account: each source follows the permission that already guards it elsewhere. Child protection never. */
export function officeLens(a: OfficeAccess): Lens | null {
  if (!a.can('students.read') && !a.can('counselling.notes') && !a.can('health.read')) return null;
  const s: Source[] = ['enrolment'];
  const add = (src: Source, ok: boolean) => { if (ok) s.push(src); };
  add('before', a.can('students.read'));
  add('attendance', a.can('attendance.read'));
  add('results', a.can('exams.read'));
  add('tml', a.can('academics.read'));
  add('homework', a.can('academics.read'));
  add('fees', a.can('fees.read'));
  add('kirti', a.can('students.read'));
  add('certificates', a.can('students.read'));
  add('documents', a.can('students.read') || a.can('health.read'));
  add('health', a.can('health.read'));
  add('discipline', a.can('discipline.approve') || a.can('discipline.suspend') || a.can('discipline.archive'));
  add('incidents', a.can('incidents.manage'));
  add('counselling', a.can('counselling.overview') || a.can('counselling.notes'));
  add('wellness', a.can('counselling.notes') || a.roles.includes('principal'));
  return { who: 'office', sources: s, subjects: null, archive: a.can('discipline.archive'), print: true };
}

/**
 * A teacher: the class teacher of the student's class sees the teaching side; a subject teacher sees attendance and
 * their own subjects. Anyone else, nothing.
 */
export function teacherLens(t: { teacherClass: string | null; scope: { cls: string; subject: string }[] }, studentClass: string | null, norm: (c: string | null | undefined) => string): Lens | null {
  if (!studentClass) return null;
  const cls = norm(studentClass);
  if (t.teacherClass && norm(t.teacherClass) === cls) {
    return { who: 'class_teacher', sources: ['enrolment', 'attendance', 'results', 'tml', 'homework', 'kirti', 'discipline'], subjects: null, archive: false, print: false };
  }
  const subjects = [...new Set(t.scope.filter(e => norm(e.cls) === cls && e.subject).map(e => e.subject))];
  if (!subjects.length) return null;
  return { who: 'subject_teacher', sources: ['enrolment', 'attendance', 'results', 'tml', 'homework'], subjects, archive: false, print: false };
}

export const parentLens = (): Lens => ({
  who: 'parent', sources: ['enrolment', 'before', 'attendance', 'results', 'tml', 'homework', 'fees', 'kirti', 'certificates', 'discipline', 'documents', 'health'],
  subjects: null, archive: false, print: true,
});
export const studentLens = (): Lens => ({
  who: 'student', sources: ['enrolment', 'before', 'attendance', 'results', 'tml', 'homework', 'kirti', 'certificates', 'documents', 'health', 'wellness'],
  subjects: null, archive: false, print: false,
});

export const sees = (lens: Lens, s: Source) => lens.sources.includes(s);
const subjectOk = (lens: Lens, subject: string | null | undefined) => !lens.subjects || lens.subjects.some(x => normSubject(x) === normSubject(subject));

// ── Sessions ─────────────────────────────────────────────────────────────────
/** "2026-27" for a YYYY-MM-DD day (or timestamp), when the school year starts in startMonth. */
export function sessionOfDay(day: string, startMonth = 4): string {
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7));
  const s = m >= startMonth ? y : y - 1;
  return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
}
/** The first day after the session (exclusive end). */
export const sessionEnd = (session: string, startMonth = 4) => `${Number(session.slice(0, 4)) + 1}-${String(startMonth).padStart(2, '0')}-01`;

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`;
};
const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null);
const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '');

// ── Rows (what the server loads) ─────────────────────────────────────────────
export interface Rows {
  student: { previousSchool: string | null; previousClass: string | null; previousTcNo: string | null; previousStatus: string | null; admittedOn: string | null };
  startMonth: number;
  currentSession: string;
  today: string;
  enrolments: { session: string; class_name: string | null; roll_no: string | null; starts_on: string | null; ends_on: string | null; end_reason: string | null; outcome: string | null; published_at: string | null }[];
  attendance: { months: { month: string; present: number; absent: number; late: number; excused: number; marked: number }[]; runs: { from: string; to: string; days: number }[] } | null;
  cards: { session: string; publishedAt: string | null; term: { name: string; seq: number } | null; aggregate: { pct: number; grade: string | null } | null; result: { status: string } | null; subjects: { name: string; final: { pct: number; grade: string | null } | null; terms: { total: number | null; outOf: number; grade: string | null }[] }[] }[];
  tml: { subject: string; topic_name: string; score: number | string; computed_at: string }[];
  work: { id: string; subject: string | null; title: string | null; due_date: string | null; created_at: string | null }[];
  subs: { assignment_id: string; score: number | string | null; max_score: number | string | null; teacher_approved: boolean | null; submitted_at: string | null }[];
  invoices: { id: string; session: string; amount: number | string; concession: number | string | null }[];
  payments: { invoice_id: string; amount: number | string; paid_on: string; receipt_no: string | null }[];
  kirti: { on_date: string; title: string; category: string; level: string; position: string; position_note: string | null }[];
  certificates: { issued_on: string; number: string | null; title: string }[];
  documents: { kind: string; title: string | null; on: string }[];
  health: { kind: string; on_date: string }[];
  discipline: { kind: ActionKind; on_date: string; until_date: string | null; reason: string; status: 'proposed' | 'approved' | 'returned' | 'cancelled'; session: string }[];
  incidents: { occurred_at: string; category: string; summary: string }[];
  counselling: { opened_on: string; closed_on: string | null; status: CaseStatus }[];
  wellness: { created_at: string; mood: string | null; energy: number | null }[];
}

export const emptyRows = (over: Partial<Rows> = {}): Rows => ({
  student: { previousSchool: null, previousClass: null, previousTcNo: null, previousStatus: null, admittedOn: null },
  startMonth: 4, currentSession: '2026-27', today: '2026-10-24',
  enrolments: [], attendance: null, cards: [], tml: [], work: [], subs: [], invoices: [], payments: [], kirti: [], certificates: [],
  documents: [], health: [], discipline: [], incidents: [], counselling: [], wellness: [], ...over,
});

// ── The shape ────────────────────────────────────────────────────────────────
export type Tone = 'g' | 'a' | 'r' | 'b' | 'n';
export interface TimelineEvent { on: string; kind: Source; title: string; detail: string | null; tone: Tone }
export interface Band { score: number; band: string; color: string }
/** One school year. A field is left out when the viewer may not see that source, null when there is nothing. */
export interface Year {
  session: string;
  cls: string | null;
  outcome?: string | null;
  attendance?: { pct: number | null; marked: number; absent: number } | null;
  results?: { term: string; pct: number | null; grade: string | null; status: string | null; subjects: { name: string; pct: number | null; grade: string | null }[] } | null;
  tml?: (Band & { subjects: (Band & { subject: string })[] }) | null;
  homework?: { set: number; done: number; avg: number | null } | null;
  fees?: { billed: number; paid: number; due: number } | null;
  kirti?: number;
  certificates?: number;
  discipline?: number;
  incidents?: number;
  counselling?: string | null;
  wellness?: { checkins: number; low: number } | null;
}
export interface Before { school: string | null; cls: string | null; tcNo: string | null; admittedOn: string | null }
export interface Timeline { who: Who; sources: Source[]; subjects: string[] | null; print: boolean; before: Before | null; years: Year[] }

const bandOf = (score: number | null): Band | null => {
  const b = mapMasteryBand(score);
  return b && score !== null ? { score, band: b.band, color: b.color } : null;
};

/** Each source's rows, after the lens: anything the viewer may not see is dropped here. */
function visible(rows: Rows, lens: Lens) {
  const on = (s: Source) => sees(lens, s);
  const discipline = !on('discipline') ? [] : rows.discipline.filter(a => {
    if (lens.who === 'parent') return parentSees(a, rows.currentSession);
    if (a.status !== 'approved') return false;
    return lens.archive || !archived(a, rows.currentSession);
  });
  const cardSubjects = (c: Rows['cards'][number]) => c.subjects.filter(s => subjectOk(lens, s.name));
  return {
    enrolments: rows.enrolments,
    attendance: on('attendance') ? rows.attendance : null,
    cards: on('results') ? rows.cards.map(c => ({ ...c, subjects: cardSubjects(c) })).filter(c => !lens.subjects || c.subjects.length) : [],
    tml: on('tml') ? rows.tml.filter(r => subjectOk(lens, r.subject) && Number.isFinite(Number(r.score))) : [],
    work: on('homework') ? rows.work.filter(w => subjectOk(lens, w.subject)) : [],
    invoices: on('fees') ? rows.invoices : [],
    kirti: on('kirti') ? rows.kirti : [],
    certificates: on('certificates') ? rows.certificates : [],
    documents: on('documents') ? rows.documents : [],
    health: on('health') ? rows.health : [],
    discipline,
    incidents: on('incidents') ? rows.incidents.filter(i => i.category !== 'child_protection') : [],
    counselling: on('counselling') ? rows.counselling : [],
    wellness: on('wellness') ? rows.wellness : [],
  };
}
type Visible = ReturnType<typeof visible>;

const LOW = (w: { mood: string | null; energy: number | null }) => w.mood === 'Low' || (w.energy !== null && w.energy <= 2);

/** The latest snapshot per topic up to `before`, then the mean per subject and overall. */
function tmlAt(rows: Visible['tml'], before: string): Year['tml'] {
  const latest = new Map<string, Visible['tml'][number]>();
  for (const r of rows) {
    if (r.computed_at >= before) continue;
    const k = `${normSubject(r.subject)}::${topicKey(r.topic_name)}`;
    const p = latest.get(k);
    if (!p || r.computed_at > p.computed_at) latest.set(k, r);
  }
  if (!latest.size) return null;
  const bySubject = new Map<string, { name: string; scores: number[] }>();
  for (const r of latest.values()) {
    const k = normSubject(r.subject);
    const e = bySubject.get(k) ?? { name: r.subject, scores: [] };
    e.scores.push(Number(r.score));
    bySubject.set(k, e);
  }
  const subjects = [...bySubject.values()].map(e => ({ subject: e.name, ...bandOf(mean(e.scores))! })).sort((a, b) => a.subject.localeCompare(b.subject));
  const overall = bandOf(mean(subjects.map(s => s.score)));
  return overall ? { ...overall, subjects } : null;
}

function homeworkOf(work: Visible['work'], subs: Rows['subs'], today: string) {
  const sub = new Map(subs.map(s => [s.assignment_id, s]));
  return work.map(w => {
    const due = day(w.due_date) || day(w.created_at);
    const s = sub.get(w.id);
    const graded = !!s && s.teacher_approved === true && s.score !== null && Number(s.max_score) > 0;
    return { id: w.id, due, past: !!due && due <= today, done: !!s, pct: graded ? Math.round((Number(s!.score) / Number(s!.max_score)) * 100) : null };
  }).filter(w => w.due);
}

function feesOf(invoices: Visible['invoices'], payments: Rows['payments']) {
  const paidOn = new Map<string, number>();
  for (const p of payments) paidOn.set(p.invoice_id, (paidOn.get(p.invoice_id) || 0) + Number(p.amount));
  return invoices.map(i => {
    const billed = Number(i.amount) - Number(i.concession || 0);
    return { session: i.session, billed, paid: paidOn.get(i.id) || 0 };
  });
}

/** The year-by-year summary, newest first, and anything recorded from before the student joined. */
export function shapeTimeline(rows: Rows, lens: Lens): Timeline {
  const v = visible(rows, lens);
  const sOf = (d: string) => sessionOfDay(d, rows.startMonth);
  const sessions = new Set<string>(v.enrolments.map(e => e.session));
  for (const m of v.attendance?.months || []) sessions.add(sOf(`${m.month}-01`));
  for (const c of v.cards) sessions.add(c.session);
  for (const r of v.tml) sessions.add(sOf(r.computed_at));
  for (const i of v.invoices) sessions.add(i.session);
  for (const k of v.kirti) sessions.add(sOf(k.on_date));
  for (const d of v.discipline) sessions.add(d.session);
  const hw = homeworkOf(v.work, rows.subs, rows.today);
  for (const w of hw) if (w.past) sessions.add(sOf(w.due));
  const fees = feesOf(v.invoices, rows.payments);
  const on = (s: Source) => sees(lens, s);

  const years: Year[] = [...sessions].filter(s => s <= rows.currentSession).sort().reverse().map(session => {
    const inYear = (d: string | null | undefined) => !!d && sOf(day(d)) === session;
    const enr = v.enrolments.filter(e => e.session === session).sort((a, b) => day(b.starts_on).localeCompare(day(a.starts_on)));
    const y: Year = { session, cls: enr[0]?.class_name ?? null };
    if (on('enrolment')) {
      const done = enr.find(e => e.published_at && e.outcome);
      y.outcome = done ? OUTCOME_LABEL[done.outcome as Outcome] ?? done.outcome : null;
    }
    if (on('attendance')) {
      const ms = (v.attendance?.months || []).filter(m => sOf(`${m.month}-01`) === session);
      const marked = ms.reduce((n, m) => n + m.marked, 0);
      y.attendance = marked ? { pct: Math.round((ms.reduce((n, m) => n + m.present + m.late, 0) / marked) * 100), marked, absent: ms.reduce((n, m) => n + m.absent, 0) } : null;
    }
    if (on('results')) {
      const card = v.cards.filter(c => c.session === session).sort((a, b) => (b.term?.seq ?? 0) - (a.term?.seq ?? 0))[0];
      y.results = card ? {
        term: card.term?.name ?? 'Report card',
        // A subject teacher sees their subjects' grades, not the whole card's aggregate.
        pct: lens.subjects ? null : card.aggregate?.pct ?? null,
        grade: lens.subjects ? null : card.aggregate?.grade ?? null,
        status: lens.subjects ? null : card.result?.status ?? null,
        subjects: card.subjects.map(s => {
          const last = s.terms[s.terms.length - 1];
          const p = s.final?.pct ?? (last && last.total !== null && last.outOf > 0 ? Math.round((last.total / last.outOf) * 100) : null);
          return { name: s.name, pct: p, grade: s.final?.grade ?? last?.grade ?? null };
        }),
      } : null;
    }
    if (on('tml')) y.tml = tmlAt(v.tml.filter(r => sOf(r.computed_at) <= session), sessionEnd(session, rows.startMonth));
    if (on('homework')) {
      const ws = hw.filter(w => w.past && sOf(w.due) === session);
      y.homework = ws.length ? { set: ws.length, done: ws.filter(w => w.done).length, avg: mean(ws.map(w => w.pct).filter((p): p is number => p !== null)) } : null;
    }
    if (on('fees')) {
      const fs = fees.filter(f => f.session === session);
      const billed = fs.reduce((n, f) => n + f.billed, 0), paid = fs.reduce((n, f) => n + f.paid, 0);
      y.fees = fs.length ? { billed, paid, due: Math.max(0, billed - paid) } : null;
    }
    if (on('kirti')) y.kirti = v.kirti.filter(k => inYear(k.on_date)).length;
    if (on('certificates')) y.certificates = v.certificates.filter(c => inYear(c.issued_on)).length;
    if (on('discipline')) y.discipline = v.discipline.filter(d => d.session === session).length;
    if (on('incidents')) y.incidents = v.incidents.filter(i => inYear(i.occurred_at)).length;
    if (on('counselling')) {
      const cs = v.counselling.filter(c => inYear(c.opened_on) || inYear(c.closed_on) || (c.opened_on < sessionEnd(session, rows.startMonth) && !c.closed_on));
      const last = cs.sort((a, b) => b.opened_on.localeCompare(a.opened_on))[0];
      y.counselling = last ? CASE_LABEL[last.status] : null;
    }
    if (on('wellness')) {
      const ws = v.wellness.filter(w => inYear(w.created_at));
      y.wellness = ws.length ? { checkins: ws.length, low: ws.filter(LOW).length } : null;
    }
    return y;
  });

  const st = rows.student;
  const cameFromElsewhere = !!st.previousSchool || st.previousStatus === 'other_school';
  return {
    who: lens.who, sources: lens.sources, subjects: lens.subjects, print: lens.print,
    before: sees(lens, 'before') && cameFromElsewhere ? { school: st.previousSchool, cls: st.previousClass, tcNo: st.previousTcNo, admittedOn: st.admittedOn } : null,
    years,
  };
}

/** One year's events, newest first. */
export function yearEvents(rows: Rows, lens: Lens, session: string): TimelineEvent[] {
  const v = visible(rows, lens);
  const sOf = (d: string) => sessionOfDay(d, rows.startMonth);
  const inYear = (d: string | null | undefined) => !!d && sOf(day(d)) === session;
  const out: TimelineEvent[] = [];
  const push = (on: string, kind: Source, title: string, detail: string | null = null, tone: Tone = 'n') => out.push({ on: day(on), kind, title, detail, tone });

  if (sees(lens, 'enrolment')) {
    for (const e of v.enrolments.filter(x => x.session === session)) {
      if (e.starts_on) push(e.starts_on, 'enrolment', `In ${e.class_name || 'class not set'}`, e.roll_no ? `Roll number ${e.roll_no}` : null, 'b');
      if (e.ends_on && e.end_reason) push(e.ends_on, 'enrolment', `Left ${e.class_name || 'the class'}`, e.end_reason, 'n');
      if (e.published_at && e.outcome) push(e.published_at, 'enrolment', `Year result: ${OUTCOME_LABEL[e.outcome as Outcome] ?? e.outcome}`, null, e.outcome === 'promoted' || e.outcome === 'promoted_no_exam' ? 'g' : 'a');
    }
  }
  for (const m of (v.attendance?.months || []).filter(x => sOf(`${x.month}-01`) === session)) {
    const pct = m.marked ? Math.round(((m.present + m.late) / m.marked) * 100) : null;
    const bits = [m.absent ? `${m.absent} absent` : null, m.late ? `${m.late} late` : null, m.excused ? `${m.excused} excused` : null].filter(Boolean).join(', ');
    push(`${m.month}-01`, 'attendance', `Attendance in ${monthLabel(m.month)}: ${pct ?? '—'}%`, `${bits ? `${bits} of ` : ''}${plural(m.marked, 'school day')}`, pct === null ? 'n' : pct >= 90 ? 'g' : pct >= 75 ? 'a' : 'r');
  }
  for (const r of (v.attendance?.runs || []).filter(x => inYear(x.from))) {
    push(r.from, 'attendance', `Absent ${r.days} school days in a row`, `${fmtDate(r.from)} to ${fmtDate(r.to)}`, 'a');
  }
  for (const c of v.cards.filter(x => x.session === session && x.publishedAt)) {
    const head = lens.subjects
      ? c.subjects.map(s => { const g = s.final?.grade ?? s.terms[s.terms.length - 1]?.grade; return `${s.name}${g ? ` ${g}` : ''}`; }).join(', ')
      : c.aggregate ? `${c.aggregate.pct}%${c.aggregate.grade ? ` · ${c.aggregate.grade}` : ''}` : null;
    push(c.publishedAt!, 'results', `Report card: ${c.term?.name ?? 'term'}`, head, c.result?.status === 'pass' || lens.subjects ? 'b' : c.result ? 'a' : 'b');
  }
  if (sees(lens, 'tml')) {
    // The month-end mastery, one line a month the evidence changed.
    const months = [...new Set(v.tml.filter(r => inYear(r.computed_at)).map(r => r.computed_at.slice(0, 7)))].sort();
    for (const m of months) {
      const [y, mm] = m.split('-').map(Number);
      const end = `${mm === 12 ? y + 1 : y}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}-01`;
      const t = tmlAt(v.tml, end);
      if (t) push(`${m}-01`, 'tml', `Mastery at the end of ${monthLabel(m)}: ${t.score}% · ${t.band}`, t.subjects.map(s => `${s.subject} ${s.score}%`).join(', '), t.score >= 75 ? 'g' : t.score >= 50 ? 'a' : 'r');
    }
  }
  if (sees(lens, 'homework')) {
    const byMonth = new Map<string, ReturnType<typeof homeworkOf>>();
    for (const w of homeworkOf(v.work, rows.subs, rows.today).filter(x => x.past && sOf(x.due) === session)) {
      const k = w.due.slice(0, 7);
      byMonth.set(k, [...(byMonth.get(k) || []), w]);
    }
    for (const [m, ws] of byMonth) {
      const done = ws.filter(w => w.done).length;
      const avg = mean(ws.map(w => w.pct).filter((p): p is number => p !== null));
      push(`${m}-01`, 'homework', `Homework in ${monthLabel(m)}: ${done} of ${ws.length} handed in`, avg === null ? null : `Average ${avg}% where graded`, done === ws.length ? 'g' : done / ws.length >= 0.75 ? 'a' : 'r');
    }
  }
  if (sees(lens, 'fees')) {
    const mine = new Set(v.invoices.map(i => i.id));
    for (const p of rows.payments.filter(x => mine.has(x.invoice_id) && inYear(x.paid_on))) push(p.paid_on, 'fees', `Fees paid: ${inr(Number(p.amount))}`, p.receipt_no ? `Receipt ${p.receipt_no}` : null, 'g');
    const f = feesOf(v.invoices.filter(i => i.session === session), rows.payments);
    const due = f.reduce((n, x) => n + x.billed - x.paid, 0);
    if (f.length && due > 0 && session === rows.currentSession) push(rows.today, 'fees', `Fees outstanding: ${inr(due)}`, null, 'a');
  }
  for (const k of v.kirti.filter(x => inYear(x.on_date))) {
    push(k.on_date, 'kirti', k.title, [placeOf(k.position as Position, k.position_note), LEVEL_LABEL[k.level as Level] ?? k.level, CATEGORY_LABEL[k.category as Category] ?? k.category].filter(Boolean).join(' · '), 'g');
  }
  for (const c of v.certificates.filter(x => inYear(x.issued_on))) push(c.issued_on, 'certificates', `${c.title} issued`, c.number ? `No. ${c.number}` : null, 'b');
  for (const d of v.documents.filter(x => inYear(x.on))) push(d.on, 'documents', `${d.title || docLabel(d.kind)} on file`, null, 'n');
  for (const h of v.health.filter(x => inYear(x.on_date))) push(h.on_date, 'health', h.kind === 'vaccination' ? 'Vaccination recorded' : 'Health check-up', null, 'n');
  for (const a of v.discipline.filter(x => x.session === session)) {
    const dates = a.until_date && a.until_date !== a.on_date ? `${fmtDate(a.on_date)} to ${fmtDate(a.until_date)}` : null;
    push(a.on_date, 'discipline', ACTION_LABEL[a.kind], [dates, a.reason].filter(Boolean).join(': '), a.kind === 'suspension' ? 'r' : 'a');
  }
  for (const i of v.incidents.filter(x => inYear(x.occurred_at))) push(i.occurred_at, 'incidents', `Incident: ${i.category.replace(/_/g, ' ')}`, i.summary, 'a');
  for (const c of v.counselling) {
    if (inYear(c.opened_on)) push(c.opened_on, 'counselling', 'Counselling began', null, 'b');
    if (c.closed_on && inYear(c.closed_on)) push(c.closed_on, 'counselling', c.status === 'referred' ? 'Referred outside the school' : 'Counselling closed', null, 'n');
  }
  if (sees(lens, 'wellness')) {
    const byMonth = new Map<string, Visible['wellness']>();
    for (const w of v.wellness.filter(x => inYear(x.created_at))) byMonth.set(w.created_at.slice(0, 7), [...(byMonth.get(w.created_at.slice(0, 7)) || []), w]);
    for (const [m, ws] of byMonth) {
      const low = ws.filter(LOW).length;
      push(`${m}-01`, 'wellness', `Wellbeing in ${monthLabel(m)}: ${plural(ws.length, 'check-in')}`, low ? `${plural(low, 'low day')}` : 'No low days', low >= 3 ? 'a' : 'n');
    }
  }
  return out.sort((a, b) => b.on.localeCompare(a.on) || SOURCES.indexOf(a.kind) - SOURCES.indexOf(b.kind));
}

/** A compact, name-free text of the summary for Ask the School OS, within the viewer's lens. */
export function timelineText(t: Timeline): string {
  const lines: string[] = [];
  if (t.before) lines.push(`Before joining: ${[t.before.school, t.before.cls && `last class ${t.before.cls}`, t.before.admittedOn && `admitted ${t.before.admittedOn}`].filter(Boolean).join(', ')}`);
  for (const y of t.years) {
    const bits: string[] = [`${y.session}: ${y.cls ?? 'class not recorded'}`];
    if (y.outcome) bits.push(`result ${y.outcome}`);
    if (y.attendance) bits.push(`attendance ${y.attendance.pct}% (${y.attendance.absent} absent of ${y.attendance.marked} days)`);
    if (y.results) bits.push(`${y.results.term} report card${y.results.pct !== null ? ` ${y.results.pct}%${y.results.grade ? ` ${y.results.grade}` : ''}` : ''}${y.results.subjects.length ? ` [${y.results.subjects.map(s => `${s.name} ${s.grade ?? (s.pct !== null ? `${s.pct}%` : '—')}`).join('; ')}]` : ''}`);
    if (y.tml) bits.push(`TML ${y.tml.score}% ${y.tml.band} [${y.tml.subjects.map(s => `${s.subject} ${s.score}%`).join('; ')}]`);
    if (y.homework) bits.push(`homework ${y.homework.done}/${y.homework.set} handed in${y.homework.avg !== null ? `, average ${y.homework.avg}%` : ''}`);
    if (y.fees) bits.push(`fees billed ${inr(y.fees.billed)}, paid ${inr(y.fees.paid)}, due ${inr(y.fees.due)}`);
    if (y.kirti !== undefined) bits.push(`${plural(y.kirti, 'Kirti entry', 'Kirti entries')}`);
    if (y.discipline !== undefined) bits.push(`${plural(y.discipline, 'discipline action')}`);
    if (y.incidents !== undefined) bits.push(`${plural(y.incidents, 'incident')}`);
    if (y.counselling) bits.push(`counselling ${y.counselling.toLowerCase()}`);
    if (y.wellness) bits.push(`${y.wellness.checkins} wellbeing check-ins, ${y.wellness.low} low`);
    lines.push(bits.join('; '));
  }
  return lines.join('\n') || 'Nothing recorded yet.';
}
