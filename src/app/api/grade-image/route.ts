import { NextResponse, NextRequest } from 'next/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifyApiToken(request.headers.get('authorization'));
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
      submissionText,
      assignmentTitle,
      assignmentDescription,
      assignmentSubject,
      assignmentQuestions,
      assignmentTasks,
      assignmentUnits,
      totalMarks,
    } = body;

    const isTextOnly = !imageBase64 && !imageUrl && submissionText;

    let base64Image = '';
    let mimeType = 'image/jpeg';

    if (!isTextOnly) {
      if (imageBase64) {
        base64Image = imageBase64;
        mimeType = directMime || 'image/jpeg';
      } else if (imageUrl) {
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
        const arrayBuffer = await imageResponse.arrayBuffer();
        base64Image = Buffer.from(arrayBuffer).toString('base64');
        mimeType = (imageResponse.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
      } else {
        return NextResponse.json({ error: 'Missing imageBase64, imageUrl, or submissionText' }, { status: 400 });
      }
    }

    // Build context string
    const subject = assignmentSubject || 'General';
    let contextStr = '';
    if (assignmentTitle) contextStr += `Assignment Title: ${assignmentTitle}\n`;
    if (assignmentSubject) contextStr += `Subject: ${assignmentSubject}\n`;
    if (assignmentUnits && assignmentUnits.length > 0) contextStr += `Strictly relates to Topics/Units: ${assignmentUnits.join(', ')}\n`;
    if (assignmentDescription) contextStr += `Instructions: ${assignmentDescription}\n`;

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

    const paperTotal = totalMarks || 10;
    const numQuestions = (assignmentTasks || assignmentQuestions || []).length || 1;
    const marksPerQuestion = assignmentTasks?.length > 0 && assignmentTasks[0]?.marks
      ? null
      : Math.round(paperTotal / numQuestions);

    const gradingRubric = marksPerQuestion
      ? `MARKING SCHEME: This paper is worth ${paperTotal} marks total, with ${numQuestions} question(s) worth approximately ${marksPerQuestion} marks each.`
      : `MARKING SCHEME: This paper is worth ${paperTotal} marks total. Each task has its own mark allocation as specified above.`;

    // Prompt calibrated to AVERAGE (balanced) strictness — not overly lenient, not overly harsh
    const systemPrompt = `You are a balanced, fair, and objective AI academic examiner. Maintain an average, impartial standard of evaluation — neither overly lenient nor excessively harsh. ${isTextOnly ? 'A student has submitted a written text answer.' : 'A student has submitted a photo of their handwritten work.'}

ASSIGNMENT CONTEXT:
${contextStr || 'No specific context provided.'}
${questionsStr}

${gradingRubric}

EVALUATION GUIDELINES (AVERAGE STRICTNESS):
1. Carefully read and analyze the student's work.
2. Award full credit for complete, accurate answers.
3. Award proportional partial credit for partially correct reasoning or work.
4. Deduct marks for clear errors in logic, computation, or missing required steps. Do not overlook major errors, but do not penalize minor formatting flaws excessively.
5. Provide clear, constructive feedback for any mark deductions.

OUTPUT: Return ONLY valid JSON:
{
  "questions": [
    {
      "questionText": "Question description",
      "studentAnswer": "Student's written/typed answer",
      "steps": [
        {
          "text": "Step evaluated",
          "type": "correct" | "logic_error" | "procedural_error",
          "explanation": "Brief explanation if error",
          "penalty": 0
        }
      ],
      "finalAnswer": "Final answer",
      "isFinalAnswerCorrect": true,
      "awardedScore": 4,
      "maxScore": 5,
      "lostMarksReason": "Reason for deduction or null",
      "aiCorrectedSolution": ["Step 1", "Step 2"]
    }
  ],
  "totalScore": 7,
  "maxTotalScore": ${paperTotal},
  "percentageScore": 70,
  "grade": "7/${paperTotal}",
  "summary": "Balanced performance summary.",
  "weaknessTags": ["concept_needing_improvement"]
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const geminiPayload = isTextOnly
      ? {
          contents: [{ parts: [{ text: systemPrompt + '\n\nSTUDENT\'S ANSWER:\n' + submissionText }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
        }
      : {
          contents: [{ parts: [{ text: systemPrompt }, { inlineData: { mimeType, data: base64Image } }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
        };

    // Auto-retry up to 3 times
    let result: any = null;
    let lastError: any = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiPayload),
        });

        if (!geminiResponse.ok) {
          const errText = await geminiResponse.text();
          throw new Error(`Gemini API returned ${geminiResponse.status}: ${errText}`);
        }

        const geminiData = await geminiResponse.json();
        let textOutput = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!textOutput) throw new Error('Empty output from Gemini');

        textOutput = textOutput.replace(/^```(json)?\s*/gi, '').replace(/\s*```$/g, '').trim();
        result = JSON.parse(textOutput);
        break; // Success — exit retry loop
      } catch (err: any) {
        lastError = err;
        console.warn(`[grade-image] Attempt ${attempt} failed:`, err.message);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }

    if (!result) {
      return NextResponse.json({
        success: false,
        error: `AI evaluation was temporarily unavailable (${lastError?.message || 'Server error'}). Please click 'Turn In Task' again to retry.`,
      }, { status: 500 });
    }

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

    result.totalScore = Math.max(0, Math.min(aiTotal || computedTotal, paperTotal));
    result.maxTotalScore = paperTotal;
    result.grade = `${result.totalScore}/${paperTotal}`;
    result.percentageScore = Math.round((result.totalScore / paperTotal) * 100);

    return NextResponse.json({ success: true, ...result });

  } catch (error: any) {
    console.error('Grade Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
