'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { DatabaseIcon as Database } from '@phosphor-icons/react/dist/ssr/Database';
import { LockKeyIcon as LockKey } from '@phosphor-icons/react/dist/ssr/LockKey';
import { MagnifyingGlassIcon as MagnifyingGlass } from '@phosphor-icons/react/dist/ssr/MagnifyingGlass';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { HIDDEN, INSPECT_GROUPS, INSPECT_TABLES, NEVER_INSPECTABLE, tableLabel } from '@/lib/ops/inspect';
import { Section, Table, errText, fmtDateTime, num } from '../../_ui';
import { useOpsApi } from '../../useOpsApi';

interface Meta { table: string; columns: { name: string; type: string }[]; refs: { column: string; table: string }[]; children: { table: string; column: string }[] }
interface Hit { table: string; id: string; title: string; facts: string[]; when?: string | null }
interface RowData {
  table: string; row: Record<string, unknown>;
  children: { table: string; column: string; count: number }[];
  history: { id: number; at: string; action: string; actorRole: string | null; actor: string; old: Record<string, unknown> | null; new: Record<string, unknown> | null }[];
}
type View =
  | { kind: 'home' }
  | { kind: 'list'; table: string; column?: string; value?: string; of?: string }
  | { kind: 'row'; table: string; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const show = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v));

/**
 * A school's Records tab: find any of its records, read the raw row, follow it to related rows and see who changed it.
 * Works only while the operator has an access window open on the school; every read is counted under that window.
 */
export function RecordsTab({ schoolId, openAccess }: { schoolId: string; openAccess: () => void }) {
  const api = useOpsApi();
  const [state, setState] = useState<'checking' | 'shut' | 'open'>('checking');
  const [meta, setMeta] = useState<Meta[]>([]);
  const [trail, setTrail] = useState<View[]>([{ kind: 'home' }]);
  const [err, setErr] = useState<string | null>(null);
  const view = trail[trail.length - 1];
  const go = (v: View) => { setErr(null); setTrail(t => [...t, v]); };
  const back = () => { setErr(null); setTrail(t => (t.length > 1 ? t.slice(0, -1) : t)); };

  useEffect(() => {
    let cancelled = false;
    api<{ tables: Meta[] }>(`/schools/${schoolId}/inspect?meta=1`)
      .then(d => { if (!cancelled) { setMeta(d.tables); setState('open'); } })
      .catch(e => { if (!cancelled) { if ((e as { status?: number }).status !== 423) setErr(errText(e)); setState('shut'); } });
    return () => { cancelled = true; };
  }, [api, schoolId]);
  // A read refused because the window ran out sends the tab back to its shut state.
  const fail = useCallback((e: unknown) => {
    if ((e as { status?: number }).status === 423) setState('shut'); else setErr(errText(e));
  }, []);
  const metaOf = useMemo(() => new Map(meta.map(m => [m.table, m])), [meta]);

  if (state === 'checking') return <div className="card"><Skeleton h={120} /></div>;
  if (state === 'shut') {
    return (
      <div className="card">
        {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
        <Empty icon={<LockKey size={30} weight="duotone" />} title="The school's records are shut">
          Open an access window first: one school, a written reason, 30 minutes, read-only. The school&apos;s administrators see it.
          <div style={{ marginTop: 14 }}><button className="btn pri" onClick={openAccess}>Go to Ownership &amp; access</button></div>
        </Empty>
      </div>
    );
  }

  return (
    <>
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {view.kind !== 'home' && (
        <div className="acts" style={{ marginBottom: 14 }}>
          <button className="btn sm" onClick={back}><ArrowLeft size={14} weight="bold" /> Back</button>
          <button className="btn sm" onClick={() => { setErr(null); setTrail([{ kind: 'home' }]); }}>All records</button>
        </div>
      )}
      {view.kind === 'home' && <Home schoolId={schoolId} meta={meta} go={go} fail={fail} />}
      {view.kind === 'list' && <List key={`${view.table}|${view.column}|${view.value}`} schoolId={schoolId} view={view} go={go} fail={fail} />}
      {view.kind === 'row' && <Row key={`${view.table}|${view.id}`} schoolId={schoolId} view={view} meta={metaOf.get(view.table)} go={go} fail={fail} />}
    </>
  );
}

function Hits({ hits, go }: { hits: Hit[]; go: (v: View) => void }) {
  return (
    <Table head={<tr><th>Record</th><th>Kind</th><th>Details</th><th>When</th><th>Id</th></tr>}>
      {hits.map(h => (
        <tr key={`${h.table}:${h.id}`} className="click" onClick={() => go({ kind: 'row', table: h.table, id: h.id })}>
          <td className="nm" style={{ maxWidth: 320, overflowWrap: 'anywhere' }}>{h.title}</td>
          <td>{tableLabel(h.table)}</td>
          <td style={{ fontSize: 12.5, maxWidth: 380, overflowWrap: 'anywhere' }}>{h.facts.join(' · ')}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{h.when && !Number.isNaN(Date.parse(h.when)) ? fmtDateTime(h.when) : h.when ?? ''}</td>
          <td className="mono" style={{ fontSize: 12 }}>{h.id.slice(0, 8)}</td>
        </tr>
      ))}
    </Table>
  );
}

function Home({ schoolId, meta, go, fail }: { schoolId: string; meta: Meta[]; go: (v: View) => void; fail: (e: unknown) => void }) {
  const api = useOpsApi();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const known = new Set(meta.map(m => m.table));
  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api<{ hits: Hit[] }>(`/schools/${schoolId}/inspect?find=${encodeURIComponent(q.trim())}`);
      // An id found in exactly one table opens straight away.
      if (UUID.test(q.trim()) && d.hits.length === 1) go({ kind: 'row', table: d.hits[0].table, id: d.hits[0].id });
      else setHits(d.hits);
    } catch (x) { fail(x); } finally { setBusy(false); }
  };
  return (
    <>
      <Section title="Find a record" sub="Paste any record id from an error, a URL or the audit trail, or search the school's accounts by name, email or roll number.">
        <form className="acts" onSubmit={find}>
          <input className="cmp-in" style={{ flex: '1 1 320px', width: 'auto' }} aria-label="Record id, name, email or roll number" placeholder="Record id, name, email or roll number" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn pri" disabled={busy || q.trim().length < 2}><MagnifyingGlass size={15} weight="bold" /> {busy ? 'Looking…' : 'Find'}</button>
        </form>
        {hits && (hits.length ? <div style={{ marginTop: 16 }}><Hits hits={hits} go={go} /></div>
          : <p className="muted" style={{ fontSize: 13.5, marginTop: 14 }}>Nothing in this school matches.</p>)}
      </Section>
      <Section title="Browse by kind" sub={NEVER_INSPECTABLE}>
        {INSPECT_GROUPS.map(g => (
          <div key={g} style={{ marginBottom: 14 }}>
            <div className="lbl" style={{ marginBottom: 8 }}>{g.toUpperCase()}</div>
            <div className="acts">
              {Object.entries(INSPECT_TABLES).filter(([t, x]) => x.group === g && known.has(t)).map(([t, x]) => (
                <button key={t} className="btn sm" onClick={() => go({ kind: 'list', table: t })}>{x.label}</button>
              ))}
            </div>
          </div>
        ))}
      </Section>
    </>
  );
}

function List({ schoolId, view, go, fail }: { schoolId: string; view: Extract<View, { kind: 'list' }>; go: (v: View) => void; fail: (e: unknown) => void }) {
  const api = useOpsApi();
  const [d, setD] = useState<{ rows: Hit[]; capped: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const filter = view.column && view.value ? `&column=${encodeURIComponent(view.column)}&value=${encodeURIComponent(view.value)}` : '';
    api<{ rows: Omit<Hit, 'table'>[]; capped: boolean }>(`/schools/${schoolId}/inspect?table=${view.table}${filter}`)
      .then(x => { if (!cancelled) setD({ rows: x.rows.map(r => ({ ...r, table: view.table })), capped: x.capped }); })
      .catch(e => { if (!cancelled) { fail(e); setD({ rows: [], capped: false }); } });
    return () => { cancelled = true; };
  }, [api, schoolId, view.table, view.column, view.value, fail]);
  return (
    <Section title={tableLabel(view.table)}
      sub={view.column ? `Where ${view.column.replace(/_/g, ' ')} is ${view.of ?? view.value?.slice(0, 8)}. Newest first.` : 'The newest 50. To reach an older one, paste its id on the first screen or come to it from a related record.'}>
      {!d ? <Skeleton h={160} /> : d.rows.length ? <Hits hits={d.rows} go={go} />
        : <Empty icon={<Database size={28} weight="duotone" />} title="No records" />}
      {d?.capped && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Showing the newest 50 only.</p>}
    </Section>
  );
}

function Row({ schoolId, view, meta, go, fail }: { schoolId: string; view: Extract<View, { kind: 'row' }>; meta: Meta | undefined; go: (v: View) => void; fail: (e: unknown) => void }) {
  const api = useOpsApi();
  const [d, setD] = useState<RowData | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api<RowData>(`/schools/${schoolId}/inspect?table=${view.table}&row=${view.id}`)
      .then(x => { if (!cancelled) setD(x); })
      .catch(e => { if (!cancelled) { if ((e as { status?: number }).status === 404) setGone(true); else fail(e); } });
    return () => { cancelled = true; };
  }, [api, schoolId, view.table, view.id, fail]);
  const refOf = useMemo(() => new Map((meta?.refs ?? []).map(r => [r.column, r.table])), [meta]);
  const typeOf = useMemo(() => new Map((meta?.columns ?? []).map(c => [c.name, c.type])), [meta]);

  if (gone) return <div className="card"><Empty icon={<Database size={28} weight="duotone" />} title="This school has no such record">It may have been deleted, or the id belongs to another school.</Empty></div>;
  if (!d) return <div className="card"><Skeleton h={220} /></div>;
  const title = show(d.row.name ?? d.row.title ?? d.row.subject ?? '') || tableLabel(view.table);
  return (
    <>
      <Section title={title} sub={<>{tableLabel(view.table)} · <span className="mono">{view.table}</span> · <span className="mono" style={{ userSelect: 'all' }}>{view.id}</span></>}>
        <Table head={<tr><th>Field</th><th>Value</th><th>Type</th></tr>}>
          {Object.entries(d.row).map(([k, v]) => {
            const parent = refOf.get(k);
            const text = show(v);
            return (
              <tr key={k}>
                <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{k}</td>
                <td style={{ fontSize: 13, overflowWrap: 'anywhere', maxWidth: 640 }}>
                  {v === HIDDEN ? <Chip tone="n">HIDDEN</Chip>
                    : v === null || v === undefined ? <span className="muted">null</span>
                    : parent && typeof v === 'string' && UUID.test(v)
                      ? <button className="btn sm" title={`Open in ${tableLabel(parent)}`} onClick={() => go({ kind: 'row', table: parent, id: v })}><span className="mono">{v.slice(0, 8)}</span> · {tableLabel(parent)}</button>
                    : typeof v === 'object' ? <pre className="mono" style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>{text}</pre>
                    : text === '' ? <span className="muted">empty</span> : text}
                </td>
                <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{typeOf.get(k) ?? ''}</td>
              </tr>
            );
          })}
        </Table>
      </Section>

      {d.children.length > 0 && (
        <Section title="Related records" sub="Rows elsewhere in this school that point at this one.">
          <div className="acts">
            {d.children.map(c => (
              <button key={`${c.table}.${c.column}`} className="btn sm" disabled={!c.count}
                onClick={() => go({ kind: 'list', table: c.table, column: c.column, value: view.id, of: title })}>
                {tableLabel(c.table)} <span className="muted">({c.column.replace(/_/g, ' ')})</span> · <b>{num(c.count)}</b>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Change history" sub="From the database audit trail: the last 50 changes to this record. Tables that are not audited show nothing here.">
        {d.history.length ? (
          <Table head={<tr><th>When</th><th>Action</th><th>By</th><th>What changed</th></tr>}>
            {d.history.map(h => {
              const keys = [...new Set([...Object.keys(h.old ?? {}), ...Object.keys(h.new ?? {})])].filter(k => show(h.old?.[k]) !== show(h.new?.[k]));
              return (
                <tr key={h.id}>
                  <td style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>{fmtDateTime(h.at)}</td>
                  <td style={{ verticalAlign: 'top' }}>{h.action}</td>
                  <td style={{ verticalAlign: 'top' }}>{h.actor}{h.actorRole && <div className="sub">{h.actorRole}</div>}</td>
                  <td style={{ fontSize: 12.5, overflowWrap: 'anywhere', maxWidth: 520 }}>
                    {keys.length ? keys.slice(0, 12).map(k => (
                      <div key={k}><span className="mono">{k}</span>: {h.old && k in h.old ? <><span className="muted">{show(h.old[k]).slice(0, 120) || 'empty'}</span> to </> : null}{show(h.new?.[k]).slice(0, 120) || 'empty'}</div>
                    )) : <span className="muted">No field-level detail recorded</span>}
                    {keys.length > 12 && <div className="muted">and {keys.length - 12} more fields</div>}
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : <p className="muted" style={{ fontSize: 13.5 }}>No recorded changes.</p>}
      </Section>
    </>
  );
}
