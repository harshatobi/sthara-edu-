'use client';

import { useCallback, useEffect, useState } from 'react';
import { PaperPlaneTiltIcon as PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { SINCE, type Since } from '@/lib/debug/route';
import { Kpi, Section, Table, errText, fmtDateTime, num } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface AiStat { feature: string; label: string; calls: number; failed: number; rateLimited: number; p50: number | null; p95: number | null }
interface AiFailure { id: number; at: string; label: string; model: string; schoolId: string | null; latencyMs: number | null; error: string | null; rateLimited: boolean }
interface WaRow { id: string; at: string; direction: string; kind: string; status: string; error: string | null; schoolId: string | null; phoneTail: string; canResend: boolean }
interface CronRun { status: string; started: string; ended: string | null; message: string | null }
interface AppRun { id: number; started_at: string; finished_at: string | null; ok: boolean | null; detail: Record<string, unknown>; triggered_by: string }
interface Data {
  since: Since; schools: Record<string, string>; canManage: boolean;
  ai: { calls: number; failed: number; rateLimited: number; capped: boolean; stats: AiStat[]; failures: AiFailure[] };
  whatsapp: { mode: 'live' | 'simulated'; byStatus: { key: string; n: number }[]; rows: WaRow[] } | null;
  inApp: { notifications: { type: string; n: number; unread: number }[]; notificationsCapped: boolean; reminders: { key: string; n: number }[] };
  jobs: {
    scheduler: { id: number; name: string; schedule: string; active: boolean; command: string; runs: CronRun[] }[] | null;
    app: { key: string; label: string; note: string; schedule: string; runs: AppRun[] }[];
  };
  platform: { release: string | null; branch: string | null; environment: string | null; region: string | null; migrations: { version: string; name: string }[] | null };
}

const TABS = [['ai', 'AI calls'], ['whatsapp', 'WhatsApp'], ['inapp', 'In-app'], ['jobs', 'Jobs'], ['platform', 'Release']] as const;
type Tab = (typeof TABS)[number][0];
const SINCE_LABEL: Record<Since, string> = { '15m': 'Last 15 minutes', '1h': 'Last hour', '6h': 'Last 6 hours', '24h': 'Last 24 hours', '7d': 'Last 7 days' };
const WA_TONE: Record<string, Tone> = { sent: 'g', received: 'b', simulated: 'n', failed: 'r', ignored: 'a' };
const ms = (n: number | null) => (n === null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

/** Platform Manager > Delivery and jobs: what the platform sent and ran, and what failed. */
export default function DeliveryConsole() {
  const api = useOpsApi();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('ai');
  const [since, setSince] = useState<Since>('24h');
  const [school, setSchool] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Data>(`/delivery?since=${since}${school ? `&school=${school}` : ''}`).then(x => { setD(x); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api, since, school]);
  useEffect(() => { load(); }, [load]);
  const act = async (key: string, body: Record<string, unknown>, done: (r: { ok: boolean; status?: string; error?: string | null; run?: AppRun }) => string) => {
    setBusy(key); setErr(null); setNotice(null);
    try { setNotice(done(await api('/delivery', { method: 'POST', body }))); load(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  const schoolName = (id: string | null) => (id ? d?.schools[id] ?? 'Deleted school' : '—');
  const waFailed = d?.whatsapp?.byStatus.find(s => s.key === 'out:failed')?.n ?? 0;
  const cronFailed = (d?.jobs.scheduler ?? []).filter(j => j.runs[0] && j.runs[0].status !== 'succeeded').length;

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Delivery and jobs" sub="AI calls, WhatsApp, in-app notifications, scheduled jobs and the running release. Message text and prompts are never shown here." />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {notice && <div className="note info" style={{ marginBottom: 18 }} role="status">{notice}</div>}

      <div className="ops-filters">
        <select className="cmp-sel" style={{ width: 'auto' }} aria-label="Period" value={since} onChange={e => setSince(e.target.value as Since)}>
          {(Object.keys(SINCE) as Since[]).map(s => <option key={s} value={s}>{SINCE_LABEL[s]}</option>)}
        </select>
        <select className="cmp-sel" style={{ width: 'auto', maxWidth: 320 }} aria-label="School" value={school} onChange={e => setSchool(e.target.value)}>
          <option value="">Every school</option>
          {Object.entries(d?.schools ?? {}).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      {!d ? <div className="card"><Skeleton h={180} /></div> : (
        <>
          <div className="kpis" style={{ marginBottom: 18 }}>
            <Kpi label="AI calls" value={num(d.ai.calls)} note={`${num(d.ai.failed)} failed (${pct(d.ai.failed, d.ai.calls)})`} tone={d.ai.failed ? 'a' : undefined} onClick={() => setTab('ai')} />
            <Kpi label="AI rate-limited" value={num(d.ai.rateLimited)} note="The provider refused for quota or rate" tone={d.ai.rateLimited ? 'r' : 'g'} onClick={() => setTab('ai')} />
            <Kpi label="WhatsApp failed" value={num(waFailed)} note={d.whatsapp ? (d.whatsapp.mode === 'live' ? 'Sending for real' : 'Simulated: logged, not sent') : 'Log unavailable'} tone={waFailed ? 'r' : undefined} onClick={() => setTab('whatsapp')} />
            <Kpi label="Jobs failing" value={num(cronFailed)} note={`${num((d.jobs.scheduler ?? []).length)} scheduled`} tone={cronFailed ? 'r' : 'g'} onClick={() => setTab('jobs')} />
          </div>
          <div className="seg" role="tablist" aria-label="Section" style={{ marginBottom: 18 }}>
            {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
          </div>

          {tab === 'ai' && (
            <>
              <Section title="By feature" sub={`Latency is for calls that succeeded.${d.ai.capped ? ' Showing the latest 10,000 calls only.' : ''}`}>
                <Table head={<tr><th>Feature</th><th className="r">Calls</th><th className="r">Failed</th><th className="r">Failure rate</th><th className="r">Rate-limited</th><th className="r">Typical</th><th className="r">Slowest 5%</th></tr>}
                  empty={!d.ai.stats.length && <Empty icon={<PaperPlaneTilt size={28} weight="duotone" />} title="No AI calls in this period" />}>
                  {d.ai.stats.map(s => (
                    <tr key={s.feature}>
                      <td className="nm">{s.label}</td>
                      <td className="r">{num(s.calls)}</td>
                      <td className="r" style={s.failed ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{num(s.failed)}</td>
                      <td className="r">{pct(s.failed, s.calls)}</td>
                      <td className="r">{num(s.rateLimited)}</td>
                      <td className="r">{ms(s.p50)}</td>
                      <td className="r">{ms(s.p95)}</td>
                    </tr>
                  ))}
                </Table>
              </Section>
              <Section title="Latest failures" sub="The provider's own error text. Prompts and answers are not stored.">
                <Table head={<tr><th>When</th><th>Feature</th><th>School</th><th>Model</th><th className="r">After</th><th>Error</th></tr>}
                  empty={!d.ai.failures.length && <p className="muted" style={{ fontSize: 13.5, padding: '8px 0' }}>No failed calls in this period.</p>}>
                  {d.ai.failures.map(f => (
                    <tr key={f.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(f.at)}</td>
                      <td>{f.label}{f.rateLimited && <> <Chip tone="r">RATE LIMIT</Chip></>}</td>
                      <td>{schoolName(f.schoolId)}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{f.model}</td>
                      <td className="r">{ms(f.latencyMs)}</td>
                      <td style={{ fontSize: 12.5, maxWidth: 420, overflowWrap: 'anywhere' }}>{f.error ?? 'No error text recorded'}</td>
                    </tr>
                  ))}
                </Table>
              </Section>
            </>
          )}

          {tab === 'whatsapp' && (d.whatsapp ? (
            <Section title="WhatsApp log" sub={d.whatsapp.mode === 'live' ? 'Messages go out through the WhatsApp Business API.' : 'The channel is simulated: messages are logged but not sent, because no WhatsApp credentials are configured on this server.'}>
              <div className="acts" style={{ marginBottom: 14 }}>
                {d.whatsapp.byStatus.map(s => <Chip key={s.key} tone={WA_TONE[s.key.split(':')[1]] ?? 'n'}>{s.key.replace('out:', 'OUT ').replace('in:', 'IN ').toUpperCase()} · {num(s.n)}</Chip>)}
              </div>
              <Table head={<tr><th>When</th><th>Direction</th><th>Kind</th><th>Status</th><th>School</th><th>Number</th><th>Error</th>{d.canManage && <th aria-label="Actions" />}</tr>}
                empty={!d.whatsapp.rows.length && <Empty icon={<PaperPlaneTilt size={28} weight="duotone" />} title="No WhatsApp messages in this period" />}>
                {d.whatsapp.rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.at)}</td>
                    <td>{r.direction === 'out' ? 'Out' : 'In'}</td>
                    <td>{r.kind}</td>
                    <td><Chip tone={WA_TONE[r.status] ?? 'n'}>{r.status.toUpperCase()}</Chip></td>
                    <td>{schoolName(r.schoolId)}</td>
                    <td className="mono" style={{ fontSize: 12 }}>…{r.phoneTail}</td>
                    <td style={{ fontSize: 12.5, maxWidth: 360, overflowWrap: 'anywhere' }}>{r.error ?? ''}</td>
                    {d.canManage && <td>{r.canResend && <button className="btn sm" disabled={busy === r.id}
                      onClick={() => act(r.id, { action: 'resend', id: r.id }, x => (x.ok ? `Message sent again (${x.status}).` : `Still failing: ${x.error ?? 'unknown error'}`))}>{busy === r.id ? 'Sending…' : 'Send again'}</button>}</td>}
                  </tr>
                ))}
              </Table>
            </Section>
          ) : <div className="note err">The WhatsApp log isn&apos;t available on this database.</div>)}

          {tab === 'inapp' && (
            <div className="g2">
              <Section title="In-app notifications" sub={`Written straight to each person's inbox, so there is no delivery to fail: what matters is whether they are read.${d.inApp.notificationsCapped ? ' Showing the first 20,000.' : ''}`}>
                <Table head={<tr><th>Kind</th><th className="r">Sent</th><th className="r">Unread</th><th className="r">Unread share</th></tr>}
                  empty={!d.inApp.notifications.length && <p className="muted" style={{ fontSize: 13.5, padding: '8px 0' }}>None in this period.</p>}>
                  {d.inApp.notifications.map(n => <tr key={n.type}><td className="nm">{n.type}</td><td className="r">{num(n.n)}</td><td className="r">{num(n.unread)}</td><td className="r">{pct(n.unread, n.n)}</td></tr>)}
                </Table>
              </Section>
              <Section title="Fee reminders" sub="Reminders schools sent to families, by channel.">
                <Table head={<tr><th>Channel</th><th className="r">Reminders</th></tr>}
                  empty={!d.inApp.reminders.length && <p className="muted" style={{ fontSize: 13.5, padding: '8px 0' }}>None in this period.</p>}>
                  {d.inApp.reminders.map(r => <tr key={r.key}><td className="nm">{r.key}</td><td className="r">{num(r.n)}</td></tr>)}
                </Table>
              </Section>
            </div>
          )}

          {tab === 'jobs' && (
            <>
              <Section title="Database scheduler" sub="Jobs the database runs on its own clock (times are UTC in the schedule). The last 20 runs of each are kept here.">
                {d.jobs.scheduler === null ? <div className="note err">The job list isn&apos;t available: the ops_debug migration is missing from the database.</div> : (
                  <Table head={<tr><th>Job</th><th>Schedule</th><th>Last run</th><th>Took</th><th>Result</th><th className="r">Failed of last 20</th></tr>}
                    empty={!d.jobs.scheduler.length && <p className="muted" style={{ fontSize: 13.5, padding: '8px 0' }}>Nothing is scheduled.</p>}>
                    {d.jobs.scheduler.map(j => {
                      const last = j.runs[0];
                      const failed = j.runs.filter(r => r.status !== 'succeeded').length;
                      return (
                        <tr key={j.id}>
                          <td><div className="nm">{j.name}{!j.active && <> <Chip tone="n">PAUSED</Chip></>}</div><div className="sub mono" style={{ overflowWrap: 'anywhere' }}>{j.command}</div></td>
                          <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{j.schedule}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{last ? fmtDateTime(last.started) : 'Not yet'}</td>
                          <td>{last?.ended ? ms(Date.parse(last.ended) - Date.parse(last.started)) : '—'}</td>
                          <td>{last ? <><Chip tone={last.status === 'succeeded' ? 'g' : 'r'}>{last.status.toUpperCase()}</Chip>{last.status !== 'succeeded' && last.message && <div className="sub" style={{ overflowWrap: 'anywhere', maxWidth: 320 }}>{last.message}</div>}</> : '—'}</td>
                          <td className="r" style={failed ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{num(failed)}</td>
                        </tr>
                      );
                    })}
                  </Table>
                )}
              </Section>
              <Section title="App jobs" sub="Work the app does itself. Each is safe to repeat, so it can be run by hand.">
                {d.jobs.app.map(j => (
                  <div key={j.key} style={{ marginBottom: 8 }}>
                    <div className="ops-sec-hd" style={{ marginBottom: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="nm">{j.label}</div>
                        <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>{j.note}</p>
                        <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Schedule: {j.schedule}.</p>
                      </div>
                      {d.canManage && <button className="btn sm pri" style={{ marginLeft: 'auto' }} disabled={busy === j.key}
                        onClick={() => act(j.key, { action: 'run', job: j.key }, x => (x.ok ? `${j.label} ran: ${JSON.stringify(x.run?.detail ?? {})}` : `${j.label} failed: ${JSON.stringify(x.run?.detail ?? {})}`))}>{busy === j.key ? 'Running…' : 'Run now'}</button>}
                    </div>
                    <Table head={<tr><th>Started</th><th>Took</th><th>Result</th><th>Started by</th><th>Detail</th></tr>}
                      empty={!j.runs.length && <p className="muted" style={{ fontSize: 13.5, padding: '8px 0' }}>No recorded runs yet.</p>}>
                      {j.runs.map(r => (
                        <tr key={r.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.started_at)}</td>
                          <td>{r.finished_at ? ms(Date.parse(r.finished_at) - Date.parse(r.started_at)) : '—'}</td>
                          <td><Chip tone={r.ok ? 'g' : 'r'}>{r.ok ? 'OK' : 'FAILED'}</Chip></td>
                          <td style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{r.triggered_by.replace(/^operator:/, '')}</td>
                          <td className="mono" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{JSON.stringify(r.detail)}</td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                ))}
              </Section>
            </>
          )}

          {tab === 'platform' && (
            <div className="g2">
              <Section title="Running release" sub="What this server is running right now.">
                <dl className="ops-facts">
                  <div><dt>Commit</dt><dd className="mono">{d.platform.release ?? 'Not a Vercel build'}</dd></div>
                  <div><dt>Branch</dt><dd>{d.platform.branch ?? '—'}</dd></div>
                  <div><dt>Environment</dt><dd>{d.platform.environment ?? '—'}</dd></div>
                  <div><dt>Region</dt><dd>{d.platform.region ?? '—'}</dd></div>
                </dl>
              </Section>
              <Section title="Database migrations" sub="The latest 25 applied to this database, newest first. Compare the top of this list with the newest file in supabase/migrations.">
                {d.platform.migrations === null ? <div className="note err">Not available on this database.</div> : (
                  <Table head={<tr><th>Applied (UTC stamp)</th><th>Migration</th></tr>}>
                    {d.platform.migrations.map(m => <tr key={m.version}><td className="mono" style={{ fontSize: 12 }}>{m.version}</td><td className="nm">{m.name}</td></tr>)}
                  </Table>
                )}
              </Section>
            </div>
          )}
        </>
      )}
    </>
  );
}
