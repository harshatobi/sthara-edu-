'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { MapTrifoldIcon as MapTrifold } from '@phosphor-icons/react/dist/ssr/MapTrifold';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { roleLabel, type OperatorRole } from '@/lib/ops/roles';
import { INDIAN_STATES, type Territory } from '@/lib/ops/territories';
import { REASON_MIN } from '@/lib/settings/registry';
import { ReasonAction, Section, Table, errText, num } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface Row extends Territory { memberIds: string[]; schools: number; enquiries: number }
interface Owner { id: string; name: string; role: OperatorRole }
interface Data { territories: Row[]; operators: Owner[]; unplacedSchools: number; canManage: boolean }

const LEVEL = { region: 'Region', state: 'State', district: 'District' } as const;

/** Platform Manager > Territories: region > state > district, who works each, and what sits in it. */
export default function TerritoriesConsole() {
  const api = useOpsApi();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState<'region' | 'district' | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [allStates, setAllStates] = useState(false);

  const load = useCallback(() => {
    api<Data>('/territories').then(d => { setData(d); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const done = (msg: string) => { setAdding(null); setEditing(null); setNotice(msg); load(); };

  const ownerName = useMemo(() => new Map((data?.operators ?? []).map(o => [o.id, o.name])), [data]);
  // Depth-first: each region with its states, each state with its districts; states outside a region last.
  const ordered = useMemo(() => {
    const all = data?.territories ?? [];
    const kids = (id: string | null, level: Territory['level']) => all.filter(t => t.parentId === id && t.level === level).sort((a, b) => a.name.localeCompare(b.name));
    const used = new Set(all.filter(t => t.level === 'district').map(t => t.parentId));
    const inUse = (t: Row) => allStates || !!t.parentId || t.schools > 0 || t.enquiries > 0 || t.memberIds.length > 0 || !!t.defaultOwnerId || used.has(t.id);
    const out: { t: Row; depth: number }[] = [];
    const addState = (s: Row, depth: number) => { if (!inUse(s)) return; out.push({ t: s, depth }); for (const d of kids(s.id, 'district')) out.push({ t: d, depth: depth + 1 }); };
    for (const r of kids(null, 'region')) { out.push({ t: r, depth: 0 }); for (const s of kids(r.id, 'state')) addState(s, 1); }
    for (const s of kids(null, 'state')) addState(s, 0);
    return out;
  }, [data, allStates]);
  const hidden = (data?.territories.length ?? 0) - ordered.length;

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Territories"
        sub="A school or enquiry lands in its district's territory if there is one, else its state's, and goes to that territory's default owner."
        actions={data?.canManage && <>
          <button className="btn" onClick={() => setAdding(a => (a === 'region' ? null : 'region'))}><Plus size={15} weight="bold" /> Region</button>
          <button className="btn pri" onClick={() => setAdding(a => (a === 'district' ? null : 'district'))}><Plus size={15} weight="bold" /> District</button>
        </>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {notice && <div className="note info" style={{ marginBottom: 18 }} role="status">{notice}</div>}
      {data && data.unplacedSchools > 0 && (
        <div className="note" style={{ marginBottom: 18 }}>
          {data.unplacedSchools === 1 ? 'One school has' : `${num(data.unplacedSchools)} schools have`} no state yet, so only roles that see every school can open {data.unplacedSchools === 1 ? 'it' : 'them'}. Set the address under the school&apos;s Ownership &amp; access tab.
        </div>
      )}
      {adding && data && <AddTerritory level={adding} data={data} onCancel={() => setAdding(null)} onSaved={done} />}

      <Section title="Territory map" actions={<label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
        <input type="checkbox" checked={allStates} onChange={e => setAllStates(e.target.checked)} /> Show every state{hidden > 0 ? ` (${hidden} unused hidden)` : ''}
      </label>}>
        {!data ? <Skeleton h={160} /> : (
          <Table head={<tr><th>Territory</th><th>Level</th><th>Default owner</th><th>Works here</th><th className="r">Schools</th><th className="r">Open enquiries</th>{data.canManage && <th aria-label="Actions" />}</tr>}
            empty={!ordered.length && <Empty icon={<MapTrifold size={28} weight="duotone" />} title="No territory in use yet">Place a school or an enquiry in a state, or add a region, and it appears here.</Empty>}>
            {ordered.map(({ t, depth }) => (
              <Fragment key={t.id}>
                <tr>
                  <td><div className="nm" style={{ paddingLeft: depth * 22 }}>{t.name}</div></td>
                  <td><Chip tone={t.level === 'region' ? 'p' : t.level === 'state' ? 'b' : 'n'}>{LEVEL[t.level].toUpperCase()}</Chip></td>
                  <td>{t.defaultOwnerId ? ownerName.get(t.defaultOwnerId) ?? 'Former operator' : <span className="muted">Inherits</span>}</td>
                  <td style={{ fontSize: 12.5, maxWidth: 280 }}>{t.memberIds.length ? t.memberIds.map(m => ownerName.get(m) ?? 'Operator').sort().join(', ') : '—'}</td>
                  <td className="r">{num(t.schools)}</td>
                  <td className="r">{num(t.enquiries)}</td>
                  {data.canManage && <td><button className="btn sm" onClick={() => setEditing(e => (e === t.id ? null : t.id))}>{editing === t.id ? 'Close' : 'Change'}</button></td>}
                </tr>
                {editing === t.id && <tr><td colSpan={7}><EditTerritory t={t} data={data} onSaved={done} /></td></tr>}
              </Fragment>
            ))}
          </Table>
        )}
      </Section>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
        Who works a territory is set on each operator (Operators &gt; Change). Counts cover the schools and enquiries you can see.
      </p>
    </>
  );
}

function OwnerSelect({ value, onChange, owners }: { value: string; onChange: (v: string) => void; owners: Owner[] }) {
  return (
    <select className="cmp-sel" aria-label="Default owner" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Inherit from the territory above</option>
      {owners.map(o => <option key={o.id} value={o.id}>{o.name} ({roleLabel(o.role)})</option>)}
    </select>
  );
}

function AddTerritory({ level, data, onCancel, onSaved }: { level: 'region' | 'district'; data: Data; onCancel: () => void; onSaved: (msg: string) => void }) {
  const api = useOpsApi();
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const [owner, setOwner] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const parent = level === 'district' ? data.territories.find(t => t.level === 'state' && t.state === state)?.id : null;
      const out = await api<{ placed: number }>('/territories', { method: 'POST', body: level === 'region'
        ? { level, name, defaultOwnerId: owner || null, reason }
        : { level, state, district: name, parentId: parent, defaultOwnerId: owner || null, reason } });
      onSaved(`${name.trim()} added.${out.placed ? ` ${num(out.placed)} record${out.placed === 1 ? '' : 's'} moved into it.` : ''}`);
    } catch (x) { setErr(errText(x)); setBusy(false); }
  };
  return (
    <form className="card" style={{ marginBottom: 18 }} onSubmit={submit}>
      <div className="ops-sec-hd"><div>
        <h2 style={{ fontSize: 17, fontWeight: 800 }}>{level === 'region' ? 'New region' : 'New district territory'}</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>{level === 'region'
          ? 'A group of states, such as South. Put states in it afterwards with Change on each state.'
          : 'Schools and enquiries at this address move into it from their state straight away.'}</p>
      </div></div>
      <div className="g2">
        {level === 'district' && (
          <div>
            <label className="lbl" htmlFor="t-state">STATE</label>
            <select id="t-state" className="cmp-sel" required value={state} onChange={e => setState(e.target.value)}>
              <option value="">Pick a state</option>
              {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="lbl" htmlFor="t-name">{level === 'region' ? 'REGION NAME' : 'DISTRICT'}</label>
          <input id="t-name" className="cmp-in" required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="lbl">DEFAULT OWNER</label>
          <OwnerSelect value={owner} onChange={setOwner} owners={data.operators} />
        </div>
        <div>
          <label className="lbl" htmlFor="t-reason">REASON</label>
          <input id="t-reason" className="cmp-in" maxLength={500} placeholder="Kept in the audit log" value={reason} onChange={e => setReason(e.target.value)} />
        </div>
      </div>
      {err && <div className="note err" style={{ marginTop: 14 }} role="alert">{err}</div>}
      <div className="acts" style={{ marginTop: 18 }}>
        <button className="btn pri" disabled={busy || reason.trim().length < REASON_MIN}>{busy ? 'Adding…' : 'Add'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function EditTerritory({ t, data, onSaved }: { t: Row; data: Data; onSaved: (msg: string) => void }) {
  const api = useOpsApi();
  const [name, setName] = useState(t.name);
  const [parent, setParent] = useState(t.parentId ?? '');
  const [owner, setOwner] = useState(t.defaultOwnerId ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const regions = data.territories.filter(x => x.level === 'region');
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api('/territories', { method: 'PATCH', body: {
        id: t.id, defaultOwnerId: owner || null, reason,
        ...(t.level === 'region' ? { name } : {}), ...(t.level === 'state' ? { parentId: parent || null } : {}),
      } });
      onSaved(`${t.name} updated.`);
    } catch (x) { setErr(errText(x)); setBusy(false); }
  };
  return (
    <form onSubmit={save} style={{ padding: '6px 0 10px' }}>
      <div className="g2">
        {t.level === 'region' && (
          <div>
            <label className="lbl">REGION NAME</label>
            <input className="cmp-in" aria-label="Region name" required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} />
          </div>
        )}
        {t.level === 'state' && (
          <div>
            <label className="lbl">REGION</label>
            <select className="cmp-sel" aria-label="Region" value={parent} onChange={e => setParent(e.target.value)}>
              <option value="">Not in a region</option>
              {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="lbl">DEFAULT OWNER</label>
          <OwnerSelect value={owner} onChange={setOwner} owners={data.operators} />
        </div>
        <div>
          <label className="lbl">REASON</label>
          <input className="cmp-in" aria-label="Reason for the change" maxLength={500} placeholder="Kept in the audit log" value={reason} onChange={e => setReason(e.target.value)} />
        </div>
      </div>
      {err && <div className="note err" style={{ marginTop: 14 }} role="alert">{err}</div>}
      <div className="acts" style={{ marginTop: 16 }}>
        <button className="btn pri" disabled={busy || reason.trim().length < REASON_MIN}>{busy ? 'Saving…' : 'Save'}</button>
        {t.level !== 'state' && (
          <span style={{ marginLeft: 'auto' }}>
            <ReasonAction label="Remove territory" danger confirm="Remove"
              run={async r => {
                const out = await api<{ placed: number }>('/territories', { method: 'DELETE', body: { id: t.id, reason: r } });
                onSaved(`${t.name} removed.${out.placed ? ` ${num(out.placed)} record${out.placed === 1 ? '' : 's'} moved back to the state.` : ''}`);
              }} />
          </span>
        )}
      </div>
    </form>
  );
}
