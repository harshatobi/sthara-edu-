'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { ClockIcon as Clock } from '@phosphor-icons/react/dist/ssr/Clock';
import { FirstAidIcon as FirstAid } from '@phosphor-icons/react/dist/ssr/FirstAid';
import { NotePencilIcon as NotePencil } from '@phosphor-icons/react/dist/ssr/NotePencil';
import { MagnifyingGlassIcon as MagnifyingGlass } from '@phosphor-icons/react/dist/ssr/MagnifyingGlass';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { BellRingingIcon as BellRinging } from '@phosphor-icons/react/dist/ssr/BellRinging';
import { ArrowCounterClockwiseIcon as Undo } from '@phosphor-icons/react/dist/ssr/ArrowCounterClockwise';
import { UserListIcon as UserList } from '@phosphor-icons/react/dist/ssr/UserList';
import type { TStudent } from '@/lib/teacher/desk';
import { MARKS, MARK_LABEL, MARK_SHORT, MIN_PCT, absentStreak, addDay, belowMin, parseRollList, tally, weeklyTrend, type Mark, type SchoolDay } from '@/lib/attendance/register';
import { Sparkline, weeklyPts } from '@/components/canon/TrendLine';
import { Empty } from '@/components/canon/ui';
import type { History } from './useRegister';

const ICON = { present: Check, absent: X, late: Clock, excused: FirstAid } as const;
const KEY_OF: Record<string, Mark> = { p: 'present', a: 'absent', l: 'late', e: 'excused' };
type Filter = 'all' | 'away' | 'changed' | 'low' | 'notes';
const FILTERS: { k: Filter; label: string }[] = [
  { k: 'all', label: 'Everyone' }, { k: 'away', label: 'Not present' }, { k: 'low', label: `Under ${MIN_PCT}%` }, { k: 'notes', label: 'With notes' }, { k: 'changed', label: 'Unsaved' },
];

export const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { ...opts, timeZone: 'UTC' });

export interface SavePayload { marks: { studentId: string; status: Mark; note: string | null }[]; newlyAbsent: number }

/**
 * One day's register: everyone starts present (or as saved), the teacher marks who isn't here, with a note
 * where it helps. Fast paths: "absentees by roll number", P/A/L/E keys that mark and move down.
 */
export default function DayRegister({ day, isToday, roster, history, recent, canMark, busy, onSave, onDirty }: {
  day: string;
  isToday: boolean;
  roster: TStudent[];
  history: History;
  /** The school days before `day` to show as a trail (oldest first). */
  recent: SchoolDay[];
  canMark: boolean;
  busy: boolean;
  onSave: (p: SavePayload) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const saved = useMemo(() => Object.fromEntries(roster.map(s => [s.id, history.marks[s.id]?.[day]])) as Record<string, Mark | undefined>, [roster, history, day]);
  const savedNotes = useMemo(() => Object.fromEntries(roster.map(s => [s.id, history.notes[s.id]?.[day] || ''])) as Record<string, string>, [roster, history, day]);
  const [marks, setMarks] = useState<Record<string, Mark>>(() => Object.fromEntries(roster.map(s => [s.id, saved[s.id] || 'present'])));
  const [notes, setNotes] = useState<Record<string, string>>(savedNotes);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [rollText, setRollText] = useState('');
  const [rollMsg, setRollMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [announce, setAnnounce] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const markedBefore = roster.filter(s => saved[s.id]).length;
  const isNew = markedBefore === 0;
  // Edits against where each student started (their saved mark, or present on a new register), so marking
  // absentees on a register that was never saved is guarded like any other unsaved change.
  const changed = roster.filter(s => marks[s.id] !== (saved[s.id] || 'present') || (savedNotes[s.id] || '') !== (notes[s.id] || '').trim());
  const editedCount = changed.length;
  // A register nobody has saved yet still needs saving, even untouched.
  const dirty = isNew || editedCount > 0 || markedBefore < roster.length;
  useEffect(() => { onDirty(editedCount > 0); }, [editedCount, onDirty]);

  const session = useMemo(() => Object.fromEntries(roster.map(s => [s.id, tally(history.marks[s.id] || {})])), [roster, history]);
  // The last eight weeks for each student's trend line.
  const trend = useMemo(() => Object.fromEntries(roster.map(s => [s.id, weeklyPts(weeklyTrend([history.marks[s.id] || {}], addDay(day, -49), day))])), [roster, history, day]);
  const counts = MARKS.map(k => ({ k, n: roster.filter(s => marks[s.id] === k).length }));
  const presentPct = roster.length ? Math.round(((counts[0].n + counts[2].n) / roster.length) * 100) : 0;
  const newlyAbsent = isToday ? roster.filter(s => marks[s.id] === 'absent' && saved[s.id] !== 'absent').length : 0;

  const needle = q.trim().toLowerCase();
  const shown = roster.filter(s => {
    if (needle && !s.name.toLowerCase().includes(needle) && !(s.rollNo || '').toLowerCase().includes(needle)) return false;
    if (filter === 'away') return marks[s.id] !== 'present';
    if (filter === 'low') return belowMin(session[s.id]);
    if (filter === 'notes') return !!(notes[s.id] || '').trim();
    if (filter === 'changed') return changed.some(c => c.id === s.id);
    return true;
  });

  const set = (id: string, m: Mark) => {
    if (!canMark) return;
    setMarks(x => ({ ...x, [id]: m }));
    const s = roster.find(r => r.id === id);
    if (s) setAnnounce(`${s.name}: ${MARK_LABEL[m]}`);
  };
  const focusRow = (i: number) => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-row="${i}"] [role="radio"][tabindex="0"]`);
    el?.focus();
  };
  const onGroupKey = (e: KeyboardEvent, i: number, id: string) => {
    const k = e.key.toLowerCase();
    if (KEY_OF[k] && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      set(id, KEY_OF[k]);
      requestAnimationFrame(() => focusRow(Math.min(i + 1, shown.length - 1)));
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const at = MARKS.indexOf(marks[id]);
      const next = MARKS[(at + (e.key === 'ArrowRight' ? 1 : MARKS.length - 1)) % MARKS.length];
      set(id, next);
      requestAnimationFrame(() => focusRow(i));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusRow(Math.max(0, Math.min(shown.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
    }
  };

  const applyRolls = () => {
    const { ids, unknown } = parseRollList(rollText, roster);
    if (!ids.length && !unknown.length) return;
    if (ids.length) setMarks(x => ({ ...x, ...Object.fromEntries(ids.map(id => [id, 'absent' as Mark])) }));
    const names = ids.map(id => roster.find(s => s.id === id)!.name.split(' ')[0]);
    setRollMsg(unknown.length
      ? { tone: 'err', text: `${ids.length ? `Marked ${names.join(', ')} absent. ` : ''}No student with roll number ${unknown.join(', ')}.` }
      : { tone: 'ok', text: `Marked absent: ${names.join(', ')}.` });
    if (!unknown.length) setRollText('');
  };

  const reset = () => { setMarks(Object.fromEntries(roster.map(s => [s.id, saved[s.id] || 'present']))); setNotes(savedNotes); setOpenNote(null); };
  const save = () => onSave({ newlyAbsent, marks: roster.map(s => ({ studentId: s.id, status: marks[s.id], note: (notes[s.id] || '').trim() || null })) });

  // Leaving with unsaved edits loses them: let the browser ask.
  useEffect(() => {
    if (!editedCount) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [editedCount]);

  if (!roster.length) {
    return <div className="card"><Empty icon={<UserList size={26} weight="duotone" />} title="No students in this class">Students appear here once the office adds them to the class.</Empty></div>;
  }

  return (
    <>
      <div className="sr" aria-live="polite">{announce}</div>
      <div className="reg-sum" aria-label={`Register for ${dayLabel(day)}`}>
        <div className="reg-ring" style={{ ['--p' as string]: `${presentPct}%` }} aria-hidden="true"><b>{presentPct}%</b><span>in school</span></div>
        <div className="reg-counts">
          {counts.map(c => {
            const I = ICON[c.k];
            return (
              <div key={c.k} className={`reg-count ${c.k}`}>
                <I size={16} weight="bold" aria-hidden="true" /><b>{c.n}</b><span>{MARK_LABEL[c.k]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {canMark && (
        <div className="card reg-tools">
          <form className="reg-roll" onSubmit={e => { e.preventDefault(); applyRolls(); }}>
            <label htmlFor="reg-roll">Absentees by roll number</label>
            <div className="reg-roll-in">
              <input id="reg-roll" className="cmp-in" inputMode="numeric" autoComplete="off" placeholder="e.g. 3, 7, 12-14" value={rollText}
                onChange={e => { setRollText(e.target.value); setRollMsg(null); }} aria-describedby="reg-roll-msg" />
              <button className="btn" type="submit" disabled={!rollText.trim()}>Mark absent</button>
            </div>
            <div id="reg-roll-msg" className={`reg-roll-msg ${rollMsg?.tone ?? ''}`} role={rollMsg?.tone === 'err' ? 'alert' : undefined}>
              {rollMsg?.text ?? 'Read out the roll, type who isn’t here. Everyone else stays present.'}
            </div>
          </form>
          <div className="reg-quick">
            <button className="btn sm" onClick={() => setMarks(Object.fromEntries(roster.map(s => [s.id, 'present' as Mark])))}><Check size={13} weight="bold" />All present</button>
            {editedCount > 0 && <button className="btn sm" onClick={reset}><Undo size={13} weight="bold" />Undo changes</button>}
          </div>
        </div>
      )}

      <div className="card reg-card">
        <div className="reg-filter">
          <div className="reg-search">
            <MagnifyingGlass size={16} aria-hidden="true" />
            <input type="search" placeholder="Find a student or roll number" aria-label="Find a student" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="seg" role="group" aria-label="Show">
            {FILTERS.map(f => (
              <button key={f.k} className={filter === f.k ? 'on' : ''} aria-pressed={filter === f.k} onClick={() => setFilter(f.k)}>{f.label}</button>
            ))}
          </div>
        </div>
        {canMark && <p className="reg-keys" id="reg-keys">Keyboard: <kbd>P</kbd> <kbd>A</kbd> <kbd>L</kbd> <kbd>E</kbd> mark a student and move to the next; <kbd>←</kbd> <kbd>→</kbd> change, <kbd>↑</kbd> <kbd>↓</kbd> move.</p>}

        <div ref={listRef} role="list" aria-label="Students">
          {!shown.length && <p className="muted" style={{ padding: '22px 0', textAlign: 'center' }}>No student matches.</p>}
          {shown.map((s, i) => {
            const m = marks[s.id];
            const t = session[s.id];
            const low = belowMin(t);
            const streak = absentStreak({ ...(history.marks[s.id] || {}), [day]: m }, day);
            const isChanged = changed.some(c => c.id === s.id);
            const note = notes[s.id] || '';
            return (
              <div key={s.id} className={`reg-row ${m}`} role="listitem" data-row={i}>
                <div className="reg-roll-no" aria-label={`Roll ${s.rollNo || 'none'}`}>{s.rollNo || '–'}</div>
                <div className="reg-who">
                  <div className="reg-name">
                    {s.name}
                    {isChanged && <span className="reg-dot" title="Changed, not saved yet"><span className="sr">(unsaved)</span></span>}
                  </div>
                  <div className="reg-meta">
                    <span className={`reg-pct ${low ? 'low' : ''}`} title={`Session so far: ${t.present} present, ${t.late} late, ${t.absent} absent, ${t.excused} excused of ${t.marked} days`}>
                      {low && <Warning size={12} weight="fill" aria-hidden="true" />}
                      {t.pct === null ? 'No days yet' : `${t.pct}% this session`}{low && <span className="sr"> (below {MIN_PCT}%)</span>}
                    </span>
                    <span className="reg-trail" aria-label={`Last ${recent.length} school days: ${recent.map(d => `${dayLabel(d.date, { weekday: 'short' })} ${history.marks[s.id]?.[d.date] ? MARK_LABEL[history.marks[s.id][d.date]] : 'not marked'}`).join(', ')}`}>
                      {recent.map(d => {
                        const st = history.marks[s.id]?.[d.date];
                        return <i key={d.date} className={st || 'none'} title={`${dayLabel(d.date)}: ${st ? MARK_LABEL[st] : 'not marked'}`}>{st ? MARK_SHORT[st] : ''}</i>;
                      })}
                    </span>
                    <Sparkline points={trend[s.id]} label={`${s.name}, weekly attendance, last 8 weeks`} w={72} h={20} />
                    {streak >= 2 && <span className="ch r xs">Absent {streak} days running</span>}
                  </div>
                </div>
                <div className="reg-marks" role="radiogroup" aria-label={`${s.name}, roll ${s.rollNo || 'none'}`} aria-describedby={canMark ? 'reg-keys' : undefined}
                  onKeyDown={e => onGroupKey(e, i, s.id)}>
                  {MARKS.map(k => {
                    const I = ICON[k];
                    return (
                      <button key={k} type="button" role="radio" aria-checked={m === k} tabIndex={m === k ? 0 : -1} disabled={!canMark}
                        className={`reg-mk ${k} ${m === k ? 'on' : ''}`} onClick={() => set(s.id, k)} title={MARK_LABEL[k]}>
                        <I size={15} weight="bold" aria-hidden="true" /><span className="full">{MARK_LABEL[k]}</span><span className="short" aria-hidden="true">{MARK_SHORT[k]}</span>
                      </button>
                    );
                  })}
                </div>
                <button className={`reg-note-btn ${note.trim() ? 'has' : ''}`} aria-expanded={openNote === s.id} aria-label={`${note.trim() ? 'Edit' : 'Add'} note for ${s.name}`}
                  onClick={() => setOpenNote(openNote === s.id ? null : s.id)} disabled={!canMark && !note.trim()}>
                  <NotePencil size={17} weight={note.trim() ? 'fill' : 'regular'} />
                </button>
                {openNote === s.id && (
                  <div className="reg-note">
                    <label className="sr" htmlFor={`note-${s.id}`}>Note for {s.name}</label>
                    <input id={`note-${s.id}`} className="cmp-in" maxLength={300} autoFocus readOnly={!canMark}
                      placeholder={m === 'excused' ? 'Reason, e.g. medical certificate received' : m === 'late' ? 'e.g. came at 8:40, bus delay' : 'e.g. parent called: fever'}
                      value={note} onChange={e => setNotes(x => ({ ...x, [s.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setOpenNote(null); } }} />
                  </div>
                )}
                {openNote !== s.id && note.trim() && <div className="reg-note-text">{note}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {canMark && (
        <div className="card reg-save">
          <div className="reg-save-txt">
            <b>{dayLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })}</b>
            <span> · {counts.filter(c => c.n).map(c => `${c.n} ${MARK_LABEL[c.k].toLowerCase()}`).join(', ')}</span>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
              {isNew ? `Not saved yet${editedCount ? ` (${editedCount} marked)` : ''}. Everyone you haven’t changed is saved as present.`
                : editedCount ? `${editedCount} unsaved ${editedCount === 1 ? 'change' : 'changes'}.`
                  : markedBefore < roster.length ? `${roster.length - markedBefore} ${roster.length - markedBefore === 1 ? 'student' : 'students'} not on the saved register yet.` : 'Saved. Change any mark and save again to correct it.'}
            </div>
            {newlyAbsent > 0 && <div className="reg-notify"><BellRinging size={14} weight="fill" aria-hidden="true" />Parents of {newlyAbsent} newly absent {newlyAbsent === 1 ? 'student' : 'students'} get a message when you save.</div>}
          </div>
          <button className="btn pri" disabled={busy || !dirty} onClick={save}>
            {busy ? 'Saving…' : isNew ? 'Save register' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      )}
    </>
  );
}
