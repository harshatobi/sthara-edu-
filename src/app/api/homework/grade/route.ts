import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
  try {
    const { assignmentId, studentId, imageBase64, mimeType, questions } = await request.json();

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured on server.' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `You are an expert, supportive AI Teacher grading a student's handwritten homework.
Here are the questions they were assigned:
${(questions || []).map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

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

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
    });

    const response = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType
        }
      }
    ]);

    const parsed = JSON.parse(response.response.text() || '{}');
    const grade = parsed.grade || 'N/A';
    const feedback = parsed.feedback || 'No feedback provided.';

    // Try to update Firestore via adminDb — but don't crash if it fails
    try {
      const { adminDb } = await import('@/lib/firebase/admin');
      if (adminDb) {
        await adminDb.collection('homework_assignments').doc(assignmentId).update({
          status: 'completed',
          grade,
          feedback,
          completedAt: new Date()
        });

        if (parsed.newKnown || parsed.newStruggling) {
          const memRef = adminDb.collection('student_memory').doc(studentId);
          const memDoc = await memRef.get();
          const memData = memDoc.exists ? memDoc.data() : { known: [], struggling: [] };
          const mergedKnown = Array.from(new Set([...(memData?.known || []), ...(parsed.newKnown || [])]));
          const mergedStruggling = Array.from(new Set([...(memData?.struggling || []), ...(parsed.newStruggling || [])]));
          await memRef.set({ known: mergedKnown, struggling: mergedStruggling, lastUpdated: new Date() }, { merge: true });
        }
      }
    } catch (dbErr) {
      console.warn('Firestore update failed (non-critical):', dbErr);
      // Don't throw - the AI grading succeeded, just Firestore write failed
    }

    return NextResponse.json({ success: true, grade, feedback });

  } catch (error: any) {
    console.error('Grading Error:', error?.message || error);
    return NextResponse.json({ error: 'Grading failed: ' + (error?.message || 'Unknown error') }, { status: 500 });
  }
}
