'use client';

import { useMemo } from 'react';
import { CaretLeftIcon as CaretLeft } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon as CaretRight } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { FilePdfIcon as FilePdf } from '@phosphor-icons/react/dist/ssr/FilePdf';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { downloadCsv } from '@/components/admin/kit';
import { MARKS, MARK_LABEL, MARK_SHORT, MIN_PCT, absentStreak, belowMin, monthCsv, tally, trendDelta, weeklyTrend, type SchoolDay } from '@/lib/attendance/register';
import { Sparkline, TrendChart, weeklyPts } from '@/components/canon/TrendLine';
import { dayLabel } from './DayRegister';
import type { History } from './useRegister';
import type { DocStudent } from './RegisterDoc';

const shiftMonth = (m: string, n: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/**
 * The month as a paper register: students down, days across, totals and the session percentage at the end,
 * a daily headcount at the foot. Days still open for correction jump to the day register.
 */
export default function MonthSheet({ cls, month, setMonth, minMonth, maxMonth, days, roster, history, today, editableFrom, sessionStart, onOpenDay, onPdf }: {
  cls: string;
  month: string;
  setMonth: (m: string) => void;
  minMonth: string;
  maxMonth: string;
  days: SchoolDay[];
  roster: DocStudent[];
  history: History;
  today: string;
  editableFrom: string;
  sessionStart: string;
  onOpenDay: (d: string) => void;
  onPdf: () => void;
}) {
  const weeks = useMemo(() => {
    const per = Object.fromEntries(roster.map(s => [s.id, weeklyTrend([history.marks[s.id] || {}], sessionStart, today)]));
    const cls = weeklyTrend(roster.map(s => history.marks[s.id] || {}), sessionStart, today);
    return { per, cls };
  }, [roster, history, sessionStart, today]);
  const delta = trendDelta(weeks.cls);
  const open = useMemo(() => days.filter(d => !d.off && d.date <= today).map(d => d.date), [days, today]);
  const rows = useMemo(() => roster.map(s => {
    const h = history.marks[s.id] || {};
    return { s, h, month: tally(h, open), session: tally(h) };
  }), [roster, history, open]);
  const perDay = (d: string) => roster.filter(s => { const m = history.marks[s.id]?.[d]; return m === 'present' || m === 'late'; }).length;
  const markedDay = (d: string) => roster.some(s => history.marks[s.id]?.[d]);
  const watch = rows.filter(r => belowMin(r.session) || absentStreak(r.h, today) >= 3)
    .sort((a, b) => (a.session.pct ?? 101) - (b.session.pct ?? 101));
  const classAvg = (() => {
    const t = rows.reduce((a, r) => ({ in: a.in + r.month.present + r.month.late, all: a.all + r.month.marked }), { in: 0, all: 0 });
    return t.all ? Math.round((t.in / t.all) * 100) : null;
  })();
  const unmarked = open.filter(d => !markedDay(d));
  const monthName = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });


  return (
    <>
      <div className="reg-sum month">
        <div className="reg-stat"><span>CLASS ATTENDANCE</span><b>{classAvg === null ? '—' : `${classAvg}%`}</b><em>{monthName}</em></div>
        <div className="reg-stat"><span>SCHOOL DAYS</span><b>{open.length}</b><em>{days.filter(d => d.off?.why === 'holiday').length} holidays</em></div>
        <div className={`reg-stat ${unmarked.length ? 'warn' : ''}`}><span>NOT MARKED</span><b>{unmarked.length}</b><em>{unmarked.length ? unmarked.slice(0, 3).map(d => dayLabel(d, { day: 'numeric', month: 'short' })).join(', ') + (unmarked.length > 3 ? '…' : '') : 'Every day marked'}</em></div>
        <div className={`reg-stat ${watch.length ? 'bad' : ''}`}><span>UNDER {MIN_PCT}%</span><b>{rows.filter(r => belowMin(r.session)).length}</b><em>this session</em></div>
      </div>

      <div className="card reg-sheet-card">
        <div className="reg-sheet-bar no-print">
          <div className="reg-month-nav">
            <button className="btn sm" aria-label="Previous month" disabled={month <= minMonth} onClick={() => setMonth(shiftMonth(month, -1))}><CaretLeft size={14} weight="bold" /></button>
            <b aria-live="polite">{monthName}</b>
            <button className="btn sm" aria-label="Next month" disabled={month >= maxMonth} onClick={() => setMonth(shiftMonth(month, 1))}><CaretRight size={14} weight="bold" /></button>
          </div>
          <div className="reg-legend" aria-label="Key">
            {MARKS.map(k => <span key={k}><i className={k}>{MARK_SHORT[k]}</i>{MARK_LABEL[k]}</span>)}
            <span><i className="hol">H</i>Holiday</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" onClick={() => downloadCsv(`register-${cls.replace(/\s+/g, '-')}-${month}.csv`, monthCsv(month, days, roster, history.marks))}><DownloadSimple size={14} weight="bold" />CSV</button>
            <button className="btn sm pri" onClick={onPdf}><FilePdf size={14} weight="bold" />Download PDF</button>
          </div>
        </div>

        <div>
          <div className="reg-sheet-wrap" tabIndex={0} role="region" aria-label={`${cls} register, ${monthName}. Scrolls sideways.`}>
            <table className="reg-sheet">
              <caption className="sr">{cls} attendance register for {monthName}. Rows are students, columns are days, then totals.</caption>
              <thead>
                <tr>
                  <th scope="col" className="stick">Roll</th>
                  <th scope="col" className="stick name">Student</th>
                  {days.map(d => (
                    <th key={d.date} scope="col" className={`${d.off ? 'off' : ''} ${d.date === today ? 'today' : ''}`} title={d.off ? d.off.label : dayLabel(d.date)}>
                      <span className="wd">{dayLabel(d.date, { weekday: 'narrow' })}</span>{Number(d.date.slice(8))}
                    </th>
                  ))}
                  <th scope="col" className="tot">P</th><th scope="col" className="tot">L</th><th scope="col" className="tot">A</th><th scope="col" className="tot">E</th>
                  <th scope="col" className="tot pct" title="Present or late, of days marked this month">%</th>
                  <th scope="col" className="tot pct" title="Present or late, of days marked this session">Session</th>
                  <th scope="col" className="tot trend">Weekly trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, h, month: t, session }) => (
                  <tr key={s.id}>
                    <td className="stick roll">{s.rollNo || '–'}</td>
                    <th scope="row" className="stick name">{s.name}</th>
                    {days.map(d => {
                      if (d.off) return <td key={d.date} className={`off ${d.off.why}`} aria-label={`${dayLabel(d.date)}: ${d.off.label}`}>{d.off.why === 'holiday' ? 'H' : ''}</td>;
                      const m = h[d.date];
                      const label = `${s.name}, ${dayLabel(d.date)}: ${m ? MARK_LABEL[m] : d.date > today ? 'upcoming' : 'not marked'}`;
                      const canOpen = d.date <= today && d.date >= editableFrom;
                      return (
                        <td key={d.date} className={`${m || (d.date > today ? 'fut' : 'none')} ${d.date === today ? 'today' : ''}`}>
                          {canOpen
                            ? <button aria-label={`${label}. Open the register for this day`} onClick={() => onOpenDay(d.date)}>{m ? MARK_SHORT[m] : '·'}</button>
                            : <span aria-label={label}>{m ? MARK_SHORT[m] : ''}</span>}
                        </td>
                      );
                    })}
                    <td className="tot">{t.present}</td><td className="tot">{t.late}</td><td className="tot">{t.absent}</td><td className="tot">{t.excused}</td>
                    <td className={`tot pct ${belowMin(t) ? 'low' : ''}`}>{t.pct ?? '—'}</td>
                    <td className={`tot pct ${belowMin(session) ? 'low' : ''}`}>{session.pct ?? '—'}</td>
                    <td className="tot trend"><Sparkline points={weeklyPts(weeks.per[s.id])} label={`${s.name}, weekly attendance this session`} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="stick roll" />
                  <th scope="row" className="stick name">In school</th>
                  {days.map(d => <td key={d.date} className={d.off ? `off ${d.off.why}` : ''}>{!d.off && markedDay(d.date) ? perDay(d.date) : ''}</td>)}
                  <td colSpan={7} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <div className="card reg-trend">
        <div className="reg-trend-head">
          <div>
            <h3>{cls} attendance, week by week</h3>
            <p className="muted">This session so far. Each point is the share of marks that were present or late that week.</p>
          </div>
          {delta !== null && (
            <span className={`ch ${delta < -2 ? 'r' : delta > 2 ? 'g' : 'n'}`}>
              {delta > 0 ? '+' : ''}{delta} pts over the last 3 weeks
            </span>
          )}
        </div>
        <TrendChart points={weeklyPts(weeks.cls)} title={`${cls} weekly attendance this session`} />
      </div>

      {watch.length > 0 && (
        <div className="card reg-watch">
          <h3><Warning size={18} weight="fill" color="var(--red)" aria-hidden="true" />Needs a conversation</h3>
          <p className="muted">Under {MIN_PCT}% this session (CBSE expects {MIN_PCT}% to sit the board exams), or absent three school days running.</p>
          <ul>
            {watch.map(({ s, h, session }) => {
              const streak = absentStreak(h, today);
              return (
                <li key={s.id}>
                  <span className="reg-roll-no">{s.rollNo || '–'}</span>
                  <b>{s.name}</b>
                  {belowMin(session) && <span className="ch r xs">{session.pct}% this session</span>}
                  {streak >= 3 && <span className="ch a xs">Absent {streak} days running</span>}
                  <Sparkline points={weeklyPts(weeks.per[s.id])} label={`${s.name}, weekly attendance`} />
                  <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>{session.absent} absent · {session.late} late · {session.excused} excused of {session.marked}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
