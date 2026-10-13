'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { CalendarCheckIcon as CalendarCheck } from '@phosphor-icons/react/dist/ssr/CalendarCheck';
import { HandCoinsIcon as HandCoins } from '@phosphor-icons/react/dist/ssr/HandCoins';
import { SignOutIcon as SignOut } from '@phosphor-icons/react/dist/ssr/SignOut';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { CardHead, DeskGate, Kpi, downloadCsv } from '@/components/admin/kit';
import Pop, { run } from '@/components/schedule/Pop';
import type { AdminDesk } from '@/lib/admin/desk';
import { fmtDate, inr } from '@/lib/admin/format';
import { addMonth, fyOf, monthName } from '@/lib/payroll/engine';
import { usePayroll, type Call, type PayRun, type PayrollData } from '@/lib/payroll/usePayroll';
import { In, Sel } from '@/components/admin/people/forms';
import RunView from './RunView';
import Salaries, { LoanForm } from './Salaries';
import Setup from './Setup';
import '@/styles/schedule.css';
import '@/styles/people.css';

type Tab = 'runs' | 'salaries' | 'loans' | 'settlements' | 'tax' | 'setup';
const TABS: [Tab, string][] = [['runs', 'Pay runs'], ['salaries', 'Salaries'], ['loans', 'Advances and loans'], ['settlements', 'Settlements'], ['tax', 'Tax'], ['setup', 'Set-up']];
const RUN = '/api/admin/payroll/run';
const STATUS = { draft: { t: 'DRAFT', tone: 'n' as const }, submitted: { t: 'AWAITING APPROVAL', tone: 'a' as const }, approved: { t: 'APPROVED', tone: 'g' as const } };

export default function PayrollPage() {
  return <DeskGate need={['payroll.read', 'payroll.prepare', 'payroll.approve']}>{desk => <Payroll desk={desk} />}</DeskGate>;
}

/**
 * Payroll: salaries, the monthly run with its approval, advances, final settlements, tax and the set-up behind
 * them. Whoever prepares a run submits it; someone else approves it; an approved run never changes.
 */
function Payroll({ desk }: { desk: AdminDesk }) {
  const router = useRouter();
  const params = useSearchParams();
  const tab = TABS.find(t => t[0] === params.get('tab'))?.[0] ?? 'runs';
  const runId = params.get('run');
  const go = (t: Tab, r?: string) => router.replace(`/admin/payroll?tab=${t}${r ? `&run=${r}` : ''}`, { scroll: false });
  const { data, error, reload, call } = usePayroll();
  const [toast, toastEl] = useToast(3200);
  return (
    <>
      {toastEl}
      <PageBar eyebrow="PAYROLL" title="Payroll" sub="Salaries, the month's pay run and its approval, advances and loans, final settlements and tax." />
      <div className="tabs" role="tablist" aria-label="Payroll">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => go(k)}>{l}</button>)}
      </div>
      {error ? <div className="note err" role="alert">Couldn&apos;t load payroll: {error}</div>
        : !data ? <div className="card" aria-busy="true">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={44} style={{ marginBottom: 12 }} />)}</div> : <>
          {tab === 'runs' && <Runs data={data} call={call} reload={reload} toast={toast} open={id => go('runs', id)} goTo={go} />}
          {tab === 'salaries' && <Salaries data={data} call={call} reload={reload} toast={toast} />}
          {tab === 'loans' && <Loans data={data} call={call} reload={reload} toast={toast} />}
          {tab === 'settlements' && <Settlements data={data} call={call} reload={reload} toast={toast} open={id => go('settlements', id)} />}
          {tab === 'tax' && <Tax data={data} call={call} toast={toast} />}
          {tab === 'setup' && <Setup data={data} call={call} reload={reload} toast={toast} />}
          {runId && <RunView id={runId} data={data} call={call} schoolName={desk.school.name} toast={toast} onChanged={reload} onClose={() => go(tab)} />}
        </>}
    </>
  );
}

function Runs({ data, call, reload, toast, open, goTo }: { data: PayrollData; call: Call; reload: () => void; toast: (m: string) => void; open: (id: string) => void; goTo: (t: Tab) => void }) {
  const runs = data.runs.filter(r => r.kind === 'regular');
  const latest = runs[0];
  // The next month to run: the one after the latest run, or this month for a school starting out.
  const next = latest ? (latest.status === 'approved' ? addMonth(latest.month, 1) : latest.month) : data.month;
  const [month, setMonth] = useState((next > data.month ? data.month : next).slice(0, 7));
  const [busy, setBusy] = useState(false);
  const active = data.people.filter(p => p.active), withPay = active.filter(p => p.salary).length;
  const steps: [boolean, string, Tab][] = [
    [data.items.length > 0, 'Add pay items (Basic, DA, HRA and your allowances)', 'setup'], [data.configured, 'Review and save the payroll settings (PF, ESI, professional tax state, day basis)', 'setup'],
    [withPay > 0, 'Set salaries', 'salaries'],
  ];
  const ready = steps.every(s => s[0]);
  const start = async () => {
    setBusy(true);
    try { const r = await call<{ id: string }>(RUN, 'POST', { action: 'compute', month }); reload(); open(r.id); } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  const waiting = runs.filter(r => r.status === 'submitted');
  const ytd = runs.filter(r => r.status === 'approved' && fyOf(r.month) === data.fy);
  return (
    <>
      <div className="kpis">
        <Kpi label="ON PAYROLL" value={withPay} note={active.length - withPay ? `${active.length - withPay} with no salary set` : 'Everyone has a salary'} />
        <Kpi label="LAST APPROVED RUN" value={runs.find(r => r.status === 'approved') ? inr(runs.find(r => r.status === 'approved')!.totals.net ?? 0) : '—'} small note={runs.find(r => r.status === 'approved') ? `Net, ${monthName(runs.find(r => r.status === 'approved')!.month)}` : 'None yet'} />
        <Kpi label={`PAID IN ${data.fy}`} value={inr(ytd.reduce((n, r) => n + (r.totals.net ?? 0), 0))} small note={`${ytd.length} approved month${ytd.length === 1 ? '' : 's'}; employer contributions ${inr(ytd.reduce((n, r) => n + (r.totals.employer ?? 0), 0))}`} />
        <Kpi label="AWAITING APPROVAL" value={waiting.length} valueColor={waiting.length ? 'var(--amber)' : undefined} note={waiting.length ? waiting.map(r => monthName(r.month, true)).join(', ') : 'Nothing waiting'} />
      </div>
      {!ready && (
        <div className="card" style={{ marginBottom: 18 }}>
          <CardHead title="Before the first run" />
          {steps.map(([done, label, t]) => (
            <div key={label} className="pay-li"><span>{done ? <Chip tone="g">DONE</Chip> : <Chip tone="a">TO DO</Chip>} {label}</span>{!done && <button className="btn sm" onClick={() => goTo(t)}>Open</button>}</div>
          ))}
        </div>
      )}
      <div className="card">
        <CardHead title="Pay runs" sub="A run is worked out from the records: salaries, the confirmed attendance month, sessions and duties, adjustments, loans and the year's tax so far."
          right={data.can.prepare && ready && <div className="hr-acts">
            <input type="month" className="sch-sel" aria-label="Month" max={data.month.slice(0, 7)} value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
            <button className="btn sm pri" disabled={busy} onClick={start}>{busy ? 'Working it out…' : runs.some(r => r.month.slice(0, 7) === month) ? 'Open or work out again' : 'Work out the month'}</button>
          </div>} />
        {runs.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Month</th><th className="pay-n">People</th><th className="pay-n">Gross</th><th className="pay-n">Net</th><th>Prepared</th><th>Approved</th><th className="c">Status</th></tr></thead>
            <tbody>{runs.map(r => <RunRow key={r.id} r={r} open={open} />)}</tbody>
          </table></div>
        ) : <Empty icon={<CalendarCheck size={26} weight="duotone" />} title="No runs yet">{ready ? 'Pick the month and work it out. You can check and redo a draft as often as you like before submitting it.' : 'Finish the steps above first.'}</Empty>}
      </div>
    </>
  );
}

function RunRow({ r, open, who }: { r: PayRun; open: (id: string) => void; who?: string }) {
  return (
    <tr className="hr-row" tabIndex={0} onClick={() => open(r.id)} onKeyDown={e => { if (e.key === 'Enter') open(r.id); }}>
      <td><b>{who ?? monthName(r.month)}</b>{who && <div className="muted" style={{ fontSize: 12 }}>Last day {fmtDate(r.inputs.last_day)}</div>}</td>
      {!who && <td className="pay-n">{r.totals.people ?? 0}</td>}
      <td className="pay-n">{inr(r.totals.gross ?? 0)}</td><td className="pay-n"><b>{inr(r.totals.net ?? 0)}</b></td>
      <td>{r.submittedByName ? <>{r.submittedByName}<div className="muted" style={{ fontSize: 12 }}>{fmtDate(r.submittedAt, true)}</div></> : <span className="muted">—</span>}</td>
      <td>{r.approvedByName ? <>{r.approvedByName}<div className="muted" style={{ fontSize: 12 }}>{fmtDate(r.approvedAt, true)}</div></> : <span className="muted">—</span>}</td>
      <td className="c"><Chip tone={STATUS[r.status].tone}>{STATUS[r.status].t}</Chip></td>
    </tr>
  );
}

function Loans({ data, call, reload, toast }: { data: PayrollData; call: Call; reload: () => void; toast: (m: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [who, setWho] = useState('');
  const [closing, setClosing] = useState<string | null>(null);
  const name = (id: string) => data.people.find(p => p.id === id)?.name ?? 'Someone who has left';
  const open = data.loans.filter(l => l.status === 'open');
  const person = data.people.find(p => p.id === who);
  return (
    <>
      <div className="kpis">
        <Kpi label="OUTSTANDING" value={inr(open.reduce((n, l) => n + l.principal - l.recovered, 0))} note={`${open.length} open`} />
        <Kpi label="RECOVERED EACH MONTH" value={inr(open.reduce((n, l) => n + Math.min(l.instalment, l.principal - l.recovered), 0))} note="From the next run" />
      </div>
      <div className="card">
        <CardHead title="Advances and loans" sub="Payroll takes each instalment in the month's run and closes the loan when it is repaid."
          right={data.can.prepare && <div className="hr-acts">
            <select className="sch-sel" aria-label="Employee" value={who} onChange={e => setWho(e.target.value)}><option value="">Choose an employee</option>{data.people.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button className="btn sm pri" disabled={!who} onClick={() => setAdding(true)}>Give an advance or loan</button>
          </div>} />
        {data.loans.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Employee</th><th>Kind</th><th className="pay-n">Given</th><th className="pay-n">Each month</th><th className="pay-n">Left</th><th>From</th><th /></tr></thead>
            <tbody>{data.loans.map(l => (
              <tr key={l.id} style={l.status === 'open' ? undefined : { opacity: 0.55 }}>
                <td><b>{name(l.staffMemberId)}</b>{l.note && <div className="muted" style={{ fontSize: 12 }}>{l.note}</div>}</td>
                <td>{l.kind === 'advance' ? 'Advance' : 'Loan'}<div className="muted" style={{ fontSize: 12 }}>{fmtDate(l.issuedOn)}</div></td>
                <td className="pay-n">{inr(l.principal)}</td><td className="pay-n">{inr(l.instalment)}</td><td className="pay-n"><b>{inr(l.principal - l.recovered)}</b></td>
                <td>{monthName(l.startMonth, true)}</td>
                <td className="r">{l.status === 'open' ? (data.can.prepare && <button className="btn sm" onClick={() => setClosing(l.id)}>Close</button>) : <Chip tone="n">{l.status === 'closed' ? 'CLOSED' : 'WRITTEN OFF'}</Chip>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty icon={<HandCoins size={26} weight="duotone" />} title="None on record">Choose an employee to record a salary advance or a loan with its monthly instalment.</Empty>}
      </div>
      {adding && person && <LoanForm p={person} data={data} call={call} onClose={() => setAdding(false)} onSaved={m => { setAdding(false); reload(); toast(m); }} />}
      {closing && <CloseLoan id={closing} call={call} onClose={() => setClosing(null)} onSaved={m => { setClosing(null); reload(); toast(m); }} />}
    </>
  );
}

function CloseLoan({ id, call, onClose, onSaved }: { id: string; call: Call; onClose: () => void; onSaved: (m: string) => void }) {
  const [how, setHow] = useState('closed');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title="Close without further recovery" sub="Use this when the rest was repaid outside payroll, or is being written off. Payroll stops taking instalments." onClose={onClose}>
      <div className="sch-fields">
        <Sel id="cl-h" label="WHAT HAPPENED" value={how} onChange={setHow}><option value="closed">Repaid outside payroll</option><option value="written_off">Written off</option></Sel>
        <In id="cl-n" label="NOTE" value={note} maxLength={500} onChange={setNote} />
      </div>
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div className="hr-form-acts"><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || !note.trim()} onClick={async () => { if (await run(setBusy, setErr, () => call('/api/admin/payroll', 'POST', { action: 'loan_close', loanId: id, writeOff: how === 'written_off', note }))) onSaved('Closed'); }}>{busy ? 'Saving…' : 'Close it'}</button></div>
    </Pop>
  );
}

function Settlements({ data, call, reload, toast, open }: { data: PayrollData; call: Call; reload: () => void; toast: (m: string) => void; open: (id: string) => void }) {
  const [making, setMaking] = useState<PayrollData['exits'][number] | null>(null);
  const runs = data.runs.filter(r => r.kind === 'settlement');
  const name = (id: string | null) => data.people.find(p => p.id === id)?.name ?? 'Employee';
  const due = data.exits.filter(x => !runs.some(r => r.exitId === x.id));
  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Exits with no settlement yet" sub="When someone leaves, their final pay is settled here: salary to the last day, leave encashment, gratuity if due, notice shortfall, advances and loans, and the tax for the year." />
        {due.length ? due.map(x => (
          <div key={x.id} className="pay-li">
            <span><b>{name(x.staffMemberId)}</b><small>{x.kind.replace('_', ' ')} · last day {fmtDate(x.lastDay)} · exit {x.status === 'notice' ? 'in notice' : 'closed'}</small></span>
            {data.can.prepare && <button className="btn sm pri" onClick={() => setMaking(x)}>Prepare settlement</button>}
          </div>
        )) : <p className="muted" style={{ fontSize: 13.5 }}>Nobody is waiting for a settlement. Exits are started and closed in People.</p>}
      </div>
      <div className="card">
        <CardHead title="Settlements" sub="Prepared by one person, approved by another, like a pay run." />
        {runs.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Employee</th><th className="pay-n">Gross</th><th className="pay-n">Net</th><th>Prepared</th><th>Approved</th><th className="c">Status</th></tr></thead>
            <tbody>{runs.map(r => <RunRow key={r.id} r={r} open={open} who={name(r.staffMemberId)} />)}</tbody>
          </table></div>
        ) : <Empty icon={<SignOut size={26} weight="duotone" />} title="No settlements yet" />}
      </div>
      {making && <SettlementForm exit={making} who={name(making.staffMemberId)} call={call} onClose={() => setMaking(null)} onSaved={id => { setMaking(null); reload(); toast('Settlement worked out'); open(id); }} />}
    </>
  );
}

function SettlementForm({ exit, who, call, onClose, onSaved }: { exit: PayrollData['exits'][number]; who: string; call: Call; onClose: () => void; onSaved: (id: string) => void }) {
  const [v, setV] = useState({ leaveDays: '0', noticeShortDays: '0', gratuity: 'auto', amount: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    let id = '';
    if (await run(setBusy, setErr, async () => {
      id = (await call<{ id: string }>(RUN, 'POST', { action: 'settlement', exitId: exit.id, leaveDays: Number(v.leaveDays) || 0, noticeShortDays: Number(v.noticeShortDays) || 0, gratuity: v.gratuity === 'amount' ? v.amount : v.gratuity })).id;
    })) onSaved(id);
  };
  return (
    <Pop title={`${who}: final settlement`} sub={`Last working day ${fmtDate(exit.lastDay)}. You can change these and work it out again until it is submitted.`} onClose={onClose}>
      <div className="sch-fields">
        <In id="st-l" label="LEAVE DAYS TO ENCASH" type="number" min={0} max={365} step="0.5" value={v.leaveDays} onChange={x => setV({ ...v, leaveDays: x })} hint="Check their earned leave balance in Staff & Leave. Paid at Basic + DA a day." />
        <In id="st-n" label="NOTICE DAYS NOT SERVED" type="number" min={0} max={365} value={v.noticeShortDays} onChange={x => setV({ ...v, noticeShortDays: x })} hint="Recovered at gross pay a day. Leave at 0 to waive." />
        <Sel id="st-g" label="GRATUITY" value={v.gratuity} onChange={x => setV({ ...v, gratuity: x })}><option value="auto">Work it out (15 days a year after 5 years)</option><option value="none">None</option><option value="amount">Set the amount</option></Sel>
        {v.gratuity === 'amount' && <In id="st-a" label="GRATUITY (RS)" type="number" min={0} value={v.amount} onChange={x => setV({ ...v, amount: x })} />}
      </div>
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div className="hr-form-acts"><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy || (v.gratuity === 'amount' && !v.amount)} onClick={save}>{busy ? 'Working it out…' : 'Work out the settlement'}</button></div>
    </Pop>
  );
}

function Tax({ data, call, toast }: { data: PayrollData; call: Call; toast: (m: string) => void }) {
  const years = [...new Set([data.fy, ...data.runs.filter(r => r.status === 'approved').map(r => fyOf(r.month))])].sort().reverse();
  const [fy, setFy] = useState(data.fy);
  const [busy, setBusy] = useState(false);
  const old = data.people.filter(p => p.active && p.pay?.taxRegime === 'old'), noTds = data.people.filter(p => p.active && p.pay?.tdsExempt);
  const tds = data.runs.filter(r => r.status === 'approved' && fyOf(r.month) === fy).reduce((n, r) => n + (r.totals.byCode?.TDS ?? 0), 0);
  return (
    <>
      <div className="kpis">
        <Kpi label={`TDS DEDUCTED IN ${fy}`} value={inr(tds)} small note="From approved runs" />
        <Kpi label="ON THE OLD REGIME" value={old.length} note={old.slice(0, 3).map(p => p.name).join(', ') || 'Everyone is on the new regime'} />
        <Kpi label="NO TDS DEDUCTED" value={noTds.length} note={data.settings.tdsEnabled ? 'Marked exempt' : 'TDS is switched off for the school'} />
      </div>
      <div className="card">
        <CardHead title="Year statement" sub="For each person: salary paid, the tax computation as of their last approved month, and TDS by quarter. These are the figures Form 16 Part B and the quarterly 24Q return are prepared from. PANs are included, so the download is recorded in the audit trail."
          right={(data.can.prepare || data.can.approve) && <div className="hr-acts">
            <select className="sch-sel" aria-label="Financial year" value={fy} onChange={e => setFy(e.target.value)}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
            <button className="btn sm pri" disabled={busy} onClick={async () => {
              setBusy(true);
              try { const r = await call<{ filename: string; rows: (string | number)[][] }>(`/api/admin/payroll/export?kind=tax&fy=${fy}`, 'GET'); downloadCsv(r.filename, r.rows); toast('Downloaded'); } catch (e: any) { toast(e.message); } finally { setBusy(false); }
            }}><DownloadSimple size={13} /> Download</button>
          </div>} />
        <ul className="muted" style={{ fontSize: 13.5, lineHeight: 1.7, paddingLeft: 18 }}>
          <li>Each month&apos;s TDS is the year&apos;s tax on what has been paid and what the salary projects for the rest of the year, less what is already deducted, spread over the months left. A raise, a bonus or a new declaration changes the months that follow.</li>
          <li>Regime and declarations are set per person under Salaries. The old regime uses the declared amounts: 80C (their own PF is added), 80D, rent for HRA relief, home loan interest and NPS.</li>
          <li>Sthara does not file returns. Take the monthly TDS file from each approved run for the challan, and this statement for 24Q and Form 16.</li>
        </ul>
        {!data.settings.tan && <div className="note" style={{ marginTop: 12 }}>The school&apos;s TAN isn&apos;t set. Add it under Set-up.</div>}
      </div>
    </>
  );
}
