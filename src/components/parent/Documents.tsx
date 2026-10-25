'use client';

import { useCallback, useState } from 'react';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { UploadSimpleIcon as UploadSimple } from '@phosphor-icons/react/dist/ssr/UploadSimple';
import { Chip, Empty, PageBar, type Tone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { Field, Workspace } from '@/components/admin/kit';
import { DocumentForm, openDocument, uploadDocument, type Call } from '@/components/students/documentForms';
import { useAuth } from '@/contexts/AuthContext';
import { fmtDate } from '@/lib/admin/format';
import { DOC_KIND_KEYS, docLabel, type CheckState, type DocStatus } from '@/lib/students/documents';
import { ChildSwitcher, FamilyGate } from './common';

interface View {
  active: boolean;
  checklist: { kind: string; label: string; state: CheckState }[];
  docs: { id: string; kind: string; title: string; file_name: string; issued_on: string | null; valid_until: string | null; status: DocStatus; reject_note: string | null; source: string; mine: boolean; created_at: string }[];
  erasures: { id: string; target_id: string | null; status: string; decision_note: string | null; created_at: string }[];
}

const CHECK: Record<CheckState, { label: string; tone: Tone }> = {
  verified: { label: 'RECEIVED', tone: 'g' }, expired: { label: 'EXPIRED: SEND A NEW ONE', tone: 'r' }, awaiting: { label: 'WITH THE SCHOOL', tone: 'b' },
  rejected: { label: 'SEND AGAIN', tone: 'r' }, missing: { label: 'NOT RECEIVED', tone: 'a' },
};
const STATUS: Record<DocStatus, { label: string; tone: Tone }> = { verified: { label: 'CHECKED BY THE SCHOOL', tone: 'g' }, awaiting: { label: 'WITH THE SCHOOL', tone: 'b' }, rejected: { label: 'NOT ACCEPTED', tone: 'r' } };
const PATH = '/api/parent/documents';

/** The child's documents the school holds: what it still needs, what the parent sent, and asking for one to be erased. */
export default function Documents() {
  return <FamilyGate>{({ child: c }) => <Body childId={c.id} firstName={c.firstName} />}</FamilyGate>;
}

function Body({ childId, firstName }: { childId: string; firstName: string }) {
  const { data, error, reload } = useGet<{ children: { studentId: string; view: View }[] }>(PATH);
  const { getAuthToken } = useAuth();
  const [toast, toastEl] = useToast();
  const [sending, setSending] = useState(false);
  const [erasing, setErasing] = useState<View['docs'][number] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const call = useCallback<Call>(async (path, _method, body) => {
    const token = await getAuthToken();
    const res = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out?.error || 'Something went wrong. Try again.');
    return out;
  }, [getAuthToken]);
  const v = data?.children.find(x => x.studentId === childId)?.view;
  const open = async (id: string) => {
    setErr(null);
    try { await openDocument(call, PATH, { studentId: childId, docId: id }); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open it.'); }
  };
  const pendingErase = new Set((v?.erasures ?? []).filter(r => r.status === 'pending').map(r => r.target_id));
  return (
    <>
      {toastEl}
      <ChildSwitcher />
      <PageBar eyebrow="DOCUMENTS" title={`${firstName}'s documents`} sub="What the school keeps on file, and what it still needs. The school checks everything you send against the original."
        actions={v?.active ? <button className="btn pri" onClick={() => setSending(true)}><UploadSimple size={16} /> Send a document</button> : undefined} />
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {error && <div className="note err" role="alert">{error}</div>}
      {data && !v && <div className="card"><Empty icon={<FileText size={30} weight="duotone" />} title="Not on the school register yet" /></div>}
      {v && (
        <>
          {v.checklist.length > 0 && (
            <div className="card" style={{ marginBottom: 18 }}>
              <div className="pa-card-hd flat"><div><h3>What the school asks for</h3><p className="muted">Bring the originals when the school asks, so it can check them.</p></div></div>
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                {v.checklist.map(c => <li key={c.kind} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}><span>{c.label}</span><Chip tone={CHECK[c.state].tone}>{CHECK[c.state].label}</Chip></li>)}
              </ul>
            </div>
          )}
          <div className="card">
            <div className="pa-card-hd flat"><div><h3>On file</h3></div></div>
            {!v.docs.length ? <p className="muted">Nothing yet.</p> : (
              <div className="pa-tbl-wrap"><table className="tbl pa-tbl">
                <thead><tr><th>Document</th><th>Status</th><th /></tr></thead>
                <tbody>{v.docs.map(d => (
                  <tr key={d.id}>
                    <td><b>{d.title}</b>{d.title !== docLabel(d.kind) && <div className="muted" style={{ fontSize: 12 }}>{docLabel(d.kind)}</div>}
                      <div className="muted" style={{ fontSize: 12 }}>{d.mine ? 'You sent it' : 'From the school'}, {fmtDate(d.created_at)}{d.valid_until ? ` · valid until ${fmtDate(d.valid_until)}` : ''}</div></td>
                    <td><Chip tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Chip>{d.status === 'rejected' && d.reject_note && <div className="muted" style={{ fontSize: 12 }}>{d.reject_note}</div>}</td>
                    <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button className="btn sm" onClick={() => open(d.id)}>Open</button>
                      {pendingErase.has(d.id) ? <Chip tone="b">ERASURE ASKED</Chip> : <button className="btn sm" onClick={() => setErasing(d)}>Ask to erase</button>}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
          {v.erasures.some(r => r.status !== 'pending') && (
            <div className="card" style={{ marginTop: 18 }}>
              <div className="pa-card-hd flat"><div><h3>Your erasure requests</h3></div></div>
              <div className="pa-tbl-wrap"><table className="tbl pa-tbl"><thead><tr><th>Asked</th><th>Decision</th><th>School&apos;s note</th></tr></thead>
                <tbody>{v.erasures.filter(r => r.status !== 'pending').map(r => <tr key={r.id}><td>{fmtDate(r.created_at)}</td><td><Chip tone={r.status === 'approved' ? 'g' : 'r'}>{r.status === 'approved' ? 'ERASED' : 'KEPT'}</Chip></td><td>{r.decision_note ?? ''}</td></tr>)}</tbody></table></div>
            </div>
          )}
          {sending && <DocumentForm kinds={DOC_KIND_KEYS} office={false} busyLabel="Sending" onClose={() => setSending(false)}
            onSend={async (file, meta) => { await uploadDocument(call, PATH, { studentId: childId }, file, meta); setSending(false); toast('Sent. The school will check it against the original.'); reload(); }} />}
          {erasing && <Erase title={erasing.title} onClose={() => setErasing(null)} onSend={async note => {
            setErr(null);
            try { await call(PATH, 'POST', { studentId: childId, action: 'erase', docId: erasing.id, note }); setErasing(null); toast('Sent to the school.'); reload(); }
            catch (e) { setErr(e instanceof Error ? e.message : 'Could not send.'); setErasing(null); }
          }} />}
        </>
      )}
    </>
  );
}

function Erase({ title, onClose, onSend }: { title: string; onClose: () => void; onSend: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Workspace title={`Ask the school to erase ${title}`} onClose={onClose}
      sub="Under the data protection law you can ask for this. The school may keep documents it must hold by law, such as a transfer certificate, and will tell you why."
      actions={<button className="btn pri" onClick={() => onSend(note)}>Send the request</button>}>
      <Field label="WHY (OPTIONAL)" htmlFor="er-note"><input id="er-note" className="cmp-in" value={note} maxLength={300} onChange={e => setNote(e.target.value)} /></Field>
    </Workspace>
  );
}
