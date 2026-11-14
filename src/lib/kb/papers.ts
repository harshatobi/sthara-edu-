import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { topicKey } from '@/lib/teacher/desk';
import { gradeOf } from '@/lib/admin/format';
import { pageAll } from '@/lib/ops/page';
import { rng } from '@/lib/papers/blueprint';
import { bodyOf, problems, type PaperQuestion, type QBody } from '@/lib/papers/paper';
import type { BankFill } from '@/lib/papers/generate';
import { parseFigures } from '@/lib/studio/figures';

/**
 * Board papers from the question bank first (decision of 2026-11-14: "mix, flag official ones"). A slot is filled from
 * the bank when a question of that chapter, kind and marks exists, passes the same design checks a written question
 * must; diagram and map questions keep CBSE's own pictures and text-only version. Official CBSE questions are marked, so
 * the teacher knows students may have seen them. "Either/or" slots take two bank questions.
 */

const SLOT: Record<string, { qtype: string[]; marks: number }> = {
  mcq: { qtype: ['mcq'], marks: 1 },
  vsa: { qtype: ['short'], marks: 2 },
  sa: { qtype: ['short', 'numerical'], marks: 3 },
  la: { qtype: ['long'], marks: 5 },
};

const OFFICIAL = /^(cbse_|ncert)/;

export async function paperBankFill(db: SupabaseClient, schoolId: string, cls: string, subject: string, seed: number): Promise<{ fill: BankFill; pool: number }> {
  const grade = gradeOf(cls);
  // bounded: one class level and subject of the bank (Sthara's + this school's), paged
  const { data } = await pageAll<any>((a, b) => db.from('bank_items').select('id, school_id, class, subject, chapter_key, qtype, marks, body, status, source, source_ref, checks')
    .ilike('subject', subject).eq('language', 'en').neq('status', 'retired').is('dup_of', null)
    .or(`school_id.is.null,school_id.eq.${schoolId}`).order('id').range(a, b), 5000);
  // Diagram and map questions come with CBSE's own pictures (bank figures); an AI-drawn SVG figure is left to the writer.
  const pool = data.filter(r => gradeOf(r.class) === grade && r.checks?.status !== 'flagged' && r.checks?.sympy?.status !== 'fail' && !r.body?.figure);
  const rand = rng(seed || 1);
  // Shuffled once (by the seed), so the same seed gives the same paper.
  const order = pool.map(r => ({ r, k: rand() })).sort((x, y) => x.k - y.k).map(x => x.r);
  const used = new Set<string>();
  const take = (chapterKey: string, type: string, item: Parameters<BankFill>[0]): { body: QBody; row: any } | null => {
    const spec = SLOT[type];
    if (!spec) return null;
    for (const r of order) {
      if (used.has(r.id) || r.chapter_key !== chapterKey || r.marks !== spec.marks || !spec.qtype.includes(r.qtype)) continue;
      const body = bodyOf({ text: r.body?.text, options: r.body?.options, answer: r.body?.answer, scheme: r.body?.scheme || '' });
      const figs = parseFigures(r.body?.figures);
      if (figs.length) {
        body.figures = figs;
        // CBSE prints a text-only version for visually impaired candidates; keep it, as the board paper does.
        const tv = r.body?.textVersion?.text;
        if (typeof tv === 'string' && tv.trim()) body.vi = tv.trim().slice(0, 2000);
      }
      if (problems(item, body, 'bank').length) continue;
      used.add(r.id);
      return { body, row: r };
    }
    return null;
  };
  const fill: BankFill = item => {
    if (!SLOT[item.type] || item.parts?.length || (item.choice && item.choice.kind !== 'either')) return null;
    const key = topicKey(item.chapter);
    const a = take(key, item.type, item);
    if (!a) return null;
    let alt: QBody | undefined;
    if (item.choice?.kind === 'either') {
      const b = take(key, item.type, item);
      if (!b) { used.delete(a.row.id); return null; }
      alt = b.body;
    }
    const q: PaperQuestion = {
      ...a.body, q: item.q, type: item.type, marks: item.marks, chapter: item.chapter, ...(alt ? { alt } : {}),
      bank: { source: a.row.source_ref ?? null, official: OFFICIAL.test(a.row.source) },
    };
    return q;
  };
  return { fill, pool: pool.length };
}
