'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AddressBookIcon as AddressBook } from '@phosphor-icons/react/dist/ssr/AddressBook';
import { Chip, Empty, Skeleton, type Tone } from '@/components/canon/ui';
import { useAuth } from '@/contexts/AuthContext';
import { ACTIVITY_KINDS, DOC_KINDS, expiresIn, taskDue, type ActivityKind, type CaseStatus, type Priority, type SlaState } from '@/lib/ops/desk';
import { roleLabel, type OperatorRole } from '@/lib/ops/roles';
import { ReasonAction, Section, Table, errText, fmtDate, fmtDateTime } from '../../_ui';
import { useOpsApi } from '../../useOpsApi';
import { CaseStatusChip, PriorityChip, SlaChip } from '../../desk/parts';

interface Contact { id: string; name: string; role: string; title: string | null; email: string | null; phone: string | null; is_primary: boolean; decides: boolean; note: string | null; active: boolean }
interface Item { id: string; at: string; kind: string; title: string; detail: string; by: string | null; meta: string; caseId?: string }
interface Task { id: string; title: string; note: string | null; due_on: string | null; priority: string; status: string; owner_id: string | null; owner: string | null; caseRef: string | null }
interface Doc { id: string; kind: keyof typeof DOC_KINDS; title: string; signed_on: string | null; expires_on: string | null; file_name: string; size_bytes: number; created_at: string; uploadedBy: string | null }
interface Data {
  contacts: Contact[]; roles: { key: string; label: string; active: boolean }[]; timeline: Item[]; tasks: Task[]; documents: Doc[];
  cases: { id: string; ref: string; subject: string; status: CaseStatus; priority: Priority; createdAt: string; sla: SlaState }[];
  owners: { id: string; name: string; role: OperatorRole }[];
  can: { write: boolean; desk: boolean; deskWork: boolean }; me: string;
}

const KIND_TONE: Record<string, Tone> = { call: 'b', meeting: 'p', email: 'b', whatsapp: 'g', visit: 'p', note: 'n', case: 'r', access: 'a', change: 'n' };
const KIND_LABEL: Record<string, string> = { ...ACTIVITY_KINDS, case: 'Case', access: 'Access', change: 'Change' };
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** A school's Account 360 tab: who Sthara deals with there, everything that has passed between us, what we owe them, and the paperwork. */
export function RelationshipTab({ schoolId, onChanged }: { schoolId: string; onChanged: (msg: string) => void }) {
  const api = useOpsApi();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'logged' | 'system'>('all');
  const load = useCallback(() => {
    api<Data>(`/schools/${schoolId}/crm`).then(x => { setD(x); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api, schoolId]);
  useEffect(() => { load(); }, [load]);
  const post = useCallback(async (body: Record<string, unknown>, msg: string) => {
    await api(`/schools/${schoolId}/crm`, { method: 'POST', body });
    onChanged(msg); load();
  }, [api, schoolId, onChanged, load]);

  if (err && !d) return <div className="note err" role="alert">{err}</div>;
  if (!d) return <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={48} style={{ marginBottom: 12 }} />)}</div>;
  const roleName = (k: string) => d.roles.find(r => r.key === k)?.label ?? k;
  const today = todayIST();
  const open = d.tasks.filter(t => t.status === 'open');
  const shown = d.timeline.filter(i => filter === 'all' || (filter === 'logged' ? i.kind in ACTIVITY_KINDS : !(i.kind in ACTIVITY_KINDS)));

  return (
    <>
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      <Section title="Contacts" sub="The people Sthara deals with at this school. One is the primary contact: the first person to ring.">
        <Table head={<tr><th>Contact</th><th>Part</th><th>Email</th><th>Phone</th>{d.can.write && <th aria-label="Actions" />}</tr>}
          empty={!d.contacts.length && <Empty icon={<AddressBook size={28} weight="duotone" />} title="No contacts yet">Add the correspondent or principal first.</Empty>}>
          {d.contacts.map(c => <ContactRow key={c.id} c={c} roles={d.roles} roleName={roleName} canWrite={d.can.write} save={b => post({ action: 'contact', id: c.id, ...b }, 'Contact saved.')} />)}
        </Table>
        {d.can.write && <div style={{ marginTop: 12 }}><ContactForm roles={d.roles} save={b => post({ action: 'contact', ...b }, 'Contact added.')} /></div>}
      </Section>

      <div className="g2" style={{ alignItems: 'start' }}>
        <Section title="Follow-ups" sub={`${open.length} open for this school.`}>
          {open.map(t => {
            const due = taskDue(t.due_on, today);
            return (
              <div key={t.id} className="acts" style={{ marginBottom: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 14 }}>{t.title}</b>{t.priority === 'high' && <> <Chip tone="r">HIGH</Chip></>}
                  <div className="muted" style={{ fontSize: 12.5 }}>{t.due_on ? `Due ${fmtDate(t.due_on)}` : 'No date'}{due === 'overdue' ? ' (overdue)' : due === 'today' ? ' (today)' : ''} · {t.owner ?? 'nobody'}{t.caseRef ? ` · ${t.caseRef}` : ''}</div>
                  {t.note && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{t.note}</div>}
                </div>
                {d.can.write && <button className="btn sm pri" onClick={() => post({ action: 'task-status', id: t.id, status: 'done' }, 'Follow-up done.').catch(e => setErr(errText(e)))}>Done</button>}
              </div>
            );
          })}
          {!open.length && <p className="muted" style={{ fontSize: 13.5 }}>Nothing owed to this school.</p>}
          {d.can.write && <TaskForm owners={d.owners} me={d.me} save={b => post({ action: 'task', ...b }, 'Follow-up added.')} />}
        </Section>

        <Section title="Cases" sub="From the service desk." actions={d.can.desk && <Link className="btn sm" href="/ops/desk">Service desk</Link>}>
          {d.cases.map(c => (
            <div key={c.id} style={{ marginBottom: 10 }}>
              {d.can.desk ? <Link href={`/ops/desk/${c.id}`} style={{ color: 'var(--blue)', fontSize: 14 }}><span className="mono">{c.ref}</span> {c.subject}</Link> : <span style={{ fontSize: 14 }}><span className="mono">{c.ref}</span> {c.subject}</span>}
              <div className="acts" style={{ gap: 6, marginTop: 4 }}><CaseStatusChip s={c.status} /><PriorityChip p={c.priority} /><SlaChip sla={c.sla} /><span className="muted" style={{ fontSize: 12 }}>{fmtDate(c.createdAt)}</span></div>
            </div>
          ))}
          {!d.cases.length && <p className="muted" style={{ fontSize: 13.5 }}>This school has raised no cases.</p>}
        </Section>
      </div>

      <Section title="Timeline" sub="Logged by hand: calls, meetings, emails, WhatsApp chats, visits and notes. Cases, access windows and changes made in the Platform Manager are woven in."
        actions={<div className="seg" role="tablist" aria-label="Show">
          {([['all', 'Everything'], ['logged', 'Logged'], ['system', 'Cases and changes']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
        </div>}>
        {d.can.write && <ActivityForm contacts={d.contacts.filter(c => c.active)} save={b => post({ action: 'activity', ...b }, 'Logged.')} />}
        <div style={{ display: 'grid', gap: 12, marginTop: 6 }}>
          {shown.map(i => (
            <div key={i.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 96, flexShrink: 0 }}><Chip tone={KIND_TONE[i.kind] ?? 'n'}>{(KIND_LABEL[i.kind] ?? i.kind).toUpperCase()}</Chip></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{i.caseId && d.can.desk ? <Link href={`/ops/desk/${i.caseId}`} style={{ color: 'var(--blue)' }}>{i.title}</Link> : i.title}</div>
                {i.detail && <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 2 }}>{i.detail}</div>}
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{fmtDateTime(i.at)}{i.meta ? ` · ${i.meta}` : ''}{i.by ? ` · ${i.by}` : ''}</div>
              </div>
            </div>
          ))}
          {!shown.length && <p className="muted" style={{ fontSize: 13.5 }}>Nothing here yet.</p>}
        </div>
      </Section>

      <Section title="Documents" sub="Contracts, MoUs, purchase orders and the like. Files are private: each download link works for two minutes and is recorded.">
        <Table head={<tr><th>Document</th><th>Kind</th><th>Signed</th><th>Expires</th><th>File</th><th aria-label="Actions" /></tr>}
          empty={!d.documents.length && <p className="muted" style={{ fontSize: 13.5, padding: '8px 0' }}>No documents yet.</p>}>
          {d.documents.map(doc => {
            const left = expiresIn(doc.expires_on, today);
            return (
              <tr key={doc.id}>
                <td><div className="nm">{doc.title}</div><div className="sub">Added {fmtDate(doc.created_at)}{doc.uploadedBy ? ` by ${doc.uploadedBy}` : ''}</div></td>
                <td>{DOC_KINDS[doc.kind] ?? doc.kind}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{doc.signed_on ? fmtDate(doc.signed_on) : '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{doc.expires_on ? <>{fmtDate(doc.expires_on)} {left !== null && left < 0 ? <Chip tone="r">EXPIRED</Chip> : left !== null && left <= 60 ? <Chip tone="a">{left} DAYS</Chip> : null}</> : '—'}</td>
                <td style={{ fontSize: 12.5, overflowWrap: 'anywhere', maxWidth: 220 }}>{doc.file_name} · {size(doc.size_bytes)}</td>
                <td>
                  <span className="acts" style={{ gap: 6 }}>
                    <button className="btn sm" onClick={async () => {
                      try { window.open((await api<{ url: string }>(`/schools/${schoolId}/crm?doc=${doc.id}`)).url, '_blank', 'noopener'); } catch (e) { setErr(errText(e)); }
                    }}>Open</button>
                    {d.can.write && <ReasonAction label="Remove" confirm="Remove the document" danger run={reason => post({ action: 'doc-remove', id: doc.id, reason }, 'Document removed.')} />}
                  </span>
                </td>
              </tr>
            );
          })}
        </Table>
        {d.can.write && <DocUpload schoolId={schoolId} onDone={() => { onChanged('Document stored.'); load(); }} />}
      </Section>
    </>
  );
}

type Save = (b: Record<string, unknown>) => Promise<void>;

function ContactRow({ c, roles, roleName, canWrite, save }: { c: Contact; roles: Data['roles']; roleName: (k: string) => string; canWrite: boolean; save: Save }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <tr><td colSpan={5}><ContactForm roles={roles} initial={c} save={async b => { await save(b); setEditing(false); }} onCancel={() => setEditing(false)} /></td></tr>;
  return (
    <tr style={c.active ? undefined : { opacity: .55 }}>
      <td><div className="nm">{c.name}{c.is_primary && <> <Chip tone="b">PRIMARY</Chip></>}{c.decides && <> <Chip tone="p">DECIDES</Chip></>}{!c.active && <> <Chip tone="n">NO LONGER THERE</Chip></>}</div>{c.note && <div className="sub" style={{ whiteSpace: 'pre-wrap' }}>{c.note}</div>}</td>
      <td>{roleName(c.role)}{c.title && <div className="sub">{c.title}</div>}</td>
      <td style={{ overflowWrap: 'anywhere' }}>{c.email ? <a href={`mailto:${c.email}`} style={{ color: 'var(--blue)' }}>{c.email}</a> : '—'}</td>
      <td style={{ whiteSpace: 'nowrap' }}>{c.phone ? <a href={`tel:${c.phone}`} style={{ color: 'var(--blue)' }}>{c.phone}</a> : '—'}</td>
      {canWrite && <td><button className="btn sm" onClick={() => setEditing(true)}>Change</button></td>}
    </tr>
  );
}

function ContactForm({ roles, initial, save, onCancel }: { roles: Data['roles']; initial?: Contact; save: Save; onCancel?: () => void }) {
  const blank = { name: '', role: 'principal', title: '', email: '', phone: '', isPrimary: false, decides: false, note: '', active: true };
  const [open, setOpen] = useState(!!initial);
  const [f, setF] = useState(initial ? { name: initial.name, role: initial.role, title: initial.title ?? '', email: initial.email ?? '', phone: initial.phone ?? '', isPrimary: initial.is_primary, decides: initial.decides, note: initial.note ?? '', active: initial.active } : blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  if (!open) return <button className="btn sm pri" onClick={() => setOpen(true)}>Add a contact</button>;
  return (
    <form className="ops-reason" style={{ minWidth: 0 }} onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { await save(f); if (!initial) { setF(blank); setOpen(false); } } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
    }}>
      <div className="g3">
        <input className="cmp-in" aria-label="Name" placeholder="Name" required minLength={2} maxLength={120} value={f.name} onChange={e => set('name', e.target.value)} />
        <select className="cmp-sel" aria-label="Part they play" value={f.role} onChange={e => set('role', e.target.value)}>
          {roles.filter(r => r.active || r.key === f.role).map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <input className="cmp-in" aria-label="Job title" placeholder="Job title (optional)" maxLength={80} value={f.title} onChange={e => set('title', e.target.value)} />
        <input className="cmp-in" type="email" aria-label="Email" placeholder="Email" maxLength={200} value={f.email} onChange={e => set('email', e.target.value)} />
        <input className="cmp-in" aria-label="Phone" placeholder="Phone" maxLength={30} value={f.phone} onChange={e => set('phone', e.target.value)} />
        <input className="cmp-in" aria-label="Note" placeholder="Note, e.g. prefers WhatsApp after 4 pm" maxLength={1000} value={f.note} onChange={e => set('note', e.target.value)} />
      </div>
      <div className="acts">
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.isPrimary} onChange={e => set('isPrimary', e.target.checked)} /> Primary contact</label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.decides} onChange={e => set('decides', e.target.checked)} /> Decides on renewal</label>
        {initial && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={!f.active} onChange={e => set('active', !e.target.checked)} /> No longer at the school</label>}
        <button className="btn sm pri" style={{ marginLeft: 'auto' }} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn sm" onClick={() => (onCancel ? onCancel() : setOpen(false))}>Cancel</button>
      </div>
      {err && <div className="note err" role="alert">{err}</div>}
    </form>
  );
}

function ActivityForm({ contacts, save }: { contacts: Contact[]; save: Save }) {
  const [f, setF] = useState({ kind: 'call' as ActivityKind, direction: 'out', subject: '', body: '', contactId: '', when: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  const directed = f.kind === 'call' || f.kind === 'email' || f.kind === 'whatsapp';
  return (
    <form className="ops-reason" style={{ marginBottom: 18, minWidth: 0 }} onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr(null);
      try {
        await save({ kind: f.kind, direction: f.direction, subject: f.subject, body: f.body, contactId: f.contactId || null, happenedAt: f.when ? new Date(f.when).toISOString() : undefined });
        setF(x => ({ ...x, subject: '', body: '', when: '' }));
      } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
    }}>
      <div className="acts">
        <select className="cmp-sel" style={{ width: 'auto' }} aria-label="What happened" value={f.kind} onChange={e => set('kind', e.target.value as ActivityKind)}>
          {Object.entries(ACTIVITY_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {directed && (
          <select className="cmp-sel" style={{ width: 'auto' }} aria-label="Who started it" value={f.direction} onChange={e => set('direction', e.target.value)}>
            <option value="out">From Sthara</option><option value="in">From the school</option>
          </select>
        )}
        <select className="cmp-sel" style={{ width: 'auto', maxWidth: 220 }} aria-label="With whom" value={f.contactId} onChange={e => set('contactId', e.target.value)}>
          <option value="">With (optional)</option>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="cmp-in" type="datetime-local" style={{ width: 'auto' }} aria-label="When (leave empty for now)" value={f.when} onChange={e => set('when', e.target.value)} />
      </div>
      <input className="cmp-in" aria-label="What it was about" placeholder="What it was about" required minLength={2} maxLength={160} value={f.subject} onChange={e => set('subject', e.target.value)} />
      <textarea className="cmp-in" rows={2} aria-label="What was said or agreed" placeholder="What was said or agreed (optional)" maxLength={6000} value={f.body} onChange={e => set('body', e.target.value)} />
      <div className="acts"><button className="btn sm pri" disabled={busy || f.subject.trim().length < 2}>{busy ? 'Logging…' : 'Log it'}</button><span className="muted" style={{ fontSize: 12.5 }}>Leave the time empty for now. A logged entry cannot be edited afterwards.</span></div>
      {err && <div className="note err" role="alert">{err}</div>}
    </form>
  );
}

function TaskForm({ owners, me, save }: { owners: Data['owners']; me: string; save: Save }) {
  const [f, setF] = useState({ title: '', dueOn: '', priority: 'normal', ownerId: me, note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  return (
    <form className="ops-reason" style={{ marginTop: 12, minWidth: 0 }} onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { await save({ ...f, dueOn: f.dueOn || null }); setF(x => ({ ...x, title: '', note: '', dueOn: '' })); } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
    }}>
      <input className="cmp-in" aria-label="What needs doing" placeholder="What needs doing, e.g. Send renewal proposal" maxLength={200} value={f.title} onChange={e => set('title', e.target.value)} />
      <div className="acts">
        <input className="cmp-in" type="date" style={{ width: 'auto' }} aria-label="Due" value={f.dueOn} onChange={e => set('dueOn', e.target.value)} />
        <select className="cmp-sel" style={{ width: 'auto' }} aria-label="Priority" value={f.priority} onChange={e => set('priority', e.target.value)}>
          <option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
        </select>
        <select className="cmp-sel" style={{ width: 'auto', maxWidth: 220 }} aria-label="Owner" value={f.ownerId} onChange={e => set('ownerId', e.target.value)}>
          {owners.map(o => <option key={o.id} value={o.id}>{o.name}{o.id === me ? ' (you)' : ''} · {roleLabel(o.role)}</option>)}
        </select>
        <button className="btn sm pri" disabled={busy || f.title.trim().length < 2}>{busy ? 'Adding…' : 'Add follow-up'}</button>
      </div>
      {err && <div className="note err" role="alert">{err}</div>}
    </form>
  );
}

function DocUpload({ schoolId, onDone }: { schoolId: string; onDone: () => void }) {
  const { getAuthToken } = useAuth();
  const [f, setF] = useState({ kind: 'contract', title: '', signedOn: '', expiresOn: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const form = new FormData();
      Object.entries(f).forEach(([k, v]) => form.set(k, v));
      form.set('file', file);
      const token = await getAuthToken();
      const res = await fetch(`/api/ops/schools/${schoolId}/crm`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      setF(x => ({ ...x, title: '', signedOn: '', expiresOn: '' })); setFile(null); setKey(k => k + 1);
      onDone();
    } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
  };
  return (
    <form className="ops-reason" style={{ marginTop: 14, minWidth: 0 }} onSubmit={submit}>
      <div className="acts">
        <select className="cmp-sel" style={{ width: 'auto' }} aria-label="Kind of document" value={f.kind} onChange={e => set('kind', e.target.value)}>
          {Object.entries(DOC_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input className="cmp-in" style={{ flex: '1 1 220px', width: 'auto' }} aria-label="Title" placeholder="Title, e.g. Service agreement 2026-27" maxLength={160} value={f.title} onChange={e => set('title', e.target.value)} />
        <label className="muted" style={{ fontSize: 12.5 }}>Signed <input className="cmp-in" type="date" style={{ width: 'auto' }} aria-label="Signed on" value={f.signedOn} onChange={e => set('signedOn', e.target.value)} /></label>
        <label className="muted" style={{ fontSize: 12.5 }}>Expires <input className="cmp-in" type="date" style={{ width: 'auto' }} aria-label="Expires on" value={f.expiresOn} onChange={e => set('expiresOn', e.target.value)} /></label>
      </div>
      <div className="acts">
        <input key={key} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="File" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <button className="btn sm pri" disabled={busy || !file}>{busy ? 'Storing…' : 'Store document'}</button>
        <span className="muted" style={{ fontSize: 12.5 }}>PDF, JPEG, PNG or WebP, up to 10 MB.</span>
      </div>
      {err && <div className="note err" role="alert">{err}</div>}
    </form>
  );
}
