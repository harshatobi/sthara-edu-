'use client';

import { TrophyIcon as Trophy } from '@phosphor-icons/react/dist/ssr/Trophy';
import { Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useGet } from '@/components/canon/useGet';
import KirtiView, { type KirtiRecord } from '@/components/cocurricular/KirtiView';
import { ChildSwitcher, FamilyGate } from './common';

/** Kirti on the parent portal: the child's house, clubs and teams, and approved achievements. */
export default function Kirti() {
  return <FamilyGate>{({ child: c }) => <Body childId={c.id} firstName={c.firstName} />}</FamilyGate>;
}

function Body({ childId, firstName }: { childId: string; firstName: string }) {
  const { data, error } = useGet<{ children: { studentId: string; record: KirtiRecord }[] }>('/api/parent/kirti');
  const r = data?.children.find(x => x.studentId === childId)?.record;
  return (
    <>
      <ChildSwitcher />
      <PageBar eyebrow="KIRTI" title={`${firstName}'s Kirti`} sub="Achievements, house and clubs, as the school has recorded and approved them." />
      {error && <div className="note err" role="alert">{error}</div>}
      {!data ? <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div>
        : !r ? <div className="card"><Empty icon={<Trophy size={26} weight="duotone" />} title="Not on the school register yet" /></div>
          : <KirtiView r={r} firstName={firstName} />}
    </>
  );
}
