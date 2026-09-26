import { NextResponse, type NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { inScope } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { AI_MODELS, limitOf } from '@/lib/settings/limits';
import { courseChapters, getCurriculum } from '@/lib/curriculum';
import { topicKey } from '@/lib/teacher/desk';
import { aiGate } from '@/lib/settings/server';
import { generateMetered } from '@/lib/ai/usage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const str = (v: unknown, n = 500) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/**
 * POST /api/teacher/lessons/draft
 * { class, subject, chapterKey, topics?: string[], durationMin?, focus? }
 * Drafts a lesson plan grounded in the official curriculum entry for the
 * chapter (its topics, learning outcomes and exclusions). Returns plan fields;
 * nothing is saved — the teacher edits and saves.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { staff } = auth;
  if (!checkRateLimit(`lesson-draft:${staff.id}`, ...limitOf('lessonDraft')).allowed) {
    return NextResponse.json({ error: 'Too many drafts. Try again in a few minutes.' }, { status: 429 });
  }
  const b = await req.json().catch(() => null);
  const cls = str(b?.class, 40), subject = str(b?.subject, 60);
  if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject)) return NextResponse.json({ error: `You don't teach ${subject} to ${cls}.` }, { status: 403 });
  const cur = getCurriculum(cls, subject);
  const chapter = cur ? courseChapters(cur).find(c => topicKey(c.name) === str(b?.chapterKey, 200)) : null;
  if (!chapter) return NextResponse.json({ error: 'Pick a chapter from the curriculum first.' }, { status: 400 });
  const topics: string[] = (Array.isArray(b?.topics) ? b.topics : []).map((t: unknown) => str(t)).filter((t: string) => chapter.topics.includes(t)).slice(0, 6);
  const duration = Math.min(120, Math.max(20, Math.round(Number(b?.durationMin) || 40)));
  const focus = str(b?.focus, 400);

  const aiBlocked = await aiGate(staff.id);
  if (aiBlocked) return aiBlocked;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI drafting isn’t configured on this server.' }, { status: 503 });

  const prompt = `You are an experienced CBSE ${subject} teacher planning one ${duration}-minute lesson for ${cls} (session 2026-27).
Chapter: "${chapter.name}"${chapter.number ? ` (NCERT chapter ${chapter.number})` : ''}, unit "${chapter.unitName}".
${topics.length ? `This lesson covers these curriculum content points:\n${topics.map(t => `- ${t}`).join('\n')}` : `Content points in the chapter:\n${chapter.topics.map(t => `- ${t}`).join('\n')}\nPick a coherent first slice that fits ${duration} minutes.`}
Official learning outcomes for the chapter:
${chapter.outcomes.slice(0, 8).map(o => `- ${o}`).join('\n') || '- (none listed)'}
${chapter.notes?.length ? `Curriculum exclusions / restrictions (do NOT teach these):\n${chapter.notes.map(n => `- ${n}`).join('\n')}` : ''}
${focus ? `Teacher's note for this lesson: ${focus}` : ''}

Write a practical, classroom-ready plan for Indian school conditions (40 students, blackboard, limited devices).
Use active learning and one quick formative check. Stage minutes MUST add up to exactly ${duration}.
Return ONLY JSON:
{
  "title": "short lesson title",
  "objectives": ["Students will be able to …", "…"],
  "successCriteria": ["I can …", "…"],
  "priorKnowledge": "what students must already know",
  "materials": [{"label": "…"}],
  "stages": [{"name": "Starter", "minutes": 5, "teacher": "what the teacher does", "students": "what students do"}],
  "differentiation": {"support": "for students who struggle", "stretch": "for students who finish early"},
  "checkForUnderstanding": "the exit check, with the expected answer",
  "topics": ["the exact content points from the list above that this lesson covers"]
}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await generateMetered(ai, {
      model: AI_MODELS.standard, contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.4 },
    }, { feature: 'lessonDraft', userId: staff.id, schoolId: staff.schoolId });
    const raw = (res.text || '{}').replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const d = JSON.parse(raw);
    const stages = (Array.isArray(d.stages) ? d.stages : []).slice(0, 8).map((s: any) => ({
      name: str(s?.name, 80) || 'Stage', minutes: Math.max(1, Math.round(Number(s?.minutes) || 0)), teacher: str(s?.teacher, 1500), students: str(s?.students, 1500),
    }));
    // Keep the timings honest: rescale if the model's minutes don't sum to the lesson length.
    const sum = stages.reduce((n: number, s: any) => n + s.minutes, 0);
    if (stages.length && sum !== duration) {
      stages.forEach((s: any) => { s.minutes = Math.max(1, Math.round((s.minutes / (sum || 1)) * duration)); });
      stages[stages.length - 1].minutes += duration - stages.reduce((n: number, s: any) => n + s.minutes, 0);
    }
    const lst = (v: unknown) => (Array.isArray(v) ? v.map(x => str(x, 400)).filter(Boolean).slice(0, 8) : []);
    return NextResponse.json({
      title: str(d.title, 200) || chapter.name,
      objectives: lst(d.objectives),
      successCriteria: lst(d.successCriteria),
      priorKnowledge: str(d.priorKnowledge, 1500),
      materials: (Array.isArray(d.materials) ? d.materials : []).map((m: any) => ({ label: str(m?.label ?? m, 200) })).filter((m: any) => m.label).slice(0, 12),
      stages,
      differentiation: { support: str(d.differentiation?.support, 1500), stretch: str(d.differentiation?.stretch, 1500) },
      checkForUnderstanding: str(d.checkForUnderstanding, 1500),
      topics: lst(d.topics).filter((t: string) => chapter.topics.includes(t)).length ? lst(d.topics).filter((t: string) => chapter.topics.includes(t)) : topics,
    });
  } catch (e: any) {
    console.error('[lessons/draft]', e?.message);
    return NextResponse.json({ error: 'The AI draft didn’t come through. Try again.' }, { status: 502 });
  }
}
