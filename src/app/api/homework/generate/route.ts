import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(request: Request) {
  try {
    const { class: className, subject, topic, teacherId } = await request.json();

    if (!adminDb) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API missing' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Get all students in this class
    const studentsSnap = await adminDb.collection('users')
      .where('role', '==', 'student')
      .where('studentClass', '==', className)
      .get();

    const assignments = [];

    // Note: In production, firing dozens of Gemini calls simultaneously might hit rate limits.
    // For this demo, we'll map over them. You might want to process in chunks.
    const generationPromises = studentsSnap.docs.map(async (doc) => {
      const studentId = doc.id;
      const student = doc.data();

      // Fetch memory profile
      const memoryDoc = await adminDb!.collection('student_memory').doc(studentId).get();
      const memory = memoryDoc.exists ? memoryDoc.data() : { known: [], struggling: [] };

      const prompt = `You are an expert teacher creating a personalized homework assignment.
Subject: ${subject}
Topic: ${topic}
Student Name: ${student.name}
Student's strengths: ${memory?.known?.join(', ') || 'Unknown'}
Student's weaknesses: ${memory?.struggling?.join(', ') || 'Unknown'}

Generate a short, 3-question homework assignment that covers the topic. 
Adapt the difficulty based on their strengths and weaknesses. If they struggle with a related concept, simplify the first question.
Format the output as a clean JSON object with a "questions" array containing strings. No markdown blocks, just the JSON string.`;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { responseMimeType: 'application/json', temperature: 0.7 }
        });

        const parsed = JSON.parse(response.text || '{"questions": ["Error generating questions"]}');

        const assignmentRef = adminDb!.collection('homework_assignments').doc();
        await assignmentRef.set({
          studentId,
          studentName: student.name,
          class: className,
          subject,
          topic,
          teacherId,
          questions: parsed.questions,
          status: 'pending',
          createdAt: new Date()
        });

        assignments.push({ studentId, questions: parsed.questions });
      } catch (e) {
        console.error('Failed to generate for student', studentId, e);
      }
    });

    await Promise.all(generationPromises);

    return NextResponse.json({ success: true, count: assignments.length });

  } catch (error) {
    console.error('Homework Generation Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
