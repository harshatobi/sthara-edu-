import { NextRequest, NextResponse } from 'next/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

export interface SyllabusAnalysisResult {
  chapter: string;
  tags: string[];
  examWeightage: number; // 1-10 scale
  toughnessLevel: 'easy' | 'medium' | 'hard';
  weightageScore: number; // Computed score e.g. (examWeightage * 1.5 + toughnessMultiplier)
}

/**
 * POST /api/teacher/analyze-syllabus
 * Body: { topic: string, subject: string, class: string, objectives?: string }
 *
 * Uses Gemini AI to analyze a syllabus topic and return:
 * - Formal Chapter Name
 * - Concept Tags (array of strings)
 * - Exam Weightage (1-10)
 * - Toughness Level (easy / medium / hard)
 * - Computed Weightage Score
 */
export async function POST(req: NextRequest) {
  const { user, error: authError } = await verifyApiToken(req.headers.get('authorization'));
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { topic, subject, class: studentClass, objectives } = body;

    if (!topic) {
      return NextResponse.json({ error: 'Missing required field: topic' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Rule-based fallback if no Gemini key
      const fallback = generateFallbackAnalysis(topic, subject);
      return NextResponse.json({ success: true, analysis: fallback });
    }

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an expert curriculum evaluator for school education standards (CBSE/ICSE/NCERT/State Boards).
Analyze this syllabus topic for ${studentClass || 'Class 10'} ${subject || 'General'}:
Topic: "${topic}"
Objectives/Description: "${objectives || ''}"

Return a JSON object with:
1. "chapter": The formal standard chapter/unit name it belongs to (e.g. "Unit 1: Chemical Reactions and Equations", "Algebra: Quadratic Equations").
2. "tags": 3-6 concise, lowercase, underscore_separated concept keywords/skills (e.g. ["balancing_equations", "stoichiometry", "oxidation_reduction"]).
3. "examWeightage": An integer from 1 to 10 rating how frequently and heavily this topic appears in board/final examinations (1 = low frequency/short answer, 10 = guaranteed high-mark long question).
4. "toughnessLevel": Exactly one of ["easy", "medium", "hard"] based on student conceptual difficulty.
5. "weightageScore": A decimal number calculated as (examWeightage * 0.7) + (toughnessLevel == "hard" ? 3 : toughnessLevel == "medium" ? 2 : 1), rounded to 1 decimal place.

Return ONLY a JSON object matching this schema:
{
  "chapter": "string",
  "tags": ["string"],
  "examWeightage": 8,
  "toughnessLevel": "medium",
  "weightageScore": 7.6
}`;

    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.1 },
    });

    const text = res.text || '{}';
    const parsed = JSON.parse(text) as Partial<SyllabusAnalysisResult>;

    const analysis: SyllabusAnalysisResult = {
      chapter: parsed.chapter || extractChapterFromTopic(topic),
      tags: Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : generateTagsFromTopic(topic),
      examWeightage: typeof parsed.examWeightage === 'number' ? Math.min(10, Math.max(1, parsed.examWeightage)) : 7,
      toughnessLevel: ['easy', 'medium', 'hard'].includes(parsed.toughnessLevel as string) ? (parsed.toughnessLevel as any) : 'medium',
      weightageScore: typeof parsed.weightageScore === 'number' ? Math.round(parsed.weightageScore * 10) / 10 : 7.0,
    };

    return NextResponse.json({ success: true, analysis });

  } catch (err: any) {
    console.error('[analyze-syllabus]', err);
    // Fallback if AI call fails
    const fallback = generateFallbackAnalysis(req.body ? (req as any).topic : 'General Topic', 'General');
    return NextResponse.json({ success: true, analysis: fallback });
  }
}

function extractChapterFromTopic(topic: string): string {
  if (topic.includes(':')) return topic.split(':')[0].trim();
  if (/chapter\s*\d+/i.test(topic)) return topic.split('-')[0].trim();
  return 'General Unit';
}

function generateTagsFromTopic(topic: string): string[] {
  const words = topic.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
  return Array.from(new Set(words)).slice(0, 5);
}

function generateFallbackAnalysis(topic: string, subject?: string): SyllabusAnalysisResult {
  const isHard = /calculus|trigonometry|organic|quantum|physics|genetics/i.test(topic + ' ' + (subject || ''));
  const isEasy = /intro|basic|overview|definition|unit 1/i.test(topic);

  const toughness = isHard ? 'hard' : isEasy ? 'easy' : 'medium';
  const weight = isHard ? 9 : isEasy ? 5 : 7;
  const toughnessBonus = toughness === 'hard' ? 3 : toughness === 'medium' ? 2 : 1;
  const score = Math.round((weight * 0.7 + toughnessBonus) * 10) / 10;

  return {
    chapter: extractChapterFromTopic(topic),
    tags: generateTagsFromTopic(topic),
    examWeightage: weight,
    toughnessLevel: toughness,
    weightageScore: score,
  };
}
