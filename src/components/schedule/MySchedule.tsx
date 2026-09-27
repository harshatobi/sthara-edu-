'use client';

import { useMemo, useState } from 'react';
import { CaretLeftIcon as CaretLeft } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon as CaretRight } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { CalendarXIcon as CalendarX } from '@phosphor-icons/react/dist/ssr/CalendarX';
import { SunHorizonIcon as SunHorizon } from '@phosphor-icons/react/dist/ssr/SunHorizon';
import { Chip, Empty } from '@/components/canon/ui';
import { LEAVE_TYPES } from '@/lib/admin/constants';
import { fmtDate, isoDay, plural } from '@/lib/admin/format';
import { addDays, agenda, hhmm, minutes, monthEnd, monthStart, versionOn, weekStart, weekdayOf, wingOf, type AgendaDay, type AgendaItem, type Subject } from '@/lib/schedule/engine';
import { DAY_NAMES, DAY_SHORT, EVENT_KINDS, type ScheduleRows, type Slot } from '@/lib/schedule/types';
import { normClass } from '@/lib/teacher/scope';
import WeekGrid, { toPrintGrid, type GridMode } from './WeekGrid';
import { printGrids } from './print';
import '@/styles/schedule.css';

type View = 'day' | 'week' | 'month' | 'grid';
const VIEWS: [View, string][] = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['grid', 'Timetable']];

/** The version whose weekly grid to show: the one in force today, else the next one to start. */
export function gridVersion(rows: ScheduleRows, today: string) {
  return versionOn(rows.versions, today)
    ?? rows.versions.filter(v => v.status === 'published' && v.effective_from && v.effective_from > today).sort((a, b) => a.effective_from!.localeCompare(b.effective_from!))[0]
    ?? null;
}

export default function MySchedule({ rows, who, schoolName, title, canLookup = true }: {
  rows: ScheduleRows; who: Subject; schoolName: string; title: string; canLookup?: boolean;
}) {
  const today = isoDay();
  const [view, setView] = useState<View>(who.kind === 'office' ? 'month' : 'day');
  const [anchor, setAnchor] = useState(today);
  const [lookup, setLookup] = useState('');
  const [printErr, setPrintErr] = useState<string | null>(null);
  const names = useMemo(() => new Map(rows.people.map(p => [p.id, p.name || 'Teacher'])), [rows.people]);

  const range = view === 'day' ? [anchor, anchor] : view === 'week' ? [weekStart(anchor), addDays(weekStart(anchor), 6)]
    : [weekStart(monthStart(anchor)), addDays(weekStart(monthEnd(anchor)), 6)];
  const days = useMemo(() => agenda(who, range[0], range[1], rows), [who, range[0], range[1], rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = (n: number) => setAnchor(a => (view === 'day' ? addDays(a, n) : view === 'week' ? addDays(a, 7 * n)
    : `${new Date(Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7)}-01`));
  const label = view === 'day' ? `${DAY_NAMES[weekdayOf(anchor)]}, ${fmtDate(anchor)}`
    : view === 'week' ? `${fmtDate(range[0], true)} – ${fmtDate(range[1])}`
      : new Date(`${anchor}T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const gv = gridVersion(rows, today);
  const upcoming = rows.versions.filter(v => v.status === 'published' && v.effective_from && v.effective_from > today)
    .sort((a, b) => a.effective_from!.localeCompare(b.effective_from!))[0];
  const gridFor = (w: Subject): { slots: Slot[]; mode: GridMode; wing: string | null; title: string } => {
    const vs = rows.slots.filter(s => s.version_id === gv?.id);
    if (w.kind === 'class') return { slots: vs.filter(s => normClass(s.class) === normClass(w.cls)), mode: 'class', wing: wingOf(w.cls, rows.wings)?.id ?? null, title: w.cls };
    if (w.kind === 'room') return { slots: vs.filter(s => s.room_id === w.roomId || (!s.room_id && rows.rooms.find(r => r.id === w.roomId)?.home_class && normClass(rows.rooms.find(r => r.id === w.roomId)!.home_class) === normClass(s.class))), mode: 'room', wing: null, title: rows.rooms.find(r => r.id === w.roomId)?.name || 'Room' };
    if (w.kind === 'teacher') {
      const mine = vs.filter(s => s.teacher_id === w.userId);
      return { slots: mine, mode: 'teacher', wing: mine[0] ? wingOf(mine[0].class, rows.wings)?.id ?? null : null, title };
    }
    return { slots: [], mode: 'teacher', wing: null, title };
  };
  const lookupWho: Subject | null = lookup.startsWith('c:') ? { kind: 'class', cls: lookup.slice(2) } : lookup.startsWith('r:') ? { kind: 'room', roomId: lookup.slice(2) } : null;
  const print = (w: Subject) => {
    const g = gridFor(w);
    setPrintErr(null);
    try {
      printGrids([toPrintGrid({ title: g.title, subtitle: gv ? `${gv.name} · from ${fmtDate(gv.effective_from)}` : '', school: schoolName, bells: rows.bells, wingId: g.wing, slots: g.slots, mode: g.mode, names, rooms: rows.rooms })]);
    } catch (e: any) { setPrintErr(e.message); }
  };
  const sections = useMemo(() => [...new Set(rows.slots.filter(s => s.version_id === gv?.id).map(s => s.class))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })), [rows.slots, gv?.id]);

  return (
    <>
      <div className="sch-bar">
        <div className="sch-seg" role="tablist" aria-label="Schedule view">
          {VIEWS.filter(([v]) => v !== 'grid' || who.kind !== 'office').map(([v, t]) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{t}</button>
          ))}
        </div>
        {view !== 'grid' && (
          <>
            <button className="btn sm" onClick={() => step(-1)} aria-label="Previous"><CaretLeft size={14} weight="bold" /></button>
            <button className="btn sm" onClick={() => setAnchor(today)} disabled={anchor === today}>Today</button>
            <button className="btn sm" onClick={() => step(1)} aria-label="Next"><CaretRight size={14} weight="bold" /></button>
            <b style={{ fontSize: 15 }}>{label}</b>
          </>
        )}
        <span className="sp" />
        {view === 'grid' && who.kind !== 'office' && gv && <button className="btn sm" onClick={() => print(who)}><Printer size={14} /> Print</button>}
      </div>
      {upcoming && gv?.id !== upcoming.id && (
        <div className="note info" style={{ marginBottom: 16 }}>A new timetable, {upcoming.name}, takes effect {fmtDate(upcoming.effective_from)}. Your days from then follow it.</div>
      )}
      {printErr && <div className="err" role="alert" style={{ marginBottom: 12 }}>{printErr}</div>}

      {view === 'day' && <DayView day={days[0]} who={who} hasTimetable={!!versionOn(rows.versions, anchor)} isToday={anchor === today} />}
      {view === 'week' && <WeekList days={days} today={today} who={who} />}
      {view === 'month' && <MonthView days={days} anchor={anchor} today={today} onPick={d => { setAnchor(d); setView('day'); }} />}
      {view === 'grid' && (gv ? (
        <>
          <p className="muted" style={{ marginBottom: 10 }}>{gv.name} · {gv.effective_from && gv.effective_from > today ? `starts ${fmtDate(gv.effective_from)}` : `in force since ${fmtDate(gv.effective_from)}`}. Holidays and exam days change individual days; see Day and Week.</p>
          <WeekGrid bells={rows.bells} wingId={gridFor(who).wing} slots={gridFor(who).slots} mode={gridFor(who).mode} names={names} rooms={rows.rooms} today={weekdayOf(today)} />
        </>
      ) : <div className="card"><Empty icon={<CalendarX size={26} weight="duotone" />} title="No timetable published yet">The office publishes the school timetable. Your periods show here as soon as it&apos;s out.</Empty></div>)}

      {canLookup && gv && (
        <div className="card" style={{ marginTop: 22 }}>
          <div className="sch-bar" style={{ marginBottom: lookupWho ? 14 : 0 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800 }}>Look up a timetable</h3>
            <select className="sch-sel" aria-label="Class or room" value={lookup} onChange={e => setLookup(e.target.value)}>
              <option value="">Pick a class or room</option>
              {sections.length > 0 && <optgroup label="Classes">{sections.map(c => <option key={c} value={`c:${c}`}>{c}</option>)}</optgroup>}
              {rows.rooms.some(r => r.active) && <optgroup label="Rooms">{rows.rooms.filter(r => r.active).map(r => <option key={r.id} value={`r:${r.id}`}>{r.name}</option>)}</optgroup>}
            </select>
            <span className="sp" />
            {lookupWho && <button className="btn sm" onClick={() => print(lookupWho)}><Printer size={14} /> Print</button>}
          </div>
          {lookupWho && (() => { const g = gridFor(lookupWho); return <WeekGrid bells={rows.bells} wingId={g.wing} slots={g.slots} mode={g.mode} names={names} rooms={rows.rooms} today={weekdayOf(today)} />; })()}
        </div>
      )}
    </>
  );
}

function ItemRow({ i, compact }: { i: AgendaItem; compact?: boolean }) {
  if (i.kind === 'leave') {
    return <div className="sch-item leave"><div className="m"><b>On {LEAVE_TYPES[i.leaveType]?.toLowerCase() || 'leave'}{i.halfDay ? ' (half day)' : ''}</b>{!compact && <div>Approved. Your periods are marked for cover.</div>}</div></div>;
  }
  if (i.kind === 'bell') return <div className="sch-item bell">{i.label} · {hhmm(i.start)}–{hhmm(i.end)}</div>;
  if (i.kind === 'event') {
    return (
      <div className={`sch-item event${i.required ? ' req' : ''}`}>
        <div className="m">
          <b>{i.event.title}</b>
          <div>{EVENT_KINDS[i.event.kind]}{i.start ? ` · ${hhmm(i.start, true)}${i.end ? `–${hhmm(i.end, true)}` : ''}` : ''}{i.event.suspends_classes ? ' · no classes' : ''}</div>
          {/* In the narrow week cards the chip sits under the text instead of squeezing it. */}
          {i.required && compact && <div style={{ marginTop: 6 }}><Chip tone="a">YOU&apos;RE EXPECTED</Chip></div>}
        </div>
        {i.required && !compact && <Chip tone="a">YOU&apos;RE EXPECTED</Chip>}
      </div>
    );
  }
  const s = i.slot;
  return (
    <div className={`sch-item lesson${i.covered ? ' covered' : ''}`}>
      <div className="m">
        <b>{s.subject}{s.group_label ? ` · ${s.group_label}` : ''}</b>
        <div>{s.class}{i.room ? ` · ${i.room.name}` : ''}{i.teacherName && !compact ? ` · ${i.teacherName}` : ''}{compact ? ` · P${s.period_no}` : ` · Period ${s.period_no}`}</div>
      </div>
      {i.covered && <Chip tone="n">ON LEAVE</Chip>}
    </div>
  );
}

function DayView({ day, who, hasTimetable, isToday }: { day: AgendaDay; who: Subject; hasTimetable: boolean; isToday: boolean }) {
  if (day.off) {
    return <div className="card"><Empty icon={<SunHorizon size={26} weight="duotone" />} title={day.off.title}>{EVENT_KINDS[day.off.kind]}. No classes{day.off.ends_on !== day.off.starts_on ? ` until ${fmtDate(day.off.ends_on, true)}` : ''}.</Empty></div>;
  }
  const lessons = day.items.filter(i => i.kind === 'lesson').length;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startOf = (i: AgendaItem) => (i.kind === 'lesson' || i.kind === 'bell' || i.kind === 'event' ? i.start : null);
  // The "now" line goes before the first item still to start today.
  const nowAt = isToday ? day.items.findIndex(i => { const s = startOf(i); return !!s && minutes(s) > nowMin; }) : -1;
  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {who.kind !== 'office' && <Chip tone="b">{plural(lessons, 'PERIOD')}</Chip>}
        {day.cancelled > 0 && <Chip tone="n">{day.cancelled} OFF FOR A WING HOLIDAY OR SHORTER DAY</Chip>}
      </div>
      {!day.items.length ? (
        <Empty icon={<CalendarX size={26} weight="duotone" />} title={who.kind === 'office' ? 'Nothing on the calendar' : hasTimetable ? 'No periods today' : 'No timetable in force'}>
          {who.kind === 'office' ? 'Calendar events and your leave show here.' : hasTimetable ? 'A free day on the timetable.' : 'Once the office publishes a timetable, your periods show here.'}
        </Empty>
      ) : (
        <div className="sch-day">
          {day.items.map((i, n) => {
            const start = startOf(i);
            const line = n === nowAt;
            return (
              <div key={n} style={{ display: 'contents' }}>
                {line && <div className="sch-now" aria-label="Now" />}
                <div className="t">{start ? hhmm(start, true) : i.kind === 'leave' ? 'All day' : ''}</div>
                <ItemRow i={i} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WeekList({ days, today, who }: { days: AgendaDay[]; today: string; who: Subject }) {
  const shown = days.filter(d => d.items.length || d.off || d.weekday <= 6);
  return (
    <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))' }}>
      {shown.map(d => (
        <div className="card" key={d.date} style={{ padding: 18, outline: d.date === today ? '2px solid var(--blue)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <b style={{ fontSize: 15 }}>{DAY_SHORT[d.weekday]} {fmtDate(d.date, true)}</b>
            {who.kind !== 'office' && !d.off && <span className="muted" style={{ fontSize: 12 }}>{plural(d.items.filter(i => i.kind === 'lesson').length, 'period')}</span>}
          </div>
          {d.off ? <div className="sch-item event"><div className="m"><b>{d.off.title}</b><div>No classes</div></div></div>
            : d.items.length ? d.items.filter(i => i.kind !== 'bell').map((i, n) => <ItemRow key={n} i={i} compact />)
              : <p className="muted" style={{ fontSize: 12.5 }}>{d.weekday === 7 ? 'Sunday' : 'Nothing scheduled'}</p>}
        </div>
      ))}
    </div>
  );
}

function MonthView({ days, anchor, today, onPick }: { days: AgendaDay[]; anchor: string; today: string; onPick: (d: string) => void }) {
  const month = anchor.slice(0, 7);
  return (
    <div className="sch-month" role="grid" aria-label="Month">
      {[1, 2, 3, 4, 5, 6, 7].map(d => <div className="h" key={d} role="columnheader">{DAY_SHORT[d]}</div>)}
      {days.map(d => {
        const events = d.items.filter(i => i.kind === 'event') as Extract<AgendaItem, { kind: 'event' }>[];
        const leave = d.items.find(i => i.kind === 'leave');
        const lessons = d.items.filter(i => i.kind === 'lesson').length;
        return (
          <button key={d.date} type="button" role="gridcell" onClick={() => onPick(d.date)}
            className={`d${d.date.slice(0, 7) !== month ? ' out' : ''}${d.date === today ? ' today' : ''}${d.off ? ' off' : ''}`}
            aria-label={`${fmtDate(d.date)}${d.off ? `, ${d.off.title}` : ''}${lessons ? `, ${lessons} periods` : ''}`}>
            <span className="n">{Number(d.date.slice(8))}</span>
            {leave && <span className="tag leave">On leave</span>}
            {events.slice(0, 2).map(e => <span key={e.event.id} className={`tag ${e.event.kind}`} title={e.event.title}>{e.event.title}</span>)}
            {events.length > 2 && <span className="cnt">+{events.length - 2} more</span>}
            {lessons > 0 && !d.off && <span className="cnt">{plural(lessons, 'period')}</span>}
          </button>
        );
      })}
    </div>
  );
}
