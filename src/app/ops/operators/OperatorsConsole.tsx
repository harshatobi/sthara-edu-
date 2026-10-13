'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { GRANTABLE_ROLES, OPERATOR_ROLES, ROLE_INFO, reachOf, roleLabel, type OperatorRole } from '@/lib/ops/roles';
import { territoryPath, type Territory } from '@/lib/ops/territories';
import { REASON_MIN } from '@/lib/settings/registry';
import { ReasonAction, Section, Table, errText, fmtDate, fmtDateTime } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface Operator {
  id: string; name: string | null; email: string | null; role: OperatorRole; title: string | null; managerId: string | null;
  territoryIds: string[]; active: boolean; lastSignIn: string | null; createdAt: string | null; mfa: boolean; banned: boolean; you: boolean;
}
interface Draft { role: OperatorRole; title: string; managerId: string; territoryIds: string[]; reason: string }

/** The fields an operator's role, reporting line and territories are set with (adding and editing share them). */
function OperatorFields({ d, set, operators, territories, selfId, fixedRole }: {
  d: Draft; set: (patch: Partial<Draft>) => void; operators: Operator[]; territories: Territory[]; selfId?: string; fixedRole?: boolean;
}) {
  const sorted = useMemo(() => territories.map(t => ({ id: t.id, path: territoryPath(territories, t.id) })).sort((a, b) => a.path.localeCompare(b.path)), [territories]);
  const territorial = reachOf(d.role) === 'territory';
  return (
    <>
      <div className="g2">
        <div>
          <label className="lbl">ROLE</label>
          <select className="cmp-sel" aria-label="Role" value={d.role} disabled={fixedRole} onChange={e => set({ role: e.target.value as OperatorRole })}>
            {(fixedRole ? OPERATOR_ROLES : GRANTABLE_ROLES).map(r => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}
          </select>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{ROLE_INFO[d.role].note}</p>
        </div>
        <div>
          <label className="lbl">JOB TITLE (OPTIONAL)</label>
          <input className="cmp-in" aria-label="Job title" maxLength={80} value={d.title} onChange={e => set({ title: e.target.value })} />
        </div>
        <div>
          <label className="lbl">REPORTS TO</label>
          <select className="cmp-sel" aria-label="Reports to" value={d.managerId} onChange={e => set({ managerId: e.target.value })}>
            <option value="">Nobody</option>
            {operators.filter(o => o.active && o.id !== selfId).map(o => <option key={o.id} value={o.id}>{o.name || o.email} ({roleLabel(o.role)})</option>)}
          </select>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>A manager sees everything their reports own.</p>
        </div>
      </div>
      {territorial && (
        <div style={{ marginTop: 16 }}>
          <label className="lbl">TERRITORIES</label>
          <div className="ops-checks">
            {sorted.map(t => (
              <label key={t.id}>
                <input type="checkbox" checked={d.territoryIds.includes(t.id)}
                  onChange={e => set({ territoryIds: e.target.checked ? [...d.territoryIds, t.id] : d.territoryIds.filter(x => x !== t.id) })} />
                {t.path}
              </label>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>They see the schools and enquiries in these, and in everything beneath them. With none ticked they see only what they own.</p>
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <label className="lbl">REASON</label>
        <input className="cmp-in" aria-label="Reason for the change" maxLength={500} placeholder="Kept in the audit log" value={d.reason} onChange={e => set({ reason: e.target.value })} />
      </div>
    </>
  );
}

/** Platform Manager > Operators: who works in this console, in which role, over which territories. */
export default function OperatorsConsole() {
  const api = useOpsApi();
  const [rows, setRows] = useState<Operator[] | null>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(() => {
    Promise.all([
      api<{ operators: Operator[]; canManage: boolean }>('/operators'),
      api<{ territories: Territory[] }>('/territories'),
    ]).then(([o, t]) => { setRows(o.operators); setCanManage(o.canManage); setTerritories(t.territories); setErr(null); })
      .catch(e => { setErr(errText(e)); setRows(r => r ?? []); });
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const nameOf = useMemo(() => new Map((rows ?? []).map(o => [o.id, o.name || o.email || 'Operator'])), [rows]);
  const noMfa = (rows ?? []).filter(o => o.active && !o.mfa).length;

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Operators"
        sub="Everyone who works in the Platform Manager: their role decides what they can do, their territories decide which schools they see."
        actions={canManage && <button className="btn pri" onClick={() => { setAdding(a => !a); setIssued(null); }}><Plus size={15} weight="bold" /> Add operator</button>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {issued && (
        <div className="note info" style={{ marginBottom: 18 }} role="status">
          <b>Login created for {issued.email}.</b> Temporary password: <span className="mono" style={{ userSelect: 'all' }}>{issued.password}</span>. It is shown this once and is not stored: pass it on now.
          <button className="btn sm" style={{ marginLeft: 10 }} onClick={() => setIssued(null)}>Done</button>
        </div>
      )}
      {adding && rows && <AddOperator operators={rows} territories={territories} onCancel={() => setAdding(false)}
        onAdded={i => { setAdding(false); setIssued(i); load(); }} />}

      <Section title="Operators">
        {!rows ? <Skeleton h={120} /> : (
          <Table head={<tr><th>Operator</th><th>Role</th><th>Reports to</th><th>Territories</th><th>Last sign-in</th><th>Two-factor</th><th>Since</th>{canManage && <th aria-label="Actions" />}</tr>}
            empty={!rows.length && <Empty icon={<ShieldCheck size={28} weight="duotone" />} title="No operators" />}>
            {rows.map(o => editing === o.id ? (
              <tr key={o.id}><td colSpan={8}>
                <EditOperator o={o} operators={rows} territories={territories} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
              </td></tr>
            ) : (
              <tr key={o.id} style={o.active ? undefined : { opacity: .6 }}>
                <td><div className="nm">{o.name || o.email || o.id}{o.you && <> <Chip tone="b">YOU</Chip></>}{!o.active && <> <Chip tone="n">INACTIVE</Chip></>}{o.banned && <> <Chip tone="r">BANNED</Chip></>}</div><div className="sub" style={{ overflowWrap: 'anywhere' }}>{o.email}</div></td>
                <td><Chip tone={o.role === 'director' ? 'p' : 'b'}>{roleLabel(o.role).toUpperCase()}</Chip>{o.title && <div className="sub">{o.title}</div>}</td>
                <td>{o.managerId ? nameOf.get(o.managerId) ?? 'Former operator' : '—'}</td>
                <td style={{ fontSize: 12.5, maxWidth: 260 }}>{reachOf(o.role) === 'all' ? 'Every school' : o.territoryIds.length ? o.territoryIds.map(t => territoryPath(territories, t)).sort().join('; ') : 'Only what they own'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{o.lastSignIn ? fmtDateTime(o.lastSignIn) : 'Never'}</td>
                <td>{o.mfa ? <Chip tone="g">ON</Chip> : <Chip tone="a">OFF</Chip>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(o.createdAt)}</td>
                {canManage && <td>{!o.you && <button className="btn sm" onClick={() => setEditing(o.id)}>Change</button>}</td>}
              </tr>
            ))}
          </Table>
        )}
      </Section>
      {rows && noMfa > 0 && (
        <div className="note" style={{ marginBottom: 18 }}>
          {noMfa === 1 ? 'One operator signs in' : `${noMfa} operators sign in`} with a password only. Operator accounts reach school data: two-factor sign-in is strongly advised.
        </div>
      )}

      <Section title="What each role can do" sub="Fixed in the product, the same for every operator in the role. The server checks it on every request.">
        <Table head={<tr><th>Role</th><th>For</th><th>Sees</th></tr>}>
          {OPERATOR_ROLES.map(r => (
            <tr key={r}>
              <td className="nm" style={{ whiteSpace: 'nowrap' }}>{ROLE_INFO[r].label}</td>
              <td style={{ fontSize: 13.5 }}>{ROLE_INFO[r].note}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{ROLE_INFO[r].reach === 'all' ? 'Every school' : 'Their territories'}</td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title="Director access" sub="One account, and no button for it anywhere: no operator session, API route or key held by the app can create another.">
        <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          The director is the platform&apos;s single superadmin. The database refuses a second one, and refuses to name one for anything but the project owner working in the Supabase SQL editor; handing it over means taking it from the current holder and giving it to the next in one transaction. Every other role is given and taken away on this page by the director, with a reason, and recorded in the audit log. Those roles can do only what the table above lists.
        </p>
      </Section>
    </>
  );
}

function AddOperator({ operators, territories, onCancel, onAdded }: {
  operators: Operator[]; territories: Territory[]; onCancel: () => void; onAdded: (issued: { email: string; password: string } | null) => void;
}) {
  const api = useOpsApi();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [createLogin, setCreateLogin] = useState(true);
  const [d, setD] = useState<Draft>({ role: 'support_agent', title: '', managerId: '', territoryIds: [], reason: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const out = await api<{ tempPassword: string | null }>('/operators', { method: 'POST', body: {
        email, name, createLogin, role: d.role, title: d.title, managerId: d.managerId || null,
        territoryIds: reachOf(d.role) === 'territory' ? d.territoryIds : [], reason: d.reason,
      } });
      onAdded(out.tempPassword ? { email: email.trim().toLowerCase(), password: out.tempPassword } : null);
    } catch (x) { setErr(errText(x)); setBusy(false); }
  };
  return (
    <form className="card" style={{ marginBottom: 18 }} onSubmit={submit}>
      <div className="ops-sec-hd"><div>
        <h2 style={{ fontSize: 17, fontWeight: 800 }}>Add an operator</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>Operators use their own Sthara account, never a school login.</p>
      </div></div>
      <div className="g2" style={{ marginBottom: 16 }}>
        <div>
          <label className="lbl" htmlFor="op-email">EMAIL</label>
          <input id="op-email" type="email" className="cmp-in" required maxLength={200} value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="op-name">NAME</label>
          <input id="op-name" className="cmp-in" required={createLogin} disabled={!createLogin} maxLength={120} value={name} onChange={e => setName(e.target.value)} />
        </div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginBottom: 16 }}>
        <input type="checkbox" checked={createLogin} onChange={e => setCreateLogin(e.target.checked)} />
        Create their Sthara login now (a temporary password is shown once). Untick if the account already exists.
      </label>
      <OperatorFields d={d} set={p => setD(x => ({ ...x, ...p }))} operators={operators} territories={territories} />
      {err && <div className="note err" style={{ marginTop: 14 }} role="alert">{err}</div>}
      <div className="acts" style={{ marginTop: 18 }}>
        <button className="btn pri" disabled={busy || d.reason.trim().length < REASON_MIN}>{busy ? 'Adding…' : 'Add operator'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function EditOperator({ o, operators, territories, onCancel, onSaved }: { o: Operator; operators: Operator[]; territories: Territory[]; onCancel: () => void; onSaved: () => void }) {
  const api = useOpsApi();
  const [d, setD] = useState<Draft>({ role: o.role, title: o.title ?? '', managerId: o.managerId ?? '', territoryIds: o.territoryIds, reason: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const director = o.role === 'director';
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api('/operators', { method: 'PATCH', body: {
        id: o.id, ...(director ? {} : { role: d.role }), title: d.title, managerId: d.managerId || null,
        ...(reachOf(d.role) === 'territory' ? { territoryIds: d.territoryIds } : {}), reason: d.reason,
      } });
      onSaved();
    } catch (x) { setErr(errText(x)); setBusy(false); }
  };
  return (
    <form onSubmit={save} style={{ padding: '6px 0 10px' }}>
      <div className="nm" style={{ marginBottom: 14 }}>{o.name || o.email} <span className="sub" style={{ fontWeight: 500 }}>{o.email}</span></div>
      <OperatorFields d={d} set={p => setD(x => ({ ...x, ...p }))} operators={operators} territories={territories} selfId={o.id} fixedRole={director} />
      {err && <div className="note err" style={{ marginTop: 14 }} role="alert">{err}</div>}
      <div className="acts" style={{ marginTop: 16 }}>
        <button className="btn pri" disabled={busy || d.reason.trim().length < REASON_MIN}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        {!director && (
          <span style={{ marginLeft: 'auto' }}>
            <ReasonAction label={o.active ? 'Remove access' : 'Restore access'} danger={o.active} confirm={o.active ? 'Remove access' : 'Restore access'}
              run={async reason => { await api('/operators', { method: 'PATCH', body: { id: o.id, active: !o.active, reason } }); onSaved(); }} />
          </span>
        )}
      </div>
    </form>
  );
}
