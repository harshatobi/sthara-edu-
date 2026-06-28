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
    if (!loading) {
      const expectedRole = role.toLowerCase().replace(' ', '');
      if (!profile || profile.role !== expectedRole) {
        router.push('/login');
      }
    }
  }, [profile, loading, role, router]);

  if (loading || !profile) {
    return <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]"><Loader2 className="w-8 h-8 animate-spin text-[#002147]" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex print:block">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)}></div>
          <div className="relative flex w-64 flex-col bg-[#002147] text-white shadow-2xl">
            <div className="absolute right-0 top-0 -mr-12 pt-4">
              <button
                type="button"
                className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="sr-only">Close sidebar</span>
                <X className="h-6 w-6 text-white" aria-hidden="true" />
              </button>
            </div>
            
            <div className="h-20 flex flex-col justify-center px-6 border-b border-white/10">
              <h1 className="text-2xl font-bold tracking-tight text-white">Sthara</h1>
              <p className="text-[#dc143c] text-xs font-semibold uppercase tracking-wider">{subtitle}</p>
            </div>
            
            <div className="flex-1 overflow-y-auto py-4">
              <nav className="px-4 space-y-1">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={clsx(
                        item.current ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
                        'group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors'
                      )}
                    >
                      <Icon className={clsx(
                        item.current ? 'text-[#dc143c]' : 'text-white/50 group-hover:text-white/80',
                        'flex-shrink-0 -ml-1 mr-3 h-5 w-5 transition-colors'
                      )} />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="p-4 border-t border-white/10">
              <button
                onClick={signOut}
                className="w-full group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-white/70 hover:bg-white/5 hover:text-white transition-colors"
              >
                <LogOut className="flex-shrink-0 -ml-1 mr-3 h-5 w-5 text-white/50 group-hover:text-white/80" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className="w-64 bg-[#002147] text-white flex flex-col shadow-2xl z-10 hidden md:flex print:hidden">
        <div className="h-20 flex flex-col justify-center px-6 border-b border-white/10">
          <h1 className="text-2xl font-bold tracking-tight text-white">Sthara</h1>
          <p className="text-[#dc143c] text-xs font-semibold uppercase tracking-wider">{subtitle}</p>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="px-4 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={clsx(
                    item.current ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
                    'group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors'
                  )}
                >
                  <Icon className={clsx(
                    item.current ? 'text-[#dc143c]' : 'text-white/50 group-hover:text-white/80',
                    'flex-shrink-0 -ml-1 mr-3 h-5 w-5 transition-colors'
                  )} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-white/10">
          <button
            onClick={signOut}
            className="w-full group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-white/70 hover:bg-white/5 hover:text-white transition-colors"
          >
            <LogOut className="flex-shrink-0 -ml-1 mr-3 h-5 w-5 text-white/50 group-hover:text-white/80" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:block">
        {/* Mobile Header */}
        <div className="md:hidden h-16 bg-[#002147] flex items-center justify-between px-4 z-20 print:hidden">
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

        {/* Trial warning banner — shown when ≤7 days left or expired */}
        <TrialBanner />

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>

      </div>
    </div>
  );
}
