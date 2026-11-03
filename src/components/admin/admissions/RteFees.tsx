'use client';

import { useState } from 'react';
import { ReceiptIcon as Receipt } from '@phosphor-icons/react/dist/ssr/Receipt';
import { ShuffleIcon as Shuffle } from '@phosphor-icons/react/dist/ssr/Shuffle';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { useGet } from '@/components/canon/useGet';
import { POWERED_BY_FALLBACK_HEAD, POWERED_BY_PAGE_CSS } from '@/components/schedule/print';
import { fmtDate, isoDay } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { FEE_LABEL, lotteryOrder, PAY_MODES, RTE_MODE_LABEL, rupees, type FeeKind, type FeeRules, type RteMode } from '@/lib/admin/rteFees';
import { GRADES, gradeLabel } from '@/lib/students/register';
import { CardHead, Field } from '../kit';

/** Admission fees and the RTE quota in the office (admissions phase 4b). */

interface Payment { id: string; kind: FeeKind; amount: number; mode: string; reference: string | null; paid_on: string; receipt_no: string; voided_at: string | null; void_reason: string | null }
interface Fees {
  fees: { kind: FeeKind; label: string; amount: number; concession: number; why: string | null; paid: Payment | null }[];
  payments: Payment[]; depositDue: string | null; depositPaid: boolean; offerLive: boolean;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Prints a receipt from its own window. */
async function printReceipt(call: <T>(path: string) => Promise<T>, paymentId: string) {
  const w = window.open('', '_blank', 'noopener=no,width=800,height=900');
  if (!w) throw new Error('Allow pop-ups for this site to print.');
  const r = await call<{ school: string; receipt_no: string; kind: FeeKind; amount: number; mode: string; reference: string | null; paid_on: string; voided_at: string | null;
    applicant: { name: string; grade: number; session: string; guardian_name: string | null } | null; receivedBy: string | null }>(`/api/admin/admissions/fees?receipt=${paymentId}`);
  const row = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(r.receipt_no)}</title>
    <style>
      @page { size: A5 portrait; margin: 12mm; ${POWERED_BY_PAGE_CSS} }
      body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #002147; margin: 0; }
      h1 { font-size: 20px; margin: 0; } .sub { color: #7A8699; font-size: 12px; margin: 2px 0 14px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; } th, td { text-align: left; padding: 7px 4px; border-bottom: 1px solid #E8EDF4; }
      th { color: #7A8699; font-weight: 600; width: 40%; } .amt { font-size: 22px; font-weight: 800; margin: 14px 0; }
      .void { color: #B91C1C; font-weight: 800; letter-spacing: .1em; }
    </style>${POWERED_BY_FALLBACK_HEAD}</head><body>
    <h1>${esc(r.school)}</h1><div class="sub">Admission fee receipt</div>
    ${r.voided_at ? '<p class="void">VOID</p>' : ''}
    <div class="amt">${esc(rupees(r.amount))}</div>
    <table>
      ${row('Receipt no.', r.receipt_no)}${row('For', FEE_LABEL[r.kind])}
      ${row('Applicant', `${r.applicant?.name ?? ''}, ${gradeLabel(r.applicant?.grade ?? null)}, AY ${r.applicant?.session ?? ''}`)}
      ${r.applicant?.guardian_name ? row('Received from', r.applicant.guardian_name) : ''}
      ${row('Paid on', fmtDate(r.paid_on))}${row('Mode', `${PAY_MODES[r.mode as keyof typeof PAY_MODES] ?? r.mode}${r.reference ? ` · ${r.reference}` : ''}`)}
      ${r.receivedBy ? row('Received by', r.receivedBy) : ''}
    </table>
  </body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => { w.print(); }, 250);
}

export function FeesCard({ applicantId, canManage, onChanged }: { applicantId: string; canManage: boolean; onChanged: (m: string) => void }) {
  const { call } = useAdminDesk();
  const get = useGet<Fees>(`/api/admin/admissions/fees?applicant=${applicantId}`);
  const [paying, setPaying] = useState<FeeKind | null>(null);
  const [f, setF] = useState({ amount: '', mode: 'upi', reference: '', paidOn: isoDay() });
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true); setErr(null);
    try { await call('/api/admin/admissions/fees', 'POST', body); setPaying(null); setVoiding(null); setReason(''); get.reload(); onChanged(msg); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };
  const fetchGet = get.call as unknown as <T>(path: string) => Promise<T>;
  if (get.error) return <div className="note err" style={{ marginBottom: 16 }}>{get.error}</div>;
  if (!get.data) return <div className="card" style={{ marginBottom: 16 }}><Skeleton h={20} /></div>;
  const d = get.data;
  if (!d.fees.length) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <CardHead title="Fees" sub={d.depositDue && !d.depositPaid ? `The seat deposit is due by ${fmtDate(d.depositDue)}; unpaid, the offer lapses and the seat goes to the waitlist.` : 'Recorded by the office with a receipt; the family pays at the school.'} />
      {err && <div className="note err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {d.fees.map(x => (
        <div className="row" key={x.kind} style={{ flexWrap: 'wrap', gap: 10 }}>
          <div style={{ flex: '1 1 220px' }}>
            <b style={{ fontSize: 13.5 }}>{x.label}</b> <span className="num">{rupees(x.amount)}</span>
            {x.why && <div className="muted" style={{ fontSize: 12 }}>{x.why}: {rupees(x.concession)} off</div>}
            {x.paid && <div className="muted" style={{ fontSize: 12 }}>Receipt {x.paid.receipt_no} · {rupees(x.paid.amount)} · {fmtDate(x.paid.paid_on)}</div>}
          </div>
          {x.paid ? <Chip tone="g">PAID</Chip> : <Chip tone={x.kind === 'deposit' && !d.offerLive ? 'n' : 'a'}>{x.kind === 'deposit' && !d.offerLive ? 'AT OFFER' : 'DUE'}</Chip>}
          {x.paid && <button className="btn sm" onClick={() => printReceipt(fetchGet, x.paid!.id).catch(e => setErr(e instanceof Error ? e.message : 'Could not print.'))}><Receipt size={14} /> Receipt</button>}
          {x.paid && canManage && <button className="btn sm" onClick={() => setVoiding(x.paid)}>Void</button>}
          {!x.paid && canManage && (x.kind !== 'deposit' || d.offerLive) && <button className="btn sm pri" onClick={() => { setPaying(x.kind); setF(v => ({ ...v, amount: String(x.amount) })); }}>Record payment</button>}
        </div>
      ))}
      {paying && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 6 }}>
          <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
            <Field label={`${FEE_LABEL[paying].toUpperCase()} RECEIVED (₹)`} htmlFor="fp-amt"><input id="fp-amt" className="cmp-in" inputMode="decimal" value={f.amount} onChange={e => setF(v => ({ ...v, amount: e.target.value }))} /></Field>
            <Field label="MODE" htmlFor="fp-mode">
              <select id="fp-mode" className="cmp-sel" value={f.mode} onChange={e => setF(v => ({ ...v, mode: e.target.value }))}>
                {Object.entries(PAY_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            {f.mode !== 'cash' && <Field label={f.mode === 'upi' ? 'UPI TRANSACTION ID' : f.mode === 'cheque' ? 'CHEQUE NO.' : 'REFERENCE'} htmlFor="fp-ref"><input id="fp-ref" className="cmp-in" maxLength={80} value={f.reference} onChange={e => setF(v => ({ ...v, reference: e.target.value }))} /></Field>}
            <Field label="PAID ON" htmlFor="fp-day"><input id="fp-day" type="date" className="cmp-in" max={isoDay()} value={f.paidOn} onChange={e => setF(v => ({ ...v, paidOn: e.target.value }))} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn" onClick={() => setPaying(null)}>Cancel</button>
            <button className="btn pri" disabled={busy} onClick={() => run({ action: 'pay', applicantId, kind: paying, ...f }, `${FEE_LABEL[paying]} recorded`)}>Record and give a receipt</button>
          </div>
        </div>
      )}
      {voiding && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 6 }}>
          <Field label={`WHY IS RECEIPT ${voiding.receipt_no} VOID?`} htmlFor="fp-void" hint={voiding.kind === 'deposit' ? 'The deposit becomes unpaid: the offer lapses on its date unless it is paid again.' : 'The receipt stays on record, marked void.'}>
            <input id="fp-void" className="cmp-in" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setVoiding(null)}>Cancel</button>
            <button className="btn red" disabled={busy || reason.trim().length < 3} onClick={() => run({ action: 'void', paymentId: voiding.id, reason }, 'Receipt voided')}>Void receipt</button>
          </div>
        </div>
      )}
      {d.payments.filter(p => p.voided_at).map(p => (
        <div className="row" key={p.id}><span className="muted" style={{ flex: 1, fontSize: 12.5 }}>Receipt {p.receipt_no} ({FEE_LABEL[p.kind].toLowerCase()}, {rupees(p.amount)}) void: {p.void_reason}</span><Chip tone="n">VOID</Chip></div>
      ))}
    </div>
  );
}

/** RTE on one applicant: applying under RTE, and the state portal's allotment. */
export function RteCard({ applicantId, rte, rank, mode, allotment, canManage, onChanged }: {
  applicantId: string; rte: boolean; rank: number | null; mode: RteMode; allotment: { no: string | null; on: string | null }; canManage: boolean; onChanged: (m: string) => void;
}) {
  const { call } = useAdminDesk();
  const [on, setOn] = useState(rte);
  const [no, setNo] = useState(allotment.no ?? '');
  const [day, setDay] = useState(allotment.on ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await call('/api/admin/admissions/rte', 'POST', { action: 'set', applicantId, rte: on, allotmentNo: no, allottedOn: day }); onChanged('RTE saved'); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <CardHead title="RTE" sub={!rte ? 'Not applying for an RTE seat.' : mode === 'lottery' ? (rank ? `Place ${rank} in the school’s RTE lottery.` : 'In the RTE lottery when it is drawn.') : 'Allotted by the state portal: record the allotment.'}
        right={rte && <Chip tone="p">RTE</Chip>} />
      {err && <div className="note err" role="alert" style={{ marginBottom: 10 }}>{err}</div>}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 10 }}>
        <input type="checkbox" checked={on} disabled={!canManage} onChange={e => setOn(e.target.checked)} /> Applying for an RTE seat (25% quota)
      </label>
      {on && mode === 'portal' && (
        <div className="g2" style={{ gap: 12 }}>
          <Field label="ALLOTMENT NO. (STATE PORTAL)" htmlFor="rte-no"><input id="rte-no" className="cmp-in" maxLength={60} value={no} disabled={!canManage} onChange={e => setNo(e.target.value)} /></Field>
          <Field label="ALLOTTED ON" htmlFor="rte-day"><input id="rte-day" type="date" className="cmp-in" max={isoDay()} value={day} disabled={!canManage} onChange={e => setDay(e.target.value)} /></Field>
        </div>
      )}
      {canManage && <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn sm pri" disabled={busy} onClick={save}>Save</button></div>}
    </div>
  );
}

/** Set up › Fees: amounts (blank: none), the deposit's days, and concessions. */
export function FeesSetup({ rules, onSaved }: { rules: FeeRules; onSaved: (m: string) => void }) {
  const { call } = useAdminDesk();
  const s = (n: number | null) => (n ? String(n) : '');
  const [f, setF] = useState({ application: s(rules.application), deposit: s(rules.deposit), depositDays: s(rules.depositDays), admission: s(rules.admission), siblingPct: s(rules.siblingPct), staffPct: s(rules.staffPct) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = (k: keyof typeof f, label: string, hint?: string) => (
    <Field label={label} htmlFor={`fs-${k}`} hint={hint}><input id={`fs-${k}`} className="cmp-in" inputMode="decimal" value={f[k]} onChange={e => setF(v => ({ ...v, [k]: e.target.value }))} placeholder="None" /></Field>
  );
  return (
    <div className="card">
      <CardHead title="Admission fees" sub="Recorded by the office with a receipt (no online payment yet). Blank means the school charges none. A stage can require the application fee (Stages); enrolment needs the admission fee." />
      <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {field('application', 'APPLICATION FEE (₹)')}
        {field('deposit', 'SEAT DEPOSIT ON AN OFFER (₹)', 'Unpaid by its date, the offer lapses and the seat goes to the waitlist.')}
        {field('depositDays', 'DAYS TO PAY THE DEPOSIT', 'Blank: the days to accept the offer.')}
        {field('admission', 'ADMISSION FEE (₹)')}
        {field('siblingPct', 'SIBLING CONCESSION (%)', 'On the admission fee.')}
        {field('staffPct', 'STAFF WARD CONCESSION (%)', 'The larger of the two applies.')}
      </div>
      {err && <div className="err" role="alert" style={{ margin: '10px 0' }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn pri" disabled={busy} onClick={async () => {
          setBusy(true); setErr(null);
          try { await call('/api/admin/admissions/setup', 'POST', { kind: 'fees', ...f }); onSaved('Admission fees saved'); }
          catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
        }}>Save</button>
      </div>
    </div>
  );
}

interface Lottery {
  mode: RteMode; rteSeats: number | null;
  lottery: null | { seed: string; seats: number | null; entrants: string[]; ranked: { id: string; rank: number; name: string }[]; drawnBy: string | null; drawn_at: string; note: string | null };
  waiting: { id: string; name: string }[];
}

const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

/** Set up › RTE: how seats are allotted, and the school's lottery of each class (drawn once, checkable by anyone). */
export function RteSetup({ session, mode, canDraw, onSaved }: { session: string; mode: RteMode; canDraw: boolean; onSaved: (m: string) => void }) {
  const { call } = useAdminDesk();
  const [m, setM] = useState<RteMode>(mode);
  const [grade, setGrade] = useState(1);
  const { data, reload } = useGet<Lottery>(`/api/admin/admissions/rte?grade=${grade}&session=${session}`);
  const [note, setNote] = useState('');
  const [check, setCheck] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const verify = async () => {
    const l = data!.lottery!;
    const hashes = new Map<string, string>();
    for (const id of l.entrants) hashes.set(`${l.seed}:${id}`, await sha256(`${l.seed}:${id}`));
    const again = lotteryOrder(l.seed, l.entrants, s => hashes.get(s)!);
    setCheck(again.join() === l.ranked.map(r => r.id).join() ? 'Recomputed in this browser from the seed and the entrants: the order matches.' : 'The recomputed order does not match. Contact Sthara support.');
  };
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <CardHead title="How RTE seats are allotted" sub="Reserve RTE seats per class under Seats. The RTE Act bars screening at entry level: RTE seats go by the state's allotment or a lottery, never by the assessment." />
        {(['portal', 'lottery'] as RteMode[]).map(k => (
          <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 6 }}>
            <input type="radio" name="rte-mode" checked={m === k} onChange={() => setM(k)} /> {RTE_MODE_LABEL[k]}
          </label>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn pri" disabled={busy || m === mode} onClick={async () => {
            setBusy(true); setErr(null);
            try { await call('/api/admin/admissions/setup', 'POST', { kind: 'rte', mode: m }); onSaved('RTE allotment saved'); }
            catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
          }}>Save</button>
        </div>
      </div>
      {mode === 'lottery' && (
        <div className="card">
          <CardHead title={`RTE lottery · AY ${session.replace('-', '–')}`} sub="Drawn once per class, from every open RTE applicant. The seed is random and published with the result, so anyone can recompute the order; nobody can choose it." />
          <div style={{ maxWidth: 260, marginBottom: 12 }}>
            <Field label="CLASS" htmlFor="lot-grade">
              <select id="lot-grade" className="cmp-sel" value={grade} onChange={e => { setGrade(Number(e.target.value)); setCheck(null); }}>
                {GRADES.map(g => <option key={g} value={g}>{gradeLabel(g)}</option>)}
              </select>
            </Field>
          </div>
          {err && <div className="note err" role="alert" style={{ marginBottom: 10 }}>{err}</div>}
          {!data ? <Skeleton h={20} /> : data.lottery ? (
            <>
              <p style={{ fontSize: 13.5 }}>Drawn {fmtDate(data.lottery.drawn_at)}{data.lottery.drawnBy ? ` by ${data.lottery.drawnBy}` : ''} for {data.lottery.seats ?? 'the'} RTE seats. Seed <b className="mono">{data.lottery.seed}</b>.{data.lottery.note ? ` ${data.lottery.note}` : ''}</p>
              <ol style={{ margin: '8px 0 12px 20px', fontSize: 13.5 }}>{data.lottery.ranked.map(r => <li key={r.id}>{r.name}</li>)}</ol>
              {data.waiting.length > 0 && <p className="muted" style={{ fontSize: 13 }}>Applied after the draw, ranked after everyone drawn, in the order they applied: {data.waiting.map(w => w.name).join(', ')}.</p>}
              <button className="btn sm" onClick={() => verify().catch(() => setCheck('This browser can’t recompute it.'))}>Check the order</button>
              {check && <div className="note" style={{ marginTop: 10 }}>{check}</div>}
            </>
          ) : !data.waiting.length ? (
            <Empty icon={<Shuffle size={26} weight="duotone" />} title="No RTE applicants in this class">Applicants who ask for an RTE seat appear here.</Empty>
          ) : (
            <>
              <p style={{ fontSize: 13.5 }}>{data.waiting.length} open RTE applicant{data.waiting.length === 1 ? '' : 's'} for {data.rteSeats ?? 'no reserved'} RTE seats: {data.waiting.map(w => w.name).join(', ')}.</p>
              {canDraw ? (<>
                <Field label="NOTE (OPTIONAL)" htmlFor="lot-note" hint="E.g. drawn in the presence of the SMC and two parents."><input id="lot-note" className="cmp-in" maxLength={300} value={note} onChange={e => setNote(e.target.value)} /></Field>
                <button className="btn pri" disabled={busy} onClick={async () => {
                  setBusy(true); setErr(null);
                  try { await call('/api/admin/admissions/rte', 'POST', { action: 'draw', grade, session, note }); reload(); onSaved('Lottery drawn'); }
                  catch (e) { setErr(e instanceof Error ? e.message : 'Could not draw.'); } finally { setBusy(false); }
                }}><Shuffle size={14} /> Draw the lottery</button>
              </>) : <p className="muted" style={{ fontSize: 13 }}>The principal or school admin draws it.</p>}
            </>
          )}
        </div>
      )}
    </>
  );
}
