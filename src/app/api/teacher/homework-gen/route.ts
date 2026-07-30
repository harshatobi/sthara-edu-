import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifyApiToken(request.headers.get('authorization'));
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { topic, subject, studentClass, difficulty = 'medium', numQuestions = 5, questionType = 'mixed' } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Gemini API key missing' }, { status: 500 });

    const ai = new GoogleGenAI({ apiKey });

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

Generate exactly ${numQuestions} homework questions.
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

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.6 },
    });

    let rawText = (result.text || '{"questions":[]}').trim();
    rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(rawText);
    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('[homework-gen] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate homework' }, { status: 500 });
  }
}
