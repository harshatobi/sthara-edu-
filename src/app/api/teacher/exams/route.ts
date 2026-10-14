import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireStaff, type Staff } from '@/lib/teacher/serverAuth';
import { accessOf } from '@/lib/admin/serverAuth';
import { isoDay, sessionOf } from '@/lib/admin/format';
import { normClass } from '@/lib/teacher/scope';
import { pageAll } from '@/lib/ops/page';
import { parseCell, scaleScore, unmarked, type Mark } from '@/lib/exams/engine';
import {
  auditExam, buildCards, examError, loadClassTerm, loadMarks, loadRoster, loadSchemes, reviewBackToOpen, schemeForGrade, sheetStudents,
  summarizeClassTerm, toSheet, type Roster,
} from '@/lib/exams/server';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/**
 * Marks entry and the class teacher's review.
 *
 *   GET                          my marks sheets (the class-subjects I teach) and my class's terms (class teacher)
 *   GET ?sheet=                  one sheet: the students, their marks, and Sthara tests that can fill it
 *   GET ?sheet=&from=            marks proposed from a Sthara test or scanned scripts (an assignment), scaled
 *   GET ?review=                 my class's term (class teacher): sheets, readiness, students
 *   GET ?review=&preview=        a student's report card as it would publish now
 *   POST { action }:
 *     marks { sheetId, rows: [{ studentId, value, questions? }], source?, sourceRef? }   the subject teacher
 *     submit { sheetId }                                                                 the subject teacher
 *     return { sheetId, note }                                                           the class teacher
 *     extras { termId, rows: [{ studentId, remark?, coscholastic? }] }                    the class teacher
 *     review { termId }                                                                  the class teacher
 *
 * The exam cell (exams.manage) can do what a subject teacher does on any open sheet, for corrections before
 * submission. Nobody changes a submitted or locked sheet: it is returned or reopened first.
 */
interface Me { staff: Staff; classTeacherOf: string | null; manage: boolean }

async function whoAmI(db: SupabaseClient, staff: Staff): Promise<Me> {
  const { data } = await db.from('users').select('teacher_class').eq('id', staff.id).maybeSingle();
  const manage = staff.role === 'admin' && (await accessOf(db, staff.id, staff.schoolId)).can('exams.manage');
  return { staff, classTeacherOf: data?.teacher_class ? normClass(data.teacher_class) : null, manage };
}

const teaches = (r: Roster, me: Me, csId: string) => (r.teachers.get(csId) ?? []).includes(me.staff.id);
const myClass = (r: Roster, me: Me) => (me.classTeacherOf ? r.classes.find(c => normClass(c.name) === me.classTeacherOf) ?? null : null);

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  const school = staff.schoolId;
  const q = req.nextUrl.searchParams;
  try {
    const me = await whoAmI(db, staff);
    const session = sessionOf();
    const [bundle, roster] = await Promise.all([loadSchemes(db, school, session), loadRoster(db, school)]);
    const aById = new Map(bundle.assessments.map(a => [a.id, a]));
    const tById = new Map(bundle.terms.map(t => [t.id, t]));

    const sheetId = q.get('sheet');
    if (sheetId) {
      if (!isUuid(sheetId)) return bad('Unknown sheet.', 404);
      const { data: row } = await db.from('exam_sheets').select('*').eq('id', sheetId).eq('school_id', school).maybeSingle();
      if (!row) return bad('Unknown sheet.', 404);
      const sh = toSheet(row);
      const cs = roster.classSubjects.find(x => x.id === sh.classSubjectId)!;
      const cls = roster.classes.find(c => c.id === sh.classId)!;
      const isCT = !!me.classTeacherOf && normClass(cls.name) === me.classTeacherOf;
      if (!teaches(roster, me, cs.id) && !me.manage && !isCT) return bad('You don\'t teach this class and subject.', 403);
      const students = sheetStudents(roster, cs);
      const a = aById.get(sh.assessmentId) ?? (await db.from('exam_assessments').select('*').eq('id', sh.assessmentId).maybeSingle()).data;
      const from = q.get('from');
      if (from) {
        if (!isUuid(from)) return bad('Unknown test.', 404);
        return NextResponse.json(await proposeFrom(db, school, from, students.map(s => s.id), sh.maxMarks, cls.name, cs.name));
      }
      const marks = (await loadMarks(db, [sh.id])).get(sh.id) ?? new Map();
      return NextResponse.json({
        sheet: { ...sh, code: a?.code, assessment: a?.name, termName: tById.get(a?.termId ?? a?.term_id)?.name ?? '', subject: cs.name, subjectKey: cs.key, cls: cls.name, classId: cls.id },
        canEdit: sh.status === 'open' && (teaches(roster, me, cs.id) || me.manage),
        canReturn: sh.status === 'submitted' && (isCT || me.manage),
        students: students.map(s => ({ ...s, mark: marks.get(s.id) ?? null })),
        sources: await sourcesFor(db, school, cls.name, cs.name),
      });
    }

    const reviewTerm = q.get('review');
    if (reviewTerm) {
      const c = myClass(roster, me);
      if (!c) return bad('You aren\'t a class teacher.', 403);
      if (!isUuid(reviewTerm)) return bad('Unknown term.', 404);
      const d = await loadClassTerm(db, school, bundle, roster, c.id, reviewTerm);
      if ('error' in d) return bad(d.error, d.status);
      const preview = q.get('preview');
      if (preview) {
        if (!d.students.some(s => s.id === preview)) return bad('That student isn\'t in your class.', 404);
        const { data: sch } = await db.from('schools').select('name, settings').eq('id', school).maybeSingle();
        const cards = await buildCards(db, school, sch?.name || 'School', String((sch?.settings as any)?.board || 'CBSE'), session, d, [preview], d.classTerm.version + 1, d.classTerm.version > 0);
        return NextResponse.json({ cards: [{ studentId: preview, snapshot: cards.get(preview) }] });
      }
      return NextResponse.json(summarizeClassTerm(d));
    }

    // My sheets, and my class.
    const mine = roster.classSubjects.filter(cs => teaches(roster, me, cs.id)).map(cs => cs.id);
    const { data: sheetRows, error } = mine.length
      ? await db.from('exam_sheets').select('*').eq('school_id', school).in('class_subject_id', mine).in('assessment_id', bundle.assessments.map(a => a.id))
      : { data: [], error: null };
    if (error) return examError(error, 'Could not load your marks sheets.');
    const sheets = (sheetRows || []).map(toSheet);
    const marks = await loadMarks(db, sheets.map(s => s.id));
    const c = myClass(roster, me);
    const scheme = c ? schemeForGrade(bundle, c.grade) : null;
    const { data: cts } = c && scheme ? await db.from('exam_class_terms').select('*').eq('class_id', c.id).in('term_id', bundle.terms.filter(t => t.schemeId === scheme.id).map(t => t.id)) : { data: [] };
    return NextResponse.json({
      session, today: isoDay(), me: { id: staff.id, name: staff.name, manage: me.manage },
      sheets: sheets.map(sh => {
        const a = aById.get(sh.assessmentId)!, cs = roster.classSubjects.find(x => x.id === sh.classSubjectId)!, cls = roster.classes.find(x => x.id === sh.classId)!;
        const roll = sheetStudents(roster, cs);
        const m = marks.get(sh.id) ?? new Map();
        return {
          id: sh.id, status: sh.status, code: a.code, assessment: a.name, term: tById.get(a.termId)?.name ?? '', termSeq: tById.get(a.termId)?.seq ?? 0,
          heldFrom: a.heldFrom, heldTo: a.heldTo, subject: cs.name, cls: cls.name, maxMarks: sh.maxMarks, returnedNote: sh.status === 'open' ? sh.returnedNote : null,
          reopenedReason: sh.status === 'open' ? sh.reopenedReason : null,
          marked: roll.filter(s => { const x = m.get(s.id); return x && (x.marks !== null || x.code); }).length, of: roll.length,
        };
      }).sort((x, y) => x.termSeq - y.termSeq || x.cls.localeCompare(y.cls, 'en', { numeric: true }) || x.subject.localeCompare(y.subject) || x.code.localeCompare(y.code)),
      myClass: c && scheme ? {
        id: c.id, name: c.name, scheme: { id: scheme.id, name: scheme.name, coScholastic: scheme.rules.coScholastic, coGrades: scheme.rules.coGrades },
        terms: bundle.terms.filter(t => t.schemeId === scheme.id).sort((x, y) => x.seq - y.seq).map(t => {
          const ct = (cts || []).find((r: any) => r.term_id === t.id);
          return { id: t.id, name: t.name, seq: t.seq, status: ct?.status ?? 'open', version: ct?.version ?? 0, reopenReason: ct?.reopen_reason ?? null };
        }),
      } : c ? { id: c.id, name: c.name, scheme: null, terms: [] } : null,
    });
  } catch (e: any) {
    return examError(e, 'Could not load exams.');
  }
}

/** Sthara tests and homework for this class and subject that have scored submissions. */
async function sourcesFor(db: SupabaseClient, school: string, cls: string, subject: string) {
  const { data } = await db.from('assignments').select('id, title, type, submission_mode, total_marks, class, subject, due_date, created_at')
    .eq('school_id', school).ilike('subject', subject).order('created_at', { ascending: false }).limit(200);
  const mine = (data || []).filter(a => normClass(a.class) === normClass(cls));
  if (!mine.length) return [];
  const { data: subs } = await db.from('submissions').select('assignment_id, score').in('assignment_id', mine.map(a => a.id)).not('score', 'is', null).limit(5000);
  const n = new Map<string, number>();
  for (const s of subs || []) n.set(s.assignment_id, (n.get(s.assignment_id) ?? 0) + 1);
  return mine.filter(a => n.get(a.id)).slice(0, 30).map(a => ({
    id: a.id, title: a.title, kind: a.type === 'quiz' ? 'online' : a.submission_mode === 'handwritten' ? 'script' : 'online',
    totalMarks: a.total_marks === null ? null : Number(a.total_marks), scored: n.get(a.id) ?? 0, due: a.due_date,
  }));
}

/** Marks proposed from an assignment's scored submissions, scaled to the sheet. Question marks come from scanned scripts. */
async function proposeFrom(db: SupabaseClient, school: string, assignmentId: string, studentIds: string[], max: number, cls: string, subject: string) {
  const { data: a } = await db.from('assignments').select('id, title, type, submission_mode, total_marks, class, subject').eq('id', assignmentId).eq('school_id', school).maybeSingle();
  if (!a || normClass(a.class) !== normClass(cls) || String(a.subject || '').toLowerCase() !== subject.toLowerCase()) return { error: 'That test isn\'t for this class and subject.', rows: [] };
  const { data: subs } = await pageAll<any>((f, t) => db.from('submissions').select('student_id, score, max_score, teacher_approved, ai_graded, ai_result, type').eq('assignment_id', a.id).order('student_id').range(f, t));
  const roster = new Set(studentIds);
  const source = a.type === 'quiz' ? 'online' : a.submission_mode === 'handwritten' ? 'script' : 'online';
  const rows = (subs || []).filter(s => roster.has(s.student_id) && s.score !== null).map(s => {
    const outOf = Number(s.max_score) || Number(a.total_marks) || 0;
    const qs = Array.isArray(s.ai_result?.questions) ? s.ai_result.questions.map((x: any, i: number) => ({ n: Number(x.index ?? i) + 1, max: Number(x.max) || 0, awarded: Number(x.awarded) || 0 })) : null;
    return { studentId: s.student_id, score: Number(s.score), outOf, marks: scaleScore(Number(s.score), outOf, max), approved: !!s.teacher_approved, questions: qs };
  });
  return { assignment: { id: a.id, title: a.title }, source, rows, missing: studentIds.filter(id => !rows.some(r => r.studentId === id)).length };
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  const school = staff.schoolId;
  const b = await req.json().catch(() => null);
  if (!b || typeof b.action !== 'string') return bad('Invalid request.');
  try {
    const me = await whoAmI(db, staff);
    const roster = await loadRoster(db, school);

    if (b.action === 'marks' || b.action === 'submit' || b.action === 'return') {
      if (!isUuid(b.sheetId)) return bad('Unknown sheet.');
      const { data: row } = await db.from('exam_sheets').select('*').eq('id', b.sheetId).eq('school_id', school).maybeSingle();
      if (!row) return bad('Unknown sheet.', 404);
      const sh = toSheet(row);
      const cs = roster.classSubjects.find(x => x.id === sh.classSubjectId);
      const cls = roster.classes.find(c => c.id === sh.classId);
      if (!cs || !cls) return bad('That class or subject no longer exists.', 404);
      const students = sheetStudents(roster, cs);

      if (b.action === 'return') {
        const isCT = !!me.classTeacherOf && normClass(cls.name) === me.classTeacherOf;
        if (!isCT && !me.manage) return bad('Only the class teacher can send a sheet back.', 403);
        const note = str(b.note, 1000);
        if (!note) return bad('Say what needs changing.');
        if (sh.status !== 'submitted') return bad(sh.status === 'locked' ? 'That sheet is published. The principal has to reopen the term.' : 'That sheet is already open.', 409);
        const { error } = await db.from('exam_sheets').update({ status: 'open', returned_note: note, returned_by: staff.id, returned_at: new Date().toISOString() }).eq('id', sh.id);
        if (error) return examError(error, 'Could not send it back.');
        await reviewBackToOpen(db, sh.classId, sh.assessmentId);
        return NextResponse.json({ ok: true });
      }

      if (!teaches(roster, me, cs.id) && !me.manage) return bad('You don\'t teach this class and subject.', 403);
      if (sh.status !== 'open') return bad(sh.status === 'locked' ? 'This sheet is published. The principal has to reopen the term to change it.' : 'This sheet is submitted. Ask the class teacher to send it back to change it.', 409);

      if (b.action === 'submit') {
        const marks = (await loadMarks(db, [sh.id])).get(sh.id) ?? new Map();
        const missing = unmarked(students, marks as Map<string, Mark>);
        if (missing.length) return bad(`Enter marks or a code (AB, ML, EX) for ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` and ${missing.length - 4} more` : ''}.`, 409);
        if (!students.length) return bad('There are no students on this sheet.', 409);
        const { error } = await db.from('exam_sheets').update({ status: 'submitted', submitted_by: staff.id, submitted_at: new Date().toISOString(), returned_note: null }).eq('id', sh.id).eq('status', 'open');
        return error ? examError(error, 'Could not submit it.') : NextResponse.json({ ok: true });
      }

      // marks
      const ids = new Set(students.map(s => s.id));
      const rows = Array.isArray(b.rows) ? b.rows.slice(0, 500) : [];
      if (!rows.length) return bad('There are no marks to save.');
      const source = ['grid', 'import', 'online', 'script'].includes(b.source) ? b.source : 'grid';
      const sourceRef = isUuid(b.sourceRef) ? b.sourceRef : null;
      const upserts: any[] = [], clears: string[] = [], problems: string[] = [];
      for (const r of rows) {
        if (!ids.has(r?.studentId)) { problems.push('A student who isn\'t on this sheet.'); continue; }
        const p = parseCell(String(r.value ?? ''), sh.maxMarks);
        if (!p.ok) { problems.push(`${students.find(s => s.id === r.studentId)?.name}: ${p.error}`); continue; }
        if (p.mark.marks === null && !p.mark.code) { clears.push(r.studentId); continue; }
        const questions = Array.isArray(r.questions) ? r.questions.slice(0, 60).map((x: any) => ({ n: Number(x.n) || 0, max: Number(x.max) || 0, awarded: Number(x.awarded) || 0 })) : null;
        upserts.push({ school_id: school, sheet_id: sh.id, student_id: r.studentId, marks: p.mark.marks, code: p.mark.code, questions, source, source_ref: sourceRef, updated_by: staff.id, updated_at: new Date().toISOString() });
      }
      if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });
      if (upserts.length) {
        const { error } = await db.from('exam_marks').upsert(upserts, { onConflict: 'sheet_id,student_id' });
        if (error) return examError(error, 'Could not save the marks.');
      }
      if (clears.length) {
        const { error } = await db.from('exam_marks').delete().eq('sheet_id', sh.id).in('student_id', clears);
        if (error) return examError(error, 'Could not clear those marks.');
      }
      if (source !== 'grid') await auditExam(db, school, staff.id, staff.role, 'FILL', 'exam_sheets', sh.id, { source, source_ref: sourceRef, rows: upserts.length });
      return NextResponse.json({ ok: true, saved: upserts.length, cleared: clears.length });
    }

    if (b.action === 'extras' || b.action === 'review') {
      const c = myClass(roster, me);
      if (!c) return bad('Only the class teacher does this.', 403);
      if (!isUuid(b.termId)) return bad('Unknown term.');
      const session = sessionOf();
      const bundle = await loadSchemes(db, school, session);
      const d = await loadClassTerm(db, school, bundle, roster, c.id, b.termId);
      if ('error' in d) return bad(d.error, d.status);
      if (d.classTerm.status === 'published') return bad('This term is published. The principal has to reopen it first.', 409);

      if (b.action === 'extras') {
        const ids = new Set(d.students.map(s => s.id));
        const areas = new Set(d.scheme.rules.coScholastic.map(a => a.key));
        const grades = new Set(d.scheme.rules.coGrades);
        const rows: any[] = [];
        for (const r of (Array.isArray(b.rows) ? b.rows : []).slice(0, 200)) {
          if (!ids.has(r?.studentId)) return bad('A student who isn\'t in your class.');
          const co: Record<string, string> = {};
          for (const [k, v] of Object.entries(r.coscholastic && typeof r.coscholastic === 'object' ? r.coscholastic : {})) {
            if (!areas.has(k)) continue;
            if (v === '' || v === null) continue;
            if (!grades.has(String(v))) return bad(`Grades are ${[...grades].join(', ')}.`);
            co[k] = String(v);
          }
          rows.push({ school_id: school, term_id: d.term.id, student_id: r.studentId, remark: str(r.remark, 600) || null, coscholastic: co, updated_by: staff.id, updated_at: new Date().toISOString() });
        }
        if (!rows.length) return bad('Nothing to save.');
        const { error } = await db.from('exam_student_terms').upsert(rows, { onConflict: 'term_id,student_id' });
        return error ? examError(error, 'Could not save.') : NextResponse.json({ ok: true, saved: rows.length });
      }

      // review
      if (d.classTerm.status === 'reviewed') return bad('You have already reviewed this term.', 409);
      const s = summarizeClassTerm(d);
      if (!s.ready.canReview) return bad(s.ready.sheetsOpen ? `${s.ready.sheetsOpen} marks sheet${s.ready.sheetsOpen === 1 ? ' is' : 's are'} not submitted yet.` : s.ready.unopened ? 'Some marks sheets were never opened. Ask the exam cell.' : `${s.ready.incomplete} student${s.ready.incomplete === 1 ? ' is' : 's are'} missing marks.`, 409);
      const areas = d.scheme.rules.coScholastic;
      const noCo = areas.length ? d.students.filter(st => areas.some(a => !d.extras.get(st.id)?.coscholastic?.[a.key])) : [];
      if (noCo.length) return bad(`Give the co-scholastic grades for ${noCo.slice(0, 3).map(x => x.name).join(', ')}${noCo.length > 3 ? ` and ${noCo.length - 3} more` : ''}.`, 409);
      const row = { school_id: school, term_id: d.term.id, class_id: c.id, status: 'reviewed', reviewed_by: staff.id, reviewed_at: new Date().toISOString() };
      const { error } = d.classTerm.id ? await db.from('exam_class_terms').update(row).eq('id', d.classTerm.id) : await db.from('exam_class_terms').insert(row);
      return error ? examError(error, 'Could not mark it reviewed.') : NextResponse.json({ ok: true });
    }

    return bad('Unknown action.');
  } catch (e: any) {
    return examError(e, 'Something went wrong. Try again.');
  }
}
