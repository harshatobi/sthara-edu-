'use client';

import type { ReportCardSnapshot } from '@/lib/exams/card';
import { RESULT_LABEL } from '@/lib/exams/card';
import { fmtDate } from '@/lib/admin/format';
import PrintFoot from '@/components/ui/PrintFoot';
import '@/styles/exams.css';

/** Prints the report cards on the page (and nothing else), one per A4 sheet. */
export function printCards() {
  document.body.classList.add('print-cards');
  const done = () => { document.body.classList.remove('print-cards'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

const n = (v: number | null) => (v === null ? '' : Number.isInteger(v) ? String(v) : v.toFixed(Math.round(v * 10) === v * 10 ? 1 : 2));

/**
 * A published (or previewed) report card, drawn from its frozen snapshot. The same component is the on-screen card
 * and the printed A4 page; `doc` adds it to what prints under body.print-cards.
 */
export default function ReportCard({ card, doc = true, preview = false }: { card: ReportCardSnapshot; doc?: boolean; preview?: boolean }) {
  const c = card;
  const marks = c.show.marks;
  const accent = c.school.accent || '#002147';
  const termCols = c.terms.map(t => ({ ...t, span: marks ? t.heads.length + 2 : 1 }));
  return (
    <article className={`rc${doc ? ' rc-doc' : ''}`} style={{ ['--rc-accent' as string]: accent }} aria-label={`${c.term.name} report card, ${c.student.name}`}>
      <PrintFoot />
      {preview && <div className="rc-stamp" aria-hidden="true">PREVIEW</div>}
      {c.revised && !preview && <div className="rc-revised">Revised · version {c.version}</div>}
      <header className="rc-head">
        {c.school.logo ? <img className="rc-logo" src={c.school.logo} alt="" /> : <div className="rc-logo rc-mono" aria-hidden="true">{c.school.name.split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(0, 3).map(w => w[0]).join('')}</div>}
        <div className="rc-school">
          <h1>{c.school.name}</h1>
          {c.school.affiliation && <p>{c.school.affiliation}</p>}
          {c.school.address && <p>{c.school.address}</p>}
        </div>
        <div className="rc-title">
          <span>REPORT CARD</span>
          <b>{c.term.name}</b>
          <span>Session {c.session}</span>
        </div>
      </header>

      <dl className="rc-who">
        <div><dt>Student</dt><dd>{c.student.name}</dd></div>
        <div><dt>Class</dt><dd>{c.student.cls}</dd></div>
        <div><dt>Admission no.</dt><dd>{c.student.admissionNo || '—'}</dd></div>
        {c.student.rollNo && <div><dt>Roll no.</dt><dd>{c.student.rollNo}</dd></div>}
      </dl>

      <section>
        <h2>Scholastic areas</h2>
        <div className="rc-tw">
          <table className="rc-t">
            <thead>
              <tr>
                <th rowSpan={2} className="rc-sub">Subject</th>
                {termCols.map(t => <th key={t.id} colSpan={t.span} className="rc-term">{t.name}</th>)}
                {c.showFinal && <th colSpan={2} className="rc-term">Overall</th>}
              </tr>
              <tr>
                {termCols.map(t => marks ? [
                  ...t.heads.map(h => <th key={`${t.id}${h.key}`} className="rc-h">{h.name}{h.weight > 0 ? <small>({n(h.weight)})</small> : <small>(not counted)</small>}</th>),
                  <th key={`${t.id}tot`} className="rc-h rc-tot">Total<small>({n(t.heads.reduce((s, h) => s + h.weight, 0))})</small></th>,
                  <th key={`${t.id}g`} className="rc-h">Grade</th>,
                ] : <th key={`${t.id}g`} className="rc-h">Grade</th>)}
                {c.showFinal && <><th className="rc-h">%</th><th className="rc-h">Grade</th></>}
              </tr>
            </thead>
            <tbody>
              {c.subjects.map(s => (
                <tr key={s.key} className={s.status === 'fail' ? 'rc-fail' : undefined}>
                  <th scope="row" className="rc-sub">{s.name}{c.aggregate && c.subjects.length > c.aggregate.counted && !s.counted && <small> not in best {c.aggregate.counted}</small>}</th>
                  {s.terms.map(t => {
                    const head = c.terms.find(x => x.id === t.termId)!;
                    return marks ? [
                      ...t.cells.map((cell, i) => <td key={`${t.termId}${i}`} className={head.heads[i]?.weight === 0 ? 'rc-muted' : undefined}>{cell.text}</td>),
                      <td key={`${t.termId}tot`} className="rc-tot">{n(t.total)}</td>,
                      <td key={`${t.termId}g`} className="rc-g">{t.grade ?? ''}</td>,
                    ] : <td key={`${t.termId}g`} className="rc-g">{t.grade ?? ''}</td>;
                  })}
                  {c.showFinal && <><td className="rc-tot">{s.final ? n(s.final.pct) : ''}</td><td className="rc-g">{s.final?.grade ?? ''}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(c.aggregate || c.result || c.rank) && (
          <div className="rc-sum">
            {c.aggregate && marks && <div><span>{c.aggregate.counted < c.subjects.length ? `Best ${c.aggregate.counted} subjects` : 'Overall'}</span><b>{n(c.aggregate.pct)}%</b></div>}
            {c.aggregate?.grade && <div><span>Overall grade</span><b>{c.aggregate.grade}</b></div>}
            {c.rank && <div><span>Rank in class</span><b>{c.rank.rank} of {c.rank.of}</b></div>}
            {c.result && <div className={`rc-res rc-${c.result.status}`}><span>Result</span><b>{RESULT_LABEL[c.result.status]}</b>{c.result.toClear.length > 0 && <em>{c.result.status === 'compartment' ? 'Compartment in ' : 'To clear: '}{c.result.toClear.join(', ')}</em>}</div>}
          </div>
        )}
      </section>

      <div className="rc-two">
        {c.coScholastic.length > 0 && (
          <section>
            <h2>Co-scholastic areas</h2>
            <table className="rc-t rc-small">
              <thead><tr><th className="rc-sub">Area</th><th className="rc-h">Grade</th></tr></thead>
              <tbody>{c.coScholastic.map(a => <tr key={a.name}><th scope="row" className="rc-sub">{a.name}</th><td className="rc-g">{a.grade ?? '—'}</td></tr>)}</tbody>
            </table>
            <p className="rc-note">Graded {c.coGrades.join(', ')}{c.coGrades.length === 3 ? ' (A outstanding, B very good, C fair)' : ''}.</p>
          </section>
        )}
        <section>
          {c.attendance && (
            <>
              <h2>Attendance</h2>
              <p className="rc-att"><b>{c.attendance.present}</b> of <b>{c.attendance.workingDays}</b> working days{c.attendance.pct !== null && <> · <b>{c.attendance.pct}%</b></>}</p>
            </>
          )}
          {c.show.tml && c.tml.length > 0 && (
            <>
              <h2>Mastery (Sthara TML)</h2>
              <ul className="rc-tml">
                {c.tml.map(t => <li key={t.subject}><span className="rc-dot" style={{ background: t.color }} aria-hidden="true" />{t.subject}<b>{t.band}</b></li>)}
              </ul>
              <p className="rc-note">How securely the student has learnt each subject so far, from homework, quizzes and tutor work. Not part of the marks.</p>
            </>
          )}
        </section>
      </div>

      <section className="rc-remark">
        <h2>Class teacher&apos;s remark</h2>
        <p>{c.remark || '—'}</p>
      </section>

      <footer className="rc-foot">
        <div className="rc-scale">
          <b>Grading</b> {c.grading.map((g, i) => <span key={g.grade}>{g.grade} {i === 0 ? `${g.min}-100` : `${g.min}-${c.grading[i - 1].min - 1}`}</span>)}
          <span>AB absent · ML medical · EX exempt</span>
        </div>
        <div className="rc-sign">
          {c.school.signatures.map(s => <div key={s}><span />{s}</div>)}
        </div>
        <p className="rc-issued">Issued {fmtDate(c.issuedOn)}{c.version > 1 ? ` · version ${c.version}` : ''} · {c.scheme}</p>
      </footer>
    </article>
  );
}
