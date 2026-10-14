'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { HandshakeIcon as Handshake } from '@phosphor-icons/react/dist/ssr/Handshake';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { COMMISSION_STATUS, PARTNER_KINDS, type CommissionStatus, type PartnerKind } from '@/lib/ops/revenue';
import { INDIAN_STATES } from '@/lib/ops/territories';
import { REASON_MIN } from '@/lib/settings/registry';
import { Kpi, ReasonAction, Section, Table, downloadCsv, errText, fmtDate, inr, num } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface Partner {
  id: string; name: string; kind: PartnerKind; contactName: string | null; phone: string | null; email: string | null; state: string | null; district: string | null;
  pan: string | null; gstin: string | null; commissionPct: number; commissionBasis: 'first_year' | 'every_year'; notes: string | null; active: boolean;
  deals: number; open: number; won: number; wonValue: number; accrued: number; approved: number; paid: number; owed: number;
}
interface Line {
  id: string; payeeKind: string; payeeName: string; partnerId: string | null; reason: string; basis: number | null; ratePct: number | null; amount: number; status: CommissionStatus;
  auto: boolean; accruedAt: string; paidOn: string | null; paymentRef: string | null; note: string | null; oppId: string | null; opp: string | null; school: string | null; moves: string[];
}
interface Data {
  partners: Partner[]; commissions: Line[]; totals: { accrued: number; approved: number; paid: number; owed: number };
  rules: { key: string; label: string; ratePct: number; active: boolean }[];
  operators: { id: string; name: string }[]; deals: { id: string; label: string }[];
  can: { manage: boolean; pay: boolean; rules: boolean }; today: string;
}
const TONE: Record<CommissionStatus, Tone> = { accrued: 'a', approved: 'b', paid: 'g', cancelled: 'n' };
type Post = (b: Record<string, unknown>) => Promise<void>;

/** Platform Manager > Partners and commissions: who brings schools, and what Sthara owes on each win. */
export default function PartnersConsole() {
  const api = useOpsApi();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'partners' | 'ledger' | 'rules'>('partners');
  const [show, setShow] = useState<'owed' | CommissionStatus | 'all'>('owed');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const load = useCallback(() => {
    api<Data>('/partners').then(x => { setD(x); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const post: Post = async b => { await api('/partners', { method: 'POST', body: b }); load(); };
  const lines = (d?.commissions ?? []).filter(c => show === 'all' || (show === 'owed' ? c.status === 'accrued' || c.status === 'approved' : c.status === show));

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Partners and commissions"
        sub="Dealers and referrers who bring schools, and every commission owed on a won deal: accrued on the win, then approved, then paid."
        actions={d?.can.manage && tab === 'partners' ? <button className="btn pri" onClick={() => { setAdding(a => !a); setEditing(null); }}><Plus size={15} weight="bold" /> New partner</button> : undefined} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {d && (
        <div className="kpis ops-kpis-5">
          <Kpi label="Partners" value={num(d.partners.filter(p => p.active).length)} note={`${num(d.partners.reduce((n, p) => n + p.open, 0))} open deals from them`} onClick={() => setTab('partners')} />
          <Kpi label="Won through partners" value={inr(d.partners.reduce((n, p) => n + p.wonValue, 0))} note={`${num(d.partners.reduce((n, p) => n + p.won, 0))} deals`} />
          <Kpi label="Accrued" value={inr(d.totals.accrued)} note="Waiting for approval" tone={d.totals.accrued ? 'a' : undefined} onClick={() => { setTab('ledger'); setShow('accrued'); }} />
          <Kpi label="Approved, unpaid" value={inr(d.totals.approved)} note="Ready to pay" tone={d.totals.approved ? 'a' : undefined} onClick={() => { setTab('ledger'); setShow('approved'); }} />
          <Kpi label="Paid" value={inr(d.totals.paid)} note="All time" onClick={() => { setTab('ledger'); setShow('paid'); }} />
        </div>
      )}
      <div className="seg" role="tablist" aria-label="Section" style={{ marginBottom: 18 }}>
        {([['partners', 'Partners'], ['ledger', 'Commission ledger'], ['rules', 'Sthara’s own commissions']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {!d ? <div className="card"><Skeleton h={200} /></div> : tab === 'partners' ? (
        <>
          {adding && <PartnerForm onCancel={() => setAdding(false)} save={async b => { await post({ action: 'partner', ...b }); setAdding(false); }} />}
          <div className="card">
            <Table head={<tr><th>Partner</th><th>Contact</th><th className="r">Commission</th><th className="r">Deals</th><th className="r">Won</th><th className="r">Owed</th><th className="r">Paid</th>{d.can.manage && <th aria-label="Actions" />}</tr>}
              empty={!d.partners.length && <Empty icon={<Handshake size={28} weight="duotone" />} title="No partners yet">Add a dealer or referrer, then pick them on the deals they bring.</Empty>}>
              {d.partners.map(p => editing === p.id ? (
                <tr key={p.id}><td colSpan={8}><PartnerForm initial={p} onCancel={() => setEditing(null)} save={async b => { await post({ action: 'partner', id: p.id, ...b }); setEditing(null); }} /></td></tr>
              ) : (
                <tr key={p.id} style={p.active ? undefined : { opacity: .55 }}>
                  <td><div className="nm">{p.name}{!p.active && <> <Chip tone="n">INACTIVE</Chip></>}</div><div className="sub">{PARTNER_KINDS[p.kind]}{[p.district, p.state].filter(Boolean).length ? ` · ${[p.district, p.state].filter(Boolean).join(', ')}` : ''}</div>
                    {(p.pan || p.gstin) && <div className="sub mono">{p.pan ? `PAN ${p.pan}` : ''}{p.pan && p.gstin ? ' · ' : ''}{p.gstin ? `GSTIN ${p.gstin}` : ''}</div>}</td>
                  <td>{p.contactName ?? '—'}<div className="sub">{[p.phone, p.email].filter(Boolean).join(' · ')}</div></td>
                  <td className="r"><b>{p.commissionPct}%</b><div className="sub">{p.commissionBasis === 'every_year' ? 'every year' : 'first year'}</div></td>
                  <td className="r">{num(p.deals)}<div className="sub">{num(p.open)} open</div></td>
                  <td className="r">{num(p.won)}<div className="sub">{inr(p.wonValue)}</div></td>
                  <td className="r" style={{ fontWeight: 700, color: p.owed ? '#B45309' : undefined }}>{inr(p.owed)}</td>
                  <td className="r">{inr(p.paid)}</td>
                  {d.can.manage && <td><button className="btn sm" onClick={() => { setEditing(p.id); setAdding(false); }}>Change</button></td>}
                </tr>
              ))}
            </Table>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>A partner&apos;s commission is accrued on the deal&apos;s annual value when it is won. &quot;Every year&quot; is noted for renewals: put the partner on the renewal deal and it accrues again.</p>
          </div>
        </>
      ) : tab === 'ledger' ? (
        <>
          {d.can.pay && <ManualLine d={d} post={post} />}
          <div className="card">
            <div className="ops-filters">
              <div className="seg" role="tablist" aria-label="Show">
                {([['owed', 'Owed'], ['accrued', 'Accrued'], ['approved', 'Approved'], ['paid', 'Paid'], ['cancelled', 'Cancelled'], ['all', 'All']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={show === k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}
              </div>
              <button className="btn sm" style={{ marginLeft: 'auto' }} disabled={!lines.length} onClick={() => downloadCsv(`sthara-commissions-${d.today}.csv`, [
                ['Payee', 'Kind', 'For', 'Deal', 'School', 'Basis (INR)', 'Rate %', 'Amount (INR)', 'Status', 'Accrued', 'Paid on', 'Payment reference', 'Note'],
                ...lines.map(c => [c.payeeName, c.payeeKind, c.reason, c.opp, c.school, c.basis, c.ratePct, c.amount, COMMISSION_STATUS[c.status], fmtDate(c.accruedAt), c.paidOn, c.paymentRef, c.note]),
              ])}>Export</button>
            </div>
            <Table head={<tr><th>Payee</th><th>For</th><th className="r">Basis</th><th className="r">Rate</th><th className="r">Amount</th><th>Status</th>{d.can.pay && <th aria-label="Actions" />}</tr>}
              empty={!lines.length && <Empty icon={<Handshake size={28} weight="duotone" />} title="Nothing here">Commissions appear when a deal with a partner, or with a commission rule switched on, is won.</Empty>}>
              {lines.map(c => <LineRow key={c.id} c={c} canPay={d.can.pay} today={d.today} post={post} />)}
            </Table>
          </div>
        </>
      ) : (
        <Section title="Sthara's own commissions" sub="What Sthara's people earn on a win, as a percentage of the deal's annual value. Switched off, nothing is accrued. Lines can always be added by hand in the ledger.">
          <Table head={<tr><th>Paid to</th><th>Rate</th><th>State</th>{d.can.rules && <th aria-label="Actions" />}</tr>}>
            {d.rules.map(r => <RuleRow key={r.key} r={r} canEdit={d.can.rules} post={post} />)}
          </Table>
          {!d.can.rules && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Only the director changes these.</p>}
        </Section>
      )}
    </>
  );
}

function LineRow({ c, canPay, today, post }: { c: Line; canPay: boolean; today: string; post: Post }) {
  const [paying, setPaying] = useState(false);
  const [paidOn, setPaidOn] = useState(today);
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const move = async (m: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setErr(null);
    try { await post({ action: 'commission-move', id: c.id, move: m, ...extra }); setPaying(false); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <tr style={c.status === 'cancelled' ? { opacity: .55 } : undefined}>
      <td><div className="nm">{c.payeeName}</div><div className="sub">{c.payeeKind === 'partner' ? 'Partner' : c.payeeKind === 'operator' ? 'Sthara' : 'Other'}{c.auto ? '' : ' · added by hand'}</div></td>
      <td>{c.reason}<div className="sub">{c.oppId ? <Link href={`/ops/pipeline/${c.oppId}`} style={{ color: 'var(--blue)' }}>{c.opp}</Link> : c.opp ?? ''}{c.school ? ` · ${c.school}` : ''}</div>{c.note && <div className="sub">{c.note}</div>}</td>
      <td className="r">{c.basis === null ? '—' : inr(c.basis)}</td>
      <td className="r">{c.ratePct === null ? '—' : `${c.ratePct}%`}</td>
      <td className="r" style={{ fontWeight: 700 }}>{inr(c.amount, true)}</td>
      <td><Chip tone={TONE[c.status]}>{COMMISSION_STATUS[c.status].toUpperCase()}</Chip>{c.paidOn && <div className="sub">{fmtDate(c.paidOn)} · {c.paymentRef}</div>}</td>
      {canPay && (
        <td style={{ minWidth: 200 }}>
          {paying ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <input className="cmp-in" type="date" max={today} aria-label="Paid on" value={paidOn} onChange={e => setPaidOn(e.target.value)} />
              <input className="cmp-in mono" aria-label="Payment reference" placeholder="UTR or cheque number" maxLength={120} value={ref} onChange={e => setRef(e.target.value)} />
              <span className="acts" style={{ gap: 6 }}><button className="btn sm pri" disabled={busy || !ref.trim()} onClick={() => move('pay', { paidOn, paymentRef: ref })}>Record payment</button><button className="btn sm" onClick={() => setPaying(false)}>Cancel</button></span>
            </div>
          ) : (
            <span className="acts" style={{ gap: 6 }}>
              {c.moves.includes('approve') && <button className="btn sm pri" disabled={busy} onClick={() => move('approve')}>Approve</button>}
              {c.moves.includes('pay') && <button className="btn sm pri" disabled={busy} onClick={() => setPaying(true)}>Pay</button>}
              {c.moves.includes('reopen') && <button className="btn sm" disabled={busy} onClick={() => move('reopen')}>Bring back</button>}
              {c.moves.includes('cancel') && <ReasonAction label="Cancel" confirm="Cancel the commission" danger run={reason => post({ action: 'commission-move', id: c.id, move: 'cancel', note: reason })} />}
            </span>
          )}
          {err && <div className="note err" style={{ marginTop: 6 }} role="alert">{err}</div>}
        </td>
      )}
    </tr>
  );
}

function RuleRow({ r, canEdit, post }: { r: Data['rules'][number]; canEdit: boolean; post: Post }) {
  const [rate, setRate] = useState(String(r.ratePct));
  const [on, setOn] = useState(r.active);
  const dirty = Number(rate) !== r.ratePct || on !== r.active;
  return (
    <tr>
      <td className="nm">{r.label}</td>
      <td>{canEdit ? <span className="acts" style={{ gap: 8 }}><input className="cmp-in" type="number" min={0} max={100} step="0.25" style={{ width: 110 }} aria-label={`${r.label} rate`} value={rate} onChange={e => setRate(e.target.value)} /> <span className="muted">% of annual value</span></span> : `${r.ratePct}%`}</td>
      <td>{canEdit ? <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}><input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} /> Accrue on every win</label> : r.active ? <Chip tone="g">ON</Chip> : <Chip tone="n">OFF</Chip>}</td>
      {canEdit && <td>{dirty && <ReasonAction label="Save" confirm="Save rule" run={reason => post({ action: 'rule', key: r.key, ratePct: Number(rate), active: on, reason })} />}</td>}
    </tr>
  );
}

function ManualLine({ d, post }: { d: Data; post: Post }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ payeeKind: 'partner', partnerId: '', operatorId: '', payeeName: '', reason: '', amount: '', opportunityId: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  if (!open) return <div style={{ marginBottom: 14 }}><button className="btn sm" onClick={() => setOpen(true)}><Plus size={13} weight="bold" /> Add a commission by hand</button></div>;
  return (
    <form className="card" style={{ marginBottom: 18 }} onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { await post({ action: 'commission', ...f, opportunityId: f.opportunityId || undefined }); setOpen(false); setF(x => ({ ...x, reason: '', amount: '', note: '' })); } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
    }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>Add a commission by hand</h2>
      <div className="g3">
        <select className="cmp-sel" aria-label="Paid to" value={f.payeeKind} onChange={e => set('payeeKind', e.target.value)}>
          <option value="partner">A partner</option><option value="operator">Someone at Sthara</option><option value="other">Someone else</option>
        </select>
        {f.payeeKind === 'partner' ? (
          <select className="cmp-sel" aria-label="Partner" required value={f.partnerId} onChange={e => set('partnerId', e.target.value)}>
            <option value="">Pick the partner</option>{d.partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : f.payeeKind === 'operator' ? (
          <select className="cmp-sel" aria-label="Operator" required value={f.operatorId} onChange={e => set('operatorId', e.target.value)}>
            <option value="">Pick the person</option>{d.operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        ) : <input className="cmp-in" aria-label="Payee" placeholder="Who is to be paid" required maxLength={160} value={f.payeeName} onChange={e => set('payeeName', e.target.value)} />}
        <input className="cmp-in" type="number" min={1} step="0.01" aria-label="Amount" placeholder="Amount in rupees" required value={f.amount} onChange={e => set('amount', e.target.value)} />
        <input className="cmp-in" aria-label="What it is for" placeholder="What it is for, e.g. Referral fee" required maxLength={200} value={f.reason} onChange={e => set('reason', e.target.value)} />
        <select className="cmp-sel" aria-label="Deal" value={f.opportunityId} onChange={e => set('opportunityId', e.target.value)}>
          <option value="">Not tied to a deal</option>{d.deals.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <input className="cmp-in" aria-label="Note" placeholder="Note (optional)" maxLength={500} value={f.note} onChange={e => set('note', e.target.value)} />
      </div>
      {err && <div className="note err" style={{ marginTop: 12 }} role="alert">{err}</div>}
      <div className="acts" style={{ marginTop: 14 }}><button className="btn pri" disabled={busy}>{busy ? 'Adding…' : 'Add as accrued'}</button><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}

function PartnerForm({ initial, save, onCancel }: { initial?: Partner; save: (b: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState({
    name: initial?.name ?? '', kind: initial?.kind ?? 'dealer', contactName: initial?.contactName ?? '', phone: initial?.phone ?? '', email: initial?.email ?? '',
    state: initial?.state ?? '', district: initial?.district ?? '', pan: initial?.pan ?? '', gstin: initial?.gstin ?? '', commissionPct: String(initial?.commissionPct ?? 10),
    commissionBasis: initial?.commissionBasis ?? 'first_year', notes: initial?.notes ?? '', active: initial?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  return (
    <form className={initial ? '' : 'card'} style={{ marginBottom: initial ? 0 : 18, padding: initial ? '6px 0 10px' : undefined }} onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { await save({ ...f, commissionPct: Number(f.commissionPct) }); } catch (x) { setErr(errText(x)); setBusy(false); }
    }}>
      {!initial && <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>New partner</h2>}
      <div className="g3">
        <input className="cmp-in" aria-label="Name" placeholder="Partner or firm name" required minLength={2} maxLength={160} value={f.name} onChange={e => set('name', e.target.value)} />
        <select className="cmp-sel" aria-label="Kind" value={f.kind} onChange={e => set('kind', e.target.value as PartnerKind)}>{Object.entries(PARTNER_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <span className="acts" style={{ gap: 8 }}>
          <input className="cmp-in" type="number" min={0} max={100} step="0.25" style={{ width: 100 }} aria-label="Commission percent" value={f.commissionPct} onChange={e => set('commissionPct', e.target.value)} />
          <select className="cmp-sel" style={{ flex: 1, width: 'auto' }} aria-label="Paid on" value={f.commissionBasis} onChange={e => set('commissionBasis', e.target.value as 'first_year' | 'every_year')}>
            <option value="first_year">% of the first year</option><option value="every_year">% of every year</option>
          </select>
        </span>
        <input className="cmp-in" aria-label="Contact name" placeholder="Contact name" maxLength={120} value={f.contactName} onChange={e => set('contactName', e.target.value)} />
        <input className="cmp-in" aria-label="Phone" placeholder="Phone" maxLength={30} value={f.phone} onChange={e => set('phone', e.target.value)} />
        <input className="cmp-in" type="email" aria-label="Email" placeholder="Email" maxLength={200} value={f.email} onChange={e => set('email', e.target.value)} />
        <select className="cmp-sel" aria-label="State" value={f.state} onChange={e => set('state', e.target.value)}><option value="">State</option>{INDIAN_STATES.map(s => <option key={s}>{s}</option>)}</select>
        <input className="cmp-in" aria-label="District" placeholder="District" maxLength={80} disabled={!f.state} value={f.district} onChange={e => set('district', e.target.value)} />
        <input className="cmp-in" aria-label="Notes" placeholder="Notes: agreement terms, exclusivity" maxLength={2000} value={f.notes} onChange={e => set('notes', e.target.value)} />
        <input className="cmp-in mono" aria-label="PAN" placeholder="PAN (for paying them)" maxLength={20} value={f.pan} onChange={e => set('pan', e.target.value)} />
        <input className="cmp-in mono" aria-label="GSTIN" placeholder="GSTIN (if registered)" maxLength={20} value={f.gstin} onChange={e => set('gstin', e.target.value)} />
        {initial && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}><input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)} /> Active (offered on new deals)</label>}
      </div>
      {err && <div className="note err" style={{ marginTop: 12 }} role="alert">{err}</div>}
      <div className="acts" style={{ marginTop: 14 }}>
        <button className="btn pri" disabled={busy || f.name.trim().length < REASON_MIN - 2}>{busy ? 'Saving…' : initial ? 'Save' : 'Add partner'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
