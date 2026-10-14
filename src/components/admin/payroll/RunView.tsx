'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { CaretRightIcon as CaretRight } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { Pager, pageWindow, usePageNumber } from '@/components/canon/Pager';
import { Chip, Skeleton } from '@/components/canon/ui';
import { CardHead, Kpi, Workspace, downloadCsv } from '@/components/admin/kit';
import { inr } from '@/lib/admin/format';
import { FLAGS, monthName, type Flag, type PayLine } from '@/lib/payroll/engine';
import { journalRows, ptRows, registerRows, type RunLine } from '@/lib/payroll/outputs';
import { printPayslips } from '@/lib/payroll/payslip';
import type { Call, PayrollData } from '@/lib/payroll/usePayroll';
import { NoteForm } from '@/components/admin/people/forms';
import { AdjustmentForm } from './Salaries';

const RUN = '/api/admin/payroll/run';
interface Detail { run: { id: string; kind: 'regular' | 'settlement'; month: string; status: 'draft' | 'submitted' | 'approved'; warnings: string[]; note: string | null; submittedBy: string | null; inputs: Record<string, any> }; lines: RunLine[] }
const STATUS = { draft: { t: 'DRAFT', tone: 'n' as const }, submitted: { t: 'AWAITING APPROVAL', tone: 'a' as const }, approved: { t: 'APPROVED', tone: 'g' as const } };

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Lines({ title, lines, total, totalLabel }: { title: string; lines: PayLine[]; total: number; totalLabel: string }) {
  return (
    <div>
      <h4>{title}</h4>
      {lines.map((l, i) => (
        <div key={i} className="pay-li">
          <span>{l.name}{l.source === 'override' && <> <Chip tone="a">SET BY HAND</Chip></>}
            {(l.rate !== undefined || l.note) && <small>{l.rate !== undefined ? `${l.count} x ${inr(l.rate)}${l.note ? `. ${l.note}` : ''}` : l.note}</small>}
            {l.full !== undefined && l.full !== l.amount && l.source === 'salary' && <small>Full month {inr(l.full)}</small>}
          </span>
          <span className="pay-n">{inr(l.amount)}</span>
        </div>
      ))}
      {!lines.length && <div className="pay-li"><span className="muted">None</span></div>}
      <div className="pay-li tot"><span>{totalLabel}</span><span className="pay-n">{inr(total)}</span></div>
    </div>
  );
}

/** One pay run: every person's pay with the working behind it, the checks, the approval steps and the files. */
export default function RunView({ id, data, call, schoolName, onClose, onChanged, toast }: {
  id: string; data: PayrollData; call: Call; schoolName: string; onClose: () => void; onChanged: () => void; toast: (m: string) => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [page, setPage] = usePageNumber(`${q}|${onlyFlagged}`);
  const [sendBack, setSendBack] = useState(false);
  const [adjust, setAdjust] = useState<RunLine | null>(null);
  const load = useCallback(() => { call<Detail>(`${RUN}?id=${id}`, 'GET').then(x => { setD(x); setError(null); }).catch(e => setError(e.message)); }, [call, id]);
  useEffect(load, [load]);

  if (error) return <Workspace title="Pay run" onClose={onClose}><div className="note err" role="alert">{error}</div></Workspace>;
  if (!d) return <Workspace title="Pay run" onClose={onClose}><div aria-busy="true">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={70} style={{ marginBottom: 14 }} />)}</div></Workspace>;
  const { run, lines } = d, settlement = run.kind === 'settlement';
  const act = async (body: Record<string, unknown>, msg: string, close = false) => {
    setBusy(true);
    try { await call(RUN, 'POST', body); onChanged(); toast(msg); if (close) onClose(); else load(); } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  const recompute = () => (settlement
    ? act({ action: 'settlement', exitId: data.runs.find(r => r.id === run.id)?.exitId, leaveDays: run.inputs.leave_days, noticeShortDays: run.inputs.notice_short_days, gratuity: run.inputs.gratuity }, 'Worked out again')
    : act({ action: 'compute', month: run.month }, 'Worked out again from the records'));
  const file = async (kind: string) => {
    setBusy(true);
    try {
      const r = await call<{ filename: string; rows?: (string | number)[][]; text?: string; skipped?: string[] }>(`/api/admin/payroll/export?run=${run.id}&kind=${kind}`, 'GET');
      if (r.text !== undefined) downloadText(r.filename, r.text); else downloadCsv(r.filename, r.rows || []);
      toast(r.skipped?.length ? `Downloaded. Left out: ${r.skipped.join('; ')}` : 'Downloaded');
    } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  const tag = run.month.slice(0, 7);
  const sum = (f: (l: RunLine) => number) => lines.reduce((n, l) => n + f(l), 0);
  const employer = sum(l => l.employer.reduce((n, e) => n + e.amount, 0));
  const flagged = lines.filter(l => l.flags.length);
  const needle = q.trim().toLowerCase();
  const shown = lines.filter(l => (!onlyFlagged || l.flags.length) && (!needle || [l.person.name, l.person.code, l.person.department].some(v => v?.toLowerCase().includes(needle))));
  const win = pageWindow(shown.length, page);
  const shownPage = shown.slice(win.from, win.to);
  const pager = { ...win, total: shown.length, setPage };
  const mine = run.submittedBy === data.me;
  const title = settlement ? `Settlement: ${lines[0]?.person.name ?? 'employee'}` : `Pay run: ${monthName(run.month)}`;

  return (
    <Workspace wide title={title} onClose={onClose} sub={settlement ? `Last working day ${run.inputs.last_day}` : `${lines.length} people`}
      actions={<Chip tone={STATUS[run.status].tone}>{STATUS[run.status].t}</Chip>}>
      <div className="kpis">
        <Kpi small label="GROSS" value={inr(sum(l => l.gross))} />
        <Kpi small label="DEDUCTIONS" value={inr(sum(l => l.totalDeductions))} />
        <Kpi small label="NET TO PAY" value={inr(sum(l => l.net))} note={sum(l => (l.onHold ? 1 : 0)) ? `${sum(l => (l.onHold ? 1 : 0))} on hold` : undefined} />
        <Kpi small label="EMPLOYER CONTRIBUTIONS" value={inr(employer)} note="PF, pension, ESI, charges" />
      </div>

      {run.note && run.status === 'draft' && <div className="note" style={{ marginBottom: 14 }}><b>Sent back:</b> {run.note}</div>}
      {run.warnings.map((w, i) => <div key={i} className="note" style={{ marginBottom: 10 }}>{w}</div>)}

      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title={run.status === 'draft' ? 'Check, then submit' : run.status === 'submitted' ? 'Waiting for approval' : 'Approved and frozen'}
          sub={run.status === 'draft' ? 'A draft is worked out from the records as they stand. Change a salary, an adjustment or the attendance month, then work it out again. Nothing is paid or shown to staff until it is approved.'
            : run.status === 'submitted' ? (mine ? 'You submitted this run, so someone else with approval rights has to approve it.' : 'Approving freezes every figure, books loan recoveries and tells staff their payslip is ready.')
              : 'Corrections go into the next run as an adjustment or as arrears.'}
          right={<div className="hr-acts">
            {run.status === 'draft' && data.can.prepare && <>
              <button className="btn sm" disabled={busy} onClick={recompute}>Work out again</button>
              <button className="btn sm" disabled={busy} onClick={() => act({ action: 'delete', id: run.id }, 'Draft removed', true)}>Remove draft</button>
              <button className="btn sm pri" disabled={busy || !lines.length} onClick={() => act({ action: 'submit', id: run.id }, 'Submitted for approval')}>Submit for approval</button>
            </>}
            {run.status === 'submitted' && data.can.prepare && <button className="btn sm" disabled={busy} onClick={() => act({ action: 'recall', id: run.id }, 'Back to draft')}>Recall</button>}
            {run.status === 'submitted' && data.can.approve && <>
              <button className="btn sm" disabled={busy} onClick={() => setSendBack(true)}>Send back</button>
              <button className="btn sm pri" disabled={busy || mine} title={mine ? 'Someone else has to approve a run you submitted' : undefined} onClick={() => act({ action: 'approve', id: run.id }, 'Approved. Staff have been told their payslips are ready')}>Approve</button>
            </>}
          </div>} />
        <div className="hr-acts">
          <button className="btn sm" onClick={() => downloadCsv(`pay-register-${tag}.csv`, registerRows(lines))}><DownloadSimple size={13} /> Register</button>
          <button className="btn sm" onClick={() => downloadCsv(`salary-journal-${tag}.csv`, journalRows(lines, run.month))}><DownloadSimple size={13} /> Journal</button>
          <button className="btn sm" onClick={() => downloadCsv(`professional-tax-${tag}.csv`, ptRows(lines))}><DownloadSimple size={13} /> Professional tax</button>
          {run.status === 'approved' && (data.can.prepare || data.can.approve) && <>
            <button className="btn sm" disabled={busy} onClick={() => file('bank')}><DownloadSimple size={13} /> Bank transfer sheet</button>
            <button className="btn sm" disabled={busy} onClick={() => file('ecr')}><DownloadSimple size={13} /> PF ECR</button>
            <button className="btn sm" disabled={busy} onClick={() => file('esi')}><DownloadSimple size={13} /> ESI</button>
            <button className="btn sm" disabled={busy} onClick={() => file('tds')}><DownloadSimple size={13} /> TDS</button>
            <button className="btn sm" onClick={() => { try { printPayslips(schoolName, lines.filter(l => !l.onHold), run.kind); } catch (e: any) { toast(e.message); } }}><Printer size={13} /> {settlement ? 'Settlement statement' : 'All payslips'}</button>
          </>}
        </div>
        {run.status !== 'approved' && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>The bank sheet, PF, ESI and TDS files and the payslips come once the run is approved.</p>}
      </div>

      <div className="card">
        <CardHead title="Everyone in the run" sub="Open a row to see how the figure was reached." />
        {!settlement && (
          <div className="sch-bar">
            <input className="hr-search" type="search" aria-label="Search" placeholder="Search name, code, department" value={q} onChange={e => setQ(e.target.value)} />
            {flagged.length > 0 && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={onlyFlagged} onChange={e => setOnlyFlagged(e.target.checked)} /> Only the {flagged.length} to check</label>}
          </div>
        )}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th /><th>Name</th><th className="pay-n">Days paid</th><th className="pay-n">Gross</th><th className="pay-n">Deductions</th><th className="pay-n">Net</th><th>To check</th></tr></thead>
            <tbody>{shownPage.map(l => (
              <Fragment key={l.id}>
                <tr className="hr-row" onClick={() => setOpen(open === l.id ? null : l.id)}>
                  <td style={{ width: 28 }}><button className="sch-icon" aria-expanded={open === l.id} aria-label={`${open === l.id ? 'Hide' : 'Show'} ${l.person.name}'s working`}>{open === l.id ? <CaretDown size={14} /> : <CaretRight size={14} />}</button></td>
                  <td><b>{l.person.name}</b><div className="muted" style={{ fontSize: 12 }}>{[l.person.code, l.person.designation, l.person.department].filter(Boolean).join(' · ')}</div></td>
                  <td className="pay-n">{l.days.payable}{l.days.lop > 0 && <div className="muted" style={{ fontSize: 11.5 }}>{l.days.lop} loss of pay</div>}</td>
                  <td className="pay-n">{inr(l.gross)}</td><td className="pay-n">{inr(l.totalDeductions)}</td>
                  <td className="pay-n"><b style={l.net < 0 ? { color: 'var(--red)' } : undefined}>{inr(l.net)}</b></td>
                  <td>{l.flags.length ? l.flags.map(f => <div key={f} style={{ fontSize: 12, color: f === 'negative_net' || f === 'no_bank' ? 'var(--red)' : '#7A5A08', fontWeight: 600 }}>{FLAGS[f as Flag] ?? f}</div>) : <span className="muted">—</span>}</td>
                </tr>
                {open === l.id && (
                  <tr className="pay-open"><td colSpan={7}>
                    <div className="pay-split">
                      <Lines title="Earnings" lines={l.earnings} total={l.gross} totalLabel="Gross" />
                      <Lines title="Deductions" lines={l.deductions} total={l.totalDeductions} totalLabel="Total deductions" />
                    </div>
                    <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
                      {l.days.employed} of {l.days.calDays} days employed, {l.days.payable} of {l.days.basis} paid.
                      {l.employer.length > 0 && ` Employer pays on top: ${l.employer.map(e => `${e.name} ${inr(e.amount)}`).join(', ')}.`}
                    </p>
                    {l.tax && (
                      <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                        Tax ({l.tax.regime} regime, {l.tax.fy}): paid so far {inr(l.tax.incomeToDate)}, this month {inr(l.tax.incomeThisMonth)}, projected for the rest {inr(l.tax.incomeProjected)}.
                        Less standard deduction {inr(l.tax.standardDeduction)}{l.tax.hraExemption ? `, rent relief ${inr(l.tax.hraExemption)}` : ''}{l.tax.chapterVIA ? `, declared deductions ${inr(l.tax.chapterVIA)}` : ''}{l.tax.professionalTax ? `, professional tax ${inr(l.tax.professionalTax)}` : ''}:
                        taxable {inr(l.tax.taxableIncome)}. Tax for the year {inr(l.tax.annualTax)}, already deducted {inr(l.tax.deductedToDate)}, the rest over {l.tax.monthsLeft} month{l.tax.monthsLeft === 1 ? '' : 's'}: {inr(l.tax.thisMonth)}.
                      </p>
                    )}
                    <div className="hr-acts" style={{ marginTop: 10 }}>
                      {run.status === 'draft' && data.can.prepare && !settlement && <button className="btn sm" onClick={() => setAdjust(l)}>Add or override a line</button>}
                      {run.status === 'approved' && <button className="btn sm" onClick={() => { try { printPayslips(schoolName, [l], run.kind); } catch (e: any) { toast(e.message); } }}><Printer size={13} /> {settlement ? 'Statement' : 'Payslip'}</button>}
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}</tbody>
          </table>
            <Pager {...pager} noun="lines" />
        </div>
      </div>

      {sendBack && <NoteForm title="Send the run back" sub="It returns to draft and the person who submitted it is told why." label="WHAT NEEDS TO CHANGE" required cta="Send back"
        onClose={() => setSendBack(false)} onSubmit={async note => { await call(RUN, 'POST', { action: 'send_back', id: run.id, note }); setSendBack(false); onChanged(); toast('Sent back'); onClose(); }} />}
      {adjust && <AdjustmentForm person={{ id: adjust.staffMemberId, name: adjust.person.name }} month={run.month} data={data} call={call} onClose={() => setAdjust(null)}
        onSaved={async () => { setAdjust(null); await act({ action: 'compute', month: run.month }, 'Saved and worked out again'); }} />}
    </Workspace>
  );
}
