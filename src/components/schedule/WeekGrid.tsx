'use client';

import { useState } from 'react';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { LockSimpleIcon as LockSimple } from '@phosphor-icons/react/dist/ssr/LockSimple';
import { hhmm, maxPeriods, periodOf, roomOf, teachingDays, weekGrid } from '@/lib/schedule/engine';
import { DAY_NAMES, DAY_SHORT, slotPerson, type BellSchedule, type Room, type Slot } from '@/lib/schedule/types';
import type { PrintGrid } from './print';

export type GridMode = 'class' | 'teacher' | 'room';

export interface GridRow { kind: 'period' | 'brk'; no: number | null; label: string; time: string }

/** The regular bell schedule a grid takes its row times from: the wing's Monday bells, else any of its regular days, else the school's. */
export function referenceBells(bells: BellSchedule[], wingId: string | null): BellSchedule | null {
  const regular = bells.filter(b => b.kind === 'regular');
  const forWing = regular.filter(b => b.wing_id === wingId);
  const pool = forWing.length ? forWing : regular.filter(b => b.wing_id === null);
  return pool.find(b => b.weekdays.includes(1)) ?? pool[0] ?? null;
}

export function gridRows(bells: BellSchedule[], wingId: string | null, slots: Slot[]): GridRow[] {
  const ref = referenceBells(bells, wingId);
  const top = Math.max(maxPeriods(bells), ...slots.map(s => s.period_no), 0) || 8;
  if (!ref) return Array.from({ length: top }, (_, i) => ({ kind: 'period' as const, no: i + 1, label: `P${i + 1}`, time: '' }));
  const rows: GridRow[] = ref.periods.map(p => (p.kind === 'period'
    ? { kind: 'period' as const, no: p.period_no, label: `P${p.period_no}`, time: `${hhmm(p.starts_at)}–${hhmm(p.ends_at)}` }
    : { kind: 'brk' as const, no: null, label: p.label, time: `${hhmm(p.starts_at)}–${hhmm(p.ends_at)}` }));
  // Periods lessons use that the reference day doesn't ring (another day's longer schedule).
  const have = new Set(rows.map(r => r.no));
  for (let n = 1; n <= top; n++) if (!have.has(n) && slots.some(s => s.period_no === n)) rows.push({ kind: 'period', no: n, label: `P${n}`, time: '' });
  return rows;
}

/** A day that doesn't ring this period (Saturday after P5). */
function rings(bells: BellSchedule[], wingId: string | null, weekday: number, no: number) {
  const regular = bells.filter(b => b.kind === 'regular' && b.weekdays.includes(weekday));
  const s = regular.find(b => b.wing_id === wingId) ?? regular.find(b => b.wing_id === null) ?? null;
  return !bells.length || !!periodOf(s, no);
}

export function lessonLines(s: Slot, mode: GridMode, names: Map<string, string>, rooms: Room[]): string[] {
  const who = slotPerson(s);
  const teacher = who ? names.get(who) || 'Teacher' : 'No teacher';
  const room = roomOf(s, rooms)?.name || '';
  const subj = `${s.subject}${s.group_label ? ` · ${s.group_label}` : ''}`;
  if (mode === 'class') return [subj, [teacher, room].filter(Boolean).join(' · ')];
  if (mode === 'teacher') return [subj, [s.class, room].filter(Boolean).join(' · ')];
  return [s.class, [subj, teacher].join(' · ')];
}

export function toPrintGrid(o: { title: string; subtitle: string; school: string; bells: BellSchedule[]; wingId: string | null; slots: Slot[]; mode: GridMode; names: Map<string, string>; rooms: Room[] }): PrintGrid {
  const days = teachingDays(o.bells);
  const at = weekGrid(o.slots);
  return {
    title: o.title, subtitle: o.subtitle, school: o.school, days: days.map(d => DAY_NAMES[d]),
    rows: gridRows(o.bells, o.wingId, o.slots).map(r => (r.kind === 'brk'
      ? { label: r.label, time: r.time, brk: r.label }
      : { label: r.label, time: r.time, cells: days.map(d => at(d, r.no!).flatMap(s => lessonLines(s, o.mode, o.names, o.rooms))) })),
  };
}

/**
 * Days across, bell rows down. Read-only, or editable for a draft section: a cell opens the editor,
 * and dragging a lesson onto another cell swaps the two periods.
 */
export default function WeekGrid({ bells, wingId, slots, mode, names, rooms, clashing, today, onCell, onSwap }: {
  bells: BellSchedule[]; wingId: string | null; slots: Slot[]; mode: GridMode; names: Map<string, string>; rooms: Room[];
  clashing?: Set<Slot>; today?: number;
  onCell?: (weekday: number, period: number) => void;
  onSwap?: (a: { weekday: number; period_no: number }, b: { weekday: number; period_no: number }) => void;
}) {
  const days = teachingDays(bells);
  const at = weekGrid(slots);
  const rows = gridRows(bells, wingId, slots);
  const [drag, setDrag] = useState<{ weekday: number; period_no: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const editable = !!onCell;

  return (
    <div className="sch-grid-wrap">
      <table className="sch-grid">
        <thead>
          <tr><th className="p" scope="col" aria-label="Period" />{days.map(d => <th key={d} scope="col">{DAY_SHORT[d]}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => r.kind === 'brk' ? (
            <tr className="brk" key={`b${i}`}><th className="p" scope="row">{r.time}</th><td colSpan={days.length}>{r.label}</td></tr>
          ) : (
            <tr key={`p${r.no}`}>
              <th className="p" scope="row">{r.label}<small>{r.time}</small></th>
              {days.map(d => {
                const here = at(d, r.no!);
                const live = rings(bells, wingId, d, r.no!);
                const k = `${d}|${r.no}`;
                const lessons = here.map((s, j) => (
                  <div key={s.id || j} className={`sch-l${clashing?.has(s) ? ' clash' : ''}${live ? '' : ' off'}`}
                    draggable={editable && !!onSwap && !s.combined}
                    onDragStart={e => { setDrag({ weekday: d, period_no: r.no! }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k); }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}
                    title={clashing?.has(s) ? 'Clash: this teacher or room is also booked elsewhere in this period' : s.locked ? 'Locked: re-solving keeps this lesson here' : undefined}>
                    {lessonLines(s, mode, names, rooms).map((line, n) => (n === 0 ? <b key={n}>{s.locked && <LockSimple size={10} weight="fill" aria-label="Locked" style={{ marginRight: 3, verticalAlign: -1 }} />}{line}</b> : <span key={n}>{line}</span>))}
                  </div>
                ));
                return (
                  <td key={d} className={today === d ? 'today' : undefined}>
                    {editable ? (
                      // A div, not a button: Firefox doesn't start drags on elements inside a button.
                      <div role="button" tabIndex={0} className={`sch-cell edit${over === k ? ' drop' : ''}`}
                        aria-label={`${DAY_NAMES[d]} ${r.label}: ${here.length ? here.map(s => s.subject).join(', ') : 'empty'}. Edit`}
                        onClick={() => onCell!(d, r.no!)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCell!(d, r.no!); } }}
                        onDragOver={e => { if (drag && onSwap) { e.preventDefault(); setOver(k); } }}
                        onDragLeave={() => setOver(o => (o === k ? null : o))}
                        onDrop={e => { e.preventDefault(); setOver(null); if (drag && onSwap) onSwap(drag, { weekday: d, period_no: r.no! }); setDrag(null); }}>
                        {lessons.length ? lessons : <span className="sch-add"><Plus size={12} weight="bold" /> Add</span>}
                      </div>
                    ) : <div className="sch-cell">{lessons}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
