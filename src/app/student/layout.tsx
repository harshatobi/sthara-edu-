'use client';

import { HouseIcon as House } from '@phosphor-icons/react/dist/ssr/House';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { BrainIcon as Brain } from '@phosphor-icons/react/dist/ssr/Brain';
import { HeartIcon as Heart } from '@phosphor-icons/react/dist/ssr/Heart';
import CanonShell, { type CanonNavItem } from '@/components/canon/CanonShell';
import AuthStatus from '@/components/ui/AuthStatus';
import { useRoleGuard } from '@/lib/auth/useRoleGuard';
import { StudentDeskProvider } from '@/lib/student/useStudentDesk';
import { WellnessProvider } from '@/lib/student/useWellness';

// Canon nav order and labels (mockup ROLES.student). The Video Library route
// still exists at /student/videos but isn't part of the canon student desk.
const NAV: CanonNavItem[] = [
  { href: '/student', label: 'Dashboard', short: 'Home', icon: House, exact: true },
  { href: '/student/homework', label: 'Homework', icon: FileText },
  { href: '/student/mastery', label: 'Mastery Tracker', short: 'Mastery', icon: ChartLineUp },
  { href: '/student/tutor', label: 'AI Tutor', short: 'Tutor', icon: Brain },
  { href: '/student/wellness', label: 'Wellness Center', short: 'Wellness', icon: Heart },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { profile, authorized } = useRoleGuard('student');
  if (!authorized || !profile) return <AuthStatus />;
  // Providers live in the layout, which persists across tab switches, so each
  // page reads already-loaded data instead of refetching behind a skeleton.
  return (
    <StudentDeskProvider>
      <WellnessProvider>
        <CanonShell subtitle="HONEST DESK" nav={NAV} label="Student navigation">{children}</CanonShell>
      </WellnessProvider>
    </StudentDeskProvider>
  );
}
