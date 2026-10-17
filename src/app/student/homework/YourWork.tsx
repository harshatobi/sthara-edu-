'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';

interface Question {
  questionText?: string;
  question?: string;
  prompt?: string;
  type?: 'short' | 'mcq' | 'upload';
  options?: string[];
  marks?: number | null;
}

type Links = { pages: string[]; answers: Record<string, string> };
type Work = { marks: Record<string, { score: number; max: number }>; key: Record<string, number> | null; keyStatus: 'released' | 'awaiting-review' | 'not-everyone-in' | 'none' };

const SH = 'shadow-[0_1px_2px_rgba(0,33,71,0.05),0_10px_30px_rgba(0,33,71,0.05)]';
const LETTERS = 'ABCDEF';
const label = (q: Question) => q.questionText || q.question || q.prompt || 'Question';
const hasFile = (v: unknown): v is { file: string } => !!v && typeof v === 'object' && typeof (v as { file?: unknown }).file === 'string';

/**
 * The student's own handed-in work, read back: every answer as they gave it, photos and pages through
 * short-lived links (all storage is private), the marks their teacher confirmed per question, and the
 * MCQ key once the whole class is graded. Shown from the moment they submit; nothing here is editable.
 */
export default function YourWork({ submission, questions, live, getAuthToken }: {
  submission: any;
  questions: Question[];
  live: boolean;
  getAuthToken: () => Promise<string | null>;
}) {
  const answers: Record<string, unknown> = submission?.answers && typeof submission.answers === 'object' ? submission.answers : {};
  const imageUrls: string[] = Array.isArray(submission?.image_urls) ? submission.image_urls : [];
  const files = imageUrls.length > 0 || Object.values(answers).some(hasFile);
  const confirmed = submission?.teacher_approved === true;
  // undefined while loading, null when it couldn't be fetched.
  const [links, setLinks] = useState<Links | null | undefined>(files && live ? undefined : null);
  const [work, setWork] = useState<Work | null>(null);

  useEffect(() => {
    if (!live || !submission?.id) return;
    let cancelled = false;
    (async () => {
      const token = await getAuthToken();
      if (!token) { if (!cancelled) setLinks(null); return; }
      const headers = { Authorization: `Bearer ${token}` };
      const [l, w] = await Promise.all([
        files ? fetch(`/api/grading/pages?submission=${submission.id}`, { headers }).then(r => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
        fetch(`/api/student/work?assignment=${submission.assignment_id}`, { headers }).then(r => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (cancelled) return;
      if (files) setLinks(l ? { pages: l.pages || [], answers: l.answers || {} } : null);
      setWork(w);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, submission?.id, submission?.teacher_approved, files]);

  const typed = questions.length > 0 && (submission?.type === 'typed' || Object.keys(answers).length > 0);
  if (!typed && !imageUrls.length && !submission?.submission_text) return null;
  // Some older work kept only the score, not the answers: say so once instead of "Not attempted" on every line.
  const noAnswers = typed && Object.keys(answers).length === 0;

  return (
    <div className={`bg-white rounded-[20px] ${SH} p-8 mt-5`}>
      <div className="text-center text-[#9AA6B8] text-[11.5px] font-extrabold tracking-[.14em] mb-1">YOUR WORK</div>
      <p className="text-center text-[#7A8699] text-[13px] mb-5">
        {!confirmed ? 'As you handed it in. Marks appear here once your teacher confirms them.'
          : work?.keyStatus === 'released' ? 'With your confirmed marks and the answer key.'
            : work?.keyStatus === 'not-everyone-in' || work?.keyStatus === 'awaiting-review' ? 'With your confirmed marks. The answer key opens once the whole class has been graded.'
              : 'With your confirmed marks.'}
      </p>

      {noAnswers && (
        <p className="text-[13px] text-[#7A8699] bg-[#F7F9FB] rounded-xl px-4 py-3 mb-5">Only your score was recorded for this one, so your answers can&apos;t be shown.</p>
      )}

      {typed && (
        <div className="space-y-5">
          {questions.map((q, i) => {
            const mark = work?.marks?.[i];
            return (
              <div key={i} className="border-t border-[#E8EDF4] first:border-t-0 first:pt-0 pt-5">
                <div className="flex items-start gap-3">
                  <span className="text-[12px] font-extrabold text-[#9AA6B8] mt-0.5">Q{i + 1}</span>
                  <p className="flex-1 text-[14px] font-bold text-[#002147] leading-snug">{label(q)}</p>
                  {mark && (
                    <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-extrabold ${mark.score >= mark.max ? 'bg-[#DCFCE7] text-[#0B7A54]' : mark.score > 0 ? 'bg-[#FEF3C7] text-[#92600A]' : 'bg-[#FFE4EA] text-[#B4123C]'}`}>
                      {mark.score}/{mark.max}
                    </span>
                  )}
                </div>
                <div className="mt-2.5 ml-8">
                  <Answer q={q} value={answers[i]} link={links === undefined ? undefined : links?.answers?.[i] ?? null} keyed={work?.key?.[i]} unknown={noAnswers} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!typed && submission?.submission_text && (
        <p className="text-[14px] leading-[1.7] text-[#33465F] whitespace-pre-wrap">{submission.submission_text}</p>
      )}

      {imageUrls.length > 0 && (
        <div className={typed ? 'mt-6' : ''}>
          <div className="text-[11.5px] font-extrabold tracking-[.12em] text-[#9AA6B8] mb-3">PAGES YOU PHOTOGRAPHED</div>
          {links === undefined ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {imageUrls.map((_, i) => <div key={i} className="aspect-[3/4] rounded-xl bg-[#EEF2F7] animate-pulse" />)}
            </div>
          ) : links?.pages.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {links.pages.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-[#E8EDF4] hover:border-[#C9D6E8]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private link */}
                  <img src={u} alt={`Page ${i + 1} of your work`} className="w-full aspect-[3/4] object-cover" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-[#7A8699]">{live ? 'Your pages couldn’t be loaded just now. Try again in a moment.' : 'Pages show here for real submissions.'}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Answer({ q, value, link, keyed, unknown }: { q: Question; value: unknown; link: string | null | undefined; keyed: number | undefined; unknown: boolean }) {
  if (value === undefined || value === null || value === '') {
    const key = keyed !== undefined && <div className="text-[13.5px] text-[#0B7A54]"><b>Correct answer: {LETTERS[keyed]}.</b> {q.options?.[keyed] ?? ''}</div>;
    return unknown ? (key || null) : <div className="space-y-1.5"><p className="text-[13.5px] text-[#9AA6B8] italic">Not attempted</p>{key}</div>;
  }
  if (q.type === 'mcq') {
    const idx = Number(value);
    const known = keyed !== undefined;
    const right = known && idx === keyed;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[14px] text-[#33465F]">
          {known && (right ? <Check className="w-4 h-4 text-[#10B981]" strokeWidth={3} /> : <X className="w-4 h-4 text-[#E11D48]" strokeWidth={3} />)}
          <span><b>Your answer: {LETTERS[idx] ?? '?'}.</b> {q.options?.[idx] ?? ''}</span>
        </div>
        {known && !right && (
          <div className="text-[13.5px] text-[#0B7A54]"><b>Correct answer: {LETTERS[keyed]}.</b> {q.options?.[keyed] ?? ''}</div>
        )}
      </div>
    );
  }
  if (hasFile(value)) {
    if (link === undefined) return <div className="h-32 w-48 rounded-xl bg-[#EEF2F7] animate-pulse" />;
    if (!link) return <p className="text-[13px] text-[#7A8699]">Your photo couldn’t be loaded just now.</p>;
    return (
      <a href={link} target="_blank" rel="noreferrer" className="inline-block rounded-xl overflow-hidden border border-[#E8EDF4]">
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private link */}
        <img src={link} alt="Your photo answer" className="max-h-72 max-w-full" />
      </a>
    );
  }
  return <p className="text-[14px] leading-[1.7] text-[#33465F] whitespace-pre-wrap bg-[#F7F9FB] rounded-xl px-4 py-3">{String(value)}</p>;
}
