import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { recomputeTml } from '@/lib/tml/recompute';
import { completeAssignment, hotsAllowed } from '@/lib/tutor/assignmentsServer';
import { containsFoulLanguage, safetySignals } from '@/lib/tutor/safety';
import {
  NO_SUBJECTS, REFUSAL, SAFETY_REPLY, TEACHABLE, WELLBEING_REPLY, isEnrolled, matchPicked, needsTurnCheck, redirectTo, suggestions,
} from '@/lib/tutor/grounding';
import { classifyTopic, classifyTurn, loadContext, onOffTopic, onProfanity, onSafety, type Student } from '@/lib/tutor/groundingServer';
import { flattenChapters, getCurriculum } from '@/lib/curriculum';
import { examsForChapter } from '@/lib/curriculum/exams';
import { getSchoolPolicy, aiGate } from '@/lib/settings/server';
import { studentAllowance } from '@/lib/ai/allowanceServer';
import { PAUSED_REPLY } from '@/lib/ai/allowance';
import { actionPrompt, startPrompt, type Lesson } from '@/lib/tutor/prompts';
import { advance, clampSteps, computeRubric, initialState, legacyTotals, type Action, type Event, type Stage, type Summary } from '@/lib/tutor/socratic';
import {
  SESSION_COLS, chapterKey, judge, loadBank, loadMessages, seedBankLater, summarise, talk, transcriptOf, view,
  type Ground, type Meta, type Msg, type MsgKind, type RowState, type SessionRow,
} from '@/lib/tutor/socraticServer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tutor/session — the Socratic tutor (decisions of 2026-11-06).
 *
 * A session lives on the server from its first question (tutor_sessions,
 * status 'open'), so it can be resumed and read back. It runs in stages:
 * diagnose -> scaffold (skipped on a strong diagnosis) -> unaided transfer ->
 * teach-back; see lib/tutor/socratic.ts. Haiku words every turn; Sonnet marks
 * the stages that set the score, Haiku the scaffold steps. On completion D is
 * the rubric (30% independence, 30% reasoning, 30% transfer, 10% teach-back)
 * and TML is recomputed for the subject.
 *
 * Grounded as before: a topic must sit in the student's own syllabus; off-topic
 * is refused, profanity warned, and a safety cue is never answered by the AI.
 *
 * Cost cap: past 70% of the student's yearly AI allowance every call runs on
 * Haiku; at 100% no new session starts (an open one can still be finished).
 *
 * Body: { action: 'start', subject, topic, mode? }      mode 'hots': chapter at 90%+ or a teacher's HOTS assignment
 *     | { action: 'answer', id, seq, answer?, photo? }   photo: base64 JPEG of working
 *     | { action: 'stuck', id, seq }
 *     | { action: 'finish', id, seq }
 */

const MAX_PHOTO_CHARS = 2_000_000; // ~1.5 MB of JPEG
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function syllabusScope(cls: string, subject: string, topic: string, exams: string[] = []): string {
  const sub = getCurriculum(cls, subject);
  const ch = sub && flattenChapters(sub).find(c => c.name.toLowerCase() === topic.toLowerCase());
  if (!sub || !ch) return '';
  const hits = exams.length ? examsForChapter(sub.class, sub.subject, ch.name, exams) : [];
  const examBlock = hits.length
    ? `\n- The student is preparing for ${[...new Set(hits.map(h => h.exam.exam))].join(', ')}. Related exam units: ${hits.map(h => `${h.exam.exam} "${h.unit.name}"${h.unit.beyondBoard?.length ? ` (beyond the board: ${h.unit.beyondBoard.join('; ')})` : ''}`).join(' | ')}.
You may pitch questions at that exam's level and cover the beyond-board content, but say so when you step outside the board syllabus.`
    : '';
  return `\nOfficial CBSE ${sub.session} syllabus for this chapter (Class ${sub.class} ${sub.subject}, unit "${ch.unitName}"):
- Prescribed content: ${ch.topics.join('; ')}
${ch.notes?.length ? `- Restrictions: ${ch.notes.join('; ')}\n` : ''}${hits.length ? examBlock : 'Stay within this content and its restrictions; do not use methods or topics beyond it.'}`;
}

function lessonOf(subject: string, topic: string, g: Ground, cls: string, exams: string[], mode: 'standard' | 'hots'): Lesson {
  const studySkills = g.kind === 'study_skills';
  const level = g.level ?? cls;
  const where = g.level ? `Class ${g.level} ${subject}` : subject;
  const line = studySkills
    ? `Study skills coaching: ${topic}. Keep it practical and about how to study.`
    : `Subject: ${where}. Chapter: ${topic}.${g.microTopic ? ` Micro-topic: ${g.microTopic}.` : ''}${g.kind === 'prerequisite' ? ' This is an earlier-class concept the student needs for their current syllabus: build it up from the basics.' : ''}${g.angle ? ` Approach it the way the syllabus does: ${g.angle}.` : ''}`;
  return { cls: level, line, scope: studySkills ? '' : syllabusScope(level, subject, topic, exams), mode, studySkills };
}

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

export async function POST(req: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || authErr) return fail('Unauthorized', 401);
  if (user.role && user.role !== 'student') {
    return fail('Tutor sessions are recorded against a student’s mastery, so only students can run them.', 403);
  }
  const rl = checkRateLimit(`tutor-session:${user.id}`, ...limitOf('tutorSession'));
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Slow down a little — try again in a moment.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } });
  }
  const aiBlocked = await aiGate(user.id, 'tutor');
  if (aiBlocked) return aiBlocked;

  let body: any;
  try { body = await req.json(); } catch { return fail('Invalid JSON', 400); }
  const db = createAdminClient();
  const allowance = await studentAllowance(db, user.id);
  const economy = allowance?.level === 'economy' || allowance?.level === 'paused';

  try {
    if (body?.action === 'start') {
      if (allowance?.level === 'paused') return NextResponse.json({ verdict: 'paused', text: PAUSED_REPLY });
      return await start(db, user.id, body, economy);
    }
    if (['answer', 'stuck', 'finish'].includes(body?.action)) return await turn(db, user.id, body, economy);
    return fail('Unknown action', 400);
  } catch (e: any) {
    console.error('[tutor/session]', e?.message || e);
    return fail(e?.status === 503 ? e.message : 'The tutor had trouble answering. Try again.', e?.status || 500);
  }
}

// ── start: ground the topic, open the session, ask the diagnostic ───────────
async function start(db: ReturnType<typeof createAdminClient>, uid: string, body: any, economy: boolean) {
  const asked = str(body.subject, 80);
  const topic = str(body.topic, 120);
  if (!topic) return fail('Pick a topic to start a session.', 400);
  const ctx = await loadContext(db, uid);
  const exams = ctx.scope.exams;

  if (safetySignals(topic)) {
    await onSafety(db, ctx.me, topic, null);
    return NextResponse.json({ verdict: 'safety', text: SAFETY_REPLY });
  }
  if (containsFoulLanguage(topic)) {
    const picked = asked ? ctx.scope.subjects.find(s => s.name.toLowerCase() === asked.toLowerCase()) : undefined;
    await onProfanity(db, ctx.me, { key: picked?.key ?? null, name: picked?.name ?? (asked || null) });
    return NextResponse.json({ verdict: 'warning', text: 'Please keep the topic about your school work.' });
  }
  if (!ctx.scope.subjects.length) return NextResponse.json({ verdict: 'refused', text: NO_SUBJECTS, suggestions: [] });
  if (asked && asked !== 'General' && !isEnrolled(ctx.scope, asked)) {
    return NextResponse.json({ verdict: 'refused', text: `${asked} isn't one of your subjects, so the tutor can't take it.`, suggestions: suggestions(ctx.scope, ctx.weak) });
  }
  const chosen = asked ? ctx.scope.subjects.find(s => s.name.toLowerCase() === asked.toLowerCase()) : undefined;
  const g = (asked && matchPicked(ctx.scope, asked, topic)) || await classifyTopic(ctx, topic, chosen?.key);
  if (g.kind === 'safety') {
    await onSafety(db, ctx.me, topic, g.subjectKey);
    return NextResponse.json({ verdict: 'safety', text: SAFETY_REPLY });
  }
  if (g.kind === 'wellbeing') return NextResponse.json({ verdict: 'wellbeing', text: WELLBEING_REPLY, href: '/student/wellness' });
  if (!TEACHABLE.includes(g.kind)) {
    if (g.kind === 'off_topic') await onOffTopic(db, ctx.me, null);
    return NextResponse.json({ verdict: 'refused', text: g.kind === 'greeting' ? 'Hi! Pick a chapter or type a topic from your syllabus to start.' : REFUSAL, suggestions: suggestions(ctx.scope, ctx.weak) });
  }

  const studySkills = g.kind === 'study_skills';
  const subject = studySkills ? 'Study skills' : g.subjectName!;
  const chapter = studySkills ? (g.angle || topic) : g.chapter!;
  const ground: Ground = { kind: g.kind as Ground['kind'], subjectKey: g.subjectKey, level: g.level, microTopic: g.microTopic, angle: g.angle };
  const level = g.level ?? ctx.me.cls;
  // HOTS / Olympiad mode: only on a chapter the student has at Exemplary (90%+), or a teacher assigned in HOTS.
  let mode: 'standard' | 'hots' = 'standard';
  if (body.mode === 'hots') {
    if (studySkills) return NextResponse.json({ verdict: 'refused', text: 'HOTS sessions are for syllabus chapters.', suggestions: [] });
    const gate = await hotsAllowed(db, uid, subject, chapter);
    if (!gate.ok) {
      return NextResponse.json({ verdict: 'refused', text: `HOTS sessions on ${chapter} unlock at 90% mastery${gate.score !== null ? ` (you are at ${Math.round(gate.score)}%)` : ''}. A normal session is the way there.`, suggestions: [] });
    }
    mode = 'hots';
  }
  const lesson = lessonOf(subject, chapter, ground, ctx.me.cls, exams, mode);
  const m: Meta = { userId: uid, schoolId: ctx.me.schoolId, economy };

  const out = await talk(lesson, startPrompt(), m);
  const problem = typeof out.problem === 'string' && out.problem.trim() ? out.problem.trim().slice(0, 2000) : out.text;
  // The chapter's mastery now, kept on the session so the result can show start to end after a resume.
  const { data: before } = await db.from('tml_scores').select('score').eq('student_id', uid).ilike('subject', subject.replace(/[\\%_]/g, x => `\\${x}`))
    .eq('topic_name', chapter).order('computed_at', { ascending: false }).limit(1);
  const startScore = before?.[0] && Number.isFinite(Number(before[0].score)) ? Number(before[0].score) : null;
  const state: RowState = { s: initialState(mode, problem, out.text), ground, exams, startScore };

  const { data: row, error } = await db.from('tutor_sessions').insert({
    student_id: uid, school_id: ctx.me.schoolId, subject, topic: chapter, level,
    subject_key: ground.subjectKey, chapter_key: chapterKey(chapter), micro_topic: ground.microTopic, grounding: ground.kind,
    status: 'open', stage: 'diagnose', mode, state, seq: 1, hint_depth: 0, answer_revealed: false,
    assignment_id: await openAssignmentFor(db, uid, subject, chapter, mode),
  }).select(SESSION_COLS).single();
  if (error || !row) throw new Error(`tutor_sessions: ${error?.message}`);
  const msg: Msg = { role: 'tutor', stage: 'diagnose', kind: 'question', text: out.text };
  await writeMessages(db, row.id, uid, ctx.me.schoolId, 1, [msg]);

  // Misconception bank: seeded once per chapter per school, in the background.
  if (!studySkills && ctx.me.schoolId && ground.subjectKey) {
    const sub = getCurriculum(level, subject);
    const ch = sub ? flattenChapters(sub).find(c => c.name === chapter) : undefined;
    const k = { schoolId: ctx.me.schoolId, level, subjectKey: ground.subjectKey, chapter };
    if (!(await loadBank(db, k)).length) seedBankLater(db, k, { cls: level, subject, topics: ch?.topics ?? [] }, m);
  }
  return NextResponse.json({ verdict: 'session', session: view(row as SessionRow, [msg]), economy });
}

/** The student's open assignment this session answers, if any (same chapter and mode). */
async function openAssignmentFor(db: ReturnType<typeof createAdminClient>, uid: string, subject: string, chapter: string, mode: string): Promise<string | null> {
  const { data } = await db.from('tutor_assignments').select('id, subject, topic').eq('student_id', uid).eq('status', 'open').eq('mode', mode);
  const k = (x: string) => x.trim().toLowerCase().replace(/\s+/g, ' ');
  return (data ?? []).find(a => k(a.subject) === k(subject) && k(a.topic) === k(chapter))?.id ?? null;
}

async function writeMessages(db: ReturnType<typeof createAdminClient>, sessionId: string, uid: string, schoolId: string | null, turnNo: number, msgs: Msg[]) {
  if (!msgs.length) return;
  const { error } = await db.from('tutor_session_messages').insert(msgs.map((x, pos) => ({
    session_id: sessionId, student_id: uid, school_id: schoolId, turn: turnNo, pos, role: x.role, stage: x.stage, kind: x.kind, text: x.text.slice(0, 4000),
  })));
  if (error) console.error('[tutor/session] transcript write failed:', error.message);
}

const TUTOR_KIND: Record<Action['kind'], MsgKind> = {
  hint: 'hint', to_scaffold: 'question', next_step: 'question', walkthrough: 'walkthrough', to_transfer: 'question', transfer_review: 'feedback', wrap_up: 'summary',
};

// ── answer / stuck / finish ─────────────────────────────────────────────────
async function turn(db: ReturnType<typeof createAdminClient>, uid: string, body: any, economy: boolean) {
  const id = str(body.id, 40);
  const seq = Number(body.seq);
  if (!id || !Number.isInteger(seq)) return fail('Missing session.', 400);
  const { data: found } = await db.from('tutor_sessions').select(`${SESSION_COLS}, school_id, subject_key`).eq('id', id).eq('student_id', uid).maybeSingle();
  if (!found) return fail('That session was not found.', 404);
  const row = found as SessionRow & { school_id: string | null; subject_key: string | null };
  if (row.status !== 'open' || !row.stage || row.stage === 'done') return fail('This session is already finished.', 409);
  if (row.seq !== seq) return fail('This step was already answered. Reload the session to carry on.', 409, { reload: true });
  const rs = row.state as RowState;
  if (!rs?.s) return fail('This session can no longer be continued. Start a new one.', 409);

  const { data: meRow } = await db.from('users').select('name, student_class').eq('id', uid).maybeSingle();
  const me: Student = { id: uid, name: meRow?.name || 'Student', schoolId: row.school_id, cls: meRow?.student_class || '' };
  const policy = me.schoolId ? await getSchoolPolicy(me.schoolId, db) : null;
  const exams = rs.exams.filter(x => policy?.examTracks.includes(x));
  const lesson = lessonOf(row.subject, row.topic, rs.ground, me.cls, exams, row.mode);
  const m: Meta = { userId: uid, schoolId: me.schoolId, economy };
  const stage = row.stage as Exclude<Stage, 'done'>;
  const level = rs.ground.level ?? me.cls;
  const same = { session: { id: row.id, seq: row.seq } };

  const history = await loadMessages(db, row.id);
  const transcript = transcriptOf(history);
  const out: Msg[] = [];
  let ev: Event;
  let summary: Summary | null = null;
  let answerText = '';
  let note = '';
  let labels: string[] = [];

  if (body.action === 'answer') {
    const typed = str(body.answer, 1500);
    const photo = typeof body.photo === 'string' && body.photo.length ? body.photo.replace(/^data:image\/\w+;base64,/, '') : null;
    if (photo && (photo.length > MAX_PHOTO_CHARS || !/^[A-Za-z0-9+/=]+$/.test(photo.slice(0, 200)))) return fail('That photo is too large. Try again with a closer, smaller photo.', 413);
    if (!typed && !photo) return fail('Type an answer or add a photo of your working.', 400);

    if (typed) {
      if (safetySignals(typed)) {
        await onSafety(db, me, typed, rs.ground.subjectKey);
        return NextResponse.json({ verdict: 'safety', text: SAFETY_REPLY, ...same });
      }
      if (containsFoulLanguage(typed)) {
        await onProfanity(db, me, { key: rs.ground.subjectKey, name: row.subject });
        return NextResponse.json({ verdict: 'warning', text: 'Let’s keep it respectful — try answering the question again.', ...same });
      }
      // Messages that aren't plainly an attempt get checked for drifting off the topic (not the teach-back: it is meant to be prose).
      if (stage !== 'teachback' && !photo) {
        const sub = rs.ground.kind === 'study_skills' ? null : getCurriculum(level, row.subject);
        const words = sub ? (flattenChapters(sub).find(c => c.name === row.topic)?.topics ?? []).concat(row.topic) : [row.topic];
        if (needsTurnCheck(typed, words)) {
          const kind = await classifyTurn(me, { subject: row.subject, level, chapter: row.topic, microTopic: rs.ground.microTopic, studySkills: rs.ground.kind === 'study_skills' }, typed);
          if (kind === 'safety') {
            await onSafety(db, me, typed, rs.ground.subjectKey);
            return NextResponse.json({ verdict: 'safety', text: SAFETY_REPLY, ...same });
          }
          if (kind === 'wellbeing') return NextResponse.json({ verdict: 'wellbeing', text: WELLBEING_REPLY, href: '/student/wellness', ...same });
          if (kind === 'off_topic' || kind === 'greeting') {
            if (kind === 'off_topic') await onOffTopic(db, me, rs.ground.subjectKey);
            return NextResponse.json({ verdict: 'redirect', text: redirectTo({ chapter: row.topic, microTopic: rs.ground.microTopic }), ...same });
          }
        }
      }
    }

    const bank = me.schoolId && rs.ground.subjectKey ? await loadBank(db, { schoolId: me.schoolId, level, subjectKey: rs.ground.subjectKey, chapter: row.topic }) : [];
    const j = await judge(lesson, stage, { problem: rs.s.problem, question: rs.s.question, answer: typed, transcript, photo, bank }, m);
    // What the photo said is checked like typed text before anything is stored.
    if (photo && j.verdict.transcription && (safetySignals(j.verdict.transcription) || containsFoulLanguage(j.verdict.transcription))) {
      if (safetySignals(j.verdict.transcription)) {
        await onSafety(db, me, j.verdict.transcription, rs.ground.subjectKey);
        return NextResponse.json({ verdict: 'safety', text: SAFETY_REPLY, ...same });
      }
      return NextResponse.json({ verdict: 'warning', text: 'Let’s keep it respectful — try answering the question again.', ...same });
    }
    answerText = photo ? [typed, j.verdict.transcription ? `[working] ${j.verdict.transcription}` : '[photo of working]'].filter(Boolean).join('\n') : typed;
    out.push({ role: 'student', stage, kind: photo ? 'photo' : 'answer', text: answerText });
    summary = j.summary;
    ev = { type: 'answer', verdict: j.verdict };
    labels = bank.filter(b => j.verdict.misconceptions.includes(b.id)).map(b => b.label);
    note = j.verdict.note;
  } else if (body.action === 'stuck') {
    out.push({ role: 'student', stage, kind: 'stuck', text: stage === 'teachback' ? 'I’d like to skip the explanation.' : stage === 'transfer' ? 'Please show me the solution.' : 'I’m stuck — please show me.' });
    ev = { type: 'stuck' };
  } else {
    out.push({ role: 'student', stage, kind: 'stuck', text: 'I’d like to end the session here.' });
    ev = { type: 'finish' };
  }

  const step = advance(stage, rs.s, ev);
  let s = step.state;
  const said = await talk(lesson, actionPrompt(step.action, { s, note, misconceptions: labels, answer: answerText || null }), m);
  if (step.action.kind === 'to_scaffold') s = { ...s, scaffoldTotal: clampSteps(said.steps) };
  if (step.stage !== 'done') s = { ...s, question: said.text };
  out.push({ role: 'tutor', stage: step.stage === 'done' ? 'done' : step.stage, kind: TUTOR_KIND[step.action.kind], text: said.text });

  const totals = legacyTotals(s);
  const nextSeq = row.seq + 1;
  const patch: Record<string, unknown> = { seq: nextSeq, stage: step.stage, state: { ...rs, s }, hint_depth: totals.hints, answer_revealed: totals.revealed };
  let rubric = null as ReturnType<typeof computeRubric> | null;
  if (step.stage === 'done') {
    rubric = computeRubric(s);
    summary ??= await summarise(lesson, transcriptOf([...history, ...out]), m);
    Object.assign(patch, { status: 'done', depth_score: rubric.depth, rubric, summary, completed_at: new Date().toISOString() });
  }

  // Claim the turn: a double-submit or a stale tab finds seq already moved and writes nothing.
  const { data: claimed, error: upErr } = await db.from('tutor_sessions').update(patch).eq('id', row.id).eq('seq', row.seq).select(SESSION_COLS);
  if (upErr) throw new Error(`tutor_sessions: ${upErr.message}`);
  if (!claimed?.length) return fail('This step was already answered. Reload the session to carry on.', 409, { reload: true });
  await writeMessages(db, row.id, uid, me.schoolId, nextSeq, out);

  let topicScore: number | null = null, band: string | null = null, tagged: string[] = [];
  let assignmentDone: string | null = null;
  if (step.stage === 'done') {
    // A session finished in full closes the assignment on this chapter (a Critical Gap one or a teacher's).
    assignmentDone = await completeAssignment(db, uid, { id: row.id, subject: row.subject, topic: row.topic, mode: row.mode, early: step.action.kind === 'wrap_up' && step.action.early });
    const ids = Object.keys(s.misconceptions);
    if (ids.length) {
      const { error: mErr } = await db.from('tutor_session_misconceptions').insert(ids.map(mid => ({
        session_id: row.id, misconception_id: mid, student_id: uid, school_id: me.schoolId, subject_key: rs.ground.subjectKey,
        chapter_key: chapterKey(row.topic), stage: s.misconceptions[mid].stage, seen: s.misconceptions[mid].seen,
      })));
      if (mErr) console.error('[tutor/session] misconception tags failed:', mErr.message);
      const { data: labelRows } = await db.from('tutor_misconceptions').select('label').in('id', ids);
      tagged = (labelRows ?? []).map(r => r.label);
    }
    // Study-skills coaching isn't a syllabus chapter, so it moves no mastery score.
    if (rs.ground.kind !== 'study_skills') {
      try {
        const tml = await recomputeTml(db, uid, row.subject);
        const t = tml.topics.find((x: any) => x.topicName === row.topic);
        topicScore = t?.finalTml ?? null;
        band = t?.masteryBand?.band ?? null;
      } catch (e: any) { console.error('[tutor/session] TML recompute failed:', e?.message); }
    }
  }
  return NextResponse.json({ verdict: 'session', session: view(claimed[0] as SessionRow, out, { topicScore, band, misconceptions: tagged }), economy, assignmentDone });
}
