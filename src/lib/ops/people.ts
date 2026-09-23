/**
 * Pure (no I/O) rules for school onboarding: account rows, validation, CSV
 * parsing, temporary passwords. Shared by the /ops console (browser preview)
 * and the server routes (authoritative check), so both apply the same rules.
 */

export const PERSON_ROLES = ['admin', 'teacher', 'student', 'parent'] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export interface SubjectAssignment { class: string; subject: string }

export interface PersonInput {
  role: PersonRole;
  name: string;
  email: string;
  /** Student: their class-section, e.g. "10-A". */
  className?: string;
  /** Student: admission / roll number, unique within the school. Parents link by it. */
  rollNo?: string;
  /** Teacher: classes and subjects they teach. */
  subjects?: SubjectAssignment[];
  /** Teacher: class they are class teacher of. */
  classTeacherOf?: string;
  /** Parent: roll numbers of their children. */
  children?: string[];
}

export interface RowIssue { row: number; field: string; message: string }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const normClass = (c?: string | null) => (c || '').toLowerCase().replace(/class|[^a-z0-9]/g, '');

/**
 * Validates a batch against itself and the school's existing state.
 * `existing` lets the server reject emails / roll numbers already in use.
 */
export function validatePeople(
  rows: PersonInput[],
  ctx: { classes: string[]; existingEmails?: Set<string>; existingRollNos?: Set<string> },
): RowIssue[] {
  const issues: RowIssue[] = [];
  const classSet = new Set(ctx.classes.map(normClass));
  const emails = new Map<string, number>();
  const rolls = new Map<string, number>();
  const batchRolls = new Set(rows.filter(r => r.role === 'student' && r.rollNo).map(r => r.rollNo!.trim().toLowerCase()));
  const add = (row: number, field: string, message: string) => issues.push({ row, field, message });

  rows.forEach((r, i) => {
    const n = i + 1;
    if (!PERSON_ROLES.includes(r.role)) add(n, 'role', `Role must be one of ${PERSON_ROLES.join(', ')}`);
    if (!r.name?.trim()) add(n, 'name', 'Name is required');
    const email = (r.email || '').trim().toLowerCase();
    if (!EMAIL.test(email)) add(n, 'email', 'A valid email is required');
    else if (emails.has(email)) add(n, 'email', `Same email as row ${emails.get(email)}`);
    else if (ctx.existingEmails?.has(email)) add(n, 'email', 'An account with this email already exists');
    else emails.set(email, n);

    if (r.role === 'student') {
      if (!r.className?.trim()) add(n, 'class', 'Students need a class');
      else if (!classSet.has(normClass(r.className))) add(n, 'class', `Class "${r.className}" isn't set up for this school yet`);
      const roll = (r.rollNo || '').trim().toLowerCase();
      if (!roll) add(n, 'rollNo', 'Students need an admission / roll number');
      else if (rolls.has(roll)) add(n, 'rollNo', `Same roll number as row ${rolls.get(roll)}`);
      else if (ctx.existingRollNos?.has(roll)) add(n, 'rollNo', 'This roll number is already used in the school');
      else rolls.set(roll, n);
    }
    if (r.role === 'teacher') {
      for (const s of r.subjects ?? []) {
        if (!s.subject?.trim()) add(n, 'subjects', 'Each assignment needs a subject');
        if (!classSet.has(normClass(s.class))) add(n, 'subjects', `Class "${s.class}" isn't set up for this school yet`);
      }
      if (r.classTeacherOf && !classSet.has(normClass(r.classTeacherOf))) add(n, 'classTeacherOf', `Class "${r.classTeacherOf}" isn't set up for this school yet`);
    }
    if (r.role === 'parent') {
      if (!r.children?.length) add(n, 'children', 'Parents need at least one child roll number');
      for (const c of r.children ?? []) {
        const k = c.trim().toLowerCase();
        if (!batchRolls.has(k) && !ctx.existingRollNos?.has(k)) add(n, 'children', `No student with roll number "${c}"`);
      }
    }
  });
  return issues;
}

// ── CSV ──────────────────────────────────────────────────────────────────────
/**
 * Columns (header row required, any order, case-insensitive):
 *   role, name, email, class, roll_no, subjects, class_teacher_of, children
 * subjects:  "10-A:Mathematics; 10-B:Mathematics"
 * children:  "1042; 1043"   (student roll numbers)
 */
export const CSV_TEMPLATE = [
  'role,name,email,class,roll_no,subjects,class_teacher_of,children',
  'admin,Sunita Rao,principal@school.edu.in,,,,,',
  'teacher,Priya Menon,priya.menon@school.edu.in,,,10-A:Mathematics; 10-B:Mathematics,10-A,',
  'student,Ananya Iyer,ananya.iyer@school.edu.in,10-A,1042,,,',
  'parent,Lakshmi Iyer,lakshmi.iyer@gmail.com,,,,,1042',
].join('\n');

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export function parsePeopleCsv(text: string): { rows: PersonInput[]; error?: string } {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { rows: [], error: 'Paste a header row and at least one person.' };
  const head = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  if (!head.includes('role') || !head.includes('name') || !head.includes('email')) {
    return { rows: [], error: 'The header must include role, name and email.' };
  }
  const col = (cells: string[], k: string) => { const i = head.indexOf(k); return i >= 0 ? cells[i] || '' : ''; };
  const list = (s: string) => s.split(/[;|]/).map(x => x.trim()).filter(Boolean);
  const rows = lines.slice(1).map(line => {
    const c = splitCsvLine(line);
    const role = col(c, 'role').toLowerCase() as PersonRole;
    return {
      role,
      name: col(c, 'name'),
      email: col(c, 'email').toLowerCase(),
      className: col(c, 'class') || undefined,
      rollNo: col(c, 'roll_no') || col(c, 'rollno') || undefined,
      classTeacherOf: col(c, 'class_teacher_of') || undefined,
      subjects: list(col(c, 'subjects')).map(p => {
        const [cls, ...subj] = p.split(':');
        return { class: (cls || '').trim(), subject: subj.join(':').trim() };
      }),
      children: list(col(c, 'children')),
    } satisfies PersonInput;
  });
  return { rows };
}

// ── Credentials ──────────────────────────────────────────────────────────────
const LOWER = 'abcdefghjkmnpqrstuvwxyz', UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ', DIGIT = '23456789', SYM = '@#%&*!?';

/** 12-character temporary password without look-alike characters; one of each class. */
export function tempPassword(rand: (n: number) => number): string {
  const pick = (set: string) => set[rand(set.length)];
  const all = LOWER + UPPER + DIGIT + SYM;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYM), ...Array.from({ length: 8 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) { const j = rand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
