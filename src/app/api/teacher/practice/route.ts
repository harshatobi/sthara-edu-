import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifyApiToken(request.headers.get('authorization'));
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { weaknesses, subject, studentClass, numQuestions = 5 } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Gemini API key missing' }, { status: 500 });

    const ai = new GoogleGenAI({ apiKey });

    const topicStr = Array.isArray(weaknesses) ? weaknesses.join(', ') : (weaknesses || 'core topics');

    const prompt = `You are an expert teacher creating a quiz for ${studentClass || 'school students'} studying ${subject || 'their subject'}.
Topic(s): ${topicStr}

Generate exactly ${numQuestions} multiple-choice questions.
Return ONLY a raw JSON object (no markdown, no code blocks) in this EXACT format:
{
  "questions": [
    {
      "questionText": "The full question text here?",
      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
      "correctOptionId": 1
    }
  ]
}

Rules:
- correctOptionId is the 0-based INDEX of the correct option in the options array
- Questions must be specific, educational, and about the topic
- Each question must have exactly 4 options
- Return exactly ${numQuestions} questions`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.5 },
    });

    let rawText = (result.text || '{"questions":[]}').trim();
    rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    const parsed = JSON.parse(rawText);
    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('[practice] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate quiz' }, { status: 500 });
  }
}
