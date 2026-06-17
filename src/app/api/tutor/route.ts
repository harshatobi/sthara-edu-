import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(request: Request) {
  try {
    const { messages, studentId, studentName, studentClass } = await request.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key not configured on server.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
3. ADAPTIVE: Keep in mind the student's learning profile. 
   What they know: ${memoryData.known?.join(', ') || 'Unknown'}
   What they struggle with: ${memoryData.struggling?.join(', ') || 'Unknown'}
   Tailor your explanation to their level. Keep responses concise and encouraging.`;

    const contents = messages.map((msg: any) => ({
      role: msg.sender === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    // Primary Call: Answer Student
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      }
    });

    const aiText = response.text;

    // Background Call: Update Memory
    if (studentId && adminDb) {
      // Don't await this so it doesn't block the response to the user
      // However, in serverless environments, background promises might be killed.
      // Next.js app router API can use `waitUntil` but here we just fire it.
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: `Analyze this recent interaction between a student and an AI tutor.\n\nInteraction:\n${messages.map((m: any) => `${m.sender}: ${m.text}`).join('\n')}\nAI response: ${aiText}\n\nBased on this interaction, output a JSON object representing the student's updated understanding. It should have two arrays: "known" (topics they seem to understand) and "struggling" (topics they are having trouble with). Only include newly discovered information or reinforcement of existing topics. Return purely valid JSON, no markdown blocks.` }] }
        ],
        config: { temperature: 0.1, responseMimeType: 'application/json' }
      }).then(async (memRes) => {
        try {
          const parsed = JSON.parse(memRes.text || '{}');
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
    console.error('Gemini API Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}
