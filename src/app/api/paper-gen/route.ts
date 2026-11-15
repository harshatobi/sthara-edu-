import { NextResponse, NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { AI_MODELS, limitOf } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';
import { generateAi, aiConfigured } from '@/lib/ai/generate';
import { generatorQuestions, kbArgs } from '@/lib/kb/generators';
import { asDifficulty, asKind } from '@/lib/kb/plan';

export const dynamic = 'force-dynamic';
// Bank-first builds can write and check several gap questions.
export const maxDuration = 120;

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

    // The AI gate applies to work that calls the AI; saved sets and offers are served even when the school's AI is paused.
    const kbGate = async () => { const blocked = await aiGate(user.id, 'teacherTools'); if (blocked) return blocked; return aiConfigured() ? null : NextResponse.json({ error: 'AI isn’t configured on this server.' }, { status: 503 }); };

    // Knowledge base first (2026-11-14): a saved set, near-identical offers, or a bank-first build with AI for gaps.
    if (grade && subject && chapters.length) {
      try {
        const r = await generatorQuestions(request, auth.db, auth.staff, {
          feature: 'paperGen', cls: grade, subject, topics: chapters, count: Math.min(numQuestions, 30), kind: asKind(paperType), difficulty: asDifficulty(difficulty),
          ...kbArgs(body), gate: kbGate, title: `${subject} paper: ${chapters.slice(0, 3).join(', ')}${chapters.length > 3 ? '…' : ''}`,
        });
        if (r && 'blocked' in r) return r.blocked as NextResponse;
        if (r && 'offers' in r) return NextResponse.json({ offers: r.offers, paperType });
        if (r) {
          const questions = r.questions.map(q => (q.type === 'mcq'
            ? { type: 'mcq', question: q.text, options: Object.fromEntries((q.options || []).slice(0, 4).map((o, i) => ['abcd'[i], o])), correctOptionId: 'abcd'[q.answer ?? 0], marks: q.marks, ...(q.sourceRef ? { source: q.sourceRef } : {}), ...(q.figures?.length ? { figures: q.figures, vi: q.textVersion ?? undefined } : {}) }
            : { type: q.type === 'long' ? 'laq' : 'saq', question: q.text, modelAnswer: q.scheme, marks: q.marks, ...(q.sourceRef ? { source: q.sourceRef } : {}), ...(q.figures?.length ? { figures: q.figures, vi: q.textVersion ?? undefined } : {}) }));
          return NextResponse.json({ questions, paperType, kb: { ...r.kb, note: r.note } });
        }
      } catch (e: any) {
        if (e?.status === 404) return NextResponse.json({ error: e.message }, { status: 404 });
        console.warn('[paper-gen] knowledge base path failed, writing afresh:', e?.message);
      }
    }

    { const blocked = await kbGate(); if (blocked) return blocked; }

    const prompt = buildPrompt(grade, chapters, difficulty, numQuestions, paperType, subject);

    const result = await generateAi({
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
