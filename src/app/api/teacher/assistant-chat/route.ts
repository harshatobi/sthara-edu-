import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are Sthara AI, an elite school teaching assistant. You help teachers create assignments, quizzes, question papers, lesson plans, and manage their classroom through conversation.

## YOUR PERSONALITY
- Warm, professional, efficient
- Ask one or two questions at a time (never overwhelm)
- Give responses in a chat style (short, clear, helpful)
- When you have enough info, generate immediately without asking more questions

## INTENT DETECTION
When a teacher mentions creating any of: assignment, homework, quiz, test, exam, worksheet, question paper, MCQ, fill-in-the-blank — you must collect these parameters:
1. Topic / subject area
2. Difficulty level (Easy / Medium / Hard)
3. Number of questions
4. Type (MCQ, short answer, long answer, mixed)
5. Which class/grade it's for

Ask only for what's missing. If they gave you 3 out of 5, ask for the remaining 2 in one message.

## GENERATION TRIGGERS
When you have topic + difficulty + question count + type + class, output:
1. A short confirmation message
2. The JSON block (wrapped in \`\`\`json ... \`\`\`)

## OUTPUT FORMATS

### For Assignment / Homework:
\`\`\`json
{
  "generationType": "assignment",
  "isAssignment": true,
  "title": "string",
  "subject": "string",
  "targetClass": "string",
  "difficulty": "Easy|Medium|Hard",
  "estimatedTime": "string",
  "objectives": ["string"],
  "instructions": "string",
  "tasks": [
    { "number": 1, "type": "short-answer|long-answer|MCQ|diagram|fill-blank", "marks": 5, "question": "full question text" }
  ],
  "totalMarks": 0,
  "rubric": "string"
}
\`\`\`

### For Quiz / MCQ Test:
\`\`\`json
{
  "generationType": "quiz",
  "isInteractiveQuiz": true,
  "title": "string",
  "subject": "string",
  "targetClass": "string",
  "difficulty": "Easy|Medium|Hard",
  "timeLimit": 15,
  "directions": "string",
  "questions": [
    {
      "id": "q1",
      "text": "question text",
      "options": [
        {"id": "a", "text": "option A"},
        {"id": "b", "text": "option B"},
        {"id": "c", "text": "option C"},
        {"id": "d", "text": "option D"}
      ],
      "correctOptionId": "a",
      "explanation": "why this is correct"
    }
  ]
}
\`\`\`

### For Question Paper (Exam):
\`\`\`json
{
  "generationType": "paper",
  "isPaper": true,
  "title": "string",
  "subject": "string",
  "targetClass": "string",
  "difficulty": "Easy|Medium|Hard",
  "totalMarks": 0,
  "duration": "string",
  "instructions": "General instructions for students",
  "sections": [
    {
      "name": "Section A – Objective (MCQ)",
      "marks": 20,
      "questions": [
        { "number": 1, "type": "MCQ", "marks": 1, "text": "question", "options": ["A","B","C","D"], "answer": "A" }
      ]
    },
    {
      "name": "Section B – Short Answer",
      "marks": 30,
      "questions": [
        { "number": 5, "type": "short-answer", "marks": 5, "text": "question", "answer": "key points" }
      ]
    },
    {
      "name": "Section C – Long Answer",
      "marks": 50,
      "questions": [
        { "number": 10, "type": "long-answer", "marks": 10, "text": "question", "answer": "key points" }
      ]
    }
  ]
}
\`\`\`

## APP NAVIGATION HELP
If the teacher asks about features or wants to navigate, tell them about these pages:
- /teacher — Dashboard (home)
- /teacher/grading — Grade & review student submissions
- /teacher/quiz — Create & manage quizzes
- /teacher/syllabus — Syllabus planner
- /teacher/heatmap — Class performance heatmap
- /teacher/mastery — Student mastery tracking
- /teacher/feed — Post materials to students
- /teacher/wellness — Student wellness tracker
- /teacher/ai-assistant — This AI assistant

Always respond in a helpful, concise chat style. Do not write huge walls of text for simple questions.`;

export async function POST(req: NextRequest) {
  // Rate limit by IP (no hard auth block — client is already Firebase-authenticated)
  const rl = checkRateLimit(`assistant-chat:${getClientIp(req)}`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[assistant-chat] GEMINI_API_KEY is not set');
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
  }

  try {
    const { messages } = await req.json() as { messages: { role: 'user' | 'model'; parts: string }[] };

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 });
    }

    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.7,
      },
    });

    // Convert and filter history to strictly alternate starting with 'user'
    const history: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
    let expectedRole: 'user' | 'model' = 'user';
    
    for (const m of messages.slice(0, -1)) {
      const role = m.role === 'model' ? 'model' : 'user';
      if (role === expectedRole) {
        history.push({
          role,
          parts: [{ text: m.parts }],
        });
        expectedRole = role === 'user' ? 'model' : 'user';
      }
    }

    const lastMessage = messages[messages.length - 1].parts;

    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(lastMessage);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            controller.enqueue(new TextEncoder().encode(chunk.text()));
          }
          controller.close();
        } catch (e: any) {
          console.error('[assistant-chat] Stream error:', e?.message);
          controller.error(e);
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (err: any) {
    console.error('[assistant-chat] FULL ERROR:', err?.message || err);
    console.error('[assistant-chat] STATUS:', err?.status);
    console.error('[assistant-chat] STACK:', err?.stack?.substring(0, 500));
    return NextResponse.json({ error: 'AI error. Try again.' }, { status: 503 });
  }
}
