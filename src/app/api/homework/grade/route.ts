import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { computeStudentTml } from '@/lib/tml/engine';
import { checkRateLimit } from '@/lib/rateLimit';
import { AI_MODELS, limitOf } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/homework/grade
 * Grades student handwritten work image using Gemini 2.5 Flash
 * Generates an in-depth, step-by-step AI diagnostic mistake analysis.
 */
export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = checkRateLimit(`homework-grade:${user.id}`, ...limitOf('homeworkGrade'));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before grading again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  try {
    const { assignmentId, studentId, imageBase64, mimeType, images, imageUrls } = await request.json();

    if (studentId && user.id !== studentId) {
      return NextResponse.json({ error: 'Forbidden: can only submit your own grading request' }, { status: 403 });
    }

    // Accept either a single page (imageBase64/mimeType, legacy) or multiple pages
    // (images: [{ data, mimeType }], for multi-page handwritten submissions) — graded
    // together in one Gemini call so a page break never splits a question's evidence.
    const rawPages: any[] = Array.isArray(images) && images.length > 0
      ? images
      : imageBase64
        ? [{ data: imageBase64, mimeType: mimeType || 'image/jpeg' }]
        : [];

    const pages = rawPages.filter(
      (p): p is { data: string; mimeType: string } => !!p && typeof p.data === 'string' && p.data.length > 0
    ).map(p => ({ data: p.data, mimeType: typeof p.mimeType === 'string' && p.mimeType ? p.mimeType : 'image/jpeg' }));

    if (pages.length === 0) {
      return NextResponse.json({ error: 'Missing imageBase64 or images' }, { status: 400 });
    }

    const aiBlocked = await aiGate(user.id);
    if (aiBlocked) return aiBlocked;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured on server.' }, { status: 500 });
    }

    const supabase = createAdminClient();
    let totalMarks = 10;
    let assignmentTitle = 'Homework Task';
    let assignmentSubject = 'General';

    // Who's submitting and for what comes from the database, not the request:
    // a student, in the assignment's school, for posted work, exactly once.
    if (!assignmentId) return NextResponse.json({ error: 'assignmentId is required' }, { status: 400 });
    const [{ data: me }, { data: assignRow }] = await Promise.all([
      supabase.from('users').select('role, school_id').eq('id', user.id).maybeSingle(),
      supabase.from('assignments').select('total_marks, title, subject, units, school_id, status, questions').eq('id', assignmentId).maybeSingle(),
    ]);
    if (me?.role !== 'student') return NextResponse.json({ error: 'Only students submit homework.' }, { status: 403 });
    if (!assignRow || assignRow.status === 'draft') return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
    if (!me.school_id || me.school_id !== assignRow.school_id) return NextResponse.json({ error: 'This assignment is not in your school.' }, { status: 403 });
    const { data: already } = await supabase.from('submissions').select('id').eq('assignment_id', assignmentId).eq('student_id', user.id).maybeSingle();
    if (already) return NextResponse.json({ error: 'You have already submitted this assignment.' }, { status: 409 });
    const ownSchoolId: string = me.school_id;
    // Grade against the questions the teacher set, not whatever the client sends.
    const questions: any[] = Array.isArray(assignRow.questions) ? assignRow.questions : [];
    if (assignRow.total_marks) totalMarks = assignRow.total_marks;
    if (assignRow.title) assignmentTitle = assignRow.title;
    if (assignRow.subject) assignmentSubject = assignRow.subject;

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are a master CBSE Master Teacher conducting a detailed, thorough diagnostic grading of a student's handwritten homework.
Assignment: "${assignmentTitle}" (Subject: ${assignmentSubject}, Total Marks: ${totalMarks}).

Questions assigned:
${(questions || []).map((q: any, i: number) => {
  const text = typeof q === 'string' ? q : (q.questionText || q.question || `Question ${i + 1}`);
  const m = typeof q === 'object' && q.marks ? ` (${q.marks} marks)` : '';
  return `${i + 1}. ${text}${m}`;
}).join('\n')}

Analyze the attached handwritten answer sheet image meticulously.
Provide a rich, highly detailed, question-by-question breakdown explaining:
1. Exactly what the student wrote (handwriting transcription).
2. What they got right (praise specific steps/formulas/reasoning).
3. Where they went wrong (exact line, step, missing state symbols, formula errors, calculation errors).
4. The exact reason marks were lost.
5. How to fix the mistake step-by-step with the correct solution and key concept explanation.

Output your response ONLY as a single valid JSON object matching this exact schema:
{
  "grade": "String (e.g., '4/${totalMarks}')",
  "score": number (numeric score out of ${totalMarks}),
  "percentageScore": number (0 to 100),
  "summary": "Thorough 2-3 sentence overall diagnostic summary of the student's work.",
  "feedback": "Encouraging, actionable teacher feedback for the student.",
  "questions": [
    {
      "questionNumber": 1,
      "questionText": "Full question text",
      "awardedScore": number,
      "maxScore": number,
      "isFinalAnswerCorrect": boolean,
      "studentWrittenAnswer": "Transcription of student's handwriting for this question",
      "whatStudentGotRight": "Detailed explanation of what the student got right",
      "lostMarksReason": "Detailed explanation of why marks were deducted and where they went wrong",
      "exactStepByStepMistake": "Specific line/calculation error description",
      "teacherExplanation": "Key concept and textbook explanation",
      "howToFix": "Step-by-step correction guide for the student"
    }
  ],
  "weaknessTags": ["concept_tag_1", "concept_tag_2"],
  "newKnown": ["concept_1"],
  "newStruggling": ["concept_2"]
}`;

    const result = await ai.models.generateContent({
      model: AI_MODELS.standard,
      contents: [
        {
          role: 'user',
          parts: [
            { text: pages.length > 1 ? `${prompt}\n\nThe answer sheet spans ${pages.length} photographed pages, attached in order.` : prompt },
            ...pages.map(p => ({ inlineData: { data: p.data, mimeType: p.mimeType } })),
          ],
        },
      ],
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });

    const parsed = JSON.parse(result.text || '{}');
    const numericScore = typeof parsed.score === 'number' ? Math.min(parsed.score, totalMarks) : null;
    const gradeString = parsed.grade || (numericScore !== null ? `${numericScore}/${totalMarks}` : 'N/A');

    // Save or Update submission record in Supabase
    if (assignmentId) {
      const studentId = user.id;
      const { data: existingSub } = await supabase
        .from('submissions')
        .select('id')
        .eq('assignment_id', assignmentId)
        .eq('student_id', studentId)
        .maybeSingle();

      let subId = existingSub?.id;

      if (existingSub) {
        await supabase
          .from('submissions')
          .update({
            ai_feedback: parsed.feedback || parsed.summary || 'AI grading complete.',
            ai_grade: gradeString,
            score: numericScore,
            max_score: totalMarks,
            ai_result: parsed, // Save full rich diagnostic JSON
            ai_graded: true,
            image_urls: Array.isArray(imageUrls) && imageUrls.length > 0 ? imageUrls : undefined,
            type: 'handwritten',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSub.id);
      } else {
        const { data: newSub } = await supabase.from('submissions').insert({
          assignment_id: assignmentId,
          student_id: studentId,
          school_id: ownSchoolId,
          ai_feedback: parsed.feedback || parsed.summary || 'AI grading complete.',
          ai_grade: gradeString,
          score: numericScore,
          max_score: totalMarks,
          ai_result: parsed,
          ai_graded: true,
          image_urls: Array.isArray(imageUrls) ? imageUrls : [],
          type: 'handwritten',
          teacher_approved: null, // pending teacher approval before updating heatmaps
        }).select('id').single();

        if (newSub?.id) subId = newSub.id;
      }

      // Persist submission items for TML metric engine if questions exist
      if (subId && Array.isArray(parsed.questions)) {
        for (let i = 0; i < parsed.questions.length; i++) {
          const q = parsed.questions[i];
          await supabase.from('submission_items').insert({
            submission_id: subId,
            assignment_id: assignmentId,
            student_id: studentId,
            school_id: ownSchoolId,
            question_index: i + 1,
            component_type: 'homework',
            score: q.awardedScore || 0,
            max_score: q.maxScore || 1,
            teacher_confirmed: false,
          });
        }
      }

      // Update student memory profile
      if (parsed.newKnown?.length || parsed.newStruggling?.length) {
        const { data: studentRow } = await supabase
          .from('users')
          .select('memory_profile')
          .eq('id', studentId)
          .maybeSingle();

        const existingMemory = (studentRow?.memory_profile as any) || { known: [], struggling: [] };
        const updatedKnown = Array.from(new Set([...(existingMemory.known || []), ...(parsed.newKnown || [])]));
        const updatedStruggling = Array.from(new Set([...(existingMemory.struggling || []), ...(parsed.newStruggling || [])]));

        await supabase
          .from('users')
          .update({
            memory_profile: {
              ...existingMemory,
              known: updatedKnown,
              struggling: updatedStruggling,
              lastAssessed: new Date().toISOString(),
            },
          })
          .eq('id', studentId);
      }

      // Refresh True Mastery Level for this subject now that new evidence
      // exists — best-effort, never fails the grading response.
      try {
        await computeStudentTml(supabase, studentId, assignmentSubject);
      } catch (tmlErr) {
        console.error('[homework/grade] TML recomputation error:', tmlErr);
      }
    }

    return NextResponse.json({
      success: true,
      grade: gradeString,
      score: numericScore,
      totalMarks,
      aiResult: parsed,
    });
  } catch (err: any) {
    console.error('[AI Homework Grade Error]:', err);
    return NextResponse.json({ error: err.message || 'AI grading failed' }, { status: 500 });
  }
}
