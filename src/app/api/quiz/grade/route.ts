import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit } from '@/lib/rateLimit';
import { AI_MODELS, limitOf } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';

export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request);
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = checkRateLimit(`quiz-grade:${user.id}`, ...limitOf('quizGrade'));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before submitting again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  try {
    const { title, description, questions, studentAnswers } = await request.json();

    const aiBlocked = await aiGate(user.id);
    if (aiBlocked) return aiBlocked;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API missing' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an expert diagnostic AI teacher.
A student has just submitted a multiple choice quiz.
Quiz Title: ${title || 'Targeted Practice'}
Description: ${description || ''}

Here are the questions, the correct answers, and the student's answers:
${(questions || []).map((q: any, i: number) => `
Q${i + 1}: ${q.text || q.questionText}
Correct Answer: ${q.correctAnswer || q.correctOptionId}
Student Answer: ${studentAnswers?.[q.id]}
Is Correct: ${(studentAnswers?.[q.id] === q.correctAnswer || studentAnswers?.[q.id] === q.correctOptionId) ? 'Yes' : 'No'}
`).join('\n')}

Analyze the student's mistakes (if any) and their correct answers.
Determine what underlying concepts they are struggling with.
If they got everything right, suggest advanced topics.
If they made mistakes, suggest relevant video topics to help them.

Output ONLY valid JSON with this structure:
{
  "weaknessTags": ["list", "of", "specific", "concepts"],
  "recommendedVideos": [
    { "title": "Relevant tutorial video title", "duration": "e.g., 5 min tutorial" }
  ],
  "summary": "Brief 1-sentence encouraging summary of their performance."
}`;

    const result = await ai.models.generateContent({
      model: AI_MODELS.standard,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });

    const rawText = result.text || '{}';
    const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('Quiz Grade Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
