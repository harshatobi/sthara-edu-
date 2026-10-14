/**
 * The record inspector's catalogue: which of a school's tables an operator may open under a
 * break-glass window, how they are named and grouped, which fields are never shown, and how a
 * row is summarised in a list. The database keeps its own copy of the table list
 * (app.ops_inspectable) and refuses anything outside it. Pure, so it is unit-tested.
 */

export const INSPECT_GROUPS = ['People', 'Academics', 'Attendance', 'Fees', 'Admissions', 'Communication'] as const;
export type InspectGroup = typeof INSPECT_GROUPS[number];

export const INSPECT_TABLES: Record<string, { label: string; group: InspectGroup }> = {
  users: { label: 'Accounts', group: 'People' },
  consents: { label: 'Consents', group: 'People' },
  role_grants: { label: 'Office roles', group: 'People' },
  staff_members: { label: 'Employee register', group: 'People' },
  staff_jobs: { label: 'Employee job history', group: 'People' },
  classes: { label: 'Classes', group: 'Academics' },
  class_subjects: { label: 'Class subjects', group: 'Academics' },
  student_subjects: { label: 'Student subjects', group: 'Academics' },
  teacher_subjects: { label: 'Teacher subjects', group: 'Academics' },
  assignments: { label: 'Assignments', group: 'Academics' },
  submissions: { label: 'Submissions', group: 'Academics' },
  submission_items: { label: 'Submission answers', group: 'Academics' },
  tml_scores: { label: 'Mastery scores', group: 'Academics' },
  lesson_plans: { label: 'Lesson plans', group: 'Academics' },
  course_plans: { label: 'Course plans', group: 'Academics' },
  syllabus_progress: { label: 'Syllabus progress', group: 'Academics' },
  academic_events: { label: 'Calendar events', group: 'Academics' },
  timetable_slots: { label: 'Timetable slots', group: 'Academics' },
  attendance: { label: 'Student attendance', group: 'Attendance' },
  attendance_month_reviews: { label: 'Monthly attendance reviews', group: 'Attendance' },
  staff_punches: { label: 'Staff punches', group: 'Attendance' },
  staff_day_marks: { label: 'Staff day marks', group: 'Attendance' },
  leave_requests: { label: 'Leave requests', group: 'Attendance' },
  fee_structures: { label: 'Fee structures', group: 'Fees' },
  fee_invoices: { label: 'Fee invoices', group: 'Fees' },
  fee_payments: { label: 'Fee payments', group: 'Fees' },
  fee_concession_requests: { label: 'Concession requests', group: 'Fees' },
  fee_reminders: { label: 'Fee reminders', group: 'Fees' },
  fee_day_closes: { label: 'Day closes', group: 'Fees' },
  admission_applicants: { label: 'Applicants', group: 'Admissions' },
  admission_events: { label: 'Applicant events', group: 'Admissions' },
  account_requests: { label: 'Login requests', group: 'Admissions' },
  notifications: { label: 'Notifications', group: 'Communication' },
  school_threads: { label: 'Message threads', group: 'Communication' },
  school_messages: { label: 'Messages', group: 'Communication' },
  whatsapp_log: { label: 'WhatsApp log', group: 'Communication' },
  situations: { label: 'Situational feed', group: 'Communication' },
};

/** What stays shut whatever window is open, as the Records tab explains it. */
export const NEVER_INSPECTABLE = 'Wellbeing records, pay and statutory details, and students’ tutor conversations are never shown here.';

export const isInspectable = (t: unknown): t is string => typeof t === 'string' && Object.hasOwn(INSPECT_TABLES, t);
export const tableLabel = (t: string) => INSPECT_TABLES[t]?.label ?? t;

/** Fields whose values never leave the server: credentials, one-time codes, bank and identity numbers. */
const SECRET = /(pass(word)?|otp|token(?!s)|secret|bank_|aadhaa?r|(^|_)pan$|(^|_)uan($|_)|ifsc)/i;
export const isSecretField = (name: string) => SECRET.test(name);
export const HIDDEN = '[hidden]';

/** The row with secret fields blanked, at any depth (settings and metadata are JSON). */
export function maskRow<T>(value: T): T {
  if (Array.isArray(value)) return value.map(maskRow) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      [k, isSecretField(k) && v !== null && v !== undefined && v !== '' ? HIDDEN : maskRow(v)])) as T;
  }
  return value;
}

/** Columns that best say what a row is, most telling first. */
const TITLE_FIELDS = ['name', 'title', 'subject', 'topic_name', 'invoice_no', 'receipt_no', 'number', 'label', 'kind', 'type', 'action', 'status', 'date', 'day', 'class', 'email'];
const WHEN_FIELDS = ['created_at', 'at', 'submitted_at', 'computed_at', 'paid_at', 'date', 'day', 'updated_at'];

const short = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object') return null;
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
};

/** A row as a list shows it: a title, up to three other telling fields, and when it happened. */
export function summarise(row: Record<string, unknown>): { id: string; title: string; facts: string[]; when: string | null } {
  const told = TITLE_FIELDS.filter(f => !isSecretField(f)).map(f => [f, short(row[f])] as const).filter((x): x is readonly [string, string] => x[1] !== null);
  const [first, ...rest] = told;
  const whenField = WHEN_FIELDS.find(f => typeof row[f] === 'string' && row[f]);
  return {
    id: String(row.id ?? ''),
    title: first?.[1] ?? String(row.id ?? '').slice(0, 8),
    facts: rest.filter(([f]) => f !== whenField).slice(0, 3).map(([f, v]) => `${f.replace(/_/g, ' ')}: ${v}`),
    when: whenField ? String(row[whenField]) : null,
  };
}
