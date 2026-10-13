'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { SquaresFourIcon as SquaresFour } from '@phosphor-icons/react/dist/ssr/SquaresFour';
import { BuildingsIcon as Buildings } from '@phosphor-icons/react/dist/ssr/Buildings';
import { AddressBookIcon as AddressBook } from '@phosphor-icons/react/dist/ssr/AddressBook';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { UserPlusIcon as UserPlus } from '@phosphor-icons/react/dist/ssr/UserPlus';
import { CoinsIcon as Coins } from '@phosphor-icons/react/dist/ssr/Coins';
import { SlidersHorizontalIcon as SlidersHorizontal } from '@phosphor-icons/react/dist/ssr/SlidersHorizontal';
import { HeartbeatIcon as Heartbeat } from '@phosphor-icons/react/dist/ssr/Heartbeat';
import { BugIcon as Bug } from '@phosphor-icons/react/dist/ssr/Bug';
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { MapTrifoldIcon as MapTrifold } from '@phosphor-icons/react/dist/ssr/MapTrifold';
import { PulseIcon as Pulse } from '@phosphor-icons/react/dist/ssr/Pulse';
import { UserCircleIcon as UserCircle } from '@phosphor-icons/react/dist/ssr/UserCircle';
import { LifebuoyIcon as Lifebuoy } from '@phosphor-icons/react/dist/ssr/Lifebuoy';
import { FunnelIcon as Funnel } from '@phosphor-icons/react/dist/ssr/Funnel';
import { CheckSquareIcon as CheckSquare } from '@phosphor-icons/react/dist/ssr/CheckSquare';
import Link from 'next/link';
import { PaperPlaneTiltIcon as PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import CanonShell, { type CanonNavItem } from '@/components/canon/CanonShell';
import { can, roleLabel, type Capability, type OperatorRole } from '@/lib/ops/roles';

/** The console's sections, in sidebar order, each with the capability that opens it. The first four shown are the phone tab bar. */
const NAV: (CanonNavItem & { cap: Capability | null })[] = [
  { href: '/ops', label: 'Overview', icon: SquaresFour, exact: true, cap: null },
  { href: '/ops/schools', label: 'Schools', icon: Buildings, cap: 'schools.read' },
  { href: '/ops/pipeline', label: 'Pipeline', icon: Funnel, cap: 'sales.read' },
  { href: '/ops/desk', label: 'Service desk', short: 'Desk', icon: Lifebuoy, cap: 'desk.read' },
  { href: '/ops/tasks', label: 'Follow-ups', short: 'Tasks', icon: CheckSquare, cap: 'crm.read' },
  { href: '/ops/people', label: 'People', icon: AddressBook, cap: 'people.search' },
  { href: '/ops/requests', label: 'Login requests', short: 'Requests', icon: UserPlus, cap: 'requests.manage' },
  { href: '/ops/enquiries', label: 'Enquiries', icon: EnvelopeSimple, cap: 'enquiries.read' },
  { href: '/ops/usage', label: 'AI usage & cost', short: 'AI cost', icon: Coins, cap: 'usage.read' },
  { href: '/ops/settings', label: 'Platform settings', short: 'Settings', icon: SlidersHorizontal, cap: 'settings.read' },
  { href: '/ops/errors', label: 'Error log', short: 'Errors', icon: Bug, cap: 'errors.read' },
  { href: '/ops/traffic', label: 'Request explorer', short: 'Requests', icon: Pulse, cap: 'debug.read' },
  { href: '/ops/delivery', label: 'Delivery and jobs', short: 'Delivery', icon: PaperPlaneTilt, cap: 'debug.read' },
  { href: '/ops/health', label: 'System health', short: 'Health', icon: Heartbeat, cap: 'health.read' },
  { href: '/ops/audit', label: 'Audit log', short: 'Audit', icon: ClockCounterClockwise, cap: 'audit.read' },
  { href: '/ops/territories', label: 'Territories', icon: MapTrifold, cap: null },
  { href: '/ops/operators', label: 'Operators', icon: ShieldCheck, cap: 'operators.read' },
  { href: '/ops/account', label: 'My account', short: 'Account', icon: UserCircle, cap: null },
];

const OpsContext = createContext<{ operator: string | null; role: OperatorRole; devPreview: boolean }>({ operator: null, role: 'director', devPreview: false });
export const useOperator = () => useContext(OpsContext);
/** Whether the signed-in operator's role may do something (the server decides again on every request). */
export const useCan = () => {
  const { role } = useContext(OpsContext);
  return (cap: Capability) => can(role, cap);
};

/** Chrome for the unlisted operator console (the Platform Manager). */
export default function OpsShell({ operator, role, mustChangePassword, devPreview, children }: {
  operator: string | null; role: OperatorRole; mustChangePassword: boolean; devPreview: boolean; children: ReactNode;
}) {
  const nav = useMemo(() => NAV.filter(n => !n.cap || can(role, n.cap)), [role]);
  return (
    <OpsContext.Provider value={{ operator, role, devPreview }}>
      <CanonShell subtitle={role === 'director' ? 'PLATFORM MANAGER' : `PLATFORM MANAGER · ${roleLabel(role).toUpperCase()}`} nav={nav} label="Platform Manager">
        <div style={{ maxWidth: 1320, margin: '0 auto', width: '100%' }}>
          {devPreview && (
            <div className="note info" style={{ marginBottom: 18 }}>
              <b>Local preview.</b> You&apos;re seeing this through the dev role cookie. Loading or saving anything needs a real operator session against Supabase.
            </div>
          )}
          {mustChangePassword && (
            <div className="note" style={{ marginBottom: 18 }} role="status">
              <b>You are on a temporary password.</b> Someone else has seen it. <Link href="/ops/account" style={{ color: 'var(--blue)', fontWeight: 700 }}>Set your own now</Link>.
            </div>
          )}
          {children}
        </div>
      </CanonShell>
    </OpsContext.Provider>
  );
}
