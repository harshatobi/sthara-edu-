'use client';

import { useState } from 'react';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip, Empty, PageBar } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { useAuth } from '@/contexts/AuthContext';
import { fmtDate } from '@/lib/admin/format';
import { addressLine, RELATION_LABEL, type Address, type Relation } from '@/lib/students/register';
import { AddressInputs, EmergencyForm, MemberForm, type Emergency, type FamilyMember } from '@/components/students/forms';
import { Workspace } from '@/components/admin/kit';
import { ChildSwitcher, FamilyGate } from './common';

interface View {
  student: { name: string; address: Address | null; permanentAddress: Address | null; permanentSame: boolean };
  family: FamilyMember[]; emergency: Emergency[];
  requests: { id: string; kind: string; status: string; decision_note: string | null; created_at: string }[];
}
const KIND: Record<string, string> = { address: 'Address', family: 'Family member', emergency: 'Emergency contacts' };
const STATUS_TONE: Record<string, 'b' | 'g' | 'r' | 'n'> = { pending: 'b', approved: 'g', rejected: 'r', withdrawn: 'n' };

/** Family and contact details the school holds, with changes the parent proposes for the office to approve. */
export default function FamilyDetails() {
  return <FamilyGate>{({ child: c }) => <Details childId={c.id} firstName={c.firstName} />}</FamilyGate>;
}

function Details({ childId, firstName }: { childId: string; firstName: string }) {
  const { data, error, reload } = useGet<{ children: { studentId: string; view: View }[] }>('/api/parent/family');
  const { getAuthToken } = useAuth();
  const [toast, toastEl] = useToast();
  const [form, setForm] = useState<null | { kind: 'address' } | { kind: 'family'; member: FamilyMember | null } | { kind: 'emergency' }>(null);
  const [err, setErr] = useState<string | null>(null);
  const v = data?.children.find(x => x.studentId === childId)?.view;
  const send = async (kind: string, proposed: unknown, targetId?: string) => {
    setErr(null);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/parent/family', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: childId, kind, proposed, targetId }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not send.');
      toast('Sent to the school office. It changes once they approve it.'); setForm(null); reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send.'); }
  };
  return (
    <>
      {toastEl}
      <ChildSwitcher />
      <PageBar eyebrow="FAMILY DETAILS" title={`What the school holds for ${firstName}`} sub="Address, family and emergency contacts. Spot something wrong or out of date? Propose a change; the school office checks and applies it." />
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {error && <div className="note err" role="alert">{error}</div>}
      {data && !v && <div className="card"><Empty icon={<UsersThree size={30} weight="duotone" />} title="Not on the school register yet">The school office adds {firstName} to its register first.</Empty></div>}
      {v && (
        <>
          <div className="g2" style={{ marginBottom: 18 }}>
            <div className="card">
              <div className="pa-card-hd flat"><div><h3>Address</h3></div><button className="btn sm" onClick={() => setForm({ kind: 'address' })}><PencilSimple size={14} /> Propose a change</button></div>
              <p style={{ fontWeight: 600 }}>{addressLine(v.student.address) || 'No address on record'}</p>
              <p className="muted" style={{ fontSize: 13 }}>Permanent: {v.student.permanentSame ? 'same as above' : addressLine(v.student.permanentAddress) || 'not on record'}</p>
            </div>
            <div className="card">
              <div className="pa-card-hd flat"><div><h3>Emergency contacts</h3><p className="muted">Called in this order.</p></div><button className="btn sm" onClick={() => setForm({ kind: 'emergency' })}><PencilSimple size={14} /> Propose a change</button></div>
              {!v.emergency.length ? <p className="muted">None on record.</p> : (
                <ol style={{ margin: 0, paddingLeft: 20 }}>{v.emergency.map(e => {
                  const f = e.family_member_id ? v.family.find(x => x.id === e.family_member_id) : null;
                  return <li key={e.position}><b>{f?.name ?? e.name}</b> <span className="muted">{f ? RELATION_LABEL[f.relation] : e.relation} · {f?.phone ?? e.phone ?? 'no phone'}</span></li>;
                })}</ol>
              )}
            </div>
          </div>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="pa-card-hd flat"><div><h3>Family</h3></div><button className="btn sm" onClick={() => setForm({ kind: 'family', member: null })}><Plus size={14} /> Add someone</button></div>
            {!v.family.length ? <p className="muted">No family on record.</p> : (
              <div className="pa-tbl-wrap"><table className="tbl pa-tbl">
                <thead><tr><th>Name</th><th>Relation</th><th>Phone</th><th>Email</th><th /></tr></thead>
                <tbody>{v.family.map(f => (
                  <tr key={f.id}><td><b>{f.name}</b> {f.is_primary && <Chip tone="b">PRIMARY</Chip>}</td><td>{RELATION_LABEL[f.relation as Relation]}</td><td>{f.phone ?? '—'}</td><td>{f.email ?? '—'}</td>
                    <td><button className="btn sm" onClick={() => setForm({ kind: 'family', member: f })}>Propose a change</button></td></tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
          {v.requests.length > 0 && (
            <div className="card">
              <div className="pa-card-hd flat"><div><h3>Your requests</h3></div></div>
              <div className="pa-tbl-wrap"><table className="tbl pa-tbl">
                <thead><tr><th>Sent</th><th>What</th><th>Status</th><th>School&apos;s note</th></tr></thead>
                <tbody>{v.requests.map(r => (
                  <tr key={r.id}><td>{fmtDate(r.created_at)}</td><td>{KIND[r.kind] ?? r.kind}</td><td><Chip tone={STATUS_TONE[r.status] ?? 'n'}>{r.status === 'pending' ? 'WITH THE OFFICE' : r.status.toUpperCase()}</Chip></td><td>{r.decision_note ?? ''}</td></tr>
                ))}</tbody>
              </table></div>
            </div>
          )}
          {form?.kind === 'address' && <AddressForm v={v} onClose={() => setForm(null)} onSend={p => send('address', p)} />}
          {form?.kind === 'family' && <MemberForm member={form.member} title={form.member ? `Change ${form.member.name}` : 'Add a family member'} onClose={() => setForm(null)}
            onSave={m => send('family', m, form.member?.id)} />}
          {form?.kind === 'emergency' && <EmergencyForm family={v.family} current={v.emergency} onClose={() => setForm(null)} onSave={list => send('emergency', { list })} />}
        </>
      )}
    </>
  );
}

function AddressForm({ v, onClose, onSend }: { v: View; onClose: () => void; onSend: (p: unknown) => void }) {
  const [addr, setAddr] = useState<Partial<Address>>(v.student.address ?? {});
  const [same, setSame] = useState(v.student.permanentSame);
  const [perm, setPerm] = useState<Partial<Address>>(v.student.permanentAddress ?? {});
  return (
    <Workspace title="Propose a new address" sub="The school office checks it before it changes." onClose={onClose}
      actions={<button className="btn pri" disabled={!addr.line1?.trim()} onClick={() => onSend({ address: addr, permanent_same: same, permanent_address: same ? null : perm })}>Send to the office</button>}>
      <AddressInputs title="Where you live now" value={addr} onChange={setAddr} prefix="p-addr" />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, margin: '8px 0' }}><input type="checkbox" checked={same} onChange={e => setSame(e.target.checked)} /> Permanent address is the same</label>
      {!same && <AddressInputs title="Permanent address" value={perm} onChange={setPerm} prefix="p-perm" />}
    </Workspace>
  );
}
