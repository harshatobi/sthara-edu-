'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ClockCounterClockwiseIcon as Clock } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { useGet } from '@/components/canon/useGet';
import PrintFoot from '@/components/ui/PrintFoot';
import { fmtDate, inr } from '@/lib/admin/format';
import { useCall } from '@/lib/exams/useApi';
import { SOURCE_LABEL, type MonthPoint, type Source, type Timeline as TL, type TimelineEvent, type Year } from '@/lib/timeline/rules';
import '@/styles/timeline.css';
import { ICON, PIN_ORDER } from './icons';
import { Lead } from './Leads';
import type { Lead as LeadData } from '@/lib/timeline/lead';

/**
 * The unified timeline (Living Record brief 08), rebuilt as a journey (Moses, 2026-11-06), the same screen in every
 * portal. At the top, the river: mastery and attendance month by month across every school year, with the milestones
 * pinned along it and, for roles that may see them, a thin record lane underneath. Below, the spine: each month's
 * stat strip and what happened, milestones loud, moments quiet, the record apart. The server decides what the viewer
 * sees; `query` names the student (studentId=… or login=…).
 */

interface Student { id: string; name: string; admissionNo: string | null; userId: string | null }
interface Data { student: Student; timeline: TL; events: TimelineEvent[]; series: MonthPoint[]; lead: LeadData }

const WHO_NOTE: Record<TL['who'], string> = {
  office: 'What your office roles allow. Child-protection cases never appear here.',
  class_teacher: 'The teaching side, as their class teacher.',
  subject_teacher: 'Attendance and your own subjects.',
  parent: 'What the school has recorded for your child. Warnings and detentions clear at the start of each school year.',
  student: 'Your years at school, as the school has recorded them.',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const mShort = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];
const mLong = (ym: string) => `${LONG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const dayOf = (on: string) => String(Number(on.slice(8, 10)));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const first = (name: string) => name.trim().split(/\s+/)[0] || name;

type Filter = 'all' | 'milestones';

export default function Timeline({ query }: { query: string }) {
  const { data, error } = useGet<Data>(`/api/timeline?${query}`);
  const [picked, setFilter] = useState<Filter | null>(null);
  const [printing, setPrinting] = useState<Data | null>(null);
  const [printErr, setPrintErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const call = useCall();

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <Loading />;
  const t = data.timeline;
  const empty = !t.years.length && !t.before;
  const student = t.who === 'student';
  // The student's own timeline opens on the highlights; everyone else on everything.
  const filter: Filter = picked ?? (student ? 'milestones' : 'all');
  const milestones = data.events.filter(e => e.tier === 'milestone').length;

  const goTo = (month: string) => {
    document.getElementById(`tl-m-${month}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    setFlash(month);
  };
  const print = async () => {
    setPrintErr(null);
    try { setPrinting(await call<Data>(`/api/timeline?${query}&print=1`)); }
    catch (e) { setPrintErr(e instanceof Error ? e.message : 'Could not prepare the student file.'); }
  };
  const name = `${first(data.student.name)}’s journey`;
  const now = t.years[0];

  return (
    <div className={`tl${student ? ' tl-s' : ''}`}>
      {!empty && <Lead lead={data.lead} t={t} series={data.series} events={data.events} student={data.student} />}
      <section className="card tl-top" aria-label="Journey overview">
        <header className="tl-top-head">
          <div>
            <h2 className="tl-name">{student ? `Your ${now?.session ?? 'year'} so far` : name}</h2>
            <p className="tl-meta">
              {now?.cls ? <>{now.cls}. </> : null}
              {t.years.length ? <>{plural(t.years.length, 'school year')} recorded, {plural(milestones, 'milestone')}.</> : 'No school years recorded yet.'}
            </p>
            {!student && <p className="tl-who">{WHO_NOTE[t.who]}</p>}
          </div>
          <div className="tl-actions">
            {!empty && (
              <div className="tl-seg" role="group" aria-label="What to show">
                {student && <button aria-pressed={filter === 'milestones'} onClick={() => setFilter('milestones')}>Highlights</button>}
                <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Everything</button>
                {!student && <button aria-pressed={filter === 'milestones'} onClick={() => setFilter('milestones')}>Milestones</button>}
              </div>
            )}
            {t.print && <button className="btn sm" onClick={print}><Printer size={14} /> Print the student file</button>}
          </div>
        </header>
        {printErr && <div className="note err" role="alert">{printErr}</div>}
        {empty
          ? <Empty icon={<Clock size={26} weight="duotone" />} title="Nothing recorded yet">Attendance, results and achievements appear here as the school records them.</Empty>
          : <River series={data.series} events={data.events} years={t.years} onPick={goTo} simple={student} />}
      </section>

      {!empty && (
        <section className="card tl-body" aria-label="Month by month">
          {t.years.map(y => <YearBlock key={y.session} y={y} t={t} series={data.series} events={data.events} filter={filter} flash={flash} focusOf={() => data.lead.focus} />)}
          {t.before && <Origin b={t.before} />}
        </section>
      )}
      {printing && <StudentFile d={printing} onDone={() => setPrinting(null)} />}
    </div>
  );
}

function Loading() {
  return (
    <div className="tl" aria-busy="true">
      <div className="card tl-top">
        <Skeleton h={22} w="40%" style={{ marginBottom: 10 }} />
        <Skeleton h={14} w="60%" style={{ marginBottom: 22 }} />
        <Skeleton h={170} />
      </div>
      <div className="card tl-body">{[0, 1, 2].map(i => <Skeleton key={i} h={54} style={{ marginBottom: 14 }} />)}</div>
    </div>
  );
}

// ── The river ────────────────────────────────────────────────────────────────

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

const PAD_L = 24, PAD_R = 24, TOP = 26, LINE_H = 104, ATT_H = 26, GAP = 10;

function River({ series, events, years, onPick, simple }: { series: MonthPoint[]; events: TimelineEvent[]; years: Year[]; onPick: (month: string) => void; simple?: boolean }) {
  const { ref, w: box } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  // Months on the river: the series, widened to take in any milestone outside it.
  const months = useMemo(() => {
    // The student's river is this school year; everyone else's runs across every year.
    const thisYear = years[0]?.session;
    const inView = (session: string | undefined) => !simple || session === thisYear;
    const keys = new Set(series.filter(p => inView(p.session)).map(p => p.month));
    for (const e of events) if (e.tier !== 'moment' && inView(e.session)) keys.add(e.on.slice(0, 7));
    const sorted = [...keys].sort();
    if (!sorted.length) return [];
    const out: string[] = [];
    let [y, m] = sorted[0].split('-').map(Number);
    const last = sorted[sorted.length - 1];
    for (;;) {
      const k = `${y}-${String(m).padStart(2, '0')}`;
      out.push(k);
      if (k >= last) break;
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  }, [series, events, years, simple]);
  const point = useMemo(() => new Map(series.map(p => [p.month, p])), [series]);
  const pins = useMemo(() => {
    const by = new Map<string, TimelineEvent[]>();
    for (const e of events) if (e.tier === 'milestone') by.set(e.on.slice(0, 7), [...(by.get(e.on.slice(0, 7)) || []), e]);
    return by;
  }, [events]);
  const record = useMemo(() => new Set(events.filter(e => e.tier === 'record').map(e => e.on.slice(0, 7))), [events]);
  const hasRecord = record.size > 0 && !simple;
  if (!months.length) return null;

  const n = months.length;
  const minStep = 14;
  const w = Math.max(box, n * minStep + PAD_L + PAD_R, 280);
  const step = n > 1 ? (w - PAD_L - PAD_R) / (n - 1) : 0;
  const x = (i: number) => (n > 1 ? PAD_L + i * step : w / 2);
  const yLine = (score: number) => TOP + LINE_H - (score / 100) * LINE_H;
  const attTop = TOP + LINE_H + GAP;
  const pinY = attTop + ATT_H + 18;
  const recY = pinY + 22;
  const axisY = (hasRecord ? recY : pinY) + 32;
  const h = axisY + 8;

  // The mastery line, broken where a month has no score.
  const segs: string[] = [];
  let cur = '';
  months.forEach((m, i) => {
    const s = point.get(m)?.tml?.score;
    if (s == null) { if (cur) segs.push(cur); cur = ''; return; }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${yLine(s).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const area = segs.map(d => {
    const pts = d.slice(1).split('L').map(p => p.split(',').map(Number));
    return `${d}L${pts[pts.length - 1][0]},${TOP + LINE_H}L${pts[0][0]},${TOP + LINE_H}Z`;
  });
  const lastTml = [...months].reverse().find(m => point.get(m)?.tml);
  const barW = Math.max(3, Math.min(14, step * 0.55));
  const labelEvery = step >= 26 ? 1 : step >= 12 ? 3 : 6;
  const sessions = years.map(y => y.session);
  const yearStarts = months.map((m, i) => ({ m, i, s: point.get(m)?.session })).filter((v, i, a) => v.s && (i === 0 || a[i - 1].s !== v.s));

  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const i = n > 1 ? Math.round((clientX - r.left - PAD_L) / step) : 0;
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover(hv => Math.max(0, Math.min(n - 1, (hv ?? n - 1) + (e.key === 'ArrowRight' ? 1 : -1))));
    } else if (e.key === 'Enter' && hover !== null) onPick(months[hover]);
  };
  const hm = hover !== null ? months[hover] : null;
  const hp = hm ? point.get(hm) : null;

  return (
    <div className="tl-river">
      <div className="tl-legend" aria-hidden="true">
        <span><i className="k-line" /> Mastery</span>
        {!simple && <span><i className="k-bar" /> Attendance</span>}
        <span><i className="k-pin" /> Milestone</span>
        {hasRecord && <span><i className="k-rec" /> On the record</span>}
      </div>
      <div className="tl-river-scroll" ref={ref}>
        <div className="tl-river-in" style={{ width: w, height: h }}>
          <svg width={w} height={h} role="img" tabIndex={0}
            aria-label={`Mastery and attendance by month, ${mLong(months[0])} to ${mLong(months[n - 1])}. Use the arrow keys to read each month, Enter to jump to it.`}
            onPointerMove={e => pick(e.clientX, e.currentTarget)} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)}
            onClick={() => { if (hm) onPick(hm); }}>
            <defs>
              <linearGradient id="tl-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2F6BFF" stopOpacity=".16" />
                <stop offset="1" stopColor="#2F6BFF" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[50, 75].map(v => <line key={v} x1={PAD_L} x2={w - PAD_R + 12} y1={yLine(v)} y2={yLine(v)} className="tl-grid" />)}
            <text x={PAD_L - 4} y={yLine(75) + 3} className="tl-grid-t" textAnchor="end">75</text>
            <text x={PAD_L - 4} y={yLine(50) + 3} className="tl-grid-t" textAnchor="end">50</text>
            {yearStarts.map(({ m, i, s }) => (
              <g key={m}>
                <line x1={x(i) - (i ? step / 2 : 0)} x2={x(i) - (i ? step / 2 : 0)} y1={4} y2={axisY - 14} className="tl-year-line" />
                <text x={x(i) - (i ? step / 2 : 0) + 6} y={14} className={`tl-year-t${s === sessions[0] ? ' now' : ''}`}>{s}</text>
              </g>
            ))}
            {!simple && months.map((m, i) => {
              const a = point.get(m)?.attendance;
              if (!a) return null;
              const bh = Math.max(2, (a.pct / 100) * ATT_H);
              return <rect key={m} x={x(i) - barW / 2} y={attTop + ATT_H - bh} width={barW} height={bh} rx={2} className={`tl-bar${a.pct < 75 ? ' low' : ''}`} />;
            })}
            {area.map((d, i) => <path key={`a${i}`} d={d} fill="url(#tl-area)" />)}
            {segs.map((d, i) => <path key={`l${i}`} d={d} className="tl-line" pathLength={1} />)}
            {lastTml && (() => {
              const i = months.indexOf(lastTml), s = point.get(lastTml)!.tml!;
              return <g><circle cx={x(i)} cy={yLine(s.score)} r={4.5} className="tl-now" /><text x={x(i) - 8} y={yLine(s.score) - 9} className="tl-now-t" textAnchor="end">{s.score}%</text></g>;
            })()}
            {hasRecord && months.map((m, i) => record.has(m) ? <rect key={m} x={x(i) - 3} y={recY - 3} width={6} height={6} transform={`rotate(45 ${x(i)} ${recY})`} className="tl-rec" /> : null)}
            {months.map((m, i) => (i % labelEvery === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= labelEvery / 2 || labelEvery === 1)
              ? <text key={m} x={x(i)} y={axisY} className="tl-axis" textAnchor="middle">{mShort(m)}</text> : null)}
            {hm !== null && hover !== null && <line x1={x(hover)} x2={x(hover)} y1={TOP - 4} y2={axisY - 12} className="tl-guide" />}
          </svg>
          {months.map((m, i) => {
            const ps = pins.get(m);
            if (!ps) return null;
            const top = [...ps].sort((a, b) => PIN_ORDER.indexOf(a.kind) - PIN_ORDER.indexOf(b.kind))[0];
            return (
              <button key={m} className={`tl-pin t-${top.tone}`} style={{ left: x(i), top: pinY }} onClick={() => onPick(m)}
                title={`${mLong(m)}: ${ps.map(p => p.title).join('; ')}`} aria-label={`${mLong(m)}: ${plural(ps.length, 'milestone')}. ${ps.map(p => p.title).join('. ')}`}>
                {ICON[top.kind]}
                {ps.length > 1 && <span className="tl-pin-n">{ps.length}</span>}
              </button>
            );
          })}
          {hm && hover !== null && (
            <div className={`tl-tip${x(hover) > w - 200 ? ' left' : ''}`} style={{ left: x(hover), top: TOP - 6 }} role="status">
              <b>{mLong(hm)}</b>
              <span>Mastery {hp?.tml ? `${hp.tml.score}%, ${hp.tml.band}` : 'not recorded'}</span>
              <span>Attendance {hp?.attendance ? `${hp.attendance.pct}%` : 'not recorded'}</span>
              {hp?.homework && <span>Homework {hp.homework.done} of {hp.homework.set}</span>}
              {pins.get(hm) && <span className="tl-tip-m">{plural(pins.get(hm)!.length, 'milestone')}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── The spine ────────────────────────────────────────────────────────────────

function yearFacts(y: Year, t: TL, focus: string | null): { k: string; v: string; sub?: string; tone?: 'g' | 'a' | 'r' }[] {
  const f: { k: string; v: string; sub?: string; tone?: 'g' | 'a' | 'r' }[] = [];
  if (y.attendance !== undefined) f.push({ k: 'Attendance', v: y.attendance?.pct != null ? `${y.attendance.pct}%` : 'None yet', sub: y.attendance ? plural(y.attendance.marked, 'day') : undefined, tone: y.attendance?.pct == null ? undefined : y.attendance.pct >= 90 ? 'g' : y.attendance.pct >= 75 ? 'a' : 'r' });
  if (y.tml !== undefined) f.push({ k: 'Mastery', v: y.tml ? `${y.tml.score}%` : 'None yet', sub: y.tml?.band, tone: !y.tml ? undefined : y.tml.score >= 75 ? 'g' : y.tml.score >= 50 ? 'a' : 'r' });
  if (y.results !== undefined) f.push({ k: y.results?.term ?? 'Results', v: y.results ? (y.results.pct !== null ? `${y.results.pct}%` : y.results.subjects.map(x => `${x.name.split(' ')[0]} ${x.grade ?? (x.pct !== null ? `${x.pct}%` : '')}`).join(', ') || 'Published') : 'None yet', sub: y.results?.grade ?? undefined });
  if (y.homework !== undefined) f.push({ k: 'Homework', v: y.homework ? `${y.homework.done} of ${y.homework.set}` : 'None yet', sub: y.homework?.avg != null ? `average ${y.homework.avg}%` : undefined });
  if (y.tutor !== undefined) f.push({ k: 'AI tutor', v: y.tutor ? plural(y.tutor.sessions, 'session') : 'None yet', sub: y.tutor?.depth != null ? `average depth ${y.tutor.depth}` : undefined });
  if (y.kirti !== undefined) f.push({ k: 'Kirti', v: y.kirti ? String(y.kirti) : 'None yet', tone: y.kirti ? 'g' : undefined });
  if (y.fees !== undefined) f.push({ k: 'Fees due', v: y.fees ? inr(y.fees.due) : 'None', tone: y.fees && y.fees.due > 0 ? 'a' : undefined });
  if (y.wellness !== undefined) f.push({ k: 'Wellbeing', v: y.wellness ? plural(y.wellness.checkins, 'check-in') : 'None yet', sub: y.wellness?.low ? plural(y.wellness.low, 'low day') : undefined });
  if (y.discipline !== undefined && t.who === 'office') f.push({ k: 'Discipline', v: String(y.discipline), tone: y.discipline ? 'a' : undefined });
  // The student sees the few that matter to them; an office role sees its own focus first.
  if (t.who === 'student') return f.filter(x => ['Attendance', 'Mastery', 'AI tutor', 'Kirti'].includes(x.k));
  const lead: Record<string, string[]> = { fees: ['Fees due'], care: ['Wellbeing'], register: ['Attendance', 'Discipline'] };
  const top = focus ? lead[focus] ?? [] : [];
  return [...f.filter(x => top.includes(x.k)), ...f.filter(x => !top.includes(x.k))];
}

function YearBlock({ y, t, series, events, filter, flash, print, focusOf }: { y: Year; t: TL; series: MonthPoint[]; events: TimelineEvent[]; filter: Filter; flash?: string | null; print?: boolean; focusOf?: () => string | null }) {
  const mine = events.filter(e => e.session === y.session);
  const shown = filter === 'milestones' ? mine.filter(e => e.tier === 'milestone') : mine;
  const pts = series.filter(p => p.session === y.session);
  const hasStats = (p: MonthPoint) => !!(p.attendance || p.tml || p.homework || p.wellness);
  const keys = new Set([...(filter === 'milestones' ? [] : pts.filter(hasStats).map(p => p.month)), ...shown.map(e => e.on.slice(0, 7))]);
  const months = [...keys].sort().reverse();
  const prevOf = new Map(series.map((p, i) => [p.month, series[i - 1]]));
  const facts = yearFacts(y, t, t.who === 'office' ? (focusOf?.() ?? null) : null);
  return (
    <section className="tl-yr" aria-label={`School year ${y.session}`}>
      <header className="tl-yr-head">
        <div className="tl-yr-title">
          <h3>{y.session}</h3>
          <span className={y.cls ? '' : 'muted'}>{y.cls ?? 'Class not recorded'}</span>
          {y.outcome ? <Chip tone={y.outcome.startsWith('Promoted') ? 'g' : 'a'}>{y.outcome.toUpperCase()}</Chip> : null}
        </div>
        {facts.length > 0 && (
          <dl className="tl-facts">
            {facts.map(f => <div key={f.k} className={f.tone ? `t-${f.tone}` : ''}><dt>{f.k}</dt><dd>{f.v}{f.sub && <small>{f.sub}</small>}</dd></div>)}
          </dl>
        )}
      </header>
      {months.length
        ? months.map(m => <MonthBlock key={m} simple={t.who === 'student'} recLabel={t.who === 'student' ? 'Harder moments' : 'On the record'} m={m} p={pts.find(x => x.month === m) ?? null} prev={prevOf.get(m) ?? null} events={shown.filter(e => e.on.slice(0, 7) === m)} flash={flash === m} print={print} current={!print && t.years[0]?.session === y.session && m === months[0]} />)
        : <p className="tl-none">{filter === 'milestones' ? 'No milestones this year yet.' : 'Nothing recorded this year.'}</p>}
    </section>
  );
}

function MonthBlock({ m, p, prev, events, flash, print, current, recLabel, simple }: { simple?: boolean; recLabel: string; m: string; p: MonthPoint | null; prev: MonthPoint | null; events: TimelineEvent[]; flash: boolean; print?: boolean; current: boolean }) {
  const story = events.filter(e => e.tier !== 'record');
  const rec = events.filter(e => e.tier === 'record');
  const d = p?.tml && prev?.tml ? p.tml.score - prev.tml.score : null;
  return (
    <div className={`tl-mo${flash ? ' flash' : ''}`} id={print ? undefined : `tl-m-${m}`}>
      <div className="tl-mo-rail">
        <b>{mShort(m)}</b><span>{m.slice(0, 4)}</span>
      </div>
      <div className="tl-mo-main">
        {p && (p.attendance || p.tml || p.homework || p.wellness) && (
          <ul className="tl-strip" aria-label={`${mLong(m)} at a glance`}>
            {p.tml && <li><span>{current ? 'Mastery so far' : 'Mastery'}</span><b>{p.tml.score}%</b>{d !== null && d !== 0 && <em className={d > 0 ? 'up' : 'down'}>{d > 0 ? `+${d}` : d}</em>}</li>}
            {p.attendance && <li><span>Attendance</span><b className={p.attendance.pct < 75 ? 'r' : p.attendance.pct < 90 ? 'a' : ''}>{p.attendance.pct}%</b><small>{plural(p.attendance.marked, 'day')}</small></li>}
            {p.homework && !simple && <li><span>Homework</span><b>{p.homework.done}/{p.homework.set}</b></li>}
            {p.wellness && !simple && <li><span>Check-ins</span><b>{p.wellness.checkins}</b></li>}
          </ul>
        )}
        {story.length > 0 && (
          <ol className="tl-events">
            {story.map((e, i) => (
              <li key={i} className={`tl-ev ${e.tier} t-${e.tone}`}>
                <span className="tl-node" title={SOURCE_LABEL[e.kind]}>{e.tier === 'milestone' ? ICON[e.kind] : null}</span>
                <div className="tl-ev-body">
                  <div className="tl-ev-title">{e.title}</div>
                  {e.detail && <div className="tl-ev-detail">{e.detail}</div>}
                </div>
                <time dateTime={e.on}>{dayOf(e.on)} {mShort(m)}</time>
              </li>
            ))}
          </ol>
        )}
        {rec.length > 0 && (
          <div className="tl-record">
            <div className="tl-record-h">{recLabel}</div>
            <ol>
              {rec.map((e, i) => (
                <li key={i} className={`t-${e.tone}`}>
                  <span className="tl-rec-ico">{ICON[e.kind]}</span>
                  <div><b>{e.title}</b>{e.detail && <span> {e.detail}</span>}</div>
                  <time dateTime={e.on}>{dayOf(e.on)} {mShort(m)}</time>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

function Origin({ b }: { b: NonNullable<TL['before']> }) {
  const bits = [b.school, b.cls && `last class ${b.cls}`, b.tcNo && `TC ${b.tcNo}`].filter(Boolean) as string[];
  return (
    <div className="tl-origin">
      <span className="tl-node big">{ICON.before}</span>
      <div>
        <div className="tl-ev-title">Before joining</div>
        <div className="tl-ev-detail">{bits.join(', ') || 'Another school'}{b.admittedOn ? `. Admitted ${fmtDate(b.admittedOn)}.` : ''}</div>
      </div>
    </div>
  );
}

/** The student file: the same journey on A4, every month and moment, printed from a document of its own. */
function StudentFile({ d, onDone }: { d: Data; onDone: () => void }) {
  useEffect(() => {
    document.body.classList.add('print-tl');
    const done = () => { document.body.classList.remove('print-tl'); window.removeEventListener('afterprint', done); onDone(); };
    window.addEventListener('afterprint', done);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    return () => { cancelAnimationFrame(raf); window.removeEventListener('afterprint', done); document.body.classList.remove('print-tl'); };
  }, [onDone]);
  const t = d.timeline;
  return createPortal(
    <div className="tl-doc" aria-hidden="true">
      <PrintFoot />
      <header className="tl-doc-head">
        <div><div className="tl-doc-eyebrow">STUDENT FILE</div><h1>{d.student.name}</h1>
          <div>{d.student.admissionNo ? `Admission no. ${d.student.admissionNo}. ` : ''}Printed {fmtDate(new Date().toISOString())}</div></div>
        <div className="tl-doc-scope">{t.sources.filter(s => s !== 'enrolment').map(s => SOURCE_LABEL[s]).join(', ')}{t.subjects ? ` (${t.subjects.join(', ')})` : ''}</div>
      </header>
      {t.years.map(y => <YearBlock key={y.session} y={y} t={t} series={d.series} events={d.events} filter="all" print />)}
      {t.before && <Origin b={t.before} />}
    </div>,
    document.body,
  );
}
