'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LockSimpleIcon as LockSimple } from '@phosphor-icons/react/dist/ssr/LockSimple';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { CopyIcon as Copy } from '@phosphor-icons/react/dist/ssr/Copy';
import { UploadSimpleIcon as UploadSimple } from '@phosphor-icons/react/dist/ssr/UploadSimple';
import { RocketIcon as Rocket } from '@phosphor-icons/react/dist/ssr/Rocket';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { ArchiveIcon as Archive } from '@phosphor-icons/react/dist/ssr/Archive';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { TableIcon as Table } from '@phosphor-icons/react/dist/ssr/Table';
import { ArrowsOutCardinalIcon as ArrowsOut } from '@phosphor-icons/react/dist/ssr/ArrowsOutCardinal';
import { ArrowCounterClockwiseIcon as UndoIcon } from '@phosphor-icons/react/dist/ssr/ArrowCounterClockwise';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { Chip, Empty, type Tone } from '@/components/canon/ui';
import { fmtDate, isoDay, plural } from '@/lib/admin/format';
import { addDays, clashesFor, findClashes, homeRoom, namesOf, periodClock, sectionsOf, teacherLoad, versionOn, weekdayOf, wingOf } from '@/lib/schedule/engine';
import { DAY_NAMES, slotPerson, slotTeacher, type ScheduleRows, type Slot, type TimetableVersion } from '@/lib/schedule/types';
import { normClass, normSubject, teachingScope } from '@/lib/teacher/scope';
import WeekGrid, { toPrintGrid, type GridMode } from '@/components/schedule/WeekGrid';
import Pop, { run } from '@/components/schedule/Pop';
import { printGrids } from '@/components/schedule/print';
import ImportWizard from './ImportWizard';
import { useAuth } from '@/contexts/AuthContext';
import { useSolverData } from '@/lib/schedule/useSolverData';
import { buildInput, gridFor, toSlots } from '@/lib/schedule/solverInput';
import { solveBest } from '@/lib/schedule/runSolver';
import { cellKey, changedLessons, moveOptions, type Cell } from '@/lib/schedule/moves';

type Call = <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const STATUS: Record<TimetableVersion['status'], { t: string; tone: Tone }> = {
  draft: { t: 'DRAFT', tone: 'a' }, published: { t: 'PUBLISHED', tone: 'g' }, archived: { t: 'RETIRED', tone: 'n' },
};
const API = '/api/admin/schedule/timetable';

export default function TimetableTab({ rows, call, reload, toast, canEdit }: { rows: ScheduleRows; call: Call; reload: () => void; toast: (m: string) => void; canEdit: boolean }) {
  const router = useRouter();
  const wanted = useSearchParams().get('version');
  const today = isoDay();
  const inForce = versionOn(rows.versions, today);
  const sorted = useMemo(() => [...rows.versions].sort((a, b) =>
    (a.status === 'draft' ? 0 : a.status === 'published' ? 1 : 2) - (b.status === 'draft' ? 0 : b.status === 'published' ? 1 : 2)
    || b.created_at.localeCompare(a.created_at)), [rows.versions]);
  // A link can open a version (the auto-builder sends you to the draft it just saved).
  const [picked, setPicked] = useState<string | null>(wanted);
  const version = rows.versions.find(v => v.id === picked) ?? rows.versions.find(v => v.status === 'draft') ?? inForce ?? sorted[0] ?? null;
  const slots = useMemo(() => rows.slots.filter(s => s.version_id === version?.id), [rows.slots, version?.id]);
  const names = useMemo(() => namesOf(rows), [rows]);
  const sections = useMemo(() => sectionsOf(rows), [rows]);
  const clock = useMemo(() => periodClock(rows), [rows]);
  const clashes = useMemo(() => findClashes(slots, rows.rooms, clock), [slots, rows.rooms, clock]);
  const clashing = useMemo(() => new Set(clashes.flatMap(c => c.slots)), [clashes]);
  const load = useMemo(() => teacherLoad(slots), [slots]);

  const [mode, setMode] = useState<GridMode>('class');
  const [focus, setFocus] = useState<string>('');
  // Accounts that teach, plus register members with no login (visiting teachers) who hold lessons or are teaching staff.
  const teachers = [
    ...rows.people.filter(p => p.role === 'teacher' || load.has(p.id)).map(p => ({ id: p.id, name: p.name })),
    ...rows.staff.filter(m => !m.user_id && m.active && (m.category === 'teaching' || load.has(`s:${m.id}`))).map(m => ({ id: `s:${m.id}`, name: `${m.name}${m.employment === 'visiting' ? ' (visiting)' : ''}` })),
  ];
  const focusKey = mode === 'class' ? (sections.find(c => normClass(c) === normClass(focus)) ?? sections[0] ?? '')
    : mode === 'teacher' ? (teachers.find(t => t.id === focus)?.id ?? teachers[0]?.id ?? '') : (rows.rooms.find(r => r.id === focus)?.id ?? rows.rooms[0]?.id ?? '');
  const shown = mode === 'class' ? slots.filter(s => normClass(s.class) === normClass(focusKey))
    : mode === 'teacher' ? slots.filter(s => slotPerson(s) === focusKey)
      : slots.filter(s => (s.room_id ?? homeRoom(s.class, rows.rooms)?.id) === focusKey);
  const wing = mode === 'class' ? wingOf(focusKey, rows.wings)?.id ?? null : shown[0] ? wingOf(shown[0].class, rows.wings)?.id ?? null : null;
  const draft = version?.status === 'draft' && canEdit;

  const [editing, setEditing] = useState<{ weekday: number; period: number } | null>(null);
  const [dialog, setDialog] = useState<null | 'new' | 'copy' | 'publish' | 'import' | 'delete' | 'retire'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ── Moving lessons: pick one up, see where it can go, and let the solver make room where it can't. ──
  const { getAuthToken } = useAuth();
  const solver = useSolverData();
  const [moving, setMoving] = useState(false);
  const [lift, setLift] = useState<Cell | null>(null);
  const [undo, setUndo] = useState<{ label: string; run: () => Promise<unknown> } | null>(null);
  const [fix, setFix] = useState<null | { from: Cell; to: Cell; why: string; state: 'ask' | 'busy' | 'ready' | 'failed'; next?: Slot[]; changed?: Slot[]; msg?: string }>(null);
  const movable = draft && mode === 'class';
  useEffect(() => { setLift(null); }, [focusKey, version?.id, moving]);
  useEffect(() => { setUndo(null); setMoving(false); }, [version?.id]);
  const cells = useMemo<Cell[]>(() => (movable && focusKey ? gridFor(focusKey, rows).flatMap(d => d.periods.map(p => ({ weekday: d.weekday, period_no: p }))) : []), [movable, focusKey, rows]);
  const marks = useMemo(() => (!moving || !movable ? undefined : lift ? moveOptions(focusKey, lift, slots, cells, rows.rooms, clock, names) : new Map()), [moving, movable, lift, focusKey, slots, cells, rows.rooms, clock, names]);
  const cellName = (c: Cell) => `${DAY_NAMES[c.weekday]} P${c.period_no}`;
  const bare = (xs: Slot[]) => xs.map(s => ({ class: s.class, group_label: s.group_label, weekday: s.weekday, period_no: s.period_no, subject: s.subject, teacher_id: s.teacher_id, staff_member_id: s.staff_member_id ?? null, room_id: s.room_id, combined: s.combined, locked: !!s.locked }));

  const swap = async (a: Cell, b: Cell) => {
    try {
      await call(API, 'PUT', { action: 'swap', versionId: version!.id, class: focusKey, a, b });
      const cls = focusKey, id = version!.id;
      setUndo({ label: `${cellName(a)} and ${cellName(b)} swapped`, run: () => call(API, 'PUT', { action: 'swap', versionId: id, class: cls, a, b }) });
      setLift(null); reload(); toast('Moved');
    } catch (e: any) { toast(e.message); }
  };
  const onMoveCell = (weekday: number, period: number) => {
    const c = { weekday, period_no: period };
    if (!lift) { if (shown.some(s => s.weekday === weekday && s.period_no === period)) setLift(c); return; }
    const o = marks?.get(cellKey(c));
    if (!o || o.mark === 'pick') { setLift(null); return; }
    if (o.mark === 'cant') { setFix({ from: lift, to: c, why: o.why || 'It clashes with another lesson.', state: 'ask' }); return; }
    void swap(lift, c);
  };
  /** The picked-up period can't go there as things stand: pin it there and let the solver move as few other lessons as it can. */
  const makeRoom = async () => {
    if (!fix || !version) return;
    setFix(f => f && { ...f, state: 'busy' });
    try {
      const data = solver.data;
      if (!data?.available || !data.requirements.length) throw new Error('The solver needs the requirements sheet to know what may move. Fill it in under Auto-build first.');
      const ck = normClass(focusKey);
      const picked = new Set(slots.filter(s => normClass(s.class) === ck && s.weekday === fix.from.weekday && s.period_no === fix.from.period_no));
      const staged = slots.map(s => (picked.has(s) ? { ...s, weekday: fix.to.weekday, period_no: fix.to.period_no, locked: true } : s));
      const input = buildInput(rows, data.requirements, data.rules, data.settings, { base: { slots: staged, mode: 'repair' }, seed: 1, timeLimitMs: 20_000, stability: 40 });
      const r = await solveBest(input, { token: await getAuthToken().catch(() => '') });
      const left = r.unplaced.reduce((n, u) => n + u.periods, 0);
      if (left) throw new Error(`There is no way to make room without leaving ${plural(left, 'period')} out (${r.unplaced[0].cls} ${r.unplaced[0].subject}: ${r.unplaced[0].reason})`);
      // The pin was only for this move: the lesson keeps the lock it had.
      const wasLocked = [...picked].some(s => s.locked);
      const next: Slot[] = toSlots(r.lessons).map(s => (normClass(s.class) === ck && s.weekday === fix.to.weekday && s.period_no === fix.to.period_no && [...picked].some(x => x.subject === s.subject && x.group_label === s.group_label) ? { ...s, locked: wasLocked } : s));
      if (findClashes(next, rows.rooms, clock).length) throw new Error('The lesson at that period is fixed there (locked, or not on the requirements sheet), so nothing can make room for this one.');
      setFix(f => f && { ...f, state: 'ready', next, changed: changedLessons(slots, next) });
    } catch (e: any) { setFix(f => f && { ...f, state: 'failed', msg: e?.message || 'The solver could not make room.' }); }
  };
  const applyFix = async () => {
    if (!fix?.next || !version) return;
    const before = bare(slots), id = version.id;
    setFix(f => f && { ...f, state: 'busy' });
    try {
      await call(API, 'PUT', { action: 'apply', versionId: id, lessons: bare(fix.next) });
      setUndo({ label: `Moved to ${cellName(fix.to)}, with ${plural(Math.max(0, (fix.changed?.length ?? 1) - 1), 'other lesson')} shifted`, run: () => call(API, 'PUT', { action: 'apply', versionId: id, lessons: before }) });
      setFix(null); setLift(null); reload(); toast('Moved, and the rest rearranged');
    } catch (e: any) { setFix(f => f && { ...f, state: 'failed', msg: e?.message || 'Could not save the change.' }); }
  };
  const printAll = () => {
    try {
      printGrids(sections.filter(c => slots.some(s => normClass(s.class) === normClass(c))).map(c => toPrintGrid({
        title: c, subtitle: `${version!.name}${version!.effective_from ? ` · from ${fmtDate(version!.effective_from)}` : ' · draft'}`, school: rows.schoolName,
        bells: rows.bells, wingId: wingOf(c, rows.wings)?.id ?? null, slots: slots.filter(s => normClass(s.class) === normClass(c)), mode: 'class', names, rooms: rows.rooms,
      })));
    } catch (e: any) { toast(e.message); }
  };

  if (!rows.versions.length) {
    return (
      <>
        <div className="card">
          <Empty icon={<Table size={26} weight="duotone" />} title="No timetable yet">
            Build one period by period, or import the timetable you already have from aSc Timetables, FET or a spreadsheet.
          </Empty>
          {canEdit && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn pri" onClick={() => setDialog('new')}><Plus size={15} weight="bold" /> Start a timetable</button>
              <button className="btn" onClick={() => setDialog('import')}><UploadSimple size={15} /> Import</button>
            </div>
          )}
          {!rows.bells.length && <div className="note info" style={{ marginTop: 18 }}>Set the bell timings first (Bells &amp; rooms), so each period shows its time.</div>}
        </div>
        {dialog === 'new' && <NewDraft call={call} onClose={() => setDialog(null)} onDone={id => { setPicked(id); reload(); setDialog(null); toast('Draft created'); }} />}
        {dialog === 'import' && <ImportWizard rows={rows} call={call} onClose={() => setDialog(null)} onDone={(id, n) => { setPicked(id); reload(); setDialog(null); toast(`Imported ${plural(n, 'lesson')} into a draft`); }} />}
      </>
    );
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="sch-bar" style={{ marginBottom: 0 }}>
          <select className="sch-sel" aria-label="Timetable version" value={version?.id || ''} onChange={e => setPicked(e.target.value)}>
            {sorted.map(v => <option key={v.id} value={v.id}>{v.name} · {STATUS[v.status].t.toLowerCase()}{v.effective_from ? ` from ${fmtDate(v.effective_from, true)}` : ''}{v.id === inForce?.id ? ' (in force)' : ''}</option>)}
          </select>
          {version && <Chip tone={STATUS[version.status].tone}>{STATUS[version.status].t}</Chip>}
          {version?.id === inForce?.id && <Chip tone="b">IN FORCE</Chip>}
          <span className="sp" />
          {canEdit && <>
            <button className="btn sm" onClick={() => setDialog('new')}><Plus size={13} weight="bold" /> New</button>
            {version && <button className="btn sm" onClick={() => setDialog('copy')}><Copy size={13} /> Copy to draft</button>}
            <button className="btn sm" onClick={() => setDialog('import')}><UploadSimple size={13} /> Import</button>
            {version?.status === 'draft' && <button className="btn sm" onClick={() => setDialog('delete')}><Trash size={13} /> Delete</button>}
            {version?.status === 'published' && <button className="btn sm" onClick={() => setDialog('retire')}><Archive size={13} /> Retire</button>}
            {version?.status === 'draft' && <button className="btn sm pri" onClick={() => setDialog('publish')} disabled={!slots.length}><Rocket size={13} weight="fill" /> Publish</button>}
          </>}
          {slots.length > 0 && <button className="btn sm" onClick={printAll}><Printer size={13} /> Print all classes</button>}
        </div>
        <div className="sch-stats" style={{ marginTop: 14 }}>
          <span className="sch-stat"><b>{slots.length}</b> lessons a week</span>
          <span className="sch-stat"><b>{new Set(slots.map(s => normClass(s.class))).size}</b> of {sections.length} sections</span>
          <span className={`sch-stat ${clashes.length ? 'bad' : 'good'}`}><b>{clashes.length}</b> {clashes.length === 1 ? 'clash' : 'clashes'}</span>
          <span className="sch-stat"><b>{load.size}</b> teachers timetabled{teachers.filter(t => !load.has(t.id)).length ? `, ${teachers.filter(t => !load.has(t.id)).length} with none` : ''}</span>
          {slots.some(s => !slotPerson(s)) && <span className="sch-stat bad"><b>{slots.filter(s => !slotPerson(s)).length}</b> with no teacher</span>}
        </div>
        {version?.status !== 'draft' && canEdit && (
          <p className="muted" style={{ marginTop: 12 }}>Published timetables are kept as they were. To change this one, copy it to a draft, edit, and publish the draft from the day it should take effect.</p>
        )}
      </div>

      {version?.source === 'solver' && version.solver_report && <SolverReport version={version} locked={slots.filter(s => s.locked).length} />}

      <div className="sch-work">
        <div className="card" style={{ minWidth: 0 }}>
          <div className="sch-bar" style={{ marginBottom: 12 }}>
            <div className="sch-seg" role="tablist" aria-label="View by">
              {(['class', 'teacher', 'room'] as GridMode[]).map(m => (
                <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setFocus(''); }}>{m === 'class' ? 'By class' : m === 'teacher' ? 'By teacher' : 'By room'}</button>
              ))}
            </div>
            <select className="sch-sel" aria-label={mode} value={focusKey} onChange={e => setFocus(e.target.value)}>
              {mode === 'class' && sections.map(c => <option key={c} value={c}>{c}</option>)}
              {mode === 'teacher' && teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({load.get(t.id) || 0})</option>)}
              {mode === 'room' && rows.rooms.map(r => <option key={r.id} value={r.id}>{r.name}{r.active ? '' : ' (retired)'}</option>)}
            </select>
            <span className="sp" />
            {undo && draft && (
              <button className="btn sm" title={undo.label} onClick={async () => {
                try { await undo.run(); setUndo(null); reload(); toast('Undone'); } catch (e: any) { toast(e.message); }
              }}><UndoIcon size={13} weight="bold" /> Undo</button>
            )}
            {movable && (
              <div className="sch-seg" role="radiogroup" aria-label="What a click does">
                <button role="radio" aria-checked={!moving} className={!moving ? 'on' : ''} onClick={() => setMoving(false)}>Edit</button>
                <button role="radio" aria-checked={moving} className={moving ? 'on' : ''} onClick={() => setMoving(true)}><ArrowsOut size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Move</button>
              </div>
            )}
          </div>
          {movable && moving && (
            <div className="sch-movebar" role="status">
              <b>{lift ? `${cellName(lift)} picked up.` : 'Click a lesson to pick it up.'}</b>
              {lift && <>
                <span className="k"><i style={{ background: '#6FCFA9' }} /> free to move here</span>
                <span className="k"><i style={{ background: '#E9B949' }} /> swaps with what is there</span>
                <span className="k"><i style={{ background: 'rgba(255,255,255,.35)' }} /> blocked: click to let the solver make room</span>
                <span style={{ flex: 1 }} />
                <button className="btn sm" onClick={() => setLift(null)}>Put it back</button>
              </>}
            </div>
          )}
          {draft && !moving && <p className="muted" style={{ fontSize: 12.5, margin: '-4px 0 12px' }}>{mode === 'class' ? 'Click a period to edit it or lock it. Drag a lesson onto another period to swap them.' : 'Switch to By class to edit.'}</p>}
          {mode === 'class' && !sections.length ? (
            <Empty icon={<Table size={26} weight="duotone" />} title="No sections yet">Sections come from enrolled students and teachers&apos; classes in the user directory. Enrol students and assign teachers first.</Empty>
          ) : !focusKey ? <p className="muted">Nothing to show yet.</p> : (
            <WeekGrid bells={rows.bells} wingId={wing} slots={shown} mode={mode} names={names} rooms={rows.rooms} clashing={clashing} marks={marks}
              onCell={movable ? (moving ? onMoveCell : (weekday, period) => setEditing({ weekday, period })) : undefined}
              onSwap={movable && !moving ? swap : undefined} />
          )}
        </div>

        <aside className="sch-side" aria-label="Clashes and teaching load">
          {draft && (
            <div className="card">
              <h3><LockSimple size={15} weight="fill" /> {plural(slots.filter(s => s.locked).length, 'lesson')} locked</h3>
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>Lock the periods you want to keep (open a period), then let the solver rearrange the rest around them.</p>
              <button className="btn sm pri" style={{ marginTop: 10 }} onClick={() => router.replace(`/admin/schedule?tab=build&base=${version!.id}`, { scroll: false })}><Sparkle size={13} weight="fill" /> Re-solve unlocked lessons</button>
            </div>
          )}
          <div className="card">
            <h3>{clashes.length ? <Warning size={15} weight="fill" color="var(--red)" /> : <CheckCircle size={15} weight="fill" color="var(--green)" />} {clashes.length ? plural(clashes.length, 'clash', 'clashes') : 'No clashes'}</h3>
            {clashes.length ? clashes.slice(0, 30).map((c, i) => (
              <button key={i} type="button" className="sch-clash" onClick={() => { setMode('class'); setFocus(c.slots[0].class); }}>
                <span>
                  <b>{DAY_NAMES[c.weekday]} P{c.period_no}</b> · {c.kind === 'teacher' ? `${names.get(c.key) || 'A teacher'} in ${c.slots.map(s => s.class).join(', ')}`
                    : c.kind === 'room' ? `${rows.rooms.find(r => r.id === c.key)?.name || 'A room'} for ${c.slots.map(s => s.class).join(', ')}` : `${c.slots[0].class} has ${c.slots.length} lessons`}
                </span>
              </button>
            )) : <p className="muted" style={{ fontSize: 12.5 }}>Every teacher, room and section is in one place at a time.</p>}
          </div>
          <div className="card">
            <h3>Teaching load</h3>
            {[...load].sort((a, b) => b[1] - a[1]).map(([id, n]) => {
              const max = Math.max(...load.values());
              return (
                <div className="sch-load" key={id}>
                  <button type="button" style={{ textAlign: 'left', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => { setMode('teacher'); setFocus(id); }}>{names.get(id) || 'Teacher'}</button>
                  <div className="bar"><i style={{ width: `${(n / max) * 100}%`, background: n > 36 ? 'var(--red)' : n > 30 ? 'var(--amber)' : 'var(--blue)' }} /></div>
                  <b className="num" style={{ textAlign: 'right' }}>{n}</b>
                </div>
              );
            })}
            {!load.size && <p className="muted" style={{ fontSize: 12.5 }}>No teachers timetabled yet.</p>}
            {load.size > 0 && <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Periods a week. Amber above 30, red above 36.</p>}
          </div>
        </aside>
      </div>

      {fix && (
        <Pop title={`Move to ${cellName(fix.to)}?`} sub={`${focusKey} · ${cellName(fix.from)} can't go there as things stand.`} onClose={() => fix.state !== 'busy' && setFix(null)}>
          {fix.state === 'ask' && <>
            <div className="note" style={{ marginBottom: 14 }}>{fix.why}</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55 }}>The solver can put it there and move as few other lessons as it can to make room. You see every change before anything is saved.</p>
          </>}
          {fix.state === 'busy' && <p className="muted" role="status">Working out the smallest set of changes…</p>}
          {fix.state === 'failed' && <div className="err" role="alert">{fix.msg}</div>}
          {fix.state === 'ready' && <>
            <p style={{ fontSize: 13.5, marginBottom: 10 }}><b>{plural(fix.changed!.length, 'lesson')}</b> would be where {fix.changed!.length === 1 ? 'it wasn\'t' : 'they weren\'t'} before:</p>
            <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 12, padding: '4px 12px' }}>
              {fix.changed!.slice(0, 60).map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: i ? '1px solid var(--line)' : 0, fontSize: 13 }}>
                  <b style={{ flex: 1, minWidth: 0 }}>{c.class} · {c.subject}{c.group_label ? ` (${c.group_label})` : ''}</b>
                  <span className="muted">{names.get(slotPerson(c) ?? '') || ''}</span>
                  <span className="num" style={{ fontWeight: 700 }}>{DAY_NAMES[c.weekday].slice(0, 3)} P{c.period_no}</span>
                </div>
              ))}
            </div>
          </>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn" disabled={fix.state === 'busy'} onClick={() => setFix(null)}>{fix.state === 'failed' ? 'Close' : 'Cancel'}</button>
            {fix.state === 'ask' && <button className="btn pri" onClick={makeRoom}><Sparkle size={13} weight="fill" /> Make room</button>}
            {fix.state === 'ready' && <button className="btn pri" onClick={applyFix}>Apply {plural(fix.changed!.length, 'change')}</button>}
          </div>
        </Pop>
      )}

      {editing && version && (
        <CellEditor rows={rows} version={version} cls={focusKey} weekday={editing.weekday} period={editing.period} slots={slots} call={call}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); toast('Saved'); }} />
      )}
      {dialog === 'new' && <NewDraft call={call} onClose={() => setDialog(null)} onDone={id => { setPicked(id); reload(); setDialog(null); toast('Draft created'); }} />}
      {dialog === 'copy' && version && <NewDraft call={call} copyFrom={version} onClose={() => setDialog(null)} onDone={id => { setPicked(id); reload(); setDialog(null); toast('Copied to a new draft'); }} />}
      {dialog === 'import' && <ImportWizard rows={rows} call={call} onClose={() => setDialog(null)} onDone={(id, n) => { setPicked(id); reload(); setDialog(null); toast(`Imported ${plural(n, 'lesson')} into a draft`); }} />}
      {dialog === 'publish' && version && (
        <Publish version={version} clashes={clashes.length} inForce={inForce} call={call} onClose={() => setDialog(null)}
          onDone={r => { reload(); setDialog(null); toast(`Published. ${plural(r.teachers, 'teacher')} notified${r.pacing ? `, pacing updated for ${plural(r.pacing, 'class subject', 'class subjects')}` : ''}.`); }} />
      )}
      {(dialog === 'delete' || dialog === 'retire') && version && (
        <Pop title={dialog === 'delete' ? `Delete ${version.name}?` : `Retire ${version.name}?`} onClose={() => setDialog(null)}
          sub={dialog === 'delete' ? 'The draft and its lessons go. Published timetables are not affected.'
            : version.id === inForce?.id ? 'This is the timetable in force. Retiring it leaves days without a timetable until another is published.' : 'It stops applying from today. It stays in the list for the record.'}>
          {err && <div className="err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn red" disabled={busy} onClick={async () => {
              const ok = await run(setBusy, setErr, () => (dialog === 'delete' ? call(API, 'DELETE', { id: version.id }) : call(API, 'POST', { action: 'archive', id: version.id })));
              if (ok) { setPicked(null); reload(); setDialog(null); toast(dialog === 'delete' ? 'Draft deleted' : 'Timetable retired'); }
            }}>{busy ? 'Working…' : dialog === 'delete' ? 'Delete draft' : 'Retire'}</button>
          </div>
        </Pop>
      )}
    </>
  );
}

function NewDraft({ call, copyFrom, onClose, onDone }: { call: Call; copyFrom?: TimetableVersion; onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState(copyFrom ? `${copyFrom.name} (revised)` : 'Timetable 2026-27');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title={copyFrom ? 'Copy to a new draft' : 'New timetable'} sub={copyFrom ? `Starts with every lesson in ${copyFrom.name}.` : 'Starts empty. Fill it period by period.'} onClose={onClose}>
      <label className="lbl" htmlFor="tt-name">NAME</label>
      <input id="tt-name" className="cmp-in" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || !name.trim()} onClick={async () => {
          let id = '';
          if (await run(setBusy, setErr, async () => { id = (await call<{ id: string }>(API, 'POST', { action: 'create', name, copyFrom: copyFrom?.id })).id; })) onDone(id);
        }}>{busy ? 'Creating…' : 'Create draft'}</button>
      </div>
    </Pop>
  );
}

function Publish({ version, clashes, inForce, call, onClose, onDone }: {
  version: TimetableVersion; clashes: number; inForce: TimetableVersion | null; call: Call; onClose: () => void; onDone: (r: { teachers: number; pacing: number }) => void;
}) {
  // Default: next Monday, so a week never changes mid-way.
  const [from, setFrom] = useState(() => { const t = isoDay(); return addDays(t, (8 - weekdayOf(t)) % 7 || 7); });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title={`Publish ${version.name}`} onClose={onClose}
      sub={inForce ? `${inForce.name} applies until the day before. Past days keep the timetable they had.` : 'It becomes the school timetable from the date you pick.'}>
      {clashes > 0 && <div className="err" role="alert" style={{ marginBottom: 12 }}>Fix the {plural(clashes, 'clash', 'clashes')} first.</div>}
      <label className="lbl" htmlFor="tt-from">TAKES EFFECT ON</label>
      <input id="tt-from" type="date" className="cmp-in" min={isoDay()} value={from} onChange={e => setFrom(e.target.value)} />
      <p className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>
        Each teacher gets a notification with their periods. Syllabus pacing takes periods per week and period length from this timetable.
      </p>
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || clashes > 0 || !from} onClick={async () => {
          let r = { teachers: 0, pacing: 0 };
          if (await run(setBusy, setErr, async () => { r = await call(API, 'POST', { action: 'publish', id: version.id, effectiveFrom: from }); })) onDone(r);
        }}><Rocket size={14} weight="fill" /> {busy ? 'Publishing…' : 'Publish'}</button>
      </div>
    </Pop>
  );
}

interface Draft { group_label: string; subject: string; teacher_id: string; room_id: string; combined: boolean }

function CellEditor({ rows, version, cls, weekday, period, slots, call, onClose, onSaved }: {
  rows: ScheduleRows; version: TimetableVersion; cls: string; weekday: number; period: number; slots: Slot[]; call: Call; onClose: () => void; onSaved: () => void;
}) {
  const here = slots.filter(s => normClass(s.class) === normClass(cls) && s.weekday === weekday && s.period_no === period);
  const [lessons, setLessons] = useState<Draft[]>(() => here.length
    ? here.map(s => ({ group_label: s.group_label, subject: s.subject, teacher_id: slotPerson(s) || '', room_id: s.room_id || '', combined: s.combined }))
    : [{ group_label: '', subject: '', teacher_id: '', room_id: '', combined: false }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Who teaches what in this section, from the user directory: suggested first.
  const scoped = rows.people.flatMap(p => teachingScope(p).filter(e => normClass(e.cls) === normClass(cls)).map(e => ({ id: p.id, name: p.name, subject: e.subject })));
  const subjects = [...new Set([...scoped.map(e => e.subject).filter(Boolean), ...slots.filter(s => normClass(s.class) === normClass(cls)).map(s => s.subject)])].sort();
  const home = homeRoom(cls, rows.rooms);
  const names = namesOf(rows);
  const register = rows.staff.filter(m => !m.user_id && m.active);
  const set = (i: number, patch: Partial<Draft>) => setLessons(ls => ls.map((l, j) => {
    if (j !== i) return l;
    const next = { ...l, ...patch };
    // Picking a subject fills in the teacher who teaches it here, when there's exactly one.
    if (patch.subject !== undefined && !l.teacher_id) {
      const who = scoped.filter(e => normSubject(e.subject) === normSubject(patch.subject));
      if (who.length === 1) next.teacher_id = who[0].id;
    }
    return next;
  }));
  const asSlots: Slot[] = lessons.filter(l => l.subject.trim()).map(l => ({
    class: cls, group_label: l.group_label.trim(), weekday, period_no: period, subject: l.subject.trim(), ...slotTeacher(l.teacher_id), room_id: l.room_id || null, combined: l.combined,
  }));
  const others = slots.filter(s => !(normClass(s.class) === normClass(cls) && s.weekday === weekday && s.period_no === period));
  // By clock time: another wing's bells can put a different period number at this same time.
  const clock = periodClock(rows);
  const atTime = clock(cls, weekday, period);
  const sameTime = (s: Slot) => s.weekday === weekday && (s.period_no === period || (() => { const t = clock(s.class, s.weekday, s.period_no); return !!(t && atTime && t[0] < atTime[1] && atTime[0] < t[1]); })());
  const warnings = asSlots.flatMap(s => clashesFor(s, [...others, ...asSlots.filter(x => x !== s)], rows.rooms, clock).map(c =>
    c.kind === 'teacher' ? `${names.get(slotPerson(s)!) || 'This teacher'} is also in ${c.slots.filter(x => x !== s).map(x => x.class).join(', ')}${c.slots.every(x => x.combined) ? ' (a combined lesson needs the same subject)' : '. Tick "combined" if it is one lesson for both.'}`
      : c.kind === 'room' ? `The room is also booked for ${c.slots.filter(x => x !== s).map(x => x.class).join(', ')}` : 'Two lessons at once need different group names'));
  const busyTeachers = new Set(others.filter(s => sameTime(s) && slotPerson(s)).map(s => slotPerson(s)!));

  return (
    <Pop wide title={`${cls} · ${DAY_NAMES[weekday]} P${period}`} sub={`${version.name}. Split groups (Biology / Computer Science) go in the same period with different group names.`} onClose={onClose}>
      {lessons.map((l, i) => (
        <div key={i} style={{ borderTop: i ? '1px solid var(--line)' : 0, paddingTop: i ? 14 : 0, marginTop: i ? 14 : 0 }}>
          <div className="sch-fields">
            <div className="cmp-fld" style={{ marginBottom: 0 }}>
              <label htmlFor={`s-${i}`}>SUBJECT</label>
              <input id={`s-${i}`} className="cmp-in" list="sch-subjects" value={l.subject} maxLength={80} onChange={e => set(i, { subject: e.target.value })} placeholder="Mathematics" />
            </div>
            <div className="cmp-fld" style={{ marginBottom: 0 }}>
              <label htmlFor={`t-${i}`}>TEACHER</label>
              <select id={`t-${i}`} className="cmp-sel" value={l.teacher_id} onChange={e => set(i, { teacher_id: e.target.value })}>
                <option value="">No teacher yet</option>
                {scoped.length > 0 && <optgroup label={`Teaches ${cls}`}>{[...new Map(scoped.map(e => [e.id, e])).values()].map(e => <option key={e.id} value={e.id}>{e.name}{busyTeachers.has(e.id) ? ' (busy)' : ''}</option>)}</optgroup>}
                <optgroup label="All staff">{rows.people.filter(p => !scoped.some(e => e.id === p.id)).map(p => <option key={p.id} value={p.id}>{p.name}{busyTeachers.has(p.id) ? ' (busy)' : ''}</option>)}</optgroup>
                {register.length > 0 && <optgroup label="Staff register (no login)">{register.map(m => <option key={m.id} value={`s:${m.id}`}>{m.name}{m.designation ? `, ${m.designation}` : ''}{busyTeachers.has(`s:${m.id}`) ? ' (busy)' : ''}</option>)}</optgroup>}
              </select>
            </div>
            <div className="cmp-fld" style={{ marginBottom: 0 }}>
              <label htmlFor={`r-${i}`}>ROOM</label>
              <select id={`r-${i}`} className="cmp-sel" value={l.room_id} onChange={e => set(i, { room_id: e.target.value })}>
                <option value="">{home ? `Home room (${home.name})` : 'Home room (not set)'}</option>
                {rows.rooms.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="cmp-fld" style={{ marginBottom: 0 }}>
              <label htmlFor={`g-${i}`}>GROUP (IF SPLIT)</label>
              <input id={`g-${i}`} className="cmp-in" value={l.group_label} maxLength={40} onChange={e => set(i, { group_label: e.target.value })} placeholder="Whole class" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 10 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={l.combined} onChange={e => set(i, { combined: e.target.checked })} /> Combined with another section (same teacher, same subject)
            </label>
            <span style={{ flex: 1 }} />
            {lessons.length > 1 && <button className="btn sm" onClick={() => setLessons(ls => ls.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        </div>
      ))}
      <datalist id="sch-subjects">{subjects.map(s => <option key={s} value={s} />)}</datalist>
      <button className="btn sm" style={{ marginTop: 14 }} onClick={() => setLessons(ls => [...ls, { group_label: `Group ${ls.length + 1}`, subject: '', teacher_id: '', room_id: '', combined: false }])}><Plus size={12} weight="bold" /> Add a group</button>
      {warnings.length > 0 && <div className="note" style={{ marginTop: 14 }}>{[...new Set(warnings)].map((w, i) => <div key={i}>{w}</div>)}</div>}
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
        {here.length > 0 && <button className="btn" disabled={busy} onClick={async () => {
          if (await run(setBusy, setErr, () => call(API, 'PUT', { action: 'cell', versionId: version.id, class: cls, weekday, period_no: period, lessons: [] }))) onSaved();
        }}>Clear period</button>}
        {here.length > 0 && <button className="btn" disabled={busy} title="Re-solving keeps a locked period's lessons where they are" onClick={async () => {
          if (await run(setBusy, setErr, () => call(API, 'PUT', { action: 'lock', versionId: version.id, class: cls, weekday, period_no: period, locked: !here.some(s => s.locked) }))) onSaved();
        }}><LockSimple size={13} weight={here.some(s => s.locked) ? 'fill' : 'regular'} /> {here.some(s => s.locked) ? 'Unlock' : 'Lock here'}</button>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || warnings.length > 0 || (!asSlots.length && !here.length)} onClick={async () => {
          if (await run(setBusy, setErr, () => call(API, 'PUT', { action: 'cell', versionId: version.id, class: cls, weekday, period_no: period, lessons: asSlots }))) onSaved();
        }}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Pop>
  );
}

/** What the solver reported for a draft it built: score, what it couldn't place and why, and its warnings. */
function SolverReport({ version, locked }: { version: TimetableVersion; locked: number }) {
  const r = version.solver_report!;
  const unplaced = r.unplaced ?? [];
  const periods = unplaced.reduce((n, u) => n + u.periods, 0);
  return (
    <div className="card" style={{ marginBottom: 18, borderLeft: `4px solid ${periods ? 'var(--amber)' : 'var(--green)'}` }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Sparkle size={18} weight="fill" color="var(--purple)" />
        <b style={{ fontSize: 15 }}>Built by the auto-solver</b>
        <Chip tone={periods ? 'a' : 'g'}>{periods ? `${plural(periods, 'PERIOD')} NOT PLACED` : 'EVERYTHING PLACED'}</Chip>
        {r.score && <span className="muted" style={{ fontSize: 12.5 }}>Score {r.score.total} (lower is better){locked ? ` · ${locked} locked` : ''}</span>}
      </div>
      {unplaced.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {unplaced.slice(0, 12).map((u, i) => <div key={i} style={{ fontSize: 13, marginTop: 4 }}><b>{u.cls} {u.subject}{u.group ? ` (${u.group})` : ''}</b>: {plural(u.periods, 'period')} short. {u.reason}</div>)}
          {unplaced.length > 12 && <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>and {unplaced.length - 12} more</div>}
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Place these by hand (open a period), or change the requirements or teachers&apos; availability and re-solve.</p>
        </div>
      )}
      {(r.warnings ?? []).length > 0 && <div className="note" style={{ marginTop: 10 }}>{(r.warnings ?? []).slice(0, 6).map((w, i) => <div key={i}>{w}</div>)}</div>}
    </div>
  );
}
