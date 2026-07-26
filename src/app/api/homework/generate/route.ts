import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { class: className, subject, topic, teacherId, schoolId } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    const supabase = createAdminClient();

    // Get all students in this class from Supabase (not Firebase)
    const { data: studentsData, error: studErr } = await supabase
      .from('users')
      .select('id, name, student_class, branch, memory_profile')
      .eq('role', 'student')
      .eq('school_id', schoolId || '');

    if (studErr) throw studErr;

    const students = (studentsData || []).filter(s =>
      !className || (s.student_class || s.branch || '').toLowerCase().includes(className.toLowerCase())
    );

    if (students.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'No students found for this class' });
    }

    const ai = new GoogleGenAI({ apiKey });
    let successCount = 0;

    // Process students (limit concurrency to avoid rate limits)
    const BATCH_SIZE = 5;
    for (let i = 0; i < students.length; i += BATCH_SIZE) {
      const batch = students.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (student) => {
        const memory = student.memory_profile as any || { known: [], struggling: [] };

        const prompt = `You are an expert teacher creating a personalized homework assignment.
Subject: ${subject}
Topic: ${topic}
Student Name: ${student.name}
Student's strengths: ${(memory.known || []).join(', ') || 'Not yet assessed'}
Student's weaknesses: ${(memory.struggling || []).join(', ') || 'Not yet assessed'}

Generate a short, 3-question homework assignment that covers the topic.
Adapt the difficulty based on their strengths and weaknesses.
Format the output as a clean JSON object with a "questions" array containing strings. No markdown blocks, just the JSON string.`;

        try {
          const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json', temperature: 0.7 },
          });
          const parsed = JSON.parse(result.text || '{"questions": ["Describe the main concepts of this topic."]}');

          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 7);

          // Save to Supabase assignments table (consistent with the rest of the app)
          await supabase.from('assignments').insert({
            school_id: schoolId,
            teacher_id: teacherId || user.id,
            title: `[AI] ${topic} — Personalized for ${student.name}`,
            type: 'homework',
            subject: subject || 'General',
            class: className || student.student_class || student.branch || '',
            description: `AI-generated personalized assignment for ${student.name}`,
            questions: parsed.questions.map((q: string) => ({ questionText: q, marks: null })),
            due_date: dueDate.toISOString().split('T')[0],
          });

          successCount++;
        } catch (e) {
          console.error('Failed to generate for student', student.id, e);
        }
      }));
    }

    return NextResponse.json({ success: true, count: successCount, total: students.length });

  } catch (error: any) {
    console.error('Homework Generation Error:', error);
    return NextResponse.json({ error: 'Internal Server Error: ' + error.message }, { status: 500 });
  }
}
