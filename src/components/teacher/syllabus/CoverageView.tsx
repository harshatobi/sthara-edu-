'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { CaretRightIcon as CaretRight } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { NotebookIcon as Notebook } from '@phosphor-icons/react/dist/ssr/Notebook';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { ClipboardTextIcon as ClipboardText } from '@phosphor-icons/react/dist/ssr/ClipboardText';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { Bar, Chip, hmColor } from '@/components/canon/ui';
import type { Course } from '@/lib/teacher/useCourse';
import { fmtDay, paceOf, PACE_LABEL, PACE_TONE, STATUS_LABEL, STATUS_ORDER, STATUS_TONE, type CourseChapterView, type TopicStatus } from '@/lib/teacher/course';
import type { LessonPrefill } from './SyllabusWorkspace';

type Filter = 'all' | 'in_progress' | 'not_started' | 'taught' | 'gaps';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All chapters' }, { key: 'in_progress', label: 'In progress' }, { key: 'not_started', label: 'Not started' },
  { key: 'taught', label: 'Completed' }, { key: 'gaps', label: 'Taught, not assessed' },
];

/**
 * Coverage (mockup teacher:syl): every chapter of the official curriculum with
 * each content point's status, what's been assessed, lessons planned against
 * it and how the class is scoring — with the actions to move each one forward.
 */
export default function CoverageView({ course, cls, subject, tmlByChapter, today, onPlan, onToast }: {
  course: Course; cls: string; subject: string; tmlByChapter: Map<string, number | null>; today: string;
  onPlan: (p: LessonPrefill) => void; onToast: (m: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set(course.chapters.filter(c => c.inProgress || (c.taught > 0 && c.taught < c.topics.length)).map(c => c.key)));
  const [showOutcomes, setShowOutcomes] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const toggle = (set: Set<string>, k: string) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); return n; };
  const needle = q.trim().toLowerCase();
  const matches = (c: CourseChapterView) => !needle || c.name.toLowerCase().includes(needle) || c.topics.some(t => t.topic.toLowerCase().includes(needle));
  const passes = (f: Filter, c: CourseChapterView) => {
    if (f === 'taught') return c.pct === 100;
    if (f === 'not_started') return c.taught === 0 && c.inProgress === 0;
    if (f === 'in_progress') return (c.taught > 0 || c.inProgress > 0) && c.pct < 100;
    if (f === 'gaps') return c.taught > 0 && !course.assessedKeys.has(c.key);
    return true;
  };
  const shown = course.chapters.filter(c => passes(filter, c) && matches(c));
  const count = (f: Filter) => course.chapters.filter(c => passes(f, c)).length;

  async function save(items: Parameters<Course['saveItems']>[0], ok: string) {
    setError(null);
    try { await course.saveItems(items); onToast(ok); }
    catch (e: any) { setError(e?.message || 'Couldn’t save that change.'); }
  }

  const assignHref = (c: CourseChapterView, kind: 'homework' | 'quiz') =>
    `/teacher/${kind}?${new URLSearchParams({ new: '1', class: cls, subject, chapter: c.name })}`;

  return (
    <>
      <div className="note" style={{ marginBottom: 16 }}>
        A chapter counts as <b>assessed</b> once a posted assignment or quiz is set on it. Marking a lesson <b>taught</b> in the planner marks its topics taught here automatically.
      </div>
      <div className="filters">
        {FILTERS.map(f => (
          <button key={f.key} className={`fchip${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}>
            {f.label} ({count(f.key)})
          </button>
        ))}
        <input className="search" type="search" placeholder="Search chapters and topics" aria-label="Search chapters and topics" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {error && <div className="err" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

      {shown.length ? shown.map(c => {
        const isOpen = open.has(c.key) || !!needle;
        const pace = paceOf(c, today);
        const tml = tmlByChapter.get(c.key) ?? null;
        const assessments = course.assignments.filter(a => a.chapterKey === c.key && a.status !== 'draft');
        const lessons = course.lessons.filter(l => l.chapterKey === c.key);
        const topics = needle && !c.name.toLowerCase().includes(needle) ? c.topics.filter(t => t.topic.toLowerCase().includes(needle)) : c.topics;
        return (
          <div key={c.key} className={`syl-ch${isOpen ? ' open' : ''}`}>
            <div className="top">
              <button className="hd" onClick={() => setOpen(s => toggle(s, c.key))} aria-expanded={isOpen}>
                <div className="av" style={{ background: c.pct ? hmColor(c.pct) : '#EAF2FF', color: c.pct ? '#fff' : 'var(--blue)', borderRadius: 11, fontSize: 13 }}>{String(c.seq).padStart(2, '0')}</div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800 }}>{c.name}</h3>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                    {c.ncert ? `NCERT Ch ${c.ncert} · ` : ''}{c.unit} · {c.taught} of {c.topics.length} topics taught
                    {c.hours ? ` · ${c.hours} periods` : ''}{c.approxMarks ? ` · ~${c.approxMarks} marks` : ''}{c.formativeOnly ? ' · internal assessment only' : ''}
                  </div>
                </div>
                {isOpen ? <CaretDown size={14} weight="bold" color="var(--mut2)" /> : <CaretRight size={14} weight="bold" color="var(--mut2)" />}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {pace !== 'unplanned' && <Chip tone={PACE_TONE[pace]} title={c.plannedStart ? `Planned ${fmtDay(c.plannedStart)} – ${fmtDay(c.plannedEnd)}` : undefined}>{PACE_LABEL[pace]}</Chip>}
                <Chip tone={assessments.length ? 'b' : c.taught ? 'a' : 'n'}>{assessments.length ? `${assessments.length} ASSESSMENT${assessments.length === 1 ? '' : 'S'}` : 'NOT ASSESSED'}</Chip>
                {lessons.length > 0 && <Chip tone="p">{lessons.length} LESSON{lessons.length === 1 ? '' : 'S'}</Chip>}
                {tml !== null && <Chip tone={tml >= 75 ? 'g' : tml >= 40 ? 'a' : 'r'} title="Class TML on this chapter">TML {tml}%</Chip>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 170 }}><Bar value={c.pct} /><b style={{ width: 42, textAlign: 'right', color: c.pct ? hmColor(c.pct) : 'var(--mut2)' }}>{c.pct}%</b></div>
              </div>
            </div>

            {isOpen && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                  <button className="btn sm" onClick={() => onPlan({ chapterKey: c.key })}><Notebook size={13} weight="bold" /> Plan a lesson</button>
                  <Link className="btn sm" href={assignHref(c, 'homework')}><FileText size={13} weight="bold" /> Assign homework</Link>
                  <Link className="btn sm" href={assignHref(c, 'quiz')}><ClipboardText size={13} weight="bold" /> Set a quiz</Link>
                  {c.pct < 100
                    ? <button className="btn sm" onClick={() => save(c.topics.filter(t => t.status !== 'taught').map(t => ({ chapterKey: c.key, topic: t.topic, status: 'taught' })), `${c.name} marked taught`)}><Check size={13} weight="bold" /> Mark chapter taught</button>
                    : <button className="btn sm" onClick={() => save(c.topics.map(t => ({ chapterKey: c.key, topic: t.topic, status: 'not_started' })), `${c.name} reset`)}>Reset chapter</button>}
                  {(c.outcomes.length > 0 || c.notes.length > 0) && (
                    <button className="btn sm" onClick={() => setShowOutcomes(s => toggle(s, c.key))} aria-expanded={showOutcomes.has(c.key)}>
                      {showOutcomes.has(c.key) ? 'Hide' : 'Show'} learning outcomes
                    </button>
                  )}
                </div>
                {showOutcomes.has(c.key) && (
                  <div className="outc">
                    {c.outcomes.length > 0 && <><b>Learning outcomes (CBSE)</b><ul>{c.outcomes.map((o, i) => <li key={i}>{o}</li>)}</ul></>}
                    {c.notes.length > 0 && <div style={{ marginTop: c.outcomes.length ? 10 : 0 }}><b>Curriculum notes</b><ul>{c.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
                  </div>
                )}
                {assessments.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                    {assessments.map(a => (
                      <Link key={a.id} className="ch n" href={`/teacher/${a.type === 'quiz' ? 'quiz' : 'homework'}?${new URLSearchParams({ class: cls, a: a.id })}`}>
                        {a.type === 'quiz' ? 'QUIZ' : 'HW'} · {a.title}{a.dueAt ? ` · due ${fmtDay(a.dueAt)}` : ''}
                      </Link>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 14 }}>
                  {topics.map(t => {
                    const planned = lessons.filter(l => l.topics.includes(t.topic));
                    return (
                      <div key={t.topic} className="syl-tp">
                        <select className={`st-pick ${STATUS_TONE[t.status]}`} value={t.status} aria-label={`Status of ${t.topic}`}
                          onChange={e => save([{ chapterKey: c.key, topic: t.topic, status: e.target.value as TopicStatus }], `Marked ${STATUS_LABEL[e.target.value as TopicStatus].toLowerCase()}`)}>
                          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                        <div className="nm">
                          {t.topic}
                          <div className="meta">
                            {t.status === 'taught' && t.taughtOn ? `Taught ${fmtDay(t.taughtOn)}` : ''}
                            {planned.length ? `${t.status === 'taught' && t.taughtOn ? ' · ' : ''}${planned.length} lesson${planned.length === 1 ? '' : 's'} planned${planned[0].date ? `, next ${fmtDay(planned.find(l => l.date && l.date >= today)?.date ?? planned[0].date)}` : ''}` : ''}
                          </div>
                        </div>
                        <button className="btn sm" onClick={() => onPlan({ chapterKey: c.key, topics: [t.topic] })}>Plan lesson</button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      }) : <div className="card"><p className="muted">No chapters match {needle ? `“${q}”` : 'this filter'}.</p></div>}
    </>
  );
}
