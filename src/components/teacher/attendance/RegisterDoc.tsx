'use client';

import { MARKS, MARK_LABEL, MARK_SHORT, MIN_PCT, absentStreak, belowMin, tally, trendDelta, weeklyTrend, type SchoolDay } from '@/lib/attendance/register';
import { TrendChart, weeklyPts } from '@/components/canon/TrendLine';
import type { History } from './useRegister';

export interface DocStudent { id: string; name: string; rollNo: string }

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { ...o, timeZone: 'UTC' });

/**
 * Prints the register document on the page (and only it) as an A4 PDF: the browser's print dialog,
 * "Save as PDF", as the board pack does. The day sheet is portrait, the month sheet landscape.
 */
export function printRegister() {
  document.body.classList.add('print-register');
  const done = () => { document.body.classList.remove('print-register'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  // Let the class land (and charts lay out) before the dialog snapshots the page.
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

/**
 * The register as a document: hidden on screen, the only thing printed under body.print-register.
 * Shows the saved register (what the school's records say), never unsaved edits.
 */
export default function RegisterDoc(p: {
  kind: 'day' | 'month';
  school: string;
  cls: string;
  teacher: string;
  roster: DocStudent[];
  history: History;
  today: string;
  sessionStart: string;
  /** Day sheet: the date. */
  day?: string;
  /** Month sheet: the month (YYYY-MM) and its days. */
  month?: string;
  days?: SchoolDay[];
}) {
  const printedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const classTrend = weeklyTrend(p.roster.map(s => p.history.marks[s.id] || {}), p.sessionStart, p.today);
  const delta = trendDelta(classTrend);

  if (p.kind === 'day' && p.day) {
    const day = p.day;
    const rows = p.roster.map(s => ({ s, m: p.history.marks[s.id]?.[day], note: p.history.notes[s.id]?.[day] || '', session: tally(p.history.marks[s.id] || {}) }));
    const counts = MARKS.map(k => ({ k, n: rows.filter(r => r.m === k).length }));
    const unmarked = rows.filter(r => !r.m).length;
    const inSchool = counts[0].n + counts[2].n;
    return (
      <div className="reg-doc day" aria-hidden="true">
        <header className="rd-head">
          <div>
            <div className="rd-kicker">DAILY ATTENDANCE REGISTER</div>
            <h1>{p.cls}</h1>
            <p>{fmt(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="rd-school"><b>{p.school}</b><span>Class teacher: {p.teacher || '________________'}</span></div>
        </header>
        <div className="rd-stats">
          <div><span>ON ROLL</span><b>{rows.length}</b></div>
          <div><span>IN SCHOOL</span><b>{inSchool}</b><em>{rows.length ? Math.round((inSchool / rows.length) * 100) : 0}%</em></div>
          {counts.slice(1).map(c => <div key={c.k}><span>{MARK_LABEL[c.k].toUpperCase()}</span><b>{c.n}</b></div>)}
          {unmarked > 0 && <div className="warn"><span>NOT MARKED</span><b>{unmarked}</b></div>}
        </div>
        <table className="rd-table">
          <thead><tr><th>Roll</th><th>Student</th><th>Status</th><th>Note</th><th className="num">Session %</th></tr></thead>
          <tbody>
            {rows.map(({ s, m, note, session }) => (
              <tr key={s.id} className={m || 'none'}>
                <td>{s.rollNo || '–'}</td>
                <td>{s.name}</td>
                <td><span className={`rd-mk ${m || 'none'}`}>{m ? `${MARK_SHORT[m]} · ${MARK_LABEL[m]}` : 'Not marked'}</span></td>
                <td className="note">{note}</td>
                <td className={`num ${belowMin(session) ? 'low' : ''}`}>{session.pct ?? '—'}{belowMin(session) ? ' ▼' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="rd-fine">Session % = days present or late, of days marked since {fmt(p.sessionStart, { day: 'numeric', month: 'short', year: 'numeric' })}. ▼ marks a student under {MIN_PCT}%, the CBSE minimum for board exams.</p>
        <div className="rd-sign"><div>Class teacher</div><div>Principal</div></div>
        <footer className="rd-foot">Printed {printedAt} from the school&apos;s live records</footer>
      </div>
    );
  }

  if (p.kind === 'month' && p.month && p.days) {
    const days = p.days;
    const open = days.filter(d => !d.off && d.date <= p.today).map(d => d.date);
    const rows = p.roster.map(s => {
      const h = p.history.marks[s.id] || {};
      return { s, h, t: tally(h, open), session: tally(h) };
    });
    const tot = rows.reduce((a, r) => ({ in: a.in + r.t.present + r.t.late, all: a.all + r.t.marked }), { in: 0, all: 0 });
    const watch = rows.filter(r => belowMin(r.session) || absentStreak(r.h, p.today) >= 3);
    const monthName = fmt(`${p.month}-01`, { month: 'long', year: 'numeric' });
    return (
      <div className="reg-doc month" aria-hidden="true">
        <header className="rd-head">
          <div>
            <div className="rd-kicker">MONTHLY ATTENDANCE REGISTER</div>
            <h1>{p.cls} · {monthName}</h1>
            <p>{open.length} school days · {days.filter(d => d.off?.why === 'holiday').length} holidays · class attendance {tot.all ? `${Math.round((tot.in / tot.all) * 100)}%` : '—'}{delta !== null ? ` · ${delta > 0 ? '+' : ''}${delta} pts over the last 3 weeks` : ''}</p>
          </div>
          <div className="rd-school"><b>{p.school}</b><span>Class teacher: {p.teacher || '________________'}</span></div>
        </header>
        <table className="rd-sheet">
          <thead>
            <tr>
              <th>Roll</th><th className="nm">Student</th>
              {days.map(d => <th key={d.date} className={d.off ? 'off' : ''}><span>{fmt(d.date, { weekday: 'narrow' })}</span>{Number(d.date.slice(8))}</th>)}
              <th className="t">P</th><th className="t">L</th><th className="t">A</th><th className="t">E</th><th className="t">%</th><th className="t">Sess.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, h, t, session }) => (
              <tr key={s.id}>
                <td>{s.rollNo || '–'}</td><td className="nm">{s.name}</td>
                {days.map(d => <td key={d.date} className={d.off ? 'off' : h[d.date] || ''}>{d.off ? (d.off.why === 'holiday' ? 'H' : '') : h[d.date] ? MARK_SHORT[h[d.date]] : ''}</td>)}
                <td className="t">{t.present}</td><td className="t">{t.late}</td><td className="t">{t.absent}</td><td className="t">{t.excused}</td>
                <td className={`t ${belowMin(t) ? 'low' : ''}`}>{t.pct ?? '—'}</td>
                <td className={`t ${belowMin(session) ? 'low' : ''}`}>{session.pct ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rd-month-foot">
          <div className="rd-chart">
            <b>Class attendance, week by week (this session)</b>
            <TrendChart points={weeklyPts(classTrend)} title={`${p.cls} weekly attendance`} />
          </div>
          <div className="rd-watch">
            <b>Needs a conversation</b>
            {!watch.length ? <p>No student is under {MIN_PCT}% or absent three days running.</p> : (
              <ul>{watch.map(({ s, h, session }) => (
                <li key={s.id}>{s.rollNo ? `${s.rollNo}. ` : ''}{s.name}: {session.pct ?? '—'}% this session{absentStreak(h, p.today) >= 3 ? `, absent ${absentStreak(h, p.today)} days running` : ''}</li>
              ))}</ul>
            )}
            <p className="rd-fine">P present · L late · A absent · E excused · H holiday. % = present or late, of days marked.</p>
          </div>
        </div>
        <div className="rd-sign"><div>Class teacher</div><div>Principal</div></div>
        <footer className="rd-foot">Printed {printedAt} from the school&apos;s live records</footer>
      </div>
    );
  }
  return null;
}
