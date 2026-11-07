'use client';

import Link from 'next/link';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { CircleDashedIcon as CircleDashed } from '@phosphor-icons/react/dist/ssr/CircleDashed';
import { WarningCircleIcon as WarningCircle } from '@phosphor-icons/react/dist/ssr/WarningCircle';
import { useSetup } from '@/lib/admin/useSetup';
import type { Setup, Step } from '@/lib/admin/setup';
import { DeskGate } from '../kit';

/**
 * Set up your school (Moses, 2026-11-06): the school admin's home until the essentials are done, then the school's
 * settings home. Each step says where it stands and goes straight to the page that does it; steps Sthara does
 * show their status only. The school can use everything while it sets up.
 */
export default function SetupHub({ asHome }: { asHome?: boolean }) {
  return <DeskGate need={['access.manage', 'people.manage', 'session.manage', 'fees.bill', 'data.import']}>{desk => <Hub school={desk.school.name} asHome={asHome} />}</DeskGate>;
}

function Hub({ school, asHome }: { school: string; asHome?: boolean }) {
  const { setup, error } = useSetup();
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!setup) return <HubSkeleton />;
  const groups = [...new Set(setup.steps.map(s => s.group))];
  const left = setup.required.total - setup.required.done;
  return (
    <div className="cc su">
      <header className="cc-band su-band">
        <div className="cc-band-top">
          <div>
            <h1>{setup.ready ? `${school} is set up` : `Setting up ${school}`}</h1>
            <p>{setup.ready
              ? 'Everything needed to run the school is in place. Come back here to change any of it.'
              : `${left} essential ${left === 1 ? 'step' : 'steps'} left before the school is ready. Everything already works while you finish.`}</p>
          </div>
          {asHome && <Link className="btn cc-board" href="/admin?view=centre">Command Centre</Link>}
        </div>
        <div className="su-meter" aria-label={`${setup.required.done} of ${setup.required.total} essential steps done`}>
          <Ring done={setup.required.done} total={setup.required.total} />
          <div>
            <b>{setup.required.done} of {setup.required.total} essentials</b>
            <span>{setup.all.done} of {setup.all.total} steps in all</span>
          </div>
        </div>
      </header>
      {groups.map(g => (
        <section key={g} className="card su-group" aria-labelledby={`su-${g}`}>
          <h2 id={`su-${g}`}>{g}</h2>
          <ol className="su-steps">
            {setup.steps.filter(s => s.group === g).map(s => <StepRow key={s.key} s={s} />)}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 22, c = 2 * Math.PI * r, f = total ? done / total : 0;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true" className="su-ring">
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="6" />
      <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 28 28)" />
    </svg>
  );
}

const STATUS_ICON = { done: CheckCircle, attention: WarningCircle, todo: CircleDashed } as const;
const STATUS_WORD = { done: 'Done', attention: 'Needs attention', todo: 'Not started' } as const;

function StepRow({ s }: { s: Step }) {
  const Icon = STATUS_ICON[s.status];
  return (
    <li className={`su-step s-${s.status}`}>
      <span className="su-ico" title={STATUS_WORD[s.status]}><Icon size={22} weight={s.status === 'done' ? 'fill' : 'duotone'} /></span>
      <div className="su-b">
        <div className="su-t">
          <b>{s.title}</b>
          {s.required && s.status !== 'done' && <span className="su-tag">Needed to go live</span>}
          {s.sthara && <span className="su-tag su-tag-s">Sthara does this</span>}
        </div>
        <p>{s.note}</p>
      </div>
      <Link className={`btn sm${s.status !== 'done' && !s.sthara ? ' pri' : ''}`} href={s.href}>
        {s.status === 'done' ? 'Review' : s.cta} <ArrowRight size={13} weight="bold" />
      </Link>
      <span className="sr">{STATUS_WORD[s.status]}</span>
    </li>
  );
}

function HubSkeleton() {
  return (
    <div className="cc" aria-busy="true">
      <div className="cc-band"><div className="sk" style={{ width: '40%', height: 26 }} /><div className="sk" style={{ width: '60%', height: 14, marginTop: 12 }} /></div>
      {[0, 1, 2].map(i => <div key={i} className="card"><div className="sk" style={{ height: 150 }} /></div>)}
    </div>
  );
}

export type { Setup };
