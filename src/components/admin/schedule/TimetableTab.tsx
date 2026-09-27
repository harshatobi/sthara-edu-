'use client';

import { useMemo, useState } from 'react';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { CopyIcon as Copy } from '@phosphor-icons/react/dist/ssr/Copy';
import { UploadSimpleIcon as UploadSimple } from '@phosphor-icons/react/dist/ssr/UploadSimple';
import { RocketIcon as Rocket } from '@phosphor-icons/react/dist/ssr/Rocket';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { ArchiveIcon as Archive } from '@phosphor-icons/react/dist/ssr/Archive';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { TableIcon as Table } from '@phosphor-icons/react/dist/ssr/Table';
import { Chip, Empty, type Tone } from '@/components/canon/ui';
import { Kpi } from '@/components/admin/kit';
import { fmtDate, isoDay, plural } from '@/lib/admin/format';
import { addDays, clashesFor, findClashes, homeRoom, namesOf, sectionsOf, teacherLoad, versionOn, weekdayOf, wingOf } from '@/lib/schedule/engine';
import { DAY_NAMES, slotPerson, slotTeacher, type ScheduleRows, type Slot, type TimetableVersion } from '@/lib/schedule/types';
import { normClass, normSubject, teachingScope } from '@/lib/teacher/scope';
import WeekGrid, { toPrintGrid, type GridMode } from '@/components/schedule/WeekGrid';
import Pop, { run } from '@/components/schedule/Pop';
import { printGrids } from '@/components/schedule/print';
import ImportWizard from './ImportWizard';

type Call = <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const STATUS: Record<TimetableVersion['status'], { t: string; tone: Tone }> = {
  draft: { t: 'DRAFT', tone: 'a' }, published: { t: 'PUBLISHED', tone: 'g' }, archived: { t: 'RETIRED', tone: 'n' },
};
const API = '/api/admin/schedule/timetable';

export default function TimetableTab({ rows, call, reload, toast, canEdit }: { rows: ScheduleRows; call: Call; reload: () => void; toast: (m: string) => void; canEdit: boolean }) {
  const today = isoDay();
  const inForce = versionOn(rows.versions, today);
  const sorted = useMemo(() => [...rows.versions].sort((a, b) =>
    (a.status === 'draft' ? 0 : a.status === 'published' ? 1 : 2) - (b.status === 'draft' ? 0 : b.status === 'published' ? 1 : 2)
    || b.created_at.localeCompare(a.created_at)), [rows.versions]);
  const [picked, setPicked] = useState<string | null>(null);
  const version = rows.versions.find(v => v.id === picked) ?? rows.versions.find(v => v.status === 'draft') ?? inForce ?? sorted[0] ?? null;
  const slots = useMemo(() => rows.slots.filter(s => s.version_id === version?.id), [rows.slots, version?.id]);
  const names = useMemo(() => namesOf(rows), [rows]);
  const sections = useMemo(() => sectionsOf(rows), [rows]);
  const clashes = useMemo(() => findClashes(slots, rows.rooms), [slots, rows.rooms]);
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

  const swap = async (a: { weekday: number; period_no: number }, b: { weekday: number; period_no: number }) => {
    try { await call(API, 'PUT', { action: 'swap', versionId: version!.id, class: focusKey, a, b }); reload(); toast('Periods swapped'); }
    catch (e: any) { toast(e.message); }
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
        {version?.status !== 'draft' && canEdit && (
          <p className="muted" style={{ marginTop: 12 }}>Published timetables are kept as they were. To change this one, copy it to a draft, edit, and publish the draft from the day it should take effect.</p>
        )}
      </div>

      <div className="kpis">
        <Kpi label="LESSONS A WEEK" value={slots.length} note={`${plural(new Set(slots.map(s => normClass(s.class))).size, 'section')} of ${sections.length}`} />
        <Kpi label="CLASHES" value={clashes.length} valueColor={clashes.length ? 'var(--red)' : 'var(--green)'} note={clashes.length ? 'Must be fixed before publishing' : 'No teacher, room or section is double-booked'} />
        <Kpi label="TEACHERS TIMETABLED" value={load.size} note={`${teachers.filter(t => !load.has(t.id)).length} with no periods`} />
        <Kpi label="NO TEACHER" value={slots.filter(s => !slotPerson(s)).length} valueColor={slots.some(s => !slotPerson(s)) ? 'var(--amber)' : undefined} note="Lessons still to staff" />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="sch-bar">
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
          {draft && mode === 'class' && <span className="muted" style={{ fontSize: 12.5 }}>Click a period to edit. Drag a lesson onto another period to swap them.</span>}
          {draft && mode !== 'class' && <span className="muted" style={{ fontSize: 12.5 }}>Switch to By class to edit.</span>}
        </div>
        {mode === 'class' && !sections.length ? (
          <Empty icon={<Table size={26} weight="duotone" />} title="No sections yet">Sections come from enrolled students and teachers&apos; classes in the user directory. Add those first.</Empty>
        ) : !focusKey ? <p className="muted">Nothing to show yet.</p> : (
          <WeekGrid bells={rows.bells} wingId={wing} slots={shown} mode={mode} names={names} rooms={rows.rooms} clashing={clashing}
            onCell={draft && mode === 'class' ? (weekday, period) => setEditing({ weekday, period }) : undefined}
            onSwap={draft && mode === 'class' ? swap : undefined} />
        )}
      </div>

      <div className="g2">
        <div className="card">
          <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>Clashes</h3>
          {clashes.length ? clashes.slice(0, 30).map((c, i) => (
            <button key={i} type="button" className="row-btn" onClick={() => { setMode('class'); setFocus(c.slots[0].class); }}>
              <Warning size={16} weight="fill" color="var(--red)" />
              <span style={{ flex: 1, fontSize: 13 }}>
                <b>{DAY_NAMES[c.weekday]} P{c.period_no}</b> · {c.kind === 'teacher' ? `${names.get(c.key) || 'A teacher'} in ${c.slots.map(s => s.class).join(', ')}`
                  : c.kind === 'room' ? `${rows.rooms.find(r => r.id === c.key)?.name || 'A room'} for ${c.slots.map(s => s.class).join(', ')}` : `${c.slots[0].class} has ${c.slots.length} lessons`}
              </span>
            </button>
          )) : <p className="muted">None. Every teacher, room and section is in one place at a time.</p>}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>Teaching load</h3>
          {[...load].sort((a, b) => b[1] - a[1]).map(([id, n]) => {
            const max = Math.max(...load.values());
            return (
              <div className="sch-load" key={id}>
                <button type="button" style={{ textAlign: 'left', fontWeight: 700 }} onClick={() => { setMode('teacher'); setFocus(id); }}>{names.get(id) || 'Teacher'}</button>
                <div className="bar"><i style={{ width: `${(n / max) * 100}%`, background: n > 36 ? 'var(--red)' : n > 30 ? 'var(--amber)' : 'var(--blue)' }} /></div>
                <b className="num" style={{ textAlign: 'right' }}>{n}</b>
              </div>
            );
          })}
          {!load.size && <p className="muted">No teachers timetabled yet.</p>}
          {load.size > 0 && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Periods a week. Amber above 30, red above 36.</p>}
        </div>
      </div>

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
  const warnings = asSlots.flatMap(s => clashesFor(s, [...others, ...asSlots.filter(x => x !== s)], rows.rooms).map(c =>
    c.kind === 'teacher' ? `${names.get(slotPerson(s)!) || 'This teacher'} is also in ${c.slots.filter(x => x !== s).map(x => x.class).join(', ')}${c.slots.every(x => x.combined) ? ' (a combined lesson needs the same subject)' : '. Tick "combined" if it is one lesson for both.'}`
      : c.kind === 'room' ? `The room is also booked for ${c.slots.filter(x => x !== s).map(x => x.class).join(', ')}` : 'Two lessons at once need different group names'));
  const busyTeachers = new Set(others.filter(s => s.weekday === weekday && s.period_no === period && slotPerson(s)).map(s => slotPerson(s)!));

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
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || warnings.length > 0 || (!asSlots.length && !here.length)} onClick={async () => {
          if (await run(setBusy, setErr, () => call(API, 'PUT', { action: 'cell', versionId: version.id, class: cls, weekday, period_no: period, lessons: asSlots }))) onSaved();
        }}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Pop>
  );
}
