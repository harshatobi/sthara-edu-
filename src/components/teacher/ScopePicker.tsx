'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { normClass, scopeClasses, subjectsIn, type ScopeEntry } from '@/lib/teacher/scope';

/**
 * Resolves the class + subject a teacher page is looking at from the URL
 * (?class, ?subject), falling back to the first class and subject they teach.
 */
export function useScopeSelection(scope: ScopeEntry[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const classes = scopeClasses(scope);
  const wanted = params.get('class');
  const cls = classes.find(c => normClass(c) === normClass(wanted)) ?? classes[0] ?? '';
  const subjects = subjectsIn(scope, cls);
  const wantedSubject = params.get('subject');
  const subject = subjects.find(s => s.toLowerCase() === wantedSubject?.toLowerCase()) ?? subjects[0] ?? '';

  const go = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k); else q.set(k, v);
    }
    const s = q.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  return { classes, cls, subjects, subject, params, go };
}

/** The mockup's "Subject ▾ / Class ▾" header controls, as real selects. */
export default function ScopePicker({ classes, cls, subjects, subject, onChange }: {
  classes: string[]; cls: string; subjects: string[]; subject: string;
  onChange: (next: { class?: string; subject?: string }) => void;
}) {
  return (
    <>
      {subjects.length > 1 && (
        <select className="cmp-sel" style={{ width: 'auto' }} aria-label="Subject" value={subject} onChange={e => onChange({ subject: e.target.value })}>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {classes.length > 1 && (
        <select className="cmp-sel" style={{ width: 'auto' }} aria-label="Class" value={cls} onChange={e => onChange({ class: e.target.value })}>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
    </>
  );
}
