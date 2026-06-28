import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
    if (!apiKey) return NextResponse.json({ error: 'Gemini API missing' }, { status: 500 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json', temperature: 0.5 },
    });

    const topicList = (topics || []).join(', ');
    const syllabusContext = syllabusData
      ? `The teacher has completed the following topics in their syllabus: ${syllabusData}`
      : '';

    const difficultyGuide: Record<string, string> = {
      easy: 'straightforward recall and basic understanding questions',
      medium: 'application and analytical questions requiring reasoning',
      hard: 'evaluative and synthesis questions requiring deep understanding',
      mixed: 'a mix of easy (30%), medium (50%), and hard (20%) questions',
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
    const raw = response.response.text() || '{}';
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);

  } catch (error) {
    console.error('Teacher Quiz Gen Error:', error);
    return NextResponse.json({ error: 'Failed to generate quiz' }, { status: 500 });
  }
}
