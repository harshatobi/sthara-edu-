import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit } from '@/lib/rateLimit';
import { AI_MODELS, limitOf } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';

export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request);
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = checkRateLimit(`quiz-generate:${user.id}`, ...limitOf('quizGenerate'));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before generating another quiz.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  try {
    const { topic, subject } = await request.json();

    const aiBlocked = await aiGate(user.id);
    if (aiBlocked) return aiBlocked;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API missing' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are a teacher. A student just watched an educational video on the topic: "${topic}" in the subject "${subject}".
Generate a short 3-question multiple-choice quiz to test their understanding.
Format strictly as a JSON object with a "questions" array.
Each question should have:
- "questionText": string
- "options": array of 4 strings
- "correctAnswerIndex": integer (0-3)

Output ONLY valid JSON, no markdown.`;

    const result = await ai.models.generateContent({
      model: AI_MODELS.standard,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.4 },
    });
    const parsed = JSON.parse(result.text || '{"questions": []}');
    return NextResponse.json(parsed);

  } catch (error) {
    console.error('Quiz Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate quiz' }, { status: 500 });
  }
}
