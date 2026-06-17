'use client';

import { usePathname } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Clock, HeartHandshake } from 'lucide-react';

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navigation = [
    { name: 'Milestone Timeline', href: '/parent', icon: Clock, current: pathname === '/parent' },
    { name: 'Parent Sensitization', href: '/parent/sensitization', icon: HeartHandshake, current: pathname === '/parent/sensitization' },
  ];

  return (
    <DashboardLayout role="Parent" subtitle="Growth Feed" navigation={navigation}>
      {children}
    </DashboardLayout>
  );
}
