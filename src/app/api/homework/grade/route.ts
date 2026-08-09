import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { assignmentId, studentId, imageBase64, mimeType, questions, schoolId } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured on server.' }, { status: 500 });
    }

    // ── Fetch real total_marks from the assignment row ────────────────────────
    const supabase = createAdminClient();
    let totalMarks = 10; // default fallback
    if (assignmentId) {
      const { data: assignRow } = await supabase
        .from('assignments')
        .select('total_marks')
        .eq('id', assignmentId)
        .maybeSingle();
      if (assignRow?.total_marks) totalMarks = assignRow.total_marks;
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an expert, supportive AI Teacher grading a student's handwritten homework.
Here are the questions they were assigned:
${(questions || []).map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

Analyze the attached image of their work.
1. Grade it out of ${totalMarks}.
2. Provide constructive feedback. Be encouraging.
3. Determine what concepts they have mastered ("known") and what they still struggle with ("struggling").

Output your response ONLY as a JSON object with this exact structure:
{
  "grade": "String (e.g., '8/${totalMarks}')",
  "score": number (numeric score out of ${totalMarks}),
  "feedback": "String",
  "newKnown": ["concept 1"],
  "newStruggling": ["concept 2"]
}`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { data: imageBase64, mimeType } },
          ],
        },
      ],
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });

    const parsed = JSON.parse(result.text || '{}');
    const grade = parsed.grade || 'N/A';
    const feedback = parsed.feedback || 'No feedback provided.';
    const numericScore = typeof parsed.score === 'number' ? Math.min(parsed.score, totalMarks) : null;

    // Update submission in Supabase (replaces Firebase write)
    if (assignmentId && studentId) {
      try {
        // Update submission record with AI score
        const { data: existingSub } = await supabase
          .from('submissions')
          .select('id')
          .eq('assignment_id', assignmentId)
          .eq('student_id', studentId)
          .maybeSingle();

        if (existingSub) {
          await supabase
            .from('submissions')
            .update({
              ai_feedback: feedback,
              ai_grade: grade,
              score: numericScore,
              max_score: totalMarks,   // ← use real assignment total, not hardcoded 10
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingSub.id);
        } else {
          // Create a new submission record if it doesn't exist
          await supabase.from('submissions').insert({
            assignment_id: assignmentId,
            student_id: studentId,
            school_id: schoolId || null,
            ai_feedback: feedback,
            ai_grade: grade,
            score: numericScore,
            max_score: totalMarks,     // ← use real assignment total, not hardcoded 10
            teacher_approved: null, // pending teacher review
          });
        }

        // Persist append-only TML score history entry
        if (numericScore !== null && totalMarks > 0) {
          const pct = Math.min(100, Math.max(0, Math.round((numericScore / totalMarks) * 100)));
          await supabase.from('tml_scores').insert({
            student_id: studentId,
            school_id: schoolId || null,
            subject: assignRow?.subject || 'General',
            score: pct,
            components: {
              assignmentId,
              grade,
              numericScore,
              maxScore: totalMarks,
              source: 'ai_grade',
            },
            computed_at: new Date().toISOString(),
          });
        }

        // Update student memory profile in Supabase users table
        if (parsed.newKnown?.length || parsed.newStruggling?.length) {
          const { data: studentRow } = await supabase
            .from('users')
            .select('memory_profile')
            .eq('id', studentId)
            .maybeSingle();

          const existingMemory = (studentRow?.memory_profile as any) || { known: [], struggling: [] };
          const mergedKnown = Array.from(new Set([...(existingMemory.known || []), ...(parsed.newKnown || [])]));
          const mergedStruggling = Array.from(new Set([...(existingMemory.struggling || []), ...(parsed.newStruggling || [])]));

          await supabase
            .from('users')
            .update({ memory_profile: { known: mergedKnown, struggling: mergedStruggling, lastUpdated: new Date().toISOString() } })
            .eq('id', studentId);
        }
      } catch (dbErr) {
        console.warn('Supabase update failed (non-critical):', dbErr);
        // Don't throw - AI grading succeeded, only DB write failed
      }
    }

    return NextResponse.json({ success: true, grade, feedback, score: numericScore });

  } catch (error: any) {
    console.error('Grading Error:', error?.message || error);
    return NextResponse.json({ error: 'Grading failed: ' + (error?.message || 'Unknown error') }, { status: 500 });
  }
}
