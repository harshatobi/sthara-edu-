import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { loadMaterial } from '@/lib/studio/materials';
import { parseQuestionSet } from '@/lib/studio/items';
import { isChoice } from '@/lib/studio/types';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Hands raised in present mode (decision 2026-11-10: class-level evidence only, as in Live Lab; never a student's TML).
 *   GET  ?materialId=                        the latest count for each question of a material
 *   POST { materialId, itemId, counts[] }    saves a count for one choice question; it feeds the question's bank stats
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const m = await loadMaterial(db, staff, req.nextUrl.searchParams.get('materialId') || '');
  if (!m) return bad('Unknown material.', 404);
  // bounded: one material's tallies (one per question per class period, a few dozen)
  const { data } = await db.from('studio_tallies').select('item_key, option_counts, answer, class, created_at').eq('material_id', m.id).order('created_at', { ascending: false }).limit(300);
  const latest: Record<string, { counts: number[]; answer: number; class: string; at: string }> = {};
  for (const t of data || []) if (!latest[t.item_key]) latest[t.item_key] = { counts: t.option_counts, answer: t.answer, class: t.class, at: t.created_at };
  return NextResponse.json({ tallies: latest });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`studioWrites:${staff.id}`, ...limitOf('studioWrites')).allowed) return bad('Too many changes at once. Try again in a few minutes.', 429);
  const b = await req.json().catch(() => null);
  const m = await loadMaterial(db, staff, typeof b?.materialId === 'string' ? b.materialId : '');
  if (!m) return bad('Unknown material.', 404);
  const set = parseQuestionSet(m.content);
  const it = set?.items.find(i => i.id === b?.itemId);
  if (!it || !isChoice(it.qtype) || !it.options?.length || typeof it.answer !== 'number') return bad('Hands can be counted for choice questions only.');
  const counts = Array.isArray(b?.counts) ? b.counts.map((n: unknown) => Math.round(Number(n))) : [];
  if (counts.length !== it.options.length || counts.some((n: number) => !Number.isFinite(n) || n < 0 || n > 500)) return bad('Each count must be a number from 0 to 500.');
  if (!counts.some((n: number) => n > 0)) return bad('Count at least one hand.');
  const { error } = await db.from('studio_tallies').insert({
    school_id: staff.schoolId, material_id: m.id, item_key: it.id, bank_item_id: it.bankId, class: m.class,
    option_counts: counts, answer: it.answer, recorded_by: staff.id,
  });
  if (error) { console.error('[studio tallies]', error.message); return bad('The count couldn’t be saved.', 500); }
  const total = counts.reduce((a: number, n: number) => a + n, 0);
  return NextResponse.json({ ok: true, total, right: counts[it.answer] });
}
