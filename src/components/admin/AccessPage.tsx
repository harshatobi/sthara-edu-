'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { KeyIcon as Key } from '@phosphor-icons/react/dist/ssr/Key';
import { UserPlusIcon as UserPlus } from '@phosphor-icons/react/dist/ssr/UserPlus';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { UserCircleIcon as UserCircle } from '@phosphor-icons/react/dist/ssr/UserCircle';
import { Chip, Empty, PageBar } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import type { AdminDesk } from '@/lib/admin/desk';
import { ago, daysBetween, fmtDate, isoDay, plural } from '@/lib/admin/format';
import { PERMS, ROLES, ROLE_KEYS, type Perm, type RoleKey } from '@/lib/admin/rbac';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { CardHead, DeskGate, Kpi } from './kit';

export default function AccessPage() {
  return <DeskGate need="access.manage">{desk => <Access desk={desk} />}</DeskGate>;
}

const GROUPS: [string, Perm[]][] = [
  ['Overview', ['dashboard.view', 'probe.view', 'boardpack.view']],
  ['Academics & staff', ['academics.read', 'workforce.read', 'leave.approve', 'leave.policy']],
  ['Fees', ['fees.read', 'fees.collect', 'fees.bill', 'fees.concession.request', 'fees.concession.approve', 'fees.void', 'fees.dayclose', 'fees.remind']],
  ['Admissions', ['admissions.read', 'admissions.manage']],
  ['Wellbeing & compliance', ['wellness.read', 'wellness.file', 'compliance.read', 'compliance.act', 'audit.read']],
  ['Administration', ['people.manage', 'access.manage']],
];

function Access({ desk }: { desk: AdminDesk }) {
  const { call, reload } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const [adding, setAdding] = useState<string | null>(null);
  const [role, setRole] = useState<RoleKey>('accountant');
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const today = isoDay();
  const office = desk.workforce.admins;
  const grantsOf = (id: string) => desk.grants.filter(g => g.userId === id);
  const name = (id: string | null) => (id ? office.find(a => a.id === id)?.name ?? 'Former account' : 'Sthara');

  const run = async (id: string, method: 'POST' | 'PATCH', body: unknown, msg: string) => {
    setBusy(id); setErr(null);
    try { await call('/api/admin/access', method, body); toast(msg); setAdding(null); setNote(''); setUntil(''); reload(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  const noRole = office.filter(a => !grantsOf(a.id).length);
  const approvers = new Set(desk.grants.filter(g => ROLES[g.role].perms.includes('fees.concession.approve')).map(g => g.userId)).size;
  const temp = desk.grants.filter(g => g.expiresOn);
  const history = desk.revokedGrants.slice().sort((a, b) => ((a.revoked_at || a.expires_on) < (b.revoked_at || b.expires_on) ? 1 : -1));

  return (
    <>
      {toastEl}
      <PageBar eyebrow="ROLES & ACCESS" title="Who can do what"
        sub={`${plural(office.length, 'office account')} · ${plural(desk.grants.length, 'active role')} · enforced in the database, not just on screen`}
        actions={<Link className="btn pri" href="/admin/directory"><UserPlus size={16} weight="bold" /> Add office account</Link>} />
      {err && <div className="err" role="alert" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="kpis">
        <Kpi label="OFFICE ACCOUNTS" value={office.length} icon={UserCircle} note={`${desk.grants.filter(g => g.role === 'school_admin').length} school admin${desk.grants.filter(g => g.role === 'school_admin').length === 1 ? '' : 's'}`} />
        <Kpi label="WITHOUT A ROLE" value={noRole.length} icon={Key} valueColor={noRole.length ? 'var(--amber)' : 'var(--green)'}
          note={noRole.length ? 'Can sign in but see nothing' : 'Everyone has a role'} />
        <Kpi label="TEMPORARY ROLES" value={temp.length} icon={Key} note={temp.length ? `Next ends ${fmtDate(temp.map(g => g.expiresOn!).sort()[0], true)}` : 'None'} />
        <Kpi label="CONCESSION APPROVERS" value={approvers} icon={Key} valueColor={approvers < 2 ? 'var(--amber)' : 'var(--green)'}
          note={approvers < 2 ? 'With one, concessions are self-approved' : 'Every concession gets a second look'} />
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <CardHead title="Office accounts" sub="Give each person the roles for their job. A role can end on a date, e.g. an acting principal while the principal is on leave." />
        {office.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Person</th><th>Roles</th><th /></tr></thead>
              <tbody>{office.map(a => (
                <Fragment key={a.id}>
                  <tr>
                    <td style={{ width: '30%' }}>
                      <div className="who"><span className="ic" aria-hidden="true"><UserCircle size={18} weight="duotone" /></span>
                        <div><b style={{ fontSize: 14 }}>{a.name}{a.id === desk.me.id ? ' (you)' : ''}</b><div className="muted" style={{ fontSize: 12 }}>{a.email}</div></div></div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {grantsOf(a.id).length ? grantsOf(a.id).map(g => (
                          <span key={g.id} className="ch b" title={`${ROLES[g.role].summary}. Given ${fmtDate(g.grantedAt)} by ${name(g.grantedBy)}${g.note ? `: ${g.note}` : ''}`}
                            style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            {ROLES[g.role].label.toUpperCase()}
                            {g.expiresOn && <span style={{ fontWeight: 600, opacity: .8 }}>· until {fmtDate(g.expiresOn, true)}{daysBetween(today, g.expiresOn) <= 7 ? ' (soon)' : ''}</span>}
                            <button aria-label={`Remove ${ROLES[g.role].label} from ${a.name}`} disabled={busy !== null}
                              onClick={() => run(g.id, 'PATCH', { id: g.id }, `${ROLES[g.role].label} removed from ${a.name}`)}
                              style={{ display: 'inline-grid', placeItems: 'center', color: 'inherit' }}><X size={12} weight="bold" /></button>
                          </span>
                        )) : <Chip tone="a">NO ROLE</Chip>}
                      </div>
                    </td>
                    <td className="r"><button className="btn sm" onClick={() => { setAdding(adding === a.id ? null : a.id); setErr(null); }}>{adding === a.id ? 'Cancel' : 'Add role'}</button></td>
                  </tr>
                  {adding === a.id && (
                    <tr className="sel"><td colSpan={3}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="cmp-fld" style={{ margin: 0, minWidth: 220 }}><label htmlFor="ac-role">ROLE</label>
                          <select id="ac-role" className="cmp-sel" value={role} onChange={e => setRole(e.target.value as RoleKey)}>
                            {ROLE_KEYS.filter(r => !grantsOf(a.id).some(g => g.role === r)).map(r => <option key={r} value={r}>{ROLES[r].label}</option>)}
                          </select></div>
                        <div className="cmp-fld" style={{ margin: 0 }}><label htmlFor="ac-until">UNTIL (OPTIONAL)</label>
                          <input id="ac-until" type="date" className="cmp-in" min={today} value={until} onChange={e => setUntil(e.target.value)} /></div>
                        <div className="cmp-fld" style={{ margin: 0, flex: 1, minWidth: 200 }}><label htmlFor="ac-note">NOTE (OPTIONAL)</label>
                          <input id="ac-note" className="cmp-in" maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder="Acting principal during leave" /></div>
                        <button className="btn pri" disabled={busy !== null} onClick={() => run(`add-${a.id}`, 'POST', { userId: a.id, role, expiresOn: until || undefined, note }, `${ROLES[role].label} given to ${a.name}`)}>Give role</button>
                      </div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{ROLES[role].summary}.</div>
                    </td></tr>
                  )}
                </Fragment>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty icon={<UserCircle size={26} weight="duotone" />} title="No office accounts">Add office accounts in the user directory with the admin account type.</Empty>}
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <CardHead title="What each role can do" sub="Built for separation of duties: an accountant requests concessions and a finance head approves them; a cashier collects but doesn't close the day." />
        <div className="tbl-wrap">
          <table className="tbl" style={{ fontSize: 12.5 }}>
            <thead><tr><th>Permission</th>{ROLE_KEYS.map(r => <th key={r} className="c" style={{ whiteSpace: 'normal', minWidth: 70 }}>{ROLES[r].label}</th>)}</tr></thead>
            <tbody>{GROUPS.map(([g, ps]) => (
              <Fragment key={g}>
                <tr><td colSpan={ROLE_KEYS.length + 1} style={{ background: 'var(--body)', fontWeight: 800, fontSize: 11, letterSpacing: '.08em', color: 'var(--mut)' }}>{g.toUpperCase()}</td></tr>
                {ps.map(p => (
                  <tr key={p}>
                    <td>{PERMS[p]}</td>
                    {ROLE_KEYS.map(r => <td key={r} className="c">{ROLES[r].perms.includes(p) ? <Check size={15} weight="bold" color="#10B981" aria-label="Yes" /> : <span className="muted" aria-label="No">·</span>}</td>)}
                  </tr>
                ))}
              </Fragment>
            ))}</tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <CardHead title="Access history" sub="Roles removed or lapsed. Every grant and removal is also in the audit trail." />
        {history.length ? history.slice(0, 20).map(g => (
          <div className="row" key={g.id}>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 13.5 }}>{name(g.user_id)} · {ROLES[g.role_key as RoleKey]?.label ?? g.role_key}</b>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                Given {fmtDate(g.granted_at)} by {name(g.granted_by)} · {g.revoked_at ? `removed ${ago(g.revoked_at)} by ${name(g.revoked_by)}` : `lapsed ${fmtDate(g.expires_on)}`}
              </div>
            </div>
            <Chip tone="n">{g.revoked_at ? 'REMOVED' : 'LAPSED'}</Chip>
          </div>
        )) : <p className="muted" style={{ fontSize: 13.5 }}>No roles removed or lapsed yet.</p>}
      </div>
    </>
  );
}
