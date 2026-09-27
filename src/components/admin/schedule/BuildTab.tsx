'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { ListChecksIcon as ListChecks } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { CardHead, Kpi } from '@/components/admin/kit';
import { plural } from '@/lib/admin/format';
import { classOrder, findClashes, namesOf, sectionsOf, wingOf } from '@/lib/schedule/engine';
import { buildInput, gridFor, reqTeacher, suggestRequirements, toSlots, type RequirementRow, type SolverSettingsRow } from '@/lib/schedule/solverInput';
import type { SolverResult } from '@/lib/schedule/solver';
import { runSolver } from '@/lib/schedule/runSolver';
import { useSolverData } from '@/lib/schedule/useSolverData';
import { ROOM_KINDS, type RoomKind, type ScheduleRows } from '@/lib/schedule/types';
import { normClass } from '@/lib/teacher/scope';
import WeekGrid from '@/components/schedule/WeekGrid';
import Pop, { run } from '@/components/schedule/Pop';
import TeacherRules from './TeacherRules';

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
      <Solve rows={rows} data={data} sections={sections} call={call} toast={toast} reload={reload} />
      <Requirements rows={rows} reqs={data.requirements} session={data.session} sections={sections} call={call} toast={toast} onSaved={refresh} />
      <TeacherRules rows={rows} rules={data.rules} settings={data.settings} call={call} toast={toast} onSaved={refresh} mode="solver" />
      <Defaults settings={data.settings} call={call} toast={toast} onSaved={refresh} />
    </>
  );
}

// ── Solve ───────────────────────────────────────────────────────────────────
function Solve({ rows, data, sections, call, toast, reload }: {
  rows: ScheduleRows; data: NonNullable<ReturnType<typeof useSolverData>['data']>; sections: string[]; call: Call; toast: (m: string) => void; reload: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const drafts = rows.versions.filter(v => v.status !== 'archived').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [mode, setMode] = useState<'fresh' | 'repair'>(params.get('base') ? 'repair' : 'fresh');
  const [baseId, setBaseId] = useState(params.get('base') ?? drafts.find(v => v.status === 'draft')?.id ?? drafts[0]?.id ?? '');
  const [seconds, setSeconds] = useState(15);
  const [running, setRunning] = useState<number | null>(null);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [focus, setFocus] = useState('');
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const names = useMemo(() => namesOf(rows), [rows]);

  useEffect(() => {
    if (running === null) return;
    const t = setInterval(() => setRunning(r => (r === null ? null : r + 1)), 1000);
    return () => clearInterval(t);
  }, [running]);

  const base = rows.versions.find(v => v.id === baseId) ?? null;
  const baseSlots = useMemo(() => (base ? rows.slots.filter(s => s.version_id === base.id) : []), [rows.slots, base]);
  const withReqs = new Set(data.requirements.map(r => normClass(r.class)));
  const noBells = sections.filter(c => withReqs.has(normClass(c)) && !gridFor(c, rows).length);
  const periodsNeeded = data.requirements.reduce((n, r) => n + r.periods_per_week, 0);

  const go = async () => {
    setErr(null); setResult(null); setRunning(0);
    try {
      const input = buildInput(rows, data.requirements, data.rules, data.settings, {
        base: mode === 'repair' && base ? { slots: baseSlots, mode: 'repair' } : undefined,
        seed: Math.floor(Math.random() * 1e9), timeLimitMs: seconds * 1000,
      });
      if (!input.sections.length) throw new Error('No section with requirements has bells set up yet.');
      const r = await runSolver(input);
      // The server refuses a timetable with clashes; check before offering to save.
      const clashes = findClashes(toSlots(r.lessons), rows.rooms);
      if (clashes.length) throw new Error(`The solver's result has ${plural(clashes.length, 'clash', 'clashes')}. Run it again.`);
      setResult(r);
      setFocus(input.sections[0]?.cls ?? '');
      setName(mode === 'repair' && base ? `${base.name} (re-solved)` : `Auto-built ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`);
    } catch (e) { setErr(errText(e)); } finally { setRunning(null); }
  };

  const resultSlots = useMemo(() => (result ? toSlots(result.lessons) : []), [result]);
  const unplacedPeriods = result?.unplaced.reduce((n, u) => n + u.periods, 0) ?? 0;
  const changed = useMemo(() => {
    if (!result || !base) return null;
    const key = (s: { class: string; weekday: number; period_no: number; subject: string; group_label: string }) => `${normClass(s.class)}|${s.weekday}|${s.period_no}|${s.subject.toLowerCase()}|${s.group_label.toLowerCase()}`;
    const before = new Set(baseSlots.map(key));
    return resultSlots.filter(s => !before.has(key(s))).length;
  }, [result, base, baseSlots, resultSlots]);

  return (
    <div className="card" style={{ marginBottom: 18, borderLeft: '4px solid var(--purple)' }}>
      <CardHead title="Auto-build the timetable"
        sub="Places every lesson the sheet below asks for: no clashes, teachers within their caps and times off, doubles in back-to-back periods, labs and grounds where needed. It keeps locked lessons where they are." />
      <div className="sch-bar" style={{ flexWrap: 'wrap' }}>
        <div className="sch-seg" role="tablist" aria-label="How to build">
          <button role="tab" aria-selected={mode === 'fresh'} className={mode === 'fresh' ? 'on' : ''} onClick={() => setMode('fresh')}>New timetable</button>
          <button role="tab" aria-selected={mode === 'repair'} className={mode === 'repair' ? 'on' : ''} onClick={() => setMode('repair')} disabled={!drafts.length}>Re-solve an existing one</button>
        </div>
        {mode === 'repair' && (
          <select className="sch-sel" aria-label="Timetable to start from" value={baseId} onChange={e => setBaseId(e.target.value)}>
            {drafts.map(v => <option key={v.id} value={v.id}>{v.name} · {v.status}</option>)}
          </select>
        )}
        <select className="sch-sel" aria-label="Time to spend" value={seconds} onChange={e => setSeconds(Number(e.target.value))}>
          {[5, 15, 30, 60].map(s => <option key={s} value={s}>{s} seconds</option>)}
        </select>
        <span className="sp" />
        <button className="btn pri" disabled={running !== null || !data.requirements.length} onClick={go}>
          <Sparkle size={14} weight="fill" /> {running !== null ? `Building… ${running}s` : result ? 'Build again' : 'Build'}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        {plural(data.requirements.length, 'requirement')} · {plural(periodsNeeded, 'period')} a week across {plural(withReqs.size, 'section')}
        {mode === 'repair' && base ? ` · keeps ${plural(baseSlots.filter(s => s.locked).length, 'locked lesson')} of ${base.name} and starts from the rest` : ''}.
        {' '}Nothing is saved until you save it as a draft.
      </p>
      {!data.requirements.length && <div className="note info" style={{ marginTop: 10 }}>Fill in what each section needs first (below). &ldquo;Fill from the timetable&rdquo; starts the sheet for you.</div>}
      {noBells.length > 0 && <div className="note" style={{ marginTop: 10 }}>{noBells.join(', ')} {noBells.length === 1 ? 'has' : 'have'} no bell timings, so {noBells.length === 1 ? 'it is' : 'they are'} skipped. Set them in Bells &amp; rooms.</div>}
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}

      {result && (
        <div style={{ marginTop: 16 }}>
          <div className="kpis">
            <Kpi label="LESSONS PLACED" value={`${result.stats.placed} / ${result.stats.units}`} valueColor={result.unplaced.length ? 'var(--amber)' : 'var(--green)'} note={unplacedPeriods ? `${plural(unplacedPeriods, 'period')} could not be placed` : 'Every period placed'} />
            <Kpi label="CLASH CHECK" value="0" valueColor="var(--green)" note="No teacher, room or section double-booked" />
            <Kpi label="SCORE" value={result.score.total} note={`Class teacher ${result.score.soft.classTeacher} · spread ${result.score.soft.spread} · teachers' days ${result.score.soft.teachers}`} />
            {changed !== null && <Kpi label="CHANGED" value={changed} note={`lessons differ from ${base?.name}`} />}
          </div>
          {result.unplaced.length > 0 && (
            <div className="note" style={{ marginBottom: 12 }}>
              <b>Not placed:</b>
              {result.unplaced.slice(0, 15).map(u => <div key={u.requirementId}>{u.cls} {u.subject}{u.group ? ` (${u.group})` : ''}: {plural(u.periods, 'period')}. {u.reason}</div>)}
            </div>
          )}
          {result.warnings.length > 0 && <div className="note info" style={{ marginBottom: 12 }}>{result.warnings.slice(0, 8).map((w, i) => <div key={i}>{w}</div>)}</div>}
          <div className="sch-bar">
            <select className="sch-sel" aria-label="Section to preview" value={focus} onChange={e => setFocus(e.target.value)}>
              {[...new Set(result.lessons.map(l => l.cls))].sort(classOrder).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="sp" />
            <input className="cmp-in" style={{ maxWidth: 260 }} aria-label="Name for the draft" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
            <button className="btn pri" disabled={saving || !name.trim()} onClick={async () => {
              setSaving(true); setErr(null);
              try {
                const r = await call<{ id: string; lessons: number }>(API, 'POST', {
                  action: 'save', name, lessons: resultSlots,
                  report: { score: result.score, unplaced: result.unplaced, warnings: result.warnings, stats: result.stats },
                });
                toast(`Saved as a draft: ${plural(r.lessons, 'lesson')}`);
                reload();
                router.replace(`/admin/schedule?tab=timetable&version=${r.id}`, { scroll: false });
              } catch (e) { setErr(errText(e)); } finally { setSaving(false); }
            }}>{saving ? 'Saving…' : 'Save as draft'}</button>
          </div>
          {focus && <WeekGrid bells={rows.bells} wingId={wingOf(focus, rows.wings)?.id ?? null} slots={resultSlots.filter(s => normClass(s.class) === normClass(focus))} mode="class" names={names} rooms={rows.rooms} />}
        </div>
      )}
    </div>
  );
}

// ── Requirements sheet ──────────────────────────────────────────────────────
interface Draft { id?: string; subject: string; group_label: string; teacher: string; periods: string; doubles: string; maxPerDay: string; roomKind: string; combinedKey: string }
const toDraft = (r: RequirementRow): Draft => ({
  id: r.id, subject: r.subject, group_label: r.group_label, teacher: reqTeacher(r) ?? '', periods: String(r.periods_per_week), doubles: String(r.doubles),
  maxPerDay: String(r.max_per_day), roomKind: r.room_kind ?? '', combinedKey: r.combined_key ?? '',
});

function Requirements({ rows, reqs, session, sections, call, toast, onSaved }: {
  rows: ScheduleRows; reqs: RequirementRow[]; session: string; sections: string[]; call: Call; toast: (m: string) => void; onSaved: () => void;
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
              <thead><tr><th>Subject</th><th>Group</th><th>Teacher</th><th className="c">A week</th><th className="c">Doubles</th><th className="c">A day</th><th>Room</th><th>Combined key</th><th /></tr></thead>
              <tbody>
                {mine.map(r => <ReqRow key={r.id} row={toDraft(r)} cls={pick} session={session} teachers={teachers} call={call} toast={toast} onSaved={onSaved} />)}
                <ReqRow key={`new-${pick}-${mine.length}`} row={{ subject: '', group_label: '', teacher: '', periods: '5', doubles: '0', maxPerDay: '1', roomKind: '', combinedKey: '' }} cls={pick} session={session} teachers={teachers} call={call} toast={toast} onSaved={onSaved} />
              </tbody>
            </table>
          </div>
        </>
      )}
      {filling && <Fill rows={rows} reqs={reqs} session={session} call={call} onClose={() => setFilling(false)} onDone={n => { setFilling(false); onSaved(); toast(`${plural(n, 'requirement')} added`); }} />}
    </div>
  );
}

function ReqRow({ row, cls, session, teachers, call, toast, onSaved }: {
  row: Draft; cls: string; session: string; teachers: { id: string; name: string }[]; call: Call; toast: (m: string) => void; onSaved: () => void;
}) {
  const [d, setD] = useState(row);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(row);
  const isNew = !row.id;
  const set = (k: keyof Draft, v: string) => setD(x => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      await call(API, 'PUT', {
        entity: 'requirement', id: row.id, session, class: cls, subject: d.subject, groupLabel: d.group_label, teacher: d.teacher || null,
        periodsPerWeek: Number(d.periods), doubles: Number(d.doubles || 0), maxPerDay: Number(d.maxPerDay || 1), roomKind: d.roomKind || null, combinedKey: d.combinedKey || null,
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

// ── School defaults ─────────────────────────────────────────────────────────
function Defaults({ settings, call, toast, onSaved }: { settings: SolverSettingsRow; call: Call; toast: (m: string) => void; onSaved: () => void }) {
  const [v, setV] = useState({ target: String(settings.default_target_per_week), perDay: String(settings.default_max_per_day), run: String(settings.default_max_consecutive), ct: settings.class_teacher_first, spread: settings.subject_spread });
  const [busy, setBusy] = useState(false);
  const n = (k: 'target' | 'perDay' | 'run', label: string) => (
    <div className="cmp-fld" style={{ marginBottom: 0 }}>
      <label htmlFor={`def-${k}`}>{label}</label>
      <input id={`def-${k}`} className="cmp-in" inputMode="numeric" style={{ width: 90 }} value={v[k]} maxLength={2} onChange={e => setV(x => ({ ...x, [k]: e.target.value.replace(/\D/g, '') }))} />
    </div>
  );
  return (
    <div className="card">
      <CardHead title="School defaults" sub="For teachers without their own numbers. Load analytics measures each teacher against their target." />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {n('target', 'TARGET PERIODS A WEEK')}{n('perDay', 'AT MOST A DAY')}{n('run', 'AT MOST IN A ROW')}
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 14 }}><input type="checkbox" checked={v.ct} onChange={e => setV(x => ({ ...x, ct: e.target.checked }))} /> The class teacher takes period 1</label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 6 }}><input type="checkbox" checked={v.spread} onChange={e => setV(x => ({ ...x, spread: e.target.checked }))} /> Spread each subject across the week</label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn pri" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            await call(API, 'PUT', { entity: 'settings', defaultTargetPerWeek: Number(v.target), defaultMaxPerDay: Number(v.perDay), defaultMaxConsecutive: Number(v.run), classTeacherFirst: v.ct, subjectSpread: v.spread });
            toast('Defaults saved'); onSaved();
          } catch (e) { toast(errText(e)); } finally { setBusy(false); }
        }}>{busy ? 'Saving…' : 'Save defaults'}</button>
      </div>
    </div>
  );
}
