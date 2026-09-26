'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { ArrowUpIcon as ArrowUp } from '@phosphor-icons/react/dist/ssr/ArrowUp';
import { ArrowDownIcon as ArrowDown } from '@phosphor-icons/react/dist/ssr/ArrowDown';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { CopyIcon as Copy } from '@phosphor-icons/react/dist/ssr/Copy';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { Chip } from '@/components/canon/ui';
import type { Course } from '@/lib/teacher/useCourse';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { normClass, normSubject } from '@/lib/teacher/scope';
import { defaultStages, fmtDay, todayIso, type Lesson } from '@/lib/teacher/course';
import type { LessonPrefill } from './SyllabusWorkspace';
import LessonPrint from './LessonPrint';

const STAGE_COLORS = ['#4C8DFF', '#7C5CFC', '#10B981', '#F59E0B', '#F45E77', '#14B8A6', '#E11D48', '#64748B'];
type Draft = Omit<Lesson, 'id' | 'teacherId' | 'taughtOn' | 'aiDrafted'> & { aiDrafted: boolean };

function blank(course: Course, p: LessonPrefill): Draft {
  const chapter = course.chapters.find(c => c.key === p.chapterKey)
    ?? course.chapters.find(c => c.pct < 100 && (c.taught > 0 || c.inProgress > 0))
    ?? course.chapters.find(c => c.pct < 100) ?? course.chapters[0];
  const topics = p.topics?.filter(t => chapter?.topics.some(x => x.topic === t))
    ?? (chapter ? [chapter.topics.find(t => t.status !== 'taught')?.topic].filter(Boolean) as string[] : []);
  const duration = course.plan.periodMinutes || 40;
  return {
    chapterKey: chapter?.key ?? '', chapterName: chapter?.name ?? '', topics,
    title: topics[0] ? (topics[0].length > 80 ? `${chapter?.name}: lesson` : topics[0]) : chapter?.name ?? '',
    date: p.date ?? null, period: null, durationMin: duration, objectives: [], successCriteria: [], priorKnowledge: '',
    materials: [], stages: defaultStages(duration), differentiation: {}, checkForUnderstanding: '', homeworkAssignmentId: null,
    status: 'draft', reflection: '', aiDrafted: false,
  };
}

/** Editable bullet list (objectives, success criteria). */
function ListEditor({ label, items, placeholder, onChange }: { label: string; items: string[]; placeholder: string; onChange: (v: string[]) => void }) {
  return (
    <div className="cmp-fld">
      <label>{label}</label>
      {items.map((it, i) => (
        <div key={i} className="li-row">
          <input className="cmp-in" value={it} maxLength={400} aria-label={`${label} ${i + 1}`} onChange={e => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="btn sm" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><X size={12} weight="bold" /></button>
        </div>
      ))}
      <button className="btn sm" onClick={() => onChange([...items, ''])}><Plus size={12} weight="bold" /> {placeholder}</button>
    </div>
  );
}

/**
 * Lesson plan editor: a full-screen workspace, like the assignment composer.
 * Saving creates or updates the plan; marking it taught also marks its
 * topics taught in Coverage (done by the lessons route).
 */
export default function LessonEditor({ course, cls, subject, lesson, prefill, onClose, onSaved }: {
  course: Course; cls: string; subject: string; lesson: Lesson | null; prefill: LessonPrefill;
  onClose: () => void; onSaved: (msg: string) => void;
}) {
  const { desk, call } = useTeacherDesk();
  const [d, setD] = useState<Draft>(() => (lesson ? { ...lesson } : blank(course, prefill)));
  const [focus, setFocus] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'ai' | 'delete'>(null);
  const [dupClass, setDupClass] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => ({ ...x, [k]: v }));

  const chapter = course.chapters.find(c => c.key === d.chapterKey);
  const stageTotal = d.stages.reduce((n, s) => n + (Number(s.minutes) || 0), 0);
  const otherSections = (desk?.scope ?? []).filter(e => normSubject(e.subject) === normSubject(subject) && normClass(e.cls) !== normClass(cls)).map(e => e.cls);
  const homeworkOptions = useMemo(() => course.assignments.filter(a => a.status !== 'draft')
    .sort((a, b) => (a.chapterKey === d.chapterKey ? -1 : 0) - (b.chapterKey === d.chapterKey ? -1 : 0)), [course.assignments, d.chapterKey]);
  const hasContent = d.objectives.some(Boolean) || d.stages.some(s => s.teacher || s.students) || !!d.checkForUnderstanding;
  const pastOrTaught = d.status === 'taught' || (d.date !== null && d.date <= todayIso());

  const payload = (x: Draft) => ({
    chapterKey: x.chapterKey, chapterName: x.chapterName, topics: x.topics, title: x.title, date: x.date, period: x.period,
    durationMin: x.durationMin, objectives: x.objectives.filter(Boolean), successCriteria: x.successCriteria.filter(Boolean),
    priorKnowledge: x.priorKnowledge, materials: x.materials.filter(m => m.label.trim()), stages: x.stages,
    differentiation: x.differentiation, checkForUnderstanding: x.checkForUnderstanding, homeworkAssignmentId: x.homeworkAssignmentId,
    status: x.status, reflection: x.reflection, aiDrafted: x.aiDrafted,
  });

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setError(null);
    try { await fn(); } catch (e: any) { setError(e?.message || 'Something went wrong.'); } finally { setBusy(null); setConfirm(null); }
  }

  const save = (status?: Draft['status']) => run('save', async () => {
    const x = status ? { ...d, status } : d;
    if (!x.title.trim()) throw new Error('Give the lesson a title.');
    if (!x.chapterKey) throw new Error('Pick a chapter.');
    if (stageTotal > x.durationMin + 5) throw new Error(`The stages add up to ${stageTotal} minutes, more than the ${x.durationMin}-minute lesson.`);
    if (lesson) await call('/api/teacher/lessons', 'PATCH', { id: lesson.id, ...payload(x) });
    else await call('/api/teacher/lessons', 'POST', { class: cls, subject, ...payload(x) });
    course.reload();
    onSaved(status === 'taught' ? 'Lesson marked taught — coverage updated' : lesson ? 'Lesson updated' : 'Lesson saved');
    onClose();
  });

  const draftWithAi = () => run('ai', async () => {
    const r = await call('/api/teacher/lessons/draft', 'POST', { class: cls, subject, chapterKey: d.chapterKey, topics: d.topics, durationMin: d.durationMin, focus });
    setD(x => ({
      ...x, title: x.title && x.title !== x.chapterName && !x.title.startsWith(x.chapterName) ? x.title : r.title,
      objectives: r.objectives, successCriteria: r.successCriteria, priorKnowledge: r.priorKnowledge, materials: r.materials,
      stages: r.stages.length ? r.stages : x.stages, differentiation: r.differentiation, checkForUnderstanding: r.checkForUnderstanding,
      topics: r.topics?.length ? r.topics : x.topics, aiDrafted: true,
    }));
    onSaved('AI draft added — review before saving');
  });

  const duplicate = () => run('dup', async () => {
    if (!dupClass) throw new Error('Pick a section to copy to.');
    await call('/api/teacher/lessons', 'POST', { class: dupClass, subject, ...payload({ ...d, status: d.status === 'taught' ? 'ready' : d.status, reflection: '' }) });
    onSaved(`Copied to ${dupClass}`);
    setDupClass('');
  });

  const remove = () => run('delete', async () => {
    await call('/api/teacher/lessons', 'DELETE', { id: lesson!.id });
    course.reload(); onSaved('Lesson deleted'); onClose();
  });

  const moveStage = (i: number, dir: -1 | 1) => setD(x => {
    const s = [...x.stages]; const j = i + dir;
    if (j < 0 || j >= s.length) return x;
    [s[i], s[j]] = [s[j], s[i]];
    return { ...x, stages: s };
  });

  return (
    <div className="ws" role="dialog" aria-modal="true" aria-labelledby="lp-title">
      <div className="ws-head">
        <button className="ws-back" onClick={onClose}><ArrowLeft size={15} weight="bold" /> Close</button>
        <div><h1 id="lp-title">{lesson ? 'Lesson plan' : 'New lesson plan'}</h1><div className="sub">{cls} · {subject}{d.date ? ` · ${fmtDay(d.date)}` : ''}{lesson?.taughtOn ? ` · taught ${fmtDay(lesson.taughtOn)}` : ''}</div></div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }} className="no-print">
          <div className="seg" role="group" aria-label="Lesson status">
            {(['draft', 'ready', 'taught'] as const).map(s => (
              <button key={s} className={d.status === s ? 'on' : ''} aria-pressed={d.status === s} onClick={() => set('status', s)}>{s === 'draft' ? 'Draft' : s === 'ready' ? 'Ready' : 'Taught'}</button>
            ))}
          </div>
          <button className="btn red" disabled={!!busy} onClick={() => save()}>{busy === 'save' ? 'Saving…' : 'Save plan'}</button>
        </div>
      </div>

      <LessonPrint d={d} cls={cls} subject={subject} teacher={desk?.me.name ?? ''}
        homework={(() => { const a = course.assignments.find(x => x.id === d.homeworkAssignmentId); return a ? `${a.title}${a.dueAt ? `, due ${fmtDay(a.dueAt)}` : ''}` : null; })()} />
      <div className="ws-body"><div className="cmp" style={{ maxWidth: 1180 }}>
        {error && <div className="err" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
        <div className="lp-grid">
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>What this lesson covers</h3>
              <div className="cmp-fld"><label htmlFor="lp-t">TITLE</label>
                <input id="lp-t" className="cmp-in" value={d.title} maxLength={200} onChange={e => set('title', e.target.value)} placeholder="e.g. Structure of a cell: plasma membrane and cell wall" /></div>
              <div className="g2" style={{ gap: 14 }}>
                <div className="cmp-fld"><label htmlFor="lp-ch">CHAPTER</label>
                  <select id="lp-ch" className="cmp-sel" value={d.chapterKey}
                    onChange={e => { const c = course.chapters.find(x => x.key === e.target.value); setD(x => ({ ...x, chapterKey: c?.key ?? '', chapterName: c?.name ?? '', topics: [] })); }}>
                    {course.chapters.map(c => <option key={c.key} value={c.key}>{String(c.seq).padStart(2, '0')}. {c.name}{c.pct === 100 ? ' (taught)' : ''}</option>)}
                  </select></div>
                <div className="g2" style={{ gap: 10 }}>
                  <div className="cmp-fld"><label htmlFor="lp-d">DATE</label><input id="lp-d" type="date" className="cmp-in" value={d.date ?? ''} onChange={e => set('date', e.target.value || null)} /></div>
                  <div className="cmp-fld"><label htmlFor="lp-p">PERIOD</label>
                    <select id="lp-p" className="cmp-sel" value={d.period ?? ''} onChange={e => set('period', e.target.value ? Number(e.target.value) : null)}>
                      <option value="">—</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                    </select></div>
                </div>
              </div>
              {chapter && (
                <div className="cmp-fld">
                  <label>CURRICULUM TOPICS IN THIS LESSON ({d.topics.length})</label>
                  <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '6px 12px', maxHeight: 220, overflowY: 'auto' }}>
                    {chapter.topics.map(t => (
                      <label key={t.topic} className="tp-pick">
                        <input type="checkbox" checked={d.topics.includes(t.topic)}
                          onChange={e => set('topics', e.target.checked ? [...d.topics, t.topic] : d.topics.filter(x => x !== t.topic))} />
                        <span style={{ flex: 1 }}>{t.topic}</span>
                        {t.status === 'taught' && <Chip tone="g">TAUGHT</Chip>}
                      </label>
                    ))}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Marking the lesson taught marks these topics taught in Coverage.</div>
                </div>
              )}
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>Intentions</h3>
              <ListEditor label="LEARNING OBJECTIVES" items={d.objectives} placeholder="Add objective" onChange={v => set('objectives', v)} />
              <ListEditor label="SUCCESS CRITERIA (student-facing)" items={d.successCriteria} placeholder="Add criterion" onChange={v => set('successCriteria', v)} />
              <div className="cmp-fld"><label htmlFor="lp-pk">PRIOR KNOWLEDGE</label>
                <textarea id="lp-pk" className="cmp-in" value={d.priorKnowledge} maxLength={2000} onChange={e => set('priorKnowledge', e.target.value)} placeholder="What students need to already know" /></div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 17, fontWeight: 800 }}>Lesson sequence</h3>
                <label className="stepper"><input className="cmp-in" type="number" min={10} max={240} step={5} aria-label="Lesson length in minutes" value={d.durationMin}
                  onChange={e => set('durationMin', Math.max(10, Math.min(240, Math.round(Number(e.target.value) || 40))))} /><span className="of">minute lesson</span></label>
              </div>
              <div className="timebar" aria-hidden="true">
                {d.stages.map((s, i) => <i key={i} style={{ width: `${(Math.min(s.minutes, d.durationMin) / Math.max(stageTotal, d.durationMin)) * 100}%`, background: STAGE_COLORS[i % STAGE_COLORS.length] }} />)}
              </div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 12, color: stageTotal !== d.durationMin ? (stageTotal > d.durationMin ? 'var(--red)' : '#92600A') : undefined }}>
                {stageTotal} of {d.durationMin} minutes planned{stageTotal > d.durationMin ? ` · ${stageTotal - d.durationMin} over` : stageTotal < d.durationMin ? ` · ${d.durationMin - stageTotal} unplanned` : ''}
              </div>
              {d.stages.map((s, i) => (
                <div className="stage" key={i} style={{ borderLeft: `4px solid ${STAGE_COLORS[i % STAGE_COLORS.length]}` }}>
                  <div className="hd">
                    <input className="cmp-in nm" value={s.name} maxLength={80} aria-label={`Stage ${i + 1} name`} onChange={e => set('stages', d.stages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <label className="stepper"><input className="cmp-in" type="number" min={0} max={240} aria-label={`Stage ${i + 1} minutes`} value={s.minutes}
                      onChange={e => set('stages', d.stages.map((x, j) => (j === i ? { ...x, minutes: Math.max(0, Math.min(240, Math.round(Number(e.target.value) || 0))) } : x)))} /><span className="of">min</span></label>
                    <button className="btn sm" disabled={i === 0} aria-label="Move stage up" onClick={() => moveStage(i, -1)}><ArrowUp size={12} weight="bold" /></button>
                    <button className="btn sm" disabled={i === d.stages.length - 1} aria-label="Move stage down" onClick={() => moveStage(i, 1)}><ArrowDown size={12} weight="bold" /></button>
                    <button className="btn sm" aria-label={`Remove stage ${i + 1}`} onClick={() => set('stages', d.stages.filter((_, j) => j !== i))}><Trash size={12} weight="bold" /></button>
                  </div>
                  <div className="g2" style={{ gap: 10 }}>
                    <textarea className="cmp-in" rows={3} value={s.teacher} maxLength={1500} placeholder="Teacher does…" aria-label={`Stage ${i + 1}: teacher`} onChange={e => set('stages', d.stages.map((x, j) => (j === i ? { ...x, teacher: e.target.value } : x)))} />
                    <textarea className="cmp-in" rows={3} value={s.students} maxLength={1500} placeholder="Students do…" aria-label={`Stage ${i + 1}: students`} onChange={e => set('stages', d.stages.map((x, j) => (j === i ? { ...x, students: e.target.value } : x)))} />
                  </div>
                </div>
              ))}
              <button className="btn sm" disabled={d.stages.length >= 10} onClick={() => set('stages', [...d.stages, { name: 'New stage', minutes: Math.max(0, d.durationMin - stageTotal), teacher: '', students: '' }])}><Plus size={12} weight="bold" /> Add stage</button>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>Every learner, and the check</h3>
              <div className="g2" style={{ gap: 14 }}>
                <div className="cmp-fld"><label htmlFor="lp-sup">SUPPORT (for students who struggle)</label>
                  <textarea id="lp-sup" className="cmp-in" rows={3} maxLength={1500} value={d.differentiation.support ?? ''} onChange={e => set('differentiation', { ...d.differentiation, support: e.target.value })} /></div>
                <div className="cmp-fld"><label htmlFor="lp-str">STRETCH (for students who finish early)</label>
                  <textarea id="lp-str" className="cmp-in" rows={3} maxLength={1500} value={d.differentiation.stretch ?? ''} onChange={e => set('differentiation', { ...d.differentiation, stretch: e.target.value })} /></div>
              </div>
              <div className="cmp-fld"><label htmlFor="lp-cfu">CHECK FOR UNDERSTANDING (exit check, with the expected answer)</label>
                <textarea id="lp-cfu" className="cmp-in" rows={2} maxLength={2000} value={d.checkForUnderstanding} onChange={e => set('checkForUnderstanding', e.target.value)} /></div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>Materials &amp; homework</h3>
              <div className="cmp-fld">
                <label>MATERIALS &amp; RESOURCES</label>
                {d.materials.map((m, i) => (
                  <div key={i} className="li-row">
                    <input className="cmp-in" style={{ flex: '1 1 40%' }} value={m.label} maxLength={200} placeholder="e.g. NCERT p. 12, onion peel slides" aria-label={`Material ${i + 1}`}
                      onChange={e => set('materials', d.materials.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    <input className="cmp-in" style={{ flex: '1 1 40%' }} value={m.url ?? ''} maxLength={1000} placeholder="Link (optional)" aria-label={`Material ${i + 1} link`}
                      onChange={e => set('materials', d.materials.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                    <button className="btn sm" aria-label={`Remove material ${i + 1}`} onClick={() => set('materials', d.materials.filter((_, j) => j !== i))}><X size={12} weight="bold" /></button>
                  </div>
                ))}
                <button className="btn sm" onClick={() => set('materials', [...d.materials, { label: '' }])}><Plus size={12} weight="bold" /> Add material</button>
              </div>
              <div className="cmp-fld">
                <label htmlFor="lp-hw">HOMEWORK SET AFTER THIS LESSON</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select id="lp-hw" className="cmp-sel" style={{ flex: '1 1 260px' }} value={d.homeworkAssignmentId ?? ''} onChange={e => set('homeworkAssignmentId', e.target.value || null)}>
                    <option value="">None</option>
                    {homeworkOptions.map(a => <option key={a.id} value={a.id}>{a.type === 'quiz' ? 'Quiz' : 'HW'} · {a.title}{a.dueAt ? ` (due ${fmtDay(a.dueAt)})` : ''}</option>)}
                  </select>
                  {chapter && <Link className="btn sm" href={`/teacher/homework?${new URLSearchParams({ new: '1', class: cls, subject, chapter: chapter.name })}`}>Create homework on this chapter</Link>}
                </div>
              </div>
            </div>

            {pastOrTaught && (
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>After the lesson</h3>
                <div className="cmp-fld"><label htmlFor="lp-ref">REFLECTION (what worked, what to change, who needs a follow-up)</label>
                  <textarea id="lp-ref" className="cmp-in" rows={4} maxLength={4000} value={d.reflection} onChange={e => set('reflection', e.target.value)} /></div>
              </div>
            )}
          </div>

          <div className="lp-side">
            <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(160deg,#F4F0FF,#fff)' }}>
              <b style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}><Sparkle size={16} weight="fill" color="#D946EF" /> Draft with AI</b>
              <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 10px' }}>Builds objectives, a timed sequence, differentiation and an exit check from the CBSE curriculum entry for the topics you ticked.</p>
              <textarea className="cmp-in" rows={2} maxLength={400} value={focus} placeholder="Anything to aim for? e.g. lab demo, weak on diagrams" aria-label="Focus for the AI draft" onChange={e => setFocus(e.target.value)} />
              {confirm === 'ai'
                ? <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <span className="muted" style={{ fontSize: 12 }}>Replaces the plan&apos;s current content.</span>
                    <button className="btn sm red" disabled={!!busy} onClick={draftWithAi}>{busy === 'ai' ? 'Drafting…' : 'Replace'}</button>
                    <button className="btn sm" onClick={() => setConfirm(null)}>Keep mine</button>
                  </div>
                : <button className="btn red" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} disabled={!!busy || !d.chapterKey}
                    onClick={() => (hasContent ? setConfirm('ai') : draftWithAi())}>{busy === 'ai' ? 'Drafting…' : 'Draft this lesson'}</button>}
              {d.aiDrafted && <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Contains AI-drafted content. Review every part before teaching it.</div>}
            </div>

            {chapter && chapter.outcomes.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <b style={{ fontSize: 13.5 }}>CBSE learning outcomes</b>
                <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>Click to add one as an objective.</p>
                <div style={{ display: 'grid', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {chapter.outcomes.map((o, i) => {
                    const added = d.objectives.includes(o);
                    return (
                      <button key={i} className="sub-pick" style={{ fontSize: 12.5, lineHeight: 1.45, alignItems: 'flex-start' }} disabled={added}
                        onClick={() => set('objectives', [...d.objectives.filter(Boolean), o])}>
                        <span>{o}</span>{added ? <Check size={13} weight="bold" color="var(--green)" /> : <Plus size={13} weight="bold" color="var(--mut2)" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="card">
              <b style={{ fontSize: 13.5 }}>More</b>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {d.status !== 'taught' && (
                  <button className="btn" disabled={!!busy} onClick={() => save('taught')}><Check size={14} weight="bold" /> Save &amp; mark taught</button>
                )}
                <button className="btn" onClick={() => window.print()}><Printer size={14} weight="bold" /> Print plan</button>
                {otherSections.length > 0 && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select className="cmp-sel" style={{ padding: '8px 10px', fontSize: 13 }} aria-label="Copy to section" value={dupClass} onChange={e => setDupClass(e.target.value)}>
                      <option value="">Copy to section…</option>{otherSections.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button className="btn sm" disabled={!dupClass || !!busy} onClick={duplicate}><Copy size={13} weight="bold" /> {busy === 'dup' ? '…' : 'Copy'}</button>
                  </div>
                )}
                {lesson && (confirm === 'delete'
                  ? <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn sm red" disabled={!!busy} onClick={remove}>{busy === 'delete' ? 'Deleting…' : 'Confirm delete'}</button>
                      <button className="btn sm" onClick={() => setConfirm(null)}>Keep it</button>
                    </div>
                  : <button className="btn" onClick={() => setConfirm('delete')}><Trash size={14} weight="bold" /> Delete plan</button>)}
              </div>
            </div>
          </div>
        </div>
      </div></div>
    </div>
  );
}
