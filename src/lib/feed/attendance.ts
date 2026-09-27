import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { displayClass, normClass } from '@/lib/teacher/scope';
import type { FeedCaller } from './access';
import { teaches } from './access';
import { detectAbsenceStreaks, detectExamAbsences, istDay, DAY_MS } from './rules';
import { classTeachersOf, raise } from './raise';
import { notifyGuardians } from '@/lib/parent/notify';

export type Mark = 'present' | 'absent' | 'late' | 'excused';
const STATUSES = new Set<Mark>(['present', 'absent', 'late', 'excused']);
/** How far back a register can be marked or corrected. */
export const BACKDATE_DAYS = 7;

export class RegisterError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

export interface RosterStudent { id: string; name: string; rollNo: string; cls: string }

/** A class's students in register order: roll number (natural), then name. */
export async function classRoster(db: SupabaseClient, schoolId: string, cls: string): Promise<RosterStudent[]> {
  const { data } = await db.from('users').select('id, name, student_class, custom_student_id').eq('school_id', schoolId).eq('role', 'student');
  return (data || []).filter(s => normClass(s.student_class) === normClass(cls))
    .map(s => ({ id: s.id, name: s.name || 'Student', rollNo: s.custom_student_id || '', cls: s.student_class || '' }))
    .sort((a, b) => a.rollNo.localeCompare(b.rollNo, 'en', { numeric: true }) || a.name.localeCompare(b.name));
}

/**
 * Checks and saves a register: the class teacher marks their class (a class with no class
 * teacher can be marked by any of its teachers); today or up to a week back; never the
 * future or a Sunday. Then runs the absence-streak and exam-day checks for the class.
 */
export async function saveRegister(db: SupabaseClient, me: FeedCaller, cls: string, day: string, marks: { studentId: string; status: string; note?: string | null }[]) {
  if (me.role !== 'teacher') throw new RegisterError('Attendance is marked by the class teacher.', 403);
  if (!normClass(cls)) throw new RegisterError('Which class?');
  const today = istDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new RegisterError('Which day?');
  if (day > today) throw new RegisterError("You can't mark attendance for a future day.");
  if (day < istDay(new Date(Date.now() - BACKDATE_DAYS * DAY_MS))) throw new RegisterError(`Attendance can be corrected up to ${BACKDATE_DAYS} days back. Ask the office for older changes.`);
  if (new Date(`${day}T00:00:00Z`).getUTCDay() === 0) throw new RegisterError('That day is a Sunday.');
  if (!marks.length || marks.length > 200) throw new RegisterError('Mark at least one student.');
  if (me.classTeacherOf !== normClass(cls)) {
    const cts = await classTeachersOf(db, me.schoolId, cls);
    if (cts.length || !teaches(me, cls)) throw new RegisterError(`Only the class teacher of ${displayClass(cls)} marks its attendance.`, 403);
  }
  const roster = await classRoster(db, me.schoolId, cls);
  const inClass = new Map(roster.map(s => [s.id, s]));
  const rows = [];
  for (const m of marks) {
    if (!inClass.has(m.studentId)) throw new RegisterError('One of those students is not in this class.');
    if (!STATUSES.has(m.status as Mark)) throw new RegisterError('Each student needs present, absent, late or excused.');
    const note = typeof m.note === 'string' && m.note.trim() ? m.note.trim().slice(0, 300) : null;
    rows.push({ school_id: me.schoolId, student_id: m.studentId, class_name: displayClass(cls), day, status: m.status as Mark, note, marked_by: me.id, marked_at: new Date().toISOString() });
  }
  const { data: before } = await db.from('attendance').select('student_id, status').eq('day', day).in('student_id', rows.map(r => r.student_id));
  const wasAbsent = new Set((before || []).filter(b => b.status === 'absent').map(b => b.student_id));
  const { error } = await db.from('attendance').upsert(rows, { onConflict: 'student_id,day' });
  if (error) {
    console.error('[attendance]', error.message);
    throw new RegisterError('Could not save the register. Try again.', 500);
  }
  let raised = 0;
  try {
    const { data: history } = await db.from('attendance').select('student_id, class_name, day, status')
      .in('student_id', [...inClass.keys()]).gte('day', istDay(new Date(Date.now() - 30 * DAY_MS)));
    const { data: due } = await db.from('assignments').select('id, teacher_id, title, type, subject, class, due_date, status, assigned_student_ids, proctored')
      .eq('school_id', me.schoolId).eq('due_date', day);
    const students = roster.map(s => ({ id: s.id, name: s.name, student_class: s.cls }));
    raised = (await raise(db, me.schoolId, [
      ...detectAbsenceStreaks(history || [], students),
      ...detectExamAbsences(rows.map(r => ({ student_id: r.student_id, class_name: r.class_name, day, status: r.status })), due || [], students),
    ])).created;
  } catch (e: any) {
    console.warn('[attendance] feed checks failed:', e?.message);
  }
  // Parents hear the same day when their child is newly marked absent (in the app, and on WhatsApp if they opted in).
  if (day === today) {
    for (const r of rows.filter(x => x.status === 'absent' && !wasAbsent.has(x.student_id))) {
      const s = inClass.get(r.student_id)!;
      await notifyGuardians(db, {
        schoolId: me.schoolId, studentId: r.student_id, type: 'attendance', pref: 'alerts',
        title: `${s.name.split(' ')[0]} is marked absent today`,
        body: `${s.name} was marked absent in ${displayClass(cls)} today (${day}). If this is unexpected, reply to the class teacher from Messages.`,
        metadata: { day, class: displayClass(cls) },
      });
    }
  }
  const counts = rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {} as Record<string, number>);
  return { saved: rows.length, counts, raised, rows };
}
