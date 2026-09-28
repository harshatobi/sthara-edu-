import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { AI_MODELS, limitOf } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';
import { generateMetered } from '@/lib/ai/usage';

export const dynamic = 'force-dynamic';

type PaperType = 'mcq' | 'saq' | 'laq' | 'mixed';

function buildPrompt(
  grade: string,
  chapters: string[],
  difficulty: string,
  numQuestions: number,
  paperType: PaperType,
  subject: string,
) {
  const chapterStr = chapters.length ? chapters.join(', ') : 'General';

  if (paperType === 'mcq') {
    return `You are an expert exam paper generator for ${grade}, subject: ${subject}.
Chapters/Topics: ${chapterStr}. Difficulty: ${difficulty}.
Generate exactly ${numQuestions} multiple-choice questions.

Return ONLY a raw JSON array — NO markdown, NO explanation:
[
  {
    "type": "mcq",
    "question": "Full question text?",
    "options": { "a": "Option A", "b": "Option B", "c": "Option C", "d": "Option D" },
    "correctOptionId": "b",
    "marks": 1
  }
]
Each question must have exactly 4 options. One correct answer. Return pure JSON array only.`;
  }

  if (paperType === 'saq') {
    return `You are an expert exam paper generator for ${grade}, subject: ${subject}.
Chapters/Topics: ${chapterStr}. Difficulty: ${difficulty}.
Generate exactly ${numQuestions} short-answer questions (2–4 marks each, 2–3 sentence model answers).

Return ONLY a raw JSON array — NO markdown, NO explanation:
[
  {
    "type": "saq",
    "question": "Full question text?",
    "modelAnswer": "A concise 2-3 sentence model answer.",
    "marks": 3
  }
]`;
  }

  if (paperType === 'laq') {
    return `You are an expert exam paper generator for ${grade}, subject: ${subject}.
Chapters/Topics: ${chapterStr}. Difficulty: ${difficulty}.
Generate exactly ${numQuestions} long-answer / essay questions (6–10 marks each, detailed model answers).

Return ONLY a raw JSON array — NO markdown, NO explanation:
[
  {
    "type": "laq",
    "question": "Full question text?",
    "modelAnswer": "Detailed model answer covering all key points.",
    "marks": 8
  }
]`;
  }

  // mixed: roughly 40% MCQ, 40% SAQ, 20% LAQ
  const mcqCount = Math.round(numQuestions * 0.4);
  const saqCount = Math.round(numQuestions * 0.4);
  const laqCount = numQuestions - mcqCount - saqCount;

  return `You are an expert exam paper generator for ${grade}, subject: ${subject}.
Chapters/Topics: ${chapterStr}. Difficulty: ${difficulty}.
Generate a mixed paper with exactly:
  - ${mcqCount} MCQ questions (marks: 1 each)
  - ${saqCount} SAQ questions (marks: 3 each)
  - ${laqCount} LAQ questions (marks: 8 each)
Total = ${numQuestions} questions.

Return ONLY a raw JSON array — NO markdown, NO explanation. Use this schema:
[
  { "type": "mcq", "question": "...", "options": { "a": "...", "b": "...", "c": "...", "d": "..." }, "correctOptionId": "b", "marks": 1 },
  { "type": "saq", "question": "...", "modelAnswer": "...", "marks": 3 },
  { "type": "laq", "question": "...", "modelAnswer": "...", "marks": 8 }
]
First output all MCQs, then SAQs, then LAQs. Return pure JSON array only.`;
}

const MAX_QUESTIONS = 50;
const PAPER_TYPES: PaperType[] = ['mcq', 'saq', 'laq', 'mixed'];
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export async function POST(request: NextRequest) {
  // Each call spends model quota: teachers and academic office roles only, rate-limited.
  const auth = await requireStaff(request, { academic: true });
  if ('res' in auth) return auth.res;
  const user = { id: auth.staff.id };
  if (!checkRateLimit(`paper-gen:${user.id}`, ...limitOf('paperGen')).allowed) {
    return NextResponse.json({ error: 'Too many papers in a short time. Try again in a few minutes.' }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const grade = clip(body?.grade, 40);
    const subject = clip(body?.subject, 80);
    const difficulty = clip(body?.difficulty, 20) || 'medium';
    const chapters = (Array.isArray(body?.chapters) ? body.chapters : []).map((c: unknown) => clip(c, 120)).filter(Boolean).slice(0, 30);
    const n = Math.trunc(Number(body?.numQuestions ?? 10));
    if (!Number.isFinite(n) || n < 1 || n > MAX_QUESTIONS) return NextResponse.json({ error: `Ask for between 1 and ${MAX_QUESTIONS} questions.` }, { status: 400 });
    const numQuestions = n;
    const paperType: PaperType = PAPER_TYPES.includes(body?.paperType) ? body.paperType : 'mcq';

    const aiBlocked = await aiGate(user.id);
    if (aiBlocked) return aiBlocked;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 500 });

    const prompt = buildPrompt(grade, chapters, difficulty, numQuestions, paperType, subject);

    const ai = new GoogleGenAI({ apiKey });
    const result = await generateMetered(ai, {
      model: AI_MODELS.standard,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.6 },
    }, { feature: 'paperGen', userId: user.id, schoolId: auth.staff.schoolId });

    let jsonStr = (result.text || '[]').trim();
    jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    let questions;
    try {
      const parsed = JSON.parse(jsonStr);
      questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
    } catch {
      console.error('[paper-gen] Parse error:', jsonStr.slice(0, 300));
      return NextResponse.json({ error: 'Failed to parse generated questions. Try again.' }, { status: 500 });
    }

    return NextResponse.json({ questions, paperType });

  } catch (error: any) {
    console.error('[paper-gen] Error:', error);
    return NextResponse.json({ error: 'Failed to generate paper: ' + (error?.message || 'Unknown') }, { status: 500 });
  }
}
