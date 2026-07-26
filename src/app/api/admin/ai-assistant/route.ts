import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { message, context, history } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const chat = ai.chats.create({
      model: 'gemini-2.0-flash',
      config: {
        systemInstruction: `You are an intelligent Admin AI Assistant for a school management platform called Sthara School OS.
You have access to real-time school data provided in each message as context.
Your role is to:
1. Provide actionable insights about student performance
2. Identify at-risk students who need intervention
3. Highlight top performers worth recognizing
4. Track regulatory compliance requirements
5. Answer questions about class-wise and subject-wise performance
6. Give recommendations for improving school outcomes

When answering:
- Always cite specific student names, class info, and percentages from the data
- Use clear formatting with bullet points or numbered lists
- Be concise but thorough
- Flag urgent issues (e.g., many students with 0 submissions) prominently
- For compliance questions, reference NEP 2020 / CBSE / state board standards as applicable

IMPORTANT: Only use data that is provided in the context. Do not make up student names or scores.
If the context shows "No data", tell the admin data is not yet available.`,
      },
      history: (history || []).slice(-10),
    });

    const fullMessage = context
      ? `${context}\n\n---\nADMIN QUESTION: ${message}`
      : message;

    const response = await chat.sendMessage({ message: fullMessage });
    const reply = response.text;

    return NextResponse.json({ success: true, reply });

  } catch (error: any) {
    console.error('[admin-ai] error:', error);
    return NextResponse.json(
      { error: error.message || 'AI assistant failed' },
      { status: 500 }
    );
  }
}
