'use client';

import { useEffect, useMemo, useState } from 'react';
import { FloppyDiskIcon as FloppyDisk } from '@phosphor-icons/react/dist/ssr/FloppyDisk';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { CURRENT_SESSION } from '@/lib/curriculum';
import { useOptionalTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { isScienceSubject } from '@/lib/teacher/copilot';
import type { LabScene } from '@/lib/lab/registry';

export interface SavedRef { id: string; class: string; subject: string; lessonPlanId: string | null }

/**
 * Save the demo for one of the teacher's science classes, optionally attached
 * to one of that class's lesson plans. Editing your own saved demo updates it;
 * opening a colleague's saves a copy of your own.
 */
export default function SavePanel({ scene, saved, onSaved }: { scene: LabScene; saved: SavedRef | null; onSaved: (r: SavedRef) => void }) {
  const desk = useOptionalTeacherDesk();
  const { profile } = useAuth();
  const options = useMemo(() => {
    const scope = desk?.desk?.scope ?? [];
    const sci = scope.filter(e => isScienceSubject(e.subject));
    return (sci.length ? sci : scope).map(e => ({ key: `${e.cls}::${e.subject}`, cls: e.cls, subject: e.subject }));
  }, [desk?.desk?.scope]);
  const [pick, setPick] = useState(saved ? `${saved.class}::${saved.subject}` : '');
  const target = options.find(o => o.key === pick) ?? options[0] ?? null;
  const [lessons, setLessons] = useState<{ id: string; title: string; date: string | null }[]>([]);
  const [lesson, setLesson] = useState<string>(saved?.lessonPlanId ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // That class's lesson plans this session, soonest first, to attach the demo to.
  useEffect(() => {
    if (!profile?.schoolId || !target) return;
    let cancelled = false;
    createClient().from('lesson_plans').select('id, title, lesson_date').eq('school_id', profile.schoolId)
      .eq('class', target.cls).eq('subject', target.subject).eq('session', CURRENT_SESSION)
      .order('lesson_date', { ascending: true, nullsFirst: false }).limit(200)
      .then(({ data }) => { if (!cancelled) setLessons((data ?? []).map(l => ({ id: l.id, title: l.title, date: l.lesson_date }))); });
    return () => { cancelled = true; };
  }, [profile?.schoolId, target?.cls, target?.subject]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!desk) return null;
  if (!options.length) return <p className="muted">You aren&apos;t linked to a class yet, so demos can&apos;t be saved. You can still present and print them.</p>;

  const editing = !!saved && target?.cls === saved.class && target?.subject === saved.subject;
  const save = async () => {
    if (!target) return;
    setBusy(true); setMsg(null);
    try {
      const body = { scene, lessonPlanId: lesson || null };
      const r = editing
        ? await desk.call<any>('/api/teacher/lab', 'PATCH', { id: saved!.id, ...body })
        : await desk.call<any>('/api/teacher/lab', 'POST', { class: target.cls, subject: target.subject, ...body });
      onSaved({ id: r.id, class: r.class, subject: r.subject, lessonPlanId: r.lessonPlanId });
      setMsg({ ok: true, text: editing ? 'Changes saved.' : `Saved for ${target.cls}.` });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Could not save the demo.' });
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="lab-ctl">
        <label htmlFor="lab-save-class">For class</label>
        <select id="lab-save-class" value={target?.key ?? ''} onChange={e => { setPick(e.target.value); setLesson(''); }}>
          {options.map(o => <option key={o.key} value={o.key}>{o.cls} · {o.subject}</option>)}
        </select>
      </div>
      <div className="lab-ctl">
        <label htmlFor="lab-save-lesson">Attach to a lesson (optional)</label>
        <select id="lab-save-lesson" value={lesson} onChange={e => setLesson(e.target.value)}>
          <option value="">Not attached</option>
          {lessons.map(l => <option key={l.id} value={l.id}>{l.date ? `${l.date} · ` : ''}{l.title}</option>)}
        </select>
      </div>
      <button className="btn pri" onClick={save} disabled={busy}>
        {msg?.ok ? <Check size={15} weight="bold" /> : <FloppyDisk size={15} weight="bold" />} {busy ? 'Saving…' : editing ? 'Save changes' : 'Save demo'}
      </button>
      {msg && <p className="muted" role="status" style={msg.ok ? undefined : { color: 'var(--red)' }}>{msg.text}</p>}
    </>
  );
}
