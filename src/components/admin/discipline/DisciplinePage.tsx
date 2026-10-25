'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { GavelIcon as Gavel } from '@phosphor-icons/react/dist/ssr/Gavel';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { fmtDate } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { ACTION_LABEL, STATUS_LABEL, type ActionKind, type ActionStatus } from '@/lib/conduct/rules';
import { CardHead, DeskGate, Field, Workspace } from '../kit';

export interface ActionRow {
  id: string; studentId: string; student: string; admissionNo: string; session: string; kind: ActionKind; onDate: string; untilDate: string | null;
  reason: string; details: string | null; status: ActionStatus; returnNote: string | null; cancelReason: string | null; parentNotifiedAt: string | null;
  proposedBy: string | null; approvedBy: string | null; createdAt: string; archived: boolean;
}
interface Can { approve: boolean; suspend: boolean; archive: boolean; propose: boolean }
const TONE: Record<ActionStatus, 'g' | 'a' | 'r' | 'n'> = { approved: 'g', proposed: 'a', returned: 'r', cancelled: 'n' };
const TABS = [['approve', 'To approve'], ['record', 'The record'], ['archive', 'Archive']] as const;

const when = (r: Pick<ActionRow, 'onDate' | 'untilDate'>) => `${fmtDate(r.onDate)}${r.untilDate && r.untilDate !== r.onDate ? ` to ${fmtDate(r.untilDate)}` : ''}`;

/** Admin › Discipline: proposals to decide, the school's current record, and the archive of past warnings and detentions. */
export default function DisciplinePage() {
  return <DeskGate need={['discipline.approve', 'discipline.suspend', 'discipline.archive']}>{() => <Body />}</DeskGate>;
}

function Body() {
  const params = useSearchParams();
  const path = usePathname();
  const [q, setQ] = useState('');
  const search = q.trim().length >= 2 ? `q=${encodeURIComponent(q.trim())}` : '';
  const main = useGet<{ waiting: ActionRow[]; actions: ActionRow[]; can: Can }>(`/api/admin/discipline${search ? `?${search}` : ''}`);
  const can = main.data?.can;
  const tabs = TABS.filter(([k]) => (k === 'approve' ? can?.approve || can?.suspend : k === 'archive' ? can?.archive : true));
  const tab = tabs.find(([k]) => k === params.get('tab'))?.[0] ?? tabs[0]?.[0] ?? 'record';
  const archive = useGet<{ actions: ActionRow[] }>(tab === 'archive' ? `/api/admin/discipline?archive=1${search ? `&${search}` : ''}` : null);
  const [open, setOpen] = useState<ActionRow | null>(null);
  const [toast, toastEl] = useToast();
  const waiting = main.data?.waiting ?? [];
  return (
    <>
      {toastEl}
      <PageBar eyebrow="DISCIPLINE" title="Discipline" sub="Warnings, parent meetings, detentions and suspensions. Teachers propose; the vice principal or principal approves; a suspension is the principal's. Record one from the student's record." />
      <div className="tabs" role="tablist" aria-label="Discipline" style={{ marginBottom: 20 }}>
        {tabs.map(([k, label]) => <Link key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} href={`${path}?tab=${k}`}>{label}{k === 'approve' && waiting.length ? ` (${waiting.length})` : ''}</Link>)}
      </div>
      {main.error && <div className="note err" role="alert">{main.error}</div>}
      {!main.data ? <div className="card">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div> : (
        <>
          {tab === 'approve' && (
            <div className="card">
              <CardHead title="Waiting for a decision" sub="Oldest first. Approving puts it on the record; you choose whether the parents are told now." />
              {!waiting.length ? <Empty icon={<Gavel size={26} weight="duotone" />} title="Nothing waiting" /> : <Table rows={waiting} onOpen={setOpen} />}
            </div>
          )}
          {tab !== 'approve' && (
            <div className="card">
              <CardHead title={tab === 'archive' ? 'Archive' : 'The record'}
                sub={tab === 'archive' ? 'Warnings and detentions from earlier sessions. They are off the student’s record and the parent portal; only the principal and registrar see them here.' : 'Approved, sent back and cancelled actions, newest first. Earlier sessions’ warnings and detentions are in the archive.'}
                right={<input className="cmp-in" style={{ maxWidth: 260 }} placeholder="Search name, admission no. or reason" aria-label="Search" value={q} onChange={e => setQ(e.target.value)} />} />
              {(() => {
                const rows = tab === 'archive' ? archive.data?.actions : main.data.actions;
                if (tab === 'archive' && archive.error) return <div className="note err" role="alert">{archive.error}</div>;
                if (!rows) return [0, 1, 2].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />);
                return !rows.length ? <Empty icon={<Gavel size={26} weight="duotone" />} title={q ? 'No match' : 'Nothing here'} /> : <Table rows={rows} onOpen={setOpen} />;
              })()}
            </div>
          )}
        </>
      )}
      {open && can && <Decide row={open} can={can} onClose={() => setOpen(null)} onDone={msg => { setOpen(null); toast(msg); main.reload(); archive.reload(); }} />}
    </>
  );
}

export function Table({ rows, onOpen, hideStudent }: { rows: ActionRow[]; onOpen: (r: ActionRow) => void; hideStudent?: boolean }) {
  return (
    <div style={{ overflowX: 'auto' }}><table className="tbl">
      <thead><tr><th>When</th>{!hideStudent && <th>Student</th>}<th>Action</th><th>Reason</th><th>Status</th><th /></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.id}>
          <td>{when(r)}</td>
          {!hideStudent && <td><Link href={`/admin/students/${r.studentId}`}><b>{r.student}</b></Link><div className="muted mono" style={{ fontSize: 12 }}>{r.admissionNo}</div></td>}
          <td>{ACTION_LABEL[r.kind]}</td>
          <td>{r.reason}<div className="muted" style={{ fontSize: 12 }}>{r.proposedBy ? `Proposed by ${r.proposedBy}` : ''}{r.approvedBy ? ` · approved by ${r.approvedBy}` : ''}{r.parentNotifiedAt ? ' · parents told' : ''}</div></td>
          <td><Chip tone={TONE[r.status]}>{(r.archived ? 'ARCHIVED' : STATUS_LABEL[r.status]).toUpperCase()}</Chip></td>
          <td><button className="btn sm" onClick={() => onOpen(r)}>Open</button></td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

/** One action: approve or send back a proposal; cancel an approved one. */
export function Decide({ row, can, onClose, onDone }: { row: ActionRow; can: Can; onClose: () => void; onDone: (msg: string) => void }) {
  const { call } = useAdminDesk();
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(false);
  const [mode, setMode] = useState<'view' | 'return' | 'cancel'>('view');
  const [err, setErr] = useState<string | null>(null);
  const mayDecide = row.kind === 'suspension' ? can.suspend : can.approve;
  const post = async (body: Record<string, unknown>, msg: string) => {
    setErr(null);
    try { const r = await call<{ parentsTold?: number }>('/api/admin/discipline', 'POST', { id: row.id, ...body }); onDone(r.parentsTold ? `${msg} ${r.parentsTold} parent${r.parentsTold === 1 ? '' : 's'} told.` : msg); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  return (
    <Workspace title={`${ACTION_LABEL[row.kind]}: ${row.student}`} sub={`${when(row)} · ${STATUS_LABEL[row.status]}`} onClose={onClose}
      actions={mode === 'return' ? <button className="btn pri" disabled={note.trim().length < 3} onClick={() => post({ action: 'return', note }, 'Sent back to the teacher.')}>Send back</button>
        : mode === 'cancel' ? <button className="btn pri" disabled={note.trim().length < 3} onClick={() => post({ action: 'cancel', reason: note }, 'Cancelled.')}>Cancel the action</button>
          : row.status === 'proposed' && mayDecide ? <>
            <button className="btn pri" onClick={() => post({ action: 'approve', notify }, 'Approved.')}>Approve</button>
            <button className="btn" onClick={() => setMode('return')}>Send back</button>
          </> : row.status === 'approved' && mayDecide ? <button className="btn" onClick={() => setMode('cancel')}>Cancel the action</button> : undefined}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {row.status === 'proposed' && !mayDecide && <div className="note info" style={{ marginBottom: 14 }}>{row.kind === 'suspension' ? 'Only the principal approves a suspension.' : 'Your role doesn’t approve discipline actions.'}</div>}
      <dl style={{ display: 'grid', gap: 10, margin: '0 0 14px' }}>
        <div><dt className="muted" style={{ fontSize: 12 }}>Reason (what the parent reads)</dt><dd style={{ margin: 0, fontWeight: 600 }}>{row.reason}</dd></div>
        {row.details && <div><dt className="muted" style={{ fontSize: 12 }}>Details (staff only)</dt><dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{row.details}</dd></div>}
        <div><dt className="muted" style={{ fontSize: 12 }}>Proposed by</dt><dd style={{ margin: 0 }}>{row.proposedBy ?? '—'} · {fmtDate(row.createdAt.slice(0, 10))}</dd></div>
        {row.approvedBy && <div><dt className="muted" style={{ fontSize: 12 }}>Approved by</dt><dd style={{ margin: 0 }}>{row.approvedBy}{row.parentNotifiedAt ? ' · parents told' : ''}</dd></div>}
        {(row.returnNote || row.cancelReason) && <div><dt className="muted" style={{ fontSize: 12 }}>{row.returnNote ? 'Sent back' : 'Cancelled'}</dt><dd style={{ margin: 0 }}>{row.returnNote || row.cancelReason}</dd></div>}
      </dl>
      {mode === 'view' && row.status === 'proposed' && mayDecide && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> Tell the parents now (portal and WhatsApp)</label>}
      {mode !== 'view' && <Field label={mode === 'return' ? 'WHY (THE TEACHER SEES THIS)' : 'WHY IT IS CANCELLED'} htmlFor="dc-note"><input id="dc-note" className="cmp-in" maxLength={300} value={note} onChange={e => setNote(e.target.value)} /></Field>}
    </Workspace>
  );
}
