/**
 * Ask the School OS (revamp of 2026-11-13): the protocol shared by the engine,
 * the API routes and the page. Pure, so it is unit-tested.
 *
 * One question runs in two steps:
 *   1. plan    a light model reads the question and picks up to four live lookups
 *              from the catalogue this person may use (parsePlan keeps only those)
 *   2. answer  the server runs the lookups (each checks the person's permissions),
 *              then the model answers from the brief plus the lookups, citing [n]
 *
 * Every block of data the model sees carries a source number. The answer cites
 * those numbers; parseAnswer keeps only cited sources, renumbers them 1..k, and
 * records what each needs ("needs"), so a shared answer can be re-checked
 * against the colleague's own role.
 *
 * Privacy: people are tokens on the way to the model (students [[S1]], parents
 * [[P1]], staff [[T1]], a parent's children [[C1]]; conversations [[M1]], feed
 * items [[F1]]). Real names are put back on the server before anything is shown.
 */

// ── Who is asking ────────────────────────────────────────────────────────────
export type Viewer =
  | {
    kind: 'staff';
    id: string;
    name: string;
    schoolId: string;
    role: 'teacher' | 'admin';
    /** Teachers: classes they teach (normalised), class-teacher class included. */
    classes: string[];
    classTeacherOf: string;
    /** Office staff: their permissions (teachers have none). */
    perms: string[];
    /** "Teacher", "Principal", "Accountant · Cashier"… */
    label: string;
  }
  | { kind: 'parent'; id: string; name: string; schoolId: string; childIds: string[] };

/** Pure stand-in for normClass (lib/teacher/scope), so this file has no server imports. */
export const normCls = (c: string | null | undefined) => (c || '').toLowerCase().replace(/class|[^a-z0-9]/g, '');

const CLASS_READERS = ['academics.read', 'attendance.read', 'students.read'];

/**
 * Whether this viewer may see data that needed `need`:
 *   perm:<p>        an office permission
 *   class:<cls>     a class's records: a teacher of that class, or office staff who read classes
 *   child:<id>      one child's records: that child's parent (parents never receive shares)
 *   staff           anyone on the school's staff (timetable)
 *   school          anyone in the school (the calendar)
 *   self            only the person who asked
 *   a|b             either (e.g. self|perm:academics.read)
 */
export function canSee(need: string, v: Viewer, askerId?: string): boolean {
  if (need.includes('|')) return need.split('|').some(n => canSee(n, v, askerId));
  if (need === 'self') return !!askerId && v.id === askerId;
  if (need === 'school') return true;
  if (need === 'staff') return v.kind === 'staff';
  const [kind, val] = [need.slice(0, need.indexOf(':')), need.slice(need.indexOf(':') + 1)];
  if (v.kind === 'parent') return kind === 'child' && v.childIds.includes(val);
  if (kind === 'perm') return v.perms.includes(val);
  if (kind === 'class') return v.classes.includes(normCls(val)) || v.perms.some(p => CLASS_READERS.includes(p));
  return false;
}
export const canSeeAll = (needs: string[], v: Viewer, askerId?: string) => needs.every(n => canSee(n, v, askerId));

// ── Lookups ─────────────────────────────────────────────────────────────────
export type ToolKey =
  | 'student' | 'class' | 'attendance' | 'homework' | 'fees' | 'admissions' | 'staff' | 'exams' | 'timetable' | 'calendar'
  | 'child' | 'child_attendance' | 'child_timetable';

export interface ToolSpec {
  key: ToolKey;
  /** What the planner reads. */
  use: string;
  /** Argument names and what they hold. */
  args: Record<string, string>;
  /** "Looked up" label shown to the person. */
  label: string;
}

const DATE = 'YYYY-MM-DD, optional';
export const TOOLS: Record<ToolKey, ToolSpec> = {
  student: { key: 'student', label: 'student record', use: 'one student in depth: mastery by subject and chapter with the trend, homework handed in, attendance, fees and exam marks (each only where this person may see it)', args: { student: 'student token like [[S3]]', from: DATE, to: DATE } },
  class: { key: 'class', label: 'class overview', use: 'one class: mastery by subject and the weekly trend, weakest chapters, homework hand-in rate and attendance by week, the students lowest first', args: { class: 'class like 9-B', subject: 'subject, optional' } },
  attendance: { key: 'attendance', label: 'attendance register', use: 'attendance by class and by day over a date range, and who was absent most', args: { class: 'class like 9-B, optional (all classes this person may see)', from: DATE, to: DATE } },
  homework: { key: 'homework', label: 'homework hand-ins', use: 'homework and classwork set over recent weeks: handed in, missing, overdue, waiting to be marked', args: { class: 'class, optional', subject: 'subject, optional', weeks: 'number of weeks back, 1-12, optional' } },
  fees: { key: 'fees', label: 'fee ledger', use: 'fees: collection, overdue by class and ageing, the families most overdue, reminders sent', args: { class: 'class or grade, optional', min_days: 'only overdue at least this many days, optional' } },
  admissions: { key: 'admissions', label: 'admissions pipeline', use: 'admissions: the funnel, applicants by grade and stage, idle applicants', args: { grade: 'grade number, optional', stage: 'stage name, optional' } },
  staff: { key: 'staff', label: 'staff and leave', use: 'teachers: marking backlog, activity, classes, leave taken and pending', args: { teacher: 'staff token like [[T2]], optional (all teachers)' } },
  exams: { key: 'exams', label: 'exam marks', use: 'exam and assessment marks by class and subject: averages, highest and lowest, who is below 33%', args: { class: 'class, optional', subject: 'subject, optional' } },
  timetable: { key: 'timetable', label: 'timetable', use: 'the published timetable for a class or a teacher', args: { class: 'class, optional', teacher: 'staff token, optional (default: the person asking, if a teacher)' } },
  calendar: { key: 'calendar', label: 'school calendar', use: 'exams, holidays and events on the school calendar', args: { from: DATE, to: DATE } },
  child: { key: 'child', label: 'mastery trend', use: "a child's mastery by subject week by week (the trend), and the chapters behind it", args: { child: 'child token like [[C1]]' } },
  child_attendance: { key: 'child_attendance', label: 'attendance', use: "a child's attendance day by day over a date range", args: { child: 'child token', from: DATE, to: DATE } },
  child_timetable: { key: 'child_timetable', label: 'timetable', use: "the child's class timetable", args: { child: 'child token' } },
};

const ANY = (v: Viewer, ...p: string[]) => v.kind === 'staff' && p.some(x => v.perms.includes(x));
const TEACHER = (v: Viewer) => v.kind === 'staff' && v.role === 'teacher';

/** The lookups this viewer may ask for. The runners check again, row by row. */
export function toolsFor(v: Viewer): ToolKey[] {
  if (v.kind === 'parent') return ['child', 'child_attendance', 'child_timetable', 'calendar'];
  const out: ToolKey[] = [];
  if (TEACHER(v) || ANY(v, 'students.read', 'academics.read', 'attendance.read', 'fees.read', 'exams.read')) out.push('student');
  if (TEACHER(v) || ANY(v, 'academics.read')) out.push('class', 'homework');
  if (TEACHER(v) || ANY(v, 'attendance.read')) out.push('attendance');
  if (ANY(v, 'fees.read')) out.push('fees');
  if (ANY(v, 'admissions.read')) out.push('admissions');
  if (ANY(v, 'workforce.read')) out.push('staff');
  if (TEACHER(v) || ANY(v, 'exams.read')) out.push('exams');
  out.push('timetable', 'calendar');
  return out;
}

export interface PlannedLookup { tool: ToolKey; args: Record<string, string> }

const s = (v: unknown, n = 4000) => (typeof v === 'string' ? v.trim().slice(0, n) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

/** The planner's JSON -> at most four lookups this viewer may run, with string arguments only. */
export function parsePlan(raw: unknown, allowed: ToolKey[]): PlannedLookup[] {
  const r = (raw ?? {}) as any;
  const out: PlannedLookup[] = [];
  for (const l of Array.isArray(r.lookups) ? r.lookups.slice(0, 6) : []) {
    const tool = s(l?.tool, 30) as ToolKey;
    if (!allowed.includes(tool)) continue;
    const args: Record<string, string> = {};
    for (const k of Object.keys(TOOLS[tool].args)) { const v = s(l?.args?.[k], 80); if (v) args[k] = v; }
    if (out.some(o => o.tool === tool && JSON.stringify(o.args) === JSON.stringify(args))) continue;
    out.push({ tool, args });
    if (out.length === 4) break;
  }
  return out;
}

export const isDay = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// ── Sources ─────────────────────────────────────────────────────────────────
export interface SourceDef { label: string; detail: string; href: string | null; need: string }
/** Numbered as the model sees them: [1], [2]… */
export class Sources {
  readonly list: SourceDef[] = [];
  add(d: SourceDef): number {
    const i = this.list.findIndex(x => x.label === d.label && x.detail === d.detail && x.href === d.href);
    if (i >= 0) return i + 1;
    this.list.push(d);
    return this.list.length;
  }
}

// ── The answer ──────────────────────────────────────────────────────────────
export type Tone = 'g' | 'a' | 'r' | 'b' | 'n';
export interface AskQuestion { id: string; question: string; options: string[] }
export interface AskFact { label: string; value: string; tone: Tone }
export interface AskTable { title: string; columns: string[]; rows: string[][]; note: string }
export interface AskChart { title: string; unit: '%' | '₹' | ''; points: { label: string; value: number; warn: boolean }[] }
export interface AskSource { n: number; label: string; detail: string; href: string | null }
export type AskAction =
  | { kind: 'open'; href: string; label: string }
  | { kind: 'reply'; threadId: string; toName: string; subject: string; draft: string }
  | { kind: 'ack'; situationId: string; title: string; note: string }
  | { kind: 'message'; audience: 'teacher' | 'office'; to: string | null; toName: string; childId: string | null; topic: string; subject: string; draft: string };

export interface AskReply {
  say: string;
  ask: AskQuestion[];
  facts: AskFact[];
  table: AskTable | null;
  chart: AskChart | null;
  sources: AskSource[];
  actions: AskAction[];
  suggestions: string[];
  /** The live lookups that ran ("Looked up …"). */
  lookups: string[];
}

/** Rows a reply/ack/message action may point at (from the brief); anything else is dropped. */
export interface ActionBook {
  threads: Map<string, { id: string; label: string; subject: string }>;
  items: Map<string, { id: string; title: string }>;
  /** Parent: T tokens -> teacher, C tokens -> child. */
  staff: Map<string, { id: string; name: string }>;
  children: Map<string, { id: string; name: string }>;
  /** Pages an "open" action may name -> link. */
  pages: Record<string, { href: string; label: string }>;
}
export const emptyActionBook = (pages: ActionBook['pages'] = {}): ActionBook => ({ threads: new Map(), items: new Map(), staff: new Map(), children: new Map(), pages });

const list = (v: unknown, n = 4, len = 160) => (Array.isArray(v) ? v.map(x => s(x, len)).filter(Boolean).slice(0, n) : []);
const tok = (v: unknown) => s(v, 20).replace(/^\[\[|\]\]$/g, '');
const TOPICS = ['general', 'academics', 'homework', 'wellbeing', 'fees', 'meeting', 'leave'];

function num(v: unknown): number | null {
  const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[₹,%\s]/g, '')) : NaN;
  return Number.isFinite(x) ? x : null;
}

/**
 * Raw model JSON -> the answer people see. Keeps cited sources only, renumbers
 * them 1..k in the order first cited, and returns what they need.
 */
export function parseAnswer(raw: unknown, sources: Sources, book: ActionBook, lookups: string[]): { reply: AskReply; needs: string[] } {
  const r = (raw ?? {}) as any;
  let say = s(r.say, 5000);
  const ask = (Array.isArray(r.ask) ? r.ask : []).slice(0, 1).map((q: any, i: number) => ({
    id: s(q?.id, 30) || `q${i + 1}`, question: s(q?.question, 240), options: list(q?.options, 5, 100),
  })).filter((q: AskQuestion) => q.question && q.options.length >= 2);
  const facts = (Array.isArray(r.facts) ? r.facts : []).slice(0, 4).map((f: any) => ({
    label: s(f?.label, 70), value: s(f?.value, 40), tone: (['g', 'a', 'r', 'b', 'n'].includes(f?.tone) ? f.tone : 'n') as Tone,
  })).filter((f: AskFact) => f.label && f.value);

  let table: AskTable | null = null;
  if (r.table && Array.isArray(r.table.columns) && Array.isArray(r.table.rows)) {
    const columns = list(r.table.columns, 6, 40);
    const rows = r.table.rows.slice(0, 15).filter(Array.isArray).map((row: unknown[]) => columns.map((_, i) => s(row[i], 80)))
      .filter((row: string[]) => row.some(Boolean));
    if (columns.length >= 2 && rows.length) table = { title: s(r.table.title, 100), columns, rows, note: s(r.table.note, 200) };
  }
  let chart: AskChart | null = null;
  if (r.chart && Array.isArray(r.chart.points)) {
    const points = r.chart.points.slice(0, 14).map((p: any) => ({ label: s(p?.label, 24), value: num(p?.value), warn: !!p?.warn }))
      .filter((p: any) => p.label && p.value !== null) as AskChart['points'];
    const unit = ['%', '₹'].includes(r.chart.unit) ? r.chart.unit : '';
    if (points.length >= 2) chart = { title: s(r.chart.title, 100), unit, points };
  }

  // Citations: [n] in the answer and the table note. Unknown numbers are removed.
  const order: number[] = [];
  const cite = (text: string) => text.replace(/\[(\d{1,2})\]/g, (m, d: string) => {
    const n = Number(d);
    if (n < 1 || n > sources.list.length) return '';
    if (!order.includes(n)) order.push(n);
    return `[${order.indexOf(n) + 1}]`;
  });
  say = cite(say);
  if (table) table.note = cite(table.note);
  for (const n of Array.isArray(r.used) ? r.used : []) { const x = num(n); if (x && x >= 1 && x <= sources.list.length && !order.includes(x)) order.push(x); }
  const used = order.map(n => sources.list[n - 1]);
  const out: AskSource[] = used.map((d, i) => ({ n: i + 1, label: d.label, detail: d.detail, href: d.href }));

  const actions: AskAction[] = [];
  for (const a of Array.isArray(r.actions) ? r.actions.slice(0, 5) : []) {
    if (a?.kind === 'open' && typeof a.page === 'string' && book.pages[a.page]) {
      if (actions.filter(x => x.kind === 'open').length >= 2) continue;
      actions.push({ kind: 'open', href: book.pages[a.page].href, label: s(a.label, 40) || book.pages[a.page].label });
    } else if (a?.kind === 'reply') {
      const th = book.threads.get(tok(a.thread));
      const draft = s(a.draft, 1500);
      if (th && draft && !actions.some(x => x.kind === 'reply')) actions.push({ kind: 'reply', threadId: th.id, toName: th.label, subject: th.subject, draft });
    } else if (a?.kind === 'ack') {
      const it = book.items.get(tok(a.item));
      if (it && !actions.some(x => x.kind === 'ack' && x.situationId === it.id)) actions.push({ kind: 'ack', situationId: it.id, title: it.title, note: s(a.note, 300) });
    } else if (a?.kind === 'message' && !actions.some(x => x.kind === 'message')) {
      const draft = s(a.draft, 1500);
      const subject = s(a.subject, 140) || 'A question';
      const child = book.children.get(tok(a.child));
      const teacher = book.staff.get(tok(a.to));
      const topic = TOPICS.includes(a.topic) ? a.topic : 'general';
      if (!draft) continue;
      actions.push(teacher
        ? { kind: 'message', audience: 'teacher', to: teacher.id, toName: teacher.name, childId: child?.id ?? null, topic, subject, draft }
        : { kind: 'message', audience: 'office', to: null, toName: 'School office', childId: child?.id ?? null, topic, subject, draft });
    }
  }
  const needs = [...new Set(used.map(d => d.need))];
  return {
    reply: { say, ask, facts, table, chart, sources: out, actions, suggestions: list(r.suggestions, 4, 120), lookups: lookups.slice(0, 6) },
    needs,
  };
}

/** A shared answer the colleague may not fully see: the text goes, the sources' labels stay so they know why. */
export function blankReply(reply: AskReply): AskReply {
  return {
    say: 'Part of this answer uses records your role can’t see, so it is hidden. Ask the colleague who shared it, or ask the School OS yourself.',
    ask: [], facts: [], table: null, chart: null, actions: [], suggestions: [], lookups: [],
    sources: reply.sources.map(x => ({ ...x, href: null })),
  };
}

export const titleOf = (t: string) => {
  const x = t.replace(/\s+/g, ' ').trim();
  return (x.length > 80 ? `${x.slice(0, 79).trimEnd()}…` : x) || 'New conversation';
};

/** The JSON a stored reply came back as (older rows may lack newer fields). */
export function readReply(v: unknown): AskReply | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as any;
  return {
    say: s(r.say, 6000), ask: Array.isArray(r.ask) ? r.ask : [], facts: Array.isArray(r.facts) ? r.facts : [],
    table: r.table ?? null, chart: r.chart ?? null, sources: Array.isArray(r.sources) ? r.sources : [],
    actions: Array.isArray(r.actions) ? r.actions : [], suggestions: Array.isArray(r.suggestions) ? r.suggestions : [],
    lookups: Array.isArray(r.lookups) ? r.lookups : [],
  };
}

// ── Today for you ───────────────────────────────────────────────────────────
export interface TodayTile {
  key: string;
  tone: Tone;
  icon: 'warn' | 'clock' | 'mail' | 'chart' | 'check' | 'money' | 'people' | 'calendar';
  label: string;
  value: string;
  detail: string;
  /** What "Ask about this" sends. */
  ask: string;
  href: string | null;
  /** Higher shows first. */
  weight: number;
}
export const topTiles = (tiles: TodayTile[], n = 4) => [...tiles].sort((a, b) => b.weight - a.weight).slice(0, n);

/** Indian rupees, short: 4,80,000 -> ₹4.8 L; 2,16,00,000 -> ₹2.16 Cr. */
export function inrShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${+(n / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${+(n / 1e5).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
