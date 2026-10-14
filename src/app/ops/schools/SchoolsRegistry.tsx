'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { BuildingsIcon as Buildings } from '@phosphor-icons/react/dist/ssr/Buildings';
import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { CaretUpIcon as CaretUp } from '@phosphor-icons/react/dist/ssr/CaretUp';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import type { RegistrySchool } from '@/lib/ops/attention';
import { BAND_LABEL, type Band } from '@/lib/ops/health';
import { roleLabel, type OperatorRole } from '@/lib/ops/roles';
import { SCHOOL_VIEWS, VIEW_LABEL, attentionReasons, inSchoolView, isSchoolView, sinceText, type SchoolView } from '@/lib/ops/schoolViews';
import { INDIAN_STATES } from '@/lib/ops/territories';
import { CURRICULA, PLANS, PLAN_INFO, REASON_MIN, annualValue, effectivePrice, type Plan } from '@/lib/settings/registry';
import { Kpi, PlanChip, StatusChip, Table, downloadCsv, errText, fmtDate, inr, num, schoolStatus } from '../_ui';
import { useOpsApi } from '../useOpsApi';

type Row = RegistrySchool & { ownerId: string | null; owner: string | null; territory: string | null; state: string | null; district: string | null; health: { score: number | null; band: Band; top: string | null } | null };
interface Data { schools: Row[]; me: string; owners: { id: string; name: string; role: OperatorRole }[]; can: { create: boolean; assign: boolean; desk: boolean } }
type SortKey = 'name' | 'plan' | 'health' | 'students' | 'cases' | 'owner' | 'next' | 'value' | 'contact';

const BAND_TONE: Record<Band, Tone> = { strong: 'g', fair: 'b', weak: 'a', critical: 'r', setup: 'n', suspended: 'r' };
const STORE = 'sthara.ops.schools.view';
/** The date a school next needs a decision: its pilot's end. */
const nextDate = (s: Row) => (s.plan === 'pilot' ? s.trialEndsAt : null);
const students = (s: Row) => s.roles.student ?? 0;

/** Platform Manager > Schools: every school in sight, as a working list. */
export default function SchoolsRegistry() {
  const api = useOpsApi();
  const router = useRouter();
  const params = useSearchParams();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [view, setViewState] = useState<SchoolView>(() => {
    const v = params.get('view') ?? (typeof window !== 'undefined' ? window.localStorage.getItem(STORE) : null);
    // Old links used ?status=.
    const legacy: Record<string, SchoolView> = { live: 'live', pilot: 'pilots', ending: 'ending', ended: 'ending', suspended: 'suspended' };
    return isSchoolView(v) ? v : legacy[params.get('status') ?? ''] ?? 'all';
  });
  const [tier, setTier] = useState<Plan | 'all'>('all');
  const [state, setState] = useState('');
  const [owner, setOwner] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: 'name', asc: true });
  const [creating, setCreating] = useState(() => params.get('new') === '1');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [now] = useState(() => Date.now());

  const setView = (v: SchoolView) => { setViewState(v); setPicked(new Set()); try { window.localStorage.setItem(STORE, v); } catch { /* private mode */ } };
  const load = useCallback(() => {
    api<Data>('/schools?shape=list').then(x => { setD(x); setErr(null); }).catch(e => { setErr(errText(e)); setD(x => x ?? { schools: [], me: '', owners: [], can: { create: false, assign: false, desk: false } }); });
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const rows = d?.schools;
  const reasons = useMemo(() => new Map((rows ?? []).map(s => [s.id, attentionReasons(s, now)])), [rows, now]);
  const counts = useMemo(() => Object.fromEntries(SCHOOL_VIEWS.map(v => [v, (rows ?? []).filter(s => inSchoolView(s, v, d?.me ?? '', now)).length])) as Record<SchoolView, number>, [rows, d?.me, now]);
  const states = useMemo(() => [...new Set((rows ?? []).map(s => s.state).filter(Boolean))].sort() as string[], [rows]);
  const ownersInUse = useMemo(() => [...new Map((rows ?? []).filter(s => s.ownerId).map(s => [s.ownerId!, s.owner ?? 'Operator'])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (rows ?? []).filter(s => inSchoolView(s, view, d?.me ?? '', now)
      && (tier === 'all' || s.plan === tier) && (!state || s.state === state) && (!owner || (owner === 'none' ? !s.ownerId : s.ownerId === owner))
      && (!needle || `${s.name} ${s.code ?? ''} ${s.curriculum ?? ''} ${s.state ?? ''} ${s.district ?? ''} ${s.owner ?? ''} ${s.contact?.name ?? ''}`.toLowerCase().includes(needle)));
    const val = (s: Row): string | number => {
      switch (sort.k) {
        case 'name': return s.name.toLowerCase();
        case 'plan': return PLANS.indexOf(s.plan) * 10 + schoolStatus(s).rank;
        case 'health': return s.health?.score ?? -1;
        case 'students': return students(s);
        case 'cases': return (s.lateCases ?? 0) * 1000 + (s.openCases ?? 0);
        case 'owner': return (s.owner ?? '￿').toLowerCase();
        case 'next': return nextDate(s) ?? '9999';
        case 'value': return annualValue(s, students(s)) ?? -1;
        case 'contact': return s.lastActivity ?? '';
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name);
      return sort.asc ? c : -c;
    });
  }, [rows, q, view, tier, state, owner, sort, d?.me, now]);

  const th = (k: SortKey, label: string, cls = '') => (
    <th className={cls} aria-sort={sort.k === k ? (sort.asc ? 'ascending' : 'descending') : 'none'}>
      <button type="button" style={{ font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        onClick={() => setSort(s => ({ k, asc: s.k === k ? !s.asc : k === 'name' || k === 'owner' || k === 'next' }))}>
        {label}{sort.k === k && (sort.asc ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />)}
      </button>
    </th>
  );

  const exportCsv = (list: Row[]) => downloadCsv(`sthara-schools-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['School', 'Code', 'Tier', 'Status', 'Health', 'Pilot ends', 'Curriculum', 'State', 'District', 'Territory', 'Owner', 'Primary contact', 'Contact phone', 'Admins', 'Teachers', 'Students', 'Parents',
      'Classes', 'Contracted students', 'Price per student (INR)', 'Annual value (INR)', 'Open cases', 'Late cases', 'Open follow-ups', 'Last contact', 'Last sign-in', 'Needs attention', 'AI', 'Created'],
    ...list.map(s => [s.name, s.code, PLAN_INFO[s.plan].label, schoolStatus(s).label, s.health?.score ?? '', s.trialEndsAt ? fmtDate(s.trialEndsAt) : '', s.curriculum, s.state, s.district, s.territory, s.owner,
      s.contact?.name ?? '', s.contact?.phone ?? '', s.roles.admin ?? 0, s.roles.teacher ?? 0, students(s), s.roles.parent ?? 0, s.classes, s.contractStudents, effectivePrice(s),
      annualValue(s, students(s)), s.openCases ?? 0, s.lateCases ?? 0, s.openTasks ?? 0, s.lastActivity ? fmtDate(s.lastActivity) : '', s.lastSignIn ? fmtDate(s.lastSignIn) : '',
      (reasons.get(s.id) ?? []).join('; '), s.aiEnabled ? 'On' : 'Off', s.createdAt ? fmtDate(s.createdAt) : '']),
  ]);

  const all = rows ?? [];
  const paying = all.filter(s => s.active && s.plan !== 'pilot');
  const totalValue = paying.reduce((n, s) => n + (annualValue(s, students(s)) ?? 0), 0);
  const openCases = all.reduce((n, s) => n + (s.openCases ?? 0), 0), lateCases = all.reduce((n, s) => n + (s.lateCases ?? 0), 0);
  const allPicked = shown.length > 0 && shown.every(s => picked.has(s.id));
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const filtered = tier !== 'all' || !!state || !!owner || !!q.trim();

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Schools"
        sub={rows ? `${num(all.length)} school${all.length === 1 ? '' : 's'} in your sight · ${num(all.reduce((n, s) => n + s.people, 0))} accounts` : 'Loading…'}
        actions={<>
          <button className="btn" onClick={() => exportCsv(shown)} disabled={!shown.length}><DownloadSimple size={15} weight="bold" /> Export</button>
          {d?.can.create && <button className="btn pri" onClick={() => setCreating(c => !c)}><Plus size={15} weight="bold" /> New school</button>}
        </>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {notice && <div className="note info" style={{ marginBottom: 18 }} role="status">{notice}</div>}

      {creating && d?.can.create && <NewSchool onCancel={() => { setCreating(false); router.replace('/ops/schools'); }} onCreated={id => router.push(`/ops/schools/${id}?tab=classes&created=1`)} />}

      {rows && (
        <div className="kpis ops-kpis-5">
          <Kpi label="Paying schools" value={num(paying.length)} note={`${num(counts.pilots)} on pilot`} onClick={() => setView('live')} />
          <Kpi label="Students" value={num(all.reduce((n, s) => n + students(s), 0))} note={`${num(all.reduce((n, s) => n + (s.contractStudents ?? 0), 0))} contracted`} />
          <Kpi label="Annual value" value={inr(totalValue)} note="Paying schools, at their agreed price" />
          <Kpi label="Open cases" value={num(openCases)} note={lateCases ? `${num(lateCases)} past deadline` : 'None past deadline'} tone={lateCases ? 'r' : undefined} onClick={d?.can.desk ? () => router.push('/ops/desk') : undefined} />
          <Kpi label="Need attention" value={num(counts.attention)} note={counts.ending ? `${num(counts.ending)} pilot${counts.ending === 1 ? '' : 's'} ending or ended` : 'No pilot ending soon'} tone={counts.attention ? 'a' : 'g'} onClick={() => setView('attention')} />
        </div>
      )}

      <div className="seg" role="tablist" aria-label="View" style={{ marginBottom: 14 }}>
        {SCHOOL_VIEWS.map(v => (
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
            {VIEW_LABEL[v]}{rows ? <span className="muted" style={{ marginLeft: 6, fontWeight: 600 }}>{counts[v]}</span> : null}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="ops-filters">
          <input className="cmp-in" style={{ flex: '2 1 260px', width: 'auto' }} placeholder="Search name, code, place, owner or contact" aria-label="Search schools" value={q} onChange={e => setQ(e.target.value)} />
          <select className="cmp-sel" style={{ flex: '1 1 140px', width: 'auto' }} aria-label="Tier" value={tier} onChange={e => setTier(e.target.value as Plan | 'all')}>
            <option value="all">Any tier</option>
            {PLANS.map(p => <option key={p} value={p}>{PLAN_INFO[p].label}</option>)}
          </select>
          <select className="cmp-sel" style={{ flex: '1 1 140px', width: 'auto' }} aria-label="State" value={state} onChange={e => setState(e.target.value)}>
            <option value="">Any state</option>
            {states.map(x => <option key={x}>{x}</option>)}
          </select>
          <select className="cmp-sel" style={{ flex: '1 1 150px', width: 'auto' }} aria-label="Owner" value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">Any owner</option>
            <option value="none">No owner</option>
            {ownersInUse.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          {filtered && <button className="btn sm" onClick={() => { setQ(''); setTier('all'); setState(''); setOwner(''); }}>Clear filters</button>}
        </div>

        {picked.size > 0 && d && (
          <BulkBar count={picked.size} owners={d.owners} canAssign={d.can.assign}
            onExport={() => exportCsv(shown.filter(s => picked.has(s.id)))} onClear={() => setPicked(new Set())}
            assign={async (ownerId, reason) => {
              const out = await api<{ changed: number; skipped: number }>('/schools', { method: 'PATCH', body: { schoolIds: [...picked], ownerId, reason } });
              setNotice(`Owner set on ${num(out.changed)} school${out.changed === 1 ? '' : 's'}${out.skipped ? `; ${num(out.skipped)} skipped` : ''}.`);
              setPicked(new Set()); load();
            }} />
        )}

        {!rows ? <div>{[0, 1, 2].map(i => <Skeleton key={i} h={52} style={{ marginBottom: 10 }} />)}</div> : (
          <Table
            head={<tr>
              <th style={{ width: 34 }}><input type="checkbox" aria-label="Select every school shown" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map(s => s.id)))} /></th>
              {th('name', 'School')}{th('plan', 'Tier and status')}{th('health', 'Health')}{th('students', 'Students', 'r')}{th('cases', 'Cases')}{th('owner', 'Owner')}{th('next', 'Pilot ends')}{th('value', 'Annual value', 'r')}{th('contact', 'Last contact')}
            </tr>}
            empty={!shown.length && <Empty icon={<Buildings size={28} weight="duotone" />} title={all.length ? 'No school in this view' : 'No schools yet'}>
              {all.length ? (filtered ? 'Clear the filters, or pick another view.' : view === 'attention' ? 'Nothing needs you right now.' : 'Pick another view.') : d?.can.create ? 'Create the first school to start onboarding.' : 'No school is in your territories yet.'}
            </Empty>}>
            {shown.map(s => {
              const why = reasons.get(s.id) ?? [];
              const value = annualValue(s, students(s));
              return (
                <tr key={s.id} className="click" onClick={() => router.push(`/ops/schools/${s.id}`)}>
                  <td onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${s.name}`} checked={picked.has(s.id)} onChange={() => toggle(s.id)} /></td>
                  <td style={{ minWidth: 220, maxWidth: 300 }}>
                    <div className="nm">{s.name}{s.testSchool && <> <Chip tone="n">TEST</Chip></>}</div>
                    <div className="sub"><span className="mono">{s.code ?? 'NO CODE'}</span>{[s.district, s.state].filter(Boolean).length ? ` · ${[s.district, s.state].filter(Boolean).join(', ')}` : ''}</div>
                    {why.length > 0 && <div className="sub" style={{ color: '#B45309', fontWeight: 600 }} title={why.join('\n')}>{why[0]}{why.length > 1 ? ` (+${why.length - 1})` : ''}</div>}
                  </td>
                  <td><div className="acts" style={{ gap: 6 }}><PlanChip plan={s.plan} /><StatusChip s={s} />{!s.aiEnabled && <Chip tone="n">AI OFF</Chip>}</div></td>
                  <td title={s.health?.top ?? undefined}>{s.health ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{s.health.score !== null && <b>{s.health.score}</b>}<Chip tone={BAND_TONE[s.health.band]}>{BAND_LABEL[s.health.band].toUpperCase()}</Chip></span> : <span className="muted">—</span>}</td>
                  <td className="r">{num(students(s))}{s.contractStudents ? <div className="sub">of {num(s.contractStudents)}</div> : null}</td>
                  <td>{s.openCases ? <>{num(s.openCases)} open{s.lateCases ? <> <Chip tone="r">{s.lateCases} LATE</Chip></> : null}</> : <span className="muted">None</span>}{s.overdueTasks ? <div className="sub" style={{ color: '#B45309' }}>{s.overdueTasks} follow-up{s.overdueTasks === 1 ? '' : 's'} overdue</div> : null}</td>
                  <td style={{ maxWidth: 170, whiteSpace: s.owner ? undefined : 'nowrap' }}>{s.owner ?? <span className="muted">No owner</span>}{s.contact && <div className="sub" title={[s.contact.phone, s.contact.email].filter(Boolean).join(' · ')}>{s.contact.name}</div>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{s.plan === 'pilot' ? <>{fmtDate(s.trialEndsAt)}<div className="sub">{s.trialExpired ? 'Ended' : s.trialDaysLeft !== null ? `${s.trialDaysLeft} days left` : ''}</div></> : <span className="muted">—</span>}</td>
                  <td className="r" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{inr(value)}{s.plan === 'pilot' && value ? <div className="sub" style={{ fontWeight: 500 }}>if it converts</div> : null}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{sinceText(s.lastActivity, now)}<div className="sub">signed in {sinceText(s.lastSignIn, now)}</div></td>
                </tr>
              );
            })}
          </Table>
        )}
        {rows && shown.length > 0 && <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>Showing {num(shown.length)} of {num(all.length)}. Last contact is the latest call, meeting, email or visit logged on the school&apos;s Account 360 tab.</p>}
      </div>
    </>
  );
}

function BulkBar({ count, owners, canAssign, assign, onExport, onClear }: {
  count: number; owners: Data['owners']; canAssign: boolean; assign: (ownerId: string | null, reason: string) => Promise<void>; onExport: () => void; onClear: () => void;
}) {
  const [owner, setOwner] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="ops-reason" style={{ marginBottom: 14, minWidth: 0 }} role="region" aria-label="Selected schools">
      <div className="acts">
        <b style={{ fontSize: 14 }}>{num(count)} selected</b>
        {canAssign && <>
          <select className="cmp-sel" style={{ width: 'auto', maxWidth: 240 }} aria-label="New owner" value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">Pick an owner</option>
            <option value="default">Each territory&apos;s default owner</option>
            {owners.map(o => <option key={o.id} value={o.id}>{o.name} ({roleLabel(o.role)})</option>)}
          </select>
          <input className="cmp-in" style={{ flex: '1 1 200px', width: 'auto' }} aria-label="Reason" placeholder="Reason (kept in the audit log)" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
          <button className="btn sm pri" disabled={busy || !owner || reason.trim().length < REASON_MIN} onClick={async () => {
            setBusy(true); setErr(null);
            try { await assign(owner === 'default' ? null : owner, reason.trim()); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
          }}>{busy ? 'Assigning…' : 'Assign owner'}</button>
        </>}
        <button className="btn sm" onClick={onExport}><DownloadSimple size={13} weight="bold" /> Export selected</button>
        <button className="btn sm" onClick={onClear}>Clear</button>
      </div>
      {err && <div className="note err" role="alert">{err}</div>}
    </div>
  );
}

const suggestCode = (name: string) =>
  (name.toUpperCase().match(/\b[A-Z]/g) || []).join('').slice(0, 4).padEnd(3, 'X') + '-' + String(Math.floor(100 + Math.random() * 900));

function NewSchool({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const api = useOpsApi();
  const params = useSearchParams();
  const enquiryId = params.get('enquiry');
  const [f, setF] = useState(() => ({
    name: params.get('name') ?? '', code: '', curriculum: 'CBSE', city: '', board: '', state: params.get('state') ?? '', district: params.get('district') ?? '',
    plan: 'pilot' as Plan, pilotDays: 90, contractStudents: '', pricePerStudent: '',
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/platform/public').then(r => r.json())
      .then(d => { if (Number(d.trialDays)) setF(x => ({ ...x, pilotDays: Number(d.trialDays) })); })
      .catch(() => {});
  }, []);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));

  const price = f.pricePerStudent ? Number(f.pricePerStudent) : PLAN_INFO[f.plan].price ?? (f.plan === 'pilot' ? PLAN_INFO.shikhara.price : null);
  const seats = Number(f.contractStudents) || 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const { id } = await api<{ id: string }>('/schools', {
        method: 'POST',
        body: { ...f, contractStudents: f.contractStudents || null, pricePerStudent: f.pricePerStudent || null, enquiryId },
      });
      onCreated(id);
    } catch (x) { setErr(errText(x)); setBusy(false); }
  };

  return (
    <form className="card" style={{ marginBottom: 18 }} onSubmit={submit}>
      <div className="ops-sec-hd">
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 800 }}>New school</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>{enquiryId ? 'From a website enquiry: it is marked qualified once the school is created.' : 'After this you set up classes, then add people.'}</p>
        </div>
      </div>
      <div className="g2">
        <div>
          <label className="lbl" htmlFor="n-name">SCHOOL NAME</label>
          <input id="n-name" className="cmp-in" required minLength={2} maxLength={120} value={f.name}
            onChange={e => set('name', e.target.value)} onBlur={() => !f.code && f.name && set('code', suggestCode(f.name))} />
        </div>
        <div>
          <label className="lbl" htmlFor="n-code">SIGN-IN CODE</label>
          <input id="n-code" className="cmp-in mono" required minLength={3} maxLength={12} value={f.code}
            onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} />
        </div>
        <div>
          <label className="lbl" htmlFor="n-cur">CURRICULUM</label>
          <select id="n-cur" className="cmp-sel" value={f.curriculum} onChange={e => set('curriculum', e.target.value)}>
            {CURRICULA.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="n-city">CITY</label>
          <input id="n-city" className="cmp-in" maxLength={80} value={f.city} onChange={e => set('city', e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="n-state">STATE</label>
          <select id="n-state" className="cmp-sel" value={f.state} onChange={e => set('state', e.target.value)}>
            <option value="">Not set</option>
            {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="n-district">DISTRICT</label>
          <input id="n-district" className="cmp-in" maxLength={80} disabled={!f.state} placeholder="Decides the territory and owner" value={f.district} onChange={e => set('district', e.target.value)} />
        </div>
      </div>

      <label className="lbl" style={{ marginTop: 18 }}>TIER</label>
      <div className="ops-tier" role="group" aria-label="Tier">
        {PLANS.map(p => (
          <button key={p} type="button" aria-pressed={f.plan === p} onClick={() => set('plan', p)}>
            <div className="t">{PLAN_INFO[p].label}</div>
            <div className="p">{PLAN_INFO[p].price ? `${inr(PLAN_INFO[p].price, true)} / student / yr · ${PLAN_INFO[p].position}` : p === 'pilot' ? 'One grade, one term' : 'Custom price'}</div>
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{PLAN_INFO[f.plan].note}</p>

      <div className="g2" style={{ marginTop: 12 }}>
        {f.plan === 'pilot' && (
          <div>
            <label className="lbl" htmlFor="n-days">PILOT LENGTH (DAYS)</label>
            <input id="n-days" type="number" min={1} max={365} className="cmp-in" value={f.pilotDays} onChange={e => set('pilotDays', Number(e.target.value))} />
          </div>
        )}
        <div>
          <label className="lbl" htmlFor="n-seats">CONTRACTED STUDENTS {f.plan === 'pilot' ? '(PILOT GRADE)' : '(OPTIONAL)'}</label>
          <input id="n-seats" type="number" min={1} className="cmp-in" placeholder="Bill on students added" value={f.contractStudents} onChange={e => set('contractStudents', e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="n-price">PRICE PER STUDENT / YR (₹){f.plan === 'mandala' ? '' : ' (OPTIONAL)'}</label>
          <input id="n-price" type="number" min={1} className="cmp-in" required={f.plan === 'mandala'}
            placeholder={PLAN_INFO[f.plan].price ? `List price ${inr(PLAN_INFO[f.plan].price, true)}` : f.plan === 'pilot' ? 'Tier price at conversion' : 'Agreed price'}
            value={f.pricePerStudent} onChange={e => set('pricePerStudent', e.target.value)} />
        </div>
      </div>
      {seats > 0 && price ? <div className="note info" style={{ marginTop: 14 }}>Annual value: <b>{inr(seats * price, true)}</b> ({num(seats)} students × {inr(price, true)}){f.plan === 'pilot' ? ', when the pilot converts' : ''}.</div> : null}
      {err && <div className="note err" style={{ marginTop: 14 }} role="alert">{err}</div>}
      <div className="acts" style={{ marginTop: 18 }}>
        <button className="btn pri" disabled={busy}>{busy ? 'Creating…' : <>Create and set up <ArrowRight size={15} weight="bold" /></>}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
