import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const {
      mode,           // 'full_ai' | 'semi_ai' | 'manual'
      topics,         // string[] — topics to cover
      syllabusData,   // from syllabus tracker (for full_ai)
      numQuestions,   // number
      difficulty,     // 'easy' | 'medium' | 'hard' | 'mixed'
      subject,
      className,
    } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured on server.' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.6,
      },
    });

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

    const prompt = `You are an expert ${subject || 'school'} teacher creating a class quiz for ${className || 'students'}.

${syllabusContext}
${topicList ? `Topics to cover: ${topicList}` : ''}
Difficulty: ${difficultyGuide[difficulty || 'mixed'] || difficultyGuide.mixed}
Number of questions: ${numQuestions || 10}

Generate exactly ${numQuestions || 10} multiple-choice questions.
Each question must have exactly 4 options (A, B, C, D).

Return a JSON object in this exact format:
{
  "title": "Quiz title based on topics",
  "subject": "${subject || 'General'}",
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "explanation": "Brief explanation of why this is correct",
      "difficulty": "easy|medium|hard"
    }
  ]
}

Output ONLY valid JSON, no markdown or extra text.`;

    const response = await model.generateContent(prompt);
    let raw = response.response.text() || '{}';
    
    // Strip markdown wrappers if present despite responseMimeType setting
    raw = raw.replace(/^```(json)?\s*/gi, '').replace(/\s*```$/g, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      console.error('[quiz-gen] JSON parse error. Raw:', raw.substring(0, 300));
      return NextResponse.json({ error: 'AI returned invalid JSON. Please try again.' }, { status: 500 });
    }

    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      return NextResponse.json({ error: 'AI did not return valid questions.' }, { status: 500 });
    }

    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('[quiz-gen] Error:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate quiz. Please try again.' },
      { status: 500 }
    );
  }
}
