import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * POST /api/teacher/curriculum-gen
 * Generates a rich, topic-specific curriculum path using Gemini.
 * Body: { topic, subject, grade, objectives, teachingMethod, assessmentType, month }
 */
export async function POST(request: NextRequest) {
  try {
    const { topic, subject, grade, objectives, teachingMethod, assessmentType, month } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Gemini API key missing' }, { status: 500 });
    if (!topic) return NextResponse.json({ error: 'topic is required' }, { status: 400 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
    });

    const prompt = `You are an expert curriculum designer for ${subject || 'school'} education.

Generate a detailed, engaging, and HIGHLY SPECIFIC curriculum teaching path for the topic: "${topic}"

Context:
- Subject: ${subject || 'General'}
- Grade/Class: ${grade || 'School level'}
- Month: ${month || 'Term'}
- Learning Objectives: ${objectives || 'Build strong conceptual understanding and application skills'}
- Teaching Method: ${teachingMethod || 'Mixed'}
- Assessment Type: ${assessmentType || 'Written Test'}

Create a curriculum path that is SPECIFIC to "${topic}" — every milestone, resource, and note must be directly about THIS topic. Do NOT use generic placeholders.

Return JSON in this EXACT format:
{
  "overview": "2-3 sentences specifically about why ${topic} matters, real-world connections, and the learning journey for this specific topic",
  "milestones": [
    {
      "title": "Phase 1: Hook — Real-World ${topic} Connection",
      "description": "Specific opening activity or question uniquely tied to ${topic} — e.g. a real example, common misconception, or surprising fact about this exact topic"
    },
    {
      "title": "Phase 2: Core Concepts of ${topic}",
      "description": "The 2-3 foundational principles of ${topic} that students must master, with a specific peer-explanation or demonstration activity"
    },
    {
      "title": "Phase 3: Applying ${topic}",
      "description": "3 specific worked examples or practice problems unique to ${topic}, with the student gradually taking ownership"
    },
    {
      "title": "Phase 4: ${topic} Mastery Assessment",
      "description": "A specific final task or project tied to ${topic} that demonstrates deep understanding — linked to the assessment type: ${assessmentType || 'Written Test'}"
    }
  ],
  "resources": [
    { "id": "res_1", "title": "Concept Map: Key Ideas in ${topic}", "type": "interactive" },
    { "id": "res_2", "title": "${topic} — Real-World Case Study", "type": "document" },
    { "id": "res_3", "title": "Step-by-Step ${topic} Explainer", "type": "video" }
  ],
  "teacherNotes": "Specific common student mistakes in ${topic}, the best analogy or mental model for this exact topic, and pacing tips for ${assessmentType || 'Written Test'} preparation"
}

IMPORTANT: Every field must be specific to "${topic}" — no generic curriculum language. Output ONLY valid JSON.`;

    const response = await model.generateContent(prompt);
    const raw = response.response.text() || '{}';
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('[curriculum-gen]', err);
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 });
  }
}
