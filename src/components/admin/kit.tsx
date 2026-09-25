'use client';

/**
 * Shared pieces for the canon admin pages: the desk gate (loading / error /
 * no-school states), KPI tiles, the full-screen workspace, form fields and
 * CSV export. Canon class names only — pair with src/styles/canon.css.
 */
import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { DatabaseIcon as Database } from '@phosphor-icons/react/dist/ssr/Database';
import { BuildingsIcon as Buildings } from '@phosphor-icons/react/dist/ssr/Buildings';
import { LockKeyIcon as LockKey } from '@phosphor-icons/react/dist/ssr/LockKey';
import { PERMS, ROLES, ROLE_KEYS, type Perm } from '@/lib/admin/rbac';
import { Empty, Skeleton } from '@/components/canon/ui';
import { useAuth } from '@/contexts/AuthContext';
import type { AdminDesk } from '@/lib/admin/desk';
import { toCsv } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';

const TABLE_NAMES: Record<string, string> = {
  fee_structures: 'fees', fee_invoices: 'fees', fee_payments: 'fees', fee_reminders: 'fees', admission_applicants: 'admissions',
  leave_requests: 'leave', school_filings: 'CBSE filing', school_wellness_report: 'school wellness report',
  consents: 'consents', guardians: 'guardians', lesson_plans: 'lesson plans', proctor_alerts: 'proctoring',
};

/** Renders children with the loaded desk, or the right loading / error / setup / no-access state. `need`: any one of. */
export function DeskGate({ children, skeleton, need }: { children: (desk: AdminDesk) => ReactNode; skeleton?: ReactNode; need?: Perm | Perm[] }) {
  const { desk, error } = useAdminDesk();
  const { profile } = useAuth();
  if (profile && !profile.schoolId) {
    return (
      <div className="card"><Empty icon={<Buildings size={26} weight="duotone" />} title="No school on this account">
        The command centre shows one school. Operators manage schools from the operator console.
      </Empty></div>
    );
  }
  if (error) return <div className="note err" role="alert">Couldn&apos;t load the school: {error}</div>;
  if (!desk) return <>{skeleton ?? <PageSkeleton />}</>;
  const needs = need ? (Array.isArray(need) ? need : [need]) : [];
  if (needs.length && !desk.me.access.any(...needs)) return <NoAccess desk={desk} need={needs} />;
  return <>{children(desk)}</>;
}

function NoAccess({ desk, need }: { desk: AdminDesk; need: Perm[] }) {
  const roles = ROLE_KEYS.filter(r => ROLES[r].perms.includes(need[0]) && r !== 'school_admin').map(r => ROLES[r].label);
  return (
    <div className="card">
      <Empty icon={<LockKey size={26} weight="duotone" />} title="Your role doesn't include this">
        This page needs permission to {PERMS[need[0]].charAt(0).toLowerCase()}{PERMS[need[0]].slice(1)}. You&apos;re signed in as {desk.me.access.label}.
        {roles.length ? ` Roles that include it: ${roles.join(', ')}.` : ''} A school admin can change your roles.
      </Empty>
    </div>
  );
}

/** A notice when a module's tables aren't in the database yet (migration not applied). */
export function MissingNotice({ desk, tables }: { desk: AdminDesk; tables: string[] }) {
  const gone = tables.filter(t => desk.missing.includes(t));
  if (!gone.length) return null;
  const what = [...new Set(gone.map(t => TABLE_NAMES[t] || t))].join(', ');
  return (
    <div className="note info" role="status" style={{ marginBottom: 18, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Database size={18} weight="duotone" style={{ flex: '0 0 auto', marginTop: 1 }} />
      <span>The {what} tables aren&apos;t in this database yet, so this section is empty and changes won&apos;t save. It fills in once the admin ERP migration is applied.</span>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="pbar"><div style={{ flex: 1 }}><Skeleton h={12} w={140} /><Skeleton h={30} w={280} style={{ marginTop: 10 }} /><Skeleton h={12} w={360} style={{ marginTop: 10 }} /></div></div>
      <div className="kpis">{[0, 1, 2, 3].map(i => <div className="kpi" key={i}><Skeleton h={12} w={110} /><Skeleton h={40} w={90} style={{ marginTop: 12 }} /><Skeleton h={12} w={150} style={{ marginTop: 12 }} /></div>)}</div>
      <div className="g2">{[0, 1].map(i => <div className="card" key={i}>{[0, 1, 2, 3, 4].map(j => <Skeleton key={j} h={18} style={{ marginBottom: 14 }} />)}</div>)}</div>
    </div>
  );
}

export function Kpi({ label, value, note, noteColor, valueColor, icon: Icon, href, onClick, small }: {
  label: string; value: ReactNode; note?: ReactNode; noteColor?: string; valueColor?: string; icon?: PhosphorIcon;
  href?: string; onClick?: () => void; small?: boolean;
}) {
  const body = (
    <>
      <div className="lb">{label}</div>
      <div className="vl" style={{ color: valueColor, fontSize: small ? 34 : undefined }}>{value}</div>
      {note !== undefined && <div className="nt" style={{ color: noteColor ?? 'var(--mut)' }}>{note}</div>}
      {Icon && <div className="gh" aria-hidden="true"><Icon size={64} weight="fill" /></div>}
    </>
  );
  if (href) return <Link className="kpi kpi-link" href={href}>{body}</Link>;
  if (onClick) return <button type="button" className="kpi kpi-link" onClick={onClick}>{body}</button>;
  return <div className="kpi">{body}</div>;
}

export function CardHead({ title, sub, right, id }: { title: string; sub?: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: sub ? 16 : 14, flexWrap: 'wrap' }} id={id}>
      <div>
        <h3 style={{ fontSize: 19, fontWeight: 800 }}>{title}</h3>
        {sub && <p className="muted" style={{ marginTop: 4, fontSize: 13.5 }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** Full-screen workspace (mockup #workspace) with Escape to close and focus moved inside. */
export function Workspace({ title, sub, onClose, children, actions, wide }: {
  title: string; sub?: string; onClose: () => void; children: ReactNode; actions?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.ws-back)')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="ws" role="dialog" aria-modal="true" aria-labelledby="ws-title" ref={ref}>
      <div className="ws-head">
        <button className="ws-back" onClick={onClose}><ArrowLeft size={15} weight="bold" /> Close</button>
        <div style={{ flex: 1 }}><h1 id="ws-title">{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
        {actions}
      </div>
      <div className="ws-body"><div className="cmp" style={wide ? { maxWidth: 1120 } : undefined}>{children}</div></div>
    </div>
  );
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="cmp-fld">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  // BOM so Excel opens rupee signs and Indian names correctly.
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
