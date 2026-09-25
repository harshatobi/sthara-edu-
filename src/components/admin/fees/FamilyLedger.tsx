'use client';

import { useState } from 'react';
import { ReceiptIcon as Receipt } from '@phosphor-icons/react/dist/ssr/Receipt';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { Chip, Empty, type Tone } from '@/components/canon/ui';
import { PAY_MODES, type Family, type Invoice, type InvoiceStatus } from '@/lib/admin/fees';
import { fmtDate, inr, isoDay, plural } from '@/lib/admin/format';
import { Field, Workspace } from '../kit';
import type { Access } from '@/lib/admin/rbac';

export const STATUS_CHIP: Record<InvoiceStatus, { t: string; tone: Tone }> = {
  paid: { t: 'PAID', tone: 'g' }, partial: { t: 'PART-PAID', tone: 'b' }, due: { t: 'DUE', tone: 'n' },
  overdue: { t: 'OVERDUE', tone: 'r' }, void: { t: 'VOID', tone: 'n' },
};
export const TONE_CHIP: Record<string, Tone> = { gentle: 'g', firm: 'a', final: 'r' };

type Call = (path: string, method: 'POST', body: unknown) => Promise<any>;
type Mode = { kind: 'pay'; inv: Invoice } | { kind: 'concession'; inv: Invoice } | { kind: 'void-invoice'; inv: Invoice } | { kind: 'void-receipt'; inv: Invoice; receiptId: string } | null;

/** One family's account: every invoice and receipt, and the actions a cashier takes on them. */
export default function FamilyLedger({ family, school, session, call, access, pendingConcession, onChanged, onClose, onRemind }: {
  family: Family; school: string; session: string; call: Call; access: Access; pendingConcession: Set<string>;
  onChanged: (msg: string) => void; onClose: () => void; onRemind: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [amount, setAmount] = useState('');
  const [payMode, setPayMode] = useState('upi');
  const [ref, setRef] = useState('');
  const [paidOn, setPaidOn] = useState(isoDay());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const open = (m: Mode) => {
    setMode(m); setErr(null); setReason(''); setRef(''); setPaidOn(isoDay());
    setAmount(m?.kind === 'pay' ? String(m.inv.balance) : m?.kind === 'concession' ? String(m.inv.concession || '') : '');
  };
  const run = async (body: unknown, msg: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await call('/api/admin/fees', 'POST', body);
      setMode(null);
      onChanged(r?.receiptNo ? `${msg} · ${r.receiptNo}` : r?.status === 'pending' ? 'Concession requested; it applies once approved'
        : r?.selfApproved ? 'Concession applied (self-approved: you are the only approver)' : msg);
    }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const submit = () => {
    if (!mode) return;
    if (mode.kind === 'pay') return run({ action: 'payment', invoiceId: mode.inv.id, amount, mode: payMode, reference: ref, paidOn }, 'Payment recorded');
    if (mode.kind === 'concession') return run({ action: 'concession', invoiceId: mode.inv.id, amount: amount || 0, reason }, 'Concession saved');
    if (mode.kind === 'void-invoice') return run({ action: 'void_invoice', invoiceId: mode.inv.id, reason }, 'Invoice voided');
    return run({ action: 'void_payment', paymentId: mode.receiptId, reason }, 'Receipt voided');
  };

  const printStatement = () => {
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) return;
    const rows = family.invoices.map(i => `<tr><td>${i.invoiceNo}</td><td>${esc(i.label)}</td><td>${fmtDate(i.dueOn)}</td><td class="r">${inr(i.amount)}</td><td class="r">${i.concession ? inr(i.concession) : ''}</td><td class="r">${inr(i.paid)}</td><td class="r">${i.voided ? 'Void' : inr(i.balance)}</td></tr>`
      + i.receipts.map(p => `<tr class="rc"><td></td><td colspan="4">Receipt ${p.receiptNo} · ${PAY_MODES[p.mode] || p.mode}${p.reference ? ` · ${esc(p.reference)}` : ''} · ${fmtDate(p.paidOn)}${p.voided ? ` · VOID (${esc(p.voidReason || '')})` : ''}</td><td class="r">${p.voided ? '' : inr(p.amount)}</td><td></td></tr>`).join('')).join('');
    w.document.write(`<!doctype html><html><head><title>Fee statement · ${esc(family.name)}</title><style>
      body{font-family:system-ui,sans-serif;color:#002147;padding:32px;font-size:13px} h1{font-size:20px;margin:0} .m{color:#64748B;margin:4px 0 20px}
      table{width:100%;border-collapse:collapse} th,td{padding:8px;border-bottom:1px solid #E2E8F0;text-align:left} th{font-size:11px;color:#64748B;text-transform:uppercase}
      .r{text-align:right} tr.rc td{color:#64748B;font-size:12px;border-bottom:1px dashed #EEF2F7} tfoot td{font-weight:700;border-top:2px solid #002147}
    </style></head><body><h1>${esc(school)} · Fee statement</h1><div class="m">${esc(family.name)} · ${esc(family.cls)} · AY ${session} · as of ${fmtDate(isoDay())}</div>
    <table><thead><tr><th>Invoice</th><th>For</th><th>Due</th><th class="r">Amount</th><th class="r">Concession</th><th class="r">Paid</th><th class="r">Balance</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><td colspan="3">Total</td><td class="r">${inr(family.invoices.filter(i => !i.voided).reduce((s, i) => s + i.amount, 0))}</td><td class="r">${inr(family.invoices.filter(i => !i.voided).reduce((s, i) => s + i.concession, 0))}</td><td class="r">${inr(family.paid)}</td><td class="r">${inr(family.outstanding)}</td></tr></tfoot></table>
    <script>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <Workspace wide title={family.name} sub={`${family.cls} · AY ${session.replace('-', '–')} fee account`} onClose={onClose}
      actions={<div className="acts">
        <button className="btn" onClick={printStatement}><Printer size={16} /> Statement</button>
        {family.outstanding > 0 && access.can('fees.remind') && <button className="btn red" onClick={onRemind}>Send reminder</button>}
      </div>}>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <div className="kpi"><div className="lb">BILLED</div><div className="vl num" style={{ fontSize: 28 }}>{inr(family.billed)}</div></div>
        <div className="kpi"><div className="lb">PAID</div><div className="vl num" style={{ fontSize: 28, color: 'var(--green)' }}>{inr(family.paid)}</div></div>
        <div className="kpi"><div className="lb">OUTSTANDING</div><div className="vl num" style={{ fontSize: 28, color: family.overdue ? 'var(--red)' : undefined }}>{inr(family.outstanding)}</div>
          <div className="nt" style={{ color: family.maxDaysOverdue ? 'var(--red)' : 'var(--mut)' }}>{family.maxDaysOverdue ? `${plural(family.maxDaysOverdue, 'day')} overdue` : 'Nothing overdue'}</div></div>
        <div className="kpi"><div className="lb">PAYMENT HISTORY</div><div className="vl" style={{ fontSize: 22, marginTop: 14 }}>
          <Chip tone={TONE_CHIP[family.tone]}>{family.tone.toUpperCase()} TONE</Chip></div>
          <div className="nt">{family.lateHistory.settled ? `${family.lateHistory.late} of ${family.lateHistory.settled} settled late` : 'No settled invoices yet'} · {plural(family.remindersSent, 'reminder')}</div></div>
      </div>

      {family.invoices.length ? family.invoices.map(inv => (
        <div className="card" key={inv.id} style={{ marginBottom: 14, opacity: inv.voided ? 0.65 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 16 }}>{inv.label}</b><Chip tone={STATUS_CHIP[inv.status].tone}>{STATUS_CHIP[inv.status].t}</Chip>
                <span className="mono muted" style={{ fontSize: 12 }}>{inv.invoiceNo}</span>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Due {fmtDate(inv.dueOn)} · {inr(inv.amount)}{inv.concession ? ` less ${inr(inv.concession)} concession (${inv.concessionReason})` : ''}
                {inv.daysOverdue ? <b style={{ color: 'var(--red)' }}> · {plural(inv.daysOverdue, 'day')} overdue</b> : null}
              </div>
            </div>
            {!inv.voided && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {inv.balance > 0 && access.can('fees.collect') && <button className="btn pri sm" onClick={() => open({ kind: 'pay', inv })}>Record payment</button>}
                {inv.balance > 0 && access.can('fees.concession.request') && (pendingConcession.has(inv.id)
                  ? <span className="ch a">CONCESSION AWAITING APPROVAL</span>
                  : <button className="btn sm" onClick={() => open({ kind: 'concession', inv })}>{access.can('fees.concession.approve') ? 'Concession' : 'Request concession'}</button>)}
                {inv.paid === 0 && access.can('fees.void') && <button className="btn sm" onClick={() => open({ kind: 'void-invoice', inv })}>Void</button>}
              </div>
            )}
          </div>
          {inv.receipts.length > 0 && (
            <div className="tbl-wrap" style={{ marginTop: 12 }}>
              <table className="tbl">
                <thead><tr><th>Receipt</th><th>Received</th><th>Mode</th><th>Reference</th><th className="r">Amount</th><th /></tr></thead>
                <tbody>{inv.receipts.map(p => (
                  <tr key={p.id} style={p.voided ? { textDecoration: 'line-through', color: 'var(--mut)' } : undefined}>
                    <td className="mono" style={{ fontSize: 12.5 }}>{p.receiptNo}</td>
                    <td>{fmtDate(p.paidOn)}</td><td>{PAY_MODES[p.mode] || p.mode}</td><td className="mono" style={{ fontSize: 12.5 }}>{p.reference || '—'}</td>
                    <td className="r num">{inr(p.amount)}</td>
                    <td className="r">{p.voided ? <span className="muted" style={{ fontSize: 12, textDecoration: 'none' }} title={p.voidReason || ''}>Void</span>
                      : access.can('fees.void') ? <button className="btn sm" onClick={() => open({ kind: 'void-receipt', inv, receiptId: p.id })}>Void</button> : null}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {inv.voided && <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Voided.</div>}

          {mode && mode.inv.id === inv.id && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              {mode.kind === 'pay' && (
                <div className="g2" style={{ gap: 14 }}>
                  <Field label="AMOUNT RECEIVED (RUPEES)" htmlFor="pay-amt" hint={`Balance ${inr(inv.balance)}`}>
                    <input id="pay-amt" className="cmp-in num" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
                  </Field>
                  <Field label="RECEIVED ON" htmlFor="pay-on"><input id="pay-on" type="date" className="cmp-in" value={paidOn} max={isoDay()} onChange={e => setPaidOn(e.target.value)} /></Field>
                  <Field label="MODE" htmlFor="pay-mode">
                    <select id="pay-mode" className="cmp-sel" value={payMode} onChange={e => setPayMode(e.target.value)}>
                      {Object.entries(PAY_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label={payMode === 'cheque' ? 'CHEQUE NUMBER' : payMode === 'upi' ? 'UPI TRANSACTION ID' : payMode === 'cash' || payMode === 'card' ? 'REFERENCE (OPTIONAL)' : 'TRANSACTION REFERENCE'} htmlFor="pay-ref">
                    <input id="pay-ref" className="cmp-in mono" value={ref} maxLength={120} onChange={e => setRef(e.target.value)} />
                  </Field>
                </div>
              )}
              {mode.kind === 'concession' && (
                <div className="g2" style={{ gap: 14 }}>
                  <Field label="CONCESSION (RUPEES)" htmlFor="con-amt" hint={`Up to ${inr(inv.amount - inv.paid)}. Enter 0 to remove it.`}>
                    <input id="con-amt" className="cmp-in num" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
                  </Field>
                  <Field label="REASON" htmlFor="con-why" hint="Appears on the family's statement.">
                    <input id="con-why" className="cmp-in" value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Sibling concession, staff ward, scholarship…" />
                  </Field>
                </div>
              )}
              {(mode.kind === 'void-invoice' || mode.kind === 'void-receipt') && (
                <Field label={mode.kind === 'void-invoice' ? 'WHY VOID THIS INVOICE?' : 'WHY VOID THIS RECEIPT?'} htmlFor="void-why"
                  hint={mode.kind === 'void-receipt' ? 'The receipt stays on record, struck through; the balance reopens.' : 'The invoice stays on record as void; it no longer counts as billed.'}>
                  <input id="void-why" className="cmp-in" value={reason} maxLength={300} onChange={e => setReason(e.target.value)}
                    placeholder={mode.kind === 'void-receipt' ? 'Cheque bounced, entered twice…' : 'Raised in error, student left…'} />
                </Field>
              )}
              {err && <div className="err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => setMode(null)} disabled={busy}>Cancel</button>
                <button className={`btn ${mode.kind.startsWith('void') ? 'red' : 'pri'}`} onClick={submit} disabled={busy}>
                  {busy ? 'Saving…' : mode.kind === 'pay' ? 'Record and issue receipt' : mode.kind === 'concession' ? (access.can('fees.concession.approve') ? 'Save concession' : 'Send for approval') : 'Void'}
                </button>
              </div>
            </div>
          )}
        </div>
      )) : (
        <div className="card"><Empty icon={<Receipt size={26} weight="duotone" />} title="No invoices this session">Raise an instalment from the fee ledger to bill this family.</Empty></div>
      )}
    </Workspace>
  );
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
