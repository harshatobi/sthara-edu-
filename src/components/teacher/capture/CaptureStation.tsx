'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { CameraIcon as Camera } from '@phosphor-icons/react/dist/ssr/Camera';
import { ImagesIcon as Images } from '@phosphor-icons/react/dist/ssr/Images';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { Chip } from '@/components/canon/ui';
import { useAuth } from '@/contexts/AuthContext';
import { compressPhoto, uploadPages } from '@/lib/grading/compress';
import type { TAssignment, TStudent } from '@/lib/teacher/desk';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';

const MAX_PAGES = 8;

type Job =
  | { state: 'preparing' | 'uploading'; done: number; total: number }
  | { state: 'reading' }
  | { state: 'ready'; suggested: number; max: number; check: number }
  | { state: 'failed'; error: string };

interface Shot { id: string; blob: Blob; url: string }

/**
 * Capture station: the teacher photographs each student's notebook (phone camera
 * or gallery), and the AI reads it in the background while they move on to the
 * next child. Each result lands in the assignment as work waiting for review;
 * nothing counts until the teacher confirms it.
 */
export default function CaptureStation({ a, onClose, onReview }: { a: TAssignment; onClose: () => void; onReview: (submissionId: string) => void }) {
  const { call, reload } = useTeacherDesk();
  const { getAuthToken } = useAuth();
  const subBy = useMemo(() => new Map(a.submissions.map(s => [s.studentId, s])), [a.submissions]);
  const firstOpen = a.roster.find(s => !subBy.has(s.id))?.id ?? a.roster[0]?.id ?? null;
  const [active, setActive] = useState<string | null>(firstOpen);
  const [shots, setShots] = useState<Record<string, Shot[]>>({});
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  // Revoke preview URLs on unmount.
  const shotsRef = useRef(shots);
  useEffect(() => { shotsRef.current = shots; }, [shots]);
  useEffect(() => () => { for (const list of Object.values(shotsRef.current)) for (const s of list) URL.revokeObjectURL(s.url); }, []);

  const student = a.roster.find(s => s.id === active) ?? null;
  const mine = active ? shots[active] ?? [] : [];
  // "Not yet in" still shows the notebooks captured in this session, so their progress stays visible.
  const list = a.roster.filter(s => !onlyOpen || !subBy.has(s.id) || !!jobs[s.id] || s.id === active);
  const capturedHere = Object.values(jobs).filter(j => j.state === 'ready').length;

  // Agreement: of the AI marks teachers reviewed on this assignment, how many they kept.
  const agree = useMemo(() => {
    let kept = 0, total = 0;
    for (const s of a.submissions) { const r = s.grade?.review; if (r) { kept += r.kept; total += r.kept + r.changed; } }
    return total ? Math.round((kept / total) * 100) : null;
  }, [a.submissions]);

  async function addFiles(files: FileList | null) {
    if (!files?.length || !active) return;
    setErr(null);
    const room = MAX_PAGES - mine.length;
    const take = [...files].slice(0, room);
    if (files.length > room) setErr(`Up to ${MAX_PAGES} pages per student.`);
    try {
      const prepared = await Promise.all(take.map(async f => { const blob = await compressPhoto(f); return { id: Math.random().toString(36).slice(2), blob, url: URL.createObjectURL(blob) }; }));
      setShots(x => ({ ...x, [active]: [...(x[active] ?? []), ...prepared] }));
    } catch (e: any) { setErr(e?.message || 'That photo couldn’t be used.'); }
  }

  function removeShot(id: string) {
    if (!active) return;
    setShots(x => {
      const gone = (x[active] ?? []).find(s => s.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return { ...x, [active]: (x[active] ?? []).filter(s => s.id !== id) };
    });
  }

  /** Upload and read in the background; the teacher moves to the next student straight away. */
  async function send() {
    if (!student || !mine.length) return;
    const sid = student.id;
    const blobs = mine.map(s => s.blob);
    setJobs(j => ({ ...j, [sid]: { state: 'uploading', done: 0, total: blobs.length } }));
    const next = a.roster.find(s => s.id !== sid && !subBy.has(s.id) && !jobs[s.id]);
    setActive(next?.id ?? null);
    try {
      const token = await getAuthToken();
      const paths = await uploadPages(token, a.id, sid, blobs, done => setJobs(j => ({ ...j, [sid]: { state: 'uploading', done, total: blobs.length } })));
      setJobs(j => ({ ...j, [sid]: { state: 'reading' } }));
      const r = await call<{ submissionId: string; grade: { suggestedTotal: number; max: number; questions: { confidence: string }[] } }>('/api/teacher/capture', 'POST', { assignmentId: a.id, studentId: sid, pages: paths });
      setResults(x => ({ ...x, [sid]: r.submissionId }));
      setJobs(j => ({ ...j, [sid]: { state: 'ready', suggested: r.grade.suggestedTotal, max: r.grade.max, check: r.grade.questions.filter(q => q.confidence === 'low').length } }));
      setShots(x => { for (const s of x[sid] ?? []) URL.revokeObjectURL(s.url); const { [sid]: _, ...rest } = x; return rest; });
      reload();
    } catch (e: any) {
      setJobs(j => ({ ...j, [sid]: { state: 'failed', error: e?.message || 'Something went wrong.' } }));
    }
  }

  const chipFor = (s: TStudent) => {
    const j = jobs[s.id];
    if (j) {
      if (j.state === 'uploading' || j.state === 'preparing') return <Chip tone="b" className="xs">Uploading {j.done}/{j.total}</Chip>;
      if (j.state === 'reading') return <Chip tone="p" className="xs">AI reading</Chip>;
      if (j.state === 'ready') return <Chip tone="a" className="xs">To review · AI {j.suggested}/{j.max}</Chip>;
      return <Chip tone="r" className="xs">Failed</Chip>;
    }
    const sub = subBy.get(s.id);
    if (!sub) return <Chip tone="n" className="xs">Not in</Chip>;
    return sub.state === 'graded' && sub.score !== null ? <Chip tone="g" className="xs">Graded {sub.score}/{sub.max}</Chip> : <Chip tone="a" className="xs">To review</Chip>;
  };
  const inCount = a.roster.filter(s => subBy.has(s.id) || (jobs[s.id] && jobs[s.id].state !== 'failed')).length;

  const job = active ? jobs[active] : undefined;
  const existing = active ? subBy.get(active) : undefined;

  return (
    <div className="ws" role="dialog" aria-modal="true" aria-labelledby="cs-title">
      <div className="ws-head">
        <button className="ws-back" onClick={onClose}><ArrowLeft size={15} weight="bold" /> Done</button>
        <div>
          <h1 id="cs-title">Capture notebooks</h1>
          <div className="sub">{a.title} · {a.cls} · {a.questions.length ? `${a.questions.length} questions` : 'marked as a whole'}</div>
        </div>
        <div className="cs-stats">
          <span><b>{inCount}</b>/{a.roster.length} in</span>
          {capturedHere > 0 && <span><b>{capturedHere}</b> read this session</span>}
          {agree !== null && <span title="Of the AI's per-question marks you reviewed here, the share you kept"><b>{agree}%</b> AI marks kept</span>}
        </div>
      </div>
      <div className="cs-body">
        <aside className="card cs-roster">
          <div className="cs-roster-hd">
            <b>{a.cls}</b>
            <label className="cs-toggle"><input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} /> Not yet in</label>
          </div>
          {list.map(s => (
            <button key={s.id} className={`cs-kid${s.id === active ? ' on' : ''}`} onClick={() => { setActive(s.id); setErr(null); }}>
              <span className="cs-kid-n"><b>{s.name}</b>{s.rollNo && <i className="mono">{s.rollNo}</i>}</span>
              {chipFor(s)}
            </button>
          ))}
          {!list.length && <p className="muted" style={{ padding: 16, fontSize: 13 }}>Everyone&apos;s work is in. Untick &quot;Not yet in&quot; to see the whole class.</p>}
        </aside>

        <section className="card cs-shoot">
          {!student ? (
            <div className="cs-done">
              <CheckCircle size={40} weight="duotone" color="#10B981" />
              <h2>All notebooks captured</h2>
              <p className="muted">The AI is reading any that are still in progress. Review them from the assignment when they&apos;re ready.</p>
              <button className="btn pri" onClick={onClose}>Back to the assignment</button>
            </div>
          ) : (
            <>
              <div className="cs-who">
                <div><h2>{student.name}</h2><div className="muted">{student.rollNo ? `Roll ${student.rollNo} · ` : ''}{mine.length} of {MAX_PAGES} pages</div></div>
                {job?.state === 'ready' && results[student.id] && <button className="btn" onClick={() => onReview(results[student.id])}>Review now <ArrowRight size={14} weight="bold" /></button>}
              </div>

              {existing && !job && (
                <div className="note" style={{ marginBottom: 14 }}>
                  {existing.state === 'graded' ? `Already graded ${existing.score}/${existing.max}. Capturing again isn’t possible: open the submission to change marks.` : `${student.name.split(' ')[0]}'s work is already in and waiting for review. New photos replace the old pages and the AI reads them again.`}
                </div>
              )}
              {job?.state === 'failed' && <div className="note err" style={{ marginBottom: 14 }}><Warning size={14} weight="bold" /> {job.error} The photos are kept below: send again.</div>}
              {job && (job.state === 'uploading' || job.state === 'reading') && (
                <div className="note info" style={{ marginBottom: 14 }}><Sparkle size={14} weight="fill" /> {job.state === 'reading' ? 'The AI is reading this notebook.' : 'Uploading pages.'} You can carry on with the next student.</div>
              )}

              <div className="cs-shots">
                {mine.map((s, i) => (
                  <figure key={s.id} className="cs-shot">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.url} alt={`Page ${i + 1}`} />
                    <figcaption>Page {i + 1}</figcaption>
                    <button onClick={() => removeShot(s.id)} aria-label={`Remove page ${i + 1}`}><X size={12} weight="bold" /></button>
                  </figure>
                ))}
                {mine.length < MAX_PAGES && existing?.state !== 'graded' && (!job || job.state === 'failed' || job.state === 'ready') && (
                  <div className="cs-add">
                    <button className="btn red" onClick={() => camRef.current?.click()}><Camera size={18} weight="fill" /> {mine.length ? 'Next page' : 'Photograph page 1'}</button>
                    <button className="btn" onClick={() => galRef.current?.click()}><Images size={16} weight="bold" /> From gallery</button>
                    <p className="muted">Flat on the desk, whole page in frame, good light. Photograph every page that has an answer.</p>
                  </div>
                )}
              </div>
              <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />
              <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />
              {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}

              <div className="cs-send">
                <span className="muted">The AI reads the handwriting and suggests a mark per question. You confirm every mark.</span>
                <button className="btn pri" disabled={!mine.length || existing?.state === 'graded' || job?.state === 'uploading' || job?.state === 'reading'} onClick={() => void send()}>
                  <Sparkle size={15} weight="fill" /> Read with AI and next
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
