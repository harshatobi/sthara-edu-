'use client';

import { SquaresFourIcon as SquaresFour } from '@phosphor-icons/react/dist/ssr/SquaresFour';
import { CurrencyInrIcon as CurrencyInr } from '@phosphor-icons/react/dist/ssr/CurrencyInr';
import { CalendarBlankIcon as CalendarBlank } from '@phosphor-icons/react/dist/ssr/CalendarBlank';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { HeartIcon as Heart } from '@phosphor-icons/react/dist/ssr/Heart';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { KeyIcon as Key } from '@phosphor-icons/react/dist/ssr/Key';
import CanonShell, { type CanonNavItem } from '@/components/canon/CanonShell';
import AdminDemoPortal from '@/components/admin/AdminDemoPortal';
import AuthStatus from '@/components/ui/AuthStatus';
import { useAuth } from '@/contexts/AuthContext';
import { useRoleGuard } from '@/lib/auth/useRoleGuard';
import { AdminDeskProvider, useAdminDesk } from '@/lib/admin/useAdminDesk';
import type { Perm } from '@/lib/admin/rbac';

// Canon admin nav (mockup ROLES.admin) plus Probe, access and the user directory. Each entry
// shows only to roles that can use it. Older admin tools (AI, results, heat map, vault, paper
// generator) keep their URLs but are off the canon nav.
const NAV: (CanonNavItem & { need: Perm[] })[] = [
  { href: '/admin', label: 'Dashboard', short: 'Home', icon: SquaresFour, exact: true, need: ['dashboard.view'] },
  { href: '/admin/probe', label: 'Probe', icon: Sparkle, need: ['probe.view'] },
  { href: '/admin/fees', label: 'Admissions & Fees', short: 'Fees', icon: CurrencyInr, also: ['/admin/admissions'], need: ['fees.read'] },
  { href: '/admin/admissions', label: 'Admissions', icon: CurrencyInr, need: ['admissions.read'] },
  { href: '/admin/staff', label: 'Staff & Leave', short: 'Staff', icon: CalendarBlank, need: ['workforce.read'] },
  { href: '/admin/academic', label: 'Academic Health', short: 'Academic', icon: ChartLineUp, need: ['academics.read'] },
  { href: '/admin/wellness', label: 'CBSE Wellness Report', short: 'Wellness', icon: Heart, need: ['wellness.read'] },
  { href: '/admin/compliance', label: 'DPDP & Compliance', short: 'DPDP', icon: ShieldCheck, need: ['compliance.read', 'audit.read'] },
  { href: '/admin/access', label: 'Roles & Access', short: 'Access', icon: Key, need: ['access.manage'] },
  { href: '/admin/directory', label: 'User Directory', short: 'People', icon: UsersThree, need: ['people.manage', 'access.manage'] },
];

/** The shell, with nav filtered to what this person's roles allow (just the dashboard until the desk loads). */
function AdminShell({ children }: { children: React.ReactNode }) {
  const { desk } = useAdminDesk();
  const a = desk?.me.access;
  const nav = NAV.filter(n => {
    if (!a) return n.href === '/admin';
    if (!a.any(...n.need)) return false;
    // With fees, admissions is a tab inside "Admissions & Fees"; without fees it gets its own entry.
    if (n.href === '/admin/admissions') return !a.can('fees.read');
    return true;
  }).map(n => (n.href === '/admin/fees' && a && !a.can('admissions.read') ? { ...n, label: 'Fees', also: [] } : n));
  return <CanonShell subtitle="COMMAND CENTRE" nav={nav} label="Admin navigation">{children}</CanonShell>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile, authorized } = useRoleGuard('Admin');

  if (!authorized || !profile) return <AuthStatus />;
  // Local no-backend dev bypass only (no Supabase session): the static sample.
  // A signed-in admin always gets their own school's real data.
  if (process.env.NODE_ENV === 'development' && !user) return <AdminDemoPortal />;
  return (
    <AdminDeskProvider>
      <AdminShell>{children}</AdminShell>
    </AdminDeskProvider>
  );
}
