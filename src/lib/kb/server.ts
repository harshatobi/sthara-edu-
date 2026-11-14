import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { courseChapters, getCurriculum, type CourseChapter } from '@/lib/curriculum';
import { topicKey } from '@/lib/teacher/desk';
import { gradeOf } from '@/lib/admin/format';
import { isNumericSubject, slotsOf } from '@/lib/studio/blueprint';
import { assembleClass, type Gap } from '@/lib/studio/pick';
import { checkAndFix, classHistory, loadPool, saveToBank, writeGapItems, type StudioCtx } from '@/lib/studio/server';
import type { StudioItem } from '@/lib/studio/types';
import { apportion, blueprintFor, chaptersNamed, OFFER_MIN, type ReqDifficulty, type ReqKind } from './plan';

/**
 * Knowledge-base grounding, server side (decisions of 2026-11-14). Every generator asks here first:
 *   nearSaved          things already made that mean the same (a free model's vectors, no AI): offered before anything new
 *   groundedQuestions  a question set built from the bank first (Sthara's + the school's), the AI writing only the gaps;
 *                      new questions join the school's bank as soon as they pass their checks, so they are never paid
 *                      for twice
 */

export interface KbCaller { id: string; schoolId: string }
export interface Asked { authorization: string | null; origin: string }

// ── Vectors (api/kb_embed.py) ────────────────────────────────────────────────
/** Meaning vectors for texts, from our own Python function. Null when it can't be reached (callers fall back to tags). */
export async function embedTexts(texts: string[], asked: Asked): Promise<number[][] | null> {
  if (!texts.length || !asked.authorization) return null;
  const url = process.env.KB_EMBED_URL || `${asked.origin}/api/kb_embed`;
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: asked.authorization, ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}) },
      body: JSON.stringify({ texts: texts.map(t => t.slice(0, 2000)) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) { console.warn('[kb] embed', res.status); return null; }
    const j = await res.json();
    return Array.isArray(j?.vectors) ? j.vectors : null;
  } catch (e) {
    console.warn('[kb] embed unavailable:', e instanceof Error ? e.message : e);
    return null;
  }
}

const vecText = (v: number[]) => `[${v.map(x => x.toFixed(6)).join(',')}]`;

export interface KbHit { itemType: string; itemId: string; ownerId: string | null; chapterKey: string | null; kind: string | null; similarity: number }

export async function kbMatch(db: SupabaseClient, vec: number[], o: { schoolId: string; ownerId?: string | null; types: string[]; cls: string; subject: string; limit?: number; min?: number }): Promise<KbHit[]> {
  const grade = gradeOf(o.cls);
  const { data, error } = await db.rpc('kb_match', {
    p_query: vecText(vec), p_school: o.schoolId, p_types: o.types, p_grade: grade == null ? 'any' : String(grade), p_subject: o.subject,
    p_owner: o.ownerId ?? null, p_limit: o.limit ?? 20, p_min: o.min ?? 0.35,
  });
  if (error) { console.warn('[kb] match', error.message); return []; }
  return (data || []).map((r: any) => ({ itemType: r.item_type, itemId: r.item_id, ownerId: r.owner_id, chapterKey: r.chapter_key, kind: r.kind, similarity: Number(r.similarity) }));
}

// ── Offer what exists ────────────────────────────────────────────────────────
export interface Offer { type: 'copilot' | 'material' | 'lesson' | 'paper'; id: string; title: string; kind: string | null; at: string; by: 'you' | 'colleague'; similarity: number }

/**
 * Saved things that mean (nearly) the same as the request: the teacher's own Copilot and generator outputs, Studio
 * materials that are theirs or shared with the department, lesson plans of the subject's teachers, the school's papers.
 */
export async function nearSaved(db: SupabaseClient, me: KbCaller, asked: Asked, q: { text: string; cls: string; subject: string; types: Offer['type'][]; min?: number; limit?: number }): Promise<Offer[]> {
  const vecs = await embedTexts([q.text], asked);
  if (!vecs?.[0]) return [];
  const hits = await kbMatch(db, vecs[0], { schoolId: me.schoolId, ownerId: me.id, types: q.types, cls: q.cls, subject: q.subject, limit: 12, min: q.min ?? OFFER_MIN });
  if (!hits.length) return [];
  const ids = (t: string) => hits.filter(h => h.itemType === t).map(h => h.itemId);
  // bounded: at most 12 hits, by id
  const [co, mats, les] = await Promise.all([
    ids('copilot').length + ids('paper').length ? db.from('copilot_outputs').select('id, teacher_id, title, artifact_kind, created_at').in('id', [...ids('copilot'), ...ids('paper')]).limit(12) : Promise.resolve({ data: [] as any[] }),
    ids('material').length ? db.from('studio_materials').select('id, teacher_id, title, kind, share, created_at').in('id', ids('material')).limit(12) : Promise.resolve({ data: [] as any[] }),
    ids('lesson').length ? db.from('lesson_plans').select('id, teacher_id, title, created_at').in('id', ids('lesson')).limit(12) : Promise.resolve({ data: [] as any[] }),
  ]);
  const row = new Map<string, any>([...(co.data || []), ...(mats.data || []), ...(les.data || [])].map(r => [r.id, r]));
  const out: Offer[] = [];
  for (const h of hits) {
    const r = row.get(h.itemId);
    if (!r) continue;
    // A Studio material is offered to others only once its teacher shares it with the department.
    if (h.itemType === 'material' && r.teacher_id !== me.id && r.share !== 'department') continue;
    out.push({ type: h.itemType as Offer['type'], id: r.id, title: r.title, kind: r.artifact_kind ?? r.kind ?? null, at: r.created_at, by: r.teacher_id === me.id ? 'you' : 'colleague', similarity: Math.round(h.similarity * 100) / 100 });
  }
  return out.slice(0, q.limit ?? 4);
}

// ── Build from the bank, AI for the gaps ─────────────────────────────────────
/** Curriculum chapters for the request's topics; topics that name no chapter are placed by meaning search over the bank. */
export async function resolveChapters(db: SupabaseClient, me: KbCaller, asked: Asked, cls: string, subject: string, topics: string[]): Promise<CourseChapter[]> {
  const cur = getCurriculum(cls, subject);
  if (!cur) return [];
  const chapters = courseChapters(cur);
  const { matched, unmatched } = chaptersNamed(topics, chapters);
  const out = chapters.filter(c => matched.includes(c.name));
  if (unmatched.length) {
    const vecs = await embedTexts(unmatched, asked);
    for (const v of vecs ?? []) {
      const hits = await kbMatch(db, v, { schoolId: me.schoolId, types: ['bank'], cls, subject, limit: 15, min: 0.4 });
      const votes = new Map<string, number>();
      for (const h of hits) if (h.chapterKey) votes.set(h.chapterKey, (votes.get(h.chapterKey) ?? 0) + h.similarity);
      const best = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
      const ch = best ? chapters.find(c => topicKey(c.name) === best) : null;
      if (ch && !out.includes(ch)) out.push(ch);
    }
  }
  return out.slice(0, 6);
}

export interface Grounded { items: StudioItem[]; fromBank: number; written: number; flagged: number; unfilled: number; chapters: string[] }

/**
 * A question set for a class, bank first: Sthara's items and the school's own (duplicates already removed by the
 * nightly job), the class's recently used ones left out; the AI writes only what the bank can't fill; every new
 * question is checked, and saved to the school's bank as soon as it passes (unreviewed), so the next request reuses it.
 */
export async function groundedQuestions(db: SupabaseClient, me: KbCaller, p: {
  cls: string; subject: string; chapters: CourseChapter[]; count: number; kind: ReqKind; difficulty: ReqDifficulty; signal?: AbortSignal;
}): Promise<Grounded> {
  const shares = apportion(Math.max(1, Math.min(30, p.count)), Object.fromEntries(p.chapters.map(c => [c.name, 1])));
  const all: StudioItem[] = [];
  let unfilled = 0;
  for (const chapter of p.chapters) {
    const n = shares.get(chapter.name) ?? 0;
    if (!n) continue;
    const ctx: StudioCtx = { db, userId: me.id, schoolId: me.schoolId, cls: p.cls, subject: p.subject, chapter, language: 'en', signal: p.signal };
    const [pool0, history] = await Promise.all([loadPool(ctx, topicKey(chapter.name)), classHistory(ctx)]);
    const slots = slotsOf(blueprintFor(n, p.kind, p.difficulty), { numeric: isNumericSubject(p.subject), quiz: p.kind === 'mcq' });
    const seed = Math.floor(Math.random() * 1e9);
    const opts = { exclude: history.usedBankIds, seed, topics: chapter.topics };
    let pool = pool0;
    const first = assembleClass(slots, pool, opts);
    const gapOf = new Map<string, Gap>();
    if (first.gaps.length) {
      const written = await writeGapItems(ctx, first.gaps);
      let k = 0;
      for (const g of first.gaps) for (let c = 0; c < g.count && k < written.length; c++, k++) gapOf.set(written[k].id, g);
      pool = [...pool, ...written];
    }
    const again = assembleClass(slots, pool, opts);
    const picked = again.picked.filter((x): x is StudioItem => !!x);
    unfilled += again.picked.length - picked.length;
    const fallbackGap = (it: StudioItem): Gap => gapOf.get(it.id) ?? { slotIndex: 0, slot: { competency: it.competency, marks: it.marks as 1, qtype: it.qtype }, topic: it.topic || null, count: 1 };
    const checked = await checkAndFix(ctx, picked, fallbackGap, history.past);
    // New questions that passed their checks join the school's bank now (decision of 2026-11-14), not only when used.
    const fresh = checked.filter(i => !i.bankId && i.check.status !== 'flagged');
    if (fresh.length) {
      const ids = await saveToBank(ctx, fresh);
      for (const it of fresh) { const id = ids.get(it.id); if (id) it.bankId = id; }
    }
    all.push(...checked);
  }
  const fromBank = all.filter(i => i.source === 'bank').length;
  return { items: all, fromBank, written: all.length - fromBank, flagged: all.filter(i => i.check.status === 'flagged').length, unfilled, chapters: p.chapters.map(c => c.name) };
}

/** How the build went, for the teacher: "8 from the bank, 2 new". */
export const groundedNote = (g: Grounded) =>
  `${g.fromBank} from the question bank${g.written ? `, ${g.written} newly written and checked` : ''}${g.unfilled ? `; ${g.unfilled} couldn't be filled` : ''}.`;
