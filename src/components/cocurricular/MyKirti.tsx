'use client';

import { TrophyIcon as Trophy } from '@phosphor-icons/react/dist/ssr/Trophy';
import { Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useGet } from '@/components/canon/useGet';
import { useAuth } from '@/contexts/AuthContext';
import KirtiView, { type KirtiRecord } from './KirtiView';

/** The student portal's Kirti: their own house, clubs and approved achievements. */
export function StudentKirti() {
  const { data, error } = useGet<{ record: KirtiRecord | null }>('/api/student/kirti');
  const { profile } = useAuth();
  const first = String((profile as { name?: string } | null)?.name ?? 'You').split(' ')[0];
  return (
    <>
      <PageBar eyebrow="KIRTI" title="Kirti" sub="Your achievements, your house, and everything you took part in." />
      {error && <div className="note err" role="alert">{error}</div>}
      {!data ? <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div>
        : !data.record ? <div className="card"><Empty icon={<Trophy size={26} weight="duotone" />} title="Not on the school register yet" /></div>
          : <KirtiView r={data.record} firstName={first} />}
    </>
  );
}
