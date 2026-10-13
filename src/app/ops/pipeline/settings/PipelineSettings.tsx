'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { Chip, PageBar, Skeleton } from '@/components/canon/ui';
import { REASON_MIN } from '@/lib/settings/registry';
import { ReasonAction, Section, Table, errText, num } from '../../_ui';
import { useOpsApi } from '../../useOpsApi';

interface StageRow { key: string; label: string; sort: number; probability: number; kind: 'open' | 'won' | 'lost'; active: boolean; deals: number }
interface Data {
  stages: StageRow[]; reasons: { key: string; label: string; sort: number; active: boolean }[];
  limits: { role: string; label: string; maxPct: number; fixed: boolean }[]; can: { admin: boolean };
}
type Post = (b: Record<string, unknown>) => Promise<void>;

/** Platform Manager > Pipeline > Stages and discounts. */
export default function PipelineSettings() {
  const api = useOpsApi();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    api<Data>('/pipeline/settings').then(x => { setD(x); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const post: Post = async b => { await api('/pipeline/settings', { method: 'POST', body: b }); load(); };

  return (
    <>
      <div style={{ marginBottom: 12 }}><Link className="btn sm" href="/ops/pipeline"><ArrowLeft size={14} weight="bold" /> Pipeline</Link></div>
      <PageBar eyebrow="PIPELINE" title="Stages and discounts" sub="The stages a deal moves through, why deals are lost, and how much each role can take off list without asking." />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {!d ? <div className="card"><Skeleton h={220} /></div> : (
        <>
          <Section title="Discount limits" sub="The largest discount off list a role may give on its own word. Above it, a quote waits for the lowest role whose limit covers it. A custom price (Mandala) always goes to the director.">
            <Table head={<tr><th>Role</th><th>May give alone, up to</th>{d.can.admin && <th aria-label="Actions" />}</tr>}>
              {d.limits.map(l => <LimitRow key={l.role} l={l} canEdit={d.can.admin} post={post} />)}
            </Table>
            {!d.can.admin && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Only the director changes these.</p>}
          </Section>

          <Section title="Stages" sub="In board order. The win chance weights the forecast. Won and Lost stay: every deal ends in one of them.">
            <Table head={<tr><th>Stage</th><th>Win chance</th><th className="r">Deals in it</th><th>State</th>{d.can.admin && <th aria-label="Actions" />}</tr>}>
              {d.stages.map(s => <StageEdit key={s.key} s={s} canEdit={d.can.admin} post={post} />)}
            </Table>
            {d.can.admin && <AddRow label="New stage" withChance post={(label, reason, chance) => post({ action: 'stage', label, probability: chance, reason })} />}
          </Section>

          <Section title="Loss reasons" sub="Picked when a deal is marked lost.">
            <Table head={<tr><th>Reason</th><th>State</th>{d.can.admin && <th aria-label="Actions" />}</tr>}>
              {d.reasons.map(r => (
                <tr key={r.key} style={r.active ? undefined : { opacity: .6 }}>
                  <td className="nm">{r.label}</td>
                  <td>{r.active ? <Chip tone="g">IN USE</Chip> : <Chip tone="n">RETIRED</Chip>}</td>
                  {d.can.admin && <td>{r.key !== 'other' && <ReasonAction label={r.active ? 'Retire' : 'Bring back'} confirm={r.active ? 'Retire' : 'Bring back'} danger={r.active}
                    run={x => post({ action: 'reason', key: r.key, label: r.label, sort: r.sort, active: !r.active, reason: x })} />}</td>}
                </tr>
              ))}
            </Table>
            {d.can.admin && <AddRow label="New reason" post={(label, reason) => post({ action: 'reason', label, reason })} />}
          </Section>
        </>
      )}
    </>
  );
}

function LimitRow({ l, canEdit, post }: { l: Data['limits'][number]; canEdit: boolean; post: Post }) {
  const [v, setV] = useState(String(l.maxPct));
  return (
    <tr>
      <td className="nm">{l.label}</td>
      <td>{canEdit && !l.fixed ? <span className="acts" style={{ gap: 8 }}><input className="cmp-in" type="number" min={0} max={100} step="0.5" style={{ width: 110 }} aria-label={`${l.label} limit`} value={v} onChange={e => setV(e.target.value)} /> <span className="muted">% off list</span></span> : l.fixed ? 'Any discount, and custom prices' : `${l.maxPct}% off list`}</td>
      {canEdit && <td>{!l.fixed && Number(v) !== l.maxPct && <ReasonAction label="Save" confirm="Save limit" run={reason => post({ action: 'limit', role: l.role, maxPct: Number(v), reason })} />}</td>}
    </tr>
  );
}

function StageEdit({ s, canEdit, post }: { s: StageRow; canEdit: boolean; post: Post }) {
  const [label, setLabel] = useState(s.label);
  const [chance, setChance] = useState(String(s.probability));
  const open = s.kind === 'open';
  const dirty = label.trim() !== s.label || (open && Number(chance) !== s.probability);
  return (
    <tr style={s.active ? undefined : { opacity: .6 }}>
      <td>{canEdit ? <input className="cmp-in" aria-label={`${s.label} name`} maxLength={60} value={label} onChange={e => setLabel(e.target.value)} /> : <span className="nm">{s.label}</span>}</td>
      <td>{open ? (canEdit ? <span className="acts" style={{ gap: 8 }}><input className="cmp-in" type="number" min={0} max={100} style={{ width: 90 }} aria-label={`${s.label} win chance`} value={chance} onChange={e => setChance(e.target.value)} /> <span className="muted">%</span></span> : `${s.probability}%`) : <span className="muted">{s.kind === 'won' ? 'Outcome: won' : 'Outcome: lost'}</span>}</td>
      <td className="r">{num(s.deals)}</td>
      <td>{s.active ? <Chip tone="g">IN USE</Chip> : <Chip tone="n">RETIRED</Chip>}</td>
      {canEdit && (
        <td>
          <span className="acts" style={{ gap: 6 }}>
            {dirty && <ReasonAction label="Save" confirm="Save stage" run={reason => post({ action: 'stage', key: s.key, label, probability: Number(chance), sort: s.sort, active: s.active, reason })} />}
            {open && <ReasonAction label={s.active ? 'Retire' : 'Bring back'} confirm={s.active ? 'Retire' : 'Bring back'} danger={s.active}
              run={reason => post({ action: 'stage', key: s.key, label: s.label, probability: s.probability, sort: s.sort, active: !s.active, reason })} />}
          </span>
        </td>
      )}
    </tr>
  );
}

function AddRow({ label, withChance, post }: { label: string; withChance?: boolean; post: (label: string, reason: string, chance: number) => Promise<void> }) {
  const [name, setName] = useState('');
  const [chance, setChance] = useState('50');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <form className="acts" style={{ marginTop: 12 }} onSubmit={async e => {
        e.preventDefault(); setBusy(true); setErr(null);
        try { await post(name, reason, Number(chance)); setName(''); setReason(''); } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
      }}>
        <input className="cmp-in" style={{ flex: '1 1 180px', width: 'auto' }} aria-label={label} placeholder={label} maxLength={60} value={name} onChange={e => setName(e.target.value)} />
        {withChance && <input className="cmp-in" type="number" min={0} max={100} style={{ width: 110 }} aria-label="Win chance" placeholder="Chance %" value={chance} onChange={e => setChance(e.target.value)} />}
        <input className="cmp-in" style={{ flex: '1 1 180px', width: 'auto' }} aria-label="Reason" placeholder="Reason for the change" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
        <button className="btn sm pri" disabled={busy || name.trim().length < 2 || reason.trim().length < REASON_MIN}>Add</button>
      </form>
      {err && <div className="note err" style={{ marginTop: 10 }} role="alert">{err}</div>}
    </>
  );
}
