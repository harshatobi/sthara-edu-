'use client';

import { useState } from 'react';
import { Field, Workspace } from '@/components/admin/kit';
import { DOC_GROUP_LABEL, DOC_KINDS, DOC_MAX_BYTES, docLabel, type DocGroup } from '@/lib/students/documents';

/** Documents on a student's record: the upload form and the open and upload calls the office and the parent portal share. */

/** A POST to an app API route that throws the route's message (the admin desk's call, or the parent portal's). */
export type Call = <T = any>(path: string, method: 'POST', body: unknown) => Promise<T>;

/** Opens a document in a new tab (PDFs and images) or downloads it; the server records the look. */
export async function openDocument(call: Call, path: string, body: Record<string, unknown>) {
  // Opened before the request so the browser doesn't treat the new tab as a pop-up.
  const tab = window.open('', '_blank');
  try {
    const r = await call<{ url: string; inline: boolean }>(path, 'POST', { ...body, action: 'open' });
    if (tab && r.inline) { tab.opener = null; tab.location.href = r.url; return; }
    tab?.close();
    const a = document.createElement('a');
    a.href = r.url; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { tab?.close(); throw e; }
}

/** The upload form, shared with the parent portal: the file goes straight to storage, then the details are saved. */
export function DocumentForm({ kinds, office, busyLabel, onClose, onSend }: {
  kinds: string[]; office: boolean; busyLabel: string; onClose: () => void;
  onSend: (file: File, meta: Record<string, unknown>) => Promise<void>;
}) {
  const [kind, setKind] = useState(kinds[0] ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [no, setNo] = useState('');
  const [issued, setIssued] = useState('');
  const [valid, setValid] = useState('');
  const [seen, setSeen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const big = !!file && file.size > DOC_MAX_BYTES;
  const send = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    try { await onSend(file, { kind, title, document_no: no, issued_on: issued || null, valid_until: valid || null, ...(office ? { verified: seen } : {}) }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not upload.'); setBusy(false); }
  };
  return (
    <Workspace title={office ? 'Add a document' : 'Send a document to the school'} sub="Up to 25 MB. PDFs and photos open in the browser; other files download." onClose={onClose}
      actions={<button className="btn pri" disabled={!file || !kind || big || busy} onClick={send}>{busy ? busyLabel : office ? 'Add' : 'Send'}</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <div className="g2">
        <Field label="WHAT IT IS" htmlFor="d-kind"><select id="d-kind" className="cmp-sel" value={kind} onChange={e => setKind(e.target.value)}>
          {(Object.keys(DOC_GROUP_LABEL) as DocGroup[]).map(g => {
            const ks = kinds.filter(k => (DOC_KINDS[k as keyof typeof DOC_KINDS]?.group ?? 'other') === g);
            return ks.length ? <optgroup key={g} label={DOC_GROUP_LABEL[g]}>{ks.map(k => <option key={k} value={k}>{docLabel(k)}</option>)}</optgroup> : null;
          })}
        </select></Field>
        <Field label="THE FILE" htmlFor="d-file"><input id="d-file" type="file" className="cmp-in" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field>
        <Field label="TITLE (OPTIONAL)" htmlFor="d-title" hint={`Blank uses "${docLabel(kind)}".`}><input id="d-title" className="cmp-in" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} /></Field>
        <Field label="DOCUMENT NUMBER (OPTIONAL)" htmlFor="d-no"><input id="d-no" className="cmp-in" value={no} maxLength={60} onChange={e => setNo(e.target.value)} /></Field>
        <Field label="ISSUED ON (OPTIONAL)" htmlFor="d-issued"><input id="d-issued" type="date" className="cmp-in" value={issued} onChange={e => setIssued(e.target.value)} /></Field>
        <Field label="VALID UNTIL (OPTIONAL)" htmlFor="d-valid" hint="For certificates that expire, like income or caste."><input id="d-valid" type="date" className="cmp-in" value={valid} onChange={e => setValid(e.target.value)} /></Field>
      </div>
      {big && <div className="note err" role="alert" style={{ marginTop: 8 }}>That file is over 25 MB. Scan at a lower resolution or split it.</div>}
      {office && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginTop: 10 }}><input type="checkbox" checked={seen} onChange={e => setSeen(e.target.checked)} /> I have seen the original: mark it verified</label>}
    </Workspace>
  );
}

/** Puts one file in storage through a one-time link, then saves the record. */
export async function uploadDocument(call: Call, path: string, extra: Record<string, unknown>, file: File, meta: Record<string, unknown>) {
  const up = await call<{ url: string; path: string }>(path, 'POST', { ...extra, action: 'upload-url', kind: meta.kind, fileName: file.name, fileBytes: file.size });
  const put = await fetch(up.url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' }, body: file });
  if (!put.ok) throw new Error('The upload did not finish. Check your connection and try again.');
  await call(path, 'POST', { ...extra, ...meta, action: 'upload-done', path: up.path, fileName: file.name });
}

