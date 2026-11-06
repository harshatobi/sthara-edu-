'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { Chip } from '@/components/canon/ui';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Tutor session assignments on the teacher's Mastery Tracker (Socratic tutor PR2):
 * what is open or recently finished for a student on a chapter, and a small form to
 * assign one (this student or the whole class, normal or HOTS, optional due date and note).
 * Critical Gap ones are the system's: shown, not cancellable here.
 */

export interface TeacherTutorAssignment {
  id: string; studentId: string; topic: string; mode: 'standard' | 'hots'; source: 'critical_gap' | 'teacher';
  status: 'open' | 'done' | 'cleared' | 'cancelled'; dueOn: string | null; note: string | null; score: number | null;
  batchId: string | null; mine: boolean; createdAt: string; closedAt: string | null; closeReason: string | null; depth: number | null;
}

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function useTutorAssignments(cls: string, subject: string) {
  const { getAuthToken } = useAuth();
  const tokenRef = useRef(getAuthToken);
  useEffect(() => { tokenRef.current = getAuthToken; });
  const [items, setItems] = useState<TeacherTutorAssignment[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!cls || !subject) return;
    let on = true;
    (async () => {
      try {
        const res = await fetch(`/api/teacher/tutor-assignments?${new URLSearchParams({ class: cls, subject })}`, { headers: { Authorization: `Bearer ${await tokenRef.current()}` } });
        const d = await res.json().catch(() => ({}));
        if (on && res.ok) setItems(d.assignments ?? []);
      } catch { /* the tracker works without it */ }
    })();
    return () => { on = false; };
  }, [cls, subject, tick]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  const call = useCallback(async (method: 'POST' | 'DELETE', q: string, body?: unknown) => {
    const res = await fetch(`/api/teacher/tutor-assignments${q}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenRef.current()}` }, body: body ? JSON.stringify(body) : undefined,
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Something went wrong.');
    return d;
  }, []);
  return { items, reload, call };
}

export function TutorAssign({ cls, subject, chapter, score, student, firstName, api }: {
  cls: string; subject: string; chapter: string; score: number | null; student: string; firstName: string;
  api: ReturnType<typeof useTutorAssignments>;
}) {
  const mine = api.items.filter(a => a.studentId === student && key(a.topic) === key(chapter));
  const open = mine.filter(a => a.status === 'open');
  const last = mine.find(a => a.status === 'done');
  const [form, setForm] = useState(false);
  const [mode, setMode] = useState<'standard' | 'hots'>(score !== null && score >= 90 ? 'hots' : 'standard');
  const [who, setWho] = useState<'student' | 'class'>('student');
  const [dueOn, setDueOn] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const assign = async () => {
    setBusy(true); setMsg(null);
    try {
      const d = await api.call('POST', '', { class: cls, subject, topic: chapter, mode, dueOn: dueOn || undefined, note: note.trim() || undefined, ...(who === 'student' ? { studentIds: [student] } : {}) });
      setMsg({ ok: true, text: who === 'class' ? `Assigned to ${d.created} student${d.created === 1 ? '' : 's'}${d.already ? ` (${d.already} already had one)` : ''}.` : d.created ? `Assigned to ${firstName}.` : `${firstName} already has one open on this chapter.` });
      setForm(false); setNote(''); api.reload();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not assign.' }); }
    finally { setBusy(false); }
  };
  const cancel = async (a: TeacherTutorAssignment) => {
    setBusy(true); setMsg(null);
    try { await api.call('DELETE', `?id=${encodeURIComponent(a.id)}`); api.reload(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not cancel.' }); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Sparkle size={14} weight="fill" color="var(--purple)" aria-hidden="true" />
        {open.map(a => (
          <span key={a.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <Chip tone={a.source === 'critical_gap' ? 'r' : 'p'}>
              {a.source === 'critical_gap' ? `TUTOR SESSION ASSIGNED · CRITICAL GAP ${a.score !== null ? `${Math.floor(a.score)}%` : ''}` : `TUTOR SESSION${a.mode === 'hots' ? ' (HOTS)' : ''} ASSIGNED${a.dueOn ? ` · DUE ${a.dueOn}` : ''}`}
            </Chip>
            {a.source === 'teacher' && a.mine && <button className="btn sm" onClick={() => cancel(a)} disabled={busy}>Cancel</button>}
          </span>
        ))}
        {!open.length && last && <span className="muted" style={{ fontSize: 12 }}>Tutor session finished{last.depth !== null ? `, depth ${Math.round(last.depth)}` : ''}{last.closedAt ? ` on ${new Date(last.closedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}.</span>}
        {!form && <button className="btn sm" onClick={() => { setForm(true); setMsg(null); }} disabled={busy}>Assign tutor session</button>}
      </div>
      {form && (
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }} onSubmit={e => { e.preventDefault(); void assign(); }}>
          <label style={{ fontSize: 12 }}>For<br />
            <select className="tin" value={who} onChange={e => setWho(e.target.value as 'student' | 'class')}>
              <option value="student">{firstName}</option><option value="class">The whole of {cls}</option>
            </select>
          </label>
          <label style={{ fontSize: 12 }}>Level<br />
            <select className="tin" value={mode} onChange={e => setMode(e.target.value as 'standard' | 'hots')}>
              <option value="standard">Normal session</option><option value="hots">HOTS / Olympiad</option>
            </select>
          </label>
          <label style={{ fontSize: 12 }}>Due (optional)<br /><input className="tin" type="date" value={dueOn} onChange={e => setDueOn(e.target.value)} /></label>
          <label style={{ fontSize: 12, flex: '1 1 200px' }}>Note for the student (optional)<br /><input className="tin" style={{ width: '100%' }} maxLength={300} value={note} onChange={e => setNote(e.target.value)} /></label>
          <button className="btn ai sm" disabled={busy}>Assign</button>
          <button type="button" className="btn sm" onClick={() => setForm(false)} disabled={busy}>Close</button>
        </form>
      )}
      {msg && <div className={`note${msg.ok ? '' : ' err'}`} role="status" style={{ marginTop: 8 }}>{msg.text}</div>}
    </div>
  );
}
