import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/post-assignment
 * Body: { schoolId, title, type, dueDate, description, class, subject, teacherId, teacherName, tasks?, totalMarks?, questions? }
 * Inserts a new assignment row into the assignments table.
 */
export async function POST(req: NextRequest) {
  const { user, error: authError } = await verifyApiToken(req.headers.get('authorization'));
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      schoolId,
      title,
      type,
      dueDate,
      description,
      class: assignmentClass,
      subject,
      teacherId,
      tasks,
      totalMarks,
      questions,
      assignedStudentIds,
      questionPaperUrl,
      units,
    } = body;

    if (!schoolId || !title || !teacherId) {
      return NextResponse.json({ error: 'Missing required fields: schoolId, title, teacherId' }, { status: 400 });
    }

    // ── AI Topic & Curriculum Unit Analysis ──────────────────────────────────
    let finalUnits: string[] = Array.isArray(units) && units.length > 0 ? units : [];

    if (finalUnits.length === 0) {
      // Try AI extraction of topic/unit from curriculum content
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        try {
          const { GoogleGenAI } = await import('@google/genai');
          const ai = new GoogleGenAI({ apiKey });
          const prompt = `You are a curriculum expert for school education.
Analyze this posted homework/assignment for ${assignmentClass || 'Class 10'} ${subject || 'Science'}:
Title: "${title}"
Description: "${description || ''}"
Questions: ${JSON.stringify(questions || [])}

Extract 1-2 concise, formal curriculum topic/unit names (e.g. "Chemical Reactions and Equations", "Acids, Bases and Salts", "Life Processes", "Quadratic Equations").
Return ONLY a JSON array of strings, e.g.: ["Chemical Reactions and Equations"]`;

          const aiRes = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json', temperature: 0.1 },
          });

          const parsed = JSON.parse(aiRes.text || '[]');
          if (Array.isArray(parsed) && parsed.length > 0) {
            finalUnits = parsed.map((u: string) => String(u).trim()).filter(Boolean);
          }
        } catch (aiErr) {
          console.warn('[post-assignment] AI topic extraction failed, using title fallback:', aiErr);
        }
      }

      // Fallback: Use formatted title if AI topic extraction was empty
      if (finalUnits.length === 0) {
        const cleanTitle = title.trim().replace(/^homework:?\s*/i, '');
        const formattedTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
        finalUnits = [formattedTitle];
      }
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('assignments')
      .insert({
        school_id: schoolId,
        teacher_id: teacherId,
        title,
        type: type || 'homework',
        due_date: dueDate || null,
        description: description || '',
        class: assignmentClass || null,
        subject: subject || null,
        tasks: tasks || [],
        total_marks: totalMarks || null,
        questions: questions || [],
        question_paper_url: questionPaperUrl || null,
        assigned_student_ids: assignedStudentIds || [],
        units: finalUnits,
        status: 'published',
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, id: data.id });
  } catch (err: any) {
    console.error('[post-assignment]', err);
    return NextResponse.json({ error: err.message || 'Failed to post assignment' }, { status: 500 });
  }
}
