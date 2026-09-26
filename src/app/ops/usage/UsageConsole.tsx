'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { BuildingsIcon as Buildings } from '@phosphor-icons/react/dist/ssr/Buildings';
import { ChartBarIcon as ChartBar } from '@phosphor-icons/react/dist/ssr/ChartBar';
import { CpuIcon as Cpu } from '@phosphor-icons/react/dist/ssr/Cpu';
import { ListBulletsIcon as ListBullets } from '@phosphor-icons/react/dist/ssr/ListBullets';
import { ReceiptIcon as Receipt } from '@phosphor-icons/react/dist/ssr/Receipt';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { UsersIcon as Users } from '@phosphor-icons/react/dist/ssr/Users';
import { WarningCircleIcon as WarningCircle } from '@phosphor-icons/react/dist/ssr/WarningCircle';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { featureLabel, type ModelPrice } from '@/lib/ai/pricing';
import { RANGES, daysInIstMonth, type RangeKey } from '@/lib/ai/window';
import { useOpsApi } from '../useOpsApi';
import OpsFrame from '../OpsFrame';

interface Totals {
  calls: number; failed: number; input: number; output: number; thinking: number; cached: number;
  tokens: number; cost: number; unpriced: number; avgLatency: number | null; users: number; schools: number;
}
interface Day { day: string; calls: number; tokens: number; cost: number }
interface FeatureRow { key: string; calls: number; failed: number; input: number; output: number; tokens: number; cost: number; avgLatency: number | null }
interface SchoolRow { id: string | null; name: string; calls: number; users: number; tokens: number; cost: number }
interface ModelRow { model: string; calls: number; input: number; cached: number; output: number; thinking: number; cost: number }
interface UserRow { id: string; name: string; role: string | null; school: string | null; calls: number; tokens: number; cost: number }
interface CallRow {
  id: number; at: string; feature: string; model: string; school: string | null; user: string | null;
  input: number; output: number; cost: number | null; ok: boolean; latency: number | null; error: string | null;
}
interface Data {
  window: { from: string; to: string; label: string; days: number; key: string };
  usage: { totals: Totals; daily: Day[]; features: FeatureRow[]; schools: SchoolRow[]; models: ModelRow[]; users: UserRow[]; recent: CallRow[] };
  prices: Record<string, ModelPrice>;
  pricesChecked: string;
  usdToInr: number;
  models: Record<string, string>;
  features: Record<string, { label: string; who: string }>;
  checkedAt: string;
}
type Tab = 'features' | 'schools' | 'users' | 'models' | 'calls' | 'prices';
type Currency = 'INR' | 'USD';
type Metric = 'cost' | 'tokens' | 'calls';

const RANGE_ORDER: RangeKey[] = ['today', '7d', '30d', 'mtd', 'lastmonth', '90d'];
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const shortDay = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const num = (n: number) => n.toLocaleString('en-IN');
/** 1,23,45,678 -> 1.23 Cr style is for rupees; tokens read better as K / M. */
const compact = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : num(n));

function useMoney(currency: Currency, rate: number) {
  return useCallback((usd: number | null | undefined) => {
    if (usd === null || usd === undefined) return '—';
    const v = currency === 'INR' ? usd * rate : usd;
    const sym = currency === 'INR' ? '₹' : '$';
    const digits = v === 0 ? 2 : Math.abs(v) < 0.01 ? 4 : 2;
    return `${sym}${v.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  }, [currency, rate]);
}

/** Operator console > AI usage: tokens and spend on the model APIs, by feature, school, user and model. */
export default function UsageConsole({ devPreview }: { devPreview: boolean }) {
  const api = useOpsApi();
  const [range, setRange] = useState<RangeKey>('30d');
  const [currency, setCurrency] = useState<Currency>('INR');
  const [tab, setTab] = useState<Tab>('features');
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => { setLoading(true); setNonce(n => n + 1); }, []);
  const pickRange = (k: RangeKey) => { if (k !== range) { setLoading(true); setRange(k); } };

  useEffect(() => {
    let live = true;
    api<Data>(`/usage?range=${range}`)
      .then(d => { if (live) { setData(d); setErr(null); } })
      .catch((e: unknown) => { if (live) setErr(errText(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [api, range, nonce]);

  const money = useMoney(currency, data?.usdToInr ?? 88);
  const t = data?.usage.totals;

  return (
    <OpsFrame devPreview={devPreview}>
      <PageBar eyebrow="OPERATOR CONSOLE" title="AI usage & cost"
        sub={data ? <>{data.window.label} · list prices checked {data.pricesChecked} · updated {when(data.checkedAt)}</> : 'Tokens and spend on the AI model APIs, call by call.'}
        actions={<>
          <Link className="btn" href="/ops">Schools</Link>
          <Link className="btn" href="/ops/settings">Settings</Link>
          <button className="btn" onClick={reload} disabled={loading} aria-label="Refresh">
            <ArrowsClockwise size={15} weight="bold" /> {loading ? 'Loading…' : 'Refresh'}
          </button>
        </>} />

      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 18 }}>
        <div className="seg" role="radiogroup" aria-label="Time window">
          {RANGE_ORDER.map(k => (
            <button key={k} role="radio" aria-checked={range === k} className={range === k ? 'on' : ''} onClick={() => pickRange(k)}>{RANGES[k]}</button>
          ))}
        </div>
        <div className="seg" role="radiogroup" aria-label="Currency" style={{ marginLeft: 'auto' }}>
          {(['INR', 'USD'] as Currency[]).map(c => (
            <button key={c} role="radio" aria-checked={currency === c} className={currency === c ? 'on' : ''} onClick={() => setCurrency(c)}>{c === 'INR' ? '₹ INR' : '$ USD'}</button>
          ))}
        </div>
      </div>

      {!data || !t ? (
        err ? null : (
          <div>
            <div className="kpis">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={140} style={{ borderRadius: 20 }} />)}</div>
            <Skeleton h={300} style={{ borderRadius: 20 }} />
          </div>
        )
      ) : (
        <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
          <Kpis data={data} money={money} currency={currency} />
          {t.calls === 0 ? (
            <div className="card">
              <Empty icon={<Sparkle size={28} weight="duotone" />} title="No AI calls in this window">
                Every call to the model API is metered from the moment this release is live. Pick a longer window, or use an AI feature (the tutor, a quiz creator) and refresh.
              </Empty>
            </div>
          ) : (
            <>
              <DailyChart data={data} money={money} />
              <div className="seg" role="tablist" aria-label="Breakdown" style={{ margin: '22px 0 18px' }}>
                {([['features', 'By feature', Sparkle], ['schools', 'By school', Buildings], ['users', 'Top users', Users],
                  ['models', 'By model', Cpu], ['calls', 'Recent calls', ListBullets], ['prices', 'Price list', Receipt]] as const)
                  .map(([k, label, Icon]) => (
                    <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <Icon size={15} weight={tab === k ? 'fill' : 'bold'} /> {label}
                    </button>
                  ))}
              </div>
              {tab === 'features' ? <FeatureTable data={data} money={money} />
                : tab === 'schools' ? <SchoolTable data={data} money={money} />
                : tab === 'users' ? <UserTable data={data} money={money} />
                : tab === 'models' ? <ModelTable data={data} money={money} />
                : tab === 'calls' ? <CallTable data={data} money={money} />
                : <PriceList data={data} currency={currency} />}
            </>
          )}
          {t.calls === 0 && <div style={{ marginTop: 18 }}><PriceList data={data} currency={currency} /></div>}
        </div>
      )}
    </OpsFrame>
  );
}

type Money = (usd: number | null | undefined) => string;

// ── Headline numbers ──────────────────────────────────────────────────────────

function Kpis({ data, money, currency }: { data: Data; money: Money; currency: Currency }) {
  const t = data.usage.totals;
  const isMtd = data.window.key === 'mtd';
  const perDay = data.window.days > 0 ? t.cost / data.window.days : 0;
  const projected = isMtd ? perDay * daysInIstMonth() : perDay * 30;
  const failRate = t.calls ? Math.round((t.failed / t.calls) * 1000) / 10 : 0;
  return (
    <div className="kpis">
      <div className="kpi">
        <div className="lb">SPEND</div>
        <div className="vl">{money(t.cost)}</div>
        <div className="nt" style={{ color: 'var(--mut)' }}>
          {currency === 'INR' ? `${money(perDay)} a day · at ₹${data.usdToInr}/$` : `${money(perDay)} a day`}
        </div>
      </div>
      <div className="kpi">
        <div className="lb">{isMtd ? 'PROJECTED MONTH' : 'AT THIS RATE, 30 DAYS'}</div>
        <div className="vl">{money(projected)}</div>
        <div className="nt" style={{ color: 'var(--mut)' }}>Straight-line from {data.window.days} day{data.window.days === 1 ? '' : 's'} of use</div>
      </div>
      <div className="kpi">
        <div className="lb">TOKENS</div>
        <div className="vl">{compact(t.tokens)}</div>
        <div className="nt" style={{ color: 'var(--mut)' }}>
          {compact(t.input)} in · {compact(t.output)} out · {compact(t.thinking)} thinking
        </div>
      </div>
      <div className="kpi">
        <div className="lb">CALLS</div>
        <div className="vl">{num(t.calls)}</div>
        <div className="nt" style={{ color: t.failed ? 'var(--red)' : 'var(--mut)' }}>
          {t.failed ? <><WarningCircle size={15} weight="fill" /> {num(t.failed)} failed ({failRate}%)</> : 'None failed'}
          {t.calls ? <span style={{ color: 'var(--mut)' }}> · {money(t.cost / t.calls)} each</span> : null}
        </div>
      </div>
      {t.unpriced > 0 && (
        <div className="note warn" style={{ gridColumn: '1 / -1' }}>
          {num(t.unpriced)} call{t.unpriced === 1 ? '' : 's'} used a model with no price on file, so the spend above is understated. Add it to MODEL_PRICES in src/lib/ai/pricing.ts.
        </div>
      )}
    </div>
  );
}

// ── Daily chart (single series: one hue, no legend, hover tooltip, table below) ─

function DailyChart({ data, money }: { data: Data; money: Money }) {
  const [metric, setMetric] = useState<Metric>('cost');
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the container's real pixel width, so text stays 11px on a phone instead of scaling down.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Every IST day in the window, zero-filled, so gaps read as quiet days rather than missing bars.
  const days = useMemo(() => {
    const byDay = new Map(data.usage.daily.map(d => [d.day, d]));
    const out: Day[] = [];
    const start = new Date(new Date(data.window.from).getTime() + 330 * 60_000);
    for (let i = 0; i < data.window.days; i++) {
      const key = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i)).toISOString().slice(0, 10);
      out.push(byDay.get(key) ?? { day: key, calls: 0, tokens: 0, cost: 0 });
    }
    return out;
  }, [data]);

  const val = (d: Day) => (metric === 'cost' ? Number(d.cost) : metric === 'tokens' ? d.tokens : d.calls);
  const fmt = (v: number) => (metric === 'cost' ? money(v) : metric === 'tokens' ? compact(v) : num(v));
  const max = Math.max(...days.map(val), 0) || 1;
  const H = W < 500 ? 180 : 220, padL = 4, padR = 64, padT = 12, padB = 26;
  const slot = (W - padL - padR) / days.length;
  const bw = Math.max(2, Math.min(28, slot - 2));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0.5, 1];
  const labelEvery = Math.ceil(days.length / Math.max(2, Math.floor((W - padR) / 70)));
  const h = hover !== null ? days[hover] : null;

  return (
    <div className="card">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
          <ChartBar size={18} weight="duotone" /> {metric === 'cost' ? 'Spend' : metric === 'tokens' ? 'Tokens' : 'Calls'} per day
        </div>
        <div className="seg" role="radiogroup" aria-label="Chart measure" style={{ marginLeft: 'auto' }}>
          {(['cost', 'tokens', 'calls'] as Metric[]).map(m => (
            <button key={m} role="radio" aria-checked={metric === m} className={metric === m ? 'on' : ''} onClick={() => setMetric(m)}>
              {m === 'cost' ? 'Spend' : m === 'tokens' ? 'Tokens' : 'Calls'}
            </button>
          ))}
        </div>
      </div>
      <div ref={box} style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${metric} per day, ${data.window.label}`} style={{ display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setHover(null)}>
          {ticks.map(f => (
            <g key={f}>
              <line x1={padL} x2={W - padR} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeDasharray="3 4" />
              <text x={W - padR + 8} y={y(max * f) + 4} textAnchor="start" fontSize="11" fill="var(--mut)">{fmt(max * f)}</text>
            </g>
          ))}
          <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="var(--line)" />
          {days.map((d, i) => {
            const v = val(d);
            const x = padL + i * slot + (slot - bw) / 2;
            const top = y(v);
            const bh = Math.max(0, H - padB - top);
            const r = Math.min(4, bw / 2, bh);
            return (
              <g key={d.day}>
                {bh > 0 && (
                  <path fill="var(--blue)" opacity={hover === null || hover === i ? 1 : 0.45}
                    d={`M${x},${H - padB} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - padB} Z`} />
                )}
                {/* hit target: the whole column, wider than the bar */}
                <rect x={padL + i * slot} y={padT} width={slot} height={H - padT - padB} fill="transparent"
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${shortDay(d.day)}: ${fmt(v)}`} />
                {i % labelEvery === 0 && (
                  <text x={padL + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--mut)">{shortDay(d.day)}</text>
                )}
              </g>
            );
          })}
        </svg>
        {h && hover !== null && (
          <div role="status" style={{
            position: 'absolute', top: 0, pointerEvents: 'none',
            left: `${Math.min(80, Math.max(0, ((padL + hover * slot + slot / 2) / W) * 100 - 10))}%`,
            background: 'var(--ink)', color: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, lineHeight: 1.5, boxShadow: 'var(--sh)', whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: 800 }}>{shortDay(h.day)}</div>
            <div>{money(Number(h.cost))} · {compact(h.tokens)} tokens · {num(h.calls)} calls</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Breakdown tables ──────────────────────────────────────────────────────────

function Share({ part, whole }: { part: number; whole: number }) {
  const pct = whole > 0 ? (part / whole) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
      <div style={{ width: 70, height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--blue)', borderRadius: 3 }} />
      </div>
      <span style={{ minWidth: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct < 1 && pct > 0 ? '<1' : Math.round(pct)}%</span>
    </div>
  );
}

function FeatureTable({ data, money }: { data: Data; money: Money }) {
  const t = data.usage.totals;
  return (
    <div className="card"><div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>Feature</th><th>Used by</th><th className="r">Calls</th><th className="r">Tokens in</th><th className="r">Tokens out</th><th className="r">Avg time</th><th className="r">Per call</th><th className="r">Spend</th><th className="r">Share</th></tr></thead>
      <tbody>{data.usage.features.map(f => (
        <tr key={f.key}>
          <td style={{ fontWeight: 700 }}>{featureLabel(f.key)}{f.failed > 0 && <> <Chip tone="r">{f.failed} failed</Chip></>}</td>
          <td style={{ color: 'var(--mut)' }}>{data.features[f.key]?.who ?? '—'}</td>
          <td className="r">{num(f.calls)}</td>
          <td className="r">{compact(f.input)}</td>
          <td className="r">{compact(f.output)}</td>
          <td className="r">{f.avgLatency !== null ? `${(f.avgLatency / 1000).toFixed(1)}s` : '—'}</td>
          <td className="r">{money(f.calls ? Number(f.cost) / f.calls : 0)}</td>
          <td className="r" style={{ fontWeight: 700 }}>{money(Number(f.cost))}</td>
          <td className="r"><Share part={Number(f.cost)} whole={Number(t.cost)} /></td>
        </tr>
      ))}</tbody>
    </table></div></div>
  );
}

function SchoolTable({ data, money }: { data: Data; money: Money }) {
  const t = data.usage.totals;
  return (
    <div className="card"><div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>School</th><th className="r">Active users</th><th className="r">Calls</th><th className="r">Tokens</th><th className="r">Per user</th><th className="r">Spend</th><th className="r">Share</th></tr></thead>
      <tbody>{data.usage.schools.map(s => (
        <tr key={s.id ?? 'none'}>
          <td style={{ fontWeight: 700 }}>{s.id ? <Link href={`/ops/${s.id}`}>{s.name}</Link> : <span style={{ color: 'var(--mut)' }}>{s.name}</span>}</td>
          <td className="r">{num(s.users)}</td>
          <td className="r">{num(s.calls)}</td>
          <td className="r">{compact(s.tokens)}</td>
          <td className="r">{money(s.users ? Number(s.cost) / s.users : null)}</td>
          <td className="r" style={{ fontWeight: 700 }}>{money(Number(s.cost))}</td>
          <td className="r"><Share part={Number(s.cost)} whole={Number(t.cost)} /></td>
        </tr>
      ))}</tbody>
    </table></div></div>
  );
}

function UserTable({ data, money }: { data: Data; money: Money }) {
  if (!data.usage.users.length) return <div className="card"><Empty icon={<Users size={28} weight="duotone" />} title="No signed-in callers">Every call in this window came from a route without a user attached.</Empty></div>;
  return (
    <div className="card">
      <div style={{ color: 'var(--mut)', fontSize: 13, marginBottom: 12 }}>The 25 heaviest users in this window. Use it to spot runaway loops or misuse, not to judge anyone.</div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>User</th><th>Role</th><th>School</th><th className="r">Calls</th><th className="r">Tokens</th><th className="r">Spend</th></tr></thead>
        <tbody>{data.usage.users.map(u => (
          <tr key={u.id}>
            <td style={{ fontWeight: 700 }}>{u.name}</td>
            <td style={{ textTransform: 'capitalize', color: 'var(--mut)' }}>{u.role ?? '—'}</td>
            <td style={{ color: 'var(--mut)' }}>{u.school ?? '—'}</td>
            <td className="r">{num(u.calls)}</td>
            <td className="r">{compact(u.tokens)}</td>
            <td className="r" style={{ fontWeight: 700 }}>{money(Number(u.cost))}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function ModelTable({ data, money }: { data: Data; money: Money }) {
  return (
    <div className="card"><div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>Model</th><th className="r">Calls</th><th className="r">Input</th><th className="r">of which cached</th><th className="r">Output</th><th className="r">Thinking</th><th className="r">Spend</th></tr></thead>
      <tbody>{data.usage.models.map(m => (
        <tr key={m.model}>
          <td className="mono" style={{ fontWeight: 600 }}>{m.model}{!data.prices[m.model] && <> <Chip tone="a">no price</Chip></>}</td>
          <td className="r">{num(m.calls)}</td>
          <td className="r">{num(m.input)}</td>
          <td className="r">{num(m.cached)}</td>
          <td className="r">{num(m.output)}</td>
          <td className="r">{num(m.thinking)}</td>
          <td className="r" style={{ fontWeight: 700 }}>{money(Number(m.cost))}</td>
        </tr>
      ))}</tbody>
    </table></div></div>
  );
}

function CallTable({ data, money }: { data: Data; money: Money }) {
  return (
    <div className="card">
      <div style={{ color: 'var(--mut)', fontSize: 13, marginBottom: 12 }}>The 50 most recent calls in this window.</div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>When</th><th>Feature</th><th>Who</th><th>Model</th><th className="r">In</th><th className="r">Out</th><th className="r">Time</th><th className="r">Cost</th></tr></thead>
        <tbody>{data.usage.recent.map(c => (
          <tr key={c.id}>
            <td style={{ whiteSpace: 'nowrap' }}>{when(c.at)}</td>
            <td style={{ fontWeight: 700 }}>
              {featureLabel(c.feature)}
              {!c.ok && <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 600, display: 'flex', gap: 5, alignItems: 'center' }}><WarningCircle size={13} weight="fill" /> {c.error || 'Failed'}</div>}
            </td>
            <td style={{ color: 'var(--mut)' }}>{c.user ?? '—'}{c.school ? <div style={{ fontSize: 12 }}>{c.school}</div> : null}</td>
            <td className="mono" style={{ fontSize: 12 }}>{c.model}</td>
            <td className="r">{num(c.input)}</td>
            <td className="r">{num(c.output)}</td>
            <td className="r">{c.latency !== null ? `${(c.latency / 1000).toFixed(1)}s` : '—'}</td>
            <td className="r" style={{ fontWeight: 700 }}>{money(c.cost === null ? null : Number(c.cost))}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function PriceList({ data, currency }: { data: Data; currency: Currency }) {
  const rate = currency === 'INR' ? data.usdToInr : 1;
  const p = (usd: number) => `${currency === 'INR' ? '₹' : '$'}${(usd * rate).toFixed(2)}`;
  const inUse = new Set(Object.values(data.models));
  return (
    <div className="card">
      <div style={{ fontWeight: 800, marginBottom: 4 }}>Price list, per 1 million tokens</div>
      <div style={{ color: 'var(--mut)', fontSize: 13, marginBottom: 14 }}>
        Google Gemini API paid-tier list prices, checked {data.pricesChecked}. Thinking tokens bill as output. Each call is costed when it happens, so changing a price here never rewrites history.
        {currency === 'INR' && <> Rupee figures use ₹{data.usdToInr} to the dollar; Google bills in USD.</>}
      </div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Model</th><th className="r">Input</th><th className="r">Cached input</th><th className="r">Output</th><th>Notes</th></tr></thead>
        <tbody>{Object.entries(data.prices).map(([model, pr]) => (
          <tr key={model}>
            <td className="mono" style={{ fontWeight: 600 }}>{model} {inUse.has(model) ? <Chip tone="g">in use</Chip> : <Chip tone="n">not used</Chip>}</td>
            <td className="r">{p(pr.input)}</td>
            <td className="r">{p(pr.cached)}</td>
            <td className="r">{p(pr.output)}</td>
            <td style={{ color: 'var(--mut)', fontSize: 13 }}>{pr.long && pr.longAbove ? `Prompts over ${compact(pr.longAbove)} tokens: ${p(pr.long.input)} in, ${p(pr.long.output)} out` : '—'}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
