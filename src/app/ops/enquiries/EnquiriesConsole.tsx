'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pager, usePaged } from '@/components/canon/Pager';
import Link from 'next/link';
import { BuildingsIcon as Buildings } from '@phosphor-icons/react/dist/ssr/Buildings';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { FunnelIcon as Funnel } from '@phosphor-icons/react/dist/ssr/Funnel';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { roleLabel, type OperatorRole } from '@/lib/ops/roles';
import { SOURCES } from '@/lib/ops/revenue';
import { INDIAN_STATES } from '@/lib/ops/territories';
import { downloadCsv, errText, fmtDateTime, num } from '../_ui';
import { useCan } from '../OpsShell';
import { useOpsApi } from '../useOpsApi';

interface Enquiry {
  id: string; name: string; email: string; school: string; role: string; phone: string | null; message: string;
  designation: string | null; city: string | null; student_count: number | null; board: string | null; improvement_goal: string | null;
  source_origin: string; status: string; note: string | null; created_at: string;
  state: string | null; district: string | null; owner_id: string | null; territory: string | null; owner: string | null;
  source: string | null; campaign_id: string | null; utm: { source?: string; medium?: string; campaign?: string } | null; dealId: string | null;
}
interface Owner { id: string; name: string; role: OperatorRole }
const ROLE: Record<string, string> = { 'school-leader': 'School leader', administrator: 'Administrator', teacher: 'Teacher', parent: 'Parent', other: 'Other' };
const STATUS: Record<string, { t: string; tone: Tone }> = {
  new: { t: 'New', tone: 'r' }, contacted: { t: 'Contacted', tone: 'a' }, qualified: { t: 'Qualified', tone: 'g' }, closed: { t: 'Closed', tone: 'n' }, spam: { t: 'Spam', tone: 'n' },
};
const VIEWS = [['open', 'Open'], ['new', 'New'], ['contacted', 'Contacted'], ['qualified', 'Qualified'], ['closed', 'Closed'], ['spam', 'Spam'], ['all', 'All']] as const;
type View = (typeof VIEWS)[number][0];
const inView = (e: Enquiry, v: View) => v === 'all' || (v === 'open' ? ['new', 'contacted', 'qualified'].includes(e.status) : e.status === v);

/** Platform Manager > Enquiries: the sales inbox from the contact form on www.sthara.in. */
export default function EnquiriesConsole() {
  const api = useOpsApi();
  const [rows, setRows] = useState<Enquiry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>('open');
  const [q, setQ] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [nonce, setNonce] = useState(0);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const can = useCan();
  const manage = can('enquiries.manage'), assign = can('assign');
  useEffect(() => { api<{ operators: Owner[] }>('/territories').then(d => setOwners(d.operators)).catch(() => {}); }, [api]);
  const load = useCallback(() => setNonce(n => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    api<{ enquiries: Enquiry[]; campaigns: { id: string; name: string }[] }>('/enquiries?shape=list')
      .then(data => { if (!cancelled) { setRows(data.enquiries); setCampaigns(data.campaigns); setErr(null); } })
      .catch(e => { if (!cancelled) { setErr(errText(e)); setRows([]); } });
    return () => { cancelled = true; };
  }, [api, nonce]);

  const update = async (id: string, body: { status?: string; note?: string; state?: string | null; district?: string | null; ownerId?: string | null; source?: string | null; campaignId?: string | null }) => {
    try { await api('/enquiries', { method: 'PATCH', body: { id, ...body } }); load(); } catch (e) { setErr(errText(e)); }
  };
  const counts = useMemo(() => Object.fromEntries(VIEWS.map(([v]) => [v, (rows ?? []).filter(e => inView(e, v)).length])), [rows]);
  const needle = q.trim().toLowerCase();
  const shown = (rows ?? []).filter(r => inView(r, view) && (!needle || `${r.name} ${r.email} ${r.school} ${r.message} ${r.state ?? ''} ${r.district ?? ''} ${r.owner ?? ''}`.toLowerCase().includes(needle)));
  const { shown: page, pager } = usePaged(shown, `${view}|${needle}`);

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Enquiries"
        sub={rows ? `${counts.new} new · ${counts.open} open · ${num(rows.length)} in total · from the contact form on www.sthara.in` : 'Loading…'}
        actions={<button className="btn" disabled={!shown.length} onClick={() => downloadCsv(`sthara-enquiries-${new Date().toISOString().slice(0, 10)}.csv`,
          [['Received (IST)', 'Status', 'Name', 'Role', 'Designation', 'School', 'City', 'Students', 'Board', 'Wants to improve', 'Email', 'Phone', 'Message', 'Note', 'State', 'District', 'Territory', 'Owner'], ...shown.map(r => [fmtDateTime(r.created_at), r.status, r.name, ROLE[r.role] ?? r.role, r.designation, r.school, r.city, r.student_count, r.board, r.improvement_goal, r.email, r.phone, r.message, r.note, r.state, r.district, r.territory, r.owner])])}>
          <DownloadSimple size={15} weight="bold" /> Export CSV
        </button>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}

      <div className="seg" role="tablist" aria-label="Pipeline stage" style={{ marginBottom: 14 }}>
        {VIEWS.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
            {l}{rows ? <span className="muted" style={{ marginLeft: 6, fontWeight: 600 }}>{counts[v]}</span> : null}
          </button>
        ))}
      </div>
      <div className="ops-filters">
        <input className="cmp-in" placeholder="Search name, email, school, message, state or owner" aria-label="Search enquiries" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {!rows ? (
        <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={70} style={{ marginBottom: 12 }} />)}</div>
      ) : shown.length ? <>{page.map(r => (
        <div className="card" key={r.id} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 16 }}>{r.school || r.name}</b><Chip tone={STATUS[r.status]?.tone ?? 'n'}>{(STATUS[r.status]?.t ?? r.status).toUpperCase()}</Chip>
                <span className="muted" style={{ fontSize: 12.5 }}>{fmtDateTime(r.created_at)}</span>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {r.name} · {ROLE[r.role] ?? r.role} · <a href={`mailto:${r.email}`} style={{ color: 'var(--blue)' }}>{r.email}</a>{r.phone ? <> · <a href={`tel:${r.phone}`} style={{ color: 'var(--blue)' }}>{r.phone}</a></> : ''}
              </div>
              {(r.designation || r.city || r.student_count || r.board || r.improvement_goal) && (
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {[r.designation, r.city, r.student_count ? `${num(r.student_count)} students` : null, r.board ? r.board.toUpperCase() : null, r.improvement_goal ? `Wants to: ${r.improvement_goal.replace(/-/g, ' ')}` : null].filter(Boolean).join(' · ')}
                </div>
              )}
              <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 10, whiteSpace: 'pre-wrap' }}>{r.message}</p>
            </div>
            <div style={{ display: 'grid', gap: 8, width: 190 }}>
              <select className="cmp-sel" aria-label={`Stage of ${r.name}'s enquiry`} value={r.status} disabled={!manage} onChange={e => update(r.id, { status: e.target.value })}>
                {Object.entries(STATUS).map(([s, x]) => <option key={s} value={s}>{x.t}</option>)}
              </select>
              {r.dealId && can('sales.read') && <Link className="btn sm" href={`/ops/pipeline/${r.dealId}`}><Funnel size={13} weight="bold" /> Open its deal</Link>}
              {!r.dealId && r.status !== 'spam' && r.status !== 'closed' && can('sales.work') && (
                <Link className="btn sm pri" href={`/ops/pipeline?new=1&enquiry=${r.id}&name=${encodeURIComponent(r.school || r.name)}&state=${encodeURIComponent(r.state || '')}&district=${encodeURIComponent(r.district || '')}&students=${r.student_count ?? ''}`}>
                  <Funnel size={13} weight="bold" /> Make it a deal
                </Link>
              )}
              {r.status !== 'spam' && r.status !== 'closed' && can('schools.create') && (
                <Link className="btn sm" href={`/ops/schools?new=1&enquiry=${r.id}&name=${encodeURIComponent(r.school || '')}&state=${encodeURIComponent(r.state || '')}&district=${encodeURIComponent(r.district || '')}`}>
                  <Buildings size={13} weight="bold" /> Create school
                </Link>
              )}
            </div>
          </div>
          <Placing key={`${r.state}|${r.district}|${r.owner_id}`} r={r} owners={owners} manage={manage} assign={assign} save={body => update(r.id, body)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="cmp-sel" style={{ flex: '1 1 170px', width: 'auto' }} aria-label="Source" value={r.source ?? ''} disabled={!manage} onChange={e => update(r.id, { source: e.target.value || null })}>
              <option value="">Source: website</option>
              {Object.entries(SOURCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="cmp-sel" style={{ flex: '1 1 200px', width: 'auto' }} aria-label="Campaign" value={r.campaign_id ?? ''} disabled={!manage} onChange={e => update(r.id, { campaignId: e.target.value || null })}>
              <option value="">No campaign</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {r.utm && <span className="muted mono" style={{ fontSize: 12 }}>{[r.utm.source, r.utm.medium, r.utm.campaign].filter(Boolean).join(' / ')}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <textarea className="cmp-in" rows={2} style={{ flex: '1 1 260px' }} aria-label="Internal note" placeholder="Internal note (not sent to the enquirer)"
              value={notes[r.id] ?? r.note ?? ''} maxLength={2000} onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} />
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={(notes[r.id] ?? r.note ?? '') === (r.note ?? '')} onClick={() => update(r.id, { note: notes[r.id] })}>Save note</button>
          </div>
        </div>
      ))}<Pager {...pager} noun="enquiries" /></> : (
        <div className="card"><Empty icon={<EnvelopeSimple size={26} weight="duotone" />} title={rows.length ? 'Nothing in this stage' : 'No enquiries yet'}>
          Enquiries sent from the contact form on www.sthara.in appear here.
        </Empty></div>
      )}
    </>
  );
}

/** Where the enquiry sits: its address decides the territory, and the territory's default owner takes it unless one is picked. */
function Placing({ r, owners, manage, assign, save }: {
  r: Enquiry; owners: Owner[]; manage: boolean; assign: boolean;
  save: (body: { state?: string | null; district?: string | null; ownerId?: string | null }) => Promise<void>;
}) {
  const [state, setState] = useState(r.state ?? '');
  const [district, setDistrict] = useState(r.district ?? '');
  const addressDirty = state !== (r.state ?? '') || district.trim() !== (r.district ?? '');
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <select className="cmp-sel" style={{ flex: '1 1 170px', width: 'auto' }} aria-label="State" value={state} disabled={!manage} onChange={e => setState(e.target.value)}>
        <option value="">{r.city ? `State not set (${r.city})` : 'State not set'}</option>
        {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
      </select>
      <input className="cmp-in" style={{ flex: '1 1 150px', width: 'auto' }} aria-label="District" placeholder="District" maxLength={80} disabled={!manage || !state} value={district} onChange={e => setDistrict(e.target.value)} />
      {addressDirty && <button className="btn sm pri" onClick={() => save({ state: state || null, district: district || null })}>Place</button>}
      {assign ? (
        <select className="cmp-sel" style={{ flex: '1 1 200px', width: 'auto' }} aria-label="Owner" value={r.owner_id ?? ''} onChange={e => save({ ownerId: e.target.value || null })}>
          <option value="">{r.owner_id ? 'Territory default owner' : 'No owner'}</option>
          {owners.map(o => <option key={o.id} value={o.id}>{o.name} ({roleLabel(o.role)})</option>)}
        </select>
      ) : <span className="muted" style={{ fontSize: 13 }}>Owner: {r.owner ?? 'nobody yet'}</span>}
      <span className="muted" style={{ fontSize: 12.5, flexBasis: '100%' }}>{r.territory ? `Territory: ${r.territory}` : 'Not in a territory yet: only roles that see everything can find it. Set the state to route it.'}</span>
    </div>
  );
}
