import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  const adminEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  
  const debugInfo = {
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 10) : null,
    apiKeyLength: apiKey ? apiKey.length : 0,
    hasAdminEmail: !!adminEmail,
  };

  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is missing', debugInfo });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent('Say hello in one word');
    const text = result.response.text();
    return NextResponse.json({ success: true, text, debugInfo });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || String(err),
      status: err.status,
      stack: err.stack,
      debugInfo
    });
  }
}
