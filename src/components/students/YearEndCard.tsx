'use client';

import { GraduationCapIcon as GraduationCap } from '@phosphor-icons/react/dist/ssr/GraduationCap';
import { useGet } from '@/components/canon/useGet';
import { OUTCOME_LABEL, type Outcome } from '@/lib/students/register';

interface Result { session: string; outcome: Outcome; from: string | null; next: { session: string; cls: string | null; rollNo: string | null } | null }

/**
 * The year-end result once the school has published it: promoted and into which class, for the student portal, or
 * for one child on the parent portal (`studentId`). Shows nothing until then.
 */
export default function YearEndCard({ studentId }: { studentId?: string }) {
  const { data } = useGet<{ results: { studentId: string; result: Result | null }[] }>('/api/portal/year-end');
  const r = data?.results.find(x => !studentId || x.studentId === studentId)?.result;
  if (!r) return null;
  const promoted = r.outcome === 'promoted' || r.outcome === 'promoted_no_exam';
  return (
    <div className="card" role="status" style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 18, borderLeft: `4px solid ${promoted ? 'var(--green)' : 'var(--blue)'}` }}>
      <GraduationCap size={34} weight="duotone" color={promoted ? 'var(--green)' : 'var(--blue)'} aria-hidden="true" />
      <div>
        <div className="muted" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em' }}>YEAR END {r.session.replace('-', '–')}</div>
        <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>
          {OUTCOME_LABEL[r.outcome]}{r.next?.cls ? ` · ${r.next.cls} in ${r.next.session.replace('-', '–')}` : ''}
        </div>
        {r.next?.rollNo && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Roll number {r.next.rollNo}</div>}
      </div>
    </div>
  );
}
