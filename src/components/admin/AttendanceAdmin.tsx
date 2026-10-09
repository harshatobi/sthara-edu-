'use client';

import { useEffect, useMemo, useState } from 'react';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { FilePdfIcon as FilePdf } from '@phosphor-icons/react/dist/ssr/FilePdf';
import { CalendarCheckIcon as CalendarCheck } from '@phosphor-icons/react/dist/ssr/CalendarCheck';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { Bar, Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { Sparkline, TrendChart, weeklyPts } from '@/components/canon/TrendLine';
import { createClient } from '@/lib/supabase/client';
import { istDay } from '@/lib/feed/rules';
import { MIN_PCT, monthDays, schoolDays } from '@/lib/attendance/register';
import { shapeSchoolAttendance, type SchoolAttendance, type SummaryRow } from '@/lib/attendance/school';
import type { AdminDesk } from '@/lib/admin/desk';
import { normClass } from '@/lib/teacher/scope';
import MonthSheet from '@/components/teacher/attendance/MonthSheet';
import RegisterDoc, { printRegister } from '@/components/teacher/attendance/RegisterDoc';
import { sessionFrom, useCalendar, useHistory, wingIdOf } from '@/components/teacher/attendance/useRegister';
import { CardHead, DeskGate, Workspace, downloadCsv } from './kit';

export default function AttendanceAdmin() {
  return <DeskGate need="attendance.read">{desk => <Attendance desk={desk} />}</DeskGate>;
}

/** The summary rows for the session, this month and today (aggregated in the database). */
export function useSchoolAttendance(desk: AdminDesk | null) {
  const today = useMemo(() => istDay(), []);
  const sessionStart = sessionFrom(today);
  const [state, setState] = useState<{ data: SchoolAttendance | null; err: string | null } | null>(null);
  useEffect(() => {
    if (!desk) return;
    let alive = true;
    createClient().rpc('school_attendance_summary', { p_from: sessionStart, p_to: today, p_month_from: `${today.slice(0, 7)}-01` })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { setState({ data: null, err: /does not exist|schema cache/i.test(error.message) ? 'Attendance reporting is waiting on a database update.' : error.message }); return; }
        setState({ data: shapeSchoolAttendance((data || []) as SummaryRow[], desk.students, sessionStart, today), err: null });
      });
    return () => { alive = false; };
  }, [desk, sessionStart, today]);
  return { att: state?.data ?? null, err: state?.err ?? null, today, sessionStart };
}

const pctText = (p: number | null) => (p === null ? '—' : `${p}%`);

function Attendance({ desk }: { desk: AdminDesk }) {
  const { att, err, today, sessionStart } = useSchoolAttendance(desk);
  const cal = useCalendar(desk.school.id);
  const [open, setOpen] = useState<string | null>(null);
  const [doc, setDoc] = useState<'school' | 'class'>('school');
  const [month, setMonth] = useState(today.slice(0, 7));

  const roster = useMemo(() => (open ? desk.students.filter(s => normClass(s.cls) === normClass(open)) : [])
    .slice().sort((a, b) => (a.rollNo || '').localeCompare(b.rollNo || '', 'en', { numeric: true }) || a.name.localeCompare(b.name)), [desk, open]);
  const ids = useMemo(() => roster.map(s => s.id), [roster]);
  const { history } = useHistory(ids, 0);
  const days = useMemo(() => (cal && open ? schoolDays(monthDays(month), { workingDays: cal.workingDays, events: cal.events, wingId: wingIdOf(open, cal) }) : []), [cal, open, month]);

  const pdf = (kind: 'school' | 'class') => { setDoc(kind); printRegister(); };
  const csv = () => att && downloadCsv(`${desk.school.name.replace(/\W+/g, '-')}-attendance-${today}.csv`, [
    ['Class', 'On roll', 'Today marked', 'Today in school %', 'Month %', 'Session %', `Under ${MIN_PCT}%`],
    ...att.classes.map(c => [c.cls, c.onRoll, c.today ? 'yes' : 'no', c.today?.pct ?? '', c.month.pct ?? '', c.session.pct ?? '', c.under]),
    [],
    ['Students under 75% this session'], ['Class', 'Roll', 'Name', 'Session %', 'Absent', 'Late', 'Excused', 'Days marked'],
    ...att.under.map(u => [u.cls, u.rollNo, u.name, u.session.pct ?? '', u.session.absent, u.session.late, u.session.excused, u.session.marked]),
  ]);

  return (
    <>
      <div className="no-print">
        <PageBar eyebrow="ATTENDANCE" title="Student attendance"
          sub="Every class register in one place: who has marked today, each class's month and session, and the students under the CBSE 75%."
          actions={att?.any ? (
            <>
              <button className="btn" onClick={csv}><DownloadSimple size={15} weight="bold" />Spreadsheet</button>
              <button className="btn pri" onClick={() => pdf('school')}><FilePdf size={15} weight="bold" />Download PDF</button>
            </>
          ) : undefined} />
        {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
        {!att && !err ? (
          <div className="kpis">{[0, 1, 2, 3].map(i => <div className="kpi" key={i}><Skeleton h={70} /></div>)}</div>
        ) : att && !att.any ? (
          <div className="card"><Empty icon={<CalendarCheck size={26} weight="duotone" />} title="No registers marked yet">
            Class teachers mark attendance from their Attendance page. Each register shows up here the moment it is saved.
          </Empty></div>
        ) : att && (
          <>
            <div className="kpis">
              <div className="kpi"><div className="lb">IN SCHOOL TODAY</div><div className="vl">{pctText(att.today.pct)}</div>
                <div className="nt" style={{ color: att.classesMarked < att.classes.length ? '#B26A00' : 'var(--green)' }}>{att.classesMarked} of {att.classes.length} registers marked</div></div>
              <div className="kpi"><div className="lb">THIS MONTH</div><div className="vl">{pctText(att.month.pct)}</div><div className="nt" style={{ color: 'var(--mut)' }}>{att.month.absent} absences, {att.month.late} late</div></div>
              <div className="kpi"><div className="lb">THIS SESSION</div><div className="vl">{pctText(att.session.pct)}</div><div className="nt" style={{ color: 'var(--mut)' }}>Since {new Date(`${sessionStart}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</div></div>
              <div className="kpi"><div className="lb">UNDER {MIN_PCT}%</div><div className="vl" style={{ color: att.under.length ? 'var(--red)' : undefined }}>{att.under.length}</div><div className="nt" style={{ color: 'var(--mut)' }}>students this session</div></div>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <CardHead title="School attendance, week by week" sub="The share of all marks that were present or late, each week this session." />
              <TrendChart points={weeklyPts(att.weeks)} title="School weekly attendance this session" />
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <CardHead title="Classes" sub="Open a class to read its register month by month or download it as a PDF." />
              <div className="tbl-wrap">
                <table className="tbl att-tbl">
                  <thead><tr><th scope="col">Class</th><th scope="col">On roll</th><th scope="col">Today</th><th scope="col">Month</th><th scope="col">Session</th><th scope="col">Under {MIN_PCT}%</th><th scope="col">Weekly trend</th><th scope="col"><span className="sr">Open</span></th></tr></thead>
                  <tbody>
                    {att.classes.map(c => (
                      <tr key={c.cls}>
                        <th scope="row">{c.cls}</th>
                        <td>{c.onRoll}</td>
                        <td>{c.today ? <Chip tone={c.today.pct !== null && c.today.pct < MIN_PCT ? 'a' : 'g'}><CheckCircle size={12} weight="fill" />{pctText(c.today.pct)} · {c.today.absent} absent</Chip>
                          : <Chip tone="n">Not marked</Chip>}</td>
                        <td className={c.month.pct !== null && c.month.pct < MIN_PCT ? 'low' : ''}>{pctText(c.month.pct)}</td>
                        <td className={c.session.pct !== null && c.session.pct < MIN_PCT ? 'low' : ''}>{pctText(c.session.pct)}</td>
                        <td>{c.under ? <Chip tone="r">{c.under}</Chip> : <span className="muted">0</span>}</td>
                        <td><Sparkline points={weeklyPts(c.weeks)} label={`${c.cls}, weekly attendance`} /></td>
                        <td><button className="btn sm" onClick={() => { setOpen(c.cls); setMonth(today.slice(0, 7)); }}>Open register</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="g2" style={{ marginBottom: 18 }}>
              <div className="card">
                <CardHead title="By grade" sub="Session attendance." />
                {att.grades.map(g => (
                  <div className="row" key={g.grade} style={{ gap: 12 }}>
                    <b style={{ width: 70 }}>Grade {g.grade}</b>
                    <div style={{ flex: 1 }}><Bar value={g.session.pct ?? 0} color={g.session.pct !== null && g.session.pct < MIN_PCT ? 'var(--red)' : 'var(--blue)'} /></div>
                    <b style={{ width: 48, textAlign: 'right' }}>{pctText(g.session.pct)}</b>
                  </div>
                ))}
              </div>
              <div className="card">
                <CardHead title={`Under ${MIN_PCT}% this session`} sub="CBSE expects 75% to sit the board exams. Class teachers see the same list." />
                {!att.under.length ? <p className="muted" style={{ padding: '14px 0' }}>No student is under {MIN_PCT}%.</p> : att.under.slice(0, 40).map(u => (
                  <div className="row" key={u.id} style={{ gap: 10 }}>
                    <Warning size={16} weight="fill" color="var(--red)" aria-hidden="true" />
                    <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14 }}>{u.name}</b><div className="muted" style={{ fontSize: 12 }}>{u.cls}{u.rollNo ? ` · roll ${u.rollNo}` : ''} · {u.session.absent} absent of {u.session.marked}</div></div>
                    <Chip tone="r">{pctText(u.session.pct)}</Chip>
                  </div>
                ))}
                {att.under.length > 40 && <p className="muted" style={{ paddingTop: 10 }}>And {att.under.length - 40} more in the spreadsheet.</p>}
              </div>
            </div>
          </>
        )}

        {open && (
          <Workspace title={`${open} register`} sub="Read-only. The class teacher marks and corrects the register." onClose={() => setOpen(null)} wide>
            {!history || !cal ? <Skeleton h={300} /> : (
              <MonthSheet cls={open} month={month} setMonth={setMonth} minMonth={sessionStart.slice(0, 7)} maxMonth={today.slice(0, 7)} days={days}
                roster={roster} history={history} today={today} editableFrom="9999-12-31" sessionStart={sessionStart}
                onOpenDay={() => {}} onPdf={() => pdf('class')} />
            )}
          </Workspace>
        )}
      </div>

      {att && doc === 'school' && <SchoolDoc desk={desk} att={att} today={today} />}
      {doc === 'class' && open && history && cal && (
        <RegisterDoc kind="month" school={desk.school.name} cls={open} teacher="" roster={roster} history={history} today={today}
          sessionStart={sessionStart} month={month} days={days} />
      )}
    </>
  );
}

/** The school attendance report as an A4 document (printed under body.print-register). */
function SchoolDoc({ desk, att, today }: { desk: AdminDesk; att: SchoolAttendance; today: string }) {
  const printed = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  return (
    <div className="reg-doc day" aria-hidden="true">
      <header className="rd-head">
        <div>
          <div className="rd-kicker">STUDENT ATTENDANCE REPORT</div>
          <h1>{desk.school.name}</h1>
          <p>As of {new Date(`${today}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })} · AY {desk.session.replace('-', '–')}</p>
        </div>
      </header>
      <div className="rd-stats">
        <div><span>TODAY</span><b>{pctText(att.today.pct)}</b><em>{att.classesMarked}/{att.classes.length} registers</em></div>
        <div><span>THIS MONTH</span><b>{pctText(att.month.pct)}</b></div>
        <div><span>THIS SESSION</span><b>{pctText(att.session.pct)}</b></div>
        <div className={att.under.length ? 'warn' : ''}><span>UNDER {MIN_PCT}%</span><b>{att.under.length}</b><em>students</em></div>
      </div>
      <div className="rd-chart"><b>School attendance, week by week</b><TrendChart points={weeklyPts(att.weeks)} title="School weekly attendance" /></div>
      <table className="rd-table" style={{ marginTop: '4mm' }}>
        <thead><tr><th>Class</th><th className="num">On roll</th><th className="num">Today</th><th className="num">Month</th><th className="num">Session</th><th className="num">Under {MIN_PCT}%</th></tr></thead>
        <tbody>{att.classes.map(c => (
          <tr key={c.cls}><td>{c.cls}</td><td className="num">{c.onRoll}</td><td className="num">{c.today ? pctText(c.today.pct) : 'not marked'}</td>
            <td className={`num ${c.month.pct !== null && c.month.pct < MIN_PCT ? 'low' : ''}`}>{pctText(c.month.pct)}</td>
            <td className={`num ${c.session.pct !== null && c.session.pct < MIN_PCT ? 'low' : ''}`}>{pctText(c.session.pct)}</td><td className="num">{c.under}</td></tr>
        ))}</tbody>
      </table>
      {att.under.length > 0 && (
        <>
          <p className="rd-fine" style={{ marginTop: '5mm', fontSize: '9pt', color: '#002147', fontWeight: 800 }}>Students under {MIN_PCT}% this session</p>
          <table className="rd-table">
            <thead><tr><th>Class</th><th>Roll</th><th>Student</th><th className="num">Session %</th><th className="num">Absent</th><th className="num">Days marked</th></tr></thead>
            <tbody>{att.under.map(u => <tr key={u.id}><td>{u.cls}</td><td>{u.rollNo || '–'}</td><td>{u.name}</td><td className="num low">{pctText(u.session.pct)}</td><td className="num">{u.session.absent}</td><td className="num">{u.session.marked}</td></tr>)}</tbody>
          </table>
        </>
      )}
      <p className="rd-fine">Attendance % = days present or late, of days marked. For internal use: names students (not for circulation outside the school).</p>
      <div className="rd-sign"><div>Prepared by</div><div>Principal</div></div>
      <footer className="rd-foot">Printed {printed} from the school&apos;s live records</footer>
    </div>
  );
}
