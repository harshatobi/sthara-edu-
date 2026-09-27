'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, X, CalendarRange } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import { displayClass, normClass } from '@/lib/teacher/scope';

interface Row { class: string; subject: string }

const COMMON_SUBJECTS = ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam', 'Marathi', 'Sanskrit', 'Mathematics', 'Science', 'Physics', 'Chemistry', 'Biology',
  'Social Science', 'History', 'Geography', 'Economics', 'Political Science', 'Accountancy', 'Business Studies', 'Computer Science', 'Informatics Practices',
  'Physical Education', 'Art', 'Music', 'Dance', 'EVS', 'General Knowledge'];

/**
 * A teacher's classes and subjects, edited by the school. What they teach decides which classes they can set work
 * for, mark and see; "From the timetable" adds every class + subject the published timetable gives them.
 */
export default function TeacherAssignmentsEditor({ teacher, schoolId, sections, subjectsInUse, onClose, onSaved }: {
  teacher: { id: string; name: string; assignments?: Row[]; teacher_class?: string | null };
  schoolId: string; sections: string[]; subjectsInUse: string[]; onClose: () => void; onSaved: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => (teacher.assignments?.length ? teacher.assignments.map(a => ({ ...a })) : [{ class: '', subject: '' }]));
  const [classTeacherOf, setClassTeacherOf] = useState(teacher.teacher_class || '');
  const [fromTimetable, setFromTimetable] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = createClient();
      const { data: v } = await db.from('timetable_versions').select('id').eq('school_id', schoolId).eq('status', 'published')
        .lte('effective_from', new Date().toISOString().slice(0, 10)).order('effective_from', { ascending: false }).limit(1).maybeSingle();
      if (!v) return;
      const { data } = await db.from('timetable_slots').select('class, subject').eq('version_id', v.id).eq('teacher_id', teacher.id);
      if (!cancelled) setFromTimetable([...new Map((data || []).map(s => [`${normClass(s.class)}|${s.subject.toLowerCase()}`, { class: s.class, subject: s.subject }])).values()]);
    })();
    return () => { cancelled = true; };
  }, [schoolId, teacher.id]);

  const allSections = useMemo(() => [...new Set([...sections, ...fromTimetable.map(r => r.class), ...rows.map(r => r.class)].filter(Boolean).map(displayClass))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })), [sections, fromTimetable, rows]);
  const missing = fromTimetable.filter(t => !rows.some(r => normClass(r.class) === normClass(t.class) && r.subject.trim().toLowerCase() === t.subject.toLowerCase()));
  const set = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async (newSections = false) => {
    setBusy(true); setErr(null);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/users/assignments', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: teacher.id, subjects: rows.filter(r => r.class.trim() || r.subject.trim()), classTeacherOf: classTeacherOf || null, newSections }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error || 'Could not save.'); setUnknown(data.unknown || []); return; }
      onSaved();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ta-title" className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1">
            <h2 id="ta-title" className="text-lg font-bold text-slate-900">{teacher.name}: classes &amp; subjects</h2>
            <p className="text-sm text-slate-500 mt-1">What a teacher teaches decides which classes they can set work for, mark and see.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        {missing.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-900 flex items-center gap-3">
            <CalendarRange className="w-4 h-4 shrink-0" />
            <span className="flex-1">The published timetable also has them teaching {missing.map(m => `${m.subject} (${m.class})`).join(', ')}.</span>
            <button className="font-semibold underline" onClick={() => setRows(rs => [...rs.filter(r => r.class.trim() || r.subject.trim()), ...missing])}>Add these</button>
          </div>
        )}

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input aria-label="Class" list="ta-sections" value={r.class} onChange={e => set(i, { class: e.target.value })} placeholder="Class 10-A"
                className="w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <input aria-label="Subject" list="ta-subjects" value={r.subject} onChange={e => set(i, { subject: e.target.value })} placeholder="Mathematics"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <button aria-label="Remove row" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} className="p-2 text-slate-400 hover:text-red-600 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <datalist id="ta-sections">{allSections.map(s => <option key={s} value={s} />)}</datalist>
        <datalist id="ta-subjects">{[...new Set([...subjectsInUse, ...COMMON_SUBJECTS])].sort().map(s => <option key={s} value={s} />)}</datalist>
        <button onClick={() => setRows(rs => [...rs, { class: '', subject: '' }])} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700"><Plus className="w-4 h-4" /> Add a class and subject</button>

        <label className="block mt-5 text-xs font-bold tracking-wider text-slate-500" htmlFor="ta-ct">CLASS TEACHER OF</label>
        <select id="ta-ct" value={classTeacherOf} onChange={e => setClassTeacherOf(e.target.value)} className="mt-1 w-60 border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="">Not a class teacher</option>
          {allSections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {err && <div role="alert" className="mt-4 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-800">{err}</div>}
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn">Cancel</button>
          {unknown.length > 0 && <button disabled={busy} onClick={() => save(true)} className="btn">Add {unknown.join(', ')} and save</button>}
          <button disabled={busy} onClick={() => save(false)} className="btn pri">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
