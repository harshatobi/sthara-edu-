'use client';

import { useMemo, useState } from 'react';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { ChartBarIcon as ChartBar } from '@phosphor-icons/react/dist/ssr/ChartBar';
import { Chip, Empty, Skeleton, type Tone } from '@/components/canon/ui';
import { CardHead, Kpi, downloadCsv } from '@/components/admin/kit';
import { isoDay, plural, sessionOf, sessionStart } from '@/lib/admin/format';
import { addDays, monthStart, weekStart } from '@/lib/schedule/engine';
import { staffLoad, type LoadFlag, type PersonLoad } from '@/lib/schedule/analytics';
import { useSolverData } from '@/lib/schedule/useSolverData';
import { useAttendance } from '@/lib/attendance/useAttendance';
import { dayOf } from '@/lib/attendance/engine';
import { datesBetween } from '@/lib/schedule/engine';
import { personKey, type PersonKey, type ScheduleRows } from '@/lib/schedule/types';
import TeacherRules from './TeacherRules';

type Call = <T = unknown>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const FLAG: Record<LoadFlag, { t: string; tone: Tone; about: string }> = {
  over: { t: 'OVER TARGET', tone: 'r', about: 'Timetabled for more periods a week than their target' },
  over_cap: { t: 'OVER CAP', tone: 'r', about: 'Taught more a week (with covers) than their weekly cap' },
  under: { t: 'UNDER-USED', tone: 'a', about: 'Timetabled well under their target (below 70%)' },
  covers: { t: 'MANY COVERS', tone: 'a', about: 'Took far more covers than colleagues' },
  duties: { t: 'MANY DUTIES', tone: 'a', about: 'Far more duties than colleagues' },
};
type Range = 'week' | 'last4' | 'month' | 'term';
const RANGES: [Range, string][] = [['week', 'This week'], ['last4', 'Last 4 weeks'], ['month', 'This month'], ['term', 'This session so far']];

/** Every range ends today: what was taught, not what the timetable still has planned for later this week. */
function rangeOf(r: Range, today: string) {
  if (r === 'week') return { from: weekStart(today), to: today };
  if (r === 'last4') return { from: addDays(weekStart(today), -21), to: today };
  if (r === 'month') return { from: monthStart(today), to: today };
  return { from: sessionStart(sessionOf()), to: today };
}

/** A few weeks of periods as bars. */
function Trend({ weeks }: { weeks: { week: string; periods: number }[] }) {
  const w = weeks.slice(-12);
  const max = Math.max(1, ...w.map(x => x.periods));
  return (
    <div aria-hidden style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 22, width: Math.max(24, w.length * 7) }}>
      {w.map(x => <span key={x.week} title={`${x.week}: ${x.periods}`} style={{ flex: 1, height: `${Math.max(6, (x.periods / max) * 100)}%`, background: 'var(--blue)', opacity: 0.75, borderRadius: 1.5 }} />)}
    </div>
  );
}

/** Schedule > Load: every teacher's load for leadership and HR (teachers don't see this). */
export default function LoadTab({ rows, call, toast, canEditTargets }: { rows: ScheduleRows; call: Call; toast: (m: string) => void; canEditTargets: boolean }) {
  const [today] = useState(() => isoDay());
  const [range, setRange] = useState<Range>('last4');
  const [view, setView] = useState<'all' | 'flagged'>('all');
  const [dept, setDept] = useState('');
  const { from, to } = rangeOf(range, today);
  const { data, error, reload } = useSolverData();
  const att = useAttendance(from, to);

  // Late days from the staff attendance register (finished days only).
  const lateDays = useMemo(() => {
    const a = att.data;
    if (!a) return undefined;
    const end = to < today ? to : addDays(today, -1);  // today isn't finished
    if (end < from) return new Map<PersonKey, number>();
    // Each person's punches once, rather than every punch scanned for every person and day.
    const punchesOf = new Map<PersonKey, typeof a.rows.punches>();
    for (const x of a.rows.punches) { const k = personKey(x.user_id, x.staff_member_id); if (!k) continue; const list = punchesOf.get(k); if (list) list.push(x); else punchesOf.set(k, [x]); }
    const days = datesBetween(from, end);
    const m = new Map<PersonKey, number>();
    for (const p of a.people) {
      const punches = punchesOf.get(p.key) ?? [];
      let n = 0;
      for (const d of days) if (dayOf(d, p, a.rows, null, { punches }).status === 'late') n++;
      m.set(p.key, n);
    }
    return m;
  }, [att.data, from, to, today]);

  const summary = useMemo(() => (data ? staffLoad(rows, data.rules, data.settings, { from, to }, { lateDays }) : null), [rows, data, from, to, lateDays]);

  if (error) return <div className="note err" role="alert">Couldn&apos;t load the load rules: {error}</div>;
  if (!summary || !data) return <div className="card" aria-busy="true">{[0, 1, 2].map(i => <Skeleton key={i} h={48} style={{ marginBottom: 12 }} />)}</div>;
  const people = summary.people.filter(p => (view === 'all' || p.flags.length) && (!dept || p.department === dept));

  const csv = () => downloadCsv(`staff-load-${from}-to-${to}.csv`, [
    ['Name', 'Department', 'Target a week', 'Timetable a week', 'Taught', 'Covers taken', 'Their lessons covered', 'Duties', 'Duty hours', 'Invigilation', 'Event duty', 'Leave days', 'Late days', 'Per week (taught + covers)', 'Flags'],
    ...summary.people.map((p: PersonLoad) => [p.name, p.department, p.target, p.timetable, p.taught, p.covers, p.coveredForThem, p.duties, p.dutyHours, p.invigilation, p.eventDuty, p.leaveDays, p.lateDays ?? '', p.perWeek, p.flags.map(f => FLAG[f].t).join('; ')]),
  ]);

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="sch-bar" style={{ marginBottom: 0 }}>
          <div className="sch-seg" role="tablist" aria-label="Period">
            {RANGES.map(([k, l]) => <button key={k} role="tab" aria-selected={range === k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>)}
          </div>
          <span className="muted" style={{ fontSize: 12.5 }}>{from} to {to} · {plural(summary.weeks, 'week')}</span>
          <span className="sp" />
          <button className="btn sm" onClick={csv}><DownloadSimple size={13} /> Export for payroll</button>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="AVERAGE TIMETABLE" value={summary.averages.timetable} note={`periods a week (school target ${data.settings.default_target_per_week})`} />
        <Kpi label="OVER TARGET" value={summary.counts.over + summary.counts.over_cap} valueColor={summary.counts.over + summary.counts.over_cap ? 'var(--red)' : 'var(--green)'} note="teachers above their target or cap" />
        <Kpi label="UNDER-USED" value={summary.counts.under} valueColor={summary.counts.under ? 'var(--amber)' : undefined} note="timetabled below 70% of target" />
        <Kpi label="COVERS" value={summary.averages.covers} note={`on average each; ${summary.counts.covers} carrying far more`} />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Staff load" sub="Timetable against each teacher's target; what they taught, covered and did besides in the period. Flags compare each teacher with their own target and with colleagues."
          right={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="sch-seg" role="tablist" aria-label="Show">
              <button role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>Everyone</button>
              <button role="tab" aria-selected={view === 'flagged'} className={view === 'flagged' ? 'on' : ''} onClick={() => setView('flagged')}>Flagged</button>
            </div>
            <select className="sch-sel" aria-label="Department" value={dept} onChange={e => setDept(e.target.value)}>
              <option value="">All departments</option>
              {summary.departments.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
          </div>} />
        {!people.length ? <Empty icon={<ChartBar size={26} weight="duotone" />} title={view === 'flagged' ? 'Nothing flagged' : 'No teachers'}>{view === 'flagged' ? 'Every teacher is within their target and in line with colleagues.' : 'Teachers appear once they are on the timetable or the staff list.'}</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Teacher</th><th>Timetable / target</th><th className="c">Taught</th><th className="c">Covers</th><th className="c">Duties</th><th className="c">Invig.</th><th className="c">Leave</th><th className="c">Late</th><th className="c">A week</th><th>Trend</th><th /></tr></thead>
              <tbody>{people.map(p => {
                const pct = p.target ? Math.min(130, (p.timetable / p.target) * 100) : 0;
                return (
                  <tr key={p.key}>
                    <td><b>{p.name}</b><div className="muted" style={{ fontSize: 12 }}>{p.department}</div></td>
                    <td style={{ minWidth: 150 }}>
                      <div className="num" style={{ fontSize: 13, fontWeight: 700 }}>{p.timetable} / {p.target}{!p.targetFromRule && <span className="muted" style={{ fontWeight: 500 }}> (default)</span>}</div>
                      <div style={{ height: 6, background: '#EEF2F7', borderRadius: 3, marginTop: 4, position: 'relative' }}>
                        <i style={{ position: 'absolute', inset: 0, width: `${pct / 1.3}%`, background: pct > 100 ? 'var(--red)' : pct < 70 ? 'var(--amber)' : 'var(--green)', borderRadius: 3 }} />
                        <i style={{ position: 'absolute', top: -2, bottom: -2, left: `${100 / 1.3}%`, width: 2, background: '#556378' }} />
                      </div>
                    </td>
                    <td className="c num">{p.taught}{p.coveredForThem ? <div className="muted" style={{ fontSize: 11 }}>{p.coveredForThem} covered</div> : null}</td>
                    <td className="c num">{p.covers}</td>
                    <td className="c num">{p.duties}{p.dutyHours ? <div className="muted" style={{ fontSize: 11 }}>{p.dutyHours} h</div> : null}</td>
                    <td className="c num">{p.invigilation}{p.eventDuty ? <div className="muted" style={{ fontSize: 11 }}>+{p.eventDuty} event</div> : null}</td>
                    <td className="c num">{p.leaveDays || '—'}</td>
                    <td className="c num">{p.lateDays ?? '—'}</td>
                    <td className="c num">{p.perWeek}</td>
                    <td><Trend weeks={p.weeks} /></td>
                    <td>{p.flags.map(f => <Chip key={f} tone={FLAG[f].tone} title={FLAG[f].about}>{FLAG[f].t}</Chip>)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Departments" sub="By each teacher's main subject in the timetable in force." />
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Department</th><th className="c">Teachers</th><th className="c">Average timetable</th><th className="c">Average target</th><th className="c">Covers taken</th></tr></thead>
            <tbody>{summary.departments.map(d => (
              <tr key={d.name}><td><b>{d.name}</b></td><td className="c num">{d.people}</td>
                <td className="c num" style={{ color: d.timetable > d.target ? 'var(--red)' : undefined }}>{d.timetable}</td><td className="c num">{d.target}</td><td className="c num">{d.covers}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {canEditTargets && <TeacherRules rows={rows} rules={data.rules} settings={data.settings} call={call} toast={toast} onSaved={reload} mode="load" />}
    </>
  );
}
