'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { ClipboardTextIcon as ClipboardText } from '@phosphor-icons/react/dist/ssr/ClipboardText';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { PaperPlaneTiltIcon as PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { Chip, Empty, PageBar, Skeleton, scoreTone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { subjectColor } from '@/lib/student/shape';
import { typeSummary } from '@/lib/teacher/questions';
import { normClass, scopeClasses } from '@/lib/teacher/scope';
import { dmy, TYPE_CHIP } from '@/lib/teacher/desk';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import Composer from './Composer';
import GradingPanel from './GradingPanel';
import CaptureReview from './capture/CaptureReview';
import CaptureStation from './capture/CaptureStation';
import { CameraIcon as Camera } from '@phosphor-icons/react/dist/ssr/Camera';
import { readCopilotSeed } from './copilot/handoff';

/**
 * Assignment Manager (mockup teacher:hw) and Quiz Creator (teacher:quiz):
 * one board, filtered by kind. State lives in the URL (?class, ?a, ?s, ?new)
 * so the dashboard can deep-link straight to an assignment or a submission.
 */
export default function AssignmentBoard({ kind }: { kind: 'work' | 'quiz' }) {
  const { desk, error, call, reload } = useTeacherDesk();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [toast, toastEl] = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isQuiz = kind === 'quiz';
  const classes = desk ? scopeClasses(desk.scope) : [];
  const cls = params.get('class') || classes[0] || '';
  const selectedId = params.get('a');
  const subId = params.get('s');
  const composing = params.get('new') === '1' ? 'new' : params.get('edit') === '1' ? 'edit' : null;

  const go = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k); else q.set(k, v);
    }
    const s = q.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const list = (desk?.assignments ?? []).filter(a =>
    (isQuiz ? a.type === 'quiz' : a.type !== 'quiz') && (!cls || normClass(a.cls) === normClass(cls)));
  const a = desk?.assignments.find(x => x.id === selectedId) ?? null;
  const klass = desk?.classes.find(c => normClass(c.cls) === normClass(cls));
  const sub = a?.submissions.find(s => s.id === subId) ?? null;

  const eyebrow = isQuiz ? 'QUIZ CREATOR' : 'HOMEWORK';
  const title = isQuiz ? 'Quiz Creator' : 'Assignment Manager';
  const sub$ = klass
    ? `${klass.cls} · ${klass.students.length} student${klass.students.length === 1 ? '' : 's'} · ${isQuiz ? 'multiple-choice quizzes, marked the moment a student submits.' : 'drafts, posted tasks, live submissions and grading in one place.'}`
    : 'Your classes, drafts, posted work and grading in one place.';

  async function act(label: string, fn: () => Promise<unknown>, done: string) {
    setBusy(label); setActionError(null);
    try { await fn(); toast(done); reload(); }
    catch (e: any) { setActionError(e?.message || 'That didn’t work. Try again.'); }
    finally { setBusy(null); setConfirmDelete(false); }
  }

  if (error) return <div className="card"><div className="err" role="alert">Couldn&apos;t load your classes: {error}</div></div>;
  if (!desk) {
    return (
      <div aria-busy="true">
        <PageBar eyebrow={eyebrow} title={title} sub={<Skeleton h={14} w={320} />} />
        <div className="g3">{[0, 1, 2].map(i => <div className="card" key={i}><Skeleton h={120} /></div>)}</div>
      </div>
    );
  }

  // Copilot hand-off: questions it generated, passed through sessionStorage (?seed=copilot).
  const seed = composing === 'new' && params.get('seed') === 'copilot' ? readCopilotSeed() : null;
  const composer = composing && (
    <Composer
      seed={seed}
      kind={kind}
      initial={composing === 'edit' ? a : null}
      defaultClass={cls}
      defaultSubject={params.get('subject') ?? undefined}
      defaultChapter={params.get('chapter') ?? undefined}
      targets={(params.get('for') ?? '').split(',').filter(Boolean)}
      onClose={savedId => go({ new: null, edit: null, subject: null, chapter: null, for: null, seed: null, a: savedId ?? (composing === 'edit' ? selectedId : null), s: null })}
    />
  );

  const classTabs = classes.length > 1 && !a && (
    <div className="tabs" role="tablist" aria-label="Class" style={{ marginBottom: 18 }}>
      {classes.map(c => (
        <button key={c} role="tab" aria-selected={normClass(c) === normClass(cls)} className={`tab${normClass(c) === normClass(cls) ? ' on' : ''}`}
          onClick={() => go({ class: c, a: null, s: null })}>{c}</button>
      ))}
    </div>
  );

  // ── List ────────────────────────────────────────────────────────────────
  if (!a) {
    return (
      <>
        <PageBar eyebrow={eyebrow} title={title} sub={sub$}
          actions={classes.length ? <button className="btn red" onClick={() => go({ new: '1' })}><Plus size={15} weight="bold" /> {isQuiz ? 'New quiz' : 'Assign homework'}</button> : undefined} />
        {classTabs}
        {!classes.length ? (
          <div className="card"><Empty icon={<Warning size={26} weight="duotone" />} title="No classes assigned yet">
            Your school admin hasn&apos;t linked you to any classes and subjects. Once they do, your classes and students appear here.
          </Empty></div>
        ) : list.length ? (
          <div className="g3">
            {list.map(t => {
              const color = subjectColor(t.subject);
              const draft = t.status === 'draft';
              const inCount = t.submissions.length;
              return (
                <div key={t.id} className="card" style={{ borderTop: `4px solid ${color}`, paddingTop: 22, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div className="av" style={{ background: '#F4F7FC', color }}>{isQuiz ? <ClipboardText size={20} weight="duotone" /> : <FileText size={20} weight="duotone" />}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {t.pendingCount > 0 && <Chip tone="r">{t.pendingCount} TO REVIEW</Chip>}
                      <Chip tone={draft ? 'n' : inCount >= t.roster.length && t.roster.length ? 'g' : 'a'}>{draft ? 'DRAFT' : `${inCount}/${t.roster.length} IN`}</Chip>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}><Chip tone="n">{t.subject.toUpperCase()}</Chip>{t.type !== 'homework' && <Chip tone="p">{TYPE_CHIP[t.type]}</Chip>}</div>
                  <h3 style={{ fontSize: 19, fontWeight: 800, margin: '9px 0 6px' }}>{t.title}</h3>
                  {t.chapter && <p className="muted" style={{ fontSize: 13 }}>{t.chapter}</p>}
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                    {t.questions.length} question{t.questions.length === 1 ? '' : 's'} · {typeSummary(t.questions)}{t.mode === 'handwritten' ? ' · photo of written work' : ''}{t.proctored ? ' · proctored' : ''}
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)', marginTop: 18, paddingTop: 16 }}>
                    <div><div className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em' }}>DUE</div><div style={{ fontWeight: 800, fontSize: 16 }}>{dmy(t.dueAt)}</div></div>
                    <button className="btn pri" onClick={() => go({ a: t.id })}>Open <ArrowRight size={14} weight="bold" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card"><Empty icon={isQuiz ? <ClipboardText size={26} weight="duotone" /> : <FileText size={26} weight="duotone" />} title={isQuiz ? `No quizzes for ${cls} yet` : `No assignments for ${cls} yet`}>
            Use <b>{isQuiz ? '+ New quiz' : '+ Assign homework'}</b> to write one by hand or generate it from a chapter.
          </Empty></div>
        )}
        {composer}
        {toastEl}
      </>
    );
  }

  // ── Detail ──────────────────────────────────────────────────────────────
  const done = new Set(a.submissions.map(s => s.studentId));
  const notDone = a.roster.filter(s => !done.has(s.id));
  const draft = a.status === 'draft';
  const canUnpost = !draft && a.submissions.length === 0;
  const canDelete = a.submissions.length === 0;

  return (
    <>
      <PageBar eyebrow={eyebrow} title={title} sub={`${a.cls} · ${a.roster.length} student${a.roster.length === 1 ? '' : 's'} · ${a.subject}`}
        actions={<button className="btn" onClick={() => go({ a: null, s: null, class: a.cls })}><ArrowLeft size={14} weight="bold" /> All {isQuiz ? 'quizzes' : 'assignments'}</button>} />
      <div className="card" style={{ padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Chip tone="n">{TYPE_CHIP[a.type]}</Chip>
              <Chip tone={draft ? 'n' : 'b'}>{draft ? 'DRAFT — NOT VISIBLE TO STUDENTS' : 'POSTED'}</Chip>
              {a.proctored && <Chip tone="g"><ShieldCheck size={12} weight="bold" /> PROCTORED</Chip>}
            </div>
            <h2 style={{ fontSize: 30, fontWeight: 800, margin: '10px 0 4px' }}>{a.title}</h2>
            <div className="muted">Due {dmy(a.dueAt)} · {a.questions.length} question{a.questions.length === 1 ? '' : 's'} · {typeSummary(a.questions)}{a.totalMarks ? ` · ${a.totalMarks} marks` : ''}</div>
            {a.chapter && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Chapter: {a.chapter}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
            <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: '14px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--red)' }}>{a.submissions.length}<span style={{ color: 'var(--mut2)', fontSize: 18 }}>/{a.roster.length}</span></div>
              <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em' }}>SUBMITTED</div>
            </div>
            {!sub && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {!draft && a.roster.length > 0 && <button className="btn red" onClick={() => go({ capture: '1' })}><Camera size={15} weight="fill" /> Capture notebooks</button>}
                <button className="btn" onClick={() => go({ edit: '1' })}><PencilSimple size={14} weight="bold" /> Edit</button>
                {canUnpost && <button className="btn" disabled={!!busy} onClick={() => act('unpost', () => call('/api/teacher/assignments', 'PATCH', { id: a.id, status: 'draft' }), 'Withdrawn to draft')}>{busy === 'unpost' ? 'Withdrawing…' : 'Withdraw to draft'}</button>}
                {canDelete && !confirmDelete && <button className="btn" onClick={() => setConfirmDelete(true)}><Trash size={14} weight="bold" /> Delete</button>}
                {confirmDelete && (
                  <>
                    <button className="btn red" disabled={!!busy} onClick={() => act('delete', async () => { await call('/api/teacher/assignments', 'DELETE', { id: a.id }); go({ a: null, class: a.cls }); }, 'Deleted')}>{busy === 'delete' ? 'Deleting…' : 'Confirm delete'}</button>
                    <button className="btn" onClick={() => setConfirmDelete(false)}>Keep it</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {actionError && <div className="err" role="alert" style={{ marginBottom: 16 }}>{actionError}</div>}

        {sub ? (
          sub.kind === 'handwritten'
            ? <CaptureReview key={sub.id} a={a} sub={sub} onPick={id => go({ s: id })} onBack={() => go({ s: null })} />
            : <GradingPanel key={sub.id} a={a} sub={sub} onPick={id => go({ s: id })} onBack={() => go({ s: null })} />
        ) : (
          <>
            {draft && (
              <div className="note" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span>This is a draft. Students in {a.cls} can&apos;t see it yet.{!a.dueAt ? ' Set a due date before posting.' : ''}</span>
                <button className="btn red" disabled={!!busy} onClick={() => act('post', () => call('/api/teacher/assignments', 'PATCH', { id: a.id, status: 'published' }), `Posted to ${a.cls}`)}>
                  <PaperPlaneTilt size={15} weight="fill" /> {busy === 'post' ? 'Posting…' : `Post to ${a.cls}`}
                </button>
              </div>
            )}
            <div className="g2" style={{ gap: 24 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)', fontWeight: 800, fontSize: 16, borderBottom: '1px solid #BBF7D0', paddingBottom: 10, marginBottom: 6 }}>
                  <CheckCircle size={18} weight="fill" /> Completed ({a.submissions.length})
                </div>
                {a.submissions.length ? a.submissions.map(s => (
                  <button key={s.id} className="row" style={{ padding: '10px 0' }} onClick={() => go({ s: s.id })} title="Open submission">
                    <div className="av" style={{ width: 30, height: 30, flex: '0 0 30px', background: '#DCFCE7', color: 'var(--green)' }}><CheckCircle size={15} weight="bold" /></div>
                    <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{s.studentName}<div className="muted" style={{ fontSize: 11.5, fontWeight: 500 }}>Submitted {dmy(s.submittedAt)}</div></div>
                    {s.state === 'graded' && s.score !== null && s.max
                      ? <Chip tone={scoreTone(s.score, s.max)}>{s.score}/{s.max}</Chip>
                      : <Chip tone="a">TO REVIEW</Chip>}
                  </button>
                )) : <p className="muted" style={{ fontSize: 13, paddingTop: 8 }}>{draft ? 'Post it to start collecting submissions.' : 'No submissions yet.'}</p>}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--amber)', fontWeight: 800, fontSize: 16, borderBottom: '1px solid #FDE68A', paddingBottom: 10, marginBottom: 6 }}>
                  <Warning size={18} weight="fill" /> Not completed ({notDone.length})
                </div>
                {notDone.length ? notDone.map(s => (
                  <div key={s.id} className="row" style={{ padding: '10px 0' }}>
                    <div className="av" style={{ width: 30, height: 30, flex: '0 0 30px', fontSize: 11, background: '#FEF3C7', color: '#92600A' }}>{s.name.charAt(0)}</div>
                    <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{s.name}{s.rollNo && <span className="muted mono" style={{ fontSize: 11, marginLeft: 8 }}>{s.rollNo}</span>}</div>
                  </div>
                )) : <p className="muted" style={{ fontSize: 13, paddingTop: 8 }}>{a.roster.length ? 'Everyone has submitted.' : `No students in ${a.cls} yet.`}</p>}
              </div>
            </div>

            <div style={{ marginTop: 28 }}>
              <b style={{ fontSize: 12.5, letterSpacing: '.06em', color: 'var(--mut)' }}>QUESTIONS</b>
              {a.description && <p style={{ fontSize: 13.5, marginTop: 8, color: 'var(--mut)' }}>{a.description}</p>}
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {a.questions.map((q, i) => (
                  <div key={i} style={{ padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 12 }}>
                    <div className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', marginBottom: 5 }}>Q{i + 1} · {q.type === 'mcq' ? 'MULTIPLE CHOICE' : q.type === 'upload' ? 'PHOTO ANSWER' : 'WRITTEN'} · {q.marks} MARK{q.marks === 1 ? '' : 'S'}</div>
                    <div style={{ fontSize: 14, lineHeight: 1.5 }}>{q.questionText}</div>
                    {q.type === 'mcq' && (
                      <div style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: 13 }}>
                        {q.options?.map((o, oi) => (
                          <div key={oi} style={{ color: oi === q.answer ? 'var(--green)' : 'var(--mut)', fontWeight: oi === q.answer ? 700 : 500 }}>{'ABCDEF'[oi]}. {o}{oi === q.answer ? ' (correct)' : ''}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {!a.questions.length && <p className="muted" style={{ fontSize: 13 }}>No questions yet. Use Edit to add some.</p>}
              </div>
            </div>
          </>
        )}
      </div>
      {composer}
      {params.get('capture') === '1' && !draft && (
        <CaptureStation a={a} onClose={() => go({ capture: null })} onReview={id => go({ capture: null, s: id })} />
      )}
      {toastEl}
    </>
  );
}
