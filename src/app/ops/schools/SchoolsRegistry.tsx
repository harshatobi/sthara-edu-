'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { BuildingsIcon as Buildings } from '@phosphor-icons/react/dist/ssr/Buildings';
import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { CaretUpIcon as CaretUp } from '@phosphor-icons/react/dist/ssr/CaretUp';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import type { RegistrySchool } from '@/lib/ops/attention';
import { CURRICULA, PLANS, PLAN_INFO, annualValue, effectivePrice, type Plan } from '@/lib/settings/registry';
import { PlanChip, StatusChip, Table, downloadCsv, errText, fmtDate, inr, num, schoolStatus } from '../_ui';
import { useOpsApi } from '../useOpsApi';

type SortKey = 'name' | 'status' | 'plan' | 'ends' | 'students' | 'value' | 'created';
const STATUS_FILTERS = [
  ['all', 'All'], ['live', 'Live'], ['pilot', 'Active pilots'], ['ending', 'Pilot ending'], ['ended', 'Pilot ended'], ['suspended', 'Suspended'],
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number][0];

const matchStatus = (s: RegistrySchool, f: StatusFilter) => {
  const st = schoolStatus(s).label;
  return f === 'all' || (f === 'live' && st === 'Live') || (f === 'pilot' && s.plan === 'pilot' && s.active && !s.trialExpired)
    || (f === 'ending' && st === 'Pilot ending') || (f === 'ended' && st === 'Pilot ended') || (f === 'suspended' && !s.active);
};

/** Platform Manager > Schools: the tenant registry. */
export default function SchoolsRegistry() {
  const api = useOpsApi();
  const router = useRouter();
  const params = useSearchParams();
  const [rows, setRows] = useState<RegistrySchool[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>(() => {
    const s = params.get('status');
    return STATUS_FILTERS.some(([k]) => k === s) ? (s as StatusFilter) : 'all';
  });
  const [tier, setTier] = useState<Plan | 'all'>('all');
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: 'status', asc: true });
  const [creating, setCreating] = useState(() => params.get('new') === '1');

  const load = useCallback(() => {
    api<RegistrySchool[]>('/schools').then(r => { setRows(r); setErr(null); }).catch(e => { setErr(errText(e)); setRows([]); });
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (rows || []).filter(s => matchStatus(s, status) && (tier === 'all' || s.plan === tier)
      && (!needle || `${s.name} ${s.code ?? ''} ${s.curriculum ?? ''}`.toLowerCase().includes(needle)));
    const val = (s: RegistrySchool): string | number => {
      switch (sort.k) {
        case 'name': return s.name.toLowerCase();
        case 'status': return schoolStatus(s).rank;
        case 'plan': return PLANS.indexOf(s.plan);
        case 'ends': return s.trialEndsAt ?? '9999';
        case 'students': return s.roles.student ?? 0;
        case 'value': return annualValue(s, s.roles.student ?? 0) ?? -1;
        case 'created': return s.createdAt ?? '';
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name);
      return sort.asc ? c : -c;
    });
  }, [rows, q, status, tier, sort]);

  const th = (k: SortKey, label: string, cls = '') => (
    <th className={cls} aria-sort={sort.k === k ? (sort.asc ? 'ascending' : 'descending') : 'none'}>
      <button type="button" style={{ font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        onClick={() => setSort(s => ({ k, asc: s.k === k ? !s.asc : true }))}>
        {label}{sort.k === k && (sort.asc ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />)}
      </button>
    </th>
  );

  const exportCsv = () => downloadCsv(`sthara-schools-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['School', 'Code', 'Tier', 'Status', 'Pilot ends', 'Curriculum', 'Admins', 'Teachers', 'Students', 'Parents', 'Classes', 'Contracted students', 'Price per student (INR)', 'Annual value (INR)', 'AI', 'Created'],
    ...shown.map(s => [s.name, s.code, PLAN_INFO[s.plan].label, schoolStatus(s).label, s.trialEndsAt ? fmtDate(s.trialEndsAt) : '', s.curriculum,
      s.roles.admin ?? 0, s.roles.teacher ?? 0, s.roles.student ?? 0, s.roles.parent ?? 0, s.classes, s.contractStudents, effectivePrice(s),
      annualValue(s, s.roles.student ?? 0), s.aiEnabled ? 'On' : 'Off', s.createdAt ? fmtDate(s.createdAt) : '']),
  ]);

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Schools"
        sub={rows ? `${num(rows.length)} schools · ${num(rows.reduce((n, s) => n + s.people, 0))} accounts` : 'Every school on Sthara, its tier, status and setup.'}
        actions={<>
          <button className="btn" onClick={exportCsv} disabled={!shown.length}><DownloadSimple size={15} weight="bold" /> Export CSV</button>
          <button className="btn pri" onClick={() => setCreating(c => !c)}><Plus size={15} weight="bold" /> New school</button>
        </>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}

      {creating && <NewSchool onCancel={() => { setCreating(false); router.replace('/ops/schools'); }} onCreated={id => router.push(`/ops/schools/${id}?tab=classes&created=1`)} />}

      <div className="card">
        <div className="ops-filters">
          <input className="cmp-in" placeholder="Search by name, code or curriculum" aria-label="Search schools" value={q} onChange={e => setQ(e.target.value)} />
          <select className="cmp-sel" aria-label="Status" value={status} onChange={e => setStatus(e.target.value as StatusFilter)}>
            {STATUS_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="cmp-sel" aria-label="Tier" value={tier} onChange={e => setTier(e.target.value as Plan | 'all')}>
            <option value="all">All tiers</option>
            {PLANS.map(p => <option key={p} value={p}>{PLAN_INFO[p].label}</option>)}
          </select>
        </div>
        {!rows ? <div>{[0, 1, 2].map(i => <Skeleton key={i} h={52} style={{ marginBottom: 10 }} />)}</div> : (
          <Table
            head={<tr>{th('name', 'School')}{th('plan', 'Tier')}{th('status', 'Status')}{th('ends', 'Pilot ends')}{th('students', 'Students', 'r')}<th className="r">Staff</th><th>Setup</th>{th('value', 'Annual value', 'r')}{th('created', 'Created')}<th aria-label="Open" /></tr>}
            empty={!shown.length && <Empty icon={<Buildings size={28} weight="duotone" />} title={rows.length ? 'No school matches' : 'No schools yet'}>{rows.length ? 'Change the search or filters.' : 'Create the first school to start onboarding.'}</Empty>}>
            {shown.map(s => {
              const gaps = [!s.curriculum && 'curriculum', s.classes === 0 && 'classes', s.schoolAdmins === 0 && 'admin'].filter(Boolean) as string[];
              return (
                <tr key={s.id} className="click" onClick={() => router.push(`/ops/schools/${s.id}`)}>
                  <td style={{ minWidth: 220 }}><div className="nm">{s.name}</div><div className="sub"><span className="mono">{s.code ?? 'NO CODE'}</span> · {s.curriculum ?? 'Curriculum not set'}{s.testSchool ? ' · test' : ''}</div></td>
                  <td><PlanChip plan={s.plan} /></td>
                  <td><StatusChip s={s} />{!s.aiEnabled && <> <Chip tone="n">AI OFF</Chip></>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{s.plan === 'pilot' ? <>{fmtDate(s.trialEndsAt)}<div className="sub">{s.trialExpired ? 'Ended' : s.trialDaysLeft !== null ? `${s.trialDaysLeft} days left` : ''}</div></> : '—'}</td>
                  <td className="r">{num(s.roles.student ?? 0)}{s.contractStudents ? <div className="sub">{num(s.contractStudents)} contracted</div> : null}</td>
                  <td className="r">{num((s.roles.teacher ?? 0) + (s.roles.admin ?? 0))}</td>
                  <td>{gaps.length ? <Chip tone="a">MISSING {gaps.join(', ').toUpperCase()}</Chip> : <Chip tone="g">READY</Chip>}</td>
                  <td className="r" style={{ fontWeight: 700 }}>{inr(annualValue(s, s.roles.student ?? 0))}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(s.createdAt)}</td>
                  <td><ArrowRight size={15} weight="bold" color="var(--mut)" /></td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>
    </>
  );
}

const suggestCode = (name: string) =>
  (name.toUpperCase().match(/\b[A-Z]/g) || []).join('').slice(0, 4).padEnd(3, 'X') + '-' + String(Math.floor(100 + Math.random() * 900));

function NewSchool({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const api = useOpsApi();
  const params = useSearchParams();
  const enquiryId = params.get('enquiry');
  const [f, setF] = useState(() => ({
    name: params.get('name') ?? '', code: '', curriculum: 'CBSE', city: '', board: '',
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
