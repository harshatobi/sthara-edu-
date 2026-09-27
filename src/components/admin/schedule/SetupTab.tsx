'use client';

import { useState } from 'react';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { BellIcon as Bell } from '@phosphor-icons/react/dist/ssr/Bell';
import { MagicWandIcon as MagicWand } from '@phosphor-icons/react/dist/ssr/MagicWand';
import { Chip, Empty } from '@/components/canon/ui';
import { CardHead } from '@/components/admin/kit';
import { plural } from '@/lib/admin/format';
import { bellProblems, hhmm, minutes, sectionsOf } from '@/lib/schedule/engine';
import { DAY_SHORT, PERIOD_KINDS, ROOM_KINDS, type BellPeriod, type BellSchedule, type PeriodKind, type Room, type RoomKind, type ScheduleRows, type Wing } from '@/lib/schedule/types';
import Pop, { run } from '@/components/schedule/Pop';

type Call = <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const API = '/api/admin/schedule/setup';

export default function SetupTab({ rows, call, reload, toast, canEdit }: { rows: ScheduleRows; call: Call; reload: () => void; toast: (m: string) => void; canEdit: boolean }) {
  const [wing, setWing] = useState<Partial<Wing> | null>(null);
  const [bell, setBell] = useState<BellSchedule | 'new' | null>(null);
  const [room, setRoom] = useState<Partial<Room> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wingName = (id: string | null) => (id ? rows.wings.find(w => w.id === id)?.name || 'Wing' : 'Whole school');
  const remove = async (entity: string, id: string, what: string) => {
    try {
      const r = await call<{ retired?: boolean }>(API, 'DELETE', { entity, id });
      reload(); toast(r.retired ? `${what} retired (a timetable uses it)` : `${what} removed`);
    } catch (e: any) { toast(e.message); }
  };

  return (
    <>
      {!rows.bells.length && canEdit && (
        <div className="card" style={{ marginBottom: 18 }}>
          <CardHead title="Start from a typical CBSE day" sub="Monday to Friday: assembly, 8 periods of 40 minutes, a short break and lunch. Saturday: a half day of 5 periods. Plus an exam-day schedule. Change any of it afterwards." />
          {err && <div className="err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn pri" disabled={busy} onClick={async () => { if (await run(setBusy, setErr, () => call(API, 'POST', { entity: 'starter' }))) { reload(); toast('Bell schedules created'); } }}>
              <MagicWand size={15} weight="fill" /> {busy ? 'Creating…' : 'Use the typical day'}</button>
            <button className="btn" onClick={() => setBell('new')}><Plus size={15} weight="bold" /> Build from scratch</button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Wings" sub="Group grades that share bell timings, like Primary (1–5) and Senior (6–12). With no wings, one set of bells serves the whole school."
          right={canEdit ? <button className="btn sm" onClick={() => setWing({ name: '', grade_from: 1, grade_to: 5 })}><Plus size={12} weight="bold" /> Add wing</button> : undefined} />
        {rows.wings.length ? rows.wings.map(w => (
          <div className="row" key={w.id}>
            <b style={{ flex: 1 }}>{w.name}</b>
            <span className="muted">Grades {w.grade_from === 0 ? 'pre-primary' : w.grade_from}–{w.grade_to}</span>
            {canEdit && <>
              <button className="sch-icon" aria-label={`Edit ${w.name}`} onClick={() => setWing(w)}><PencilSimple size={15} /></button>
              <button className="sch-icon" aria-label={`Remove ${w.name}`} onClick={() => remove('wing', w.id, w.name)}><Trash size={15} /></button>
            </>}
          </div>
        )) : <p className="muted">No wings. Every section uses the whole-school bells.</p>}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Bell schedules" sub="Regular schedules ring on their days. Variants (exam day, half day) ring only on dates the calendar assigns them."
          right={canEdit ? <button className="btn sm" onClick={() => setBell('new')}><Plus size={12} weight="bold" /> Add schedule</button> : undefined} />
        {rows.bells.length ? (
          <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
            {rows.bells.map(b => {
              const teaching = b.periods.filter(p => p.kind === 'period');
              const first = b.periods[0], last = b.periods[b.periods.length - 1];
              return (
                <div key={b.id} style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: 15 }}>{b.name}</b>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{wingName(b.wing_id)} · {b.kind === 'regular' ? b.weekdays.map(d => DAY_SHORT[d]).join(' ') : 'on assigned dates'}</div>
                    </div>
                    {b.kind === 'variant' && <Chip tone="p">VARIANT</Chip>}
                  </div>
                  <div style={{ fontSize: 13, margin: '10px 0' }}>
                    {plural(teaching.length, 'period')}{first && last ? ` · ${hhmm(first.starts_at, true)} to ${hhmm(last.ends_at, true)}` : ''}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {b.periods.map(p => (
                      <span key={p.seq} title={`${p.label} ${hhmm(p.starts_at)}–${hhmm(p.ends_at)}`} className={`ch ${p.kind === 'period' ? 'b' : 'n'}`} style={{ fontSize: 10.5 }}>
                        {p.kind === 'period' ? `P${p.period_no}` : p.label}
                      </span>
                    ))}
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                      <button className="btn sm" onClick={() => setBell(b)}><PencilSimple size={12} /> Edit</button>
                      <button className="btn sm" onClick={() => remove('bell', b.id, b.name)}><Trash size={12} /> Remove</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : <Empty icon={<Bell size={26} weight="duotone" />} title="No bells yet">Add the school&apos;s bell timings so each period has a time.</Empty>}
      </div>

      <div className="card">
        <CardHead title="Rooms" sub="A section's home room is used for every lesson that doesn't name another room, like a lab."
          right={canEdit ? <button className="btn sm" onClick={() => setRoom({ name: '', kind: 'classroom', capacity: null, home_class: null, active: true })}><Plus size={12} weight="bold" /> Add room</button> : undefined} />
        {rows.rooms.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Room</th><th>Type</th><th className="c">Seats</th><th>Home room of</th>{canEdit && <th />}</tr></thead>
              <tbody>{rows.rooms.map(r => (
                <tr key={r.id} style={r.active ? undefined : { opacity: 0.5 }}>
                  <td><b>{r.name}</b>{!r.active && <span className="muted"> · retired</span>}</td>
                  <td>{ROOM_KINDS[r.kind]}</td>
                  <td className="c num">{r.capacity ?? '—'}</td>
                  <td>{r.home_class || <span className="muted">—</span>}</td>
                  {canEdit && <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    <button className="sch-icon" aria-label={`Edit ${r.name}`} onClick={() => setRoom(r)}><PencilSimple size={15} /></button>
                    {r.active && <button className="sch-icon" aria-label={`Remove ${r.name}`} onClick={() => remove('room', r.id, r.name)}><Trash size={15} /></button>}
                  </td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted">No rooms yet. Add each section&apos;s classroom and the labs, halls and grounds that are timetabled.</p>}
      </div>

      {wing && <WingEditor wing={wing} call={call} onClose={() => setWing(null)} onSaved={() => { setWing(null); reload(); toast('Wing saved'); }} />}
      {bell && <BellEditor bell={bell === 'new' ? null : bell} wings={rows.wings} call={call} onClose={() => setBell(null)} onSaved={() => { setBell(null); reload(); toast('Bell schedule saved'); }} />}
      {room && <RoomEditor room={room} sections={sectionsOf(rows)} call={call} onClose={() => setRoom(null)} onSaved={() => { setRoom(null); reload(); toast('Room saved'); }} />}
    </>
  );
}

function Actions({ busy, err, onClose, onSave, disabled }: { busy: boolean; err: string | null; onClose: () => void; onSave: () => void; disabled?: boolean }) {
  return (
    <>
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || disabled} onClick={onSave}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </>
  );
}

function WingEditor({ wing, call, onClose, onSaved }: { wing: Partial<Wing>; call: Call; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: wing.name || '', from: String(wing.grade_from ?? 1), to: String(wing.grade_to ?? 5) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title={wing.id ? `Edit ${wing.name}` : 'Add a wing'} sub="Grade 0 is pre-primary (nursery, LKG, UKG)." onClose={onClose}>
      <div className="sch-fields">
        <div className="cmp-fld"><label htmlFor="w-n">NAME</label><input id="w-n" className="cmp-in" value={v.name} maxLength={60} onChange={e => setV({ ...v, name: e.target.value })} placeholder="Primary" /></div>
        <div className="cmp-fld"><label htmlFor="w-f">FROM GRADE</label><input id="w-f" className="cmp-in" inputMode="numeric" value={v.from} onChange={e => setV({ ...v, from: e.target.value.replace(/\D/g, '') })} /></div>
        <div className="cmp-fld"><label htmlFor="w-t">TO GRADE</label><input id="w-t" className="cmp-in" inputMode="numeric" value={v.to} onChange={e => setV({ ...v, to: e.target.value.replace(/\D/g, '') })} /></div>
      </div>
      <Actions busy={busy} err={err} onClose={onClose} disabled={!v.name.trim()} onSave={async () => {
        if (await run(setBusy, setErr, () => call(API, 'PUT', { entity: 'wing', id: wing.id, name: v.name, gradeFrom: Number(v.from), gradeTo: Number(v.to) }))) onSaved();
      }} />
    </Pop>
  );
}

const addMinutes = (t: string, n: number) => { const m = minutes(t) + n; return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

function BellEditor({ bell, wings, call, onClose, onSaved }: { bell: BellSchedule | null; wings: Wing[]; call: Call; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(bell?.name || '');
  const [wingId, setWingId] = useState(bell?.wing_id || '');
  const [kind, setKind] = useState<'regular' | 'variant'>(bell?.kind || 'regular');
  const [days, setDays] = useState<number[]>(bell?.weekdays || [1, 2, 3, 4, 5]);
  const [periods, setPeriods] = useState<BellPeriod[]>(bell?.periods.length ? bell.periods : [{ seq: 1, label: 'Period 1', kind: 'period', period_no: 1, starts_at: '08:00', ends_at: '08:40' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const problems = bellProblems(periods);
  const set = (i: number, patch: Partial<BellPeriod>) => setPeriods(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const renumber = (ps: BellPeriod[]) => { let n = 0; return ps.map(p => (p.kind === 'period' ? { ...p, period_no: ++n, label: /^Period \d+$/.test(p.label) || !p.label ? `Period ${n}` : p.label } : { ...p, period_no: null })); };
  const add = (k: PeriodKind) => setPeriods(ps => {
    const last = ps[ps.length - 1];
    const start = last ? last.ends_at : '08:00';
    const len = k === 'period' ? (last && last.kind === 'period' ? minutes(last.ends_at) - minutes(last.starts_at) : 40) : k === 'lunch' ? 30 : 15;
    return renumber([...ps, { seq: ps.length + 1, label: k === 'period' ? '' : PERIOD_KINDS[k], kind: k, period_no: null, starts_at: start, ends_at: addMinutes(start, len) }]);
  });

  return (
    <Pop wide title={bell ? `Edit ${bell.name}` : 'New bell schedule'} onClose={onClose}
      sub="Teaching periods are numbered in order; the timetable refers to them by number, so a shorter Saturday still lines up.">
      <div className="sch-fields">
        <div className="cmp-fld"><label htmlFor="b-n">NAME</label><input id="b-n" className="cmp-in" value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Regular day" /></div>
        <div className="cmp-fld"><label htmlFor="b-w">FOR</label>
          <select id="b-w" className="cmp-sel" value={wingId} onChange={e => setWingId(e.target.value)}>
            <option value="">Whole school</option>{wings.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select></div>
        <div className="cmp-fld"><label htmlFor="b-k">TYPE</label>
          <select id="b-k" className="cmp-sel" value={kind} onChange={e => setKind(e.target.value as 'regular' | 'variant')}>
            <option value="regular">Regular (rings on set days)</option><option value="variant">Variant (exam day, half day)</option>
          </select></div>
      </div>
      {kind === 'regular' && (
        <div className="cmp-fld"><label>DAYS</label>
          <div className="sch-days">{[1, 2, 3, 4, 5, 6, 7].map(d => (
            <button key={d} type="button" aria-pressed={days.includes(d)} className={days.includes(d) ? 'on' : ''} onClick={() => setDays(ds => (ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d].sort()))}>{DAY_SHORT[d]}</button>
          ))}</div>
        </div>
      )}
      <div className="sch-periods" style={{ marginTop: 8 }}>
        <div className="r hd"><span>Type</span><span>Label</span><span>No.</span><span>Starts</span><span>Ends</span><span /></div>
        {periods.map((p, i) => (
          <div className="r" key={i}>
            <select aria-label="Type" value={p.kind} onChange={e => setPeriods(ps => renumber(ps.map((x, j) => (j === i ? { ...x, kind: e.target.value as PeriodKind, label: e.target.value === 'period' ? '' : PERIOD_KINDS[e.target.value as PeriodKind] } : x))))}>
              {Object.entries(PERIOD_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input aria-label="Label" value={p.label} maxLength={40} onChange={e => set(i, { label: e.target.value })} />
            <span className="muted" style={{ textAlign: 'center' }}>{p.period_no ? `P${p.period_no}` : '—'}</span>
            <input aria-label="Starts" type="time" value={p.starts_at} onChange={e => set(i, { starts_at: e.target.value })} />
            <input aria-label="Ends" type="time" value={p.ends_at} onChange={e => set(i, { ends_at: e.target.value })} />
            <button type="button" className="sch-icon" aria-label="Remove row" onClick={() => setPeriods(ps => renumber(ps.filter((_, j) => j !== i)))}><Trash size={14} /></button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => add('period')}><Plus size={12} weight="bold" /> Period</button>
        <button className="btn sm" onClick={() => add('break')}><Plus size={12} weight="bold" /> Break</button>
        <button className="btn sm" onClick={() => add('lunch')}><Plus size={12} weight="bold" /> Lunch</button>
        <button className="btn sm" onClick={() => add('assembly')}><Plus size={12} weight="bold" /> Assembly</button>
      </div>
      {problems.length > 0 && <div className="note" style={{ marginTop: 12 }}>{problems.map((p, i) => <div key={i}>{p}</div>)}</div>}
      <Actions busy={busy} err={err} onClose={onClose} disabled={!name.trim() || problems.length > 0 || (kind === 'regular' && !days.length)} onSave={async () => {
        if (await run(setBusy, setErr, () => call(API, 'PUT', { entity: 'bell', id: bell?.id, name, wingId: wingId || null, kind, weekdays: days, periods: periods.map(p => ({ ...p, label: p.label || (p.kind === 'period' ? `Period ${p.period_no}` : PERIOD_KINDS[p.kind]) })) }))) onSaved();
      }} />
    </Pop>
  );
}

function RoomEditor({ room, sections, call, onClose, onSaved }: { room: Partial<Room>; sections: string[]; call: Call; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: room.name || '', kind: (room.kind || 'classroom') as RoomKind, capacity: room.capacity ? String(room.capacity) : '', home: room.home_class || '', active: room.active !== false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title={room.id ? `Edit ${room.name}` : 'Add a room'} onClose={onClose}>
      <div className="sch-fields">
        <div className="cmp-fld"><label htmlFor="r-n">NAME</label><input id="r-n" className="cmp-in" value={v.name} maxLength={60} onChange={e => setV({ ...v, name: e.target.value })} placeholder="Room 204" /></div>
        <div className="cmp-fld"><label htmlFor="r-k">TYPE</label>
          <select id="r-k" className="cmp-sel" value={v.kind} onChange={e => setV({ ...v, kind: e.target.value as RoomKind })}>{Object.entries(ROOM_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="cmp-fld"><label htmlFor="r-c">SEATS</label><input id="r-c" className="cmp-in" inputMode="numeric" value={v.capacity} onChange={e => setV({ ...v, capacity: e.target.value.replace(/\D/g, '') })} /></div>
        {v.kind === 'classroom' && (
          <div className="cmp-fld"><label htmlFor="r-h">HOME ROOM OF</label>
            <select id="r-h" className="cmp-sel" value={v.home} onChange={e => setV({ ...v, home: e.target.value })}>
              <option value="">No section</option>{sections.map(c => <option key={c} value={c}>{c}</option>)}
            </select></div>
        )}
      </div>
      {room.id && !room.active && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={v.active} onChange={e => setV({ ...v, active: e.target.checked })} /> Back in use</label>
      )}
      <Actions busy={busy} err={err} onClose={onClose} disabled={!v.name.trim()} onSave={async () => {
        if (await run(setBusy, setErr, () => call(API, 'PUT', { entity: 'room', id: room.id, name: v.name, kind: v.kind, capacity: v.capacity || null, homeClass: v.kind === 'classroom' ? v.home : '', active: v.active }))) onSaved();
      }} />
    </Pop>
  );
}
