'use client';

import { useState } from 'react';
import { GraduationCapIcon as GraduationCap } from '@phosphor-icons/react/dist/ssr/GraduationCap';
import { SealCheckIcon as SealCheck } from '@phosphor-icons/react/dist/ssr/SealCheck';
import { ArrowUUpLeftIcon as ArrowUUpLeft } from '@phosphor-icons/react/dist/ssr/ArrowUUpLeft';
import { ArrowFatLinesUpIcon as ArrowFatLinesUp } from '@phosphor-icons/react/dist/ssr/ArrowFatLinesUp';
import { PaperPlaneTiltIcon as PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { Bar, Chip, Empty, Skeleton, type Tone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { OUTCOME_LABEL, OUTCOMES, type Outcome } from '@/lib/students/register';
import { nextClassName, STAGE_LABEL, type Stage } from '@/lib/students/outcomes';
import { CardHead, Field, Workspace } from '../kit';
import { useGet } from '@/components/canon/useGet';

type Counts = Record<Stage, number>;
interface Board {
  session: string; next: string; can: { approve: boolean; manage: boolean };
  classes: { cls: string; classTeacher: string | null; by: Counts; total: number; allProposed: boolean; allApproved: boolean; allFinal: boolean; allPromoted: boolean }[];
}
interface ClassRow {
  enrolmentId: string; studentId: string; name: string; admissionNo: string; rollNo: string | null; stage: Stage;
  proposed: Outcome | null; proposedNote: string | null; returnedNote: string | null; outcome: Outcome | null; published: boolean;
  card: { status: string | null; pct: number | null; grade: string | null; term: string | null } | null;
}
interface ClassData {
  session: string; next: string; cls: string; rows: ClassRow[]; can: { approve: boolean; manage: boolean };
  progress: { by: Counts; total: number; allProposed: boolean; allApproved: boolean; allFinal: boolean; allPromoted: boolean };
}

export const STAGE_TONE: Record<Stage, Tone> = { open: 'n', proposed: 'b', returned: 'r', approved: 'p', final: 'a', promoted: 'g', published: 'g' };

/** The office side of the year end: every class, then one class at a time. */
export default function YearEnd() {
  const { data, error, reload } = useGet<Board>('/api/admin/students/year');
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div className="card">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div>;
  return (
    <>
      <div className="note info" style={{ marginBottom: 18 }}>
        Session {data.session.replace('-', '–')}. Class teachers propose each student&apos;s outcome from the report card, the principal approves,
        the registrar finalises and promotes into {data.next.replace('-', '–')}, and once the new classes are set the result goes to the student and parent portals.
      </div>
      <div className="card">
        <CardHead title="Classes" sub="Where each class stands. Open a class to act on it." />
        {!data.classes.length ? <Empty icon={<GraduationCap size={26} weight="duotone" />} title="No classes this session">Students appear here once they have a class this session.</Empty> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Class</th><th>Class teacher</th><th className="c">Students</th><th style={{ minWidth: 220 }}>Progress</th><th>Next step</th></tr></thead>
              <tbody>{data.classes.map(c => {
                const done = c.by.final + c.by.promoted + c.by.published;
                const step = c.allPromoted ? (c.by.published === c.total ? 'Published' : 'Publish to portals') : c.allFinal ? 'Promote' : c.allApproved ? 'Registrar finalises' : c.allProposed ? 'Principal approves' : 'Class teacher proposes';
                return (
                  <tr key={c.cls} className="click" tabIndex={0} onClick={() => setOpen(c.cls)} onKeyDown={e => { if (e.key === 'Enter') setOpen(c.cls); }}>
                    <td><b>{c.cls}</b></td>
                    <td>{c.classTeacher ?? <span className="muted">Not set</span>}</td>
                    <td className="c">{c.total}</td>
                    <td><Bar value={c.total ? (done / c.total) * 100 : 0} /><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {c.by.proposed + c.by.approved + done} proposed · {c.by.approved + done} approved · {done} final{c.by.returned ? ` · ${c.by.returned} returned` : ''}</div></td>
                    <td><Chip tone={c.by.published === c.total ? 'g' : 'b'}>{step.toUpperCase()}</Chip></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>
      {open && <ClassPanel cls={open} onClose={() => { setOpen(null); reload(); }} />}
    </>
  );
}

function ClassPanel({ cls, onClose }: { cls: string; onClose: () => void }) {
  const { call } = useAdminDesk();
  const { data, error, reload } = useGet<ClassData>(`/api/admin/students/year?cls=${encodeURIComponent(cls)}`);
  const [toast, toastEl] = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [changes, setChanges] = useState<Record<string, { outcome: Outcome; note: string }>>({});
  const [toClass, setToClass] = useState(nextClassName(cls) ?? '');
  const act = async (action: string, body: Record<string, unknown>, ok: string) => {
    setBusy(true); setErr(null);
    try { await call('/api/admin/students/year', 'POST', { action, cls, ...body }); toast(ok); setChanges({}); setNote(''); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.'); }
    setBusy(false);
  };
  const rows = data?.rows ?? [];
  const ids = (stages: Stage[]) => rows.filter(r => stages.includes(r.stage)).map(r => ({ id: r.enrolmentId }));
  const P = data?.progress;
  return (
    <Workspace title={`Year end · ${cls}`} sub={data ? `Session ${data.session.replace('-', '–')} · ${rows.length} students` : undefined} onClose={onClose} wide>
      {toastEl}
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {error && <div className="note err" role="alert">{error}</div>}
      {!data ? [0, 1, 2, 3].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {data.can.approve && P && P.by.proposed > 0 && <>
                <button className="btn pri" disabled={busy} onClick={() => act('approve', { items: ids(['proposed']) }, 'Approved.')}><SealCheck size={16} weight="bold" /> Approve {P.by.proposed}</button>
                <div className="cmp-fld" style={{ flex: '1 1 260px', margin: 0 }}>
                  <label htmlFor="ye-note">NOTE FOR THE CLASS TEACHER</label>
                  <input id="ye-note" className="cmp-in" value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="What to look at again" />
                </div>
                <button className="btn" disabled={busy || note.trim().length < 3} onClick={() => act('return', { items: ids(['proposed', 'approved']), note }, 'Returned to the class teacher.')}><ArrowUUpLeft size={16} /> Return</button>
              </>}
              {data.can.manage && P && P.by.approved > 0 && (
                <button className="btn pri" disabled={busy} onClick={() => act('finalise', { items: rows.filter(r => r.stage === 'approved').map(r => ({ id: r.enrolmentId, ...(changes[r.enrolmentId] ?? {}) })) }, 'Finalised.')}>
                  <SealCheck size={16} weight="bold" /> Finalise {P.by.approved}
                </button>
              )}
              {data.can.manage && P?.allFinal && !P.allPromoted && <>
                <Field label="PROMOTE INTO" htmlFor="ye-to"><input id="ye-to" className="cmp-in" value={toClass} onChange={e => setToClass(e.target.value)} placeholder={`Class for ${data.next}`} /></Field>
                <button className="btn pri" disabled={busy || !toClass.trim()} onClick={() => act('promote', { toClass, sameClass: cls }, 'Promoted into next session.')}><ArrowFatLinesUp size={16} weight="bold" /> Promote the class</button>
              </>}
              {data.can.manage && P?.allPromoted && P.by.published < P.total && (
                <button className="btn pri" disabled={busy} onClick={() => act('publish', {}, 'Published to the student and parent portals.')}><PaperPlaneTilt size={16} weight="bold" /> Publish to portals</button>
              )}
              {P && !P.allProposed && <span className="muted">Waiting for the class teacher to propose every outcome ({P.by.open + P.by.returned} left).</span>}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th className="c">Roll</th><th>Student</th><th>Report card</th><th>Proposed</th><th>Outcome</th><th>Stage</th></tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.enrolmentId}>
                  <td className="c">{r.rollNo ?? '—'}</td>
                  <td><b>{r.name}</b><div className="muted" style={{ fontSize: 12 }}>{r.admissionNo}</div></td>
                  <td>{r.card ? <>{r.card.status === 'pass' ? <Chip tone="g">PASS</Chip> : r.card.status === 'fail' ? <Chip tone="r">FAIL</Chip> : <Chip tone="a">{(r.card.status ?? 'NO RESULT').toUpperCase()}</Chip>}
                    {r.card.pct != null && <span className="muted"> {r.card.pct}%{r.card.grade ? ` · ${r.card.grade}` : ''}</span>}</> : <span className="muted">No report card</span>}</td>
                  <td>{r.proposed ? OUTCOME_LABEL[r.proposed] : <span className="muted">Not yet</span>}
                    {r.proposedNote && <div className="muted" style={{ fontSize: 12 }}>{r.proposedNote}</div>}
                    {r.returnedNote && <div style={{ fontSize: 12, color: 'var(--red)' }}>Returned: {r.returnedNote}</div>}</td>
                  <td>
                    {data.can.manage && r.stage === 'approved' ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <select className="cmp-sel" aria-label={`Outcome for ${r.name}`} value={changes[r.enrolmentId]?.outcome ?? r.proposed ?? ''}
                          onChange={e => setChanges(c => ({ ...c, [r.enrolmentId]: { outcome: e.target.value as Outcome, note: c[r.enrolmentId]?.note ?? '' } }))}>
                          {OUTCOMES.map(o => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
                        </select>
                        {changes[r.enrolmentId] && changes[r.enrolmentId].outcome !== r.proposed && (
                          <input className="cmp-in" placeholder="Why it differs from the approved outcome" aria-label="Reason" value={changes[r.enrolmentId].note}
                            onChange={e => setChanges(c => ({ ...c, [r.enrolmentId]: { ...c[r.enrolmentId], note: e.target.value } }))} />
                        )}
                      </div>
                    ) : r.outcome ? <b>{OUTCOME_LABEL[r.outcome]}</b> : <span className="muted">{'—'}</span>}
                  </td>
                  <td><Chip tone={STAGE_TONE[r.stage]}>{STAGE_LABEL[r.stage].toUpperCase()}</Chip></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </Workspace>
  );
}
