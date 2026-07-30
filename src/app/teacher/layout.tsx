'use client';

import { usePathname } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { LayoutDashboard, Users, Activity, CheckSquare, Heart, ClipboardList, BookMarked, PenLine, BarChart2, Rss } from 'lucide-react';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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

  return (
    <DashboardLayout role="Teacher" subtitle="Diagnostic Engine" navigation={navigation}>
      {children}
    </DashboardLayout>
  );
}
