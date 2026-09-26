'use client';

import { useState } from 'react';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { Chip, scoreTone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { marksOf, mcqCorrect, TYPE_LABEL, type Question } from '@/lib/teacher/questions';
import { dmy, type TAssignment, type TSubmission } from '@/lib/teacher/desk';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import Reversals from './capture/Reversals';

const LETTERS = 'ABCDEF';

function Answer({ q, value }: { q: Question; value: unknown }) {
  if (value === undefined || value === null || value === '') return <div className="ans muted">No answer</div>;
  if (q.type === 'mcq') {
    const idx = Number(value);
    const ok = mcqCorrect(q, value);
    return (
      <div className="ans" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {ok ? <Check size={15} weight="bold" color="#10B981" /> : <X size={15} weight="bold" color="#E11D48" />}
        <span><b>{LETTERS[idx] ?? '?'}.</b> {q.options?.[idx] ?? 'Unknown option'}</span>
        {!ok && q.answer !== undefined && <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Key: {LETTERS[q.answer]}</span>}
      </div>
    );
  }
  const file = typeof value === 'object' && value && 'file' in value ? String((value as { file: unknown }).file) : null;
  if (file) {
    return (
      <a href={file} target="_blank" rel="noreferrer" className="ans" style={{ display: 'block' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={file} alt="Student's photo answer" style={{ maxWidth: '100%', borderRadius: 8 }} />
      </a>
    );
  }
  return <div className="ans">{String(value)}</div>;
}

/**
 * Review one submission (mockup renderGradingPanel): the student's work on
 * the left, marks on the right. Typed work is marked per question (MCQs start
 * from the answer key); handwritten work gets one mark, starting from the AI's
 * suggestion. Confirming makes the grade count toward the student's TML.
 * Keyed by submission id in the board, so switching submissions starts fresh.
 */
export default function GradingPanel({ a, sub, onPick, onBack }: {
  a: TAssignment;
  sub: TSubmission;
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  const { call, reload } = useTeacherDesk();
  const [toast, toastEl] = useToast();
  const perQuestion = sub.kind === 'typed' && a.questions.length > 0;
  const max = perQuestion ? a.questions.reduce((n, q) => n + marksOf(q), 0) : (sub.max ?? a.totalMarks ?? 10);
  // Re-opening a graded submission shows the marks that were confirmed; otherwise start from the key.
  const startMarks = () => sub.confirmedByQuestion ?? sub.suggestedByQuestion;

  const [marks, setMarks] = useState<(number | null)[]>(startMarks);
  const [overall, setOverall] = useState<number>(sub.score ?? sub.suggested ?? 0);
  const [note, setNote] = useState(sub.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idx = a.submissions.findIndex(s => s.id === sub.id);
  const working = perQuestion ? marks.reduce<number>((n, m) => n + (m ?? 0), 0) : overall;
  const unmarked = perQuestion ? marks.filter(m => m === null).length : 0;
  const suggested = perQuestion ? null : sub.suggested;

  async function confirm() {
    if (unmarked) { setError(`Give a mark for ${unmarked === 1 ? 'the remaining question' : `the ${unmarked} remaining questions`}.`); return; }
    setSaving(true); setError(null);
    try {
      await call('/api/teacher/review-submission', 'POST', perQuestion
        ? { submissionId: sub.id, questionScores: marks, note }
        : { submissionId: sub.id, score: overall, note });
      toast(sub.state === 'graded' ? 'Grade updated' : 'Grade confirmed — TML updated');
      reload();
      const next = a.submissions.slice(idx + 1).find(s => s.state === 'pending');
      if (next && sub.state !== 'graded') onPick(next.id);
    } catch (e: any) {
      setError(e?.message || 'Could not save the grade.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
        <button className="btn" onClick={onBack}><ArrowLeft size={14} weight="bold" /> Back to submissions</button>
        <div className="muted" style={{ fontSize: 12 }}>Submission {idx + 1} of {a.submissions.length}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={idx <= 0} onClick={() => onPick(a.submissions[idx - 1].id)}><ArrowLeft size={14} weight="bold" /> Prev</button>
          <button className="btn" disabled={idx >= a.submissions.length - 1} onClick={() => onPick(a.submissions[idx + 1].id)}>Next <ArrowRight size={14} weight="bold" /></button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 440px', maxWidth: 600 }}>
          <div className="card" style={{ padding: 20 }}>
            <b style={{ fontSize: 12.5, letterSpacing: '.06em', color: 'var(--mut)' }}>{sub.studentName.toUpperCase()} · SUBMITTED {dmy(sub.submittedAt).toUpperCase()}</b>
            {sub.kind === 'handwritten' ? (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sub.imageUrls.length ? sub.imageUrls.map((u, i) => (
                  <a key={u + i} href={u} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={`Page ${i + 1} of ${sub.studentName}'s work`} style={{ width: '100%', borderRadius: 12, boxShadow: '0 10px 30px rgba(15,30,60,.14)' }} />
                  </a>
                )) : <p className="muted" style={{ fontSize: 13 }}>No pages were uploaded with this submission.</p>}
                {a.questions.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <b style={{ fontSize: 12, letterSpacing: '.06em', color: 'var(--mut)' }}>QUESTIONS SET</b>
                    {a.questions.map((q, i) => <div key={i} style={{ fontSize: 13.5, marginTop: 8 }}>Q{i + 1}. {q.questionText} <span className="muted">({marksOf(q)})</span></div>)}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {a.questions.map((q, i) => (
                  <div key={i} style={{ padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <div className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em' }}>Q{i + 1} · {TYPE_LABEL[q.type]}</div>
                      <label className="stepper" title={`Marks for question ${i + 1}`}>
                        <input className="cmp-in" type="number" min={0} max={marksOf(q)} step={0.5} aria-label={`Marks for question ${i + 1}`}
                          value={marks[i] ?? ''} placeholder="—"
                          onChange={e => {
                            const v = e.target.value === '' ? null : Math.max(0, Math.min(marksOf(q), Number(e.target.value)));
                            setMarks(m => m.map((x, j) => (j === i ? v : x)));
                          }} />
                        <span className="of">/ {marksOf(q)}</span>
                      </label>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 6, fontWeight: 600 }}>{q.questionText}</div>
                    <Answer q={q} value={sub.answers[i]} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: '1 1 320px', minWidth: 300 }}>
          <div className="card" style={{ padding: 14, marginBottom: 16 }}>
            <b style={{ fontSize: 12.5, letterSpacing: '.06em', color: 'var(--mut)' }}>SUBMISSIONS ({a.submissions.length})</b>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {a.submissions.map(s => (
                <button key={s.id} className={`sub-pick${s.id === sub.id ? ' on' : ''}`} onClick={() => onPick(s.id)}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{s.studentName}</span>
                  {s.state === 'graded' && s.score !== null && s.max
                    ? <Chip tone={scoreTone(s.score, s.max)} className="sm">{s.score}/{s.max}</Chip>
                    : <Chip tone="a">TO REVIEW</Chip>}
                </button>
              ))}
            </div>
          </div>

          {sub.kind === 'handwritten' && (sub.aiFeedback || sub.aiQuestions.length > 0) && (
            <div className="note info" style={{ marginBottom: 14 }}>
              <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Sparkle size={14} weight="fill" /> AI evaluation</b>
              {sub.aiFeedback && <p style={{ marginTop: 6 }}>{sub.aiFeedback}</p>}
              {sub.aiQuestions.map((q, i) => (
                <p key={i} style={{ marginTop: 6 }}>
                  <b>Q{q.questionNumber ?? i + 1}: {q.awardedScore ?? '—'}/{q.maxScore ?? '—'}</b>{q.lostMarksReason ? ` — ${q.lostMarksReason}` : ''}
                </p>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', background: '#F4F7FC', borderRadius: 14, flexWrap: 'wrap' }}>
            {suggested !== null && (
              <div><div className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em' }}>AI SUGGESTED</div><div style={{ fontSize: 22, fontWeight: 800 }}>{suggested}/{max}</div></div>
            )}
            <div style={{ flex: 1, minWidth: 12 }} />
            {perQuestion ? (
              <div style={{ textAlign: 'right' }}>
                <div className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em' }}>TOTAL</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{working}/{max}</div>
                {unmarked > 0 && <div className="muted" style={{ fontSize: 11.5 }}>{unmarked} question{unmarked === 1 ? '' : 's'} to mark</div>}
              </div>
            ) : (
              <div className="stepper">
                <button className="btn" onClick={() => setOverall(v => Math.max(0, v - 1))} aria-label="One mark less">−1</button>
                <input className="cmp-in" type="number" min={0} max={max} step={0.5} aria-label="Overall mark" value={overall}
                  onChange={e => setOverall(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} />
                <span className="of">/ {max}</span>
                <button className="btn" onClick={() => setOverall(v => Math.min(max, v + 1))} aria-label="One mark more">+1</button>
              </div>
            )}
          </div>
          {suggested !== null && working !== suggested && (
            <div style={{ marginTop: 10 }}><Chip tone={working > suggested ? 'g' : 'a'}>{working > suggested ? 'Raised' : 'Lowered'} from AI by {Math.abs(working - suggested)}</Chip></div>
          )}

          <div className="cmp-fld" style={{ marginTop: 16 }}>
            <label htmlFor="g-note">FEEDBACK FOR {sub.studentName.split(' ')[0].toUpperCase()} (optional)</label>
            <textarea id="g-note" className="cmp-in" value={note} maxLength={4000} placeholder="What they did well, and what to work on next" onChange={e => setNote(e.target.value)} />
          </div>
          {error && <div className="err" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {suggested !== null && <button className="btn" disabled={working === suggested} onClick={() => setOverall(suggested)}>Match AI score</button>}
            <button className="btn red" disabled={saving} onClick={confirm}>
              <Check size={15} weight="bold" /> {saving ? 'Saving…' : sub.state === 'graded' ? 'Update grade' : 'Confirm grade'}
            </button>
            {sub.state === 'graded' && <Chip tone="g">Graded {sub.score}/{sub.max}</Chip>}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            Confirming makes this mark count toward {sub.studentName.split(' ')[0]}&apos;s True Mastery Level and notifies them.
            {sub.state === 'graded' ? ' Changing a confirmed grade is recorded in the audit log.' : ''}
          </p>
          <Reversals sub={sub} onDone={(msg, removed) => { toast(msg); if (removed) onBack(); }} />
        </div>
      </div>
      {toastEl}
    </>
  );
}
