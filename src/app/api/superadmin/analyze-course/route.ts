import { NextResponse, NextRequest } from 'next/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request: NextRequest) {
  const token = await verifyApiToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = getClientIp(request);
  const rl = checkRateLimit(`analyze_course:${ip}`, 5, 60_000);
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
    const { imageBase64, mimeType } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: 'Missing imageBase64' }, { status: 400 });
    }

    const systemPrompt = `You are an expert academic curriculum analyzer. The user has uploaded an image of a course syllabus or subject list.

YOUR TASK:
Extract the curriculum structure from the image and output it as structured JSON.
If the image doesn't contain topics/units for the subjects, generate a standard list of 5 units with ~4-6 topics each based on the subject name and standard curriculum knowledge (e.g. for JNTU or OU).

OUTPUT FORMAT:
Return ONLY valid JSON with no markdown wrapper, no preamble, and strictly matching this schema:
{
  "curriculum": "string (e.g. OU, JNTU-H, CBSE, NCERT, etc.)",
  "branch": "string (e.g. Computer Science Engineering, B.Com General, 10th Grade)",
  "year": "string (e.g. 1st Year, 2nd Year, 2024)",
  "semester": "string (e.g. 1st Semester, 2nd Semester, N/A)",
  "subjects": [
    {
      "name": "string (e.g. Engineering Mathematics-I)",
      "code": "string (e.g. MA101, or empty string if not found)",
      "credits": "number (or 0 if not found)",
      "units": [
        {
          "unitNo": "number (1, 2, 3...)",
          "name": "string (unit title, e.g. Differential Calculus)",
          "topics": ["string", "string", "string"]
        }
      ]
    }
  ]
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;
    const geminiPayload = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } }
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

    if (!textOutput) throw new Error('No output returned from Gemini API.');

    textOutput = textOutput.replace(/^```json\s*/g, '').replace(/\s*```$/g, '').trim();
    const result = JSON.parse(textOutput);

    // Standardize IDs
    result.subjects = (result.subjects || []).map((sub: any, idx: number) => ({
      ...sub,
      id: `sub_${Date.now()}_${idx}`,
      assignedTeacherId: null
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Analyze Course Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
