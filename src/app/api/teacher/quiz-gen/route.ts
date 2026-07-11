import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      mode,
      topics,
      syllabusData,
      numQuestions,
      difficulty,
      subject,
      className,
    } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured on server.' }, { status: 500 });
    }

    const topicList = (topics || []).join(', ');
    const syllabusContext = syllabusData
      ? `The teacher has completed the following topics in their syllabus: ${syllabusData}`
      : '';

    const difficultyGuide: Record<string, string> = {
      easy:   'straightforward recall and basic understanding questions',
      medium: 'application and analytical questions requiring reasoning',
      hard:   'evaluative and synthesis questions requiring deep understanding',
      mixed:  'a mix of easy (30%), medium (50%), and hard (20%) questions',
    };

    const n = numQuestions || 10;
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

    // Use the Gemini REST API directly — more reliable than the SDK for JSON mode
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const geminiBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    };

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('[quiz-gen] Gemini API error:', geminiRes.status, errBody.substring(0, 500));
      return NextResponse.json(
        { error: `AI service returned error ${geminiRes.status}. Please try again.` },
        { status: 500 }
      );
    }

    const geminiData = await geminiRes.json();
    let raw: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!raw) {
      const finishReason = geminiData?.candidates?.[0]?.finishReason || 'unknown';
      console.error('[quiz-gen] Empty response from Gemini. Finish reason:', finishReason, 'Full response:', JSON.stringify(geminiData).substring(0, 500));
      return NextResponse.json(
        { error: `AI returned no content (reason: ${finishReason}). Please try again.` },
        { status: 500 }
      );
    }

    // Strip markdown wrappers
    raw = raw.replace(/^```(json)?\s*/gi, '').replace(/\s*```$/g, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
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
