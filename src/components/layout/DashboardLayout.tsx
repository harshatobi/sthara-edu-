'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LucideIcon, LogOut, Menu, X, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import TrialBanner from '@/components/ui/TrialBanner';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  current: boolean;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  role: string;
  subtitle: string;
  navigation: NavItem[];
}

export default function DashboardLayout({ children, role, subtitle, navigation }: DashboardLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // Still loading — don't redirect yet

    const expectedRole = role.toLowerCase().replace(/\s+/g, '');

    if (!profile) {
      // No profile at all — redirect to login
      router.push('/login');
      return;
    }

    const actualRole = profile.role?.toLowerCase().replace(/\s+/g, '') || '';
    if (actualRole && actualRole !== expectedRole) {
      // Wrong role — redirect to their correct dashboard
      if (actualRole === 'superadmin') router.push('/superadmin');
      else if (actualRole === 'admin') router.push('/admin');
      else if (actualRole === 'teacher') router.push('/teacher');
      else if (actualRole === 'parent') router.push('/parent');
      else if (actualRole === 'student') router.push('/student');
      else router.push('/login');
    }
  }, [profile, loading, role, router]);

  // Show spinner while loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <Loader2 className="w-8 h-8 animate-spin text-[#002147]" />
      </div>
    );
  }

  // Profile loaded but null — also show spinner briefly (redirect happening via useEffect)
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <Loader2 className="w-8 h-8 animate-spin text-[#002147]" />
      </div>
    );
  }

  /* ── Shared sidebar nav content ─────────────────────────────── */
  const SidebarContent = ({ onLinkClick }: { onLinkClick?: () => void }) => (
    <>
      {/* Logo */}
      <div className="h-20 flex flex-col justify-center px-6 border-b border-white/10 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight text-white">Sthara</h1>
        <p className="text-[#dc143c] text-xs font-semibold uppercase tracking-wider">{subtitle}</p>
      </div>

      {/* Scrollable nav links */}
      <div className="flex-1 overflow-y-auto py-5 px-3 space-y-1">
        {navigation.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={item.name} className="flex flex-col">
              <Link
                href={item.href}
                onClick={onLinkClick}
                className={clsx(
                  'group relative flex items-center px-3 py-2.5 text-sm font-medium rounded-xl',
                  'transition-all duration-200 ease-out',
                  item.current
                    ? 'bg-white/15 text-white shadow-md shadow-black/20'
                    : 'text-white/65 hover:bg-white/10 hover:text-white'
                )}
              >
                {/* Active indicator bar */}
                {item.current && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#dc143c] rounded-r-full" />
                )}

                <Icon
                  className={clsx(
                    'flex-shrink-0 ml-1 mr-3 h-5 w-5 transition-all duration-200',
                    item.current
                      ? 'text-[#dc143c] scale-110'
                      : 'text-white/45 group-hover:text-white/90 group-hover:scale-110'
                  )}
                />

                <span className="transition-transform duration-150 group-hover:translate-x-0.5">
                  {item.name}
                </span>

                {/* Hover shimmer overlay */}
                <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-white/5 to-transparent pointer-events-none" />
              </Link>
              {/* Divider line between all features */}
              <div className="border-b border-white/10 my-1" />
            </div>
          );
        })}
      </div>

      {/* Sign Out — always pinned at bottom, never hidden */}
      <div className="shrink-0 p-3 border-t border-white/10">
        <button
          onClick={signOut}
          className="w-full group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl text-white/60 hover:bg-red-500/15 hover:text-red-300 transition-all duration-200"
        >
          <LogOut className="flex-shrink-0 ml-1 mr-3 h-5 w-5 text-white/40 group-hover:text-red-400 transition-all duration-200 group-hover:-translate-x-0.5" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] print:block">

      {/* ── FIXED Desktop Sidebar — never scrolls ─────────────── */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-[#002147] text-white flex flex-col shadow-2xl z-30 hidden md:flex print:hidden">
        <SidebarContent />
      </aside>

      {/* ── Mobile Slide-over Sidebar ─────────────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Panel */}
          <div className="relative flex w-72 flex-col bg-[#002147] text-white shadow-2xl">
            <button
              type="button"
              className="absolute -right-12 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white focus:outline-none"
              onClick={() => setMobileMenuOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onLinkClick={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Main content — padded left by sidebar width on desktop */}
      <div className="md:pl-64 flex flex-col min-h-screen print:pl-0">

        {/* Mobile sticky top bar */}
        <div className="md:hidden sticky top-0 z-20 h-16 bg-[#002147] flex items-center justify-between px-4 print:hidden">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight text-white">Sthara</h1>
            <p className="text-[#dc143c] text-[10px] font-semibold uppercase tracking-wider">{subtitle}</p>
          </div>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="text-white p-2 rounded-lg hover:bg-white/10 focus:outline-none"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        {/* Trial warning banner */}
        <TrialBanner />

        {/* Page content */}
        <main className="flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
