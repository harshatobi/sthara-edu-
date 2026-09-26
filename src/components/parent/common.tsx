'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { StudentIcon as Student } from '@phosphor-icons/react/dist/ssr/Student';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { ArrowUpIcon as ArrowUp } from '@phosphor-icons/react/dist/ssr/ArrowUp';
import { ArrowDownIcon as ArrowDown } from '@phosphor-icons/react/dist/ssr/ArrowDown';
import { Empty, Skeleton } from '@/components/canon/ui';
import { useFamily } from '@/lib/parent/useFamily';
import type { Band, Child, FamilyView } from '@/lib/parent/family';
import type { ProbeFinding } from '@/lib/parent/probe';

/** Loading / error / no-linked-child states shared by every parent page. */
export function FamilyGate({ children, skeleton }: {
  children: (x: { view: FamilyView; child: Child; findings: ProbeFinding[] }) => ReactNode;
  skeleton?: ReactNode;
}) {
  const { view, child, findings, error, reload } = useFamily();
  if (error && !view) {
    return (
      <div className="card"><Empty icon={<Warning size={34} weight="duotone" />} title="Your family’s records didn’t load">
        {error} <button className="btn sm" style={{ marginLeft: 8 }} onClick={reload}>Try again</button>
      </Empty></div>
    );
  }
  if (!view) return <>{skeleton ?? <PageSkeleton />}</>;
  if (!child) {
    return (
      <div className="card"><Empty icon={<Student size={34} weight="duotone" />} title="No child is linked to your account yet">
        The school office links parents to students after checking. Once they have, everything about your child’s
        schoolwork, progress and fees appears here. <Link href="/parent/messages?new=office" className="pa-link">Ask the office to link you</Link>
      </Empty></div>
    );
  }
  return <>{children({ view, child, findings })}</>;
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton h={86} style={{ borderRadius: 20, marginBottom: 22 }} />
      <div className="kpis">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={132} style={{ borderRadius: 20 }} />)}</div>
      <div className="g2"><Skeleton h={300} style={{ borderRadius: 20 }} /><Skeleton h={300} style={{ borderRadius: 20 }} /></div>
    </div>
  );
}

/** Pills to switch the child in focus (hidden with one child). */
export function ChildSwitcher() {
  const { view, child, setChildId } = useFamily();
  if (!view || view.children.length < 2 || !child) return null;
  return (
    <div className="pa-kids" role="tablist" aria-label="Choose a child">
      {view.children.map(c => (
        <button key={c.id} role="tab" aria-selected={c.id === child.id} className={c.id === child.id ? 'on' : ''} onClick={() => setChildId(c.id)}>
          <span className="pa-kid-av" aria-hidden="true"><Student size={18} weight={c.id === child.id ? 'fill' : 'duotone'} /></span>
          <span><b>{c.firstName}</b><i>{c.cls}</i></span>
        </button>
      ))}
    </div>
  );
}

export function BandChip({ band, score }: { band: Band | null; score?: number | null }) {
  if (!band) return <span className="ch n">No evidence yet</span>;
  return (
    <span className="pa-band" style={{ ['--b' as string]: band.color }}>
      <i aria-hidden="true" />{score !== undefined && score !== null ? `${score}% · ` : ''}{band.band}
    </span>
  );
}

/** Three-week change on the same chapters (SubjectScore.delta). */
export function Trend({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return null;
  const up = delta > 0;
  return (
    <span className={`pa-trend ${up ? 'up' : 'down'}`} title={`${up ? 'Up' : 'Down'} ${Math.abs(delta)} points in three weeks, on the same chapters`}>
      {up ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" />}{Math.abs(delta)}
    </span>
  );
}

export const TONE_COLOR: Record<string, string> = { r: '#E11D48', a: '#F59E0B', g: '#10B981', b: '#2F6BFF', n: '#9AA6B8' };

export const BAND_KEY: { band: string; range: string; color: string; meaning: string }[] = [
  { band: 'Exemplary', range: '90–100', color: '#10B981', meaning: 'Ready for stretch and olympiad-level work' },
  { band: 'Proficient', range: '75–89', color: '#34D399', meaning: 'Secure; CBSE distinction level' },
  { band: 'Developing', range: '50–74', color: '#F5B60B', meaning: 'Getting there; focused practice closes the gaps' },
  { band: 'Critical Gap', range: '35–49', color: '#F98A4B', meaning: 'The AI tutor sets a guided session; the teacher is alerted' },
  { band: 'Severe Need', range: 'under 35', color: '#E11D48', meaning: 'A remediation plan starts, and you are told' },
];
