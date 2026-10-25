'use client';

import { PageBar } from '@/components/canon/ui';
import { useAuth } from '@/contexts/AuthContext';
import Timeline from '@/components/timeline/Timeline';

/** The student's own timeline (brief 08): their years at school, without fees or discipline. */
export default function Page() {
  const { user } = useAuth();
  return (
    <>
      <PageBar eyebrow="MY TIMELINE" title="My years at school" sub="Attendance, results, mastery, homework and achievements, one school year at a time." />
      {user && <Timeline query={`login=${user.id}`} />}
    </>
  );
}
