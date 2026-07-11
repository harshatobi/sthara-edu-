import { NextResponse, NextRequest } from 'next/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// Increase body size limit — compressed images can still be up to ~2MB base64
export const maxDuration = 60;

// Removed 'edge' runtime — edge has payload size limits that break base64 image uploads
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;


export async function POST(request: NextRequest) {
  const token = await verifyApiToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Rate limit: 10 grading requests per minute per IP (Vision API is expensive)
  const ip = getClientIp(request);
  const rl = checkRateLimit(`grade:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before submitting again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API Key is not configured on server.' }, { status: 500 });
    }

    const body = await request.json();
    const {
      imageBase64,
      mimeType: directMime,
      imageUrl,
      submissionText,      // NEW: text-only submission
      assignmentTitle,
      assignmentDescription,
      assignmentSubject,
      assignmentQuestions,
      assignmentTasks,     // NEW: structured task list from assignment
      assignmentUnits,     // NEW: explicitly selected units
      totalMarks,          // NEW: actual marks this paper is worth
    } = body;

    const isTextOnly = !imageBase64 && !imageUrl && submissionText;

    let base64Image = '';
    let mimeType = 'image/jpeg';

    if (!isTextOnly) {
      if (imageBase64) {
        base64Image = imageBase64;
        mimeType = directMime || 'image/jpeg';
      } else if (imageUrl) {
        // Validate imageUrl is from Firebase Storage to prevent SSRF
        const ALLOWED_HOSTS = [
          'firebasestorage.googleapis.com',
          'storage.googleapis.com',
        ];
        try {
          const parsed = new URL(imageUrl);
          if (!ALLOWED_HOSTS.some(h => parsed.hostname.endsWith(h))) {
            return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 });
          }
        } catch {
          return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 });
        }
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
        const arrayBuffer = await imageResponse.arrayBuffer();
        base64Image = Buffer.from(arrayBuffer).toString('base64');
        mimeType = (imageResponse.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
      } else {
        return NextResponse.json({ error: 'Missing imageBase64, imageUrl, or submissionText' }, { status: 400 });
      }
    }

    // Build context string from assignment metadata
    const subject = assignmentSubject || 'General';
    let contextStr = '';
    if (assignmentTitle) contextStr += `Assignment Title: ${assignmentTitle}\n`;
    if (assignmentSubject) contextStr += `Subject: ${assignmentSubject}\n`;
    if (assignmentUnits && assignmentUnits.length > 0) contextStr += `Strictly relates to Topics/Units: ${assignmentUnits.join(', ')}\n`;
    if (assignmentDescription) contextStr += `Instructions: ${assignmentDescription}\n`;

    // Build questions/tasks string
    let questionsStr = '';
    if (assignmentTasks && assignmentTasks.length > 0) {
      questionsStr += `Tasks/Questions (${assignmentTasks.length} total):\n`;
      assignmentTasks.forEach((t: any, idx: number) => {
        const q = typeof t === 'string' ? t : (t.question || t.text || t.title || JSON.stringify(t));
        const marks = t.marks ? ` [${t.marks} marks]` : '';
        questionsStr += `Q${idx + 1}${marks}: ${q}\n`;
      });
    } else if (assignmentQuestions && assignmentQuestions.length > 0) {
      questionsStr += `Questions:\n`;
      assignmentQuestions.forEach((q: string, idx: number) => {
        questionsStr += `Q${idx + 1}: ${q}\n`;
      });
    }

    // Determine total marks for grading scale
    const paperTotal = totalMarks || 10;
    // Per-question max — distribute evenly if not specified per task
    const numQuestions = (assignmentTasks || assignmentQuestions || []).length || 1;
    const marksPerQuestion = assignmentTasks?.length > 0 && assignmentTasks[0]?.marks
      ? null  // use individual task marks
      : Math.round(paperTotal / numQuestions);

    const gradingRubric = marksPerQuestion
      ? `MARKING SCHEME: This paper is worth ${paperTotal} marks total, with ${numQuestions} question(s) worth approximately ${marksPerQuestion} marks each.`
      : `MARKING SCHEME: This paper is worth ${paperTotal} marks total. Each task has its own mark allocation as specified above.`;

    const systemPrompt = `You are a highly lenient and encouraging AI academic examiner. ${isTextOnly ? 'A student has submitted a written text answer.' : 'A student has submitted a photo of their handwritten work.'}

ASSIGNMENT CONTEXT:
${contextStr || 'No specific context provided.'}
${questionsStr}

${gradingRubric}

YOUR TASK:
1. ${isTextOnly ? 'Read and analyze the student\'s typed answer carefully.' : 'Carefully read and transcribe every piece of work in the image.'}
2. For each question or task, analyze the student's answer step by step.
3. Classify each part as: "correct", "logic_error", or "procedural_error".
4. Be FAIR and OBJECTIVE. Do not be overly strict, but do not be overly lenient either. Award partial credit if the student demonstrates understanding of the core concept, but deduct marks for clear errors in logic, procedure, or final answers.
5. Award marks out of the specified allocation per question.
6. If deducting marks, clearly explain what was wrong and what the correct approach is.

SUBJECT-SPECIFIC RULES:
- Math/Science: Check steps and formulas. Deduct for wrong formula even if computation is correct.
- Commerce/Accounting: Check entries, balancing, and correctness.
- Essays/Humanities: Evaluate argument quality and factual accuracy.
- MCQ-style: Binary — full marks or zero.

MATH FORMATTING: Write ALL math in plain Unicode: x², √(x), ×, ÷, ±, π, ≥, ≤, ≠, ≈. NO LaTeX.

OUTPUT: Return ONLY valid JSON — no markdown, no preamble:
{
  "questions": [
    {
      "questionText": "The question being answered",
      "studentAnswer": "What the student wrote/showed for this question",
      "steps": [
        {
          "text": "The specific step/sentence the student wrote",
          "type": "correct" | "logic_error" | "procedural_error",
          "explanation": "If error: exactly what is wrong and what should have been written. If correct: null",
          "penalty": 0
        }
      ],
      "finalAnswer": "Student's final answer or conclusion",
      "isFinalAnswerCorrect": true,
      "awardedScore": 4,
      "maxScore": 5,
      "lostMarksReason": "Specific reason for each mark deducted, or null if full marks",
      "aiCorrectedSolution": ["Correct step 1", "Correct step 2", "Correct final answer"]
    }
  ],
  "totalScore": 7,
  "maxTotalScore": ${paperTotal},
  "percentageScore": 70,
  "grade": "${paperTotal <= 10 ? '7' : '70'}/${paperTotal}",
  "summary": "Two-sentence honest performance summary — what they understood and where they lost marks.",
  "weaknessTags": ["specific_concept_or_skill_student_struggles_with"],
  "recommendedVideos": [
    { "title": "Specific tutorial topic targeting their weakness", "duration": "~8 min" }
  ]
}`;

    let geminiUrl: string;
    let geminiPayload: any;

    if (isTextOnly) {
      // Text-only: use gemini-2.0-flash to ensure consistency and avoid model access errors
      geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
      geminiPayload = {
        contents: [
          {
            parts: [
              { text: systemPrompt + '\n\nSTUDENT\'S ANSWER:\n' + submissionText }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      };
    } else {
      // Image: use gemini-2.0-flash vision
      geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
      geminiPayload = {
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
    }

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

    if (!textOutput) throw new Error('No output returned from Gemini API.');

    // Strip markdown wrappers if present despite responseMimeType setting
    textOutput = textOutput.replace(/^```(json)?\s*/gi, '').replace(/\s*```$/g, '').trim();

    let result: any;
    try {
      result = JSON.parse(textOutput);
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON output:', textOutput);
      throw new Error('AI output was malformed. Please try again.');
    }

    // AI sometimes fails to include totalScore or formats it as a string
    let computedTotal = 0;
    if (result.questions && Array.isArray(result.questions)) {
      computedTotal = result.questions.reduce((sum: number, q: any) => {
        let val = q.awardedScore;
        if (typeof val === 'string' && val.includes('/')) val = val.split('/')[0];
        return sum + (parseFloat(val) || 0);
      }, 0);
    }
    
    let aiTotal = typeof result.totalScore === 'string' && result.totalScore.includes('/') 
      ? parseFloat(result.totalScore.split('/')[0]) 
      : Number(result.totalScore);
    if (isNaN(aiTotal)) aiTotal = computedTotal;

    // Ensure score is valid and capped at max
    result.totalScore = Math.max(0, Math.min(aiTotal || computedTotal, paperTotal));
    
    // Ensure maxTotalScore is always the actual paper total
    result.maxTotalScore = paperTotal;
    result.grade = `${result.totalScore}/${paperTotal}`;
    result.percentageScore = Math.round((result.totalScore / paperTotal) * 100);

    return NextResponse.json({ success: true, ...result });

  } catch (error: any) {
    console.error('Grade Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
