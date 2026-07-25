import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifyApiToken(request.headers.get('authorization'));
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { weaknesses, subject, studentClass } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key missing' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `You are an expert tutor. A student in ${studentClass || 'their class'} studying ${subject || 'their subject'} has been identified to have weaknesses in the following concepts: ${Array.isArray(weaknesses) ? weaknesses.join(', ') : weaknesses || 'core topics'}.
Generate a highly targeted 3-question multiple-choice practice module to help them overcome these specific weaknesses.
Format strictly as a JSON object with a "questions" array.
Each question should have:
- "id": a unique string (e.g. "q1", "q2")
- "questionText": string
- "options": array of 4 strings
- "correctOptionId": integer (0 to 3) representing the index of the correct option in the options array.

Output ONLY valid JSON, no markdown.`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
    });

    const response = await model.generateContent(prompt);
    const rawText = response.response.text() || '{"questions": []}';
    const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('Practice Module Generation Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate practice module' }, { status: 500 });
  }
}
