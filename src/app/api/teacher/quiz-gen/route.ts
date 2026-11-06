import { NextResponse, NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { AI_MODELS, limitOf } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';
import { generateAi, aiConfigured } from '@/lib/ai/generate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Each call spends model quota: teachers and admins only, rate-limited.
  const auth = await requireStaff(request, { academic: true });
  if ('res' in auth) return auth.res;
  if (!checkRateLimit(`quiz-gen:${auth.staff.id}`, ...limitOf('quizGen')).allowed) {
    return NextResponse.json({ error: 'Too many generations. Try again in a few minutes.' }, { status: 429 });
  }
  try {
    const body = await request.json();
    const {
      topics,
      syllabusData,
      numQuestions,
      difficulty,
      subject,
      className,
    } = body;

    const aiBlocked = await aiGate(auth.staff.id, 'teacherTools');
    if (aiBlocked) return aiBlocked;
    if (!aiConfigured()) {
      return NextResponse.json({ error: 'AI isn’t configured on this server.' }, { status: 500 });
    }

    const topicList = (topics || []).join(', ');
    // Truncate syllabusData to avoid overly long prompts
    const syllabusContext = syllabusData
      ? `Teacher's completed syllabus topics: ${syllabusData.substring(0, 800)}`
      : '';

    const difficultyGuide: Record<string, string> = {
      easy:   'straightforward recall and basic understanding questions',
      medium: 'application and analytical questions requiring reasoning',
      hard:   'evaluative and synthesis questions requiring deep understanding',
      mixed:  'a mix of easy (30%), medium (50%), and hard (20%) questions',
    };

    const n = Math.min(Math.max(Number(numQuestions) || 10, 1), 20);
    const subj = subject || 'school';
    const cls = className || 'students';
    const diff = difficultyGuide[difficulty || 'mixed'] || difficultyGuide.mixed;

    const prompt = `You are an expert ${subj} teacher creating a class quiz for ${cls}.

${syllabusContext}
${topicList ? `Topics to cover: ${topicList}` : ''}
Difficulty: ${diff}
Number of questions: ${n}

Generate exactly ${n} multiple-choice questions.
Each question must have exactly 4 options (A, B, C, D).

You MUST return ONLY a valid JSON object. No markdown, no explanation, no code blocks. Just raw JSON.

{
  "title": "Quiz title based on topics",
  "subject": "${subj}",
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "explanation": "Brief explanation of why this is correct",
      "difficulty": "easy"
    }
  ]
}`;

    let raw: string;
    try {
      const res = await generateAi({
        model: AI_MODELS.standard,
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.5, maxOutputTokens: 8192 },
      }, { feature: 'quizGen', userId: auth.staff.id, schoolId: auth.staff.schoolId });
      raw = res.text;
    } catch (e: any) {
      console.error('[quiz-gen] AI error:', e?.message?.substring(0, 500));
      return NextResponse.json({ error: 'The AI service didn’t answer. Please try again.' }, { status: 500 });
    }

    if (!raw) {
      return NextResponse.json({ error: 'AI returned no content. Please try again.' }, { status: 500 });
    }

    // Strip markdown wrappers
    raw = raw.replace(/^```(json)?\s*/gi, '').replace(/\s*```$/g, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('[quiz-gen] JSON parse error. Raw output:', raw.substring(0, 500));
      return NextResponse.json({ error: 'AI returned invalid format. Please try again.' }, { status: 500 });
    }

    if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      console.error('[quiz-gen] No questions array in response:', JSON.stringify(parsed).substring(0, 300));
      return NextResponse.json({ error: 'AI did not return valid questions. Please try again.' }, { status: 500 });
    }

    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('[quiz-gen] Unhandled error:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate quiz. Please try again.' },
      { status: 500 }
    );
  }
}
