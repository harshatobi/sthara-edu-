'use client';

import { usePathname } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { BarChart3, ShieldCheck, FileText, GraduationCap, Activity, Users } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const now = new Date();
  const academicYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  const navigation = [
    { name: 'Analytics', href: '/admin', icon: BarChart3, current: pathname === '/admin' },
    { name: 'User Directory', href: '/admin/directory', icon: Users, current: pathname === '/admin/directory' },
    { name: 'Academic Results', href: '/admin/results', icon: GraduationCap, current: pathname === '/admin/results' },
    { name: 'School Heatmap', href: '/admin/heatmap', icon: Activity, current: pathname === '/admin/heatmap' },
    { name: `${academicYear} Regulatory Vault`, href: '/admin/vault', icon: ShieldCheck, current: pathname === '/admin/vault' },
    { name: 'Instant Paper Gen', href: '/admin/paper-gen', icon: FileText, current: pathname === '/admin/paper-gen' },
  ];

  return (
    <DashboardLayout role="Admin" subtitle="Command Center" navigation={navigation}>
      {children}
    </DashboardLayout>
  );
}
