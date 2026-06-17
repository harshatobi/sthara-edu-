'use client';

import { usePathname } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Home, PenTool, Video, Smile, MessageSquare } from 'lucide-react';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navigation = [
    { name: 'Dashboard', href: '/student', icon: Home, current: pathname === '/student' },
    { name: 'Homework (Proctored)', href: '/student/homework', icon: PenTool, current: pathname === '/student/homework' },
    { name: 'Video Library', href: '/student/videos', icon: Video, current: pathname === '/student/videos' },
    { name: 'AI Tutor', href: '/student/tutor', icon: MessageSquare, current: pathname === '/student/tutor' },
    { name: 'Wellness Center', href: '/student/wellness', icon: Smile, current: pathname === '/student/wellness' },
  ];

  return (
    <DashboardLayout role="Student" subtitle="Honest Desk" navigation={navigation}>
      {children}
    </DashboardLayout>
  );
}
