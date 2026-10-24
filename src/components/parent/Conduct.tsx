'use client';

import { useState } from 'react';
import { GavelIcon as Gavel } from '@phosphor-icons/react/dist/ssr/Gavel';
import { HandHeartIcon as HandHeart } from '@phosphor-icons/react/dist/ssr/HandHeart';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { Field, Workspace } from '@/components/admin/kit';
import { fmtDate } from '@/lib/admin/format';
import { useCall } from '@/lib/exams/useApi';
import { ACTION_LABEL, type ActionKind } from '@/lib/conduct/rules';
import { ChildSwitcher, FamilyGate } from './common';

interface Data {
  hasCounsellor: boolean;
  children: { studentId: string; name: string; actions: { id: string; kind: ActionKind; onDate: string; untilDate: string | null; reason: string }[]; requests: { id: string; status: 'new' | 'seen'; createdAt: string }[] }[];
}

/** Conduct on the parent portal: discipline actions the school approved, and asking the counsellor to see the child. */
export default function Conduct() {
  return <FamilyGate>{({ child: c }) => <Body childId={c.id} firstName={c.firstName} />}</FamilyGate>;
}

function Body({ childId, firstName }: { childId: string; firstName: string }) {
  const { data, error, reload } = useGet<Data>('/api/parent/conduct');
  const [toast, toastEl] = useToast();
  const [asking, setAsking] = useState(false);
  const kid = data?.children.find(x => x.studentId === childId);
  return (
    <>
      {toastEl}
      <ChildSwitcher />
      <PageBar eyebrow="CONDUCT AND CARE" title={`${firstName} at school`} sub="Discipline the school has decided on, and the school counsellor."
        actions={data?.hasCounsellor && kid ? <button className="btn" onClick={() => setAsking(true)}><HandHeart size={16} /> Ask the counsellor to see {firstName}</button> : undefined} />
      {error && <div className="note err" role="alert">{error}</div>}
      {!data ? <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div> : !kid ? (
        <div className="card"><Empty icon={<Gavel size={26} weight="duotone" />} title="Not on the school register yet" /></div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Discipline</h3>
            {!kid.actions.length ? <Empty icon={<Gavel size={26} weight="duotone" />} title="Nothing recorded">The school records warnings, parent meetings, detentions and suspensions here once the principal approves them.</Empty> : (
              <div style={{ overflowX: 'auto' }}><table className="tbl"><tbody>{kid.actions.map(x => (
                <tr key={x.id}><td>{fmtDate(x.onDate)}{x.untilDate && x.untilDate !== x.onDate ? ` to ${fmtDate(x.untilDate)}` : ''}</td><td><b>{ACTION_LABEL[x.kind]}</b></td><td>{x.reason}</td></tr>
              ))}</tbody></table></div>
            )}
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Warnings and detentions are cleared at the start of each school year. To talk about any of these, message the class teacher or the principal.</p>
          </div>
          {kid.requests.length > 0 && (
            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Your requests to the counsellor</h3>
              {kid.requests.map(r => <div className="row" key={r.id}><div style={{ flex: 1 }}>{fmtDate(r.createdAt.slice(0, 10))}</div><Chip tone={r.status === 'seen' ? 'g' : 'a'}>{r.status === 'seen' ? 'SEEN BY THE COUNSELLOR' : 'SENT'}</Chip></div>)}
            </div>
          )}
        </>
      )}
      {asking && <Ask childId={childId} firstName={firstName} onClose={() => setAsking(false)} onDone={() => { setAsking(false); toast('Sent. The counsellor will be in touch.'); reload(); }} />}
    </>
  );
}

function Ask({ childId, firstName, onClose, onDone }: { childId: string; firstName: string; onClose: () => void; onDone: () => void }) {
  const call = useCall();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setErr(null);
    try { await call('/api/parent/conduct', 'POST', { action: 'refer', studentId: childId, reason }); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send.'); }
  };
  return (
    <Workspace title={`Ask the counsellor to see ${firstName}`} sub="Only the school counsellor reads this." onClose={onClose} actions={<button className="btn pri" disabled={reason.trim().length < 10} onClick={go}>Send</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <Field label="WHAT WOULD YOU LIKE THEM TO KNOW?" htmlFor="pc-why" hint="If your child is in danger right now, call the school or Childline 1098.">
        <textarea id="pc-why" className="cmp-in" rows={5} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
      </Field>
    </Workspace>
  );
}
