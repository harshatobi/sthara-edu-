'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { MagnifyingGlassIcon as MagnifyingGlass } from '@phosphor-icons/react/dist/ssr/MagnifyingGlass';
import { useAuth } from '@/contexts/AuthContext';
import { Empty, hmColor } from '@/components/canon/ui';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import type { AdminDesk } from '@/lib/admin/desk';
import { daysBetween, fmtDate, inr, inrShort, isoDay, plural } from '@/lib/admin/format';
import { ROLES, type RoleKey } from '@/lib/admin/rbac';
import { workItems } from '@/lib/admin/work';
import { useToday } from '@/lib/admin/useToday';
import type { Today } from '@/lib/admin/todayServer';
import { DeskGate } from '../kit';
import { ByGrade } from '../CommandCentre';
import { Waiting, rankWork, waited } from './Waiting';

/**
 * The home of an office role that isn't running the whole school (Moses, 2026-11-06: "a home per role"; staff with
 * several roles get one combined home). Every home opens with today in a few numbers and "Waiting for you" (the
 * same list as the principal's, limited to these roles), then a section for each role held: the cashier's counter
 * and today's receipts, the accountant's dues and day book, the admissions officer's pipeline, the registrar's
 * register and certificates, the coordinator's mastery, HR's leave, and so on. A home that shows whole-school
 * numbers loads them; the rest open on the light core.
 */

type Section = 'counter' | 'dues' | 'daybook' | 'concessions' | 'pipeline' | 'register' | 'mastery' | 'leave' | 'care' | 'health' | 'safeguarding' | 'compliance';

/** Each role's sections, in the order they matter to that role. */
const ROLE_SECTIONS: Record<RoleKey, Section[]> = {
  school_admin: [], principal: [], vice_principal: [],
  finance_head: ['concessions', 'dues', 'daybook'],
  accountant: ['dues', 'daybook', 'counter'],
  cashier: ['counter', 'daybook'],
  admissions_officer: ['pipeline'],
  registrar: ['register'],
  academic_coordinator: ['mastery'],
  hr_manager: ['leave'],
  counsellor: ['care'],
  dpo: ['compliance'],
  health_officer: ['health'],
  safeguarding_lead: ['safeguarding'],
};
/** Sections that read the whole-school data (and so load it). */
const NEEDS_FULL: Section[] = ['counter', 'dues', 'daybook', 'concessions', 'pipeline', 'mastery', 'leave', 'compliance'];

export function sectionsFor(roles: readonly string[]): Section[] {
  const out: Section[] = [];
  for (const r of roles) for (const s of ROLE_SECTIONS[r as RoleKey] ?? []) if (!out.includes(s)) out.push(s);
  return out;
}
export const homeNeedsFull = (roles: readonly string[]) => sectionsFor(roles).some(s => NEEDS_FULL.includes(s));

export default function RoleHome({ full }: { full: boolean }) {
  return <DeskGate full={full}>{desk => <Home desk={desk} />}</DeskGate>;
}

const greeting = () => {
  const h = new Date(Date.now() + 5.5 * 3600_000).getUTCHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

function Home({ desk }: { desk: AdminDesk }) {
  const { profile } = useAuth();
  const live = useToday();
  const today = live?.day ?? isoDay();
  const a = desk.me.access;
  const sections = sectionsFor(a.roles);
  // The core desk has no whole-school numbers: the work list then counts from the server alone.
  const work = useMemo(() => workItems(desk, today, live?.queues), [desk, today, live]);
  const { waiting, rest } = rankWork(work);
  const decisions = waiting.reduce((n, w) => n + (w.count ?? 0), 0);
  const first = (profile?.name || '').trim().split(/\s+/)[0];
  const roleNames = a.roles.map(r => ROLES[r as RoleKey]?.label).filter(Boolean);

  return (
    <div className="cc">
      <header className="cc-band">
        <div className="cc-band-top">
          <div>
            <h1>{greeting()}{first ? `, ${first}` : ''}</h1>
            <p>{roleNames.length ? listJoin(roleNames) : 'Office'}<span aria-hidden="true"> · </span>{new Date(`${today}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
        </div>
        <div className="cc-pulse" role="list">
          <Tile label="Waiting for you" href="#waiting" value={live ? decisions.toLocaleString('en-IN') : '…'} tone={decisions ? 'a' : undefined}
            note={!live ? 'Counting' : decisions ? (waited(waiting.map(w => w.oldest).filter(Boolean).sort()[0] ?? null, today) ?? 'Across your work') : 'Nothing waiting'} />
          {roleTiles(desk, live, today, sections)}
        </div>
      </header>
      <div className="cc-main rh-main">
        <Waiting waiting={waiting} rest={rest} today={today} loading={!live} />
        <div className="rh-side">
          {sections.map(s => <SectionView key={s} s={s} desk={desk} live={live} today={today} />)}
          {!sections.length && <QuickLinks desk={desk} />}
        </div>
      </div>
    </div>
  );
}

const listJoin = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function Tile({ label, value, note, href, tone }: { label: string; value: string; note: string; href: string; tone?: 'a' | 'r' }) {
  return (
    <Link href={href} className={`cc-p${tone ? ` t-${tone}` : ''}`} role="listitem">
      <span className="cc-p-l">{label}</span><b className="cc-p-v">{value}</b><span className="cc-p-n">{note}</span>
    </Link>
  );
}

/** Up to three more numbers for the band, from the first sections this person has. */
function roleTiles(desk: AdminDesk, live: Today | null, today: string, sections: Section[]): ReactNode[] {
  const out: ReactNode[] = [];
  const q = (k: keyof Today['queues']) => live?.queues[k]?.count;
  const book = desk.full ? desk.dayBook.find(d => d.day === today) : undefined;
  let collected = false;
  for (const s of sections) {
    if (out.length >= 3) break;
    if ((s === 'counter' || s === 'daybook') && desk.full && !collected) {
      collected = true;
      out.push(<Tile key="today" label="Collected today" href="/admin/fees?tab=daybook" value={inrShort(book?.total ?? 0)} note={plural(book?.receipts ?? 0, 'receipt')} />);
    }
    if (s === 'dues' && desk.full) out.push(<Tile key="dues" label="Overdue" href="/admin/fees?view=overdue" value={inrShort(desk.fees.totals.overdue)} note={plural(desk.fees.totals.familiesOverdue, 'family', 'families')} tone={desk.fees.totals.overdue ? 'r' : undefined} />);
    if (s === 'pipeline' && desk.full) out.push(<Tile key="adm" label="Applicants" href="/admin/admissions" value={String(desk.admissions.applicants.filter(x => x.open).length)} note={`${desk.admissions.enrolled} enrolled for AY ${desk.admissions.session}`} />);
    if (s === 'register') out.push(<Tile key="reg" label="Change requests" href="/admin/students?tab=requests" value={q('register') !== undefined ? String(q('register')) : '…'} note="From parents" tone={q('register') ? 'a' : undefined} />);
    if (s === 'mastery' && desk.full) out.push(<Tile key="tml" label="School mastery" href="/admin/academic" value={desk.academics.schoolTml !== null ? `${desk.academics.schoolTml}%` : 'Not yet'} note={`${desk.academics.atRisk.length} students below 40%`} />);
    if (s === 'leave' && desk.full) out.push(<Tile key="leave" label="On leave today" href="/admin/staff#leave" value={String(desk.workforce.onLeaveToday.length)} note={`${plural(desk.workforce.pendingLeave.length, 'request')} to decide`} />);
    if (s === 'care') out.push(<Tile key="ref" label="New referrals" href="/admin/counselling" value={q('counselling') !== undefined ? String(q('counselling')) : '…'} note="Waiting to be seen" tone={q('counselling') ? 'a' : undefined} />);
    if (s === 'health') out.push(<Tile key="hr" label="Health requests" href="/admin/health" value={q('health') !== undefined ? String(q('health')) : '…'} note="From parents" tone={q('health') ? 'a' : undefined} />);
  }
  return out.slice(0, 3);
}

// ── Sections ─────────────────────────────────────────────────────────────────

function Card({ title, href, cta, children }: { title: string; href?: string; cta?: string; children: ReactNode }) {
  return (
    <section className="card">
      <div className="cc-h"><h2>{title}</h2>{href && <Link className="btn sm" href={href}>{cta ?? 'Open'} <ArrowRight size={13} weight="bold" /></Link>}</div>
      {children}
    </section>
  );
}

function SectionView({ s, desk, live, today }: { s: Section; desk: AdminDesk; live: Today | null; today: string }) {
  const a = desk.me.access;
  switch (s) {
    case 'counter': return <Counter desk={desk} today={today} />;
    case 'dues': return desk.full ? <Dues desk={desk} /> : null;
    case 'daybook': return desk.full ? <DayBookCard desk={desk} today={today} canClose={a.can('fees.dayclose')} /> : null;
    case 'concessions': return desk.full ? <Concessions desk={desk} /> : null;
    case 'pipeline': return desk.full ? <Pipeline desk={desk} /> : null;
    case 'register': return <Register live={live} today={today} canCert={a.can('certificates.prepare')} />;
    case 'mastery': return desk.full ? <><ByGrade desk={desk} /><AtRisk desk={desk} /></> : null;
    case 'leave': return desk.full ? <Leave desk={desk} today={today} /> : null;
    case 'care': return <Links title="Counselling and wellbeing" items={[['Counselling cases and referrals', '/admin/counselling'], ['Wellness report', '/admin/wellness'], ['Parent messages', '/admin/messages'], ['Safety alerts', '/admin/feed']]} />;
    case 'health': return <Links title="Health records" items={[['Health records and requests', '/admin/health'], ['Students', '/admin/students']]} />;
    case 'safeguarding': return <Links title="Child protection" note="Child-protection cases and their POCSO steps. Only you and the principal see them." items={[['Open cases', '/admin/safeguarding'], ['Safety alerts', '/admin/feed']]} />;
    case 'compliance': return desk.full ? <Compliance desk={desk} /> : null;
  }
}

function Counter({ desk, today }: { desk: AdminDesk; today: string }) {
  const recent = desk.full ? desk.fees.receipts.filter(r => !r.voided).sort((x, y) => (y.recordedAt > x.recordedAt ? 1 : -1)).slice(0, 5) : [];
  const names = desk.full ? new Map(desk.students.map(s => [s.id, s.name])) : new Map<string, string>();
  return (
    <Card title="Fee counter" href="/admin/fees?tab=counter" cta="Open the counter">
      <form className="rh-search" action="/admin/fees" method="get">
        <input type="hidden" name="tab" value="counter" />
        <label htmlFor="rh-q" className="sr">Find a student</label>
        <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
        <input id="rh-q" name="q" placeholder="Student name or admission number" autoComplete="off" />
        <button className="btn sm pri">Find</button>
      </form>
      {recent.length > 0 && (
        <ul className="rh-rows">
          {recent.map(r => (
            <li key={r.id}><b>{names.get(r.studentId) ?? 'Student'}</b><span>{r.receiptNo}, {r.mode}{r.paidOn !== today ? `, ${fmtDate(r.paidOn, true)}` : ''}</span><b className="num">{inr(r.amount)}</b></li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Dues({ desk }: { desk: AdminDesk }) {
  const top = desk.fees.families.filter(f => f.overdue > 0).sort((x, y) => y.overdue - x.overdue).slice(0, 5);
  return (
    <Card title="Overdue fees" href="/admin/fees?view=overdue" cta="All overdue">
      {top.length ? (
        <ul className="rh-rows">
          {top.map(f => <li key={f.studentId}><b>{f.name}</b><span>{f.cls}, {f.maxDaysOverdue} days overdue</span><b className="num rh-r">{inr(f.overdue)}</b></li>)}
        </ul>
      ) : <p className="cc-note ok">No family is overdue.</p>}
      <p className="cc-note">{inrShort(desk.fees.totals.collected)} collected of {inrShort(desk.fees.totals.billed)} billed this year.</p>
    </Card>
  );
}

function DayBookCard({ desk, today, canClose }: { desk: AdminDesk; today: string; canClose: boolean }) {
  const days = desk.dayBook.filter(d => d.receipts > 0).sort((x, y) => (y.day > x.day ? 1 : -1)).slice(0, 5);
  return (
    <Card title="Day book" href="/admin/fees?tab=daybook" cta={canClose ? 'Close days' : 'Open'}>
      {days.length ? (
        <ul className="rh-rows">
          {days.map(d => (
            <li key={d.day}><b>{d.day === today ? 'Today' : fmtDate(d.day, true)}</b><span>{plural(d.receipts, 'receipt')}, {d.close?.status === 'closed' ? 'closed' : d.day < today ? 'not closed' : 'open'}</span>
              <b className={`num${d.day < today && d.close?.status !== 'closed' ? ' rh-a' : ''}`}>{inr(d.total)}</b></li>
          ))}
        </ul>
      ) : <p className="cc-note">No receipts recorded yet.</p>}
    </Card>
  );
}

function Concessions({ desk }: { desk: AdminDesk }) {
  const pending = desk.concessions.filter(c => c.status === 'pending' && c.requestedBy !== desk.me.id).slice(0, 5);
  const names = new Map(desk.students.map(s => [s.id, s.name]));
  if (!pending.length) return null;
  return (
    <Card title="Concessions to decide" href="/admin/fees?tab=concessions" cta="Decide">
      <ul className="rh-rows">
        {pending.map(c => <li key={c.id}><b>{names.get(c.studentId) ?? 'Student'}</b><span>{c.reason || 'Concession request'}</span><b className="num">{inr(c.amount)}</b></li>)}
      </ul>
    </Card>
  );
}

function Pipeline({ desk }: { desk: AdminDesk }) {
  const P = desk.admissions;
  const stale = P.stale.slice(0, 5);
  return (
    <Card title={`Admissions AY ${P.session}`} href="/admin/admissions" cta="Pipeline">
      <ul className="cc-funnel">
        {P.funnel.map(f => <li key={f.stage}><span>{f.label}</span><span className="cc-g-bar"><i style={{ width: `${f.share ?? 0}%` }} /></span><b className="num">{f.reached}</b></li>)}
      </ul>
      {stale.length > 0 && <>
        <h3 className="rh-sub">Waiting too long in their stage</h3>
        <ul className="rh-rows">
          {stale.map(x => <li key={x.id}><b>{x.name}</b><span>Grade {x.grade}, {x.daysInStage} days in this stage</span><Link className="btn sm" href={`/admin/admissions?applicant=${x.id}`}>Open</Link></li>)}
        </ul>
      </>}
    </Card>
  );
}

function Register({ live, today, canCert }: { live: Today | null; today: string; canCert: boolean }) {
  const reg = live?.queues.register, cert = live?.queues.certificates;
  return (
    <Card title="Student register" href="/admin/students" cta="Open the register">
      <ul className="rh-rows">
        <li><b>Change requests from parents</b><span>{reg ? (reg.count ? waited(reg.oldest, today) : 'None waiting') : 'Counting'}</span><Link className="btn sm" href="/admin/students?tab=requests">{reg?.count ?? '…'}</Link></li>
        {canCert && <li><b>Certificate drafts</b><span>{cert ? (cert.count ? 'To finish and send for approval' : 'None waiting') : 'Counting'}</span><Link className="btn sm" href="/admin/certificates">{cert?.count ?? '…'}</Link></li>}
        <li><b>Year end</b><span>Promote, detain and close the session</span><Link className="btn sm" href="/admin/students?tab=year">Open</Link></li>
      </ul>
    </Card>
  );
}

function AtRisk({ desk }: { desk: AdminDesk }) {
  const list = desk.academics.atRisk.slice(0, 6);
  return (
    <Card title="Students at risk" href="/admin/academic#at-risk" cta="All">
      {list.length ? (
        <ul className="rh-rows">
          {list.map(s => <li key={s.id}><b>{s.name}</b><span>{s.cls}</span><b className="num" style={{ color: s.overall !== null ? hmColor(s.overall) : undefined }}>{s.overall !== null ? `${s.overall}%` : ''}</b></li>)}
        </ul>
      ) : <Empty icon={<CheckCircle size={26} weight="duotone" />} title="No student is below 40%">Students whose mastery drops below 40% show up here.</Empty>}
    </Card>
  );
}

function Leave({ desk, today }: { desk: AdminDesk; today: string }) {
  const wf = desk.workforce;
  const pending = [...wf.pendingLeave].sort((x, y) => (x.from > y.from ? 1 : -1)).slice(0, 5);
  return (
    <Card title="Leave" href="/admin/staff#leave" cta="Staff and leave">
      {pending.length ? (
        <ul className="rh-rows">
          {pending.map(l => <li key={l.id}><b>{l.staffName}</b><span>{l.type}, {fmtDate(l.from, true)}{l.to !== l.from ? ` to ${fmtDate(l.to, true)}` : ''}{daysBetween(today, l.from) <= 2 ? ', starts soon' : ''}</span><b className="num">{l.days}d</b></li>)}
        </ul>
      ) : <p className="cc-note ok">No leave waiting for a decision.</p>}
      <p className="cc-note">{wf.onLeaveToday.length ? `${plural(wf.onLeaveToday.length, 'person', 'people')} on leave today.` : 'Everyone is in today.'}</p>
    </Card>
  );
}

function Compliance({ desk }: { desk: AdminDesk }) {
  const flags = desk.compliance.flags.slice(0, 5);
  return (
    <Card title="Consent and DPDP" href="/admin/compliance" cta="Compliance">
      {flags.length ? (
        <ul className="rh-rows">{flags.map(f => <li key={f.key}><b>{f.title}</b><span>{f.detail}</span><Link className="btn sm" href={f.href}>Fix</Link></li>)}</ul>
      ) : <p className="cc-note ok">No open flags.</p>}
    </Card>
  );
}

function Links({ title, items, note }: { title: string; items: [string, string][]; note?: string }) {
  return (
    <Card title={title}>
      {note && <p className="cc-note" style={{ marginTop: 0, marginBottom: 10 }}>{note}</p>}
      <div className="cc-chips">{items.map(([l, h]) => <Link key={h} href={h} className="cc-chip">{l} <ArrowRight size={13} weight="bold" /></Link>)}</div>
    </Card>
  );
}

function QuickLinks({ desk }: { desk: AdminDesk }) {
  const a = desk.me.access;
  const items: [string, string][] = [['My schedule', '/admin/schedule'], ['My record', '/admin/people']];
  if (a.can('students.read')) items.unshift(['Students', '/admin/students']);
  return <Links title="Your pages" items={items} />;
}
