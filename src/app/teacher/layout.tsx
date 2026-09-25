'use client';

import { usePathname } from 'next/navigation';
import { SquaresFourIcon as SquaresFour } from '@phosphor-icons/react/dist/ssr/SquaresFour';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { ClipboardTextIcon as ClipboardText } from '@phosphor-icons/react/dist/ssr/ClipboardText';
import { LightningIcon as Lightning } from '@phosphor-icons/react/dist/ssr/Lightning';
import { BrainIcon as Brain } from '@phosphor-icons/react/dist/ssr/Brain';
import { FireIcon as Fire } from '@phosphor-icons/react/dist/ssr/Fire';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { BellIcon as Bell } from '@phosphor-icons/react/dist/ssr/Bell';
import { HeartIcon as Heart } from '@phosphor-icons/react/dist/ssr/Heart';
import { CalendarBlankIcon as CalendarBlank } from '@phosphor-icons/react/dist/ssr/CalendarBlank';
import CanonShell, { type CanonNavItem } from '@/components/canon/CanonShell';
import TeacherDemoPortal from '@/components/teacher/TeacherDemoPortal';
import AuthStatus from '@/components/ui/AuthStatus';
import { useAuth } from '@/contexts/AuthContext';
import { useRoleGuard } from '@/lib/auth/useRoleGuard';
import type { TeacherView } from '@/lib/demo/teacher';
import { TeacherDeskProvider } from '@/lib/teacher/useTeacherDesk';

// Canon teacher nav (mockup ROLES.teacher). Attendance isn't built yet, so it isn't listed.
const NAV: CanonNavItem[] = [
  { href: '/teacher', label: 'Dashboard', short: 'Home', icon: SquaresFour, exact: true },
  { href: '/teacher/homework', label: 'Homework', icon: FileText },
  { href: '/teacher/quiz', label: 'Quiz Creator', short: 'Quiz', icon: ClipboardText },
  { href: '/teacher/syllabus', label: 'Syllabus', icon: Lightning },
  { href: '/teacher/ai-assistant', label: 'AI Assistant', short: 'AI', icon: Brain },
  { href: '/teacher/heatmap', label: 'Class Heat Map', short: 'Heat map', icon: Fire },
  { href: '/teacher/mastery', label: 'Mastery Tracker', short: 'Mastery', icon: ChartLineUp },
  { href: '/teacher/feed', label: 'Situational Feed', short: 'Feed', icon: Bell },
  { href: '/teacher/wellness', label: 'Student Wellness', short: 'Wellness', icon: Heart },
  { href: '/teacher/leave', label: 'Apply Leave', short: 'Leave', icon: CalendarBlank },
];

const DEMO_VIEWS: Record<string, TeacherView> = {
  syllabus: 'syl', homework: 'syl', quiz: 'quiz', 'ai-assistant': 'ai', heatmap: 'heat', mastery: 'mast', feed: 'feed', wellness: 'well',
};

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { profile, authorized } = useRoleGuard('Teacher');

  if (!authorized || !profile) return <AuthStatus />;
  // Local no-backend dev bypass only (no Supabase session): the sample desk.
  // A signed-in teacher always gets their own school's real data.
  if (process.env.NODE_ENV === 'development' && !user) {
    return <TeacherDemoPortal key={pathname} initialView={DEMO_VIEWS[pathname.split('/')[2]] || 'dash'} />;
  }
  return (
    <TeacherDeskProvider>
      <CanonShell subtitle="TEACHING COPILOT" nav={NAV} label="Teacher navigation">{children}</CanonShell>
    </TeacherDeskProvider>
  );
}
