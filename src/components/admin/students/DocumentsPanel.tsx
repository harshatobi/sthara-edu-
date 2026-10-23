'use client';

import { useState } from 'react';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { ArrowSquareOutIcon as ArrowSquareOut } from '@phosphor-icons/react/dist/ssr/ArrowSquareOut';
import { Chip, Empty, Skeleton, type Tone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { fmtDate } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { DOC_GROUP_LABEL, DOC_KIND_KEYS, DOC_KINDS, docLabel, isMedical, type CheckState, type DocGroup, type DocStatus } from '@/lib/students/documents';
import { CardHead, Field, Workspace } from '../kit';
import { DocumentForm, openDocument, uploadDocument } from '@/components/students/documentForms';

export interface Doc {
  id: string; kind: string; title: string; document_no: string | null; issued_on: string | null; valid_until: string | null; file_name: string;
  size_bytes: number | null; status: DocStatus; source: 'office' | 'parent' | 'import'; reject_note: string | null; created_at: string;
  uploadedBy: string | null; verifiedBy: string | null; verified_at: string | null; canManage: boolean;
}
interface Data {
  docs: Doc[]; checklist: { kind: string; label: string; state: CheckState }[]; hidden: number; active: boolean; grade: number | null;
  can: { add: boolean; students: boolean; health: boolean };
}

export const CHECK_TONE: Record<CheckState, Tone> = { verified: 'g', expired: 'r', awaiting: 'b', rejected: 'r', missing: 'a' };
export const CHECK_LABEL: Record<CheckState, string> = { verified: 'VERIFIED', expired: 'EXPIRED', awaiting: 'TO CHECK', rejected: 'REJECTED', missing: 'MISSING' };
const STATUS_TONE: Record<DocStatus, Tone> = { verified: 'g', awaiting: 'b', rejected: 'r' };
const STATUS_LABEL: Record<DocStatus, string> = { verified: 'VERIFIED', awaiting: 'TO CHECK', rejected: 'REJECTED' };
const SOURCE: Record<Doc['source'], string> = { office: 'school office', parent: 'parent', import: 'import' };
const size = (b: number | null) => (b == null ? '' : b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** One student's documents: the checklist for their class, every document they may see, and the registrar's checks. */
export default function DocumentsPanel({ studentId }: { studentId: string }) {
  const path = `/api/admin/students/${studentId}/documents`;
  const { data, error, reload } = useGet<Data>(path);
  const { call } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const [adding, setAdding] = useState(false);
  const [acting, setActing] = useState<null | { doc: Doc; kind: 'reject' | 'remove' }>(null);
  const [err, setErr] = useState<string | null>(null);
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div className="card">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div>;
  const post = async (body: Record<string, unknown>, ok: string) => {
    setErr(null);
    try { await call(path, 'POST', body); toast(ok); setActing(null); reload(); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); return false; }
  };
  const open = async (d: Doc) => {
    setErr(null);
    try { await openDocument(call, path, { docId: d.id }); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open the document.'); }
  };
  const groups = (Object.keys(DOC_GROUP_LABEL) as DocGroup[]).map(g => ({ g, docs: data.docs.filter(d => (DOC_KINDS[d.kind as keyof typeof DOC_KINDS]?.group ?? 'other') === g) })).filter(x => x.docs.length);
  return (
    <>
      {toastEl}
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <div className="card" style={{ marginBottom: 14 }}>
        <CardHead title="Admission checklist" sub="What the school asks for at this class. Only a verified document still in date counts."
          right={data.can.add && data.active ? <button className="btn sm pri" onClick={() => setAdding(true)}><Plus size={14} weight="bold" /> Add a document</button> : undefined} />
        {!data.checklist.length ? <p className="muted">Nothing is asked for at this class.</p> : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.checklist.map(c => <span key={c.kind} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 10px', fontSize: 13 }}>{c.label} <Chip tone={CHECK_TONE[c.state]}>{CHECK_LABEL[c.state]}</Chip></span>)}
          </div>
        )}
      </div>

      {!data.docs.length ? (
        <div className="card"><Empty icon={<FileText size={26} weight="duotone" />} title="No documents yet">
          The office adds them here; parents can send them from their portal, and they wait here for your check.
          {data.hidden ? ` ${data.hidden} medical document${data.hidden === 1 ? ' is' : 's are'} kept for the health officer.` : ''}
        </Empty></div>
      ) : groups.map(({ g, docs }) => (
        <div className="card" key={g} style={{ marginBottom: 14 }}>
          <CardHead title={DOC_GROUP_LABEL[g]} />
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Document</th><th>Details</th><th>From</th><th>Status</th><th /></tr></thead>
              <tbody>{docs.map(d => (
                <tr key={d.id}>
                  <td><b>{d.title}</b>{d.title !== docLabel(d.kind) && <div className="muted" style={{ fontSize: 12 }}>{docLabel(d.kind)}</div>}
                    <div className="muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{d.file_name} {size(d.size_bytes) && `· ${size(d.size_bytes)}`}</div></td>
                  <td style={{ fontSize: 13 }}>{[d.document_no && `No. ${d.document_no}`, d.issued_on && `Issued ${fmtDate(d.issued_on)}`, d.valid_until && `Valid until ${fmtDate(d.valid_until)}`].filter(Boolean).join(' · ') || <span className="muted">{'—'}</span>}</td>
                  <td style={{ fontSize: 13 }}>{d.uploadedBy ?? 'Someone'}<div className="muted" style={{ fontSize: 12 }}>{SOURCE[d.source]}, {fmtDate(d.created_at)}</div></td>
                  <td><Chip tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Chip>
                    {d.status === 'verified' && d.verifiedBy && <div className="muted" style={{ fontSize: 12 }}>by {d.verifiedBy}{d.verified_at ? `, ${fmtDate(d.verified_at)}` : ''}</div>}
                    {d.status === 'rejected' && d.reject_note && <div className="muted" style={{ fontSize: 12 }}>{d.reject_note}</div>}</td>
                  <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button className="btn sm" onClick={() => open(d)}><ArrowSquareOut size={14} /> Open</button>
                    {d.canManage && d.status !== 'verified' && <button className="btn sm pri" onClick={() => post({ action: 'verify', docId: d.id }, 'Marked as verified against the original.')}>Verify</button>}
                    {d.canManage && d.status === 'awaiting' && <button className="btn sm" onClick={() => setActing({ doc: d, kind: 'reject' })}>Reject</button>}
                    {d.canManage && <button className="btn sm" onClick={() => setActing({ doc: d, kind: 'remove' })}>Remove</button>}
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ))}
      {data.docs.length > 0 && data.hidden > 0 && <p className="muted" style={{ fontSize: 13 }}>{data.hidden} medical document{data.hidden === 1 ? ' is' : 's are'} kept for the health officer.</p>}

      {adding && <AddDocument path={path} can={data.can} onClose={() => setAdding(false)} onDone={() => { setAdding(false); toast('Document added.'); reload(); }} />}
      {acting && <Reason title={acting.kind === 'reject' ? `Reject ${acting.doc.title}` : `Remove ${acting.doc.title}`}
        sub={acting.kind === 'reject' ? 'The parent sees your note, so say what to send instead.' : 'For an upload made by mistake. The file is deleted and the removal recorded.'}
        label={acting.kind === 'reject' ? 'WHAT IS WRONG' : 'WHY'} button={acting.kind === 'reject' ? 'Reject' : 'Remove'} onClose={() => setActing(null)}
        onSave={note => post(acting.kind === 'reject' ? { action: 'reject', docId: acting.doc.id, note } : { action: 'remove', docId: acting.doc.id, reason: note }, acting.kind === 'reject' ? 'Rejected; the parent sees your note.' : 'Removed.')} />}
    </>
  );
}

function Reason({ title, sub, label, button, onClose, onSave }: { title: string; sub: string; label: string; button: string; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Workspace title={title} sub={sub} onClose={onClose} actions={<button className="btn pri" disabled={note.trim().length < 3} onClick={() => onSave(note)}>{button}</button>}>
      <Field label={label} htmlFor="doc-note"><input id="doc-note" className="cmp-in" value={note} maxLength={300} onChange={e => setNote(e.target.value)} /></Field>
    </Workspace>
  );
}

function AddDocument({ path, can, onClose, onDone }: { path: string; can: Data['can']; onClose: () => void; onDone: () => void }) {
  const { call } = useAdminDesk();
  const kinds = DOC_KIND_KEYS.filter(k => (isMedical(k) ? can.students || can.health : can.students));
  return <DocumentForm kinds={kinds} office busyLabel="Uploading" onClose={onClose} onSend={async (file, meta) => { await uploadDocument(call, path, {}, file, meta); onDone(); }} />;
}
