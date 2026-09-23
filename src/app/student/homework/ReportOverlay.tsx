'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { Chip, scoreTone } from '@/components/canon/ui';
import { dmy } from '@/lib/student/shape';
import type { DeskAssignment } from '@/lib/student/types';

/** Plain-text report the student can keep — mockup downloadReport(). */
function reportText(a: DeskAssignment): string {
  const s = a.submission!;
  const lines = [a.title, `${a.subject} · Graded ${dmy(s.submittedAt)}`, `Score: ${s.score}/${s.total}`, '', 'AI FEEDBACK'];
  if (s.aiQuestions.length) {
    for (const q of s.aiQuestions) {
      lines.push('', `Q${q.questionNumber ?? '?'} — ${q.awardedScore ?? 0}/${q.maxScore ?? '—'}`);
      if (q.questionText) lines.push(q.questionText);
      if (q.whatStudentGotRight) lines.push(`What went right: ${q.whatStudentGotRight}`);
      if (q.lostMarksReason) lines.push(`Where marks were lost: ${q.lostMarksReason}`);
      if (q.howToFix) lines.push('Correct method:', q.howToFix);
    }
  }
  if (s.feedback) lines.push('', s.feedback);
  return lines.join('\n');
}

export default function ReportOverlay({ a, live, onClose }: { a: DeskAssignment; live: boolean; onClose: () => void }) {
  const s = a.submission!;
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    backRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([reportText(a)], { type: 'text/plain;charset=utf-8' }));
    const el = document.createElement('a');
    el.href = url; el.download = `${a.title.replace(/[^\w\- ]+/g, '').trim()} report.txt`;
    document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="ws" role="dialog" aria-modal="true" aria-labelledby="rpt-title">
      <div className="ws-body"><div className="ws-main">
        <button ref={backRef} className="ws-back" onClick={onClose}><ArrowLeft size={15} weight="bold" /> Back</button>
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Chip tone="n">{a.subject}</Chip>
                <Chip tone={scoreTone(s.score ?? 0, s.total ?? 0)}>GRADED — {s.score}/{s.total}</Chip>
              </div>
              <h2 id="rpt-title" style={{ fontSize: 28, fontWeight: 800, margin: '12px 0 6px' }}>{a.title}</h2>
              <div className="muted">Graded {dmy(s.submittedAt)}{a.proctored ? ' · proctored' : ''}</div>
            </div>
            <div className="acts">
              {live && <Link className="btn" href={`/student/homework/${a.id}`}>Open submission</Link>}
              <button className="btn" onClick={download}><DownloadSimple size={16} weight="bold" /> Download report</button>
            </div>
          </div>

          {a.desc && (
            <div style={{ background: '#EFF6FF', borderRadius: 14, padding: '18px 20px', margin: '22px 0 0' }}>
              <div style={{ color: 'var(--sky)', fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', marginBottom: 8 }}>ASSIGNMENT INSTRUCTIONS</div>
              <p style={{ fontSize: 14, lineHeight: 1.8, color: '#33465F' }}>{a.desc}</p>
            </div>
          )}

          <div className="fb-head"><Sparkle size={13} weight="fill" /> AI FEEDBACK</div>

          {s.aiQuestions.map((q, i) => (
            <div key={i} className="g2" style={{ marginBottom: 22 }}>
              <div>
                <Chip tone={q.isFinalAnswerCorrect ? 'g' : 'r'}>
                  Q{q.questionNumber ?? i + 1} — {q.isFinalAnswerCorrect ? 'CORRECT' : `${q.awardedScore ?? 0}/${q.maxScore ?? '—'}`}
                </Chip>
                {q.questionText && <p style={{ fontSize: 14, fontWeight: 700, marginTop: 10 }}>{q.questionText}</p>}
                {q.lostMarksReason && <p style={{ fontSize: 14, lineHeight: 1.7, color: '#33465F', marginTop: 8 }}>{q.lostMarksReason}</p>}
                {q.whatStudentGotRight && <p className="muted" style={{ lineHeight: 1.7, marginTop: 8 }}><b>What went right:</b> {q.whatStudentGotRight}</p>}
              </div>
              {q.howToFix ? (
                <div className="mono-blk"><div className="hd" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Sparkle size={12} weight="fill" /> AI CORRECT METHOD</div>{q.howToFix}</div>
              ) : <div />}
            </div>
          ))}

          {s.feedback ? (
            s.aiQuestions.length
              ? <div className="note"><b>From your teacher:</b> {s.feedback}</div>
              : <p style={{ fontSize: 14.5, lineHeight: 1.8, color: '#33465F' }}>{s.feedback}</p>
          ) : !s.aiQuestions.length && <p className="muted">No written feedback on this one — the score is final.</p>}

          {s.teacherApproved && (
            <p className="muted" style={{ marginTop: 16, fontSize: 12.5 }}>Confirmed by your teacher. This score is already part of your True Mastery Level.</p>
          )}
        </div>
      </div></div>
    </div>
  );
}
