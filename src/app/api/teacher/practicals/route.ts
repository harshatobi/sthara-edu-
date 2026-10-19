import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireStaff, type Staff } from '@/lib/teacher/serverAuth';
import { inScope, normClass } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { officialName } from '@/lib/subjects/catalog';
import { practicalById, practicalFits, practicalSubject } from '@/lib/lab/practicals';
import { markSchemeFor, onSheet, partsProblem, partsTotal, type Parts } from '@/lib/lab/practicals/marks';
import { auditExam, loadRoster, sheetStudents, toSheet } from '@/lib/exams/server';

export const dynamic = 'force-dynamic';

/**
 * Live Lab practicals tracker.
 *   POST { class, subject, rows: [{ studentId, practical, done?, record?, viva? }] }   save progress (upsert)
 * Each field present is set; null clears it. `done` is a date (YYYY-MM-DD), `record` none | submitted | checked,
 * `viva` 0-5. Teachers save for classes they teach; every practical must be one of that class's and every student
 * on its roster. Reading is direct (row-level security: staff of the same school). The Subject Enrichment mark
 * itself is saved through /api/teacher/exams (source 'practical'), into the open marks sheet.
 *
 *   POST { action: 'assess', class, subject, sheetId, rows: [{ studentId, parts: { key: marks } | null }] }
 * Class 11-12: the practical scored by its CBSE components (src/lib/lab/practicals/marks.ts). The parts are kept
 * in practical_assessment and their total goes into the open PR sheet in Exams (source 'practical'), scaled if the
 * school set that sheet to another maximum; null clears both. Submitted and locked sheets refuse, as in Exams.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECORD = ['none', 'submitted', 'checked'];
const str = (v: unknown, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`practicals:${staff.id}`, ...limitOf('practicals')).allowed) return NextResponse.json({ error: 'Too many saves at once. Try again in a few minutes.' }, { status: 429 });
  const b = await req.json().catch(() => null);
  const cls = str(b?.class, 40), asked = str(b?.subject, 60);
  if (!cls || !asked) return NextResponse.json({ error: 'Pick the class.' }, { status: 400 });
  const subject = officialName(cls, asked);
  if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject) && !inScope(staff.scope, cls, asked)) return NextResponse.json({ error: `You don't teach ${subject} to ${cls}.` }, { status: 403 });
  if (b?.action === 'assess') return assess(auth, cls, subject, b);
  const rows: any[] = Array.isArray(b?.rows) ? b.rows.slice(0, 2000) : [];
  if (!rows.length) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });

  const ids = [...new Set(rows.map(r => r?.studentId).filter((x: unknown): x is string => typeof x === 'string' && UUID.test(x)))];
  const { data: students } = ids.length ? await db.from('users').select('id, student_class').eq('school_id', staff.schoolId).eq('role', 'student').in('id', ids) : { data: [] as any[] };
  const onRoster = new Set((students ?? []).filter((s: any) => normClass(s.student_class) === normClass(cls)).map((s: any) => s.id));

  const now = new Date().toISOString();
  const upserts: Record<string, unknown>[] = [];
  for (const r of rows) {
    const p = practicalById(r?.practical);
    if (!p || !practicalFits(p, cls, subject)) return NextResponse.json({ error: `${r?.practical ?? 'That'} isn't one of the ${cls} ${subject} practicals.` }, { status: 400 });
    if (!onRoster.has(r?.studentId)) return NextResponse.json({ error: `A student who isn't in ${cls}.` }, { status: 400 });
    const row: Record<string, unknown> = { school_id: staff.schoolId, class: cls, subject, student_id: r.studentId, practical: p.id, updated_by: staff.id, updated_at: now };
    if ('done' in r) {
      if (r.done !== null && !(typeof r.done === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.done))) return NextResponse.json({ error: 'The date must be YYYY-MM-DD.' }, { status: 400 });
      row.done_on = r.done;
    }
    if ('record' in r) {
      if (!RECORD.includes(r.record)) return NextResponse.json({ error: 'Record is none, submitted or checked.' }, { status: 400 });
      row.record = r.record;
    }
    if ('viva' in r) {
      if (r.viva !== null && !(Number.isInteger(r.viva) && r.viva >= 0 && r.viva <= 5)) return NextResponse.json({ error: 'Viva is a whole number from 0 to 5.' }, { status: 400 });
      row.viva = r.viva;
    }
    upserts.push(row);
  }

  // Merge, so a row that sets only `record` keeps its date and viva.
  const { data: existing } = await db.from('practical_progress').select('student_id, practical, done_on, record, viva')
    .eq('school_id', staff.schoolId).eq('subject', subject).in('student_id', [...onRoster]).in('practical', [...new Set(upserts.map(u => u.practical as string))]);
  const key = (s: unknown, pr: unknown) => `${s}|${pr}`;
  const have = new Map((existing ?? []).map((x: any) => [key(x.student_id, x.practical), x]));
  const merged = upserts.map(u => {
    const old: any = have.get(key(u.student_id, u.practical));
    return { done_on: old?.done_on ?? null, record: old?.record ?? 'none', viva: old?.viva ?? null, ...u };
  });
  const { error } = await db.from('practical_progress').upsert(merged, { onConflict: 'student_id,subject,practical' });
  if (error) { console.error('[practicals POST]', error.message); return NextResponse.json({ error: 'Could not save.' }, { status: 500 }); }
  return NextResponse.json({ success: true, saved: merged.length });
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function assess({ staff, db }: { staff: Staff; db: SupabaseClient }, cls: string, subject: string, b: any) {
  if (staff.role !== 'teacher') return bad('Practical marks are entered by the subject teacher.', 403);
  const grade = Number(/\d{1,2}/.exec(cls)?.[0]), sub = practicalSubject(subject);
  const scheme = sub ? markSchemeFor(grade, sub) : null;
  if (!scheme?.parts) return bad(`${cls} ${subject} has no practical parts to score.`);
  if (!UUID.test(String(b?.sheetId ?? ''))) return bad('Unknown sheet.');

  const { data: row } = await db.from('exam_sheets').select('*').eq('id', b.sheetId).eq('school_id', staff.schoolId).maybeSingle();
  if (!row) return bad('Unknown sheet.', 404);
  const sh = toSheet(row);
  const [{ data: asmt }, roster] = await Promise.all([
    db.from('exam_assessments').select('code, name').eq('id', sh.assessmentId).maybeSingle(),
    loadRoster(db, staff.schoolId),
  ]);
  const cs = roster.classSubjects.find(x => x.id === sh.classSubjectId), klass = roster.classes.find(c => c.id === sh.classId);
  if (!asmt || !cs || !klass || !scheme.sheet.test(asmt.code) || normClass(klass.name) !== normClass(cls) || practicalSubject(cs.name) !== sub) {
    return bad(`That isn't the practical sheet for ${cls} ${subject}.`);
  }
  if (sh.status !== 'open') return bad(sh.status === 'locked' ? 'This sheet is published. The principal has to reopen the term to change it.' : 'This sheet is submitted. Ask the class teacher to send it back to change it.', 409);

  const onSheetIds = new Set(sheetStudents(roster, cs).map(s => s.id));
  const rows: any[] = Array.isArray(b?.rows) ? b.rows.slice(0, 500) : [];
  if (!rows.length) return bad('Nothing to save.');
  const now = new Date().toISOString();
  const keep: Record<string, unknown>[] = [], marks: Record<string, unknown>[] = [], clears: string[] = [];
  for (const r of rows) {
    if (!onSheetIds.has(r?.studentId)) return bad(`A student who isn't on the ${cls} ${subject} sheet.`);
    if (r.parts === null) { clears.push(r.studentId); continue; }
    const problem = partsProblem(scheme, r.parts);
    if (problem) return bad(`${roster.students.find(s => s.id === r.studentId)?.name ?? 'A student'}: ${problem}`);
    const parts = Object.fromEntries(scheme.parts.map(p => [p.key, (r.parts as Parts)[p.key]]));
    const total = partsTotal(parts);
    keep.push({ school_id: staff.schoolId, sheet_id: sh.id, class: cls, subject, student_id: r.studentId, parts, total, updated_by: staff.id, updated_at: now });
    marks.push({ school_id: staff.schoolId, sheet_id: sh.id, student_id: r.studentId, marks: onSheet(total, scheme.total, sh.maxMarks), code: null, questions: null, source: 'practical', source_ref: null, updated_by: staff.id, updated_at: now });
  }
  if (keep.length) {
    const { error } = await db.from('practical_assessment').upsert(keep, { onConflict: 'sheet_id,student_id' });
    if (error) { console.error('[practicals assess]', error.message); return bad('Could not save the parts.', 500); }
    const { error: e2 } = await db.from('exam_marks').upsert(marks, { onConflict: 'sheet_id,student_id' });
    if (e2) { console.error('[practicals assess marks]', e2.message); return bad('The parts are saved but the marks sheet could not be updated. Try again.', 500); }
  }
  if (clears.length) {
    const { error } = await db.from('practical_assessment').delete().eq('sheet_id', sh.id).in('student_id', clears);
    const { error: e2 } = await db.from('exam_marks').delete().eq('sheet_id', sh.id).in('student_id', clears).eq('source', 'practical');
    if (error || e2) { console.error('[practicals assess clear]', (error ?? e2)!.message); return bad('Could not clear those marks.', 500); }
  }
  await auditExam(db, staff.schoolId, staff.id, staff.role, 'FILL', 'exam_sheets', sh.id, { source: 'practical', parts: true, rows: keep.length, cleared: clears.length });
  return NextResponse.json({ success: true, saved: keep.length, cleared: clears.length });
}
