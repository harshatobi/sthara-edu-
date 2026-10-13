'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { FilePdfIcon as FilePdf } from '@phosphor-icons/react/dist/ssr/FilePdf';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { AT_RISK, BANDS, bandOf, LEAVE_TYPES, subjectName, type AdminDesk, type TeacherRow } from '@/lib/admin/desk';
import { PAY_MODES } from '@/lib/admin/fees';
import { STAGE_LABEL, STAGE_COLOR, STAGE_ONE } from '@/lib/admin/admissions';
import { boardPackRows } from '@/lib/admin/boardPack';
import { fmtDate, inr, inrShort, isoDay, pct, plural } from '@/lib/admin/format';
import { probe } from '@/lib/admin/probe';
import { DeskGate, PageSkeleton, downloadCsv } from './kit';
import { useSchoolAttendance } from './AttendanceAdmin';
import { TrendChart, weeklyPts } from '@/components/canon/TrendLine';
import { MIN_PCT } from '@/lib/attendance/register';

/**
 * The board pack as a designed A4 document (five pages), printed to PDF from
 * the browser. Everything is aggregate: it's meant to leave the school, so no
 * student is named (DPDP, minors' data). Staff appear by name on the
 * workforce page, as they would in any board paper.
 */
export default function BoardPack() {
  return <DeskGate need="boardpack.view" skeleton={<PageSkeleton />}>{desk => <Pack desk={desk} />}</DeskGate>;
}

const PAGES = 5;
/** One colour scale for the whole pack: the TML specification's mastery bands, matching the key on page 2. */
const hmColor = (v: number) => BANDS.find(b => b.key === bandOf(v))!.color;
/** Rows that fit on page 5; the spreadsheet carries everyone. */
/** What fits beside the trend chart on the attendance page (one A4 sheet, nothing clipped); the spreadsheet carries the rest. */
const CLASS_ROWS = 10;
const GRADE_ROWS = 10;
const TEACHER_ROWS = 12;
const concern = (t: TeacherRow) => (t.activity === 'none' ? 0 : 1) * 1000 + (t.delta ?? 0) * 10 - t.backlog;

function Page({ n, desk, children, cover }: { n: number; desk: AdminDesk; children: ReactNode; cover?: boolean }) {
  return (
    <section className={`bp-page${cover ? ' bp-cover' : ''}`} aria-label={`Page ${n} of ${PAGES}`}>
      {children}
      <footer className="bp-foot">
        <div className="bp-powered" aria-hidden="true"><span>Powered by <b>Sthara</b> · The Institutional OS</span></div>
        <div className="bp-meta">
          <span>{desk.school.name} · Board pack · AY {desk.session.replace('-', '–')}</span>
          <span>Page {n} of {PAGES}</span>
        </div>
      </footer>
    </section>
  );
}

function Head({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <header className="bp-head">
      <div className="bp-kicker">{kicker}</div>
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </header>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: string }) {
  return (
    <div className="bp-stat">
      <div className="bp-lb">{label}</div>
      <div className="bp-vl" style={{ color: tone }}>{value}</div>
      {note && <div className="bp-nt">{note}</div>}
    </div>
  );
}

function Meter({ value, color }: { value: number; color?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return <div className="bp-bar"><i style={{ width: `${v}%`, background: color || hmColor(v) }} /></div>;
}

const Nothing = ({ children }: { children: ReactNode }) => <p className="bp-none">{children}</p>;

function Pack({ desk }: { desk: AdminDesk }) {
  const { att } = useSchoolAttendance(desk);
  const { academics: ac, fees, workforce: wf, wellness: wl, admissions: adm, compliance: co } = desk;
  const L = fees.totals;
  const today = isoDay();
  const evidence = pct(ac.evidenced, desk.students.length);
  const delta = ac.schoolTml !== null && ac.schoolTmlBefore !== null ? ac.schoolTml - ac.schoolTmlBefore : null;
  // Board copy never names a student: swap the at-risk detail (which lists names on the dashboard) for a count.
  // Titles and summaries only: evidence can name students and applicants, which a board pack must not.
  // The cover fits five items on one A4 sheet; the rest are counted, and live in Probe.
  const allFindings = probe(desk).findings;
  const moreFindings = Math.max(0, allFindings.length - 5);
  const items = allFindings.slice(0, 5).map(f => ({ key: f.key, title: f.title, detail: f.summary, tone: f.level === 'critical' || f.level === 'high' ? 'r' : f.level === 'medium' ? 'a' : 'n' }));
  const approvedDays = wf.leave.filter(l => l.status === 'approved').reduce((n, l) => n + l.days, 0);
  const confTotal = ac.confidence.firm + ac.confidence.provisional + ac.confidence.insufficient;
  const bandTotal = ac.bands.reduce((n, b) => n + b.count, 0) + ac.noEvidence;

  return (
    <div className="bp">
      <div className="bp-bar-top no-print">
        <Link className="btn" href="/admin"><ArrowLeft size={15} weight="bold" /> Command Centre</Link>
        <div style={{ flex: 1 }} className="muted">Board pack · {PAGES} pages · A4. Use &ldquo;Save as PDF&rdquo; in the print dialog.</div>
        <button className="btn" onClick={() => downloadCsv(`${desk.school.name.replace(/\W+/g, '-')}-board-pack-${today}.csv`, boardPackRows(desk, att))}>
          <DownloadSimple size={16} /> Spreadsheet
        </button>
        <button className="btn pri" onClick={() => window.print()}><FilePdf size={16} weight="bold" /> Download PDF</button>
      </div>

      {/* ── 1. Cover ───────────────────────────────────────────────── */}
      <Page n={1} desk={desk} cover>
        <div className="bp-hero">
          <div className="bp-brand">Sthara<i>COMMAND CENTRE</i></div>
          <div className="bp-hero-body">
            <div className="bp-kicker light">BOARD PACK · ACADEMIC YEAR {desk.session.replace('-', '–')}</div>
            <h1>{desk.school.name}</h1>
            <p>Prepared {fmtDate(today)} from the school&apos;s live records. Figures are as at the time of printing.</p>
          </div>
        </div>
        <div className="bp-body">
          <h3 className="bp-h3">At a glance</h3>
          <div className="bp-grid3">
            <Stat label="STUDENTS ON ROLL" value={desk.students.length} note={`${plural(ac.sections.length, 'section')} · ${plural(ac.grades.length, 'grade')}`} />
            <Stat label="SCHOOL-WIDE TML" value={ac.schoolTml !== null ? `${ac.schoolTml}%` : '—'} tone={ac.schoolTml !== null ? hmColor(ac.schoolTml) : undefined}
              note={delta !== null ? `${delta >= 0 ? 'Up' : 'Down'} ${Math.abs(delta)} pts in a fortnight` : 'No earlier figure to compare'} />
            <Stat label="EVIDENCE COVERAGE" value={evidence !== null ? `${evidence}%` : '—'} note={`${ac.evidenced} of ${desk.students.length} with graded work`} />
            <Stat label="FEE COLLECTION" value={L.collectionRate !== null ? `${Math.round(L.collectionRate)}%` : '—'}
              note={L.billed ? `${inrShort(L.collected)} of ${inrShort(L.billed)} billed` : 'Nothing billed yet'} />
            <Stat label="ATTENDANCE THIS SESSION" value={att?.session.pct != null ? `${att.session.pct}%` : '—'} tone={att?.session.pct != null && att.session.pct < MIN_PCT ? '#B4123C' : undefined}
              note={att ? (att.any ? `${att.underCount} ${att.underCount === 1 ? 'student' : 'students'} under ${MIN_PCT}%` : 'No registers marked yet') : 'Loading'} />
            <Stat label="COMPLIANCE ITEMS OPEN" value={co.flags.length} tone={co.flags.length ? '#B45309' : '#0B7A54'} note={co.flags.length ? 'DPDP, see page 5' : 'None'} />
          </div>

          <h3 className="bp-h3">For the board&apos;s attention</h3>
          {items.length ? (
            <ol className="bp-list">
              {items.map(d => (
                <li key={d.key}>
                  <span className={`bp-dot ${d.tone}`} aria-hidden="true" />
                  <div><b>{d.title}</b><p>{d.detail}</p></div>
                </li>
              ))}
            </ol>
          ) : <Nothing>Nothing currently needs a decision.</Nothing>}
          {moreFindings > 0 && <p className="bp-foot-note">And {moreFindings} more in Probe, in the Command Centre.</p>}
        </div>
      </Page>

      {/* ── 2. Academic health ────────────────────────────────────── */}
      <Page n={2} desk={desk}>
        <Head kicker="ACADEMIC HEALTH" title="How well students are learning"
          sub={`True Mastery Level (TML) combines graded homework, timed quizzes and AI-tutor depth. ${ac.evidenced} of ${desk.students.length} students have graded work behind their score.`} />
        <div className="bp-grid3">
          <Stat label="SCHOOL-WIDE TML" value={ac.schoolTml !== null ? `${ac.schoolTml}%` : '—'} tone={ac.schoolTml !== null ? hmColor(ac.schoolTml) : undefined}
            note={ac.schoolTmlBefore !== null ? `${ac.schoolTmlBefore}% a fortnight ago` : 'First fortnight of evidence'} />
          <Stat label={`BELOW ${AT_RISK}% TML`} value={ac.atRisk.length} tone={ac.atRisk.length ? '#B4123C' : '#0B7A54'} note="Flagged to class teachers" />
          <Stat label="FIRM SCORES" value={confTotal ? `${Math.round((ac.confidence.firm / confTotal) * 100)}%` : '—'} note="Topic scores with 5+ pieces of evidence" />
        </div>

        <div className="bp-cols">
          <div>
            <h3 className="bp-h3">TML by grade</h3>
            {ac.grades.length ? ac.grades.map(g => (
              <div className="bp-row" key={g.grade}>
                <b className="w80">Grade {g.grade}</b>
                {g.tml !== null ? <Meter value={g.tml} /> : <div className="bp-bar" />}
                <b className="w44 r" style={{ color: g.tml !== null ? hmColor(g.tml) : '#94A3B8' }}>{g.tml !== null ? `${g.tml}%` : '—'}</b>
                <span className="w50 r mut">{g.evidenced}/{g.students}</span>
              </div>
            )) : <Nothing>No students on roll.</Nothing>}
          </div>
          <div>
            <h3 className="bp-h3">Mastery bands</h3>
            {bandTotal ? (
              <>
                <div className="bp-stack" role="img" aria-label="Students by mastery band">
                  {BANDS.map(b => {
                    const n = ac.bands.find(x => x.key === b.key)?.count ?? 0;
                    return n ? <i key={b.key} style={{ width: `${(n / bandTotal) * 100}%`, background: b.color }} /> : null;
                  })}
                  {ac.noEvidence ? <i style={{ width: `${(ac.noEvidence / bandTotal) * 100}%`, background: '#E2E8F0' }} /> : null}
                </div>
                {BANDS.map(b => (
                  <div className="bp-key" key={b.key}><i style={{ background: b.color }} />{b.label} <span className="mut">{b.range}</span><b>{ac.bands.find(x => x.key === b.key)?.count ?? 0}</b></div>
                ))}
                <div className="bp-key"><i style={{ background: '#E2E8F0' }} />No graded evidence yet<b>{ac.noEvidence}</b></div>
              </>
            ) : <Nothing>No students on roll.</Nothing>}
          </div>
        </div>

        <h3 className="bp-h3">Grade × subject</h3>
        {ac.subjects.length ? (
          <table className="bp-heat">
            <thead><tr><th />{ac.subjects.map(s => <th key={s}>{subjectName(s)}</th>)}</tr></thead>
            <tbody>{ac.grades.map(g => (
              <tr key={g.grade}>
                <td className="nm">Grade {g.grade}</td>
                {ac.subjects.map(s => {
                  const c = ac.matrix.find(m => m.grade === g.grade && m.subject === s);
                  return <td key={s} className={c?.tml == null ? 'na' : undefined} style={{ background: c?.tml != null ? hmColor(c.tml) : undefined }}>
                    {c?.tml != null ? <>{c.tml}<small> n={c.n}</small></> : '—'}
                  </td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        ) : <Nothing>No graded evidence yet. The grid fills as teachers confirm grades.</Nothing>}
        <p className="bp-foot-note">
          {ac.weakest
            ? `Weakest cell with two or more students: Grade ${ac.weakest.grade} ${subjectName(ac.weakest.subject)} at ${ac.weakest.tml}%.`
            : 'No cell yet has graded work from two or more students, so no weak spot is singled out.'}
          {' '}n is the number of students with evidence in that cell.
        </p>
      </Page>

      {/* ── 3. Attendance ─────────────────────────────────────────── */}
      <Page n={3} desk={desk}>
        <Head kicker="ATTENDANCE" title="Who is in school"
          sub={`From the class registers. Attendance % is days present or late, of days marked. CBSE expects ${MIN_PCT}% for a student to sit the board exams.`} />
        {!att ? <Nothing>Loading attendance…</Nothing> : !att.any ? <Nothing>No class register has been marked yet this session.</Nothing> : (
          <>
            <div className="bp-grid4">
              <Stat label="THIS SESSION" value={att.session.pct !== null ? `${att.session.pct}%` : '—'} tone={att.session.pct !== null && att.session.pct < MIN_PCT ? '#B4123C' : undefined} note={`${att.session.marked.toLocaleString('en-IN')} marks`} />
              <Stat label="THIS MONTH" value={att.month.pct !== null ? `${att.month.pct}%` : '—'} note={`${att.month.absent} absences, ${att.month.late} late`} />
              <Stat label="REGISTERS TODAY" value={`${att.classesMarked}/${att.classes.length}`} tone={att.classesMarked < att.classes.length ? '#B45309' : '#0B7A54'} note={att.today.pct !== null ? `${att.today.pct}% in school` : 'None marked yet'} />
              <Stat label={`UNDER ${MIN_PCT}%`} value={att.underCount} tone={att.underCount ? '#B4123C' : '#0B7A54'} note="Students, this session" />
            </div>
            <h3 className="bp-h3">Week by week</h3>
            <div className="bp-trend"><TrendChart points={weeklyPts(att.weeks)} title="School weekly attendance this session" /></div>
            <div className="bp-cols">
              <div>
                <h3 className="bp-h3">By grade</h3>
                {att.grades.slice(0, GRADE_ROWS).map(g => (
                  <div className="bp-row" key={g.grade}>
                    <b className="w80">Grade {g.grade}</b>
                    {g.session.pct !== null ? <Meter value={g.session.pct} color={g.session.pct < MIN_PCT ? '#E11D48' : '#2F6BFF'} /> : <div className="bp-bar" />}
                    <b className="w44 r">{g.session.pct !== null ? `${g.session.pct}%` : '—'}</b>
                  </div>
                ))}
                {att.grades.length > GRADE_ROWS && <p className="bp-foot-note">Grades {att.grades[0].grade} to {att.grades[GRADE_ROWS - 1].grade} shown; the spreadsheet has all {att.grades.length}.</p>}
              </div>
              <div>
                <h3 className="bp-h3">Lowest attendance</h3>
                <table className="bp-tbl">
                  <thead><tr><th>Class</th><th className="r">Month</th><th className="r">Session</th><th className="r">Under {MIN_PCT}%</th></tr></thead>
                  <tbody>{[...att.classes].sort((a, b) => (a.session.pct ?? 101) - (b.session.pct ?? 101)).slice(0, CLASS_ROWS).map(c => (
                    <tr key={c.cls}><td>{c.cls}</td><td className="r">{c.month.pct !== null ? `${c.month.pct}%` : '—'}</td>
                      <td className="r" style={{ color: c.session.pct !== null && c.session.pct < MIN_PCT ? '#B4123C' : undefined }}>{c.session.pct !== null ? `${c.session.pct}%` : '—'}</td><td className="r">{c.under}</td></tr>
                  ))}</tbody>
                </table>
                {att.classes.length > CLASS_ROWS && <p className="bp-foot-note">The {CLASS_ROWS} lowest of {att.classes.length} classes; the spreadsheet lists every class.</p>}
              </div>
            </div>
          </>
        )}
      </Page>

      {/* ── 4. Finance & admissions ───────────────────────────────── */}
      <Page n={4} desk={desk}>
        <Head kicker="FINANCE & ADMISSIONS" title="Fees and the next intake"
          sub={`Fee ledger for AY ${desk.session.replace('-', '–')}, reconciled to issued receipts. Admissions pipeline for AY ${adm.session.replace('-', '–')}.`} />
        <div className="bp-grid4">
          <Stat label="BILLED" value={inrShort(L.billed)} note={fees.structures.length ? `${inrShort(L.expectedAnnual)} expected for the year` : 'Fee structures not set'} />
          <Stat label="COLLECTED" value={inrShort(L.collected)} tone={L.collected > 0 ? '#0B7A54' : undefined} note={L.collectionRate !== null ? `${L.collectionRate}% of billed` : '—'} />
          <Stat label="OUTSTANDING" value={inrShort(L.outstanding)} note={L.overdue ? `${inrShort(L.overdue)} overdue` : 'Nothing overdue'} tone={L.overdue ? '#B4123C' : undefined} />
          <Stat label="AVG DAYS LATE" value={L.avgDaysLate ?? '—'} note="On settled invoices" />
        </div>

        <div className="bp-cols">
          <div>
            <h3 className="bp-h3">Ageing of open balances</h3>
            {L.outstanding > 0 ? (
              <table className="bp-tbl">
                <thead><tr><th>Days past due</th><th className="r">Families</th><th className="r">Amount</th></tr></thead>
                <tbody>{fees.ageing.map(b => <tr key={b.key}><td>{b.label}</td><td className="r">{b.families}</td><td className="r">{inr(b.amount)}</td></tr>)}</tbody>
              </table>
            ) : <Nothing>No open balances.</Nothing>}
            <h3 className="bp-h3">Collections by mode</h3>
            {fees.byMode.length ? (
              <table className="bp-tbl">
                <tbody>{fees.byMode.map(m => <tr key={m.mode}><td>{PAY_MODES[m.mode] || m.mode}</td><td className="r">{plural(m.count, 'receipt')}</td><td className="r">{inr(m.amount)}</td></tr>)}</tbody>
              </table>
            ) : <Nothing>No receipts issued yet.</Nothing>}
          </div>
          <div>
            <h3 className="bp-h3">Fee structure</h3>
            {fees.grades.length ? (
              <table className="bp-tbl">
                <thead><tr><th>Grade</th><th className="r">Students</th><th className="r">Annual fee</th><th className="r">Instalments</th></tr></thead>
                <tbody>{fees.grades.map(g => (
                  <tr key={g.grade}><td>Grade {g.grade}</td><td className="r">{g.students}</td><td className="r">{g.structure ? inr(g.structure.annualFee) : 'Not set'}</td><td className="r">{g.structure?.schedule.length ?? '—'}</td></tr>
                ))}</tbody>
              </table>
            ) : <Nothing>No grades on roll.</Nothing>}
          </div>
        </div>

        <h3 className="bp-h3">Admissions funnel · AY {adm.session.replace('-', '–')}</h3>
        {adm.total ? (
          <>
            {adm.funnel.map((f, i) => (
              <div className="bp-row" key={f.stage}>
                <b className="w150">{STAGE_LABEL[f.stage]}</b>
                <Meter value={f.share ?? 0} color={STAGE_COLOR[f.stage]} />
                <b className="w44 r">{f.reached}</b>
                <span className="w80 r mut">{i && f.fromPrev !== null ? `${f.fromPrev}% moved on` : ''}</span>
              </div>
            ))}
            <p className="bp-foot-note">
              {adm.enrolled} enrolled of {adm.total} applicants{adm.conversion !== null ? `; ${adm.conversion}% of decided applicants enrolled` : ''}.
              {adm.leak ? ` Largest drop: ${STAGE_ONE[adm.leak.from].toLowerCase()} to ${STAGE_ONE[adm.leak.to].toLowerCase()} (${adm.leak.rate}% move on).` : ''}
            </p>
          </>
        ) : <Nothing>No applicants recorded for the next intake yet.</Nothing>}
      </Page>

      {/* ── 5. People & compliance ────────────────────────────────── */}
      <Page n={5} desk={desk}>
        <Head kicker="PEOPLE & COMPLIANCE" title="Staff, wellbeing and data protection"
          sub="Teaching activity is measured from the work teachers do in Sthara. Wellbeing is shown only as anonymised aggregates." />
        <h3 className="bp-h3">Teaching staff</h3>
        {wf.teachers.length ? (
          <table className="bp-tbl">
            <thead><tr><th>Teacher</th><th>Teaches</th><th className="r">Students</th><th className="r">Class TML</th><th className="r">Fortnight</th><th className="r">To grade</th><th className="r">Activity (30d)</th></tr></thead>
            <tbody>{[...wf.teachers].sort((a, b) => concern(a) - concern(b)).slice(0, TEACHER_ROWS).map(t => (
              <tr key={t.id}>
                <td><b>{t.name}</b></td>
                <td>{t.classes.join(', ') || '—'}</td>
                <td className="r">{t.students}</td>
                <td className="r" style={{ color: t.tml !== null ? hmColor(t.tml) : undefined, fontWeight: 700 }}>{t.tml !== null ? `${t.tml}%` : '—'}</td>
                <td className="r">{t.delta !== null ? `${t.delta > 0 ? '+' : ''}${t.delta}` : '—'}</td>
                <td className="r">{t.backlog}</td>
                <td className="r">{t.activity === 'high' ? 'High' : t.activity === 'medium' ? 'Some' : 'None'}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <Nothing>No teachers on record.</Nothing>}
        <p className="bp-foot-note">
          {wf.teachers.length > TEACHER_ROWS ? `Showing the ${TEACHER_ROWS} teachers most needing attention of ${wf.teachers.length}; the spreadsheet lists everyone. ` : ''}
          Leave this session: {plural(approvedDays, 'day')} approved, {plural(wf.pendingLeave.length, 'request')} pending
          {wf.leave.length ? ` (${[...new Set(wf.leave.map(l => LEAVE_TYPES[l.type]?.toLowerCase()).filter(Boolean))].join(', ')})` : ''}.
        </p>

        <div className="bp-cols">
          <div>
            <h3 className="bp-h3">Student wellbeing</h3>
            <div className="bp-grid2">
              <Stat label="CHECKING IN" value={wl.participation !== null ? `${Math.min(100, wl.participation)}%` : '—'} note={`${wl.students} of ${desk.students.length} students`} />
              <Stat label="AVERAGE ENERGY" value={wl.energy !== null ? `${wl.energy}%` : '—'} note={wl.energy !== null ? `${wl.lowShare}% of check-ins low` : 'Hidden below 5 students'} />
            </div>
            <p className="bp-foot-note">CBSE wellness report: {desk.filing.status === 'filed' ? `filed ${fmtDate(desk.filing.filedAt)}` : desk.filing.dueOn ? `draft, due ${fmtDate(desk.filing.dueOn)}` : 'draft'}.</p>
          </div>
          <div>
            <h3 className="bp-h3">Parental consent (DPDP)</h3>
            {co.consents.map(c => (
              <div className="bp-row" key={c.type}>
                <span className="w150">{c.label}</span>
                <Meter value={c.coverage ?? 0} color={(c.coverage ?? 0) >= 100 ? '#10B981' : (c.coverage ?? 0) >= 60 ? '#F5B60B' : '#E11D48'} />
                <b className="w44 r">{c.coverage ?? 0}%</b>
              </div>
            ))}
            <p className="bp-foot-note">{co.guardianCoverage ?? 0}% of students have a verified parent linked. Data is stored in India (Mumbai).</p>
          </div>
        </div>

        <h3 className="bp-h3">Open compliance items</h3>
        {co.flags.length ? (
          <ol className="bp-list compact">
            {co.flags.map(f => <li key={f.key}><span className={`bp-dot ${f.tone}`} aria-hidden="true" /><div><b>{f.title}</b><p>{f.detail}</p></div></li>)}
          </ol>
        ) : <Nothing>None.</Nothing>}
      </Page>
    </div>
  );
}
