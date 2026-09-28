import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit } from '@/lib/rateLimit';
import { AI_MODELS, limitOf } from '@/lib/settings/limits';
import { computeStudentTml, getTutorDepthScore } from '@/lib/tml/engine';
import { containsFoulLanguage, safetySignals } from '@/lib/tutor/safety';
import {
  NO_SUBJECTS, QUOTA_REPLY, REFUSAL, isQuotaError, parseModelJson, SAFETY_REPLY, TEACHABLE, WELLBEING_REPLY, isEnrolled, matchPicked, needsTurnCheck, redirectTo, suggestions,
} from '@/lib/tutor/grounding';
import { classifyTopic, classifyTurn, loadContext, onOffTopic, onProfanity, onSafety } from '@/lib/tutor/groundingServer';
import { flattenChapters, getCurriculum } from '@/lib/curriculum';
import { examsForChapter } from '@/lib/curriculum/exams';
import { getSchoolPolicy } from '@/lib/settings/server';
import { signSession, verifySession, type TutorSessionState } from '@/lib/tutor/sessionToken';
import { aiGate } from '@/lib/settings/server';
import { generateMetered } from '@/lib/ai/usage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tutor/session — one structured Socratic session on a micro-topic
 * (the mockup's AI Tutor view): question → hint → answer, never the answer first.
 *
 * Grounded: a topic must sit in the student's own syllabus (their subjects, an
 * earlier-class chapter of one, or their exam track). Picked chapters are matched
 * directly; typed topics go through the grounding classifier. Off-topic is refused,
 * profanity warned, and a safety cue is never answered by the AI (see lib/tutor).
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
  let res;
  try {
    res = await generateMetered(ai, {
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { systemInstruction: SYSTEM(cls), responseMimeType: 'application/json', temperature: 0.4 },
    }, { feature: 'tutorSession', userId, schoolId });
  } catch (e) {
    if (isQuotaError(e)) throw Object.assign(new Error(QUOTA_REPLY), { status: 503 });
    throw e;
  }
  const parsed = parseModelJson(res.text ?? '{}');
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
function syllabusScope(cls: string, subject: string, topic: string, exams: string[] = []): string {
  const sub = getCurriculum(cls, subject);
  const ch = sub && flattenChapters(sub).find(c => c.name.toLowerCase() === topic.toLowerCase());
  if (!sub || !ch) return '';
  // Exam track: the student is preparing for these exams, so the tutor may go
  // to exam depth on this chapter, including the listed beyond-board content.
  const hits = exams.length ? examsForChapter(sub.class, sub.subject, ch.name, exams) : [];
  const examBlock = hits.length
    ? `\n- The student is preparing for ${[...new Set(hits.map(h => h.exam.exam))].join(', ')}. Related exam units: ${hits.map(h => `${h.exam.exam} "${h.unit.name}"${h.unit.beyondBoard?.length ? ` (beyond the board: ${h.unit.beyondBoard.join('; ')})` : ''}`).join(' | ')}.
You may pitch questions at that exam's level and cover the beyond-board content, but say so when you step outside the board syllabus.`
    : '';
  return `\nOfficial CBSE ${sub.session} syllabus for this chapter (Class ${sub.class} ${sub.subject}, unit "${ch.unitName}"):
- Prescribed content: ${ch.topics.join('; ')}
${ch.notes?.length ? `- Restrictions: ${ch.notes.join('; ')}\n` : ''}${hits.length ? examBlock : 'Stay within this content and its restrictions; do not use methods or topics beyond it.'}`;
}

const transcript = (h: Turn[]) => h.map(t => `${t.who === 'ai' ? 'Tutor' : 'Student'}: ${t.text}`).join('\n');

type Ground = NonNullable<TutorSessionState['ground']>;
const chapterKey = (c: string) => c.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** What the tutor is teaching, in words the prompt can use. */
function lessonLine(state: TutorSessionState): string {
  const g = state.ground;
  if (g?.kind === 'study_skills') return `Study skills coaching: ${state.topic}. Keep it practical and about how to study.`;
  const where = g?.level ? `Class ${g.level} ${state.subject}` : state.subject;
  return `Subject: ${where}. Chapter: ${state.topic}.${g?.microTopic ? ` Micro-topic: ${g.microTopic}.` : ''}${g?.kind === 'prerequisite' ? ' This is an earlier-class concept the student needs for their current syllabus: build it up from the basics.' : ''}${g?.angle ? ` Approach it the way the syllabus does: ${g.angle}.` : ''}`;
}

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
    // ── start: ground the topic in the student's own syllabus first ─────────
    if (action === 'start') {
      const asked = str(body.subject, 80);
      const topic = str(body.topic, 120);
      if (!topic) return NextResponse.json({ error: 'Pick a topic to start a session.' }, { status: 400 });
      const ctx = await loadContext(supabase, user.id);
      const exams = ctx.scope.exams;

      // Deterministic checks, before any model sees the text.
      if (safetySignals(topic)) {
        await onSafety(supabase, ctx.me, topic, null);
        return NextResponse.json({ verdict: 'safety', text: SAFETY_REPLY });
      }
      if (containsFoulLanguage(topic)) {
        const picked = asked ? ctx.scope.subjects.find(s => s.name.toLowerCase() === asked.toLowerCase()) : undefined;
        await onProfanity(supabase, ctx.me, { key: picked?.key ?? null, name: picked?.name ?? (asked || null) });
        return NextResponse.json({ verdict: 'warning', text: 'Please keep the topic about your school work.' });
      }
      if (!ctx.scope.subjects.length) return NextResponse.json({ verdict: 'refused', text: NO_SUBJECTS, suggestions: [] });
      if (asked && asked !== 'General' && !isEnrolled(ctx.scope, asked)) {
        return NextResponse.json({ verdict: 'refused', text: `${asked} isn't one of your subjects, so the tutor can't take it.`, suggestions: suggestions(ctx.scope, ctx.weak) });
      }

      // A chapter or micro-topic picked from the list needs no classifier; anything typed does.
      const chosen = asked ? ctx.scope.subjects.find(s => s.name.toLowerCase() === asked.toLowerCase()) : undefined;
      const g = (asked && matchPicked(ctx.scope, asked, topic)) || await classifyTopic(ctx, topic, chosen?.key);
      if (g.kind === 'safety') {
        await onSafety(supabase, ctx.me, topic, g.subjectKey);
        return NextResponse.json({ verdict: 'safety', text: SAFETY_REPLY });
      }
      if (g.kind === 'wellbeing') return NextResponse.json({ verdict: 'wellbeing', text: WELLBEING_REPLY, href: '/student/wellness' });
      if (!TEACHABLE.includes(g.kind)) {
        if (g.kind === 'off_topic') await onOffTopic(supabase, ctx.me, null);
        return NextResponse.json({ verdict: 'refused', text: g.kind === 'greeting' ? 'Hi! Pick a chapter or type a topic from your syllabus to start.' : REFUSAL, suggestions: suggestions(ctx.scope, ctx.weak) });
      }

      const studySkills = g.kind === 'study_skills';
      const state: TutorSessionState = {
        uid: user.id,
        subject: studySkills ? 'Study skills' : g.subjectName!,
        topic: studySkills ? (g.angle || topic) : g.chapter!,
        step: 1, hints: 0, revealed: false, done: false, iat: Date.now(),
        ground: { kind: g.kind as Ground['kind'], subjectKey: g.subjectKey, level: g.level, microTopic: g.microTopic, angle: g.angle },
      };
      const grounded = { subject: state.subject, chapter: state.topic, microTopic: g.microTopic, level: g.level, kind: g.kind, angle: g.angle };
      let out: Record<string, unknown>;
      try {
        out = await ask(
        `Start a ${STEPS}-step Socratic session. ${lessonLine(state)}
Briefly set up one concrete problem on this, then ask step 1 of ${STEPS}: the first guiding question.${studySkills ? '' : syllabusScope(g.level ?? ctx.me.cls, state.subject, state.topic, exams)}
Reply as {"text": "<setup + question 1>"}`, g.level ?? ctx.me.cls, user.id, ctx.me.schoolId);
      } catch (e) {
        // The topic was recognised; say so, so the student can come back to it.
        if ((e as { status?: number }).status === 503) return NextResponse.json({ error: (e as Error).message, grounded }, { status: 503 });
        throw e;
      }
      return NextResponse.json({
        verdict: 'question', text: out.text, step: 1, steps: STEPS, hints: 0,
        grounded,
        token: signSession({ ...state, question: out.text as string }),
      });
    }

    // ── answer / reveal: both continue a signed session ─────────────────────
    const state = verifySession(body?.token, user.id);
    if (!state) return NextResponse.json({ error: 'This session expired. Start a new one.' }, { status: 409 });
    if (state.done) return NextResponse.json({ error: 'This session is already finished.' }, { status: 409 });
    const question = state.question || '';
    const { data: meRow } = await supabase.from('users').select('name, school_id, student_class, metadata').eq('id', user.id).maybeSingle();
    const me = { id: user.id, name: meRow?.name || 'Student', schoolId: meRow?.school_id ?? null, cls: meRow?.student_class || '' };
    const level = state.ground?.level ?? me.cls;
    const policy = me.schoolId ? await getSchoolPolicy(me.schoolId, supabase) : null;
    const picked: unknown = (meRow?.metadata as Record<string, unknown> | null)?.targetExams;
    const exams = Array.isArray(picked) ? picked.filter((x): x is string => typeof x === 'string' && !!policy?.examTracks.includes(x)) : [];
    const scope = state.ground?.kind === 'study_skills' ? '' : syllabusScope(level, state.subject, state.topic, exams);
    const same = { step: state.step, steps: STEPS, hints: state.hints, token: body.token };

    let verdict: 'question' | 'hint' | 'complete' | 'revealed';
    let text: string;
    let next: TutorSessionState = { ...state };

    if (action === 'answer') {
      const answer = str(body.answer, 1500);
      if (!answer) return NextResponse.json({ error: 'Type an answer first.' }, { status: 400 });
      if (safetySignals(answer)) {
        await onSafety(supabase, me, answer, state.ground?.subjectKey ?? null);
        return NextResponse.json({ verdict: 'safety', text: SAFETY_REPLY, ...same });
      }
      if (containsFoulLanguage(answer)) {
        await onProfanity(supabase, me, { key: state.ground?.subjectKey ?? null, name: state.subject });
        return NextResponse.json({ verdict: 'warning', text: 'Let’s keep it respectful — try answering the question again.', ...same });
      }
      // Messages that aren't plainly an attempt get checked for drifting off the topic.
      if (state.ground) {
        const sub = state.ground.kind === 'study_skills' ? null : getCurriculum(level, state.subject);
        const words = sub ? (flattenChapters(sub).find(c => c.name === state.topic)?.topics ?? []).concat(state.topic) : [state.topic];
        if (needsTurnCheck(answer, words)) {
          const kind = await classifyTurn(me, { subject: state.subject, level, chapter: state.topic, microTopic: state.ground.microTopic, studySkills: state.ground.kind === 'study_skills' }, answer);
          if (kind === 'safety') {
            await onSafety(supabase, me, answer, state.ground.subjectKey);
            return NextResponse.json({ verdict: 'safety', text: SAFETY_REPLY, ...same });
          }
          if (kind === 'wellbeing') return NextResponse.json({ verdict: 'wellbeing', text: WELLBEING_REPLY, href: '/student/wellness', ...same });
          if (kind === 'off_topic' || kind === 'greeting') {
            if (kind === 'off_topic') await onOffTopic(supabase, me, state.ground.subjectKey);
            return NextResponse.json({ verdict: 'redirect', text: redirectTo({ chapter: state.topic, microTopic: state.ground.microTopic }), ...same });
          }
        }
      }
      const last = state.step >= STEPS;
      const out = await ask(
        `${lessonLine(state)} This is step ${state.step} of ${STEPS}.${scope}
Conversation so far:
${transcript(history)}

The question the student is answering now (authoritative): ${question}
Student's answer: ${answer}

Decide whether the answer is correct (minor wording or arithmetic-format differences are fine; a partially right or wrong answer is not correct).
- If NOT correct: give one hint for this same question without revealing the result. Reply {"correct": false, "text": "<hint>"}
- If correct${last ? ': this was the final step — confirm the full solution in one or two sentences and praise the reasoning. Reply {"correct": true, "text": "<wrap-up>"}'
        : `: acknowledge briefly, then ask step ${state.step + 1} of ${STEPS}. Reply {"correct": true, "text": "<ack + next question>"}`}`, level, user.id, me.schoolId);

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
        `${lessonLine(state)}
Conversation so far:
${transcript(history)}

The student asked for the answer to be revealed. Explain the answer to this question clearly and briefly, then state the final result of the problem: ${question}
Reply {"text": "<explanation + answer>"}`, level, user.id, me.schoolId);
      verdict = 'revealed';
      text = out.text as string;
      next = { ...state, revealed: true, done: true };
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    // ── session over: record evidence + recompute TML ──────────────────────
    // Study-skills coaching isn't a syllabus chapter, so it carries no mastery evidence.
    let result: { depth: number; topicScore: number | null; band: string | null } | null = null;
    if (next.done) {
      const depth = getTutorDepthScore(next.hints, next.revealed);
      let topicScore: number | null = null;
      let band: string | null = null;
      if (next.ground?.kind !== 'study_skills') {
        const { error: insErr } = await supabase.from('tutor_sessions').insert({
          student_id: user.id, school_id: me.schoolId, subject: next.subject, topic: next.topic,
          hint_depth: next.hints, answer_revealed: next.revealed,
          subject_key: next.ground?.subjectKey ?? null, chapter_key: chapterKey(next.topic),
          micro_topic: next.ground?.microTopic ?? null, grounding: next.ground?.kind ?? null,
        });
        if (insErr) console.error('[tutor/session] insert failed:', insErr.message);
        if (!insErr) {
          try {
            const tml = await computeStudentTml(supabase, user.id, next.subject);
            const t = tml.topics.find((x: any) => x.topicName === next.topic);
            topicScore = t?.finalTml ?? null;
            band = t?.masteryBand?.band ?? null;
          } catch (e: any) { console.error('[tutor/session] TML recompute failed:', e?.message); }
        }
      }
      result = { depth, topicScore, band };
    }

    return NextResponse.json({ verdict, text, step: next.step, steps: STEPS, hints: next.hints, token: signSession(next), result });
  } catch (e: any) {
    console.error('[tutor/session]', e?.message || e);
    return NextResponse.json({ error: e?.status === 503 ? e.message : 'The tutor had trouble answering. Try again.' }, { status: e?.status || 500 });
  }
}
