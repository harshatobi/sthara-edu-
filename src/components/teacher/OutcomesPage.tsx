'use client';

import { useState } from 'react';
import { GraduationCapIcon as GraduationCap } from '@phosphor-icons/react/dist/ssr/GraduationCap';
import { PaperPlaneTiltIcon as PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { useAuth } from '@/contexts/AuthContext';
import { OUTCOME_LABEL, OUTCOMES, type Outcome } from '@/lib/students/register';
import { STAGE_LABEL, type Stage } from '@/lib/students/outcomes';

interface Row {
  enrolmentId: string; name: string; admissionNo: string; rollNo: string | null; stage: Stage; proposed: Outcome | null;
  proposedNote: string | null; returnedNote: string | null; outcome: Outcome | null; suggested: Outcome | null;
  card: { status: string | null; pct: number | null; grade: string | null; term: string | null } | null;
}
interface Data { session: string; next: string; cls: string; rows: Row[] }
const TONE: Record<Stage, Tone> = { open: 'n', proposed: 'b', returned: 'r', approved: 'p', final: 'g', promoted: 'g', published: 'g' };
const EDITABLE: Stage[] = ['open', 'proposed', 'returned'];

/** The class teacher proposes each student's year-end outcome; the principal approves it next. */
export default function OutcomesPage() {
  const { data, error, reload } = useGet<Data>('/api/teacher/outcomes');
  const { getAuthToken } = useAuth();
  const [toast, toastEl] = useToast();
  const [pick, setPick] = useState<Record<string, { outcome: Outcome | ''; note: string }>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (error) return (
    <>
      <PageBar eyebrow="YEAR END" title="Year-end outcomes" />
      <div className="card"><Empty icon={<GraduationCap size={26} weight="duotone" />} title="Nothing to do here">{error}</Empty></div>
    </>
  );
  if (!data) return <div aria-busy="true"><Skeleton h={30} w={280} /><div className="card" style={{ marginTop: 20 }}>{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div></div>;

  const editable = data.rows.filter(r => EDITABLE.includes(r.stage));
  const value = (r: Row) => pick[r.enrolmentId]?.outcome ?? r.proposed ?? r.suggested ?? '';
  const ready = editable.filter(r => value(r));
  const returned = data.rows.filter(r => r.stage === 'returned');
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/teacher/outcomes', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: ready.map(r => ({ id: r.enrolmentId, outcome: value(r), note: pick[r.enrolmentId]?.note ?? r.proposedNote ?? '' })) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not send.');
      toast(`Sent ${ready.length} outcome${ready.length === 1 ? '' : 's'} to the principal.`);
      setPick({}); reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send.'); }
    setBusy(false);
  };

  return (
    <>
      {toastEl}
      <PageBar eyebrow={`YEAR END · ${data.session.replace('-', '–')}`} title={`Outcomes for ${data.cls}`}
        sub="Propose how each student's year ends. A suggestion comes from the final report card; change it where you know better. The principal approves next."
        actions={editable.length ? <button className="btn pri" disabled={busy || !ready.length} onClick={submit}><PaperPlaneTilt size={16} weight="bold" /> Send {ready.length} to the principal</button> : undefined} />
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {returned.length > 0 && <div className="note err" style={{ marginBottom: 14 }}>The principal returned {returned.length} outcome{returned.length === 1 ? '' : 's'}: {returned[0].returnedNote}</div>}
      {!data.rows.length ? (
        <div className="card"><Empty icon={<GraduationCap size={26} weight="duotone" />} title="No students in your class this session" /></div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th className="c">Roll</th><th>Student</th><th>Report card</th><th>Outcome</th><th>Note</th><th>Stage</th></tr></thead>
            <tbody>{data.rows.map(r => {
              const can = EDITABLE.includes(r.stage);
              return (
                <tr key={r.enrolmentId}>
                  <td className="c">{r.rollNo ?? '—'}</td>
                  <td><b>{r.name}</b><div className="muted" style={{ fontSize: 12 }}>{r.admissionNo}</div></td>
                  <td>{r.card ? <>{r.card.status === 'pass' ? <Chip tone="g">PASS</Chip> : r.card.status === 'fail' ? <Chip tone="r">FAIL</Chip> : <Chip tone="a">{(r.card.status ?? 'NO RESULT').toUpperCase()}</Chip>}
                    {r.card.pct != null && <span className="muted"> {r.card.pct}%</span>}</> : <span className="muted">No report card yet</span>}</td>
                  <td>{can ? (
                    <select className="cmp-sel" aria-label={`Outcome for ${r.name}`} value={value(r)}
                      onChange={e => setPick(p => ({ ...p, [r.enrolmentId]: { outcome: e.target.value as Outcome, note: p[r.enrolmentId]?.note ?? r.proposedNote ?? '' } }))}>
                      <option value="">Pick an outcome</option>
                      {OUTCOMES.map(o => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
                    </select>
                  ) : <b>{OUTCOME_LABEL[(r.outcome ?? r.proposed)!] ?? '—'}</b>}</td>
                  <td>{can ? (
                    <input className="cmp-in" aria-label={`Note for ${r.name}`} maxLength={300} placeholder="Optional" value={pick[r.enrolmentId]?.note ?? r.proposedNote ?? ''}
                      onChange={e => setPick(p => ({ ...p, [r.enrolmentId]: { outcome: p[r.enrolmentId]?.outcome ?? value(r), note: e.target.value } }))} />
                  ) : <span className="muted">{r.proposedNote ?? ''}</span>}</td>
                  <td><Chip tone={TONE[r.stage]}>{STAGE_LABEL[r.stage].toUpperCase()}</Chip></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
