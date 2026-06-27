import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  const token = await verifyApiToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rl = checkRateLimit(`tutor:${getClientIp(request)}`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests. Slow down.' }, { status: 429 });
  try {
    const { messages, studentId, studentName, studentClass } = await request.json();

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured on server.' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Skip memory fetch if Firebase Admin not properly configured - don't let it crash the request
    let memoryData = { known: [] as string[], struggling: [] as string[] };
    // We skip adminDb/memory fetch entirely since Firebase Admin credentials may not be set on Vercel
    // The AI still works perfectly without memory - it just won't be personalized

    // STRICT System Instruction
    const systemInstruction = `You are a strict, Socratic AI Tutor for Sthara School OS. 
The student is ${studentName || 'a student'} in ${studentClass || 'a class'}. 
RULES:
1. STRICTLY ACADEMIC: Refuse to answer ANY question that is not related to school academics, syllabus, or learning. If they ask a non-academic question, say: "I am your AI Tutor. I can only assist with your academic subjects."
2. SOCRATIC METHOD: NEVER give the direct answer to a problem (especially Math/Science). You must ask guiding questions to lead the student to the answer themselves.
3. VIDEO RECOMMENDATIONS: If the student asks for video lectures, DO NOT generate YouTube URLs or video IDs yourself. Instead, output EXACTLY this format: \`[YOUTUBE_SEARCH: <specific_topic>]\`. For example: \`[YOUTUBE_SEARCH: Quadratic Equations Khan Academy]\`. The system will intercept this tag and automatically fetch and render 100% verified, live videos for the student. Do not provide any other links.
4. ADAPTIVE: Keep in mind the student's learning profile. 
   What they know: ${memoryData.known?.join(', ') || 'Unknown'}
   What they struggle with: ${memoryData.struggling?.join(', ') || 'Unknown'}
   Tailor your explanation to their level. Keep responses concise and encouraging.`;

    let contents = messages.map((msg: any) => ({
      role: msg.sender === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    // Gemini API requires the conversation history to strictly start with a 'user' role
    // and alternate. We will remove leading 'model' messages.
    while (contents.length > 0 && contents[0].role === 'model') {
      contents.shift();
    }
    
    // Also merge consecutive messages from the same role to prevent "400 alternating roles" errors
    const mergedContents: any[] = [];
    for (const msg of contents) {
      if (mergedContents.length > 0 && mergedContents[mergedContents.length - 1].role === msg.role) {
        mergedContents[mergedContents.length - 1].parts[0].text += '\n\n' + msg.parts[0].text;
      } else {
        mergedContents.push(msg);
      }
    }

    // Prepend the system instruction to the very first user message 
    const firstUserMsgIndex = mergedContents.findIndex(c => c.role === 'user');
    if (firstUserMsgIndex !== -1) {
      mergedContents[firstUserMsgIndex].parts[0].text = systemInstruction + '\n\n' + mergedContents[firstUserMsgIndex].parts[0].text;
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
    });

    // Primary Call: Answer Student
    const response = await model.generateContent({
      contents: mergedContents,
      generationConfig: {
        temperature: 0.7,
      }
    });

    const aiText = response.response.text();

    return NextResponse.json({
      text: aiText
    });

  } catch (error: any) {
    console.error('Tutor API Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to generate response: ' + (error?.message || 'Unknown error') },
      { status: 500 }
    );
  }
}
