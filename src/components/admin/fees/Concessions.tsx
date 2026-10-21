'use client';

import { useMemo, useState } from 'react';
import { SealCheckIcon as SealCheck } from '@phosphor-icons/react/dist/ssr/SealCheck';
import { Chip, Empty, type Tone } from '@/components/canon/ui';
import type { AdminDesk } from '@/lib/admin/desk';
import { dues, findFamilies } from '@/lib/admin/counter';
import type { Family } from '@/lib/admin/fees';
import { ago, fmtDate, inr, plural } from '@/lib/admin/format';
import { CardHead, Field } from '../kit';
import SiblingNote from './SiblingNote';

type Call = (path: string, method: 'POST', body: unknown) => Promise<any>;
const CHIP: Record<string, { t: string; tone: Tone }> = {
  pending: { t: 'AWAITING APPROVAL', tone: 'a' }, approved: { t: 'APPROVED', tone: 'g' }, rejected: { t: 'REJECTED', tone: 'r' }, withdrawn: { t: 'WITHDRAWN', tone: 'n' },
};

/** Concession requests: one person asks, another decides (the database enforces who). */
export default function Concessions({ desk, call, onDone, forStudent, openAccount }: {
  desk: AdminDesk; call: Call; onDone: (m: string) => void;
  /** A student to start a request for (sent here from the counter). */
  forStudent?: string | null; openAccount: (studentId: string) => void;
}) {
  const canApprove = desk.me.access.can('fees.concession.approve');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [show, setShow] = useState<'pending' | 'approved' | 'rejected' | 'all'>(() => (desk.concessions.some(c => c.status === 'pending') ? 'pending' : 'all'));
  const canRequest = desk.me.access.can('fees.concession.request');
  const pending = desk.concessions.filter(c => c.status === 'pending');
  const approved = desk.concessions.filter(c => c.status === 'approved');
  const list = desk.concessions.filter(c => show === 'all' || c.status === show);
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
    <>
    <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
      <div className="kpi"><div className="lb">AWAITING APPROVAL</div><div className="vl num" style={{ fontSize: 28, color: pending.length ? '#B45309' : undefined }}>{pending.length}</div><div className="nt">{inr(pending.reduce((s, c) => s + c.amount, 0))} asked for</div></div>
      <div className="kpi"><div className="lb">APPROVED THIS SESSION</div><div className="vl num" style={{ fontSize: 28 }}>{inr(approved.reduce((s, c) => s + c.amount, 0))}</div><div className="nt">{plural(approved.length, 'concession')}{approved.some(c => c.selfApproved) ? ` · ${approved.filter(c => c.selfApproved).length} self-approved` : ''}</div></div>
      <div className="kpi"><div className="lb">ON THE LEDGER NOW</div><div className="vl num" style={{ fontSize: 28 }}>{inr(desk.fees.invoices.filter(i => !i.voided).reduce((s, i) => s + i.concession, 0))}</div><div className="nt">Taken off {plural(desk.fees.invoices.filter(i => !i.voided && i.concession > 0).length, 'invoice')}</div></div>
    </div>
    {canRequest && <RequestForm key={forStudent ?? 'new'} desk={desk} call={call} onDone={onDone} start={forStudent ?? null} pendingOn={new Set(pending.map(c => c.invoiceId))} />}
    <div className="card">
      <CardHead title="Requests" sub={canApprove
        ? 'You can approve concessions, except ones you asked for yourself (unless you are the school\'s only approver, in which case they\'re flagged as self-approved).'
        : 'Concessions you request are applied once a finance head or principal approves them.'} />
      <div className="seg" role="tablist" aria-label="Show" style={{ marginBottom: 12 }}>
        {([['pending', 'Awaiting approval'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={show === k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l} · {k === 'all' ? desk.concessions.length : desk.concessions.filter(c => c.status === k).length}</button>
        ))}
      </div>
      {err && <div className="err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {list.length ? list.map(c => {
        const s = student(c.studentId);
        const inv = invoice(c.invoiceId);
        const mine = c.requestedBy === desk.me.id;
        return (
          <div key={c.id} style={{ borderTop: '1px solid var(--line)', padding: '14px 0' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <b style={{ fontSize: 14 }}><button type="button" onClick={() => openAccount(c.studentId)} style={{ font: 'inherit', color: 'var(--blue)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>{s?.name ?? 'Student'}</button>{s?.cls ? <span className="muted" style={{ fontWeight: 500 }}> · {s.cls}</span> : null} · {inr(c.amount)}</b>
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
      }) : <Empty icon={<SealCheck size={26} weight="duotone" />} title={desk.concessions.length ? 'None in this list' : 'No concession requests this session'}>{canRequest ? 'Raise one above; it applies once approved.' : 'The accountant or finance head raises them.'}</Empty>}
    </div>
    </>
  );
}

/** Raise a concession: find the student, pick the invoice, say how much and why. */
function RequestForm({ desk, call, onDone, start, pendingOn }: { desk: AdminDesk; call: Call; onDone: (m: string) => void; start: string | null; pendingOn: Set<string> }) {
  const rollOf = useMemo(() => new Map(desk.students.map(s => [s.id, s.rollNo])), [desk.students]);
  const [q, setQ] = useState('');
  const [studentId, setStudentId] = useState<string | null>(start);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const matches = useMemo(() => findFamilies(desk.fees.families, rollOf, q), [desk.fees.families, rollOf, q]);
  const family: Family | null = studentId ? desk.fees.families.find(f => f.studentId === studentId) ?? null : null;
  const open = family ? dues(family) : [];
  const inv = open.find(i => i.id === invoiceId) ?? open.find(i => !pendingOn.has(i.id)) ?? null;
  const max = inv ? inv.amount - inv.paid : 0;
  const amt = Number(amount);
  const problem = !inv ? null : pendingOn.has(inv.id) ? 'This invoice already has a concession awaiting approval.'
    : !(amt >= 0) || amount === '' ? 'Enter the concession in rupees.' : amt > max ? `At most ${inr(max)}: the unpaid part of this invoice.` : !reason.trim() ? 'Give the reason. It appears on the family\u2019s statement.' : null;
  const submit = async () => {
    if (!inv || problem) return;
    setBusy(true); setErr(null);
    try {
      const r = await call('/api/admin/fees', 'POST', { action: 'concession', invoiceId: inv.id, amount: amt, reason: reason.trim() });
      onDone(r?.status === 'pending' ? 'Concession requested; it applies once approved' : r?.selfApproved ? 'Concession applied (self-approved: you are the only approver)' : 'Concession applied');
      setStudentId(null); setQ(''); setAmount(''); setReason(''); setInvoiceId('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save the concession.'); } finally { setBusy(false); }
  };
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <CardHead title="Raise a concession" sub={desk.me.access.can('fees.concession.approve') ? 'Yours need another approver, unless you are the school\u2019s only one.' : 'It applies once a finance head or principal approves it.'} />
      {!family ? (
        <>
          <input className="cmp-in" aria-label="Find a student" placeholder="Student name, class or admission number" value={q} onChange={e => setQ(e.target.value)} />
          {q.trim().length >= 2 && (matches.length ? matches.map(f => (
            <button key={f.studentId} type="button" className="row" onClick={() => { setStudentId(f.studentId); setInvoiceId(''); setErr(null); }} style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, cursor: 'pointer' }}>
              <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14 }}>{f.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{f.cls}{rollOf.get(f.studentId) ? ` · ${rollOf.get(f.studentId)}` : ''}</div></div>
              <span className="num muted">{f.outstanding > 0 ? `${inr(f.outstanding)} due` : 'Nothing due'}</span>
            </button>
          )) : <p className="muted" style={{ fontSize: 13.5, marginTop: 12 }}>No student matches.</p>)}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 200 }}><b style={{ fontSize: 16 }}>{family.name}</b><div className="muted" style={{ fontSize: 13 }}>{family.cls} · {inr(family.outstanding)} due</div></div>
            <button className="btn sm" onClick={() => { setStudentId(null); setErr(null); }}>Another student</button>
          </div>
          <SiblingNote userId={family.studentId} />
          {open.length && inv ? (
            <>
              <div className="g2" style={{ gap: 14 }}>
                <Field label="INVOICE" htmlFor="cn-inv" hint={`Due ${fmtDate(inv.dueOn)} · ${inr(inv.amount)} billed, ${inr(inv.paid)} paid${inv.concession ? `, ${inr(inv.concession)} concession now` : ''}`}>
                  <select id="cn-inv" className="cmp-sel" value={inv.id} onChange={e => setInvoiceId(e.target.value)}>
                    {open.map(i => <option key={i.id} value={i.id}>{i.label} · {inr(i.balance)} due{pendingOn.has(i.id) ? ' (awaiting approval)' : ''}</option>)}
                  </select>
                </Field>
                <Field label="CONCESSION (RUPEES)" htmlFor="cn-amt" hint={`Up to ${inr(max)}. It replaces any concession already on this invoice; 0 removes it.`}>
                  <input id="cn-amt" className="cmp-in num" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
                </Field>
              </div>
              <Field label="REASON" htmlFor="cn-why" hint="Appears on the family's statement.">
                <input id="cn-why" className="cmp-in" maxLength={300} placeholder="Sibling concession, staff ward, scholarship…" value={reason} onChange={e => setReason(e.target.value)} />
              </Field>
              {(err || (problem && (amount || pendingOn.has(inv.id)))) && <div className="err" role="alert" style={{ marginTop: 12 }}>{err ?? problem}</div>}
              <div className="acts" style={{ marginTop: 14 }}>
                <button className="btn pri" disabled={busy || !!problem} onClick={submit}>{busy ? 'Saving…' : desk.me.access.can('fees.concession.approve') ? 'Save concession' : 'Send for approval'}</button>
              </div>
            </>
          ) : <p className="muted" style={{ fontSize: 13.5 }}>{family.invoices.length ? 'Nothing is due, so there is nothing to give a concession on.' : 'This student has not been invoiced this session.'}</p>}
        </>
      )}
    </div>
  );
}
