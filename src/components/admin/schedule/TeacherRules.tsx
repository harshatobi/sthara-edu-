'use client';

import { useMemo, useState } from 'react';
import { CardHead } from '@/components/admin/kit';
import { ruleKey, type LoadRuleRow, type SolverSettingsRow } from '@/lib/schedule/solverInput';
import { periodClock, teacherLoad, versionOn } from '@/lib/schedule/engine';
import { DAY_SHORT, type ScheduleRows } from '@/lib/schedule/types';
import { isoDay } from '@/lib/admin/format';

type Call = <T = unknown>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const API = '/api/admin/schedule/solver';

export type TimeOff = { weekday: number; periods: number[]; from?: string | null; to?: string | null };
const hm = (t: string) => { const m = /^(\d{1,2})[:.](\d{2})$/.exec(t.trim()); return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : null; };
const short = (t: string) => t.replace(/^0(\d)/, '$1');

/**
 * "Sat; Wed 9:00-11:30; Fri 1,2" <-> [{ weekday: 6, periods: [] }, { weekday: 3, periods: [], from: '09:00', to: '11:30' }, { weekday: 5, periods: [1, 2] }].
 * A clock time means the same in every wing; period numbers only when the whole school rings one timetable
 * (`periodsOk`), since another wing's period 2 can be at a different time.
 */
export function parseTimesOff(text: string, periodsOk = true): TimeOff[] | string {
  const out: TimeOff[] = [];
  for (const part of text.split(/[;\n]+/).map(s => s.trim()).filter(Boolean)) {
    const m = /^([a-z]{3})[a-z]*\.?\s*(.*)$/i.exec(part);
    const wd = m ? DAY_SHORT.findIndex(d => d.toLowerCase() === m[1].toLowerCase()) : -1;
    if (!m || wd < 1) return `"${part}" isn't a day. Write it like: Sat; Wed 9:00-11:30`;
    const rest = m[2].trim();
    const range = /^(\S+)\s*(?:-|to|–)\s*(\S+)$/i.exec(rest);
    if (range && (range[1].includes(':') || range[1].includes('.'))) {
      const from = hm(range[1]), to = hm(range[2]);
      if (!from || !to || from >= to) return `"${part}": write the time like 9:00-11:30, start before end.`;
      out.push({ weekday: wd, periods: [], from, to });
      continue;
    }
    const periods = rest ? rest.split(/[\s,]+/).filter(Boolean).map(Number) : [];
    if (periods.some(p => !Number.isInteger(p) || p < 1 || p > 16)) return `"${part}": periods are numbers from 1 to 16, or write a time like 9:00-11:30.`;
    if (periods.length && !periodsOk) return `"${part}": your wings ring at different times, so period numbers are ambiguous. Write the time instead, like ${DAY_SHORT[wd]} 9:00-11:30.`;
    out.push({ weekday: wd, periods: [...new Set(periods)].sort((a, b) => a - b) });
  }
  return out;
}
export const formatTimesOff = (u: TimeOff[]) =>
  u.map(x => `${DAY_SHORT[x.weekday]}${x.from && x.to ? ` ${short(x.from)}-${short(x.to)}` : x.periods.length ? ` ${x.periods.join(',')}` : ''}`).join('; ');

/** Whether every wing rings the same periods at the same times (then period numbers mean one time). */
export function oneClock(rows: Pick<ScheduleRows, 'wings' | 'bells'>): boolean {
  const clock = periodClock(rows);
  const probes = ['Class 1', 'Class 5', 'Class 8', 'Class 10', 'Class 12', ...rows.wings.map(w => `Class ${w.grade_from}`)];
  for (let wd = 1; wd <= 7; wd++) for (let p = 1; p <= 16; p++) {
    const seen = new Set(probes.map(c => clock(c, wd, p)).filter(Boolean).map(t => t!.join('-')));
    if (seen.size > 1) return false;
  }
  return true;
}

/**
 * Each teacher's load rules: the target periods a week (what load analytics measures against), caps a day, a week
 * and in a row, and the times they're not in (the solver keeps them free). `mode` only changes the wording.
 */
export default function TeacherRules({ rows, rules, settings, call, toast, onSaved, mode }: {
  rows: ScheduleRows; rules: LoadRuleRow[]; settings: SolverSettingsRow; call: Call; toast: (m: string) => void; onSaved: () => void; mode: 'solver' | 'load';
}) {
  const [q, setQ] = useState('');
  const load = useMemo(() => {
    const v = versionOn(rows.versions.filter(x => x.status === 'published'), isoDay());
    return teacherLoad(v ? rows.slots.filter(s => s.version_id === v.id) : []);
  }, [rows]);
  const people = [
    ...rows.people.filter(p => p.role === 'teacher').map(p => ({ key: p.id, name: p.name || 'Teacher' })),
    ...rows.staff.filter(m => !m.user_id && m.active && m.category === 'teaching').map(m => ({ key: `s:${m.id}`, name: `${m.name} (register)` })),
  ].filter(p => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const byKey = new Map(rules.map(r => [ruleKey(r), r]));
  const periodsOk = useMemo(() => oneClock(rows), [rows]);
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <CardHead title={mode === 'solver' ? 'Teachers: load and times off' : 'Targets and caps'}
        sub={mode === 'solver'
          ? `The solver keeps each teacher within their caps and free when they're not in (a day, a time like Wed 9:00-11:30${periodsOk ? ', or period numbers' : ''}). Blank uses the school default (${settings.default_max_per_day} a day, ${settings.default_max_consecutive} in a row).`
          : `Target periods a week is each teacher's contracted load (blank: the school default of ${settings.default_target_per_week}). Load analytics compares against it.`}
        right={<input className="cmp-in" style={{ width: 200 }} aria-label="Find a teacher" placeholder="Find a teacher" value={q} onChange={e => setQ(e.target.value)} />} />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Teacher</th><th className="c">Now</th><th className="c">Target a week</th><th className="c">Most a day</th><th className="c">Most a week</th><th className="c">Most in a row</th><th>Not in</th><th /></tr></thead>
          <tbody>{people.map(p => <RuleRow key={`${p.key}:${byKey.get(p.key)?.id ?? 'none'}`} person={p} rule={byKey.get(p.key)} now={load.get(p.key) ?? 0} call={call} toast={toast} onSaved={onSaved} periodsOk={periodsOk} />)}</tbody>
        </table>
      </div>
      {!people.length && <p className="muted" style={{ marginTop: 8 }}>No teachers match.</p>}
    </div>
  );
}

function RuleRow({ person, rule, now, call, toast, onSaved, periodsOk }: {
  person: { key: string; name: string }; rule?: LoadRuleRow; now: number; call: Call; toast: (m: string) => void; onSaved: () => void; periodsOk: boolean;
}) {
  const initial = {
    target: rule?.target_per_week?.toString() ?? '', perDay: rule?.max_per_day?.toString() ?? '', perWeek: rule?.max_per_week?.toString() ?? '',
    run: rule?.max_consecutive?.toString() ?? '', off: formatTimesOff(rule?.unavailable ?? []),
  };
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const n = (k: 'target' | 'perDay' | 'perWeek' | 'run', label: string) => (
    <input className="cmp-in" style={{ width: 60, textAlign: 'center' }} inputMode="numeric" aria-label={`${person.name}: ${label}`} placeholder="—" value={v[k]} maxLength={2}
      onChange={e => setV(x => ({ ...x, [k]: e.target.value.replace(/\D/g, '') }))} />
  );
  const target = v.target ? Number(v.target) : null;
  return (
    <tr>
      <td><b>{person.name}</b>{err && <div style={{ color: 'var(--red)', fontSize: 12 }}>{err}</div>}</td>
      <td className="c num" style={{ color: target !== null && now > target ? 'var(--red)' : undefined }}>{now}</td>
      <td className="c">{n('target', 'target periods a week')}</td>
      <td className="c">{n('perDay', 'most periods a day')}</td>
      <td className="c">{n('perWeek', 'most periods a week')}</td>
      <td className="c">{n('run', 'most periods in a row')}</td>
      <td><input className="cmp-in" style={{ minWidth: 140 }} aria-label={`${person.name}: times not in`} placeholder={periodsOk ? 'e.g. Sat; Wed 9:00-11:30; Fri 1,2' : 'e.g. Sat; Wed 9:00-11:30'} value={v.off} maxLength={120} onChange={e => setV(x => ({ ...x, off: e.target.value }))} /></td>
      <td className="r">{dirty && (
        <button className="btn sm pri" disabled={busy} onClick={async () => {
          const off = parseTimesOff(v.off, periodsOk);
          if (typeof off === 'string') { setErr(off); return; }
          setBusy(true); setErr(null);
          try {
            const num = (s: string) => (s ? Number(s) : null);
            await call(API, 'PUT', { entity: 'rule', person: person.key, targetPerWeek: num(v.target), maxPerDay: num(v.perDay), maxPerWeek: num(v.perWeek), maxConsecutive: num(v.run), unavailable: off });
            toast(`${person.name.replace(' (register)', '')}: saved`); onSaved();
          } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
        }}>{busy ? 'Saving…' : 'Save'}</button>
      )}</td>
    </tr>
  );
}
