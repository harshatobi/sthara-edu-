'use client';

import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { BookOpenIcon as BookOpen } from '@phosphor-icons/react/dist/ssr/BookOpen';
import { Bar, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { useCourse } from '@/lib/teacher/useCourse';
import { summarize, todayIso, fmtDay } from '@/lib/teacher/course';
import { chapterStats, chaptersFor } from '@/lib/teacher/mastery';
import { normClass } from '@/lib/teacher/scope';
import ScopePicker, { useScopeSelection } from '../ScopePicker';
import CoverageView from './CoverageView';
import PacingView from './PacingView';
import LessonsView from './LessonsView';
import LessonEditor from './LessonEditor';

const TABS = [
  { key: 'coverage', label: 'Coverage' },
  { key: 'pacing', label: 'Pacing plan' },
  { key: 'lessons', label: 'Lesson planner' },
] as const;
type Tab = typeof TABS[number]['key'];

export interface LessonPrefill { chapterKey?: string; topics?: string[]; date?: string }

/**
 * Syllabus workspace (mockup teacher:syl, extended): official-curriculum
 * coverage, a term pacing plan and a lesson planner for one class + subject.
 * URL state: ?class &subject &tab &lesson (id | "new") &chapter &topic &date &week.
 */
export default function SyllabusWorkspace() {
  const { desk, error: deskError } = useTeacherDesk();
  const { classes, cls, subjects, subject, params, go } = useScopeSelection(desk?.scope ?? []);
  const course = useCourse(cls, subject);
  const [toast, toastEl] = useToast();
  const today = todayIso();
  const tab = (TABS.some(t => t.key === params.get('tab')) ? params.get('tab') : 'coverage') as Tab;

  const roster = desk?.classes.find(c => normClass(c.cls) === normClass(cls))?.students ?? [];
  const tmlByChapter = new Map(chapterStats(chaptersFor(cls, subject, roster), roster, subject).map(c => [c.key, c.avg]));
  const summary = summarize(course.chapters, course.assessedKeys, course.plan, today);

  const lessonParam = params.get('lesson');
  const editing = lessonParam && lessonParam !== 'new' ? course.lessons.find(l => l.id === lessonParam) ?? null : null;
  const prefill: LessonPrefill = {
    chapterKey: params.get('chapter') ?? undefined,
    topics: params.get('topic') ? [params.get('topic')!] : undefined,
    date: params.get('date') ?? undefined,
  };
  const openLesson = (id: string | 'new', p: LessonPrefill = {}) =>
    go({ lesson: id, chapter: p.chapterKey ?? null, topic: p.topics?.[0] ?? null, date: p.date ?? null });
  const closeLesson = () => go({ lesson: null, chapter: null, topic: null, date: null });

  if (deskError) return <div className="note err" role="alert">Couldn&apos;t load your classes: {deskError}</div>;
  if (!desk) return <WorkspaceSkeleton />;
  if (!classes.length) {
    return (
      <>
        <PageBar eyebrow="SYLLABUS" title="NCERT Coverage" />
        <div className="card"><Empty icon={<Warning size={26} weight="duotone" />} title="No classes assigned yet">
          Your school admin hasn&apos;t linked you to any classes and subjects yet.
        </Empty></div>
      </>
    );
  }

  const noCurriculum = !course.loading && !course.chapters.length;
  const behind = summary.expected !== null ? summary.expected - summary.taught : null;
  const paceText = summary.expected === null ? 'No pacing plan yet'
    : behind! > 1 ? `${behind} topics behind plan` : behind! < -1 ? `${-behind!} topics ahead of plan` : 'On pace with the plan';

  return (
    <>
      <PageBar eyebrow="SYLLABUS" title={tab === 'lessons' ? 'Lesson Planner' : tab === 'pacing' ? 'Pacing Plan' : 'NCERT Coverage'}
        sub={`${cls} · ${subject || 'Subject'} · CBSE 2026-27 · what has been taught, what has been assessed, and what's planned next.`}
        actions={<>
          <ScopePicker classes={classes} cls={cls} subjects={subjects} subject={subject}
            onChange={n => go({ class: n.class ?? cls, subject: n.subject ?? (n.class ? null : subject), lesson: null })} />
          {!noCurriculum && <button className="btn red" onClick={() => openLesson('new', { date: today })}><Plus size={15} weight="bold" /> Plan a lesson</button>}
        </>} />

      {course.error && <div className="note err" role="alert" style={{ marginBottom: 18 }}>Couldn&apos;t load the syllabus: {course.error}</div>}
      {course.loading ? <WorkspaceSkeleton inner /> : noCurriculum ? (
        <div className="card"><Empty icon={<BookOpen size={26} weight="duotone" />} title={`No official curriculum loaded for ${cls} ${subject}`}>
          The CBSE 2026-27 curriculum is loaded for Classes 9 to 12 (Maths, Science, Social Science, Physics, Chemistry, Biology). Other subjects are on the way.
        </Empty></div>
      ) : (
        <>
          <div className="kpis" style={{ marginBottom: 20 }}>
            <div className="kpi"><div className="lb">TOPICS TAUGHT</div>
              <div className="vl">{summary.taught}<span style={{ fontSize: 20, color: 'var(--mut2)' }}>/{summary.topics}</span></div>
              <div style={{ marginTop: 12 }}><Bar value={summary.topics ? Math.round((summary.taught / summary.topics) * 100) : 0} color="var(--blue)" /></div></div>
            <div className="kpi"><div className="lb">CHAPTERS ASSESSED</div>
              <div className="vl">{summary.assessedChapters}<span style={{ fontSize: 20, color: 'var(--mut2)' }}>/{course.chapters.length}</span></div>
              <div style={{ marginTop: 12 }}><Bar value={course.chapters.length ? Math.round((summary.assessedChapters / course.chapters.length) * 100) : 0} color="var(--purple)" /></div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Has at least one posted assignment or quiz</div></div>
            <div className="kpi"><div className="lb">COVERAGE GAP</div>
              <div className="vl" style={{ color: summary.gapChapters ? 'var(--amber)' : undefined }}>{summary.gapChapters}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Chapters taught but never assessed</div></div>
            <button className="kpi" style={{ textAlign: 'left' }} onClick={() => go({ tab: 'pacing' })}>
              <div className="lb">PACE</div>
              <div className="vl" style={{ fontSize: 26, color: behind !== null && behind > 1 ? 'var(--red)' : behind !== null && behind < -1 ? 'var(--purple)' : undefined }}>{paceText}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                {summary.projectedEnd ? `At this pace the syllabus finishes ${fmtDay(summary.projectedEnd)}${summary.projectedEnd > course.plan.termEnd ? ', after term ends' : ''}` : summary.expected === null ? 'Set term dates to track pace' : 'Projection appears once topics are taught'}
              </div>
            </button>
          </div>

          <div className="tabs" role="tablist" aria-label="Syllabus view" style={{ marginBottom: 18 }}>
            {TABS.map(t => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab${tab === t.key ? ' on' : ''}`} onClick={() => go({ tab: t.key })}>
                {t.label}{t.key === 'lessons' && course.lessons.length ? ` (${course.lessons.length})` : ''}
              </button>
            ))}
          </div>

          {tab === 'coverage' && <CoverageView key={`${cls}::${subject}`} course={course} cls={cls} subject={subject} tmlByChapter={tmlByChapter} today={today} onPlan={p => openLesson('new', p)} onToast={toast} />}
          {tab === 'pacing' && <PacingView key={`${cls}::${subject}::${course.plan.termStart}`} course={course} today={today} onToast={toast} />}
          {tab === 'lessons' && <LessonsView course={course} today={today} week={params.get('week')} onWeek={w => go({ week: w })} onOpen={openLesson} />}
        </>
      )}

      {lessonParam && !course.loading && (lessonParam === 'new' || editing) && (
        <LessonEditor key={lessonParam} course={course} cls={cls} subject={subject} lesson={editing} prefill={prefill}
          onClose={closeLesson} onSaved={msg => toast(msg)} />
      )}
      {toastEl}
    </>
  );
}

function WorkspaceSkeleton({ inner = false }: { inner?: boolean }) {
  return (
    <div aria-busy="true">
      {!inner && <PageBar eyebrow="SYLLABUS" title="NCERT Coverage" sub={<Skeleton h={14} w={320} />} />}
      <div className="kpis">{[0, 1, 2, 3].map(i => <div className="kpi" key={i}><Skeleton h={80} /></div>)}</div>
      {[0, 1, 2].map(i => <div className="syl-ch" key={i}><Skeleton h={46} /></div>)}
    </div>
  );
}
