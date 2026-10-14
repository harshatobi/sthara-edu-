'use client';

import { useCallback, useEffect, useState } from 'react';
import { MegaphoneIcon as Megaphone } from '@phosphor-icons/react/dist/ssr/Megaphone';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { CHANNELS, SPEND_CATEGORIES, campaignCode, type Channel } from '@/lib/ops/revenue';
import { Kpi, ReasonAction, Section, Table, downloadCsv, errText, fmtDate, inr, num } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface Campaign {
  id: string; name: string; code: string; channel: Channel; startsOn: string | null; endsOn: string | null; budget: number | null; notes: string | null; active: boolean;
  spend: number; leads: number; deals: number; won: number; wonValue: number; costPerLead: number | null; costPerWin: number | null; returnMultiple: number | null; budgetUsedPct: number | null;
}
interface Data {
  campaigns: Campaign[]; totals: { spend: number; direct: number; leads: number; won: number; wonValue: number };
  spend: { id: string; spentOn: string; amount: number; category: keyof typeof SPEND_CATEGORIES; note: string | null; on: string }[];
  bySource: { key: string; label: string; leads: number; deals: number; won: number; wonValue: number }[];
  deals: { id: string; label: string }[]; schools: { id: string; name: string }[];
  can: { manage: boolean }; today: string;
}
type Post = (b: Record<string, unknown>) => Promise<void>;
const or = (n: number | null, exact = true) => (n === null ? '—' : inr(n, exact));

/** Platform Manager > Marketing: what was spent, what it brought, and what a lead and a won school cost. */
export default function MarketingConsole() {
  const api = useOpsApi();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'campaigns' | 'spend' | 'sources'>('campaigns');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const load = useCallback(() => {
    api<Data>('/marketing').then(x => { setD(x); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const post: Post = async b => { await api('/marketing', { method: 'POST', body: b }); load(); };
  const t = d?.totals;

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Marketing"
        sub="Spend by campaign and directly on a deal or school, set against the leads and wins it produced. Company-wide figures."
        actions={d?.can.manage && tab === 'campaigns' ? <button className="btn pri" onClick={() => { setAdding(a => !a); setEditing(null); }}><Plus size={15} weight="bold" /> New campaign</button> : undefined} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {t && (
        <div className="kpis ops-kpis-5">
          <Kpi label="Spent" value={inr(t.spend)} note={`${inr(t.direct)} directly on deals and schools`} onClick={() => setTab('spend')} />
          <Kpi label="Leads" value={num(t.leads)} note="Enquiries, and deals that did not come from one" onClick={() => setTab('sources')} />
          <Kpi label="Cost per lead" value={t.leads ? inr(t.spend / t.leads, true) : '—'} note="All spend over all leads" />
          <Kpi label="Cost per won school" value={t.won ? inr(t.spend / t.won, true) : '—'} note={`${num(t.won)} won`} />
          <Kpi label="Won per rupee spent" value={t.spend ? `${Math.round((t.wonValue / t.spend) * 10) / 10}×` : '—'} note={`${inr(t.wonValue)} annual value won`} tone={t.spend && t.wonValue > t.spend ? 'g' : undefined} />
        </div>
      )}
      <div className="seg" role="tablist" aria-label="Section" style={{ marginBottom: 18 }}>
        {([['campaigns', 'Campaigns'], ['spend', 'Spend log'], ['sources', 'By source']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {!d ? <div className="card"><Skeleton h={200} /></div> : tab === 'campaigns' ? (
        <>
          {adding && <CampaignForm onCancel={() => setAdding(false)} save={async b => { await post({ action: 'campaign', ...b }); setAdding(false); }} />}
          <div className="card">
            <Table head={<tr><th>Campaign</th><th className="r">Spent</th><th className="r">Leads</th><th className="r">Cost per lead</th><th className="r">Won</th><th className="r">Cost per win</th><th className="r">Won value</th><th className="r">Return</th>{d.can.manage && <th aria-label="Actions" />}</tr>}
              empty={!d.campaigns.length && <Empty icon={<Megaphone size={28} weight="duotone" />} title="No campaigns yet">Add one, put its code in your ad links as utm_campaign, and enquiries from it are marked automatically.</Empty>}>
              {d.campaigns.map(c => editing === c.id ? (
                <tr key={c.id}><td colSpan={9}><CampaignForm initial={c} onCancel={() => setEditing(null)} save={async b => { await post({ action: 'campaign', id: c.id, ...b }); setEditing(null); }} /></td></tr>
              ) : (
                <tr key={c.id} style={c.active ? undefined : { opacity: .55 }}>
                  <td style={{ minWidth: 220 }}><div className="nm">{c.name}{!c.active && <> <Chip tone="n">ENDED</Chip></>}</div>
                    <div className="sub">{CHANNELS[c.channel]} · <span className="mono">utm_campaign={c.code}</span></div>
                    <div className="sub">{c.startsOn ? fmtDate(c.startsOn) : 'No start'}{c.endsOn ? ` to ${fmtDate(c.endsOn)}` : ''}</div></td>
                  <td className="r" style={{ fontWeight: 700 }}>{inr(c.spend)}{c.budget !== null && <div className="sub" style={{ fontWeight: 500, color: (c.budgetUsedPct ?? 0) > 100 ? 'var(--red)' : undefined }}>{c.budgetUsedPct}% of {inr(c.budget)}</div>}</td>
                  <td className="r">{num(c.leads)}<div className="sub">{num(c.deals)} deals</div></td>
                  <td className="r">{or(c.costPerLead)}</td>
                  <td className="r">{num(c.won)}</td>
                  <td className="r">{or(c.costPerWin)}</td>
                  <td className="r">{inr(c.wonValue)}</td>
                  <td className="r" style={{ fontWeight: 700, color: c.returnMultiple !== null && c.returnMultiple >= 1 ? '#047857' : undefined }}>{c.returnMultiple === null ? '—' : `${c.returnMultiple}×`}</td>
                  {d.can.manage && <td><button className="btn sm" onClick={() => { setEditing(c.id); setAdding(false); }}>Change</button></td>}
                </tr>
              ))}
            </Table>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>A lead is an enquiry marked with the campaign, or a deal marked with it that did not come from one of those enquiries. Return is annual value won for each rupee spent.</p>
          </div>
        </>
      ) : tab === 'spend' ? (
        <>
          {d.can.manage && <SpendForm d={d} post={post} />}
          <div className="card">
            <div className="ops-filters"><button className="btn sm" style={{ marginLeft: 'auto' }} disabled={!d.spend.length} onClick={() => downloadCsv(`sthara-marketing-spend-${d.today}.csv`,
              [['Date', 'Amount (INR)', 'Category', 'Spent on', 'Note'], ...d.spend.map(s => [s.spentOn, s.amount, SPEND_CATEGORIES[s.category] ?? s.category, s.on, s.note])])}>Export</button></div>
            <Table head={<tr><th>Date</th><th>Spent on</th><th>Category</th><th>Note</th><th className="r">Amount</th>{d.can.manage && <th aria-label="Actions" />}</tr>}
              empty={!d.spend.length && <Empty icon={<Megaphone size={28} weight="duotone" />} title="No spend recorded" />}>
              {d.spend.map(s => (
                <tr key={s.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(s.spentOn)}</td>
                  <td>{s.on}</td>
                  <td>{SPEND_CATEGORIES[s.category] ?? s.category}</td>
                  <td style={{ fontSize: 13, maxWidth: 320 }}>{s.note ?? ''}</td>
                  <td className="r" style={{ fontWeight: 700 }}>{inr(s.amount, true)}</td>
                  {d.can.manage && <td><ReasonAction label="Remove" confirm="Remove the entry" danger run={reason => post({ action: 'spend-remove', id: s.id, reason })} /></td>}
                </tr>
              ))}
            </Table>
          </div>
        </>
      ) : (
        <Section title="Leads and wins by source" sub="Where enquiries and deals came from. A deal made from an enquiry counts as that enquiry's lead, once.">
          <Table head={<tr><th>Source</th><th className="r">Leads</th><th className="r">Deals</th><th className="r">Won</th><th className="r">Lead to win</th><th className="r">Won value</th></tr>}
            empty={!d.bySource.length && <p className="muted" style={{ fontSize: 13.5, padding: '8px 0' }}>Nothing yet.</p>}>
            {d.bySource.map(s => (
              <tr key={s.key}><td className="nm">{s.label}</td><td className="r">{num(s.leads)}</td><td className="r">{num(s.deals)}</td><td className="r">{num(s.won)}</td>
                <td className="r">{s.leads ? `${Math.round((s.won / s.leads) * 100)}%` : '—'}</td><td className="r" style={{ fontWeight: 700 }}>{inr(s.wonValue)}</td></tr>
            ))}
          </Table>
        </Section>
      )}
    </>
  );
}

function SpendForm({ d, post }: { d: Data; post: Post }) {
  const [f, setF] = useState({ on: 'campaign', campaignId: '', opportunityId: '', schoolId: '', spentOn: d.today, amount: '', category: 'ads', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  const target = f.on === 'campaign' ? f.campaignId : f.on === 'deal' ? f.opportunityId : f.schoolId;
  return (
    <form className="card" style={{ marginBottom: 18 }} onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr(null);
      try {
        await post({ action: 'spend', spentOn: f.spentOn, amount: Number(f.amount), category: f.category, note: f.note,
          campaignId: f.on === 'campaign' ? f.campaignId : undefined, opportunityId: f.on === 'deal' ? f.opportunityId : undefined, schoolId: f.on === 'school' ? f.schoolId : undefined });
        setF(x => ({ ...x, amount: '', note: '' }));
      } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
    }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Record spend</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>On a campaign, it is shared evenly by the leads the campaign brought. On a deal or a school, it is theirs alone (travel to a demo, a pilot kit).</p>
      <div className="g3">
        <select className="cmp-sel" aria-label="Spent on" value={f.on} onChange={e => set('on', e.target.value)}>
          <option value="campaign">On a campaign</option><option value="deal">On one deal</option><option value="school">On one school</option>
        </select>
        {f.on === 'campaign' ? (
          <select className="cmp-sel" aria-label="Campaign" required value={f.campaignId} onChange={e => set('campaignId', e.target.value)}><option value="">Pick the campaign</option>{d.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        ) : f.on === 'deal' ? (
          <select className="cmp-sel" aria-label="Deal" required value={f.opportunityId} onChange={e => set('opportunityId', e.target.value)}><option value="">Pick the deal</option>{d.deals.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        ) : (
          <select className="cmp-sel" aria-label="School" required value={f.schoolId} onChange={e => set('schoolId', e.target.value)}><option value="">Pick the school</option>{d.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        )}
        <input className="cmp-in" type="number" min={1} step="0.01" aria-label="Amount" placeholder="Amount in rupees" required value={f.amount} onChange={e => set('amount', e.target.value)} />
        <input className="cmp-in" type="date" max={d.today} aria-label="Spent on date" required value={f.spentOn} onChange={e => set('spentOn', e.target.value)} />
        <select className="cmp-sel" aria-label="Category" value={f.category} onChange={e => set('category', e.target.value)}>{Object.entries(SPEND_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input className="cmp-in" aria-label="Note" placeholder="Note, e.g. invoice number" maxLength={500} value={f.note} onChange={e => set('note', e.target.value)} />
      </div>
      {err && <div className="note err" style={{ marginTop: 12 }} role="alert">{err}</div>}
      <div className="acts" style={{ marginTop: 14 }}><button className="btn pri" disabled={busy || !target || !(Number(f.amount) > 0)}>{busy ? 'Recording…' : 'Record spend'}</button></div>
    </form>
  );
}

function CampaignForm({ initial, save, onCancel }: { initial?: Campaign; save: (b: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState({
    name: initial?.name ?? '', code: initial?.code ?? '', channel: initial?.channel ?? 'search_ads', startsOn: initial?.startsOn ?? '', endsOn: initial?.endsOn ?? '',
    budget: initial?.budget === null || initial?.budget === undefined ? '' : String(initial.budget), notes: initial?.notes ?? '', active: initial?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  const code = campaignCode(f.code || f.name);
  return (
    <form className={initial ? '' : 'card'} style={{ marginBottom: initial ? 0 : 18, padding: initial ? '6px 0 10px' : undefined }} onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { await save({ ...f, code, budget: f.budget === '' ? null : Number(f.budget), startsOn: f.startsOn || null, endsOn: f.endsOn || null }); } catch (x) { setErr(errText(x)); setBusy(false); }
    }}>
      {!initial && <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>New campaign</h2>}
      <div className="g3">
        <input className="cmp-in" aria-label="Name" placeholder="Campaign name" required minLength={2} maxLength={160} value={f.name} onChange={e => set('name', e.target.value)} />
        <input className="cmp-in mono" aria-label="Code" placeholder="Code (from the name if left empty)" maxLength={60} value={f.code} onChange={e => set('code', e.target.value)} />
        <select className="cmp-sel" aria-label="Channel" value={f.channel} onChange={e => set('channel', e.target.value as Channel)}>{Object.entries(CHANNELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label className="muted" style={{ fontSize: 12.5 }}>Starts <input className="cmp-in" type="date" value={f.startsOn} onChange={e => set('startsOn', e.target.value)} /></label>
        <label className="muted" style={{ fontSize: 12.5 }}>Ends <input className="cmp-in" type="date" value={f.endsOn} onChange={e => set('endsOn', e.target.value)} /></label>
        <label className="muted" style={{ fontSize: 12.5 }}>Budget (rupees) <input className="cmp-in" type="number" min={0} value={f.budget} onChange={e => set('budget', e.target.value)} /></label>
      </div>
      <input className="cmp-in" style={{ marginTop: 10 }} aria-label="Notes" placeholder="Notes" maxLength={2000} value={f.notes} onChange={e => set('notes', e.target.value)} />
      {code && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Add <span className="mono">?utm_campaign={code}</span> to the links in this campaign: enquiries that arrive through them are marked with it.</p>}
      {initial && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginTop: 10 }}><input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)} /> Running (offered on new deals and enquiries)</label>}
      {err && <div className="note err" style={{ marginTop: 12 }} role="alert">{err}</div>}
      <div className="acts" style={{ marginTop: 14 }}><button className="btn pri" disabled={busy || f.name.trim().length < 2}>{busy ? 'Saving…' : initial ? 'Save' : 'Add campaign'}</button><button type="button" className="btn" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}
