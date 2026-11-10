/**
 * Bank-first assembly and fair versions. Pure (the seed makes every choice repeatable).
 *
 *   assembleClass   one set for the whole class: the best bank item for each slot, gaps where there is none
 *   perStudent      one version per student: every version has the same slots (competency, marks, kind) and the
 *                   same difficulty band per slot; only the topics move to each student's own weak spots
 *   abcSets         A, B and C: equal slots and bands, different questions, so neighbours can't copy
 *
 * A gap is a slot the bank can't fill (or can't fill fairly). The build route has the AI write exactly those, adds
 * them to the pool and runs the same pick again, so AI is spent only on what's missing.
 */
import type { Slot } from './blueprint';
import { isChoice, type StudioItem } from './types';

export type Band = 'easy' | 'medium' | 'hard';
/** Share correct to a band; an item with no results yet counts as medium until students answer it. */
export const bandOf = (d: number | null | undefined): Band => (d === null || d === undefined ? 'medium' : d >= 0.7 ? 'easy' : d >= 0.4 ? 'medium' : 'hard');
const BAND_ORDER: Band[] = ['medium', 'easy', 'hard'];

export interface Gap { slotIndex: number; slot: Slot; topic: string | null; count: number }

/** Can this item fill this slot? Same competency and marks; choice slots need choice items and vice versa. */
export const fits = (it: StudioItem, s: Slot) => it.competency === s.competency && it.marks === s.marks && isChoice(it.qtype) === isChoice(s.qtype);

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A stable random rank per item for this seed (never call the generator inside a sort comparator). */
function ranks(items: StudioItem[], seed: number): Map<string, number> {
  const r = rng(seed);
  return new Map(items.map(i => [i.id, r()]));
}

const topicRank = (topic: string, wanted: string[]) => {
  const i = wanted.findIndex(w => w && topic && (topic.toLowerCase().includes(w.toLowerCase()) || w.toLowerCase().includes(topic.toLowerCase())));
  return i < 0 ? wanted.length : i;
};
/** Better items first: wanted topic, then proven with real students (10+ answers), then checked, then the seeded shuffle. */
function order(pool: StudioItem[], wanted: string[], rank: Map<string, number>): StudioItem[] {
  const key = new Map(pool.map(i => [i.id, [topicRank(i.topic, wanted), (i.stats?.attempts ?? 0) >= 10 ? 0 : 1, i.check.status === 'passed' ? 0 : 1, rank.get(i.id) ?? 0]]));
  return [...pool].sort((a, b) => {
    const x = key.get(a.id)!, y = key.get(b.id)!;
    for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return x[k] - y[k];
    return 0;
  });
}

const usable = (pool: StudioItem[], exclude: Set<string>) => pool.filter(i => i.check.status !== 'flagged' && !exclude.has(i.id) && !(i.bankId && exclude.has(i.bankId)));

export function assembleClass(slots: Slot[], pool: StudioItem[], opts: { topics?: string[]; exclude?: Set<string>; seed?: number } = {}): { picked: (StudioItem | null)[]; gaps: Gap[] } {
  const rank = ranks(pool, opts.seed ?? 1);
  const avail = order(usable(pool, opts.exclude ?? new Set()), opts.topics ?? [], rank);
  const used = new Set<string>();
  const topics = opts.topics ?? [];
  const picked = slots.map(s => {
    const it = avail.find(i => !used.has(i.id) && fits(i, s));
    if (it) used.add(it.id);
    return it ?? null;
  });
  const gaps: Gap[] = [];
  picked.forEach((p, i) => { if (!p) gaps.push({ slotIndex: i, slot: slots[i], topic: topics.length ? topics[i % topics.length] : null, count: 1 }); });
  return { picked, gaps };
}

/** The band every version uses for a slot: the band with the most candidates (medium wins ties), so all can be served. */
function slotBand(cands: StudioItem[]): Band {
  const n = (b: Band) => cands.filter(c => bandOf(c.difficulty) === b).length;
  return BAND_ORDER.reduce((best, b) => (n(b) > n(best) ? b : best), 'medium' as Band);
}

export interface StudentNeed { studentId: string; weakTopics: string[] }

/**
 * One version per student. Within a version no item repeats. Across versions items can be shared (two students
 * weak in the same topic may get the same question); the point is each student's own gaps, not uniqueness.
 */
export function perStudent(slots: Slot[], pool: StudioItem[], students: StudentNeed[], opts: { exclude?: Set<string>; seed?: number; topics?: string[] } = {}):
  { versions: { studentId: string; picked: (StudioItem | null)[] }[]; bands: Band[]; gaps: Gap[] } {
  const rank = ranks(pool, opts.seed ?? 1);
  const base = usable(pool, opts.exclude ?? new Set());
  const bands = slots.map(s => slotBand(base.filter(i => fits(i, s))));
  const gapCount = new Map<string, Gap>();
  const versions = students.map(st => {
    const wanted = [...st.weakTopics, ...(opts.topics ?? [])];
    const avail = order(base, wanted, rank);
    const used = new Set<string>();
    const picked = slots.map((s, si) => {
      const it = avail.find(i => !used.has(i.id) && fits(i, s) && bandOf(i.difficulty) === bands[si]);
      if (it) { used.add(it.id); return it; }
      const topic = wanted[0] ?? null;
      const k = `${si}|${topic}`;
      const g = gapCount.get(k) ?? { slotIndex: si, slot: s, topic, count: 0 };
      g.count++; gapCount.set(k, g);
      return null;
    });
    return { studentId: st.studentId, picked };
  });
  // The AI writes one item per (slot, topic) pair; students sharing a weak topic can share it.
  return { versions, bands, gaps: [...gapCount.values()].map(g => ({ ...g, count: 1 })) };
}

export function abcSets(slots: Slot[], pool: StudioItem[], n = 3, opts: { exclude?: Set<string>; seed?: number; topics?: string[] } = {}):
  { sets: (StudioItem | null)[][]; bands: Band[]; gaps: Gap[] } {
  const rank = ranks(pool, opts.seed ?? 1);
  const avail = order(usable(pool, opts.exclude ?? new Set()), opts.topics ?? [], rank);
  const bands = slots.map(s => slotBand(avail.filter(i => fits(i, s))));
  const used = new Set<string>();
  const sets: (StudioItem | null)[][] = Array.from({ length: n }, () => []);
  const gaps: Gap[] = [];
  slots.forEach((s, si) => {
    let missing = 0;
    for (let k = 0; k < n; k++) {
      const it = avail.find(i => !used.has(i.id) && fits(i, s) && bandOf(i.difficulty) === bands[si]);
      if (it) used.add(it.id); else missing++;
      sets[k].push(it ?? null);
    }
    if (missing) gaps.push({ slotIndex: si, slot: s, topic: opts.topics?.[si % Math.max(1, opts.topics.length)] ?? null, count: missing });
  });
  return { sets, bands, gaps };
}

/** The gentle line a student reads at the top of their own version. */
export function reasonFor(topics: string[]): string {
  const t = topics.filter(Boolean).slice(0, 2);
  if (!t.length) return 'This set is made for you, at the same level as the rest of the class.';
  return `This set focuses on ${t.join(' and ')}, where you're still building.`;
}

/** Two versions are fair to compare when every slot has the same competency, marks and band. */
export function sameShape(a: (StudioItem | null)[], b: (StudioItem | null)[]): boolean {
  return a.length === b.length && a.every((x, i) => {
    const y = b[i];
    return !!x && !!y && x.competency === y.competency && x.marks === y.marks && bandOf(x.difficulty) === bandOf(y.difficulty);
  });
}
