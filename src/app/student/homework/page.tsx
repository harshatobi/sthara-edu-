'use client';

import { Suspense, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import InteractiveIcon from '@/components/ui/InteractiveIcon';
import { colorForIcon } from '@/lib/iconColors';
import { subjectIcon } from '@/components/canon/subjectIcon';
import { Chip, Empty, PageBar, Skeleton, scoreTone } from '@/components/canon/ui';
import DemoNote from '@/components/canon/DemoNote';
import { useStudentDesk } from '@/lib/student/useStudentDesk';
import { dmy, dueIn, openAssignments } from '@/lib/student/shape';
import type { DeskAssignment, QuestionType } from '@/lib/student/types';
import ReportOverlay from './ReportOverlay';

const Q_LABEL: Record<QuestionType, string> = { short: 'short answer', mcq: 'multiple choice', upload: 'upload' };
function qTypeSummary(types: QuestionType[]) {
  const n: Partial<Record<QuestionType, number>> = {};
  types.forEach(t => { n[t] = (n[t] || 0) + 1; });
  return (Object.entries(n) as [QuestionType, number][]).map(([t, c]) => `${c} ${Q_LABEL[t]}`).join(' · ');
}
const ts = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

export default function HomeworkPage() {
  return <Suspense fallback={<HomeworkSkeleton />}><Homework /></Suspense>;
}

function Homework() {
  const { desk, error } = useStudentDesk();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get('tab') === 'done' ? 'done' : 'todo';
  const reportId = params.get('report');

  // Tab + open report live in the URL, so the dashboard can deep-link and Back works.
  const setParams = useCallback((next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    Object.entries(next).forEach(([k, v]) => (v === null ? p.delete(k) : p.set(k, v)));
    router.replace(`${pathname}${p.size ? `?${p}` : ''}`, { scroll: false });
  }, [params, pathname, router]);
  const closeReport = useCallback(() => setParams({ report: null }), [setParams]);

  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!desk) return <HomeworkSkeleton />;

  const open = openAssignments(desk.assignments);
  const done = desk.assignments
    .filter(a => a.status !== 'open')
    .sort((a, b) => ts(b.submission?.submittedAt) - ts(a.submission?.submittedAt));
  const report = reportId ? desk.assignments.find(a => a.id === reportId && a.status === 'graded') : undefined;

  return (
    <>
      {desk.mode === 'demo' && <DemoNote />}
      <PageBar
        eyebrow="HOMEWORK"
        title="Assignments"
        sub="Posted by your teachers. We keep a light camera check running during timed submissions, just to keep things fair."
        actions={<Chip tone="g"><ShieldCheck size={13} weight="fill" /> Fair-play checks on timed work</Chip>}
      />

      <div className="tabs" role="tablist" aria-label="Homework">
        <button role="tab" aria-selected={tab === 'todo'} className={`tab${tab === 'todo' ? ' on blue' : ''}`} onClick={() => setParams({ tab: null })}>
          To-Do ({open.length})
        </button>
        <button role="tab" aria-selected={tab === 'done'} className={`tab${tab === 'done' ? ' on blue' : ''}`} onClick={() => setParams({ tab: 'done' })}>
          Completed ({done.length})
        </button>
      </div>

      {tab === 'todo' ? (
        open.length ? (
          <div className="g3">{open.map(a => <TodoCard key={a.id} a={a} />)}</div>
        ) : (
          <div className="card">
            <Empty icon={<InteractiveIcon icon={CheckCircle} color={colorForIcon(CheckCircle)} size={32} active />} title="Nothing outstanding">
              Every assignment posted to {desk.me.cls ? `Class ${desk.me.cls}` : 'your class'} has been submitted.
            </Empty>
          </div>
        )
      ) : done.length ? (
        <div className="card" style={{ padding: '10px 26px' }}>
          {done.map(a => <DoneRow key={a.id} a={a} onOpen={() => setParams({ report: a.id })} />)}
        </div>
      ) : (
        <div className="card">
          <Empty icon={<InteractiveIcon icon={FileText} color={colorForIcon(FileText)} size={32} active />} title="Nothing submitted yet">
            Work you hand in shows up here, with your grade and feedback once it&apos;s reviewed.
          </Empty>
        </div>
      )}

      {report && <ReportOverlay a={report} live={desk.mode === 'live'} onClose={closeReport} />}
    </>
  );
}

function TodoCard({ a }: { a: DeskAssignment }) {
  const due = dueIn(a.dueAt);
  const overdue = due.text.startsWith('Overdue');
  return (
    <div className="card" style={{ borderTop: `4px solid ${a.color}`, paddingTop: 22, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div className="av" style={{ background: `color-mix(in srgb, ${a.color} 10%, #fff)` }}><InteractiveIcon icon={subjectIcon(a.subject)} color={a.color} size={19} /></div>
        <Chip tone={due.tone}>{due.text.toUpperCase()}</Chip>
      </div>
      <div><Chip tone="n" className="xs">{a.subject}</Chip></div>
      <h3 style={{ fontSize: 19, fontWeight: 800, margin: '9px 0 6px' }}>{a.title}</h3>
      {a.desc && <p className="muted">{a.desc}</p>}
      {a.questionTypes.length > 0 && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
          {a.questionTypes.length} question{a.questionTypes.length === 1 ? '' : 's'} · {qTypeSummary(a.questionTypes)}
          {a.proctored ? ' · proctored' : ''}
        </div>
      )}
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)', marginTop: 18, paddingTop: 16 }}>
        <div>
          <div className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em' }}>DUE</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: overdue ? 'var(--red)' : undefined }}>{a.dueAt ? dmy(a.dueAt) : 'No date'}</div>
        </div>
        <Link className="btn pri" href={`/student/homework/${a.id}`}>Open <ArrowRight size={15} weight="bold" /></Link>
      </div>
    </div>
  );
}

function DoneRow({ a, onOpen }: { a: DeskAssignment; onOpen: () => void }) {
  const s = a.submission!;
  const graded = a.status === 'graded';
  return (
    <div className="row">
      <div className="av" style={{ background: `color-mix(in srgb, ${a.color} 10%, #fff)` }}><InteractiveIcon icon={subjectIcon(a.subject)} color={a.color} size={18} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>{a.title}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{a.subject} · {graded ? 'Graded' : 'Submitted'} {dmy(s.submittedAt)}</div>
      </div>
      <Chip tone={graded ? scoreTone(s.score ?? 0, s.total ?? 0) : 'b'} title={graded ? undefined : 'Your teacher reviews the AI grade before it counts'}>
        <span style={{ minWidth: 52, textAlign: 'center' }}>{graded ? `${s.score}/${s.total}` : 'AWAITING'}</span>
      </Chip>
      {graded
        ? <button className="btn" onClick={onOpen}>View report</button>
        : <button className="btn" disabled>Teacher review pending</button>}
    </div>
  );
}

function HomeworkSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading homework">
      <Skeleton h={104} style={{ borderRadius: 20, marginBottom: 22 }} />
      <Skeleton h={54} w={300} style={{ borderRadius: 14, marginBottom: 20 }} />
      <div className="g3"><Skeleton h={300} style={{ borderRadius: 20 }} /><Skeleton h={300} style={{ borderRadius: 20 }} /><Skeleton h={300} style={{ borderRadius: 20 }} /></div>
    </div>
  );
}
