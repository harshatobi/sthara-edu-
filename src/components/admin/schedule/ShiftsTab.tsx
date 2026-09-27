'use client';

import { useMemo, useState } from 'react';
import { CaretLeftIcon as CaretLeft } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon as CaretRight } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { ClockIcon as Clock } from '@phosphor-icons/react/dist/ssr/Clock';
import { Empty, Skeleton } from '@/components/canon/ui';
import { CardHead } from '@/components/admin/kit';
import { fmtDate } from '@/lib/admin/format';
import { expectedOn, hm, localOf, type Expected, type Person, type Plan, type Shift } from '@/lib/attendance/engine';
import { useAttendance } from '@/lib/attendance/useAttendance';
import { addDays, datesBetween, hhmm, weekStart } from '@/lib/schedule/engine';
import { DAY_SHORT, personKey } from '@/lib/schedule/types';
import Pop, { run } from '@/components/schedule/Pop';

type Call = <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const API = '/api/admin/attendance';
const t = (s: string) => hhmm(s, true);

function cellText(e: Expected): { text: string; tone: string } {
  if (e.kind === 'work') return { text: `${e.label} ${hhmm(hm(e.start))}`, tone: 'var(--pale)' };
  if (e.kind === 'leave') return { text: 'Leave', tone: '#F1ECFF' };
  return { text: e.why === 'holiday' ? 'Holiday' : e.why === 'weekly_off' ? 'Week off' : e.why === 'override' ? 'Off (changed)' : 'Off', tone: '#F1F4F9' };
}

/**
 * Shifts (schedule.workforce): named hours, each person's plan (a fixed shift or a weekly rotation; a fixed or
 * rotating weekly off; works holidays; exempt from late rules), and a week grid where HR and the principal
 * change anyone's day or swap two people.
 */
export default function ShiftsTab({ toast, canEdit }: { toast: (m: string) => void; canEdit: boolean }) {
  const [today] = useState(() => localOf(Date.now()).date);
  const [week, setWeek] = useState(() => weekStart(today));
  const { data, error, reload, call } = useAttendance(week, addDays(week, 6));
  const [shift, setShift] = useState<Partial<Shift> | null>(null);
  const [plan, setPlan] = useState<Person | null>(null);
  const [cell, setCell] = useState<{ p: Person; date: string } | null>(null);
  const [who, setWho] = useState<'register' | 'all'>('register');
  const days = datesBetween(week, addDays(week, 6));
  const people = useMemo(() => (data?.people || []).filter(p => who === 'all' || p.kind === 'register' || data?.rows.plans.some(x => personKey(x.user_id, x.staff_member_id) === p.key)), [data, who]);

  if (error) return <div className="note err" role="alert">Couldn&apos;t load shifts: {error}</div>;
  if (!data) return <div className="card" aria-busy="true">{[0, 1, 2].map(i => <Skeleton key={i} h={44} style={{ marginBottom: 12 }} />)}</div>;
  const planOf = (k: string) => data.rows.plans.find(x => personKey(x.user_id, x.staff_member_id) === k);
  const shiftName = (id: string | null) => data.rows.shifts.find(s => s.id === id)?.name ?? '?';
  const planText = (pl: Plan | undefined) => {
    if (!pl) return 'No plan: teachers and office follow school hours; staff aren\'t rostered';
    const shifts = pl.mode === 'fixed' ? shiftName(pl.shift_id) : `rotates ${pl.rotation.map(shiftName).join(' → ')}`;
    const off = pl.off_mode === 'none' ? 'no weekly off' : pl.off_mode === 'fixed' ? `off ${pl.off_days.map(d => DAY_SHORT[d]).join(', ')}` : `off rotates ${pl.off_cycle.map(d => DAY_SHORT[d]).join(' → ')}`;
    return [shifts, off, pl.works_holidays ? 'works holidays' : '', pl.rules_exempt ? 'exempt from late rules' : ''].filter(Boolean).join(' · ');
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Shifts" sub="Named hours. A shift that ends before it starts runs overnight."
          right={canEdit ? <button className="btn sm pri" onClick={() => setShift({ name: '', starts_at: '06:00', ends_at: '14:00', active: true })}><Plus size={12} weight="bold" /> Add shift</button> : undefined} />
        {data.rows.shifts.length ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.rows.shifts.map(s => (
              <button key={s.id} className="sch-chipbtn" style={{ opacity: s.active ? 1 : 0.5, padding: '8px 12px' }} disabled={!canEdit} onClick={() => setShift(s)}>
                <Clock size={13} /> {s.name} · {t(s.starts_at)}–{t(s.ends_at)}
              </button>
            ))}
          </div>
        ) : <Empty icon={<Clock size={26} weight="duotone" />} title="No shifts yet">Add the shifts support staff work: Morning 6:00–14:00, Evening 14:00–22:00, Night 22:00–6:00.</Empty>}
      </div>

      <div className="card">
        <div className="sch-bar">
          <h3 style={{ fontSize: 17, fontWeight: 800 }}>Week</h3>
          <button className="btn sm" aria-label="Previous week" onClick={() => setWeek(w => addDays(w, -7))}><CaretLeft size={14} weight="bold" /></button>
          <button className="btn sm" onClick={() => setWeek(weekStart(today))}>This week</button>
          <button className="btn sm" aria-label="Next week" onClick={() => setWeek(w => addDays(w, 7))}><CaretRight size={14} weight="bold" /></button>
          <b>{fmtDate(week, true)} – {fmtDate(addDays(week, 6))}</b>
          <span className="sp" />
          <div className="sch-seg" role="tablist" aria-label="Who">
            <button role="tab" aria-selected={who === 'register'} className={who === 'register' ? 'on' : ''} onClick={() => setWho('register')}>On shifts</button>
            <button role="tab" aria-selected={who === 'all'} className={who === 'all' ? 'on' : ''} onClick={() => setWho('all')}>Everyone</button>
          </div>
        </div>
        <p className="muted" style={{ marginBottom: 12, fontSize: 12.5 }}>Click a day to change it for one person (another shift, a day off, a working day) or to swap with someone. Every change keeps its reason.</p>
        {people.length ? (
          <div className="tbl-wrap">
            <table className="tbl sch-roster">
              <thead><tr><th>Name</th>{days.map(d => <th key={d} className="c">{DAY_SHORT[new Date(`${d}T12:00:00Z`).getUTCDay() || 7]} {d.slice(8)}</th>)}</tr></thead>
              <tbody>{people.map(p => (
                <tr key={p.key}>
                  <td style={{ minWidth: 180 }}>
                    <b>{p.name}</b>
                    <div className="muted" style={{ fontSize: 11.5 }}>{planText(planOf(p.key))}</div>
                    {canEdit && <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setPlan(p)}><PencilSimple size={12} /> Plan</button>}
                  </td>
                  {days.map(d => {
                    const e = expectedOn(d, p, data.rows);
                    const c = cellText(e);
                    const changed = data.rows.overrides.some(o => o.on_date === d && personKey(o.user_id, o.staff_member_id) === p.key);
                    return (
                      <td key={d} className="c">
                        <button type="button" className="sch-chipbtn" disabled={!canEdit} style={{ background: c.tone, outline: changed ? '2px solid var(--amber)' : undefined }}
                          aria-label={`${p.name}, ${d}: ${c.text}`} onClick={() => setCell({ p, date: d })}>{c.text}</button>
                      </td>
                    );
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted">{who === 'register' ? 'Nobody is on a shift plan yet. Switch to Everyone to give someone a plan.' : 'Nobody on the register.'}</p>}
      </div>

      {shift && <ShiftEditor shift={shift} call={call} onClose={() => setShift(null)} onSaved={() => { setShift(null); reload(); toast('Shift saved'); }} />}
      {plan && <PlanEditor p={plan} existing={planOf(plan.key)} shifts={data.rows.shifts.filter(s => s.active)} call={call} onClose={() => setPlan(null)} onSaved={() => { setPlan(null); reload(); toast('Plan saved'); }} />}
      {cell && <DayEditor p={cell.p} date={cell.date} data={data} people={data.people} call={call} onClose={() => setCell(null)} onSaved={m => { setCell(null); reload(); toast(m); }} />}
    </>
  );
}

function ShiftEditor({ shift, call, onClose, onSaved }: { shift: Partial<Shift>; call: Call; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: shift.name || '', startsAt: shift.starts_at || '06:00', endsAt: shift.ends_at || '14:00', active: shift.active !== false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title={shift.id ? `Edit ${shift.name}` : 'Add a shift'} onClose={onClose}>
      <div className="sch-fields">
        <div className="cmp-fld"><label htmlFor="sh-n">NAME</label><input id="sh-n" className="cmp-in" maxLength={60} value={v.name} onChange={e => setV({ ...v, name: e.target.value })} placeholder="Morning" /></div>
        <div className="cmp-fld"><label htmlFor="sh-s">FROM</label><input id="sh-s" type="time" className="cmp-in" value={v.startsAt} onChange={e => setV({ ...v, startsAt: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="sh-e">TO</label><input id="sh-e" type="time" className="cmp-in" value={v.endsAt} onChange={e => setV({ ...v, endsAt: e.target.value })} /></div>
      </div>
      {v.endsAt < v.startsAt && <p className="muted" style={{ fontSize: 12.5 }}>Runs overnight, ending the next morning.</p>}
      {shift.id && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={v.active} onChange={e => setV({ ...v, active: e.target.checked })} /> In use</label>}
      {err && <div className="err" role="alert" style={{ marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || !v.name.trim()} onClick={async () => { if (await run(setBusy, setErr, () => call(API, 'PUT', { entity: 'shift', id: shift.id, ...v }))) onSaved(); }}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Pop>
  );
}

function Days({ value, onChange, single }: { value: number[]; onChange: (v: number[]) => void; single?: boolean }) {
  return (
    <div className="sch-days">{[1, 2, 3, 4, 5, 6, 7].map(d => (
      <button key={d} type="button" aria-pressed={value.includes(d)} className={value.includes(d) ? 'on' : ''}
        onClick={() => onChange(single ? [d] : value.includes(d) ? value.filter(x => x !== d) : [...value, d].sort())}>{DAY_SHORT[d]}</button>
    ))}</div>
  );
}

function PlanEditor({ p, existing, shifts, call, onClose, onSaved }: { p: Person; existing?: Plan; shifts: Shift[]; call: Call; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    mode: existing?.mode || 'fixed', shiftId: existing?.shift_id || shifts[0]?.id || '', rotation: existing?.rotation?.length ? existing.rotation : shifts.slice(0, 2).map(s => s.id),
    offMode: existing?.off_mode || 'fixed', offDays: existing?.off_days?.length ? existing.off_days : [7], offCycle: existing?.off_cycle?.length ? existing.off_cycle : [7, 1],
    anchorDate: existing?.anchor_date || weekStart(new Date().toISOString().slice(0, 10)), worksHolidays: !!existing?.works_holidays, rulesExempt: !!existing?.rules_exempt,
    graceMin: existing?.grace_min === null || existing?.grace_min === undefined ? '' : String(existing.grace_min),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!shifts.length) return <Pop title={`${p.name}'s plan`} onClose={onClose}><p>Add a shift first.</p></Pop>;
  return (
    <Pop wide title={`${p.name}'s plan`} sub="Rotations count weeks from the start week: week 1 takes the first shift, week 2 the second, and so on, then repeat." onClose={onClose}>
      <div className="sch-seg" style={{ marginBottom: 12 }}>
        <button className={v.mode === 'fixed' ? 'on' : ''} onClick={() => setV({ ...v, mode: 'fixed' })}>Fixed shift</button>
        <button className={v.mode === 'rotating' ? 'on' : ''} onClick={() => setV({ ...v, mode: 'rotating' })}>Rotating shifts</button>
      </div>
      {v.mode === 'fixed' ? (
        <div className="cmp-fld"><label htmlFor="pl-s">SHIFT</label>
          <select id="pl-s" className="cmp-sel" value={v.shiftId} onChange={e => setV({ ...v, shiftId: e.target.value })}>{shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({t(s.starts_at)}–{t(s.ends_at)})</option>)}</select></div>
      ) : (
        <div className="cmp-fld"><label>WEEK BY WEEK</label>
          {v.rotation.map((id, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span className="muted" style={{ width: 60 }}>Week {i + 1}</span>
              <select className="cmp-sel" aria-label={`Week ${i + 1}`} value={id} onChange={e => setV({ ...v, rotation: v.rotation.map((x, j) => (j === i ? e.target.value : x)) })}>{shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              {v.rotation.length > 2 && <button className="btn sm" onClick={() => setV({ ...v, rotation: v.rotation.filter((_, j) => j !== i) })}>Remove</button>}
            </div>
          ))}
          <button className="btn sm" onClick={() => setV({ ...v, rotation: [...v.rotation, shifts[0].id] })}><Plus size={12} weight="bold" /> Add a week</button>
        </div>
      )}
      <div className="sch-seg" style={{ margin: '8px 0 12px' }}>
        <button className={v.offMode === 'fixed' ? 'on' : ''} onClick={() => setV({ ...v, offMode: 'fixed' })}>Fixed weekly off</button>
        <button className={v.offMode === 'rotating' ? 'on' : ''} onClick={() => setV({ ...v, offMode: 'rotating' })}>Rotating weekly off</button>
        <button className={v.offMode === 'none' ? 'on' : ''} onClick={() => setV({ ...v, offMode: 'none' })}>No weekly off</button>
      </div>
      {v.offMode === 'fixed' && <div className="cmp-fld"><label>OFF EVERY WEEK ON</label><Days value={v.offDays} onChange={d => setV({ ...v, offDays: d })} /></div>}
      {v.offMode === 'rotating' && (
        <div className="cmp-fld"><label>DAY OFF, WEEK BY WEEK</label>
          {v.offCycle.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span className="muted" style={{ width: 60 }}>Week {i + 1}</span>
              <Days single value={[d]} onChange={x => setV({ ...v, offCycle: v.offCycle.map((y, j) => (j === i ? x[0] : y)) })} />
              {v.offCycle.length > 2 && <button className="btn sm" onClick={() => setV({ ...v, offCycle: v.offCycle.filter((_, j) => j !== i) })}>Remove</button>}
            </div>
          ))}
          <button className="btn sm" onClick={() => setV({ ...v, offCycle: [...v.offCycle, 7] })}><Plus size={12} weight="bold" /> Add a week</button>
        </div>
      )}
      <div className="sch-fields">
        <div className="cmp-fld"><label htmlFor="pl-a">ROTATIONS START THE WEEK OF</label><input id="pl-a" type="date" className="cmp-in" value={v.anchorDate} onChange={e => setV({ ...v, anchorDate: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="pl-g">THEIR GRACE (MINUTES)</label><input id="pl-g" className="cmp-in" inputMode="numeric" placeholder="School's" value={v.graceMin} onChange={e => setV({ ...v, graceMin: e.target.value.replace(/\D/g, '') })} /></div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '4px 0' }}><input type="checkbox" checked={v.worksHolidays} onChange={e => setV({ ...v, worksHolidays: e.target.checked })} /> Works on school holidays (security, watch)</label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '4px 0' }}><input type="checkbox" checked={v.rulesExempt} onChange={e => setV({ ...v, rulesExempt: e.target.checked })} /> Exempt from the late and short-day rules</label>
      {err && <div className="err" role="alert" style={{ marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        {existing && <button className="btn" disabled={busy} onClick={async () => { if (await run(setBusy, setErr, () => call(API, 'DELETE', { entity: 'plan', id: (existing as any).id }))) onSaved(); }}>Remove plan</button>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy} onClick={async () => { if (await run(setBusy, setErr, () => call(API, 'PUT', { entity: 'plan', person: p.key, ...v, graceMin: v.graceMin === '' ? null : Number(v.graceMin) }))) onSaved(); }}>{busy ? 'Saving…' : 'Save plan'}</button>
      </div>
    </Pop>
  );
}

function DayEditor({ p, date, data, people, call, onClose, onSaved }: {
  p: Person; date: string; data: NonNullable<ReturnType<typeof useAttendance>['data']>; people: Person[]; call: Call; onClose: () => void; onSaved: (m: string) => void;
}) {
  const current = expectedOn(date, p, data.rows);
  const existing = data.rows.overrides.find(o => o.on_date === date && personKey(o.user_id, o.staff_member_id) === p.key) as any;
  const [mode, setMode] = useState<'change' | 'swap'>('change');
  const [kind, setKind] = useState<'shift' | 'off' | 'work'>(current.kind === 'work' ? 'off' : 'shift');
  const [shiftId, setShiftId] = useState(data.rows.shifts.find(s => s.active)?.id || '');
  const [other, setOther] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const shiftIdOf = (e: Expected) => (e.kind === 'work' ? data.rows.shifts.find(s => s.name === e.label)?.id ?? null : null);
  const otherP = people.find(x => x.key === other);
  const otherE = otherP ? expectedOn(date, otherP, data.rows) : null;
  const side = (e: Expected) => (shiftIdOf(e) ? { kind: 'shift', shiftId: shiftIdOf(e) } : e.kind === 'work' ? { kind: 'work' } : { kind: 'off' });
  return (
    <Pop title={`${p.name} · ${fmtDate(date)}`} sub={`Planned: ${cellText(current).text}.`} onClose={onClose}>
      <div className="sch-seg" style={{ marginBottom: 12 }}>
        <button className={mode === 'change' ? 'on' : ''} onClick={() => setMode('change')}>Change this day</button>
        <button className={mode === 'swap' ? 'on' : ''} onClick={() => setMode('swap')}>Swap with someone</button>
      </div>
      {mode === 'change' ? (
        <div className="sch-fields">
          <div className="cmp-fld"><label htmlFor="dy-k">MAKE IT</label>
            <select id="dy-k" className="cmp-sel" value={kind} onChange={e => setKind(e.target.value as any)}>
              <option value="shift">Another shift</option><option value="off">A day off</option><option value="work">A working day (their usual hours)</option>
            </select></div>
          {kind === 'shift' && <div className="cmp-fld"><label htmlFor="dy-s">SHIFT</label>
            <select id="dy-s" className="cmp-sel" value={shiftId} onChange={e => setShiftId(e.target.value)}>{data.rows.shifts.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name} ({t(s.starts_at)}–{t(s.ends_at)})</option>)}</select></div>}
        </div>
      ) : (
        <div className="cmp-fld"><label htmlFor="dy-o">SWAP WITH</label>
          <select id="dy-o" className="cmp-sel" value={other} onChange={e => setOther(e.target.value)}>
            <option value="">Pick someone</option>{people.filter(x => x.key !== p.key).map(x => <option key={x.key} value={x.key}>{x.name} ({cellText(expectedOn(date, x, data.rows)).text})</option>)}
          </select>
          {otherE && <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{p.name} takes {cellText(otherE).text}; {otherP!.name} takes {cellText(current).text}.</p>}
        </div>
      )}
      <div className="cmp-fld"><label htmlFor="dy-r">REASON</label><input id="dy-r" className="cmp-in" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder="Family function; covering for Ramesh" /></div>
      {err && <div className="err" role="alert">{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        {existing && <button className="btn" disabled={busy} onClick={async () => { if (await run(setBusy, setErr, () => call(API, 'DELETE', { entity: 'override', id: existing.id }))) onSaved(existing.swap_group ? 'Swap undone' : 'Back to the plan'); }}>{existing.swap_group ? 'Undo swap' : 'Back to plan'}</button>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || !reason.trim() || (mode === 'swap' && !other)} onClick={async () => {
          const body = mode === 'change'
            ? { entity: 'override', person: p.key, date, kind, shiftId: kind === 'shift' ? shiftId : null, reason }
            : { entity: 'swap', date, reason, a: { person: p.key, ...side(otherE!) }, b: { person: other, ...side(current) } };
          if (await run(setBusy, setErr, () => call(API, 'PUT', body))) onSaved(mode === 'swap' ? 'Swapped' : 'Day changed');
        }}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Pop>
  );
}
