'use client';

import { useCallback, useState } from 'react';
import { TrophyIcon as Trophy } from '@phosphor-icons/react/dist/ssr/Trophy';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { Field, Workspace } from '@/components/admin/kit';
import { useAuth } from '@/contexts/AuthContext';
import { fmtDate, isoDay } from '@/lib/admin/format';
import {
  CATEGORIES, CATEGORY_LABEL, GROUP_KIND_LABEL, LEVELS, LEVEL_LABEL, POSITIONS, POSITION_LABEL, placeOf, type GroupKind, type Level, type Position,
} from '@/lib/cocurricular/kirti';

interface View {
  session: string; classes: string[]; groups: { id: string; kind: GroupKind; name: string }[]; houses: { id: string; name: string }[];
  mine: { id: string; on_date: string; title: string; level: Level; position: Position; position_note: string | null; status: string; reject_note: string | null; student: string }[];
}
interface Pick { id: string; name: string; admissionNo: string; cls: string | null }
const API = '/api/teacher/kirti';

/** Kirti for teachers: record achievements and events, keep a club's members, propose house points. */
export default function KirtiPage() {
  const { data, error, reload } = useGet<View>(API);
  const { getAuthToken } = useAuth();
  const [toast, toastEl] = useToast();
  const [panel, setPanel] = useState<null | 'record' | 'points' | { group: View['groups'][number] }>(null);
  const call = useCallback(async <T,>(method: 'GET' | 'POST', q: string, body?: unknown): Promise<T> => {
    const token = await getAuthToken();
    const res = await fetch(`${API}${q}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out?.error || 'Something went wrong. Try again.');
    return out as T;
  }, [getAuthToken]);
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div aria-busy="true"><Skeleton h={30} w={280} /><div className="card" style={{ marginTop: 20 }}>{[0, 1, 2, 3].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div></div>;
  return (
    <>
      {toastEl}
      <PageBar eyebrow="KIRTI" title="Kirti: achievements and events" sub="Record what students achieve and take part in. The academic coordinator approves each entry before parents see it."
        actions={<><button className="btn pri" onClick={() => setPanel('record')}><Trophy size={16} /> Record</button>{data.houses.length > 0 && <button className="btn" onClick={() => setPanel('points')}>House points</button>}</>} />
      {data.groups.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Clubs and teams you run</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{data.groups.map(g => <button key={g.id} className="btn" onClick={() => setPanel({ group: g })}>{g.name} <span className="muted">· {GROUP_KIND_LABEL[g.kind]}</span></button>)}</div>
        </div>
      )}
      <div className="card">
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>What you recorded</h3>
        {!data.mine.length ? <Empty icon={<Trophy size={26} weight="duotone" />} title="Nothing yet">Record a win, a place, or simply who took part in an event.</Empty> : (
          <div style={{ overflowX: 'auto' }}><table className="tbl">
            <tbody>{data.mine.map(m => (
              <tr key={m.id}><td>{fmtDate(m.on_date)}</td><td><b>{m.student}</b></td><td>{m.title}<div className="muted" style={{ fontSize: 12 }}>{LEVEL_LABEL[m.level]} · {placeOf(m.position, m.position_note)}</div></td>
                <td><Chip tone={m.status === 'approved' ? 'g' : m.status === 'rejected' ? 'r' : 'n'}>{m.status === 'pending' ? 'WITH THE COORDINATOR' : m.status.toUpperCase()}</Chip>{m.reject_note && <div className="muted" style={{ fontSize: 12 }}>{m.reject_note}</div>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {panel === 'record' && <Record view={data} call={call} onClose={() => setPanel(null)} onDone={n => { setPanel(null); toast(`Recorded for ${n} student${n === 1 ? '' : 's'}. It goes to the coordinator.`); reload(); }} />}
      {panel === 'points' && <Points houses={data.houses} call={call} onClose={() => setPanel(null)} onDone={() => { setPanel(null); toast('Sent to the coordinator.'); }} />}
      {panel && typeof panel === 'object' && <Members group={panel.group} view={data} call={call} onClose={() => setPanel(null)} />}
    </>
  );
}

type Call = <T>(method: 'GET' | 'POST', q: string, body?: unknown) => Promise<T>;

/** Picks students: by class (the teacher's classes) or by searching the school. */
function Picker({ view, call, picked, setPicked }: { view: View; call: Call; picked: Pick[]; setPicked: (p: Pick[]) => void }) {
  const [cls, setCls] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Pick[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = async (query: string) => {
    setErr(null);
    try { setFound((await call<{ students: Pick[] }>('GET', query)).students); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load.'); }
  };
  const has = new Set(picked.map(p => p.id));
  const toggle = (s: Pick) => setPicked(has.has(s.id) ? picked.filter(p => p.id !== s.id) : [...picked, s]);
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="g2">
        <Field label="A CLASS" htmlFor="kp-cls"><select id="kp-cls" className="cmp-sel" value={cls} onChange={e => { setCls(e.target.value); if (e.target.value) void load(`?cls=${encodeURIComponent(e.target.value)}`); }}>
          <option value="">Pick a class</option>{view.classes.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
        <Field label="OR SEARCH THE SCHOOL" htmlFor="kp-q"><input id="kp-q" className="cmp-in" value={q} placeholder="Name or admission no." onChange={e => { setQ(e.target.value); if (e.target.value.trim().length >= 2) void load(`?q=${encodeURIComponent(e.target.value.trim())}`); }} /></Field>
      </div>
      {err && <div className="note err" role="alert">{err}</div>}
      {found.length > 0 && (
        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 8 }}>
          {cls && <button type="button" className="btn sm" style={{ marginBottom: 6 }} onClick={() => setPicked([...picked, ...found.filter(f => !has.has(f.id))])}>Pick the whole class</button>}
          {found.map(s => <label key={s.id} style={{ display: 'flex', gap: 8, fontSize: 14, padding: '3px 0' }}><input type="checkbox" checked={has.has(s.id)} onChange={() => toggle(s)} /> {s.name} <span className="muted">{s.admissionNo}{s.cls ? ` · ${s.cls}` : ''}</span></label>)}
        </div>
      )}
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{picked.length ? `${picked.length} picked: ${picked.slice(0, 6).map(p => p.name).join(', ')}${picked.length > 6 ? ', ...' : ''}` : 'Nobody picked yet.'}</p>
    </div>
  );
}

function Record({ view, call, onClose, onDone }: { view: View; call: Call; onClose: () => void; onDone: (n: number) => void }) {
  const [picked, setPicked] = useState<Pick[]>([]);
  const [e, setE] = useState({ title: '', category: 'sports', level: 'school', position: 'participant', position_note: '', on_date: isoDay(), house_points: '', notes: '' });
  const [groupId, setGroupId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof e, v: string) => setE(x => ({ ...x, [k]: v }));
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      let attachment: { path: string; fileName: string } | undefined;
      if (file && picked.length === 1) {
        const up = await call<{ url: string; path: string }>('POST', '', { action: 'attach-url', studentId: picked[0].id, fileName: file.name, fileBytes: file.size });
        const put = await fetch(up.url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' }, body: file });
        if (!put.ok) throw new Error('The file did not upload. Try again.');
        attachment = { path: up.path, fileName: file.name };
      }
      const r = await call<{ added: number }>('POST', '', { action: 'record', studentIds: picked.map(p => p.id), groupId: groupId || null, attachment, entry: { ...e, house_points: e.house_points === '' ? null : Number(e.house_points) } });
      onDone(r.added);
    } catch (x) { setErr(x instanceof Error ? x.message : 'Could not save.'); setBusy(false); }
  };
  return (
    <Workspace wide title="Record Kirti" sub="One entry for each student picked: a whole team or every participant at once." onClose={onClose}
      actions={<button className="btn pri" disabled={busy || !picked.length || e.title.trim().length < 2} onClick={go}>{busy ? 'Saving' : 'Record'}</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <Picker view={view} call={call} picked={picked} setPicked={setPicked} />
      <div className="g2">
        <Field label="EVENT OR AWARD" htmlFor="kr-t"><input id="kr-t" className="cmp-in" value={e.title} maxLength={160} placeholder="Inter-school football tournament" onChange={x => set('title', x.target.value)} /></Field>
        <Field label="DATE" htmlFor="kr-d"><input id="kr-d" type="date" className="cmp-in" value={e.on_date} onChange={x => set('on_date', x.target.value)} /></Field>
        <Field label="CATEGORY" htmlFor="kr-c"><select id="kr-c" className="cmp-sel" value={e.category} onChange={x => set('category', x.target.value)}>{CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></Field>
        <Field label="LEVEL" htmlFor="kr-l"><select id="kr-l" className="cmp-sel" value={e.level} onChange={x => set('level', x.target.value)}>{LEVELS.map(l => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</select></Field>
        <Field label="POSITION" htmlFor="kr-p"><select id="kr-p" className="cmp-sel" value={e.position} onChange={x => set('position', x.target.value)}>{POSITIONS.map(p => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}</select></Field>
        {e.position === 'other' && <Field label="WHAT WAS IT" htmlFor="kr-pn"><input id="kr-pn" className="cmp-in" value={e.position_note} maxLength={60} placeholder="Best speaker" onChange={x => set('position_note', x.target.value)} /></Field>}
        {view.houses.length > 0 && <Field label="HOUSE POINTS (OPTIONAL)" htmlFor="kr-hp" hint="Each student's house gets these."><input id="kr-hp" className="cmp-in" inputMode="numeric" value={e.house_points} onChange={x => set('house_points', x.target.value)} /></Field>}
        {view.groups.length > 0 && <Field label="FOR A CLUB OR TEAM (OPTIONAL)" htmlFor="kr-g"><select id="kr-g" className="cmp-sel" value={groupId} onChange={x => setGroupId(x.target.value)}><option value="">None</option>{view.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>}
      </div>
      <Field label="NOTES (OPTIONAL)" htmlFor="kr-n"><input id="kr-n" className="cmp-in" value={e.notes} maxLength={500} onChange={x => set('notes', x.target.value)} /></Field>
      {picked.length === 1 && <Field label="CERTIFICATE OR PHOTO (OPTIONAL)" htmlFor="kr-f" hint="Kept on the student's record as a document, up to 25 MB."><input id="kr-f" type="file" className="cmp-in" onChange={x => setFile(x.target.files?.[0] ?? null)} /></Field>}
    </Workspace>
  );
}

function Points({ houses, call, onClose, onDone }: { houses: View['houses']; call: Call; onClose: () => void; onDone: () => void }) {
  const [houseId, setHouseId] = useState(houses[0]?.id ?? '');
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setErr(null);
    try { await call('POST', '', { action: 'points', houseId, points: Number(points), reason, onDate: isoDay() }); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  return (
    <Workspace title="House points" sub="For a whole house, like winning the inter-house quiz. The coordinator approves." onClose={onClose}
      actions={<button className="btn pri" disabled={!points || reason.trim().length < 2} onClick={go}>Send</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <div className="g2">
        <Field label="HOUSE" htmlFor="pt-h"><select id="pt-h" className="cmp-sel" value={houseId} onChange={e => setHouseId(e.target.value)}>{houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
        <Field label="POINTS" htmlFor="pt-p"><input id="pt-p" className="cmp-in" inputMode="numeric" value={points} onChange={e => setPoints(e.target.value)} /></Field>
      </div>
      <Field label="FOR" htmlFor="pt-r"><input id="pt-r" className="cmp-in" value={reason} maxLength={160} onChange={e => setReason(e.target.value)} /></Field>
    </Workspace>
  );
}

function Members({ group, view, call, onClose }: { group: View['groups'][number]; view: View; call: Call; onClose: () => void }) {
  const { data, reload } = useGet<{ members: { id: string; studentId: string; role: string | null; leftOn: string | null; name: string; admissionNo: string }[] }>(`${API}?groupId=${group.id}`);
  const [picked, setPicked] = useState<Pick[]>([]);
  const [role, setRole] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const post = async (body: Record<string, unknown>) => {
    setErr(null);
    try { await call('POST', '', { groupId: group.id, ...body }); reload(); return true; } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); return false; }
  };
  return (
    <Workspace wide title={group.name} sub={`${GROUP_KIND_LABEL[group.kind]} · members this session (${view.session})`} onClose={onClose}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {!data ? <Skeleton h={80} /> : !data.members.length ? <p className="muted">No members yet.</p> : (
        <div style={{ overflowX: 'auto', marginBottom: 16 }}><table className="tbl"><tbody>{data.members.map(m => (
          <tr key={m.id}><td><b>{m.name}</b><div className="muted" style={{ fontSize: 12 }}>{m.admissionNo}</div></td>
            <td><input className="cmp-in" aria-label={`Role of ${m.name}`} defaultValue={m.role ?? ''} maxLength={40} placeholder="Member" onBlur={x => { if (x.target.value !== (m.role ?? '')) void post({ action: 'member-update', memberId: m.id, role: x.target.value }); }} /></td>
            <td>{m.leftOn ? <><span className="muted">Left {fmtDate(m.leftOn)}</span> <button className="btn sm" onClick={() => post({ action: 'member-update', memberId: m.id, leave: false })}>Back</button></> : <button className="btn sm" onClick={() => post({ action: 'member-update', memberId: m.id, leave: true })}>Left</button>}</td></tr>
        ))}</tbody></table></div>
      )}
      <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Add members</h3>
      <Picker view={view} call={call} picked={picked} setPicked={setPicked} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}><Field label="ROLE (OPTIONAL)" htmlFor="mm-r"><input id="mm-r" className="cmp-in" value={role} maxLength={40} placeholder="Captain" onChange={e => setRole(e.target.value)} /></Field></div>
        <button className="btn pri" disabled={!picked.length} onClick={async () => { if (await post({ action: 'members-add', studentIds: picked.map(p => p.id), role })) { setPicked([]); setRole(''); } }}>Add {picked.length || ''}</button>
      </div>
    </Workspace>
  );
}
