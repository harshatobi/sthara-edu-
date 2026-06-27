import { NextResponse } from 'next/server';

// Removed 'edge' runtime — edge has payload size limits that break base64 image uploads
const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

export async function POST(request: Request) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API Key is not configured on server.' }, { status: 500 });
    }

    const body = await request.json();
    const {
      imageBase64,
      mimeType: directMime,
      imageUrl,
      assignmentTitle,
      assignmentDescription,
      assignmentSubject,
      assignmentQuestions,
    } = body;

    let base64Image = '';
    let mimeType = 'image/jpeg';

    if (imageBase64) {
      base64Image = imageBase64;
      mimeType = directMime || 'image/jpeg';
    } else if (imageUrl) {
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
      const arrayBuffer = await imageResponse.arrayBuffer();
      base64Image = Buffer.from(arrayBuffer).toString('base64');
      mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
    } else {
      return NextResponse.json({ error: 'Missing imageBase64 or imageUrl' }, { status: 400 });
    }

    // Build context string from assignment metadata
    const subject = assignmentSubject || 'General';
    let contextStr = '';
    if (assignmentTitle) contextStr += `Assignment Title: ${assignmentTitle}\n`;
    if (assignmentSubject) contextStr += `Subject: ${assignmentSubject}\n`;
    if (assignmentDescription) contextStr += `Instructions: ${assignmentDescription}\n`;
    if (assignmentQuestions && assignmentQuestions.length > 0) {
      contextStr += `Questions:\n`;
      assignmentQuestions.forEach((q: string, idx: number) => {
        contextStr += `Q${idx + 1}: ${q}\n`;
      });
    }

    const systemPrompt = `You are an elite AI academic evaluator and diagnostic engine. A student has submitted a photo of their handwritten work.

ASSIGNMENT CONTEXT:
${contextStr || 'No specific context provided — extract questions directly from the image.'}

YOUR TASK:
1. Carefully read and transcribe every piece of work in the image
2. For each question or task found, analyze the student's approach step by step
3. Classify each step as: "correct", "logic_error" (wrong formula/concept), or "procedural_error" (right concept but execution mistake)
4. Award marks using this rubric:
   - Full marks (5): Correct answer with correct procedure
   - Partial marks (1-4): Right procedure, wrong answer OR right answer, wrong procedure
   - Zero (0): Wrong answer AND wrong procedure
   - Max per question: 5 marks

IMPORTANT: Be subject-agnostic. This could be Math, Science, English essays, History, etc. Adapt your analysis accordingly.
For essay/written answers: analyze argument quality, evidence, structure, and accuracy.
For math/science: analyze computation steps, formulas, and logical derivations.

OUTPUT: Return ONLY valid JSON in this exact structure, no markdown wrappers:
{
  "questions": [
    {
      "questionText": "Transcribed question text",
      "steps": [
        {
          "text": "Exact step/sentence/working the student wrote",
          "type": "correct" | "logic_error" | "procedural_error",
          "explanation": "If error: why it's wrong and what should be done. If correct: null",
          "penalty": 0
        }
      ],
      "finalAnswer": "Student's final answer or conclusion",
      "isFinalAnswerCorrect": true,
      "awardedScore": 4,
      "maxScore": 5,
      "aiCorrectedSolution": ["Correct step 1", "Correct step 2", "Correct final answer"]
    }
  ],
  "totalScore": 12,
  "maxTotalScore": 15,
  "summary": "One sentence overall performance summary, encouraging but honest",
  "weaknessTags": ["concept_or_skill_they_struggle_with", "another_weakness"],
  "recommendedVideos": [
    { "title": "Specific tutorial topic to help with their weakness", "duration": "~8 min" },
    { "title": "Another targeted video topic", "duration": "~12 min" }
  ]
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;

    const geminiPayload = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            { inlineData: { mimeType, data: base64Image } }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('Gemini API Error:', errText);
      throw new Error(`Gemini API failed (${geminiResponse.status}): ${errText}`);
    }

    const geminiData = await geminiResponse.json();
    let textOutput = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!textOutput) throw new Error('No output returned from Gemini Vision API.');

    // Strip markdown wrappers if present despite responseMimeType setting
    textOutput = textOutput.replace(/^```json\s*/g, '').replace(/\s*```$/g, '').trim();

    const result = JSON.parse(textOutput);

    // Ensure grade string is computed
    result.grade = `${result.totalScore}/${result.maxTotalScore}`;

    return NextResponse.json({ success: true, ...result });

  } catch (error: any) {
    console.error('Grade Image Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
