import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff, type Staff } from '@/lib/teacher/serverAuth';
import { inScope, normClass } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf, AI_MODELS } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';
import { aiConfigured, generateAi } from '@/lib/ai/generate';
import { aiFailure, withRetry } from '@/lib/ai/retry';
import { pageAll } from '@/lib/ops/page';
import { sanitizeQuestions } from '@/lib/teacher/questions';
import { recomputeTml } from '@/lib/tml/recompute';
import { withVariant } from '@/lib/studio/variants';
import { componentOf } from '@/lib/studio/after';
import { readSheets, scoreSheet, sheetCodes } from '@/lib/studio/sheets';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const MAX_PHOTO = 4 * 1024 * 1024;

/**
 * Paper quiz on bubble sheets (round 6): each student's sheet carries a code; the teacher photographs the sheets,
 * the answers are read, and the teacher confirms before anything is saved. Photos are read and not kept.
 *   GET  ?assignmentId=                       each student's code and questions (for printing), created on first ask
 *   POST multipart { assignmentId, file }     read one photo (one or more sheets in it)
 *   PUT  { assignmentId, rows: [{ studentId, picks[] }] }   save confirmed answers as marked work
 */
async function load(req: NextRequest, id: string | null) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth;
  const { staff, db } = auth;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return { res: bad('Pick a piece of work.') };
  const { data: a } = await db.from('assignments').select('id, school_id, teacher_id, title, type, class, subject, questions, total_marks, assigned_student_ids, status').eq('id', id).maybeSingle();
  if (!a || a.school_id !== staff.schoolId) return { res: bad('Unknown work.', 404) };
  if (staff.role === 'teacher' && a.teacher_id !== staff.id && !inScope(staff.scope, a.class, a.subject)) return { res: bad('You can only mark work for classes you teach.', 403) };
  return { staff, db, a };
}

/** Codes for every student the work is for, made once and then kept (register order, by name). */
async function codesFor(db: any, staff: Staff, a: any) {
  const { data: have } = await pageAll<any>((x, y) => db.from('studio_sheets').select('student_id, code').eq('assignment_id', a.id).order('code').range(x, y));
  if (have.length) return have.map((r: any) => ({ studentId: r.student_id, code: r.code }));
  const targeted = new Set((a.assigned_student_ids || []).map(String));
  const { data: users } = await pageAll<any>((x, y) => db.from('users').select('id, name, student_class').eq('school_id', staff.schoolId).eq('role', 'student').order('id').range(x, y));
  const roster = users.filter((u: any) => (targeted.size ? targeted.has(u.id) : normClass(u.student_class) === normClass(a.class))).sort((p: any, q: any) => (p.name || '').localeCompare(q.name || ''));
  const codes = sheetCodes(a.id, roster.map((u: any) => u.id));
  if (codes.length) {
    const { error } = await db.from('studio_sheets').insert(codes.map(c => ({ assignment_id: a.id, student_id: c.studentId, school_id: staff.schoolId, code: c.code })));
    if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
  }
  return codes;
}

export async function GET(req: NextRequest) {
  const r = await load(req, req.nextUrl.searchParams.get('assignmentId'));
  if ('res' in r) return r.res;
  const { staff, db, a } = r;
  const codes = await codesFor(db, staff, a);
  const sheets = await Promise.all(codes.map(async (c: { studentId: string; code: string }) => {
    const own = await withVariant(db, a, c.studentId);
    return { ...c, questions: sanitizeQuestions(own.questions).questions };
  }));
  return NextResponse.json({ sheets });
}

const READER = `You read photographed bubble answer sheets from an Indian school. A photo may show one sheet or several.
Each sheet has a code in a box marked SHEET (four letters or digits, a dash, a number, e.g. "KQ7J-14") and an answer grid:
one row per question number, circles labelled A, B, C, D (sometimes fewer).
For every sheet you can see:
- "code": exactly as printed.
- "answers": for each question number, the letter whose circle is filled in; null if none is filled;
  "X" if more than one is filled, or a mark is crossed out and you can't tell which one counts.
Read only filled circles; ignore ticks or writing elsewhere on the page. Never guess a letter you can't see.
Return JSON: {"sheets":[{"code":"","answers":{"1":"B","2":null}}]}`;

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const r = await load(req, typeof form?.get('assignmentId') === 'string' ? String(form!.get('assignmentId')) : null);
  if ('res' in r) return r.res;
  const { staff, db, a } = r;
  if (!checkRateLimit(`studioSheets:${staff.id}`, ...limitOf('studioSheets')).allowed) return bad('That’s a lot of photos in a short time. Give it a few minutes.', 429);
  const blocked = await aiGate(staff.id, 'teacherTools');
  if (blocked) return blocked;
  if (!aiConfigured()) return bad('Reading sheets isn’t configured on this server (no AI key).', 503);
  const file = form?.get('file');
  if (!(file instanceof File) || !/^image\/(jpeg|png|webp)$/.test(file.type)) return bad('Send a photo (JPG or PNG).');
  if (file.size > MAX_PHOTO) return bad('That photo is too large. Take it again a little further away.');

  const codes = await codesFor(db, staff, a);
  const byCode = new Map<string, { studentId: string; questions: number; options: number[] }>();
  for (const c of codes) {
    const own = await withVariant(db, a, c.studentId);
    const qs = sanitizeQuestions(own.questions).questions;
    byCode.set(c.code, { studentId: c.studentId, questions: qs.length, options: qs.map(q => q.options?.length ?? 4) });
  }
  try {
    const data = Buffer.from(await file.arrayBuffer()).toString('base64');
    const res = await withRetry(() => generateAi({
      model: AI_MODELS.handwriting,
      contents: [{ role: 'user', parts: [
        { text: `Codes on this class's sheets look like ${codes[0]?.code ?? 'ABCD-1'}. Questions per sheet: ${Math.max(0, ...[...byCode.values()].map(v => v.questions))} at most.` },
        { inlineData: { data, mimeType: file.type } },
      ] }],
      config: { systemInstruction: READER, responseMimeType: 'application/json', temperature: 0 },
    }, { feature: 'studioSheet', userId: staff.id, schoolId: staff.schoolId }), { tries: 2, baseMs: 1500 });
    const raw = JSON.parse((res.text || '{}').replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '').trim());
    const sheets = readSheets(raw, byCode);
    if (!sheets.length) return bad('No answer sheet could be read in that photo. Take it straight on, in good light, with the whole sheet in view.', 422);
    return NextResponse.json({ sheets });
  } catch (e: any) {
    console.error('[studio sheets read]', e?.message);
    const kind = aiFailure(e);
    return bad(kind === 'busy' ? 'The AI is overloaded right now. Try that photo again in a minute.' : kind === 'quota' ? 'The school’s AI allowance has run out.' : 'That photo couldn’t be read. Try it again.', kind === 'quota' ? 429 : 502);
  }
}

export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const r = await load(req, typeof b?.assignmentId === 'string' ? b.assignmentId : null);
  if ('res' in r) return r.res;
  const { staff, db, a } = r;
  if (!checkRateLimit(`studioWrites:${staff.id}`, ...limitOf('studioWrites')).allowed) return bad('Too many changes at once. Try again in a few minutes.', 429);
  const rows = Array.isArray(b?.rows) ? b.rows.slice(0, 120) : [];
  const codes = await codesFor(db, staff, a);
  const allowed = new Set(codes.map((c: { studentId: string }) => c.studentId));
  const component = await componentOf(db, a);
  let saved = 0;
  const problems: string[] = [];
  for (const row of rows) {
    const studentId = typeof row?.studentId === 'string' ? row.studentId : '';
    if (!allowed.has(studentId)) { problems.push('A sheet for a student not on this work was skipped.'); continue; }
    const own = await withVariant(db, a, studentId);
    const qs = sanitizeQuestions(own.questions).questions;
    const picks = qs.map((_, i) => { const p = row.picks?.[i]; return Number.isInteger(p) && p >= 0 && p < (qs[i].options?.length ?? 4) ? p : null; });
    const { items, score, max } = scoreSheet(qs, picks);
    const answers = Object.fromEntries(picks.map((p, i) => [String(i), p]).filter(([, p]) => p !== null));
    const grade = `${score}/${max}`;
    const { data: existing } = await db.from('submissions').select('id').eq('assignment_id', a.id).eq('student_id', studentId).maybeSingle();
    const fields = { answers, score, max_score: max, grade, final_grade: grade, teacher_approved: true, type: 'bubble_sheet', teacher_note: null };
    const { data: sub, error } = existing
      ? await db.from('submissions').update(fields).eq('id', existing.id).select('id').single()
      : await db.from('submissions').insert({ ...fields, assignment_id: a.id, student_id: studentId, school_id: a.school_id }).select('id').single();
    if (error || !sub) { problems.push('One sheet couldn’t be saved.'); console.error('[studio sheets save]', error?.message); continue; }
    // Replace the marks; if the old ones can't be cleared, stop for this student rather than count the work twice.
    const { error: clearErr } = await db.from('submission_items').delete().eq('submission_id', sub.id);
    if (clearErr) { problems.push('One sheet’s marks couldn’t be updated. Save again.'); continue; }
    const { error: itemsErr } = await db.from('submission_items').insert(items.map(x => ({
      ...x, submission_id: sub.id, assignment_id: a.id, student_id: studentId, school_id: a.school_id, component_type: component, teacher_confirmed: true,
    })));
    if (itemsErr) { problems.push('One sheet’s marks couldn’t be saved. Save again.'); continue; }
    try { await recomputeTml(db, studentId, a.subject || undefined); } catch (e: any) { console.error('[studio sheets] TML recompute failed:', e?.message); }
    saved++;
  }
  return NextResponse.json({ saved, problems: [...new Set(problems)] });
}
