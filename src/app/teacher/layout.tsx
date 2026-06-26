'use client';

import { usePathname } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { LayoutDashboard, Users, Activity, CheckSquare, Heart } from 'lucide-react';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navigation = [
    { name: 'Dashboard', href: '/teacher', icon: LayoutDashboard, current: pathname === '/teacher' },
    { name: 'Syllabus & Homework', href: '/teacher/syllabus', icon: Activity, current: pathname === '/teacher/syllabus' },
    { name: 'AI Assistant', href: '/teacher/ai-assistant', icon: Users, current: pathname === '/teacher/ai-assistant' },
    { name: 'Class Heat Map', href: '/teacher/heatmap', icon: Users, current: pathname === '/teacher/heatmap' },
    { name: 'Mastery Tracker', href: '/teacher/mastery', icon: Activity, current: pathname === '/teacher/mastery' },
    { name: 'Situational Feed', href: '/teacher/feed', icon: Activity, current: pathname === '/teacher/feed' },
    { name: 'Student Wellness', href: '/teacher/wellness', icon: Heart, current: pathname === '/teacher/wellness' },
  ];

  return (
    <DashboardLayout role="Teacher" subtitle="Diagnostic Engine" navigation={navigation}>
      {children}
    </DashboardLayout>
  );
}
