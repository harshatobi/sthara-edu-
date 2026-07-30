import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { verifyApiToken } from '@/lib/auth/verifyToken';

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
  const chapterStr = (chapters || ['General']).join(', ');

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

export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const {
      grade,
      subject,
      difficulty,
      chapters,
      numQuestions = 10,
      paperType = 'mcq' as PaperType,
    } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 500 });

    const prompt = buildPrompt(grade, chapters, difficulty, numQuestions, paperType, subject);

    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.6 },
    });

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
