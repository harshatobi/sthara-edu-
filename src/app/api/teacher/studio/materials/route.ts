import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff, type Staff } from '@/lib/teacher/serverAuth';
import { inScope, normClass, normSubject } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { pageAll } from '@/lib/ops/page';
import { officialName } from '@/lib/subjects/catalog';
import { sanitizeQuestions, totalMarks } from '@/lib/teacher/questions';
import { blocking, parseNeeds, parseQuestionSet } from '@/lib/studio/items';
import { forStudent, toQuestion } from '@/lib/studio/handout';
import { saveToBank } from '@/lib/studio/server';
import { scheduleRetention } from '@/lib/studio/after';
import { MATERIAL_COLS, accessNeeds, isSubjectLead, loadMaterial, moderationOf, needsApproval, saveVersion } from '@/lib/studio/materials';
import type { QuestionSetContent, StudioItem } from '@/lib/studio/types';
import { isLanguage } from '@/lib/studio/languages';

export const dynamic = 'force-dynamic';

const str = (v: unknown, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/**
 * The Studio library.
 *   GET    ?id=<material>            one material, its version history, and what the caller may do with it
 *   GET    ?view=mine|department     the caller's materials, or the department's shared ones (with ?class, ?subject)
 *   PATCH  { id, action, ... }       save | share | review | archive | restore
 *   POST   { id, action, ... }       assign | printed | attach
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const p = req.nextUrl.searchParams;
  const id = p.get('id');
  if (id) {
    const m = await loadMaterial(db, staff, id);
    if (!m) return bad('Unknown material.', 404);
    const [{ data: versions }, lead, mode] = await Promise.all([
      db.from('studio_material_versions').select('version, change_note, changed_by, created_at').eq('material_id', m.id).order('version', { ascending: false }).limit(30),
      isSubjectLead(db, staff, m.subject),
      moderationOf(db, staff.schoolId),
    ]);
    return NextResponse.json({ material: m, versions: versions || [], can: { edit: m.teacher_id === staff.id, review: m.moderation === 'pending' && canReview(staff, m, lead) }, moderation: mode });
  }
  const view = p.get('view') === 'department' ? 'department' : 'mine';
  const cls = str(p.get('class'), 40), subject = str(p.get('subject'), 80);
  const q = db.from('studio_materials').select('id, teacher_id, class, subject, chapter_name, kind, title, language, status, share, common_test, moderation, assignment_ids, version, updated_at')
    .eq('school_id', staff.schoolId).neq('status', 'archived');
  const { data, error } = await pageAll<any>((a, b) => (view === 'mine' ? q.eq('teacher_id', staff.id) : q.eq('share', 'department')).order('updated_at', { ascending: false }).order('id').range(a, b), 2000);
  if (error) return bad('Could not load the library.', 500);
  let rows = data.filter(m => (!cls || normClass(m.class) === normClass(cls)) && (!subject || normSubject(m.subject) === normSubject(subject)));
  if (view === 'department') {
    const lead = subject ? await isSubjectLead(db, staff, subject) : false;
    rows = rows.filter(m => staff.role === 'admin' || lead || staff.scope.some(e => normSubject(e.subject) === normSubject(m.subject)));
  }
  // How each assigned material went: hand-ins and the average of confirmed marks.
  const asg = [...new Set(rows.flatMap(m => m.assignment_ids || []))];
  const outcome = new Map<string, { in: number; graded: number; avg: number | null }>();
  if (asg.length) {
    const { data: subs } = await pageAll<any>((a, b) => db.from('submissions').select('assignment_id, score, max_score, teacher_approved').in('assignment_id', asg.slice(0, 300)).order('id').range(a, b));
    for (const id of asg) {
      const s = subs.filter(x => x.assignment_id === id);
      const g = s.filter(x => x.teacher_approved && x.max_score);
      outcome.set(id, { in: s.length, graded: g.length, avg: g.length ? Math.round(g.reduce((n, x) => n + (Number(x.score) / Number(x.max_score)) * 100, 0) / g.length) : null });
    }
  }
  // bounded: at most 300 teacher names (sliced)
  const { data: names } = await db.from('users').select('id, name').in('id', [...new Set(rows.map(m => m.teacher_id))].slice(0, 300));
  const nameOf = new Map((names || []).map(u => [u.id, u.name]));
  return NextResponse.json({
    materials: rows.slice(0, 300).map(m => {
      const o = (m.assignment_ids || []).map((id: string) => outcome.get(id)).filter(Boolean);
      const graded = o.reduce((n: number, x: any) => n + x.graded, 0);
      return { ...m, teacher: nameOf.get(m.teacher_id) || 'Teacher', handedIn: o.reduce((n: number, x: any) => n + x.in, 0), graded, average: graded ? Math.round(o.reduce((n: number, x: any) => n + (x.avg ?? 0) * x.graded, 0) / graded) : null };
    }),
  });
}

/**
 * Who may approve: a lead of the subject, never for their own material (a check by the author is no check).
 * The principal (admin) may approve too, so a lead's own common test isn't stuck when they're the only lead.
 */
const canReview = (staff: Staff, m: any, lead: boolean) => m.teacher_id !== staff.id && (lead || staff.role === 'admin');

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`studioWrites:${staff.id}`, ...limitOf('studioWrites')).allowed) return bad('Too many changes at once. Try again in a few minutes.', 429);
  const b = await req.json().catch(() => null);
  const m = await loadMaterial(db, staff, str(b?.id, 40));
  if (!m) return bad('Unknown material.', 404);
  const owner = m.teacher_id === staff.id;
  try {
    switch (b?.action) {
      case 'save': {
        if (!owner) return bad('Only the teacher who made this can change it. Make a copy instead.', 403);
        const content = m.content?.type === 'questions' ? parseQuestionSet(b.content) : b.content && typeof b.content === 'object' ? b.content : null;
        if (!content) return bad('That change couldn’t be saved: something in it isn’t valid.');
        const extra: Record<string, unknown> = {};
        if (typeof b.title === 'string' && str(b.title, 200)) extra.title = str(b.title, 200);
        if (typeof b.language === 'string' && isLanguage(b.language)) extra.language = b.language;
        // A change to approved common material sends it back for approval.
        if (m.moderation === 'approved') extra.moderation = 'pending';
        return NextResponse.json({ material: await saveVersion(db, staff, m, content, str(b.note, 300) || 'Edited', extra) });
      }
      case 'restore': {
        if (!owner) return bad('Only the teacher who made this can change it.', 403);
        const { data: v } = await db.from('studio_material_versions').select('content, version').eq('material_id', m.id).eq('version', Number(b.version)).maybeSingle();
        if (!v) return bad('That version isn’t there.', 404);
        return NextResponse.json({ material: await saveVersion(db, staff, m, v.content, `Restored version ${v.version}`) });
      }
      case 'share': {
        if (!owner) return bad('Only the teacher who made this can share it.', 403);
        const share = b.share === 'department' ? 'department' : 'private';
        const common = !!b.commonTest;
        const mode = await moderationOf(db, staff.schoolId);
        const moderation = needsApproval(mode, { share, common_test: common }) ? (m.moderation === 'approved' ? 'approved' : 'pending') : 'none';
        const { data, error } = await db.from('studio_materials').update({ share, common_test: common, moderation }).eq('id', m.id).select(MATERIAL_COLS).single();
        if (error) throw error;
        return NextResponse.json({ material: data });
      }
      case 'review': {
        if (owner) return bad('Someone else has to approve your own material: another subject lead or the principal.', 403);
        if (!canReview(staff, m, await isSubjectLead(db, staff, m.subject))) return bad(`Only the ${m.subject} subject lead can approve this.`, 403);
        if (m.moderation !== 'pending') return bad('This isn’t waiting for approval.', 409);
        const approve = b.decision === 'approve';
        const note = str(b.note, 1000);
        if (!approve && note.length < 3) return bad('Say what needs changing.');
        const { data, error } = await db.from('studio_materials').update({ moderation: approve ? 'approved' : 'changes_requested', reviewed_by: staff.id, reviewed_at: new Date().toISOString(), review_note: note || null })
          .eq('id', m.id).select(MATERIAL_COLS).single();
        if (error) throw error;
        // Approving shared questions approves them in the school bank too.
        if (approve && m.content?.type === 'questions') {
          const ids = (m.content.items || []).map((i: StudioItem) => i.bankId).filter(Boolean);
          if (ids.length) await db.from('bank_items').update({ status: 'approved', approved_by: staff.id, approved_at: new Date().toISOString() }).in('id', ids).eq('school_id', staff.schoolId).eq('status', 'unreviewed');
        }
        return NextResponse.json({ material: data });
      }
      case 'archive': {
        if (!owner) return bad('Only the teacher who made this can archive it.', 403);
        const { data, error } = await db.from('studio_materials').update({ status: b.restore ? 'draft' : 'archived' }).eq('id', m.id).select(MATERIAL_COLS).single();
        if (error) throw error;
        return NextResponse.json({ material: data });
      }
      default: return bad('Unknown action.');
    }
  } catch (e: any) {
    if (e?.status === 409) return bad(e.message, 409);
    console.error('[studio materials PATCH]', e?.message);
    return bad('Could not save that change.', 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`studioWrites:${staff.id}`, ...limitOf('studioWrites')).allowed) return bad('Too many changes at once. Try again in a few minutes.', 429);
  const b = await req.json().catch(() => null);
  const m = await loadMaterial(db, staff, str(b?.id, 40));
  if (!m) return bad('Unknown material.', 404);
  if (m.teacher_id !== staff.id) return bad('Make your own copy to use this with your class.', 403);
  try {
    if (b?.action === 'attach') return await attach(staff, db, m, b);
    const set = m.content?.type === 'questions' ? parseQuestionSet(m.content) : null;
    if (!set) return bad('Only question sets can be handed out from here.');
    const stuck = blocking(set);
    if (stuck.length) return bad(`${stuck.length === 1 ? 'One question still needs' : `${stuck.length} questions still need`} you before this can go to students: fix or remove ${stuck.length === 1 ? 'it' : 'them'} first.`, 409);
    const mode = await moderationOf(db, staff.schoolId);
    if (needsApproval(mode, m) && m.moderation !== 'approved') return bad('Your school asks the subject lead to approve this first. It’s waiting for approval.', 409);
    if (b?.action === 'printed') return await printed(staff, db, m, set);
    if (b?.action === 'assign') return await assign(staff, db, m, set, b);
    return bad('Unknown action.');
  } catch (e: any) {
    if (e?.status) return bad(e.message, e.status);
    console.error('[studio materials POST]', e?.message);
    return bad('Could not do that just now. Try again.', 500);
  }
}

/** Questions used on paper still enter the school bank (they've been used), without an assignment. */
async function printed(staff: Staff, db: any, m: any, set: QuestionSetContent) {
  const ctx = { db, schoolId: staff.schoolId, userId: staff.id, cls: m.class, subject: m.subject };
  const banked = await saveToBank(ctx, set.items, m.language);
  const content = withBankIds(set, banked);
  const material = await saveVersion(db, staff, m, content, 'Printed', { status: m.status === 'assigned' ? 'assigned' : 'ready' });
  const uses = set.items.filter(i => banked.get(i.id)).map(i => ({ item_id: banked.get(i.id)!, school_id: staff.schoolId, material_id: m.id, question_index: Math.max(0, set.order.indexOf(i.id)), used_by: staff.id }));
  if (uses.length) await db.from('bank_item_uses').insert(uses);
  return NextResponse.json({ material });
}

const withBankIds = (set: QuestionSetContent, banked: Map<string, string>): QuestionSetContent =>
  ({ ...set, items: set.items.map(i => (banked.get(i.id) && !i.bankId ? { ...i, bankId: banked.get(i.id)! } : i)) });

/**
 * Hands the set out as one assignment. A whole-class set is the assignment's questions; per-student versions and
 * A/B/C sets become each student's own version (assignment_variants), with their access needs applied.
 */
async function assign(staff: Staff, db: any, m: any, set: QuestionSetContent, b: any) {
  const due = /^\d{4}-\d{2}-\d{2}$/.test(b?.dueDate) ? b.dueDate : null;
  if (!due) throw Object.assign(new Error('Set a due date.'), { status: 400 });
  const subject = officialName(m.class, m.subject);
  if (staff.role === 'teacher' && !inScope(staff.scope, m.class, subject) && !inScope(staff.scope, m.class, m.subject)) throw Object.assign(new Error(`You don't teach ${m.subject} to ${m.class}.`), { status: 403 });
  const byId = new Map(set.items.map(i => [i.id, i]));
  const itemsOf = (ids: string[]) => ids.map(id => byId.get(id)).filter((x): x is StudioItem => !!x);

  // Who gets what.
  const { data: users } = await pageAll<any>((a, z) => db.from('users').select('id, student_class').eq('school_id', staff.schoolId).eq('role', 'student').order('id').range(a, z));
  const roster: string[] = users.filter((u: any) => normClass(u.student_class) === normClass(m.class)).map((u: any) => u.id);
  let own: { studentId: string; items: StudioItem[]; reason: string | null; label: string | null }[] = [];
  let base: StudioItem[] = itemsOf(set.order);
  let targets: string[] = [];
  if (set.audience === 'per_student') {
    own = set.versions.filter(v => roster.includes(v.studentId)).map(v => ({ studentId: v.studentId, items: itemsOf(v.itemIds), reason: v.reason || null, label: null }));
    if (!own.length) throw Object.assign(new Error('None of the students these versions were made for are in the class now.'), { status: 409 });
    targets = own.map(o => o.studentId);
    base = own[0].items;
  } else if (set.audience === 'abc') {
    const sets = set.sets.filter(s => s.itemIds.length);
    if (!sets.length) throw Object.assign(new Error('The sets are empty.'), { status: 409 });
    // Round-robin by roster order, so neighbours on the register sit different sets.
    own = roster.map((id, i) => { const s = sets[i % sets.length]; return { studentId: id, items: itemsOf(s.itemIds), reason: null, label: `Set ${s.label}` }; });
    base = itemsOf(sets[0].itemIds);
  }
  if (!base.length) throw Object.assign(new Error('There are no questions to hand out.'), { status: 409 });

  const isQuiz = set.setKind === 'quiz' && base.every(i => i.qtype === 'mcq' || i.qtype === 'assertion_reason');
  const allChoice = [...base, ...own.flatMap(o => o.items)].every(i => i.qtype === 'mcq' || i.qtype === 'assertion_reason');
  // A paper quiz (bubble sheets) is answered on paper and marked from photos; otherwise choice-only work is answered on Sthara.
  const paper = b?.paper === true && allChoice;
  const mode = paper ? 'handwritten' : allChoice ? 'typed' : set.handout === 'online' ? 'typed' : 'handwritten';
  const { questions } = sanitizeQuestions(base.map(toQuestion));

  const ctx = { db, schoolId: staff.schoolId, userId: staff.id, cls: m.class, subject: m.subject };
  const banked = await saveToBank(ctx, set.items, m.language);

  const { data: a, error } = await db.from('assignments').insert({
    school_id: staff.schoolId, teacher_id: staff.id, title: str(b?.title, 200) || m.title, type: isQuiz ? 'quiz' : set.setKind === 'exit_ticket' ? 'classwork' : 'homework',
    class: m.class, subject, due_date: due, description: str(b?.description, 2000) || set.basis || '', questions, total_marks: totalMarks(questions),
    units: [m.chapter_name || m.title], submission_mode: mode, proctored: false, status: 'published', assigned_student_ids: targets,
  }).select('id').single();
  if (error) throw new Error(error.message);

  // Each student's own version, with their access needs (teachers see the needs, never a health record).
  if (own.length) {
    const needs = await accessNeeds(db, staff.schoolId, own.map(o => o.studentId));
    const rows = own.map(o => {
      const access = parseNeeds(needs.get(o.studentId));
      const { questions: qs } = forStudent(o.items, access);
      return { assignment_id: a.id, school_id: staff.schoolId, student_id: o.studentId, label: o.label, questions: sanitizeQuestions(qs).questions, item_ids: o.items.map(i => banked.get(i.id)).filter(Boolean), reason: o.reason, access };
    });
    const { error: vErr } = await db.from('assignment_variants').insert(rows);
    if (vErr) {
      // Without the versions, students would be marked against the wrong questions: take the assignment back.
      await db.from('assignments').delete().eq('id', a.id);
      throw new Error(vErr.message);
    }
  }
  const uses = own.length
    ? own.flatMap(o => o.items.map((it, qi) => ({ item: it, qi, student: o.studentId })))
    : base.map((it, qi) => ({ item: it, qi, student: null as string | null }));
  const useRows = uses.filter(u => banked.get(u.item.id)).map(u => ({ item_id: banked.get(u.item.id)!, school_id: staff.schoolId, material_id: m.id, assignment_id: a.id, student_id: u.student, question_index: u.qi, used_by: staff.id }));
  if (useRows.length) await db.from('bank_item_uses').insert(useRows);

  const material = await saveVersion(db, staff, m, withBankIds(set, banked), 'Assigned', { status: 'assigned', assignment_ids: [...(m.assignment_ids || []), a.id] });
  // About 17 days after it's due, a few quick questions check it has stayed (the teacher can skip or move it).
  await scheduleRetention(db, {
    schoolId: staff.schoolId, teacherId: staff.id, assignmentId: a.id, materialId: m.id, cls: m.class, subject,
    chapterKey: m.chapter_key, chapterName: m.chapter_name, topics: set.topics, studentIds: targets, due,
  });
  return NextResponse.json({ material, assignmentId: a.id, students: own.length || roster.length });
}

/** Attach to a dated lesson in the planner: the lesson lists it among its materials. */
async function attach(staff: Staff, db: any, m: any, b: any) {
  const lessonId = isUuid(b?.lessonId) ? b.lessonId : null;
  if (!lessonId) return bad('Pick a lesson.');
  const { data: l } = await db.from('lesson_plans').select('id, teacher_id, school_id, materials, title').eq('id', lessonId).maybeSingle();
  if (!l || l.school_id !== staff.schoolId || (staff.role === 'teacher' && l.teacher_id !== staff.id)) return bad('Unknown lesson.', 404);
  const list = Array.isArray(l.materials) ? l.materials.filter((x: any) => x?.studioMaterialId !== m.id) : [];
  await db.from('lesson_plans').update({ materials: [...list, { label: m.title, studioMaterialId: m.id }].slice(0, 20) }).eq('id', l.id);
  const { data, error } = await db.from('studio_materials').update({ lesson_plan_id: l.id }).eq('id', m.id).select(MATERIAL_COLS).single();
  if (error) throw error;
  return NextResponse.json({ material: data, lesson: { id: l.id, title: l.title } });
}
