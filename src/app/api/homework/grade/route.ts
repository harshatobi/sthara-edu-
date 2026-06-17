import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(request: Request) {
  try {
    const { assignmentId, studentId, imageBase64, mimeType, questions } = await request.json();

    if (!adminDb || !process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Server not configured properly' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `You are an expert, supportive AI Teacher grading a student's handwritten homework.
Here are the questions they were assigned:
${questions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

Analyze the attached image of their work.
1. Grade it out of 10 or 100.
2. Provide constructive feedback. Be encouraging.
3. Determine what concepts they have mastered ("known") and what they still struggle with ("struggling").

Output your response ONLY as a JSON object with this exact structure:
{
  "grade": "String (e.g., '8/10')",
  "feedback": "String",
  "newKnown": ["concept 1"],
  "newStruggling": ["concept 2"]
}`;

    // Note: If using gemini-2.5-flash with image, we construct the part
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { data: imageBase64, mimeType } }
          ]
        }
      ],
      config: { responseMimeType: 'application/json', temperature: 0.2 }
    });

    const parsed = JSON.parse(response.text || '{}');

    // Update Assignment
    await adminDb.collection('homework_assignments').doc(assignmentId).update({
      status: 'completed',
      grade: parsed.grade || 'N/A',
      feedback: parsed.feedback || 'No feedback provided.',
      completedAt: new Date()
    });

    // Update Student Memory
    if (parsed.newKnown || parsed.newStruggling) {
      const memRef = adminDb.collection('student_memory').doc(studentId);
      const memDoc = await memRef.get();
      const memData = memDoc.exists ? memDoc.data() : { known: [], struggling: [] };

      const mergedKnown = Array.from(new Set([...(memData?.known || []), ...(parsed.newKnown || [])]));
      const mergedStruggling = Array.from(new Set([...(memData?.struggling || []), ...(parsed.newStruggling || [])]));

      await memRef.set({
        known: mergedKnown,
        struggling: mergedStruggling,
        lastUpdated: new Date()
      }, { merge: true });
    }

    return NextResponse.json({ success: true, grade: parsed.grade });

  } catch (error) {
    console.error('Grading Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
