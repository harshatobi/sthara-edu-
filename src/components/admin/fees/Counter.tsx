'use client';

import { useMemo, useRef, useState } from 'react';
import { MagnifyingGlassIcon as MagnifyingGlass } from '@phosphor-icons/react/dist/ssr/MagnifyingGlass';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { ReceiptIcon as Receipt } from '@phosphor-icons/react/dist/ssr/Receipt';
import { Chip, Empty } from '@/components/canon/ui';
import { POWERED_BY_FALLBACK_HEAD, POWERED_BY_PAGE_CSS } from '@/components/schedule/print';
import { allocate, dues, findFamilies, paymentProblem, tillFor } from '@/lib/admin/counter';
import type { AdminDesk } from '@/lib/admin/desk';
import { PAY_MODES, type Family } from '@/lib/admin/fees';
import { fmtDate, inr, isoDay, plural } from '@/lib/admin/format';
import { CardHead, Field } from '../kit';
import { STATUS_CHIP } from './FamilyLedger';

type Call = (path: string, method: 'POST', body: unknown) => Promise<{ receiptNo?: string; id?: string }>;
interface Issued { receiptNo: string; amount: number; mode: string; reference: string; paidOn: string; invoiceNo: string; label: string }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Prints one slip for everything a family paid in one go. */
function printReceipts(school: string, session: string, who: { name: string; cls: string; rollNo: string }, items: Issued[]) {
  const w = window.open('', '_blank', 'width=720,height=820');
  if (!w || !items.length) return;
  const total = items.reduce((s, i) => s + i.amount, 0);
  w.document.write(`<!doctype html><html><head><title>Receipt ${esc(items.map(i => i.receiptNo).join(', '))}</title><style>
    body{font-family:system-ui,sans-serif;color:#002147;padding:32px;font-size:13px;max-width:640px;margin:0 auto} h1{font-size:20px;margin:0} .m{color:#64748B;margin:4px 0 18px}
    table{width:100%;border-collapse:collapse;margin-top:8px} th,td{padding:8px;border-bottom:1px solid #E2E8F0;text-align:left} th{font-size:11px;color:#64748B;text-transform:uppercase}
    .r{text-align:right} tfoot td{font-weight:700;border-top:2px solid #002147;border-bottom:0} .who{display:flex;justify-content:space-between;gap:16px;margin-bottom:6px}
    .sig{margin-top:56px;display:flex;justify-content:space-between;color:#64748B;font-size:12px} .sig span{border-top:1px solid #94A3B8;padding-top:6px;min-width:180px;text-align:center}
    @page{${POWERED_BY_PAGE_CSS}}
  </style>${POWERED_BY_FALLBACK_HEAD}</head><body>
  <h1>${esc(school)}</h1><div class="m">Fee receipt · AY ${esc(session)}</div>
  <div class="who"><div><b>${esc(who.name)}</b><br>${esc(who.cls)}${who.rollNo ? ` · ${esc(who.rollNo)}` : ''}</div><div class="r">Received on<br><b>${fmtDate(items[0].paidOn)}</b></div></div>
  <table><thead><tr><th>Receipt</th><th>For</th><th>Mode</th><th>Reference</th><th class="r">Amount</th></tr></thead>
  <tbody>${items.map(i => `<tr><td>${esc(i.receiptNo)}</td><td>${esc(i.label)}<br><span style="color:#64748B;font-size:12px">${esc(i.invoiceNo)}</span></td><td>${esc(PAY_MODES[i.mode] || i.mode)}</td><td>${esc(i.reference || '')}</td><td class="r">${inr(i.amount)}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="4">Total received</td><td class="r">${inr(total)}</td></tr></tfoot></table>
  <div class="sig"><span>Paid by</span><span>Received by</span></div>
  <script>window.print()</script></body></html>`);
  w.document.close();
}

/**
 * The fee counter: find the student, see what is due, take the money, hand over the receipt.
 * One sum can settle several invoices; it is applied to the oldest first and each invoice gets its own receipt number.
 */
export default function Counter({ desk, call, onDone, openAccount }: {
  desk: AdminDesk; call: Call; onDone: (msg: string) => void; openAccount: (studentId: string) => void;
}) {
  const L = desk.fees;
  const today = isoDay();
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('cash');
  const [ref, setRef] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<{ family: Family; items: Issued[] } | null>(null);

  const rollOf = useMemo(() => new Map(desk.students.map(s => [s.id, s.rollNo])), [desk.students]);
  const matches = useMemo(() => findFamilies(L.families, rollOf, q), [L.families, rollOf, q]);
  const family = pickedId ? L.families.find(f => f.studentId === pickedId) ?? null : null;
  const owed = family ? dues(family) : [];
  const owedTotal = owed.reduce((s, i) => s + i.balance, 0);
  const amt = Number(amount);
  const plan = allocate(owed, Number.isFinite(amt) ? amt : 0);
  const problem = family ? paymentProblem(amt, owedTotal, mode, ref) : null;
  const till = useMemo(() => tillFor(L.receipts, today), [L.receipts, today]);
  const todays = useMemo(() => L.receipts.filter(r => r.paidOn === today).slice(0, 25), [L.receipts, today]);
  const who = (f: Family) => ({ name: f.name, cls: f.cls, rollNo: rollOf.get(f.studentId) ?? '' });

  const pick = (f: Family) => {
    setPickedId(f.studentId); setQ(''); setErr(null); setRef(''); setPaidOn(today);
    setAmount(String(dues(f).reduce((s, i) => s + i.balance, 0) || ''));
  };
  const clear = () => { setPickedId(null); setAmount(''); setRef(''); setErr(null); setTimeout(() => searchRef.current?.focus(), 0); };

  const take = async () => {
    if (!family || problem) return;
    setBusy(true); setErr(null);
    const items: Issued[] = [];
    try {
      // One receipt per invoice, oldest first. If one fails, the ones before it stand and are shown.
      for (const s of plan.splits) {
        const r = await call('/api/admin/fees', 'POST', { action: 'payment', invoiceId: s.invoice.id, amount: s.amount, mode, reference: ref.trim(), paidOn });
        items.push({ receiptNo: r.receiptNo ?? '', amount: s.amount, mode, reference: ref.trim(), paidOn, invoiceNo: s.invoice.invoiceNo, label: s.invoice.label });
      }
      setLast({ family, items });
      onDone(`${inr(items.reduce((n, i) => n + i.amount, 0))} received from ${family.name} · ${items.map(i => i.receiptNo).join(', ')}`);
      clear();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'The payment could not be recorded.';
      if (items.length) { setLast({ family, items }); onDone(`${plural(items.length, 'receipt')} issued before an error`); }
      setErr(items.length ? `${inr(items.reduce((n, i) => n + i.amount, 0))} was recorded (${items.map(i => i.receiptNo).join(', ')}), then: ${msg} Check the account before taking the rest.` : msg);
    } finally { setBusy(false); }
  };

  return (
    <div className="g2" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', alignItems: 'start' }}>
      <div>
        <div className="card" style={{ marginBottom: 18 }}>
          <CardHead title="Take a payment" sub="Find the student by name, class or admission number." />
          {!family && (
            <>
              <div style={{ position: 'relative' }}>
                <input ref={searchRef} autoFocus className="cmp-in" style={{ paddingLeft: 40 }} aria-label="Find a student" placeholder="e.g. Aarav 9-A, or VN9A014"
                  value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && matches.length === 1) pick(matches[0]); }} />
                <MagnifyingGlass size={17} weight="bold" style={{ position: 'absolute', left: 14, top: 15, color: 'var(--mut)' }} />
              </div>
              {q.trim().length >= 2 && (matches.length ? matches.map(f => (
                <button key={f.studentId} type="button" className="row" onClick={() => pick(f)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 14 }}>{f.name}</b>
                    <div className="muted" style={{ fontSize: 12.5 }}>{f.cls}{rollOf.get(f.studentId) ? ` · ${rollOf.get(f.studentId)}` : ''}</div>
                  </div>
                  {f.outstanding > 0
                    ? <b className="num" style={{ color: f.overdue > 0 ? 'var(--red)' : undefined }}>{inr(f.outstanding)} due</b>
                    : <Chip tone="g">NOTHING DUE</Chip>}
                </button>
              )) : <p className="muted" style={{ fontSize: 13.5, marginTop: 12 }}>No student matches. Check the spelling, or try the class.</p>)}
              {q.trim().length < 2 && <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>Type at least two letters. With one match, Enter picks it.</p>}
            </>
          )}

          {family && (
            <>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <b style={{ fontSize: 18 }}>{family.name}</b>
                  <div className="muted" style={{ fontSize: 13 }}>{family.cls}{rollOf.get(family.studentId) ? ` · ${rollOf.get(family.studentId)}` : ''}</div>
                </div>
                <button className="btn sm" onClick={() => openAccount(family.studentId)}>Full account</button>
                <button className="btn sm" onClick={clear}>Another student</button>
              </div>

              {owed.length ? (
                <>
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>Due</th><th>For</th><th>Status</th><th className="r">Balance</th><th className="r">This payment</th></tr></thead>
                      <tbody>{owed.map(i => {
                        const part = plan.splits.find(s => s.invoice.id === i.id)?.amount ?? 0;
                        return (
                          <tr key={i.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(i.dueOn)}</td>
                            <td>{i.label}<div className="muted mono" style={{ fontSize: 12 }}>{i.invoiceNo}</div></td>
                            <td><Chip tone={STATUS_CHIP[i.status].tone}>{STATUS_CHIP[i.status].t}</Chip>{i.daysOverdue ? <div className="muted" style={{ fontSize: 12 }}>{plural(i.daysOverdue, 'day')} late</div> : null}</td>
                            <td className="r num">{inr(i.balance)}</td>
                            <td className="r num" style={{ fontWeight: 700, color: part ? 'var(--green)' : 'var(--mut)' }}>{part ? inr(part) : '—'}{part > 0 && part < i.balance ? <div className="muted" style={{ fontSize: 12, fontWeight: 500 }}>part</div> : null}</td>
                          </tr>
                        );
                      })}</tbody>
                      <tfoot><tr><td colSpan={3}><b>Total due</b></td><td className="r num"><b>{inr(owedTotal)}</b></td><td className="r num"><b>{inr(plan.splits.reduce((s, x) => s + x.amount, 0))}</b></td></tr></tfoot>
                    </table>
                  </div>

                  <div className="g2" style={{ gap: 14, marginTop: 16 }}>
                    <Field label="AMOUNT RECEIVED (RUPEES)" htmlFor="ct-amt" hint={amt > 0 && amt < owedTotal ? `${inr(owedTotal - amt)} will stay due` : 'Applied to the oldest invoice first'}>
                      <input id="ct-amt" className="cmp-in num" style={{ fontSize: 20, fontWeight: 700 }} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
                    </Field>
                    <Field label="HOW IT WAS PAID" htmlFor="ct-mode">
                      <select id="ct-mode" className="cmp-sel" value={mode} onChange={e => setMode(e.target.value)}>
                        {Object.entries(PAY_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </Field>
                    <Field label={mode === 'cheque' ? 'CHEQUE NUMBER' : mode === 'upi' ? 'UPI TRANSACTION ID' : mode === 'cash' || mode === 'card' ? 'REFERENCE (OPTIONAL)' : 'TRANSACTION REFERENCE'} htmlFor="ct-ref">
                      <input id="ct-ref" className="cmp-in mono" maxLength={120} value={ref} onChange={e => setRef(e.target.value)} />
                    </Field>
                    <Field label="RECEIVED ON" htmlFor="ct-on" hint={paidOn !== today ? 'Back-dated: it lands in that day’s book' : undefined}>
                      <input id="ct-on" type="date" className="cmp-in" max={today} value={paidOn} onChange={e => setPaidOn(e.target.value)} />
                    </Field>
                  </div>
                  {(err || (problem && amount)) && <div className="err" role="alert" style={{ marginTop: 12 }}>{err ?? problem}</div>}
                  <div className="acts" style={{ marginTop: 16 }}>
                    <button className="btn pri" disabled={busy || !!problem} onClick={take}>
                      <Receipt size={16} weight="bold" /> {busy ? 'Recording…' : `Record ${amt > 0 ? inr(amt) : 'payment'} and issue ${plan.splits.length > 1 ? `${plan.splits.length} receipts` : 'receipt'}`}
                    </button>
                    {[['Full', owedTotal], ['Oldest only', owed[0].balance]].filter(([, v], i, a) => i === 0 || v !== a[0][1]).map(([l, v]) => (
                      <button key={l as string} className="btn sm" onClick={() => setAmount(String(v))}>{l as string}: {inr(v as number)}</button>
                    ))}
                  </div>
                </>
              ) : (
                <Empty icon={<Receipt size={26} weight="duotone" />} title="Nothing is due">
                  {family.invoices.length ? `Everything billed so far is paid (${inr(family.paid)} this year).` : 'This student has not been invoiced this session. The accountant raises instalments from the Ledger.'}
                </Empty>
              )}
            </>
          )}
        </div>

        {last && (
          <div className="card" style={{ marginBottom: 18, borderColor: 'var(--green)' }} role="status">
            <CardHead title="Receipt issued" sub={`${last.family.name} · ${last.family.cls}`}
              right={<button className="btn pri sm" onClick={() => printReceipts(desk.school.name, desk.session, who(last.family), last.items)}><Printer size={15} weight="bold" /> Print receipt</button>} />
            {last.items.map(i => (
              <div className="row" key={i.receiptNo}><span className="mono" style={{ fontSize: 12.5 }}>{i.receiptNo}</span><span style={{ flex: 1 }} className="muted">{i.label} · {PAY_MODES[i.mode] || i.mode}</span><b className="num">{inr(i.amount)}</b></div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="card" style={{ marginBottom: 18 }}>
          <CardHead title="Today's till" sub={fmtDate(today)} />
          <div className="vl num" style={{ fontSize: 34, fontWeight: 800 }}>{inr(till.total)}</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{plural(till.count, 'receipt')} · {inr(till.cash)} in cash to count</div>
          {till.byMode.map(m => (
            <div className="row" key={m.mode}><span style={{ flex: 1 }}>{PAY_MODES[m.mode] || m.mode}</span><span className="muted" style={{ fontSize: 12.5 }}>{m.count}</span><b className="num" style={{ minWidth: 96, textAlign: 'right' }}>{inr(m.total)}</b></div>
          ))}
          {!till.count && <p className="muted" style={{ fontSize: 13.5 }}>Nothing taken yet today.</p>}
          <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>The whole office&apos;s receipts for the day. The accountant closes the day from the Day book.</p>
        </div>

        <div className="card">
          <CardHead title="Receipts today" sub={todays.length ? 'Newest first. Reprint from here.' : undefined} />
          {todays.map(r => {
            const f = L.families.find(x => x.studentId === r.studentId);
            const i = L.invoices.find(x => x.id === r.invoiceId);
            return (
              <div className="row" key={r.id} style={r.voided ? { opacity: .55 } : undefined}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{f?.name ?? 'Student'}</b>
                  <div className="muted" style={{ fontSize: 12 }}><span className="mono">{r.receiptNo}</span> · {PAY_MODES[r.mode] || r.mode}{r.voided ? ' · VOID' : ''}</div>
                </div>
                <b className="num">{inr(r.amount)}</b>
                {f && i && !r.voided && <button className="btn sm" aria-label={`Print receipt ${r.receiptNo}`} onClick={() => printReceipts(desk.school.name, desk.session, who(f),
                  [{ receiptNo: r.receiptNo, amount: r.amount, mode: r.mode, reference: r.reference ?? '', paidOn: r.paidOn, invoiceNo: i.invoiceNo, label: i.label }])}><Printer size={14} /></button>}
              </div>
            );
          })}
          {!todays.length && <p className="muted" style={{ fontSize: 13.5 }}>None yet.</p>}
        </div>
      </div>
    </div>
  );
}
