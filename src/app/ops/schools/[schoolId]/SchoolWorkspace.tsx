'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { CircleIcon as Circle } from '@phosphor-icons/react/dist/ssr/Circle';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { LockIcon as Lock } from '@phosphor-icons/react/dist/ssr/Lock';
import { UserPlusIcon as UserPlus } from '@phosphor-icons/react/dist/ssr/UserPlus';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { setupChecklist, type RegistrySchool } from '@/lib/ops/attention';
import { normClass } from '@/lib/ops/people';
import { USD_TO_INR } from '@/lib/ai/pricing';
import {
  CURRICULA, PLANS, PLAN_INFO, REASON_MIN, SCHOOL_FIELD_LABELS, annualValue, effectivePrice,
  type Plan, type SchoolPatch,
} from '@/lib/settings/registry';
import { Facts, PlanChip, Section, StatusChip, Table, dayIST, downloadCsv, errText, fmtDate, fmtDateTime, inr, num, plural } from '../../_ui';
import { useOpsApi } from '../../useOpsApi';
import { extendedEnd, useSchoolPatch, type AccessResult } from '../../useSchoolPatch';
import { ClassesStep, PeopleStep, RosterStep, TeachingStep, type ClassRow, type Issued, type Person } from './parts';

interface JournalRow { id: number; at: string; actor_email: string | null; key: string; old_value: unknown; new_value: unknown; reason: string }
interface AuditRow { id: number; at: string; actor: string | null; actor_role: string | null; action: string; table_name: string; row_id: string | null }
interface Data {
  school: { id: string; name: string; settings: Record<string, unknown> | null; created_at: string };
  facts: RegistrySchool;
  classes: ClassRow[];
  people: Person[];
  journal: JournalRow[] | null;
  audit: AuditRow[] | null;
  ai: { calls: number; failed: number; tokens: number; costUsd: number } | null;
}

const TABS = [
  ['overview', 'Overview'], ['access', 'Subscription & access'], ['classes', 'Classes & subjects'],
  ['people', 'People'], ['teaching', 'Teaching'], ['activity', 'Activity'],
] as const;
type Tab = (typeof TABS)[number][0];

/** Platform Manager > Schools > one school: everything about running it. */
export default function SchoolWorkspace({ schoolId }: { schoolId: string }) {
  const api = useOpsApi();
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTabState] = useState<Tab>(() => {
    const t = params.get('tab');
    return TABS.some(([k]) => k === t) ? (t as Tab) : 'overview';
  });
  const [issued, setIssued] = useState<Issued[]>([]);
  const [downloaded, setDownloaded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [toast, toastEl] = useToast(3200);

  const setTab = (t: Tab) => { setTabState(t); router.replace(`/ops/schools/${schoolId}?tab=${t}`, { scroll: false }); };

  // Reload after a change (children await it before showing their result).
  const load = useCallback(async () => {
    try { setData(await api<Data>(`/schools/${schoolId}`)); setErr(null); } catch (e) { setErr(errText(e)); }
  }, [api, schoolId]);
  useEffect(() => {
    let live = true;
    api<Data>(`/schools/${schoolId}`)
      .then(d => { if (live) { setData(d); setErr(null); } })
      .catch(e => { if (live) setErr(errText(e)); });
    return () => { live = false; };
  }, [api, schoolId]);

  // Temporary passwords exist only in this tab: warn before leaving without the handover file.
  useEffect(() => {
    if (downloaded) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [downloaded]);

  const addIssued = (list: Issued[]) => { if (list.length) { setIssued(p => [...p, ...list]); setDownloaded(false); } };
  const code = data?.facts.code ?? '';
  const exportCredentials = () => {
    downloadCsv(`${code || 'school'}-credentials.csv`, [
      ['role', 'name', 'email', 'class / roll / children', 'temporary password', 'school code'],
      ...issued.map(i => [i.role, i.name, i.email, i.detail, i.tempPassword, code]),
    ]);
    setDownloaded(true);
  };

  const f = data?.facts;
  return (
    <>
      <Link href="/ops/schools" className="ws-back" style={{ marginBottom: 10 }}><ArrowLeft size={15} weight="bold" /> All schools</Link>
      <PageBar eyebrow="SCHOOL" title={f?.name ?? (err ? 'School' : 'Loading…')}
        sub={f ? <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="mono">{f.code ?? 'NO CODE'}</span><PlanChip plan={f.plan} /><StatusChip s={f} />
          {!f.aiEnabled && <Chip tone="n">AI OFF</Chip>}{f.testSchool && <Chip tone="n">TEST SCHOOL</Chip>}
        </span> : undefined}
        actions={<>
          {issued.length > 0 && (
            <button className={`btn ${downloaded ? '' : 'red'}`} onClick={exportCredentials}>
              <DownloadSimple size={15} weight="bold" /> {downloaded ? 'Download credentials again' : `Download ${issued.length} new credential${issued.length === 1 ? '' : 's'}`}
            </button>
          )}
          <button className="btn pri" onClick={() => { setTab('people'); setAdding(true); }}><UserPlus size={15} weight="bold" /> Add people</button>
        </>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {!downloaded && (
        <div className="note" style={{ marginBottom: 18 }} role="status">
          Temporary passwords are shown once and not stored anywhere. Download the credentials file before leaving this page, and hand it over securely.
        </div>
      )}
      {params.get('created') === '1' && tab === 'classes' && (
        <div className="note info" style={{ marginBottom: 18 }}>School created. Set up its classes and subjects next, then add people.</div>
      )}

      <div className="seg" role="tablist" aria-label="School sections" style={{ marginBottom: 18 }}>
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {!data || !f ? (err ? null : <Skeleton h={360} style={{ borderRadius: 20 }} />) : (
        <>
          {tab === 'overview' && <OverviewTab d={data} go={setTab} />}
          {tab === 'access' && <AccessTab key={`${f.id}:${f.updatedAt}`} f={f} onSaved={msg => { toast(msg); void load(); }} />}
          {tab === 'classes' && <ClassesStep schoolId={schoolId} classes={data.classes} onSaved={load} next={() => setTab('people')} />}
          {tab === 'people' && (
            <>
              {adding
                ? <div style={{ marginBottom: 18 }}>
                    <PeopleStep schoolId={schoolId} classes={data.classes} people={data.people} onCreated={list => { addIssued(list); void load(); }} />
                    <div className="acts" style={{ marginTop: 10 }}><button className="btn sm" onClick={() => setAdding(false)}>Close add people</button></div>
                  </div>
                : null}
              <RosterStep schoolId={schoolId} people={data.people} onIssued={i => addIssued([i])} />
            </>
          )}
          {tab === 'teaching' && <TeachingStep schoolId={schoolId} classes={data.classes} people={data.people} onSaved={load} />}
          {tab === 'activity' && <ActivityTab d={data} />}
        </>
      )}
      {toastEl}
    </>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewTab({ d, go }: { d: Data; go: (t: Tab) => void }) {
  const f = d.facts;
  const coverage = useMemo(() => {
    const covered = new Set(d.people.filter(p => p.role === 'teacher').flatMap(t => (t.assignments ?? []).map(a => `${normClass(a.class)}|${a.subject}`)));
    const all = d.classes.flatMap(c => (c.metadata?.subjects ?? []).map(s => `${normClass(c.name)}|${s}`));
    return { total: all.length, covered: all.filter(k => covered.has(k)).length };
  }, [d]);
  const checklist = setupChecklist(f, coverage);
  const done = checklist.filter(c => c.done).length;
  const students = f.roles.student ?? 0;
  const price = effectivePrice(f);
  const value = annualValue(f, students);
  const settings = (d.school.settings ?? {}) as { city?: string; board?: string };

  return (
    <div className="g2">
      <div>
        <Section title="Profile and contract" actions={<button className="btn sm" onClick={() => go('access')}>Change <ArrowRight size={13} weight="bold" /></button>}>
          <Facts rows={[
            ['Sign-in code', <span className="mono" key="c">{f.code ?? 'Not set'}</span>],
            ['Tier', <span key="t">{PLAN_INFO[f.plan].label} <span className="muted" style={{ fontWeight: 500 }}>· {PLAN_INFO[f.plan].position}</span></span>],
            ...(f.plan === 'pilot' ? [['Pilot ends', <span key="p">{fmtDate(f.trialEndsAt)} <span className="muted" style={{ fontWeight: 500 }}>· {f.trialExpired ? 'ended' : `${f.trialDaysLeft} days left`}</span></span>] as [string, React.ReactNode]] : []),
            ['Price per student / yr', price ? <span key="pr">{inr(price, true)}{f.pricePerStudent ? <span className="muted" style={{ fontWeight: 500 }}> · contract</span> : ' · list'}</span> : f.plan === 'pilot' ? 'Tier price on conversion' : 'Not set'],
            ['Billing seats', f.contractStudents ? `${num(f.contractStudents)} contracted` : `${num(students)} on the platform`],
            ['Annual value', <b key="v">{inr(value)}</b>],
            ['Curriculum', f.curriculum ?? 'Not set'],
            ['City', settings.city || '—'],
            ['Created', fmtDate(f.createdAt)],
          ]} />
        </Section>
        <Section title="People" actions={<button className="btn sm" onClick={() => go('people')}>Roster <ArrowRight size={13} weight="bold" /></button>}>
          <Facts rows={[
            ['Students', num(students)], ['Teachers', num(f.roles.teacher ?? 0)], ['Parents', num(f.roles.parent ?? 0)],
            ['Admins', `${num(f.roles.admin ?? 0)} (${f.schoolAdmins} with school admin role)`], ['Classes', num(f.classes)],
            ['On a temporary password', num(d.people.filter(p => p.metadata?.mustChangePassword).length)],
          ]} />
        </Section>
      </div>
      <div>
        <Section title="Setup" sub={`${done} of ${checklist.length} done`}>
          <div className="ops-bar" style={{ marginBottom: 12 }}><i style={{ width: `${(done / checklist.length) * 100}%` }} /></div>
          <div className="ops-check">
            {checklist.map(c => (
              <button key={c.key} type="button" onClick={() => go(c.tab as Tab)}>
                {c.done ? <CheckCircle size={18} weight="fill" color="#10B981" /> : <Circle size={18} weight="bold" color="var(--mut2)" />}
                <span style={{ flex: 1, color: c.done ? 'var(--mut)' : undefined }}>{c.label}</span>
                {!c.done && <ArrowRight size={13} weight="bold" color="var(--mut)" />}
              </button>
            ))}
          </div>
          {coverage.total > 0 && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{coverage.covered} of {coverage.total} class subjects have a teacher.</p>}
        </Section>
        <Section title="AI use, last 30 days" actions={<Link className="btn sm" href="/ops/usage">AI usage <ArrowRight size={13} weight="bold" /></Link>}>
          {d.ai ? (
            <Facts rows={[
              ['Spend', inr(d.ai.costUsd * USD_TO_INR, d.ai.costUsd * USD_TO_INR < 1e5)],
              ['Calls', `${num(d.ai.calls)}${d.ai.failed ? ` (${d.ai.failed} failed)` : ''}`],
              ['Tokens', num(d.ai.tokens)],
              ['Per student', students ? inr((d.ai.costUsd * USD_TO_INR) / students, true) : '—'],
            ]} />
          ) : <p className="muted">AI metering isn&apos;t available.</p>}
        </Section>
      </div>
    </div>
  );
}

// ── Subscription & access ─────────────────────────────────────────────────────

interface Draft {
  name: string; code: string; plan: Plan; trialEndsAt: string; curriculum: string; institutionType: 'school' | 'college';
  contractStudents: string; pricePerStudent: string; aiEnabled: boolean; active: boolean;
}
const draftOf = (f: RegistrySchool): Draft => ({
  name: f.name, code: f.code ?? '', plan: f.plan, trialEndsAt: dayIST(f.trialEndsAt), curriculum: f.curriculum ?? '',
  institutionType: f.institutionType, contractStudents: f.contractStudents ? String(f.contractStudents) : '',
  pricePerStudent: f.pricePerStudent ? String(f.pricePerStudent) : '', aiEnabled: f.aiEnabled, active: f.active,
});
const text = (k: keyof Draft, v: unknown) =>
  k === 'active' ? (v ? 'Active' : 'Suspended') : k === 'aiEnabled' ? (v ? 'On' : 'Off')
    : k === 'plan' ? PLAN_INFO[v as Plan].label : k === 'trialEndsAt' ? (v ? fmtDate(`${v}T12:00:00+05:30`) : 'None')
    : k === 'pricePerStudent' ? (v ? inr(Number(v), true) : 'List price') : k === 'contractStudents' ? (v ? num(Number(v)) : 'Actual students')
    : String(v || 'None');

function AccessTab({ f, onSaved }: { f: RegistrySchool; onSaved: (msg: string) => void }) {
  const api = useOpsApi();
  const patch = useSchoolPatch();
  const base = useMemo(() => draftOf(f), [f]);
  const [d, setD] = useState<Draft>(base);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'save' | 'sync' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [synced, setSynced] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => ({ ...x, [k]: v }));

  const changes = (Object.keys(d) as (keyof Draft)[]).filter(k => {
    if (k === 'trialEndsAt' && d.plan !== 'pilot') return false;
    if (k === 'curriculum' && !d.curriculum) return false;
    return (k === 'code' ? d.code.toUpperCase() : d[k]) !== base[k];
  });
  const suspending = base.active && !d.active;
  const students = f.roles.student ?? 0;
  const draftValue = annualValue({ plan: d.plan, pricePerStudent: Number(d.pricePerStudent) || null, contractStudents: Number(d.contractStudents) || null }, students);
  const describe = (a: AccessResult | null) => (a ? ` Sign-in: ${a.changed} login${a.changed === 1 ? '' : 's'} ${d.active ? 'unlocked' : 'locked'}${a.failed.length ? `, ${a.failed.length} failed (use Re-apply sign-in lock)` : ''}.` : '');

  const save = async () => {
    setBusy('save'); setErr(null);
    const body: Partial<Record<keyof SchoolPatch, unknown>> = {};
    for (const k of changes) {
      body[k] = k === 'code' ? d.code.toUpperCase()
        : k === 'contractStudents' || k === 'pricePerStudent' ? (d[k] ? Number(d[k]) : null)
        : d[k];
    }
    if (changes.includes('plan') && d.plan === 'pilot' && !changes.includes('trialEndsAt')) body.trialEndsAt = d.trialEndsAt || extendedEnd(null, 90);
    try {
      const r = await patch(f.id, body, reason.trim(), f.updatedAt);
      onSaved(`${f.name}: ${plural(changes.length, 'change')} saved.${describe(r.access)}`);
    } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  const sync = async () => {
    setBusy('sync'); setErr(null);
    try {
      const r = await api<{ access: AccessResult | null }>(`/schools/${f.id}/settings`, { method: 'PATCH', body: { sync: true, reason: 'Re-apply sign-in access for current status' } });
      setSynced(`Sign-in access re-applied.${describe(r.access)}`);
    } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };

  const id = (k: string) => `ac-${k}`;
  return (
    <>
      <Section title="Tier and contract" sub="Prices are per student per year. A pilot is one grade for one term at full tier price, credited 100% on conversion.">
        <div className="ops-tier" role="group" aria-label="Tier">
          {PLANS.map(p => (
            <button key={p} type="button" aria-pressed={d.plan === p} onClick={() => set('plan', p)}>
              <div className="t">{PLAN_INFO[p].label}{p === base.plan && <span className="muted" style={{ fontWeight: 600, fontSize: 11 }}> · current</span>}</div>
              <div className="p">{PLAN_INFO[p].price ? `${inr(PLAN_INFO[p].price, true)} · ${PLAN_INFO[p].position}` : p === 'pilot' ? 'One grade, one term' : 'Custom price'}</div>
            </button>
          ))}
        </div>
        <div className="g2" style={{ marginTop: 16 }}>
          {d.plan === 'pilot' && (
            <div>
              <label className="lbl" htmlFor={id('end')}>PILOT ENDS (END OF DAY, IST)</label>
              <input id={id('end')} className="cmp-in" type="date" value={d.trialEndsAt} onChange={e => set('trialEndsAt', e.target.value)} />
              <div className="acts" style={{ marginTop: 8 }}>
                {[30, 90].map(n => <button key={n} type="button" className="btn sm" onClick={() => set('trialEndsAt', extendedEnd(f.trialEndsAt, n))}>+{n} days</button>)}
              </div>
            </div>
          )}
          <div>
            <label className="lbl" htmlFor={id('seats')}>CONTRACTED STUDENTS</label>
            <input id={id('seats')} className="cmp-in" type="number" min={1} placeholder={`Bill on students added (${num(students)})`} value={d.contractStudents} onChange={e => set('contractStudents', e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor={id('price')}>PRICE PER STUDENT / YR (₹)</label>
            <input id={id('price')} className="cmp-in" type="number" min={1}
              placeholder={PLAN_INFO[d.plan].price ? `List price ${inr(PLAN_INFO[d.plan].price, true)}` : d.plan === 'mandala' ? 'Required for Mandala' : 'Tier price on conversion'}
              value={d.pricePerStudent} onChange={e => set('pricePerStudent', e.target.value)} />
          </div>
          <div>
            <span className="lbl">ANNUAL VALUE</span>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{inr(draftValue)}</div>
          </div>
        </div>
      </Section>

      <Section title="Profile">
        <div className="g2">
          <div>
            <label className="lbl" htmlFor={id('name')}>SCHOOL NAME</label>
            <input id={id('name')} className="cmp-in" maxLength={120} value={d.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor={id('code')}>SIGN-IN CODE</label>
            <input id={id('code')} className="cmp-in mono" maxLength={12} value={d.code} onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} />
          </div>
          <div>
            <label className="lbl" htmlFor={id('cur')}>CURRICULUM</label>
            <select id={id('cur')} className="cmp-sel" value={d.curriculum} onChange={e => set('curriculum', e.target.value)}>
              {!d.curriculum && <option value="">Not set</option>}
              {CURRICULA.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor={id('type')}>INSTITUTION TYPE</label>
            <select id={id('type')} className="cmp-sel" value={d.institutionType} onChange={e => set('institutionType', e.target.value as 'school' | 'college')}>
              <option value="school">School</option><option value="college">College</option>
            </select>
          </div>
        </div>
      </Section>

      <Section title="Access" sub="Suspension locks every account at this school out at sign-in and on every API call. Data is kept.">
        <div className="g2">
          <div>
            <span className="lbl" id={id('ai')}>AI FEATURES FOR THIS SCHOOL</span>
            <div className="os-toggle"><button type="button" role="switch" className="swt" aria-checked={d.aiEnabled} aria-labelledby={id('ai')} onClick={() => set('aiEnabled', !d.aiEnabled)} />{d.aiEnabled ? 'On' : 'Off'}</div>
          </div>
          <div>
            <span className="lbl" id={id('st')}>ACCOUNT STATUS</span>
            <div className="os-toggle"><button type="button" role="switch" className="swt" aria-checked={d.active} aria-labelledby={id('st')} onClick={() => set('active', !d.active)} />{d.active ? 'Active' : 'Suspended'}</div>
          </div>
        </div>
        {!base.active && f.suspension && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Suspended {fmtDate(f.suspension.at)}{f.suspension.reason ? `: ${f.suspension.reason}` : ''}.</p>}
        {!base.active && (
          <div className="acts" style={{ marginTop: 12 }}>
            <button className="btn sm" disabled={!!busy} onClick={sync}>{busy === 'sync' ? 'Applying…' : 'Re-apply sign-in lock'}</button>
            {synced && <span className="muted">{synced}</span>}
          </div>
        )}
        {(suspending || (!base.active && d.active)) && (
          <div className="os-danger" style={{ marginTop: 14 }}>
            <Lock size={20} weight="fill" color="#E11D48" style={{ flex: '0 0 auto' }} />
            <div style={{ fontSize: 13, lineHeight: 1.55 }}>
              {suspending
                ? <>All {plural(f.people, 'account')} at {f.name} are locked out: the code is refused at sign-in, their logins are banned in Supabase Auth, and every API call and portal page is blocked. Data is kept.</>
                : <>Reactivating unlocks sign-in for {f.name}&apos;s accounts and lifts the bans the suspension added.</>}
            </div>
          </div>
        )}
      </Section>

      {changes.length > 0 && (
        <div className="card os-review" style={{ position: 'sticky', bottom: 12, zIndex: 5, boxShadow: '0 10px 40px rgba(0,33,71,.18)' }}>
          <b>{plural(changes.length, 'unsaved change')}</b>
          {changes.map(k => (
            <div className="os-diff" key={k}>
              <span className="muted" style={{ minWidth: 150 }}>{SCHOOL_FIELD_LABELS[k as keyof SchoolPatch]}</span>
              <s>{text(k, base[k])}</s><ArrowRight size={14} weight="bold" aria-label="to" /><span>{text(k, k === 'code' ? d.code.toUpperCase() : d[k])}</span>
            </div>
          ))}
          <label className="lbl" htmlFor={id('why')} style={{ marginBottom: 0 }}>REASON (KEPT IN THE AUDIT LOG)</label>
          <input id={id('why')} className="cmp-in" maxLength={500} value={reason} onChange={e => setReason(e.target.value)}
            placeholder={suspending ? 'e.g. Unpaid invoice INV-0042, 30 days overdue' : 'e.g. Signed annual Shikhara contract for 420 students'} />
          {err && <div className="note err" role="alert">{err}</div>}
          <div className="acts">
            <button className={`btn ${suspending ? 'red' : 'pri'}`} disabled={!!busy || reason.trim().length < REASON_MIN} onClick={save}>
              {busy === 'save' ? 'Saving…' : suspending ? 'Suspend school' : `Save ${plural(changes.length, 'change')}`}
            </button>
            <button className="btn" onClick={() => { setD(base); setReason(''); setErr(null); }}>Discard</button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Activity ──────────────────────────────────────────────────────────────────

const val = (key: string, v: unknown) => {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (key === 'plan' && typeof v === 'string') return PLAN_INFO[(PLANS as readonly string[]).includes(v) ? (v as Plan) : 'pilot'].label;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDate(v);
  return typeof v === 'string' ? v || 'Empty' : JSON.stringify(v);
};

function ActivityTab({ d }: { d: Data }) {
  return (
    <>
      <Section title="Changes made in this console" sub="Tier, pilot, status, AI and profile changes, with who made them and why.">
        {!d.journal ? <div className="note err">The change journal isn&apos;t available.</div>
          : !d.journal.length ? <Empty icon={<CheckCircle size={26} weight="duotone" />} title="No changes yet" /> : (
            <Table head={<tr><th>When</th><th>Field</th><th>Change</th><th>Reason</th><th>By</th></tr>}>
              {d.journal.map(j => (
                <tr key={j.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(j.at)}</td>
                  <td className="nm">{SCHOOL_FIELD_LABELS[j.key as keyof SchoolPatch] ?? j.key}</td>
                  <td><span className="muted">{val(j.key, j.old_value)}</span> → <b>{val(j.key, j.new_value)}</b></td>
                  <td>{j.reason}</td>
                  <td className="muted" style={{ overflowWrap: 'anywhere' }}>{j.actor_email ?? '—'}</td>
                </tr>
              ))}
            </Table>
          )}
      </Section>
      <Section title="Data audit trail" sub="The latest 100 audited writes at this school: grades, roles, consent, guardians, fees and settings."
        actions={<Link className="btn sm" href={`/ops/audit?source=data&school=${d.facts.id}`}>Full trail <ArrowRight size={13} weight="bold" /></Link>}>
        {!d.audit ? <div className="note err">The audit trail isn&apos;t available.</div>
          : !d.audit.length ? <Empty icon={<CheckCircle size={26} weight="duotone" />} title="Nothing audited yet" /> : (
            <Table head={<tr><th>When</th><th>Action</th><th>Record</th><th>By</th></tr>}>
              {d.audit.map(a => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.at)}</td>
                  <td><Chip tone={a.action === 'DELETE' ? 'r' : a.action === 'INSERT' ? 'g' : 'b'}>{a.action}</Chip></td>
                  <td className="mono" style={{ fontSize: 12 }}>{a.table_name}{a.row_id ? ` · ${a.row_id.slice(0, 8)}` : ''}</td>
                  <td>{a.actor ?? 'System'}{a.actor_role ? <div className="sub">{a.actor_role}</div> : null}</td>
                </tr>
              ))}
            </Table>
          )}
      </Section>
    </>
  );
}
