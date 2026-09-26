'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { WarningOctagonIcon as WarningOctagon } from '@phosphor-icons/react/dist/ssr/WarningOctagon';
import { Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { PLATFORM_SETTINGS, REASON_MIN, type PlatformKey, type PlatformValues, type SettingDef } from '@/lib/settings/registry';
import { Section, Table, errText, fmtDateTime } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface JournalRow { id: number; at: string; actor_email: string | null; scope: 'platform' | 'school'; school_id: string | null; key: string; old_value: unknown; new_value: unknown; reason: string }
interface Data { platform: PlatformValues; platformStored: boolean; journal: JournalRow[] | null; checkedAt: string }

/** Platform Manager > Platform settings: the switches that apply to every school, and their history. */
export default function SettingsConsole() {
  const api = useOpsApi();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
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

  const history = (data?.journal ?? []).filter(j => j.scope === 'platform');
  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Platform settings"
        sub="Switches that apply to every school at once. Per-school tier, pilot, AI and suspension live on each school's Subscription & access tab."
        actions={<>
          <Link className="btn" href="/ops/health">System health <ArrowRight size={14} weight="bold" /></Link>
          <button className="btn" onClick={reload} disabled={loading}><ArrowsClockwise size={15} weight="bold" /> {loading ? 'Loading…' : 'Reload'}</button>
        </>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {!data ? (err ? null : <div>{[0, 1].map(i => <div className="card" key={i} style={{ marginBottom: 14 }}><Skeleton h={18} w="40%" /><Skeleton h={54} style={{ marginTop: 14 }} /></div>)}</div>) : (
        <>
          <PlatformView values={data.platform} stored={data.platformStored} onSaved={m => { toast(m); reload(); }} />
          <Section title="History" sub="Every platform-wide change, with who made it and why.">
            {!data.journal ? <div className="note err" role="alert">The change log isn&apos;t available. Apply migration <span className="mono">ops_settings</span>.</div>
              : !history.length ? <Empty icon={<ClockCounterClockwise size={26} weight="duotone" />} title="No platform changes yet" /> : (
                <Table head={<tr><th>When</th><th>Setting</th><th>Change</th><th>Reason</th><th>By</th></tr>}>
                  {history.map(r => {
                    const d = PLATFORM_SETTINGS[r.key as PlatformKey] as SettingDef | undefined;
                    return (
                      <tr key={r.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.at)}</td>
                        <td className="nm">{d?.label ?? r.key}</td>
                        <td><span className="muted">{d ? show(d, r.old_value ?? d.default) : String(r.old_value)}</span> → <b>{d ? show(d, r.new_value) : String(r.new_value)}</b></td>
                        <td>{r.reason}</td>
                        <td className="muted" style={{ overflowWrap: 'anywhere' }}>{r.actor_email ?? '—'}</td>
                      </tr>
                    );
                  })}
                </Table>
              )}
          </Section>
        </>
      )}
      {toastEl}
    </>
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

