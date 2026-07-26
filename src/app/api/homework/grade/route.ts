import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `You are an expert, supportive AI Teacher grading a student's handwritten homework.
Here are the questions they were assigned:
${(questions || []).map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

Analyze the attached image of their work.
1. Grade it out of 10.
2. Provide constructive feedback. Be encouraging.
3. Determine what concepts they have mastered ("known") and what they still struggle with ("struggling").

Output your response ONLY as a JSON object with this exact structure:
{
  "grade": "String (e.g., '8/10')",
  "score": number (numeric score out of 10),
  "feedback": "String",
  "newKnown": ["concept 1"],
  "newStruggling": ["concept 2"]
}`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
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
    const numericScore = typeof parsed.score === 'number' ? parsed.score : null;

    // Update submission in Supabase (replaces Firebase write)
    const supabase = createAdminClient();

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
              max_score: 10,
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
            max_score: 10,
            teacher_approved: null, // pending teacher review
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
