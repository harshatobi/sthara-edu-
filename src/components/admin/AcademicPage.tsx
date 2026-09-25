'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { Bar, Chip, Empty, PageBar, hmColor } from '@/components/canon/ui';
import { AT_RISK, BANDS, subjectName, type AdminDesk, type AStudent } from '@/lib/admin/desk';
import { ago, isoDay, plural } from '@/lib/admin/format';
import { CardHead, DeskGate, Workspace, downloadCsv } from './kit';

export default function AcademicPage() {
  return <DeskGate need="academics.read">{desk => <Academic desk={desk} />}</DeskGate>;
}

function weakestSubject(s: AStudent) {
  const e = Object.entries(s.tml).sort((a, b) => a[1] - b[1])[0];
  return e ? `${subjectName(e[0])} ${e[1]}%` : '—';
}

function Academic({ desk }: { desk: AdminDesk }) {
  const router = useRouter();
  const params = useSearchParams();
  const ac = desk.academics;
  const grade = params.get('grade') ? Number(params.get('grade')) : null;
  const subject = params.get('subject');
  const drill = grade !== null && subject ? ac.matrix.find(c => c.grade === grade && c.subject === subject) ?? null : null;
  const focusGrade = grade !== null && !subject ? grade : null;
  const conf = ac.confidence;
  const confTotal = conf.firm + conf.provisional + conf.insufficient;

  const exportCsv = () => downloadCsv(`academic-health-${isoDay()}.csv`, [
    ['Student', 'Class', 'Overall TML (%)', 'TML 14 days ago (%)', ...ac.subjects.map(s => `${subjectName(s)} (%)`)],
    ...desk.students.map(s => [s.name, s.cls, s.overall, s.overallBefore, ...ac.subjects.map(k => s.tml[k] ?? null)]),
  ]);

  return (
    <>
      <PageBar eyebrow="ACADEMIC HEALTH" title="Whole-school view"
        sub={`Live TML across ${plural(desk.students.length, 'student')} · ${ac.lastComputedAt ? `last recomputed ${ago(ac.lastComputedAt)}` : 'no scores computed yet'}`}
        actions={<>
          <button className="btn" onClick={exportCsv}><DownloadSimple size={16} /> Export</button>
          <button className="btn pri" onClick={() => window.print()}><Printer size={16} /> Print board report</button>
        </>} />

      <div className="g2" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px', alignItems: 'start' }}>
        <div className="card">
          <CardHead title="Grade × subject TML" sub="The whole school on one screen. Pick a cell to see its sections. Grey cells have no graded evidence yet." />
          {ac.matrix.length && ac.subjects.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="hm">
                <thead><tr><th />{ac.subjects.map(s => <th key={s} style={{ textAlign: 'center' }}>{subjectName(s)}</th>)}</tr></thead>
                <tbody>{ac.grades.map(g => (
                  <tr key={g.grade} style={focusGrade === g.grade ? { outline: '2px solid var(--blue)', outlineOffset: 2, borderRadius: 8 } : undefined}>
                    <td className="nm">Grade {g.grade}</td>
                    {ac.subjects.map(s => {
                      const c = ac.matrix.find(m => m.grade === g.grade && m.subject === s)!;
                      return (
                        <td key={s} className={`cell${c.tml === null ? ' na' : ''}`} style={{ background: c.tml !== null ? hmColor(c.tml) : undefined, cursor: c.tml !== null ? 'pointer' : 'default' }}
                          title={c.tml !== null ? `${plural(c.n, 'student')} with evidence` : 'No evidence yet'}
                          onClick={() => c.tml !== null && router.replace(`/admin/academic?grade=${g.grade}&subject=${encodeURIComponent(s)}`, { scroll: false })}>
                          {c.tml !== null ? c.tml : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <Empty icon={<ChartLineUp size={26} weight="duotone" />} title="No graded evidence yet">
              Cells fill in as teachers confirm homework and quiz grades. Each cell is the mean of its students&apos; TML in that subject.
            </Empty>
          )}
          {ac.weakest && (
            <div className="note" style={{ marginTop: 20 }}>
              <b>Grade {ac.weakest.grade} {subjectName(ac.weakest.subject)} at {ac.weakest.tml}%</b> is the lowest cell with enough evidence to act on
              ({plural(ac.weakest.n, 'student')}).
              {(() => {
                const others = ac.matrix.filter(m => m.grade === ac.weakest!.grade && m.subject !== ac.weakest!.subject && m.tml !== null);
                if (!others.length) return null;
                const lo = Math.min(...others.map(m => m.tml!));
                return lo >= ac.weakest!.tml! + 7
                  ? ` Every other Grade ${ac.weakest!.grade} subject is at ${lo}% or above, so this is a subject problem, not a cohort one.`
                  : ` Other Grade ${ac.weakest!.grade} subjects are close behind, so look at the cohort as well as the subject.`;
              })()}
            </div>
          )}
        </div>

        <div>
          <div className="card" style={{ marginBottom: 18 }}>
            <CardHead title="Distribution" sub="Students by overall TML, in the TML specification's mastery bands." />
            {BANDS.map(b => {
              const n = ac.bands.find(x => x.key === b.key)?.count ?? 0;
              return (
                <div key={b.key} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}><span>{b.label} <span className="muted" style={{ fontWeight: 500 }}>{b.range}</span></span><b className="num">{n}</b></div>
                  <Bar value={desk.students.length ? (n / desk.students.length) * 100 : 0} color={b.color} />
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--mut)', marginTop: 4 }}><span>No graded evidence yet</span><b className="num">{ac.noEvidence}</b></div>
          </div>
          <div className="card">
            <CardHead title="How sure are these numbers?" sub="Each student-topic score carries a confidence band from how much evidence is behind it." />
            {confTotal ? (
              <>
                {([['firm', 'Firm', '5 or more pieces of evidence', '#10B981'], ['provisional', 'Provisional', '2 to 4, give or take 8 points', '#F5B60B'], ['insufficient', 'Too little to judge', 'fewer than 2', '#CBD5E1']] as const).map(([k, l, d, c]) => (
                  <div key={k} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}><span>{l} <span className="muted" style={{ fontWeight: 500 }}>{d}</span></span><b className="num">{conf[k]}</b></div>
                    <Bar value={(conf[k] / confTotal) * 100} color={c} />
                  </div>
                ))}
                {conf.firm / confTotal < 0.5 && <div className="note" style={{ marginTop: 6 }}>Most scores are still provisional. More graded homework and quizzes per topic firm them up.</div>}
              </>
            ) : <p className="muted" style={{ fontSize: 13.5 }}>Appears once TML has been computed for any student.</p>}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <CardHead title="Sections" sub="Each class section, its overall TML and how many of its students have graded evidence." />
        {ac.sections.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Section</th><th className="c">Students</th><th className="c">With evidence</th><th className="c">TML</th><th className="c">Below {AT_RISK}%</th>{ac.subjects.map(s => <th key={s} className="c">{subjectName(s)}</th>)}</tr></thead>
              <tbody>{ac.sections.map(s => (
                <tr key={s.cls} className={focusGrade !== null && s.grade === focusGrade ? 'sel' : undefined}>
                  <td><b>{s.cls}</b></td>
                  <td className="c num">{s.students}</td>
                  <td className="c num">{s.evidenced}</td>
                  <td className="c">{s.tml !== null ? <b style={{ color: hmColor(s.tml) }}>{s.tml}%</b> : <span className="muted">—</span>}</td>
                  <td className="c num" style={{ color: s.atRisk ? 'var(--red)' : undefined }}>{s.atRisk}</td>
                  {ac.subjects.map(k => {
                    const v = s.bySubject[k];
                    return <td key={k} className="c num" style={{ color: v?.tml !== null && v?.tml !== undefined ? hmColor(v.tml) : 'var(--mut2)', fontWeight: 700 }}>{v?.tml ?? '—'}</td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted">No students on roll yet.</p>}
      </div>

      <div className="card" id="at-risk" style={{ marginTop: 18 }}>
        <CardHead title={`Below ${AT_RISK}% TML`} sub="Overall TML across every subject with evidence. The same threshold teachers see flagged on their desks." />
        {ac.atRisk.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Student</th><th>Class</th><th className="c">Overall</th><th className="c">Fortnight ago</th><th>Weakest subject</th></tr></thead>
              <tbody>{ac.atRisk.map(s => (
                <tr key={s.id}>
                  <td><b>{s.name}</b></td><td>{s.cls}</td>
                  <td className="c"><b style={{ color: hmColor(s.overall!) }}>{s.overall}%</b></td>
                  <td className="c num">{s.overallBefore !== null ? <>{s.overallBefore}% <Chip tone={s.overall! >= s.overallBefore ? 'g' : 'r'} className="xs">{s.overall! - s.overallBefore >= 0 ? '+' : '−'}{Math.abs(s.overall! - s.overallBefore)}</Chip></> : '—'}</td>
                  <td>{weakestSubject(s)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <Empty icon={<CheckCircle size={26} weight="duotone" />} title={ac.evidenced ? `Nobody is below ${AT_RISK}%` : 'No graded evidence yet'}>
            {ac.evidenced ? 'Students appear here if their overall TML drops below the threshold.' : 'This list builds as teachers confirm grades.'}
          </Empty>
        )}
      </div>

      {drill && subject && (
        <Workspace title={`Grade ${drill.grade} · ${subjectName(subject)}`} sub={`${drill.tml}% across ${plural(drill.n, 'student')} with evidence`}
          onClose={() => router.replace('/admin/academic', { scroll: false })}>
          <div className="card" style={{ marginBottom: 16 }}>
            <CardHead title="By section" />
            {ac.sections.filter(s => s.grade === drill.grade).map(s => {
              const v = s.bySubject[subject];
              return (
                <div className="row" key={s.cls}>
                  <b style={{ flex: '0 0 110px' }}>{s.cls}</b>
                  {v?.tml !== null && v?.tml !== undefined ? <Bar value={v.tml} /> : <div className="bar" />}
                  <b style={{ width: 50, textAlign: 'right', color: v?.tml != null ? hmColor(v.tml) : 'var(--mut2)' }}>{v?.tml != null ? `${v.tml}%` : '—'}</b>
                  <span className="muted num" style={{ width: 80, textAlign: 'right', fontSize: 12 }}>{v?.n ?? 0}/{s.students}</span>
                </div>
              );
            })}
          </div>
          <div className="card">
            <CardHead title="Students" sub="Lowest first." />
            {desk.students.filter(s => s.grade === drill.grade && typeof s.tml[subject] === 'number').sort((a, b) => a.tml[subject] - b.tml[subject]).map(s => (
              <div className="row" key={s.id}>
                <span style={{ flex: 1 }}><b style={{ fontSize: 14 }}>{s.name}</b> <span className="muted" style={{ fontSize: 12.5 }}>{s.cls}</span></span>
                <Bar value={s.tml[subject]} />
                <b style={{ width: 50, textAlign: 'right', color: hmColor(s.tml[subject]) }}>{s.tml[subject]}%</b>
              </div>
            ))}
            <div className="note" style={{ marginTop: 14 }}>Teachers can assign remedial work to these students from their Mastery Tracker.</div>
          </div>
        </Workspace>
      )}
    </>
  );
}
