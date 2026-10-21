/**
 * The datasets Sthara publishes import formats for, one definition each: the columns (with the guide a school
 * reads), how a row is checked, and how people-facing keys (admission number, class, assessment, subject) turn
 * into ids. Pure: the template download, the dry run and the tests all use these same definitions.
 *
 * A student is named by admission number in every file. Until the admission register lands (brief 01) that is the
 * school's own student ID, users.custom_student_id.
 *
 * Blank optional cells leave what is stored alone (sent as null). A class, assessment or subject the school has not
 * set up is refused, never created.
 */
import { normClass } from '@/lib/teacher/scope';
import { evenSchedule, validateSchedule } from '@/lib/admin/fees';
import { parseAmount, parseDate, parseSession } from './parse';

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
  /** Admission number (as admKey) to the student. */
  students: Map<string, { id: string; name: string }>;
  /** Admission numbers two or more students share: refused until the school fixes them. */
  ambiguous?: Set<string>;
  /** normClass(name) to the class name as the school writes it. */
  classes: Map<string, string>;
  /** sheetKey(assessment, class, subject) to the open or closed marks sheet. */
  sheets: Map<string, { id: string; max: number; status: string }>;
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
  needs: ('students' | 'classes' | 'sheets')[];
  /** Identity of a row inside one file; null when the row has none (never a duplicate). */
  identity: (c: Cells) => string | null;
  /** Rows sharing this go in the same chunk. */
  group?: (r: Record<string, unknown>) => string;
  build: (c: Cells, n: number, look: Lookups) => Built;
}

// ── Keys ────────────────────────────────────────────────────────────────────

/** Admission numbers compare without case or surrounding spaces; "A-001" and "a-001" are the same student. */
export const admKey = (v: string) => v.trim().toLowerCase().replace(/\s+/g, '');
const nameKey = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const sheetKey = (assessment: string, cls: string, subject: string) => `${nameKey(assessment)}|${normClass(cls)}|${nameKey(subject)}`;

const ADM: Column = {
  key: 'admission_no', required: true, kind: 'text', max: 40, aliases: ['admission_number', 'adm_no', 'admn_no', 'student_id'],
  example: 'A1024', guide: 'The student’s admission number, exactly as the school writes it.',
};

const s = (c: Cells, k: string) => (c[k] == null ? null : String(c[k]));
const num = (c: Cells, k: string) => (c[k] == null ? null : Number(c[k]));

function student(c: Cells, n: number, look: Lookups): { id: string } | Problem {
  const adm = s(c, 'admission_no')!;
  if (look.ambiguous?.has(admKey(adm))) return { n, column: 'admission_no', error: `More than one student has admission number "${adm}". Fix that in the roster first.` };
  const st = look.students.get(admKey(adm));
  return st ? { id: st.id } : { n, column: 'admission_no', error: `No student with admission number "${adm}" in this school.` };
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

export const DATASETS: Dataset[] = [attendance, examMarks, legacyResults, feeStructures, feeInvoices, feePayments, applicants];
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
