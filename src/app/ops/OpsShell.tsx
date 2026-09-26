'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { SquaresFourIcon as SquaresFour } from '@phosphor-icons/react/dist/ssr/SquaresFour';
import { BuildingsIcon as Buildings } from '@phosphor-icons/react/dist/ssr/Buildings';
import { AddressBookIcon as AddressBook } from '@phosphor-icons/react/dist/ssr/AddressBook';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { CoinsIcon as Coins } from '@phosphor-icons/react/dist/ssr/Coins';
import { SlidersHorizontalIcon as SlidersHorizontal } from '@phosphor-icons/react/dist/ssr/SlidersHorizontal';
import { HeartbeatIcon as Heartbeat } from '@phosphor-icons/react/dist/ssr/Heartbeat';
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import CanonShell, { type CanonNavItem } from '@/components/canon/CanonShell';

/** The console's sections, in sidebar order. The first four are the phone tab bar. */
const NAV: CanonNavItem[] = [
  { href: '/ops', label: 'Overview', icon: SquaresFour, exact: true },
  { href: '/ops/schools', label: 'Schools', icon: Buildings },
  { href: '/ops/people', label: 'People', icon: AddressBook },
  { href: '/ops/enquiries', label: 'Enquiries', icon: EnvelopeSimple },
  { href: '/ops/usage', label: 'AI usage & cost', short: 'AI cost', icon: Coins },
  { href: '/ops/settings', label: 'Platform settings', short: 'Settings', icon: SlidersHorizontal },
  { href: '/ops/health', label: 'System health', short: 'Health', icon: Heartbeat },
  { href: '/ops/audit', label: 'Audit log', short: 'Audit', icon: ClockCounterClockwise },
  { href: '/ops/operators', label: 'Operators', icon: ShieldCheck },
];

const OpsContext = createContext<{ operator: string | null; devPreview: boolean }>({ operator: null, devPreview: false });
export const useOperator = () => useContext(OpsContext);

/** Chrome for the unlisted operator console (the Platform Manager). */
export default function OpsShell({ operator, devPreview, children }: { operator: string | null; devPreview: boolean; children: ReactNode }) {
  return (
    <OpsContext.Provider value={{ operator, devPreview }}>
      <CanonShell subtitle="PLATFORM MANAGER" nav={NAV} label="Platform Manager">
        <div style={{ maxWidth: 1320, margin: '0 auto', width: '100%' }}>
          {devPreview && (
            <div className="note info" style={{ marginBottom: 18 }}>
              <b>Local preview.</b> You&apos;re seeing this through the dev role cookie. Loading or saving anything needs a real operator session against Supabase.
            </div>
          )}
          {children}
        </div>
      </CanonShell>
    </OpsContext.Provider>
  );
}
