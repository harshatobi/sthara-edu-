'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { Chip, PageBar, Skeleton } from '@/components/canon/ui';
import { PRIORITY_LABEL, type Priority } from '@/lib/ops/desk';
import { REASON_MIN } from '@/lib/settings/registry';
import { ReasonAction, Section, Table, errText } from '../../_ui';
import { useOpsApi } from '../../useOpsApi';

interface Pick { kind: string; key: string; label: string; sort: number; active: boolean }
interface Data {
  sla: { priority: Priority; firstResponseMinutes: number; resolveMinutes: number }[];
  categories: Pick[]; roles: Pick[];
  canned: { id: string; title: string; body: string }[];
  can: { admin: boolean; work: boolean };
}
const span = (m: number) => (m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? '' : 's'}` : m % 60 === 0 ? `${m / 60} h` : `${m} min`);

/** Platform Manager > Service desk > Deadlines and replies. */
export default function DeskSettings() {
  const api = useOpsApi();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    api<Data>('/desk/settings').then(x => { setD(x); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const post = async (body: Record<string, unknown>) => { await api('/desk/settings', { method: 'POST', body }); load(); };

  return (
    <>
      <div style={{ marginBottom: 12 }}><Link className="btn sm" href="/ops/desk"><ArrowLeft size={14} weight="bold" /> Service desk</Link></div>
      <PageBar eyebrow="SERVICE DESK" title="Deadlines and replies" sub="How long each priority gets, the lists cases and contacts are sorted by, and replies to reuse." />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {!d ? <div className="card"><Skeleton h={200} /></div> : (
        <>
          <Section title="Deadlines by priority" sub="Calendar time, counted from when a case is raised: nights and weekends count. A change applies to cases raised from then on.">
            <Table head={<tr><th>Priority</th><th>First reply within</th><th>Resolved within</th>{d.can.admin && <th aria-label="Actions" />}</tr>}>
              {d.sla.map(s => <SlaRow key={s.priority} s={s} canEdit={d.can.admin} save={post} />)}
            </Table>
            {!d.can.admin && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Only the director changes deadlines and lists.</p>}
          </Section>

          <div className="g2">
            <PickList title="Case categories" sub="What a school picks when it raises a case." kind="case_category" rows={d.categories} canEdit={d.can.admin} save={post} />
            <PickList title="Contact roles" sub="The part a contact plays at their school." kind="contact_role" rows={d.roles} canEdit={d.can.admin} save={post} />
          </div>

          <Section title="Canned replies" sub="Text to drop into a reply and then adjust. Anyone who works the desk can add to these.">
            {d.canned.map(r => <Canned key={r.id} r={r} canEdit={d.can.work} save={post} />)}
            {!d.canned.length && <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>None yet.</p>}
            {d.can.work && <Canned r={null} canEdit save={post} />}
          </Section>
        </>
      )}
    </>
  );
}

function SlaRow({ s, canEdit, save }: { s: Data['sla'][number]; canEdit: boolean; save: (b: Record<string, unknown>) => Promise<void> }) {
  const [first, setFirst] = useState(String(s.firstResponseMinutes));
  const [resolve, setResolve] = useState(String(s.resolveMinutes));
  const dirty = Number(first) !== s.firstResponseMinutes || Number(resolve) !== s.resolveMinutes;
  return (
    <tr>
      <td className="nm">{PRIORITY_LABEL[s.priority]}</td>
      <td>{canEdit ? <span className="acts" style={{ gap: 8 }}><input className="cmp-in" type="number" min={5} style={{ width: 110 }} aria-label={`${s.priority} first reply minutes`} value={first} onChange={e => setFirst(e.target.value)} /> <span className="muted">min ({span(Number(first) || 0)})</span></span> : span(s.firstResponseMinutes)}</td>
      <td>{canEdit ? <span className="acts" style={{ gap: 8 }}><input className="cmp-in" type="number" min={30} style={{ width: 110 }} aria-label={`${s.priority} resolve minutes`} value={resolve} onChange={e => setResolve(e.target.value)} /> <span className="muted">min ({span(Number(resolve) || 0)})</span></span> : span(s.resolveMinutes)}</td>
      {canEdit && <td>{dirty && <ReasonAction label="Save" confirm="Save deadlines" run={reason => save({ action: 'sla', priority: s.priority, firstResponseMinutes: Number(first), resolveMinutes: Number(resolve), reason })} />}</td>}
    </tr>
  );
}

function PickList({ title, sub, kind, rows, canEdit, save }: { title: string; sub: string; kind: string; rows: Pick[]; canEdit: boolean; save: (b: Record<string, unknown>) => Promise<void> }) {
  const [label, setLabel] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Section title={title} sub={sub}>
      <Table head={<tr><th>Entry</th><th>State</th>{canEdit && <th aria-label="Actions" />}</tr>}>
        {rows.map(r => (
          <tr key={r.key} style={r.active ? undefined : { opacity: .6 }}>
            <td className="nm">{r.label}</td>
            <td>{r.active ? <Chip tone="g">IN USE</Chip> : <Chip tone="n">RETIRED</Chip>}</td>
            {canEdit && <td>{r.key !== 'other' && <ReasonAction label={r.active ? 'Retire' : 'Bring back'} confirm={r.active ? 'Retire' : 'Bring back'} danger={r.active}
              run={x => save({ action: 'pick', kind, key: r.key, label: r.label, sort: r.sort, active: !r.active, reason: x })} />}</td>}
          </tr>
        ))}
      </Table>
      {canEdit && (
        <form className="acts" style={{ marginTop: 12 }} onSubmit={async e => {
          e.preventDefault(); setBusy(true); setErr(null);
          try { await save({ action: 'pick', kind, label, reason }); setLabel(''); setReason(''); } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
        }}>
          <input className="cmp-in" style={{ flex: '1 1 160px', width: 'auto' }} aria-label="New entry" placeholder="New entry" maxLength={60} value={label} onChange={e => setLabel(e.target.value)} />
          <input className="cmp-in" style={{ flex: '1 1 160px', width: 'auto' }} aria-label="Reason" placeholder="Reason" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
          <button className="btn sm pri" disabled={busy || label.trim().length < 2 || reason.trim().length < REASON_MIN}>Add</button>
        </form>
      )}
      {err && <div className="note err" style={{ marginTop: 10 }} role="alert">{err}</div>}
      <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>A retired entry stays on the records that use it and is no longer offered.</p>
    </Section>
  );
}

function Canned({ r, canEdit, save }: { r: { id: string; title: string; body: string } | null; canEdit: boolean; save: (b: Record<string, unknown>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(r?.title ?? '');
  const [body, setBody] = useState(r?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open) {
    return r ? (
      <div className="acts" style={{ marginBottom: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14 }}>{r.title}</b><div className="muted" style={{ fontSize: 13, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.body.length > 220 ? `${r.body.slice(0, 217)}...` : r.body}</div></div>
        {canEdit && <button className="btn sm" onClick={() => setOpen(true)}>Change</button>}
      </div>
    ) : <button className="btn sm pri" onClick={() => setOpen(true)}>New canned reply</button>;
  }
  const done = async (b: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    try { await save(b); setOpen(false); if (!r) { setTitle(''); setBody(''); } } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
  };
  return (
    <form className="ops-reason" style={{ marginBottom: 12 }} onSubmit={e => { e.preventDefault(); void done({ action: 'canned', id: r?.id, title, body }); }}>
      <input className="cmp-in" aria-label="Title" placeholder="Title, e.g. Password reset sent" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} />
      <textarea className="cmp-in" rows={5} aria-label="Reply text" placeholder="The reply" maxLength={4000} value={body} onChange={e => setBody(e.target.value)} />
      <div className="acts">
        <button className="btn sm pri" disabled={busy || title.trim().length < 2 || body.trim().length < 2}>Save</button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>Cancel</button>
        {r && <button type="button" className="btn sm red" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => done({ action: 'canned-remove', id: r.id })}>Delete</button>}
      </div>
      {err && <div className="note err" role="alert">{err}</div>}
    </form>
  );
}
