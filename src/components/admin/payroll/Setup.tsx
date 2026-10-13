'use client';

import { useState } from 'react';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { ListChecksIcon as ListChecks } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { StackIcon as Stack } from '@phosphor-icons/react/dist/ssr/Stack';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { Chip, Empty } from '@/components/canon/ui';
import { CardHead } from '@/components/admin/kit';
import Pop, { run } from '@/components/schedule/Pop';
import { fmtDate, inr } from '@/lib/admin/format';
import { COUNT_SOURCES, DAY_BASIS, salarySummary, type PayItem, type RateRow, type SalaryLine, type Slab } from '@/lib/payroll/engine';
import type { Call, PayrollData, Template } from '@/lib/payroll/usePayroll';
import { In, Sel } from '@/components/admin/people/forms';
import { LineEditor } from './Salaries';

const API = '/api/admin/payroll';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const RATE_NAME: Record<string, string> = { pf: 'Provident fund', esi: 'ESI', bonus: 'Statutory bonus', gratuity: 'Gratuity', 'it:new': 'Income tax, new regime', 'it:old': 'Income tax, old regime' };
const rateName = (k: string) => RATE_NAME[k] ?? `Professional tax, ${k.slice(3)}`;
const FIELD: Record<string, string> = {
  employee_pct: 'Employee %', employer_pct: 'Employer %', eps_pct: 'Pension (EPS) %', ceiling: 'Wage ceiling (Rs)', admin_pct: 'Admin charges %', edli_pct: 'EDLI %', pct: 'Bonus %',
  wage_ceiling: 'Eligible up to wage (Rs)', calc_ceiling: 'Worked on at most (Rs)', min_years: 'Years of service needed', days: 'Days per year', divisor: 'Days in a month', cap: 'Maximum (Rs)',
  standard_deduction: 'Standard deduction (Rs)', rebate_income: 'Rebate up to income (Rs)', rebate_max: 'Maximum rebate (Rs)', cess_pct: 'Cess %',
};
const how = (i: PayItem) => (i.calc === 'fixed' ? 'Fixed amount' : i.calc === 'percent' ? `% of ${i.percentOf === 'basic' ? 'Basic' : i.percentOf === 'basic_da' ? 'Basic + DA' : 'gross'}` : `Rate x ${COUNT_SOURCES[i.countSource!].toLowerCase()}${i.threshold ? ` after the first ${i.threshold}` : ''}`);
const rateText = (key: string, v: any): string => {
  if (!v) return 'Not set';
  if (v.slabs) return (v.slabs as Slab[]).map((s, i) => `${i ? '' : 'up to '}${s.upto === null ? 'above' : inr(s.upto)}: ${s.pct !== undefined ? `${s.pct}%` : inr(s.amount ?? 0)}`).join(', ') + (v.standard_deduction ? `. Standard deduction ${inr(v.standard_deduction)}` : '') + (v.february_amount ? `. February ${inr(v.february_amount)}` : '');
  return Object.entries(v).map(([k, x]) => `${(FIELD[k] ?? k).replace(/ \(Rs\)| %$/g, '')} ${String(k).endsWith('pct') ? `${x}%` : typeof x === 'number' && x >= 1000 ? inr(x) : x}`).join(', ');
};

/** Pay items and how each is worked out, salary templates by grade, the school's payroll settings, and the rates in force. */
export default function Setup({ data, call, reload, toast }: { data: PayrollData; call: Call; reload: () => void; toast: (m: string) => void }) {
  const [item, setItem] = useState<Partial<PayItem> | null>(null);
  const [tpl, setTpl] = useState<Partial<Template> | null>(null);
  const [rate, setRate] = useState<{ key: string; row: RateRow | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const can = data.can.prepare;
  const done = (m: string) => { setItem(null); setTpl(null); setRate(null); reload(); toast(m); };
  const grade = (id: string | null) => data.grades.find(g => g.id === id)?.name ?? '';

  return (
    <>
      <SettingsCard data={data} call={call} onSaved={() => done('Settings saved')} />

      <div className="card" style={{ margin: '18px 0' }}>
        <CardHead title="Pay items" sub="Your own earnings and deductions. Each says how it is worked out, whether it is taxed, whether PF and ESI are worked on it, and whether it reduces with loss of pay. PF, ESI, professional tax and income tax are added by payroll itself."
          right={can && <button className="btn sm pri" onClick={() => setItem({ kind: 'earning', calc: 'fixed', taxable: true, esiWage: true, prorate: true, active: true, sort: (data.items.length + 1) * 10 })}><Plus size={12} weight="bold" /> Add item</button>} />
        {data.items.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Item</th><th>Worked out as</th><th className="c">Taxable</th><th className="c">PF</th><th className="c">ESI</th><th className="c">Reduces with LOP</th><th /></tr></thead>
            <tbody>{data.items.map(i => (
              <tr key={i.id} style={i.active ? undefined : { opacity: 0.5 }}>
                <td><b>{i.name}</b> {i.role && <Chip tone="b">{i.role === 'basic' ? 'BASIC' : i.role === 'da' ? 'DA' : 'HRA'}</Chip>}<div className="muted num" style={{ fontSize: 12 }}>{i.code} · {i.kind === 'earning' ? 'Earning' : 'Deduction'}{i.active ? '' : ' · switched off'}</div></td>
                <td>{how(i)}</td>
                {(['taxable', 'pfWage', 'esiWage', 'prorate'] as const).map(k => <td key={k} className="c">{i.kind === 'deduction' && k !== 'prorate' ? <span className="muted">—</span> : i[k] ? 'Yes' : 'No'}</td>)}
                <td className="r">{can && <button className="sch-icon" aria-label={`Edit ${i.name}`} onClick={() => setItem(i)}><PencilSimple size={15} /></button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : (
          <Empty icon={<ListChecks size={26} weight="duotone" />} title="No pay items yet">
            Start with the standard set (Basic, DA, HRA, conveyance, special allowance, session fee for visiting staff, and duty and invigilation allowances switched off until you want them), then change it to suit.
            {can && <div style={{ marginTop: 12 }}><button className="btn pri" disabled={busy} onClick={async () => { setBusy(true); try { await call(API, 'POST', { action: 'seed_items' }); done('Standard items added'); } catch (e: any) { toast(e.message); } finally { setBusy(false); } }}>Add the standard set</button></div>}
          </Empty>
        )}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Salary templates" sub="A structure for a grade. Setting someone's salary starts from their grade's template; you then change their own figures."
          right={can && <button className="btn sm pri" disabled={!data.items.length} onClick={() => setTpl({ lines: [], active: true })}><Plus size={12} weight="bold" /> Add template</button>} />
        {data.templates.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Template</th><th>Grade</th><th className="pay-n">Monthly gross</th><th className="c">Items</th><th /></tr></thead>
            <tbody>{data.templates.map(t => (
              <tr key={t.id}><td><b>{t.name}</b></td><td>{grade(t.gradeId) || <span className="muted">Any</span>}</td><td className="pay-n">{inr(salarySummary(t.lines, data.items).gross)}</td><td className="c num">{t.lines.length}</td>
                <td className="r">{can && <button className="sch-icon" aria-label={`Edit ${t.name}`} onClick={() => setTpl(t)}><PencilSimple size={15} /></button>}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <Empty icon={<Stack size={26} weight="duotone" />} title="No templates yet">{data.items.length ? 'Add one for each grade: PRT, TGT, PGT, office and support grades.' : 'Add pay items first.'}</Empty>}
      </div>

      <div className="card">
        <CardHead title="Rates in force" sub="Sthara keeps these tables up to date from each one's effective date. If your school must use a different rate, set your own from a date with the reason; it applies to runs from then on. Have your accountant confirm them before the first run of a financial year." />
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Rate</th><th>In force</th><th>Since</th><th /></tr></thead>
          <tbody>{data.rates.filter(r => !r.key.startsWith('pt:') || r.key === `pt:${data.settings.ptState}`).map(r => (
            <tr key={r.key}>
              <td><b>{rateName(r.key)}</b>{r.inForce?.override && <div><Chip tone="a">SCHOOL&apos;S OWN</Chip></div>}</td>
              <td style={{ fontSize: 13 }}>{rateText(r.key, r.inForce?.value)}{r.inForce?.override && r.inForce.reason && <div className="muted" style={{ fontSize: 12 }}>{r.inForce.reason}</div>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{r.inForce ? fmtDate(r.inForce.effectiveFrom) : '—'}</td>
              <td className="r">{data.can.approve && can && <button className="btn sm" onClick={() => setRate({ key: r.key, row: r.inForce })}>{r.inForce?.override ? 'Change' : 'Use our own'}</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {!data.settings.ptState && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Pick the professional tax state in the settings above to see its slabs.</p>}
      </div>

      {item && <ItemEditor v={item} call={call} onClose={() => setItem(null)} onSaved={done} />}
      {tpl && <TemplateEditor v={tpl} data={data} call={call} onClose={() => setTpl(null)} onSaved={done} />}
      {rate && <RateEditor rateKey={rate.key} row={rate.row} today={data.today} call={call} onClose={() => setRate(null)} onSaved={done} />}
    </>
  );
}

function Foot({ busy, err, onClose, onSave, onRemove, removeLabel, disabled }: { busy: boolean; err: string | null; onClose: () => void; onSave: () => void; onRemove?: () => void; removeLabel?: string; disabled?: boolean }) {
  return (
    <>
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {onRemove && <button className="btn" disabled={busy} onClick={onRemove}>{removeLabel}</button>}
        <span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy || disabled} onClick={onSave}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </>
  );
}

function SettingsCard({ data, call, onSaved }: { data: PayrollData; call: Call; onSaved: () => void }) {
  const s = data.settings;
  const [v, setV] = useState({ ...s, pfCode: s.pfCode ?? '', esiCode: s.esiCode ?? '', ptState: s.ptState ?? '', tan: s.tan ?? '', employerPan: s.employerPan ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const can = data.can.prepare;
  const box = (k: 'pfEnabled' | 'esiEnabled' | 'tdsEnabled' | 'bonusEnabled' | 'gratuityEnabled', label: string) => <label style={{ display: 'flex', gap: 8, fontSize: 13.5 }}><input type="checkbox" disabled={!can} checked={v[k]} onChange={e => setV({ ...v, [k]: e.target.checked })} /> {label}</label>;
  return (
    <div className="card">
      <CardHead title="Payroll settings" sub={data.configured ? 'These apply to every run from now on. Approved runs keep the figures they were approved with.' : 'Not saved yet. Review these and save before the first run.'} />
      <div className="sch-fields" style={{ marginBottom: 12 }}>
        <Sel id="ps-b" label="A DAY'S PAY IS" value={v.dayBasis} onChange={x => setV({ ...v, dayBasis: x as typeof v.dayBasis })}>{Object.entries(DAY_BASIS).map(([k, l]) => <option key={k} value={k}>Monthly pay over {l.toLowerCase()}</option>)}</Sel>
        <Sel id="ps-pt" label="PROFESSIONAL TAX STATE" value={v.ptState} onChange={x => setV({ ...v, ptState: x })}><option value="">None deducted</option>{data.ptStates.map(st => <option key={st} value={st}>{st}</option>)}</Sel>
        <Sel id="ps-pol" label="PF IS WORKED ON" value={v.pfPolicy} onChange={x => setV({ ...v, pfPolicy: x as 'capped' | 'full' })}><option value="capped">Basic + DA up to the ceiling</option><option value="full">Full Basic + DA</option></Sel>
        <In id="ps-pfc" label="PF ESTABLISHMENT CODE" value={v.pfCode} maxLength={40} onChange={x => setV({ ...v, pfCode: x })} />
        <In id="ps-esc" label="ESI EMPLOYER CODE" value={v.esiCode} maxLength={40} onChange={x => setV({ ...v, esiCode: x })} />
        <In id="ps-tan" label="TAN" value={v.tan} maxLength={10} onChange={x => setV({ ...v, tan: x.toUpperCase() })} />
        <In id="ps-pan" label="SCHOOL'S PAN" value={v.employerPan} maxLength={10} onChange={x => setV({ ...v, employerPan: x.toUpperCase() })} />
        <Sel id="ps-bm" label="BONUS IS PAID IN" value={String(v.bonusMonth)} onChange={x => setV({ ...v, bonusMonth: Number(x) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Sel>
      </div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
        {box('pfEnabled', 'Deduct provident fund')}{box('esiEnabled', 'Deduct ESI for staff within the wage ceiling')}{box('tdsEnabled', 'Deduct income tax (TDS)')}
        {box('bonusEnabled', 'Pay statutory bonus in the bonus month')}{box('gratuityEnabled', 'Work out gratuity in final settlements')}
      </div>
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      {can && <div className="hr-form-acts"><button className="btn pri" disabled={busy} onClick={async () => { if (await run(setBusy, setErr, () => call(API, 'POST', { action: 'settings', ...v }))) onSaved(); }}>{busy ? 'Saving…' : 'Save settings'}</button></div>}
    </div>
  );
}

function ItemEditor({ v, call, onClose, onSaved }: { v: Partial<PayItem>; call: Call; onClose: () => void; onSaved: (m: string) => void }) {
  const [f, setF] = useState({
    name: v.name ?? '', code: v.code ?? '', kind: v.kind ?? 'earning', calc: v.calc ?? 'fixed', percentOf: v.percentOf ?? 'basic', countSource: v.countSource ?? 'duties',
    threshold: String(v.threshold ?? 0), defaultValue: String(v.defaultValue ?? 0), role: v.role ?? '', taxable: v.taxable !== false, pfWage: !!v.pfWage, esiWage: v.esiWage !== false,
    prorate: v.prorate !== false, sort: v.sort ?? 100, active: v.active !== false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const earning = f.kind === 'earning';
  const box = (k: 'taxable' | 'pfWage' | 'esiWage' | 'prorate' | 'active', label: string) => <label style={{ display: 'flex', gap: 8, fontSize: 13.5, marginTop: 8 }}><input type="checkbox" checked={f[k]} onChange={e => setF({ ...f, [k]: e.target.checked })} /> {label}</label>;
  const save = () => call(API, 'POST', { action: 'item', id: v.id, ...f, code: f.code || f.name.slice(0, 12), threshold: Number(f.threshold) || 0, defaultValue: Number(f.defaultValue) || 0, role: f.role || null });
  return (
    <Pop wide title={v.id ? `Edit ${v.name}` : 'Add a pay item'} sub="A change applies to runs worked out from now on. Approved runs keep what they paid." onClose={onClose}>
      <div className="sch-fields">
        <In id="pi-n" label="NAME ON THE PAYSLIP" value={f.name} maxLength={60} onChange={x => setF({ ...f, name: x })} />
        <In id="pi-c" label="SHORT CODE" value={f.code} maxLength={16} onChange={x => setF({ ...f, code: x.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} placeholder="TRANSPORT" />
        <Sel id="pi-k" label="KIND" value={f.kind} onChange={x => setF({ ...f, kind: x as 'earning' | 'deduction' })}><option value="earning">Earning</option><option value="deduction">Deduction</option></Sel>
        <Sel id="pi-h" label="WORKED OUT AS" value={f.calc} onChange={x => setF({ ...f, calc: x as PayItem['calc'] })}>
          <option value="fixed">A fixed amount a month</option><option value="percent">A percentage</option><option value="rate_count">A rate times a count from the records</option>
        </Sel>
        {f.calc === 'percent' && <Sel id="pi-p" label="PERCENTAGE OF" value={f.percentOf} onChange={x => setF({ ...f, percentOf: x as NonNullable<PayItem['percentOf']> })}><option value="basic">Basic</option><option value="basic_da">Basic + DA</option><option value="gross">Gross (the other earnings)</option></Sel>}
        {f.calc === 'rate_count' && <>
          <Sel id="pi-s" label="COUNTS" value={f.countSource} onChange={x => setF({ ...f, countSource: x as NonNullable<PayItem['countSource']> })}>{Object.entries(COUNT_SOURCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>
          <In id="pi-t" label="NOT PAID FOR THE FIRST" type="number" min={0} value={f.threshold} onChange={x => setF({ ...f, threshold: x })} hint="For example 4: only the fifth duty onwards is paid." />
        </>}
        <In id="pi-d" label={f.calc === 'fixed' ? 'USUAL AMOUNT (RS)' : f.calc === 'percent' ? 'USUAL PERCENTAGE' : 'USUAL RATE (RS)'} type="number" min={0} value={f.defaultValue} onChange={x => setF({ ...f, defaultValue: x })} hint="Filled in when the item is added to a salary; each person can differ." />
        {earning && <Sel id="pi-r" label="THIS IS THE SCHOOL'S" value={f.role} onChange={x => setF({ ...f, role: x as PayItem['role'] & string })}><option value="">An allowance</option><option value="basic">Basic pay</option><option value="da">Dearness allowance</option><option value="hra">House rent allowance</option></Sel>}
      </div>
      {earning && box('taxable', 'Taxable')}{earning && box('pfWage', 'PF is worked on it (normally Basic and DA only)')}{earning && box('esiWage', 'Counts as ESI wages')}
      {f.calc !== 'rate_count' && box('prorate', 'Reduces with loss of pay and part months')}{v.id && box('active', 'In use')}
      {f.calc === 'rate_count' && f.countSource === 'covers' && <div className="note info" style={{ marginTop: 12 }}>Most schools don&apos;t pay extra for cover lessons. This item pays only the people whose salary includes it.</div>}
      <Foot busy={busy} err={err} onClose={onClose} disabled={!f.name.trim()} onSave={async () => { if (await run(setBusy, setErr, save)) onSaved('Pay item saved'); }}
        onRemove={v.id ? async () => { let retired = false; if (await run(setBusy, setErr, async () => { retired = (await call<{ retired: boolean }>(API, 'POST', { action: 'item_delete', id: v.id })).retired; })) onSaved(retired ? 'Switched off (salaries use it, so it stays on record)' : 'Removed'); } : undefined} removeLabel="Remove" />
    </Pop>
  );
}

function TemplateEditor({ v, data, call, onClose, onSaved }: { v: Partial<Template>; data: PayrollData; call: Call; onClose: () => void; onSaved: (m: string) => void }) {
  const [name, setName] = useState(v.name ?? '');
  const [gradeId, setGradeId] = useState(v.gradeId ?? '');
  const [lines, setLines] = useState<SalaryLine[]>(v.lines ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop wide title={v.id ? `Edit ${v.name}` : 'Add a salary template'} sub="Changing a template doesn't change anyone's salary; it is only where a new salary starts from." onClose={onClose}>
      <div className="sch-fields" style={{ marginBottom: 12 }}>
        <In id="tp-n" label="NAME" value={name} maxLength={80} onChange={setName} placeholder="TGT" />
        <Sel id="tp-g" label="FOR GRADE" value={gradeId} onChange={setGradeId}><option value="">Any grade</option>{data.grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</Sel>
      </div>
      <LineEditor lines={lines} setLines={setLines} items={data.items} />
      <Foot busy={busy} err={err} onClose={onClose} disabled={!name.trim() || !lines.length || lines.some(l => !Number.isFinite(l.value))}
        onSave={async () => { if (await run(setBusy, setErr, () => call(API, 'POST', { action: 'template', id: v.id, name, gradeId: gradeId || null, lines }))) onSaved('Template saved'); }}
        onRemove={v.id ? async () => { if (await run(setBusy, setErr, () => call(API, 'POST', { action: 'template_delete', id: v.id }))) onSaved('Template removed'); } : undefined} removeLabel="Remove" />
    </Pop>
  );
}

function RateEditor({ rateKey, row, today, call, onClose, onSaved }: { rateKey: string; row: RateRow | null; today: string; call: Call; onClose: () => void; onSaved: (m: string) => void }) {
  const base = (row?.value ?? {}) as Record<string, any>;
  const scalar = Object.keys(base).filter(k => typeof base[k] === 'number' && FIELD[k]);
  const [nums, setNums] = useState<Record<string, string>>(Object.fromEntries(scalar.map(k => [k, String(base[k])])));
  const field: 'pct' | 'amount' = rateKey.startsWith('pt:') ? 'amount' : 'pct';
  const [slabs, setSlabs] = useState<{ upto: string; val: string }[]>(((base.slabs as Slab[] | undefined) ?? []).map(s => ({ upto: s.upto === null ? '' : String(s.upto), val: String(s[field] ?? 0) })));
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasSlabs = !!base.slabs;
  const value = () => ({
    ...Object.fromEntries(Object.entries(nums).map(([k, x]) => [k, Number(x)])), ...(base.marginal_relief !== undefined ? { marginal_relief: base.marginal_relief } : {}),
    ...(hasSlabs ? { slabs: slabs.map((s, i) => ({ upto: i === slabs.length - 1 ? null : Number(s.upto), [field]: Number(s.val) })) } : {}),
  });
  return (
    <Pop wide title={`${rateName(rateKey)}: use the school's own rate`} sub="This replaces Sthara's table for your school from the date you give. If Sthara later publishes a newer table, the newer one applies from its date." onClose={onClose}>
      <div className="sch-fields" style={{ marginBottom: 12 }}>
        <In id="re-f" label="APPLIES FROM" type="date" value={from} onChange={setFrom} />
        {scalar.map(k => <In key={k} id={`re-${k}`} label={FIELD[k].toUpperCase()} type="number" min={0} step="any" value={nums[k] ?? ''} onChange={x => setNums({ ...nums, [k]: x })} />)}
      </div>
      {hasSlabs && <>
        <div className="muted" style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.07em', marginBottom: 6 }}>SLABS</div>
        {slabs.map((s, i) => (
          <div key={i} className="pay-sal" style={{ gridTemplateColumns: '1fr 1fr 34px' }}>
            {i === slabs.length - 1 ? <span>Above that</span> : <input type="number" min={0} aria-label="Up to" placeholder="Up to (Rs)" value={s.upto} onChange={e => setSlabs(slabs.map((x, j) => (j === i ? { ...x, upto: e.target.value } : x)))} />}
            <input type="number" min={0} step="any" aria-label={field === 'pct' ? 'Percent' : 'Amount'} placeholder={field === 'pct' ? '%' : 'Rs a month'} value={s.val} onChange={e => setSlabs(slabs.map((x, j) => (j === i ? { ...x, val: e.target.value } : x)))} />
            {slabs.length > 1 && i < slabs.length - 1 ? <button className="sch-icon" aria-label="Remove slab" onClick={() => setSlabs(slabs.filter((_, j) => j !== i))}><Trash size={14} /></button> : <span />}
          </div>
        ))}
        <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setSlabs([...slabs.slice(0, -1), { upto: '', val: '0' }, slabs[slabs.length - 1] ?? { upto: '', val: '0' }])}>Add a slab</button>
      </>}
      <div className="cmp-fld" style={{ marginTop: 12 }}><label htmlFor="re-r">REASON</label><textarea id="re-r" className="hr-ta" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why the school uses a different rate (kept on record and in the audit trail)." /></div>
      <Foot busy={busy} err={err} onClose={onClose} disabled={!reason.trim() || !from}
        onSave={async () => { if (await run(setBusy, setErr, () => call(API, 'POST', { action: 'rate_override', key: rateKey, effectiveFrom: from, value: value(), reason }))) onSaved('The school\'s own rate is saved'); }}
        onRemove={row?.override ? async () => { if (await run(setBusy, setErr, () => call(API, 'POST', { action: 'rate_override_delete', key: rateKey, effectiveFrom: row.effectiveFrom }))) onSaved('Back to Sthara\'s rate'); } : undefined} removeLabel="Go back to Sthara's rate" />
    </Pop>
  );
}
