import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export async function POST(request: NextRequest) {
  const token = await verifyApiToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { grade, difficulty, chapters } = await request.json();

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured on server.' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);

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

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
    });

    const response = await model.generateContent(prompt);

    let jsonStr = response.response.text() || "[]";
    
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
      { error: 'Failed to generate paper: ' + error.message },
      { status: 500 }
    );
  }
}
