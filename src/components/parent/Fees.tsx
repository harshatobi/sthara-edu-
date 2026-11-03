'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ReceiptIcon as Receipt } from '@phosphor-icons/react/dist/ssr/Receipt';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { Empty, PageBar } from '@/components/canon/ui';
import { fmtDate, inr } from '@/lib/admin/format';
import { PAY_MODES, type InvoiceStatus } from '@/lib/admin/fees';
import { useFamily } from '@/lib/parent/useFamily';
import { ChildSwitcher, FamilyGate } from './common';
import { contactHref } from './links';

const STATUS: Record<InvoiceStatus, { label: string; tone: string }> = {
  paid: { label: 'Paid', tone: 'g' }, partial: { label: 'Part paid', tone: 'a' }, due: { label: 'Due', tone: 'b' }, overdue: { label: 'Overdue', tone: 'r' }, void: { label: 'Cancelled', tone: 'n' },
};

/** Asks the server for a link for what is due now, then hands over to the payment page. Amounts never come from here. */
function usePayOnline() {
  const { call } = useFamily();
  const [enabled, setEnabled] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    call<{ enabled: boolean }>('/api/parent/fees/pay').then(d => { if (live) setEnabled(d.enabled); }).catch(() => {});
    return () => { live = false; };
  }, [call]);
  const pay = async (invoiceId: string) => {
    setOpening(invoiceId); setError('');
    try {
      const { url } = await call<{ url: string }>('/api/parent/fees/pay', 'POST', { invoiceId });
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Online payment is not available right now.');
      setOpening(null);
    }
  };
  return { enabled, opening, error, pay };
}

export default function Fees() {
  const online = usePayOnline();
  return (
    <FamilyGate>
      {({ child: c }) => {
        const receipts = c.fees.invoices.flatMap(i => i.receipts.filter(r => !r.voided).map(r => ({ ...r, label: i.label }))).sort((a, b) => b.paidOn.localeCompare(a.paidOn));
        const paid = c.fees.invoices.reduce((n, i) => n + i.paid, 0);
        return (
          <>
            <ChildSwitcher />
            <PageBar eyebrow="FEES & PAYMENTS" title={`Fees for ${c.firstName}`} sub="Invoices and receipts exactly as the school office has recorded them."
              actions={<Link className="btn" href={contactHref(c.id, { to: null, audience: 'office', topic: 'fees', subject: `Fees for ${c.firstName}` })}><EnvelopeSimple size={16} weight="bold" /> Ask the fee office</Link>} />
            <div className="kpis">
              <div className="kpi"><div className="lb">OUTSTANDING</div><div className="vl" style={{ fontSize: 36 }}>{inr(c.fees.outstanding)}</div><div className="nt muted">{c.fees.nextDue ? `Next: ${c.fees.nextDue.label}, ${fmtDate(c.fees.nextDue.dueOn)}` : 'Nothing further due'}</div></div>
              <div className="kpi"><div className="lb">OVERDUE</div><div className="vl" style={{ fontSize: 36, color: c.fees.overdue ? '#E11D48' : '#10B981' }}>{inr(c.fees.overdue)}</div><div className="nt muted">{c.fees.overdue ? 'Past the due date' : 'Nothing overdue'}</div></div>
              <div className="kpi"><div className="lb">PAID THIS SESSION</div><div className="vl" style={{ fontSize: 36 }}>{inr(paid)}</div><div className="nt muted">{receipts.length} receipt{receipts.length === 1 ? '' : 's'}</div></div>
            </div>
            {c.fees.invoices.length ? (
              <>
                <div className="card">
                  <div className="pa-card-hd flat"><div><h3>Invoices</h3><p className="muted">Instalments raised for {c.firstName} this session.</p></div></div>
                  <div className="pa-tbl-wrap">
                    <table className="tbl pa-tbl">
                      <thead><tr><th>Invoice</th><th>Instalment</th><th>Due</th><th className="num">Amount</th><th className="num">Concession</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th>{online.enabled && <th aria-label="Pay" />}</tr></thead>
                      <tbody>
                        {c.fees.invoices.map(i => (
                          <tr key={i.id}>
                            <td className="mono">{i.invoiceNo}</td><td>{i.label}</td><td>{fmtDate(i.dueOn)}</td>
                            <td className="num">{inr(i.amount)}</td><td className="num">{i.concession ? inr(i.concession) : '—'}</td>
                            <td className="num">{inr(i.paid)}</td><td className="num"><b>{inr(i.balance)}</b></td>
                            <td><span className={`ch ${STATUS[i.status].tone} xs`}>{STATUS[i.status].label}{i.daysOverdue ? ` · ${i.daysOverdue}d` : ''}</span></td>
                            {online.enabled && <td>{i.balance > 0 && !i.voided && <button className="btn sm" type="button" disabled={!!online.opening} onClick={() => online.pay(i.id)}>{online.opening === i.id ? 'Opening' : 'Pay'}</button>}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="card" style={{ marginTop: 18 }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Receipt size={18} weight="duotone" color="#16A34A" /> Receipts</h3>
                  {receipts.length ? receipts.map(r => (
                    <div key={r.id} className="row">
                      <div style={{ flex: 1 }}><b>{inr(r.amount)}</b> <span className="muted">· {r.label}</span><div className="muted">{PAY_MODES[r.mode] ?? r.mode}{r.reference ? ` · ref ${r.reference}` : ''}</div></div>
                      <div style={{ textAlign: 'right' }}><div className="mono">{r.receiptNo}</div><div className="muted">{fmtDate(r.paidOn)}</div></div>
                    </div>
                  )) : <p className="muted" style={{ paddingTop: 10 }}>No payments recorded yet.</p>}
                </div>
                <div className="note info" style={{ marginTop: 18 }}>
                  {online.enabled
                    ? 'Pay online with the Pay button, or the way your school accepts fees at the counter. The receipt appears here once the payment is confirmed.'
                    : <>Online payment isn&apos;t set up for your school yet. Pay the way your school accepts fees (counter, cheque or bank transfer); the receipt appears here as soon as the office records it.</>}
                </div>
              </>
            ) : (
              <div className="card"><Empty icon={<Receipt size={32} weight="duotone" />} title="No invoices this session">
                When the school raises {c.firstName}&apos;s fee instalments they appear here, with receipts for every payment.
              </Empty></div>
            )}
          </>
        );
      }}
    </FamilyGate>
  );
}
