'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { UploadSimpleIcon as UploadSimple } from '@phosphor-icons/react/dist/ssr/UploadSimple';
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from '@phosphor-icons/react/dist/ssr/ArrowCounterClockwise';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { DatabaseIcon as Database } from '@phosphor-icons/react/dist/ssr/Database';
import { FileXlsIcon as FileXls } from '@phosphor-icons/react/dist/ssr/FileXls';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { Chip, Empty, Skeleton, type Tone } from '@/components/canon/ui';
import { DATASETS, datasetOf, type Problem } from '@/lib/import/datasets';
import { template, templateName } from '@/lib/import/engine';
import { writeXlsx } from '@/lib/import/xlsx';
import { toCsv } from '@/lib/admin/format';

/**
 * Bulk import, as the school's office and Sthara's ops console both see it: pick a dataset, download its template,
 * upload the filled file, read what the check found, commit, and undo within 30 days. The page that hosts it says
 * where the calls go (the school's own admin API, or the ops console's on the school's behalf).
 */

export interface ImportApi {
  list(): Promise<{ jobs: JobRow[] }>;
  create(body: { dataset: string; fileName: string; fileBytes: number }): Promise<{ job: JobRow; upload: { url: string } }>;
  get(id: string): Promise<{ job: JobRow & { problems: Problem[] }; undo: { blocked: string | null } | null }>;
  act(id: string, action: 'uploaded' | 'commit' | 'undo' | 'cancel'): Promise<unknown>;
}

export interface JobRow {
  id: string; dataset: string; status: string; phase_cursor: number; file_name: string; file_bytes: number | null; total_rows: number | null;
  added: number; updated: number; unchanged: number; kept: number; problem_count: number; summary: Record<string, unknown>;
  by_kind: 'admin' | 'operator'; by_name: string; last_error: string | null; created_at: string; checked_at: string | null;
  committed_at: string | null; undone_at: string | null;
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  uploading: { label: 'UPLOADING', tone: 'n' }, checking: { label: 'CHECKING', tone: 'b' }, rejected: { label: 'NEEDS FIXES', tone: 'r' },
  checked: { label: 'READY TO COMMIT', tone: 'a' }, committing: { label: 'WRITING', tone: 'b' }, committed: { label: 'IMPORTED', tone: 'g' },
  failed: { label: 'FAILED', tone: 'r' }, undoing: { label: 'UNDOING', tone: 'b' }, undone: { label: 'UNDONE', tone: 'n' },
  cancelled: { label: 'CANCELLED', tone: 'n' },
};
const WAITING = new Set(['uploading', 'checking', 'committing', 'undoing']);
const n = (v: number) => v.toLocaleString('en-IN');
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
const MIME: Record<string, string> = { csv: 'text/csv', tsv: 'text/tab-separated-values', txt: 'text/plain', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

function save(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTemplate(key: string) {
  const d = datasetOf(key);
  if (d) save(templateName(d), writeXlsx(template(d)) as BlobPart, MIME.xlsx);
}

export default function ImportCenter({ api, who }: { api: ImportApi; /** Whose screen this is, for the wording. */ who: 'school' | 'sthara' }) {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const load = useCallback(() => setNonce(x => x + 1), []);
  useEffect(() => {
    let live = true;
    api.list()
      .then(r => { if (live) { setJobs(r.jobs); setErr(null); } })
      .catch(e => { if (live) setErr(e instanceof Error ? e.message : 'Could not load imports.'); });
    return () => { live = false; };
  }, [api, nonce]);

  return (
    <>
      {err && <div className="note err" role="alert" style={{ marginBottom: 16 }}>{err}</div>}
      <Start api={api} who={who} onStarted={id => { setOpen(id); void load(); }} />
      {open && <JobPanel key={open} api={api} id={open} onChanged={load} onClose={() => setOpen(null)} />}
      <div className="card" style={{ marginTop: 22 }}>
        <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 14 }}>Import history</h3>
        {!jobs ? <Skeleton h={120} /> : !jobs.length ? (
          <Empty icon={<Database size={28} weight="duotone" />} title="No imports yet">Every import shows here: who ran it, the file, and what it changed.</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Started</th><th>What</th><th>File</th><th>By</th><th className="r">Rows</th><th className="r">Added</th><th className="r">Updated</th><th>Status</th></tr></thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.id} className="row-btn" onClick={() => setOpen(j.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{when(j.created_at)}</td>
                    <td>{datasetOf(j.dataset)?.label ?? j.dataset}</td>
                    <td style={{ overflowWrap: 'anywhere', maxWidth: 260 }}>{j.file_name}</td>
                    <td>{j.by_name}{j.by_kind === 'operator' && <div className="sub">on the school&apos;s behalf</div>}</td>
                    <td className="r">{j.total_rows == null ? '' : n(j.total_rows)}</td>
                    <td className="r">{['committed', 'undone'].includes(j.status) ? n(j.added) : ''}</td>
                    <td className="r">{['committed', 'undone'].includes(j.status) ? n(j.updated) : ''}</td>
                    <td><Chip tone={STATUS[j.status]?.tone ?? 'n'}>{STATUS[j.status]?.label ?? j.status.toUpperCase()}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Start({ api, who, onStarted }: { api: ImportApi; who: 'school' | 'sthara'; onStarted: (id: string) => void }) {
  const [key, setKey] = useState(DATASETS[0].key);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const d = datasetOf(key)!;

  const start = async () => {
    if (!file) return;
    setErr(null);
    try {
      setBusy('Starting…');
      const { job, upload } = await api.create({ dataset: key, fileName: file.name, fileBytes: file.size });
      setBusy('Uploading…');
      const ext = file.name.toLowerCase().split('.').pop() || '';
      const put = await fetch(upload.url, { method: 'PUT', headers: { 'Content-Type': MIME[ext] || 'application/octet-stream', 'x-upsert': 'true' }, body: file });
      if (!put.ok) throw new Error('The upload did not finish. Check your connection and try again.');
      await api.act(job.id, 'uploaded');
      setFile(null);
      if (input.current) input.current.value = '';
      onStarted(job.id);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not start the import.'); }
    finally { setBusy(null); }
  };

  return (
    <div className="card">
      <h3 style={{ fontSize: 19, fontWeight: 800 }}>Import a file</h3>
      <p className="muted" style={{ marginTop: 4, marginBottom: 16, fontSize: 13.5 }}>
        {who === 'school'
          ? 'Download the template, fill it in (or paste your own export into it), and upload it. Nothing is saved until every row checks out and you commit.'
          : 'For a school that cannot run the import itself. The school sees this import in its history, done by Sthara under your name.'}
      </p>
      <div className="g2">
        <div>
          <label className="lbl" htmlFor="imp-what">WHAT YOU ARE IMPORTING</label>
          <select id="imp-what" className="cmp-in" value={key} onChange={e => setKey(e.target.value)}>
            {DATASETS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
          <p className="muted" style={{ marginTop: 8, fontSize: 13.5 }}>{d.about} {d.lands}</p>
          <button type="button" className="btn sm" style={{ marginTop: 10 }} onClick={() => downloadTemplate(key)}>
            <DownloadSimple size={15} weight="bold" /> Download the {d.label.toLowerCase()} template
          </button>
        </div>
        <div>
          <label className="lbl" htmlFor="imp-file">THE FILE (.XLSX OR .CSV, UP TO 50 MB)</label>
          <input id="imp-file" ref={input} className="cmp-in" type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <div className="acts" style={{ marginTop: 12 }}>
            <button type="button" className="btn pri" disabled={!file || !!busy} onClick={start}>
              <UploadSimple size={15} weight="bold" /> {busy ?? 'Upload and check'}
            </button>
          </div>
          {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
        </div>
      </div>
      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Columns in this format</summary>
        <div className="tbl-wrap" style={{ marginTop: 10 }}>
          <table className="tbl">
            <thead><tr><th>Column</th><th>Required</th><th>What to put in it</th></tr></thead>
            <tbody>
              {d.columns.map(c => (
                <tr key={c.key}>
                  <td className="mono">{c.key}</td>
                  <td>{c.required ? 'Yes' : 'No'}</td>
                  <td style={{ fontSize: 13.5 }}>{c.guide}{c.aliases?.length ? <div className="sub">Also accepted as a header: {c.aliases.join(', ')}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 10, fontSize: 13.5 }}>Same record: {d.matching} Importing a record again updates it; blank cells leave what is stored alone.</p>
      </details>
    </div>
  );
}

function JobPanel({ api, id, onChanged, onClose }: { api: ImportApi; id: string; onChanged: () => void; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<ImportApi['get']>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'commit' | 'undo' | null>(null);
  const last = useRef<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    api.get(id)
      .then(d => {
        if (!live) return;
        setData(d); setErr(null);
        if (last.current && last.current !== d.job.status) onChanged();
        last.current = d.job.status;
      })
      .catch(e => { if (live) setErr(e instanceof Error ? e.message : 'Could not load the import.'); });
    return () => { live = false; };
  }, [api, id, onChanged, nonce]);
  const status = data?.job.status;
  // While the worker is on it, look again every few seconds (each look also nudges the worker).
  useEffect(() => {
    if (!status || !WAITING.has(status)) return;
    const t = setInterval(() => setNonce(x => x + 1), 3000);
    return () => clearInterval(t);
  }, [status]);

  const act = async (action: 'commit' | 'undo' | 'cancel') => {
    setBusy(true); setErr(null);
    try { await api.act(id, action); setConfirm(null); setNonce(x => x + 1); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'That did not work. Try again.'); }
    finally { setBusy(false); }
  };

  const j = data?.job;
  const d = j ? datasetOf(j.dataset) : null;
  const chunks = Number(j?.summary.chunks ?? 0);
  const progress = useMemo(() => {
    if (!j) return null;
    if (j.status === 'checking') return chunks ? `Checking against the school's records, part ${Math.min(j.phase_cursor + 1, chunks)} of ${chunks}` : 'Reading and checking every row';
    if (j.status === 'committing') return chunks ? `Writing part ${Math.min(j.phase_cursor + 1, chunks)} of ${chunks}` : 'Writing';
    if (j.status === 'undoing') return `Undoing: ${n(Number(j.summary.restored ?? 0))} rows put back, ${n(Number(j.summary.removed ?? 0))} removed so far`;
    if (j.status === 'uploading') return 'Waiting for the file to arrive';
    return null;
  }, [j, chunks]);

  const problemsCsv = () => {
    if (!data) return;
    save(`${j!.file_name.replace(/\.[^.]+$/, '')}-problems.csv`, '﻿' + toCsv([['row', 'column', 'problem'], ...data.job.problems.map(p => [p.n || '', p.column ?? '', p.error])]), 'text/csv;charset=utf-8');
  };

  return (
    <div className="card" style={{ marginTop: 22 }} aria-live="polite">
      {!j ? (err ? <div className="note err" role="alert">{err}</div> : <Skeleton h={140} />) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>{d?.label.toUpperCase() ?? j.dataset}</div>
              <h3 style={{ fontSize: 19, fontWeight: 800, overflowWrap: 'anywhere', display: 'flex', gap: 8, alignItems: 'center' }}><FileXls size={20} weight="duotone" /> {j.file_name}</h3>
              <p className="muted" style={{ marginTop: 4, fontSize: 13.5 }}>
                {j.by_name} · {when(j.created_at)}{j.total_rows != null ? ` · ${n(j.total_rows)} rows` : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Chip tone={STATUS[j.status]?.tone ?? 'n'}>{STATUS[j.status]?.label ?? j.status}</Chip>
              <button type="button" className="btn sm" onClick={onClose} aria-label="Close this import"><X size={14} weight="bold" /></button>
            </div>
          </div>

          {progress && <div className="note" style={{ marginTop: 14 }}>{progress}…</div>}
          {err && <div className="note err" role="alert" style={{ marginTop: 14 }}>{err}</div>}

          {['checked', 'committed', 'undone'].includes(j.status) && (
            <div className="kpis" style={{ marginTop: 16 }}>
              <div className="kpi"><div className="lb">{j.status === 'checked' ? 'WILL ADD' : 'ADDED'}</div><div className="vl">{n(j.added)}</div></div>
              <div className="kpi"><div className="lb">{j.status === 'checked' ? 'WILL UPDATE' : 'UPDATED'}</div><div className="vl">{n(j.updated)}</div></div>
              <div className="kpi"><div className="lb">ALREADY THE SAME</div><div className="vl">{n(j.unchanged)}</div></div>
              {j.status === 'undone'
                ? <div className="kpi"><div className="lb">KEPT ON UNDO</div><div className="vl">{n(j.kept)}</div><div className="nt muted">Changed by someone since, so left alone</div></div>
                : <div className="kpi"><div className="lb">NOTHING TO IMPORT</div><div className="vl">{n(Number(j.summary.skipped ?? 0))}</div></div>}
            </div>
          )}

          {j.status === 'failed' && (
            <div className="note err" style={{ marginTop: 14 }}>
              {String(j.summary.failure ?? j.last_error ?? 'The import stopped.')} {j.committed_at ? 'Everything it had written has been rolled back.' : 'Nothing was saved.'} If it keeps happening, ask Sthara support.
            </div>
          )}

          {j.problem_count > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <b>{n(j.problem_count)} {j.problem_count === 1 ? 'problem' : 'problems'} to fix in the file{j.problem_count > j.problems.length ? ` (first ${n(j.problems.length)} shown)` : ''}. Nothing was saved.</b>
                <button type="button" className="btn sm" onClick={problemsCsv}><DownloadSimple size={15} weight="bold" /> Download the list</button>
              </div>
              <div className="tbl-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
                <table className="tbl">
                  <thead><tr><th className="r">Row</th><th>Column</th><th>Problem</th></tr></thead>
                  <tbody>
                    {j.problems.map((p, i) => (
                      <tr key={i}><td className="r mono">{p.n || 'File'}</td><td className="mono">{p.column ?? ''}</td><td style={{ fontSize: 13.5 }}>{p.error}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="acts" style={{ marginTop: 16 }}>
            {j.status === 'checked' && (confirm === 'commit' ? (
              <>
                <span style={{ fontSize: 13.5 }}>Add {n(j.added)} and update {n(j.updated)} records?</span>
                <button type="button" className="btn pri" disabled={busy} onClick={() => act('commit')}><CheckCircle size={15} weight="bold" /> Yes, import</button>
                <button type="button" className="btn" disabled={busy} onClick={() => setConfirm(null)}>Not yet</button>
              </>
            ) : (
              <button type="button" className="btn pri" disabled={busy || j.added + j.updated === 0} onClick={() => setConfirm('commit')}>
                <CheckCircle size={15} weight="bold" /> {j.added + j.updated === 0 ? 'Nothing to change' : 'Commit the import'}
              </button>
            ))}
            {['uploading', 'checked', 'rejected'].includes(j.status) && confirm !== 'commit' && (
              <button type="button" className="btn" disabled={busy} onClick={() => act('cancel')}>Cancel this import</button>
            )}
            {j.status === 'committed' && data?.undo && (data.undo.blocked
              ? <span className="muted" style={{ fontSize: 13.5 }}>{data.undo.blocked}</span>
              : confirm === 'undo' ? (
                <>
                  <span style={{ fontSize: 13.5 }}>Put back what this import changed? Rows edited since stay as they are; imported receipts are voided, not deleted.</span>
                  <button type="button" className="btn" disabled={busy} onClick={() => act('undo')}><ArrowCounterClockwise size={15} weight="bold" /> Yes, undo</button>
                  <button type="button" className="btn" disabled={busy} onClick={() => setConfirm(null)}>Keep it</button>
                </>
              ) : (
                <button type="button" className="btn" disabled={busy} onClick={() => setConfirm('undo')}><ArrowCounterClockwise size={15} weight="bold" /> Undo this import</button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
