/**
 * A teacher's teaching scope: the (class, subject) pairs they teach, from
 * users.assignments ([{class, subject}]), plus the class they're class
 * teacher of. Pure, shared by the desk and the server routes that enforce it.
 */

export interface ScopeEntry { cls: string; subject: string }

/** "Class 10-A", "10A", "10 a" -> "10a" (same rule as app.norm_class in the database). */
export const normClass = (c: string | null | undefined) => (c || '').toLowerCase().replace(/class|[^a-z0-9]/g, '');
export const normSubject = (s: string | null | undefined) => (s || '').trim().toLowerCase();

/** "10a" / "10-A" / "Class 10-A" -> "Class 10-A", the display form the roster uses. */
export function displayClass(c: string | null | undefined): string {
  const n = normClass(c);
  const m = n.match(/^(\d{1,2})([a-z]*)$/);
  return m ? `Class ${m[1]}${m[2] ? `-${m[2].toUpperCase()}` : ''}` : (c || '').trim();
}

export function teachingScope(row: { assignments?: unknown; teacher_class?: string | null; teacher_subject?: string | null }): ScopeEntry[] {
  const out: ScopeEntry[] = [];
  const seen = new Set<string>();
  const add = (cls: unknown, subject: unknown) => {
    if (typeof cls !== 'string' || !normClass(cls)) return;
    const subj = typeof subject === 'string' ? subject.trim() : '';
    const key = `${normClass(cls)}::${normSubject(subj)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ cls: displayClass(cls), subject: subj });
  };
  if (Array.isArray(row.assignments)) for (const a of row.assignments) add(a?.class, a?.subject);
  // A class teacher with no subject rows still manages their own class.
  if (row.teacher_class && !out.some(e => normClass(e.cls) === normClass(row.teacher_class))) add(row.teacher_class, row.teacher_subject || '');
  return out;
}

/** Distinct classes in a scope, in scope order. */
export const scopeClasses = (scope: ScopeEntry[]) =>
  scope.filter((e, i) => scope.findIndex(x => normClass(x.cls) === normClass(e.cls)) === i).map(e => e.cls);

/** Subjects this teacher teaches in a class. */
export const subjectsIn = (scope: ScopeEntry[], cls: string) =>
  scope.filter(e => normClass(e.cls) === normClass(cls) && e.subject).map(e => e.subject);

/** May this teacher set work for (class, subject)? Class-teacher rows with no subject allow any subject. */
export function inScope(scope: ScopeEntry[], cls: string | null | undefined, subject: string | null | undefined): boolean {
  return scope.some(e => normClass(e.cls) === normClass(cls) && (!e.subject || normSubject(e.subject) === normSubject(subject)));
}
