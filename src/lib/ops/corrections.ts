/**
 * Pure (no I/O) rules for bulk roster corrections from a CSV: which account
 * each row means, what would change, and why a row is refused. The console
 * shows the preview; the server re-runs the same check before applying.
 *
 * CSV: email (who, required), then any of name, new_email, roll_no, class.
 * A blank cell means "leave as is".
 */
import { normClass, splitCsvLine } from './people';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const CORRECTIONS_TEMPLATE = [
  'email,name,new_email,roll_no,class',
  'ananya.iyer@school.edu.in,Ananya R. Iyer,,,',
  'old.address@school.edu.in,,new.address@school.edu.in,,',
  'kabir@school.edu.in,,,1043,9-B',
].join('\n');

export interface CorrectionInput { email: string; name?: string; newEmail?: string; rollNo?: string; className?: string }

export interface RosterPerson {
  id: string; role: string; name: string; email: string; student_class: string | null; custom_student_id: string | null;
}

export type CorrectionField = 'name' | 'email' | 'rollNo' | 'class';
export interface CorrectionChange { field: CorrectionField; from: string | null; to: string }
export interface CorrectionPlan {
  row: number; email: string; userId: string | null; name: string | null; role: string | null;
  changes: CorrectionChange[]; issues: string[];
}

export function parseCorrectionsCsv(text: string): { rows: CorrectionInput[]; error?: string } {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { rows: [], error: 'Paste a header row and at least one correction.' };
  const head = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  if (!head.includes('email')) return { rows: [], error: 'The header must include email (the account to correct).' };
  if (!['name', 'new_email', 'roll_no', 'class'].some(k => head.includes(k))) {
    return { rows: [], error: 'Add at least one column to correct: name, new_email, roll_no or class.' };
  }
  const col = (c: string[], k: string) => { const i = head.indexOf(k); return i >= 0 ? (c[i] || '').trim() : ''; };
  if (lines.length > 501) return { rows: [], error: 'At most 500 corrections at a time.' };
  return {
    rows: lines.slice(1).map(line => {
      const c = splitCsvLine(line);
      return {
        email: col(c, 'email').toLowerCase(),
        name: col(c, 'name') || undefined,
        newEmail: col(c, 'new_email').toLowerCase() || undefined,
        rollNo: col(c, 'roll_no') || undefined,
        className: col(c, 'class') || undefined,
      };
    }),
  };
}

/**
 * Plans every row against the school's roster. `takenEmails` holds emails used
 * anywhere on the platform (one login per email), not just in this school.
 */
export function planCorrections(rows: CorrectionInput[], ctx: { people: RosterPerson[]; classes: string[]; takenEmails: Set<string> }): CorrectionPlan[] {
  const byEmail = new Map(ctx.people.map(p => [p.email.toLowerCase(), p]));
  const classByNorm = new Map(ctx.classes.map(c => [normClass(c), c]));
  const rollOwner = new Map(ctx.people.filter(p => p.custom_student_id).map(p => [p.custom_student_id!.trim().toLowerCase(), p.id]));
  const seenWho = new Map<string, number>(), seenEmail = new Map<string, number>(), seenRoll = new Map<string, number>();

  return rows.map((r, i) => {
    const row = i + 1;
    const issues: string[] = [];
    const changes: CorrectionChange[] = [];
    const email = (r.email || '').trim().toLowerCase();
    const p = byEmail.get(email) ?? null;
    if (!email) issues.push('Email is required');
    else if (!p) issues.push('No account with this email at this school');
    else if (p.role === 'superadmin') issues.push('Operator accounts are not corrected here');
    if (email && seenWho.has(email)) issues.push(`Same account as row ${seenWho.get(email)}`);
    else if (email) seenWho.set(email, row);

    if (p) {
      if (r.name !== undefined) {
        const name = r.name.trim().slice(0, 120);
        if (!name) issues.push('Name cannot be blank');
        else if (name !== p.name) changes.push({ field: 'name', from: p.name, to: name });
      }
      if (r.newEmail !== undefined && r.newEmail !== email) {
        const ne = r.newEmail.trim().toLowerCase();
        if (!EMAIL.test(ne)) issues.push(`"${r.newEmail}" is not a valid email`);
        else if (ctx.takenEmails.has(ne)) issues.push(`${ne} is already used by another account`);
        else if (seenEmail.has(ne)) issues.push(`Same new email as row ${seenEmail.get(ne)}`);
        else { seenEmail.set(ne, row); changes.push({ field: 'email', from: p.email, to: ne }); }
      }
      if (r.rollNo !== undefined || r.className !== undefined) {
        if (p.role !== 'student') issues.push('Roll number and class apply to students only');
        else {
          if (r.rollNo !== undefined && r.rollNo.trim() !== (p.custom_student_id ?? '')) {
            const roll = r.rollNo.trim().slice(0, 40), k = roll.toLowerCase();
            const owner = rollOwner.get(k);
            if (owner && owner !== p.id) issues.push(`Roll number ${roll} belongs to another student`);
            else if (seenRoll.has(k)) issues.push(`Same roll number as row ${seenRoll.get(k)}`);
            else { seenRoll.set(k, row); changes.push({ field: 'rollNo', from: p.custom_student_id, to: roll }); }
          }
          if (r.className !== undefined) {
            const cls = classByNorm.get(normClass(r.className));
            if (!cls) issues.push(`Class "${r.className}" isn't set up for this school`);
            else if (normClass(cls) !== normClass(p.student_class ?? '')) changes.push({ field: 'class', from: p.student_class, to: cls });
          }
        }
      }
    }
    // A row that already matches its account has no changes and no issues: it is skipped, not refused.
    return { row, email, userId: p?.id ?? null, name: p?.name ?? null, role: p?.role ?? null, changes, issues };
  });
}
