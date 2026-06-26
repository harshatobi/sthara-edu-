'use client';

import { usePathname } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Clock, HeartHandshake, Activity, Target } from 'lucide-react';

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navigation = [
    { name: 'Growth Feed', href: '/parent', icon: Activity, current: pathname === '/parent' },
    { name: 'Wellness Monitor', href: '/parent/wellness', icon: HeartHandshake, current: pathname === '/parent/wellness' },
    { name: 'Milestone Timeline', href: '/parent/milestones', icon: Target, current: pathname === '/parent/milestones' },
    { name: 'Parent Sensitization', href: '/parent/sensitization', icon: Clock, current: pathname === '/parent/sensitization' },
  ];

  return (
    <DashboardLayout role="Parent" subtitle="Growth Feed" navigation={navigation}>
      {children}
    </DashboardLayout>
  );
}
