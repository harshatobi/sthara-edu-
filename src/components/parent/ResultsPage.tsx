'use client';

import { PageBar } from '@/components/canon/ui';
import Results from '@/components/exams/Results';
import { ChildSwitcher, FamilyGate } from './common';

/** A child's published report cards. */
export default function ResultsPage() {
  return (
    <FamilyGate>
      {({ child: c }) => (
        <>
          <ChildSwitcher />
          <PageBar eyebrow="RESULTS" title={`${c.firstName}'s report cards`} sub={`${c.cls}. Every report card the school has published this year and before, as issued.`} />
          <Results childId={c.id} audience="parent" />
        </>
      )}
    </FamilyGate>
  );
}
