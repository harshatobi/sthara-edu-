import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { pageAll } from '@/lib/ops/page';
import { courseChapters, getCurriculum } from '@/lib/curriculum';
import { topicKey } from '@/lib/teacher/topicKey';
import { aiFailure } from '@/lib/ai/retry';
import { COMPETENCIES, type StudioItem } from '@/lib/studio/types';
import { MARK_COLUMNS, qtypeFor, isNumericSubject } from '@/lib/studio/blueprint';
import { checkAndFix, writeGapItems, bankToItem, type StudioCtx } from '@/lib/studio/server';
import { fingerprint } from '@/lib/studio/fingerprint';
import type { Gap } from '@/lib/studio/pick';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** The starter bank covers these first (decisions of 2026-11-10); more subjects follow the same way. */
export const SEED_SCOPE = [
  { cls: 'Class 9', subject: 'Science' }, { cls: 'Class 9', subject: 'Mathematics' },
  { cls: 'Class 10', subject: 'Science' }, { cls: 'Class 10', subject: 'Mathematics' },
];
/** Questions per chapter per competency and mark value: enough for three equal sets of a typical worksheet. */
const PER_CELL: Record<number, number> = { 1: 6, 2: 3, 3: 2, 5: 1 };
/** Rough cost of one checked question (Sonnet writes, Haiku checks), for the dry run. Measured cost shows in AI usage. */
const USD_PER_ITEM = 0.006;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Sthara's starter question bank (Platform Manager > Question bank).
 *   GET   ?view=coverage                          per chapter: approved / unreviewed / target, for the seed scope
 *   GET   ?view=queue&class=&subject=&chapter=    unreviewed Sthara questions to review
 *   POST  { class, subject, chapter, dry? }       fill one chapter's gaps with checked questions (one chapter per call)
 *   PATCH { ids[], action: 'approve' | 'retire' } review decisions
 * Only questions that pass every check are stored; they sit as "unreviewed" until an operator approves them.
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'bank.read');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const p = req.nextUrl.searchParams;
  if (p.get('view') === 'queue') {
    const cls = String(p.get('class') || ''), subject = String(p.get('subject') || ''), chapter = topicKey(String(p.get('chapter') || ''));
    let q = db.from('bank_items').select('id, class, subject, chapter_key, topic, outcome_code, competency, qtype, marks, body, status, checks, source').is('school_id', null).eq('status', 'unreviewed');
    if (cls) q = q.eq('class', cls);
    if (subject) q = q.eq('subject', subject);
    if (chapter) q = q.eq('chapter_key', chapter);
    const { data, error } = await q.order('created_at').limit(60);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ items: (data || []).map(r => bankToItem(r)).filter(Boolean) });
  }
  const { data: rows, error } = await pageAll<any>((a, b) => db.from('bank_items').select('class, subject, chapter_key, status').is('school_id', null).neq('status', 'retired').order('id').range(a, b), 50_000);
  if (error) return bad(error.message, 500);
  const target = COMPETENCIES.length * MARK_COLUMNS.reduce((n, m) => n + PER_CELL[m], 0);
  const coverage = SEED_SCOPE.map(s => {
    const cur = getCurriculum(s.cls, s.subject);
    return {
      ...s,
      chapters: (cur ? courseChapters(cur) : []).filter(c => !c.formativeOnly).map(c => {
        const key = topicKey(c.name);
        const mine = rows.filter(r => r.class === s.cls && r.subject === s.subject && r.chapter_key === key);
        return { name: c.name, seq: c.seq, approved: mine.filter(r => r.status === 'approved').length, unreviewed: mine.filter(r => r.status === 'unreviewed').length, target };
      }),
    };
  });
  return NextResponse.json({ coverage, usdPerItem: USD_PER_ITEM });
}

export async function POST(req: NextRequest) {
  const op = await operatorFor(req, 'bank.manage');
  if (op instanceof Response) return op;
  const b = await req.json().catch(() => null);
  const scope = SEED_SCOPE.find(s => s.cls === b?.class && s.subject === b?.subject);
  if (!scope) return bad('That class and subject aren’t in the starter bank yet.');
  const cur = getCurriculum(scope.cls, scope.subject);
  const chapter = cur ? courseChapters(cur).find(c => topicKey(c.name) === topicKey(String(b?.chapter || ''))) : null;
  if (!chapter) return bad('Pick a chapter.');
  const db = createAdminClient();
  const key = topicKey(chapter.name);
  const { data: have } = await db.from('bank_items').select('competency, marks, body, topic').is('school_id', null).eq('class', scope.cls).eq('subject', scope.subject).eq('chapter_key', key).neq('status', 'retired');

  // What's missing per cell, spread across the chapter's content points.
  const gaps: Gap[] = [];
  let t = 0;
  for (const c of COMPETENCIES) for (const m of MARK_COLUMNS) {
    const missing = PER_CELL[m] - (have || []).filter(r => r.competency === c && r.marks === m).length;
    for (let k = 0; k < missing; k++) gaps.push({ slotIndex: gaps.length, slot: { competency: c, marks: m, qtype: qtypeFor(c, m, { numeric: isNumericSubject(scope.subject) }) }, topic: chapter.topics[t++ % chapter.topics.length] ?? null, count: 1 });
  }
  if (b?.dry === true || !gaps.length) return NextResponse.json({ chapter: chapter.name, toWrite: gaps.length, estimateUsd: +(gaps.length * USD_PER_ITEM).toFixed(2), stored: 0 });

  const ctx: StudioCtx = { db, userId: op.id, schoolId: '', cls: scope.cls, subject: scope.subject, chapter, language: 'en' };
  const past = (have || []).map((r, i) => ({ text: String(r.body?.text || ''), where: `starter bank question ${i + 1}` })).filter(x => x.text);
  try {
    let stored = 0, flagged = 0;
    // Batches of 10 keep each AI call short; the whole chapter fits in one request.
    for (let i = 0; i < gaps.length; i += 10) {
      const batch = gaps.slice(i, i + 10);
      const written = await writeGapItems(ctx, batch);
      const gapOf = new Map(written.map((w, k) => [w.id, batch[k] ?? batch[0]]));
      const checked = await checkAndFix(ctx, written, it => gapOf.get(it.id)!, past);
      const good = checked.filter((x: StudioItem) => x.check.status === 'passed' || x.check.status === 'rewritten');
      flagged += checked.length - good.length;
      if (good.length) {
        const rows = good.map(it => ({
          scope: 'sthara', school_id: null, class: scope.cls, subject: scope.subject, chapter_key: key, topic: it.topic || null, competency: it.competency, qtype: it.qtype, marks: it.marks,
          language: 'en', body: { text: it.text, options: it.options, answer: it.answer, value: it.value, unit: it.unit, scheme: it.scheme, figure: it.figure, difficulty: it.difficulty },
          status: 'unreviewed', source: 'sthara_ai', checks: it.check, fingerprint: fingerprint(it.text, it.options ?? []), created_by: null,
        }));
        const { data, error } = await db.from('bank_items').insert(rows).select('id');
        if (error) console.error('[ops bank seed]', error.message); else stored += data?.length ?? 0;
        past.push(...good.map(g => ({ text: g.text, where: 'another new starter question' })));
      }
    }
    console.info('[ops bank seed]', { operator: op.email, chapter: chapter.name, stored, flagged });
    return NextResponse.json({ chapter: chapter.name, toWrite: gaps.length, stored, flagged });
  } catch (e: any) {
    console.error('[ops bank seed]', e?.message);
    const kind = aiFailure(e);
    return bad(kind === 'busy' ? 'The AI is overloaded right now. Try again in a few minutes.' : kind === 'quota' ? 'The AI quota has run out.' : 'This chapter couldn’t be filled this time. Try again; questions already stored are kept.', 502);
  }
}

export async function PATCH(req: NextRequest) {
  const op = await operatorFor(req, 'bank.manage');
  if (op instanceof Response) return op;
  const b = await req.json().catch(() => null);
  const ids = (Array.isArray(b?.ids) ? b.ids : []).filter((x: unknown) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 100);
  if (!ids.length) return bad('Pick questions.');
  const db = createAdminClient();
  const row = b?.action === 'approve' ? { status: 'approved', approved_by: null, approved_at: new Date().toISOString() }
    : b?.action === 'retire' ? { status: 'retired', approved_at: null } : null;
  if (!row) return bad('Unknown action.');
  // approved_by references a school user; operators are recorded in the audit trail and the server log instead.
  const { data, error } = await db.from('bank_items').update(row).in('id', ids).is('school_id', null).select('id');
  if (error) return bad(error.message, 500);
  console.info('[ops bank review]', { operator: op.email, action: b.action, count: data?.length ?? 0 });
  return NextResponse.json({ updated: data?.length ?? 0 });
}
