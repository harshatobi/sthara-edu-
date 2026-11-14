/**
 * Each student's weak topics within the chosen topics, ranked weakest first. Pure.
 *
 * TML is kept per chapter, so the finer signal comes from:
 *   answers   how the student did on Studio questions tagged with a topic (bank_item_uses + submission_items)
 *   tutor     AI-tutor sessions on a micro-topic where they needed deep hints or had the answer revealed
 * A topic with no evidence ranks after the ones with evidence (unknown is not weak), and a student with no
 * evidence at all gets the chosen topics in the teacher's order.
 */
import { similarity } from './fingerprint';

export interface TopicEvidence { studentId: string; topic: string; kind: 'answer' | 'tutor'; score: number; max: number; struggled?: boolean }

/** Which chosen topic an evidence topic belongs to (curriculum and tutor wordings differ slightly). */
export function matchTopic(raw: string, chosen: string[]): string | null {
  const r = raw.toLowerCase();
  let best: { t: string; s: number } | null = null;
  for (const t of chosen) {
    const l = t.toLowerCase();
    const s = r.includes(l) || l.includes(r) ? 1 : similarity(raw, t);
    if (s >= 0.45 && (!best || s > best.s)) best = { t, s };
  }
  return best?.t ?? null;
}

export function rankWeakTopics(evidence: TopicEvidence[], chosen: string[], studentIds: string[]): Map<string, string[]> {
  // share[student][topic] = { got, out }
  const acc = new Map<string, Map<string, { got: number; out: number }>>();
  for (const e of evidence) {
    const t = matchTopic(e.topic, chosen);
    if (!t) continue;
    const m = acc.get(e.studentId) ?? new Map();
    acc.set(e.studentId, m);
    const cur = m.get(t) ?? { got: 0, out: 0 };
    if (e.kind === 'answer') { cur.got += Math.max(0, e.score); cur.out += Math.max(e.max, 0); }
    // A tutor struggle counts like a wrong one-mark answer, a smooth session like a right one.
    else { cur.got += e.struggled ? 0 : 1; cur.out += 1; }
    m.set(t, cur);
  }
  const out = new Map<string, string[]>();
  for (const id of studentIds) {
    const m = acc.get(id);
    const share = (t: string) => { const c = m?.get(t); return c && c.out > 0 ? c.got / c.out : null; };
    const ranked = chosen
      .map((t, i) => ({ t, i, s: share(t) }))
      .sort((a, b) => (a.s === null ? 1 : 0) - (b.s === null ? 1 : 0) || (a.s ?? 0) - (b.s ?? 0) || a.i - b.i)
      .map(x => x.t);
    out.set(id, ranked);
  }
  return out;
}
