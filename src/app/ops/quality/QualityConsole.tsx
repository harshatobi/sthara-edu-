'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlaskIcon as Flask } from '@phosphor-icons/react/dist/ssr/Flask';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { PushPinIcon as PushPin } from '@phosphor-icons/react/dist/ssr/PushPin';
import { KeyIcon as Key } from '@phosphor-icons/react/dist/ssr/Key';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { stageColumns, type Counts, type Failure, type FileKind, type Stage } from '@/lib/qa/runs';
import { Facts, Kpi, Section, Table, errText, fmtDateTime, num, plural } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface RunRow {
  id: string; status: 'uploading' | 'pass' | 'fail'; started_at: string; finished_at: string; machine: string | null;
  git_commit: string | null; git_branch: string | null; git_dirty: boolean; target: string | null; stages: Stage[];
  totals: Record<string, Counts>; pinned: boolean; pin_note: string | null; files_purged_at: string | null; uploadedBy: string | null; fileCount: number;
}
interface RunDetail extends Omit<RunRow, 'fileCount'> { failures: Failure[]; files: { name: string; kind: FileKind; size: number; url: string | null }[] }
interface Token { id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null }
interface Data { can: { manage: boolean }; fileDays: number; runs: RunRow[]; tokens: Token[] | null }

const REPO = 'https://github.com/harshatobi/sthara-edu-';
const STATUS: Record<RunRow['status'], { t: string; tone: Tone }> = { pass: { t: 'PASSED', tone: 'g' }, fail: { t: 'FAILED', tone: 'r' }, uploading: { t: 'INCOMPLETE', tone: 'n' } };
const CELL: Record<Stage['status'], Tone> = { PASS: 'g', FAIL: 'r', WARN: 'a', SKIP: 'n' };
const KIND: Record<FileKind, string> = { workbook: 'Workbook', junit: 'JUnit results', results: 'Test results', log: 'Log' };

/** "www.sthara.in", "preview", "local" — where a run pointed its browser tests. */
function targetOf(t: string | null): string {
  if (!t) return 'not recorded';
  try {
    const h = new URL(t).hostname;
    if (/^(localhost|127\.0\.0\.1)$/.test(h)) return 'local';
    if (h.endsWith('.vercel.app')) return 'preview';
    return h;
  } catch { return t; }
}
const dur = (a: string, b: string) => { const s = Math.round((Date.parse(b) - Date.parse(a)) / 1000); return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; };
const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const short = (c: string | null) => (c ? c.slice(0, 7) : null);

/** Platform Manager > Quality: every run of the test pack, its stages and failing tests, and the test workbooks. */
export default function QualityConsole() {
  const api = useOpsApi();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const load = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    api<Data>('/qa').then(d => { if (!cancelled) { setData(d); setErr(null); } }).catch(e => { if (!cancelled) setErr(errText(e)); });
    return () => { cancelled = true; };
  }, [api, nonce]);

  const runs = useMemo(() => (data?.runs ?? []).filter(r => !target || targetOf(r.target) === target), [data, target]);
  const targets = useMemo(() => [...new Set((data?.runs ?? []).map(r => targetOf(r.target)))], [data]);
  const done = runs.filter(r => r.status !== 'uploading');
  const last = done[0] ?? null;
  const recent = done.slice(0, 30);
  const passRate = recent.length ? Math.round((recent.filter(r => r.status === 'pass').length / recent.length) * 100) : null;
  const unit = last?.totals.unit, e2e = last?.totals.e2e;
  const cols = stageColumns(runs.slice(0, 30));

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Quality"
        sub="Every run of the test pack (qa/ in the app's repo): which stages passed, the failing tests, and the test workbooks it built. Runs upload themselves at the end of run-regression.sh." />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}

      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi label="LAST RUN" value={last ? STATUS[last.status].t : '—'} tone={last ? (last.status === 'pass' ? 'g' : 'r') : undefined}
          note={last ? `${fmtDateTime(last.started_at)} · ${targetOf(last.target)}` : 'No runs yet'} />
        <Kpi label="PASS RATE" value={passRate === null ? '—' : `${passRate}%`} note={recent.length ? `last ${plural(recent.length, 'run')}` : 'No runs yet'} tone={passRate === null ? undefined : passRate >= 90 ? 'g' : passRate >= 60 ? 'a' : 'r'} />
        <Kpi label="UNIT TESTS" value={unit ? num(unit.pass) : '—'} note={unit ? `${num(unit.fail)} failing · ${num(unit.skip)} skipped` : 'in the last run'} tone={unit?.fail ? 'r' : undefined} />
        <Kpi label="BROWSER TESTS" value={e2e ? num(e2e.pass) : '—'} note={e2e ? `${num(e2e.fail)} failing${e2e.flaky ? ` · ${num(e2e.flaky)} flaky` : ''}` : 'in the last run'} tone={e2e?.fail ? 'r' : undefined} />
      </div>

      {targets.length > 1 && (
        <div className="seg" role="tablist" aria-label="Where the browser tests ran" style={{ marginBottom: 14 }}>
          {['', ...targets].map(t => <button key={t || 'all'} role="tab" aria-selected={target === t} className={target === t ? 'on' : ''} onClick={() => setTarget(t)}>{t || 'All'}</button>)}
        </div>
      )}

      <Section title="Runs" sub={data ? `Results are kept for good; workbooks and logs for ${data.fileDays} days unless a run is pinned.` : undefined}>
        {!data ? [0, 1, 2].map(i => <Skeleton key={i} h={44} style={{ marginBottom: 10 }} />)
          : !runs.length ? <Empty icon={<Flask size={26} weight="duotone" />} title="No runs yet">
            {data.can.manage ? 'Create an upload token below, put it in qa/e2e.env, and the next bash qa/run-regression.sh lands here.' : 'Runs appear here once the test pack uploads them.'}
          </Empty> : (
            <Table head={<tr><th>Started</th><th>Result</th>{cols.map(c => <th key={c} title={c} style={{ fontSize: 10.5 }}>{c.replace(/^App /, '').replace(/^E2E /, 'Browser: ')}</th>)}<th>Commit</th><th>Where</th></tr>}>
              {runs.slice(0, 60).map(r => (
                <tr key={r.id} className="hr-row" tabIndex={0} style={{ cursor: 'pointer', background: open === r.id ? 'var(--body)' : undefined }}
                  onClick={() => setOpen(o => (o === r.id ? null : r.id))} onKeyDown={e => { if (e.key === 'Enter') setOpen(o => (o === r.id ? null : r.id)); }}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.started_at)}{r.pinned && <PushPin size={13} weight="fill" style={{ marginLeft: 6, verticalAlign: -2 }} aria-label="Pinned" />}</td>
                  <td><Chip tone={STATUS[r.status].tone}>{STATUS[r.status].t}</Chip></td>
                  {cols.map(c => { const st = r.stages.find(x => x.name === c); return <td key={c} className="c">{st ? <Chip tone={CELL[st.status]}>{st.status}</Chip> : <span className="muted">·</span>}</td>; })}
                  <td className="mono" style={{ fontSize: 12 }}>{short(r.git_commit) ?? '—'}{r.git_dirty ? '*' : ''}<div className="muted" style={{ fontSize: 11 }}>{r.git_branch}</div></td>
                  <td className="muted">{targetOf(r.target)}</td>
                </tr>
              ))}
            </Table>
          )}
      </Section>

      {open && <RunPanel key={open} id={open} manage={!!data?.can.manage} fileDays={data?.fileDays ?? 90} onChanged={load} onClose={() => setOpen(null)} />}
      {data?.can.manage && data.tokens && <Tokens tokens={data.tokens} onChanged={load} />}
    </>
  );
}

function RunPanel({ id, manage, fileDays, onChanged, onClose }: { id: string; manage: boolean; fileDays: number; onChanged: () => void; onClose: () => void }) {
  const api = useOpsApi();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api<{ run: RunDetail }>(`/qa?run=${id}`).then(d => { if (!cancelled) setRun(d.run); }).catch(e => { if (!cancelled) setErr(errText(e)); });
    return () => { cancelled = true; };
  }, [api, id]);
  // Download links last two minutes: fetch a fresh one at the moment of the click.
  const download = async (name: string) => {
    try {
      const d = await api<{ run: RunDetail }>(`/qa?run=${id}`);
      const f = d.run.files.find(x => x.name === name);
      if (f?.url) window.location.assign(f.url); else setErr('That file is no longer kept.');
    } catch (e) { setErr(errText(e)); }
  };
  const act = async (body: Record<string, unknown>, after?: () => void) => {
    setBusy(true);
    try { await api('/qa', { method: 'POST', body }); onChanged(); after?.(); if (!after) { const d = await api<{ run: RunDetail }>(`/qa?run=${id}`); setRun(d.run); } }
    catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const failures = (run?.failures ?? []).filter(f => !q || `${f.suite} ${f.name} ${f.file} ${f.message}`.toLowerCase().includes(q.toLowerCase()));
  const workbooks = run?.files.filter(f => f.kind === 'workbook') ?? [];
  const others = run?.files.filter(f => f.kind !== 'workbook') ?? [];

  return (
    <Section title={run ? `Run of ${fmtDateTime(run.started_at)}` : 'Run'} id="run"
      actions={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {run && manage && (run.pinned
          ? <button className="btn sm" disabled={busy} onClick={() => act({ action: 'unpin', id })}>Unpin</button>
          : !run.files_purged_at && <><input className="cmp-in" style={{ width: 220 }} placeholder="Why keep it (e.g. release sign-off)" value={note} maxLength={300} onChange={e => setNote(e.target.value)} aria-label="Pin note" />
            <button className="btn sm" disabled={busy} onClick={() => act({ action: 'pin', id, note })}><PushPin size={14} weight="bold" /> Pin</button></>)}
        {run && manage && !run.pinned && <button className="btn sm red" disabled={busy} onClick={() => act({ action: 'delete', id }, onClose)}>Delete run</button>}
        <button className="btn sm" onClick={onClose}>Close</button>
      </div>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {!run ? <Skeleton h={160} /> : <>
        <Facts rows={[
          ['Result', <Chip key="s" tone={STATUS[run.status].tone}>{STATUS[run.status].t}</Chip>],
          ['Took', dur(run.started_at, run.finished_at)],
          ['Commit', run.git_commit ? <a key="c" href={`${REPO}/commit/${run.git_commit}`} target="_blank" rel="noreferrer" className="mono">{short(run.git_commit)}</a> : '—'],
          ['Branch', `${run.git_branch ?? '—'}${run.git_dirty ? ' (with uncommitted changes)' : ''}`],
          ['Browser tests ran against', run.target ?? 'not recorded'],
          ['Machine', run.machine ?? '—'],
          ['Uploaded with', run.uploadedBy ?? 'a revoked token'],
          ['Kept', run.pinned ? `Pinned${run.pin_note ? `: ${run.pin_note}` : ''}` : run.files_purged_at ? `Files removed ${fmtDateTime(run.files_purged_at)}` : `Files until ${fmtDateTime(new Date(Date.parse(run.started_at) + fileDays * 86_400_000).toISOString())}`],
        ]} />

        <h3 style={{ fontSize: 15, fontWeight: 800, margin: '18px 0 8px' }}>Stages</h3>
        <Table head={<tr><th>Stage</th><th>Result</th><th className="c">Took</th></tr>}>
          {run.stages.map(s => <tr key={s.name}><td>{s.name}</td><td><Chip tone={CELL[s.status]}>{s.status}</Chip></td><td className="c muted">{s.ms === null ? '' : s.ms >= 60_000 ? `${Math.round(s.ms / 60_000)} min` : `${Math.round(s.ms / 1000)} s`}</td></tr>)}
        </Table>
        {Object.keys(run.totals).length > 0 && (
          <p className="muted" style={{ marginTop: 10 }}>{Object.entries(run.totals).map(([k, c]) => `${k}: ${num(c.pass)} passed, ${num(c.fail)} failed${c.skip ? `, ${num(c.skip)} skipped` : ''}${c.flaky ? `, ${num(c.flaky)} flaky` : ''}`).join(' · ')}</p>
        )}

        <h3 style={{ fontSize: 15, fontWeight: 800, margin: '18px 0 8px' }}>Failing tests {run.failures.length > 0 && <span className="muted" style={{ fontWeight: 600 }}>({num(run.failures.length)})</span>}</h3>
        {!run.failures.length ? <p className="muted">None.</p> : <>
          {run.failures.length > 8 && <input className="cmp-in" style={{ maxWidth: 320, marginBottom: 10 }} placeholder="Find a test" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a failing test" />}
          {failures.slice(0, 200).map((f, i) => (
            <details key={i} className="card" style={{ padding: '10px 14px', marginBottom: 8, boxShadow: 'none', border: '1px solid var(--line)' }}>
              <summary style={{ cursor: 'pointer' }}><Chip tone="n">{f.suite}</Chip> <b>{f.name}</b>{f.file && <span className="muted mono" style={{ fontSize: 12 }}> {f.file}</span>}</summary>
              <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 8, color: 'var(--mut)' }}>{f.message}</pre>
            </details>
          ))}
        </>}

        <h3 style={{ fontSize: 15, fontWeight: 800, margin: '18px 0 8px' }}>Files</h3>
        {run.files_purged_at ? <p className="muted">Removed after {fileDays} days. The results above are kept.</p> : !run.files.length ? <p className="muted">This run uploaded no files.</p> : (
          <Table head={<tr><th>File</th><th>What</th><th className="c">Size</th><th /></tr>}>
            {[...workbooks, ...others].map(f => (
              <tr key={f.name}><td className="mono" style={{ fontSize: 12.5 }}>{f.name}</td><td>{KIND[f.kind]}</td><td className="c muted">{size(f.size)}</td>
                <td><button className="btn sm" onClick={() => download(f.name)}><DownloadSimple size={14} weight="bold" /> Download</button></td></tr>
            ))}
          </Table>
        )}
      </>}
    </Section>
  );
}

function Tokens({ tokens, onChanged }: { tokens: Token[]; onChanged: () => void }) {
  const api = useOpsApi();
  const [label, setLabel] = useState('');
  const [shown, setShown] = useState<{ label: string; token: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true); setErr(null);
    try { const r = await api<{ token: string }>('/qa', { method: 'POST', body: { action: 'token', label } }); setShown({ label, token: r.token }); setLabel(''); onChanged(); }
    catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.sthara.in';
  return (
    <Section title="Upload tokens" sub="One per machine (or person) that runs the test pack. A token can only upload runs; it reads nothing. Revoke it when the machine is retired.">
      {err && <div className="note err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {shown && (
        <div className="note" style={{ marginBottom: 14 }}>
          <b>Token for {shown.label}, shown once.</b> Add these two lines to <span className="mono">qa/e2e.env</span> on that machine:
          <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: '8px 0', fontSize: 12.5, userSelect: 'all' }}>{`QA_UPLOAD_URL=${origin}\nQA_UPLOAD_TOKEN=${shown.token}`}</pre>
          <button className="btn sm" onClick={() => navigator.clipboard?.writeText(`QA_UPLOAD_URL=${origin}\nQA_UPLOAD_TOKEN=${shown.token}`)}>Copy</button>{' '}
          <button className="btn sm" onClick={() => setShown(null)}>Done</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input className="cmp-in" style={{ maxWidth: 320 }} placeholder="e.g. Moses's MacBook" value={label} maxLength={80} onChange={e => setLabel(e.target.value)} aria-label="Token name" />
        <button className="btn sm pri" disabled={busy || !label.trim()} onClick={create}><Key size={14} weight="bold" /> Create token</button>
      </div>
      {tokens.length > 0 && (
        <Table head={<tr><th>Name</th><th>Created</th><th>Last upload</th><th /></tr>}>
          {tokens.map(t => (
            <tr key={t.id}>
              <td>{t.label}{t.revoked_at && <> <Chip tone="n">REVOKED</Chip></>}</td>
              <td className="muted">{fmtDateTime(t.created_at)}</td>
              <td className="muted">{t.last_used_at ? fmtDateTime(t.last_used_at) : 'Never'}</td>
              <td>{!t.revoked_at && <button className="btn sm" onClick={async () => { try { await api('/qa', { method: 'POST', body: { action: 'revoke', id: t.id } }); onChanged(); } catch (e) { setErr(errText(e)); } }}>Revoke</button>}</td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}
