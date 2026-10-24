'use client';

import { PageBar } from '@/components/canon/ui';
import Timeline from '@/components/timeline/Timeline';
import { ChildSwitcher, FamilyGate } from './common';

/** The child's timeline on the parent portal (brief 08): every school year, what the school has recorded for the family. */
export default function TimelineView() {
  return (
    <FamilyGate>{({ child: c }) => (
      <>
        <ChildSwitcher />
        <PageBar eyebrow="LIVING RECORD" title={`${c.firstName} over the years`} sub="Attendance, results, mastery, homework, fees, achievements and more, one school year at a time." />
        <Timeline key={c.id} query={`login=${c.id}`} />
      </>
    )}</FamilyGate>
  );
}
