/** Topic names match loosely ("Ch 4 · Quadratic Equations" / "quadratic equations"). */
export const topicKey = (s: string | null | undefined) =>
  (s || '').toLowerCase().replace(/^ch(apter)?\s*\d+\s*[·:.-]?\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();
