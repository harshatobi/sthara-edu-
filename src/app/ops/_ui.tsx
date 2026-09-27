'use client';

import { useState, type ReactNode } from 'react';
import { Chip, type Tone } from '@/components/canon/ui';
import { PLAN_INFO, REASON_MIN, type Plan } from '@/lib/settings/registry';
import type { SchoolFacts } from '@/lib/settings/inventory';

// ── Formatting (always IST, always with the year) ────────────────────────────

const TZ = 'Asia/Kolkata';
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '—';
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—';
export const dayIST = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }) : '');
export const num = (n: number) => n.toLocaleString('en-IN');
export const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
export const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

/** ₹ in Indian units: ₹2,500 · ₹4.38 L · ₹1.2 Cr. */
export function inr(n: number | null | undefined, exact = false) {
  if (n === null || n === undefined) return '—';
  if (!exact && n >= 1e7) return `₹${(n / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (!exact && n >= 1e5) return `₹${(n / 1e5).toFixed(2).replace(/\.?0+$/, '')} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const url = URL.createObjectURL(new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Chips ─────────────────────────────────────────────────────────────────────

const PLAN_TONE: Record<Plan, Tone> = { pilot: 'a', aadhara: 'n', sthamba: 'b', shikhara: 'g', mandala: 'p' };
export function PlanChip({ plan }: { plan: Plan }) {
  return <Chip tone={PLAN_TONE[plan]} title={PLAN_INFO[plan].note}>{PLAN_INFO[plan].label.toUpperCase()}</Chip>;
}

/** Where a school stands commercially and operationally, as one word. */
export function schoolStatus(s: Pick<SchoolFacts, 'active' | 'plan' | 'trialExpired' | 'trialDaysLeft'>): { label: string; tone: Tone; rank: number } {
  if (!s.active) return { label: 'Suspended', tone: 'r', rank: 0 };
  if (s.plan === 'pilot' && s.trialExpired) return { label: 'Pilot ended', tone: 'r', rank: 1 };
  if (s.plan === 'pilot' && s.trialDaysLeft !== null && s.trialDaysLeft <= 14) return { label: 'Pilot ending', tone: 'a', rank: 2 };
  if (s.plan === 'pilot') return { label: 'Pilot running', tone: 'b', rank: 3 };
  return { label: 'Live', tone: 'g', rank: 4 };
}
export function StatusChip({ s }: { s: Parameters<typeof schoolStatus>[0] }) {
  const st = schoolStatus(s);
  return <Chip tone={st.tone}>{st.label.toUpperCase()}</Chip>;
}

// ── Layout pieces ─────────────────────────────────────────────────────────────

export function Kpi({ label, value, note, tone, onClick }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'r' | 'a' | 'g'; onClick?: () => void }) {
  const color = tone === 'r' ? 'var(--red)' : tone === 'a' ? '#B45309' : tone === 'g' ? '#047857' : undefined;
  const body = (
    <>
      <div className="lb">{label}</div>
      <div className="vl" style={{ fontSize: 36, color }}>{value}</div>
      {note && <div className="nt" style={{ color: 'var(--mut)' }}>{note}</div>}
    </>
  );
  return onClick
    ? <button type="button" className="kpi ops-kpi-btn" onClick={onClick} style={{ textAlign: 'left' }}>{body}</button>
    : <div className="kpi">{body}</div>;
}

export function Section({ title, sub, actions, children, id }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="card ops-sec" id={id} aria-label={typeof title === 'string' ? title : undefined}>
      <div className="ops-sec-hd">
        <div style={{ minWidth: 0 }}>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div className="acts" style={{ marginLeft: 'auto' }}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Label + value rows for a record's details. */
export function Facts({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="ops-facts">
      {rows.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

/**
 * A one-click action that still needs a reason for the change log:
 * the button opens a small inline form; confirm runs `run(reason)`.
 */
export function ReasonAction({ label, confirm, danger, placeholder, run, extra, disabled }: {
  label: ReactNode;
  confirm: string;
  danger?: boolean;
  placeholder?: string;
  run: (reason: string) => Promise<void>;
  /** Extra inputs shown above the reason (e.g. a curriculum picker). */
  extra?: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button type="button" className={`btn sm${danger ? ' red' : ''}`} disabled={disabled} onClick={() => setOpen(true)}>{label}</button>;
  return (
    <form className="ops-reason" onSubmit={async e => {
      e.preventDefault();
      setBusy(true); setErr(null);
      try { await run(reason.trim()); setOpen(false); setReason(''); } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
    }}>
      {extra}
      <input className="cmp-in" autoFocus maxLength={500} value={reason} onChange={e => setReason(e.target.value)}
        placeholder={placeholder ?? 'Reason (kept in the audit log)'} aria-label="Reason for the change" />
      <div className="acts">
        <button className={`btn sm ${danger ? 'red' : 'pri'}`} disabled={busy || reason.trim().length < REASON_MIN}>{busy ? 'Working…' : confirm}</button>
        <button type="button" className="btn sm" onClick={() => { setOpen(false); setErr(null); }}>Cancel</button>
      </div>
      {err && <div className="note err" role="alert">{err}</div>}
    </form>
  );
}

/** A table that scrolls sideways inside its card on narrow screens. */
export function Table({ head, children, empty }: { head: ReactNode; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl ops-tbl">
        <thead>{head}</thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}
