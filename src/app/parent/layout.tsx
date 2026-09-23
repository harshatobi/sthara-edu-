'use client';

import { usePathname } from 'next/navigation';
import AuthStatus from '@/components/ui/AuthStatus';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useRoleGuard } from '@/lib/auth/useRoleGuard';
import { Clock, HeartHandshake, Activity, Target, TrendingUp } from 'lucide-react';

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { authorized } = useRoleGuard('Parent');

  const navigation = [
    { name: 'Growth Feed', href: '/parent', icon: Activity, current: pathname === '/parent' },
    { name: 'Mastery Heatmap', href: '/parent/mastery', icon: TrendingUp, current: pathname === '/parent/mastery' },
    { name: 'Wellness Monitor', href: '/parent/wellness', icon: HeartHandshake, current: pathname === '/parent/wellness' },
    { name: 'Milestone Timeline', href: '/parent/milestones', icon: Target, current: pathname === '/parent/milestones' },
    { name: 'Parent Sensitization', href: '/parent/sensitization', icon: Clock, current: pathname === '/parent/sensitization' },
  ];

  if (!authorized) return <AuthStatus />;
  if (pathname === '/parent') return <>{children}</>;

  return (
    <DashboardLayout role="Parent" subtitle="Growth Feed" navigation={navigation}>
      {children}
    </DashboardLayout>
  );
}
