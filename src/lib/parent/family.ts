/**
 * Parent portal view model + pure shaping from database rows. No I/O here:
 * src/lib/parent/load.ts fetches (server side, verified guardians only) and
 * this turns rows into what the parent pages, the Ask engine and WhatsApp use.
 */
import { mapMasteryBand, type MasteryBand } from '@/lib/tml/engine';
import { shapeInvoice, type Invoice } from '@/lib/admin/fees';
import { normClass, normSubject } from '@/lib/teacher/scope';
import { topicKey } from '@/lib/teacher/desk';

export const DAY = 86_400_000;
const ts = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() || 0 : 0);
const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null);
const num = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

export interface Band { band: MasteryBand; color: string }
export const bandOf = (v: number | null): Band | null => {
  const b = mapMasteryBand(v);
  return b ? { band: b.band, color: b.color } : null;
};

export interface ChapterScore {
  name: string;
  score: number;
  /** firm / provisional / insufficient. */
  confidence: string | null;
  homework: number | null;
  quiz: number | null;
  tutor: number | null;
  items: number;
  at: string | null;
}

export interface SubjectScore {
  subject: string;
  /** Mean of the latest snapshot per chapter. */
  score: number | null;
  /** Same measure three weeks ago (chapters that had evidence then); null if there was none. */
  was: number | null;
  /**
   * Like-for-like change over three weeks: today's mean minus the mean then, over only the
   * chapters that had evidence both times (a new strong chapter must not hide a falling one).
   */
  delta: number | null;
  chapters: ChapterScore[];
  teacher: StaffRef | null;
}

export interface WorkItem {
  id: string;
  title: string;
  type: 'homework' | 'quiz' | 'classwork' | string;
  subject: string;
  chapter: string | null;
  dueOn: string | null;
  setAt: string | null;
  state: 'todo' | 'overdue' | 'submitted' | 'graded';
  score: number | null;
  max: number | null;
  pct: number | null;
  note: string | null;
  submittedAt: string | null;
  teacher: StaffRef | null;
}

export interface StaffRef { id: string; name: string }

export interface Wellness {
  /** Parent consent for wellness check-ins (DPDP). Without it nothing is shown. */
  consented: boolean;
  checkins: number;
  avgEnergy: number | null;
  lowDays: number;
  latestEnergy: number | null;
  latestAt: string | null;
}

export interface Fees {
  outstanding: number;
  overdue: number;
  nextDue: Invoice | null;
  invoices: Invoice[];
}

export interface Child {
  id: string;
  name: string;
  firstName: string;
  cls: string;
  rollNo: string | null;
  relationship: string | null;
  tml: number | null;
  band: Band | null;
  subjects: SubjectScore[];
  work: WorkItem[];
  wellness: Wellness;
  fees: Fees;
  classTeacher: StaffRef | null;
  /** Every teacher this child has, with what they teach them. */
  teachers: (StaffRef & { subjects: string[]; classTeacher: boolean })[];
  consents: Record<string, boolean>;
}

export interface ThreadSummary {
  id: string;
  studentId: string;
  subject: string;
  topic: string;
  audience: 'teacher' | 'office';
  staff: StaffRef | null;
  status: 'open' | 'closed';
  lastAt: string;
  unread: boolean;
  lastFrom: 'parent' | 'teacher' | 'admin' | null;
  preview: string;
}

export interface Notice { id: string; title: string; body: string; type: string | null; at: string; read: boolean; studentId: string | null }

export interface WhatsAppStatus {
  /** The channel's mode on this server: live Cloud API, or simulated (placeholder key). */
  mode: 'live' | 'simulated';
  businessNumber: string | null;
  linked: boolean;
  phone: string | null;
  optedIn: boolean;
  pending: boolean;
  prefs: Record<string, boolean>;
}

export interface FamilyView {
  parent: { id: string; name: string; schoolName: string };
  children: Child[];
  threads: ThreadSummary[];
  notices: Notice[];
  whatsapp: WhatsAppStatus;
  generatedAt: string;
}

export interface FamilyRows {
  parent: { id: string; name: string | null };
  schoolName: string;
  links: { student_id: string; relationship: string | null }[];
  students: any[];
  teachers: any[];
  assignments: any[];
  submissions: any[];
  tml: any[];
  wellness: any[];
  consents: any[];
  invoices: any[];
  payments: any[];
  threads: any[];
  lastMessages: any[];
  notices: any[];
  whatsapp: WhatsAppStatus;
}

/** The teacher(s) of a class+subject from users.assignments, and the class teacher. */
function staffIndex(teachers: any[]) {
  const bySubject = new Map<string, StaffRef>();
  const classTeacher = new Map<string, StaffRef>();
  const byId = new Map<string, StaffRef>();
  for (const t of teachers) {
    const ref = { id: t.id, name: t.name || 'Teacher' };
    byId.set(t.id, ref);
    if (t.teacher_class) classTeacher.set(normClass(t.teacher_class), ref);
    for (const a of Array.isArray(t.assignments) ? t.assignments : []) {
      if (a && typeof a.class === 'string' && typeof a.subject === 'string') {
        bySubject.set(`${normClass(a.class)}::${normSubject(a.subject)}`, ref);
      }
    }
  }
  return { bySubject, classTeacher, byId };
}

const tmlAt = (rows: any[], cutoff: number) => {
  const latest = new Map<string, any>();
  for (const r of rows) {
    if (cutoff && ts(r.computed_at) > cutoff) continue;
    const k = topicKey(r.topic_name);
    const prev = latest.get(k);
    if (!prev || ts(r.computed_at) > ts(prev.computed_at)) latest.set(k, r);
  }
  return latest;
};

export function shapeFamily(rows: FamilyRows, now = Date.now()): FamilyView {
  const today = dayOf(new Date(now));
  const staff = staffIndex(rows.teachers);
  const rel = new Map(rows.links.map(l => [l.student_id, l.relationship]));
  const children: Child[] = rows.students.map(s => {
    const cls = s.student_class || '';
    // The subject teacher from the staff timetable, else whoever has set this class work in it.
    const teacherFor = (subject: string): StaffRef | null => {
      const listed = staff.bySubject.get(`${normClass(cls)}::${normSubject(subject)}`);
      if (listed) return listed;
      const setter = rows.assignments.find(a => normClass(a.class) === normClass(cls) && normSubject(a.subject) === normSubject(subject) && staff.byId.has(a.teacher_id));
      return setter ? staff.byId.get(setter.teacher_id)! : null;
    };

    // ── Mastery ──
    const mine = rows.tml.filter(r => r.student_id === s.id && Number.isFinite(Number(r.score)));
    const subjectsSeen = [...new Set(mine.map(r => normSubject(r.subject)))];
    const subjects: SubjectScore[] = subjectsSeen.map(key => {
      const rs = mine.filter(r => normSubject(r.subject) === key);
      const nowIdx = tmlAt(rs, 0);
      const thenIdx = tmlAt(rs, now - 21 * DAY);
      const chapters: ChapterScore[] = [...nowIdx.values()].map(r => {
        const c = r.components || {};
        return {
          name: r.topic_name, score: Math.round(Number(r.score)), confidence: r.confidence_band ?? null,
          homework: num(c.homework?.score), quiz: num(c.quiz?.score), tutor: num(c.tutor?.score),
          items: Number(r.item_count) || 0, at: r.computed_at ?? null,
        };
      }).sort((a, b) => a.score - b.score);
      const display = rs[0]?.subject || key;
      const shared = [...thenIdx.keys()].filter(k => nowIdx.has(k));
      const sameNow = mean(shared.map(k => Number(nowIdx.get(k).score)));
      const sameThen = mean(shared.map(k => Number(thenIdx.get(k).score)));
      return {
        subject: display,
        score: mean(chapters.map(c => c.score)),
        was: thenIdx.size ? mean([...thenIdx.values()].map(r => Number(r.score))) : null,
        delta: sameNow !== null && sameThen !== null ? sameNow - sameThen : null,
        chapters,
        teacher: teacherFor(display),
      };
    }).sort((a, b) => a.subject.localeCompare(b.subject));
    const tml = mean(subjects.map(x => x.score).filter((v): v is number => v !== null));

    // ── Schoolwork ──
    const subs = new Map(rows.submissions.filter(x => x.student_id === s.id).map(x => [x.assignment_id, x]));
    const work: WorkItem[] = rows.assignments
      .filter(a => normClass(a.class) === normClass(cls) && a.status !== 'draft'
        && (!Array.isArray(a.assigned_student_ids) || !a.assigned_student_ids.length || a.assigned_student_ids.includes(s.id)))
      .map(a => {
        const sub = subs.get(a.id);
        const graded = !!sub && sub.teacher_approved === true && sub.score !== null && sub.score !== undefined;
        const due = a.due_date ? String(a.due_date).slice(0, 10) : null;
        const state: WorkItem['state'] = graded ? 'graded' : sub ? 'submitted' : due && due < today ? 'overdue' : 'todo';
        const max = graded ? Number(sub.max_score) || null : null;
        const score = graded ? Number(sub.score) : null;
        return {
          id: a.id, title: a.title || 'Untitled', type: a.type || 'homework', subject: a.subject || 'General',
          chapter: Array.isArray(a.units) && a.units[0] ? a.units[0] : null, dueOn: due, setAt: a.created_at ?? null, state,
          score, max, pct: graded && max ? Math.round((score! / max) * 100) : null,
          note: graded ? sub.teacher_note || null : null, submittedAt: sub?.submitted_at ?? null,
          teacher: staff.byId.get(a.teacher_id) ?? null,
        };
      })
      .sort((x, y) => (y.dueOn || y.setAt || '').localeCompare(x.dueOn || x.setAt || ''));

    // ── Wellness (only with consent; never journal text) ──
    const consents: Record<string, boolean> = {};
    for (const c of rows.consents.filter(c => c.student_id === s.id)) consents[c.consent_type] = !!c.granted;
    const consented = consents.wellness_checkin === true;
    const w = consented ? rows.wellness.filter(x => x.student_id === s.id && x.energy !== null && ts(x.created_at) >= now - 14 * DAY) : [];
    const wSorted = [...w].sort((a, b) => ts(b.created_at) - ts(a.created_at));
    const wellness: Wellness = {
      consented, checkins: w.length,
      avgEnergy: w.length ? Math.round((w.reduce((n, x) => n + Number(x.energy), 0) / w.length) * 10) / 10 : null,
      lowDays: w.filter(x => Number(x.energy) <= 2).length,
      latestEnergy: wSorted[0] ? Number(wSorted[0].energy) : null, latestAt: wSorted[0]?.created_at ?? null,
    };

    // ── Fees ──
    const invoices = rows.invoices.filter(i => i.student_id === s.id).map(i => shapeInvoice(i,
      rows.payments.filter(p => p.invoice_id === i.id).map(p => ({
        id: p.id, invoiceId: p.invoice_id, studentId: p.student_id, amount: Number(p.amount), mode: p.mode, reference: p.reference ?? null,
        paidOn: String(p.paid_on).slice(0, 10), receiptNo: p.receipt_no, recordedAt: p.recorded_at, voided: !!p.voided_at, voidReason: p.void_reason ?? null,
      })), today)).filter(i => !i.voided).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
    const open = invoices.filter(i => i.balance > 0);
    const fees: Fees = {
      outstanding: open.reduce((n, i) => n + i.balance, 0),
      overdue: open.filter(i => i.status === 'overdue').reduce((n, i) => n + i.balance, 0),
      nextDue: open[0] ?? null,
      invoices,
    };

    // ── Teachers ──
    const tmap = new Map<string, StaffRef & { subjects: string[]; classTeacher: boolean }>();
    const ct = staff.classTeacher.get(normClass(cls)) ?? null;
    if (ct) tmap.set(ct.id, { ...ct, subjects: [], classTeacher: true });
    for (const t of rows.teachers) {
      for (const a of Array.isArray(t.assignments) ? t.assignments : []) {
        if (a && normClass(a.class) === normClass(cls)) {
          const e = tmap.get(t.id) ?? { id: t.id as string, name: (t.name as string) || 'Teacher', subjects: [] as string[], classTeacher: false };
          if (a.subject && !e.subjects.includes(a.subject)) e.subjects.push(a.subject);
          tmap.set(t.id, e);
        }
      }
    }

    const name = s.name || 'Your child';
    return {
      id: s.id, name, firstName: name.split(/\s+/)[0], cls, rollNo: s.custom_student_id || null, relationship: rel.get(s.id) ?? null,
      tml, band: bandOf(tml), subjects, work, wellness, fees, classTeacher: ct,
      teachers: [...tmap.values()].sort((a, b) => Number(b.classTeacher) - Number(a.classTeacher) || a.name.localeCompare(b.name)),
      consents,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const last = new Map<string, any>();
  for (const m of rows.lastMessages) {
    const prev = last.get(m.thread_id);
    if (!prev || ts(m.created_at) > ts(prev.created_at)) last.set(m.thread_id, m);
  }
  const threads: ThreadSummary[] = rows.threads.map(t => {
    const m = last.get(t.id);
    return {
      id: t.id, studentId: t.student_id, subject: t.subject, topic: t.topic, audience: t.audience,
      staff: t.staff_id ? staff.byId.get(t.staff_id) ?? { id: t.staff_id, name: 'Teacher' } : null,
      status: t.status, lastAt: t.last_message_at,
      unread: !!m && m.sender_role !== 'parent' && (!t.parent_read_at || ts(t.parent_read_at) < ts(m.created_at)),
      lastFrom: m?.sender_role ?? null, preview: (m?.body || '').slice(0, 140),
    };
  }).sort((a, b) => ts(b.lastAt) - ts(a.lastAt));

  return {
    parent: { id: rows.parent.id, name: rows.parent.name || 'Parent', schoolName: rows.schoolName },
    children, threads,
    notices: rows.notices.map(n => ({ id: n.id, title: n.title || '', body: n.body || '', type: n.type ?? null, at: n.created_at, read: !!n.read, studentId: n.student_id ?? null })),
    whatsapp: rows.whatsapp,
    generatedAt: new Date(now).toISOString(),
  };
}

// ── Small helpers the pages share ──────────────────────────────────────────
export const workDone = (c: Child) => {
  const due = c.work.filter(w => w.dueOn && w.dueOn <= dayOf(new Date()));
  return { due: due.length, done: due.filter(w => w.state === 'submitted' || w.state === 'graded').length };
};
export const upcoming = (c: Child, days = 7, now = Date.now()) => {
  const today = dayOf(new Date(now)), until = dayOf(new Date(now + days * DAY));
  return c.work.filter(w => w.state === 'todo' && w.dueOn && w.dueOn >= today && w.dueOn <= until).sort((a, b) => a.dueOn!.localeCompare(b.dueOn!));
};
export const ENERGY_LABEL = ['', 'Very low', 'Low', 'Okay', 'Good', 'Great'];
