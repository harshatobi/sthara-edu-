'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { IdentificationCardIcon as IdentificationCard } from '@phosphor-icons/react/dist/ssr/IdentificationCard';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { CardHead, DeskGate, Kpi, downloadCsv } from '@/components/admin/kit';
import type { AdminDesk } from '@/lib/admin/desk';
import { fmtDate } from '@/lib/admin/format';
import { EMPLOYMENT, STAFF_CATEGORIES, type StaffCategory } from '@/lib/schedule/types';
import { STATUS, attention, statusOf, tenure, type Employee, type Status } from '@/lib/hr/engine';
import { usePeople, type Call, type PeopleData } from '@/lib/hr/usePeople';
import MyRecord from '@/components/hr/MyRecord';
import EmployeeWorkspace from './EmployeeWorkspace';
import Organisation from './Organisation';
import ImportTab from './ImportTab';
import { HireForm } from './forms';
import '@/styles/schedule.css';
import '@/styles/people.css';

type Tab = 'directory' | 'attention' | 'organisation' | 'import' | 'mine';

export default function PeoplePage() {
  return <DeskGate>{desk => <People desk={desk} />}</DeskGate>;
}

/**
 * The employee master. Anyone who can see the workforce gets the directory; HR (hr.manage) keeps the records,
 * runs the lifecycle and sees what needs attention; every office account sees its own record.
 */
function People({ desk }: { desk: AdminDesk }) {
  const router = useRouter();
  const params = useSearchParams();
  const a = desk.me.access;
  const see = a.any('workforce.read', 'hr.manage'), manage = a.can('hr.manage');
  const tabs: { key: Tab; label: string }[] = [
    ...(see ? [{ key: 'directory' as const, label: 'Directory' }] : []),
    ...(manage ? [{ key: 'attention' as const, label: 'Needs attention' }, { key: 'organisation' as const, label: 'Organisation' }, { key: 'import' as const, label: 'Import' }] : []),
    { key: 'mine', label: 'My record' },
  ];
  const tab = tabs.find(t => t.key === params.get('tab'))?.key ?? tabs[0].key;
  const openId = params.get('id');
  const go = (t: Tab, id?: string) => router.replace(`/admin/people?tab=${t}${id ? `&id=${id}` : ''}`, { scroll: false });
  const [toast, toastEl] = useToast();

  return (
    <>
      {toastEl}
      <PageBar eyebrow="PEOPLE" title="Employee records"
        sub="One record for everyone who works at the school: their job on any date, where they are from joining to leaving, and the details payroll and inspections need." />
      <div className="tabs" role="tablist" aria-label="People">
        {tabs.map(t => <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab${tab === t.key ? ' on' : ''}`} onClick={() => go(t.key)}>{t.label}</button>)}
      </div>
      {tab === 'mine' ? <MyRecord /> : <Loaded tab={tab} openId={openId} go={go} toast={toast} />}
    </>
  );
}

function Loaded({ tab, openId, go, toast }: { tab: Tab; openId: string | null; go: (t: Tab, id?: string) => void; toast: (m: string) => void }) {
  const { data, error, reload, call } = usePeople();
  if (error) return <div className="note err" role="alert">Couldn&apos;t load employee records: {error}</div>;
  if (!data) return <div className="card" aria-busy="true">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={44} style={{ marginBottom: 12 }} />)}</div>;
  const common = { data, call, reload, toast };
  return (
    <>
      {tab === 'directory' && <Directory {...common} open={id => go('directory', id)} />}
      {tab === 'attention' && <AttentionTab data={data} open={id => go('attention', id)} />}
      {tab === 'organisation' && <Organisation {...common} />}
      {tab === 'import' && <ImportTab {...common} />}
      {openId && data.can.manage && <EmployeeWorkspace id={openId} data={data} call={call} toast={toast} onChanged={reload} onClose={() => go(tab)} />}
    </>
  );
}

function Directory({ data, call, reload, toast, open }: { data: PeopleData; call: Call; reload: () => void; toast: (m: string) => void; open: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<StaffCategory | 'all'>('all');
  const [dept, setDept] = useState('');
  const [state, setState] = useState<Status | 'all' | 'current'>('current');
  const [hiring, setHiring] = useState(false);
  const [busy, setBusy] = useState(false);
  const { people, today, can } = data;
  const onNotice = useMemo(() => new Set(data.exits.filter(x => x.status === 'notice').map(x => x.staffMemberId)), [data.exits]);
  const status = (p: Employee) => statusOf(p, onNotice.has(p.id));
  const deptName = (id: string | null) => data.departments.find(d => d.id === id)?.name ?? '';
  const gradeName = (id: string | null) => data.grades.find(g => g.id === id)?.name ?? '';
  const name = (id: string | null) => people.find(p => p.id === id)?.name ?? '';
  const active = people.filter(p => p.active);
  const needle = q.trim().toLowerCase();
  const shown = people.filter(p => {
    const s = status(p);
    if (state === 'current' ? s === 'exited' : state !== 'all' && s !== state) return false;
    if (cat !== 'all' && p.category !== cat) return false;
    if (dept && (dept === 'none' ? !!p.departmentId : p.departmentId !== dept)) return false;
    return !needle || [p.name, p.employeeCode, p.designation, p.email, deptName(p.departmentId)].some(v => v?.toLowerCase().includes(needle));
  });
  const noCode = active.filter(p => !p.employeeCode).length;
  const incomplete = Object.keys(data.gaps).length;
  const exportCsv = () => downloadCsv(`employees-${today}.csv`, [
    ['Employee code', 'Name', 'Status', 'Category', 'Designation', 'Department', 'Grade', 'Reports to', 'Employment', 'Contract to', 'Joined', 'Tenure', 'Mobile', 'Login', 'Login email'],
    ...shown.map(p => [p.employeeCode ?? '', p.name, STATUS[status(p)].label, STAFF_CATEGORIES[p.category], p.designation, deptName(p.departmentId), gradeName(p.gradeId), name(p.managerId),
      EMPLOYMENT[p.employment], p.contractTo ?? '', p.joinedOn ?? '', tenure(p.joinedOn, today), p.phone ?? '', p.login ?? 'none', p.email ?? '']),
  ]);

  return (
    <>
      <div className="kpis">
        <Kpi label="ON THE REGISTER" value={active.length} note={`${active.filter(p => !p.login).length} without a Sthara login`} />
        <Kpi label="TEACHING" value={active.filter(p => p.category === 'teaching').length} note={`${active.filter(p => p.category !== 'teaching').length} office and support`} />
        {can.manage && <Kpi label="ON PROBATION" value={active.filter(p => status(p) === 'probation').length} note={`${active.filter(p => status(p) === 'contract').length} on contract`} />}
        {can.manage && <Kpi label="SERVING NOTICE" value={onNotice.size} note={can.sensitive ? `${incomplete} record${incomplete === 1 ? '' : 's'} incomplete` : undefined} />}
      </div>
      {can.manage && noCode > 0 && (
        <div className="note info" style={{ marginBottom: 18, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}><b>{noCode} {noCode === 1 ? 'person has' : 'people have'} no employee code.</b> Codes are issued in order in the school&apos;s format ({data.settings.codePrefix}{'0'.repeat(Math.max(0, data.settings.codeWidth - 1))}1). Set the format under Organisation first if you want a different one.</span>
          <button className="btn sm" disabled={busy} onClick={async () => {
            setBusy(true);
            try { const r = await call<{ issued: number }>('/api/admin/people', 'POST', { action: 'issue_codes' }); reload(); toast(`${r.issued} employee code${r.issued === 1 ? '' : 's'} issued`); } catch (e: any) { toast(e.message); } finally { setBusy(false); }
          }}>{busy ? 'Issuing…' : 'Issue codes'}</button>
        </div>
      )}
      <div className="card">
        <CardHead title="Directory" sub={can.manage ? 'Open anyone to see and keep their full record.' : 'Names, roles and departments. HR keeps the full records.'}
          right={<div className="hr-acts">
            <button className="btn sm" onClick={exportCsv}><DownloadSimple size={13} /> Export</button>
            {can.manage && <button className="btn sm pri" onClick={() => setHiring(true)}><Plus size={12} weight="bold" /> Add employee</button>}
          </div>} />
        <div className="sch-bar">
          <input className="hr-search" type="search" aria-label="Search people" placeholder="Search name, code, designation" value={q} onChange={e => setQ(e.target.value)} />
          <select className="sch-sel" aria-label="Category" value={cat} onChange={e => setCat(e.target.value as StaffCategory | 'all')}>
            <option value="all">All categories</option>{Object.entries(STAFF_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="sch-sel" aria-label="Department" value={dept} onChange={e => setDept(e.target.value)}>
            <option value="">All departments</option>{data.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}<option value="none">No department</option>
          </select>
          <select className="sch-sel" aria-label="Status" value={state} onChange={e => setState(e.target.value as Status | 'all' | 'current')}>
            <option value="current">Current staff</option>
            {can.manage && (['confirmed', 'probation', 'contract', 'notice'] as Status[]).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
            <option value="exited">Left the school</option><option value="all">Everyone</option>
          </select>
          <span className="sp" />
          <span className="muted" style={{ fontSize: 12.5 }}>{shown.length} of {people.length}</span>
        </div>
        {shown.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Reports to</th><th>Joined</th><th className="c">Status</th></tr></thead>
              <tbody>{shown.map(p => {
                const s = status(p);
                return (
                  <tr key={p.id} className={can.manage ? 'hr-row' : undefined} style={p.active ? undefined : { opacity: 0.55 }} tabIndex={can.manage ? 0 : undefined}
                    onClick={can.manage ? () => open(p.id) : undefined} onKeyDown={can.manage ? e => { if (e.key === 'Enter') open(p.id); } : undefined}>
                    <td><b>{p.name}</b><div className="muted num" style={{ fontSize: 12 }}>{p.employeeCode || 'No code'}</div></td>
                    <td>{p.designation || STAFF_CATEGORIES[p.category]}<div className="muted" style={{ fontSize: 12 }}>{[STAFF_CATEGORIES[p.category], gradeName(p.gradeId)].filter(Boolean).join(' · ')}</div></td>
                    <td>{deptName(p.departmentId) || <span className="muted">—</span>}</td>
                    <td>{name(p.managerId) || <span className="muted">—</span>}</td>
                    <td>{p.joinedOn ? <>{fmtDate(p.joinedOn)}<div className="muted" style={{ fontSize: 12 }}>{tenure(p.joinedOn, today)}</div></> : <span className="muted">—</span>}</td>
                    <td className="c">
                      {can.manage || s === 'exited' ? <Chip tone={STATUS[s].tone}>{STATUS[s].label.toUpperCase()}</Chip> : <Chip tone="g">ACTIVE</Chip>}
                      {p.employment !== 'permanent' && p.contractTo && p.active && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>to {fmtDate(p.contractTo, true)}</div>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : <Empty icon={<IdentificationCard size={26} weight="duotone" />} title="Nobody matches">Change the search or the filters.</Empty>}
      </div>
      {hiring && <HireForm data={data} call={call} onClose={() => setHiring(false)} onSaved={m => { setHiring(false); reload(); toast(m); }} />}
    </>
  );
}

const TONE = { r: 'var(--red)', a: 'var(--amber)', b: 'var(--sky)' };
const GROUPS: [string, string][] = [['probation', 'Probation'], ['contract', 'Contracts'], ['exit', 'Exits'], ['login', 'Logins to remove'], ['document', 'Documents'], ['job', 'Upcoming job changes'], ['record', 'Incomplete records']];

function AttentionTab({ data, open }: { data: PeopleData; open: (id: string) => void }) {
  const [kind, setKind] = useState('all');
  const items = useMemo(() => attention({ today: data.today, alertDays: data.settings.alertDays, people: data.people, exits: data.exits, documents: data.documents, upcoming: data.upcoming, gaps: data.gaps }), [data]);
  const shown = kind === 'all' ? items : items.filter(i => i.kind === kind);
  const count = (k: string) => items.filter(i => i.kind === k).length;
  return (
    <>
      <div className="kpis">
        <Kpi label="OVERDUE" value={items.filter(i => i.tone === 'r').length} valueColor={items.some(i => i.tone === 'r') ? 'var(--red)' : undefined} note="Past their date" />
        <Kpi label={`DUE IN ${data.settings.alertDays} DAYS`} value={items.filter(i => i.tone === 'a').length} note="Probation, contracts, exits, documents" />
        <Kpi label="INCOMPLETE RECORDS" value={count('record')} note={data.can.sensitive ? 'Missing what payroll needs' : 'Visible to HR with sensitive access'} />
      </div>
      <div className="card">
        <CardHead title="Needs attention" sub={`Things with a date in the next ${data.settings.alertDays} days or already past, and records with gaps. Open one to act on it.`} />
        <div className="sch-bar">
          <div className="sch-seg" role="tablist" aria-label="Kind">
            <button role="tab" aria-selected={kind === 'all'} className={kind === 'all' ? 'on' : ''} onClick={() => setKind('all')}>All {items.length}</button>
            {GROUPS.filter(([k]) => count(k)).map(([k, l]) => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l} {count(k)}</button>)}
          </div>
        </div>
        {shown.length ? shown.map(i => (
          <button key={i.key} type="button" className="hr-att" onClick={() => open(i.personId)}>
            <span className="dot" style={{ background: TONE[i.tone] }} aria-hidden="true" />
            <span style={{ flex: 1 }}><span className="t">{i.title}</span><span className="d" style={{ display: 'block' }}>{i.detail}</span></span>
            {i.due && <span className="muted num" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDate(i.due)}</span>}
          </button>
        )) : <Empty icon={<CheckCircle size={26} weight="duotone" />} title="Nothing needs attention">No probation, contract, exit or document date is due, and no record has gaps.</Empty>}
      </div>
    </>
  );
}
