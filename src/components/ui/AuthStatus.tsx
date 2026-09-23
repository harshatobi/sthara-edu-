'use client';

import { WarningCircleIcon as WarningCircle } from '@phosphor-icons/react/dist/ssr/WarningCircle';
import { ArrowClockwiseIcon as ArrowClockwise } from '@phosphor-icons/react/dist/ssr/ArrowClockwise';
import { SignOutIcon as SignOut } from '@phosphor-icons/react/dist/ssr/SignOut';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Shown while the role guard checks the session, and if that check fails.
 * Loading draws the app shell's silhouette (navy rail + page skeleton) so the
 * desk appears to fill in rather than jump from a blank screen; it's shared
 * by every role, so it stays role-neutral and uses Tailwind, not canon.css.
 */
export default function AuthStatus() {
  const { error, signOut } = useAuth();

  if (error) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#F7F9FB] p-6">
        <div role="alert" className="w-full max-w-md bg-white rounded-[20px] p-8 shadow-[0_1px_2px_rgba(0,33,71,.05),0_10px_30px_rgba(0,33,71,.05)]">
          <div className="w-12 h-12 rounded-2xl bg-[#FFE4EA] text-[#E11D48] grid place-items-center mb-5">
            <WarningCircle size={26} weight="duotone" />
          </div>
          <h1 className="text-[21px] font-extrabold tracking-tight text-[#002147]">We couldn&apos;t open your workspace</h1>
          <p className="text-sm text-[#7A8699] leading-relaxed mt-2">{error}</p>
          <div className="flex flex-wrap gap-2.5 mt-6">
            <button onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#002147] px-4 py-2.5 text-[13.5px] font-bold text-white hover:bg-[#0B2E5C] active:scale-[.98] transition">
              <ArrowClockwise size={16} weight="bold" /> Try again
            </button>
            <button onClick={() => void signOut()}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E8EDF4] bg-white px-4 py-2.5 text-[13.5px] font-bold text-[#002147] hover:border-[#C9D6E8] active:scale-[.98] transition">
              <SignOut size={16} weight="bold" /> Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const bar = 'rounded-xl bg-[#EEF2F7] motion-safe:animate-pulse';
  return (
    <div className="min-h-[100dvh] flex bg-[#F7F9FB]" role="status" aria-live="polite">
      <span className="sr-only">Checking your account and school access</span>
      <aside aria-hidden="true" className="hidden md:flex w-[264px] shrink-0 flex-col bg-[#062347] px-[18px] py-[26px]">
        <div className="px-2.5 pb-[26px]">
          <b className="block text-white text-[26px] font-extrabold tracking-tight">Sthara</b>
          <span className="block mt-2 h-2 w-24 rounded bg-[#E11D48]/50" />
        </div>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-3 px-3.5 py-3">
            <span className="w-[22px] h-[22px] rounded-lg bg-white/10 motion-safe:animate-pulse" />
            <span className="h-3 rounded bg-white/10 motion-safe:animate-pulse" style={{ width: `${90 + ((i * 37) % 50)}px` }} />
          </div>
        ))}
      </aside>
      <main aria-hidden="true" className="flex-1 min-w-0 p-4 md:px-[34px] md:py-[26px]">
        <div className="h-[260px] rounded-3xl bg-gradient-to-r from-[#072044] via-[#123F84] to-[#0F5AB8] opacity-90 motion-safe:animate-pulse" />
        <div className="grid md:grid-cols-2 gap-[18px] mt-[22px]">
          <div className="bg-white rounded-[20px] p-[26px] space-y-4">
            <div className={`${bar} h-5 w-48`} />
            <div className={`${bar} h-3 w-full`} /><div className={`${bar} h-3 w-4/5`} />
            <div className={`${bar} h-10 w-full mt-6`} /><div className={`${bar} h-10 w-full`} /><div className={`${bar} h-10 w-full`} />
          </div>
          <div className="bg-white rounded-[20px] p-[26px] space-y-4">
            <div className={`${bar} h-5 w-32`} />
            <div className={`${bar} h-14 w-full mt-6`} /><div className={`${bar} h-14 w-full`} /><div className={`${bar} h-14 w-full`} />
          </div>
        </div>
      </main>
    </div>
  );
}
