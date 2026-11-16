import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { inScope } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { AI_MODELS, limitOf } from '@/lib/settings/limits';
import { courseChapters, getCurriculum } from '@/lib/curriculum';
import { topicKey } from '@/lib/teacher/desk';
import { aiGate } from '@/lib/settings/server';
import { generateAi, aiConfigured } from '@/lib/ai/generate';
import { gradeOf } from '@/lib/admin/format';

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
  const auth = await requireStaff(req, { academic: true });
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

  // Knowledge base first (2026-11-14): this chapter's plans by the teacher and the subject's other teachers are offered
  // before anything is written; "use" copies one (no AI), "adapt" asks for a small edit of it (a light model).
  const { db } = auth;
  const lessonCols = 'id, teacher_id, class, title, chapter_key, topics, duration_min, objectives, success_criteria, prior_knowledge, materials, stages, differentiation, check_for_understanding, created_at';
  const asPlan = (l: any) => ({
    title: l.title, objectives: l.objectives || [], successCriteria: l.success_criteria || [], priorKnowledge: l.prior_knowledge || '', materials: l.materials || [],
    stages: l.stages || [], differentiation: l.differentiation || { support: '', stretch: '' }, checkForUnderstanding: l.check_for_understanding || '', topics: (l.topics || []).filter((t: string) => chapter.topics.includes(t)),
  });
  const pickId = str(b?.useLesson ?? b?.adaptLesson, 40);
  let base: any = null;
  if (pickId) {
    const { data: l } = await db.from('lesson_plans').select(lessonCols).eq('id', pickId).eq('school_id', staff.schoolId).ilike('subject', subject).maybeSingle();
    if (!l) return NextResponse.json({ error: 'That lesson plan isn’t available.' }, { status: 404 });
    if (b?.useLesson) return NextResponse.json({ ...asPlan(l), kb: { reused: true, note: 'Copied from an existing plan. No AI used.' } });
    base = l;
  } else if (b?.offer === true) {
    // bounded: one school's plans for one chapter of one subject (a few dozen at most)
    const { data: plans } = await db.from('lesson_plans').select(lessonCols).eq('school_id', staff.schoolId).ilike('subject', subject).eq('chapter_key', topicKey(chapter.name)).limit(60);
    const want = new Set(topics);
    const offers = (plans || []).filter(l => Array.isArray(l.stages) && l.stages.length && gradeOf(l.class) === gradeOf(cls))
      .map(l => ({ l, overlap: (l.topics || []).filter((t: string) => want.has(t)).length }))
      .sort((x, y) => Number(y.l.teacher_id === staff.id) - Number(x.l.teacher_id === staff.id) || y.overlap - x.overlap || String(y.l.created_at).localeCompare(String(x.l.created_at)))
      .slice(0, 4)
      .map(({ l }) => ({ id: l.id, title: l.title, by: l.teacher_id === staff.id ? 'you' : 'colleague', cls: l.class, durationMin: l.duration_min, topics: (l.topics || []).slice(0, 4), at: l.created_at }));
    if (offers.length) return NextResponse.json({ offers });
  }

  const aiBlocked = await aiGate(staff.id, 'teacherTools');
  if (aiBlocked) return aiBlocked;
  if (!aiConfigured()) return NextResponse.json({ error: 'AI drafting isn’t configured on this server.' }, { status: 503 });

  if (base) {
    const basePlan = asPlan(base);
    const adaptPrompt = `Adapt this existing ${subject} lesson plan for ${cls}. Keep what works; change only what the new lesson needs.
New lesson: ${duration} minutes${topics.length ? `, covering: ${topics.join('; ')}` : ''}.${focus ? ` Teacher's note: ${focus}` : ''}
Stage minutes MUST add up to exactly ${duration}. Stay inside the chapter "${chapter.name}"${chapter.notes?.length ? `; do NOT teach: ${chapter.notes.join('; ')}` : ''}.
EXISTING PLAN (JSON): ${JSON.stringify(basePlan).slice(0, 6000)}
Return ONLY the adapted plan as JSON with the same keys.`;
    try {
      const res = await generateAi({ model: AI_MODELS.fast, contents: adaptPrompt, config: { responseMimeType: 'application/json', temperature: 0.3 } }, { feature: 'lessonDraft', userId: staff.id, schoolId: staff.schoolId });
      const d = JSON.parse((res.text || '{}').replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '').trim());
      return NextResponse.json({ ...shape(d, chapter, topics, duration), kb: { adapted: true, note: 'Adapted from an existing plan (a small AI edit, not a new draft).' } });
    } catch (e: any) {
      console.error('[lessons/draft adapt]', e?.message);
      return NextResponse.json({ error: 'The adaptation didn’t come through. Try again, or use the plan as it is.' }, { status: 502 });
    }
  }

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
    const res = await generateAi({
      model: AI_MODELS.standard, contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.4 },
    }, { feature: 'lessonDraft', userId: staff.id, schoolId: staff.schoolId });
    const raw = (res.text || '{}').replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const d = JSON.parse(raw);
    return NextResponse.json(shape(d, chapter, topics, duration));
  } catch (e: any) {
    console.error('[lessons/draft]', e?.message);
    return NextResponse.json({ error: 'The AI draft didn’t come through. Try again.' }, { status: 502 });
  }
}

/** A plan from the model's JSON: lists trimmed, stage minutes rescaled to the lesson length, topics kept to the chapter's. */
function shape(d: any, chapter: { name: string; topics: string[] }, topics: string[], duration: number) {
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
  return {
    title: str(d.title, 200) || chapter.name,
    objectives: lst(d.objectives),
    successCriteria: lst(d.successCriteria),
    priorKnowledge: str(d.priorKnowledge, 1500),
    materials: (Array.isArray(d.materials) ? d.materials : []).map((m: any) => ({ label: str(m?.label ?? m, 200) })).filter((m: any) => m.label).slice(0, 12),
    stages,
    differentiation: { support: str(d.differentiation?.support, 1500), stretch: str(d.differentiation?.stretch, 1500) },
    checkForUnderstanding: str(d.checkForUnderstanding, 1500),
    topics: lst(d.topics).filter((t: string) => chapter.topics.includes(t)).length ? lst(d.topics).filter((t: string) => chapter.topics.includes(t)) : topics,
  };
}
