'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { XCircleIcon as XCircle } from '@phosphor-icons/react/dist/ssr/XCircle';
import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { Chip } from '@/components/canon/ui';
import { plural } from '@/lib/admin/format';
import { useAuth } from '@/contexts/AuthContext';
import { classOrder, findClashes, namesOf, periodClock, wingOf } from '@/lib/schedule/engine';
import { buildInput, gridFor, keptLessons, toSlots, weightsOf } from '@/lib/schedule/solverInput';
import type { SolverInput, SolverResult, SolverWeights } from '@/lib/schedule/solver';
import { solveBest, type SolvePhase } from '@/lib/schedule/runSolver';
import { precheck, type Finding } from '@/lib/schedule/precheck';
import { timetableQuality, type Quality } from '@/lib/schedule/quality';
import type { SolverData } from '@/lib/schedule/useSolverData';
import { slotPerson, type ScheduleRows } from '@/lib/schedule/types';
import { normClass } from '@/lib/teacher/scope';
import WeekGrid from '@/components/schedule/WeekGrid';

type Call = <T = unknown>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const API = '/api/admin/schedule/solver';
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

const EFFORT = [
  { key: 'quick', label: 'Quick', seconds: 15, note: 'About 15 seconds. A first look.' },
  { key: 'balanced', label: 'Balanced', seconds: 45, note: 'About 45 seconds. Right for most schools.' },
  { key: 'thorough', label: 'Thorough', seconds: 120, note: 'About 2 minutes. For a large school or a tight week.' },
] as const;
const STAY = [
  { key: 0, label: 'Move freely' },
  { key: 6, label: 'Prefer few changes' },
  { key: 40, label: 'Change as little as possible' },
] as const;
/** The three timetables built for comparison: the school's own priorities, and one leaning each way. */
const PROFILES: { key: string; label: string; note: string; weights: (w: SolverWeights) => Partial<SolverWeights> }[] = [
  { key: 'balanced', label: 'Balanced', note: 'Your priorities as set below', weights: () => ({}) },
  { key: 'teachers', label: 'Kind to teachers', note: 'Fewest gaps, even days', weights: w => ({ gaps: 3, balance: 3, spread: Math.min(w.spread, 1) }) },
  { key: 'students', label: 'Kind to students', note: 'Subjects spread, wishes met', weights: w => ({ spread: 3, prefs: 3, classTeacher: 3, gaps: Math.min(w.gaps, 1) }) },
];

interface Option { key: string; label: string; note: string; result: SolverResult; quality: Quality; input: SolverInput }

/** Schedule > Auto-build: the readiness check, the build controls, and the result (one timetable or three to compare). */
export default function SolvePanel({ rows, data, sections, call, toast, reload }: {
  rows: ScheduleRows; data: SolverData; sections: string[]; call: Call; toast: (m: string) => void; reload: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { getAuthToken } = useAuth();
  const drafts = rows.versions.filter(v => v.status !== 'archived').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [mode, setMode] = useState<'fresh' | 'repair'>(params.get('base') ? 'repair' : 'fresh');
  const [baseId, setBaseId] = useState(params.get('base') ?? drafts.find(v => v.status === 'draft')?.id ?? drafts[0]?.id ?? '');
  const [effort, setEffort] = useState<(typeof EFFORT)[number]['key']>('balanced');
  const [stay, setStay] = useState<number>(6);
  const [compare, setCompare] = useState(false);
  const [running, setRunning] = useState<{ t: number; phase: SolvePhase } | null>(null);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [pick, setPick] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<'class' | 'teacher'>('class');
  const [focus, setFocus] = useState('');
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const names = useMemo(() => namesOf(rows), [rows]);
  const seconds = EFFORT.find(e => e.key === effort)!.seconds;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setRunning(r => (r ? { ...r, t: r.t + 1 } : r)), 1000);
    return () => clearInterval(t);
  }, [!!running]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => abort.current?.abort(), []);

  const base = rows.versions.find(v => v.id === baseId) ?? null;
  const baseSlots = useMemo(() => (base ? rows.slots.filter(s => s.version_id === base.id) : []), [rows.slots, base]);
  const withReqs = useMemo(() => new Set(data.requirements.map(r => normClass(r.class))), [data.requirements]);
  const noBells = sections.filter(c => withReqs.has(normClass(c)) && !gridFor(c, rows).length);
  const periodsNeeded = data.requirements.reduce((n, r) => n + r.periods_per_week, 0);
  const inputFor = (weights?: Partial<SolverWeights>, seed = 1) => buildInput(rows, data.requirements, data.rules, data.settings, {
    base: mode === 'repair' && base ? { slots: baseSlots, mode: 'repair' } : undefined,
    seed, timeLimitMs: seconds * 1000, weights, stability: mode === 'repair' ? stay : 0,
  });

  // The readiness check runs on what the sheet says now, before any solving.
  const findings = useMemo<Finding[]>(() => {
    if (!data.requirements.length) return [];
    try { return precheck(inputFor(), names, new Map(rows.rooms.map(r => [r.id, r.name]))); } catch { return []; }
  }, [rows, data, mode, baseId]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocks = findings.filter(f => f.level === 'block');
  const warns = findings.filter(f => f.level === 'warn');
  const short = blocks.reduce((n, f) => n + f.short, 0);

  const go = async () => {
    setErr(null); setOptions(null); setRunning({ t: 0, phase: 'draft' });
    abort.current = new AbortController();
    try {
      const token = await getAuthToken().catch(() => '');
      const school = weightsOf(data.settings);
      const profiles = compare ? PROFILES : PROFILES.slice(0, 1);
      const seed = Math.floor(Math.random() * 1e9);
      const built = await Promise.all(profiles.map(async (p, i) => {
        const input = inputFor(p.weights(school), seed + i);
        if (!input.sections.length) throw new Error('No section with requirements has bells set up yet.');
        const result = await solveBest(input, {
          token, signal: abort.current!.signal, cost: r => timetableQuality(input, r).cost,
          onPhase: phase => { if (i === 0) setRunning(r => (r ? { ...r, phase } : r)); },
        });
        // The server refuses a timetable with clashes; check before offering to save.
        const clashes = findClashes(toSlots(result.lessons), rows.rooms, periodClock(rows));
        if (clashes.length) throw new Error(`The solver's result has ${plural(clashes.length, 'clash', 'clashes')}. Run it again.`);
        // Each option is judged by the school's own priorities, so the three are comparable.
        return { key: p.key, label: p.label, note: p.note, result, input, quality: timetableQuality(inputFor(), result) };
      }));
      if (mode === 'repair' && base) {
        const off = [...keptLessons(baseSlots, data.requirements)].filter(s => !s.locked).length;
        if (off) for (const o of built) o.result.warnings.unshift(`${plural(off, 'lesson')} of ${base.name} ${off === 1 ? 'is' : 'are'} kept where ${off === 1 ? 'it is' : 'they are'}: the requirements sheet has no row for ${off === 1 ? 'its' : 'their'} section and subject (or ${off === 1 ? 'it is' : 'they are'} part of a locked combined lesson).`);
      }
      const best = [...built].sort((a, b) => a.quality.unplaced - b.quality.unplaced || a.quality.cost - b.quality.cost)[0];
      setOptions(built);
      setPick(best.key);
      setFocus(best.input.sections[0]?.cls ?? '');
      setName(mode === 'repair' && base ? `${base.name} (re-solved)` : `Auto-built ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`);
    } catch (e) { if (!abort.current?.signal.aborted) setErr(errText(e)); } finally { setRunning(null); }
  };

  const chosen = options?.find(o => o.key === pick) ?? null;
  const result = chosen?.result ?? null;
  const resultSlots = useMemo(() => (result ? toSlots(result.lessons) : []), [result]);
  const bestKey = useMemo(() => (options ? [...options].sort((a, b) => a.quality.unplaced - b.quality.unplaced || a.quality.cost - b.quality.cost)[0]?.key : ''), [options]);
  const changedOf = (r: SolverResult) => {
    if (!base || mode !== 'repair') return null;
    const key = (s: { class: string; weekday: number; period_no: number; subject: string; group_label: string }) => `${normClass(s.class)}|${s.weekday}|${s.period_no}|${s.subject.toLowerCase()}|${s.group_label.toLowerCase()}`;
    const slots = toSlots(r.lessons);
    const before = new Set(baseSlots.map(key)), after = new Set(slots.map(key));
    return slots.filter(s => !before.has(key(s))).length + baseSlots.filter(s => !after.has(key(s))).length;
  };
  const teachersIn = useMemo(() => [...new Set(resultSlots.map(s => slotPerson(s)).filter((t): t is string => !!t))].sort((a, b) => (names.get(a) || '').localeCompare(names.get(b) || '')), [resultSlots, names]);
  const focusKey = view === 'class' ? focus : (teachersIn.includes(focus) ? focus : teachersIn[0] ?? '');
  const shown = view === 'class' ? resultSlots.filter(s => normClass(s.class) === normClass(focusKey)) : resultSlots.filter(s => slotPerson(s) === focusKey);
  const wing = view === 'class' ? wingOf(focusKey, rows.wings)?.id ?? null : shown[0] ? wingOf(shown[0].class, rows.wings)?.id ?? null : null;

  const ready = data.requirements.length > 0;
  const phaseText: Record<SolvePhase, string> = {
    draft: 'Drafting a first timetable in your browser',
    optimise: 'Improving it with the CP-SAT solver',
    fallback: 'The solver service is not reachable; improving it in your browser',
  };
  const budget = seconds + 8;

  return (
    <div className="card sch-solve" style={{ marginBottom: 18 }}>
      <div className="sch-solve-head">
        <span className="sch-solve-ic"><Sparkle size={20} weight="fill" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>Auto-build the timetable</h3>
          <p>Places every lesson the sheet asks for with no clashes, inside each teacher&apos;s caps and times off, then improves it against your priorities. Nothing is saved until you save a draft.</p>
        </div>
      </div>

      {/* 1. Readiness */}
      <div className="sch-step">
        <div className="sch-step-n">1</div>
        <div className="sch-step-b">
          <div className="sch-step-t">
            <b>Check the sheet</b>
            {!ready ? <Chip tone="n">NOTHING TO BUILD YET</Chip>
              : blocks.length ? <Chip tone="r">{plural(short, 'PERIOD')} CAN&apos;T BE PLACED</Chip>
                : warns.length ? <Chip tone="a">{plural(warns.length, 'THING')} TO KNOW</Chip> : <Chip tone="g">READY</Chip>}
          </div>
          <p className="sch-step-s">
            {ready ? <>{plural(data.requirements.length, 'requirement')} · {plural(periodsNeeded, 'period')} a week · {plural(withReqs.size, 'section')}</>
              : <>Fill in what each section needs first (below). &ldquo;Fill from the timetable&rdquo; starts the sheet for you.</>}
          </p>
          {noBells.length > 0 && <div className="sch-find warn"><Warning size={16} weight="fill" /><div><b>{noBells.join(', ')} {noBells.length === 1 ? 'has' : 'have'} no bell timings</b><span>{noBells.length === 1 ? 'It is' : 'They are'} skipped. Set them in Bells &amp; rooms.</span></div></div>}
          {(open ? findings : findings.slice(0, 3)).map((f, i) => (
            <div key={i} className={`sch-find ${f.level}`}>
              {f.level === 'block' ? <XCircle size={16} weight="fill" /> : <Warning size={16} weight="fill" />}
              <div><b>{f.title}</b><span>{f.detail} {f.fix}</span></div>
            </div>
          ))}
          {findings.length > 3 && <button type="button" className="sch-more" onClick={() => setOpen(o => !o)}><CaretDown size={12} weight="bold" style={{ transform: open ? 'rotate(180deg)' : undefined }} /> {open ? 'Show fewer' : `Show all ${findings.length}`}</button>}
          {ready && !findings.length && !noBells.length && <div className="sch-find ok"><CheckCircle size={16} weight="fill" /><div><b>Nothing stands in the way</b><span>Every section fits its week, every teacher fits their caps, and every room the sheet asks for exists.</span></div></div>}
        </div>
      </div>

      {/* 2. Build */}
      <div className="sch-step">
        <div className="sch-step-n">2</div>
        <div className="sch-step-b">
          <div className="sch-step-t"><b>Build</b></div>
          <div className="sch-ctl">
            <div className="sch-ctl-f">
              <span className="lbl">START FROM</span>
              <div className="sch-seg" role="tablist" aria-label="How to build">
                <button role="tab" aria-selected={mode === 'fresh'} className={mode === 'fresh' ? 'on' : ''} onClick={() => setMode('fresh')}>A blank week</button>
                <button role="tab" aria-selected={mode === 'repair'} className={mode === 'repair' ? 'on' : ''} onClick={() => setMode('repair')} disabled={!drafts.length}>An existing timetable</button>
              </div>
            </div>
            {mode === 'repair' && (
              <>
                <div className="sch-ctl-f">
                  <label className="lbl" htmlFor="solve-base">TIMETABLE</label>
                  <select id="solve-base" className="sch-sel" value={baseId} onChange={e => setBaseId(e.target.value)}>
                    {drafts.map(v => <option key={v.id} value={v.id}>{v.name} · {v.status}</option>)}
                  </select>
                </div>
                <div className="sch-ctl-f">
                  <span className="lbl">LESSONS ALREADY PLACED</span>
                  <div className="sch-seg" role="radiogroup" aria-label="How much may change">
                    {STAY.map(s => <button key={s.key} role="radio" aria-checked={stay === s.key} className={stay === s.key ? 'on' : ''} onClick={() => setStay(s.key)}>{s.label}</button>)}
                  </div>
                </div>
              </>
            )}
            <div className="sch-ctl-f">
              <span className="lbl">HOW HARD TO LOOK</span>
              <div className="sch-seg" role="radiogroup" aria-label="How hard to look">
                {EFFORT.map(e => <button key={e.key} role="radio" aria-checked={effort === e.key} className={effort === e.key ? 'on' : ''} onClick={() => setEffort(e.key)}>{e.label}</button>)}
              </div>
            </div>
          </div>
          <p className="sch-step-s">
            {EFFORT.find(e => e.key === effort)!.note}
            {mode === 'repair' && base ? ` Keeps the ${plural(baseSlots.filter(s => s.locked).length, 'locked lesson')} of ${base.name} where ${baseSlots.filter(s => s.locked).length === 1 ? 'it is' : 'they are'}.` : ''}
          </p>
          <div className="sch-go">
            <label className="sch-tick"><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} /> Build three options to compare</label>
            <span style={{ flex: 1 }} />
            {running && <button className="btn" onClick={() => abort.current?.abort()}>Stop</button>}
            <button className="btn pri" disabled={!!running || !ready} onClick={go}>
              <Sparkle size={14} weight="fill" /> {running ? 'Building…' : options ? 'Build again' : compare ? 'Build three options' : 'Build the timetable'}
            </button>
          </div>
          {running && (
            <div className="sch-prog" role="status" aria-live="polite">
              <div className="bar"><i style={{ width: `${Math.min(97, (running.t / budget) * 100)}%` }} /></div>
              <span>{phaseText[running.phase]} · {running.t}s of about {budget}s</span>
            </div>
          )}
          {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
        </div>
      </div>

      {/* 3. Result */}
      {options && chosen && result && (
        <div className="sch-step">
          <div className="sch-step-n">3</div>
          <div className="sch-step-b">
            <div className="sch-step-t">
              <b>{options.length > 1 ? 'Compare and save' : 'Review and save'}</b>
              <Chip tone={result.engine === 'cpsat' ? 'p' : 'n'} title={result.engine === 'cpsat' ? 'Built by Google OR-Tools CP-SAT' : 'Built by the in-browser solver'}>{result.engine === 'cpsat' ? 'CP-SAT' : 'IN-BROWSER SOLVER'}</Chip>
              {result.proof?.status === 'optimal' && <Chip tone="g" title="The solver proved no timetable scores better under these rules and priorities">PROVED BEST</Chip>}
            </div>
            <div className="sch-opts" role="radiogroup" aria-label="Timetable options">
              {options.map(o => {
                const q = o.quality, changed = changedOf(o.result);
                return (
                  <button key={o.key} type="button" role="radio" aria-checked={o.key === pick} className={`sch-opt${o.key === pick ? ' on' : ''}`} onClick={() => setPick(o.key)}>
                    <div className="h"><b>{options.length > 1 ? o.label : 'This timetable'}</b>{options.length > 1 && o.key === bestKey && <Chip tone="g">BEST FIT</Chip>}</div>
                    {options.length > 1 && <div className="n">{o.note}</div>}
                    <dl>
                      <Metric label="Periods placed" value={`${o.result.lessons.length ? periodsNeeded - q.unplaced : 0} of ${periodsNeeded}`} tone={q.unplaced ? 'bad' : 'good'} />
                      <Metric label="Teacher gaps a week" value={q.teacherGaps} sub={q.teachersWithGaps ? `${plural(q.teachersWithGaps, 'teacher')}` : undefined} tone={q.teacherGaps ? 'mid' : 'good'} />
                      {q.classTeacherFirst.of > 0 && <Metric label="Class teacher opens the day" value={`${Math.round((q.classTeacherFirst.met / q.classTeacherFirst.of) * 100)}%`} tone={q.classTeacherFirst.met === q.classTeacherFirst.of ? 'good' : 'mid'} />}
                      <Metric label="Subjects bunched on a day" value={q.bunched} tone={q.bunched ? 'mid' : 'good'} />
                      <Metric label="Wishes not met" value={q.prefsMissed} tone={q.prefsMissed ? 'mid' : 'good'} />
                      <Metric label="Free periods inside a class's day" value={q.studentGaps} tone={!q.studentGaps ? 'good' : data.settings.no_student_gaps ? 'mid' : 'plain'} />
                      {changed !== null && <Metric label={`Changed against ${base?.name}`} value={changed} tone="plain" />}
                    </dl>
                  </button>
                );
              })}
            </div>

            {result.unplaced.length > 0 && (
              <div className="sch-unplaced">
                <b>Not placed, and why</b>
                {result.unplaced.slice(0, 15).map(u => (
                  <div key={u.requirementId}><span>{u.cls} · {u.subject}{u.group ? ` (${u.group})` : ''}</span><em>{plural(u.periods, 'period')}</em><p>{u.reason}</p></div>
                ))}
                {result.unplaced.length > 15 && <p className="muted" style={{ fontSize: 12.5 }}>and {result.unplaced.length - 15} more</p>}
              </div>
            )}
            {result.warnings.length > 0 && <div className="note info" style={{ marginBottom: 12 }}>{result.warnings.slice(0, 8).map((w, i) => <div key={i}>{w}</div>)}</div>}

            <div className="sch-bar" style={{ marginBottom: 12 }}>
              <div className="sch-seg" role="tablist" aria-label="Preview by">
                <button role="tab" aria-selected={view === 'class'} className={view === 'class' ? 'on' : ''} onClick={() => { setView('class'); setFocus(chosen.input.sections[0]?.cls ?? ''); }}>By class</button>
                <button role="tab" aria-selected={view === 'teacher'} className={view === 'teacher' ? 'on' : ''} onClick={() => { setView('teacher'); setFocus(teachersIn[0] ?? ''); }}>By teacher</button>
              </div>
              <select className="sch-sel" aria-label={view === 'class' ? 'Section to preview' : 'Teacher to preview'} value={focusKey} onChange={e => setFocus(e.target.value)}>
                {view === 'class' ? [...new Set(result.lessons.map(l => l.cls))].sort(classOrder).map(c => <option key={c} value={c}>{c}</option>)
                  : teachersIn.map(t => <option key={t} value={t}>{names.get(t) || 'Teacher'}</option>)}
              </select>
            </div>
            {focusKey && <WeekGrid bells={rows.bells} wingId={wing} slots={shown} mode={view} names={names} rooms={rows.rooms} />}

            <div className="sch-save">
              <div className="cmp-fld" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                <label htmlFor="solve-name">NAME FOR THE DRAFT</label>
                <input id="solve-name" className="cmp-in" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
              </div>
              <button className="btn pri" disabled={saving || !name.trim() || !result.lessons.length} onClick={async () => {
                setSaving(true); setErr(null);
                try {
                  const r = await call<{ id: string; lessons: number }>(API, 'POST', {
                    action: 'save', name, lessons: resultSlots,
                    report: { score: result.score, unplaced: result.unplaced, warnings: result.warnings, stats: result.stats, engine: result.engine, proof: result.proof, quality: chosen.quality },
                  });
                  toast(`Saved as a draft: ${plural(r.lessons, 'lesson')}`);
                  reload();
                  router.replace(`/admin/schedule?tab=timetable&version=${r.id}`, { scroll: false });
                } catch (e) { setErr(errText(e)); } finally { setSaving(false); }
              }}>{saving ? 'Saving…' : 'Save as a draft'}</button>
            </div>
            <p className="sch-step-s" style={{ marginTop: 8 }}>A draft changes nothing for teachers, students or parents. They see it from the day you publish it in the Timetable tab.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone: 'good' | 'mid' | 'bad' | 'plain' }) {
  return (
    <div className={`m ${tone}`}>
      <dt>{label}</dt>
      <dd>{value}{sub && <small> · {sub}</small>}</dd>
    </div>
  );
}
