import 'server-only';
import { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '@/lib/settings/limits';
import { sanitizeQuestions } from '@/lib/teacher/questions';
import { normClass } from '@/lib/teacher/scope';
import { CAPTURE_PREFIX, gradingPrompt, isCapturePath, nameMatches, parseGrade, type HandwrittenGrade } from './handwritten';

export const BUCKET = 'captures';
export const MAX_PAGES = 8;
export const MAX_PAGE_BYTES = 3 * 1024 * 1024;

export class GradingError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

let bucketReady = false;
/** The private bucket for photographed work (never public: pages are served as short-lived signed URLs). */
export async function ensureBucket(db: SupabaseClient) {
  if (bucketReady) return;
  const { data } = await db.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await db.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_PAGE_BYTES, allowedMimeTypes: ['image/jpeg'] });
    if (error && !/exists/i.test(error.message)) throw new GradingError('Photo storage isn’t available right now.', 500);
  }
  bucketReady = true;
}

/** Short-lived links for a submission's pages; legacy public URLs pass through. */
export async function pageLinks(db: SupabaseClient, imageUrls: string[]): Promise<string[]> {
  const paths = imageUrls.filter(isCapturePath).map(u => u.slice(CAPTURE_PREFIX.length));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, 3600);
    for (const x of data || []) if (x.signedUrl && x.path) signed.set(x.path, x.signedUrl);
  }
  return imageUrls.map(u => (isCapturePath(u) ? signed.get(u.slice(CAPTURE_PREFIX.length)) ?? '' : u)).filter(Boolean);
}

/** The student is on this assignment's roster (class, school, and the target list if it has one). */
export async function studentOnRoster(db: SupabaseClient, a: any, studentId: string): Promise<{ id: string; name: string } | null> {
  const { data: s } = await db.from('users').select('id, name, role, school_id, student_class').eq('id', studentId).maybeSingle();
  if (!s || s.role !== 'student' || s.school_id !== a.school_id || normClass(s.student_class) !== normClass(a.class)) return null;
  if (Array.isArray(a.assigned_student_ids) && a.assigned_student_ids.length && !a.assigned_student_ids.includes(s.id)) return null;
  return { id: s.id, name: s.name || 'Student' };
}

async function download(db: SupabaseClient, path: string) {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) throw new GradingError('A page photo couldn’t be read back. Retake it.', 422);
  return Buffer.from(await data.arrayBuffer()).toString('base64');
}

/** Reads the pages with the vision model and returns the parsed suggestion. */
export async function gradePages(db: SupabaseClient, a: any, paths: string[], meta: { source: HandwrittenGrade['source']; capturedBy: string | null; studentName: string }): Promise<HandwrittenGrade> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GradingError('AI grading isn’t configured on this server (no AI key).', 503);
  const { questions } = sanitizeQuestions(a.questions);
  const pages = await Promise.all(paths.map(p => download(db, p)));
  const ai = new GoogleGenAI({ apiKey });
  const model = AI_MODELS.handwriting;
  const res = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [
      { text: gradingPrompt({ title: a.title || 'Homework', subject: a.subject || 'General', cls: a.class || '', questions, pages: pages.length, totalMarks: a.total_marks ?? null }) },
      ...pages.map(data => ({ inlineData: { data, mimeType: 'image/jpeg' } })),
    ] }],
    config: { responseMimeType: 'application/json', temperature: 0.1 },
  });
  let raw: unknown;
  try { raw = JSON.parse((res.text || '{}').replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '').trim()); }
  catch { throw new GradingError('The AI couldn’t read these pages. Try clearer photos, or mark this one by hand.', 502); }
  const grade = parseGrade(raw, questions, { pages: pages.length, model, source: meta.source, capturedBy: meta.capturedBy, totalMarks: a.total_marks });
  if (grade.nameOnPage && !nameMatches(grade.nameOnPage, meta.studentName)) {
    grade.flags.unshift(`The name on the page reads "${grade.nameOnPage}", not ${meta.studentName}. Check this is the right notebook.`);
  }
  return grade;
}

/**
 * Creates or refreshes the student's submission with the photographed pages and
 * the AI's suggestion. Never marks it approved: the teacher confirms in review.
 */
export async function storeCapture(db: SupabaseClient, a: any, studentId: string, paths: string[], grade: HandwrittenGrade, opts: { replaceApproved?: boolean } = {}) {
  const { data: existing } = await db.from('submissions').select('id, teacher_approved, ai_result').eq('assignment_id', a.id).eq('student_id', studentId).maybeSingle();
  // Reversals (reopened grades) stay on the record across a re-capture or re-read.
  const history = Array.isArray((existing?.ai_result as any)?.history) ? (existing!.ai_result as any).history : undefined;
  if (history) (grade as any).history = history;
  if (existing?.teacher_approved === true && !opts.replaceApproved) {
    throw new GradingError('This work is already graded. Open it to change the mark.', 409);
  }
  const row = {
    ai_result: grade, ai_graded: true, ai_grade: `${grade.suggestedTotal}/${grade.max}`, ai_feedback: grade.summary || null,
    image_urls: paths.map(p => CAPTURE_PREFIX + p), type: 'handwritten',
    // The suggestion is kept in ai_result only: score stays empty until a teacher confirms.
    score: null, max_score: grade.max, grade: null, teacher_approved: null,
  };
  if (existing) {
    const { error } = await db.from('submissions').update(row).eq('id', existing.id);
    if (error) throw new GradingError('Could not save the captured work.', 500);
    await db.from('submission_items').delete().eq('submission_id', existing.id).eq('teacher_confirmed', false);
    return existing.id as string;
  }
  const { data, error } = await db.from('submissions').insert({
    ...row, assignment_id: a.id, student_id: studentId, school_id: a.school_id, submitted_at: new Date().toISOString(), answers: {},
  }).select('id').single();
  if (error || !data) throw new GradingError(error?.code === '23505' ? 'A submission for this student was just saved. Refresh and try again.' : 'Could not save the captured work.', error?.code === '23505' ? 409 : 500);
  return data.id as string;
}
