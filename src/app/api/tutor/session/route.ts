import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit } from '@/lib/rateLimit';
import { AI_MODELS, limitOf } from '@/lib/settings/limits';
import { computeStudentTml, getTutorDepthScore } from '@/lib/tml/engine';
import { containsFoulLanguage } from '@/lib/tutor/safety';
import { flattenChapters, getCurriculum } from '@/lib/curriculum';
import { signSession, verifySession, type TutorSessionState } from '@/lib/tutor/sessionToken';
import { aiGate } from '@/lib/settings/server';
import { generateMetered } from '@/lib/ai/usage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tutor/session — one structured Socratic session on a micro-topic
 * (the mockup's AI Tutor view): question → hint → answer, never the answer first.
 *
 * Body: { action: 'start', subject, topic }
 *     | { action: 'answer', token, answer, history? }
 *     | { action: 'reveal', token, history? }
 *
 * Scoring state (step, hints, revealed, the question being answered) lives in
 * a server-signed token; on completion one tutor_sessions row is written and
 * TML is recomputed for the subject, so the D ("tutor depth") component moves.
 */

const STEPS = 3;
const MODEL = AI_MODELS.standard;

interface Turn { who: 'ai' | 'me'; text: string }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function cleanHistory(v: unknown): Turn[] {
  if (!Array.isArray(v)) return [];
  return v.slice(-16).flatMap((t: any) =>
    (t?.who === 'ai' || t?.who === 'me') && typeof t.text === 'string' ? [{ who: t.who, text: t.text.slice(0, 1500) }] : []);
}

const SYSTEM = (cls: string) => `You are Sthara's Socratic AI tutor for an Indian CBSE school student${cls ? ` in class ${cls}` : ''}.
Rules you never break:
- Teach by questioning. Ask exactly ONE short question at a time, building towards solving one concrete, grade-appropriate problem on the topic.
- Never state the answer to your current question unless explicitly told the student asked for it to be revealed.
- A hint narrows the student's thinking (point at the relevant fact, rule or first step) without giving the result.
- Be warm and brief (2–4 sentences). Plain text only: no markdown, no LaTeX; use Unicode like x², √, π, θ.
- School environment, ages 10–18: strictly academic, age-appropriate language.
Always reply with a single JSON object and nothing else.`;

async function ask(prompt: string, cls: string, userId: string, schoolId: string | null): Promise<Record<string, unknown>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('The AI tutor is offline right now.'), { status: 503 });
  const ai = new GoogleGenAI({ apiKey });
  const res = await generateMetered(ai, {
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { systemInstruction: SYSTEM(cls), responseMimeType: 'application/json', temperature: 0.4 },
  }, { feature: 'tutorSession', userId, schoolId });
  const parsed = JSON.parse(res.text ?? '{}');
  const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
  if (!text) throw new Error('Empty tutor response');
  if (containsFoulLanguage(text)) throw new Error('Tutor output failed the safety filter');
  return { ...parsed, text };
}

/**
 * Official scope for the chosen chapter (CBSE curriculum for the student's
 * class), so the tutor teaches what the syllabus prescribes and respects its
 * restrictions (e.g. "derivation not required"). Empty when the topic isn't a
 * curriculum chapter.
 */
function syllabusScope(cls: string, subject: string, topic: string): string {
  const sub = getCurriculum(cls, subject);
  const ch = sub && flattenChapters(sub).find(c => c.name.toLowerCase() === topic.toLowerCase());
  if (!sub || !ch) return '';
  return `\nOfficial CBSE ${sub.session} syllabus for this chapter (Class ${sub.class} ${sub.subject}, unit "${ch.unitName}"):
- Prescribed content: ${ch.topics.join('; ')}
${ch.notes?.length ? `- Restrictions: ${ch.notes.join('; ')}\n` : ''}Stay within this content and its restrictions; do not use methods or topics beyond it.`;
}

const transcript = (h: Turn[]) => h.map(t => `${t.who === 'ai' ? 'Tutor' : 'Student'}: ${t.text}`).join('\n');

export async function POST(req: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role && user.role !== 'student') {
    return NextResponse.json({ error: 'Tutor sessions are recorded against a student’s mastery, so only students can run them.' }, { status: 403 });
  }

  const rl = checkRateLimit(`tutor-session:${user.id}`, ...limitOf('tutorSession'));
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Slow down a little — try again in a moment.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } });
  }
  const aiBlocked = await aiGate(user.id);
  if (aiBlocked) return aiBlocked;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const action = body?.action;
  const history = cleanHistory(body?.history);
  const supabase = createAdminClient();

  try {
    const { data: me } = await supabase.from('users').select('school_id, student_class').eq('id', user.id).maybeSingle();
    const cls = me?.student_class || '';

    // ── start ────────────────────────────────────────────────────────────────
    if (action === 'start') {
      const subject = str(body.subject, 80) || 'General';
      const topic = str(body.topic, 120);
      if (!topic) return NextResponse.json({ error: 'Pick a topic to start a session.' }, { status: 400 });
      if (containsFoulLanguage(topic)) return NextResponse.json({ error: 'Please keep the topic academic.' }, { status: 400 });

      const out = await ask(
        `Start a ${STEPS}-step Socratic session. Subject: ${subject}. Micro-topic: ${topic}.
Briefly set up one concrete problem on this topic, then ask step 1 of ${STEPS}: the first guiding question.${syllabusScope(cls, subject, topic)}
Reply as {"text": "<setup + question 1>"}`, cls, user.id, me?.school_id ?? null);
      const state: TutorSessionState = { uid: user.id, subject, topic, step: 1, hints: 0, revealed: false, done: false, iat: Date.now() };
      return NextResponse.json({ verdict: 'question', text: out.text, step: 1, steps: STEPS, hints: 0, token: signSession({ ...state, question: out.text as string }) });
    }

    // ── answer / reveal: both continue a signed session ─────────────────────
    const state = verifySession(body?.token, user.id);
    if (!state) return NextResponse.json({ error: 'This session expired. Start a new one.' }, { status: 409 });
    if (state.done) return NextResponse.json({ error: 'This session is already finished.' }, { status: 409 });
    const question = state.question || '';

    let verdict: 'question' | 'hint' | 'complete' | 'revealed';
    let text: string;
    let next: TutorSessionState = { ...state };

    if (action === 'answer') {
      const answer = str(body.answer, 1500);
      if (!answer) return NextResponse.json({ error: 'Type an answer first.' }, { status: 400 });
      if (containsFoulLanguage(answer)) {
        return NextResponse.json({ verdict: 'warning', text: 'Let’s keep it respectful — try answering the question again.', step: state.step, steps: STEPS, hints: state.hints, token: body.token });
      }
      const last = state.step >= STEPS;
      const out = await ask(
        `Subject: ${state.subject}. Micro-topic: ${state.topic}. This is step ${state.step} of ${STEPS}.${syllabusScope(cls, state.subject, state.topic)}
Conversation so far:
${transcript(history)}

The question the student is answering now (authoritative): ${question}
Student's answer: ${answer}

Decide whether the answer is correct (minor wording or arithmetic-format differences are fine; a partially right or wrong answer is not correct).
- If NOT correct: give one hint for this same question without revealing the result. Reply {"correct": false, "text": "<hint>"}
- If correct${last ? ': this was the final step — confirm the full solution in one or two sentences and praise the reasoning. Reply {"correct": true, "text": "<wrap-up>"}'
        : `: acknowledge briefly, then ask step ${state.step + 1} of ${STEPS}. Reply {"correct": true, "text": "<ack + next question>"}`}`, cls, user.id, me?.school_id ?? null);

      if (out.correct === true) {
        if (last) { verdict = 'complete'; next = { ...state, done: true }; }
        else { verdict = 'question'; next = { ...state, step: state.step + 1, question: out.text as string }; }
      } else {
        verdict = 'hint';
        next = { ...state, hints: state.hints + 1 };
      }
      text = out.text as string;
    } else if (action === 'reveal') {
      const out = await ask(
        `Subject: ${state.subject}. Micro-topic: ${state.topic}.
Conversation so far:
${transcript(history)}

The student asked for the answer to be revealed. Explain the answer to this question clearly and briefly, then state the final result of the problem: ${question}
Reply {"text": "<explanation + answer>"}`, cls, user.id, me?.school_id ?? null);
      verdict = 'revealed';
      text = out.text as string;
      next = { ...state, revealed: true, done: true };
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    // ── session over: record evidence + recompute TML ──────────────────────
    let result: { depth: number; topicScore: number | null; band: string | null } | null = null;
    if (next.done) {
      const depth = getTutorDepthScore(next.hints, next.revealed);
      const { error: insErr } = await supabase.from('tutor_sessions').insert({
        student_id: user.id, school_id: me?.school_id ?? null, subject: next.subject, topic: next.topic,
        hint_depth: next.hints, answer_revealed: next.revealed,
      });
      if (insErr) console.error('[tutor/session] insert failed:', insErr.message);
      let topicScore: number | null = null;
      let band: string | null = null;
      if (!insErr) {
        try {
          const tml = await computeStudentTml(supabase, user.id, next.subject);
          const t = tml.topics.find((x: any) => x.topicName === next.topic);
          topicScore = t?.finalTml ?? null;
          band = t?.masteryBand?.band ?? null;
        } catch (e: any) { console.error('[tutor/session] TML recompute failed:', e?.message); }
      }
      result = { depth, topicScore, band };
    }

    return NextResponse.json({ verdict, text, step: next.step, steps: STEPS, hints: next.hints, token: signSession(next), result });
  } catch (e: any) {
    console.error('[tutor/session]', e?.message || e);
    return NextResponse.json({ error: e?.status === 503 ? e.message : 'The tutor had trouble answering. Try again.' }, { status: e?.status || 500 });
  }
}
