/**
 * Knowledge-base grounding, the pure parts (decisions of 2026-11-14): how a generator request ("10 mixed questions,
 * medium difficulty, on cells") becomes a Studio blueprint the bank can fill, and how its topics map to chapters.
 * The server side is lib/kb/server.ts.
 */
import { makeBlueprint, type Blueprint, type MarkValue } from '@/lib/studio/blueprint';
import type { Competency } from '@/lib/studio/types';

export type ReqKind = 'mcq' | 'short' | 'long' | 'mixed';
export type ReqDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';

/** Share of each thinking level by difficulty (CBSE competency typology). */
const LEVELS: Record<ReqDifficulty, Record<Competency, number>> = {
  easy: { remember_understand: 0.7, apply: 0.3, analyse_evaluate: 0 },
  medium: { remember_understand: 0.4, apply: 0.4, analyse_evaluate: 0.2 },
  hard: { remember_understand: 0.2, apply: 0.4, analyse_evaluate: 0.4 },
  mixed: { remember_understand: 0.4, apply: 0.35, analyse_evaluate: 0.25 },
};
/** Share of each mark value by question kind (long answers are 5 marks in CBSE papers). */
const MARKS: Record<ReqKind, Partial<Record<MarkValue, number>>> = {
  mcq: { 1: 1 },
  short: { 2: 0.5, 3: 0.5 },
  long: { 5: 1 },
  mixed: { 1: 0.5, 2: 0.15, 3: 0.15, 5: 0.2 },
};

/** Split n into parts by weights so they sum to n (largest remainders). */
export function apportion<K extends string | number>(n: number, weights: Partial<Record<K, number>>): Map<K, number> {
  const keys = (Object.keys(weights) as K[]).filter(k => (weights[k] ?? 0) > 0);
  const total = keys.reduce((s, k) => s + (weights[k] as number), 0) || 1;
  const raw = keys.map(k => ({ k, v: (n * (weights[k] as number)) / total }));
  const out = new Map<K, number>(raw.map(r => [r.k, Math.floor(r.v)]));
  let left = n - [...out.values()].reduce((s, v) => s + v, 0);
  for (const r of [...raw].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)))) {
    if (left <= 0) break;
    out.set(r.k, (out.get(r.k) ?? 0) + 1);
    left--;
  }
  return out;
}

/** A blueprint for a generator request: count questions, by kind and difficulty. */
export function blueprintFor(count: number, kind: ReqKind, difficulty: ReqDifficulty): Blueprint {
  const n = Math.max(1, Math.min(30, Math.round(count)));
  const byMark = apportion<MarkValue>(n, MARKS[kind]);
  const rows: Partial<Record<Competency, Partial<Record<MarkValue, number>>>> = {};
  for (const [mark, k] of byMark) {
    for (const [lvl, c] of apportion<Competency>(k, LEVELS[difficulty])) {
      if (!c) continue;
      rows[lvl] = { ...(rows[lvl] ?? {}), [mark]: c };
    }
  }
  return makeBlueprint(rows);
}

export const asKind = (v: unknown): ReqKind => {
  const s = String(v ?? '').toLowerCase();
  return s === 'mcq' ? 'mcq' : s === 'short' || s === 'saq' ? 'short' : s === 'long' || s === 'laq' ? 'long' : 'mixed';
};
export const asDifficulty = (v: unknown): ReqDifficulty => {
  const s = String(v ?? '').toLowerCase();
  return s === 'easy' || s === 'medium' || s === 'hard' ? s : 'mixed';
};

const words = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'chapter', 'about', 'questions', 'question', 'class', 'test', 'quiz', 'worksheet', 'homework']);

/**
 * The curriculum chapters a request's topics name: an exact or contained name first, then the best word overlap
 * (at least half the chapter's words). Topics that match nothing are left for meaning search.
 */
export function chaptersNamed(topics: string[], chapters: { name: string; topics: string[] }[]): { matched: string[]; unmatched: string[] } {
  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const t of topics.map(x => x.trim()).filter(Boolean)) {
    const tl = t.toLowerCase();
    let hit = chapters.find(c => c.name.toLowerCase() === tl) ?? chapters.find(c => tl.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(tl));
    if (!hit) {
      const tw = words(t);
      let best = 0;
      for (const c of chapters) {
        const cw = words(`${c.name} ${c.topics.join(' ')}`);
        const nameW = words(c.name);
        const overlap = [...tw].filter(w => cw.has(w)).length;
        const nameOverlap = nameW.size ? [...nameW].filter(w => tw.has(w)).length / nameW.size : 0;
        const score = overlap + nameOverlap * 2;
        if (score > best && (nameOverlap >= 0.5 || overlap >= 2)) { best = score; hit = c; }
      }
    }
    if (hit) { if (!matched.includes(hit.name)) matched.push(hit.name); } else unmatched.push(t);
  }
  return { matched, unmatched };
}

/** Near-identical saved things are offered before anything is made; below this, the build goes bank-first. */
export const OFFER_MIN = 0.86;
