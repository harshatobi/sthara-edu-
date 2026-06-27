import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const token = await verifyApiToken(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rl = checkRateLimit(`assistant:${getClientIp(req)}`, 15, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
  try {
    const { topic, gradeLevel, tone, outputFormat } = await req.json();

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key is not configured" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-pro",
      generationConfig: {
        temperature: 0.7, // Balances creativity with factual accuracy
      }
    });

    const prompt = `You are "Sthara Intelligence", a world-class, elite AI Teaching Assistant built to rival the best models in the world. Your goal is to generate extremely high-quality, factually dense, and perfectly formatted educational content.

CRITICAL DIRECTIVES:
1. NEVER output conversational filler (e.g., "Here is the lesson plan", "Sure!"). Output ONLY the requested content.
2. Be highly specific. If asked about "The French Revolution", do not write generic things like "Discuss the causes". You must list the ACTUAL causes (e.g., "The Estates System, crippling national debt from wars, Enlightenment ideas, and poor harvests").

OUTPUT FORMAT ROUTING:
You must strictly follow the rules for the requested format.

IF FORMAT IS "Multiple Choice Quiz":
You MUST output your response STRICTLY as a JSON object wrapped in \`\`\`json code blocks.
Structure:
{
  "isQuiz": true,
  "title": "A relevant title",
  "directions": "Clear instructions for the student",
  "questions": [
    {
      "text": "The question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answerIndex": 0,
      "explanation": "Brief explanation of why this is correct."
    }
  ]
}

IF FORMAT IS "Grading Rubric Table":
You must output a highly detailed Markdown table. The columns MUST be: Criteria, Exemplary (4), Proficient (3), Developing (2), Beginning (1).
CRITICAL RULE FOR RUBRIC CONTENT: 
Do NOT write meta-descriptions of student performance like "Presents a clear thesis", "Provides a detailed analysis", or "Mentions a divide".
Instead, the cells must literally just be the EXACT raw factual answers and subject matter you expect them to write. It should read like an answer key.
For example, instead of writing "Thesis argues that the social structure caused the revolution", you MUST write: "The rigid social structure of the Ancien Régime, crippling state debt, and Enlightenment ideals were the primary drivers."
Every cell must contain pure historical facts, concepts, and arguments relevant to the topic. Do not write about HOW the student should write it. Just give the teacher the WHAT.
IF FORMAT IS "Standard Lesson Plan":
Output beautifully formatted Markdown with headers (## Overview, ## Objectives, ## Key Vocabulary, ## Activities, ## Assessment). Include highly specific facts and deep content.

IF FORMAT IS "Bullet-point Summary":
Output a dense, highly factual Markdown bulleted list covering the most critical aspects of the topic.

REQUEST DETAILS:
- Topic: ${topic}
- Target Grade Level: ${gradeLevel || 'High School'}
- Tone: ${tone || 'Academic & Professional'}
- Requested Format: ${outputFormat || 'Standard Lesson Plan'}`;

    const streamResult = await model.generateContentStream(prompt);
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamResult.stream) {
            controller.enqueue(new TextEncoder().encode(chunk.text()));
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked'
      }
    });

  } catch (error: any) {
    console.error("API Generation Error:", error);
    return NextResponse.json(
      { error: "Our AI systems are currently under heavy load. Please try again in a few moments." },
      { status: 503 }
    );
  }
}
