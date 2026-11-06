import 'server-only';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateAi, aiConfigured, type AiPart } from '@/lib/ai/generate';
import { AI_MODELS } from '@/lib/settings/limits';
import { containsFoulLanguage } from './safety';
import { QUOTA_REPLY, isQuotaError, parseModelJson } from './grounding';
import { judgePrompt, judgeSystem, parseSeed, seedPrompt, summaryPrompt, talkerSystem, type BankItem, type Lesson } from './prompts';
import { parseSummary, parseVerdict, progress, type Mode, type SocraticState, type Stage, type Summary, type Verdict } from './socratic';

/**
 * The Socratic engine, server part: model calls, the misconception bank, the
 * session transcript, and the shape the student's screen gets back.
 */

type Db = SupabaseClient;
export const chapterKey = (c: string) => c.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export interface Ground {
  kind: 'syllabus' | 'prerequisite' | 'exam' | 'study_skills';
  subjectKey: string | null;
  level: string | null;
  microTopic: string | null;
  angle: string | null;
}
/** What tutor_sessions.state holds while a session is open. */
export interface RowState { s: SocraticState; ground: Ground; exams: string[] }

export interface Meta { userId: string; schoolId: string | null; economy: boolean }

// ── Model calls ─────────────────────────────────────────────────────────────
async function call(feature: 'tutorSession' | 'tutorJudge' | 'tutorSeed', system: string, parts: AiPart[], m: Meta): Promise<Record<string, unknown>> {
  if (!aiConfigured()) throw Object.assign(new Error('The AI tutor is offline right now.'), { status: 503 });
  try {
    const res = await generateAi({
      model: AI_MODELS.standard,
      contents: [{ role: 'user', parts }],
      config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 0.3 },
    }, { feature, userId: m.userId, schoolId: m.schoolId, studentId: m.userId, economy: m.economy });
    return parseModelJson(res.text || '{}');
  } catch (e) {
    if (isQuotaError(e)) throw Object.assign(new Error(QUOTA_REPLY), { status: 503 });
    throw e;
  }
}

/** One tutor turn in words (Haiku). Output passes the language filter or the turn fails. */
export async function talk(l: Lesson, prompt: string, m: Meta): Promise<Record<string, unknown> & { text: string }> {
  const out = await call('tutorSession', talkerSystem(l), [{ text: prompt }], m);
  const text = typeof out.text === 'string' ? out.text.trim().slice(0, 3000) : '';
  if (!text) throw new Error('Empty tutor response');
  if (containsFoulLanguage(text)) throw new Error('Tutor output failed the safety filter');
  return { ...out, text };
}

/**
 * Marks one answer. Sonnet on the scoring stages, Haiku on scaffold steps
 * (cost cap, 2026-11-06). Misconceptions are shown to the model as short codes
 * (M1, M2...) and mapped back, so it can only tag from the bank.
 */
export async function judge(l: Lesson, stage: Exclude<Stage, 'done'>, x: { problem: string; question: string; answer: string; transcript: string; photo: string | null; bank: BankItem[] }, m: Meta): Promise<{ verdict: Verdict; summary: Summary | null }> {
  const coded = x.bank.map((b, i) => ({ ...b, id: `M${i + 1}` }));
  const byCode = new Map(coded.map((c, i) => [c.id, x.bank[i].id]));
  const parts: AiPart[] = [{ text: judgePrompt(stage, { question: x.question, answer: x.answer, transcript: x.transcript, photo: !!x.photo }) }];
  if (x.photo) parts.push({ inlineData: { data: x.photo, mimeType: 'image/jpeg' } });
  const feature = stage === 'scaffold' ? 'tutorSession' : 'tutorJudge';
  const raw = await call(feature, judgeSystem(l, x.problem, coded), parts, m);
  const v = parseVerdict(raw, coded.map(c => c.id));
  const verdict = { ...v, misconceptions: v.misconceptions.map(c => byCode.get(c)!).filter(Boolean) };
  const summary = stage === 'teachback' && raw.summary && typeof raw.summary === 'object' ? parseSummary(raw.summary as Record<string, unknown>) : null;
  return { verdict, summary };
}

/** Summary for a session that ended without a teach-back. Haiku: it doesn't set the score. */
export async function summarise(l: Lesson, transcript: string, m: Meta): Promise<Summary> {
  try {
    return parseSummary(await call('tutorSession', talkerSystem(l), [{ text: summaryPrompt(transcript) }], m));
  } catch (e) {
    console.error('[tutor] summary failed:', e instanceof Error ? e.message : e);
    return { strengths: [], toFix: [], next: 'Come back to this topic to finish the session.' };
  }
}

// ── Misconception bank ──────────────────────────────────────────────────────
export interface BankKey { schoolId: string; level: string; subjectKey: string; chapter: string }

export async function loadBank(db: Db, k: BankKey): Promise<BankItem[]> {
  const { data, error } = await db.from('tutor_misconceptions').select('id, label, description')
    .eq('school_id', k.schoolId).eq('level', k.level).eq('subject_key', k.subjectKey).eq('chapter_key', chapterKey(k.chapter))
    .eq('status', 'active').order('created_at').limit(20);
  if (error) console.error('[tutor] bank unavailable:', error.message);
  return (data ?? []) as BankItem[];
}

/**
 * Seeds a chapter's bank once per school, after the response is sent so the
 * student never waits for it. The seeds row claims the work; a failed seed is
 * retried by the next session an hour later.
 */
export function seedBankLater(db: Db, k: BankKey, ch: { cls: string; subject: string; topics: string[] }, m: Meta) {
  const run = async () => {
    const key = { school_id: k.schoolId, level: k.level, subject_key: k.subjectKey, chapter_key: chapterKey(k.chapter) };
    const { data: claimed } = await db.from('tutor_misconception_seeds').upsert({ ...key, status: 'seeding' }, { onConflict: 'school_id,level,subject_key,chapter_key', ignoreDuplicates: true }).select('status');
    if (!claimed?.length) {
      // Already seeded or seeding; retry only a seed that failed over an hour ago.
      const { data: retry } = await db.from('tutor_misconception_seeds').update({ status: 'seeding' }).match(key).eq('status', 'failed')
        .lt('updated_at', new Date(Date.now() - 3600_000).toISOString()).select('status');
      if (!retry?.length) return;
    }
    try {
      const out = await call('tutorSeed', 'You are an experienced CBSE teacher and examiner. Always reply with a single JSON object and nothing else.',
        [{ text: seedPrompt({ cls: ch.cls, subject: ch.subject, chapter: k.chapter, topics: ch.topics }) }], { ...m, economy: false });
      const list = parseSeed(out);
      if (list.length) {
        // A fresh chapter has no rows yet and parseSeed drops case-insensitive repeats, so one insert is safe.
        const { error } = await db.from('tutor_misconceptions').insert(
          list.map(x => ({ ...key, label: x.label, description: x.description, source: 'ai' })));
        if (error) throw new Error(error.message);
      }
      await db.from('tutor_misconception_seeds').update({ status: list.length ? 'ready' : 'failed' }).match(key);
    } catch (e) {
      console.error('[tutor] bank seed failed:', e instanceof Error ? e.message : e);
      await db.from('tutor_misconception_seeds').update({ status: 'failed' }).match(key);
    }
  };
  try { after(run); } catch { void run(); }
}

// ── Transcript ──────────────────────────────────────────────────────────────
export type MsgKind = 'question' | 'hint' | 'feedback' | 'walkthrough' | 'answer' | 'photo' | 'stuck' | 'summary';
export interface Msg { role: 'tutor' | 'student'; stage: Stage; kind: MsgKind; text: string; at?: string }

export async function loadMessages(db: Db, sessionId: string): Promise<Msg[]> {
  const { data } = await db.from('tutor_session_messages').select('role, stage, kind, text, created_at')
    .eq('session_id', sessionId).order('turn').order('pos').limit(200);
  return (data ?? []).map(r => ({ role: r.role, stage: r.stage, kind: r.kind, text: r.text, at: r.created_at }));
}

export const transcriptOf = (msgs: Msg[], last = 24) =>
  msgs.slice(-last).map(x => `${x.role === 'tutor' ? 'Tutor' : 'Student'}${x.kind === 'photo' ? ' (photo of working)' : ''}: ${x.text}`).join('\n');

// ── What the screen gets ────────────────────────────────────────────────────
export interface SessionRow {
  id: string; subject: string; topic: string; micro_topic: string | null; grounding: string | null; level: string | null;
  mode: Mode; status: 'open' | 'done'; stage: Stage | null; seq: number; state: RowState | Record<string, never>;
  depth_score: number | null; rubric: Record<string, number> | null; summary: Summary | null; created_at: string; completed_at: string | null;
  hint_depth: number | null; answer_revealed: boolean | null; transcript_purged_at: string | null;
}

export const SESSION_COLS = 'id, subject, topic, micro_topic, grounding, level, mode, status, stage, seq, state, depth_score, rubric, summary, created_at, completed_at, hint_depth, answer_revealed, transcript_purged_at';

export function view(row: SessionRow, messages: Msg[], extra: { topicScore?: number | null; band?: string | null; misconceptions?: string[] } = {}) {
  const st = (row.state as RowState).s;
  const stage: Stage = row.status === 'done' ? 'done' : (row.stage ?? 'diagnose');
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    grounded: { subject: row.subject, chapter: row.topic, microTopic: row.micro_topic, level: row.level, kind: row.grounding, angle: (row.state as RowState).ground?.angle ?? null },
    mode: row.mode,
    status: row.status,
    stage,
    progress: st ? progress(stage, st) : null,
    step: st && stage === 'scaffold' ? { n: st.scaffoldStep, total: st.scaffoldTotal } : null,
    hintsOnStep: st && stage === 'scaffold' ? st.stepHints : 0,
    seq: row.seq,
    messages,
    result: row.status === 'done' ? {
      depth: row.depth_score, rubric: row.rubric, summary: row.summary,
      topicScore: extra.topicScore ?? null, band: extra.band ?? null, misconceptions: extra.misconceptions ?? [],
    } : null,
    startedAt: row.created_at,
    completedAt: row.completed_at,
    purged: !!row.transcript_purged_at,
  };
}
export type SessionView = ReturnType<typeof view>;
