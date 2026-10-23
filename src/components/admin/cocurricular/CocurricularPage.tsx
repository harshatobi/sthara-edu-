'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { TrophyIcon as Trophy } from '@phosphor-icons/react/dist/ssr/Trophy';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { fmtDate } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { CATEGORY_LABEL, GROUP_KIND_LABEL, GROUP_KINDS, LEVEL_LABEL, placeOf, type Category, type GroupKind, type HouseRule, type Level, type Position } from '@/lib/cocurricular/kirti';
import { HouseBadge } from '@/components/cocurricular/KirtiView';
import { CardHead, DeskGate, Field, Workspace } from '../kit';

interface House { id: string; name: string; colour: string | null; active: boolean }
interface Group { id: string; kind: GroupKind; name: string; in_charge: string | null; inChargeName: string | null; active: boolean }
interface PendingK { id: string; student_id: string; student: string; admissionNo: string; on_date: string; title: string; category: Category; level: Level; position: Position; position_note: string | null; house_points: number | null; notes: string | null; document_id: string | null; recordedBy: string | null }
interface PendingP { id: string; house: string; on_date: string; points: number; reason: string; recordedBy: string | null }
interface Data {
  houses: House[]; groups: Group[]; settings: { houseRule: HouseRule; keepSiblings: boolean }; session: string; sessionShown: string;
  standings: (House & { members: number; points: number })[]; pending: { kirti: PendingK[]; points: PendingP[] }; teachers: { id: string; name: string }[];
  can: { manage: boolean; approve: boolean };
}
const TABS = [['approve', 'To approve'], ['houses', 'Houses'], ['groups', 'Clubs & teams'], ['log', 'Kirti log']] as const;
const API = '/api/admin/cocurricular';

/** Admin › Co-curricular: approving Kirti and house points, houses and their standings, clubs and teams. */
export default function CocurricularPage() {
  return <DeskGate need={['cocurricular.manage', 'cocurricular.approve']}>{() => <Body />}</DeskGate>;
}

function Body() {
  const params = useSearchParams();
  const path = usePathname();
  const { data, error, reload } = useGet<Data>(API);
  const tab = TABS.find(([k]) => k === params.get('tab'))?.[0] ?? 'approve';
  const waiting = (data?.pending.kirti.length ?? 0) + (data?.pending.points.length ?? 0);
  return (
    <>
      <PageBar eyebrow="CO-CURRICULAR" title="Co-curricular and Kirti" sub="Houses, clubs and teams, and Kirti: every achievement and event a student takes part in. Teachers record; you approve." />
      <div className="tabs" role="tablist" aria-label="Co-curricular" style={{ marginBottom: 20 }}>
        {TABS.map(([k, label]) => <Link key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} href={`${path}?tab=${k}`}>{label}{k === 'approve' && waiting ? ` (${waiting})` : ''}</Link>)}
      </div>
      {error && <div className="note err" role="alert">{error}</div>}
      {!data ? <div className="card">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div> : (
        <>
          {tab === 'approve' && <Approve data={data} onDone={reload} />}
          {tab === 'houses' && <Houses data={data} onDone={reload} />}
          {tab === 'groups' && <Groups data={data} onDone={reload} />}
          {tab === 'log' && <Log session={data.session} />}
        </>
      )}
    </>
  );
}

function Approve({ data, onDone }: { data: Data; onDone: () => void }) {
  const { call } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const K = data.pending.kirti, P = data.pending.points;
  const decide = async (action: 'decide-kirti' | 'decide-points', ids: string[], approve: boolean) => {
    setErr(null);
    try { const r = await call<{ done: number }>(API, 'POST', { action, ids, approve, note }); toast(`${r.done} ${approve ? 'approved' : 'rejected'}.`); setSel(new Set()); setNote(''); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  if (!data.can.approve) return <div className="card"><p className="muted">Approving needs the co-curricular approval permission.</p></div>;
  const all = K.length > 0 && K.every(k => sel.has(k.id));
  return (
    <>
      {toastEl}
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Kirti to approve" sub="What teachers recorded. Approved entries show on the student and parent portals and the TC; points go to the student's house on that day." />
        {!K.length ? <Empty icon={<Trophy size={26} weight="duotone" />} title="Nothing waiting" /> : (
          <>
            <div style={{ overflowX: 'auto' }}><table className="tbl">
              <thead><tr><th><input type="checkbox" aria-label="Select all" checked={all} onChange={e => setSel(e.target.checked ? new Set(K.map(k => k.id)) : new Set())} /></th><th>Student</th><th>Kirti</th><th>Place</th><th>Recorded by</th></tr></thead>
              <tbody>{K.map(k => (
                <tr key={k.id}>
                  <td><input type="checkbox" aria-label={`Select ${k.student}`} checked={sel.has(k.id)} onChange={e => setSel(s => { const n = new Set(s); if (e.target.checked) n.add(k.id); else n.delete(k.id); return n; })} /></td>
                  <td><Link href={`/admin/students/${k.student_id}`}><b>{k.student}</b></Link><div className="muted" style={{ fontSize: 12 }}>{k.admissionNo}</div></td>
                  <td><b>{k.title}</b><div className="muted" style={{ fontSize: 12 }}>{fmtDate(k.on_date)} · {CATEGORY_LABEL[k.category]} · {LEVEL_LABEL[k.level]}{k.house_points ? ` · ${k.house_points} pts` : ''}{k.document_id ? ' · certificate attached' : ''}</div>{k.notes && <div className="muted" style={{ fontSize: 12 }}>{k.notes}</div>}</td>
                  <td>{placeOf(k.position, k.position_note)}</td>
                  <td>{k.recordedBy ?? ''}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn pri" disabled={!sel.size} onClick={() => decide('decide-kirti', [...sel], true)}>Approve {sel.size || ''}</button>
              <input className="cmp-in" style={{ maxWidth: 320 }} placeholder="Why (for a rejection)" aria-label="Note" value={note} maxLength={300} onChange={e => setNote(e.target.value)} />
              <button className="btn" disabled={!sel.size || note.trim().length < 3} onClick={() => decide('decide-kirti', [...sel], false)}>Reject</button>
            </div>
          </>
        )}
      </div>
      <div className="card">
        <CardHead title="House points to approve" sub="Points teachers proposed for a whole house." />
        {!P.length ? <p className="muted">Nothing waiting.</p> : (
          <div style={{ overflowX: 'auto' }}><table className="tbl">
            <tbody>{P.map(p => (
              <tr key={p.id}><td><b>{p.house}</b></td><td>{p.points > 0 ? '+' : ''}{p.points}</td><td>{p.reason}<div className="muted" style={{ fontSize: 12 }}>{fmtDate(p.on_date)} · {p.recordedBy ?? ''}</div></td>
                <td><div style={{ display: 'flex', gap: 6 }}><button className="btn sm pri" onClick={() => decide('decide-points', [p.id], true)}>Approve</button><button className="btn sm" disabled={note.trim().length < 3} onClick={() => decide('decide-points', [p.id], false)}>Reject</button></div></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

function Houses({ data, onDone }: { data: Data; onDone: () => void }) {
  const { call } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const [edit, setEdit] = useState<House | 'new' | null>(null);
  const [award, setAward] = useState(false);
  const [rule, setRule] = useState(data.settings.houseRule);
  const [sibs, setSibs] = useState(data.settings.keepSiblings);
  const [sure, setSure] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const post = async (body: Record<string, unknown>, ok: (r: any) => string) => {
    setErr(null);
    try { const r = await call(API, 'POST', body); toast(ok(r)); onDone(); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); return false; }
  };
  return (
    <>
      {toastEl}
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title={`Standings, ${data.sessionShown.replace('-', '–')}`} sub="Members now, and points this session: approved Kirti points plus the house's own."
          right={<div style={{ display: 'flex', gap: 6 }}>{data.can.approve && <button className="btn sm" onClick={() => setAward(true)}>Award house points</button>}{data.can.manage && <button className="btn sm pri" onClick={() => setEdit('new')}><Plus size={14} weight="bold" /> Add a house</button>}</div>} />
        {!data.standings.length ? <Empty icon={<Trophy size={26} weight="duotone" />} title="No houses yet">Add the school&apos;s houses, then place students (one by one from their record, or all at once below).</Empty> : (
          <div style={{ overflowX: 'auto' }}><table className="tbl">
            <thead><tr><th>House</th><th className="r">Members</th><th className="r">Points</th><th /></tr></thead>
            <tbody>{data.standings.map(h => (
              <tr key={h.id}><td><HouseBadge name={h.name} colour={h.colour} />{!h.active && <> <Chip tone="n">OFF</Chip></>}</td><td className="r">{h.members}</td><td className="r"><b>{h.points}</b></td>
                <td>{data.can.manage && <button className="btn sm" onClick={() => setEdit(h)}>Edit</button>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {data.can.manage && (
        <div className="card">
          <CardHead title="How houses are kept" />
          <label style={{ display: 'flex', gap: 8, fontSize: 14, marginBottom: 8 }}><input type="radio" name="hrule" checked={rule === 'lifelong'} onChange={() => setRule('lifelong')} /> <span><b>For the whole school life.</b> A student keeps their house; a move needs a reason.</span></label>
          <label style={{ display: 'flex', gap: 8, fontSize: 14, marginBottom: 8 }}><input type="radio" name="hrule" checked={rule === 'session'} onChange={() => setRule('session')} /> <span><b>A new house every session.</b> Reassign everyone when the session starts.</span></label>
          <label style={{ display: 'flex', gap: 8, fontSize: 14, marginBottom: 12 }}><input type="checkbox" checked={sibs} onChange={e => setSibs(e.target.checked)} /> Keep confirmed brothers and sisters in the same house</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(rule !== data.settings.houseRule || sibs !== data.settings.keepSiblings) && <button className="btn pri" onClick={() => post({ action: 'settings-save', houseRule: rule, keepSiblings: sibs }, () => 'Saved.')}>Save</button>}
            <button className="btn" onClick={() => post({ action: 'balance', all: false }, r => `${r.placed} student${r.placed === 1 ? '' : 's'} placed.`)}>Place students without a house</button>
            {data.settings.houseRule === 'session' && (!sure
              ? <button className="btn" onClick={() => setSure(true)}>Reassign everyone for {data.session.replace('-', '–')}</button>
              : <><button className="btn pri" onClick={() => { setSure(false); void post({ action: 'balance', all: true }, r => `${r.placed} placed for the session.`); }}>Yes, reassign everyone</button>
                <button className="btn" onClick={() => setSure(false)}>Keep as is</button></>)}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Placing balances the houses by number{data.settings.keepSiblings ? ' and keeps siblings together' : ''}. You can still move anyone from their record.</p>
        </div>
      )}
      {edit && <HouseForm h={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSave={async b => { if (await post({ action: 'house-save', ...b }, () => 'Saved.')) setEdit(null); }} />}
      {award && <AwardForm houses={data.houses.filter(h => h.active)} onClose={() => setAward(false)} onSave={async b => { if (await post({ action: 'award-points', ...b }, () => 'Points added.')) setAward(false); }} />}
    </>
  );
}

function HouseForm({ h, onClose, onSave }: { h: House | null; onClose: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const [name, setName] = useState(h?.name ?? '');
  const [colour, setColour] = useState(h?.colour ?? '#2563EB');
  const [active, setActive] = useState(h?.active ?? true);
  return (
    <Workspace title={h ? `Edit ${h.name}` : 'Add a house'} onClose={onClose} actions={<button className="btn pri" disabled={!name.trim()} onClick={() => onSave({ id: h?.id, name, colour, active })}>Save</button>}>
      <div className="g2">
        <Field label="NAME" htmlFor="h-name"><input id="h-name" className="cmp-in" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Tagore" /></Field>
        <Field label="COLOUR" htmlFor="h-col"><input id="h-col" type="color" className="cmp-in" value={colour} onChange={e => setColour(e.target.value)} style={{ height: 40 }} /></Field>
      </div>
      {h && <label style={{ display: 'flex', gap: 8, fontSize: 14 }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> In use</label>}
    </Workspace>
  );
}

function AwardForm({ houses, onClose, onSave }: { houses: House[]; onClose: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const [houseId, setHouseId] = useState(houses[0]?.id ?? '');
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [onDate, setOnDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <Workspace title="Award house points" sub="For the whole house, like winning the inter-house debate. Points a student earns come with their Kirti entry." onClose={onClose}
      actions={<button className="btn pri" disabled={!houseId || !points || reason.trim().length < 2} onClick={() => onSave({ houseId, points: Number(points), reason, onDate })}>Award</button>}>
      <div className="g2">
        <Field label="HOUSE" htmlFor="ap-h"><select id="ap-h" className="cmp-sel" value={houseId} onChange={e => setHouseId(e.target.value)}>{houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
        <Field label="POINTS" htmlFor="ap-p" hint="Negative to take points away."><input id="ap-p" className="cmp-in" inputMode="numeric" value={points} onChange={e => setPoints(e.target.value)} /></Field>
        <Field label="FOR" htmlFor="ap-r"><input id="ap-r" className="cmp-in" value={reason} maxLength={160} onChange={e => setReason(e.target.value)} /></Field>
        <Field label="ON" htmlFor="ap-d"><input id="ap-d" type="date" className="cmp-in" value={onDate} onChange={e => setOnDate(e.target.value)} /></Field>
      </div>
    </Workspace>
  );
}

function Groups({ data, onDone }: { data: Data; onDone: () => void }) {
  const { call } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const [edit, setEdit] = useState<Group | 'new' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = async (b: Record<string, unknown>) => {
    setErr(null);
    try { await call(API, 'POST', { action: 'group-save', ...b }); toast('Saved.'); setEdit(null); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  return (
    <div className="card">
      {toastEl}
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <CardHead title="Clubs and teams" sub="NCC, Scouts and Guides included. The teacher in charge adds members from the teacher portal (Kirti)."
        right={data.can.manage ? <button className="btn sm pri" onClick={() => setEdit('new')}><Plus size={14} weight="bold" /> Add</button> : undefined} />
      {!data.groups.length ? <Empty icon={<Trophy size={26} weight="duotone" />} title="None yet" /> : (
        <div style={{ overflowX: 'auto' }}><table className="tbl">
          <thead><tr><th>Name</th><th>Kind</th><th>Teacher in charge</th><th /></tr></thead>
          <tbody>{data.groups.map(g => (
            <tr key={g.id}><td><b>{g.name}</b>{!g.active && <> <Chip tone="n">OFF</Chip></>}</td><td>{GROUP_KIND_LABEL[g.kind]}</td><td>{g.inChargeName ?? <span className="muted">Not set</span>}</td>
              <td>{data.can.manage && <button className="btn sm" onClick={() => setEdit(g)}>Edit</button>}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      {edit && <GroupForm g={edit === 'new' ? null : edit} teachers={data.teachers} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  );
}

function GroupForm({ g, teachers, onClose, onSave }: { g: Group | null; teachers: { id: string; name: string }[]; onClose: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const [kind, setKind] = useState<GroupKind>(g?.kind ?? 'club');
  const [name, setName] = useState(g?.name ?? '');
  const [inCharge, setInCharge] = useState(g?.in_charge ?? '');
  const [active, setActive] = useState(g?.active ?? true);
  return (
    <Workspace title={g ? `Edit ${g.name}` : 'Add a club or team'} onClose={onClose} actions={<button className="btn pri" disabled={!name.trim()} onClick={() => onSave({ id: g?.id, kind, name, inCharge: inCharge || null, active })}>Save</button>}>
      <div className="g2">
        <Field label="KIND" htmlFor="g-kind"><select id="g-kind" className="cmp-sel" value={kind} onChange={e => setKind(e.target.value as GroupKind)}>{GROUP_KINDS.map(k => <option key={k} value={k}>{GROUP_KIND_LABEL[k]}</option>)}</select></Field>
        <Field label="NAME" htmlFor="g-name"><input id="g-name" className="cmp-in" value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Under-14 football" /></Field>
        <Field label="TEACHER IN CHARGE" htmlFor="g-ic"><select id="g-ic" className="cmp-sel" value={inCharge} onChange={e => setInCharge(e.target.value)}><option value="">Not set</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
      </div>
      {g && <label style={{ display: 'flex', gap: 8, fontSize: 14 }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> In use</label>}
    </Workspace>
  );
}

function Log({ session }: { session: string }) {
  const [s, setS] = useState(session);
  const { data, error } = useGet<{ log: (PendingK & { status: string })[] }>(`${API}?view=log&session=${s}`);
  const y = Number(session.slice(0, 4));
  const [q, setQ] = useState('');
  const rows = (data?.log ?? []).filter(r => !q.trim() || `${r.student} ${r.admissionNo} ${r.title}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="card">
      <CardHead title="Kirti log" sub="Everything decided this session."
        right={<div style={{ display: 'flex', gap: 6 }}>
          <input className="cmp-in" style={{ maxWidth: 220 }} placeholder="Search" aria-label="Search" value={q} onChange={e => setQ(e.target.value)} />
          <select className="cmp-sel" aria-label="Session" value={s} onChange={e => setS(e.target.value)}>{[0, 1, 2, 3].map(k => `${y - k}-${String((y - k + 1) % 100).padStart(2, '0')}`).map(x => <option key={x} value={x}>{x}</option>)}</select>
        </div>} />
      {error && <div className="note err" role="alert">{error}</div>}
      {!data ? <Skeleton h={120} /> : !rows.length ? <p className="muted">Nothing yet.</p> : (
        <div style={{ overflowX: 'auto' }}><table className="tbl">
          <thead><tr><th>Date</th><th>Student</th><th>Kirti</th><th>Place</th><th>Status</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}><td>{fmtDate(r.on_date)}</td><td><Link href={`/admin/students/${r.student_id}`}><b>{r.student}</b></Link></td><td>{r.title}<div className="muted" style={{ fontSize: 12 }}>{LEVEL_LABEL[r.level]}</div></td>
              <td>{placeOf(r.position, r.position_note)}</td><td><Chip tone={r.status === 'approved' ? 'g' : 'r'}>{r.status.toUpperCase()}</Chip></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
