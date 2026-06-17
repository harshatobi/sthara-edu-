import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
  try {
    const { messages, teacherContext } = await request.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key not configured on server.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const systemInstruction = `You are an expert AI teaching assistant for Sthara School OS. 
You assist teachers in planning lessons, generating generalized homework ideas, and analyzing student performance. 
The teacher you are helping teaches ${teacherContext?.class || 'a class'}.
Provide professional, actionable, and creative teaching advice.`;

    const contents = messages.map((msg: any) => ({
      role: msg.sender === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      }
    });

    return NextResponse.json({
      text: response.text
    });

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}
