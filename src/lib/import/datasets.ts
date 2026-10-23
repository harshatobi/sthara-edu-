/**
 * The datasets Sthara publishes import formats for, one definition each: the columns (with the guide a school
 * reads), how a row is checked, and how people-facing keys (admission number, class, assessment, subject) turn
 * into ids. Pure: the template download, the dry run and the tests all use these same definitions.
 *
 * A student is named by admission number in every file: the number on the school's admission register (brief 01).
 * Files about a student's days and marks need the student to have a Sthara login; the register itself and enrolment
 * history do not.
 *
 * Blank optional cells leave what is stored alone (sent as null). A class, assessment or subject the school has not
 * set up is refused, never created.
 */
import { normClass } from '@/lib/teacher/scope';
import { evenSchedule, validateSchedule } from '@/lib/admin/fees';
import { parseAmount, parseDate, parseSession } from './parse';
import { parseAadhaar } from '@/lib/students/aadhaar';
import { IMPAIRMENT_LABEL, IMPAIRMENTS, SCREEN_RESULTS, checkEvent, checkUdise, parseAllergyList, parseNameList } from '@/lib/students/health';
import { DOC_KINDS, DOC_KIND_KEYS, DOC_MAX_BYTES, cleanFileName } from '@/lib/students/documents';
import { ADDRESS_PARTS, FIELD, checkAddress, checkAdmissionNo, checkFamily, checkField, parseGrade as parseRegisterGrade, parseOutcome } from '@/lib/students/register';

export type Kind = 'text' | 'date' | 'session' | 'amount' | 'int' | 'enum' | 'email' | 'phone';

export interface Column {
  key: string;
  required: boolean;
  kind: Kind;
  /** Longest text accepted. */
  max?: number;
  /** For enums: accepted spellings (lower case) to the stored value. */
  values?: Record<string, string>;
  /** Other header spellings that mean this column. */
  aliases?: string[];
  min?: number;
  maxValue?: number;
  example: string;
  guide: string;
}

export interface Lookups {
  /** Admission number (as admKey) to the student: the login (users.id) when Sthara has issued one. */
  students: Map<string, { id: string | null; name: string }>;
  /** Admission numbers two or more students share: refused until the school fixes them. */
  ambiguous?: Set<string>;
  /** normClass(name) to the class name as the school writes it. */
  classes: Map<string, string>;
  /** sheetKey(assessment, class, subject) to the open or closed marks sheet. */
  sheets: Map<string, { id: string; max: number; status: string }>;
  /** Files uploaded with the job (documents): where the file of that name is and its size, or null when it never came. */
  file?: (name: string) => { path: string; size: number } | null;
}

export type Cells = Record<string, string | number | null>;
export type Built = { ok: true; row: Record<string, unknown> } | { ok: false; problems: Problem[] } | { ok: 'skip' };
export interface Problem { n: number; column?: string; error: string }

export interface Dataset {
  key: string;
  label: string;
  /** One line under the title. */
  about: string;
  /** Where the rows land, for the guide. */
  lands: string;
  /** What makes two rows the same record (a repeat in one file is refused). */
  matching: string;
  columns: Column[];
  /** The database writer: public.import_<key>. */
  writer: string;
  /** Which lookups the server must load. */
  needs: ('students' | 'classes' | 'sheets' | 'files')[];
  /** The file is a manifest, and the files it lists are uploaded with it (documents). */
  files?: boolean;
  /** Identity of a row inside one file; null when the row has none (never a duplicate). */
  identity: (c: Cells) => string | null;
  /** Rows sharing this go in the same chunk. */
  group?: (r: Record<string, unknown>) => string;
  build: (c: Cells, n: number, look: Lookups) => Built;
}

// ── Keys ────────────────────────────────────────────────────────────────────

/** Admission numbers compare without case or surrounding spaces, as the register's unique index does; "A-001" and "a-001" are the same student. */
export const admKey = (v: string) => v.trim().toLowerCase();
const nameKey = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const sheetKey = (assessment: string, cls: string, subject: string) => `${nameKey(assessment)}|${normClass(cls)}|${nameKey(subject)}`;

const ADM: Column = {
  key: 'admission_no', required: true, kind: 'text', max: 30, aliases: ['admission_number', 'adm_no', 'admn_no', 'student_id'],
  example: 'A1024', guide: 'The student’s admission number, exactly as the school writes it.',
};

const s = (c: Cells, k: string) => (c[k] == null ? null : String(c[k]));
const num = (c: Cells, k: string) => (c[k] == null ? null : Number(c[k]));

function student(c: Cells, n: number, look: Lookups): { id: string } | Problem {
  const adm = s(c, 'admission_no')!;
  if (look.ambiguous?.has(admKey(adm))) return { n, column: 'admission_no', error: `More than one student has admission number "${adm}". Fix that in the roster first.` };
  const st = look.students.get(admKey(adm));
  if (!st) return { n, column: 'admission_no', error: `No student with admission number "${adm}" on this school\u2019s register.` };
  return st.id ? { id: st.id } : { n, column: 'admission_no', error: `${st.name || adm} has no Sthara login yet. Records like this can be imported once Sthara issues the login.` };
}
function klass(c: Cells, n: number, look: Lookups, col = 'class'): string | Problem | null {
  const v = s(c, col);
  if (v == null) return null;
  const name = look.classes.get(normClass(v));
  return name ?? { n, column: col, error: `There is no class "${v}" in this school. Add it first, or check the spelling.` };
}
const isProblem = (x: unknown): x is Problem => !!x && typeof x === 'object' && 'error' in (x as Problem);
const fail = (...p: Problem[]): Built => ({ ok: false, problems: p });

// ── Shared enums ────────────────────────────────────────────────────────────

const ATTENDANCE: Record<string, string> = {
  present: 'present', p: 'present', absent: 'absent', a: 'absent', late: 'late', l: 'late', lt: 'late',
  excused: 'excused', e: 'excused', leave: 'excused', ex: 'excused',
};
const MARK_CODES: Record<string, string> = { ab: 'AB', absent: 'AB', ml: 'ML', 'medical leave': 'ML', ex: 'EX', exempt: 'EX', exempted: 'EX' };
const MODES: Record<string, string> = {
  upi: 'upi', gpay: 'upi', phonepe: 'upi', paytm: 'upi', bank_transfer: 'bank_transfer', 'bank transfer': 'bank_transfer', neft: 'bank_transfer',
  rtgs: 'bank_transfer', imps: 'bank_transfer', bank: 'bank_transfer', card: 'card', 'debit card': 'card', 'credit card': 'card',
  cheque: 'cheque', check: 'cheque', cash: 'cash', dd: 'dd', 'demand draft': 'dd',
};
const SOURCES: Record<string, string> = {
  walk_in: 'walk_in', 'walk in': 'walk_in', 'walk-in': 'walk_in', website: 'website', online: 'website', referral: 'referral',
  sibling: 'sibling', event: 'event', advertisement: 'advertisement', ad: 'advertisement', other: 'other',
};
const STAGES: Record<string, string> = {
  enquiry: 'enquiry', inquiry: 'enquiry', application: 'application', applied: 'application', assessment: 'assessment', test: 'assessment',
  offer: 'offer', offered: 'offer', enrolled: 'enrolled', admitted: 'enrolled', rejected: 'rejected', withdrawn: 'withdrawn',
};
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
/** "10", "Class 10", "X", "Grade 10" to 10. */
export function parseGrade(v: string): number | null {
  const t = v.trim().toLowerCase().replace(/^(class|grade|std\.?|standard)\s*/, '');
  if (t in ROMAN) return ROMAN[t];
  return /^\d{1,2}$/.test(t) && +t >= 1 && +t <= 12 ? +t : null;
}

const enumGuide = (v: Record<string, string>) => [...new Set(Object.values(v))].join(', ');

// ── Datasets ────────────────────────────────────────────────────────────────

const attendance: Dataset = {
  key: 'attendance', label: 'Attendance history', writer: 'import_attendance', needs: ['students', 'classes'],
  about: 'One row per student per day. Past years welcome.',
  lands: 'The attendance register (a day already marked is updated).',
  matching: 'Admission number and date: one mark per student per day.',
  columns: [
    ADM,
    { key: 'class', required: true, kind: 'text', max: 40, example: '10-A', guide: 'The class the student was in that day, as the school names it in Sthara.' },
    { key: 'date', required: true, kind: 'date', aliases: ['day'], example: '05-06-2024', guide: 'DD-MM-YYYY.' },
    { key: 'status', required: true, kind: 'enum', values: ATTENDANCE, example: 'present', guide: `${enumGuide(ATTENDANCE)}. P, A, L and E also work.` },
    { key: 'note', required: false, kind: 'text', max: 300, aliases: ['remarks', 'remark'], example: '', guide: 'Optional. Up to 300 characters.' },
  ],
  identity: c => `${admKey(String(c.admission_no))}|${c.date}`,
  build(c, n, look) {
    const st = student(c, n, look), cls = klass(c, n, look);
    const p = [st, cls].filter(isProblem);
    if (p.length) return fail(...p);
    return { ok: true, row: { student_id: (st as { id: string }).id, class_name: cls, day: c.date, status: c.status, note: s(c, 'note') } };
  },
};

const examMarks: Dataset = {
  key: 'exam_marks', label: 'Exam marks (this session)', writer: 'import_exam_marks', needs: ['students', 'sheets'],
  about: 'Marks for assessments already set up in Exams, into sheets that are still open.',
  lands: 'The marks sheet for that assessment, class and subject. Locked or submitted sheets are refused.',
  matching: 'Admission number, assessment, class and subject.',
  columns: [
    ADM,
    { key: 'class', required: true, kind: 'text', max: 40, example: '10-A', guide: 'The class, as the school names it in Sthara.' },
    { key: 'assessment', required: true, kind: 'text', max: 80, example: 'PT1', guide: 'The assessment’s code or name, as set up in Exams.' },
    { key: 'subject', required: true, kind: 'text', max: 80, example: 'Mathematics', guide: 'The subject as the class’s subject list names it.' },
    { key: 'marks', required: false, kind: 'amount', example: '36.5', guide: 'Marks scored, up to the sheet’s maximum. Leave blank when using code.' },
    { key: 'code', required: false, kind: 'enum', values: MARK_CODES, example: '', guide: 'AB (absent), ML (medical leave) or EX (exempt), instead of marks.' },
  ],
  identity: c => `${admKey(String(c.admission_no))}|${sheetKey(String(c.assessment), String(c.class), String(c.subject))}`,
  build(c, n, look) {
    if (c.marks == null && c.code == null) return { ok: 'skip' };
    if (c.marks != null && c.code != null) return fail({ n, column: 'code', error: 'Give marks or a code, not both.' });
    const st = student(c, n, look);
    const sheet = look.sheets.get(sheetKey(String(c.assessment), String(c.class), String(c.subject)));
    const p: Problem[] = isProblem(st) ? [st] : [];
    if (!sheet) p.push({ n, column: 'assessment', error: `No ${c.assessment} marks sheet for ${c.subject} in ${c.class}. Check the assessment, class and subject in Exams.` });
    else if (c.marks != null && Number(c.marks) > sheet.max) p.push({ n, column: 'marks', error: `Above the maximum of ${sheet.max}.` });
    if (p.length) return fail(...p);
    return { ok: true, row: { sheet_id: sheet!.id, student_id: (st as { id: string }).id, marks: num(c, 'marks'), code: s(c, 'code') } };
  },
};

const legacyResults: Dataset = {
  key: 'legacy_results', label: 'Past results (before Sthara)', writer: 'import_legacy_results', needs: ['students'],
  about: 'Marks and grades from years before the school used Sthara.',
  lands: 'The student’s record and timeline. Never touches this session’s report cards.',
  matching: 'Admission number, session, term and subject.',
  columns: [
    ADM,
    { key: 'session', required: true, kind: 'session', example: '2022-23', guide: 'The academic year, like 2022-23.' },
    { key: 'class', required: false, kind: 'text', max: 40, example: '8-B', guide: 'Optional. The class the student was in that year (old classes need not exist in Sthara).' },
    { key: 'term', required: true, kind: 'text', max: 60, example: 'Annual', guide: 'Term or exam name, like Term 1, Half-yearly or Annual.' },
    { key: 'subject', required: true, kind: 'text', max: 80, example: 'Mathematics', guide: 'Subject name.' },
    { key: 'marks', required: false, kind: 'amount', example: '78', guide: 'Marks scored. At least one of marks, grade or code.' },
    { key: 'max_marks', required: false, kind: 'amount', aliases: ['max', 'out_of', 'maximum'], example: '100', guide: 'Out of how many.' },
    { key: 'grade', required: false, kind: 'text', max: 8, example: 'B1', guide: 'Grade as written on the report card.' },
    { key: 'code', required: false, kind: 'enum', values: MARK_CODES, example: '', guide: 'AB, ML or EX, instead of marks.' },
  ],
  identity: c => `${admKey(String(c.admission_no))}|${c.session}|${nameKey(String(c.term))}|${nameKey(String(c.subject))}`,
  build(c, n, look) {
    const p: Problem[] = [];
    const st = student(c, n, look);
    if (isProblem(st)) p.push(st);
    if (c.marks == null && c.grade == null && c.code == null) p.push({ n, column: 'marks', error: 'Give marks, a grade or a code.' });
    if (c.marks != null && c.code != null) p.push({ n, column: 'code', error: 'Give marks or a code, not both.' });
    if (c.marks != null && c.max_marks != null && Number(c.marks) > Number(c.max_marks)) p.push({ n, column: 'marks', error: 'Marks are above max_marks.' });
    if (c.max_marks != null && Number(c.max_marks) <= 0) p.push({ n, column: 'max_marks', error: 'max_marks must be above 0.' });
    if (p.length) return fail(...p);
    return {
      ok: true, row: {
        student_id: (st as { id: string }).id, session: c.session, class_name: s(c, 'class'), term: String(c.term).trim(), subject: String(c.subject).trim(),
        marks: num(c, 'marks'), max_marks: num(c, 'max_marks'), grade: s(c, 'grade'), code: s(c, 'code'),
      },
    };
  },
};

const feeStructures: Dataset = {
  key: 'fee_structures', label: 'Fee structures', writer: 'import_fee_structures', needs: [],
  about: 'The annual fee for each class, split into equal instalments.',
  lands: 'Fees › Structures (an existing session and class is updated).',
  matching: 'Session and class.',
  columns: [
    { key: 'session', required: true, kind: 'session', example: '2026-27', guide: 'The academic year, like 2026-27.' },
    { key: 'grade', required: true, kind: 'int', min: 1, maxValue: 12, aliases: ['class'], example: '10', guide: 'Class 1 to 12 (10, Class 10 or X).' },
    { key: 'annual_fee', required: true, kind: 'amount', aliases: ['fee', 'annual'], example: '60000', guide: 'Rupees for the year, before concessions.' },
    { key: 'instalments', required: true, kind: 'int', min: 1, maxValue: 12, example: '4', guide: 'How many equal instalments (1 to 12). Due on the 10th of evenly spaced months from April; adjust in Fees after.' },
  ],
  identity: c => `${c.session}|${c.grade}`,
  build(c, n) {
    const schedule = evenSchedule(Number(c.instalments), String(c.session));
    const err = validateSchedule(schedule, String(c.session));
    if (err) return fail({ n, column: 'instalments', error: err });
    return {
      ok: true, row: {
        session: c.session, grade: Number(c.grade), annual_fee: Number(c.annual_fee),
        schedule: schedule.map(i => ({ no: i.no, label: i.label, due_on: i.dueOn, share: i.share })),
      },
    };
  },
};

const feeInvoices: Dataset = {
  key: 'fee_invoices', label: 'Fee invoices and opening balances', writer: 'import_fee_invoices', needs: ['students'],
  about: 'What each student owes, instalment by instalment. Sthara numbers new invoices.',
  lands: 'Fees › Ledger (an existing instalment is updated unless already paid past the new amount).',
  matching: 'Admission number, session and instalment number.',
  columns: [
    ADM,
    { key: 'session', required: true, kind: 'session', example: '2026-27', guide: 'The academic year.' },
    { key: 'instalment_no', required: true, kind: 'int', min: 1, maxValue: 12, aliases: ['instalment', 'installment_no', 'installment'], example: '1', guide: '1 to 12.' },
    { key: 'label', required: false, kind: 'text', max: 60, example: 'Term 1', guide: 'Needed for a new invoice. Like Term 1 or Opening balance.' },
    { key: 'due_on', required: false, kind: 'date', aliases: ['due_date', 'due'], example: '10-04-2026', guide: 'Needed for a new invoice. DD-MM-YYYY.' },
    { key: 'amount', required: true, kind: 'amount', example: '15000', guide: 'Rupees, before concession.' },
    { key: 'concession', required: false, kind: 'amount', example: '0', guide: 'Rupees off. Needs a concession_reason.' },
    { key: 'concession_reason', required: false, kind: 'text', max: 200, example: '', guide: 'Why the concession was given.' },
  ],
  identity: c => `${admKey(String(c.admission_no))}|${c.session}|${c.instalment_no}`,
  build(c, n, look) {
    const st = student(c, n, look);
    const p: Problem[] = isProblem(st) ? [st] : [];
    if (c.concession != null && Number(c.concession) > Number(c.amount)) p.push({ n, column: 'concession', error: 'The concession is more than the amount.' });
    if (p.length) return fail(...p);
    return {
      ok: true, row: {
        student_id: (st as { id: string }).id, session: c.session, instalment_no: Number(c.instalment_no), label: s(c, 'label'), due_on: s(c, 'due_on'),
        amount: Number(c.amount), concession: num(c, 'concession'), concession_reason: s(c, 'concession_reason'),
      },
    };
  },
};

const feePayments: Dataset = {
  key: 'fee_payments', label: 'Fee payments history', writer: 'import_fee_payments', needs: ['students'],
  about: 'Receipts already issued. Import invoices first; each payment goes against its instalment.',
  lands: 'Fees › Ledger as receipts. Receipts are never edited: one already on file is skipped if identical, refused if not.',
  matching: 'Receipt number.',
  columns: [
    ADM,
    { key: 'session', required: true, kind: 'session', example: '2026-27', guide: 'The academic year of the invoice paid.' },
    { key: 'instalment_no', required: true, kind: 'int', min: 1, maxValue: 12, aliases: ['instalment', 'installment_no', 'installment'], example: '1', guide: 'Which instalment it paid.' },
    { key: 'amount', required: true, kind: 'amount', example: '15000', guide: 'Rupees received.' },
    { key: 'mode', required: true, kind: 'enum', values: MODES, aliases: ['payment_mode'], example: 'upi', guide: `${enumGuide(MODES)}. NEFT, RTGS and IMPS count as bank_transfer.` },
    { key: 'reference', required: false, kind: 'text', max: 120, aliases: ['ref', 'utr', 'cheque_no', 'transaction_id'], example: 'UTR 4567', guide: 'UTR, cheque number or transaction ID.' },
    { key: 'paid_on', required: true, kind: 'date', aliases: ['date', 'paid_date'], example: '08-04-2026', guide: 'DD-MM-YYYY.' },
    { key: 'receipt_no', required: false, kind: 'text', max: 40, aliases: ['receipt', 'receipt_number'], example: 'RCT/2026-27/00012', guide: 'The receipt number already issued. Leave blank and Sthara numbers it.' },
  ],
  identity: c => (c.receipt_no == null ? null : String(c.receipt_no).trim().toLowerCase()),
  // Payments against one instalment are checked together (they must not add up to more than it).
  group: r => `${r.student_id}|${r.session}|${r.instalment_no}`,
  build(c, n, look) {
    const st = student(c, n, look);
    if (isProblem(st)) return fail(st);
    if (Number(c.amount) <= 0) return fail({ n, column: 'amount', error: 'The amount must be above 0.' });
    return {
      ok: true, row: {
        student_id: st.id, session: c.session, instalment_no: Number(c.instalment_no), amount: Number(c.amount), mode: c.mode,
        reference: s(c, 'reference'), paid_on: c.paid_on, receipt_no: s(c, 'receipt_no'),
      },
    };
  },
};

const applicants: Dataset = {
  key: 'admission_applicants', label: 'Admission applicants', writer: 'import_admission_applicants', needs: [],
  about: 'Enquiries and applications, with their stage in the pipeline.',
  lands: 'Admissions (the same applicant again is updated).',
  matching: 'Session, name and date of birth (or, without a date of birth, guardian phone).',
  columns: [
    { key: 'session', required: true, kind: 'session', example: '2027-28', guide: 'The session they are applying for.' },
    { key: 'name', required: true, kind: 'text', max: 120, aliases: ['student_name', 'applicant_name'], example: 'Meera Krishnan', guide: 'The child’s full name.' },
    { key: 'grade', required: true, kind: 'int', min: 1, maxValue: 12, aliases: ['class'], example: '3', guide: 'Class applied for, 1 to 12.' },
    { key: 'date_of_birth', required: false, kind: 'date', aliases: ['dob'], example: '02-05-2019', guide: 'DD-MM-YYYY.' },
    { key: 'guardian_name', required: false, kind: 'text', max: 120, aliases: ['parent_name'], example: 'Lakshmi Krishnan', guide: '' },
    { key: 'guardian_phone', required: false, kind: 'phone', aliases: ['phone', 'mobile', 'parent_phone'], example: '9876543210', guide: '10-digit mobile, with or without +91.' },
    { key: 'guardian_email', required: false, kind: 'email', max: 160, aliases: ['email', 'parent_email'], example: '', guide: '' },
    { key: 'previous_school', required: false, kind: 'text', max: 160, example: '', guide: '' },
    { key: 'source', required: false, kind: 'enum', values: SOURCES, example: 'walk_in', guide: `${enumGuide(SOURCES)}.` },
    { key: 'stage', required: false, kind: 'enum', values: STAGES, example: 'enquiry', guide: `${enumGuide(STAGES)}. Blank means enquiry for a new applicant.` },
  ],
  identity: c => `${c.session}|${nameKey(String(c.name))}|${c.date_of_birth ?? `p:${c.guardian_phone ?? ''}`}`,
  build(c) {
    return {
      ok: true, row: {
        session: c.session, name: String(c.name).trim(), grade: Number(c.grade), date_of_birth: s(c, 'date_of_birth'), guardian_name: s(c, 'guardian_name'),
        guardian_phone: s(c, 'guardian_phone'), guardian_email: s(c, 'guardian_email'), previous_school: s(c, 'previous_school'),
        source: s(c, 'source'), stage: s(c, 'stage'),
      },
    };
  },
};

// ── The register and enrolment history (brief 01) ───────────────────────────

const YES_NO: Record<string, string> = { yes: 'true', y: 'true', true: 'true', '1': 'true', no: 'false', n: 'false', false: 'false', '0': 'false' };
const GENDER: Record<string, string> = { male: 'male', m: 'male', boy: 'male', female: 'female', f: 'female', girl: 'female', transgender: 'transgender', t: 'transgender', tg: 'transgender' };
const PREV: Record<string, string> = {
  same_school: 'same_school', 'same school': 'same_school', 'this school': 'same_school', other_school: 'other_school', 'other school': 'other_school',
  'another school': 'other_school', anganwadi: 'anganwadi_ecce', ecce: 'anganwadi_ecce', anganwadi_ecce: 'anganwadi_ecce', 'anganwadi/ecce': 'anganwadi_ecce',
  not_studying: 'not_studying', 'not studying': 'not_studying', none: 'not_studying',
};
const CATEGORY: Record<string, string> = { general: 'general', gen: 'general', sc: 'sc', st: 'st', obc: 'obc', 'obc-ncl': 'obc' };
const RELIGION: Record<string, string> = Object.fromEntries(['hindu', 'muslim', 'christian', 'sikh', 'buddhist', 'parsi', 'jain', 'other'].map(r => [r, r]));
const RELATION: Record<string, string> = {
  mother: 'mother', mom: 'mother', mum: 'mother', father: 'father', dad: 'father', guardian: 'guardian', grandmother: 'grandparent',
  grandfather: 'grandparent', grandparent: 'grandparent', sibling: 'sibling', brother: 'sibling', sister: 'sibling', other: 'other', uncle: 'other', aunt: 'other',
};
const EDUCATION: Record<string, string> = {
  none: 'none', illiterate: 'none', 'no schooling': 'none', primary: 'primary', 'upper primary': 'upper_primary', upper_primary: 'upper_primary', middle: 'upper_primary',
  secondary: 'secondary', '10th': 'secondary', ssc: 'secondary', 'higher secondary': 'higher_secondary', higher_secondary: 'higher_secondary', '12th': 'higher_secondary',
  intermediate: 'higher_secondary', graduate: 'graduate', degree: 'graduate', 'post graduate': 'post_graduate', 'post-graduate': 'post_graduate', post_graduate: 'post_graduate',
  pg: 'post_graduate', other: 'other',
};
const STREAMS: Record<string, string> = { science: 'science', commerce: 'commerce', humanities: 'humanities', arts: 'humanities', vocational: 'vocational', other: 'other' };
const reg = (key: string, guide: string, example = '', extra: Partial<Column> = {}): Column =>
  ({ key, required: false, kind: 'text', max: FIELD.get(key)?.max ?? 40, example, guide, ...extra });

const students: Dataset = {
  key: 'students', label: 'Admission register', writer: 'import_students', needs: [],
  about: 'One row per student, current or past. Creates register entries only; logins are issued by Sthara and linked by admission number.',
  lands: 'The admission register. An admission number already on it is corrected field by field, and every change keeps its old value in the history.',
  matching: 'Admission number.',
  columns: [
    { ...ADM, guide: 'The school\u2019s admission number, exactly as written in the register. Numbers carry over unchanged; Sthara continues after the highest.' },
    reg('full_name', 'The student\u2019s full name. Required for a new entry.', 'Aarav Sharma', { max: 120, aliases: ['name', 'student_name'] }),
    reg('aadhaar_name', 'The name exactly as on the Aadhaar card (APAAR needs it to match).', 'AARAV SHARMA', { max: 120 }),
    reg('gender', 'Male, Female or Transgender.', 'Male', { kind: 'enum', values: GENDER }),
    reg('date_of_birth', 'DD-MM-YYYY.', '14-08-2012', { kind: 'date', aliases: ['dob'] }),
    reg('aadhaar', '12 digits. Encrypted as soon as it arrives; only the last 4 are ever shown without permission.', '', { max: 20, aliases: ['aadhaar_no', 'aadhaar_number'] }),
    reg('no_aadhaar', 'Yes when the student has no Aadhaar (leave aadhaar blank).', '', { kind: 'enum', values: YES_NO }),
    reg('pen', 'PEN, the 11-digit UDISE+ student code.', '', { max: 15 }),
    reg('apaar_id', '12-digit APAAR ID.', '', { max: 15, aliases: ['apaar'] }),
    reg('cbse_reg_no', 'CBSE registration number (Class 9 or 11).', '', { max: 20 }),
    reg('board_roll_no', 'Board exam roll number (Class 10 or 12).', '', { max: 20 }),
    reg('admitted_on', 'Date of admission, DD-MM-YYYY.', '01-06-2018', { kind: 'date', aliases: ['admission_date', 'date_of_admission'] }),
    reg('admitted_class', 'The class admitted to: Nursery, LKG, UKG or 1 to 12.', '1', { max: 12 }),
    reg('previous_status', 'In this school, In another school, Anganwadi/ECCE or Not studying.', '', { kind: 'enum', values: PREV }),
    reg('previous_school', 'The school before this one.', '', { max: 200 }),
    reg('previous_class', 'The class in that school.', '', { max: 40 }),
    reg('previous_tc_no', 'Number of the transfer certificate from that school.', '', { max: 40, aliases: ['tc_no'] }),
    reg('rte_seat', 'Yes when admitted under RTE 12(1)(c).', '', { kind: 'enum', values: YES_NO, aliases: ['rte'] }),
    reg('rte_amount', 'RTE reimbursement claimed, in rupees.', '', { kind: 'amount' }),
    reg('medium', 'Medium of instruction.', 'English', { max: 40 }),
    reg('indian_national', 'Yes or No. Blank means Yes for a new entry.', '', { kind: 'enum', values: YES_NO }),
    reg('mother_tongue', 'Mother tongue.', 'Telugu', { max: 40 }),
    reg('social_category', 'General, SC, ST or OBC.', '', { kind: 'enum', values: CATEGORY, aliases: ['category'] }),
    reg('religion', 'Hindu, Muslim, Christian, Sikh, Buddhist, Parsi, Jain or Other.', '', { kind: 'enum', values: RELIGION }),
    reg('minority', 'Yes when from a minority community.', '', { kind: 'enum', values: YES_NO }),
    reg('bpl', 'Yes when the family has a BPL card.', '', { kind: 'enum', values: YES_NO }),
    reg('aay', 'Yes when the family has an Antyodaya (AAY) card.', '', { kind: 'enum', values: YES_NO }),
    reg('ews', 'Yes when EWS or a disadvantaged group (RTE).', '', { kind: 'enum', values: YES_NO }),
    reg('family_income', 'Family income a year, in rupees.', '', { kind: 'amount' }),
    reg('distance_km', 'Distance from home to school, in km.', '', { kind: 'amount' }),
    reg('family_code', 'Optional: the same code on brothers and sisters marks one family (siblings are suggested for the office to confirm).', '', { max: 40 }),
    ...ADDRESS_PARTS.map(p => reg(`address_${p.key}`, `Current address: ${p.label.toLowerCase()}.`, p.key === 'pin' ? '500001' : '', { max: p.max })),
    reg('permanent_same', 'Yes (or blank) when the permanent address is the current one.', '', { kind: 'enum', values: YES_NO }),
    ...ADDRESS_PARTS.map(p => reg(`permanent_${p.key}`, `Permanent address: ${p.label.toLowerCase()}. Only when different.`, '', { max: p.max })),
  ],
  identity: c => admKey(String(c.admission_no)),
  build(c, n) {
    const p: Problem[] = [];
    // A new entry takes this number as is, so it must be one the register accepts (the dry run never inserts).
    const adm = checkAdmissionNo(String(c.admission_no));
    if ('error' in adm) p.push({ n, column: 'admission_no', error: adm.error });
    const row: Record<string, unknown> = { admission_no: String(c.admission_no).trim() };
    const take = (key: string, raw: unknown, col = key) => {
      if (raw == null) return;
      const r = checkField(FIELD.get(key)!, raw);
      if ('error' in r) p.push({ n, column: col, error: r.error }); else row[key] = r.value;
    };
    for (const k of ['full_name', 'aadhaar_name', 'date_of_birth', 'pen', 'apaar_id', 'cbse_reg_no', 'board_roll_no', 'admitted_on', 'previous_school', 'previous_class', 'previous_tc_no', 'rte_amount', 'medium', 'mother_tongue', 'family_income', 'distance_km']) take(k, c[k]);
    for (const k of ['gender', 'previous_status', 'social_category', 'religion']) if (c[k] != null) row[k] = c[k];
    for (const k of ['no_aadhaar', 'rte_seat', 'indian_national', 'minority', 'bpl', 'aay', 'ews', 'permanent_same']) if (c[k] != null) row[k] = c[k] === 'true';
    if (c.family_code != null) row.family_code = String(c.family_code).trim();
    for (const which of ['address', 'permanent'] as const) {
      const parts = Object.fromEntries(ADDRESS_PARTS.map(p => [p.key, c[`${which}_${p.key}`] == null ? '' : String(c[`${which}_${p.key}`])]));
      if (Object.values(parts).every(v => !v)) continue;
      const a = checkAddress(parts);
      if ('error' in a) p.push({ n, column: `${which}_line1`, error: a.error }); else row[which === 'address' ? 'address' : 'permanent_address'] = a.value;
    }
    if (row.permanent_address && row.permanent_same === undefined) row.permanent_same = false;
    if (row.permanent_same === true && row.permanent_address) p.push({ n, column: 'permanent_same', error: 'Permanent address given, but permanent_same says Yes.' });
    if (c.admitted_class != null) {
      const g = parseRegisterGrade(String(c.admitted_class));
      if (g == null) p.push({ n, column: 'admitted_class', error: 'A class is Nursery, LKG, UKG or 1 to 12.' }); else row.admitted_grade = g;
    }
    if (c.aadhaar != null) {
      if (row.no_aadhaar === true) p.push({ n, column: 'aadhaar', error: 'The row says No Aadhaar but also gives a number.' });
      else { const a = parseAadhaar(String(c.aadhaar)); if (!a.ok) p.push({ n, column: 'aadhaar', error: a.error }); else row.aadhaar = a.digits; }
    }
    if (row.rte_amount != null && row.rte_seat === false) p.push({ n, column: 'rte_amount', error: 'An RTE amount needs RTE seat = Yes.' });
    if (typeof row.date_of_birth === 'string' && typeof row.admitted_on === 'string' && row.admitted_on < row.date_of_birth) p.push({ n, column: 'admitted_on', error: 'Admitted before the date of birth.' });
    return p.length ? fail(...p) : { ok: true, row };
  },
};

const enrolments: Dataset = {
  key: 'enrolments', label: 'Enrolment history', writer: 'import_enrolments', needs: [],
  about: 'One row per student per past session: the class they were in and how the year ended. Students who have left are welcome.',
  lands: 'Each student\u2019s year-by-year history on the register. Import the admission register first; this session\u2019s classes are set in Sthara.',
  matching: 'Admission number and session.',
  columns: [
    ADM,
    { key: 'session', required: true, kind: 'session', example: '2024-25', guide: 'The academic session, as 2024-25.' },
    { key: 'class', required: true, kind: 'text', max: 12, aliases: ['grade'], example: '7', guide: 'The class: Nursery, LKG, UKG or 1 to 12.' },
    { key: 'section', required: false, kind: 'text', max: 10, example: 'B', guide: 'The section, if the school had sections.' },
    { key: 'class_name', required: false, kind: 'text', max: 40, example: '', guide: 'The class as the school named it, if different from class and section (for example "7 Rose").' },
    { key: 'roll_no', required: false, kind: 'text', max: 12, example: '14', guide: 'The roll number that year.' },
    { key: 'stream', required: false, kind: 'enum', values: STREAMS, example: '', guide: 'Classes 11 and 12: Science, Commerce, Humanities, Vocational or Other.' },
    { key: 'first_language', required: false, kind: 'text', max: 40, example: 'English', guide: 'First language that year.' },
    { key: 'second_language', required: false, kind: 'text', max: 40, example: 'Hindi', guide: 'Second language.' },
    { key: 'third_language', required: false, kind: 'text', max: 40, example: '', guide: 'Third language (Classes up to 8).' },
    { key: 'outcome', required: false, kind: 'text', max: 30, aliases: ['result'], example: 'Promoted', guide: 'How the year ended: Promoted, Detained, Promoted without exam, Repeater by choice, Dropout or Left (TC).' },
  ],
  identity: c => `${admKey(String(c.admission_no))}|${c.session}`,
  build(c, n) {
    const p: Problem[] = [];
    const grade = parseRegisterGrade(String(c.class));
    if (grade == null) p.push({ n, column: 'class', error: 'A class is Nursery, LKG, UKG or 1 to 12.' });
    const outcome = c.outcome == null ? null : parseOutcome(String(c.outcome));
    if (c.outcome != null && !outcome) p.push({ n, column: 'outcome', error: 'Outcome is Promoted, Detained, Promoted without exam, Repeater by choice, Dropout or Left (TC).' });
    if (p.length) return fail(...p);
    const langs = Object.fromEntries(['first', 'second', 'third'].flatMap(k => (c[`${k}_language`] == null ? [] : [[k, String(c[`${k}_language`])]])));
    const section = s(c, 'section')?.toUpperCase() ?? null;
    return { ok: true, row: {
      admission_no: String(c.admission_no).trim(), session: c.session, grade, section,
      class_name: s(c, 'class_name') ?? `${grade! <= 0 ? ['Nursery', 'LKG', 'UKG'][grade! + 2] : grade}${section ? `-${section}` : ''}`,
      roll_no: s(c, 'roll_no'), stream: c.stream ?? null, languages: Object.keys(langs).length ? langs : null, outcome,
    } };
  },
};

const family: Dataset = {
  key: 'family', label: 'Family and emergency contacts', writer: 'import_family', needs: [],
  about: 'One row per family member of a student. Contacts only: parent logins are issued by Sthara and link to these by phone or email.',
  lands: 'Each student\u2019s family on the record, emergency contacts in calling order, and the family code that suggests siblings.',
  matching: 'Admission number, relation and name.',
  columns: [
    ADM,
    { key: 'relation', required: true, kind: 'enum', values: RELATION, example: 'Mother', guide: 'Mother, Father, Guardian, Grandparent, Sibling or Other.' },
    { key: 'name', required: true, kind: 'text', max: 120, example: 'Lakshmi Sharma', guide: 'Full name.' },
    { key: 'phone', required: false, kind: 'text', max: 20, aliases: ['mobile'], example: '9876543210', guide: '10-digit mobile. +91 and spaces are fine.' },
    { key: 'email', required: false, kind: 'text', max: 160, example: '', guide: 'Email address.' },
    { key: 'education', required: false, kind: 'enum', values: EDUCATION, example: 'Graduate', guide: 'No schooling, Primary, Upper primary, Secondary, Higher secondary, Graduate, Post-graduate or Other.' },
    { key: 'occupation', required: false, kind: 'text', max: 80, example: 'Teacher', guide: 'Occupation.' },
    { key: 'annual_income', required: false, kind: 'amount', aliases: ['income'], example: '', guide: 'Income a year, in rupees.' },
    { key: 'primary', required: false, kind: 'enum', values: YES_NO, aliases: ['is_primary'], example: 'Yes', guide: 'Yes for the one person the school contacts first.' },
    { key: 'lives_with', required: false, kind: 'enum', values: YES_NO, example: '', guide: 'No when this person does not live with the student.' },
    { key: 'emergency', required: false, kind: 'int', min: 1, maxValue: 3, aliases: ['emergency_order'], example: '1', guide: '1, 2 or 3: their place in the emergency calling order. Blank when not an emergency contact.' },
    { key: 'family_code', required: false, kind: 'text', max: 40, example: 'SHARMA-01', guide: 'Optional: the same code on brothers and sisters marks one family.' },
  ],
  identity: c => `${admKey(String(c.admission_no))}|${c.relation}|${String(c.name).trim().toLowerCase()}`,
  build(c, n) {
    const f = checkFamily({ relation: c.relation, name: c.name, phone: c.phone ?? '', email: c.email ?? '', education: c.education ?? null, occupation: c.occupation ?? '', annual_income: c.annual_income ?? null });
    if ('error' in f) return fail({ n, error: f.error });
    return { ok: true, row: {
      admission_no: String(c.admission_no).trim(), relation: f.value.relation, name: f.value.name, phone: f.value.phone, email: f.value.email, education: f.value.education,
      occupation: f.value.occupation, annual_income: f.value.annual_income, is_primary: c.primary == null ? null : c.primary === 'true',
      lives_with: c.lives_with == null ? null : c.lives_with === 'true', emergency: num(c, 'emergency'), family_code: s(c, 'family_code')?.trim() ?? null,
    } };
  },
};

const SCREEN: Record<string, string> = Object.fromEntries(SCREEN_RESULTS.flatMap(r => [[r, r], [r.replace('_', ' '), r]]).concat([['no', 'negative'], ['yes', 'confirmed']]));
const impairmentOf = (v: string) => {
  const t = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (IMPAIRMENTS as readonly string[]).includes(t) ? t : IMPAIRMENTS.find(i => IMPAIRMENT_LABEL[i].toLowerCase() === v.trim().toLowerCase()) ?? null;
};

const health: Dataset = {
  key: 'health', label: 'Health records', writer: 'import_health', needs: [],
  about: 'One row per student. The UDISE+ part loads for everyone; allergies, conditions and medication only where the parent has given health consent in Sthara.',
  lands: 'Each student\u2019s health card. Rows without consent keep their UDISE+ part; the rest is left out and counted, not refused.',
  matching: 'Admission number.',
  columns: [
    ADM,
    { key: 'blood_group', required: false, kind: 'text', max: 20, example: 'O+', guide: 'A+, A-, B+, B-, AB+, AB-, O+ or O- ("O positive" works too).' },
    { key: 'height_cm', required: false, kind: 'amount', example: '142', guide: 'Height in cm.' },
    { key: 'weight_kg', required: false, kind: 'amount', example: '36', guide: 'Weight in kg.' },
    { key: 'measured_on', required: false, kind: 'date', example: '', guide: 'When height and weight were measured, DD-MM-YYYY.' },
    { key: 'cwsn', required: false, kind: 'enum', values: YES_NO, example: '', guide: 'Yes for a child with special needs.' },
    { key: 'impairments', required: false, kind: 'text', max: 300, example: '', guide: `Separated by ";": ${IMPAIRMENTS.map(i => IMPAIRMENT_LABEL[i]).join(', ')}.` },
    { key: 'disability_certificate', required: false, kind: 'enum', values: YES_NO, example: '', guide: 'Yes when the child has a disability certificate.' },
    { key: 'disability_percent', required: false, kind: 'int', min: 0, maxValue: 100, example: '', guide: 'Disability percentage on the certificate.' },
    { key: 'sld_screening', required: false, kind: 'enum', values: SCREEN, example: '', guide: 'Not screened, Negative, Referred or Confirmed.' },
    { key: 'asd_screening', required: false, kind: 'enum', values: SCREEN, example: '', guide: 'Not screened, Negative, Referred or Confirmed.' },
    { key: 'adhd_screening', required: false, kind: 'enum', values: SCREEN, example: '', guide: 'Not screened, Negative, Referred or Confirmed.' },
    { key: 'allergies', required: false, kind: 'text', max: 600, example: 'Peanut (severe); Dust', guide: 'Separated by ";", severity in brackets (mild, moderate, severe). Needs health consent.' },
    { key: 'conditions', required: false, kind: 'text', max: 600, example: 'Asthma', guide: 'Separated by ";". Needs health consent.' },
    { key: 'medication', required: false, kind: 'text', max: 600, example: '', guide: 'Separated by ";", as "Salbutamol 2 puffs". Needs health consent.' },
  ],
  identity: c => admKey(String(c.admission_no)),
  build(c, n) {
    const p: Problem[] = [];
    const imp = c.impairments == null ? undefined : String(c.impairments).split(/;/).map(x => x.trim()).filter(Boolean);
    const bad = imp?.find(x => !impairmentOf(x));
    if (bad) p.push({ n, column: 'impairments', error: `Unknown impairment "${bad}".` });
    const screening = Object.fromEntries((['sld', 'asd', 'adhd'] as const).flatMap(k => (c[`${k}_screening`] == null ? [] : [[k, String(c[`${k}_screening`])]])));
    const u = checkUdise({
      ...(c.blood_group != null ? { blood_group: c.blood_group } : {}), ...(c.height_cm != null ? { height_cm: c.height_cm } : {}),
      ...(c.weight_kg != null ? { weight_kg: c.weight_kg } : {}), ...(c.measured_on != null ? { measured_on: c.measured_on } : {}),
      ...(c.cwsn != null ? { cwsn: c.cwsn === 'true' } : {}), ...(imp && !bad ? { impairments: imp.map(impairmentOf) } : {}),
      ...(c.disability_certificate != null ? { disability_certificate: c.disability_certificate === 'true' } : {}),
      ...(c.disability_percent != null ? { disability_percent: c.disability_percent } : {}), ...(Object.keys(screening).length ? { screening } : {}),
    });
    if ('error' in u) p.push({ n, error: u.error });
    if (p.length) return fail(...p);
    const row: Record<string, unknown> = { admission_no: String(c.admission_no).trim(), ...(u as { value: object }).value };
    if (c.allergies != null) row.allergies = parseAllergyList(String(c.allergies));
    if (c.conditions != null) row.conditions = parseNameList(String(c.conditions)).map(name => ({ name, plan: null, serious: false }));
    if (c.medication != null) row.medication = parseNameList(String(c.medication)).map(x => { const m = x.match(/^(.*?)\s+(\d.*)$/); return { name: (m ? m[1] : x).slice(0, 80), dose: m ? m[2].slice(0, 60) : null, timing: null, schoolGives: false }; });
    return { ok: true, row };
  },
};

const healthEvents: Dataset = {
  key: 'health_events', label: 'Check-ups and vaccinations', writer: 'import_health_events', needs: [],
  about: 'One row per check-up or vaccination. Loaded only for students whose parent has given health consent in Sthara.',
  lands: 'The dated health timeline on each student\u2019s record. Rows without consent are left out and counted, not refused.',
  matching: 'Admission number, kind, date and vaccine.',
  columns: [
    ADM,
    { key: 'kind', required: true, kind: 'enum', values: { checkup: 'checkup', 'check-up': 'checkup', 'check up': 'checkup', vaccination: 'vaccination', vaccine: 'vaccination' }, example: 'Check-up', guide: 'Check-up or Vaccination.' },
    { key: 'date', required: true, kind: 'date', example: '15-07-2025', guide: 'DD-MM-YYYY.' },
    { key: 'vaccine', required: false, kind: 'text', max: 60, example: '', guide: 'For a vaccination: the vaccine.' },
    { key: 'dose', required: false, kind: 'text', max: 20, example: '', guide: 'For a vaccination: the dose number.' },
    { key: 'vision_left', required: false, kind: 'text', max: 20, example: '6/6', guide: 'Check-up: left eye.' },
    { key: 'vision_right', required: false, kind: 'text', max: 20, example: '6/6', guide: 'Check-up: right eye.' },
    { key: 'hearing', required: false, kind: 'text', max: 60, example: 'Normal', guide: 'Check-up: hearing.' },
    { key: 'dental', required: false, kind: 'text', max: 60, example: '', guide: 'Check-up: dental findings.' },
    { key: 'height_cm', required: false, kind: 'amount', example: '142', guide: 'Check-up: height in cm.' },
    { key: 'weight_kg', required: false, kind: 'amount', example: '36', guide: 'Check-up: weight in kg.' },
    { key: 'remarks', required: false, kind: 'text', max: 300, example: '', guide: 'The doctor\u2019s remarks.' },
  ],
  identity: c => `${admKey(String(c.admission_no))}|${c.kind}|${c.date}|${String(c.vaccine ?? '').toLowerCase()}`,
  build(c, n) {
    const data = Object.fromEntries(['vaccine', 'dose', 'vision_left', 'vision_right', 'hearing', 'dental', 'height_cm', 'weight_kg', 'remarks'].flatMap(k => (c[k] == null ? [] : [[k, c[k]]])));
    const e = checkEvent({ kind: c.kind, on_date: c.date, data });
    if ('error' in e) return fail({ n, error: e.error });
    return { ok: true, row: { admission_no: String(c.admission_no).trim(), kind: e.value.kind, on_date: e.value.on_date, data: e.value.data, note: null } };
  },
};

/** A file name as the manifest and the upload are matched: cleaned, without case. */
export const fileKey = (name: string) => (cleanFileName(name) ?? '').toLowerCase();

const DOC_KIND_VALUES: Record<string, string> = Object.fromEntries(DOC_KIND_KEYS.flatMap(k => [[k, k], [k.replace(/_/g, ' '), k], [DOC_KINDS[k].label.toLowerCase(), k]]));

const documents: Dataset = {
  key: 'documents', label: 'Student documents', writer: 'import_documents', needs: ['files'], files: true,
  about: 'A manifest, one row per document, with the files themselves: pick them (or the whole folder) after the manifest. Each file up to 25 MB, any type.',
  lands: 'The Documents tab of each student’s record. A file the manifest doesn’t list is reported and not kept.',
  matching: 'Admission number, kind and file name.',
  columns: [
    ADM,
    { key: 'kind', required: true, kind: 'enum', values: DOC_KIND_VALUES, aliases: ['document', 'type'], example: 'Birth certificate', guide: `One of: ${DOC_KIND_KEYS.map(k => DOC_KINDS[k].label).join(', ')}.` },
    { key: 'file_name', required: true, kind: 'text', max: 200, aliases: ['file', 'filename'], example: 'A1024-birth.pdf', guide: 'The file’s name exactly as uploaded with this manifest.' },
    { key: 'title', required: false, kind: 'text', max: 120, example: '', guide: 'What to call it on the record. Blank uses the kind.' },
    { key: 'document_no', required: false, kind: 'text', max: 60, aliases: ['certificate_no', 'number'], example: 'BC/2014/0567', guide: 'The certificate or document number.' },
    { key: 'issued_on', required: false, kind: 'date', example: '12-03-2014', guide: 'When it was issued, DD-MM-YYYY.' },
    { key: 'valid_until', required: false, kind: 'date', aliases: ['expires_on', 'valid_till'], example: '', guide: 'For certificates that expire (income, caste): the last valid day.' },
    { key: 'verified', required: false, kind: 'enum', values: YES_NO, example: 'Yes', guide: 'Yes when the school has seen the original: it counts as verified by whoever commits. Blank waits for the registrar’s check.' },
  ],
  identity: c => `${admKey(String(c.admission_no))}|${c.kind}|${fileKey(String(c.file_name))}`,
  build(c, n, look) {
    const name = cleanFileName(String(c.file_name));
    if (!name) return fail({ n, column: 'file_name', error: 'Give the file’s name.' });
    const f = look.file?.(name) ?? null;
    if (!f) return fail({ n, column: 'file_name', error: `"${name}" wasn’t uploaded with this manifest.` });
    if (f.size > DOC_MAX_BYTES) return fail({ n, column: 'file_name', error: `"${name}" is over 25 MB.` });
    if (c.issued_on != null && c.valid_until != null && String(c.valid_until) < String(c.issued_on)) return fail({ n, column: 'valid_until', error: 'It can’t expire before it was issued.' });
    return { ok: true, row: {
      admission_no: String(c.admission_no).trim(), kind: c.kind, title: c.title, default_title: DOC_KINDS[c.kind as keyof typeof DOC_KINDS].label, document_no: c.document_no,
      issued_on: c.issued_on, valid_until: c.valid_until, verified: c.verified == null ? null : c.verified === 'true', storage_path: f.path, file_name: name, size_bytes: f.size,
    } };
  },
};

export const DATASETS: Dataset[] = [students, enrolments, family, health, healthEvents, documents, attendance, examMarks, legacyResults, feeStructures, feeInvoices, feePayments, applicants];
export const datasetOf = (key: unknown) => DATASETS.find(d => d.key === key) ?? null;

// ── Cells ───────────────────────────────────────────────────────────────────

/** One cell to its stored value, or the problem with it. Blank is null. */
export function cell(col: Column, raw: string, fromXlsx: boolean): { value: string | number | null } | { error: string } {
  const v = raw.trim();
  if (!v) return col.required ? { error: 'Required.' } : { value: null };
  if (col.max && v.length > col.max) return { error: `Longer than ${col.max} characters.` };
  switch (col.kind) {
    case 'text': return { value: v.replace(/\s+/g, ' ') };
    case 'date': { const d = parseDate(v, fromXlsx); return d.ok ? { value: d.iso } : { error: d.error }; }
    case 'session': { const x = parseSession(v); return x ? { value: x } : { error: `"${v}" isn't a session. Write it like 2024-25.` }; }
    case 'amount': { const x = parseAmount(v); return x != null && x <= 1e9 ? { value: x } : { error: `"${v}" isn't an amount. Use digits, with at most two decimals.` }; }
    case 'int': {
      const x = col.key === 'grade' ? parseGrade(v) : /^\d{1,4}$/.test(v) ? Number(v) : null;
      if (x == null || (col.min != null && x < col.min) || (col.maxValue != null && x > col.maxValue)) {
        return { error: `"${v}" should be a whole number${col.min != null ? ` from ${col.min} to ${col.maxValue}` : ''}.` };
      }
      return { value: x };
    }
    case 'enum': {
      const x = col.values![v.toLowerCase().replace(/\s+/g, ' ')] ?? col.values![v.toLowerCase().replace(/[\s-]+/g, '_')];
      return x ? { value: x } : { error: `"${v}" isn't one of: ${enumGuide(col.values!)}.` };
    }
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { value: v.toLowerCase() } : { error: `"${v}" isn't an email address.` };
    case 'phone': {
      const d = v.replace(/[\s()-]/g, '').replace(/^(\+?91|0)(?=\d{10}$)/, '');
      return /^[6-9]\d{9}$/.test(d) ? { value: d } : { error: `"${v}" isn't a 10-digit mobile number.` };
    }
  }
}
