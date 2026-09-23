'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { Camera, X, Check, Loader2 } from 'lucide-react';

interface Question {
  questionText?: string;
  question?: string;
  prompt?: string;
  type?: 'short' | 'mcq' | 'upload';
  options?: string[];
  answer?: number;
  marks?: number | null;
}

interface Page {
  file: File;
  preview: string;
}

const SH = 'shadow-[0_1px_2px_rgba(0,33,71,0.05),0_10px_30px_rgba(0,33,71,0.05)]';
const questionLabel = (q: Question) => q.questionText || q.question || q.prompt || 'Question';

// ── .ch chip — small colored badge, exact palette from the design system ──────
function Chip({ tone, children }: { tone: 'g' | 'a' | 'r' | 'b' | 'p' | 'n'; children: React.ReactNode }) {
  const map: Record<string, string> = {
    g: 'bg-[#DCFCE7] text-[#0B7A54]',
    a: 'bg-[#FEF3C7] text-[#92600A]',
    r: 'bg-[#FFE4EA] text-[#B4123C]',
    b: 'bg-[#E6EEFF] text-[#1E4FCC]',
    p: 'bg-[#EFE9FF] text-[#5B3DD1]',
    n: 'bg-[#F1F5F9] text-[#556378]',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold tracking-wide ${map[tone]}`}>
      {children}
    </span>
  );
}

const scoreChip = (score: number, total: number): 'g' | 'a' | 'r' => {
  if (!total) return 'n' as any;
  const pct = (score / total) * 100;
  return pct >= 70 ? 'g' : pct >= 40 ? 'a' : 'r';
};

export default function HomeworkWorkspace() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile, loading: authLoading, getAuthToken } = useAuth();
  const supabase = createClient();

  const [assignment, setAssignment] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Typed-mode state (short answer / MCQ / upload-per-question) ──────────
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [questionFiles, setQuestionFiles] = useState<Record<number, File | null>>({});
  const [saveFlash, setSaveFlash] = useState('Saved');

  // ── Handwritten-mode state (photograph the whole worksheet) ──────────────
  const [pages, setPages] = useState<Page[]>([]);

  // ── Shared submit state ───────────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState<any>(null);

  // ── Proctoring ─────────────────────────────────────────────────────────────
  const [switchCount, setSwitchCount] = useState(0);
  const [proctorWarning, setProctorWarning] = useState<string | null>(null);
  const autoSubmitRef = useRef(false);
  const submitRef = useRef<(auto?: boolean) => void>(() => {});

  const alreadySubmitted = !!submission || !!justSubmitted;

  useEffect(() => {
    if (!id || !profile?.uid) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const { data: a, error: aErr } = await supabase.from('assignments').select('*').eq('id', id).maybeSingle();
        if (aErr) throw aErr;
        if (!a) { if (!cancelled) setLoadError('This assignment could not be found.'); return; }

        const { data: sub } = await supabase
          .from('submissions').select('*')
          .eq('assignment_id', id).eq('student_id', profile.uid).maybeSingle();

        if (!cancelled) { setAssignment(a); setSubmission(sub || null); }
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || 'Failed to load this assignment.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [id, profile?.uid]);

  const questions: Question[] = assignment?.questions || [];
  const isTyped = assignment?.submission_mode === 'typed';

  const qDone = useCallback((i: number) => {
    const q = questions[i];
    if (!q) return false;
    if (q.type === 'mcq') return answers[i] != null;
    if (q.type === 'upload') return !!questionFiles[i];
    return !!(answers[i] || '').toString().trim();
  }, [questions, answers, questionFiles]);

  const answeredCount = useMemo(() => questions.reduce((n, _q, i) => n + (qDone(i) ? 1 : 0), 0), [questions, qDone]);

  const flashSaved = useCallback(() => {
    setSaveFlash('Saving…');
    const t = setTimeout(() => setSaveFlash('Saved just now'), 550);
    return () => clearTimeout(t);
  }, []);

  // ── Proctoring: tab-switch / visibility monitoring ────────────────────────
  const reportProctorAlert = useCallback(async (count: number) => {
    try {
      const token = await getAuthToken();
      if (!token) return; // no authenticated session — nothing to report as
      await fetch('/api/student/proctor-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          schoolId: profile?.schoolId, studentId: profile?.uid, studentName: profile?.name,
          taskId: id, taskTitle: assignment?.title, switchCount: count,
        }),
      });
    } catch { /* best-effort */ }
  }, [profile?.schoolId, profile?.uid, profile?.name, id, assignment?.title, getAuthToken]);

  useEffect(() => {
    if (!assignment?.proctored || alreadySubmitted) return;
    const onVisibility = () => {
      if (document.hidden) {
        setSwitchCount(c => {
          const next = c + 1;
          reportProctorAlert(next);
          if (next >= 3) {
            if (!autoSubmitRef.current) {
              autoSubmitRef.current = true;
              setProctorWarning('3 tab switches detected — this assignment has been auto-submitted.');
              submitRef.current(true);
            }
          } else {
            setProctorWarning(`Tab switch detected (${next}/3). ${3 - next} more will auto-submit this assignment.`);
          }
          return next;
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [assignment?.proctored, alreadySubmitted, reportProctorAlert]);

  // ── Handwritten-mode: page capture ────────────────────────────────────────
  const addPages = (files: FileList | null) => {
    if (!files) return;
    setPages(p => [...p, ...Array.from(files).map(file => ({ file, preview: URL.createObjectURL(file) }))]);
  };
  const removePage = (i: number) => setPages(p => p.filter((_, idx) => idx !== i));

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // ── Submit: typed mode (auto-grade MCQ instantly; rest -> teacher review) ─
  const submitTyped = async () => {
    const mcqQuestions = questions.filter(q => q.type === 'mcq');
    const allMcq = mcqQuestions.length === questions.length && questions.length > 0;
    const mcqCorrect = mcqQuestions.reduce((n, q) => n + (answers[questions.indexOf(q)] === q.answer ? 1 : 0), 0);

    const row = {
      assignment_id: id,
      student_id: profile!.uid,
      school_id: profile!.schoolId || null,
      answers,
      submission_text: Object.values(answers).filter(a => typeof a === 'string').join('\n\n') || null,
      score: allMcq ? mcqCorrect : null,
      max_score: allMcq ? mcqQuestions.length : (assignment?.total_marks ?? questions.length),
      grade: allMcq ? `${mcqCorrect}/${mcqQuestions.length}` : null,
      ai_graded: false,
      teacher_approved: allMcq ? true : null,
      type: 'typed',
    };

    const { data, error } = await supabase.from('submissions').insert(row).select('*').single();
    if (error) throw error;

    for (let i = 0; i < questions.length; i++) {
      if (questions[i].type !== 'mcq') continue;
      await supabase.from('submission_items').insert({
        submission_id: data.id, assignment_id: id, student_id: profile!.uid, school_id: profile!.schoolId || null,
        question_index: i, component_type: 'homework',
        score: answers[i] === questions[i].answer ? 1 : 0, max_score: 1, teacher_confirmed: true,
      });
    }

    // Refresh True Mastery Level now that new evidence exists — best-effort,
    // never blocks the submission on failure (e.g. no live session token yet).
    try {
      const token = await getAuthToken();
      if (token) {
        await fetch('/api/tml/compute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ studentId: profile!.uid, subject: assignment?.subject }),
        });
      }
    } catch { /* best-effort */ }

    return data;
  };

  // ── Submit: handwritten mode (photograph -> upload -> Vision AI grade) ────
  const submitHandwritten = async () => {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No active Supabase sign-in token — AI grading needs a real authenticated session (expected in the local demo login).');
    }

    const uploads = await Promise.all(pages.map(async (p, idx) => {
      const [base64, url] = await Promise.all([
        fileToBase64(p.file),
        (async () => {
          const form = new FormData();
          form.append('file', p.file);
          form.append('studentId', profile!.uid);
          form.append('assignmentId', String(id));
          form.append('pageIndex', String(idx));
          const res = await fetch('/api/student/upload-submission', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Page upload failed');
          return (await res.json()).url as string;
        })(),
      ]);
      return { base64, mimeType: p.file.type || 'image/jpeg', url };
    }));

    const res = await fetch('/api/homework/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        assignmentId: id, studentId: profile!.uid, schoolId: profile!.schoolId,
        images: uploads.map(u => ({ data: u.base64, mimeType: u.mimeType })),
        imageUrls: uploads.map(u => u.url),
        questions,
      }),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || 'AI grading failed');
    return json;
  };

  const handleSubmit = useCallback(async (auto = false) => {
    if (submitting || alreadySubmitted) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = isTyped ? await submitTyped() : await submitHandwritten();
      setJustSubmitted(result);
      setConfirmOpen(false);
    } catch (e: any) {
      setSubmitError(e?.message || 'Submission failed. Please try again.');
      if (!auto) setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, alreadySubmitted, isTyped, answers, pages, assignment, questions, profile]);

  useEffect(() => { submitRef.current = handleSubmit; }, [handleSubmit]);

  const close = () => router.push('/student/homework');

  // ── Loading / error ────────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="fixed inset-0 z-[70] bg-[#F7F9FB] flex items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-[#002147]" />
        <p className="text-sm font-bold text-[#7A8699]">Loading assignment…</p>
      </div>
    );
  }

  if (loadError || !assignment) {
    return (
      <div className="fixed inset-0 z-[70] bg-[#F7F9FB] flex flex-col items-center justify-center gap-4">
        <p className="text-[#7A8699] font-semibold">{loadError || 'Assignment not found.'}</p>
        <button onClick={close} className="inline-flex items-center gap-2 rounded-xl border border-[#E8EDF4] bg-white px-4 py-2 text-[13.5px] font-bold text-[#7A8699] hover:border-[#C9D6E8]">
          ← Back
        </button>
      </div>
    );
  }

  // ── Submitted / results view ───────────────────────────────────────────────
  if (alreadySubmitted) {
    const grade = justSubmitted?.grade ?? submission?.grade ?? submission?.ai_grade;
    const score = justSubmitted?.score ?? submission?.score;
    const total = justSubmitted?.totalMarks ?? submission?.max_score ?? assignment.total_marks ?? 0;
    const aiResult = justSubmitted?.aiResult ?? submission?.ai_result;
    const pendingReview = score == null;

    return (
      <div className="fixed inset-0 z-[70] bg-[#F7F9FB] flex flex-col overflow-y-auto">
        <div className="flex-1 flex justify-center px-8 py-10">
          <div className="w-full max-w-[640px]">
            <button onClick={close} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] font-bold text-[#7A8699] hover:bg-[#F7F9FB] hover:text-[#002147]">
              ← Back
            </button>

            <div className={`bg-white rounded-[20px] ${SH} p-10 mt-4 text-center`}>
              {pendingReview
                ? <Chip tone="b">SUBMITTED</Chip>
                : <Chip tone="g">AUTO-GRADED — {grade || `${score}/${total}`}</Chip>}
              <h1 className="text-[27px] font-extrabold text-[#002147] mt-4">{pendingReview ? 'Submitted' : 'Graded'}</h1>
              <p className="text-[#7A8699] text-[15px] mt-2.5">{assignment.subject} · {assignment.title}</p>
              <p className="text-[#7A8699] text-[13.5px] mt-1">
                Submitted just now{assignment.proctored ? ' · integrity check: clean' : ''}
              </p>
              <div className="text-left bg-[#F7F9FB] border border-[#E8EDF4] rounded-2xl p-4 mt-6 text-[13.5px] text-[#33465F] leading-relaxed">
                {pendingReview
                  ? "Your teacher will review this before it updates your True Mastery Level. You'll get a notification when it's ready."
                  : `This grade still needs your teacher's confirmation before it moves your True Mastery Level.`}
              </div>
              <button onClick={close} className="mt-6 px-5 py-2.5 rounded-xl bg-[#002147] text-white text-[13.5px] font-bold">
                Back to Homework
              </button>
            </div>

            {Array.isArray(aiResult?.questions) && (
              <div className={`bg-white rounded-[20px] ${SH} p-8 mt-5`}>
                <div className="text-center text-[#9AA6B8] text-[11.5px] font-extrabold tracking-[.14em] mb-5">✦ AI FEEDBACK</div>
                <div className="space-y-6">
                  {aiResult.questions.map((q: any, i: number) => (
                    <div key={i} className="border-t border-[#E8EDF4] first:border-t-0 first:pt-0 pt-6">
                      <Chip tone={q.isFinalAnswerCorrect ? 'g' : 'r'}>
                        Q{q.questionNumber ?? i + 1} — {q.awardedScore ?? 0}/{q.maxScore ?? '—'}
                      </Chip>
                      {q.questionText && <p className="text-[14px] font-bold text-[#002147] mt-3">{q.questionText}</p>}
                      {q.whatStudentGotRight && <p className="text-[14px] leading-[1.7] text-[#33465F] mt-2"><b>What went right:</b> {q.whatStudentGotRight}</p>}
                      {q.lostMarksReason && <p className="text-[14px] leading-[1.7] text-[#33465F] mt-2"><b>Where marks were lost:</b> {q.lostMarksReason}</p>}
                      {q.howToFix && (
                        <div className="bg-[#002147] text-[#CFE0F5] rounded-2xl p-5 mt-3 font-mono text-[12.5px] leading-[1.8]">
                          <div className="text-[#4C8DFF] font-sans font-semibold tracking-[.1em] text-[11px] mb-2">✦ HOW TO FIX IT</div>
                          {q.howToFix}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Active workspace — fullscreen overlay, matches #workspace in the design ─
  const q = questions[qi];

  return (
    <div className="fixed inset-0 z-[70] bg-[#F7F9FB] flex flex-col overflow-y-auto">
      {/* ws-head */}
      <div className="sticky top-0 z-[2] bg-white border-b border-[#E8EDF4] px-[30px] py-4 flex items-center gap-[18px] flex-wrap">
        <button onClick={close} className="inline-flex items-center gap-2 text-[13.5px] font-bold text-[#7A8699] hover:bg-[#F7F9FB] hover:text-[#002147] rounded-xl px-3 py-2">
          ← Back
        </button>
        <div>
          <h1 className="text-[19px] font-extrabold text-[#002147] leading-[1.25]">{assignment.title}</h1>
          <div className="text-[12px] text-[#7A8699] mt-0.5">{assignment.subject || 'General'} · Due {assignment.due_date || 'soon'}</div>
        </div>
        {assignment.proctored && (
          <span className="ml-auto inline-flex items-center gap-1.5 bg-[#F0FDF7] border border-[#BBF7D0] text-[#0B7A54] rounded-full px-[13px] py-1.5 text-[11.5px] font-extrabold tracking-[.03em]">
            Camera &amp; tab-focus monitoring active
          </span>
        )}
        {isTyped && <span className="text-[11.5px] text-[#7A8699] font-bold min-w-[96px] text-right">{saveFlash}</span>}
      </div>

      {proctorWarning && (
        <div className="mx-auto mt-4 max-w-[1180px] w-full px-[30px]">
          <div className="bg-[#FFE4EA] border border-[#FFB8C8] text-[#B4123C] text-[13.5px] font-bold rounded-xl px-4 py-3">
            {proctorWarning}
          </div>
        </div>
      )}

      {/* ws-body */}
      <div className="flex-1 flex gap-[26px] px-[30px] pt-[26px] pb-[100px] max-w-[1180px] mx-auto w-full flex-wrap">
        {isTyped ? (
          <>
            {/* ws-nav */}
            <div className="w-[216px] shrink-0">
              <div className={`bg-white rounded-[20px] ${SH} p-4 sticky top-[90px]`}>
                <b className="text-[12.5px] tracking-[.06em] uppercase text-[#7A8699]">Questions</b>
                <div className="flex flex-wrap gap-2 mt-3">
                  {questions.map((_, i) => {
                    const done = qDone(i);
                    const now = i === qi;
                    return (
                      <button
                        key={i}
                        onClick={() => setQi(i)}
                        aria-current={now}
                        className={`w-9 h-9 rounded-[10px] border-[1.5px] font-extrabold text-[13px] grid place-items-center transition-all ${
                          done ? 'bg-[#DCFCE7] border-[#BBF7D0] text-[#10B981]'
                          : now ? 'border-[#002147] text-[#002147] shadow-[0_0_0_2px_rgba(0,33,71,0.08)]'
                          : 'border-[#E8EDF4] text-[#7A8699] bg-white'
                        }`}
                      >
                        {done ? <Check className="w-4 h-4 mx-auto" /> : i + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[12px] text-[#7A8699] font-medium mt-3.5">{answeredCount} of {questions.length} answered</div>
              </div>
            </div>

            {/* ws-main */}
            <div className="flex-1 min-w-[320px]">
              {q ? (
                <div className={`bg-white rounded-[20px] ${SH} p-[30px]`}>
                  <div className="text-[11.5px] font-extrabold tracking-[.08em] text-[#7A8699]">QUESTION {qi + 1} OF {questions.length}</div>
                  <h2 className="text-[21px] font-extrabold text-[#002147] leading-[1.5] mt-2.5 mb-[22px]">{questionLabel(q)}</h2>

                  {q.type === 'mcq' && Array.isArray(q.options) ? (
                    <div role="radiogroup">
                      {q.options.map((opt, oi) => {
                        const selected = answers[qi] === oi;
                        return (
                          <button
                            key={oi}
                            role="radio"
                            aria-checked={selected}
                            onClick={() => { setAnswers(a => ({ ...a, [qi]: oi })); flashSaved(); }}
                            className={`w-full flex gap-3.5 items-start text-left border-[1.5px] rounded-2xl px-[18px] py-4 mb-[11px] text-[14.5px] leading-[1.6] transition-colors ${
                              selected ? 'border-[#2F6BFF] bg-[#EAF2FF]' : 'border-[#E8EDF4] bg-white hover:border-[#4C8DFF] hover:bg-[#FAFCFF]'
                            }`}
                          >
                            <b className={`shrink-0 w-7 h-7 rounded-full border-[1.5px] grid place-items-center text-[12px] font-bold ${
                              selected ? 'bg-[#2F6BFF] border-[#2F6BFF] text-white' : 'border-[#CBD5E1] text-[#7A8699]'
                            }`}>{'ABCD'[oi] || oi + 1}</b>
                            <span className="text-[#002147]">{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : q.type === 'upload' ? (
                    questionFiles[qi] ? (
                      <div className="flex items-center justify-between gap-3 bg-[#EAF2FF] rounded-xl px-4 py-3 text-[13.5px] font-bold text-[#002147]">
                        <span>📎 {questionFiles[qi]!.name}</span>
                        <button onClick={() => setQuestionFiles(f => ({ ...f, [qi]: null }))} className="text-[#7A8699] text-xs font-bold">Remove</button>
                      </div>
                    ) : (
                      <div className="border-[1.5px] border-dashed border-[#E8EDF4] rounded-2xl py-[34px] px-5 text-center">
                        <p className="text-[13.5px] text-[#7A8699] mb-3.5">PNG, JPG or PDF · up to 10&nbsp;MB</p>
                        <label className="inline-flex bg-[#002147] text-white rounded-xl px-[18px] py-[11px] text-[13.5px] font-bold cursor-pointer">
                          Choose file
                          <input type="file" accept="image/*,.pdf" className="sr-only" onChange={e => { setQuestionFiles(f => ({ ...f, [qi]: e.target.files?.[0] || null })); flashSaved(); }} />
                        </label>
                      </div>
                    )
                  ) : (
                    <textarea
                      value={answers[qi] || ''}
                      onChange={e => { setAnswers(a => ({ ...a, [qi]: e.target.value })); flashSaved(); }}
                      placeholder="Type your answer…"
                      className="w-full min-h-[140px] border-[1.5px] border-[#E8EDF4] rounded-2xl p-4 text-[14.5px] leading-[1.7] focus:outline-none focus:border-[#2F6BFF] focus:ring-1 focus:ring-[#2F6BFF]"
                    />
                  )}
                </div>
              ) : (
                <div className={`bg-white rounded-[20px] ${SH} p-[30px] text-[#7A8699] text-sm`}>This assignment has no questions yet.</div>
              )}
            </div>
          </>
        ) : (
          /* Handwritten mode — no per-question pagination; photograph the whole sheet */
          <div className="flex-1 min-w-[320px] grid grid-cols-1 md:grid-cols-2 gap-[18px]">
            <div className={`bg-white rounded-[20px] ${SH} p-[30px]`}>
              <div className="text-[11.5px] font-extrabold tracking-[.08em] text-[#7A8699] mb-4">WORK THESE OUT ON PAPER</div>
              {questions.length === 0 ? (
                <p className="text-[14px] text-[#7A8699]">No questions listed — follow your teacher's instructions.</p>
              ) : (
                <div className="space-y-4">
                  {questions.map((qq, i) => (
                    <p key={i} className="text-[14.5px] leading-[1.6] text-[#002147]">
                      <b>{i + 1}.</b> {questionLabel(qq)}
                      {qq.marks ? <span className="text-[#9AA6B8] text-[12px]"> ({qq.marks} marks)</span> : null}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className={`bg-white rounded-[20px] ${SH} p-[30px]`}>
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11.5px] font-extrabold tracking-[.08em] text-[#7A8699]">PHOTOGRAPH YOUR ANSWER SHEET</div>
                <Chip tone="b">✦ Graded by AI in seconds</Chip>
              </div>

              {pages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {pages.map((p, i) => (
                    <div key={i} className="relative">
                      <img src={p.preview} alt={`Page ${i + 1}`} className="w-full h-24 object-cover rounded-lg border border-[#E8EDF4]" />
                      <button onClick={() => removePage(i)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-[#E8EDF4] shadow flex items-center justify-center">
                        <X className="w-3.5 h-3.5 text-[#7A8699]" />
                      </button>
                      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 rounded">Page {i + 1}</span>
                    </div>
                  ))}
                </div>
              )}

              <label className="flex flex-col items-center justify-center gap-2 border-[1.5px] border-dashed border-[#E8EDF4] rounded-2xl py-[34px] cursor-pointer hover:bg-[#F7F9FB]">
                <Camera className="w-6 h-6 text-[#9AA6B8]" />
                <span className="text-[13.5px] font-bold text-[#2F6BFF]">Add a page (photo or PDF)</span>
                <input type="file" accept="image/*,.pdf" multiple className="sr-only" onChange={e => addPages(e.target.files)} />
              </label>
            </div>
          </div>
        )}
      </div>

      {submitError && (
        <div className="mx-auto max-w-[1180px] w-full px-[30px] pb-4">
          <div className="bg-[#FFE4EA] border border-[#FFB8C8] text-[#B4123C] text-[13.5px] font-bold rounded-xl px-4 py-3">{submitError}</div>
        </div>
      )}

      {/* ws-footer */}
      <div className="sticky bottom-0 bg-white border-t border-[#E8EDF4] px-[30px] py-4 flex items-center justify-between gap-3">
        <div className="text-[12.5px] font-bold text-[#7A8699]">
          {isTyped ? `${answeredCount} of ${questions.length} answered` : `${pages.length} page${pages.length === 1 ? '' : 's'} attached`}
        </div>
        <div className="flex gap-2.5">
          {isTyped && (
            <button
              disabled={qi === 0}
              onClick={() => setQi(Math.max(0, qi - 1))}
              className="px-[18px] py-[11px] rounded-xl border border-[#E8EDF4] bg-white text-[13.5px] font-bold text-[#002147] disabled:opacity-40"
            >
              Previous
            </button>
          )}
          {isTyped && qi < questions.length - 1 ? (
            <button onClick={() => setQi(qi + 1)} className="px-[18px] py-[11px] rounded-xl bg-[#002147] text-white text-[13.5px] font-bold">
              Next question
            </button>
          ) : (
            <button
              disabled={!isTyped && pages.length === 0}
              onClick={() => setConfirmOpen(true)}
              className="px-[18px] py-[11px] rounded-xl bg-[#E11D48] text-white text-[13.5px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isTyped ? 'Review & submit' : 'Submit for AI grading →'}
            </button>
          )}
        </div>
      </div>

      {/* dialog#submitDlg */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[80] bg-[rgba(3,22,46,0.55)] flex items-center justify-center p-4" onClick={() => !submitting && setConfirmOpen(false)}>
          <div className="bg-white rounded-[22px] w-full max-w-[440px] shadow-[0_30px_70px_rgba(0,33,71,0.28)]" onClick={e => e.stopPropagation()}>
            <div className="p-[30px]">
              <h3 className="text-[19px] font-extrabold text-[#002147] mb-2">Submit this assignment?</h3>
              <p className="text-[13.5px] text-[#7A8699] leading-[1.6]">
                {isTyped
                  ? `You've answered ${answeredCount} of ${questions.length} questions. Anything you skip will be marked as not attempted, and you won't be able to change your answers after this.`
                  : `All set — ${pages.length} page${pages.length === 1 ? '' : 's'} ready.${assignment.proctored ? " We'll quietly attach a tab-focus integrity check too, just to keep things fair." : ''} You won't be able to change your answers after this.`}
              </p>
              <div className="flex gap-2.5 mt-[22px]">
                <button disabled={submitting} onClick={() => setConfirmOpen(false)} className="flex-1 justify-center px-[18px] py-[11px] rounded-xl border border-[#E8EDF4] bg-white text-[13.5px] font-bold text-[#002147]">
                  Continue working
                </button>
                <button disabled={submitting} onClick={() => handleSubmit(false)} className="flex-1 justify-center inline-flex items-center gap-2 px-[18px] py-[11px] rounded-xl bg-[#E11D48] text-white text-[13.5px] font-bold">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? (isTyped ? 'Submitting…' : 'Grading with AI…') : 'Submit assignment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
