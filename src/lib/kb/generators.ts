import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { normCls, normText } from '@/lib/teacher/copilotKeys';
import { findSaved, keyOf, saveOutput, type Reused } from '@/lib/teacher/copilotSaved';
import type { CopilotReply } from '@/lib/teacher/copilot';
import type { StudioItem } from '@/lib/studio/types';
import { parseFigures, type BankFigure } from '@/lib/studio/figures';
import { groundedNote, groundedQuestions, indexNow, nearSaved, resolveChapters, type KbCaller, type Offer } from './server';
import type { ReqDifficulty, ReqKind } from './plan';

/**
 * One path for every question generator (Quiz Creator, Homework Creator, the question paper generator), decisions of
 * 2026-11-14: (1) a saved set the teacher chose, (2) the teacher's identical earlier request, (3) near-identical saved
 * sets offered first, (4) else built from the bank with the AI writing only the gaps; whatever is made is saved.
 * The route turns the questions into its own reply format.
 */

export interface GenQ {
  type: 'mcq' | 'short' | 'long';
  text: string;
  options?: string[];
  answer?: number;
  marks: number;
  /** Model answer, value points or the explanation of the right option. */
  scheme: string;
  level?: 'EASY' | 'MEDIUM' | 'HARD';
  source: 'bank' | 'ai';
  sourceRef?: string | null;
  /** CBSE's diagrams and maps (bank pictures), and its text-only version for students who can't use them. */
  figures?: BankFigure[];
  textVersion?: string | null;
}

export type GenResult =
  | { offers: Offer[] }
  | { questions: GenQ[]; title: string; note: string; kb: { fromBank: number; written: number; chapters: string[]; reused?: Reused; savedId?: string | null } }
  | { blocked: Response }
  | null; // nothing in the curriculum to ground on: the route keeps its old AI path

const levelOf = (d: number | null | undefined): GenQ['level'] => (d == null ? undefined : d >= 0.7 ? 'EASY' : d >= 0.4 ? 'MEDIUM' : 'HARD');

export function fromStudioItem(it: StudioItem): GenQ {
  const choice = (it.qtype === 'mcq' || it.qtype === 'assertion_reason') && Array.isArray(it.options) && it.options.length >= 2;
  return {
    type: choice ? 'mcq' : it.marks >= 5 ? 'long' : 'short', text: it.text, ...(choice ? { options: it.options, answer: it.answer ?? 0 } : {}),
    marks: it.marks, scheme: it.scheme || '', level: levelOf(it.difficulty), source: it.source === 'bank' ? 'bank' : 'ai', sourceRef: it.sourceRef ?? null,
    ...(it.figures?.length ? { figures: it.figures } : {}), ...(it.textVersion?.text ? { textVersion: it.textVersion.text } : {}),
  };
}

/** The Copilot's question format (what the saved copy holds), to and from. */
function toCopilotQuestions(qs: GenQ[]) {
  return qs.map(q => (q.type === 'mcq'
    ? { type: 'mcq', questionText: q.text, options: q.options, answer: q.answer, marks: q.marks, ...(q.level ? { level: q.level } : {}), why: q.scheme, ...(q.figures ? { figures: q.figures } : {}) }
    : { type: 'short', questionText: q.text, marks: q.marks, why: q.scheme, ...(q.figures ? { figures: q.figures } : {}) }));
}
function fromCopilotQuestions(qs: any[]): GenQ[] {
  return (qs || []).map((q: any) => (q?.type === 'mcq' && Array.isArray(q.options)
    ? { type: 'mcq' as const, text: String(q.questionText || ''), options: q.options, answer: Number(q.answer) || 0, marks: Number(q.marks) || 1, scheme: String(q.why || ''), level: q.level, source: 'bank' as const, figures: parseFigures(q.figures) }
    : { type: (Number(q?.marks) >= 5 ? 'long' : 'short') as GenQ['type'], text: String(q?.questionText || ''), marks: Number(q?.marks) || 2, scheme: String(q?.why || ''), source: 'bank' as const, figures: parseFigures(q?.figures) }))
    .filter(q => q.text);
}

/** A saved set the teacher chose from the offers: its questions, if they may see it. */
async function loadOffered(db: SupabaseClient, me: KbCaller, pick: { type: string; id: string }): Promise<{ title: string; questions: GenQ[] } | null> {
  if (pick.type === 'material') {
    const { data: m } = await db.from('studio_materials').select('teacher_id, share, title, content').eq('id', pick.id).eq('school_id', me.schoolId).maybeSingle();
    if (!m || (m.teacher_id !== me.id && m.share !== 'department')) return null;
    const items: StudioItem[] = Array.isArray(m.content?.items) ? m.content.items : [];
    return { title: m.title, questions: items.map(fromStudioItem) };
  }
  if (pick.type === 'copilot' || pick.type === 'paper') {
    const { data: o } = await db.from('copilot_outputs').select('teacher_id, kind, title, reply').eq('id', pick.id).eq('school_id', me.schoolId).maybeSingle();
    if (!o || (o.kind === 'reply' && o.teacher_id !== me.id)) return null;
    const a = (o.reply as CopilotReply | null)?.artifact;
    if (a?.kind !== 'questions') return null;
    return { title: o.title, questions: fromCopilotQuestions(a.questions as any[]) };
  }
  return null;
}

export async function generatorQuestions(req: NextRequest, db: SupabaseClient, me: KbCaller, a: {
  feature: 'quizGen' | 'homeworkGen' | 'paperGen'; cls: string; subject: string; topics: string[]; count: number; kind: ReqKind; difficulty: ReqDifficulty;
  /** Offer near-identical saved sets before building (the first ask); false once the teacher says "make new". */
  offer: boolean; fresh: boolean; useSaved?: { type: string; id: string } | null; title: string; signal?: AbortSignal;
  /** The AI gate (paused school, cost cap): checked only before a build that may call the AI, never for saved copies. */
  gate: () => Promise<Response | null>;
}): Promise<GenResult> {
  const asked = { authorization: req.headers.get('authorization'), origin: req.nextUrl.origin };
  if (a.useSaved) {
    const got = await loadOffered(db, me, a.useSaved);
    if (!got?.questions.length) throw Object.assign(new Error('That saved set isn’t available.'), { status: 404 });
    return { questions: got.questions, title: got.title, note: `Reused "${got.title}" from what's already been made. No AI used.`, kb: { fromBank: got.questions.length, written: 0, chapters: [] } };
  }
  const key = keyOf(JSON.stringify({ v: 1, f: a.feature, cls: normCls(a.cls), subject: normText(a.subject), topics: a.topics.map(normText).sort(), n: a.count, kind: a.kind, d: a.difficulty }));
  if (!a.fresh) {
    const hit = await findSaved(db, me, 'reply', key);
    const art = hit?.reply?.artifact;
    if (hit && art?.kind === 'questions') {
      const questions = fromCopilotQuestions(art.questions as any[]);
      if (questions.length) return { questions, title: art.title, note: `You made this set before; here it is again. No AI used.`, kb: { fromBank: questions.length, written: 0, chapters: [], reused: hit.reused } };
    }
  }
  if (a.offer && !a.fresh) {
    const offers = await nearSaved(db, me, asked, { text: `${a.kind} questions on ${a.topics.join(', ')} (${a.subject})`, cls: a.cls, subject: a.subject, types: ['copilot', 'material'] });
    if (offers.length) return { offers };
  }
  { const blocked = await a.gate(); if (blocked) return { blocked }; }
  const chapters = await resolveChapters(db, me, asked, a.cls, a.subject, a.topics);
  if (!chapters.length) return null;
  // (an empty build below falls back to the route's own path)
  const g = await groundedQuestions(db, me, { cls: a.cls, subject: a.subject, chapters, count: a.count, kind: a.kind, difficulty: a.difficulty, signal: a.signal, asked });
  const questions = g.items.map(fromStudioItem);
  if (!questions.length) return null;
  const reply: CopilotReply = {
    say: groundedNote(g), ask: [], suggestions: [],
    artifact: { kind: 'questions', title: a.title, purpose: a.feature === 'quizGen' ? 'quiz' : 'worksheet', chapter: chapters[0]?.name ?? null, questions: toCopilotQuestions(questions) as any, notes: '' },
  };
  const savedId = questions.length ? await saveOutput(db, me, { kind: 'reply', cls: a.cls, subject: a.subject, chapter: chapters[0]?.name ?? null, key, title: a.title, artifactKind: 'questions', reply }) : null;
  // Findable for the next "similar" request straight away, not only after the nightly job.
  if (savedId) await indexNow(db, asked, [{ type: 'copilot', id: savedId, schoolId: me.schoolId, ownerId: me.id, cls: a.cls, subject: a.subject, chapterKey: null, kind: 'questions', text: `${a.title}. ${questions.slice(0, 30).map(q => q.text).join(' ')}` }]);
  return { questions, title: a.title, note: groundedNote(g), kb: { fromBank: g.fromBank, written: g.written, chapters: g.chapters, savedId } };
}

/** The request fields every generator route accepts for the knowledge-base path. */
export function kbArgs(b: any): { offer: boolean; fresh: boolean; useSaved: { type: string; id: string } | null } {
  const u = b?.useSaved;
  return {
    offer: b?.offer === true, fresh: b?.fresh === true,
    useSaved: u && typeof u.type === 'string' && typeof u.id === 'string' && /^[0-9a-f-]{36}$/i.test(u.id) ? { type: u.type, id: u.id } : null,
  };
}
