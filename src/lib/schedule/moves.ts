/**
 * Moving a lesson by hand: for a section's period that has been picked up, where in the week it can go.
 * A move swaps two periods of one section (an empty period is a plain move). Pure.
 */
import { normClass } from '@/lib/teacher/scope';
import { clashesFor, type ClockOf } from './engine';
import { slotPerson, type PersonKey, type Room, type Slot } from './types';

export type MoveMark = 'pick' | 'can' | 'can-swap' | 'cant';
export interface MoveOption { mark: MoveMark; why?: string }
export interface Cell { weekday: number; period_no: number }
export const cellKey = (c: Cell) => `${c.weekday}|${c.period_no}`;

/** A section's two periods exchanged, as the lessons of the whole timetable would then stand. */
export function swapped(cls: string, a: Cell, b: Cell, slots: Slot[]): { next: Slot[]; moved: Slot[] } {
  const ck = normClass(cls);
  const at = (s: Slot, c: Cell) => normClass(s.class) === ck && s.weekday === c.weekday && s.period_no === c.period_no;
  const moved: Slot[] = [];
  const next = slots.map(s => {
    const to = at(s, a) ? b : at(s, b) ? a : null;
    if (!to) return s;
    const m = { ...s, weekday: to.weekday, period_no: to.period_no };
    moved.push(m);
    return m;
  });
  return { next, moved };
}

/**
 * For the period picked up (`from`), every other period of the section's week: free to move into, free to swap with
 * what's there, or not (and why). `cells` are the periods the section's bells ring.
 */
export function moveOptions(cls: string, from: Cell, slots: Slot[], cells: Cell[], rooms: Room[], clock: ClockOf | undefined, names: Map<PersonKey, string>): Map<string, MoveOption> {
  const out = new Map<string, MoveOption>([[cellKey(from), { mark: 'pick' }]]);
  const ck = normClass(cls);
  const here = (c: Cell) => slots.filter(s => normClass(s.class) === ck && s.weekday === c.weekday && s.period_no === c.period_no);
  const lifting = here(from);
  for (const c of cells) {
    if (c.weekday === from.weekday && c.period_no === from.period_no) continue;
    const there = here(c);
    if ([...lifting, ...there].some(s => s.combined)) {
      out.set(cellKey(c), { mark: 'cant', why: 'A combined lesson moves with its other sections. Edit each section\'s period instead.' });
      continue;
    }
    const { next, moved } = swapped(cls, from, c, slots);
    let why = '';
    for (const m of moved) {
      const clash = clashesFor(m, next.filter(x => x !== m), rooms, clock)[0];
      if (!clash) continue;
      const others = clash.slots.filter(x => x !== m).map(x => x.class).join(', ');
      why = clash.kind === 'teacher' ? `${names.get(slotPerson(m) ?? '') || 'The teacher'} is teaching ${others} then.`
        : clash.kind === 'room' ? `The room is taken by ${others} then.` : 'The section already has a lesson then.';
      break;
    }
    out.set(cellKey(c), why ? { mark: 'cant', why } : { mark: there.length ? 'can-swap' : 'can' });
  }
  return out;
}

/** Lessons that differ between two versions of a timetable, counted once per lesson that appears, moves or goes. */
export function changedLessons(before: Slot[], after: Slot[]): Slot[] {
  const key = (s: Slot) => `${normClass(s.class)}|${s.weekday}|${s.period_no}|${s.subject.toLowerCase()}|${(s.group_label || '').toLowerCase()}|${slotPerson(s) ?? ''}`;
  const was = new Set(before.map(key));
  return after.filter(s => !was.has(key(s)));
}
