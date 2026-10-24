'use client';

import { useState } from 'react';
import { CertificateIcon as Certificate } from '@phosphor-icons/react/dist/ssr/Certificate';
import { FilePdfIcon as FilePdf } from '@phosphor-icons/react/dist/ssr/FilePdf';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip, Empty, Skeleton, type Tone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { fmtDate } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { TC_EXTRA, TC_FIELDS, TC_HEADER, TC_REQUIRED, type CertKind, type CertStatus } from '@/lib/certificates/certs';
import { CardHead, Field, Workspace } from '../kit';

export interface CertType { id: string; kind: CertKind; title: string; body: string | null; prefix: string; needs_approval: boolean; active: boolean }
export interface CertRow {
  id: string; studentId: string; student: string; admissionNo: string; kind: CertKind; title: string; status: CertStatus; number: string | null; copyNo: number;
  issuedOn: string | null; source: string; portalRef: string | null; hasPdf: boolean; preparedBy: string | null; approvedBy: string | null; returnedNote: string | null;
  cancelReason: string | null; dues: number | null; createdAt: string;
}
export interface Can { prepare: boolean; approve: boolean; setup: boolean }

export const STATUS: Record<CertStatus, { label: string; tone: Tone }> = {
  draft: { label: 'DRAFT', tone: 'n' }, pending: { label: 'WITH THE PRINCIPAL', tone: 'b' }, issued: { label: 'ISSUED', tone: 'g' }, cancelled: { label: 'CANCELLED', tone: 'r' },
};
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** Opens the certificate's PDF in a new tab (a DRAFT preview until it is issued). */
export function useOpenPdf() {
  const { call } = useAdminDesk();
  return async (id: string) => {
    const tab = window.open('', '_blank');
    try {
      const r = await call<{ url: string; dropped: string[] }>('/api/admin/certificates', 'POST', { action: 'pdf', id });
      if (tab) { tab.opener = null; tab.location.href = r.url; }
      return r.dropped;
    } catch (e) { tab?.close(); throw e; }
  };
}

/** A table of certificates; a row opens it. */
export function CertTable({ rows, onOpen, showStudent = true }: { rows: CertRow[]; onOpen: (id: string) => void; showStudent?: boolean }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tbl">
        <thead><tr><th>Number</th><th>Certificate</th>{showStudent && <th>Student</th>}<th>Issued</th><th>Status</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id} className="click" tabIndex={0} onClick={() => onOpen(r.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r.id); }}>
            <td><b>{r.number ?? r.portalRef ?? '—'}</b>{r.copyNo > 0 && <div className="muted" style={{ fontSize: 12 }}>Duplicate {r.copyNo}</div>}</td>
            <td>{r.title}{r.source === 'import' && <div className="muted" style={{ fontSize: 12 }}>Issued before Sthara</div>}{r.source === 'portal' && <div className="muted" style={{ fontSize: 12 }}>From the state portal</div>}</td>
            {showStudent && <td><b>{r.student}</b><div className="muted" style={{ fontSize: 12 }}>{r.admissionNo}</div></td>}
            <td>{r.issuedOn ? fmtDate(r.issuedOn) : <span className="muted">{'—'}</span>}</td>
            <td><Chip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Chip>{r.returnedNote && r.status === 'draft' && <div className="muted" style={{ fontSize: 12 }}>Sent back: {r.returnedNote}</div>}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** The student record's Certificates tab: what was issued, and preparing a new one. */
export function StudentCertificates({ studentId, active }: { studentId: string; active: boolean }) {
  const { data, error, reload } = useGet<{ certificates: CertRow[]; types: CertType[]; can: Can }>(`/api/admin/certificates?studentId=${studentId}`);
  const [open, setOpen] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div>;
  return (
    <div className="card">
      <CardHead title="Certificates" sub="Every certificate issued to this student, with its number. Cancelled ones stay on the register."
        right={data.can.prepare && active ? <button className="btn sm pri" onClick={() => setPreparing(true)}><Plus size={14} weight="bold" /> Prepare a certificate</button> : undefined} />
      {!data.certificates.length ? <Empty icon={<Certificate size={26} weight="duotone" />} title="None yet">Transfer, bonafide, character and fee certificates are prepared here and approved by the principal.</Empty>
        : <CertTable rows={data.certificates} onOpen={setOpen} showStudent={false} />}
      {preparing && <Prepare studentId={studentId} types={data.types} onClose={() => setPreparing(false)} onMade={id => { setPreparing(false); reload(); setOpen(id); }} />}
      {open && <CertificateWorkspace id={open} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function Prepare({ studentId, types, onClose, onMade }: { studentId: string; types: CertType[]; onClose: () => void; onMade: (id: string) => void }) {
  const { call } = useAdminDesk();
  const usable = types.filter(t => t.active);
  const [typeId, setTypeId] = useState(usable[0]?.id ?? '');
  const [purpose, setPurpose] = useState('');
  const [conduct, setConduct] = useState('good');
  const thisYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [fy, setFy] = useState(thisYear - 1);
  const [err, setErr] = useState<string | null>(null);
  const t = usable.find(x => x.id === typeId);
  const uses = (k: string) => !!t?.body?.includes(`{${k}}`);
  const go = async () => {
    setErr(null);
    try { const r = await call<{ id: string }>('/api/admin/certificates', 'POST', { action: 'prepare', studentId, typeId, purpose, conduct, fyStart: fy }); onMade(r.id); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not start it.'); }
  };
  return (
    <Workspace title="Prepare a certificate" sub="Filled from the record. You can correct anything before it goes to the principal." onClose={onClose}
      actions={<button className="btn pri" disabled={!t || (uses('purpose') && purpose.trim().length < 3)} onClick={go}>Prepare</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <Field label="WHICH CERTIFICATE" htmlFor="cp-type"><select id="cp-type" className="cmp-sel" value={typeId} onChange={e => setTypeId(e.target.value)}>
        {usable.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
      </select></Field>
      {uses('purpose') && <Field label="WHAT IT IS FOR" htmlFor="cp-purpose" hint="For example: a passport application, opening a bank account."><input id="cp-purpose" className="cmp-in" value={purpose} maxLength={200} onChange={e => setPurpose(e.target.value)} /></Field>}
      {uses('conduct') && <Field label="CONDUCT AND CHARACTER" htmlFor="cp-conduct"><input id="cp-conduct" className="cmp-in" value={conduct} maxLength={60} onChange={e => setConduct(e.target.value)} /></Field>}
      {t?.kind === 'fee_paid' && <Field label="FINANCIAL YEAR" htmlFor="cp-fy" hint="April to March: the year parents claim the tuition fee deduction for.">
        <select id="cp-fy" className="cmp-sel" value={fy} onChange={e => setFy(Number(e.target.value))}>
          {[0, 1, 2, 3].map(k => thisYear - k).map(y => <option key={y} value={y}>{y}-{String((y + 1) % 100).padStart(2, '0')}</option>)}
        </select></Field>}
      {t?.kind === 'tc' && <p className="muted" style={{ fontSize: 13 }}>Approving the TC marks the student as left on the date of leaving you set. Unpaid dues stop it from Nursery to UKG and Classes 9 to 12 unless the principal approves with a reason; Classes 1 to 8 always get it (RTE s.5(3)).</p>}
    </Workspace>
  );
}

interface One {
  cert: { id: string; status: CertStatus; number: string | null; copy_no: number; data: Record<string, any>; issued_on: string | null; returned_note: string | null; cancel_reason: string | null;
    source: string; portal_ref: string | null; pdf_path: string | null; dues_override: string | null; updated_at: string };
  type: CertType; student: { id: string; name: string; admissionNo: string; status: string }; dues: number | null; duesBlock: boolean; tcMode: 'sthara' | 'portal';
  missing: string[]; can: Can;
}

/** One certificate: the registrar edits a draft; the principal approves or sends it back; issued ones print, cancel or reissue. */
export function CertificateWorkspace({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error, reload } = useGet<One>(`/api/admin/certificates?id=${id}`);
  const [toast, toastEl] = useToast();
  if (error) return <Workspace title="Certificate" onClose={onClose}><div className="note err" role="alert">{error}</div></Workspace>;
  if (!data) return <Workspace title="Certificate" onClose={onClose}>{[0, 1, 2, 3].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</Workspace>;
  // A fresh editor whenever the certificate changes, so the form starts from what was saved.
  return <>{toastEl}<Editor key={`${data.cert.id}:${data.cert.updated_at}`} data={data} reload={reload} onClose={onClose} toast={toast} /></>;
}

function Editor({ data, reload, onClose, toast }: { data: One; reload: () => void; onClose: () => void; toast: (msg: string) => void }) {
  const { call } = useAdminDesk();
  const openPdf = useOpenPdf();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(data.cert.data).filter(([, v]) => typeof v === 'string')));
  const [note, setNote] = useState('');
  const [portal, setPortal] = useState({ ref: '', file: null as File | null });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const c = data.cert, t = data.type;
  const draft = c.status === 'draft' && data.can.prepare;
  const changed = Object.entries(vals).some(([k, v]) => v !== (c.data[k] ?? ''));
  const post = async (body: Record<string, unknown>, ok: string, after?: () => void) => {
    setErr(null); setBusy(true);
    try { await call('/api/admin/certificates', 'POST', { id: c.id, ...body }); toast(ok); setNote(''); reload(); after?.(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  };
  const save = () => post({ action: 'save', data: vals }, 'Saved.');
  const preview = async () => {
    setErr(null);
    if (draft && changed) await call('/api/admin/certificates', 'POST', { action: 'save', id: c.id, data: vals }).catch(() => undefined);
    try {
      const dropped = await openPdf(c.id);
      if (dropped.length) setErr(`The certificate font can't print ${dropped.join(' ')}; write those parts in English letters.`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open it.'); }
  };
  const recordPortal = async () => {
    setErr(null); setBusy(true);
    try {
      let path: string | undefined;
      if (portal.file) {
        const ext = (portal.file.name.split('.').pop() || '').toLowerCase();
        const up = await call<{ url: string; path: string }>('/api/admin/certificates', 'POST', { action: 'portal-url', id: c.id, ext });
        const put = await fetch(up.url, { method: 'PUT', headers: { 'Content-Type': portal.file.type || 'application/pdf', 'x-upsert': 'true' }, body: portal.file });
        if (!put.ok) throw new Error('The upload did not finish. Try again.');
        path = up.path;
      }
      await call('/api/admin/certificates', 'POST', { action: 'portal-record', id: c.id, ref: portal.ref, path });
      toast('Recorded.'); reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  };
  const field = (key: string, label: string, long = false) => (
    <Field key={key} label={label.toUpperCase()} htmlFor={`cf-${key}`}>
      {long ? <textarea id={`cf-${key}`} className="cmp-in" rows={2} value={vals[key] ?? ''} readOnly={!draft} onChange={e => setVals(v => ({ ...v, [key]: e.target.value }))} />
        : <input id={`cf-${key}`} className="cmp-in" type={key === 'leaving_on' ? 'date' : 'text'} value={vals[key] ?? ''} readOnly={!draft} onChange={e => setVals(v => ({ ...v, [key]: e.target.value }))}
          aria-invalid={draft && TC_REQUIRED.includes(key) && !(vals[key] ?? '').trim()} />}
    </Field>
  );
  const title = `${t.title}${c.number ? ` ${c.number}` : ''}${c.copy_no > 0 ? ' (duplicate)' : ''}`;
  return (
    <Workspace wide title={title} sub={`${data.student.name} · ${data.student.admissionNo}`} onClose={onClose}
      actions={<>
        <button className="btn" onClick={preview}><FilePdf size={16} /> {c.status === 'issued' || c.status === 'cancelled' ? 'Open PDF' : 'Preview'}</button>
        {draft && <button className="btn" disabled={busy || !changed} onClick={save}>Save</button>}
        {draft && <button className="btn pri" disabled={busy} onClick={async () => { if (changed) await call('/api/admin/certificates', 'POST', { action: 'save', id: c.id, data: vals }).catch(() => undefined); post({ action: 'submit' }, t.needs_approval ? 'Sent to the principal.' : 'Issued.'); }}>{t.needs_approval ? 'Send for approval' : 'Issue'}</button>}
      </>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <Chip tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Chip>
        {c.issued_on && <span className="muted">Issued {fmtDate(c.issued_on)}</span>}
        {c.source === 'import' && <span className="muted">Issued before Sthara</span>}
      </div>
      {c.status === 'draft' && c.returned_note && <div className="note info" style={{ marginBottom: 14 }}><b>The principal sent it back:</b> {c.returned_note}</div>}
      {c.status === 'cancelled' && <div className="note err" style={{ marginBottom: 14 }}>Cancelled: {c.cancel_reason}</div>}
      {t.kind === 'tc' && data.dues != null && data.dues > 0 && (c.status === 'draft' || c.status === 'pending') && (
        <div className={`note ${data.duesBlock ? 'err' : 'info'}`} style={{ marginBottom: 14 }}>
          {rupees(data.dues)} is unpaid. {data.duesBlock ? 'Collect it before the TC, or the principal approves with a reason (recorded).' : 'Classes 1 to 8 get the TC anyway (RTE s.5(3)); the dues stay on the record.'}
        </div>
      )}
      {c.dues_override && <div className="note info" style={{ marginBottom: 14 }}>Approved with dues unpaid: {c.dues_override}</div>}
      {t.kind === 'tc' && data.tcMode === 'portal' && c.copy_no === 0 && (c.status === 'draft' || c.status === 'pending') && (
        <div className="note info" style={{ marginBottom: 14 }}>This school&apos;s TCs come from the state portal. After approval, make the TC there from these values, then record its number here.</div>
      )}

      {t.kind === 'tc' ? (
        <>
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: '4px 0 10px' }}>Numbers</h3>
          <div className="g2">{TC_HEADER.map(f => field(f.key, f.label))}</div>
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: '14px 0 10px' }}>The certificate (CBSE Annexure-I)</h3>
          <div className="g2">{[...TC_FIELDS.filter(f => f.key !== 'issued_on'), ...TC_EXTRA].map(f => field(f.key, `${f.n ? `${f.n}. ` : ''}${f.label}`, f.long))}</div>
          {c.status !== 'draft' && c.data.issued_on && <p className="muted">20. Date of issue: {c.data.issued_on}</p>}
        </>
      ) : (
        <>
          <Field label="WORDING" htmlFor="cf-body" hint={draft ? 'Filled from the record. Correct anything; a blank line (_____) must be filled before it can be sent.' : undefined}>
            <textarea id="cf-body" className="cmp-in" rows={8} value={vals.body ?? ''} readOnly={!draft} onChange={e => setVals(v => ({ ...v, body: e.target.value }))} />
          </Field>
          {t.kind === 'fee_paid' && Array.isArray(c.data.rows) && (
            <div style={{ overflowX: 'auto' }}><table className="tbl">
              <thead><tr><th>Paid on</th><th>Receipt</th><th>For</th><th className="r">Amount</th></tr></thead>
              <tbody>{(c.data.rows as { date: string; receipt: string; label: string; amount: number }[]).map((r, i) => <tr key={i}><td>{fmtDate(r.date)}</td><td>{r.receipt}</td><td>{r.label}</td><td className="r">{rupees(r.amount)}</td></tr>)}
                <tr><td colSpan={3}><b>Total</b></td><td className="r"><b>{rupees(Number(c.data.total ?? 0))}</b></td></tr></tbody>
            </table></div>
          )}
        </>
      )}

      {c.status === 'pending' && data.can.approve && (
        <div className="card" style={{ marginTop: 16 }}>
          <CardHead title="Your decision" sub="Approving gives the next number, freezes every value and stores the PDF." />
          <Field label={t.kind === 'tc' && data.duesBlock && (data.dues ?? 0) > 0 ? 'REASON TO ISSUE WITH DUES UNPAID, OR WHAT TO CHANGE' : 'NOTE (FOR SENDING IT BACK)'} htmlFor="cf-note">
            <input id="cf-note" className="cmp-in" value={note} maxLength={300} onChange={e => setNote(e.target.value)} />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn pri" disabled={busy} onClick={() => post({ action: 'approve', override: note }, 'Approved and issued.')}>Approve and issue</button>
            <button className="btn" disabled={busy || note.trim().length < 3} onClick={() => post({ action: 'send-back', note }, 'Sent back to the registrar.')}>Send back</button>
          </div>
        </div>
      )}
      {c.status === 'issued' && c.source === 'portal' && data.can.prepare && (
        <div className="card" style={{ marginTop: 16 }}>
          <CardHead title="The TC from the state portal" sub={c.portal_ref ? `Recorded as ${c.portal_ref}.` : 'Approved. Make the TC on the state portal, then record its number and upload its PDF.'} />
          <div className="g2">
            <Field label="TC NUMBER ON THE PORTAL" htmlFor="cf-ref"><input id="cf-ref" className="cmp-in" value={portal.ref} maxLength={60} onChange={e => setPortal(p => ({ ...p, ref: e.target.value }))} placeholder={c.portal_ref ?? ''} /></Field>
            <Field label="THE PORTAL'S PDF" htmlFor="cf-file"><input id="cf-file" type="file" accept="application/pdf,image/jpeg,image/png" className="cmp-in" onChange={e => setPortal(p => ({ ...p, file: e.target.files?.[0] ?? null }))} /></Field>
          </div>
          <button className="btn pri" disabled={busy || !portal.ref.trim()} onClick={recordPortal}>Record</button>
        </div>
      )}
      {(c.status === 'issued' || (c.status === 'draft' && data.can.prepare)) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {c.status === 'issued' && data.can.approve && <>
            <div style={{ flex: '1 1 240px' }}><Field label="REASON TO CANCEL" htmlFor="cf-cancel"><input id="cf-cancel" className="cmp-in" value={note} maxLength={300} onChange={e => setNote(e.target.value)} /></Field></div>
            <button className="btn" disabled={busy || note.trim().length < 3} onClick={() => post({ action: 'cancel', reason: note }, 'Cancelled. It stays on the register.')}>Cancel the certificate</button>
            {c.number && <button className="btn" disabled={busy} onClick={() => post({ action: 'duplicate' }, 'Duplicate prepared. Open it from the list.', onClose)}>Reissue as duplicate</button>}
          </>}
          {c.status === 'draft' && <button className="btn" disabled={busy} onClick={() => post({ action: 'cancel', reason: 'Discarded' }, 'Draft discarded.', onClose)}>Discard draft</button>}
        </div>
      )}
    </Workspace>
  );
}
