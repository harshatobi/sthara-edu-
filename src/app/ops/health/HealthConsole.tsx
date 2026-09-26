'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { STATUS_ORDER, summarise, type InventoryItem, type Status } from '@/lib/settings/inventory';
import { Section, errText, fmtDateTime } from '../_ui';
import { useOpsApi } from '../useOpsApi';

const STATUS: Record<Status, { label: string; color: string; tone: Tone }> = {
  crit: { label: 'Critical', color: '#E11D48', tone: 'r' },
  warn: { label: 'Warning', color: '#F59E0B', tone: 'a' },
  info: { label: 'Note', color: '#4C8DFF', tone: 'b' },
  ok: { label: 'Healthy', color: '#10B981', tone: 'g' },
};
const SOURCE: Record<string, string> = {
  environment: 'Vercel env', platform: 'Platform setting', school: 'Schools', database: 'Database', code: 'Code', runtime: 'Runtime',
};
/** Where in the console (or outside it) an item is fixed. */
const fixAt = (i: InventoryItem): { href: string; label: string } | null =>
  i.source === 'platform' ? { href: '/ops/settings', label: 'Platform settings' }
    : i.source === 'school' ? { href: '/ops/schools', label: 'Schools' }
    : i.source === 'environment' ? { href: 'https://vercel.com/dashboard', label: 'Vercel project settings' }
    : null;

/** Platform Manager > System health: every load-bearing check, problems first. */
export default function HealthConsole() {
  const api = useOpsApi();
  const [data, setData] = useState<{ items: InventoryItem[]; checkedAt: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const rerun = useCallback(() => { setLoading(true); setNonce(n => n + 1); }, []);

  useEffect(() => {
    let live = true;
    api<{ items: InventoryItem[]; checkedAt: string }>('/health')
      .then(d => { if (live) { setData(d); setErr(null); } })
      .catch(e => { if (live) setErr(errText(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [api, nonce]);

  // Deep links from the Overview (#check-id) open and scroll to that check.
  useEffect(() => {
    if (!data || typeof window === 'undefined' || !window.location.hash) return;
    const el = document.getElementById(window.location.hash.slice(1));
    if (el) { el.closest('details')?.setAttribute('open', ''); el.scrollIntoView({ block: 'center' }); }
  }, [data]);

  const counts = useMemo(() => (data ? summarise(data.items) : null), [data]);
  const problems = (data?.items ?? []).filter(i => i.status === 'crit' || i.status === 'warn').sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const groups = [...new Set((data?.items ?? []).map(i => i.group))];

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="System health"
        sub={counts ? <>{counts.crit} critical · {counts.warn} warnings · {counts.ok} healthy · checked {fmtDateTime(data!.checkedAt)}</> : 'Keys, runtime, database, schools and limits: everything the product depends on.'}
        actions={<button className="btn" onClick={rerun} disabled={loading}><ArrowsClockwise size={15} weight="bold" /> {loading ? 'Checking…' : 'Run checks again'}</button>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}

      {!data || !counts ? (err ? null : <><Skeleton h={90} style={{ borderRadius: 16, marginBottom: 18 }} /><Skeleton h={300} style={{ borderRadius: 20 }} /></>) : (
        <div style={{ opacity: loading ? 0.6 : 1 }}>
          <div className="os-sum" role="group" aria-label="Filter checks by status">
            {(['crit', 'warn', 'info', 'ok'] as Status[]).map(s => (
              <button key={s} className={filter === s ? 'on' : ''} aria-pressed={filter === s} onClick={() => setFilter(f => (f === s ? 'all' : s))}>
                <div className="t"><span className="os-dot" style={{ background: STATUS[s].color }} />{STATUS[s].label.toUpperCase()}</div>
                <div className="n">{counts[s]}</div>
              </button>
            ))}
          </div>

          {filter === 'all' && (
            <Section title="Problems" sub={problems.length ? 'Fix these first. Each says what breaks and where it is fixed.' : undefined}>
              {!problems.length
                ? <Empty icon={<CheckCircle size={28} weight="duotone" />} title="No problems">Every critical check passes.</Empty>
                : problems.map(i => {
                  const fx = fixAt(i);
                  return (
                    <div className="ops-q" key={i.id} id={i.id}>
                      <span className="os-dot ic" style={{ background: STATUS[i.status].color, width: 10, height: 10, marginTop: 6 }} aria-label={STATUS[i.status].label} />
                      <div className="tx">
                        <b>{i.label}</b> <Chip tone={STATUS[i.status].tone}>{i.value}</Chip> <span className="muted" style={{ fontSize: 12 }}>{SOURCE[i.source] ?? i.source}</span>
                        <p>{i.detail}</p>
                        {!!i.items?.length && <div className="os-list" style={{ marginTop: 6 }}>{i.items.slice(0, 20).map(x => <span key={x}>{x}</span>)}{i.items.length > 20 && <span>+{i.items.length - 20} more</span>}</div>}
                        {!!i.enforcedAt?.length && <p style={{ fontSize: 12 }}>Enforced at {i.enforcedAt.map(e => <code key={e} style={{ marginRight: 6 }}>{e}</code>)}</p>}
                      </div>
                      {fx && <div className="ac">{fx.href.startsWith('http')
                        ? <a className="btn sm" href={fx.href} target="_blank" rel="noreferrer">{fx.label} <ArrowRight size={13} weight="bold" /></a>
                        : <Link className="btn sm" href={fx.href}>{fx.label} <ArrowRight size={13} weight="bold" /></Link>}</div>}
                    </div>
                  );
                })}
            </Section>
          )}

          <Section title="All checks" sub={filter === 'all' ? 'Grouped by where the setting lives. Groups with a problem start open.' : `Showing ${STATUS[filter].label.toLowerCase()} only.`}>
            {groups.map(g => {
              const rows = data.items.filter(i => i.group === g && (filter === 'all' || i.status === filter)).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
              if (!rows.length) return null;
              const c = summarise(rows);
              return (
                <details key={g} className="ops-grp" open={filter !== 'all' || c.crit + c.warn > 0}>
                  <summary>
                    <b>{g}</b>
                    <span className="muted" style={{ fontSize: 12.5 }}>{rows.length} checks</span>
                    {c.crit > 0 && <Chip tone="r">{c.crit} CRITICAL</Chip>}
                    {c.warn > 0 && <Chip tone="a">{c.warn} WARNING</Chip>}
                    {c.crit + c.warn === 0 && <Chip tone="g">OK</Chip>}
                    <CaretDown size={14} weight="bold" style={{ marginLeft: 'auto' }} />
                  </summary>
                  <div className="tbl-wrap">
                    <table className="tbl ops-tbl">
                      <thead><tr><th>Check</th><th>Value</th><th>Status</th><th>What it means</th></tr></thead>
                      <tbody>
                        {rows.map(i => (
                          <tr key={i.id} id={i.id}>
                            <td><div className="nm">{i.label}</div><div className="sub">{SOURCE[i.source] ?? i.source}</div></td>
                            <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{i.value}</td>
                            <td><Chip tone={STATUS[i.status].tone}>{STATUS[i.status].label.toUpperCase()}</Chip></td>
                            <td style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.5, minWidth: 260 }}>{i.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </Section>
        </div>
      )}
    </>
  );
}
