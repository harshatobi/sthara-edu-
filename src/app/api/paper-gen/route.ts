import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
  try {
    const { grade, difficulty, chapters } = await request.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Gemini API key not configured on server.' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `You are an expert exam paper generator. 
Create a 5-question multiple choice quiz for ${grade} based on the following chapters: ${chapters.join(', ')}.
The difficulty distribution should be: ${difficulty}.
Return ONLY a raw JSON array of objects (do not include markdown \`\`\`json wrappers). 
Each object must have the following structure:
{
  "id": "q1",
  "text": "The question text",
  "options": [
    { "id": "a", "text": "Option A" },
    { "id": "b", "text": "Option B" },
    { "id": "c", "text": "Option C" },
    { "id": "d", "text": "Option D" }
  ],
  "correctOptionId": "b"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.2, // Low temp for more structured/predictable output
      }
    });

    let jsonStr = response.text || "[]";
    
    // Clean up any potential markdown formatting the model might still add
    jsonStr = jsonStr.replace(/^```json/m, '').replace(/^```/m, '').trim();

    try {
      const questions = JSON.parse(jsonStr);
      return NextResponse.json({ questions });
    } catch (parseError) {
      console.error("Failed to parse JSON from Gemini:", jsonStr);
      return NextResponse.json(
        { error: 'Failed to parse generated questions' },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate paper' },
      { status: 500 }
    );
  }
}
