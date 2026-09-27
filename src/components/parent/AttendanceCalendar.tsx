'use client';

import { useState } from 'react';
import { CaretLeftIcon as CaretLeft } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon as CaretRight } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { CalendarCheckIcon as CalendarCheck } from '@phosphor-icons/react/dist/ssr/CalendarCheck';
import { Chip, Empty, PageBar, type Tone } from '@/components/canon/ui';
import { fmtDate } from '@/lib/admin/format';
import { hhmm } from '@/lib/schedule/engine';
import { DAY_SHORT, EVENT_KINDS, type EventKind } from '@/lib/schedule/types';
import { ChildSwitcher, FamilyGate } from './common';
import '@/styles/schedule.css';

const MARK: Record<string, { t: string; tone: Tone; bg: string }> = {
  present: { t: 'Present', tone: 'g', bg: '#E8F8F1' }, late: { t: 'Late', tone: 'a', bg: '#FFF4DA' },
  absent: { t: 'Absent', tone: 'r', bg: '#FFE4EA' }, excused: { t: 'Excused', tone: 'b', bg: '#EAF2FF' },
};

/** A child's attendance (the class register), the school calendar for their wing, and their weekly timetable. */
export default function AttendanceCalendar() {
  const [today] = useState(() => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => today.slice(0, 7));
  return (
    <FamilyGate>
      {({ child: c }) => {
        const byDay = new Map(c.attendance.days.map(d => [d.day, d]));
        const first = `${month}-01`;
        const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const lead = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
        const cells = [...Array(lead).fill(null), ...Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
        const shift = (n: number) => setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
        const eventsOn = (d: string) => c.calendar.filter(e => e.startsOn <= d && e.endsOn >= d);
        const upcoming = c.calendar.filter(e => e.endsOn >= today).slice(0, 12);
        const absences = c.attendance.days.filter(d => d.status === 'absent' || d.status === 'late').slice(0, 10);
        return (
          <>
            <ChildSwitcher />
            <PageBar eyebrow="ATTENDANCE & CALENDAR" title={`${c.firstName}'s days at school`} sub={`${c.cls}. The class register as the class teacher marks it, school holidays and events, and the weekly timetable.`} />
            <div className="kpis">
              <div className="kpi"><div className="lb">ATTENDANCE THIS SESSION</div><div className="vl" style={{ color: c.attendance.pct !== null && c.attendance.pct < 75 ? 'var(--red)' : undefined }}>{c.attendance.pct !== null ? `${c.attendance.pct}%` : '—'}</div>
                <div className="nt" style={{ color: 'var(--mut)' }}>{c.attendance.pct !== null && c.attendance.pct < 75 ? 'Below the 75% CBSE needs for board exams' : `${c.attendance.days.length} days marked`}</div></div>
              <div className="kpi"><div className="lb">ABSENT</div><div className="vl">{c.attendance.absent}</div><div className="nt" style={{ color: 'var(--mut)' }}>{c.attendance.excused} excused</div></div>
              <div className="kpi"><div className="lb">LATE</div><div className="vl">{c.attendance.late}</div></div>
            </div>

            <div className="g2" style={{ marginBottom: 18 }}>
              <div className="card">
                <div className="sch-bar">
                  <h3 style={{ fontSize: 17, fontWeight: 800 }}>Register</h3><span className="sp" />
                  <button className="btn sm" aria-label="Previous month" onClick={() => shift(-1)}><CaretLeft size={14} weight="bold" /></button>
                  <b>{new Date(`${first}T12:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b>
                  <button className="btn sm" aria-label="Next month" onClick={() => shift(1)}><CaretRight size={14} weight="bold" /></button>
                </div>
                <div className="sch-month" role="grid" aria-label="Attendance this month">
                  {[1, 2, 3, 4, 5, 6, 7].map(d => <div className="h" key={d} role="columnheader">{DAY_SHORT[d]}</div>)}
                  {cells.map((d, i) => {
                    if (!d) return <div key={`x${i}`} className="d out" aria-hidden="true" />;
                    const mark = byDay.get(d);
                    const ev = eventsOn(d);
                    const holiday = ev.find(e => e.noClasses);
                    return (
                      <div key={d} role="gridcell" className={`d${d === today ? ' today' : ''}${holiday ? ' off' : ''}`} style={{ minHeight: 64, background: mark ? MARK[mark.status].bg : undefined }}
                        aria-label={`${fmtDate(d)}${mark ? `, ${MARK[mark.status].t}` : ''}${holiday ? `, ${holiday.title}` : ''}`}>
                        <span className="n">{Number(d.slice(8))}</span>
                        {mark && <span className="cnt" style={{ fontWeight: 700 }}>{MARK[mark.status].t}</span>}
                        {!mark && ev[0] && <span className={`tag ${ev[0].kind}`} title={ev[0].title}>{ev[0].title}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="card">
                <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>Absent or late</h3>
                {absences.length ? absences.map(d => (
                  <div className="row" key={d.day}><b style={{ width: 90 }}>{fmtDate(d.day, true)}</b><span style={{ flex: 1 }} className="muted">{d.note || ''}</span><Chip tone={MARK[d.status].tone}>{MARK[d.status].t.toUpperCase()}</Chip></div>
                )) : <p className="muted">{c.attendance.days.length ? `${c.firstName} hasn't missed a day this session.` : 'The class teacher hasn\'t marked the register yet this session.'}</p>}
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: '18px 0 10px' }}>Coming up</h3>
                {upcoming.length ? upcoming.map(e => (
                  <div className="row" key={e.id}>
                    <div style={{ width: 90 }}><b>{fmtDate(e.startsOn, true)}</b>{e.endsOn !== e.startsOn && <div className="muted" style={{ fontSize: 12 }}>to {fmtDate(e.endsOn, true)}</div>}</div>
                    <span style={{ flex: 1 }}>{e.title}{e.startsAt ? <span className="muted"> · {hhmm(e.startsAt, true)}{e.endsAt ? `–${hhmm(e.endsAt, true)}` : ''}</span> : null}</span>
                    <Chip tone={e.noClasses ? 'r' : e.kind === 'exam' ? 'p' : e.kind === 'ptm' ? 'a' : 'b'}>{e.noClasses ? 'NO SCHOOL' : (EVENT_KINDS[e.kind as EventKind] || e.kind).toUpperCase()}</Chip>
                  </div>
                )) : <p className="muted">Nothing on the school calendar yet.</p>}
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>Weekly timetable</h3>
              {c.timetable ? (
                <div className="sch-grid-wrap">
                  <table className="sch-grid">
                    <thead><tr><th className="p" aria-label="Period" />{c.timetable.days.map(d => <th key={d}>{DAY_SHORT[d]}</th>)}</tr></thead>
                    <tbody>{c.timetable.rows.map((r, i) => r.no === null ? (
                      <tr className="brk" key={i}><th className="p">{hhmm(r.start)}</th><td colSpan={c.timetable!.days.length}>{r.label}</td></tr>
                    ) : (
                      <tr key={i}><th className="p">{r.label}<small>{hhmm(r.start)}–{hhmm(r.end)}</small></th>
                        {c.timetable!.days.map(d => {
                          const ls = c.timetable!.lessons.filter(l => l.weekday === d && l.period === r.no);
                          return <td key={d}><div className="sch-cell">{ls.map((l, j) => <div className="sch-l" key={j}><b>{l.subject}{l.group ? ` · ${l.group}` : ''}</b><span>{l.teacher || ''}</span></div>)}</div></td>;
                        })}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <Empty icon={<CalendarCheck size={26} weight="duotone" />} title="No timetable published yet">The school hasn&apos;t published a timetable for {c.cls} yet.</Empty>}
            </div>
          </>
        );
      }}
    </FamilyGate>
  );
}
