import { NextResponse, NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { AI_MODELS, limitOf } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';
import { generateAi, aiConfigured } from '@/lib/ai/generate';
import { inScope } from '@/lib/teacher/scope';
import { generatorQuestions, kbArgs } from '@/lib/kb/generators';
import { asDifficulty, asKind } from '@/lib/kb/plan';

export const dynamic = 'force-dynamic';
// Bank-first builds can write and check several gap questions.
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  // Each call spends model quota: teachers and admins only, rate-limited.
  const auth = await requireStaff(request, { academic: true });
  if ('res' in auth) return auth.res;
  if (!checkRateLimit(`homework-gen:${auth.staff.id}`, ...limitOf('homeworkGen')).allowed) {
    return NextResponse.json({ error: 'Too many generations. Try again in a few minutes.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { topic, subject, studentClass, difficulty = 'medium', numQuestions = 5, questionType = 'mixed' } = body;
    const aiBlocked = await aiGate(auth.staff.id, 'teacherTools');
    if (aiBlocked) return aiBlocked;
    if (!aiConfigured()) return NextResponse.json({ error: 'Gemini API key missing' }, { status: 500 });

    // Knowledge base first (2026-11-14): a saved set, near-identical offers, or a bank-first build with AI for gaps.
    if (studentClass && subject && topic && (auth.staff.role !== 'teacher' || inScope(auth.staff.scope, studentClass, subject))) {
      try {
        const r = await generatorQuestions(request, auth.db, auth.staff, {
          feature: 'homeworkGen', cls: String(studentClass).slice(0, 40), subject: String(subject).slice(0, 80), topics: [String(topic).slice(0, 200)],
          count: Math.min(Math.max(Number(numQuestions) || 5, 1), 15), kind: asKind(questionType), difficulty: asDifficulty(difficulty), ...kbArgs(body), title: String(topic).slice(0, 120),
        });
        if (r && 'offers' in r) return NextResponse.json({ offers: r.offers });
        if (r) {
          return NextResponse.json({
            kb: { ...r.kb, note: r.note },
            questions: r.questions.map(q => (q.type === 'mcq'
              ? { question: q.text, type: 'mcq', marks: q.marks, options: (q.options || []).map((o, i) => `${'ABCDEF'[i]}. ${o}`), correctOption: 'ABCDEF'[q.answer ?? 0], answer: q.scheme, ...(q.figures?.length ? { figures: q.figures } : {}) }
              : { question: q.text, type: q.type, marks: q.marks, answer: q.scheme, ...(q.figures?.length ? { figures: q.figures } : {}) })),
          });
        }
      } catch (e: any) {
        if (e?.status === 404) return NextResponse.json({ error: e.message }, { status: 404 });
        console.warn('[homework-gen] knowledge base path failed, writing afresh:', e?.message);
      }
    }


    const typeInstruction =
      questionType === 'mcq'
        ? 'All questions must be multiple-choice with 4 options and a correct answer.'
        : questionType === 'short'
        ? 'All questions must be short-answer (1-3 sentence answers, 2-5 marks each).'
        : questionType === 'long'
        ? 'All questions must be long-answer essay questions (8-10 marks each).'
        : 'Use a MIX of short-answer (SAQ), long-answer (LAQ), and application questions.';

    const prompt = `You are an experienced teacher creating a homework assignment for ${studentClass} students studying ${subject}.
Topic: "${topic}"
Difficulty: ${difficulty}
${typeInstruction}

Generate exactly ${Math.min(Math.max(Number(numQuestions) || 5, 1), 15)} homework questions.
Return ONLY a raw JSON object in this EXACT format (no markdown, no code blocks):
{
  "questions": [
    {
      "question": "The complete question text here",
      "type": "short",
      "marks": 3,
      "answer": "A concise model answer here"
    }
  ]
}

Rules for the "type" field:
- Use "short" for short-answer questions (1-3 sentences)
- Use "long" for essay/detailed questions 
- Use "mcq" for multiple-choice questions
For MCQ, add an "options" array: ["A. option1", "B. option2", "C. option3", "D. option4"] and set "correctOption" to the correct letter.
Marks: short=2-5, long=8-10, mcq=1-2.
Make questions educationally meaningful and specific to the topic.`;

    const result = await generateAi({
      model: AI_MODELS.standard,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.6 },
    }, { feature: 'homeworkGen', userId: auth.staff.id, schoolId: auth.staff.schoolId });

    let rawText = (result.text || '{"questions":[]}').trim();
    rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(rawText);
    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('[homework-gen] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate homework' }, { status: 500 });
  }
}
