'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BugIcon as Bug } from '@phosphor-icons/react/dist/ssr/Bug';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { Kpi, downloadCsv, errText, fmtDateTime, num, plural } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface Group {
  fingerprint: string; source: 'server' | 'client'; kind: string; message: string; route: string | null;
  status: 'open' | 'resolved' | 'ignored'; events: number; first_seen: string; last_seen: string;
  last_release: string | null; last_environment: string | null; regressed_at: string | null; note: string | null;
  inRange: number; hours: number[]; schools: number; users: number;
}
interface Occurrence {
  id: number; at: string; kind: string; message: string; stack: string | null; route: string | null; method: string | null; path: string | null;
  school: string | null; user: string | null; user_role: string | null; release: string | null; environment: string | null;
  user_agent: string | null; digest: string | null; repeats: number; context: Record<string, unknown>;
}
const KIND: Record<string, string> = { uncaught: 'Uncaught', logged: 'Logged', client: 'Browser', render: 'Page crash', unhandled: 'Unhandled promise' };
const STATUS: Record<Group['status'], { t: string; tone: Tone }> = { open: { t: 'OPEN', tone: 'r' }, resolved: { t: 'RESOLVED', tone: 'g' }, ignored: { t: 'IGNORED', tone: 'n' } };
const RANGES = [['1h', 'Last hour'], ['24h', 'Last 24 hours'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']] as const;
const VIEWS = [['open', 'Open'], ['resolved', 'Resolved'], ['ignored', 'Ignored'], ['', 'All']] as const;

/** A day of hourly counts as small bars (oldest on the left). */
function Spark({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  return (
    <div aria-hidden style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 26, width: 120 }}>
      {hours.map((h, i) => <span key={i} style={{ flex: 1, height: `${Math.max(h ? 12 : 4, (h / max) * 100)}%`, background: h ? 'var(--red)' : 'var(--line, #E3E8EF)', borderRadius: 1.5, opacity: h ? 0.85 : 1 }} />)}
    </div>
  );
}

/** Platform Manager > Error log: every error the servers and browsers hit, grouped into problems to triage. */
export default function ErrorsConsole() {
  const api = useOpsApi();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>('24h');
  const [view, setView] = useState<(typeof VIEWS)[number][0]>('open');
  const [source, setSource] = useState('');
  const [data, setData] = useState<{ groups: Group[]; totals: { events: number; open: number; newGroups: number; schools: number } } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ group: Group & { resolvedByName: string | null }; events: Occurrence[] } | null>(null);
  const [note, setNote] = useState('');
  const [nonce, setNonce] = useState(0);
  const load = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ range, ...(view ? { status: view } : {}), ...(source ? { source } : {}) });
    api<NonNullable<typeof data>>(`/errors?${qs}`)
      .then(d => { if (!cancelled) { setData(d); setErr(null); } })
      .catch(e => { if (!cancelled) { setErr(errText(e)); setData({ groups: [], totals: { events: 0, open: 0, newGroups: 0, schools: 0 } }); } });
    return () => { cancelled = true; };
  }, [api, range, view, source, nonce]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api<NonNullable<typeof detail>>(`/errors?fingerprint=${open}`)
      .then(d => { if (!cancelled) { setDetail(d); setNote(d.group.note ?? ''); } })
      .catch(e => { if (!cancelled) setErr(errText(e)); });
    return () => { cancelled = true; };
  }, [api, open, nonce]);

  const act = async (fingerprint: string, body: { status?: Group['status']; note?: string }) => {
    try { await api('/errors', { method: 'PATCH', body: { fingerprint, ...body } }); load(); } catch (e) { setErr(errText(e)); }
  };
  const groups = data?.groups ?? [];

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Error log"
        sub="Every error the servers and browsers hit, grouped by cause. Resolve a problem once it's fixed; if it happens again it reopens."
        actions={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" title="Logs one error and fails once on the server, to check both reach this page" onClick={async () => {
            try { await api('/errors', { method: 'POST', body: { action: 'test' } }); } catch { /* a 500 is the point */ }
            setTimeout(load, 1500);
          }}>Send a test error</button>
          <button className="btn" disabled={!groups.length} onClick={() => downloadCsv(`sthara-errors-${new Date().toISOString().slice(0, 10)}.csv`,
          [['Status', 'Where', 'Kind', 'Message', 'Route', 'In range', 'All time', 'Schools', 'People', 'First seen (IST)', 'Last seen (IST)', 'Release'],
            ...groups.map(g => [g.status, g.source, KIND[g.kind] ?? g.kind, g.message, g.route, g.inRange, g.events, g.schools, g.users, fmtDateTime(g.first_seen), fmtDateTime(g.last_seen), g.last_release])])}>
          <DownloadSimple size={15} weight="bold" /> Export CSV
        </button></div>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}

      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi label="ERRORS" value={data ? num(data.totals.events) : '—'} note={RANGES.find(r => r[0] === range)![1].toLowerCase()} tone={data && data.totals.events ? 'r' : undefined} />
        <Kpi label="OPEN PROBLEMS" value={data ? num(data.totals.open) : '—'} note="distinct causes to look at" tone={data && data.totals.open ? 'a' : 'g'} />
        <Kpi label="NEW" value={data ? num(data.totals.newGroups) : '—'} note="first seen in this range" />
        <Kpi label="SCHOOLS AFFECTED" value={data ? num(data.totals.schools) : '—'} note="where a signed-in user hit one" />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div className="seg" role="tablist" aria-label="Status">
          {VIEWS.map(([v, l]) => <button key={l} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{l}</button>)}
        </div>
        <select className="cmp-sel" aria-label="Time range" value={range} onChange={e => setRange(e.target.value as typeof range)} style={{ width: 170 }}>
          {RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="cmp-sel" aria-label="Where" value={source} onChange={e => setSource(e.target.value)} style={{ width: 150 }}>
          <option value="">Server and browser</option><option value="server">Server</option><option value="client">Browser</option>
        </select>
      </div>

      {!data ? (
        <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={64} style={{ marginBottom: 12 }} />)}</div>
      ) : groups.length ? groups.map(g => (
        <div key={g.fingerprint} className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${g.status === 'open' ? 'var(--red)' : 'transparent'}` }}>
          <button type="button" onClick={() => setOpen(o => (o === g.fingerprint ? null : g.fingerprint))} aria-expanded={open === g.fingerprint}
            style={{ display: 'flex', gap: 14, alignItems: 'center', width: '100%', textAlign: 'left', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                <Chip tone={STATUS[g.status].tone}>{STATUS[g.status].t}</Chip>
                <Chip tone={g.source === 'server' ? 'b' : 'p'}>{g.source === 'server' ? 'SERVER' : 'BROWSER'}</Chip>
                <Chip tone="n">{(KIND[g.kind] ?? g.kind).toUpperCase()}</Chip>
                {g.regressed_at && g.status === 'open' && <Chip tone="a">CAME BACK</Chip>}
              </div>
              <div className="mono" style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{g.message}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                {g.route ?? 'no route'} · last {fmtDateTime(g.last_seen)} · first {fmtDateTime(g.first_seen)}{g.last_release ? ` · release ${g.last_release}` : ''}
              </div>
            </div>
            <Spark hours={g.hours} />
            <div style={{ textAlign: 'right', minWidth: 110 }}>
              <div className="num" style={{ fontSize: 20, fontWeight: 800 }}>{num(g.inRange)}</div>
              <div className="muted" style={{ fontSize: 12 }}>{num(g.events)} all time</div>
              <div className="muted" style={{ fontSize: 12 }}>{plural(g.schools, 'school')} · {plural(g.users, 'person', 'people')}</div>
            </div>
          </button>

          {open === g.fingerprint && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--line, #E3E8EF)', paddingTop: 14 }}>
              <div className="acts" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                {g.status !== 'resolved' && <button className="btn sm pri" onClick={() => act(g.fingerprint, { status: 'resolved' })}>Mark resolved</button>}
                {g.status !== 'ignored' && <button className="btn sm" onClick={() => act(g.fingerprint, { status: 'ignored' })}>Ignore</button>}
                {g.status !== 'open' && <button className="btn sm" onClick={() => act(g.fingerprint, { status: 'open' })}>Reopen</button>}
                {detail?.group.resolvedByName && g.status !== 'open' && <span className="muted" style={{ fontSize: 12.5 }}>{g.status === 'resolved' ? 'Resolved' : 'Ignored'} by {detail.group.resolvedByName}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <textarea className="cmp-in" rows={2} style={{ flex: '1 1 300px' }} aria-label="Note" placeholder="Note for the team: cause, fix, ticket" value={note} maxLength={2000} onChange={e => setNote(e.target.value)} />
                <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={note === (detail?.group.note ?? '')} onClick={() => act(g.fingerprint, { note })}>Save note</button>
              </div>
              {!detail || detail.group.fingerprint !== g.fingerprint ? <Skeleton h={120} /> : detail.events.map(e => (
                <details key={e.id} style={{ borderTop: '1px solid var(--line, #E3E8EF)', padding: '10px 0' }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13 }}>
                    <b>{fmtDateTime(e.at)}</b>{e.repeats > 1 ? ` (×${e.repeats})` : ''} · {e.method ? `${e.method} ` : ''}{e.path ?? e.route ?? '—'}
                    {e.school ? ` · ${e.school}` : ''}{e.user ? ` · ${e.user}${e.user_role ? ` (${e.user_role})` : ''}` : ''}
                  </summary>
                  <div className="muted" style={{ fontSize: 12, margin: '8px 0' }}>
                    {[e.environment && `env ${e.environment}`, e.release && `release ${e.release}`, e.digest && `digest ${e.digest}`, e.user_agent].filter(Boolean).join(' · ')}
                  </div>
                  {e.stack ? <pre className="mono" style={{ fontSize: 11.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: '#F6F8FB', padding: 10, borderRadius: 8, maxHeight: 280, overflow: 'auto' }}>{e.stack}</pre>
                    : <p className="muted" style={{ fontSize: 12.5 }}>No stack trace (a logged message).</p>}
                  {Object.keys(e.context || {}).length > 0 && <pre className="mono" style={{ fontSize: 11.5, whiteSpace: 'pre-wrap' }}>{JSON.stringify(e.context, null, 2)}</pre>}
                </details>
              ))}
            </div>
          )}
        </div>
      )) : (
        <div className="card"><Empty icon={<Bug size={26} weight="duotone" />} title={view === 'open' ? 'No open errors' : 'Nothing here'}>
          {view === 'open' ? 'Nothing has gone wrong in this range that is still open. ' : ''}Errors from routes, pages and browsers land here as they happen. <Link href="/ops/health" style={{ color: 'var(--blue)' }}>System health</Link> covers configuration.
        </Empty></div>
      )}
    </>
  );
}
