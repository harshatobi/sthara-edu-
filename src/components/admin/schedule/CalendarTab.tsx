'use client';

import { useState } from 'react';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { CalendarBlankIcon as CalendarBlank } from '@phosphor-icons/react/dist/ssr/CalendarBlank';
import { Chip, Empty, type Tone } from '@/components/canon/ui';
import { CardHead } from '@/components/admin/kit';
import { daysBetween, fmtDate, isoDay } from '@/lib/admin/format';
import { hhmm } from '@/lib/schedule/engine';
import { EVENT_KINDS, type AcademicEvent, type EventKind, type ScheduleRows, type StaffScope } from '@/lib/schedule/types';
import Pop, { run } from '@/components/schedule/Pop';

type Call = <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const API = '/api/admin/schedule/calendar';
const TONE: Record<EventKind, Tone> = { holiday: 'r', exam: 'p', ptm: 'a', meeting: 'a', event: 'b', other: 'n' };
const SCOPE: Record<StaffScope, string> = { all: 'All staff', teaching: 'Teaching staff', office: 'Office staff', none: 'No one in particular' };

export default function CalendarTab({ rows, call, reload, toast, canEdit }: { rows: ScheduleRows; call: Call; reload: () => void; toast: (m: string) => void; canEdit: boolean }) {
  const today = isoDay();
  const [past, setPast] = useState(false);
  const [editing, setEditing] = useState<Partial<AcademicEvent> | null>(null);
  const list = rows.events.filter(e => (past ? e.ends_on < today : e.ends_on >= today)).sort((a, b) => (past ? b.starts_on.localeCompare(a.starts_on) : a.starts_on.localeCompare(b.starts_on)));
  const byMonth = new Map<string, AcademicEvent[]>();
  for (const e of list) byMonth.set(e.starts_on.slice(0, 7), [...(byMonth.get(e.starts_on.slice(0, 7)) || []), e]);
  const wingNames = (ids: string[] | null) => (ids?.length ? ids.map(id => rows.wings.find(w => w.id === id)?.name || 'Wing').join(', ') : 'Whole school');
  const preset = (kind: EventKind): Partial<AcademicEvent> => ({
    kind, title: '', starts_on: today, ends_on: today, wing_ids: null, bell_schedule_id: null, suspends_classes: kind === 'holiday',
    staff_scope: kind === 'ptm' ? 'teaching' : kind === 'meeting' ? 'all' : 'none', starts_at: kind === 'ptm' || kind === 'meeting' ? '14:30' : null, ends_at: kind === 'ptm' || kind === 'meeting' ? '16:00' : null, notes: null,
  });

  return (
    <>
      <div className="card">
        <CardHead title="Academic calendar" sub="Holidays switch off lessons for the wings they cover. Exam days can swap in a variant bell schedule. Meetings and PTMs show on the staff they involve."
          right={canEdit ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['holiday', 'exam', 'ptm', 'meeting', 'event'] as EventKind[]).map(k => (
                <button key={k} className="btn sm" onClick={() => setEditing(preset(k))}><Plus size={12} weight="bold" /> {EVENT_KINDS[k]}</button>
              ))}
            </div>
          ) : undefined} />
        <div className="sch-seg" style={{ marginBottom: 16 }} role="tablist" aria-label="Which entries">
          <button role="tab" aria-selected={!past} className={!past ? 'on' : ''} onClick={() => setPast(false)}>Upcoming</button>
          <button role="tab" aria-selected={past} className={past ? 'on' : ''} onClick={() => setPast(true)}>Past</button>
        </div>
        {list.length ? [...byMonth].map(([m, evs]) => (
          <div key={m} style={{ marginBottom: 14 }}>
            <div className="lbl">{new Date(`${m}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase()}</div>
            {evs.map(e => {
              const len = daysBetween(e.starts_on, e.ends_on) + 1;
              const bell = e.bell_schedule_id ? rows.bells.find(b => b.id === e.bell_schedule_id)?.name : null;
              return (
                <div className="row" key={e.id}>
                  <div style={{ width: 92, flex: '0 0 92px' }}>
                    <b style={{ fontSize: 14 }}>{fmtDate(e.starts_on, true)}</b>
                    {len > 1 && <div className="muted" style={{ fontSize: 12 }}>to {fmtDate(e.ends_on, true)}</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{e.title}</div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                      {wingNames(e.wing_ids)}{e.suspends_classes ? ' · no classes' : ''}{bell ? ` · ${bell} bells` : ''}
                      {e.starts_at ? ` · ${hhmm(e.starts_at, true)}${e.ends_at ? `–${hhmm(e.ends_at, true)}` : ''}` : ''}
                      {e.staff_scope !== 'none' ? ` · ${SCOPE[e.staff_scope]}` : ''}
                    </div>
                  </div>
                  <Chip tone={TONE[e.kind]}>{EVENT_KINDS[e.kind].toUpperCase()}</Chip>
                  {canEdit && <>
                    <button className="sch-icon" aria-label={`Edit ${e.title}`} onClick={() => setEditing(e)}><PencilSimple size={15} /></button>
                    <button className="sch-icon" aria-label={`Remove ${e.title}`} onClick={async () => {
                      try { await call(API, 'DELETE', { id: e.id }); reload(); toast('Removed from the calendar'); } catch (x: any) { toast(x.message); }
                    }}><Trash size={15} /></button>
                  </>}
                </div>
              );
            })}
          </div>
        )) : <Empty icon={<CalendarBlank size={26} weight="duotone" />} title={past ? 'Nothing earlier this session' : 'Nothing coming up'}>Add holidays, exam windows, PTMs and staff meetings. Everyone&apos;s schedule picks them up.</Empty>}
      </div>
      {editing && <EventEditor ev={editing} rows={rows} call={call} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); toast('Calendar saved'); }} />}
    </>
  );
}

function EventEditor({ ev, rows, call, onClose, onSaved }: { ev: Partial<AcademicEvent>; rows: ScheduleRows; call: Call; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    title: ev.title || '', kind: (ev.kind || 'event') as EventKind, startsOn: ev.starts_on || isoDay(), endsOn: ev.ends_on || ev.starts_on || isoDay(),
    wingIds: ev.wing_ids || [], bellId: ev.bell_schedule_id || '', suspends: !!ev.suspends_classes, scope: (ev.staff_scope || 'none') as StaffScope,
    startsAt: ev.starts_at || '', endsAt: ev.ends_at || '', notes: ev.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const variants = rows.bells.filter(b => b.kind === 'variant');
  return (
    <Pop wide title={ev.id ? `Edit ${ev.title}` : `Add ${EVENT_KINDS[v.kind].toLowerCase()}`} onClose={onClose}>
      <div className="sch-fields">
        <div className="cmp-fld" style={{ gridColumn: '1 / -1' }}><label htmlFor="e-t">TITLE</label><input id="e-t" className="cmp-in" value={v.title} maxLength={120} onChange={e => setV({ ...v, title: e.target.value })} placeholder={v.kind === 'holiday' ? 'Diwali break' : v.kind === 'exam' ? 'Half-yearly exams' : v.kind === 'ptm' ? 'Term 1 PTM' : 'Title'} /></div>
        <div className="cmp-fld"><label htmlFor="e-k">TYPE</label>
          <select id="e-k" className="cmp-sel" value={v.kind} onChange={e => { const k = e.target.value as EventKind; setV({ ...v, kind: k, suspends: k === 'holiday' ? true : v.suspends && k !== 'ptm' }); }}>
            {Object.entries(EVENT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></div>
        <div className="cmp-fld"><label htmlFor="e-s">FROM</label><input id="e-s" type="date" className="cmp-in" value={v.startsOn} onChange={e => setV({ ...v, startsOn: e.target.value, endsOn: v.endsOn < e.target.value ? e.target.value : v.endsOn })} /></div>
        <div className="cmp-fld"><label htmlFor="e-e">TO</label><input id="e-e" type="date" className="cmp-in" min={v.startsOn} value={v.endsOn} onChange={e => setV({ ...v, endsOn: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="e-sa">STARTS AT (OPTIONAL)</label><input id="e-sa" type="time" className="cmp-in" value={v.startsAt} onChange={e => setV({ ...v, startsAt: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="e-ea">ENDS AT</label><input id="e-ea" type="time" className="cmp-in" value={v.endsAt} onChange={e => setV({ ...v, endsAt: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="e-sc">STAFF EXPECTED</label>
          <select id="e-sc" className="cmp-sel" value={v.scope} onChange={e => setV({ ...v, scope: e.target.value as StaffScope })}>{Object.entries(SCOPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      </div>
      {rows.wings.length > 0 && (
        <div className="cmp-fld"><label>APPLIES TO</label>
          <div className="sch-days">
            <button type="button" aria-pressed={!v.wingIds.length} className={!v.wingIds.length ? 'on' : ''} style={{ width: 'auto', padding: '0 12px' }} onClick={() => setV({ ...v, wingIds: [] })}>Whole school</button>
            {rows.wings.map(w => (
              <button key={w.id} type="button" aria-pressed={v.wingIds.includes(w.id)} className={v.wingIds.includes(w.id) ? 'on' : ''} style={{ width: 'auto', padding: '0 12px' }}
                onClick={() => setV({ ...v, wingIds: v.wingIds.includes(w.id) ? v.wingIds.filter(x => x !== w.id) : [...v.wingIds, w.id] })}>{w.name}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={v.suspends} onChange={e => setV({ ...v, suspends: e.target.checked, bellId: e.target.checked ? '' : v.bellId })} /> No classes on these days
        </label>
        {!v.suspends && variants.length > 0 && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>Bells:
            <select className="sch-sel" value={v.bellId} onChange={e => setV({ ...v, bellId: e.target.value })}>
              <option value="">The usual day</option>{variants.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="cmp-fld"><label htmlFor="e-n">NOTES</label><textarea id="e-n" className="cmp-in" rows={2} maxLength={2000} value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} /></div>
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || !v.title.trim()} onClick={async () => {
          if (await run(setBusy, setErr, () => call(API, 'PUT', {
            id: ev.id, title: v.title, kind: v.kind, startsOn: v.startsOn, endsOn: v.endsOn, wingIds: v.wingIds, bellScheduleId: v.bellId || null,
            suspendsClasses: v.suspends, staffScope: v.scope, startsAt: v.startsAt || null, endsAt: v.endsAt || null, notes: v.notes,
          }))) onSaved();
        }}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Pop>
  );
}
