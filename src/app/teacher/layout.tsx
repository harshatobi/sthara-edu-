'use client';

import { usePathname } from 'next/navigation';
import TeacherDemoPortal from '@/components/teacher/TeacherDemoPortal';
import { useAuth } from '@/contexts/AuthContext';
import type { TeacherView } from '@/lib/demo/teacher';
import AuthStatus from '@/components/ui/AuthStatus';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useRoleGuard } from '@/lib/auth/useRoleGuard';
import { LayoutDashboard, Users, Activity, CheckSquare, Heart, ClipboardList, BookMarked, PenLine, BarChart2, Rss } from 'lucide-react';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { authorized } = useRoleGuard('Teacher');

  const navigation = [
    { name: 'Dashboard',         href: '/teacher',              icon: LayoutDashboard, current: pathname === '/teacher' },
    { name: 'Syllabus Manager',  href: '/teacher/syllabus',     icon: BookMarked,      current: pathname === '/teacher/syllabus' },
    { name: 'Homework Generator',href: '/teacher/homework',     icon: PenLine,         current: pathname.startsWith('/teacher/homework') },
    { name: 'Assignment Manager',href: '/teacher/assignments',  icon: CheckSquare,     current: pathname === '/teacher/assignments' },
    { name: 'Quiz Creator',      href: '/teacher/quiz',         icon: ClipboardList,   current: pathname.startsWith('/teacher/quiz') },
    { name: 'AI Assistant',      href: '/teacher/ai-assistant', icon: Users,           current: pathname === '/teacher/ai-assistant' },
    { name: 'Class Heat Map',    href: '/teacher/heatmap',      icon: BarChart2,       current: pathname === '/teacher/heatmap' },
    { name: 'Mastery Tracker',   href: '/teacher/mastery',      icon: Activity,        current: pathname === '/teacher/mastery' },
    { name: 'Situational Feed',  href: '/teacher/feed',         icon: Rss,             current: pathname === '/teacher/feed' },
    { name: 'Student Wellness',  href: '/teacher/wellness',     icon: Heart,           current: pathname === '/teacher/wellness' },
  ];

  if (!authorized) return <AuthStatus />;
  if (process.env.NODE_ENV === 'development' && !user && pathname !== '/teacher') {
    const views: Record<string, TeacherView> = { syllabus: 'syl', homework: 'syl', assignments: 'syl', quiz: 'quiz', 'ai-assistant': 'ai', heatmap: 'heat', mastery: 'mast', feed: 'feed', wellness: 'well', grading: 'review' };
    return <TeacherDemoPortal key={pathname} initialView={views[pathname.split('/')[2]] || 'dash'} />;
  }
  if (pathname === '/teacher') return <>{children}</>;

  return (
    <DashboardLayout role="Teacher" subtitle="Diagnostic Engine" navigation={navigation}>
      {children}
    </DashboardLayout>
  );
}
