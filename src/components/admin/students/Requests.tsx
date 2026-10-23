'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChatCircleTextIcon as ChatCircleText } from '@phosphor-icons/react/dist/ssr/ChatCircleText';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { fmtDate } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { addressLine, EDUCATION_LABEL, RELATION_LABEL, type Address, type Education, type Relation } from '@/lib/students/register';
import { docLabel, isMedical } from '@/lib/students/documents';
import { CardHead } from '../kit';
import { openDocument } from '@/components/students/documentForms';

interface Req {
  id: string; studentId: string; student: string; admissionNo: string; kind: 'address' | 'family' | 'emergency' | 'document_erasure'; targetId: string | null;
  proposed: any; note: string | null; createdAt: string; by: string; doc: { kind: string; title: string; file_name: string } | null;
}
interface AwaitingDoc { id: string; studentId: string; student: string; admissionNo: string; kind: string; label: string; title: string; fileName: string; source: string; createdAt: string; canManage: boolean }
const KIND: Record<Req['kind'], string> = { address: 'Address', family: 'Family member', emergency: 'Emergency contacts', document_erasure: 'Erase a document' };

function Proposal({ r }: { r: Req }) {
  const p = r.proposed;
  if (r.kind === 'document_erasure') return r.doc ? <><b>{r.doc.title}</b> ({docLabel(r.doc.kind)})<div className="muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{r.doc.file_name}</div></> : <span className="muted">Already removed</span>;
  if (r.kind === 'address') return <>{addressLine(p.address as Address) || 'No address'}{p.permanent_same ? '' : <div className="muted" style={{ fontSize: 12 }}>Permanent: {addressLine(p.permanent_address as Address)}</div>}</>;
  if (r.kind === 'family') return <><b>{p.name}</b> ({RELATION_LABEL[p.relation as Relation]}){r.targetId ? ' · update' : ' · new'}
    <div className="muted" style={{ fontSize: 12 }}>{[p.phone, p.email, p.education ? EDUCATION_LABEL[p.education as Education] : null, p.occupation].filter(Boolean).join(' · ')}</div></>;
  return <ol style={{ margin: 0, paddingLeft: 18 }}>{(p.list as any[]).map((e, i) => <li key={i}>{e.familyMemberId ? 'A family member on the record' : `${e.name} (${e.relation || 'contact'}) ${e.phone}`}</li>)}</ol>;
}

/** The registrar's queue of changes parents have proposed, and documents to check (only those, on the health officer's page). */
export default function Requests({ documentsOnly = false }: { documentsOnly?: boolean }) {
  const { data, error, reload } = useGet<{ requests: Req[]; documents: AwaitingDoc[]; can: { manage: boolean; decides: Req['kind'][] } }>('/api/admin/students/requests');
  const { call } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return documentsOnly ? null : <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div>;
  const decide = async (id: string, approve: boolean) => {
    setErr(null);
    try { await call('/api/admin/students/requests', 'POST', { id, approve, note: notes[id] ?? '' }); toast(approve ? 'Applied to the record.' : 'Rejected; the parent sees your note.'); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  // On the health page: the medical documents only.
  const docs = documentsOnly ? data.documents.filter(d => isMedical(d.kind)) : data.documents;
  const docPath = (d: AwaitingDoc) => `/api/admin/students/${d.studentId}/documents`;
  const checkDoc = async (d: AwaitingDoc, verify: boolean) => {
    setErr(null);
    try { await call(docPath(d), 'POST', verify ? { action: 'verify', docId: d.id } : { action: 'reject', docId: d.id, note: notes[d.id] ?? '' }); toast(verify ? 'Marked as verified against the original.' : 'Rejected; the parent sees your note.'); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  const openDoc = async (d: AwaitingDoc) => {
    setErr(null);
    try { await openDocument(call, docPath(d), { docId: d.id }); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open the document.'); }
  };
  return (
    <>
    {docs.length > 0 && (
      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Documents to check" sub="Sent by parents or loaded by an import. Open each, compare it with the original, then verify it or say what is wrong." />
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Sent</th><th>Student</th><th>Document</th><th>Check</th></tr></thead>
            <tbody>{docs.map(d => (
              <tr key={d.id}>
                <td>{fmtDate(d.createdAt)}<div className="muted" style={{ fontSize: 12 }}>{d.source === 'parent' ? 'Parent' : d.source === 'import' ? 'Import' : 'Office'}</div></td>
                <td><Link href={`/admin/students/${d.studentId}`}><b>{d.student}</b></Link><div className="muted" style={{ fontSize: 12 }}>{d.admissionNo}</div></td>
                <td><b>{d.title}</b>{d.title !== d.label && <div className="muted" style={{ fontSize: 12 }}>{d.label}</div>}<div className="muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{d.fileName}</div></td>
                <td><div style={{ display: 'grid', gap: 6, minWidth: 220 }}>
                  <button className="btn sm" onClick={() => openDoc(d)}>Open</button>
                  {d.canManage ? <>
                    <input className="cmp-in" placeholder="What is wrong (for a rejection)" aria-label="Note" value={notes[d.id] ?? ''} maxLength={300} onChange={e => setNotes(n => ({ ...n, [d.id]: e.target.value }))} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn sm pri" onClick={() => checkDoc(d, true)}>Verify</button>
                      <button className="btn sm" disabled={(notes[d.id] ?? '').trim().length < 3} onClick={() => checkDoc(d, false)}>Reject</button>
                    </div>
                  </> : <span className="muted">Waiting for the registrar</span>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    )}
    {documentsOnly ? toastEl : (
    <div className="card">
      {toastEl}
      <CardHead title="Changes parents have asked for" sub="Nothing changes on a record until it is applied here. A rejection needs a note, which the parent sees." />
      {err && <div className="note err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {!data.requests.length ? <Empty icon={<ChatCircleText size={26} weight="duotone" />} title="Nothing waiting">Parents propose changes to addresses, family and emergency contacts, and ask for documents to be erased, from their portal.</Empty> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Asked</th><th>Student</th><th>What</th><th>Proposed</th><th>Decision</th></tr></thead>
            <tbody>{data.requests.map(r => (
              <tr key={r.id}>
                <td>{fmtDate(r.createdAt)}<div className="muted" style={{ fontSize: 12 }}>{r.by}</div></td>
                <td><Link href={`/admin/students/${r.studentId}`}><b>{r.student}</b></Link><div className="muted" style={{ fontSize: 12 }}>{r.admissionNo}</div></td>
                <td><Chip tone="b">{KIND[r.kind].toUpperCase()}</Chip>{r.note && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{r.note}</div>}</td>
                <td><Proposal r={r} /></td>
                <td>{data.can.decides.includes(r.kind) ? (
                  <div style={{ display: 'grid', gap: 6, minWidth: 220 }}>
                    <input className="cmp-in" placeholder="Note for the parent" aria-label="Note" value={notes[r.id] ?? ''} maxLength={300} onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn sm pri" onClick={() => decide(r.id, true)}>{r.kind === 'document_erasure' ? 'Erase it' : 'Apply'}</button>
                      <button className="btn sm" disabled={(notes[r.id] ?? '').trim().length < 3} onClick={() => decide(r.id, false)}>{r.kind === 'document_erasure' ? 'Decline' : 'Reject'}</button>
                    </div>
                  </div>
                ) : <span className="muted">Waiting for the registrar</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
    )}
    </>
  );
}
