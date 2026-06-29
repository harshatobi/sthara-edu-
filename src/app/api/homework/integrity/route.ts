import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { submissionId, imageBase64, mimeType, allSubmissions } = await req.json();

    const results: {
      isAiGenerated: boolean;
      aiConfidence: number;
      aiReason: string;
      duplicateOf: string[];
    } = {
      isAiGenerated: false,
      aiConfidence: 0,
      aiReason: '',
      duplicateOf: [],
    };

    if (!imageBase64 || !mimeType) {
      return NextResponse.json({ success: true, ...results });
    }

    // ── 1. AI Generation Detection ────────────────────────────────
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const prompt = `You are an academic integrity expert. Analyze this student homework image.

Determine: Is this image AI-generated OR a genuine student handwritten/photographed homework?

Signs of AI generation:
- Perfectly uniform line thickness with zero natural variation
- No paper grain, scan artifacts, or real-world lighting shadows
- Text/numbers rendered with computer-perfect spacing and baseline
- Impossibly clean diagrams or graphs
- Background looks synthetic or studio-generated

Signs of genuine student work:
- Natural handwriting inconsistencies and imperfections
- Paper texture, fold lines, pen pressure variation
- Erasing marks, corrections, crossed-out text
- Natural lighting, slight blur, shadows from hand

Respond ONLY with this exact JSON (no markdown, no code block):
{"isAiGenerated":boolean,"confidence":number,"reason":"1-2 sentence explanation"}

confidence is 0-100 where 100 = definitely AI generated.`;

      const result = await model.generateContent([
        prompt,
        { inlineData: { data: imageBase64, mimeType } }
      ]);
      let text = result.response.text().trim();
      if (text.startsWith('```json')) text = text.substring(7);
      else if (text.startsWith('```')) text = text.substring(3);
      if (text.endsWith('```')) text = text.slice(0, -3);

      const parsed = JSON.parse(text.trim());
      results.isAiGenerated = parsed.confidence >= 75;
      results.aiConfidence = Math.min(100, Math.max(0, parsed.confidence));
      results.aiReason = parsed.reason || '';
    } catch (e) {
      console.warn('[integrity] AI detection failed:', e);
    }

    // ── 2. Duplicate / Copy Detection ──────────────────────────
    if (allSubmissions && Array.isArray(allSubmissions) && allSubmissions.length > 0) {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      // Compare this submission against each other student's submission
      for (const other of allSubmissions) {
        if (!other.imageBase64 || other.submissionId === submissionId) continue;
        try {
          const dupPrompt = `Compare these two homework images. Are they the same piece of work?
Could one be a copy of the other? Do they show the same handwritten answers / diagrams?

Respond ONLY with this exact JSON (no markdown):
{"areSame":boolean,"confidence":number,"reason":"brief explanation"}

confidence is 0-100 where 100 = definitely the same work.`;

          const dupResult = await model.generateContent([
            dupPrompt,
            { inlineData: { data: imageBase64, mimeType } },
            { inlineData: { data: other.imageBase64, mimeType: other.mimeType || mimeType } },
          ]);
          let txt = dupResult.response.text().trim();
          if (txt.startsWith('```json')) txt = txt.substring(7);
          else if (txt.startsWith('```')) txt = txt.substring(3);
          if (txt.endsWith('```')) txt = txt.slice(0, -3);

          const dp = JSON.parse(txt.trim());
          if (dp.areSame && dp.confidence >= 80) {
            results.duplicateOf.push(other.studentName);
          }
        } catch (e) {
          console.warn('[integrity] Duplicate compare failed for', other.studentName, ':', e);
        }
      }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[integrity] Fatal error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
