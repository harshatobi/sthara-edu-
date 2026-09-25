'use client';

import { useState } from 'react';
import { SealCheckIcon as SealCheck } from '@phosphor-icons/react/dist/ssr/SealCheck';
import { Chip, Empty, type Tone } from '@/components/canon/ui';
import type { AdminDesk } from '@/lib/admin/desk';
import { ago, inr } from '@/lib/admin/format';
import { CardHead } from '../kit';

type Call = (path: string, method: 'POST', body: unknown) => Promise<any>;
const CHIP: Record<string, { t: string; tone: Tone }> = {
  pending: { t: 'AWAITING APPROVAL', tone: 'a' }, approved: { t: 'APPROVED', tone: 'g' }, rejected: { t: 'REJECTED', tone: 'r' }, withdrawn: { t: 'WITHDRAWN', tone: 'n' },
};

/** Concession requests: one person asks, another decides (the database enforces who). */
export default function Concessions({ desk, call, onDone }: { desk: AdminDesk; call: Call; onDone: (m: string) => void }) {
  const canApprove = desk.me.access.can('fees.concession.approve');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const name = (id: string | null) => (id ? desk.workforce.admins.find(x => x.id === id)?.name ?? 'Former account' : '—');
  const student = (id: string) => desk.students.find(s => s.id === id);
  const invoice = (id: string) => desk.fees.invoices.find(i => i.id === id);

  const decide = async (id: string, approve: boolean) => {
    setBusy(id); setErr(null);
    try {
      await call('/api/admin/fees', 'POST', { action: 'concession_decide', requestId: id, approve, note: approve ? '' : note });
      onDone(approve ? 'Concession approved and applied' : 'Concession rejected'); setRejecting(null); setNote('');
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  return (
    <div className="card">
      <CardHead title="Concessions" sub={canApprove
        ? 'You can approve concessions, except ones you asked for yourself (unless you are the school\'s only approver, in which case they\'re flagged as self-approved).'
        : 'Concessions you request are applied once a finance head or principal approves them.'} />
      {err && <div className="err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {desk.concessions.length ? desk.concessions.map(c => {
        const s = student(c.studentId);
        const inv = invoice(c.invoiceId);
        const mine = c.requestedBy === desk.me.id;
        return (
          <div key={c.id} style={{ borderTop: '1px solid var(--line)', padding: '14px 0' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <b style={{ fontSize: 14 }}>{s?.name ?? 'Student'} · {inr(c.amount)}</b>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {inv ? `${inv.label} (${inv.invoiceNo}, ${inr(inv.amount)})` : 'Invoice'} · &ldquo;{c.reason}&rdquo; · asked by {name(c.requestedBy)} {ago(c.requestedAt)}
                </div>
                {c.status !== 'pending' && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                    {c.status === 'approved' ? 'Approved' : 'Rejected'} by {name(c.decidedBy)}{c.decidedAt ? ` ${ago(c.decidedAt)}` : ''}{c.note ? `: "${c.note}"` : ''}{c.selfApproved ? ' · self-approved (only approver)' : ''}
                  </div>
                )}
              </div>
              <Chip tone={CHIP[c.status].tone}>{CHIP[c.status].t}</Chip>
              {c.status === 'pending' && canApprove && rejecting !== c.id && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn sm" disabled={busy !== null} onClick={() => { setRejecting(c.id); setNote(''); }}>Reject</button>
                  <button className="btn sm pri" disabled={busy !== null} title={mine ? 'Someone else must approve a concession you asked for, unless you are the only approver' : undefined}
                    onClick={() => decide(c.id, true)}>{busy === c.id ? 'Applying…' : 'Approve'}</button>
                </div>
              )}
            </div>
            {rejecting === c.id && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <input className="cmp-in" style={{ flex: 1, minWidth: 220 }} aria-label="Reason for rejecting" placeholder="Reason (the requester sees it)" value={note} maxLength={300} onChange={e => setNote(e.target.value)} />
                <button className="btn sm" onClick={() => setRejecting(null)}>Cancel</button>
                <button className="btn sm red" disabled={busy !== null || !note.trim()} onClick={() => decide(c.id, false)}>Confirm reject</button>
              </div>
            )}
          </div>
        );
      }) : <Empty icon={<SealCheck size={26} weight="duotone" />} title="No concession requests this session">Request one from a family&apos;s account; it applies once approved.</Empty>}
    </div>
  );
}
