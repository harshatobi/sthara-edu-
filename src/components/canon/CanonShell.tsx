'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { SignOutIcon as SignOut } from '@phosphor-icons/react/dist/ssr/SignOut';
import InteractiveIcon from '@/components/ui/InteractiveIcon';
import TrialBanner from '@/components/ui/TrialBanner';
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
        <TrialBanner />
        {children}
      </main>
      {/* Phone (≤680px): the sidebar gives way to a bottom tab bar, as in the mockup's phone frames. */}
      <nav className="tabbar" aria-label={`${label} (compact)`}>
        {nav.map(item => {
          const on = isOn(item);
          return (
            <Link key={item.href} href={item.href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>
              <InteractiveIcon icon={item.icon} color={colorForIcon(item.icon)} active={on} size={20} />
              <span className="t">{item.short ?? item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
