'use client';

import { useEffect, useState } from 'react';
import { CalendarCheckIcon as CalendarCheck } from '@phosphor-icons/react/dist/ssr/CalendarCheck';
import { ExamIcon as Exam } from '@phosphor-icons/react/dist/ssr/Exam';
import { UserMinusIcon as UserMinus } from '@phosphor-icons/react/dist/ssr/UserMinus';
import { WarningCircleIcon as WarningCircle } from '@phosphor-icons/react/dist/ssr/WarningCircle';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { ChalkboardTeacherIcon as ChalkboardTeacher } from '@phosphor-icons/react/dist/ssr/ChalkboardTeacher';
import { Skeleton } from '@/components/canon/ui';
import { useStudioApi, type HomeData } from './api';

interface Unit { id: string; title: string; type: string; lessons: number; taught: number; behind: number; next: { date: string | null; title: string } | null }
interface Missed { lessonId: string; date: string; title: string; chapter: string; topics: string[]; students: { id: string; name: string }[] }
interface ExamData { exam: { title: string; starts_on: string } | null; periodsLeft: number; rows: { chapter: string; marks: number; score: number | null; priority: number; periods: number }[]; noMarks: boolean }
interface Data { units: Unit[]; missed: Missed[]; exam: ExamData }

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
export const plannerLink = (cls: string, subject: string, lesson?: string) => `/teacher/syllabus?${new URLSearchParams({ class: cls, subject, tab: 'lessons', ...(lesson ? { lesson } : {}) })}`;

/**
 * Lessons and units (round 5): a whole chapter dated to this teacher's timetable, re-paced when periods are lost; the
 * catch-up for students absent from a lesson (sent only when the teacher says so); and exam mode, which ranks chapters by
 * board marks against the class's gap and fits revision into the periods left.
 */
export default function PlanView({ cls, subject, home, onOpen, onOneLesson, onMock, onToast }: {
  cls: string; subject: string; home: HomeData | null; onOpen: (id: string) => void; onOneLesson: () => void; onMock: () => void; onToast: (m: string) => void;
}) {
  const api = useStudioApi();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [chapter, setChapter] = useState(home?.tiles.lowest?.chapter ?? home?.chapters[0]?.name ?? '');
  const [start, setStart] = useState('');
  const [examDate, setExamDate] = useState('');
  const [left, setLeft] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  const q = new URLSearchParams({ class: cls, subject, ...(examDate ? { examDate } : {}) }).toString();
  useEffect(() => {
    let live = true;
    api<Data>(`/api/teacher/studio/plan?${q}`).then(r => { if (live) { setD(r); setError(null); } }).catch(e => { if (live) setError(e?.message); });
    return () => { live = false; };
  }, [api, q, tick]);

  async function act(key: string, body: Record<string, unknown>, done: (r: any) => string) {
    setBusy(key); setError(null);
    try { const r = await api<any>('/api/teacher/studio/plan', 'POST', body); onToast(done(r)); setTick(t => t + 1); return r; }
    catch (e: any) { setError(e?.message); return null; } finally { setBusy(null); }
  }

  if (!d) return error ? <div className="note err" role="alert">{error}</div> : <div aria-busy="true"><Skeleton h={420} /></div>;
  const ex = d.exam;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="sd-two">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="sd-card sd-pad" aria-label="Unit plans">
          <div className="sd-hd">
            <div><h2><CalendarCheck size={18} weight="duotone" /> Plan a chapter</h2><p>Every period of the chapter dated to your timetable, skipping holidays and exams. Lessons land in your planner as drafts.</p></div>
            <button className="btn sm" onClick={onOneLesson}><ChalkboardTeacher size={13} weight="bold" /> Just one lesson</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="sd-fld" style={{ flex: 2, minWidth: 220, marginBottom: 0 }}><span className="lb">Chapter</span>
              <select className="cmp-sel" value={chapter} onChange={e => setChapter(e.target.value)}>
                {(home?.chapters ?? []).map(c => <option key={c.name} value={c.name}>{c.seq}. {c.name}</option>)}
              </select></label>
            <label className="sd-fld" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}><span className="lb">Starting</span>
              <input type="date" className="cmp-in" min={today} value={start} onChange={e => setStart(e.target.value)} aria-label="Start date (today if empty)" /></label>
            <button className="btn sm pri" disabled={!chapter || !!busy} onClick={() => act('unit', { action: 'unit', class: cls, subject, chapter, start: start || undefined },
              r => `${r.lessons} lessons dated, ${fmt(r.first.date)} to ${fmt(r.last.date)}${r.lessons < r.wanted ? ` (${r.wanted - r.lessons} more needed than the term has free)` : ''}`)}>
              {busy === 'unit' ? 'Planning…' : 'Plan it'}</button>
          </div>
          {d.units.length > 0 && (
            <table className="sd-tbl" style={{ marginTop: 12 }}>
              <thead><tr><th>PLAN</th><th>PROGRESS</th><th>NEXT</th><th /></tr></thead>
              <tbody>{d.units.map(u => (
                <tr key={u.id}>
                  <td><b>{u.title}</b>{u.behind > 0 && <small style={{ color: '#B45309', fontWeight: 700 }}><WarningCircle size={12} weight="bold" /> {u.behind} lesson{u.behind === 1 ? '' : 's'} past their date, not taught</small>}</td>
                  <td><b className="mono">{u.taught}/{u.lessons}</b><div className="sd-bar" aria-hidden="true"><i style={{ width: `${u.lessons ? Math.round((u.taught / u.lessons) * 100) : 0}%` }} /></div></td>
                  <td>{u.next?.date ? <><b>{fmt(u.next.date)}</b><small>{u.next.title}</small></> : <span className="sd-mut">All taught</span>}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {u.behind > 0 && <button className="btn sm pri" style={{ marginRight: 6 }} disabled={!!busy} onClick={() => act(`repace-${u.id}`, { action: 'repace', id: u.id }, r => r.moved ? `${r.moved} lesson${r.moved === 1 ? '' : 's'} moved to the next free periods${r.unplaced ? `; ${r.unplaced} no longer fit this term` : ''}` : 'Already on track')}>Re-pace</button>}
                    <button className="btn sm" onClick={() => onOpen(u.id)}>Open</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {error && <div className="note err" role="alert" style={{ marginTop: 10 }}>{error}</div>}
        </section>

        <section className="sd-card sd-pad" aria-label="Catch-up for absent students">
          <div className="sd-hd"><div><h2><UserMinus size={18} weight="duotone" /> Missed a lesson</h2><p>Students absent on the day of a lesson you marked taught. A catch-up goes only to the ones you tick: what the lesson covered and three quick questions from the bank.</p></div></div>
          {!d.missed.length ? <p className="sd-mut" style={{ fontSize: 14 }}><CheckCircle size={14} weight="bold" /> Nobody missed a taught lesson in the last ten days.</p>
            : d.missed.map(mi => {
              const chosen = mi.students.filter(s => !left.has(`${mi.lessonId}|${s.id}`));
              return (
                <div key={mi.lessonId} style={{ borderTop: '1px solid var(--sd-line)', padding: '10px 0' }}>
                  <b style={{ fontSize: 14.5 }}>{fmt(mi.date)}: {mi.title}</b>
                  <div className="sd-who" role="group" aria-label={`Absent on ${mi.date}`} style={{ flexDirection: 'row', flexWrap: 'wrap', maxHeight: 'none' }}>
                    {mi.students.map(s => {
                      const k = `${mi.lessonId}|${s.id}`;
                      return <label key={s.id}><input type="checkbox" checked={!left.has(k)} onChange={e => setLeft(x => { const n = new Set(x); if (e.target.checked) n.delete(k); else n.add(k); return n; })} /><span>{s.name}</span></label>;
                    })}
                  </div>
                  <button className="btn sm pri" disabled={!chosen.length || !!busy} onClick={() => act(`cu-${mi.lessonId}`, { action: 'catchup', lessonId: mi.lessonId, studentIds: chosen.map(s => s.id) },
                    r => `Catch-up sent to ${r.students} student${r.students === 1 ? '' : 's'}${r.questions ? ` with ${r.questions} questions` : ' (the bank had no quick questions on it, so it carries the summary only)'}`)}>
                    Send catch-up ({chosen.length})</button>
                </div>
              );
            })}
        </section>
      </div>

      <section className="sd-card sd-pad" aria-label="Exam mode">
        <div className="sd-hd"><div><h2><Exam size={18} weight="duotone" /> Exam mode</h2>
          <p>{ex.exam ? <>{ex.exam.title} on <b>{fmt(ex.exam.starts_on)}</b>: {ex.periodsLeft} of your periods left before it.</> : 'No exam on the school calendar in the next four months. Pick a date to plan towards.'}</p></div></div>
        <label className="sd-fld" style={{ maxWidth: 220 }}><span className="lb">Exam date</span>
          <input type="date" className="cmp-in" min={today} value={examDate || ex.exam?.starts_on || ''} onChange={e => setExamDate(e.target.value)} /></label>
        {ex.rows.length > 0 ? (
          <>
            <p className="sd-mut" style={{ fontSize: 13, margin: '10px 0 4px' }}>Ranked by board marks against where {cls} stands: the most marks to win first.</p>
            <table className="sd-tbl">
              <thead><tr><th>CHAPTER</th><th>BOARD</th><th>CLASS</th><th>PERIODS</th></tr></thead>
              <tbody>{ex.rows.map(r => (
                <tr key={r.chapter}>
                  <td><b>{r.chapter}</b></td>
                  <td className="mono">{r.marks}</td>
                  <td>{r.score === null ? <span className="sd-mut">not yet known</span> : <><b className="mono">{r.score}%</b><div className="sd-bar" aria-hidden="true"><i style={{ width: `${r.score}%` }} /></div></>}</td>
                  <td className="mono">{r.periods || '–'}</td>
                </tr>
              ))}</tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn sm pri" disabled={!ex.periodsLeft || !!busy} onClick={() => act('rev', { action: 'revision', class: cls, subject, examDate: examDate || undefined },
                r => `${r.lessons} revision lessons put in your planner${r.skipped ? `; ${r.skipped} didn't fit` : ''}`)}>Put revision in my planner</button>
              <button className="btn sm" onClick={onMock}>Make a mock paper</button>
            </div>
          </>
        ) : <p className="sd-mut" style={{ fontSize: 14, marginTop: 10 }}>{ex.noMarks ? 'This syllabus doesn’t publish marks per chapter, so chapters can’t be ranked by board weight.' : 'No chapters to rank.'}</p>}
      </section>
    </div>
  );
}

/** One unit or revision plan, opened from My materials: its dated lessons and how they stand. */
export function PlanDetail({ id, onToast }: { id: string; onToast: (m: string) => void }) {
  const api = useStudioApi();
  const [d, setD] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api<any>(`/api/teacher/studio/plan?id=${id}`).then(r => { if (live) setD(r); }).catch(e => { if (live) setError(e?.message); });
    return () => { live = false; };
  }, [api, id, tick]);
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!d) return <Skeleton h={360} />;
  const p = d.plan;
  return (
    <section className="sd-card sd-pad">
      <div className="sd-hd">
        <div><h2>{p.title}</h2><p>{p.class} {p.subject}. {d.lessons.filter((l: any) => l.taught).length} of {d.lessons.length} taught.{d.behind ? ` ${d.behind} past their date, not taught.` : ''}</p></div>
        {d.behind > 0 && <button className="btn sm pri" disabled={busy} onClick={async () => {
          setBusy(true);
          try { const r = await api<any>('/api/teacher/studio/plan', 'POST', { action: 'repace', id }); onToast(`${r.moved} lessons moved`); setTick(t => t + 1); }
          catch (e: any) { setError(e?.message); } finally { setBusy(false); }
        }}>Re-pace</button>}
      </div>
      {p.content?.type === 'revision_plan' && p.content.exam && <p className="sd-mut" style={{ fontSize: 13.5, marginBottom: 8 }}>Towards {p.content.exam.title} on {fmt(p.content.exam.starts_on)}.</p>}
      <table className="sd-tbl">
        <thead><tr><th>WHEN</th><th>LESSON</th><th>STATUS</th><th /></tr></thead>
        <tbody>{d.lessons.map((l: any) => (
          <tr key={l.id}>
            <td><b>{l.date ? fmt(l.date) : 'Not dated'}</b><small>{l.period ? `Period ${l.period}` : ''}</small></td>
            <td><b>{l.title}</b><small>{l.aiDrafted ? 'Drafted' : 'Outline only: draft it in the planner'}{l.materials ? `, ${l.materials} material${l.materials === 1 ? '' : 's'}` : ''}</small></td>
            <td>{l.taught ? <span className="sd-chip g"><CheckCircle size={12} weight="bold" /> Taught</span> : l.date && l.date < d.today ? <span className="sd-chip a"><WarningCircle size={12} weight="bold" /> Missed its date</span> : <span className="sd-chip">Planned</span>}</td>
            <td style={{ textAlign: 'right' }}><a className="btn sm" href={plannerLink(p.class, p.subject, l.id)}>Open</a></td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}
