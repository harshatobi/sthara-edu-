import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(request: Request) {
  try {
    const { messages, studentId, studentName, studentClass } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured on server.' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Fetch memory
    let memoryData = { known: [], struggling: [] };
    if (studentId && adminDb) {
      const memoryDoc = await adminDb.collection('student_memory').doc(studentId).get();
      if (memoryDoc.exists) {
        memoryData = memoryDoc.data() as any;
      }
    }

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
    const mergedContents = [];
    for (const msg of contents) {
      if (mergedContents.length > 0 && mergedContents[mergedContents.length - 1].role === msg.role) {
        mergedContents[mergedContents.length - 1].parts[0].text += '\n\n' + msg.parts[0].text;
      } else {
        mergedContents.push(msg);
      }
    }

    // Prepend the system instruction to the very first user message 
    // to match the Teacher Assistant API pattern and avoid endpoint restrictions
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

    // Background Call: Update Memory
    if (studentId && adminDb) {
      // Don't await this so it doesn't block the response to the user
      // However, in serverless environments, background promises might be killed.
      // Next.js app router API can use `waitUntil` but here we just fire it.
      const memModel = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
      memModel.generateContent({
        contents: [
          { role: 'user', parts: [{ text: `Analyze this recent interaction between a student and an AI tutor.\n\nInteraction:\n${messages.map((m: any) => `${m.sender}: ${m.text}`).join('\n')}\nAI response: ${aiText}\n\nBased on this interaction, output a JSON object representing the student's updated understanding. It should have two arrays: "known" (topics they seem to understand) and "struggling" (topics they are having trouble with). Only include newly discovered information or reinforcement of existing topics. Return purely valid JSON, no markdown blocks.` }] }
        ],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      }).then(async (memRes) => {
        try {
          const parsed = JSON.parse(memRes.response.text() || '{}');
          if (parsed.known || parsed.struggling) {
            // Merge with existing
            const newKnown = Array.from(new Set([...(memoryData.known || []), ...(parsed.known || [])]));
            const newStruggling = Array.from(new Set([...(memoryData.struggling || []), ...(parsed.struggling || [])]));
            await adminDb.collection('student_memory').doc(studentId).set({
              known: newKnown,
              struggling: newStruggling,
              lastUpdated: new Date()
            }, { merge: true });
          }
        } catch (e) {
          console.error('Failed to parse memory update', e);
        }
      }).catch(console.error);
    }

    return NextResponse.json({
      text: aiText
    });

  } catch (error: any) {
    console.error('Gemini API Error details:', error);
    if (error.statusDetails) {
      console.error('Gemini API Error status details:', JSON.stringify(error.statusDetails, null, 2));
    }
    return NextResponse.json(
      { error: 'Failed to generate response: ' + error.message },
      { status: 500 }
    );
  }
}
