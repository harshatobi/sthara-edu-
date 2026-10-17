import type { CurriculumSubject } from '@/lib/curriculum/types';
import { slotsOf, type Choice, type PaperDesign, type QType } from './designs';

/**
 * Which chapter each question of a paper comes from. Marks are spread across
 * units in proportion to the unit weightage in the curriculum (as a board
 * paper is), then across each unit's chapters evenly. Chapters CBSE assesses
 * only internally never appear. A seed varies the spread between papers.
 */

export interface BlueprintItem {
  q: number; section: string; type: QType; marks: number; parts?: number[]; choice?: Choice; note?: string;
  unit: string; chapter: string; topics: string[]; exclusions: string[];
}

/** Small deterministic generator (mulberry32), so a seed always gives the same paper plan. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildBlueprint(design: PaperDesign, cur: CurriculumSubject, seed = 1): BlueprintItem[] {
  const rand = rng(seed);
  const slots = slotsOf(design);
  const units = cur.units.filter(u => (u.marks ?? 0) > 0);
  const chapterMarks = new Map<string, number>();
  const out = new Map<number, BlueprintItem>();

  // Slots that share a pool of units are planned together.
  const pools = new Map<string, typeof slots>();
  for (const s of slots) {
    const key = (s.units ?? units.map(u => u.code)).join('|');
    pools.set(key, [...(pools.get(key) ?? []), s]);
  }

  for (const [key, group] of pools) {
    const pool = units.filter(u => key.split('|').includes(u.code));
    if (!pool.length) throw new Error(`${design.key}: no assessed units for ${key}`);
    const groupMarks = group.reduce((n, s) => n + s.marks, 0);
    const poolMarks = pool.reduce((n, u) => n + (u.marks ?? 0), 0);
    const target = new Map(pool.map(u => [u.code, ((u.marks ?? 0) * groupMarks) / poolMarks]));
    const given = new Map(pool.map(u => [u.code, 0]));
    // Biggest questions first, so the large ones land where the weight is; ties broken by the seed.
    // Random tie-break keys are drawn once per item, never inside a sort comparator: how often a comparator
    // runs differs between JavaScript engines, which would make the same seed plan differently on server and browser.
    const order = group.map(s => ({ s, r: rand() })).sort((x, y) => y.s.marks - x.s.marks || x.r - y.r).map(x => x.s);
    for (const s of order) {
      const keyed = pool.map(u => ({ u, gap: target.get(u.code)! - given.get(u.code)!, r: rand() }));
      const unit = keyed.sort((x, y) => y.gap - x.gap || x.r - y.r)[0].u;
      given.set(unit.code, given.get(unit.code)! + s.marks);
      const chapters = unit.chapters.filter(c => !c.formativeOnly);
      const pick = (chapters.length ? chapters : unit.chapters)
        .map(c => ({ c, m: chapterMarks.get(c.name) ?? 0, r: rand() }))
        .sort((x, y) => x.m - y.m || x.r - y.r)[0].c;
      chapterMarks.set(pick.name, (chapterMarks.get(pick.name) ?? 0) + s.marks);
      out.set(s.q, {
        q: s.q, section: s.section, type: s.type, marks: s.marks, parts: s.parts, choice: s.choice, note: s.note,
        unit: unit.code, chapter: pick.name, topics: pick.topics ?? [], exclusions: pick.notes ?? [],
      });
    }
  }
  return slots.map(s => out.get(s.q)!);
}

/** Marks given to each unit by a blueprint, for checking it against the weightage. */
export function unitMarks(items: BlueprintItem[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const i of items) r[i.unit] = (r[i.unit] ?? 0) + i.marks;
  return r;
}
