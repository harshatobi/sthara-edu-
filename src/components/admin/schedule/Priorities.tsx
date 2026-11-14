'use client';

import { useState } from 'react';
import { CardHead } from '@/components/admin/kit';
import { weightsOf, type SolverSettingsRow, type SolverWeights } from '@/lib/schedule/solverInput';

type Call = <T = unknown>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const API = '/api/admin/schedule/solver';
const LEVELS = ['Off', 'Low', 'Normal', 'High'];
const PRIORITIES: { key: keyof SolverWeights; label: string; note: string }[] = [
  { key: 'classTeacher', label: 'The class teacher takes period 1', note: 'Attendance and the day\'s notices with the teacher who knows the class.' },
  { key: 'spread', label: 'Subjects spread across the week', note: 'Not twice on Monday and nothing till Thursday.' },
  { key: 'gaps', label: 'No gaps in a teacher\'s day', note: 'Free periods at the start or end of the day, not stranded between lessons.' },
  { key: 'balance', label: 'Even days for teachers', note: 'No seven-period Tuesday beside a two-period Wednesday.' },
  { key: 'prefs', label: 'Placement wishes', note: 'Morning subjects, "not straight after", teachers who would rather not open or close the day, and free periods inside a class\'s day.' },
];

/** School-wide numbers for teachers without their own, and how much each soft rule matters when the solver trades them off. */
export default function Priorities({ settings, call, toast, onSaved, rich }: { settings: SolverSettingsRow; call: Call; toast: (m: string) => void; onSaved: () => void; rich: boolean }) {
  const initial = {
    target: String(settings.default_target_per_week), perDay: String(settings.default_max_per_day), run: String(settings.default_max_consecutive),
    ct: settings.class_teacher_first, spread: settings.subject_spread, noGaps: !!settings.no_student_gaps, w: weightsOf(settings),
  };
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const n = (k: 'target' | 'perDay' | 'run', label: string, hint: string) => (
    <div className="cmp-fld" style={{ marginBottom: 0 }}>
      <label htmlFor={`def-${k}`}>{label}</label>
      <input id={`def-${k}`} className="cmp-in" inputMode="numeric" style={{ width: 96 }} value={v[k]} maxLength={2} onChange={e => setV(x => ({ ...x, [k]: e.target.value.replace(/\D/g, '') }))} />
      <small className="muted" style={{ display: 'block', marginTop: 4, fontSize: 11.5 }}>{hint}</small>
    </div>
  );
  // The two original switches stay in step with their level: Off turns the rule off for both solvers.
  const level = (k: keyof SolverWeights) => (k === 'classTeacher' && !v.ct) || (k === 'spread' && !v.spread) ? 0 : v.w[k];
  const setLevel = (k: keyof SolverWeights, lv: number) => setV(x => ({
    ...x, w: { ...x.w, [k]: lv }, ...(k === 'classTeacher' ? { ct: lv > 0 } : {}), ...(k === 'spread' ? { spread: lv > 0 } : {}),
  }));
  return (
    <div className="card">
      <CardHead title="Priorities and school defaults" sub="Rules the solver never breaks are set on the sheet and per teacher. These are the things it weighs against each other when it can't have all of them." />
      <div className="sch-prio">
        {PRIORITIES.filter(p => rich || p.key === 'classTeacher' || p.key === 'spread').map(p => (
          <div className="sch-prio-r" key={p.key}>
            <div><b>{p.label}</b><span>{p.note}</span></div>
            <div className="sch-seg sm" role="radiogroup" aria-label={p.label}>
              {(rich ? LEVELS : ['Off', 'On']).map((t, i) => {
                const lv = rich ? i : i * 2;
                const on = rich ? level(p.key) === lv : (level(p.key) > 0) === (i === 1);
                return <button key={t} role="radio" aria-checked={on} className={on ? 'on' : ''} onClick={() => setLevel(p.key, lv)}>{t}</button>;
              })}
            </div>
          </div>
        ))}
      </div>
      {rich && <label className="sch-tick" style={{ marginTop: 14 }}><input type="checkbox" checked={v.noGaps} onChange={e => setV(x => ({ ...x, noGaps: e.target.checked }))} /> A class&apos;s day runs from period 1 with no free period in the middle (free periods go to the end of the day)</label>}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
        {n('target', 'TARGET PERIODS A WEEK', 'What load analytics measures against')}
        {n('perDay', 'AT MOST A DAY', 'For teachers with no cap of their own')}
        {n('run', 'AT MOST IN A ROW', 'Before a free period or a break')}
        <span style={{ flex: 1 }} />
        <button className="btn pri" style={{ alignSelf: 'center' }} disabled={busy || !dirty} onClick={async () => {
          setBusy(true);
          try {
            await call(API, 'PUT', {
              entity: 'settings', defaultTargetPerWeek: Number(v.target), defaultMaxPerDay: Number(v.perDay), defaultMaxConsecutive: Number(v.run), classTeacherFirst: v.ct, subjectSpread: v.spread,
              ...(rich ? { weights: v.w, noStudentGaps: v.noGaps } : {}),
            });
            toast('Priorities saved'); onSaved();
          } catch (e) { toast(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
        }}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
