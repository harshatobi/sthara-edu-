import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultKind, levelOf, planLinking, resolveSubject, type LegacyClass, type LegacyTeacher, type SubjectKind } from './catalog';

/**
 * Subject links, server side: the one write path for what a class offers, who
 * teaches it, which electives a student takes and who leads a subject. The
 * tables' triggers keep the legacy fields (classes.metadata.subjects,
 * users.assignments) in step and enrol students into core subjects.
 *
 * Every write is refused unless the records belong to the school, and every
 * subject must resolve to an official curriculum subject for that class level.
 */

type Db = SupabaseClient;
type Fail = { ok: false; error: string; status: number; [k: string]: unknown };
const fail = (error: string, status = 400, extra: Record<string, unknown> = {}): Fail => ({ ok: false, error, status, ...extra });

const norm = (c: string | null | undefined) => (c || '').toLowerCase().replace(/class|[^a-z0-9]/g, '');

/** Teacher modules that store (class, subject) as text: the lesson planner, syllabus, lessons, homework, timetable. */
const EVIDENCE = ['course_plans', 'syllabus_progress', 'lesson_plans', 'assignments', 'timetable_slots'] as const;
const EVIDENCE_LABEL: Record<(typeof EVIDENCE)[number], string> = {
  course_plans: 'lesson planner', syllabus_progress: 'syllabus progress', lesson_plans: 'lesson plans', assignments: 'homework', timetable_slots: 'timetable',
};

/** Every teacher module follows a subject's official name for this class (planner, syllabus, lessons, homework, timetable, TML). */
async function renameEverywhere(db: Db, schoolId: string, className: string, from: string, to: string) {
  if (!from.trim() || from.trim().toLowerCase() === to.toLowerCase()) return null;
  const { data, error } = await db.rpc('ops_rename_class_subject', { p_school: schoolId, p_class: className, p_from: from.trim(), p_to: to });
  if (error) throw new Error(`Couldn't rename ${from} to ${to} in ${className}: ${error.message}`);
  return data as Record<string, number>;
}

export interface ClassSubjectRow {
  id: string; class_id: string; subject_key: string; subject_name: string; level: string; kind: SubjectKind;
}

async function audit(db: Db, schoolId: string, actorId: string, actorRole: string, action: string, rowId: string, values: Record<string, unknown>) {
  const { error } = await db.from('audit_log').insert({
    actor_id: actorId, actor_role: actorRole, action, table_name: 'class_subjects', row_id: rowId, school_id: schoolId, new_values: values,
  });
  if (error) console.warn('[subjects audit]', error.message);
}

// ── Reading ───────────────────────────────────────────────────────────────────

export async function loadSubjectState(db: Db, schoolId: string) {
  const [classes, cs, ts, ss, leads, people, ...evidence] = await Promise.all([
    db.from('classes').select('id, name, metadata').eq('school_id', schoolId).order('name'),
    db.from('class_subjects').select('id, class_id, subject_key, subject_name, level, kind').eq('school_id', schoolId),
    db.from('teacher_subjects').select('id, teacher_id, class_subject_id, role').eq('school_id', schoolId),
    db.from('student_subjects').select('student_id, class_subject_id, source').eq('school_id', schoolId).limit(50_000),
    db.from('subject_leads').select('id, subject_key, subject_name, user_id').eq('school_id', schoolId),
    db.from('users').select('id, role, name, email, student_class, custom_student_id, assignments, metadata').eq('school_id', schoolId).in('role', ['student', 'teacher', 'admin']).order('name'),
    // Subjects the teacher modules already use for a class: evidence of what the class takes.
    ...EVIDENCE.map(t => db.from(t).select('class, subject').eq('school_id', schoolId).limit(20_000)),
  ]);
  const err = [classes, cs, ts, ss, leads, people].find(r => r.error)?.error;
  if (err) return fail(err.message, 500);
  // Per class: every subject name in use anywhere, and where it was seen.
  const seen = new Map<string, Map<string, Set<string>>>(); // norm class -> name -> sources
  const note = (cls: string, subject: string, source: string) => {
    const k = norm(cls), n = (subject || '').trim();
    if (!k || !n) return;
    if (!seen.has(k)) seen.set(k, new Map());
    const m = seen.get(k)!;
    const hit = [...m.keys()].find(x => x.toLowerCase() === n.toLowerCase()) ?? n;
    if (!m.has(hit)) m.set(hit, new Set());
    m.get(hit)!.add(source);
  };
  for (const c of classes.data || []) {
    const listed = (c.metadata as { subjects?: unknown } | null)?.subjects;
    if (Array.isArray(listed)) for (const x of listed) note(c.name, String(x), 'class list');
  }
  evidence.forEach((r, i) => { for (const row of (r.data || []) as { class: string | null; subject: string | null }[]) note(row.class ?? '', row.subject ?? '', EVIDENCE_LABEL[EVIDENCE[i]]); });
  for (const t of (people.data || []).filter(p => p.role === 'teacher')) {
    for (const a of Array.isArray(t.assignments) ? t.assignments : []) if (!(a as { linked?: boolean })?.linked) note(String(a?.class ?? ''), String(a?.subject ?? ''), 'teacher assignments');
  }
  const linkedNames = new Set((cs.data || []).map(r => `${r.class_id}|${r.subject_name.toLowerCase()}`));
  const legacyClasses: LegacyClass[] = (classes.data || []).map(c => ({
    id: c.id, name: c.name,
    subjects: [...(seen.get(norm(c.name))?.keys() ?? [])].filter(n => !linkedNames.has(`${c.id}|${n.toLowerCase()}`)),
  }));
  const sources: Record<string, Record<string, string[]>> = Object.fromEntries((classes.data || []).map(c => [c.id,
    Object.fromEntries([...(seen.get(norm(c.name)) ?? new Map<string, Set<string>>())].map(([n, set]) => [n, [...set]]))]));
  const linkedRows = (cs.data || []) as ClassSubjectRow[];
  const teachers = (people.data || []).filter(p => p.role === 'teacher');
  const legacyTeachers: LegacyTeacher[] = teachers.map(t => ({
    id: t.id, name: t.name,
    // Only entries not written from teacher_subjects are "legacy".
    assignments: (Array.isArray(t.assignments) ? t.assignments : []).filter((a: { linked?: boolean }) => !a?.linked)
      .map((a: { class?: unknown; subject?: unknown }) => ({ class: String(a?.class ?? ''), subject: String(a?.subject ?? '') })),
  }));
  const plan = planLinking(legacyClasses, linkedRows.map(r => ({ classId: r.class_id, subjectKey: r.subject_key, subjectName: r.subject_name, kind: r.kind })), legacyTeachers);
  return {
    ok: true as const,
    classes: (classes.data || []).map(c => ({ id: c.id as string, name: c.name as string, level: levelOf(c.name) })),
    classSubjects: linkedRows,
    teacherSubjects: (ts.data || []) as { id: string; teacher_id: string; class_subject_id: string; role: 'subject_teacher' | 'co_teacher' }[],
    enrolments: (ss.data || []) as { student_id: string; class_subject_id: string; source: SubjectKind }[],
    leads: (leads.data || []) as { id: string; subject_key: string; subject_name: string; user_id: string }[],
    people: (people.data || []).map(p => ({
      id: p.id as string, role: p.role as string, name: p.name as string, email: p.email as string,
      cls: p.student_class as string | null, rollNo: p.custom_student_id as string | null, left: !!(p.metadata as { left?: unknown } | null)?.left,
    })),
    plan,
    sources,
  };
}

/** A student's subjects with their curriculum identity and teachers (for the desk, tutor and TML). */
export async function enrolledSubjects(db: Db, studentId: string) {
  const { data, error } = await db.from('student_subjects')
    .select('source, class_subject_id, class_subjects(subject_key, subject_name, level, kind, class_id)')
    .eq('student_id', studentId);
  if (error) return [];
  const ids = (data || []).map(r => r.class_subject_id);
  const { data: t } = ids.length ? await db.from('teacher_subjects').select('class_subject_id, role, teacher_id, users(name)').in('class_subject_id', ids) : { data: [] };
  return (data || []).flatMap(r => {
    const cs = (Array.isArray(r.class_subjects) ? r.class_subjects[0] : r.class_subjects) as { subject_key: string; subject_name: string; level: string; kind: SubjectKind } | null;
    if (!cs) return [];
    return [{
      key: cs.subject_key, name: cs.subject_name, level: cs.level, source: r.source as SubjectKind, classSubjectId: r.class_subject_id as string,
      teachers: (t || []).filter(x => x.class_subject_id === r.class_subject_id).map(x => ({
        id: x.teacher_id as string, role: x.role as string,
        name: ((Array.isArray(x.users) ? x.users[0] : x.users) as { name?: string } | null)?.name ?? '',
      })),
    }];
  }).sort((a, b) => Number(a.source !== 'core') - Number(b.source !== 'core') || a.name.localeCompare(b.name));
}

// ── What a class offers ───────────────────────────────────────────────────────

export interface OfferItem { name: string; kind?: SubjectKind }

/**
 * Sets a class's subjects to exactly `items` (official subjects only). Removing a
 * subject that has teachers or chosen electives needs `confirmRemove`; the reply
 * says what would be lost. Legacy names that now resolve are dropped from the class's list.
 */
export async function setClassSubjects(db: Db, schoolId: string, actorId: string, actorRole: string, classId: string, items: OfferItem[], confirmRemove = false) {
  const { data: cls } = await db.from('classes').select('id, name, school_id, metadata').eq('id', classId).maybeSingle();
  if (!cls || cls.school_id !== schoolId) return fail('Class not found at this school.', 404);
  const level = levelOf(cls.name);
  if (!level) return fail(`Sthara has no curriculum for "${cls.name}" yet, so its subjects can't be linked.`);

  const { data: cur } = await db.from('class_subjects').select('id, subject_key, subject_name, kind').eq('class_id', classId);
  const have = new Map((cur || []).map(r => [r.subject_key, r]));
  const wanted = new Map<string, { key: string; name: string; kind: SubjectKind }>();
  const unknown: string[] = [];
  const renames: { from: string; to: string }[] = [];
  for (const it of items) {
    const o = resolveSubject(cls.name, it.name);
    if (!o) { unknown.push(it.name); continue; }
    if (it.name.trim().toLowerCase() !== o.name.toLowerCase()) renames.push({ from: it.name, to: o.name });
    // The first mention of a subject decides its kind (existing links are passed first, so they keep theirs).
    // No kind given: an existing link keeps its kind, a new one gets the default.
    if (!wanted.has(o.key)) wanted.set(o.key, { key: o.key, name: o.name, kind: it.kind ?? (have.get(o.key)?.kind as SubjectKind | undefined) ?? defaultKind(cls.name, o.name) });
  }
  if (unknown.length) {
    return fail(`${unknown.join(', ')} ${unknown.length === 1 ? "isn't an official subject" : "aren't official subjects"} for ${cls.name}. Pick from the curriculum list.`, 400, { unknown });
  }

  const removing = (cur || []).filter(r => !wanted.has(r.subject_key));
  if (removing.length && !confirmRemove) {
    const ids = removing.map(r => r.id);
    const [{ count: teachers }, { count: electives }] = await Promise.all([
      db.from('teacher_subjects').select('id', { count: 'exact', head: true }).in('class_subject_id', ids),
      db.from('student_subjects').select('id', { count: 'exact', head: true }).in('class_subject_id', ids).eq('source', 'elective'),
    ]);
    if ((teachers ?? 0) + (electives ?? 0) > 0) {
      return fail(`Removing ${removing.map(r => r.subject_name).join(', ')} from ${cls.name} unlinks ${teachers ?? 0} teacher assignment(s) and ${electives ?? 0} elective choice(s). Marks and mastery are kept.`, 409,
        { confirm: true, removing: removing.map(r => r.subject_name), teachers: teachers ?? 0, electives: electives ?? 0 });
    }
  }

  const adds = [...wanted.values()].filter(w => !have.has(w.key));
  const kindChanges = [...wanted.values()].filter(w => have.has(w.key) && have.get(w.key)!.kind !== w.kind);
  if (adds.length) {
    const { error } = await db.from('class_subjects').insert(adds.map(a => ({
      school_id: schoolId, class_id: classId, subject_key: a.key, subject_name: a.name, level, kind: a.kind, created_by: actorId,
    })));
    if (error) return fail(error.message, 500);
  }
  for (const k of kindChanges) {
    const { error } = await db.from('class_subjects').update({ kind: k.kind }).eq('id', have.get(k.key)!.id);
    if (error) return fail(error.message, 500);
  }
  if (removing.length) {
    const { error } = await db.from('class_subjects').delete().in('id', removing.map(r => r.id));
    if (error) return fail(error.message, 500);
  }
  // Legacy names that resolve to a subject now linked (e.g. "Maths") leave the class's list,
  // and the teacher modules' rows move to the official name.
  await dropResolvedLegacy(db, classId);
  const renamed: Record<string, number> = {};
  try {
    for (const r of renames) {
      const out = await renameEverywhere(db, schoolId, cls.name, r.from, r.to);
      for (const [k, v] of Object.entries(out ?? {})) renamed[k] = (renamed[k] ?? 0) + Number(v);
    }
  } catch (e) { return fail(e instanceof Error ? e.message : 'Rename failed', 500); }
  if (adds.length || kindChanges.length || removing.length) {
    await audit(db, schoolId, actorId, actorRole, 'class_subjects_set', classId, {
      class: cls.name, added: adds.map(a => `${a.name} (${a.kind})`), kind: kindChanges.map(k => `${k.name} -> ${k.kind}`), removed: removing.map(r => r.subject_name),
    });
  }
  return { ok: true as const, added: adds.length, changed: kindChanges.length, removed: removing.length, renamed };
}

async function dropResolvedLegacy(db: Db, classId: string) {
  const [{ data: cls }, { data: rows }] = await Promise.all([
    db.from('classes').select('id, name, metadata').eq('id', classId).maybeSingle(),
    db.from('class_subjects').select('subject_key, subject_name').eq('class_id', classId),
  ]);
  if (!cls) return;
  const meta = (cls.metadata || {}) as { subjects?: unknown; linkedSubjects?: unknown };
  const listed = Array.isArray(meta.subjects) ? meta.subjects.map(String) : [];
  const keys = new Set((rows || []).map(r => r.subject_key));
  const names = new Set((rows || []).map(r => r.subject_name.toLowerCase()));
  const kept = listed.filter(s => names.has(s.toLowerCase()) || !keys.has(resolveSubject(cls.name, s)?.key ?? ''));
  if (kept.length !== listed.length) await db.from('classes').update({ metadata: { ...meta, subjects: kept } }).eq('id', classId);
}

/** Removes a legacy (unlinkable) subject name from a class's list. */
export async function dropLegacyClassSubject(db: Db, schoolId: string, actorId: string, actorRole: string, classId: string, name: string) {
  const { data: cls } = await db.from('classes').select('id, school_id, name, metadata').eq('id', classId).maybeSingle();
  if (!cls || cls.school_id !== schoolId) return fail('Class not found at this school.', 404);
  const meta = (cls.metadata || {}) as { subjects?: unknown };
  const listed = Array.isArray(meta.subjects) ? meta.subjects.map(String) : [];
  const { data: linked } = await db.from('class_subjects').select('subject_name').eq('class_id', classId);
  if ((linked || []).some(l => l.subject_name.toLowerCase() === name.toLowerCase())) return fail(`${name} is linked; remove it from the class's subjects instead.`);
  const kept = listed.filter(s => s.toLowerCase() !== name.toLowerCase());
  if (kept.length === listed.length) return fail(`${name} isn't on ${cls.name}'s list.`, 404);
  const { error } = await db.from('classes').update({ metadata: { ...meta, subjects: kept } }).eq('id', classId);
  if (error) return fail(error.message, 500);
  await audit(db, schoolId, actorId, actorRole, 'class_subject_legacy_dropped', classId, { class: cls.name, subject: name });
  return { ok: true as const };
}

// ── Who teaches what ──────────────────────────────────────────────────────────

/**
 * Replaces a teacher's teaching links from (class, subject) pairs. Every pair must
 * be a subject the class offers (linked). The teacher's legacy entries are cleared:
 * an explicit edit is the full list.
 */
export async function setTeacherSubjects(db: Db, schoolId: string, actorId: string, actorRole: string, teacherId: string,
  pairs: { class: string; subject: string; role?: 'subject_teacher' | 'co_teacher' }[], classTeacherOf: string | null,
  /** Classes with no curriculum yet (Classes 1-7), or whose subjects aren't linked yet, keep plain entries instead of refusing. */
  opts: { allowLegacy?: boolean } = {}) {
  const { data: t } = await db.from('users').select('id, role, school_id').eq('id', teacherId).maybeSingle();
  if (!t || t.school_id !== schoolId || t.role !== 'teacher') return fail('Teacher not found in this school.', 404);
  const [{ data: classes }, { data: offered }] = await Promise.all([
    db.from('classes').select('id, name').eq('school_id', schoolId),
    db.from('class_subjects').select('id, class_id, subject_key, subject_name').eq('school_id', schoolId),
  ]);
  const classByNorm = new Map((classes || []).map(c => [norm(c.name), c]));
  const rows: { class_subject_id: string; role: string }[] = [];
  const problems: string[] = [];
  const renameLater: { cls: string; from: string; to: string }[] = [];
  const legacy: { class: string; subject: string }[] = [];
  const linkedClasses = new Set((offered || []).map(o => o.class_id));
  for (const p of pairs) {
    const c = classByNorm.get(norm(p.class));
    if (!c) { problems.push(`${p.class}: not a class at this school`); continue; }
    if (opts.allowLegacy && (!levelOf(c.name) || !linkedClasses.has(c.id))) { legacy.push({ class: c.name, subject: p.subject.trim() }); continue; }
    const o = resolveSubject(c.name, p.subject);
    const cs = o && (offered || []).find(x => x.class_id === c.id && x.subject_key === o.key);
    if (!o) { problems.push(`${c.name} ${p.subject}: not an official subject`); continue; }
    if (!cs) { problems.push(`${c.name} doesn't offer ${o.name} yet`); continue; }
    if (!rows.some(r => r.class_subject_id === cs.id)) rows.push({ class_subject_id: cs.id, role: p.role ?? 'subject_teacher' });
    if (p.subject.trim().toLowerCase() !== o.name.toLowerCase()) renameLater.push({ cls: c.name, from: p.subject, to: o.name });
  }
  if (problems.length) return fail(`Can't assign: ${problems.join('; ')}.`, 400, { problems });
  const ct = classTeacherOf ? classByNorm.get(norm(classTeacherOf)) : null;
  if (classTeacherOf && !ct) return fail(`Unknown class: ${classTeacherOf}`);

  // Clear legacy entries first, so the trigger rebuilds the list from links (plus any allowed plain entries).
  const { error: e1 } = await db.from('users').update({ assignments: legacy, teacher_class: ct?.name ?? null }).eq('id', teacherId);
  if (e1) return fail(e1.message, 500);
  const { data: cur } = await db.from('teacher_subjects').select('id, class_subject_id, role').eq('teacher_id', teacherId);
  const keep = new Set(rows.map(r => r.class_subject_id));
  const drop = (cur || []).filter(r => !keep.has(r.class_subject_id)).map(r => r.id);
  if (drop.length) await db.from('teacher_subjects').delete().in('id', drop);
  const upserts = rows.filter(r => !(cur || []).some(c => c.class_subject_id === r.class_subject_id && c.role === r.role));
  if (upserts.length) {
    const { error } = await db.from('teacher_subjects').upsert(
      upserts.map(r => ({ school_id: schoolId, teacher_id: teacherId, class_subject_id: r.class_subject_id, role: r.role, created_by: actorId })),
      { onConflict: 'teacher_id,class_subject_id' });
    if (error) return fail(error.message, 500);
  }
  if (!drop.length && !upserts.length) {
    // Nothing changed in the links: still rebuild the legacy fields (they were cleared above).
    await db.rpc('ops_resync_teacher', { p_teacher: teacherId });
  }
  try { for (const r of renameLater) await renameEverywhere(db, schoolId, r.cls, r.from, r.to); }
  catch (e) { return fail(e instanceof Error ? e.message : 'Rename failed', 500); }
  await audit(db, schoolId, actorId, actorRole, 'teacher_subjects_set', teacherId, {
    subjects: rows.length, classTeacherOf: ct?.name ?? null,
  });
  return { ok: true as const, linked: rows.length, unlinked: legacy.length };
}

// ── Electives ─────────────────────────────────────────────────────────────────

/** Sets the electives of students in one class: `choices[studentId] = classSubjectIds` (electives of that class only). */
export async function setElectives(db: Db, schoolId: string, actorId: string, actorRole: string, classId: string, choices: Record<string, string[]>) {
  const { data: cls } = await db.from('classes').select('id, name, school_id').eq('id', classId).maybeSingle();
  if (!cls || cls.school_id !== schoolId) return fail('Class not found at this school.', 404);
  const { data: electives } = await db.from('class_subjects').select('id, subject_name').eq('class_id', classId).eq('kind', 'elective');
  const allowed = new Set((electives || []).map(e => e.id));
  const ids = Object.keys(choices);
  if (!ids.length || ids.length > 300) return fail('Pick between 1 and 300 students.');
  const { data: students } = await db.from('users').select('id, role, school_id, student_class').in('id', ids);
  if ((students || []).length !== ids.length || students!.some(s => s.role !== 'student' || s.school_id !== schoolId || norm(s.student_class) !== norm(cls.name))) {
    return fail(`Every student must be in ${cls.name}.`, 404);
  }
  for (const [sid, picks] of Object.entries(choices)) {
    if (!Array.isArray(picks) || picks.some(p => !allowed.has(p))) return fail(`Only ${cls.name}'s electives can be chosen.`);
    void sid;
  }
  const { data: cur } = await db.from('student_subjects').select('id, student_id, class_subject_id').in('student_id', ids).eq('source', 'elective').in('class_subject_id', [...allowed].length ? [...allowed] : ['00000000-0000-0000-0000-000000000000']);
  const toDelete = (cur || []).filter(r => !choices[r.student_id].includes(r.class_subject_id)).map(r => r.id);
  const toInsert = Object.entries(choices).flatMap(([sid, picks]) => picks
    .filter(p => !(cur || []).some(r => r.student_id === sid && r.class_subject_id === p))
    .map(p => ({ school_id: schoolId, student_id: sid, class_subject_id: p, source: 'elective', created_by: actorId })));
  if (toDelete.length) { const { error } = await db.from('student_subjects').delete().in('id', toDelete); if (error) return fail(error.message, 500); }
  if (toInsert.length) { const { error } = await db.from('student_subjects').upsert(toInsert, { onConflict: 'student_id,class_subject_id' }); if (error) return fail(error.message, 500); }
  if (toDelete.length || toInsert.length) await audit(db, schoolId, actorId, actorRole, 'electives_set', classId, { class: cls.name, added: toInsert.length, removed: toDelete.length });
  return { ok: true as const, added: toInsert.length, removed: toDelete.length };
}

// ── Subject leads ─────────────────────────────────────────────────────────────

export async function setSubjectLeads(db: Db, schoolId: string, actorId: string, actorRole: string, subjectKey: string, userIds: string[]) {
  const { data: offered } = await db.from('class_subjects').select('subject_name').eq('school_id', schoolId).eq('subject_key', subjectKey).limit(1);
  if (!offered?.length) return fail('No class at this school offers that subject.', 404);
  const ids = [...new Set(userIds)].slice(0, 5);
  const { data: users } = ids.length ? await db.from('users').select('id, role, school_id').in('id', ids) : { data: [] };
  if ((users || []).length !== ids.length || (users || []).some(u => u.school_id !== schoolId || !['teacher', 'admin'].includes(u.role))) {
    return fail('A subject lead must be a teacher or office account of this school.', 404);
  }
  const { data: cur } = await db.from('subject_leads').select('id, user_id').eq('school_id', schoolId).eq('subject_key', subjectKey);
  const drop = (cur || []).filter(c => !ids.includes(c.user_id)).map(c => c.id);
  const add = ids.filter(id => !(cur || []).some(c => c.user_id === id));
  if (drop.length) await db.from('subject_leads').delete().in('id', drop);
  if (add.length) {
    const { error } = await db.from('subject_leads').insert(add.map(u => ({ school_id: schoolId, subject_key: subjectKey, subject_name: offered[0].subject_name, user_id: u, created_by: actorId })));
    if (error) return fail(error.message, 500);
  }
  await audit(db, schoolId, actorId, actorRole, 'subject_leads_set', schoolId, { subject: offered[0].subject_name, leads: ids.length });
  return { ok: true as const };
}

// ── Linking what a school already has ─────────────────────────────────────────

/**
 * Links every legacy class subject and teacher assignment that resolves to an
 * official subject. A teacher's subject the class didn't list is added to the
 * class too (the teacher teaching it is the evidence). Unresolvable entries are
 * left as they are and reported.
 */
export async function linkSchool(db: Db, schoolId: string, actorId: string, actorRole: string) {
  const st = await loadSubjectState(db, schoolId);
  if (!st.ok) return st;
  const { plan } = st;
  // classId -> raw name -> (official, kind). Raw names are passed on so every module is renamed.
  const offer = new Map<string, Map<string, { name: string; kind: SubjectKind }>>();
  const add = (classId: string, raw: string, name: string, kind: SubjectKind) => {
    if (!offer.has(classId)) offer.set(classId, new Map());
    if (!offer.get(classId)!.has(raw)) offer.get(classId)!.set(raw, { name, kind });
  };
  for (const c of plan.classes) for (const i of c.items) if (i.official && i.status !== 'no-match') add(c.classId, i.raw, i.official.name, i.kind ?? defaultKind(c.className, i.official.name));
  for (const t of plan.teachers) for (const i of t.items) if (i.status === 'will-link' && i.official && i.classId) {
    const cls = plan.classes.find(c => c.classId === i.classId);
    add(i.classId, i.raw, i.official.name, defaultKind(cls?.className ?? i.cls, i.official.name));
  }
  let classesLinked = 0, teachersLinked = 0;
  for (const [classId, subjects] of offer) {
    const existing = st.classSubjects.filter(r => r.class_id === classId).map(r => ({ name: r.subject_name, kind: r.kind }));
    const r = await setClassSubjects(db, schoolId, actorId, actorRole, classId,
      [...existing, ...[...subjects].map(([raw, v]) => ({ name: raw, kind: v.kind }))], false);
    if (!r.ok) return r;
    classesLinked += r.added;
  }
  for (const t of plan.teachers) {
    const pairs = t.items.filter(i => i.status === 'will-link' && i.official).map(i => ({ class: i.cls, subject: i.official!.name }));
    if (!pairs.length) continue;
    // Keep what's linked already, add the resolved legacy pairs; unresolved legacy stays for review.
    const linkedNow = st.teacherSubjects.filter(x => x.teacher_id === t.teacherId).flatMap(x => {
      const cs = st.classSubjects.find(c => c.id === x.class_subject_id);
      const cls = cs && st.classes.find(c => c.id === cs.class_id);
      return cs && cls ? [{ class: cls.name, subject: cs.subject_name, role: x.role }] : [];
    });
    const unresolved = t.items.filter(i => i.status !== 'will-link').map(i => ({ class: i.cls, subject: i.raw }));
    const r = await setTeacherSubjects(db, schoolId, actorId, actorRole, t.teacherId, [...linkedNow, ...pairs], null);
    if (!r.ok) return r;
    // setTeacherSubjects cleared legacy entries; put the unresolved ones back for review.
    if (unresolved.length) {
      const { data: u } = await db.from('users').select('assignments, teacher_class').eq('id', t.teacherId).maybeSingle();
      await db.from('users').update({ assignments: [...(Array.isArray(u?.assignments) ? u!.assignments : []), ...unresolved] }).eq('id', t.teacherId);
    }
    teachersLinked += pairs.length;
  }
  const unresolved = [
    ...plan.classes.flatMap(c => c.items.filter(i => i.status === 'no-match' || i.status === 'unknown-class').map(i => `${c.className}: ${i.raw}`)),
    ...plan.teachers.flatMap(t => t.items.filter(i => i.status !== 'will-link').map(i => `${t.name} · ${i.cls} ${i.raw}`)),
  ];
  return { ok: true as const, classSubjectsAdded: classesLinked, teacherLinks: teachersLinked, unresolved };
}
