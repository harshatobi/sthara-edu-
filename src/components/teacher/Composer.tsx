'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { PaperPlaneTiltIcon as PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { LockSimpleIcon as LockSimple } from '@phosphor-icons/react/dist/ssr/LockSimple';
import { courseChapters, getCurriculum } from '@/lib/curriculum';
import { blankQuestion, fromGenerated, sanitizeQuestions, totalMarks, TYPE_LABEL, type QType, type Question } from '@/lib/teacher/questions';
import { scopeClasses, subjectsIn } from '@/lib/teacher/scope';
import type { TAssignment, WorkType } from '@/lib/teacher/desk';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';

const LETTERS = 'ABCDEF';
const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/**
 * Full-screen composer (mockup renderComposer / Quiz Creator): details,
 * chapter + topic from the official curriculum, an editable question list
 * (manual or AI-generated), then save as draft or post to the class.
 * `kind` 'quiz' fixes the type to QUIZ and questions to multiple choice.
 */
export default function Composer({ kind, initial, defaultClass, defaultSubject, defaultChapter, targets = [], seed, onClose }: {
  kind: 'work' | 'quiz';
  initial?: TAssignment | null;
  defaultClass?: string;
  defaultSubject?: string;
  defaultChapter?: string;
  /** Set only for these students (e.g. remedial for those below 40%); empty = whole class. */
  targets?: string[];
  /** Starting content handed over from the Copilot. */
  seed?: { title?: string; description?: string; questions?: Question[] } | null;
  onClose: (savedId?: string) => void;
}) {
  const { desk, call, reload } = useTeacherDesk();
  const scope = desk?.scope ?? [];
  const classes = scopeClasses(scope);
  const isQuiz = kind === 'quiz';
  const locked = !!initial && initial.submissions.length > 0;

  const [title, setTitle] = useState(initial?.title ?? seed?.title ?? '');
  const [cls, setCls] = useState(initial?.cls ?? defaultClass ?? classes[0] ?? '');
  const subjectOptions = subjectsIn(scope, cls);
  const startSubjects = subjectsIn(scope, initial?.cls ?? defaultClass ?? classes[0] ?? '');
  const [subject, setSubject] = useState(initial?.subject
    ?? startSubjects.find(s => s.toLowerCase() === defaultSubject?.toLowerCase()) ?? startSubjects[0] ?? '');
  const [type, setType] = useState<WorkType>(initial?.type ?? (isQuiz ? 'quiz' : 'homework'));
  const [due, setDue] = useState(initial?.dueAt ?? '');
  const [chapter, setChapter] = useState(initial?.chapter ?? defaultChapter ?? '');
  const targetStudents = (desk?.classes.flatMap(c => c.students) ?? []).filter(s => targets.includes(s.id));
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<'typed' | 'handwritten'>(initial?.mode ?? 'typed');
  const [proctored, setProctored] = useState(initial?.proctored ?? isQuiz);
  const [description, setDescription] = useState(initial?.description ?? seed?.description ?? '');
  const [questions, setQuestions] = useState<Question[]>(initial?.questions ?? (isQuiz ? seed?.questions?.filter(q => q.type === 'mcq') : seed?.questions) ?? []);
  const [genCount, setGenCount] = useState(isQuiz ? 5 : 4);
  const [generating, setGenerating] = useState(false);
  const [generatedNote, setGeneratedNote] = useState<string | null>(seed?.questions?.length ? `${seed.questions.length} question${seed.questions.length === 1 ? '' : 's'} from the Copilot. Check each one and its answer before posting.` : null);
  const [saving, setSaving] = useState<null | 'draft' | 'published'>(null);
  const [error, setError] = useState<string | null>(null);

  const curriculum = useMemo(() => getCurriculum(cls, subject), [cls, subject]);
  const chapters = useMemo(() => (curriculum ? courseChapters(curriculum) : []), [curriculum]);
  const chapterTopics = chapters.find(c => c.name === chapter)?.topics ?? [];

  const pickClass = (next: string) => {
    setCls(next);
    const subs = subjectsIn(scope, next);
    if (!subs.some(s => s.toLowerCase() === subject.toLowerCase())) setSubject(subs[0] ?? '');
    setChapter(''); setTopic('');
  };

  const setQ = (i: number, patch: Partial<Question>) => setQuestions(qs => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const addQ = (t: QType) => setQuestions(qs => [...qs, blankQuestion(t)]);
  const delQ = (i: number) => setQuestions(qs => qs.filter((_, j) => j !== i));

  async function generate() {
    const focus = topic || chapter;
    if (!focus) { setError('Pick a chapter (and a topic if you like) to generate from.'); return; }
    setError(null); setGenerating(true); setGeneratedNote(null);
    try {
      const raw = isQuiz
        ? await call('/api/teacher/quiz-gen', 'POST', { topics: [focus], subject, className: cls, numQuestions: genCount, difficulty: 'mixed' })
        : await call('/api/teacher/homework-gen', 'POST', { topic: focus, subject, studentClass: cls, numQuestions: genCount, questionType: mode === 'typed' ? 'mixed' : 'short' });
      const got = fromGenerated(raw).filter(q => !isQuiz || q.type === 'mcq');
      if (!got.length) throw new Error('The generator returned nothing usable. Try again, or add questions by hand.');
      setQuestions(qs => [...qs, ...got]);
      if (!title) setTitle(isQuiz ? `${focus} — Quiz` : focus);
      setGeneratedNote(`Added ${got.length} AI-drafted question${got.length === 1 ? '' : 's'} on ${focus}. Check each one and its answer before posting.`);
    } catch (e: any) {
      setError(e?.message || 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  }

  async function save(status: 'draft' | 'published') {
    setError(null);
    if (!title.trim()) { setError('Give it a title.'); return; }
    if (!locked) {
      const { error: qErr } = sanitizeQuestions(questions);
      if (qErr) { setError(qErr); return; }
      if (status === 'published' && !questions.length) { setError('Add at least one question before posting.'); return; }
      if (isQuiz && questions.some(q => q.type !== 'mcq')) { setError('Quizzes are multiple choice only.'); return; }
    }
    if (status === 'published' && !due) { setError('Set a due date before posting.'); return; }
    setSaving(status);
    try {
      const body: Record<string, unknown> = { title, dueDate: due || null, description, status };
      if (!locked) Object.assign(body, { type, class: cls, subject, chapter: chapter || null, questions, submissionMode: isQuiz ? 'typed' : mode, proctored });
      if (!initial && targetStudents.length) body.assignedStudentIds = targetStudents.map(s => s.id);
      const saved = initial
        ? await call('/api/teacher/assignments', 'PATCH', { id: initial.id, ...body })
        : await call('/api/teacher/assignments', 'POST', body);
      reload();
      onClose(saved?.id);
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
    } finally {
      setSaving(null);
    }
  }

  const heading = initial ? `Edit ${isQuiz ? 'quiz' : 'assignment'}` : isQuiz ? 'New quiz' : 'New assignment';
  const marks = totalMarks(questions);

  return (
    <div className="ws" role="dialog" aria-modal="true" aria-labelledby="cmp-title">
      <div className="ws-head">
        <button className="ws-back" onClick={() => onClose()}><ArrowLeft size={15} weight="bold" /> Cancel</button>
        <div><h1 id="cmp-title">{heading}</h1><div className="sub">{cls || 'No class'}{subject ? ` · ${subject}` : ''} · {desk?.me.name}</div></div>
      </div>
      <div className="ws-body"><div className="cmp">
        {!classes.length && (
          <div className="err" style={{ marginBottom: 18 }}>You don&apos;t have any classes assigned yet, so there&apos;s nowhere to post this. Ask your school admin to add your classes and subjects.</div>
        )}
        {locked && (
          <div className="note" style={{ marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
            <LockSimple size={16} weight="bold" /> {initial!.submissions.length} student{initial!.submissions.length === 1 ? ' has' : 's have'} submitted, so the questions, class and type are locked. You can still change the title, description and due date.
          </div>
        )}

        {!initial && targetStudents.length > 0 && (
          <div className="note info" style={{ marginBottom: 18 }}>
            Only for {targetStudents.map(s => s.name).join(', ')}. The rest of {cls} won&apos;t see it.
          </div>
        )}
        <div className="card">
          <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 18 }}>Details</h3>
          <div className="g2" style={{ gap: 16 }}>
            <div className="cmp-fld"><label htmlFor="c-title">TITLE</label>
              <input id="c-title" className="cmp-in" value={title} maxLength={200} placeholder={isQuiz ? 'e.g. Quadratic Equations — Quiz 1' : 'e.g. Quadratic Equations — Level 3'} onChange={e => setTitle(e.target.value)} /></div>
            <div className="cmp-fld"><label htmlFor="c-due">DUE DATE</label>
              <input id="c-due" type="date" className="cmp-in" value={due} min={initial ? undefined : todayISO()} onChange={e => setDue(e.target.value)} /></div>
          </div>
          <div className="g2" style={{ gap: 16 }}>
            <div className="cmp-fld"><label htmlFor="c-class">CLASS</label>
              <select id="c-class" className="cmp-sel" value={cls} disabled={locked || !classes.length} onChange={e => pickClass(e.target.value)}>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div className="cmp-fld"><label htmlFor="c-subject">SUBJECT</label>
              {subjectOptions.length
                ? <select id="c-subject" className="cmp-sel" value={subject} disabled={locked} onChange={e => { setSubject(e.target.value); setChapter(''); setTopic(''); }}>
                    {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                : <input id="c-subject" className="cmp-in" value={subject} disabled={locked} placeholder="Subject" onChange={e => setSubject(e.target.value)} />}
            </div>
          </div>
          <div className="g2" style={{ gap: 16 }}>
            <div className="cmp-fld"><label htmlFor="c-type">TYPE</label>
              {isQuiz
                ? <input id="c-type" className="cmp-in" value="QUIZ · multiple choice, marked instantly" disabled />
                : <select id="c-type" className="cmp-sel" value={type} disabled={locked} onChange={e => setType(e.target.value as WorkType)}>
                    <option value="homework">HOMEWORK</option><option value="classwork">CLASSWORK</option>
                  </select>}
            </div>
            <div className="cmp-fld"><label htmlFor="c-chapter">CHAPTER (TML topic)</label>
              {chapters.length
                ? <select id="c-chapter" className="cmp-sel" value={chapter} disabled={locked} onChange={e => { setChapter(e.target.value); setTopic(''); }}>
                    <option value="">— Select chapter —</option>
                    {chapters.map(c => <option key={c.name} value={c.name}>{c.seq}. {c.name}</option>)}
                  </select>
                : <input id="c-chapter" className="cmp-in" value={chapter} disabled={locked} maxLength={200} placeholder="Chapter name" onChange={e => setChapter(e.target.value)} />}
            </div>
          </div>
          <div className="g2" style={{ gap: 16 }}>
            <div className="cmp-fld"><label htmlFor="c-topic">TOPIC (for AI generation)</label>
              <select id="c-topic" className="cmp-sel" value={topic} disabled={locked || !chapterTopics.length} onChange={e => setTopic(e.target.value)}>
                <option value="">{chapterTopics.length ? '— Whole chapter —' : chapter ? '— Whole chapter —' : '— Select a chapter first —'}</option>
                {chapterTopics.map(t => <option key={t} value={t}>{t.length > 90 ? `${t.slice(0, 90)}…` : t}</option>)}
              </select></div>
            {!isQuiz && (
              <div className="cmp-fld"><label>HOW STUDENTS ANSWER</label>
                <div className="seg" role="group" aria-label="How students answer">
                  <button type="button" className={mode === 'typed' ? 'on' : ''} disabled={locked} onClick={() => setMode('typed')}>Typed in the app</button>
                  <button type="button" className={mode === 'handwritten' ? 'on' : ''} disabled={locked} onClick={() => setMode('handwritten')}>Photo of written work</button>
                </div></div>
            )}
          </div>
          <div className="cmp-fld"><label htmlFor="c-desc">INSTRUCTIONS FOR STUDENTS (optional)</label>
            <textarea id="c-desc" className="cmp-in" value={description} maxLength={2000} placeholder="What to do, what to show, anything to watch out for" onChange={e => setDescription(e.target.value)} /></div>
          <label className="cmp-opt" style={{ cursor: locked ? 'default' : 'pointer', fontSize: 14 }}>
            <input type="checkbox" checked={proctored} disabled={locked} onChange={e => setProctored(e.target.checked)} />
            Proctored: flag tab switches, and auto-submit after 3
          </label>
        </div>

        <div className="card" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800 }}>Questions ({questions.length}){questions.length ? <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}> · {marks} mark{marks === 1 ? '' : 's'}</span> : null}</h3>
            {!locked && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!isQuiz && <button className="btn" onClick={() => addQ('short')}><Plus size={14} weight="bold" /> Short answer</button>}
                <button className="btn" onClick={() => addQ('mcq')}><Plus size={14} weight="bold" /> Multiple choice</button>
                {!isQuiz && mode === 'typed' && <button className="btn" onClick={() => addQ('upload')}><Plus size={14} weight="bold" /> Photo answer</button>}
              </div>
            )}
          </div>
          {!locked && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <button className="btn red" disabled={generating || (!chapter && !topic)} onClick={generate}>
                <Sparkle size={15} weight="fill" /> {generating ? 'Generating…' : `Generate ${genCount} with AI`}
              </button>
              <select className="cmp-sel" style={{ width: 'auto' }} aria-label="How many questions to generate" value={genCount} onChange={e => setGenCount(Number(e.target.value))}>
                {[3, 4, 5, 8, 10].map(n => <option key={n} value={n}>{n} questions</option>)}
              </select>
              {!chapter && !topic && <span className="muted" style={{ fontSize: 12.5 }}>Pick a chapter to generate from it.</span>}
            </div>
          )}
          {generatedNote && <div className="note info" style={{ marginBottom: 14 }}>{generatedNote}</div>}
          {mode === 'handwritten' && !isQuiz && (
            <div className="note" style={{ marginBottom: 14 }}>Students photograph their written work for all questions together. The AI suggests a mark; you confirm it before it counts toward TML.</div>
          )}

          {questions.length ? questions.map((q, i) => (
            <div className="cmp-q" key={i}>
              <div className="hd">
                <b>Q{i + 1} · {TYPE_LABEL[q.type]}{q.level ? ` · ${q.level}` : ''}</b>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {q.type !== 'mcq' && (
                    <label className="stepper" title="Marks for this question">
                      <input className="cmp-in cmp-marks" type="number" min={1} max={100} value={q.marks} disabled={locked}
                        onChange={e => setQ(i, { marks: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} />
                      <span className="of">marks</span>
                    </label>
                  )}
                  {!locked && <button className="btn sm" onClick={() => delQ(i)} aria-label={`Remove question ${i + 1}`}><Trash size={13} weight="bold" /> Remove</button>}
                </div>
              </div>
              <textarea className="cmp-in" rows={2} value={q.questionText} disabled={locked} maxLength={2000} placeholder="Question"
                onChange={e => setQ(i, { questionText: e.target.value })} />
              {q.type === 'mcq' && (
                <div className="cmp-opts">
                  {(q.options ?? []).map((o, oi) => (
                    <div key={oi} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                      <button type="button" className={`cmp-opt${q.answer === oi ? ' ok' : ''}`} style={{ flex: '0 0 auto' }} disabled={locked}
                        title="Mark as the correct answer" aria-pressed={q.answer === oi} onClick={() => setQ(i, { answer: oi })}>
                        <b>{q.answer === oi ? <Check size={11} weight="bold" /> : LETTERS[oi]}</b>
                      </button>
                      <input className="cmp-in" value={o} disabled={locked} maxLength={500} placeholder={`Option ${LETTERS[oi]}`}
                        onChange={e => setQ(i, { options: (q.options ?? []).map((x, xi) => (xi === oi ? e.target.value : x)) })} />
                    </div>
                  ))}
                  <div className="muted" style={{ fontSize: 11.5 }}>Click a letter to mark the correct answer. Multiple choice is marked instantly when the student submits.</div>
                  {q.why && <div className="muted" style={{ fontSize: 12.5 }}><b>Why:</b> {q.why}</div>}
                </div>
              )}
            </div>
          )) : <p className="muted">No questions yet. Add one, or generate from the chapter.</p>}
        </div>

        {error && <div className="err" role="alert" style={{ marginTop: 18 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, margin: '20px 0 40px', flexWrap: 'wrap' }}>
          {(!initial || initial.status === 'draft') && (
            <button className="btn" disabled={!!saving || !classes.length} onClick={() => save('draft')}>{saving === 'draft' ? 'Saving…' : 'Save as draft'}</button>
          )}
          <button className="btn red" disabled={!!saving || !classes.length} onClick={() => save('published')}>
            <PaperPlaneTilt size={15} weight="fill" />
            {saving === 'published' ? 'Posting…' : initial?.status === 'published' ? 'Save changes' : `Post to ${cls || 'class'}`}
          </button>
        </div>
      </div></div>
    </div>
  );
}
