'use client';

import { useMemo, useState } from 'react';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { evenSchedule, validateSchedule, type FeeStructure, type ScheduleItem } from '@/lib/admin/fees';
import { inr, r2 } from '@/lib/admin/format';
import { Field, Workspace } from '../kit';

/** Set or change what one grade is billed this session, and when. */
export default function StructureEditor({ grade, students, session, existing, onClose, onSave }: {
  grade: number; students: number; session: string; existing: FeeStructure | null;
  onClose: () => void; onSave: (body: { grade: number; annualFee: number; schedule: ScheduleItem[]; note: string }) => Promise<void>;
}) {
  const [fee, setFee] = useState(existing ? String(existing.annualFee) : '');
  const [items, setItems] = useState<ScheduleItem[]>(existing?.schedule.length ? existing.schedule : evenSchedule(4, session));
  const [note, setNote] = useState(existing?.note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Bumped when rows are regenerated, so the uncontrolled share inputs remount with the new values.
  const [ver, setVer] = useState(0);

  const annual = Number(fee.replace(/,/g, ''));
  const problem = useMemo(() => validateSchedule(items, session), [items, session]);
  const set = (i: number, patch: Partial<ScheduleItem>) => setItems(xs => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const renumber = (xs: ScheduleItem[]) => xs.map((x, i) => ({ ...x, no: i + 1 }));

  const save = async () => {
    if (!(annual > 0)) { setErr('Enter the annual fee.'); return; }
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr(null);
    try { await onSave({ grade, annualFee: annual, schedule: items, note }); } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <Workspace title={`Grade ${grade} fee structure`} sub={`AY ${session.replace('-', '–')} · ${students} student${students === 1 ? '' : 's'} on roll`} onClose={onClose}
      actions={<button className="btn pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save structure'}</button>}>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="g2" style={{ gap: 16 }}>
          <Field label="ANNUAL FEE (RUPEES)" htmlFor="fs-fee" hint={annual > 0 ? `${inr(annual)} a year · ${inr(annual * students)} across the grade` : undefined}>
            <input id="fs-fee" className="cmp-in num" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="e.g. 96000" />
          </Field>
          <Field label="SPLIT INTO" htmlFor="fs-split">
            <select id="fs-split" className="cmp-sel" value={items.length} onChange={e => { setItems(evenSchedule(Number(e.target.value), session)); setVer(v => v + 1); }}>
              {[1, 2, 3, 4, 6, 12].map(n => <option key={n} value={n}>{n === 1 ? 'One annual payment' : `${n} instalments`}</option>)}
            </select>
          </Field>
        </div>
        <Field label="NOTE (OPTIONAL)" htmlFor="fs-note" hint="Shown to admins only, e.g. what the fee includes.">
          <input id="fs-note" className="cmp-in" value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Tuition, labs and activities; transport billed separately" />
        </Field>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>Instalments</h3>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>#</th><th>Name</th><th>Due on</th><th className="r">Share %</th><th className="r">Per student</th><th /></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="num">{it.no}</td>
                  <td><input aria-label={`Instalment ${it.no} name`} className="cmp-in" style={{ padding: '9px 11px' }} value={it.label} maxLength={60} onChange={e => set(i, { label: e.target.value })} /></td>
                  <td><input aria-label={`Instalment ${it.no} due date`} type="date" className="cmp-in" style={{ padding: '9px 11px' }} value={it.dueOn} onChange={e => set(i, { dueOn: e.target.value })} /></td>
                  <td className="r">
                    <input key={`${ver}-${i}`} aria-label={`Instalment ${it.no} share`} className="cmp-in num" style={{ padding: '9px 11px', width: 90, textAlign: 'right' }} inputMode="decimal"
                      defaultValue={Math.round(it.share * 10000) / 100} onChange={e => set(i, { share: (Number(e.target.value) || 0) / 100 })} />
                  </td>
                  <td className="r num">{annual > 0 ? inr(r2(annual * it.share)) : '—'}</td>
                  <td className="r">
                    {items.length > 1 && (
                      <button className="btn sm" aria-label={`Remove instalment ${it.no}`} onClick={() => { setItems(xs => renumber(xs.filter((_, j) => j !== i))); setVer(v => v + 1); }}><Trash size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 12, flexWrap: 'wrap' }}>
          <button className="btn sm" disabled={items.length >= 12} onClick={() => setItems(xs => renumber([...xs, { no: 0, label: `Instalment ${xs.length + 1}`, dueOn: '', share: 0 }]))}>
            <Plus size={14} weight="bold" /> Add instalment
          </button>
          <span className="muted" style={{ fontSize: 13 }}>Shares total {Math.round(items.reduce((s, x) => s + x.share, 0) * 1000) / 10}%</span>
        </div>
        {(err || problem) && <div className="err" role="alert" style={{ marginTop: 14 }}>{err || problem}</div>}
        {existing && <div className="note" style={{ marginTop: 14 }}>Invoices already raised keep their amounts. The new structure applies to instalments you raise from now on.</div>}
      </div>
    </Workspace>
  );
}
