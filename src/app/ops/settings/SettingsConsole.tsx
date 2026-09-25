'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { BuildingsIcon as Buildings } from '@phosphor-icons/react/dist/ssr/Buildings';
import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { HeartbeatIcon as Heartbeat } from '@phosphor-icons/react/dist/ssr/Heartbeat';
import { LockIcon as Lock } from '@phosphor-icons/react/dist/ssr/Lock';
import { SlidersHorizontalIcon as SlidersHorizontal } from '@phosphor-icons/react/dist/ssr/SlidersHorizontal';
import { WarningOctagonIcon as WarningOctagon } from '@phosphor-icons/react/dist/ssr/WarningOctagon';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import {
  CURRICULA, PLANS, PLATFORM_SETTINGS, REASON_MIN, SCHOOL_FIELD_LABELS,
  type PlatformKey, type PlatformValues, type SchoolPatch, type SettingDef,
} from '@/lib/settings/registry';
import { STATUS_ORDER, summarise, type InventoryItem, type SchoolFacts, type Status } from '@/lib/settings/inventory';
import { useOpsApi } from '../useOpsApi';
import OpsFrame from '../OpsFrame';

interface JournalRow {
  id: number; at: string; actor_email: string | null; scope: 'platform' | 'school'; school_id: string | null;
  key: string; old_value: unknown; new_value: unknown; reason: string;
}
interface Data {
  items: InventoryItem[];
  platform: PlatformValues;
  platformStored: boolean;
  schools: SchoolFacts[];
  journal: JournalRow[] | null;
  checkedAt: string;
}
type Tab = 'health' | 'platform' | 'schools' | 'log';

const STATUS: Record<Status, { label: string; color: string; tone: Tone }> = {
  crit: { label: 'Critical', color: '#E11D48', tone: 'r' },
  warn: { label: 'Warning', color: '#F59E0B', tone: 'a' },
  info: { label: 'Note', color: '#4C8DFF', tone: 'b' },
  ok: { label: 'Healthy', color: '#10B981', tone: 'g' },
};
const SOURCE_LABEL: Record<string, string> = {
  environment: 'Vercel env', platform: 'Platform', school: 'Schools', database: 'Database', code: 'Code', runtime: 'Runtime',
};
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const dayIST = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '');
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
const TABS: Tab[] = ['health', 'platform', 'schools', 'log'];
const humanDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');

/** Operator console > Settings: every load-bearing setting, its health, and the controls that change it. */
export default function SettingsConsole({ devPreview }: { devPreview: boolean }) {
  const api = useOpsApi();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Deep links from elsewhere in the console: ?tab=schools&school=<id>
  const params = useSearchParams();
  const [focusSchool, setFocusSchool] = useState<string | null>(() => params.get('school'));
  const [tab, setTab] = useState<Tab>(() => {
    const t = params.get('tab') as Tab | null;
    return params.get('school') ? 'schools' : t && TABS.includes(t) ? t : 'health';
  });
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, toastEl] = useToast(2600);
  const reload = useCallback(() => { setLoading(true); setNonce(n => n + 1); }, []);

  useEffect(() => {
    let live = true;
    api<Data>('/settings')
      .then(d => { if (live) { setData(d); setErr(null); } })
      .catch((e: unknown) => { if (live) setErr(errText(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [api, nonce]);

  const counts = useMemo(() => (data ? summarise(data.items) : null), [data]);
  const saved = (msg: string) => { toast(msg); reload(); };

  return (
    <OpsFrame devPreview={devPreview}>
      <PageBar eyebrow="OPERATOR CONSOLE" title="Settings"
        sub={counts ? <>{counts.crit} critical · {counts.warn} warnings · checked {when(data!.checkedAt)}</> : 'Every setting the product depends on, and where it is enforced.'}
        actions={<>
          <Link className="btn" href="/ops">Schools</Link>
          <button className="btn" onClick={reload} disabled={loading} aria-label="Check again">
            <ArrowsClockwise size={15} weight="bold" /> {loading ? 'Checking…' : 'Check again'}
          </button>
        </>} />

      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}

      <div className="seg" role="tablist" aria-label="Settings sections" style={{ marginBottom: 18 }}>
        {([['health', 'Health', Heartbeat], ['platform', 'Platform', SlidersHorizontal], ['schools', 'Schools', Buildings], ['log', 'Change log', ClockCounterClockwise]] as const)
          .map(([k, label, Icon]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Icon size={15} weight={tab === k ? 'fill' : 'bold'} /> {label}
              {k === 'health' && counts && counts.crit > 0 && <Chip tone="r">{counts.crit}</Chip>}
            </button>
          ))}
      </div>

      {!data ? (
        err ? null : <div>{[0, 1, 2].map(i => <div className="card" key={i} style={{ marginBottom: 14 }}><Skeleton h={18} w="40%" /><Skeleton h={54} style={{ marginTop: 14 }} /><Skeleton h={54} style={{ marginTop: 10 }} /></div>)}</div>
      ) : tab === 'health' ? (
        <HealthView items={data.items} onOpen={t => setTab(t)} />
      ) : tab === 'platform' ? (
        <PlatformView values={data.platform} stored={data.platformStored} onSaved={saved} />
      ) : tab === 'schools' ? (
        <SchoolsView schools={data.schools} focus={focusSchool} setFocus={setFocusSchool} onSaved={saved} />
      ) : (
        <JournalView rows={data.journal} schools={data.schools} />
      )}
      {toastEl}
    </OpsFrame>
  );
}

// ── Health ────────────────────────────────────────────────────────────────────

function HealthView({ items, onOpen }: { items: InventoryItem[]; onOpen: (t: Tab) => void }) {
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [openLimits, setOpenLimits] = useState(false);
  const counts = summarise(items);
  const shown = items.filter(i => filter === 'all' || i.status === filter);
  const groups = [...new Set(items.map(i => i.group))];

  return (
    <>
      <div className="os-sum" role="group" aria-label="Filter by status">
        {(['crit', 'warn', 'info', 'ok'] as Status[]).map(s => (
          <button key={s} className={filter === s ? 'on' : ''} aria-pressed={filter === s} onClick={() => setFilter(f => (f === s ? 'all' : s))}>
            <div className="t"><span className="os-dot" style={{ background: STATUS[s].color }} />{STATUS[s].label.toUpperCase()}</div>
            <div className="n">{counts[s]}</div>
          </button>
        ))}
      </div>
      {filter !== 'all' && (
        <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Showing {STATUS[filter].label.toLowerCase()} only. <button className="btn sm" onClick={() => setFilter('all')}>Show all</button>
        </div>
      )}
      {groups.map(g => {
        const rows = shown.filter(i => i.group === g).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
        if (!rows.length) return null;
        const editable = g === 'Platform controls' ? 'platform' : g === 'Schools' ? 'schools' : null;
        return (
          <section className="card os-grp" key={g} aria-label={g}>
            <h3>
              {g}
              {editable && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => onOpen(editable)}>Change <ArrowRight size={13} weight="bold" /></button>}
            </h3>
            {/* Limits are reference, not status: the long list folds away unless it holds a problem. */}
            {(g === 'Limits and models' && !openLimits && rows.every(r => r.status === 'info') ? rows.slice(0, 1) : rows).map(i => <HealthRow key={i.id} i={i} />)}
            {g === 'Limits and models' && rows.length > 1 && rows.every(r => r.status === 'info') && (
              <div style={{ padding: '4px 0 14px' }}>
                <button className="btn sm" aria-expanded={openLimits} onClick={() => setOpenLimits(o => !o)}>
                  {openLimits ? 'Hide rate limits' : `Show all ${rows.length - 1} rate limits`}
                </button>
              </div>
            )}
          </section>
        );
      })}
      {!shown.length && <div className="card"><Empty icon={<Heartbeat size={26} weight="duotone" />} title="Nothing here">No setting is in this state.</Empty></div>}
    </>
  );
}

function HealthRow({ i }: { i: InventoryItem }) {
  const s = STATUS[i.status];
  return (
    <div className="os-item">
      <div className="lb">
        <span className="os-dot" style={{ background: s.color }} role="img" aria-label={s.label} />
        <span style={{ minWidth: 0 }}>{i.label}</span>
        <span className="src">{SOURCE_LABEL[i.source] ?? i.source}</span>
      </div>
      <div className="vl">{i.value}</div>
      <div className="dt">{i.detail}</div>
      {!!i.items?.length && <div className="os-list">{i.items.slice(0, 30).map(x => <span key={x}>{x}</span>)}{i.items.length > 30 && <span>+{i.items.length - 30} more</span>}</div>}
      {!!i.enforcedAt?.length && (
        <details className="os-enf">
          <summary>Enforced at <CaretDown size={11} weight="bold" /></summary>
          {i.enforcedAt.map(e => <code key={e}>{e}</code>)}
        </details>
      )}
    </div>
  );
}

// ── Platform controls ─────────────────────────────────────────────────────────

function PlatformView({ values, stored, onSaved }: { values: PlatformValues; stored: boolean; onSaved: (m: string) => void }) {
  const keys = Object.keys(PLATFORM_SETTINGS) as PlatformKey[];
  const groups = [...new Set(keys.map(k => PLATFORM_SETTINGS[k].group))];
  return (
    <>
      {!stored && (
        <div className="note err" style={{ marginBottom: 16 }} role="alert">
          The settings store isn&apos;t available, so the code defaults below are in force and changes can&apos;t be saved. Apply migration <span className="mono">ops_settings</span>.
        </div>
      )}
      <div className="note info" style={{ marginBottom: 16 }}>
        Changes apply on every server within 30 seconds. Each one needs a reason and is kept in the change log.
      </div>
      {groups.map(g => (
        <section className="card os-grp" key={g} aria-label={g}>
          <h3>{g}</h3>
          {keys.filter(k => PLATFORM_SETTINGS[k].group === g).map(k => (
            // Keyed on the stored value: a save remounts the control with fresh draft state.
            <PlatformSetting key={`${k}:${JSON.stringify(values[k])}`} k={k} value={values[k]} disabled={!stored} onSaved={onSaved} />
          ))}
        </section>
      ))}
    </>
  );
}

const show = (d: SettingDef, v: unknown) =>
  d.type === 'boolean' ? (v ? 'On' : 'Off')
    : d.type === 'enum' ? d.options.find(o => o.value === v)?.label ?? String(v)
    : d.type === 'integer' ? `${v}${'unit' in d && d.unit ? ` ${d.unit}` : ''}`
    : v ? `"${v}"` : 'Empty';

function PlatformSetting({ k, value, disabled, onSaved }: { k: PlatformKey; value: unknown; disabled: boolean; onSaved: (m: string) => void }) {
  const api = useOpsApi();
  const d: SettingDef = PLATFORM_SETTINGS[k];
  const [draft, setDraft] = useState<unknown>(value);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const norm = (v: unknown) => (d.type === 'integer' ? Number(v) : d.type === 'text' ? String(v ?? '').replace(/\s+/g, ' ').trim() : v);
  const dirty = norm(draft) !== norm(value);
  const risky = d.type === 'boolean' && 'danger' in d && ((d.danger === 'off' && draft === false) || (d.danger === 'on' && draft === true));
  const id = `ps-${k.replace('.', '-')}`;

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api('/settings', { method: 'PATCH', body: { key: k, value: norm(draft), reason } });
      onSaved(`${d.label} saved`);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  return (
    <div className="os-set">
      <div>
        <h4 id={`${id}-l`}>{d.label}</h4>
        <p>{d.help}</p>
      </div>
      <div>
        {d.type === 'boolean' ? (
          <div className="os-toggle">
            <button type="button" role="switch" className="swt" aria-checked={!!draft} aria-labelledby={`${id}-l`} disabled={disabled}
              onClick={() => setDraft(!draft)} />
            {draft ? 'On' : 'Off'}
          </div>
        ) : d.type === 'integer' ? (
          <input className="cmp-in" type="number" inputMode="numeric" min={d.min} max={d.max} aria-labelledby={`${id}-l`} disabled={disabled}
            value={String(draft ?? '')} onChange={e => setDraft(e.target.value)} />
        ) : d.type === 'enum' ? (
          <select className="cmp-sel" aria-labelledby={`${id}-l`} disabled={disabled} value={String(draft)} onChange={e => setDraft(e.target.value)}>
            {d.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <textarea className="cmp-in" rows={2} maxLength={d.maxLength} aria-labelledby={`${id}-l`} disabled={disabled}
            placeholder="No notice" value={String(draft ?? '')} onChange={e => setDraft(e.target.value)} />
        )}
        {d.type === 'text' && <div className="muted" style={{ fontSize: 11.5, marginTop: 4, textAlign: 'right' }}>{String(draft ?? '').length} / {d.maxLength}</div>}
      </div>
      {dirty && (
        <div className="os-review">
          <div className="os-diff"><s>{show(d, value)}</s><ArrowRight size={14} weight="bold" aria-label="to" /><span>{show(d, norm(draft))}</span></div>
          {risky && (
            <div className="os-danger">
              <WarningOctagon size={20} weight="fill" color="#E11D48" style={{ flex: '0 0 auto' }} />
              <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                {k === 'ai.enabled' ? 'Every AI feature stops for every school: tutor sessions, grading, generators and the copilot return a "paused" message.'
                  : 'Anyone on the internet can create a school and an admin login, with a trial, without an operator.'}
              </div>
            </div>
          )}
          <label className="lbl" htmlFor={`${id}-r`} style={{ marginBottom: 0 }}>REASON (KEPT IN THE CHANGE LOG)</label>
          <input id={`${id}-r`} className="cmp-in" value={reason} maxLength={500} onChange={e => setReason(e.target.value)}
            placeholder="e.g. Gemini outage, pausing until resolved" />
          {err && <div className="note err" role="alert">{err}</div>}
          <div className="acts">
            <button className={`btn ${risky ? 'red' : 'pri'}`} disabled={busy || reason.trim().length < REASON_MIN} onClick={save}>{busy ? 'Saving…' : 'Save change'}</button>
            <button className="btn" onClick={() => { setDraft(value); setReason(''); setErr(null); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Schools ───────────────────────────────────────────────────────────────────

function SchoolsView({ schools, focus, setFocus, onSaved }: {
  schools: SchoolFacts[]; focus: string | null; setFocus: (id: string | null) => void; onSaved: (m: string) => void;
}) {
  const [q, setQ] = useState('');
  const shown = schools.filter(s => !q.trim() || `${s.name} ${s.code ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input className="cmp-in" style={{ flex: 1, minWidth: 200 }} placeholder="Find a school by name or code" aria-label="Find a school"
          value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="card" style={{ padding: '6px 22px' }}>
        {!shown.length ? (
          <Empty icon={<Buildings size={26} weight="duotone" />} title={schools.length ? 'No match' : 'No schools yet'}>
            {schools.length ? 'Try another name or code.' : 'Create a school from the Schools page first.'}
          </Empty>
        ) : shown.map(s => (
          <div key={s.id}>
            <button className="os-school" aria-expanded={focus === s.id} onClick={() => setFocus(focus === s.id ? null : s.id)}>
              <div className="av"><Buildings size={19} weight="duotone" /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{s.name}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  <span className="mono">{s.code ?? 'no code'}</span> · {s.people} accounts{s.testSchool ? ' · test school' : ''}
                </div>
              </div>
              <div className="chips">
                {!s.active ? <Chip tone="r">SUSPENDED</Chip> : s.trialExpired ? <Chip tone="r">TRIAL ENDED</Chip> : null}
                <Chip tone={s.plan === 'trial' ? 'a' : 'g'}>{s.plan.toUpperCase()}</Chip>
                {s.plan === 'trial' && s.trialDaysLeft !== null && !s.trialExpired && <Chip tone={s.trialDaysLeft <= 7 ? 'a' : 'n'}>{s.trialDaysLeft} DAYS LEFT</Chip>}
                {!s.aiEnabled && <Chip tone="n">AI OFF</Chip>}
              </div>
              <CaretDown size={16} weight="bold" style={{ flex: '0 0 auto', transform: focus === s.id ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
            </button>
            {focus === s.id && <SchoolEditor key={`${s.id}:${s.updatedAt}`} s={s} onSaved={onSaved} />}
          </div>
        ))}
      </div>
    </>
  );
}

interface Access { changed: number; skipped: number; failed: { id: string; error: string }[] }
interface Draft { name: string; code: string; plan: string; trialEndsAt: string; active: boolean; aiEnabled: boolean; curriculum: string; institutionType: string }
const draftOf = (s: SchoolFacts): Draft => ({
  name: s.name, code: s.code ?? '', plan: s.plan, trialEndsAt: dayIST(s.trialEndsAt), active: s.active, aiEnabled: s.aiEnabled,
  curriculum: s.curriculum ?? '', institutionType: s.institutionType,
});
const fieldText = (k: keyof SchoolPatch, v: unknown) =>
  k === 'active' ? (v ? 'Active' : 'Suspended') : k === 'aiEnabled' ? (v ? 'On' : 'Off') : k === 'trialEndsAt' ? (v ? humanDay(`${v}T12:00:00+05:30`) : 'None') : k === 'plan' ? String(v).toUpperCase() : String(v || 'None');

function SchoolEditor({ s, onSaved }: { s: SchoolFacts; onSaved: (m: string) => void }) {
  const api = useOpsApi();
  const base = useMemo(() => draftOf(s), [s]);
  const [d, setD] = useState<Draft>(base);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'save' | 'sync' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => ({ ...x, [k]: v }));
  const changes = (Object.keys(d) as (keyof Draft)[]).filter(k => {
    if (k === 'trialEndsAt' && d.plan !== 'trial') return false;
    if (k === 'curriculum' && !d.curriculum) return false;
    return (k === 'code' ? d.code.toUpperCase() : d[k]) !== base[k];
  });
  const suspending = base.active && !d.active;
  const reactivating = !base.active && d.active;

  const describe = (a: Access | null) => a
    ? ` Sign-in: ${a.changed} login${a.changed === 1 ? '' : 's'} ${d.active ? 'unlocked' : 'locked'}${a.failed.length ? `, ${a.failed.length} failed (use "Re-apply sign-in lock")` : ''}.`
    : '';

  const save = async () => {
    setBusy('save'); setErr(null); setResult(null);
    const body: Record<string, unknown> = {};
    for (const k of changes) body[k] = k === 'code' ? d.code.toUpperCase() : d[k];
    if (changes.includes('plan') && d.plan === 'trial' && !changes.includes('trialEndsAt')) body.trialEndsAt = d.trialEndsAt;
    try {
      const r = await api<{ access: Access | null }>(`/schools/${s.id}/settings`, { method: 'PATCH', body: { changes: body, reason, expectedUpdatedAt: s.updatedAt } });
      // The editor remounts with the saved row; the toast carries the outcome.
      onSaved(`${s.name}: ${changes.length} change${changes.length === 1 ? '' : 's'} saved.${describe(r.access)}`);
    } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  const sync = async () => {
    setBusy('sync'); setErr(null); setResult(null);
    try {
      const r = await api<{ access: Access | null }>(`/schools/${s.id}/settings`, { method: 'PATCH', body: { sync: true, reason: 'Re-apply sign-in access for current status' } });
      setResult(`Sign-in access re-applied.${describe(r.access)}`);
    } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };

  const f = (k: string) => `se-${s.id.slice(0, 8)}-${k}`;
  return (
    <div className="os-edit">
      <div className="os-fields">
        <div>
          <label className="lbl" htmlFor={f('name')}>SCHOOL NAME</label>
          <input id={f('name')} className="cmp-in" maxLength={120} value={d.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor={f('code')}>SIGN-IN CODE</label>
          <input id={f('code')} className="cmp-in mono" maxLength={12} value={d.code} autoCapitalize="characters"
            onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} />
        </div>
        <div>
          <label className="lbl" htmlFor={f('plan')}>PLAN</label>
          <select id={f('plan')} className="cmp-sel" value={d.plan} onChange={e => set('plan', e.target.value)}>
            {PLANS.map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
        {d.plan === 'trial' && (
          <div>
            <label className="lbl" htmlFor={f('trial')}>TRIAL ENDS (END OF DAY, IST)</label>
            <input id={f('trial')} className="cmp-in" type="date" value={d.trialEndsAt} onChange={e => set('trialEndsAt', e.target.value)} />
          </div>
        )}
        <div>
          <label className="lbl" htmlFor={f('cur')}>CURRICULUM</label>
          <select id={f('cur')} className="cmp-sel" value={d.curriculum} onChange={e => set('curriculum', e.target.value)}>
            {!d.curriculum && <option value="">Not set</option>}
            {CURRICULA.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor={f('type')}>INSTITUTION TYPE</label>
          <select id={f('type')} className="cmp-sel" value={d.institutionType} onChange={e => set('institutionType', e.target.value)}>
            <option value="school">School</option>
            <option value="college">College</option>
          </select>
        </div>
        <div>
          <span className="lbl" id={f('ai')}>AI FEATURES FOR THIS SCHOOL</span>
          <div className="os-toggle">
            <button type="button" role="switch" className="swt" aria-checked={d.aiEnabled} aria-labelledby={f('ai')} onClick={() => set('aiEnabled', !d.aiEnabled)} />
            {d.aiEnabled ? 'On' : 'Off'}
          </div>
        </div>
        <div>
          <span className="lbl" id={f('st')}>ACCOUNT STATUS</span>
          <div className="os-toggle">
            <button type="button" role="switch" className="swt" aria-checked={d.active} aria-labelledby={f('st')} onClick={() => set('active', !d.active)} />
            {d.active ? 'Active' : 'Suspended'}
          </div>
        </div>
        {!base.active && s.suspension && (
          <div className="full muted" style={{ fontSize: 12.5 }}>
            Suspended {s.suspension.at ? humanDay(s.suspension.at) : ''}{s.suspension.reason ? `: ${s.suspension.reason}` : ''}.
          </div>
        )}
      </div>

      {(suspending || reactivating) && (
        <div className="os-danger" style={{ marginTop: 14 }}>
          <Lock size={20} weight="fill" color="#E11D48" style={{ flex: '0 0 auto' }} />
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>
            {suspending
              ? <>All {s.people} accounts at {s.name} are locked out: the code is refused at sign-in, their logins are banned in Supabase Auth (open sessions can&apos;t refresh), and every API call and portal page is blocked. Data is kept. Reactivating lifts it.</>
              : <>Reactivating unlocks sign-in for {s.name}&apos;s accounts and lifts the bans the suspension added.</>}
          </div>
        </div>
      )}

      {changes.length > 0 && (
        <div className="os-review" style={{ marginTop: 14 }}>
          {changes.map(k => (
            <div className="os-diff" key={k}>
              <span className="muted" style={{ minWidth: 120 }}>{SCHOOL_FIELD_LABELS[k as keyof SchoolPatch]}</span>
              <s>{fieldText(k as keyof SchoolPatch, base[k])}</s><ArrowRight size={14} weight="bold" aria-label="to" />
              <span>{fieldText(k as keyof SchoolPatch, k === 'code' ? d.code.toUpperCase() : d[k])}</span>
            </div>
          ))}
          <label className="lbl" htmlFor={f('why')} style={{ marginBottom: 0 }}>REASON (KEPT IN THE CHANGE LOG)</label>
          <input id={f('why')} className="cmp-in" maxLength={500} value={reason} onChange={e => setReason(e.target.value)}
            placeholder={suspending ? 'e.g. Unpaid invoice INV-0042, 30 days overdue' : 'e.g. Signed annual contract, moving to Standard'} />
          <div className="acts">
            <button className={`btn ${suspending ? 'red' : 'pri'}`} disabled={!!busy || reason.trim().length < REASON_MIN} onClick={save}>
              {busy === 'save' ? (suspending ? 'Suspending…' : 'Saving…') : suspending ? 'Suspend school' : `Save ${changes.length} change${changes.length === 1 ? '' : 's'}`}
            </button>
            <button className="btn" onClick={() => { setD(base); setReason(''); }}>Discard</button>
          </div>
        </div>
      )}

      {err && <div className="note err" style={{ marginTop: 12 }} role="alert">{err}</div>}
      {result && <div className="note info" style={{ marginTop: 12 }} role="status">{result}</div>}

      <div className="acts" style={{ marginTop: 14 }}>
        <Link className="btn sm" href={`/ops/${s.id}`}>Classes and people <ArrowRight size={13} weight="bold" /></Link>
        {!base.active && <button className="btn sm" disabled={!!busy} onClick={sync}>{busy === 'sync' ? 'Applying…' : 'Re-apply sign-in lock'}</button>}
      </div>
    </div>
  );
}

// ── Change log ────────────────────────────────────────────────────────────────

function JournalView({ rows, schools }: { rows: JournalRow[] | null; schools: SchoolFacts[] }) {
  const [scope, setScope] = useState('all');
  const name = (id: string | null) => schools.find(s => s.id === id)?.name ?? 'Deleted school';
  if (!rows) {
    return <div className="note err" role="alert">The change log isn&apos;t available. Apply migration <span className="mono">ops_settings</span>.</div>;
  }
  const shown = rows.filter(r => scope === 'all' || (scope === 'platform' ? r.scope === 'platform' : r.school_id === scope));
  const label = (r: JournalRow) => r.scope === 'platform'
    ? PLATFORM_SETTINGS[r.key as PlatformKey]?.label ?? r.key
    : SCHOOL_FIELD_LABELS[r.key as keyof SchoolPatch] ?? r.key;
  const val = (r: JournalRow, v: unknown) => {
    if (v === null || v === undefined) return r.scope === 'platform' ? 'Default' : 'None';
    if (typeof v === 'boolean') return v ? 'On' : 'Off';
    if (r.key === 'trialEndsAt' && typeof v === 'string') return humanDay(v);
    return typeof v === 'string' ? (v || 'Empty') : JSON.stringify(v);
  };
  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <select className="cmp-sel" style={{ maxWidth: 320 }} aria-label="Filter the change log" value={scope} onChange={e => setScope(e.target.value)}>
          <option value="all">All changes</option>
          <option value="platform">Platform controls</option>
          {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="card" style={{ padding: '6px 22px' }}>
        {!shown.length ? (
          <Empty icon={<ClockCounterClockwise size={26} weight="duotone" />} title="No changes yet">Every change made in Platform or Schools is recorded here with who made it and why.</Empty>
        ) : shown.map(r => (
          <div className="os-log" key={r.id}>
            <div className="when">{when(r.at)}<div style={{ marginTop: 2, overflowWrap: 'anywhere' }}>{r.actor_email ?? 'Unknown operator'}</div></div>
            <div>
              <div className="what">
                {r.scope === 'platform' ? 'Platform' : name(r.school_id)} · {label(r)}
              </div>
              <div className="os-diff" style={{ fontWeight: 600, marginTop: 4 }}>
                <s>{val(r, r.old_value)}</s><ArrowRight size={13} weight="bold" aria-label="to" /><span>{val(r, r.new_value)}</span>
              </div>
            </div>
            <div className="why">{r.reason}</div>
          </div>
        ))}
      </div>
    </>
  );
}
