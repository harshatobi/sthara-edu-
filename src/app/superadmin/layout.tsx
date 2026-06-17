'use client';

import { usePathname } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { LayoutDashboard, Building2, Video, Settings, Activity } from 'lucide-react';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navigation = [
    { name: 'Global Overview', href: '/superadmin', icon: LayoutDashboard, current: pathname === '/superadmin' },
    { name: 'School Management', href: '/superadmin/schools', icon: Building2, current: pathname === '/superadmin/schools' },
    { name: 'Global Content Library', href: '/superadmin/content', icon: Video, current: pathname === '/superadmin/content' },
    { name: 'System Logs', href: '/superadmin/logs', icon: Activity, current: pathname === '/superadmin/logs' },
    { name: 'Settings', href: '/superadmin/settings', icon: Settings, current: pathname === '/superadmin/settings' },
  ];

  return (
    <DashboardLayout role="SuperAdmin" subtitle="Platform Owner" navigation={navigation}>
      {children}
    </DashboardLayout>
  );
}
