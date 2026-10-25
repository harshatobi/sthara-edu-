'use client';

import { useState } from 'react';
import { GavelIcon as Gavel } from '@phosphor-icons/react/dist/ssr/Gavel';
import { HandHeartIcon as HandHeart } from '@phosphor-icons/react/dist/ssr/HandHeart';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { ActionFields, type ActionBody } from '@/components/conduct/ActionForm';
import { fmtDate } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { CASE_LABEL, type CaseStatus } from '@/lib/conduct/rules';
import { Decide, Table, type ActionRow } from '../discipline/DisciplinePage';
import { CardHead, Field, Workspace } from '../kit';

interface Data {
  actions: ActionRow[] | null;
  counselling: { id: string; status: CaseStatus; openedOn: string; closedOn: string | null; sessions: number; lastSession: string | null }[] | null;
  incidents: { id: string; label: string }[];
  can: { approve: boolean; suspend: boolean; archive: boolean; propose: boolean; counsellor: boolean };
}

/**
 * The student's conduct on the record (brief 07): discipline actions (the archive only for the principal and
 * registrar) and, for the counsellor, principal and school admin, whether the student has counselling. Never notes
 * and never child protection.
 */
export default function ConductPanel({ studentId, active }: { studentId: string; active: boolean }) {
  const { data, error, reload } = useGet<Data>(`/api/admin/discipline?studentId=${studentId}`);
  const [toast, toastEl] = useToast();
  const [panel, setPanel] = useState<null | 'record' | 'refer' | ActionRow>(null);
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div>;
  const approver = data.can.approve || data.can.suspend;
  return (
    <>
      {toastEl}
      {data.actions && (
        <div className="card" style={{ marginBottom: 14 }}>
          <CardHead title="Discipline" sub={data.can.archive ? 'Including earlier sessions’ warnings and detentions (archived: off the parent portal).' : 'Warnings and detentions leave the record at the next session.'}
            right={active && data.can.propose ? <button className="btn sm pri" onClick={() => setPanel('record')}><Gavel size={14} /> {approver ? 'Record an action' : 'Propose an action'}</button> : undefined} />
          {!data.actions.length ? <Empty icon={<Gavel size={26} weight="duotone" />} title="Nothing on the record" /> : <Table rows={data.actions} hideStudent onOpen={r => setPanel(r)} />}
        </div>
      )}
      <div className="card">
        <CardHead title="Counselling" sub={data.counselling ? 'Dates and status only. What is said stays with the counsellor.' : 'Only the counsellor sees counselling. You can ask them to see the student.'}
          right={active ? <button className="btn sm" onClick={() => setPanel('refer')}><HandHeart size={14} /> Refer to the counsellor</button> : undefined} />
        {data.counselling && (!data.counselling.length ? <p className="muted" style={{ fontSize: 13.5 }}>No counselling recorded.</p> : (
          <div style={{ overflowX: 'auto' }}><table className="tbl"><tbody>{data.counselling.map(c => (
            <tr key={c.id}><td>{fmtDate(c.openedOn)}{c.closedOn ? ` to ${fmtDate(c.closedOn)}` : ''}</td><td><Chip tone={c.status === 'open' ? 'a' : 'n'}>{CASE_LABEL[c.status].toUpperCase()}</Chip></td>
              <td className="muted">{c.sessions} session{c.sessions === 1 ? '' : 's'}{c.lastSession ? `, last ${fmtDate(c.lastSession)}` : ''}</td></tr>
          ))}</tbody></table></div>
        ))}
      </div>
      {panel === 'record' && <Record studentId={studentId} incidents={data.incidents} approver={approver} onClose={() => setPanel(null)} onDone={m => { setPanel(null); toast(m); reload(); }} />}
      {panel === 'refer' && <Refer studentId={studentId} onClose={() => setPanel(null)} onDone={() => { setPanel(null); toast('Sent to the counsellor.'); }} />}
      {panel && typeof panel === 'object' && <Decide row={panel} can={data.can} onClose={() => setPanel(null)} onDone={m => { setPanel(null); toast(m); reload(); }} />}
    </>
  );
}

function Record({ studentId, incidents, approver, onClose, onDone }: { studentId: string; incidents: { id: string; label: string }[]; approver: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const { call } = useAdminDesk();
  const [body, setBody] = useState<ActionBody | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (!body) return;
    setErr(null);
    try {
      const r = await call<{ status: string; parentsTold: number }>('/api/admin/discipline', 'POST', { action: approver ? 'record' : 'propose', studentId, ...body });
      onDone(r.status === 'approved' ? `On the record.${r.parentsTold ? ` ${r.parentsTold} parent${r.parentsTold === 1 ? '' : 's'} told.` : ''}` : 'Sent for approval.');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  return (
    <Workspace wide title={approver ? 'Record a discipline action' : 'Propose a discipline action'} sub={approver ? 'It goes on the record as approved. A suspension needs the principal.' : 'The vice principal or principal approves it.'} onClose={onClose}
      actions={<button className="btn pri" disabled={!body?.reason.trim()} onClick={go}>{approver ? 'Record' : 'Send for approval'}</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <ActionFields incidents={incidents} approver={approver} onChange={setBody} />
    </Workspace>
  );
}

function Refer({ studentId, onClose, onDone }: { studentId: string; onClose: () => void; onDone: () => void }) {
  const { call } = useAdminDesk();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setErr(null);
    try { await call('/api/admin/counselling', 'POST', { action: 'refer', studentId, reason }); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send.'); }
  };
  return (
    <Workspace title="Refer to the counsellor" sub="Only the counsellor reads what you write." onClose={onClose} actions={<button className="btn pri" disabled={reason.trim().length < 10} onClick={go}>Send</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <Field label="WHY" htmlFor="sr-why" hint="If a child is in danger, tell the principal or the Safeguarding lead now, in person.">
        <textarea id="sr-why" className="cmp-in" rows={4} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
      </Field>
    </Workspace>
  );
}
