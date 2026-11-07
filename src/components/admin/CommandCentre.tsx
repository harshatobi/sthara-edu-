'use client';

import Link from 'next/link';
import { type ComponentType, useMemo, useState } from 'react';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { CalendarBlankIcon as CalendarBlank } from '@phosphor-icons/react/dist/ssr/CalendarBlank';
import { CalendarCheckIcon as CalendarCheck } from '@phosphor-icons/react/dist/ssr/CalendarCheck';
import { CalendarDotsIcon as CalendarDots } from '@phosphor-icons/react/dist/ssr/CalendarDots';
import { CertificateIcon as Certificate } from '@phosphor-icons/react/dist/ssr/Certificate';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { ClockIcon as Clock } from '@phosphor-icons/react/dist/ssr/Clock';
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { CurrencyInrIcon as CurrencyInr } from '@phosphor-icons/react/dist/ssr/CurrencyInr';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { FirstAidKitIcon as FirstAidKit } from '@phosphor-icons/react/dist/ssr/FirstAidKit';
import { GavelIcon as Gavel } from '@phosphor-icons/react/dist/ssr/Gavel';
import { HandHeartIcon as HandHeart } from '@phosphor-icons/react/dist/ssr/HandHeart';
import { HeartIcon as Heart } from '@phosphor-icons/react/dist/ssr/Heart';
import { IdentificationCardIcon as IdentificationCard } from '@phosphor-icons/react/dist/ssr/IdentificationCard';
import { NotebookIcon as Notebook } from '@phosphor-icons/react/dist/ssr/Notebook';
import { PercentIcon as Percent } from '@phosphor-icons/react/dist/ssr/Percent';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { ShieldWarningIcon as ShieldWarning } from '@phosphor-icons/react/dist/ssr/ShieldWarning';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { StudentIcon as Student } from '@phosphor-icons/react/dist/ssr/Student';
import { TrophyIcon as Trophy } from '@phosphor-icons/react/dist/ssr/Trophy';
import { UserPlusIcon as UserPlus } from '@phosphor-icons/react/dist/ssr/UserPlus';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { WalletIcon as Wallet } from '@phosphor-icons/react/dist/ssr/Wallet';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { Empty, hmColor } from '@/components/canon/ui';
import { subjectName, type AdminDesk } from '@/lib/admin/desk';
import { ago, daysBetween, fmtDate, inrShort, isoDay, pct, plural } from '@/lib/admin/format';
import { probe, type Level } from '@/lib/admin/probe';
import { workItems, type WorkItem } from '@/lib/admin/work';
import { useToday } from '@/lib/admin/useToday';
import type { Today } from '@/lib/admin/todayServer';
import { DeskGate } from './kit';

/**
 * The principal's Command Centre (rebuilt 2026-11-06, Moses: "build out the BEST dashboard for a principal").
 * Decisions first: the band says how today is going in four numbers; "Waiting for you" lists every approval
 * and task the principal's roles cover, oldest and most serious first, each one click from being done; the school
 * pulse beside it says whether things are getting better. Below: where Probe says to look, mastery by grade,
 * staff today and the latest changes. Every number opens the page where it is acted on. Other office roles
 * see the same page shaped by what their roles allow.
 */

type IconT = ComponentType<{ size?: number; weight?: 'duotone' | 'bold' | 'fill' | 'regular' }>;
const WORK_ICON: Record<string, IconT> = {
  counter: CurrencyInr, daybook: Notebook, concessions: Percent, remind: Warning, admissions: UserPlus, offers: EnvelopeSimple,
  leave: CalendarBlank, hr: IdentificationCard, payroll: Wallet, cover: CalendarDots, staffday: Clock, messages: EnvelopeSimple,
  safety: ShieldWarning, consent: ShieldCheck, filing: Heart, register: Student, certificates: Certificate, kirti: Trophy,
  discipline: Gavel, counselling: HandHeart, safeguarding: ShieldWarning, dsl: ShieldWarning, health: FirstAidKit, logins: UsersThree,
};
const PROBE_TONE: Record<Level, 'r' | 'a' | 'n'> = { critical: 'r', high: 'r', medium: 'a', low: 'n' };
const RANK = { r: 0, a: 1, n: 2, g: 3 } as const;

export default function CommandCentre() {
  return <DeskGate full skeleton={<CcSkeleton />}>{desk => <Dashboard desk={desk} />}</DeskGate>;
}

function CcSkeleton() {
  return (
    <div className="cc" aria-busy="true">
      <div className="cc-band skel-band"><div className="sk" style={{ width: '38%', height: 26 }} /><div className="sk" style={{ width: '24%', height: 14, marginTop: 10 }} />
        <div className="cc-pulse">{[0, 1, 2, 3].map(i => <div key={i} className="cc-p"><div className="sk" style={{ height: 46 }} /></div>)}</div></div>
      <div className="cc-main"><div className="card"><div className="sk" style={{ height: 240 }} /></div><div className="card"><div className="sk" style={{ height: 240 }} /></div></div>
    </div>
  );
}

const longDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
const waited = (iso: string | null | undefined, today: string) => {
  if (!iso) return null;
  const d = daysBetween(iso.slice(0, 10), today);
  return d <= 0 ? 'arrived today' : d === 1 ? 'oldest from yesterday' : `oldest ${d} days`;
};

function Dashboard({ desk }: { desk: AdminDesk }) {
  const live = useToday();
  const today = live?.day ?? isoDay();
  const a = desk.me.access;
  const work = useMemo(() => workItems(desk, today, live?.queues), [desk, today, live]);
  const waiting = work.filter(w => (w.count ?? 0) > 0).sort((x, y) => RANK[x.tone] - RANK[y.tone] || (y.count ?? 0) - (x.count ?? 0));
  const rest = work.filter(w => !(w.count ?? 0));
  const decisions = waiting.reduce((n, w) => n + (w.count ?? 0), 0);

  return (
    <div className="cc">
      <Band desk={desk} live={live} today={today} decisions={decisions} oldest={waiting.map(w => w.oldest).filter(Boolean).sort()[0] ?? null} />
      <div className="cc-main">
        <Waiting waiting={waiting} rest={rest} today={today} loading={!live} />
        <Pulse desk={desk} />
      </div>
      <div className="cc-split">
        {a.can('probe.view') && <WhereToLook desk={desk} />}
        {a.can('academics.read') && <ByGrade desk={desk} />}
      </div>
      <div className="cc-split cc-split-b">
        {(a.can('workforce.read') || a.can('admissions.read')) && <StaffAndAdmissions desk={desk} today={today} />}
        {a.can('audit.read') && <Activity desk={desk} />}
      </div>
    </div>
  );
}

// ── The band: today in four numbers ──────────────────────────────────────────

function Band({ desk, live, today, decisions, oldest }: { desk: AdminDesk; live: Today | null; today: string; decisions: number; oldest: string | null }) {
  const a = desk.me.access;
  const att = live?.attendance;
  const inSchool = att && att.marked ? Math.round(((att.present + att.late) / att.marked) * 100) : null;
  const book = desk.dayBook.find(d => d.day === today);
  const tiles: { key: string; label: string; value: string; note: string; href: string; tone?: 'a' | 'r' }[] = [];
  tiles.push({
    key: 'waiting', label: 'Waiting for you', href: '#waiting',
    value: live ? decisions.toLocaleString('en-IN') : '…',
    note: !live ? 'Counting' : decisions ? (waited(oldest, today) ?? 'Across your areas') : 'Nothing waiting', tone: decisions ? 'a' : undefined,
  });
  if (a.can('attendance.read')) tiles.push({
    key: 'att', label: 'In school today', href: '/admin/attendance',
    value: inSchool !== null ? `${inSchool}%` : live ? 'Not marked' : '…',
    note: att ? (att.marked ? `${att.marked.toLocaleString('en-IN')} of ${att.students.toLocaleString('en-IN')} students marked` : 'No register marked yet today') : 'Registers',
    tone: inSchool !== null && inSchool < 85 ? 'a' : undefined,
  });
  if (a.can('fees.read')) tiles.push({
    key: 'fees', label: 'Collected today', href: '/admin/fees?tab=daybook',
    value: inrShort(book?.total ?? 0), note: `${book?.receipts ?? 0} receipts · ${inrShort(desk.fees.totals.outstanding)} outstanding`,
  });
  if (a.can('workforce.read')) tiles.push({
    key: 'staff', label: 'Staff on leave', href: '/admin/staff#leave',
    value: String(desk.workforce.onLeaveToday.length), note: desk.workforce.pendingLeave.length ? `${plural(desk.workforce.pendingLeave.length, 'request')} to decide` : 'No requests waiting',
  });
  return (
    <header className="cc-band">
      <div className="cc-band-top">
        <div>
          <h1>{desk.school.name}</h1>
          <p>{longDay(today)}<span aria-hidden="true"> · </span>AY {desk.session}{desk.school.code ? <span className="chip mono">{desk.school.code}</span> : null}</p>
        </div>
        {a.can('boardpack.view') && <Link className="btn cc-board" href="/admin/board-pack"><DownloadSimple size={16} weight="bold" /> Board pack</Link>}
      </div>
      <div className="cc-pulse" role="list">
        {tiles.map(t => (
          <Link key={t.key} href={t.href} className={`cc-p${t.tone ? ` t-${t.tone}` : ''}`} role="listitem">
            <span className="cc-p-l">{t.label}</span>
            <b className="cc-p-v">{t.value}</b>
            <span className="cc-p-n">{t.note}</span>
          </Link>
        ))}
      </div>
    </header>
  );
}

// ── Waiting for you ──────────────────────────────────────────────────────────

function Waiting({ waiting, rest, today, loading }: { waiting: WorkItem[]; rest: WorkItem[]; today: string; loading: boolean }) {
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

// ── The school's pulse ───────────────────────────────────────────────────────

function Spark({ points }: { points: (number | null)[] }) {
  const vals = points.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (vals.length < 2) return null;
  const W = 120, H = 34, min = Math.min(...vals.map(v => v[1])) - 2, max = Math.max(...vals.map(v => v[1])) + 2;
  const x = (i: number) => (i / (points.length - 1)) * W, y = (v: number) => H - ((v - min) / Math.max(1, max - min)) * H;
  const d = vals.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const [li, lv] = vals[vals.length - 1];
  return (
    <svg className="cc-spark" viewBox={`-3 -3 ${W + 6} ${H + 6}`} width={W} height={H} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(li)} cy={y(lv)} r={3} fill="currentColor" />
    </svg>
  );
}

function Pulse({ desk }: { desk: AdminDesk }) {
  const a = desk.me.access;
  const { academics: ac, fees, filing, wellness: wl } = desk;
  const today = isoDay();
  const rows: { key: string; icon: IconT; label: string; value: string; note: string; href: string; tone?: 'g' | 'a' | 'r'; spark?: (number | null)[] }[] = [];
  if (a.can('academics.read')) {
    const d = ac.schoolTml !== null && ac.schoolTmlBefore !== null ? ac.schoolTml - ac.schoolTmlBefore : null;
    rows.push({
      key: 'tml', icon: ChartLineUp, label: 'Mastery (TML)', href: '/admin/academic', spark: desk.tmlSeries.map(p => p.tml),
      value: ac.schoolTml !== null ? `${ac.schoolTml}%` : 'Not yet',
      note: ac.schoolTml === null ? 'Builds as teachers confirm grades' : d === null ? `${plural(ac.evidenced, 'student')} with evidence` : d ? `${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)} in two weeks` : 'Level with two weeks ago',
      tone: d !== null && d < 0 ? 'a' : undefined,
    });
    rows.push({
      key: 'risk', icon: Warning, label: 'Students at risk', href: '/admin/academic#at-risk', value: String(ac.atRisk.length),
      note: `Mastery below 40% · ${pct(ac.evidenced, desk.students.length) ?? 0}% have graded work`, tone: ac.atRisk.length ? 'r' : 'g',
    });
  }
  if (a.can('fees.read')) {
    const rate = fees.totals.collectionRate;
    rows.push({
      key: 'fees', icon: CurrencyInr, label: 'Fees collected', href: '/admin/fees',
      value: rate !== null ? `${Math.round(rate)}%` : 'Not billed',
      note: fees.totals.billed ? `${inrShort(fees.totals.overdue)} overdue · ${plural(fees.totals.familiesOverdue, 'family', 'families')}` : 'Set fee structures to start billing',
      tone: fees.totals.overdue ? 'a' : undefined,
    });
  }
  if (a.can('wellness.read')) {
    const due = filing.dueOn ? daysBetween(today, filing.dueOn) : null;
    rows.push({
      key: 'well', icon: Heart, label: 'CBSE wellness filing', href: '/admin/wellness',
      value: filing.status === 'filed' ? 'Filed' : due !== null ? (due < 0 ? 'Overdue' : `Due ${fmtDate(filing.dueOn!, true)}`) : 'Draft',
      note: filing.status === 'filed' ? `On ${fmtDate(filing.filedAt)}` : wl.participation !== null ? `${Math.min(100, wl.participation)}% of students checking in` : 'No check-ins yet this session',
      tone: filing.status === 'filed' ? 'g' : due !== null && due <= 30 ? 'a' : undefined,
    });
  }
  return (
    <section className="card cc-pulse-card" aria-labelledby="cc-pulse-h">
      <div className="cc-h"><h2 id="cc-pulse-h">School pulse</h2><span className="cc-count">{plural(desk.students.length, 'student')}</span></div>
      {rows.length ? rows.map(r => (
        <Link key={r.key} href={r.href} className={`cc-vital${r.tone ? ` t-${r.tone}` : ''}`}>
          <span className="cc-vital-i"><r.icon size={18} weight="duotone" /></span>
          <div className="cc-vital-b">
            <span className="cc-vital-l">{r.label}</span>
            <b className="cc-vital-v">{r.value}</b>
            <span className="cc-vital-n">{r.note}</span>
          </div>
          {r.spark && <Spark points={r.spark} />}
        </Link>
      )) : <p className="muted" style={{ fontSize: 13.5 }}>Your roles don’t include the school-wide figures.</p>}
    </section>
  );
}

// ── Where to look, mastery by grade ──────────────────────────────────────────

function WhereToLook({ desk }: { desk: AdminDesk }) {
  const found = probe(desk).findings;
  return (
    <section className="card" aria-labelledby="cc-probe-h">
      <div className="cc-h">
        <h2 id="cc-probe-h">Where to look</h2>
        {found.length > 4 && <Link className="btn sm" href="/admin/probe">All {found.length} <ArrowRight size={13} weight="bold" /></Link>}
      </div>
      {found.length ? (
        <ol className="cc-find">
          {found.slice(0, 4).map(f => (
            <li key={f.key} className={`t-${PROBE_TONE[f.level]}`}>
              <Link href={`/admin/probe?f=${encodeURIComponent(f.key)}`}>
                <span className="cc-find-s" aria-label={`${f.level} severity`}><Sparkle size={14} weight="fill" /></span>
                <span className="cc-find-b"><b>{f.title}</b><span>{f.summary}</span></span>
                <ArrowRight size={14} weight="bold" className="cc-go" />
              </Link>
            </li>
          ))}
        </ol>
      ) : <Empty icon={<CheckCircle size={26} weight="duotone" />} title="Probe found nothing to chase">Weak subjects, grading backlogs, overdue fees and compliance gaps show up here as they arise.</Empty>}
    </section>
  );
}

function ByGrade({ desk }: { desk: AdminDesk }) {
  const ac = desk.academics;
  const max = 100;
  return (
    <section className="card" aria-labelledby="cc-grade-h">
      <div className="cc-h"><h2 id="cc-grade-h">Mastery by grade</h2><Link className="btn sm" href="/admin/academic">Academic health <ArrowRight size={13} weight="bold" /></Link></div>
      {ac.grades.some(g => g.tml !== null) ? (
        <>
          <ul className="cc-grades">
            {ac.grades.map(g => (
              <li key={g.grade}>
                <Link href={`/admin/academic?grade=${g.grade}`}>
                  <span className="cc-g-l">Grade {g.grade}</span>
                  <span className="cc-g-bar"><i style={{ width: `${((g.tml ?? 0) / max) * 100}%`, background: g.tml !== null ? hmColor(g.tml) : 'transparent' }} /></span>
                  <b style={{ color: g.tml !== null ? hmColor(g.tml) : 'var(--mut2)' }}>{g.tml !== null ? `${g.tml}%` : 'None'}</b>
                </Link>
              </li>
            ))}
          </ul>
          {ac.weakest && (
            <p className="cc-note">
              {ac.weakest.tml! < 60
                ? <>Weakest: <b>Grade {ac.weakest.grade} {subjectName(ac.weakest.subject)}</b> at {ac.weakest.tml}%{ac.weakest.sections > 1 ? `, ${ac.weakest.sectionsBelow} of ${ac.weakest.sections} sections below 60%` : ''}.</>
                : <>No grade and subject is below 60%.</>}
            </p>
          )}
        </>
      ) : <Empty icon={<ChartLineUp size={26} weight="duotone" />} title="No graded evidence yet">Mastery appears here as teachers confirm homework and quiz grades.</Empty>}
    </section>
  );
}

// ── Staff today, admissions, recent changes ──────────────────────────────────

function StaffAndAdmissions({ desk, today }: { desk: AdminDesk; today: string }) {
  const a = desk.me.access;
  const wf = desk.workforce, adm = desk.admissions;
  return (
    <section className="card" aria-labelledby="cc-staff-h">
      {a.can('workforce.read') && <>
        <div className="cc-h"><h2 id="cc-staff-h">Staff today</h2><Link className="btn sm" href="/admin/schedule?tab=cover">Cover <ArrowRight size={13} weight="bold" /></Link></div>
        {wf.onLeaveToday.length ? (
          <ul className="cc-people">
            {wf.onLeaveToday.slice(0, 6).map(l => (
              <li key={l.id}><CalendarCheck size={15} weight="duotone" /><b>{l.staffName}</b><span>{l.type}{l.halfDay ? ', half day' : ''}{l.to > today ? `, until ${fmtDate(l.to, true)}` : ''}</span></li>
            ))}
            {wf.onLeaveToday.length > 6 && <li className="muted">and {wf.onLeaveToday.length - 6} more</li>}
          </ul>
        ) : <p className="cc-note ok">Everyone is in today.</p>}
        <p className="cc-note">{plural(wf.teachers.length, 'teacher')}{wf.ratio ? `, 1 for every ${wf.ratio} students` : ''}.</p>
      </>}
      {a.can('admissions.read') && adm.total > 0 && <>
        <div className="cc-h" style={{ marginTop: a.can('workforce.read') ? 18 : 0 }}><h2>Admissions AY {adm.session}</h2><Link className="btn sm" href="/admin/admissions">Pipeline <ArrowRight size={13} weight="bold" /></Link></div>
        <ul className="cc-funnel">
          {adm.funnel.map(f => (
            <li key={f.stage}><span>{f.label}</span><span className="cc-g-bar"><i style={{ width: `${f.share ?? 0}%` }} /></span><b className="num">{f.reached}</b></li>
          ))}
        </ul>
      </>}
    </section>
  );
}

function Activity({ desk }: { desk: AdminDesk }) {
  const items = desk.compliance.audit.slice(0, 6);
  return (
    <section className="card" aria-labelledby="cc-act-h">
      <div className="cc-h"><h2 id="cc-act-h">Latest changes</h2><Link className="btn sm" href="/admin/compliance#audit">Full trail</Link></div>
      {items.length ? (
        <ul className="cc-act">
          {items.map(x => (
            <li key={x.id}><ClockCounterClockwise size={15} weight="bold" /><div><b>{x.summary}</b><span>{x.actor}, {ago(x.at)}</span></div></li>
          ))}
        </ul>
      ) : <p className="muted" style={{ fontSize: 13.5 }}>No recorded changes yet.</p>}
    </section>
  );
}

