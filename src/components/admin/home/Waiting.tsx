'use client';

import Link from 'next/link';
import { type ComponentType, useState } from 'react';
import { CurrencyInrIcon as CurrencyInr } from '@phosphor-icons/react/dist/ssr/CurrencyInr';
import { NotebookIcon as Notebook } from '@phosphor-icons/react/dist/ssr/Notebook';
import { PercentIcon as Percent } from '@phosphor-icons/react/dist/ssr/Percent';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { UserPlusIcon as UserPlus } from '@phosphor-icons/react/dist/ssr/UserPlus';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { CalendarBlankIcon as CalendarBlank } from '@phosphor-icons/react/dist/ssr/CalendarBlank';
import { IdentificationCardIcon as IdentificationCard } from '@phosphor-icons/react/dist/ssr/IdentificationCard';
import { WalletIcon as Wallet } from '@phosphor-icons/react/dist/ssr/Wallet';
import { CalendarDotsIcon as CalendarDots } from '@phosphor-icons/react/dist/ssr/CalendarDots';
import { ClockIcon as Clock } from '@phosphor-icons/react/dist/ssr/Clock';
import { ShieldWarningIcon as ShieldWarning } from '@phosphor-icons/react/dist/ssr/ShieldWarning';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { HeartIcon as Heart } from '@phosphor-icons/react/dist/ssr/Heart';
import { StudentIcon as Student } from '@phosphor-icons/react/dist/ssr/Student';
import { CertificateIcon as Certificate } from '@phosphor-icons/react/dist/ssr/Certificate';
import { TrophyIcon as Trophy } from '@phosphor-icons/react/dist/ssr/Trophy';
import { GavelIcon as Gavel } from '@phosphor-icons/react/dist/ssr/Gavel';
import { HandHeartIcon as HandHeart } from '@phosphor-icons/react/dist/ssr/HandHeart';
import { FirstAidKitIcon as FirstAidKit } from '@phosphor-icons/react/dist/ssr/FirstAidKit';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { Empty } from '@/components/canon/ui';
import { daysBetween } from '@/lib/admin/format';
import type { WorkItem } from '@/lib/admin/work';

/** "Waiting for you": the shared list on the Command Centre and every office role's home (2026-11-06). */
type IconT = ComponentType<{ size?: number; weight?: 'duotone' | 'bold' | 'fill' | 'regular' }>;
export const WORK_ICON: Record<string, IconT> = {
  counter: CurrencyInr, daybook: Notebook, concessions: Percent, remind: Warning, admissions: UserPlus, offers: EnvelopeSimple,
  leave: CalendarBlank, hr: IdentificationCard, payroll: Wallet, cover: CalendarDots, staffday: Clock, messages: EnvelopeSimple,
  safety: ShieldWarning, consent: ShieldCheck, filing: Heart, register: Student, certificates: Certificate, kirti: Trophy,
  discipline: Gavel, counselling: HandHeart, safeguarding: ShieldWarning, dsl: ShieldWarning, health: FirstAidKit, logins: UsersThree,
};

const RANK = { r: 0, a: 1, n: 2, g: 3 } as const;

/** What has something waiting (most serious, then largest, first) and the rest of this person's work. */
export function rankWork(work: WorkItem[]) {
  return {
    waiting: work.filter(w => (w.count ?? 0) > 0).sort((x, y) => RANK[x.tone] - RANK[y.tone] || (y.count ?? 0) - (x.count ?? 0)),
    rest: work.filter(w => !(w.count ?? 0)),
  };
}

export const waited = (iso: string | null | undefined, today: string) => {
  if (!iso) return null;
  const d = daysBetween(iso.slice(0, 10), today);
  return d <= 0 ? 'arrived today' : d === 1 ? 'oldest from yesterday' : `oldest ${d} days`;
};

export function Waiting({ waiting, rest, today, loading }: { waiting: WorkItem[]; rest: WorkItem[]; today: string; loading: boolean }) {
  const [more, setMore] = useState(false);
  return (
    <section className="card cc-wait" id="waiting" aria-labelledby="cc-wait-h">
      <div className="cc-h">
        <h2 id="cc-wait-h">Waiting for you</h2>
        {waiting.length > 0 && <span className="cc-count">{waiting.length} {waiting.length === 1 ? 'area' : 'areas'}</span>}
      </div>
      {waiting.length ? (
        <ol className="cc-list">
          {waiting.map(w => {
            const Icon = WORK_ICON[w.key] ?? Sparkle;
            const primary = w.actions.find(x => x.primary) ?? w.actions[0];
            return (
              <li key={w.key} className={`cc-item t-${w.tone}`}>
                <span className="cc-ico"><Icon size={19} weight="duotone" /></span>
                <div className="cc-item-b">
                  <div className="cc-item-t"><b>{w.title}</b><span className="cc-n">{(w.count ?? 0).toLocaleString('en-IN')}</span></div>
                  <div className="cc-item-d">{w.detail}{w.oldest ? <span className="cc-age"> {waited(w.oldest, today)}</span> : null}</div>
                </div>
                {primary && <Link className="btn sm pri" href={primary.href}>{primary.label}</Link>}
              </li>
            );
          })}
        </ol>
      ) : loading ? (
        <div className="cc-list">{[0, 1, 2].map(i => <div key={i} className="sk" style={{ height: 52, marginBottom: 10 }} />)}</div>
      ) : (
        <Empty icon={<CheckCircle size={26} weight="duotone" />} title="Nothing is waiting for you">
          Approvals, requests and deadlines from every area your roles cover land here as they arrive.
        </Empty>
      )}
      {rest.length > 0 && (
        <div className="cc-rest">
          <button className="cc-rest-t" aria-expanded={more} onClick={() => setMore(m => !m)}>
            Your other work <CaretDown size={13} weight="bold" style={{ transform: more ? 'rotate(180deg)' : undefined }} />
          </button>
          {more && (
            <div className="cc-chips">
              {rest.map(w => {
                const Icon = WORK_ICON[w.key] ?? Sparkle;
                const go = w.actions.find(x => x.primary) ?? w.actions[0];
                return go ? <Link key={w.key} href={go.href} className="cc-chip"><Icon size={15} weight="duotone" /> {w.title}</Link> : null;
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

