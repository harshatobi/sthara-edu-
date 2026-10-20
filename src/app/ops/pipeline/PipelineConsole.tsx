'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FunnelIcon as Funnel } from '@phosphor-icons/react/dist/ssr/Funnel';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { SlidersHorizontalIcon as SlidersHorizontal } from '@phosphor-icons/react/dist/ssr/SlidersHorizontal';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { Pager, usePaged } from '@/components/canon/Pager';
import { OPP_KINDS, QUOTE_STATUS, type Forecast, type OppKind, type QuoteStatus, type Stage } from '@/lib/ops/sales';
import { SOURCES } from '@/lib/ops/revenue';
import { INDIAN_STATES } from '@/lib/ops/territories';
import { PLANS, PLAN_INFO, type Plan } from '@/lib/settings/registry';
import { Kpi, Section, Table, downloadCsv, errText, fmtDate, inr, num } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface Opp {
  id: string; ref: string; name: string; kind: OppKind; stage: string; stageKind: Stage['kind']; amount: number; plan: Plan | null; students: number | null;
  expectedClose: string | null; nextStep: string | null; ownerId: string | null; owner: string | null; schoolId: string | null; school: string | null;
  territory: string | null; state: string | null; closedAt: string | null; lossReason: string | null; createdAt: string; daysInStage: number; overdue: boolean;
  quote: { ref: string; status: QuoteStatus; discountPct: number } | null;
}
interface Approval { id: string; ref: string; oppId: string; opp: string; discountPct: number; students: number; pricePerStudent: number; listPrice: number | null; plan: string; by: string | null; at: string }
interface Data {
  whose: string; today: string; me: string; hasTeam: boolean; stages: Stage[]; opps: Opp[]; forecast: Forecast; approvals: Approval[];
  lossReasons: { key: string; label: string }[]; schools: { id: string; name: string }[]; partners: { id: string; name: string }[]; campaigns: { id: string; name: string }[];
  can: { work: boolean; admin: boolean; assign: boolean };
}
const QUOTE_TONE: Record<QuoteStatus, Tone> = { draft: 'n', pending_approval: 'a', approved: 'b', rejected: 'r', sent: 'p', accepted: 'g', declined: 'r', expired: 'n' };
const monthLabel = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Platform Manager > Pipeline: every deal in sight, as a board, a list and a forecast. */
export default function PipelineConsole() {
  const api = useOpsApi();
  const router = useRouter();
  const params = useSearchParams();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [whose, setWhose] = useState<'mine' | 'team' | 'all'>('all');
  const [view, setView] = useState<'board' | 'list' | 'forecast'>('board');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(() => params.get('new') === '1');

  const load = useCallback(() => {
    api<Data>(`/pipeline?whose=${whose}`).then(x => { setD(x); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api, whose]);
  useEffect(() => { load(); }, [load]);

  const needle = q.trim().toLowerCase();
  const opps = useMemo(() => (d?.opps ?? []).filter(o => !needle || `${o.name} ${o.ref} ${o.owner ?? ''} ${o.state ?? ''} ${o.school ?? ''}`.toLowerCase().includes(needle)), [d, needle]);
  const { shown: oppPage, pager: oppPager } = usePaged(opps, needle);
  const reasonLabel = (k: string | null) => d?.lossReasons.find(r => r.key === k)?.label ?? k ?? '';
  const stageLabel = (k: string) => d?.stages.find(s => s.key === k)?.label ?? k;
  const move = async (o: Opp, stage: string) => {
    // Won and Lost need more than a click: they are finished on the deal's own page.
    if (d?.stages.find(s => s.key === stage)?.kind !== 'open') { router.push(`/ops/pipeline/${o.id}?close=${stage}`); return; }
    try { await api(`/pipeline/${o.id}`, { method: 'PATCH', body: { stage } }); load(); } catch (e) { setErr(errText(e)); }
  };
  const f = d?.forecast;

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Pipeline"
        sub={f ? `${num(f.open.count)} open deal${f.open.count === 1 ? '' : 's'} worth ${inr(f.open.amount)} a year` : 'Loading…'}
        actions={<>
          <Link className="btn" href="/ops/pipeline/settings"><SlidersHorizontal size={15} weight="bold" /> Stages and discounts</Link>
          {d?.can.work && <button className="btn pri" onClick={() => setCreating(c => !c)}><Plus size={15} weight="bold" /> New deal</button>}
        </>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {creating && d && <NewDeal d={d} enquiryId={params.get('enquiry')} initial={{ name: params.get('name') ?? '', state: params.get('state') ?? '', district: params.get('district') ?? '', students: params.get('students') ?? '' }}
        onCancel={() => { setCreating(false); router.replace('/ops/pipeline'); }} onCreated={id => router.push(`/ops/pipeline/${id}`)} />}

      {f && (
        <div className="kpis ops-kpis-5">
          <Kpi label="Open pipeline" value={inr(f.open.amount)} note={`${num(f.open.count)} deals`} onClick={() => setView('board')} />
          <Kpi label="Weighted" value={inr(f.open.weighted)} note="Each deal at its stage's chance" onClick={() => setView('forecast')} />
          <Kpi label="Won, last 90 days" value={inr(f.won.amount)} note={`${num(f.won.count)} deal${f.won.count === 1 ? '' : 's'}`} tone={f.won.count ? 'g' : undefined} />
          <Kpi label="Win rate" value={f.winRate === null ? '—' : `${f.winRate}%`} note={`${num(f.won.count)} won, ${num(f.lost.count)} lost in 90 days`} />
          <Kpi label="Past close date" value={num(f.overdue)} note={f.undated.count ? `${num(f.undated.count)} with no date` : 'Every open deal has a date'} tone={f.overdue ? 'r' : 'g'} onClick={() => setView('list')} />
        </div>
      )}

      {d && d.approvals.length > 0 && (
        <Section title="Waiting for your approval" sub="Discounts above what their writer may give alone.">
          <Table head={<tr><th>Quote</th><th>Deal</th><th>Offer</th><th className="r">Off list</th><th>Asked by</th><th aria-label="Open" /></tr>}>
            {d.approvals.map(a => (
              <tr key={a.id} className="click" onClick={() => router.push(`/ops/pipeline/${a.oppId}`)}>
                <td className="mono" style={{ fontSize: 12.5 }}>{a.ref}</td>
                <td className="nm">{a.opp}</td>
                <td>{num(a.students)} students at {inr(a.pricePerStudent, true)}{a.listPrice ? <span className="muted"> (list {inr(a.listPrice, true)})</span> : <span className="muted"> (custom price)</span>}</td>
                <td className="r"><b style={{ color: '#B45309' }}>{a.listPrice ? `${a.discountPct}%` : 'Custom'}</b></td>
                <td>{a.by ?? '—'}<div className="sub">{fmtDate(a.at)}</div></td>
                <td><span className="btn sm pri">Decide</span></td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      <div className="ops-filters">
        <div className="seg" role="tablist" aria-label="View">
          {([['board', 'Board'], ['list', 'List'], ['forecast', 'Forecast']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}
        </div>
        <div className="seg" role="tablist" aria-label="Whose deals">
          <button role="tab" aria-selected={whose === 'all'} className={whose === 'all' ? 'on' : ''} onClick={() => setWhose('all')}>Everyone&apos;s</button>
          <button role="tab" aria-selected={whose === 'mine'} className={whose === 'mine' ? 'on' : ''} onClick={() => setWhose('mine')}>Mine</button>
          {d?.hasTeam && <button role="tab" aria-selected={whose === 'team'} className={whose === 'team' ? 'on' : ''} onClick={() => setWhose('team')}>My team&apos;s</button>}
        </div>
        {view !== 'forecast' && <input className="cmp-in" style={{ flex: '1 1 220px', width: 'auto' }} placeholder="Search deal, owner, school or state" aria-label="Search deals" value={q} onChange={e => setQ(e.target.value)} />}
        {view === 'list' && <button className="btn sm" disabled={!opps.length} onClick={() => downloadCsv(`sthara-pipeline-${d?.today ?? ''}.csv`, [
          ['Deal', 'Name', 'Kind', 'Stage', 'Annual value (INR)', 'Tier', 'Students', 'Expected close', 'Owner', 'Territory', 'School', 'Quote', 'Quote status', 'Days in stage', 'Next step', 'Loss reason', 'Created'],
          ...opps.map(o => [o.ref, o.name, OPP_KINDS[o.kind], stageLabel(o.stage), o.amount, o.plan ? PLAN_INFO[o.plan].label : '', o.students, o.expectedClose, o.owner, o.territory, o.school, o.quote?.ref, o.quote ? QUOTE_STATUS[o.quote.status] : '', o.daysInStage, o.nextStep, reasonLabel(o.lossReason), fmtDate(o.createdAt)]),
        ])}>Export</button>}
      </div>

      {!d ? <div className="card"><Skeleton h={240} /></div> : view === 'board' ? (
        <div className="ops-board">
          {d.stages.filter(s => s.active || opps.some(o => o.stage === s.key)).map(s => {
            const col = opps.filter(o => o.stage === s.key && (s.kind === 'open' || (o.closedAt && Date.parse(o.closedAt) > Date.now() - 90 * 86_400_000)));
            return (
              <div key={s.key} className="ops-col" data-kind={s.kind}>
                <div className="hd"><b>{s.label}</b><span className="muted">{s.kind === 'open' ? `${s.probability}%` : 'last 90 days'}</span></div>
                <div className="tot">{num(col.length)} · {inr(col.reduce((n, o) => n + o.amount, 0))}</div>
                {col.map(o => (
                  <div key={o.id} className="ops-deal" role="link" tabIndex={0} onClick={() => router.push(`/ops/pipeline/${o.id}`)} onKeyDown={e => { if (e.key === 'Enter') router.push(`/ops/pipeline/${o.id}`); }}>
                    <div className="nm">{o.name}</div>
                    <div className="amt">{o.amount ? inr(o.amount) : <span className="muted">No value yet</span>}{o.kind !== 'new' && <> <Chip tone="n">{OPP_KINDS[o.kind].toUpperCase()}</Chip></>}</div>
                    <div className="sub">{o.owner ?? 'No owner'}{o.expectedClose ? <> · <span style={o.overdue ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{o.overdue ? 'was due' : 'closes'} {fmtDate(o.expectedClose)}</span></> : s.kind === 'open' ? ' · no close date' : ''}</div>
                    {s.kind === 'lost' && o.lossReason && <div className="sub">{reasonLabel(o.lossReason)}</div>}
                    <div className="acts" style={{ gap: 6, marginTop: 6 }}>
                      {o.quote && <Chip tone={QUOTE_TONE[o.quote.status]} title={o.quote.ref}>{QUOTE_STATUS[o.quote.status].toUpperCase()}</Chip>}
                      {s.kind === 'open' && o.daysInStage > 30 && <Chip tone="a" title="Days in this stage">{o.daysInStage} DAYS HERE</Chip>}
                    </div>
                    {d.can.work && s.kind === 'open' && (
                      <select className="cmp-sel" aria-label={`Move ${o.name} to`} value="" style={{ marginTop: 8, padding: '6px 10px', fontSize: 12.5 }}
                        onClick={e => e.stopPropagation()} onChange={e => { if (e.target.value) void move(o, e.target.value); }}>
                        <option value="">Move to…</option>
                        {d.stages.filter(x => x.active && x.key !== o.stage).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </select>
                    )}
                  </div>
                ))}
                {!col.length && <div className="muted" style={{ fontSize: 12.5, padding: '8px 2px' }}>None</div>}
              </div>
            );
          })}
        </div>
      ) : view === 'list' ? (
        <div className="card">
          <Table head={<tr><th>Deal</th><th>Stage</th><th className="r">Annual value</th><th>Expected close</th><th>Owner</th><th>Quote</th><th>Next step</th></tr>}
            empty={!opps.length && <Empty icon={<Funnel size={28} weight="duotone" />} title={d.opps.length ? 'No deal matches' : 'No deals yet'}>{d.opps.length ? undefined : 'Convert a website enquiry, or start a renewal from New deal.'}</Empty>}>
            {oppPage.map(o => (
              <tr key={o.id} className="click" onClick={() => router.push(`/ops/pipeline/${o.id}`)}>
                <td style={{ minWidth: 220 }}><div className="nm">{o.name}</div><div className="sub"><span className="mono">{o.ref}</span> · {OPP_KINDS[o.kind]}{o.territory ? ` · ${o.territory}` : ''}</div></td>
                <td><Chip tone={o.stageKind === 'won' ? 'g' : o.stageKind === 'lost' ? 'r' : 'b'}>{stageLabel(o.stage).toUpperCase()}</Chip>{o.stageKind === 'lost' && o.lossReason && <div className="sub">{reasonLabel(o.lossReason)}</div>}</td>
                <td className="r" style={{ fontWeight: 700 }}>{o.amount ? inr(o.amount) : '—'}{o.students ? <div className="sub" style={{ fontWeight: 500 }}>{num(o.students)} students</div> : null}</td>
                <td style={{ whiteSpace: 'nowrap', color: o.overdue ? 'var(--red)' : undefined, fontWeight: o.overdue ? 700 : undefined }}>{o.expectedClose ? fmtDate(o.expectedClose) : <span className="muted">Not set</span>}</td>
                <td>{o.owner ?? <span className="muted">No owner</span>}</td>
                <td>{o.quote ? <><span className="mono" style={{ fontSize: 12 }}>{o.quote.ref}</span> <Chip tone={QUOTE_TONE[o.quote.status]}>{QUOTE_STATUS[o.quote.status].toUpperCase()}</Chip></> : <span className="muted">None</span>}</td>
                <td style={{ fontSize: 13, maxWidth: 240 }}>{o.nextStep ?? ''}</td>
              </tr>
            ))}
          </Table>
          <Pager {...oppPager} noun="deals" />
        </div>
      ) : f && (
        <>
          <div className="g2">
            <Section title="By stage" sub="Open deals, and what closed in the last 90 days. Weighted is the value times the stage's win chance.">
              <Table head={<tr><th>Stage</th><th className="r">Chance</th><th className="r">Deals</th><th className="r">Value</th><th className="r">Weighted</th></tr>}>
                {f.byStage.map(s => <tr key={s.key}><td className="nm">{s.label}</td><td className="r">{s.kind === 'open' ? `${s.probability}%` : '—'}</td><td className="r">{num(s.count)}</td><td className="r">{inr(s.amount)}</td><td className="r" style={{ fontWeight: 700 }}>{s.kind === 'open' ? inr(s.weighted) : '—'}</td></tr>)}
              </Table>
            </Section>
            <Section title="By expected close" sub="Open deals by the month they are due to close. A deal past its date counts in this month.">
              <Table head={<tr><th>Month</th><th className="r">Deals</th><th className="r">Value</th><th className="r">Weighted</th></tr>}>
                {f.byMonth.map(m => <tr key={m.month}><td className="nm">{monthLabel(m.month)}</td><td className="r">{num(m.count)}</td><td className="r">{inr(m.amount)}</td><td className="r" style={{ fontWeight: 700 }}>{inr(m.weighted)}</td></tr>)}
                <tr><td className="nm muted">No date set</td><td className="r">{num(f.undated.count)}</td><td className="r">{inr(f.undated.amount)}</td><td className="r">—</td></tr>
              </Table>
            </Section>
          </div>
          <Section title="Why deals were lost" sub="The last 90 days.">
            {f.lossReasons.length ? <div className="acts">{f.lossReasons.map(r => <Chip key={r.reason} tone="r">{reasonLabel(r.reason).toUpperCase()} · {r.count}</Chip>)}</div>
              : <p className="muted" style={{ fontSize: 13.5 }}>Nothing lost in the last 90 days.</p>}
          </Section>
        </>
      )}
    </>
  );
}

function NewDeal({ d, enquiryId, initial, onCancel, onCreated }: {
  d: Data; enquiryId: string | null; initial: { name: string; state: string; district: string; students: string }; onCancel: () => void; onCreated: (id: string) => void;
}) {
  const api = useOpsApi();
  const [f, setF] = useState({
    name: initial.name, kind: 'new' as OppKind, schoolId: '', plan: 'shikhara' as Plan, students: initial.students, pricePerStudent: '', expectedClose: '', nextStep: '',
    contactName: '', contactPhone: '', contactEmail: '', state: initial.state, district: initial.district, source: '', campaignId: '', partnerId: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  const list = PLAN_INFO[f.plan].price;
  const price = Number(f.pricePerStudent) || list || 0;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const out = await api<{ id: string }>('/pipeline', { method: 'POST', body: {
        ...f, enquiryId, schoolId: f.kind === 'new' ? undefined : f.schoolId, students: f.students || undefined, pricePerStudent: f.pricePerStudent || list || undefined,
        source: f.source || undefined, campaignId: f.campaignId || undefined, partnerId: f.partnerId || undefined,
        expectedClose: f.expectedClose || undefined, name: f.name || d.schools.find(s => s.id === f.schoolId)?.name || '',
      } });
      onCreated(out.id);
    } catch (x) { setErr(errText(x)); setBusy(false); }
  };
  return (
    <form className="card" style={{ marginBottom: 18 }} onSubmit={submit}>
      <div className="ops-sec-hd"><div>
        <h2 style={{ fontSize: 17, fontWeight: 800 }}>New deal</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>{enquiryId ? 'From a website enquiry: its contact is carried over and the enquiry is marked qualified.' : 'It starts at the first stage. Its place decides the territory and owner.'}</p>
      </div></div>
      <div className="g2">
        <div>
          <label className="lbl" htmlFor="d-kind">WHAT KIND</label>
          <select id="d-kind" className="cmp-sel" value={f.kind} disabled={!!enquiryId} onChange={e => set('kind', e.target.value as OppKind)}>
            {Object.entries(OPP_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {f.kind === 'new' ? (
          <div>
            <label className="lbl" htmlFor="d-name">SCHOOL</label>
            <input id="d-name" className="cmp-in" required minLength={2} maxLength={160} value={f.name} onChange={e => set('name', e.target.value)} />
          </div>
        ) : (
          <div>
            <label className="lbl" htmlFor="d-school">SCHOOL ON STHARA</label>
            <select id="d-school" className="cmp-sel" required value={f.schoolId} onChange={e => set('schoolId', e.target.value)}>
              <option value="">Pick a school</option>
              {d.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div>
            <label className="lbl" htmlFor="d-plan">TIER</label>
            <select id="d-plan" className="cmp-sel" value={f.plan} onChange={e => set('plan', e.target.value as Plan)}>
              {PLANS.filter(p => p !== 'pilot').map(p => <option key={p} value={p}>{PLAN_INFO[p].label}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="d-students">STUDENTS</label>
            <input id="d-students" type="number" min={1} className="cmp-in" value={f.students} onChange={e => set('students', e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="d-price">PRICE / STUDENT</label>
            <input id="d-price" type="number" min={1} className="cmp-in" placeholder={list ? `List ${list}` : 'Agreed price'} value={f.pricePerStudent} onChange={e => set('pricePerStudent', e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label className="lbl" htmlFor="d-close">EXPECTED CLOSE</label>
            <input id="d-close" type="date" className="cmp-in" min={d.today} value={f.expectedClose} onChange={e => set('expectedClose', e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="d-next">NEXT STEP</label>
            <input id="d-next" className="cmp-in" maxLength={300} placeholder="e.g. Demo to the principal" value={f.nextStep} onChange={e => set('nextStep', e.target.value)} />
          </div>
        </div>
        {f.kind === 'new' && !enquiryId && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <input className="cmp-in" aria-label="Contact name" placeholder="Contact name" maxLength={120} value={f.contactName} onChange={e => set('contactName', e.target.value)} />
            <input className="cmp-in" aria-label="Contact phone" placeholder="Phone" maxLength={30} value={f.contactPhone} onChange={e => set('contactPhone', e.target.value)} />
            <input className="cmp-in" type="email" aria-label="Contact email" placeholder="Email" maxLength={200} value={f.contactEmail} onChange={e => set('contactEmail', e.target.value)} />
          </div>
        )}
        {!enquiryId && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <select className="cmp-sel" aria-label="Source" value={f.source} onChange={e => set('source', e.target.value)}>
              <option value="">Where it came from</option>
              {Object.entries(SOURCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="cmp-sel" aria-label="Campaign" value={f.campaignId} onChange={e => set('campaignId', e.target.value)}>
              <option value="">No campaign</option>
              {d.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="cmp-sel" aria-label="Partner" value={f.partnerId} onChange={e => set('partnerId', e.target.value)}>
              <option value="">No partner</option>
              {d.partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {f.kind === 'new' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <select className="cmp-sel" aria-label="State" value={f.state} onChange={e => set('state', e.target.value)}>
              <option value="">State not set</option>
              {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
            </select>
            <input className="cmp-in" aria-label="District" placeholder="District" maxLength={80} disabled={!f.state} value={f.district} onChange={e => set('district', e.target.value)} />
          </div>
        )}
      </div>
      {Number(f.students) > 0 && price > 0 && <div className="note info" style={{ marginTop: 14 }}>Annual value: <b>{inr(Number(f.students) * price, true)}</b> ({num(Number(f.students))} students × {inr(price, true)}).</div>}
      {err && <div className="note err" style={{ marginTop: 14 }} role="alert">{err}</div>}
      <div className="acts" style={{ marginTop: 16 }}>
        <button className="btn pri" disabled={busy}>{busy ? 'Creating…' : 'Create deal'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
