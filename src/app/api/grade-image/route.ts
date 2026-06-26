import { NextResponse } from 'next/server';

export const runtime = 'edge';

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

export async function POST(request: Request) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API Key is not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { imageUrl, imageBase64: directBase64, mimeType: directMime, assignmentTitle, assignmentDescription, assignmentQuestions } = body;

    let base64Image = '';
    let mimeType = 'image/jpeg';

    if (directBase64) {
      base64Image = directBase64;
      mimeType = directMime || 'image/jpeg';
    } else if (imageUrl) {
      // 1. Fetch the image and convert to Base64
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image from URL: ${imageResponse.statusText}`);
      }
      const arrayBuffer = await imageResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      base64Image = buffer.toString('base64');
      mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
    } else {
      return NextResponse.json({ error: 'Missing imageUrl or imageBase64 in request' }, { status: 400 });
    }

    // 2. Prepare the prompt
    let contextStr = '';
    if (assignmentTitle) contextStr += `Assignment Title: ${assignmentTitle}\n`;
    if (assignmentDescription) contextStr += `Assignment Description: ${assignmentDescription}\n`;
    if (assignmentQuestions && assignmentQuestions.length > 0) {
      contextStr += `Assignment Questions:\n`;
      assignmentQuestions.forEach((q: any, idx: number) => {
        contextStr += `Q${idx + 1}: ${q.text}\n`;
      });
    }

    const systemPrompt = `
      You are an elite, strict High School Mathematics Teacher named "Diagnostic Engine".
      I am providing you with an image of a student's handwritten math assignment.
      
      CONTEXT OF ASSIGNMENT:
      ${contextStr}

      Your task is to transcribe the student's work exactly step-by-step and grade it against the questions provided in the context (if any). If no questions are provided, extract them from the image.
      Analyze their logic deeply. Distinguish between 'logic_error' (e.g. wrong formula, sign error) and 'procedural_error' (e.g. getting the correct final answer but using mathematically illegal cancellations or fake math).
      
      STRICT GRADING RULE: You must evaluate the student's work based on the following exact rubric:
      - 5 marks awarded for every correct answer with correct procedure.
      - 0 marks awarded for a wrong answer AND wrong procedure.
      - Partial marks (e.g. 1 to 4 marks) awarded if the student gets the correct answer with the wrong procedure, or if they have the right procedure but made a calculation mistake. Penalize based on the severity of the procedural mistakes.
      - The maximum score for EACH question is 5.
      - The maxTotalScore MUST be exactly (Number of Questions * 5).


      You MUST output ONLY valid JSON using this exact structure:
      {
        "questions": [
          {
            "questionText": "The transcribed question text (e.g., Solve 2x^2 - 5x + 3 = 0)",
            "steps": [
              { 
                "text": "The exact step the student wrote", 
                "type": "correct" | "logic_error" | "procedural_error",
                "explanation": "If error, explain why. If correct, omit or null",
                "penalty": "If error, amount of points deducted (e.g. 2). If correct, 0"
              }
            ],
            "finalAnswer": "The student's final circled/underlined answer",
            "isFinalAnswerCorrect": boolean,
            "aiCorrectedSolution": [
              "Line 1 of correct procedure",
              "Line 2 of correct procedure"
            ],
            "maxScore": 5,
            "awardedScore": 3
          }
        ],
        "totalScore": 8,
        "maxTotalScore": 15,
        "summary": "Brief 1-sentence summary of overall performance (e.g. 'Errors in Q2 discriminant calculation.')",
        "weaknessTags": ["list", "of", "core", "weaknesses", "like", "sign_errors", "fractions", "algebraic_manipulation"],
        "recommendedVideos": [
          {
            "title": "Title of a highly relevant tutorial video",
            "duration": "e.g., 5 min tutorial"
          }
        ]
      }

      Do NOT wrap the output in markdown code blocks like \`\`\`json. Return pure JSON.
    `;

    // 3. Call Gemini Vision API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const geminiPayload = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    let textOutput = '';

    try {
      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiPayload)
      });

      if (!geminiResponse.ok) {
        const err = await geminiResponse.text();
        console.error('Gemini API Error:', err);
        throw new Error(`Gemini API failed (${geminiResponse.status}): ${err}`);
      }

      const geminiData = await geminiResponse.json();
      textOutput = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (apiError: any) {
      console.error("API error:", apiError);
      return NextResponse.json({ error: apiError.message || 'Gemini API failed' }, { status: 500 });
    }

    if (!textOutput) {
      throw new Error('No valid text returned from Gemini and fallback failed.');
    }

    // Clean markdown if present (though responseMimeType should prevent it)
    textOutput = textOutput.replace(/^```json/g, '').replace(/```$/g, '').trim();

    const resultJson = JSON.parse(textOutput);

    return NextResponse.json(resultJson);

  } catch (error: any) {
    console.error('Grade Image Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
