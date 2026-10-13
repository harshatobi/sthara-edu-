'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PulseIcon as Pulse } from '@phosphor-icons/react/dist/ssr/Pulse';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { SINCE, speed, type Since } from '@/lib/debug/route';
import { Section, Table, errText, fmtDateTime, num } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface Row {
  id: number; at: string; method: string; route: string; userId: string | null; role: string | null; schoolId: string | null; ms: number; release: string | null;
  ai: { feature: string; label: string; ok: boolean; ms: number | null; error: string | null }[];
  errors: { fingerprint: string; message: string }[];
}
interface Stat { method: string; route: string; n: number; p50: number; p95: number; max: number; users: number }
interface Data { since: Since; recording: boolean; capped: boolean; schools: Record<string, string>; rows: Row[]; stats: Stat[] }

const SINCE_LABEL: Record<Since, string> = { '15m': 'Last 15 minutes', '1h': 'Last hour', '6h': 'Last 6 hours', '24h': 'Last 24 hours', '7d': 'Last 7 days' };
const dur = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);
const tone = (n: number) => ({ fast: undefined, slow: '#B45309', very_slow: 'var(--red)' })[speed(n)];
const timeIST = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' });

/** Platform Manager > Request explorer: who called what, how long it took, and what happened inside. */
export default function TrafficConsole() {
  const api = useOpsApi();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<'requests' | 'routes'>('requests');
  const [f, setF] = useState({ since: '1h' as Since, school: '', user: '', route: '', minMs: '' });
  const [applied, setApplied] = useState(f);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams({ since: applied.since });
    if (applied.school) p.set('school', applied.school);
    if (applied.user.trim()) p.set('user', applied.user.trim());
    if (applied.route.trim()) p.set('route', applied.route.trim());
    if (Number(applied.minMs) > 0) p.set('minMs', String(Number(applied.minMs)));
    api<Data>(`/traffic?${p}`).then(x => { setD(x); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api, applied]);
  useEffect(() => { load(); }, [load]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  const filterTo = (patch: Partial<typeof f>) => { const next = { ...f, ...patch }; setF(next); setApplied(next); setView('requests'); };
  const schoolName = (id: string | null) => (id ? d?.schools[id] ?? 'Deleted school' : 'Sthara');

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Request explorer"
        sub="Every signed-in API request for the last seven days: the route, who called it (role and id, never a name), how long it took, and the AI calls and errors inside it. Queries and request bodies are not recorded." />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {d && !d.recording && <div className="note" style={{ marginBottom: 18 }}>Recording is off (Platform settings &gt; Request log), so nothing new appears here.</div>}

      <form className="ops-filters" onSubmit={e => { e.preventDefault(); setApplied(f); }}>
        <select className="cmp-sel" style={{ width: 'auto' }} aria-label="Period" value={f.since} onChange={e => filterTo({ since: e.target.value as Since })}>
          {(Object.keys(SINCE) as Since[]).map(s => <option key={s} value={s}>{SINCE_LABEL[s]}</option>)}
        </select>
        <select className="cmp-sel" style={{ width: 'auto', maxWidth: 260 }} aria-label="School" value={f.school} onChange={e => filterTo({ school: e.target.value })}>
          <option value="">Every school</option>
          {Object.entries(d?.schools ?? {}).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <input className="cmp-in" style={{ flex: '1 1 200px', width: 'auto' }} aria-label="User id or email" placeholder="User id or full email" value={f.user} onChange={e => set('user', e.target.value)} />
        <input className="cmp-in" style={{ flex: '1 1 180px', width: 'auto' }} aria-label="Route contains" placeholder="Route contains, e.g. /tutor" value={f.route} onChange={e => set('route', e.target.value)} />
        <input className="cmp-in" type="number" min={0} style={{ width: 150 }} aria-label="Slower than (ms)" placeholder="Slower than (ms)" value={f.minMs} onChange={e => set('minMs', e.target.value)} />
        <button className="btn pri">Apply</button>
      </form>

      <div className="seg" role="tablist" aria-label="View" style={{ marginBottom: 18 }}>
        <button role="tab" aria-selected={view === 'requests'} className={view === 'requests' ? 'on' : ''} onClick={() => setView('requests')}>Requests</button>
        <button role="tab" aria-selected={view === 'routes'} className={view === 'routes' ? 'on' : ''} onClick={() => setView('routes')}>Routes</button>
      </div>

      {!d ? <div className="card"><Skeleton h={200} /></div> : view === 'requests' ? (
        <Section title="Requests" sub={`Newest first.${d.capped ? ' Showing the latest 300 that match: narrow the filters to see further back.' : ''} Click a row for what happened inside it.`}>
          <Table head={<tr><th>Time (IST)</th><th>Request</th><th>Who</th><th>School</th><th className="r">Took</th><th>Inside</th><th>Release</th></tr>}
            empty={!d.rows.length && <Empty icon={<Pulse size={28} weight="duotone" />} title="No requests match">Requests are recorded from the release that added this page onwards.</Empty>}>
            {d.rows.map(r => (
              <Fragment key={r.id}>
                <tr className="click" onClick={() => setOpen(o => (o === r.id ? null : r.id))}>
                  <td style={{ whiteSpace: 'nowrap' }} title={fmtDateTime(r.at)}>{timeIST(r.at)}</td>
                  <td><span className="mono" style={{ fontSize: 12 }}>{r.method}</span> <span className="mono" style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{r.route}</span></td>
                  <td>{r.role ?? 'unknown'}<div className="sub mono">{r.userId?.slice(0, 8)}</div></td>
                  <td style={{ maxWidth: 200 }}>{schoolName(r.schoolId)}</td>
                  <td className="r" style={{ fontWeight: 700, color: tone(r.ms), whiteSpace: 'nowrap' }}>{dur(r.ms)}</td>
                  <td>
                    {r.errors.length > 0 && <Chip tone="r">{r.errors.length === 1 ? 'ERROR' : `${r.errors.length} ERRORS`}</Chip>}{' '}
                    {r.ai.length > 0 && <Chip tone={r.ai.some(a => !a.ok) ? 'a' : 'b'}>{r.ai.length === 1 ? 'AI CALL' : `${r.ai.length} AI CALLS`}</Chip>}
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.release?.slice(0, 7) ?? ''}</td>
                </tr>
                {open === r.id && (
                  <tr><td colSpan={7}>
                    <div style={{ padding: '6px 0 10px', display: 'grid', gap: 10 }}>
                      <div className="acts">
                        <button className="btn sm" onClick={() => filterTo({ user: r.userId ?? '' })} disabled={!r.userId}>This user&apos;s requests</button>
                        <button className="btn sm" onClick={() => filterTo({ route: r.route })}>This route</button>
                        <span className="muted" style={{ fontSize: 12.5 }}>{fmtDateTime(r.at)} · user <span className="mono" style={{ userSelect: 'all' }}>{r.userId}</span></span>
                      </div>
                      {r.ai.length > 0 && (
                        <div>
                          <div className="lbl" style={{ marginBottom: 6 }}>AI CALLS INSIDE ({dur(r.ai.reduce((n, a) => n + (a.ms ?? 0), 0))} of {dur(r.ms)})</div>
                          {r.ai.map((a, i) => <div key={i} style={{ fontSize: 13 }}>{a.label} · {a.ms === null ? 'no timing' : dur(a.ms)} · {a.ok ? 'ok' : <b style={{ color: 'var(--red)' }}>failed: {a.error ?? 'no error text'}</b>}</div>)}
                        </div>
                      )}
                      {r.errors.length > 0 && (
                        <div>
                          <div className="lbl" style={{ marginBottom: 6 }}>ERRORS LOGGED INSIDE</div>
                          {r.errors.map((e, i) => <div key={i} style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{e.message} <span className="muted mono" style={{ fontSize: 12 }}>{e.fingerprint.slice(0, 10)}</span></div>)}
                          <Link className="btn sm" style={{ marginTop: 8, display: 'inline-flex' }} href="/ops/errors">Open the error log</Link>
                        </div>
                      )}
                      {!r.ai.length && !r.errors.length && <span className="muted" style={{ fontSize: 13 }}>No AI call and no logged error inside this request: the time went on the database and the server itself.</span>}
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </Table>
        </Section>
      ) : (
        <Section title="Routes" sub="Volume and latency per route for the period and school chosen (the other filters do not apply here). Click one to see its requests.">
          <Table head={<tr><th>Route</th><th className="r">Requests</th><th className="r">Users</th><th className="r">Typical</th><th className="r">Slowest 5%</th><th className="r">Slowest</th></tr>}
            empty={!d.stats.length && <Empty icon={<Pulse size={28} weight="duotone" />} title="No requests in this period" />}>
            {[...d.stats].sort((a, b) => b.p95 - a.p95).map(s => (
              <tr key={`${s.method} ${s.route}`} className="click" onClick={() => filterTo({ route: s.route, user: '', minMs: '' })}>
                <td><span className="mono" style={{ fontSize: 12 }}>{s.method}</span> <span className="mono" style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{s.route}</span></td>
                <td className="r">{num(s.n)}</td>
                <td className="r">{num(s.users)}</td>
                <td className="r" style={{ color: tone(s.p50) }}>{dur(s.p50)}</td>
                <td className="r" style={{ fontWeight: 700, color: tone(s.p95) }}>{dur(s.p95)}</td>
                <td className="r" style={{ color: tone(s.max) }}>{dur(s.max)}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}
    </>
  );
}
