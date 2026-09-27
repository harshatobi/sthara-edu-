'use client';

import { useMemo, useState } from 'react';
import { UploadSimpleIcon as UploadSimple } from '@phosphor-icons/react/dist/ssr/UploadSimple';
import { Chip } from '@/components/canon/ui';
import { plural } from '@/lib/admin/format';
import { findClashes } from '@/lib/schedule/engine';
import { parseAsc, parseCsv, parseTable, readXlsx, resolve, type Parsed } from '@/lib/schedule/importer';
import { DAY_NAMES, type Room, type ScheduleRows, type Slot } from '@/lib/schedule/types';
import Pop, { run } from '@/components/schedule/Pop';

type Call = <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const FORMATS: Record<Parsed['format'], string> = {
  asc: 'aSc Timetables XML', fet: 'FET timetable CSV', long: 'Spreadsheet, one lesson per row', grid: 'Spreadsheet grid (periods across)',
};
const MAX_BYTES = 8 * 1024 * 1024;
const rk = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Import a timetable into a new draft. The file is read here in the browser; the review shows
 * which teachers didn't match an account (pick one or leave unassigned), which rooms will be
 * created, and any clashes (skip those lessons or fix the file). Nothing is published.
 */
export default function ImportWizard({ rows, call, onClose, onDone }: { rows: ScheduleRows; call: Call; onClose: () => void; onDone: (id: string, lessons: number) => void }) {
  const [file, setFile] = useState<string>('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [skipClashes, setSkipClashes] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const read = async (f: File) => {
    setErr(null); setParsed(null); setMap({});
    if (f.size > MAX_BYTES) { setErr('That file is over 8 MB. Export just the timetable.'); return; }
    setFile(f.name);
    setName(`Imported from ${f.name.replace(/\.[^.]+$/, '')}`.slice(0, 80));
    try {
      const lower = f.name.toLowerCase();
      if (lower.endsWith('.xlsx')) setParsed(parseTable(await readXlsx(await f.arrayBuffer())));
      else if (lower.endsWith('.xls')) setErr('That is the old Excel format. Save it as .xlsx or CSV and try again.');
      else {
        const text = await f.text();
        setParsed(/^\s*(<\?xml|<timetable)/i.test(text) ? parseAsc(text) : parseTable(parseCsv(text)));
      }
    } catch (e: any) { setErr(e?.message || 'Couldn\'t read that file.'); }
  };

  // Accounts and register members with no login (visiting teachers) can both be matched.
  const matchable = useMemo(() => [...rows.people, ...rows.staff.filter(m => !m.user_id && m.active).map(m => ({ id: `s:${m.id}`, name: m.name, email: null }))], [rows.people, rows.staff]);
  const resolved = useMemo(() => (parsed ? resolve(parsed.rows, matchable, rows.rooms, map) : null), [parsed, matchable, rows.rooms, map]);
  // Rooms still to be created take a stand-in id, so clashes over them show here too.
  const { clashes, keep } = useMemo(() => {
    if (!resolved) return { clashes: [], keep: [] as Slot[] };
    const pseudo: Room[] = resolved.newRooms.map(r => ({ id: `new:${rk(r.name)}`, name: r.name, kind: r.kind, capacity: null, home_class: null, active: true }));
    const withIds = resolved.slots.map(s => ((s as any).room_name ? { ...s, room_id: `new:${rk((s as any).room_name)}` } : s));
    const all = findClashes(withIds, [...rows.rooms, ...pseudo]);
    // Skipping keeps the first lesson of each clash and drops the rest.
    const drop = new Set(all.flatMap(c => c.slots.slice(1)).map(s => withIds.indexOf(s)));
    return { clashes: all, keep: resolved.slots.filter((_, i) => !drop.has(i)) };
  }, [resolved, rows.rooms]);
  const unmatchedLeft = resolved?.unmatchedTeachers.filter(u => !(u.raw in map)).length ?? 0;
  const toImport = skipClashes ? keep : resolved?.slots ?? [];
  const ready = !!resolved && resolved.slots.length > 0 && (!clashes.length || skipClashes);

  return (
    <Pop wide title="Import a timetable" onClose={onClose}
      sub="From aSc Timetables (File > Export > XML), FET (the timetable CSV), or a spreadsheet: one lesson per row with Class, Day, Period, Subject, Teacher, Room, or a grid with Class, Day, P1, P2 and so on. It lands as a draft for you to check.">
      <label className="btn" style={{ cursor: 'pointer' }}>
        <UploadSimple size={15} /> {file ? 'Choose another file' : 'Choose a file'}
        <input type="file" accept=".xml,.csv,.tsv,.txt,.xlsx,.xls" hidden onChange={e => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ''; }} />
      </label>
      {file && <span className="muted" style={{ marginLeft: 10 }}>{file}</span>}

      {parsed && resolved && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Chip tone="b">{FORMATS[parsed.format].toUpperCase()}</Chip>
            <Chip tone={resolved.slots.length ? 'g' : 'r'}>{plural(resolved.slots.length, 'LESSON')}</Chip>
            <Chip tone="n">{plural(new Set(resolved.slots.map(s => s.class)).size, 'SECTION')}</Chip>
            {resolved.newRooms.length > 0 && <Chip tone="a">{plural(resolved.newRooms.length, 'NEW ROOM')}</Chip>}
            {clashes.length > 0 && <Chip tone="r">{plural(clashes.length, 'CLASH', 'CLASHES')}</Chip>}
          </div>
          {[...parsed.problems, ...resolved.problems].length > 0 && (
            <div className="note" style={{ marginBottom: 12 }}>{[...parsed.problems, ...resolved.problems].map((p, i) => <div key={i}>{p}</div>)}</div>
          )}

          {resolved.unmatchedTeachers.length > 0 || Object.keys(map).length > 0 ? (
            <div style={{ marginBottom: 14 }}>
              <div className="lbl">TEACHERS NOT MATCHED TO AN ACCOUNT {unmatchedLeft ? `(${unmatchedLeft} LEFT)` : ''}</div>
              {[...resolved.unmatchedTeachers, ...Object.keys(map).filter(k => !resolved.unmatchedTeachers.some(u => u.raw === k)).map(raw => ({ raw, lessons: 0 }))].map(u => (
                <div className="row" key={u.raw} style={{ padding: '8px 0' }}>
                  <span style={{ flex: 1, fontSize: 13.5 }}><b>{u.raw}</b>{u.lessons ? <span className="muted"> · {plural(u.lessons, 'lesson')}</span> : null}</span>
                  <select className="sch-sel" aria-label={`Account for ${u.raw}`} value={map[u.raw] ?? '?'} onChange={e => setMap(m => {
                    const next = { ...m };
                    if (e.target.value === '?') delete next[u.raw]; else next[u.raw] = e.target.value;
                    return next;
                  })}>
                    <option value="?">Pick an account</option>
                    <option value="">Leave unassigned</option>
                    {matchable.map(p => <option key={p.id} value={p.id}>{p.name}{p.id.startsWith('s:') ? ' (register, no login)' : ''}</option>)}
                  </select>
                </div>
              ))}
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Unmatched teachers import as &quot;No teacher&quot; unless you pick an account. Request logins for missing teachers in the user directory first if you&apos;d rather.</p>
            </div>
          ) : resolved.slots.some(s => s.teacher_id || s.staff_member_id) && <p className="muted" style={{ marginBottom: 12 }}>Every teacher matched an account.</p>}

          {resolved.newRooms.length > 0 && (
            <p style={{ fontSize: 13, marginBottom: 12 }}><b>Rooms to create:</b> {resolved.newRooms.map(r => r.name).join(', ')}</p>
          )}

          {clashes.length > 0 && (
            <div className="note err" style={{ marginBottom: 12 }}>
              <b>{plural(clashes.length, 'clash', 'clashes')} in the file.</b>
              {clashes.slice(0, 6).map((c, i) => <div key={i}>{DAY_NAMES[c.weekday]} P{c.period_no}: {c.kind === 'teacher' ? 'the same teacher in' : c.kind === 'room' ? 'the same room for' : 'two lessons in'} {c.slots.map(s => s.class).join(' and ')}</div>)}
              {clashes.length > 6 && <div>and {clashes.length - 6} more</div>}
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                <input type="checkbox" checked={skipClashes} onChange={e => setSkipClashes(e.target.checked)} />
                Import without the {plural(resolved.slots.length - keep.length, 'clashing lesson')} (fix them in the draft afterwards)
              </label>
            </div>
          )}

          <label className="lbl" htmlFor="imp-name" style={{ marginTop: 6 }}>DRAFT NAME</label>
          <input id="imp-name" className="cmp-in" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
        </div>
      )}
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || !ready} onClick={async () => {
          let r = { id: '', lessons: 0 };
          const ok = await run(setBusy, setErr, async () => {
            r = await call('/api/admin/schedule/timetable', 'POST', { action: 'import', name, slots: toImport, newRooms: resolved!.newRooms.filter(n => toImport.some(s => (s as any).room_name && rk((s as any).room_name) === rk(n.name))) });
          });
          if (ok) onDone(r.id, r.lessons);
        }}>{busy ? 'Importing…' : `Import ${plural(toImport.length, 'lesson')} as a draft`}</button>
      </div>
    </Pop>
  );
}
