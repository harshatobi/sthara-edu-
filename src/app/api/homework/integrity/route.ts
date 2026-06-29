import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const maxDuration = 60;

// ─── Helpers ────────────────────────────────────────────────────────────────
function cleanJson(raw: string): string {
  let t = raw.trim();
  if (t.startsWith('```json')) t = t.slice(7);
  else if (t.startsWith('```')) t = t.slice(3);
  if (t.endsWith('```')) t = t.slice(0, -3);
  return t.trim();
}

// ─── Main handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      submissionId,
      // Image mode
      imageBase64,
      mimeType,
      // Text mode
      text,
      // Cross-student comparison (works for both modes)
      allSubmissions, // Array<{ submissionId, studentName, imageBase64?, mimeType?, text? }>
    } = body;

    const results: {
      isAiGenerated: boolean;
      aiConfidence: number;
      aiReason: string;
      duplicateOf: string[];      // student names with matching work
      similarPairs: { name: string; similarity: number }[];
    } = {
      isAiGenerated: false,
      aiConfidence: 0,
      aiReason: '',
      duplicateOf: [],
      similarPairs: [],
    };

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // ══════════════════════════════════════════════════════════
    //  MODE A — IMAGE SUBMISSION
    // ══════════════════════════════════════════════════════════
    if (imageBase64 && mimeType) {

      // 1. AI-image detection
      try {
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
        const parsed = JSON.parse(cleanJson(result.response.text()));
        results.isAiGenerated = parsed.confidence >= 75;
        results.aiConfidence = Math.min(100, Math.max(0, parsed.confidence));
        results.aiReason = parsed.reason || '';
      } catch (e) {
        console.warn('[integrity/image] AI detection failed:', e);
      }

      // 2. Image duplicate detection
      if (Array.isArray(allSubmissions) && allSubmissions.length > 0) {
        for (const other of allSubmissions) {
          if (!other.imageBase64 || other.submissionId === submissionId) continue;
          try {
            const dupResult = await model.generateContent([
              `Compare these two homework images. Are they the same piece of work? Could one be a copy?
Respond ONLY with JSON: {"areSame":boolean,"confidence":number,"reason":"brief"}
confidence 0-100, 100 = definitely the same.`,
              { inlineData: { data: imageBase64, mimeType } },
              { inlineData: { data: other.imageBase64, mimeType: other.mimeType || mimeType } },
            ]);
            const dp = JSON.parse(cleanJson(dupResult.response.text()));
            if (dp.areSame && dp.confidence >= 80) {
              results.duplicateOf.push(other.studentName);
              results.similarPairs.push({ name: other.studentName, similarity: dp.confidence });
            }
          } catch (e) {
            console.warn('[integrity/image] Dup check failed for', other.studentName, e);
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════
    //  MODE B — TEXT SUBMISSION
    // ══════════════════════════════════════════════════════════
    else if (text && typeof text === 'string' && text.trim().length > 20) {

      // 1. AI-written text detection
      try {
        const aiTextPrompt = `You are an academic integrity expert specializing in detecting AI-generated student answers.

Analyze the following student-submitted text answer and determine whether it was written by an AI (ChatGPT, Gemini, Copilot, etc.) or by a genuine student.

Student text:
"""
${text.slice(0, 3000)}
"""

AI-generated text indicators:
- Perfect grammar and sentence structure with no colloquialisms
- Overly formal academic tone unusual for the student's age/level
- Highly structured responses with bullet points, numbered lists, headers
- No personal uncertainty, hedging ("I think maybe..."), or common student mistakes
- Uses complex vocabulary consistently without errors
- Generic, encyclopedic explanations that don't show personal reasoning
- Suspiciously comprehensive coverage of every angle of the topic
- No contractions, no personal anecdotes, no informal expressions

Genuine student writing indicators:
- Some grammatical errors or informal phrasing
- Incomplete thoughts or simpler sentence structures
- Personal voice, uncertainty, or partial understanding
- Limited vocabulary appropriate to age group
- Focused on specific points rather than exhaustive coverage

Respond ONLY with this exact JSON (no markdown):
{"isAiGenerated":boolean,"confidence":number,"reason":"2-3 sentence explanation of key indicators that led to this assessment"}

confidence is 0-100 where 100 = definitely written by AI.`;

        const result = await model.generateContent(aiTextPrompt);
        const parsed = JSON.parse(cleanJson(result.response.text()));
        results.isAiGenerated = parsed.confidence >= 70;
        results.aiConfidence = Math.min(100, Math.max(0, parsed.confidence));
        results.aiReason = parsed.reason || '';
      } catch (e) {
        console.warn('[integrity/text] AI detection failed:', e);
      }

      // 2. Text similarity / duplicate detection across students
      if (Array.isArray(allSubmissions) && allSubmissions.length > 0) {
        const othersWithText = allSubmissions.filter(
          s => s.text && s.submissionId !== submissionId && s.text.trim().length > 20
        );

        if (othersWithText.length > 0) {
          try {
            // Build comparison block
            const comparisons = othersWithText.slice(0, 6).map((s, i) =>
              `Student ${i + 1} (${s.studentName}):\n"""\n${s.text.slice(0, 800)}\n"""`
            ).join('\n\n');

            const dupPrompt = `You are an academic integrity expert. Compare the following student's answer to other students' answers submitted for the SAME assignment.

MAIN STUDENT's answer:
"""
${text.slice(0, 1000)}
"""

OTHER STUDENTS' answers:
${comparisons}

For each other student, determine if their answer is suspiciously similar to the main student's answer (copied, paraphrased from same source, or identical).

Respond ONLY with this exact JSON array (no markdown):
[{"studentName":"name","similarity":0-100,"isCopied":boolean}]

similarity: 0=completely different, 100=word-for-word identical.
isCopied: true if similarity >= 75 (suspicious overlap).`;

            const dupResult = await model.generateContent(dupPrompt);
            const comparisons_result = JSON.parse(cleanJson(dupResult.response.text()));

            if (Array.isArray(comparisons_result)) {
              for (const c of comparisons_result) {
                if (c.isCopied || c.similarity >= 75) {
                  results.duplicateOf.push(c.studentName);
                  results.similarPairs.push({ name: c.studentName, similarity: c.similarity });
                }
              }
            }
          } catch (e) {
            console.warn('[integrity/text] Duplicate check failed:', e);
          }
        }
      }
    }

    return NextResponse.json({ success: true, ...results });

  } catch (err: any) {
    console.error('[integrity] Fatal error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
