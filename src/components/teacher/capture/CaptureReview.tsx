'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { MagnifyingGlassPlusIcon as MagnifyingGlassPlus } from '@phosphor-icons/react/dist/ssr/MagnifyingGlassPlus';
import { CameraIcon as Camera } from '@phosphor-icons/react/dist/ssr/Camera';
import { Chip, Skeleton, scoreTone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useAuth } from '@/contexts/AuthContext';
import { marksOf } from '@/lib/teacher/questions';
import { dmy, type TAssignment, type TSubmission } from '@/lib/teacher/desk';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import type { Confidence } from '@/lib/grading/handwritten';
import Reversals from './Reversals';

const CONF: Record<Confidence, { label: string; tone: 'g' | 'a' | 'r' }> = {
  high: { label: 'Clear', tone: 'g' }, medium: { label: 'Check', tone: 'a' }, low: { label: 'Check first', tone: 'r' },
};

/** Short-lived links to a submission's photographed pages. */
function usePages(submissionId: string) {
  const { getAuthToken } = useAuth();
  const [pages, setPages] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch(`/api/grading/pages?submission=${submissionId}`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d?.error || 'The pages didn’t load.');
        if (!cancelled) setPages(d.pages || []);
      } catch (e: any) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);
  return { pages, error };
}

/**
 * Review of photographed work: the notebook pages on the left, the AI's reading
 * and suggested mark per question on the right. The teacher keeps or changes
 * every mark; nothing counts until they confirm. Low-confidence reads come first
 * in the "check first" count and are outlined.
 */
export default function CaptureReview({ a, sub, onPick, onBack }: { a: TAssignment; sub: TSubmission; onPick: (id: string) => void; onBack: () => void }) {
  const { call, reload } = useTeacherDesk();
  const [toast, toastEl] = useToast();
  const { pages, error: pagesError } = usePages(sub.id);
  const g = sub.grade;
  const perQuestion = a.questions.length > 0;
  const max = perQuestion ? a.questions.reduce((n, q) => n + marksOf(q), 0) : (g?.max ?? sub.max ?? a.totalMarks ?? 10);
  const aiMarks = useMemo(() => (g ? g.questions.map(q => q.awarded) : null), [g]);
  const start = () => sub.confirmedByQuestion ?? (perQuestion ? (aiMarks && aiMarks.length === a.questions.length ? aiMarks : a.questions.map(() => null)) : null);
  const [marks, setMarks] = useState<(number | null)[] | null>(start);
  const [overall, setOverall] = useState<number>(sub.score ?? g?.suggestedTotal ?? 0);
  const [note, setNote] = useState(sub.note ?? g?.feedback ?? '');
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState<'save' | 'reread' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const idx = a.submissions.findIndex(s => s.id === sub.id);
  const working = perQuestion ? (marks ?? []).reduce<number>((n, m) => n + (m ?? 0), 0) : overall;
  const unmarked = perQuestion ? (marks ?? []).filter(m => m === null).length : 0;
  const checkFirst = g ? g.questions.filter(q => q.confidence === 'low').length : 0;
  const changed = perQuestion && aiMarks ? (marks ?? []).filter((m, i) => m !== null && Math.abs(m - (aiMarks[i] ?? 0)) > 0.01).length : 0;
  const canReread = sub.state !== 'graded' && sub.imageUrls.some(u => u.startsWith('captures:'));

  async function confirm() {
    if (unmarked) { setError(`Give a mark for ${unmarked === 1 ? 'the remaining question' : `the ${unmarked} remaining questions`}.`); return; }
    setBusy('save'); setError(null);
    try {
      await call('/api/teacher/review-submission', 'POST', perQuestion ? { submissionId: sub.id, questionScores: marks, note } : { submissionId: sub.id, score: overall, note });
      toast(sub.state === 'graded' ? 'Grade updated' : 'Confirmed: TML updated and the family told');
      reload();
      const next = a.submissions.slice(idx + 1).find(s => s.state === 'pending');
      if (next && sub.state !== 'graded') onPick(next.id);
    } catch (e: any) { setError(e?.message || 'Could not save the grade.'); }
    finally { setBusy(null); }
  }
  async function reread() {
    setBusy('reread'); setError(null);
    try { await call('/api/teacher/capture', 'PATCH', { submissionId: sub.id }); toast('Read again'); reload(); }
    catch (e: any) { setError(e?.message || 'The AI couldn’t read the pages.'); }
    finally { setBusy(null); }
  }

  return (
    <>
      <div className="cr-bar">
        <button className="btn" onClick={onBack}><ArrowLeft size={14} weight="bold" /> Back to submissions</button>
        <div className="muted" style={{ fontSize: 12 }}>
          {sub.studentName} · {g?.source === 'teacher_capture' ? 'captured by teacher' : 'photographed by student'} {dmy(sub.submittedAt)} · {idx + 1} of {a.submissions.length}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={idx <= 0} onClick={() => onPick(a.submissions[idx - 1].id)}><ArrowLeft size={14} weight="bold" /> Prev</button>
          <button className="btn" disabled={idx >= a.submissions.length - 1} onClick={() => onPick(a.submissions[idx + 1].id)}>Next <ArrowRight size={14} weight="bold" /></button>
        </div>
      </div>

      <div className="cr-grid">
        <div className="cr-pages">
          {pagesError ? <div className="note err">{pagesError}</div>
            : !pages ? <Skeleton h={520} style={{ borderRadius: 14 }} />
            : !pages.length ? <div className="note">No pages were stored with this submission.</div>
            : (
              <>
                {pages.length > 1 && (
                  <div className="cr-page-tabs" role="tablist" aria-label="Pages">
                    {pages.map((_, i) => <button key={i} role="tab" aria-selected={page === i} className={page === i ? 'on' : ''} onClick={() => setPage(i)}>Page {i + 1}</button>)}
                  </div>
                )}
                <button className={`cr-page${zoom ? ' zoom' : ''}`} onClick={() => setZoom(z => !z)} aria-label={zoom ? 'Fit page' : 'Zoom in'}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pages[Math.min(page, pages.length - 1)]} alt={`Page ${page + 1} of ${sub.studentName}'s work`} />
                  {!zoom && <span className="cr-zoom-hint"><MagnifyingGlassPlus size={14} weight="bold" /> Zoom</span>}
                </button>
              </>
            )}
        </div>

        <div className="cr-marks">
          <div className="cr-sum">
            <div><span>AI SUGGESTED</span><b>{g ? `${g.suggestedTotal}/${g.max}` : '—'}</b></div>
            <div><span>YOUR TOTAL</span><b>{working}/{max}</b></div>
            <div><span>CHECK FIRST</span><b style={{ color: checkFirst ? '#E11D48' : '#10B981' }}>{checkFirst}</b></div>
            {g && <div><span>HANDWRITING</span><b>{g.legibility === 'high' ? 'Clear' : g.legibility === 'medium' ? 'Readable' : 'Hard to read'}</b></div>}
          </div>
          {!g && (
            <div className="note" style={{ marginBottom: 12 }}>
              <Warning size={14} weight="bold" /> No AI reading for this work{sub.aiFeedback ? ` (earlier format: ${sub.aiFeedback})` : ''}. Mark it yourself{canReread ? ', or ask the AI to read it' : ''}.
            </div>
          )}
          {g?.flags.length ? <div className="note err" style={{ marginBottom: 12 }}><b>The AI flagged:</b> {g.flags.join(' · ')}</div> : null}
          {g?.summary && <p className="cr-summary"><Sparkle size={14} weight="fill" color="#7C5CFC" /> {g.summary}</p>}

          {perQuestion ? a.questions.map((q, i) => {
            const ai = g?.questions[i];
            const m = marks?.[i] ?? null;
            const moved = ai && m !== null && Math.abs(m - ai.awarded) > 0.01;
            return (
              <div key={i} className={`cr-q${ai?.confidence === 'low' ? ' low' : ''}`}>
                <div className="cr-q-hd">
                  <b>Q{i + 1}</b>
                  {ai && <Chip tone={CONF[ai.confidence].tone} className="xs">{CONF[ai.confidence].label}</Chip>}
                  {ai?.page && pages && pages.length > 1 && <button className="cr-link" onClick={() => setPage(ai.page! - 1)}>on page {ai.page}</button>}
                  <label className="stepper" style={{ marginLeft: 'auto' }}>
                    <input className="cmp-in" type="number" min={0} max={marksOf(q)} step={0.5} aria-label={`Marks for question ${i + 1}`} value={m ?? ''} placeholder="—"
                      onChange={e => { const v = e.target.value === '' ? null : Math.max(0, Math.min(marksOf(q), Number(e.target.value))); setMarks(x => (x ?? []).map((y, j) => (j === i ? v : y))); }} />
                    <span className="of">/ {marksOf(q)}</span>
                  </label>
                </div>
                <div className="cr-q-text">{q.questionText}</div>
                {ai ? (
                  <>
                    {ai.attempted ? <blockquote className="cr-read">{ai.transcription || '(nothing legible)'}</blockquote> : <div className="muted" style={{ fontSize: 13 }}>Not attempted</div>}
                    <div className="cr-why"><Sparkle size={12} weight="fill" color="#7C5CFC" /> AI: {ai.awarded}/{ai.max}{ai.reasoning ? `. ${ai.reasoning}` : ''}</div>
                    {moved && <Chip tone={m! > ai.awarded ? 'g' : 'a'} className="xs">{m! > ai.awarded ? 'Raised' : 'Lowered'} from AI by {Math.abs(m! - ai.awarded)}</Chip>}
                  </>
                ) : null}
              </div>
            );
          }) : (
            <div className="cr-q">
              <div className="cr-q-hd"><b>Overall mark</b>
                <label className="stepper" style={{ marginLeft: 'auto' }}>
                  <input className="cmp-in" type="number" min={0} max={max} step={0.5} aria-label="Overall mark" value={overall} onChange={e => setOverall(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} />
                  <span className="of">/ {max}</span>
                </label>
              </div>
              {g?.questions[0]?.reasoning && <div className="cr-why"><Sparkle size={12} weight="fill" color="#7C5CFC" /> AI: {g.questions[0].awarded}/{g.questions[0].max}. {g.questions[0].reasoning}</div>}
            </div>
          )}

          <div className="cmp-fld" style={{ marginTop: 14 }}>
            <label htmlFor="cr-note">FEEDBACK FOR {sub.studentName.split(' ')[0].toUpperCase()}{g?.feedback && !sub.note ? ' (AI draft, edit freely)' : ''}</label>
            <textarea id="cr-note" className="cmp-in" value={note} maxLength={4000} onChange={e => setNote(e.target.value)} placeholder="What they did well, and what to work on next" />
          </div>
          {error && <div className="err" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
          <div className="cr-acts">
            {perQuestion && aiMarks && changed > 0 && <button className="btn" onClick={() => setMarks(aiMarks)}>Reset to AI marks</button>}
            {canReread && <button className="btn" disabled={!!busy} onClick={() => void reread()}><ArrowsClockwise size={14} weight="bold" /> {busy === 'reread' ? 'Reading…' : g ? 'Read again' : 'Read with AI'}</button>}
            <button className="btn red" disabled={!!busy} onClick={() => void confirm()}>
              <Check size={15} weight="bold" /> {busy === 'save' ? 'Saving…' : sub.state === 'graded' ? 'Update grade' : changed ? `Confirm (${changed} changed)` : 'Confirm marks'}
            </button>
            {sub.state === 'graded' && sub.score !== null && sub.max && <Chip tone={scoreTone(sub.score, sub.max)}>Graded {sub.score}/{sub.max}</Chip>}
          </div>
          <Reversals sub={sub} onDone={(msg, removed) => { toast(msg); if (removed) onBack(); }} />
          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            <Camera size={12} weight="bold" /> The AI only suggests. Your confirmed marks count toward {sub.studentName.split(' ')[0]}&apos;s True Mastery Level, and the student and family are told.
          </p>
        </div>
      </div>
      {toastEl}
    </>
  );
}
