'use client';

import { useCallback } from 'react';
import { PageBar, Skeleton } from '@/components/canon/ui';
import { useGet } from '@/components/canon/useGet';
import FamilyApplications, { type Send } from '@/components/admissions/FamilyApplications';

const PATH = '/api/parent/admissions';

/**
 * Applying for another child (a sibling) from the parent portal: the same application as the school's apply page,
 * started with the family and address already on the school's record.
 */
export default function Admissions() {
  const { data, error, call } = useGet<{ school: string | null; open: boolean; note: string | null }>(PATH);
  const send: Send = useCallback(body => call(PATH, 'POST', body), [call]) as Send;
  return (
    <>
      <PageBar eyebrow="ADMISSIONS" title="Apply for a sibling"
        sub={data?.school ? `Apply to ${data.school} for another child. Your family and address are filled in from your child’s record; check them before sending.` : undefined} />
      {error ? <div className="note err" role="alert">{error}</div>
        : !data ? <div className="card"><Skeleton h={22} style={{ marginBottom: 14 }} /><Skeleton h={22} /></div>
        : (<>
          {data.note && <div className="note" style={{ marginBottom: 16, whiteSpace: 'pre-line' }}>{data.note}</div>}
          <FamilyApplications send={send} canCreate={data.open} closedNote="The school isn’t taking applications online at the moment. Contact the admissions office." />
        </>)}
    </>
  );
}
