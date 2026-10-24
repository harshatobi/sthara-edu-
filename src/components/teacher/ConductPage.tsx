'use client';

import { useCallback, useState } from 'react';
import { GavelIcon as Gavel } from '@phosphor-icons/react/dist/ssr/Gavel';
import { HandHeartIcon as HandHeart } from '@phosphor-icons/react/dist/ssr/HandHeart';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { Field, Workspace } from '@/components/admin/kit';
import { ActionFields, type ActionBody } from '@/components/conduct/ActionForm';
import { useAuth } from '@/contexts/AuthContext';
import { fmtDate } from '@/lib/admin/format';
import { ACTION_LABEL, STATUS_LABEL, type ActionKind, type ActionStatus } from '@/lib/conduct/rules';

interface View {
  classes: string[]; hasCounsellor: boolean;
  actions: { id: string; student: string; kind: ActionKind; onDate: string; untilDate: string | null; reason: string; status: ActionStatus; returnNote: string | null; cancelReason: string | null; approvedBy: string | null }[];
  referrals: { id: string; student: string; status: 'new' | 'seen'; createdAt: string }[];
}
interface Pick { id: string; name: string; admissionNo: string; cls: string | null }
type Call = <T>(method: 'GET' | 'POST', q: string, body?: unknown) => Promise<T>;
const API = '/api/teacher/conduct';
const TONE: Record<ActionStatus, 'g' | 'a' | 'r' | 'n'> = { approved: 'g', proposed: 'a', returned: 'r', cancelled: 'n' };

/** Conduct and care for teachers: propose a discipline action, refer a student to the counsellor, follow both. */
export default function ConductPage() {
  const { data, error, reload } = useGet<View>(API);
  const { getAuthToken } = useAuth();
  const [toast, toastEl] = useToast();
  const [panel, setPanel] = useState<null | 'propose' | 'refer' | { withdraw: string }>(null);
  const call = useCallback<Call>(async (method, q, body) => {
    const token = await getAuthToken();
    const res = await fetch(`${API}${q}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out?.error || 'Something went wrong. Try again.');
    return out;
  }, [getAuthToken]);
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div aria-busy="true"><Skeleton h={30} w={280} /><div className="card" style={{ marginTop: 20 }}>{[0, 1, 2, 3].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div></div>;
  return (
    <>
      {toastEl}
      <PageBar eyebrow="CONDUCT AND CARE" title="Conduct and care" sub="Propose a discipline action for the principal or vice principal to approve, or ask the counsellor to see a student."
        actions={<>
          <button className="btn pri" onClick={() => setPanel('propose')}><Gavel size={16} /> Propose an action</button>
          <button className="btn" onClick={() => setPanel('refer')} disabled={!data.hasCounsellor} title={data.hasCounsellor ? undefined : 'The school has no counsellor in Sthara yet'}><HandHeart size={16} /> Refer to the counsellor</button>
        </>} />
      {!data.hasCounsellor && <div className="note info" style={{ marginBottom: 16 }}>The school has no counsellor in Sthara yet, so referrals are off. Speak to the principal.</div>}
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Actions you proposed</h3>
        {!data.actions.length ? <Empty icon={<Gavel size={26} weight="duotone" />} title="None yet">Warnings, parent meetings, detentions and suspensions you propose show here with the decision.</Empty> : (
          <div style={{ overflowX: 'auto' }}><table className="tbl">
            <tbody>{data.actions.map(x => (
              <tr key={x.id}>
                <td>{fmtDate(x.onDate)}{x.untilDate && x.untilDate !== x.onDate ? ` to ${fmtDate(x.untilDate)}` : ''}</td>
                <td><b>{x.student}</b><div className="muted" style={{ fontSize: 12 }}>{ACTION_LABEL[x.kind]}</div></td>
                <td>{x.reason}{(x.returnNote || x.cancelReason) && <div className="muted" style={{ fontSize: 12 }}>{x.returnNote || x.cancelReason}</div>}</td>
                <td><Chip tone={TONE[x.status]}>{STATUS_LABEL[x.status].toUpperCase()}</Chip></td>
                <td>{(x.status === 'proposed' || x.status === 'returned') && <button className="btn sm" onClick={() => setPanel({ withdraw: x.id })}>Withdraw</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <div className="card">
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Students you referred to the counsellor</h3>
        {!data.referrals.length ? <Empty icon={<HandHeart size={26} weight="duotone" />} title="None yet">What the counsellor and the student talk about stays with the counsellor; you see only that they have seen it.</Empty> : (
          <div style={{ overflowX: 'auto' }}><table className="tbl"><tbody>{data.referrals.map(r => (
            <tr key={r.id}><td>{fmtDate(r.createdAt.slice(0, 10))}</td><td><b>{r.student}</b></td><td><Chip tone={r.status === 'seen' ? 'g' : 'a'}>{r.status === 'seen' ? 'SEEN BY THE COUNSELLOR' : 'REFERRED'}</Chip></td></tr>
          ))}</tbody></table></div>
        )}
      </div>
      {panel === 'propose' && <Propose view={data} call={call} onClose={() => setPanel(null)} onDone={() => { setPanel(null); toast('Sent for approval.'); reload(); }} />}
      {panel === 'refer' && <Refer view={data} call={call} onClose={() => setPanel(null)} onDone={() => { setPanel(null); toast('Sent to the counsellor.'); reload(); }} />}
      {panel && typeof panel === 'object' && <Withdraw id={panel.withdraw} call={call} onClose={() => setPanel(null)} onDone={() => { setPanel(null); toast('Withdrawn.'); reload(); }} />}
    </>
  );
}

/** One student: from a class roster or a search of the school. */
function OnePicker({ view, call, picked, setPicked }: { view: View; call: Call; picked: Pick | null; setPicked: (p: Pick | null) => void }) {
  const [cls, setCls] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Pick[]>([]);
  const load = async (query: string) => { try { setFound((await call<{ students: Pick[] }>('GET', query)).students); } catch { setFound([]); } };
  if (picked) return <p style={{ marginBottom: 14 }}><b>{picked.name}</b> <span className="muted">{picked.admissionNo}{picked.cls ? ` · ${picked.cls}` : ''}</span> <button className="btn sm" onClick={() => setPicked(null)}>Change</button></p>;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="g2">
        <Field label="A CLASS" htmlFor="cp-cls"><select id="cp-cls" className="cmp-sel" value={cls} onChange={e => { setCls(e.target.value); if (e.target.value) void load(`?cls=${encodeURIComponent(e.target.value)}`); }}>
          <option value="">Pick a class</option>{view.classes.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
        <Field label="OR SEARCH THE SCHOOL" htmlFor="cp-q"><input id="cp-q" className="cmp-in" value={q} placeholder="Name or admission no." onChange={e => { setQ(e.target.value); if (e.target.value.trim().length >= 2) void load(`?q=${encodeURIComponent(e.target.value.trim())}`); }} /></Field>
      </div>
      {found.length > 0 && (
        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 8 }}>
          {found.map(s => <button key={s.id} type="button" className="row" style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '6px 4px', cursor: 'pointer', fontSize: 14 }} onClick={() => setPicked(s)}>{s.name} <span className="muted">{s.admissionNo}{s.cls ? ` · ${s.cls}` : ''}</span></button>)}
        </div>
      )}
    </div>
  );
}

function Propose({ view, call, onClose, onDone }: { view: View; call: Call; onClose: () => void; onDone: () => void }) {
  const [picked, setPicked] = useState<Pick | null>(null);
  const [incidents, setIncidents] = useState<{ id: string; label: string }[]>([]);
  const [body, setBody] = useState<ActionBody | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (p: Pick | null) => {
    setPicked(p); setIncidents([]);
    if (p) { try { setIncidents((await call<{ incidents: { id: string; label: string }[] }>('GET', `?incidentsFor=${p.id}`)).incidents); } catch { /* linking is optional */ } }
  };
  const go = async () => {
    if (!picked || !body) return;
    setBusy(true); setErr(null);
    try { await call('POST', '', { action: 'propose', studentId: picked.id, ...body }); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not send.'); setBusy(false); }
  };
  return (
    <Workspace wide title="Propose a discipline action" sub="The vice principal or principal approves it (a suspension, the principal). Parents see it only once approved." onClose={onClose}
      actions={<button className="btn pri" disabled={busy || !picked || !body?.reason.trim()} onClick={go}>Send for approval</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <OnePicker view={view} call={call} picked={picked} setPicked={p => void pick(p)} />
      {picked && <ActionFields incidents={incidents} approver={false} onChange={setBody} />}
    </Workspace>
  );
}

function Refer({ view, call, onClose, onDone }: { view: View; call: Call; onClose: () => void; onDone: () => void }) {
  const [picked, setPicked] = useState<Pick | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (!picked) return;
    setBusy(true); setErr(null);
    try { await call('POST', '', { action: 'refer', studentId: picked.id, reason }); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not send.'); setBusy(false); }
  };
  return (
    <Workspace title="Refer to the counsellor" sub="Only the counsellor reads what you write. You will see when they have seen it." onClose={onClose}
      actions={<button className="btn pri" disabled={busy || !picked || reason.trim().length < 10} onClick={go}>Send</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <OnePicker view={view} call={call} picked={picked} setPicked={setPicked} />
      {picked && <Field label="WHY" htmlFor="rf-why" hint="What you have noticed, in a sentence or two. If a child is in danger, tell the principal or the Safeguarding lead now, in person.">
        <textarea id="rf-why" className="cmp-in" rows={4} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
      </Field>}
    </Workspace>
  );
}

function Withdraw({ id, call, onClose, onDone }: { id: string; call: Call; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    try { await call('POST', '', { action: 'withdraw', id, reason }); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not withdraw.'); }
  };
  return (
    <Workspace title="Withdraw the proposal" onClose={onClose} actions={<button className="btn pri" disabled={reason.trim().length < 3} onClick={go}>Withdraw</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <Field label="WHY" htmlFor="wd-why"><input id="wd-why" className="cmp-in" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></Field>
    </Workspace>
  );
}
