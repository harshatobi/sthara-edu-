'use client';

import { useState } from 'react';
import { MagicWandIcon as MagicWand } from '@phosphor-icons/react/dist/ssr/MagicWand';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { Chip } from '@/components/canon/ui';
import type { Course } from '@/lib/teacher/useCourse';
import {
  addDays, autoPace, daysBetween, expectedPct, fmtDay, monthLabel, paceOf, PACE_LABEL, PACE_TONE, teachingDays,
} from '@/lib/teacher/course';

/**
 * Pacing plan (the Canvas / Planboard "course calendar"): term window and
 * weekly load, each chapter's planned window on a timeline against today,
 * with actual coverage filled in. Auto-plan spreads the term across chapters
 * in proportion to the curriculum's allotted periods.
 */
export default function PacingView({ course, today, onToast }: { course: Course; today: string; onToast: (m: string) => void }) {
  const [plan, setPlan] = useState({ termStart: course.plan.termStart, termEnd: course.plan.termEnd, periodsPerWeek: course.plan.periodsPerWeek, periodMinutes: course.plan.periodMinutes });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReplan, setConfirmReplan] = useState(false);

  const t0 = course.plan.termStart, t1 = course.plan.termEnd;
  const span = Math.max(1, daysBetween(t0, t1));
  const x = (iso: string) => Math.max(0, Math.min(100, (daysBetween(t0, iso) / span) * 100));
  const months: string[] = [];
  for (let d = `${t0.slice(0, 7)}-01`; d <= t1; d = addDays(d, 32).slice(0, 8) + '01') if (d >= t0) months.push(d);
  const weeks = Math.round(teachingDays(t0, t1) / 6);
  const capacity = weeks * course.plan.periodsPerWeek;
  const needed = course.chapters.reduce((n, c) => n + (c.hours ?? 0), 0);
  const planned = course.chapters.some(c => c.plannedStart);

  async function run(label: string, fn: () => Promise<void>, ok: string) {
    setBusy(label); setError(null);
    try { await fn(); onToast(ok); } catch (e: any) { setError(e?.message || 'Couldn’t save.'); } finally { setBusy(null); }
  }
  const saveTerm = () => run('term', () => course.savePlan(plan), 'Term plan saved');
  const autoPlan = () => run('auto', async () => {
    if (!course.plan.saved) await course.savePlan(plan);
    const windows = autoPace(course.chapters, plan.termStart, plan.termEnd);
    await course.saveItems(windows.map(w => ({ chapterKey: w.key, plannedStart: w.plannedStart, plannedEnd: w.plannedEnd })));
    setConfirmReplan(false);
  }, 'Chapters scheduled across the term');
  const saveWindow = (key: string) => run(key, async () => {
    if (!draft.start || !draft.end || draft.end < draft.start) throw new Error('The end date must be on or after the start date.');
    await course.saveItems([{ chapterKey: key, plannedStart: draft.start, plannedEnd: draft.end }]);
    setEditing(null);
  }, 'Chapter window saved');
  const clearWindow = (key: string) => run(key, async () => {
    await course.saveItems([{ chapterKey: key, plannedStart: null, plannedEnd: null }]);
    setEditing(null);
  }, 'Chapter window cleared');

  const dirty = plan.termStart !== course.plan.termStart || plan.termEnd !== course.plan.termEnd
    || plan.periodsPerWeek !== course.plan.periodsPerWeek || plan.periodMinutes !== course.plan.periodMinutes;

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800 }}>Term &amp; timetable</h3>
          {!course.plan.saved && <Chip tone="a">NOT SAVED YET · SHOWING THE DEFAULT APRIL–FEBRUARY TERM</Chip>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
          <div className="cmp-fld"><label htmlFor="p-start">TERM STARTS</label><input id="p-start" type="date" className="cmp-in" value={plan.termStart} onChange={e => setPlan(p => ({ ...p, termStart: e.target.value }))} /></div>
          <div className="cmp-fld"><label htmlFor="p-end">TERM ENDS</label><input id="p-end" type="date" className="cmp-in" value={plan.termEnd} onChange={e => setPlan(p => ({ ...p, termEnd: e.target.value }))} /></div>
          <div className="cmp-fld"><label htmlFor="p-ppw">PERIODS PER WEEK</label><input id="p-ppw" type="number" min={1} max={20} className="cmp-in" value={plan.periodsPerWeek} onChange={e => setPlan(p => ({ ...p, periodsPerWeek: Math.round(Number(e.target.value) || 1) }))} /></div>
          <div className="cmp-fld"><label htmlFor="p-min">MINUTES PER PERIOD</label><input id="p-min" type="number" min={20} max={120} step={5} className="cmp-in" value={plan.periodMinutes} onChange={e => setPlan(p => ({ ...p, periodMinutes: Math.round(Number(e.target.value) || 40) }))} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn pri" disabled={!!busy || (!dirty && course.plan.saved)} onClick={saveTerm}>{busy === 'term' ? 'Saving…' : 'Save term'}</button>
          {planned && !confirmReplan
            ? <button className="btn" disabled={!!busy} onClick={() => setConfirmReplan(true)}><MagicWand size={14} weight="bold" /> Re-plan all chapters</button>
            : !planned && <button className="btn red" disabled={!!busy} onClick={autoPlan}><MagicWand size={14} weight="fill" /> {busy === 'auto' ? 'Planning…' : 'Auto-plan chapters'}</button>}
          {confirmReplan && (
            <>
              <span className="muted" style={{ fontSize: 12.5 }}>This replaces every chapter&apos;s window.</span>
              <button className="btn red" disabled={!!busy} onClick={autoPlan}>{busy === 'auto' ? 'Planning…' : 'Replace windows'}</button>
              <button className="btn" onClick={() => setConfirmReplan(false)}>Keep mine</button>
            </>
          )}
          <span className="muted" style={{ fontSize: 12.5 }}>
            About {weeks} weeks · up to {capacity} periods before holidays and exams{needed ? ` · the curriculum allots ${needed}` : ''}
            {needed > capacity ? ' — more than the timetable allows' : ''}
          </span>
        </div>
        {error && <div className="err" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800 }}>Chapter timeline</h3>
          <div className="legend">
            <span><i style={{ background: '#DCE6F8' }} />Planned window</span>
            <span><i style={{ background: 'var(--blue)' }} />Taught so far</span>
            <span><i style={{ background: 'var(--red)', width: 3 }} />Today</span>
          </div>
        </div>
        {!planned && <p className="muted" style={{ marginBottom: 14, fontSize: 13.5 }}>No chapter windows yet. Auto-plan fills the term in teaching order, weighted by the periods the curriculum allots each chapter; you can then adjust any chapter.</p>}
        <div className="gantt">
          <div className="g-row head">
            <div />
            <div className="g-months">{months.map(m => <span key={m} style={{ left: `${x(m)}%` }}>{monthLabel(m).toUpperCase()}</span>)}</div>
            <div />
          </div>
          {course.chapters.map(c => {
            const pace = paceOf(c, today);
            const exp = expectedPct(c, today);
            const left = c.plannedStart ? x(c.plannedStart) : 0;
            const right = c.plannedEnd ? x(c.plannedEnd) : 0;
            return (
              <div key={c.key}>
                <div className="g-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.name}>{String(c.seq).padStart(2, '0')} · {c.name}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {c.plannedStart ? `${fmtDay(c.plannedStart)} – ${fmtDay(c.plannedEnd)}` : 'No window'} · {c.pct}% taught{exp !== null && exp > 0 && c.pct < 100 ? ` (plan: ${exp}%)` : ''}
                    </div>
                  </div>
                  <div className="g-lane" title={c.plannedStart ? `${c.name}: ${fmtDay(c.plannedStart)} – ${fmtDay(c.plannedEnd)}, ${c.pct}% taught` : `${c.name}: not scheduled`}>
                    {today >= t0 && today <= t1 && <div className="g-today" style={{ left: `${x(today)}%` }} />}
                    {c.plannedStart && c.plannedEnd && (
                      <div className="g-bar" style={{ left: `${left}%`, width: `${Math.max(0.8, right - left)}%`, background: pace === 'behind' ? '#FFE4EA' : undefined }}>
                        <i style={{ width: `${c.pct}%`, background: pace === 'behind' ? 'var(--red)' : pace === 'done' ? 'var(--green)' : undefined }} />
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                    <Chip tone={PACE_TONE[pace]}>{PACE_LABEL[pace]}</Chip>
                    <button className="btn sm" aria-label={`Edit window for ${c.name}`} onClick={() => { setEditing(editing === c.key ? null : c.key); setDraft({ start: c.plannedStart ?? today, end: c.plannedEnd ?? addDays(today, 14) }); }}>
                      <PencilSimple size={12} weight="bold" />
                    </button>
                  </div>
                </div>
                {editing === c.key && (
                  <div className="g-edit">
                    <label className="muted" style={{ fontSize: 12, fontWeight: 700 }}>From <input className="cmp-in" type="date" value={draft.start} onChange={e => setDraft(d => ({ ...d, start: e.target.value }))} /></label>
                    <label className="muted" style={{ fontSize: 12, fontWeight: 700 }}>To <input className="cmp-in" type="date" value={draft.end} min={draft.start} onChange={e => setDraft(d => ({ ...d, end: e.target.value }))} /></label>
                    <button className="btn sm pri" disabled={!!busy} onClick={() => saveWindow(c.key)}>{busy === c.key ? 'Saving…' : 'Save'}</button>
                    {c.plannedStart && <button className="btn sm" disabled={!!busy} onClick={() => clearWindow(c.key)}>Clear</button>}
                    <button className="btn sm" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
