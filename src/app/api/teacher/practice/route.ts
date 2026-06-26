import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
  try {
    const { weaknesses, subject, studentClass } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API missing' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an expert tutor. A student in ${studentClass} studying ${subject} has been identified to have weaknesses in the following concepts: ${weaknesses.join(', ')}.
Generate a highly targeted 3-question multiple-choice practice module to help them overcome these specific weaknesses.
Format strictly as a JSON object with a "questions" array.
Each question should have:
- "id": a unique string (e.g. "q1", "q2")
- "questionText": string
- "options": array of 4 strings
- "correctOptionId": integer (0 to 3) representing the index of the correct option in the options array.

Output ONLY valid JSON, no markdown.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json', temperature: 0.4 }
    });

    const rawText = response.text || '{"questions": []}';
    const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    return NextResponse.json(parsed);

  } catch (error) {
    console.error('Practice Module Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate practice module' }, { status: 500 });
  }
}
