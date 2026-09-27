'use client';

import { inContract } from '@/lib/schedule/engine';
import { STAFF_CATEGORIES, type PersonKey, type ScheduleRows, type StaffCategory } from '@/lib/schedule/types';

export interface PersonOption { key: PersonKey; name: string; group: string; note: string }

/**
 * Everyone who can hold a cover, a duty or an absence: teacher and office accounts, then register
 * members with no login by category. Register members outside their contract on `date` are left out.
 */
export function peopleOptions(rows: ScheduleRows, date?: string, only?: 'teaching'): PersonOption[] {
  const byUser = new Map(rows.staff.filter(s => s.user_id).map(s => [s.user_id!, s]));
  const out: PersonOption[] = [];
  for (const p of rows.people) {
    if (only === 'teaching' && p.role !== 'teacher') continue;
    out.push({ key: p.id, name: p.name, group: p.role === 'teacher' ? 'Teachers' : 'Office', note: byUser.get(p.id)?.designation || '' });
  }
  for (const m of rows.staff) {
    if (m.user_id || !m.active || (date && !inContract(m, date))) continue;
    if (only === 'teaching' && m.category !== 'teaching') continue;
    out.push({ key: `s:${m.id}`, name: m.name, group: `${STAFF_CATEGORIES[m.category as StaffCategory]} (no login)`, note: [m.designation, m.employment === 'visiting' ? 'visiting' : ''].filter(Boolean).join(', ') });
  }
  return out;
}

/** A single-person select grouped by kind of staff. */
export function PersonSelect({ id, value, onChange, options, placeholder = 'Pick someone', className = 'cmp-sel' }: {
  id?: string; value: string; onChange: (k: string) => void; options: PersonOption[]; placeholder?: string; className?: string;
}) {
  const groups = [...new Set(options.map(o => o.group))];
  return (
    <select id={id} className={className} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {groups.map(g => (
        <optgroup key={g} label={g}>
          {options.filter(o => o.group === g).map(o => <option key={o.key} value={o.key}>{o.name}{o.note ? ` (${o.note})` : ''}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
