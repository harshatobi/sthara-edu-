'use client';

import { useState } from 'react';
import { LockKeyIcon as LockKey } from '@phosphor-icons/react/dist/ssr/LockKey';
import { LockKeyOpenIcon as LockKeyOpen } from '@phosphor-icons/react/dist/ssr/LockKeyOpen';
import { BookOpenIcon as BookOpen } from '@phosphor-icons/react/dist/ssr/BookOpen';
import { Chip, Empty } from '@/components/canon/ui';
import type { AdminDesk } from '@/lib/admin/desk';
import { PAY_MODES, type DayBookDay } from '@/lib/admin/fees';
import { fmtDate, inr, isoDay, plural } from '@/lib/admin/format';
import { CardHead, Field } from '../kit';

type Call = (path: string, method: 'POST', body: unknown) => Promise<any>;

/**
 * The day book: receipts by the day they were received, by payment mode and by
 * who recorded them. Closing a day counts the cash against receipts and locks
 * the day: no receipt can be added to it or voided until someone who can void
 * reopens it with a reason.
 */
export default function DayBook({ desk, call, onDone }: { desk: AdminDesk; call: Call; onDone: (m: string) => void }) {
  const a = desk.me.access;
  const [closing, setClosing] = useState<string | null>(null);
  const [reopening, setReopening] = useState<string | null>(null);
  const [cash, setCash] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = isoDay();
  const name = (id: string | null) => (id ? desk.workforce.admins.find(x => x.id === id)?.name ?? 'Former account' : 'Unknown');
  const days = desk.dayBook;
  // Today is offered for closing even with no receipts, so an empty day can be signed off too.
  const list: DayBookDay[] = days.some(d => d.day === today) ? days
    : [{ day: today, receipts: 0, total: 0, byMode: {}, byRecorder: [], cash: 0, close: null }, ...days];

  const run = async (body: unknown, msg: string) => {
    setBusy(true); setErr(null);
    try { await call('/api/admin/fees', 'POST', body); onDone(msg); setClosing(null); setReopening(null); setCash(''); setNote(''); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="card">
      <CardHead title="Day book · last 30 days" sub="Close each day after counting the cash. A closed day is locked: no receipts can be added to it or voided until it's reopened with a reason." />
      {err && <div className="err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {list.length ? list.map(d => {
        const variance = closing === d.day ? Math.round(((Number(cash) || 0) - d.cash) * 100) / 100 : 0;
        return (
          <div key={d.day} style={{ borderTop: '1px solid var(--line)', padding: '14px 0' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 130px' }}>
                <b style={{ fontSize: 14 }}>{fmtDate(d.day)}</b>
                <div className="muted" style={{ fontSize: 12 }}>{d.day === today ? 'Today' : plural(d.receipts, 'receipt')}</div>
              </div>
              <div style={{ flex: 1, minWidth: 220, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
                {Object.entries(d.byMode).map(([m, v]) => <span key={m}><span className="muted">{PAY_MODES[m] || m}</span> <b className="num">{inr(v)}</b></span>)}
                {!d.receipts && <span className="muted">No receipts</span>}
                {d.byRecorder.length > 0 && <span className="muted">· by {d.byRecorder.map(r => `${name(r.id)} (${r.count})`).join(', ')}</span>}
              </div>
              <b className="num" style={{ width: 100, textAlign: 'right' }}>{inr(d.total)}</b>
              <div style={{ width: 210, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                {d.close?.status === 'closed' ? (
                  <>
                    <Chip tone={d.close.variance ? 'r' : 'g'}><LockKey size={11} weight="bold" /> {d.close.variance ? `CLOSED · ${d.close.variance > 0 ? '+' : ''}${inr(d.close.variance)}` : 'CLOSED'}</Chip>
                    {a.can('fees.void') && <button className="btn sm" onClick={() => { setReopening(d.day); setClosing(null); setNote(''); }}>Reopen</button>}
                  </>
                ) : a.can('fees.dayclose') ? (
                  <button className="btn sm pri" onClick={() => { setClosing(d.day); setReopening(null); setCash(String(d.cash)); setNote(''); }}>Close day</button>
                ) : <Chip tone="a">OPEN</Chip>}
              </div>
            </div>
            {d.close && (
              <div className="muted" style={{ fontSize: 12, marginTop: 6, paddingLeft: 144 }}>
                {d.close.status === 'closed'
                  ? `Closed by ${name(d.close.closedBy)} · cash counted ${inr(d.close.cashCounted)}${d.close.note ? ` · "${d.close.note}"` : ''}`
                  : `Reopened: "${d.close.reopenReason}"`}
              </div>
            )}
            {closing === d.day && (
              <div style={{ marginTop: 12, paddingLeft: 144 }}>
                <div className="g2" style={{ gap: 12 }}>
                  <Field label="CASH COUNTED (RUPEES)" htmlFor="dc-cash" hint={`Receipts say ${inr(d.cash)} in cash.${variance ? ` Difference: ${variance > 0 ? '+' : ''}${inr(variance)}.` : ''}`}>
                    <input id="dc-cash" className="cmp-in num" inputMode="decimal" value={cash} onChange={e => setCash(e.target.value.replace(/[^\d.]/g, ''))} />
                  </Field>
                  <Field label={variance ? 'EXPLAIN THE DIFFERENCE' : 'NOTE (OPTIONAL)'} htmlFor="dc-note">
                    <input id="dc-note" className="cmp-in" maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
                  </Field>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn sm" onClick={() => setClosing(null)}>Cancel</button>
                  <button className="btn sm pri" disabled={busy || (variance !== 0 && !note.trim())}
                    onClick={() => run({ action: 'day_close', day: d.day, cashCounted: cash || 0, note }, `${fmtDate(d.day, true)} closed`)}>
                    <LockKey size={13} weight="bold" /> {busy ? 'Closing…' : 'Close and lock'}
                  </button>
                </div>
              </div>
            )}
            {reopening === d.day && (
              <div style={{ marginTop: 12, paddingLeft: 144 }}>
                <Field label="WHY REOPEN THIS DAY?" htmlFor="dr-why" hint="Recorded in the audit trail. Close it again once the correction is made.">
                  <input id="dr-why" className="cmp-in" maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder="Cheque received on this date was missed" />
                </Field>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn sm" onClick={() => setReopening(null)}>Cancel</button>
                  <button className="btn sm red" disabled={busy || !note.trim()} onClick={() => run({ action: 'day_reopen', day: d.day, reason: note }, `${fmtDate(d.day, true)} reopened`)}>
                    <LockKeyOpen size={13} weight="bold" /> Reopen
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      }) : <Empty icon={<BookOpen size={26} weight="duotone" />} title="No receipts in the last 30 days">Days appear here as payments are recorded.</Empty>}
    </div>
  );
}
