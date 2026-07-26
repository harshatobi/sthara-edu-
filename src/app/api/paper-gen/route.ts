import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export async function POST(request: NextRequest) {
  const token = await verifyApiToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { grade, difficulty, chapters, numQuestions = 5 } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured on server.' },
        { status: 500 }
      );
    }

    const prompt = `You are an expert exam paper generator.
Create a ${numQuestions}-question multiple choice quiz for ${grade || 'Class 10'} based on the subject/chapters: ${(chapters || ['General']).join(', ')}.
Difficulty level: ${difficulty || 'CBSE Standard'}.

Return ONLY a raw JSON array (no markdown backticks, no explanation). Each item must follow this EXACT structure:
{
  "question": "The full question text?",
  "options": {
    "a": "First option text",
    "b": "Second option text",
    "c": "Third option text",
    "d": "Fourth option text"
  },
  "correctOptionId": "b"
}

Ensure:
- Questions are curriculum-relevant and clear
- Exactly ${numQuestions} questions in the array
- One correct answer per question
- Options are plausible and varied
- Return pure JSON array only — no markdown, no explanation`;

    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.6 },
    });

    let jsonStr = (result.text || '[]').trim();
    // Strip any accidental markdown wrappers
    jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    // Handle both array and { questions: [...] } shapes
    let questions;
    try {
      const parsed = JSON.parse(jsonStr);
      questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
    } catch (parseError) {
      console.error('Failed to parse JSON from Gemini:', jsonStr.slice(0, 300));
      return NextResponse.json({ error: 'Failed to parse generated questions. Try again.' }, { status: 500 });
    }

    return NextResponse.json(questions);

  } catch (error: any) {
    console.error('Paper Gen API Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate paper: ' + (error?.message || 'Unknown error') },
      { status: 500 }
    );
  }
}
