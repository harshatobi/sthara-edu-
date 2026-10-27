'use client';

import { useState } from 'react';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { ArrowSquareOutIcon as ArrowSquareOut } from '@phosphor-icons/react/dist/ssr/ArrowSquareOut';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { Chip, Empty, Skeleton, type Tone } from '@/components/canon/ui';
import { useGet } from '@/components/canon/useGet';
import { DocumentForm, openDocument, uploadDocument } from '@/components/students/documentForms';
import { CHECK_LABEL, CHECK_TONE } from '@/components/admin/students/DocumentsPanel';
import { APPLICATION_FIELDS, MAX_FAMILY, type AgeState, type ApplicationForm, type Checks } from '@/lib/admin/application';
import { fmtDate } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { DOC_KIND_KEYS, docLabel, isMedical, type DocStatus } from '@/lib/students/documents';
import {
  ADDRESS_PARTS, EDUCATION, EDUCATION_LABEL, GROUPS, RELATION_LABEL, RELATIONS, type Address, type Field as RegField,
} from '@/lib/students/register';
import { CardHead, Field, Workspace } from '../kit';

interface AppDoc {
  id: string; kind: string; label: string; title: string; document_no: string | null; issued_on: string | null; valid_until: string | null;
  file_name: string; status: DocStatus; source: 'office' | 'family'; reject_note: string | null; created_at: string; moved_to: string | null;
  uploadedBy: string | null; verifiedBy: string | null; verified_at: string | null; canManage: boolean;
}
interface AppData {
  form: ApplicationForm; appliedOn: string | null; channel: string;
  completeness: { missing: string[]; done: boolean };
  docs: AppDoc[]; checks: Checks; hidden: number;
}

const DOC_PATH = '/api/admin/admissions/documents';
const AGE_TONE: Record<AgeState, Tone> = { ok: 'g', young: 'r', old: 'r', unknown: 'a' };
const AGE_LABEL: Record<AgeState, string> = { ok: 'RIGHT AGE', young: 'TOO YOUNG', old: 'OVER AGE', unknown: 'NO DATE OF BIRTH' };
const STATUS_TONE: Record<DocStatus, Tone> = { verified: 'g', awaiting: 'b', rejected: 'r' };
const STATUS_LABEL: Record<DocStatus, string> = { verified: 'VERIFIED', awaiting: 'TO CHECK', rejected: 'REJECTED' };

/** The application behind an applicant: the checks, the full form, and the documents with it. */
export default function ApplicationPanel({ applicantId, canManage, admitted, onChanged }: {
  applicantId: string; canManage: boolean; admitted: boolean; onChanged: (m: string) => void;
}) {
  const { data, error, reload } = useGet<AppData>(`/api/admin/admissions/application?id=${applicantId}`);
  const [tab, setTab] = useState<'form' | 'docs'>('form');
  if (error) return <div className="note err" role="alert" style={{ marginBottom: 16 }}>{error}</div>;
  if (!data) return <div className="card" style={{ marginBottom: 16 }}>{[0, 1, 2].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div>;
  const done = (m: string) => { reload(); onChanged(m); };
  return (
    <>
      <ChecksCard data={data} />
      <div className="seg" role="tablist" aria-label="Application" style={{ margin: '0 0 14px' }}>
        <button role="tab" aria-selected={tab === 'form'} className={tab === 'form' ? 'on' : ''} onClick={() => setTab('form')}>
          Application{data.completeness.done ? '' : ` · ${data.completeness.missing.length} to fill`}
        </button>
        <button role="tab" aria-selected={tab === 'docs'} className={tab === 'docs' ? 'on' : ''} onClick={() => setTab('docs')}>
          Documents · {data.checks.documents.filter(d => d.state === 'verified').length}/{data.checks.documents.length}
        </button>
      </div>
      {tab === 'form'
        ? <FormEditor applicantId={applicantId} data={data} canManage={canManage && !admitted} onSaved={() => done('Application saved')} />
        : <DocumentsCard applicantId={applicantId} data={data} canManage={canManage && !admitted} admitted={admitted} onChanged={done} />}
    </>
  );
}

function ChecksCard({ data }: { data: AppData }) {
  const c = data.checks;
  const docsLeft = c.documents.filter(d => d.state !== 'verified');
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <CardHead title="Checks" sub={data.appliedOn ? `Application started ${fmtDate(data.appliedOn)}${data.channel !== 'office' ? ` (${data.channel})` : ''}.` : 'No application details yet: fill them in under Application.'} />
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <b style={{ flex: '0 0 150px', fontSize: 13.5 }}>Age for the class</b>
        <span style={{ flex: 1, fontSize: 13.5 }}>{c.age.text}</span>
        <Chip tone={AGE_TONE[c.age.state]}>{AGE_LABEL[c.age.state]}</Chip>
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <b style={{ flex: '0 0 150px', fontSize: 13.5 }}>Documents</b>
        <span style={{ flex: 1, fontSize: 13.5 }}>
          {!c.documents.length ? 'Nothing on the checklist for this class.'
            : docsLeft.length ? docsLeft.map(d => `${d.label} (${CHECK_LABEL[d.state].toLowerCase()})`).join(', ') : 'Every checklist document is verified.'}
        </span>
        <Chip tone={c.documentsDone ? 'g' : 'a'}>{c.documentsDone ? 'COMPLETE' : `${docsLeft.length} TO GO`}</Chip>
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <b style={{ flex: '0 0 150px', fontSize: 13.5 }}>Sibling at school</b>
        <span style={{ flex: 1, fontSize: 13.5 }}>{c.siblings.length ? c.siblings.map(s => `${s.name} (${s.detail})`).join('; ') : 'None found from the family’s phones and emails.'}</span>
        {c.siblings.length > 0 && <Chip tone="p">SIBLING</Chip>}
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <b style={{ flex: '0 0 150px', fontSize: 13.5 }}>Staff ward</b>
        <span style={{ flex: 1, fontSize: 13.5 }}>{c.staff.length ? c.staff.map(s => `${s.name}, ${s.detail}`).join('; ') : 'No staff member’s phone in the family.'}</span>
        {c.staff.length > 0 && <Chip tone="p">STAFF WARD</Chip>}
      </div>
      {!data.completeness.done && (
        <div className="note" style={{ marginTop: 12 }}>Still to fill for the register and the transfer certificate: {data.completeness.missing.join(', ')}.</div>
      )}
    </div>
  );
}

// ── The form ────────────────────────────────────────────────────────────────
type Draft = { fields: Record<string, string>; address: Record<string, string>; permanent_same: boolean; permanent_address: Record<string, string>; family: Record<string, string | boolean>[] };

const toDraft = (f: ApplicationForm): Draft => ({
  fields: Object.fromEntries(Object.entries(f.fields).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)])),
  address: Object.fromEntries(Object.entries(f.address || {}).map(([k, v]) => [k, v ?? ''])),
  permanent_same: f.permanent_same,
  permanent_address: Object.fromEntries(Object.entries(f.permanent_address || {}).map(([k, v]) => [k, v ?? ''])),
  family: f.family.map(m => ({ relation: m.relation, name: m.name, phone: m.phone ?? '', email: m.email ?? '', occupation: m.occupation ?? '', education: m.education ?? '', is_primary: m.is_primary })),
});

function FieldInput({ f, value, set, disabled }: { f: RegField; value: string; set: (v: string) => void; disabled: boolean }) {
  const id = `af-${f.key}`;
  const control = f.kind === 'enum' ? (
    <select id={id} className="cmp-sel" value={value} disabled={disabled} onChange={e => set(e.target.value)}>
      <option value="">Not given</option>
      {f.values!.map(v => <option key={v} value={v}>{f.labels?.[v] ?? v}</option>)}
    </select>
  ) : f.kind === 'bool' ? (
    <select id={id} className="cmp-sel" value={value} disabled={disabled} onChange={e => set(e.target.value)}>
      <option value="">Not given</option><option value="yes">Yes</option><option value="no">No</option>
    </select>
  ) : (
    <input id={id} className="cmp-in" value={value} disabled={disabled} type={f.kind === 'date' ? 'date' : 'text'}
      inputMode={f.kind === 'digits' || f.kind === 'amount' ? 'numeric' : undefined} maxLength={f.kind === 'digits' ? (f.len ?? 12) + 4 : f.max}
      onChange={e => set(e.target.value)} />
  );
  return <Field label={f.label.toUpperCase()} htmlFor={id} hint={f.hint}>{control}</Field>;
}

function AddressInputs({ prefix, value, set, disabled }: { prefix: string; value: Record<string, string>; set: (k: keyof Address, v: string) => void; disabled: boolean }) {
  return (
    <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      {ADDRESS_PARTS.map(p => (
        <Field key={p.key} label={p.label.toUpperCase()} htmlFor={`${prefix}-${p.key}`}>
          <input id={`${prefix}-${p.key}`} className="cmp-in" maxLength={p.max} value={value[p.key] ?? ''} disabled={disabled}
            inputMode={p.key === 'pin' ? 'numeric' : undefined} onChange={e => set(p.key, e.target.value)} />
        </Field>
      ))}
    </div>
  );
}

function FormEditor({ applicantId, data, canManage, onSaved }: { applicantId: string; data: AppData; canManage: boolean; onSaved: () => void }) {
  const { call } = useAdminDesk();
  const [d, setD] = useState<Draft>(() => toDraft(data.form));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const groups = GROUPS.filter(g => APPLICATION_FIELDS.some(f => f.group === g.key));
  const setField = (k: string, v: string) => setD(x => ({ ...x, fields: { ...x.fields, [k]: v } }));
  const setMember = (i: number, k: string, v: string | boolean) => setD(x => ({ ...x, family: x.family.map((m, j) => (j === i ? { ...m, [k]: v } : k === 'is_primary' && v ? { ...m, is_primary: false } : m)) }));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await call('/api/admin/admissions', 'PATCH', {
        id: applicantId,
        form: {
          fields: Object.fromEntries(Object.entries(d.fields).filter(([, v]) => v !== '')),
          address: d.address, permanent_same: d.permanent_same, permanent_address: d.permanent_same ? null : d.permanent_address,
          family: d.family,
        },
      });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save the application.'); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <CardHead title="Application" sub="What the register needs at admission, and what the transfer certificate is later made from. Name, class and date of birth are in Details above; Aadhaar is entered by the registrar at admission."
        right={canManage && <button className="btn sm pri" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save application'}</button>} />
      {groups.map(g => (
        <div key={g.key} style={{ marginBottom: 14 }}>
          <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', margin: '6px 0 8px' }}>{g.label.toUpperCase()}</div>
          <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {APPLICATION_FIELDS.filter(f => f.group === g.key).map(f => (
              <FieldInput key={f.key} f={f} value={d.fields[f.key] ?? ''} set={v => setField(f.key, v)} disabled={!canManage} />
            ))}
          </div>
        </div>
      ))}
      <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', margin: '6px 0 8px' }}>ADDRESS</div>
      <AddressInputs prefix="adr" value={d.address} disabled={!canManage} set={(k, v) => setD(x => ({ ...x, address: { ...x.address, [k]: v } }))} />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '4px 0 12px' }}>
        <input type="checkbox" checked={d.permanent_same} disabled={!canManage} onChange={e => setD(x => ({ ...x, permanent_same: e.target.checked }))} /> The permanent address is the same
      </label>
      {!d.permanent_same && <AddressInputs prefix="padr" value={d.permanent_address} disabled={!canManage} set={(k, v) => setD(x => ({ ...x, permanent_address: { ...x.permanent_address, [k]: v } }))} />}

      <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', margin: '14px 0 8px' }}>FAMILY</div>
      {d.family.map((m, i) => (
        <div key={i} className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end', paddingBottom: 10, borderBottom: '1px solid var(--line)', marginBottom: 10 }}>
          <Field label="RELATION" htmlFor={`fm-r-${i}`}>
            <select id={`fm-r-${i}`} className="cmp-sel" value={String(m.relation)} disabled={!canManage} onChange={e => setMember(i, 'relation', e.target.value)}>
              {RELATIONS.map(r => <option key={r} value={r}>{RELATION_LABEL[r]}</option>)}
            </select>
          </Field>
          <Field label="NAME" htmlFor={`fm-n-${i}`}><input id={`fm-n-${i}`} className="cmp-in" maxLength={120} value={String(m.name)} disabled={!canManage} onChange={e => setMember(i, 'name', e.target.value)} /></Field>
          <Field label="MOBILE" htmlFor={`fm-p-${i}`}><input id={`fm-p-${i}`} className="cmp-in" inputMode="tel" maxLength={20} value={String(m.phone)} disabled={!canManage} onChange={e => setMember(i, 'phone', e.target.value)} /></Field>
          <Field label="EMAIL" htmlFor={`fm-e-${i}`}><input id={`fm-e-${i}`} className="cmp-in" maxLength={160} value={String(m.email)} disabled={!canManage} onChange={e => setMember(i, 'email', e.target.value)} /></Field>
          <Field label="OCCUPATION" htmlFor={`fm-o-${i}`}><input id={`fm-o-${i}`} className="cmp-in" maxLength={80} value={String(m.occupation)} disabled={!canManage} onChange={e => setMember(i, 'occupation', e.target.value)} /></Field>
          <Field label="EDUCATION" htmlFor={`fm-ed-${i}`}>
            <select id={`fm-ed-${i}`} className="cmp-sel" value={String(m.education)} disabled={!canManage} onChange={e => setMember(i, 'education', e.target.value)}>
              <option value="">Not given</option>
              {EDUCATION.map(x => <option key={x} value={x}>{EDUCATION_LABEL[x]}</option>)}
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingBottom: 8 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="radio" name="fm-primary" checked={m.is_primary === true} disabled={!canManage} onChange={() => setMember(i, 'is_primary', true)} /> Main contact</label>
            {canManage && <button className="btn sm" aria-label={`Remove family member ${i + 1}`} onClick={() => setD(x => ({ ...x, family: x.family.filter((_, j) => j !== i) }))}><Trash size={13} /></button>}
          </div>
        </div>
      ))}
      {canManage && d.family.length < MAX_FAMILY && (
        <button className="btn sm" onClick={() => setD(x => ({ ...x, family: [...x.family, { relation: x.family.length ? 'father' : 'mother', name: '', phone: '', email: '', occupation: '', education: '', is_primary: !x.family.length }] }))}>
          <Plus size={13} /> Add a family member
        </button>
      )}
      {!d.family.length && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>The transfer certificate names the mother and the father or guardian: add them here.</p>}
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
    </div>
  );
}

// ── Documents ───────────────────────────────────────────────────────────────
function DocumentsCard({ applicantId, data, canManage, admitted, onChanged }: { applicantId: string; data: AppData; canManage: boolean; admitted: boolean; onChanged: (m: string) => void }) {
  const { call } = useAdminDesk();
  const [adding, setAdding] = useState(false);
  const [acting, setActing] = useState<null | { doc: AppDoc; kind: 'reject' | 'remove' }>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const post = async (body: Record<string, unknown>, ok: string) => {
    setErr(null);
    try { await call(DOC_PATH, 'POST', body); setActing(null); setNote(''); onChanged(ok); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  const kinds = DOC_KIND_KEYS.filter(k => !isMedical(k));
  return (
    <div className="card">
      <CardHead title="Documents with the application"
        sub={admitted ? 'The student is on the register: these documents moved to their record, with their checks.' : 'What the school asks for at this class. When the student is admitted onto the register, these move to their record and stay verified.'}
        right={canManage && <button className="btn sm pri" onClick={() => setAdding(true)}><Plus size={14} weight="bold" /> Add a document</button>} />
      {err && <div className="note err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {data.checks.documents.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {data.checks.documents.map(c => <span key={c.kind} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 10px', fontSize: 13 }}>{c.label} <Chip tone={CHECK_TONE[c.state]}>{CHECK_LABEL[c.state]}</Chip></span>)}
        </div>
      )}
      {!data.docs.length ? (
        <Empty icon={<FileText size={26} weight="duotone" />} title="No documents yet">
          Add what the family brings, and tick that you have seen the original to mark it verified.
          {data.hidden ? ` ${data.hidden} medical document${data.hidden === 1 ? ' is' : 's are'} kept for the health officer.` : ''}
        </Empty>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Document</th><th>Details</th><th>From</th><th>Status</th><th /></tr></thead>
            <tbody>{data.docs.map(d => (
              <tr key={d.id}>
                <td><b>{d.title}</b>{d.title !== docLabel(d.kind) && <div className="muted" style={{ fontSize: 12 }}>{docLabel(d.kind)}</div>}
                  <div className="muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{d.file_name}</div></td>
                <td style={{ fontSize: 13 }}>{[d.document_no && `No. ${d.document_no}`, d.issued_on && `Issued ${fmtDate(d.issued_on)}`, d.valid_until && `Valid until ${fmtDate(d.valid_until)}`].filter(Boolean).join(' · ') || <span className="muted">{'—'}</span>}</td>
                <td style={{ fontSize: 13 }}>{d.uploadedBy ?? 'Someone'}<div className="muted" style={{ fontSize: 12 }}>{fmtDate(d.created_at)}</div></td>
                <td>{d.moved_to ? <Chip tone="g">ON THE RECORD</Chip> : <Chip tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Chip>}
                  {d.status === 'verified' && d.verifiedBy && <div className="muted" style={{ fontSize: 12 }}>by {d.verifiedBy}{d.verified_at ? `, ${fmtDate(d.verified_at)}` : ''}</div>}
                  {d.status === 'rejected' && d.reject_note && <div className="muted" style={{ fontSize: 12 }}>{d.reject_note}</div>}</td>
                <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {!d.moved_to && <button className="btn sm" onClick={async () => { setErr(null); try { await openDocument(call, DOC_PATH, { id: d.id }); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open the document.'); } }}><ArrowSquareOut size={14} /> Open</button>}
                  {d.canManage && d.status !== 'verified' && <button className="btn sm pri" onClick={() => post({ action: 'verify', id: d.id }, 'Marked as verified against the original')}>Verify</button>}
                  {d.canManage && d.status === 'awaiting' && <button className="btn sm" onClick={() => setActing({ doc: d, kind: 'reject' })}>Reject</button>}
                  {d.canManage && <button className="btn sm" onClick={() => setActing({ doc: d, kind: 'remove' })}>Remove</button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {adding && <DocumentForm kinds={kinds} office busyLabel="Uploading" onClose={() => setAdding(false)}
        onSend={async (file, meta) => { await uploadDocument(call, DOC_PATH, { applicantId }, file, meta); setAdding(false); onChanged('Document added'); }} />}
      {acting && (
        <Workspace title={acting.kind === 'reject' ? `Reject ${acting.doc.title}` : `Remove ${acting.doc.title}`}
          sub={acting.kind === 'reject' ? 'Say what to send instead.' : 'For an upload made by mistake. The file is deleted and the removal recorded.'}
          onClose={() => { setActing(null); setNote(''); }}
          actions={<button className="btn pri" disabled={note.trim().length < 3} onClick={() => post(acting.kind === 'reject' ? { action: 'reject', id: acting.doc.id, note } : { action: 'remove', id: acting.doc.id, reason: note }, acting.kind === 'reject' ? 'Document rejected' : 'Document removed')}>{acting.kind === 'reject' ? 'Reject' : 'Remove'}</button>}>
          <Field label={acting.kind === 'reject' ? 'WHAT IS WRONG' : 'WHY'} htmlFor="ad-note"><input id="ad-note" className="cmp-in" value={note} maxLength={300} onChange={e => setNote(e.target.value)} /></Field>
        </Workspace>
      )}
    </div>
  );
}
