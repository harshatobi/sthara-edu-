'use client';

import { useCallback, useEffect, useState } from 'react';
import { LockKeyOpenIcon as LockKeyOpen } from '@phosphor-icons/react/dist/ssr/LockKeyOpen';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { roleLabel, type OperatorRole } from '@/lib/ops/roles';
import { INDIAN_STATES } from '@/lib/ops/territories';
import { REASON_MIN } from '@/lib/settings/registry';
import { Facts, Section, Table, errText, fmtDateTime, num } from '../../_ui';
import { useOpsApi } from '../../useOpsApi';

interface Grant {
  id: string; operatorId: string | null; operatorEmail: string; operatorRole: string; scope: 'records' | 'view_as' | 'import';
  reason: string; caseRef: string | null; startedAt: string; expiresAt: string; endedAt: string | null; opened: number;
}
interface Data {
  account: { state: string | null; district: string | null; territory: string | null; ownerId: string | null; owner: string | null; updatedAt: string | null };
  owners: { id: string; name: string; role: OperatorRole }[];
  grants: Grant[];
  myGrant: Omit<Grant, 'opened'> | null;
  can: { assign: boolean; breakglass: boolean };
}

const GRANT_REASON_MIN = 10;
const isOpen = (g: Pick<Grant, 'expiresAt' | 'endedAt'>, now: number) => !g.endedAt && Date.parse(g.expiresAt) > now;
const mmss = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;

/** A school's Ownership & access tab: where it sits, who owns it, and the break-glass windows onto its records. */
export function AccountTab({ schoolId, onChanged }: { schoolId: string; onChanged: (msg: string) => void }) {
  const api = useOpsApi();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(() => {
    api<Data>(`/schools/${schoolId}/account`).then(x => { setD(x); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api, schoolId]);
  useEffect(() => { load(); }, [load]);
  // The countdown ticks once a second while a window is open, and the tab reloads when it runs out.
  const open = !!d?.myGrant && isOpen(d.myGrant, now);
  useEffect(() => {
    if (!d?.myGrant || d.myGrant.endedAt) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.parse(d.myGrant!.expiresAt) <= Date.now()) { clearInterval(id); load(); }
    }, 1000);
    return () => clearInterval(id);
  }, [d?.myGrant, load]);

  if (err && !d) return <div className="note err" role="alert">{err}</div>;
  if (!d) return <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={48} style={{ marginBottom: 12 }} />)}</div>;
  const done = (msg: string) => { onChanged(msg); load(); };

  return (
    <>
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      <Section title="Territory and owner" sub="The address places the school in a territory. The owner is the operator answerable for it; operators who work the territory see it too.">
        <Facts rows={[
          ['State', d.account.state ?? 'Not set'], ['District', d.account.district ?? 'Not set'],
          ['Territory', d.account.territory ?? 'None: only roles that see every school can open it'], ['Owner', d.account.owner ?? 'Nobody'],
        ]} />
        {d.can.assign && <Placement key={d.account.updatedAt ?? 'new'} schoolId={schoolId} d={d} onSaved={() => done('Territory and owner saved.')} />}
      </Section>

      <Section title="Access to the school's records"
        sub="Operators work from counts and findings. Opening the school's own records (marks, attendance, fees, messages, a raw row) needs a window: one school, a written reason, 30 minutes, read-only. The school's administrators see every window below.">
        {open && d.myGrant ? (
          <div className="ops-window" role="status">
            <LockKeyOpen size={26} weight="duotone" color="#B45309" />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="nm">Your window is open{d.myGrant.scope === 'view_as' ? ' (view as the school)' : d.myGrant.scope === 'import' ? ' (imports)' : ''}</div>
              <div className="sub">{d.myGrant.reason}{d.myGrant.caseRef ? ` · case ${d.myGrant.caseRef}` : ''}</div>
            </div>
            <div className="t" aria-label="Time left">{mmss(Date.parse(d.myGrant.expiresAt) - now)}</div>
            <button className="btn sm" onClick={async () => {
              try { await api(`/schools/${schoolId}/access`, { method: 'DELETE', body: { grantId: d.myGrant!.id } }); done('Access window ended.'); } catch (e) { setErr(errText(e)); }
            }}>End now</button>
          </div>
        ) : d.can.breakglass ? <OpenWindow schoolId={schoolId} onOpened={() => done('Access window open for 30 minutes.')} />
          : <div className="note" style={{ marginBottom: 18 }}>Your role works from counts and findings only: it cannot open a school&apos;s records.</div>}

        <Table head={<tr><th>Opened</th><th>Operator</th><th>Reason</th><th>Scope</th><th>Lasted</th><th className="r">Records opened</th><th>Status</th></tr>}
          empty={!d.grants.length && <Empty icon={<LockKeyOpen size={28} weight="duotone" />} title="Nobody at Sthara has opened this school's records" />}>
          {d.grants.map(g => {
            const live = isOpen(g, now);
            const end = g.endedAt ?? (live ? null : g.expiresAt);
            return (
              <tr key={g.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(g.startedAt)}</td>
                <td><div className="nm" style={{ overflowWrap: 'anywhere' }}>{g.operatorEmail}</div><div className="sub">{roleLabel(g.operatorRole)}</div></td>
                <td style={{ fontSize: 13.5, maxWidth: 360 }}>{g.reason}{g.caseRef && <div className="sub">Case {g.caseRef}</div>}</td>
                <td>{g.scope === 'view_as' ? 'View as school' : g.scope === 'import' ? 'Imports' : 'Records'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{end ? `${Math.max(1, Math.round((Date.parse(end) - Date.parse(g.startedAt)) / 60_000))} min` : '—'}</td>
                <td className="r">{num(g.opened)}</td>
                <td>{live ? <Chip tone="a">OPEN</Chip> : g.endedAt ? <Chip tone="n">ENDED</Chip> : <Chip tone="n">EXPIRED</Chip>}</td>
              </tr>
            );
          })}
        </Table>
      </Section>
    </>
  );
}

function Placement({ schoolId, d, onSaved }: { schoolId: string; d: Data; onSaved: () => void }) {
  const api = useOpsApi();
  const [state, setState] = useState(d.account.state ?? '');
  const [district, setDistrict] = useState(d.account.district ?? '');
  const [owner, setOwner] = useState(d.account.ownerId ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = state !== (d.account.state ?? '') || district.trim() !== (d.account.district ?? '') || owner !== (d.account.ownerId ?? '');
  const addressChanged = state !== (d.account.state ?? '') || district.trim() !== (d.account.district ?? '');
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      // With a new address and the owner untouched, the new territory's default owner takes over.
      const keepOwner = owner !== (d.account.ownerId ?? '') || !addressChanged;
      await api(`/schools/${schoolId}/account`, { method: 'PATCH', body: { state: state || null, district: district || null, ownerId: keepOwner ? owner || null : null, reason } });
      onSaved();
    } catch (x) { setErr(errText(x)); setBusy(false); }
  };
  return (
    <form onSubmit={save} style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
      <div className="g3">
        <div>
          <label className="lbl" htmlFor="a-state">STATE</label>
          <select id="a-state" className="cmp-sel" value={state} onChange={e => setState(e.target.value)}>
            <option value="">Not set</option>
            {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="a-district">DISTRICT</label>
          <input id="a-district" className="cmp-in" maxLength={80} disabled={!state} value={district} onChange={e => setDistrict(e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="a-owner">OWNER</label>
          <select id="a-owner" className="cmp-sel" value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">The territory&apos;s default owner</option>
            {d.owners.map(o => <option key={o.id} value={o.id}>{o.name} ({roleLabel(o.role)})</option>)}
          </select>
        </div>
      </div>
      {dirty && (
        <div className="acts" style={{ marginTop: 14 }}>
          <input className="cmp-in" style={{ flex: '1 1 260px', width: 'auto' }} aria-label="Reason for the change" maxLength={500} placeholder="Reason (kept in the audit log)" value={reason} onChange={e => setReason(e.target.value)} />
          <button className="btn pri" disabled={busy || reason.trim().length < REASON_MIN}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      )}
      {err && <div className="note err" style={{ marginTop: 14 }} role="alert">{err}</div>}
    </form>
  );
}

function OpenWindow({ schoolId, onOpened }: { schoolId: string; onOpened: () => void }) {
  const api = useOpsApi();
  const [reason, setReason] = useState('');
  const [caseRef, setCaseRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await api(`/schools/${schoolId}/access`, { method: 'POST', body: { reason, caseRef: caseRef || null } }); onOpened(); }
    catch (x) { setErr(errText(x)); setBusy(false); }
  };
  return (
    <form onSubmit={submit} style={{ marginBottom: 18 }}>
      <div className="g2">
        <div>
          <label className="lbl" htmlFor="w-reason">WHY YOU NEED THE RECORDS (THE SCHOOL SEES THIS)</label>
          <input id="w-reason" className="cmp-in" maxLength={500} placeholder="e.g. Principal reports Class 9-B marks missing from report cards" value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="w-case">CASE OR TICKET (OPTIONAL)</label>
          <input id="w-case" className="cmp-in" maxLength={80} value={caseRef} onChange={e => setCaseRef(e.target.value)} />
        </div>
      </div>
      {err && <div className="note err" style={{ marginTop: 14 }} role="alert">{err}</div>}
      <div className="acts" style={{ marginTop: 14 }}>
        <button className="btn pri" disabled={busy || reason.trim().length < GRANT_REASON_MIN}><LockKeyOpen size={15} weight="bold" /> {busy ? 'Opening…' : 'Open a 30-minute window'}</button>
      </div>
    </form>
  );
}
