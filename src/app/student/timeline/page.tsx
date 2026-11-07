'use client';

import { PageBar } from '@/components/canon/ui';
import { useAuth } from '@/contexts/AuthContext';
import Timeline from '@/components/timeline/Timeline';

/** The student's own timeline (brief 08): their years at school, without fees or discipline. */
export default function Page() {
  const { user } = useAuth();
  return (
    <>
      <PageBar eyebrow="MY TIMELINE" title="My journey" sub="Your wins, how you are growing, and what to try next." />
      {user && <Timeline query={`login=${user.id}`} />}
    </>
  );
}
