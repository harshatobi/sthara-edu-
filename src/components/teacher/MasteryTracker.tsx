'use client';

import '@/styles/mastery.css';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useGet } from '@/components/canon/useGet';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { normClass, normSubject } from '@/lib/teacher/scope';
import ScopePicker, { useScopeSelection } from './ScopePicker';
import { useTutorAssignments } from './TutorAssign';
import ClassView from './mastery/ClassView';
import StudentView, { type TrendResp } from './mastery/StudentView';

/**
 * Mastery Tracker (rebuilt 2026-11-07). Class view: where the class stands, who is rising or slipping, every student
 * with a 16-week trend, chapter movement. Student view (?student=): mastery over time against the class, then each
 * chapter's drill-down: why it scores what it does (score waterfall over every piece of evidence), what one more
 * result would do (what-if, same engine), and where the student sits in the class.
 */
export default function MasteryTracker() {
  const { desk, error } = useTeacherDesk();
  const { classes, cls, subjects, subject, params, go } = useScopeSelection(desk?.scope ?? []);
  const tutor = useTutorAssignments(cls, subject);
  const trendsPath = desk && cls && subject ? `/api/teacher/mastery?${new URLSearchParams({ class: cls, subject })}` : null;
  const trends = useGet<TrendResp>(trendsPath);

  if (error) return <div className="note err" role="alert">Couldn&apos;t load your classes: {error}</div>;
  if (!desk) {
    return (
      <div aria-busy="true">
        <PageBar eyebrow="MASTERY TRACKER" title="Mastery" sub={<Skeleton h={14} w={300} />} />
        <div className="kpis">{[0, 1, 2, 3].map(i => <div className="kpi" key={i}><Skeleton h={70} /></div>)}</div>
        <div className="card"><Skeleton h={300} /></div>
      </div>
    );
  }
  const roster = desk.classes.find(c => normClass(c.cls) === normClass(cls))?.students ?? [];
  const picker = <ScopePicker classes={classes} cls={cls} subjects={subjects} subject={subject}
    onChange={n => go({ class: n.class ?? cls, subject: n.subject ?? (n.class ? null : subject), student: n.class ? null : params.get('student'), chapter: null })} />;

  if (!classes.length || !roster.length) {
    return (
      <>
        <PageBar eyebrow="MASTERY TRACKER" title="Mastery" actions={picker} />
        <div className="card"><Empty icon={<Warning size={26} weight="duotone" />} title={classes.length ? `No students in ${cls} yet` : 'No classes assigned yet'}>
          {classes.length ? 'Students appear here once they are enrolled in this class.' : 'Your school admin hasn’t linked you to any classes and subjects yet.'}
        </Empty></div>
      </>
    );
  }

  const student = roster.find(s => s.id === params.get('student')) ?? null;
  const evaluated = student ? desk.assignments.filter(a => normClass(a.cls) === normClass(cls) && normSubject(a.subject) === normSubject(subject)
    && a.submissions.some(s => s.studentId === student.id && s.state === 'graded')).length : 0;

  return (
    <>
      <PageBar eyebrow="MASTERY TRACKER" title={student ? student.name : `${cls} ${subject}`}
        sub={student ? 'Mastery over time, with a drill-down for every chapter.' : 'Where the class stands and who is moving.'}
        actions={picker} />
      {trends.error && <div className="note err" role="alert" style={{ marginBottom: 16 }}>Trends couldn&apos;t load: {trends.error}. Current scores are still shown.</div>}
      {student
        ? <StudentView student={student} roster={roster} cls={cls} subject={subject} trends={trends.data} evaluated={evaluated} go={go} chapterKey={params.get('chapter')} tutor={tutor} />
        : <ClassView roster={roster} cls={cls} subject={subject} trends={trends.data} go={go} />}
    </>
  );
}
