import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
  try {
    const { title, description, questions, studentAnswers } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API missing' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an expert diagnostic AI teacher.
    A student has just submitted a multiple choice quiz.
    Quiz Title: ${title || 'Targeted Practice'}
    Description: ${description || ''}
    
    Here are the questions, the correct answers, and the student's answers:
    ${questions.map((q: any, i: number) => `
    Q${i + 1}: ${q.text || q.questionText}
    Correct Answer: ${q.correctAnswer || q.correctOptionId}
    Student Answer: ${studentAnswers[q.id]}
    Is Correct: ${(studentAnswers[q.id] === q.correctAnswer || studentAnswers[q.id] === q.correctOptionId) ? 'Yes' : 'No'}
    `).join('\n')}

    Analyze the student's mistakes (if any) and their correct answers.
    Determine what underlying concepts they are struggling with.
    If they got everything right, suggest advanced topics.
    If they made mistakes, suggest relevant video topics to help them.

    Output ONLY valid JSON with this structure:
    {
      "weaknessTags": ["list", "of", "specific", "concepts", "they", "need", "help", "with"],
      "recommendedVideos": [
        {
          "title": "Title of a highly relevant tutorial video",
          "duration": "e.g., 5 min tutorial"
        },
        {
          "title": "Another relevant video title",
          "duration": "e.g., 8 min tutorial"
        }
      ],
      "summary": "Brief 1-sentence encouraging summary of their performance."
    }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    });

    const rawText = response.text || '{}';
    const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('Quiz Grade Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
