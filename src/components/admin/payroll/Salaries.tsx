'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { WalletIcon as Wallet } from '@phosphor-icons/react/dist/ssr/Wallet';
import { Pager, usePaged } from '@/components/canon/Pager';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { CardHead, Kpi, Workspace, downloadCsv } from '@/components/admin/kit';
import Pop, { run } from '@/components/schedule/Pop';
import { fmtDate, inr } from '@/lib/admin/format';
import { COUNT_SOURCES, DEFAULT_PERSON_PAY, monthName, monthlyFull, salarySummary, type Declaration, type PayItem, type PersonPay, type Salary, type SalaryLine } from '@/lib/payroll/engine';
import type { Call, PayPerson, PayrollData } from '@/lib/payroll/usePayroll';
import { In, Sel } from '@/components/admin/people/forms';

const API = '/api/admin/payroll';
const unit = (i: PayItem) => (i.calc === 'fixed' ? 'Rs a month' : i.calc === 'percent' ? `% of ${i.percentOf === 'basic' ? 'Basic' : i.percentOf === 'basic_da' ? 'Basic + DA' : 'gross'}` : `Rs each: ${COUNT_SOURCES[i.countSource!].toLowerCase()}${i.threshold ? `, after the first ${i.threshold}` : ''}`);

/** Everyone's current salary, and who has none yet. Open a person for their pay, history, adjustments, loans and tax declaration. */
export default function Salaries({ data, call, reload, toast }: { data: PayrollData; call: Call; reload: () => void; toast: (m: string) => void }) {
  const [q, setQ] = useState('');
  const [view, setView] = useState<'all' | 'none' | 'hold'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const active = data.people.filter(p => p.active);
  const dept = (id: string | null) => data.departments.find(d => d.id === id)?.name ?? '', grade = (id: string | null) => data.grades.find(g => g.id === id)?.name ?? '';
  const needle = q.trim().toLowerCase();
  const shown = active.filter(p => (view === 'all' || (view === 'none' ? !p.salary : p.pay?.onHold)) && (!needle || [p.name, p.employeeCode, p.designation, dept(p.departmentId)].some(v => v?.toLowerCase().includes(needle))));
  const { shown: shownPage, pager } = usePaged(shown, `${q}|${view}`);
  const withPay = active.filter(p => p.salary), monthly = withPay.reduce((n, p) => n + p.salary!.gross, 0);
  const outOfBand = withPay.filter(p => { const g = data.grades.find(x => x.id === p.gradeId); return g && ((g.payMin !== null && p.salary!.gross < g.payMin) || (g.payMax !== null && p.salary!.gross > g.payMax)); });
  const person = open ? data.people.find(p => p.id === open) : null;

  return (
    <>
      <div className="kpis">
        <Kpi label="MONTHLY GROSS" value={inr(monthly)} note={`${withPay.length} people with a salary`} />
        <Kpi label="NO SALARY SET" value={active.length - withPay.length} valueColor={active.length - withPay.length ? 'var(--amber)' : undefined} note="Left out of pay runs" onClick={() => setView('none')} />
        <Kpi label="OUTSIDE THEIR GRADE'S PAY BAND" value={outOfBand.length} note={outOfBand.slice(0, 3).map(p => p.name).join(', ') || 'Everyone is within band'} />
        <Kpi label="PAY ON HOLD" value={active.filter(p => p.pay?.onHold).length} onClick={() => setView('hold')} />
      </div>
      <div className="card">
        <CardHead title="Salaries" sub="A salary is dated: a change starts on its date and the old one stays on record. A change dated into a month already paid comes through as arrears in the next run."
          right={<button className="btn sm" onClick={() => downloadCsv(`salaries-${data.today}.csv`, [
            ['Employee code', 'Name', 'Designation', 'Department', 'Grade', 'Salary from', 'Monthly gross', 'Basic + DA', 'Tax regime', 'Payment', 'On hold'],
            ...active.map(p => [p.employeeCode ?? '', p.name, p.designation, dept(p.departmentId), grade(p.gradeId), p.salary?.effectiveFrom ?? '', p.salary?.gross ?? '', p.salary?.basicDa ?? '', p.pay?.taxRegime ?? 'new', p.pay?.payMode ?? 'bank', p.pay?.onHold ? 'yes' : 'no']),
          ])}><DownloadSimple size={13} /> Export</button>} />
        <div className="sch-bar">
          <input className="hr-search" type="search" aria-label="Search" placeholder="Search name, code, department" value={q} onChange={e => setQ(e.target.value)} />
          <div className="sch-seg" role="tablist" aria-label="Show">
            {([['all', 'Everyone'], ['none', 'No salary'], ['hold', 'On hold']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}
          </div>
        </div>
        {shown.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Name</th><th>Grade</th><th className="pay-n">Monthly gross</th><th>Since</th><th>Tax</th><th /></tr></thead>
            <tbody>{shownPage.map(p => (
              <tr key={p.id} className="hr-row" tabIndex={0} onClick={() => setOpen(p.id)} onKeyDown={e => { if (e.key === 'Enter') setOpen(p.id); }}>
                <td><b>{p.name}</b><div className="muted" style={{ fontSize: 12 }}>{[p.employeeCode, p.designation, dept(p.departmentId)].filter(Boolean).join(' · ')}</div></td>
                <td>{grade(p.gradeId) || <span className="muted">—</span>}</td>
                <td className="pay-n">{p.salary ? <b>{inr(p.salary.gross)}</b> : <Chip tone="a">NOT SET</Chip>}</td>
                <td>{p.salary ? fmtDate(p.salary.effectiveFrom) : <span className="muted">—</span>}{p.upcoming > 0 && <div><Chip tone="b">CHANGE AHEAD</Chip></div>}</td>
                <td>{p.pay?.tdsExempt ? 'No TDS' : `${p.pay?.taxRegime === 'old' ? 'Old' : 'New'} regime`}</td>
                <td>{p.pay?.onHold && <Chip tone="r">ON HOLD</Chip>}</td>
              </tr>
            ))}</tbody>
          </table>
            <Pager {...pager} noun="people" /></div>
        ) : <Empty icon={<Wallet size={26} weight="duotone" />} title="Nobody here">Change the search or the filter.</Empty>}
      </div>
      {person && <PersonPayWorkspace p={person} data={data} call={call} toast={toast} onChanged={reload} onClose={() => setOpen(null)} />}
    </>
  );
}

interface Mine {
  fy: string; salaries: Salary[]; pay: PersonPay;
  adjustments: { id: string; month: string; mode: 'add' | 'override'; itemId: string | null; kind: string; label: string; amount: number; note: string }[];
  loans: { id: string; kind: string; principal: number; issuedOn: string; instalment: number; startMonth: string; status: string; note: string | null; recovered: number }[];
  declarations: { fy: string; items: Declaration; proofsVerified: boolean }[];
  payslips: { id: string; runId: string; month: string; gross: number; deductions: number; net: number; kind: string }[];
}
type Open = { k: 'salary' } | { k: 'settings' } | { k: 'adjust' } | { k: 'loan' } | { k: 'decl' };

function PersonPayWorkspace({ p, data, call, toast, onChanged, onClose }: { p: PayPerson; data: PayrollData; call: Call; toast: (m: string) => void; onChanged: () => void; onClose: () => void }) {
  const [d, setD] = useState<Mine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { call<Mine>(`${API}?member=${p.id}`, 'GET').then(x => { setD(x); setError(null); }).catch(e => setError(e.message)); }, [call, p.id]);
  useEffect(load, [load]);
  const saved = (m: string) => { setOpen(null); load(); onChanged(); toast(m); };
  const act = async (body: Record<string, unknown>, msg: string) => { setBusy(true); try { await call(API, 'POST', body); saved(msg); } catch (e: any) { toast(e.message); } finally { setBusy(false); } };
  const item = (id: string) => data.items.find(i => i.id === id);
  const can = data.can.prepare;
  if (error) return <Workspace title={p.name} onClose={onClose}><div className="note err" role="alert">{error}</div></Workspace>;
  if (!d) return <Workspace title={p.name} onClose={onClose}><div aria-busy="true">{[0, 1, 2].map(i => <Skeleton key={i} h={90} style={{ marginBottom: 14 }} />)}</div></Workspace>;
  const band = data.grades.find(g => g.id === p.gradeId);
  const decl = d.declarations.find(x => x.fy === d.fy) ?? null;
  const full = p.salary ? monthlyFull(p.salary.lines, data.items) : new Map<string, number>();

  return (
    <Workspace wide title={`${p.name}: pay`} sub={[p.employeeCode, p.designation, band?.name].filter(Boolean).join(' · ')} onClose={onClose}
      actions={p.pay?.onHold ? <Chip tone="r">PAY ON HOLD</Chip> : undefined}>
      <div className="g2" style={{ marginBottom: 18 }}>
        <div className="card">
          <CardHead title="Salary" sub={p.salary ? `From ${fmtDate(p.salary.effectiveFrom)}.${band && (band.payMin !== null || band.payMax !== null) ? ` Grade band ${band.payMin !== null ? inr(band.payMin) : 'open'} to ${band.payMax !== null ? inr(band.payMax) : 'open'}.` : ''}` : 'No salary set: they are left out of pay runs.'}
            right={can && <button className="btn sm pri" onClick={() => setOpen({ k: 'salary' })}>{p.salary ? 'Change salary' : 'Set salary'}</button>} />
          {p.salary ? <>
            {p.salary.lines.map(l => { const i = item(l.itemId); return i ? (
              <div key={l.itemId} className="pay-li"><span>{i.name}{i.kind === 'deduction' && <> <Chip tone="n">DEDUCTION</Chip></>}{i.calc !== 'fixed' && <small>{l.value} {unit(i)}</small>}</span>
                <span className="pay-n">{i.calc === 'rate_count' ? 'By the month\'s count' : inr(Math.round(full.get(i.id) ?? 0))}</span></div>
            ) : null; })}
            <div className="pay-li tot"><span>Monthly gross (fixed part)</span><span className="pay-n">{inr(p.salary.gross)}</span></div>
          </> : <Empty icon={<Wallet size={26} weight="duotone" />} title="Not set" />}
        </div>
        <div className="card">
          <CardHead title="Tax and statutory" right={can && <button className="btn sm" onClick={() => setOpen({ k: 'settings' })}>Edit</button>} />
          <dl className="hr-kv">
            <div><dt>Tax regime</dt><dd>{d.pay.tdsExempt ? 'No TDS deducted' : d.pay.taxRegime === 'old' ? 'Old regime' : 'New regime'}</dd></div>
            <div><dt>Provident fund</dt><dd>{{ policy: 'School policy', exempt: 'Not a member', capped: 'On the ceiling', full: 'On full Basic + DA' }[d.pay.pfMode]}{d.pay.vpfPct ? ` + ${d.pay.vpfPct}% voluntary` : ''}</dd></div>
            <div><dt>ESI</dt><dd>{d.pay.esiExempt ? 'Not covered' : 'By wage'}</dd></div>
            <div><dt>Professional tax</dt><dd>{d.pay.ptExempt ? 'Exempt' : 'By slab'}</dd></div>
            <div><dt>Paid by</dt><dd>{{ bank: 'Bank transfer', cash: 'Cash', cheque: 'Cheque' }[d.pay.payMode]}</dd></div>
            <div><dt>Hold</dt><dd className={d.pay.onHold ? undefined : 'none'}>{d.pay.onHold ? d.pay.holdReason : 'No'}</dd></div>
          </dl>
          <div style={{ marginTop: 16 }}>
            <CardHead title={`Tax declaration ${d.fy}`} sub={decl ? (decl.proofsVerified ? 'Proofs verified.' : 'Declared; proofs not yet verified.') : d.pay.taxRegime === 'old' ? 'Nothing declared: tax is worked with no deductions.' : 'Not needed on the new regime, except other income, or salary paid earlier this year outside Sthara.'}
              right={can && <button className="btn sm" onClick={() => setOpen({ k: 'decl' })}>{decl ? 'Edit' : 'Enter'}</button>} />
          </div>
        </div>
      </div>

      <div className="g2" style={{ marginBottom: 18 }}>
        <div className="card">
          <CardHead title="Additions, deductions and overrides" sub="One-off lines for a month, each with its note." right={can && <button className="btn sm" onClick={() => setOpen({ k: 'adjust' })}><Plus size={12} weight="bold" /> Add</button>} />
          {d.adjustments.length ? d.adjustments.map(a => (
            <div key={a.id} className="pay-li">
              <span>{a.label} {a.mode === 'override' ? <Chip tone="a">OVERRIDE</Chip> : <Chip tone={a.kind === 'earning' ? 'g' : 'n'}>{a.kind === 'earning' ? 'ADDITION' : 'DEDUCTION'}</Chip>}<small>{monthName(a.month)} · {a.note}</small></span>
              <span className="pay-n">{inr(a.amount)}{can && <button className="sch-icon" aria-label={`Remove ${a.label}`} disabled={busy} onClick={() => act({ action: 'adjustment_delete', adjustmentId: a.id }, 'Removed')} style={{ display: 'inline-grid', verticalAlign: 'middle', marginLeft: 4 }}><Trash size={14} /></button>}</span>
            </div>
          )) : <p className="muted" style={{ fontSize: 13.5 }}>None.</p>}
        </div>
        <div className="card">
          <CardHead title="Advances and loans" right={can && <button className="btn sm" onClick={() => setOpen({ k: 'loan' })}><Plus size={12} weight="bold" /> Add</button>} />
          {d.loans.length ? d.loans.map(l => (
            <div key={l.id} className="pay-li">
              <span>{l.kind === 'advance' ? 'Salary advance' : 'Loan'} of {inr(l.principal)} {l.status !== 'open' && <Chip tone="n">{l.status === 'closed' ? 'CLOSED' : 'WRITTEN OFF'}</Chip>}
                <small>Given {fmtDate(l.issuedOn)} · {inr(l.instalment)} a month from {monthName(l.startMonth)}{l.note ? ` · ${l.note}` : ''}</small></span>
              <span className="pay-n">{inr(l.principal - l.recovered)} left</span>
            </div>
          )) : <p className="muted" style={{ fontSize: 13.5 }}>None.</p>}
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <CardHead title="Salary history" />
          <ul className="hr-tl">{d.salaries.map((s, i) => {
            const sum = salarySummary(s.lines, data.items), ahead = s.effectiveFrom > data.today;
            return (
              <li key={s.id} className={ahead ? 'due' : undefined}>
                <div className="when">{fmtDate(s.effectiveFrom)}{ahead && <> <Chip tone="a">AHEAD</Chip></>}</div>
                <div className="what">{inr(sum.gross)} a month</div>
                <div className="why">Basic + DA {inr(sum.basicDa)}{s.reason ? `. ${s.reason}` : i === d.salaries.length - 1 ? '. First salary on record.' : ''}
                  {can && i === 0 && d.salaries.length > 0 && <div><button className="btn sm" style={{ marginTop: 6 }} disabled={busy} onClick={() => act({ action: 'salary_delete', salaryId: s.id }, 'Removed')}>Remove</button></div>}
                </div>
              </li>
            );
          })}</ul>
          {!d.salaries.length && <p className="muted" style={{ fontSize: 13.5 }}>Nothing yet.</p>}
        </div>
        <div className="card">
          <CardHead title="Payslips" sub="Approved runs. Open the run to print one." />
          {d.payslips.length ? (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Month</th><th className="pay-n">Gross</th><th className="pay-n">Deductions</th><th className="pay-n">Net</th></tr></thead>
              <tbody>{d.payslips.map(s => <tr key={s.id}><td>{monthName(s.month)}{s.kind === 'settlement' && <> <Chip tone="n">SETTLEMENT</Chip></>}</td><td className="pay-n">{inr(s.gross)}</td><td className="pay-n">{inr(s.deductions)}</td><td className="pay-n"><b>{inr(s.net)}</b></td></tr>)}</tbody>
            </table></div>
          ) : <p className="muted" style={{ fontSize: 13.5 }}>No approved runs yet.</p>}
        </div>
      </div>

      {open?.k === 'salary' && <SalaryForm p={p} data={data} call={call} onClose={() => setOpen(null)} onSaved={saved} />}
      {open?.k === 'settings' && <PaySettingsForm p={p} pay={d.pay} call={call} onClose={() => setOpen(null)} onSaved={saved} />}
      {open?.k === 'adjust' && <AdjustmentForm person={p} month={data.month} data={data} call={call} onClose={() => setOpen(null)} onSaved={() => saved('Saved. It goes into that month\'s run')} />}
      {open?.k === 'loan' && <LoanForm p={p} data={data} call={call} onClose={() => setOpen(null)} onSaved={saved} />}
      {open?.k === 'decl' && <DeclarationForm p={p} fy={d.fy} decl={decl} regime={d.pay.taxRegime} call={call} onClose={() => setOpen(null)} onSaved={saved} />}
    </Workspace>
  );
}

function Foot({ busy, err, onClose, onSave, label, disabled }: { busy: boolean; err: string | null; onClose: () => void; onSave: () => void; label: string; disabled?: boolean }) {
  return (
    <>
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div className="hr-form-acts"><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy || disabled} onClick={onSave}>{busy ? 'Saving…' : label}</button></div>
    </>
  );
}

/** Editable salary lines: pick items, give each its figure. Shared by a person's salary and a grade template. */
export function LineEditor({ lines, setLines, items }: { lines: SalaryLine[]; setLines: (l: SalaryLine[]) => void; items: PayItem[] }) {
  const unused = items.filter(i => i.active && !lines.some(l => l.itemId === i.id));
  const total = salarySummary(lines, items);
  return (
    <div>
      {lines.map(l => {
        const i = items.find(x => x.id === l.itemId);
        if (!i) return null;
        return (
          <div key={l.itemId} className="pay-sal">
            <span>{i.name} {i.kind === 'deduction' && <Chip tone="n">DEDUCTION</Chip>}<div className="u">{unit(i)}</div></span>
            <input type="number" min={0} step="any" aria-label={i.name} value={Number.isFinite(l.value) ? l.value : ''} onChange={e => setLines(lines.map(x => (x.itemId === l.itemId ? { ...x, value: e.target.value === '' ? NaN : Number(e.target.value) } : x)))} />
            <button className="sch-icon" aria-label={`Remove ${i.name}`} onClick={() => setLines(lines.filter(x => x.itemId !== l.itemId))}><Trash size={14} /></button>
          </div>
        );
      })}
      {unused.length > 0 && (
        <select className="sch-sel" style={{ marginTop: 10 }} aria-label="Add a pay item" value="" onChange={e => { const i = items.find(x => x.id === e.target.value); if (i) setLines([...lines, { itemId: i.id, value: i.defaultValue }]); }}>
          <option value="">Add a pay item…</option>{unused.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      )}
      <div className="pay-li tot" style={{ marginTop: 10 }}><span>Monthly gross (fixed part)<small style={{ fontWeight: 500 }}>Basic + DA {inr(total.basicDa)} · deductions {inr(total.deductions)}</small></span><span className="pay-n">{inr(total.gross)}</span></div>
    </div>
  );
}

function SalaryForm({ p, data, call, onClose, onSaved }: { p: PayPerson; data: PayrollData; call: Call; onClose: () => void; onSaved: (m: string) => void }) {
  const templates = data.templates.filter(t => t.active);
  const mine = templates.find(t => t.gradeId && t.gradeId === p.gradeId);
  const [templateId, setTemplateId] = useState(p.salary ? '' : mine?.id ?? '');
  const [lines, setLines] = useState<SalaryLine[]>(p.salary?.lines ?? mine?.lines ?? []);
  const [from, setFrom] = useState(p.salary ? data.today : p.joinedOn && p.joinedOn > `${data.fy.slice(0, 4)}-04-01` ? p.joinedOn : data.month);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const band = data.grades.find(g => g.id === p.gradeId), gross = salarySummary(lines, data.items).gross;
  const out = band && ((band.payMin !== null && gross < band.payMin) || (band.payMax !== null && gross > band.payMax));
  const save = async () => {
    let arrears = false;
    if (await run(setBusy, setErr, async () => { arrears = (await call<{ arrears: boolean }>(API, 'POST', { action: 'salary', id: p.id, effectiveFrom: from, lines, templateId: templateId || null, reason })).arrears; }))
      onSaved(arrears ? 'Salary saved. The difference for months already paid comes as arrears in the next run' : 'Salary saved');
  };
  return (
    <Pop wide title={`${p.name}: ${p.salary ? 'change salary' : 'set salary'}`} sub="Set the whole salary as it will be from the date. The one before stays on record." onClose={onClose}>
      <div className="sch-fields" style={{ marginBottom: 12 }}>
        <In id="s-f" label="STARTS ON" type="date" value={from} onChange={setFrom} hint={from < data.month ? 'Back-dated: months already approved are topped up as arrears.' : from > data.today ? 'A future date: pay changes from that day.' : undefined} />
        {templates.length > 0 && (
          <Sel id="s-t" label="START FROM A TEMPLATE" value={templateId} onChange={x => { setTemplateId(x); const t = templates.find(y => y.id === x); if (t) setLines(t.lines); }}>
            <option value="">None</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Sel>
        )}
        {p.salary && <In id="s-r" label="REASON" value={reason} maxLength={500} onChange={setReason} placeholder="Annual increment, promotion to PGT" />}
      </div>
      {data.items.length ? <LineEditor lines={lines} setLines={setLines} items={data.items} /> : <div className="note">Add pay items under Set-up first.</div>}
      {out && <div className="note" style={{ marginTop: 12 }}>This is outside the pay band for {band!.name} ({band!.payMin !== null ? inr(band!.payMin) : 'open'} to {band!.payMax !== null ? inr(band!.payMax) : 'open'}). You can still save it.</div>}
      <Foot busy={busy} err={err} onClose={onClose} onSave={save} label="Save salary" disabled={!lines.length || lines.some(l => !Number.isFinite(l.value)) || !from || (!!p.salary && !reason.trim())} />
    </Pop>
  );
}

function PaySettingsForm({ p, pay, call, onClose, onSaved }: { p: PayPerson; pay: PersonPay; call: Call; onClose: () => void; onSaved: (m: string) => void }) {
  const [v, setV] = useState({ ...DEFAULT_PERSON_PAY, ...pay, vpf: String(pay.vpfPct || ''), why: pay.holdReason ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = (k: 'esiExempt' | 'ptExempt' | 'tdsExempt' | 'onHold', label: string) => <label style={{ display: 'flex', gap: 8, fontSize: 13.5, marginTop: 8 }}><input type="checkbox" checked={v[k]} onChange={e => setV({ ...v, [k]: e.target.checked })} /> {label}</label>;
  return (
    <Pop title={`${p.name}: tax and statutory`} onClose={onClose}>
      <div className="sch-fields">
        <Sel id="ps-r" label="TAX REGIME" value={v.taxRegime} onChange={x => setV({ ...v, taxRegime: x as 'new' | 'old' })}><option value="new">New regime</option><option value="old">Old regime (with declarations)</option></Sel>
        <Sel id="ps-pf" label="PROVIDENT FUND" value={v.pfMode} onChange={x => setV({ ...v, pfMode: x as PersonPay['pfMode'] })}>
          <option value="policy">Follow the school&apos;s policy</option><option value="capped">On the wage ceiling</option><option value="full">On full Basic + DA</option><option value="exempt">Not a member</option>
        </Sel>
        <In id="ps-v" label="VOLUNTARY PF (%)" type="number" min={0} max={88} value={v.vpf} onChange={x => setV({ ...v, vpf: x })} />
        <Sel id="ps-m" label="PAID BY" value={v.payMode} onChange={x => setV({ ...v, payMode: x as PersonPay['payMode'] })}><option value="bank">Bank transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option></Sel>
      </div>
      {box('esiExempt', 'Not covered by ESI')}{box('ptExempt', 'Exempt from professional tax')}{box('tdsExempt', 'Don\'t deduct income tax (no TDS)')}{box('onHold', 'Hold their pay: worked out each month but left off the bank sheet')}
      {v.onHold && <div style={{ marginTop: 10 }}><In id="ps-w" label="WHY IT IS ON HOLD" value={v.why} maxLength={300} onChange={x => setV({ ...v, why: x })} /></div>}
      <Foot busy={busy} err={err} onClose={onClose} label="Save"
        onSave={async () => { if (await run(setBusy, setErr, () => call(API, 'POST', { action: 'pay_setting', id: p.id, ...v, vpfPct: Number(v.vpf) || 0, holdReason: v.why }))) onSaved('Saved'); }} />
    </Pop>
  );
}

export function AdjustmentForm({ person, month, data, call, onClose, onSaved }: { person: { id: string; name: string }; month: string; data: PayrollData; call: Call; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ month: month.slice(0, 7), mode: 'add', itemId: '', kind: 'earning', label: '', amount: '', taxable: true, note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const items = useMemo(() => data.items.filter(i => i.active), [data.items]);
  const item = items.find(i => i.id === v.itemId);
  return (
    <Pop title={`${person.name}: add or override a line`} sub="An addition or deduction is an extra line on the payslip. An override replaces what the rules worked out for one item this month. Either way the note is kept and printed." onClose={onClose}>
      <div className="sch-seg" role="tablist" aria-label="Kind" style={{ marginBottom: 12 }}>
        <button role="tab" aria-selected={v.mode === 'add'} className={v.mode === 'add' ? 'on' : ''} onClick={() => setV({ ...v, mode: 'add' })}>Add a line</button>
        <button role="tab" aria-selected={v.mode === 'override'} className={v.mode === 'override' ? 'on' : ''} onClick={() => setV({ ...v, mode: 'override' })}>Override an item</button>
      </div>
      <div className="sch-fields">
        <In id="a-m" label="MONTH" type="month" value={v.month} onChange={x => setV({ ...v, month: x })} />
        {v.mode === 'override'
          ? <Sel id="a-i" label="ITEM" value={v.itemId} onChange={x => setV({ ...v, itemId: x })}><option value="">Choose</option>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</Sel>
          : <>
            <Sel id="a-k" label="KIND" value={v.kind} onChange={x => setV({ ...v, kind: x })}><option value="earning">Addition</option><option value="deduction">Deduction</option></Sel>
            <In id="a-l" label="LABEL ON THE PAYSLIP" value={v.label} maxLength={80} onChange={x => setV({ ...v, label: x })} placeholder="Annual day duty" />
          </>}
        <In id="a-a" label={v.mode === 'override' ? 'PAY THIS INSTEAD (RS)' : 'AMOUNT (RS)'} type="number" min={0} value={v.amount} onChange={x => setV({ ...v, amount: x })} />
      </div>
      {v.mode === 'add' && v.kind === 'earning' && <label style={{ display: 'flex', gap: 8, fontSize: 13.5, marginTop: 10 }}><input type="checkbox" checked={v.taxable} onChange={e => setV({ ...v, taxable: e.target.checked })} /> Taxable</label>}
      <div className="cmp-fld" style={{ marginTop: 10 }}><label htmlFor="a-n">NOTE</label><textarea id="a-n" className="hr-ta" maxLength={500} value={v.note} onChange={e => setV({ ...v, note: e.target.value })} placeholder="What it is for, and who agreed it." /></div>
      <Foot busy={busy} err={err} onClose={onClose} label="Save" disabled={!v.note.trim() || v.amount === '' || (v.mode === 'override' ? !item : !v.label.trim())}
        onSave={async () => { if (await run(setBusy, setErr, () => call(API, 'POST', { action: 'adjustment', id: person.id, month: v.month, mode: v.mode, itemId: v.mode === 'override' ? v.itemId : null, kind: v.kind, label: v.label, amount: v.amount, taxable: v.taxable, note: v.note }))) onSaved(); }} />
    </Pop>
  );
}

export function LoanForm({ p, data, call, onClose, onSaved }: { p: { id: string; name: string }; data: PayrollData; call: Call; onClose: () => void; onSaved: (m: string) => void }) {
  const [v, setV] = useState({ kind: 'advance', principal: '', instalment: '', issuedOn: data.today, startMonth: data.month.slice(0, 7), note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const months = Number(v.principal) > 0 && Number(v.instalment) > 0 ? Math.ceil(Number(v.principal) / Number(v.instalment)) : 0;
  return (
    <Pop title={`${p.name}: advance or loan`} sub="Payroll takes the instalment each month until it is repaid, and all that is left in a final settlement." onClose={onClose}>
      <div className="sch-fields">
        <Sel id="l-k" label="KIND" value={v.kind} onChange={x => setV({ ...v, kind: x })}><option value="advance">Salary advance</option><option value="loan">Loan</option></Sel>
        <In id="l-p" label="AMOUNT GIVEN (RS)" type="number" min={1} value={v.principal} onChange={x => setV({ ...v, principal: x })} />
        <In id="l-i" label="RECOVER EACH MONTH (RS)" type="number" min={1} value={v.instalment} onChange={x => setV({ ...v, instalment: x })} hint={months ? `Repaid in ${months} month${months === 1 ? '' : 's'}.` : undefined} />
        <In id="l-d" label="GIVEN ON" type="date" max={data.today} value={v.issuedOn} onChange={x => setV({ ...v, issuedOn: x })} />
        <In id="l-s" label="RECOVERY STARTS" type="month" value={v.startMonth} onChange={x => setV({ ...v, startMonth: x })} />
        <In id="l-n" label="NOTE" value={v.note} maxLength={500} onChange={x => setV({ ...v, note: x })} />
      </div>
      <Foot busy={busy} err={err} onClose={onClose} label="Record" disabled={!v.principal || !v.instalment}
        onSave={async () => { if (await run(setBusy, setErr, () => call(API, 'POST', { action: 'loan', id: p.id, ...v }))) onSaved('Recorded'); }} />
    </Pop>
  );
}

const DECL: [keyof Declaration, string, string][] = [
  ['c80', 'SECTION 80C (LIC, PPF, TUITION FEES, HOME LOAN PRINCIPAL)', 'Their own PF is added automatically. Cap 1,50,000.'],
  ['d80', 'SECTION 80D (HEALTH INSURANCE)', ''], ['rent_annual', 'RENT PAID IN THE YEAR', 'For HRA relief.'],
  ['home_loan_interest', 'HOME LOAN INTEREST', 'Cap 2,00,000.'], ['nps_80ccd1b', 'NPS, SECTION 80CCD(1B)', 'Cap 50,000.'],
];
const BOTH: [keyof Declaration, string, string][] = [
  ['other_income', 'OTHER INCOME DECLARED', 'Interest, rent received.'], ['prev_income', 'SALARY PAID EARLIER THIS YEAR, OUTSIDE STHARA', 'A previous employer, or this school before payroll moved to Sthara.'], ['prev_tds', 'TDS ALREADY DEDUCTED ON THAT', ''],
];
function DeclarationForm({ p, fy, decl, regime, call, onClose, onSaved }: { p: PayPerson; fy: string; decl: Mine['declarations'][number] | null; regime: 'new' | 'old'; call: Call; onClose: () => void; onSaved: (m: string) => void }) {
  const [items, setItems] = useState<Record<string, string>>(Object.fromEntries(Object.entries(decl?.items ?? {}).filter(([, x]) => typeof x === 'number').map(([k, x]) => [k, String(x)])));
  const [metro, setMetro] = useState(!!decl?.items.metro);
  const [verified, setVerified] = useState(!!decl?.proofsVerified);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = ([k, label, hint]: [keyof Declaration, string, string]) => <In key={k} id={`d-${k}`} label={label} type="number" min={0} value={items[k] ?? ''} onChange={x => setItems({ ...items, [k]: x })} hint={hint || undefined} />;
  return (
    <Pop wide title={`${p.name}: tax declaration ${fy}`} sub={regime === 'old' ? 'Amounts for the whole year. Monthly tax is worked on these from the next run.' : 'On the new regime only other income and salary paid earlier this year outside Sthara change the tax. Switch them to the old regime under Tax and statutory to use deductions.'} onClose={onClose}>
      <div className="sch-fields" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        {regime === 'old' && DECL.map(field)}{BOTH.map(field)}
      </div>
      {regime === 'old' && <label style={{ display: 'flex', gap: 8, fontSize: 13.5, marginTop: 12 }}><input type="checkbox" checked={metro} onChange={e => setMetro(e.target.checked)} /> They rent in Delhi, Mumbai, Kolkata or Chennai (HRA relief up to 50% of Basic + DA instead of 40%)</label>}
      <label style={{ display: 'flex', gap: 8, fontSize: 13.5, marginTop: 8 }}><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} /> I have seen the proofs for these amounts</label>
      <Foot busy={busy} err={err} onClose={onClose} label="Save declaration"
        onSave={async () => { if (await run(setBusy, setErr, () => call(API, 'POST', { action: 'declaration', id: p.id, fy, items: { ...items, metro }, proofsVerified: verified }))) onSaved('Declaration saved'); }} />
    </Pop>
  );
}
