'use client';

import { usePathname } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { BarChart3, ShieldCheck, FileText, GraduationCap } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navigation = [
    { name: 'Analytics', href: '/admin', icon: BarChart3, current: pathname === '/admin' },
    { name: 'Academic Results', href: '/admin/results', icon: GraduationCap, current: pathname === '/admin/results' },
    { name: '2026 Regulatory Vault', href: '/admin/vault', icon: ShieldCheck, current: pathname === '/admin/vault' },
    { name: 'Instant Paper Gen', href: '/admin/paper-gen', icon: FileText, current: pathname === '/admin/paper-gen' },
  ];

  return (
    <DashboardLayout role="Admin" subtitle="Command Center" navigation={navigation}>
      {children}
    </DashboardLayout>
  );
}
