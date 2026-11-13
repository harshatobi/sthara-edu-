'use client';

import { useMemo, useState } from 'react';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { SlidersHorizontalIcon as Sliders } from '@phosphor-icons/react/dist/ssr/SlidersHorizontal';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { ListChecksIcon as ListChecks } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { CardHead } from '@/components/admin/kit';
import { plural } from '@/lib/admin/format';
import { classOrder, sectionsOf } from '@/lib/schedule/engine';
import { gridFor, reqTeacher, suggestRequirements, type RequirementRow } from '@/lib/schedule/solverInput';
import { useSolverData } from '@/lib/schedule/useSolverData';
import { ROOM_KINDS, type RoomKind, type ScheduleRows } from '@/lib/schedule/types';
import { normClass } from '@/lib/teacher/scope';
import Pop, { run } from '@/components/schedule/Pop';
import TeacherRules from './TeacherRules';
import SolvePanel from './SolvePanel';
import Priorities from './Priorities';

type Call = <T = unknown>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const API = '/api/admin/schedule/solver';
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

/** Schedule > Build: the requirements sheet, teachers' availability, and the auto-solver (schedule.academic). */
export default function BuildTab({ rows, call, reload, toast }: { rows: ScheduleRows; call: Call; reload: () => void; toast: (m: string) => void }) {
  const { data, error, reload: reloadSheet } = useSolverData();
  const sections = useMemo(() => {
    const all = new Map(sectionsOf(rows).map(c => [normClass(c), c]));
    for (const r of data?.requirements ?? []) if (!all.has(normClass(r.class))) all.set(normClass(r.class), r.class);
    return [...all.values()].sort(classOrder);
  }, [rows, data?.requirements]);

  if (error) return <div className="note err" role="alert">Couldn&apos;t load the requirements: {error}</div>;
  if (!data) return <div className="card" aria-busy="true">{[0, 1, 2].map(i => <Skeleton key={i} h={48} style={{ marginBottom: 12 }} />)}</div>;
  if (!data.available) return <div className="card"><Empty icon={<Sparkle size={26} weight="duotone" />} title="The auto-solver isn't in this database yet">It arrives with the timetable-solver migration.</Empty></div>;
  const refresh = () => { reloadSheet(); };

  return (
    <>
      <SolvePanel rows={rows} data={data} sections={sections} call={call} toast={toast} reload={reload} />
      {!data.richRules && <div className="note info" style={{ marginBottom: 18 }}>Placement rules (morning subjects, never last, days in school) and priorities appear here once the solver-rules migration is in the database.</div>}
      <Requirements rows={rows} reqs={data.requirements} session={data.session} sections={sections} call={call} toast={toast} onSaved={refresh} rich={data.richRules} />
      <TeacherRules rows={rows} rules={data.rules} settings={data.settings} call={call} toast={toast} onSaved={refresh} mode="solver" rich={data.richRules} />
      <Priorities settings={data.settings} call={call} toast={toast} onSaved={refresh} rich={data.richRules} />
    </>
  );
}

// ── Requirements sheet ──────────────────────────────────────────────────────
interface Draft { id?: string; subject: string; group_label: string; teacher: string; periods: string; doubles: string; maxPerDay: string; roomKind: string; combinedKey: string; timePref: string; neverLast: boolean; notAfter: string }
const toDraft = (r: RequirementRow): Draft => ({
  id: r.id, subject: r.subject, group_label: r.group_label, teacher: reqTeacher(r) ?? '', periods: String(r.periods_per_week), doubles: String(r.doubles),
  maxPerDay: String(r.max_per_day), roomKind: r.room_kind ?? '', combinedKey: r.combined_key ?? '',
  timePref: r.time_pref ?? '', neverLast: !!r.never_last, notAfter: r.not_after ?? '',
});
const BLANK: Draft = { subject: '', group_label: '', teacher: '', periods: '5', doubles: '0', maxPerDay: '1', roomKind: '', combinedKey: '', timePref: '', neverLast: false, notAfter: '' };

function Requirements({ rows, reqs, session, sections, call, toast, onSaved, rich }: {
  rows: ScheduleRows; reqs: RequirementRow[]; session: string; sections: string[]; call: Call; toast: (m: string) => void; onSaved: () => void; rich: boolean;
}) {
  const [cls, setCls] = useState('');
  const [filling, setFilling] = useState(false);
  const pick = sections.find(c => normClass(c) === normClass(cls)) ?? sections[0] ?? '';
  const mine = reqs.filter(r => normClass(r.class) === normClass(pick)).sort((a, b) => a.subject.localeCompare(b.subject) || a.group_label.localeCompare(b.group_label));
  const grid = pick ? gridFor(pick, rows) : [];
  const capacity = grid.reduce((n, d) => n + d.periods.length, 0);
  const needed = mine.reduce((n, r) => n + r.periods_per_week, 0);
  const teachers = [
    ...rows.people.filter(p => p.role === 'teacher').map(p => ({ id: p.id, name: p.name })),
    ...rows.staff.filter(m => !m.user_id && m.active && m.category === 'teaching').map(m => ({ id: `s:${m.id}`, name: `${m.name} (register)` })),
  ];
  const perSection = new Map<string, number>();
  for (const r of reqs) perSection.set(normClass(r.class), (perSection.get(normClass(r.class)) || 0) + r.periods_per_week);

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <CardHead title="What each section needs" sub="Periods a week for every subject, who teaches it, double periods, the room it needs, and how often it may meet in a day. Sections taught together share a combined key (for example PE 9A+9B)."
        right={<button className="btn sm" onClick={() => setFilling(true)}><ArrowsClockwise size={13} /> Fill from the timetable</button>} />
      {!sections.length ? <Empty icon={<ListChecks size={26} weight="duotone" />} title="No sections yet">Sections come from students, teachers&apos; classes and the timetable.</Empty> : (
        <>
          <div className="sch-bar">
            <select className="sch-sel" aria-label="Section" value={pick} onChange={e => setCls(e.target.value)}>
              {sections.map(c => <option key={c} value={c}>{c} ({perSection.get(normClass(c)) || 0} periods)</option>)}
            </select>
            <Chip tone={!capacity ? 'n' : needed > capacity ? 'r' : needed === capacity ? 'g' : 'b'}>{needed} OF {capacity} PERIODS</Chip>
            {needed > capacity && <span style={{ color: 'var(--red)', fontSize: 12.5, fontWeight: 700 }}>More periods than the week has.</span>}
            {!capacity && <span className="muted" style={{ fontSize: 12.5 }}>No bells for this section yet.</span>}
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Subject</th><th>Group</th><th>Teacher</th><th className="c">A week</th><th className="c">Doubles</th><th className="c">A day</th><th>Room</th><th>Combined key</th>{rich && <th>Placement</th>}<th /></tr></thead>
              <tbody>
                {mine.map(r => <ReqRow key={r.id} row={toDraft(r)} cls={pick} session={session} teachers={teachers} subjects={mine.map(x => x.subject)} rich={rich} call={call} toast={toast} onSaved={onSaved} />)}
                <ReqRow key={`new-${pick}-${mine.length}`} row={BLANK} cls={pick} session={session} teachers={teachers} subjects={mine.map(x => x.subject)} rich={rich} call={call} toast={toast} onSaved={onSaved} />
              </tbody>
            </table>
          </div>
        </>
      )}
      {filling && <Fill rows={rows} reqs={reqs} session={session} call={call} onClose={() => setFilling(false)} onDone={n => { setFilling(false); onSaved(); toast(`${plural(n, 'requirement')} added`); }} />}
    </div>
  );
}

function ReqRow({ row, cls, session, teachers, subjects, rich, call, toast, onSaved }: {
  row: Draft; cls: string; session: string; teachers: { id: string; name: string }[]; subjects: string[]; rich: boolean; call: Call; toast: (m: string) => void; onSaved: () => void;
}) {
  const [d, setD] = useState(row);
  const [rules, setRules] = useState(false);
  const ruleCount = (d.timePref ? 1 : 0) + (d.neverLast ? 1 : 0) + (d.notAfter ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(row);
  const isNew = !row.id;
  const set = (k: keyof Draft, v: string | boolean) => setD(x => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      await call(API, 'PUT', {
        entity: 'requirement', id: row.id, session, class: cls, subject: d.subject, groupLabel: d.group_label, teacher: d.teacher || null,
        periodsPerWeek: Number(d.periods), doubles: Number(d.doubles || 0), maxPerDay: Number(d.maxPerDay || 1), roomKind: d.roomKind || null, combinedKey: d.combinedKey || null,
        ...(rich ? { timePref: d.timePref || null, neverLast: d.neverLast, notAfter: d.notAfter || null } : {}),
      });
      toast(isNew ? `${d.subject} added` : 'Saved');
      onSaved();
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };
  const num = (k: 'periods' | 'doubles' | 'maxPerDay', max: number, label: string) => (
    <input className="cmp-in" style={{ width: 58, textAlign: 'center' }} inputMode="numeric" aria-label={`${d.subject || 'New'} ${label}`} value={d[k]} maxLength={2}
      onChange={e => set(k, e.target.value.replace(/\D/g, '').slice(0, 2))} onBlur={() => { if (Number(d[k]) > max) set(k, String(max)); }} />
  );
  return (
    <tr>
      <td><input className="cmp-in" style={{ minWidth: 130 }} aria-label="Subject" placeholder={isNew ? 'Add a subject' : ''} value={d.subject} maxLength={80} onChange={e => set('subject', e.target.value)} /></td>
      <td><input className="cmp-in" style={{ width: 110 }} aria-label="Group" placeholder="Whole class" value={d.group_label} maxLength={40} onChange={e => set('group_label', e.target.value)} /></td>
      <td>
        <select className="cmp-sel" style={{ minWidth: 150 }} aria-label="Teacher" value={d.teacher} onChange={e => set('teacher', e.target.value)}>
          <option value="">No teacher yet</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </td>
      <td className="c">{num('periods', 20, 'periods a week')}</td>
      <td className="c">{num('doubles', 10, 'double periods')}</td>
      <td className="c">{num('maxPerDay', 4, 'times a day')}</td>
      <td>
        <select className="cmp-sel" aria-label="Room" value={d.roomKind} onChange={e => set('roomKind', e.target.value)}>
          <option value="">Home room</option>
          {(Object.keys(ROOM_KINDS) as RoomKind[]).filter(k => k !== 'classroom').map(k => <option key={k} value={k}>{ROOM_KINDS[k]}</option>)}
        </select>
      </td>
      <td><input className="cmp-in" style={{ width: 120 }} aria-label="Combined key" placeholder="Not combined" value={d.combinedKey} maxLength={40} onChange={e => set('combinedKey', e.target.value)} /></td>
      {rich && (
        <td>
          <button type="button" className={`sch-rulebtn${ruleCount ? ' on' : ''}`} onClick={() => setRules(true)} aria-label={`${d.subject || 'New subject'}: placement rules`}>
            <Sliders size={13} /> {ruleCount ? [d.timePref === 'morning' ? 'Morning' : d.timePref === 'afternoon' ? 'Afternoon' : '', d.neverLast ? 'Not last' : '', d.notAfter ? `Not after ${d.notAfter}` : ''].filter(Boolean).join(' · ') : 'Anywhere'}
          </button>
          {rules && (
            <Pop title={`${d.subject || 'This subject'}: where it may sit`} sub={`${cls}. The solver treats "never the last period" as a rule and the other two as wishes it weighs.`} onClose={() => setRules(false)}>
              <span className="lbl">TIME OF DAY</span>
              <div className="sch-seg" role="radiogroup" aria-label="Time of day" style={{ marginBottom: 16 }}>
                {[['', 'Any time'], ['morning', 'First half of the day'], ['afternoon', 'Second half of the day']].map(([k, t]) => <button key={k} role="radio" aria-checked={d.timePref === k} className={d.timePref === k ? 'on' : ''} onClick={() => set('timePref', k)}>{t}</button>)}
              </div>
              <label className="sch-tick" style={{ marginBottom: 16 }}><input type="checkbox" checked={d.neverLast} onChange={e => set('neverLast', e.target.checked)} /> Never the last period of the day</label>
              <label className="lbl" htmlFor="req-after">NOT STRAIGHT AFTER</label>
              <select id="req-after" className="cmp-sel" value={d.notAfter} onChange={e => set('notAfter', e.target.value)}>
                <option value="">No such rule</option>
                {[...new Set([...subjects, d.notAfter].filter(x => x && x.toLowerCase() !== d.subject.toLowerCase()))].sort().map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}><button className="btn pri" onClick={() => setRules(false)}>Done</button></div>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Press Save on the row to keep these.</p>
            </Pop>
          )}
        </td>
      )}
      <td className="r" style={{ whiteSpace: 'nowrap' }}>
        {(dirty || isNew) && <button className="btn sm pri" disabled={busy || !d.subject.trim() || !Number(d.periods)} onClick={save}>{isNew ? <><Plus size={12} weight="bold" /> Add</> : 'Save'}</button>}
        {!isNew && (
          <button className="btn sm" aria-label={`Remove ${row.subject}`} disabled={busy} onClick={async () => {
            setBusy(true);
            try { await call(API, 'DELETE', { entity: 'requirement', id: row.id }); onSaved(); toast(`${row.subject} removed`); } catch (e) { toast(errText(e)); } finally { setBusy(false); }
          }}><Trash size={13} /></button>
        )}
      </td>
    </tr>
  );
}

/** Starts (or tops up) the sheet from a timetable, and the teachers' assignments for anything it doesn't have. */
function Fill({ rows, reqs, session, call, onClose, onDone }: { rows: ScheduleRows; reqs: RequirementRow[]; session: string; call: Call; onClose: () => void; onDone: (n: number) => void }) {
  const versions = rows.versions.filter(v => v.status !== 'archived').sort((a, b) => (a.status === 'published' ? 0 : 1) - (b.status === 'published' ? 0 : 1) || b.created_at.localeCompare(a.created_at));
  const [from, setFrom] = useState(versions[0]?.id ?? '');
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const suggestions = useMemo(() => suggestRequirements(rows, rows.slots.filter(s => s.version_id === from)), [rows, from]);
  return (
    <Pop wide title="Fill the sheet from the timetable" onClose={onClose}
      sub="Periods a week, teachers, groups, rooms, doubles and combined lessons as the timetable has them now; subjects a teacher is assigned that the timetable doesn't have get 5 periods to start with.">
      <label className="lbl" htmlFor="fill-from">TIMETABLE</label>
      <select id="fill-from" className="cmp-sel" value={from} onChange={e => setFrom(e.target.value)}>
        {!versions.length && <option value="">No timetable yet: teachers&apos; assignments only</option>}
        {versions.map(v => <option key={v.id} value={v.id}>{v.name} · {v.status}</option>)}
      </select>
      <p style={{ marginTop: 12, fontSize: 13.5 }}>
        {plural(suggestions.length, 'requirement')} across {plural(new Set(suggestions.map(s => normClass(s.class))).size, 'section')}
        {' '}({suggestions.filter(s => s.source === 'assignment').length} from assignments only).
      </p>
      {reqs.length > 0 && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 8 }}>
          <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} /> Replace the {plural(reqs.length, 'requirement')} already on the sheet (otherwise only missing ones are added)
        </label>
      )}
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || !suggestions.length} onClick={async () => {
          let added = 0;
          if (await run(setBusy, setErr, async () => {
            const r = await call<{ added: number }>(API, 'POST', {
              action: 'fill', session, replace,
              rows: suggestions.map(s => ({ class: s.class, subject: s.subject, groupLabel: s.group_label, teacher: s.teacher, periodsPerWeek: s.periods_per_week, doubles: s.doubles, roomKind: s.room_kind, combinedKey: s.combined_key, maxPerDay: s.periods_per_week > 6 ? 2 : 1 })),
            });
            added = r.added;
          })) onDone(added);
        }}>{busy ? 'Filling…' : replace ? 'Replace the sheet' : 'Add what is missing'}</button>
      </div>
    </Pop>
  );
}

