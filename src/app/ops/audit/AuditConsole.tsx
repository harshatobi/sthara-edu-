'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import type { RegistrySchool } from '@/lib/ops/attention';
import { journalLabel, journalValue } from '@/lib/ops/journal';
import { Table, downloadCsv, errText, fmtDateTime, num } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface ConsoleRow { id: number; at: string; actor_email: string | null; scope: 'platform' | 'school'; school_id: string | null; key: string; old_value: unknown; new_value: unknown; reason: string }
interface DataRow { id: number; at: string; actor: string; actor_role: string | null; action: string; table_name: string; row_id: string | null; school_id: string | null; old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null }
type Source = 'console' | 'data';

const label = (r: ConsoleRow) => journalLabel(r.scope, r.key);
const val = (r: ConsoleRow, v: unknown) => journalValue(r.scope, r.key, v);
/** Fields a data-trail UPDATE actually changed. */
const changedKeys = (r: DataRow) => {
  if (r.action !== 'UPDATE' || !r.old_values || !r.new_values) return [];
  return Object.keys(r.new_values).filter(k => !['updated_at'].includes(k) && JSON.stringify(r.old_values![k]) !== JSON.stringify(r.new_values![k]));
};

/** Platform Manager > Audit log: who changed what, when and why. */
export default function AuditConsole() {
  const api = useOpsApi();
  const params = useSearchParams();
  const [source, setSource] = useState<Source>(params.get('source') === 'data' ? 'data' : 'console');
  const [school, setSchool] = useState(params.get('school') ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [schools, setSchools] = useState<RegistrySchool[]>([]);
  const [rows, setRows] = useState<(ConsoleRow | DataRow)[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api<RegistrySchool[]>('/schools').then(setSchools).catch(() => {}); }, [api]);
  useEffect(() => {
    let live = true;
    const sp = new URLSearchParams({ source, ...(school ? { school } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) });
    api<{ rows: (ConsoleRow | DataRow)[] }>(`/audit?${sp}`)
      .then(d => { if (live) { setRows(d.rows); setErr(null); } })
      .catch(e => { if (live) { setErr(errText(e)); setRows([]); } });
    return () => { live = false; };
  }, [api, source, school, from, to]);

  const name = (id: string | null) => (id ? schools.find(s => s.id === id)?.name ?? 'Deleted school' : 'Platform');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!rows || !needle) return rows ?? [];
    return rows.filter(r => JSON.stringify(r).toLowerCase().includes(needle));
  }, [rows, q]);

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (source === 'console') {
      downloadCsv(`sthara-console-changes-${stamp}.csv`, [['When (IST)', 'Scope', 'School', 'Setting', 'From', 'To', 'Reason', 'By'],
        ...(shown as ConsoleRow[]).map(r => [fmtDateTime(r.at), r.scope, r.scope === 'school' ? name(r.school_id) : '', label(r), val(r, r.old_value), val(r, r.new_value), r.reason, r.actor_email])]);
    } else {
      downloadCsv(`sthara-data-audit-${stamp}.csv`, [['When (IST)', 'School', 'Action', 'Table', 'Record', 'Changed fields', 'By', 'Role'],
        ...(shown as DataRow[]).map(r => [fmtDateTime(r.at), name(r.school_id), r.action, r.table_name, r.row_id, changedKeys(r).join(' '), r.actor, r.actor_role])]);
    }
  };

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Audit log"
        sub="Every change made in this console, and the database's own audit trail of sensitive writes."
        actions={<button className="btn" onClick={exportCsv} disabled={!shown.length}><DownloadSimple size={15} weight="bold" /> Export CSV</button>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}

      <div className="seg" role="tablist" aria-label="Audit source" style={{ marginBottom: 18 }}>
        <button role="tab" aria-selected={source === 'console'} className={source === 'console' ? 'on' : ''} onClick={() => { setRows(null); setSource('console'); }}>Console changes</button>
        <button role="tab" aria-selected={source === 'data'} className={source === 'data' ? 'on' : ''} onClick={() => { setRows(null); setSource('data'); }}>Data audit trail</button>
      </div>

      <div className="card">
        <div className="ops-filters">
          <input className="cmp-in" placeholder="Search within results" aria-label="Search within results" value={q} onChange={e => setQ(e.target.value)} />
          <select className="cmp-sel" aria-label="School" value={school} onChange={e => setSchool(e.target.value)}>
            <option value="">All schools{source === 'console' ? ' and platform' : ''}</option>
            {source === 'console' && <option value="platform">Platform only</option>}
            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="muted" style={{ fontSize: 12.5 }}>From <input type="date" className="cmp-in" style={{ width: 'auto' }} value={from} onChange={e => setFrom(e.target.value)} aria-label="From date" /></label>
          <label className="muted" style={{ fontSize: 12.5 }}>To <input type="date" className="cmp-in" style={{ width: 'auto' }} value={to} onChange={e => setTo(e.target.value)} aria-label="To date" /></label>
        </div>
        {rows === null ? <div>{[0, 1, 2, 3].map(i => <Skeleton key={i} h={44} style={{ marginBottom: 8 }} />)}</div> : (
          <>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>{num(shown.length)} entr{shown.length === 1 ? 'y' : 'ies'}{rows.length === 1000 ? ' (latest 1,000: narrow the dates to see older ones)' : ''}</div>
            {source === 'console' ? (
              <Table head={<tr><th>When</th><th>Where</th><th>Setting</th><th>Change</th><th>Reason</th><th>By</th></tr>}
                empty={!shown.length && <Empty icon={<ClockCounterClockwise size={26} weight="duotone" />} title="No changes match" />}>
                {(shown as ConsoleRow[]).map(r => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.at)}</td>
                    <td>{r.scope === 'platform' ? <Chip tone="p">PLATFORM</Chip> : name(r.school_id)}</td>
                    <td className="nm">{label(r)}</td>
                    <td><span className="muted">{val(r, r.old_value)}</span> → <b>{val(r, r.new_value)}</b></td>
                    <td>{r.reason}</td>
                    <td className="muted" style={{ overflowWrap: 'anywhere' }}>{r.actor_email ?? '—'}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Table head={<tr><th>When</th><th>School</th><th>Action</th><th>Record</th><th>Changed</th><th>By</th></tr>}
                empty={!shown.length && <Empty icon={<ClockCounterClockwise size={26} weight="duotone" />} title="Nothing audited in this window" />}>
                {(shown as DataRow[]).map(r => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.at)}</td>
                    <td>{name(r.school_id)}</td>
                    <td><Chip tone={r.action === 'DELETE' ? 'r' : r.action === 'INSERT' ? 'g' : 'b'}>{r.action}</Chip></td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.table_name}{r.row_id ? ` · ${r.row_id.slice(0, 8)}` : ''}</td>
                    <td style={{ fontSize: 12.5 }}>{changedKeys(r).slice(0, 6).join(', ') || '—'}</td>
                    <td>{r.actor}{r.actor_role ? <div className="sub">{r.actor_role}</div> : null}</td>
                  </tr>
                ))}
              </Table>
            )}
          </>
        )}
      </div>
    </>
  );
}
