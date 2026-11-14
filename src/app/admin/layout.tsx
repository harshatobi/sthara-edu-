'use client';

import { SquaresFourIcon as SquaresFour } from '@phosphor-icons/react/dist/ssr/SquaresFour';
import { CurrencyInrIcon as CurrencyInr } from '@phosphor-icons/react/dist/ssr/CurrencyInr';
import { CalendarBlankIcon as CalendarBlank } from '@phosphor-icons/react/dist/ssr/CalendarBlank';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { HeartIcon as Heart } from '@phosphor-icons/react/dist/ssr/Heart';
import { CertificateIcon as Certificate } from '@phosphor-icons/react/dist/ssr/Certificate';
import { TrophyIcon as Trophy } from '@phosphor-icons/react/dist/ssr/Trophy';
import { GavelIcon as Gavel } from '@phosphor-icons/react/dist/ssr/Gavel';
import { HandHeartIcon as HandHeart } from '@phosphor-icons/react/dist/ssr/HandHeart';
import { ShieldWarningIcon as ShieldWarning } from '@phosphor-icons/react/dist/ssr/ShieldWarning';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { KeyIcon as Key } from '@phosphor-icons/react/dist/ssr/Key';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { BellIcon as Bell } from '@phosphor-icons/react/dist/ssr/Bell';
import { ChatsCircleIcon as ChatsCircle } from '@phosphor-icons/react/dist/ssr/ChatsCircle';
import { CalendarDotsIcon as CalendarDots } from '@phosphor-icons/react/dist/ssr/CalendarDots';
import { CalendarCheckIcon as CalendarCheck } from '@phosphor-icons/react/dist/ssr/CalendarCheck';
import { IdentificationCardIcon as IdentificationCard } from '@phosphor-icons/react/dist/ssr/IdentificationCard';
import { WalletIcon as Wallet } from '@phosphor-icons/react/dist/ssr/Wallet';
import { LifebuoyIcon as Lifebuoy } from '@phosphor-icons/react/dist/ssr/Lifebuoy';
import { ExamIcon as Exam } from '@phosphor-icons/react/dist/ssr/Exam';
import { UploadSimpleIcon as UploadSimple } from '@phosphor-icons/react/dist/ssr/UploadSimple';
import { WrenchIcon as Wrench } from '@phosphor-icons/react/dist/ssr/Wrench';
import { StudentIcon as Student } from '@phosphor-icons/react/dist/ssr/Student';
import { FirstAidKitIcon as FirstAidKit } from '@phosphor-icons/react/dist/ssr/FirstAidKit';
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
  { href: '/admin', label: 'Dashboard', short: 'Home', icon: SquaresFour, exact: true, group: 'Today', need: ['dashboard.view'] },
  { href: '/admin/ask', label: 'Ask the School OS', short: 'Ask', icon: ChatsCircle, ai: true, group: 'Today', need: ['dashboard.view'] },
  { href: '/admin/probe', label: 'Probe', icon: Sparkle, ai: true, group: 'Today', need: ['probe.view'] },
  { href: '/admin/feed', label: 'Situational Feed', short: 'Feed', icon: Bell, group: 'Today', need: ['feed.read', 'incidents.manage', 'safeguarding.read'] },
  { href: '/admin/fees', label: 'Admissions & Fees', short: 'Fees', icon: CurrencyInr, also: ['/admin/admissions'], group: 'Admissions and fees', need: ['fees.read'] },
  { href: '/admin/admissions', label: 'Admissions', icon: CurrencyInr, group: 'Admissions and fees', need: ['admissions.read'] },
  { href: '/admin/messages', label: 'Parent Messages', short: 'Parents', icon: EnvelopeSimple, group: 'Today', need: ['messages.office'] },
  { href: '/admin/students', label: 'Students', icon: Student, group: 'Students', need: ['students.read', 'outcomes.approve', 'session.manage', 'compliance.act'] },
  { href: '/admin/health', label: 'Health', icon: FirstAidKit, group: 'Students', need: ['health.read'] },
  { href: '/admin/certificates', label: 'Certificates', icon: Certificate, group: 'Students', need: ['certificates.prepare', 'certificates.approve', 'certificates.setup'] },
  { href: '/admin/cocurricular', label: 'Co-curricular', icon: Trophy, group: 'Students', need: ['cocurricular.manage', 'cocurricular.approve'] },
  { href: '/admin/discipline', label: 'Discipline', icon: Gavel, group: 'Students', need: ['discipline.approve', 'discipline.suspend', 'discipline.archive'] },
  { href: '/admin/counselling', label: 'Counselling', icon: HandHeart, group: 'Students', need: ['counselling.notes', 'counselling.overview'] },
  // The principal reads child protection until the school assigns a Safeguarding lead; the page says which applies.
  { href: '/admin/safeguarding', label: 'Safeguarding', icon: ShieldWarning, group: 'Students', need: ['safeguarding.cases'] },
  { href: '/admin/people', label: 'People', icon: IdentificationCard, group: 'Staff', need: ['dashboard.view'] },
  { href: '/admin/payroll', label: 'Payroll', icon: Wallet, group: 'Staff', need: ['payroll.read', 'payroll.prepare', 'payroll.approve'] },
  { href: '/admin/staff', label: 'Staff & Leave', short: 'Staff', icon: CalendarBlank, group: 'Staff', need: ['workforce.read'] },
  { href: '/admin/schedule', label: 'Schedule', icon: CalendarDots, group: 'Academics', need: ['dashboard.view'] },
  { href: '/admin/attendance', label: 'Student Attendance', short: 'Attendance', icon: CalendarCheck, group: 'Students', need: ['attendance.read'] },
  { href: '/admin/exams', label: 'Exams & Report Cards', short: 'Exams', icon: Exam, group: 'Academics', need: ['exams.read', 'exams.manage', 'exams.publish', 'fees.collect'] },
  { href: '/admin/academic', label: 'Academic Health', short: 'Academic', icon: ChartLineUp, group: 'Academics', need: ['academics.read'] },
  { href: '/admin/wellness', label: 'CBSE Wellness Report', short: 'Wellness', icon: Heart, group: 'Records and setup', need: ['wellness.read'] },
  { href: '/admin/compliance', label: 'DPDP & Compliance', short: 'DPDP', icon: ShieldCheck, group: 'Records and setup', need: ['compliance.read', 'audit.read'] },
  { href: '/admin/access', label: 'Roles & Access', short: 'Access', icon: Key, group: 'Records and setup', need: ['access.manage'] },
  { href: '/admin/directory', label: 'User Directory', short: 'Logins', icon: UsersThree, group: 'Records and setup', need: ['people.manage', 'access.manage'] },
  { href: '/admin/setup', label: 'School setup', short: 'Setup', icon: Wrench, group: 'Records and setup', need: ['access.manage', 'people.manage', 'session.manage', 'fees.bill', 'data.import'] },
  { href: '/admin/import', label: 'Data Import', short: 'Import', icon: UploadSimple, group: 'Records and setup', need: ['data.import'] },
  // Every office account can reach Sthara.
  { href: '/admin/support', label: 'Help & Support', short: 'Help', icon: Lifebuoy, group: 'Help', need: [] },
];

const GROUPS = ['Today', 'Students', 'Academics', 'Admissions and fees', 'Staff', 'Records and setup', 'Help'];

/** The shell, with nav filtered to what this person's roles allow (just the dashboard until the desk loads). */
function AdminShell({ children }: { children: React.ReactNode }) {
  const { desk } = useAdminDesk();
  const a = desk?.me.access;
  const nav = NAV.filter(n => {
    if (!a) return n.href === '/admin';
    if (n.href === '/admin/safeguarding') return a.can('safeguarding.cases') || a.roles.includes('principal');
    if (n.need.length && !a.any(...n.need)) return false;
    // With fees, admissions is a tab inside "Admissions & Fees"; without fees it gets its own entry.
    if (n.href === '/admin/admissions') return !a.can('fees.read');
    return true;
  }).map(n => (n.href === '/admin/fees' && a && !a.can('admissions.read') ? { ...n, label: 'Fees', also: [] } : n));
  // A long menu (the principal's and school admin's) gets its sections, in this order; a short one stays a plain list.
  const grouped = nav.length > 10;
  const ordered = grouped ? [...nav].sort((x, y) => GROUPS.indexOf(x.group ?? 'Help') - GROUPS.indexOf(y.group ?? 'Help')) : nav;
  return <CanonShell role="admin" subtitle="COMMAND CENTRE" nav={ordered} label="Admin navigation" inbox grouped={grouped}>{children}</CanonShell>;
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
