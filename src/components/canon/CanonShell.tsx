'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { SignOutIcon as SignOut } from '@phosphor-icons/react/dist/ssr/SignOut';
import { DotsThreeCircleIcon as DotsThreeCircle } from '@phosphor-icons/react/dist/ssr/DotsThreeCircle';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import InteractiveIcon from '@/components/ui/InteractiveIcon';
import TrialBanner from '@/components/ui/TrialBanner';
import PlatformNotice from '@/components/ui/PlatformNotice';
import { colorForIcon } from '@/lib/iconColors';
import { useAuth } from '@/contexts/AuthContext';
import '@/styles/canon.css';

export interface CanonNavItem {
  href: string;
  label: string;
  icon: PhosphorIcon;
  /** Match only the exact path (for a role's index route), not its children. */
  exact?: boolean;
  /** Label for the phone tab bar, where full labels don't fit. */
  short?: string;
  /** Other routes this entry owns (e.g. a nav item whose page has sibling tabs). */
  also?: string[];
}

/** Tabs that fit the phone bar; the rest (and sign-out) live behind "More". */
const PHONE_TABS = 4;

/**
 * The mockup's app shell (fixed navy sidebar + #main), as a route-driven
 * layout: each nav entry is a real URL instead of the mockup's go(role, view)
 * innerHTML swap. Role-agnostic so teacher/admin/parent can move onto it too.
 */
export default function CanonShell({ subtitle, nav, label, children }: {
  subtitle: string;
  nav: CanonNavItem[];
  label: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const under = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const isOn = (item: CanonNavItem) =>
    item.exact ? pathname === item.href : under(item.href) || !!item.also?.some(under);

  const primary = nav.slice(0, PHONE_TABS);
  const overflow = nav.slice(PHONE_TABS);
  const overflowOn = overflow.some(isOn);
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  return (
    <div className="canon">
      {/* Fonts the canon type scale is drawn in; React hoists this into <head>. */}
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap"
      />
      <a className="skip" href="#canon-main">Skip to content</a>
      <aside>
        <div className="brand"><b>Sthara</b><i>{subtitle}</i></div>
        <nav aria-label={label}>
          {nav.map(item => {
            const on = isOn(item);
            return (
              <Link key={item.href} href={item.href} className={`nv${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} title={item.label}>
                <InteractiveIcon icon={item.icon} color={colorForIcon(item.icon)} active={on} />
                <span className="lbl-t">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="nv-out">
          <button className="nv" onClick={() => signOut()} title="Sign out">
            <InteractiveIcon icon={SignOut} color={colorForIcon(SignOut)} />
            <span className="lbl-t">Sign out</span>
          </button>
        </div>
      </aside>
      <main id="canon-main" tabIndex={-1}>
        <PlatformNotice />
        <TrialBanner />
        {children}
      </main>
      {/* Phone (≤680px): the sidebar gives way to a bottom tab bar, as in the mockup's phone frames.
          The first four entries get tabs; everything else, plus sign-out, sits behind "More". */}
      <nav className="tabbar" aria-label={`${label} (compact)`}>
        {primary.map(item => {
          const on = isOn(item);
          return (
            <Link key={item.href} href={item.href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>
              <InteractiveIcon icon={item.icon} color={colorForIcon(item.icon)} active={on} size={20} />
              <span className="t">{item.short ?? item.label}</span>
            </Link>
          );
        })}
        <button type="button" className={overflowOn ? 'on' : undefined} aria-haspopup="dialog" aria-expanded={moreOpen}
          onClick={() => setMoreOpen(o => !o)}>
          <InteractiveIcon icon={DotsThreeCircle} color={colorForIcon(DotsThreeCircle)} active={overflowOn || moreOpen} size={20} />
          <span className="t">More</span>
        </button>
      </nav>
      {moreOpen && (
        <>
          <div className="more-scrim" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div className="more-sheet" role="dialog" aria-modal="true" aria-label={`${label}: more`} tabIndex={-1} ref={sheetRef}>
            <div className="grab" aria-hidden="true" />
            <div className="hd">
              <b>{subtitle.charAt(0) + subtitle.slice(1).toLowerCase()}</b>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close menu"><X size={18} weight="bold" /></button>
            </div>
            {overflow.map(item => {
              const on = isOn(item);
              return (
                <Link key={item.href} href={item.href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}
                  onClick={() => setMoreOpen(false)}>
                  <InteractiveIcon icon={item.icon} color={colorForIcon(item.icon)} active={on} size={20} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button type="button" className="out" onClick={() => signOut()}>
              <InteractiveIcon icon={SignOut} color={colorForIcon(SignOut)} size={20} />
              <span>Sign out</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
