'use client';

import { useState } from 'react';
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from '@phosphor-icons/react/dist/ssr/ArrowCounterClockwise';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { dmy, type TSubmission } from '@/lib/teacher/desk';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';

/**
 * Undo for grading. A confirmed grade can be reopened for review (its marks leave
 * TML until confirmed again; the old marks and the reason are kept). Work still
 * waiting for review can be discarded (a wrong capture) or returned to the student
 * (so they hand it in again); its photos are deleted. Both need a reason.
 */
export default function Reversals({ sub, onDone }: { sub: TSubmission; onDone: (msg: string, removed: boolean) => void }) {
  const { call, reload } = useTeacherDesk();
  const [mode, setMode] = useState<null | 'reopen' | 'remove'>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const graded = sub.state === 'graded';
  const fromStudent = sub.source !== 'teacher_capture';
  const removeLabel = fromStudent ? 'Return to student' : 'Discard capture';

  async function run() {
    setBusy(true); setError(null);
    try {
      if (mode === 'reopen') {
        await call('/api/teacher/submissions', 'PATCH', { submissionId: sub.id, action: 'reopen', reason });
        onDone('Reopened for review: the mark no longer counts until you confirm it', false);
      } else {
        await call('/api/teacher/submissions', 'DELETE', { submissionId: sub.id, reason });
        onDone(fromStudent ? `Returned to ${sub.studentName.split(' ')[0]}` : 'Capture discarded', true);
      }
      setMode(null); setReason(''); reload();
    } catch (e: any) { setError(e?.message || 'That didn’t work.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="rv">
      {sub.history.length > 0 && (
        <div className="rv-hist">
          <b><ClockCounterClockwise size={13} weight="bold" /> History</b>
          {sub.history.slice().reverse().map((h, i) => (
            <div key={i}>
              Reopened {dmy(h.at)}{h.byName ? ` by ${h.byName}` : ''}: &ldquo;{h.reason}&rdquo;. Withdrawn mark {h.previous.score ?? '—'}/{h.previous.max ?? '—'}
              {h.previous.marks.length > 1 ? ` (${h.previous.marks.join(', ')})` : ''}.
            </div>
          ))}
        </div>
      )}
      {!mode && (
        <div className="rv-acts">
          {graded
            ? <button className="btn sm" onClick={() => setMode('reopen')}><ArrowCounterClockwise size={13} weight="bold" /> Reopen for review</button>
            : <button className="btn sm" onClick={() => setMode('remove')}><Trash size={13} weight="bold" /> {removeLabel}</button>}
        </div>
      )}
      {mode && (
        <div className="rv-confirm">
          <label htmlFor="rv-reason">
            {mode === 'reopen'
              ? `Why reopen? The mark stops counting toward ${sub.studentName.split(' ')[0]}'s TML until you confirm again; the student and family are told it's being re-checked.`
              : fromStudent
                ? `Why return it? ${sub.studentName.split(' ')[0]} is told and can hand it in again. The photos are deleted.`
                : 'Why discard? The captured photos and the AI reading are deleted.'}
          </label>
          <input id="rv-reason" className="cmp-in" value={reason} maxLength={500} onChange={e => setReason(e.target.value)}
            placeholder={mode === 'reopen' ? 'e.g. Marked Q3 too harshly; checking against the scheme' : fromStudent ? 'e.g. Page 2 is missing' : 'e.g. Wrong notebook photographed'} />
          {error && <div className="err" role="alert">{error}</div>}
          <div className="rv-acts">
            <button className="btn sm" onClick={() => { setMode(null); setError(null); }}>Cancel</button>
            <button className="btn sm red" disabled={busy || reason.trim().length < 3} onClick={() => void run()}>
              {busy ? 'Working…' : mode === 'reopen' ? 'Reopen' : removeLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
