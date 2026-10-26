'use client';

import { CertificateIcon as Certificate } from '@phosphor-icons/react/dist/ssr/Certificate';
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { HandHeartIcon as HandHeart } from '@phosphor-icons/react/dist/ssr/HandHeart';
import { TrophyIcon as Trophy } from '@phosphor-icons/react/dist/ssr/Trophy';
import { HouseIcon as House } from '@phosphor-icons/react/dist/ssr/House';
import { ChatsCircleIcon as ChatsCircle } from '@phosphor-icons/react/dist/ssr/ChatsCircle';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { ListChecksIcon as ListChecks } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { CurrencyInrIcon as CurrencyInr } from '@phosphor-icons/react/dist/ssr/CurrencyInr';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { FirstAidKitIcon as FirstAidKit } from '@phosphor-icons/react/dist/ssr/FirstAidKit';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { GearSixIcon as GearSix } from '@phosphor-icons/react/dist/ssr/GearSix';
import { StudentIcon as Student } from '@phosphor-icons/react/dist/ssr/Student';
import { CalendarCheckIcon as CalendarCheck } from '@phosphor-icons/react/dist/ssr/CalendarCheck';
import CanonShell, { type CanonNavItem } from '@/components/canon/CanonShell';
import { Empty, PageBar } from '@/components/canon/ui';
import AuthStatus from '@/components/ui/AuthStatus';
import { useAuth } from '@/contexts/AuthContext';
import { useRoleGuard } from '@/lib/auth/useRoleGuard';
import { FamilyProvider } from '@/lib/parent/useFamily';
import '@/styles/parent.css';

// Canon parent nav (mockup ROLES.parent), with Ask the School OS as the hero.
const NAV: CanonNavItem[] = [
  { href: '/parent', label: 'Home', icon: House, exact: true },
  { href: '/parent/ask', label: 'Ask the School OS', short: 'Ask', icon: ChatsCircle, ai: true },
  { href: '/parent/results', label: 'Report Cards', short: 'Results', icon: Certificate },
  { href: '/parent/timeline', label: 'Timeline', icon: ClockCounterClockwise },
  { href: '/parent/progress', label: 'Mastery & Reports', short: 'Progress', icon: ChartLineUp },
  { href: '/parent/messages', label: 'School Messages', short: 'Messages', icon: EnvelopeSimple },
  { href: '/parent/schoolwork', label: 'Schoolwork', icon: ListChecks },
  { href: '/parent/attendance', label: 'Attendance & Calendar', short: 'Calendar', icon: CalendarCheck },
  { href: '/parent/fees', label: 'Fees & Payments', short: 'Fees', icon: CurrencyInr },
  { href: '/parent/family', label: 'Family Details', short: 'Family', icon: UsersThree },
  { href: '/parent/health', label: 'Health Card', short: 'Health', icon: FirstAidKit },
  { href: '/parent/documents', label: 'Documents', short: 'Documents', icon: FileText },
  { href: '/parent/kirti', label: 'Kirti', icon: Trophy },
  { href: '/parent/conduct', label: 'Conduct & Care', short: 'Conduct', icon: HandHeart },
  { href: '/parent/settings', label: 'WhatsApp & Privacy', short: 'Settings', icon: GearSix, also: ['/parent/consent'] },
];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile, authorized } = useRoleGuard('Parent');
  if (!authorized || !profile) return <AuthStatus />;
  // The parent portal only runs on real records: the local no-backend bypass gets a pointer, not a fake family.
  if (!user) {
    return (
      <CanonShell role="parent" subtitle="PARENT PORTAL" nav={NAV} label="Parent navigation">
        <PageBar eyebrow="PARENT PORTAL" title="Sign in as a parent" />
        <div className="card"><Empty icon={<Student size={34} weight="duotone" />} title="The parent portal runs on live school records">
          Sign in with a parent account (for example parent.aarav@test.sthara.in) to see a real family.
        </Empty></div>
      </CanonShell>
    );
  }
  return (
    <FamilyProvider>
      <CanonShell role="parent" subtitle="PARENT PORTAL" nav={NAV} label="Parent navigation">{children}</CanonShell>
    </FamilyProvider>
  );
}
