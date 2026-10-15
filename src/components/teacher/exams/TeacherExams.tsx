'use client';

import { useState } from 'react';
import { ExamIcon as Exam } from '@phosphor-icons/react/dist/ssr/Exam';
import { StudentIcon } from '@phosphor-icons/react/dist/ssr/Student';
import { Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { CardHead } from '@/components/admin/kit';
import { fmtDate } from '@/lib/admin/format';
import { useApi } from '@/lib/exams/useApi';
import SheetView from './SheetView';
import ReviewView from './ReviewView';
import '@/styles/exams.css';
import '@/styles/schedule.css';
import '@/styles/people.css';

interface MySheet {
  id: string; status: 'open' | 'submitted' | 'locked'; code: string; assessment: string; term: string; termSeq: number; heldFrom: string | null; heldTo: string | null;
  subject: string; cls: string; maxMarks: number; returnedNote: string | null; reopenedReason: string | null; marked: number; of: number;
}
export interface MyExams {
  session: string; today: string; me: { id: string; name: string; manage: boolean };
  sheets: MySheet[];
  myClass: { id: string; name: string; scheme: { id: string; name: string; coScholastic: { key: string; name: string }[]; coGrades: string[] } | null; terms: { id: string; name: string; seq: number; status: 'open' | 'reviewed' | 'published'; version: number; reopenReason: string | null }[] } | null;
}

const ST = { open: ['TO ENTER', 'a'], submitted: ['SUBMITTED', 'b'], locked: ['PUBLISHED', 'g'] } as const;
const CT = { open: ['IN PROGRESS', 'n'], reviewed: ['REVIEWED', 'b'], published: ['PUBLISHED', 'g'] } as const;

/** A teacher's exams: the marks sheets for what they teach, and (class teachers) their class's review. */
export default function TeacherExams() {
  const { data, error, reload, call } = useApi<MyExams>('/api/teacher/exams');
  const [toast, toastEl] = useToast(3600);
  const [sheet, setSheet] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const todo = data?.sheets.filter(s => s.status === 'open') ?? [];
  const done = data?.sheets.filter(s => s.status !== 'open') ?? [];
  const terms = [...new Set((showDone ? data?.sheets ?? [] : todo).map(s => s.term))];
  return (
    <>
      {toastEl}
      <PageBar eyebrow="EXAMS" title="Marks and report cards" sub="Enter and submit marks for the subjects you teach. Class teachers check their class, add remarks and co-scholastic grades, and mark it reviewed for the principal." />
      {error ? <div className="note err" role="alert">Couldn&apos;t load your exams: {error}</div> : !data ? <div className="card" aria-busy="true">{[0, 1, 2].map(i => <Skeleton key={i} h={50} style={{ marginBottom: 12 }} />)}</div> : <>
        {data.myClass && (
          <div className="card" style={{ marginBottom: 18 }}>
            <CardHead title={`My class: ${data.myClass.name}`} sub={data.myClass.scheme ? data.myClass.scheme.name : 'No assessment scheme covers this class yet. The exam cell sets it up.'} />
            {data.myClass.terms.map(t => (
              <div key={t.id} className="ex-row">
                <div className="grow"><div className="t">{t.name}</div>{t.reopenReason && t.status !== 'published' && <div className="s">Reopened: {t.reopenReason}</div>}</div>
                <span className={`ex-pill ${CT[t.status][1]}`}>{CT[t.status][0]}{t.version > 1 ? ` v${t.version}` : ''}</span>
                <button className="btn sm" onClick={() => setReview(t.id)}><StudentIcon size={14} weight="bold" /> {t.status === 'open' ? 'Review the class' : 'Open'}</button>
              </div>
            ))}
          </div>
        )}
        <div className="card">
          <CardHead title="My marks sheets" sub={todo.length ? `${todo.length} to enter or finish` : 'Nothing waiting for you.'}
            right={done.length > 0 && <label className="ex-chk"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />Show submitted and published</label>} />
          {!data.sheets.length ? <Empty icon={<Exam size={26} weight="duotone" />} title="No marks sheets yet">When the exam cell opens marks entry for an assessment, a sheet appears here for each class and subject you teach.</Empty>
            : !terms.length ? <Empty icon={<Exam size={26} weight="duotone" />} title="All done">Every sheet you have is submitted.</Empty>
              : terms.map(term => (
                <div key={term} style={{ marginBottom: 10 }}>
                  <div className="muted" style={{ fontWeight: 800, fontSize: 11, letterSpacing: '.1em', margin: '8px 0 2px' }}>{term.toUpperCase()}</div>
                  {(showDone ? data.sheets : todo).filter(s => s.term === term).map(s => (
                    <div key={s.id} className="ex-row hr-row" role="button" tabIndex={0} onClick={() => setSheet(s.id)} onKeyDown={e => { if (e.key === 'Enter') setSheet(s.id); }}>
                      <div className="grow">
                        <div className="t">{s.cls} · {s.subject}</div>
                        <div className="s">{s.code} {s.assessment}, out of {s.maxMarks}{s.heldFrom ? ` · ${fmtDate(s.heldFrom, true)}` : ''}</div>
                        {s.returnedNote && <div className="s" style={{ color: 'var(--red)' }}>Sent back: {s.returnedNote}</div>}
                        {s.reopenedReason && <div className="s" style={{ color: '#9A6B00' }}>Reopened: {s.reopenedReason}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="ex-meter" style={{ width: 80 }}><i style={{ width: `${s.of ? (s.marked / s.of) * 100 : 0}%` }} /></div><span className="muted">{s.marked}/{s.of}</span></div>
                      <span className={`ex-pill ${ST[s.status][1]}`}>{ST[s.status][0]}</span>
                    </div>
                  ))}
                </div>
              ))}
        </div>
      </>}
      {sheet && <SheetView id={sheet} call={call} toast={toast} onChanged={reload} onClose={() => setSheet(null)} />}
      {review && data?.myClass && <ReviewView termId={review} myClass={data.myClass} call={call} toast={toast} onChanged={reload} onClose={() => setReview(null)} />}
    </>
  );
}
