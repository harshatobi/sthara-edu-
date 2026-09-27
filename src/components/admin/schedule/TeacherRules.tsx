'use client';

import { useMemo, useState } from 'react';
import { CardHead } from '@/components/admin/kit';
import { ruleKey, type LoadRuleRow, type SolverSettingsRow } from '@/lib/schedule/solverInput';
import { teacherLoad, versionOn } from '@/lib/schedule/engine';
import { DAY_SHORT, type ScheduleRows } from '@/lib/schedule/types';
import { isoDay } from '@/lib/admin/format';

type Call = <T = unknown>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const API = '/api/admin/schedule/solver';

/** "Sat; Wed 1,2" <-> [{ weekday: 6, periods: [] }, { weekday: 3, periods: [1, 2] }] */
export function parseTimesOff(text: string): { weekday: number; periods: number[] }[] | string {
  const out: { weekday: number; periods: number[] }[] = [];
  for (const part of text.split(/[;\n]+/).map(s => s.trim()).filter(Boolean)) {
    const m = /^([a-z]{3})[a-z]*\.?\s*(.*)$/i.exec(part);
    const wd = m ? DAY_SHORT.findIndex(d => d.toLowerCase() === m[1].toLowerCase()) : -1;
    if (!m || wd < 1) return `"${part}" isn't a day. Write it like: Sat; Wed 1,2`;
    const periods = m[2] ? m[2].split(/[\s,]+/).filter(Boolean).map(Number) : [];
    if (periods.some(p => !Number.isInteger(p) || p < 1 || p > 16)) return `"${part}": periods are numbers from 1 to 16.`;
    out.push({ weekday: wd, periods: [...new Set(periods)].sort((a, b) => a - b) });
  }
  return out;
}
export const formatTimesOff = (u: { weekday: number; periods: number[] }[]) =>
  u.map(x => `${DAY_SHORT[x.weekday]}${x.periods.length ? ` ${x.periods.join(',')}` : ''}`).join('; ');

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
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <CardHead title={mode === 'solver' ? 'Teachers: load and times off' : 'Targets and caps'}
        sub={mode === 'solver'
          ? `The solver keeps each teacher within their caps and free when they're not in. Blank uses the school default (${settings.default_max_per_day} a day, ${settings.default_max_consecutive} in a row).`
          : `Target periods a week is each teacher's contracted load (blank: the school default of ${settings.default_target_per_week}). Load analytics compares against it.`}
        right={<input className="cmp-in" style={{ width: 200 }} aria-label="Find a teacher" placeholder="Find a teacher" value={q} onChange={e => setQ(e.target.value)} />} />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Teacher</th><th className="c">Now</th><th className="c">Target a week</th><th className="c">Most a day</th><th className="c">Most a week</th><th className="c">Most in a row</th><th>Not in</th><th /></tr></thead>
          <tbody>{people.map(p => <RuleRow key={`${p.key}:${byKey.get(p.key)?.id ?? 'none'}`} person={p} rule={byKey.get(p.key)} now={load.get(p.key) ?? 0} call={call} toast={toast} onSaved={onSaved} />)}</tbody>
        </table>
      </div>
      {!people.length && <p className="muted" style={{ marginTop: 8 }}>No teachers match.</p>}
    </div>
  );
}

function RuleRow({ person, rule, now, call, toast, onSaved }: {
  person: { key: string; name: string }; rule?: LoadRuleRow; now: number; call: Call; toast: (m: string) => void; onSaved: () => void;
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
      <td><input className="cmp-in" style={{ minWidth: 140 }} aria-label={`${person.name}: times not in`} placeholder="e.g. Sat; Wed 1,2" value={v.off} maxLength={120} onChange={e => setV(x => ({ ...x, off: e.target.value }))} /></td>
      <td className="r">{dirty && (
        <button className="btn sm pri" disabled={busy} onClick={async () => {
          const off = parseTimesOff(v.off);
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
