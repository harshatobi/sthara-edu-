'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CertificateIcon as Certificate } from '@phosphor-icons/react/dist/ssr/Certificate';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { DEFAULT_PREFIX, KIND_TITLE, PLACEHOLDERS } from '@/lib/certificates/certs';
import { CardHead, DeskGate, Field, Workspace } from '../kit';
import { CertTable, CertificateWorkspace, type Can, type CertRow, type CertType } from './CertificateWork';

interface Settings { tcMode: 'sthara' | 'portal'; udiseCode: string | null; principalName: string | null; signature: string | null; stamp: string | null }
interface Data { certificates: CertRow[]; types: CertType[]; settings: Settings; can: Can }

const TABS = [['approve', 'To approve'], ['register', 'Register'], ['setup', 'Set up']] as const;

/** Admin › Certificates: the principal's queue, the permanent register, and setting certificates up. */
export default function CertificatesPage() {
  return <DeskGate need={['certificates.prepare', 'certificates.approve', 'certificates.setup']}>{() => <Body />}</DeskGate>;
}

function Body() {
  const params = useSearchParams();
  const path = usePathname();
  const [q, setQ] = useState('');
  const { data, error, reload } = useGet<Data>(`/api/admin/certificates${q.trim().length >= 2 ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  const [open, setOpen] = useState<string | null>(null);
  const can = data?.can;
  const tabs = TABS.filter(([k]) => k === 'approve' ? can?.approve || can?.prepare : k === 'setup' ? can?.setup : true);
  const tab = tabs.find(([k]) => k === params.get('tab'))?.[0] ?? tabs[0]?.[0] ?? 'register';
  const pending = (data?.certificates ?? []).filter(c => c.status === 'pending' || c.status === 'draft');
  return (
    <>
      <PageBar eyebrow="CERTIFICATES" title="Certificates" sub="Transfer, bonafide, character and fee certificates, and the school's own. Numbered for good, approved by the principal, checkable by QR." />
      <div className="tabs" role="tablist" aria-label="Certificates" style={{ marginBottom: 20 }}>
        {tabs.map(([k, label]) => <Link key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} href={`${path}?tab=${k}`}>{label}{k === 'approve' && pending.filter(c => c.status === 'pending').length ? ` (${pending.filter(c => c.status === 'pending').length})` : ''}</Link>)}
      </div>
      {error && <div className="note err" role="alert">{error}</div>}
      {!data ? <div className="card">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div> : (
        <>
          {tab === 'approve' && (
            <div className="card">
              <CardHead title="Waiting" sub="Drafts the registrar is preparing, and certificates waiting for the principal. Prepare a new one from the student's record." />
              {!pending.length ? <Empty icon={<Certificate size={26} weight="duotone" />} title="Nothing waiting" /> : <CertTable rows={pending} onOpen={setOpen} />}
            </div>
          )}
          {tab === 'register' && (
            <div className="card">
              <CardHead title="The register" sub="Every certificate issued, newest first. Cancelled ones stay, marked." right={<input className="cmp-in" style={{ maxWidth: 260 }} placeholder="Search number, name or admission no." aria-label="Search" value={q} onChange={e => setQ(e.target.value)} />} />
              {(() => { const rows = data.certificates.filter(c => c.status === 'issued' || c.status === 'cancelled'); return !rows.length ? <Empty icon={<Certificate size={26} weight="duotone" />} title={q ? 'No match' : 'Nothing issued yet'} /> : <CertTable rows={rows} onOpen={setOpen} />; })()}
            </div>
          )}
          {tab === 'setup' && can?.setup && <Setup data={data} onSaved={reload} />}
        </>
      )}
      {open && <CertificateWorkspace id={open} onClose={() => { setOpen(null); reload(); }} />}
    </>
  );
}

const readImage = (f: File) => new Promise<string>((res, rej) => {
  if (!/^image\/(png|jpeg)$/.test(f.type)) return rej(new Error('Use a PNG or JPEG.'));
  if (f.size > 290_000) return rej(new Error('Keep the image under 290 KB.'));
  const r = new FileReader();
  r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read the image.'));
  r.readAsDataURL(f);
});

function Setup({ data, onSaved }: { data: Data; onSaved: () => void }) {
  const { call } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const s = data.settings;
  const [mode, setMode] = useState(s.tcMode);
  const [udise, setUdise] = useState(s.udiseCode ?? '');
  const [principal, setPrincipal] = useState(s.principalName ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<CertType | 'new' | null>(null);
  const save = async (body: Record<string, unknown>, ok: string) => {
    setErr(null);
    try { await call('/api/admin/certificates', 'POST', { action: 'settings-save', ...body }); toast(ok); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  const image = async (k: 'signature' | 'stamp', f: File | undefined) => {
    if (!f) return;
    try { await save({ [k]: await readImage(f) }, k === 'signature' ? 'Signature saved.' : 'Stamp saved.'); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not read it.'); }
  };
  return (
    <>
      {toastEl}
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <div className="g2">
        <div className="card">
          <CardHead title="On every certificate" sub="The logo, address and affiliation number come from the report card settings (Exams)." />
          <Field label="PRINCIPAL'S NAME" htmlFor="cs-name"><input id="cs-name" className="cmp-in" value={principal} maxLength={120} onChange={e => setPrincipal(e.target.value)} /></Field>
          <Field label="SCHOOL UDISE CODE" htmlFor="cs-udise" hint="11 digits; printed on the TC."><input id="cs-udise" className="cmp-in" inputMode="numeric" maxLength={11} value={udise} onChange={e => setUdise(e.target.value)} /></Field>
          <button className="btn pri" onClick={() => save({ principalName: principal, udiseCode: udise }, 'Saved.')}>Save</button>
          <div className="g2" style={{ marginTop: 18 }}>
            {(['signature', 'stamp'] as const).map(k => (
              <div key={k}>
                <span className="lbl">{k === 'signature' ? "PRINCIPAL'S SIGNATURE" : 'SCHOOL STAMP'}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s[k] && s[k] !== 'set' ? <img src={s[k]!} alt={k} style={{ display: 'block', maxWidth: 160, maxHeight: 80, margin: '8px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 6 }} /> : <p className="muted" style={{ fontSize: 13 }}>Not added. Certificates print a line to sign by hand.</p>}
                <div style={{ display: 'flex', gap: 6 }}>
                  <label className="btn sm" style={{ cursor: 'pointer' }}>{s[k] ? 'Replace' : 'Add'}<input type="file" accept="image/png,image/jpeg" hidden onChange={e => { void image(k, e.target.files?.[0]); e.target.value = ''; }} /></label>
                  {s[k] && <button className="btn sm" onClick={() => save({ [k]: null }, 'Removed.')}>Remove</button>}
                </div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>A PNG with a transparent background prints best. They appear only on approved certificates.</p>
        </div>
        <div className="card">
          <CardHead title="Transfer certificates" />
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, marginBottom: 10 }}>
            <input type="radio" name="tcmode" checked={mode === 'sthara'} onChange={() => setMode('sthara')} /> <span><b>Sthara prints them</b> in the CBSE format (Annexure-I), with the school&apos;s numbering.</span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, marginBottom: 14 }}>
            <input type="radio" name="tcmode" checked={mode === 'portal'} onChange={() => setMode('portal')} /> <span><b>The state portal makes them</b> (EMIS in Tamil Nadu, SATS in Karnataka, Child Info in Andhra Pradesh). Sthara runs the approval, dues and leaving, then records the portal&apos;s TC number and PDF.</span>
          </label>
          {mode !== s.tcMode && <button className="btn pri" onClick={() => save({ tcMode: mode }, 'Saved.')}>Save</button>}
        </div>
      </div>
      <div className="card" style={{ marginTop: 20 }}>
        <CardHead title="Kinds of certificate" sub="Numbers run forever per kind (TC/0001, TC/0002 ...). The school's own certificates get the same numbering, approval and QR."
          right={<button className="btn sm pri" onClick={() => setEditing('new')}><Plus size={14} weight="bold" /> Add a certificate</button>} />
        <div style={{ overflowX: 'auto' }}><table className="tbl">
          <thead><tr><th>Certificate</th><th>Prefix</th><th>Approval</th><th /></tr></thead>
          <tbody>{data.types.map(t => (
            <tr key={t.id}>
              <td><b>{t.title}</b>{!t.active && <> <Chip tone="n">OFF</Chip></>}</td>
              <td className="mono">{t.prefix}</td>
              <td>{t.needs_approval ? 'The principal approves' : 'Issued by the registrar'}</td>
              <td><button className="btn sm" onClick={() => setEditing(t)}>Edit</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
      {editing && <TypeForm t={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast('Saved.'); onSaved(); }} />}
    </>
  );
}

function TypeForm({ t, onClose, onSaved }: { t: CertType | null; onClose: () => void; onSaved: () => void }) {
  const { call } = useAdminDesk();
  const kind = t?.kind ?? 'custom';
  const [title, setTitle] = useState(t?.title ?? '');
  const [prefix, setPrefix] = useState(t?.prefix ?? '');
  const [body, setBody] = useState(t?.body ?? 'This is to certify that {student_name}, {child_of} {father_name}, admission number {admission_no}, is a student of {class} in {school_name} in the session {session}.');
  const [needs, setNeeds] = useState(t?.needs_approval ?? true);
  const [active, setActive] = useState(t?.active ?? true);
  const [err, setErr] = useState<string | null>(null);
  const wording = kind !== 'tc' && kind !== 'fee_paid';
  const go = async () => {
    setErr(null);
    try { await call('/api/admin/certificates', 'POST', { action: 'type-save', id: t?.id, title, prefix, ...(wording ? { body } : {}), needsApproval: needs, active }); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  return (
    <Workspace wide title={t ? `Edit: ${t.title}` : 'Add a certificate'} sub={kind === 'tc' ? 'The TC follows CBSE Annexure-I; only its prefix changes here.' : undefined} onClose={onClose}
      actions={<button className="btn pri" onClick={go}>Save</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <div className="g2">
        <Field label="TITLE" htmlFor="ct-title">{kind === 'custom' ? <input id="ct-title" className="cmp-in" value={title} maxLength={80} placeholder="Study certificate" onChange={e => setTitle(e.target.value)} /> : <input id="ct-title" className="cmp-in" value={KIND_TITLE[kind]} readOnly />}</Field>
        <Field label="NUMBER PREFIX" htmlFor="ct-prefix" hint={`Letters, digits and / - . (${kind === 'custom' ? 'for example STD' : `default ${DEFAULT_PREFIX[kind]}`}).`}><input id="ct-prefix" className="cmp-in" value={prefix} maxLength={12} onChange={e => setPrefix(e.target.value.toUpperCase())} /></Field>
      </div>
      {wording && (
        <>
          <Field label="WORDING" htmlFor="ct-body" hint="Fields in braces are filled from the record when the certificate is prepared."><textarea id="ct-body" className="cmp-in" rows={8} value={body} maxLength={4000} onChange={e => setBody(e.target.value)} /></Field>
          <details style={{ marginBottom: 12 }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Fields you can use</summary>
            <table className="tbl" style={{ marginTop: 8 }}><tbody>{Object.entries(PLACEHOLDERS).map(([k, v]) => <tr key={k}><td className="mono">{`{${k}}`}</td><td>{v}</td></tr>)}</tbody></table>
          </details>
        </>
      )}
      {kind !== 'tc' && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={needs} onChange={e => setNeeds(e.target.checked)} /> The principal approves each one</label>}
      {kind === 'custom' && t && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginTop: 8 }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> In use (off hides it when preparing; issued ones stay)</label>}
    </Workspace>
  );
}
