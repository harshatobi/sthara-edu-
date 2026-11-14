/**
 * Repeat detection. Pure.
 *   fingerprint   the same question (wording normalised, options in any order) -> the same id; the bank's unique key
 *   similarity    trigram overlap of two questions' wording, for "this is the same question re-worded"
 */

/** 53-bit string hash (cyrb53), so this file runs the same in the browser and on the server. */
function hash53(s: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Lowercase, punctuation and extra spaces out, Indian scripts kept (letters in any script, digits, spaces). */
export function normalise(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function fingerprint(text: string, options: string[] = []): string {
  const base = [normalise(text), ...options.map(normalise).sort()].join('|');
  return `${hash53(base, 1)}${hash53(base, 2)}`.slice(0, 28);
}

function trigrams(s: string): Set<string> {
  const t = ` ${normalise(s)} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** Jaccard overlap of character trigrams, 0-1. */
export function similarity(a: string, b: string): number {
  const x = trigrams(a), y = trigrams(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const g of x) if (y.has(g)) both++;
  return both / (x.size + y.size - both);
}

/** At or above this, two questions count as the same one re-worded. */
export const REPEAT_AT = 0.72;

/** The past question this one repeats, if any. */
export function findRepeat(text: string, past: { text: string; where: string }[]): { where: string; score: number } | null {
  let best: { where: string; score: number } | null = null;
  for (const p of past) {
    const score = similarity(text, p.text);
    if (score >= REPEAT_AT && (!best || score > best.score)) best = { where: p.where, score };
  }
  return best;
}
