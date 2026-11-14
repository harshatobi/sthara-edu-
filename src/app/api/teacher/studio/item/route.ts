import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';
import { aiFailure } from '@/lib/ai/retry';
import { courseChapters, getCurriculum } from '@/lib/curriculum';
import { topicKey } from '@/lib/teacher/topicKey';
import { parseItem } from '@/lib/studio/items';
import { bandOf, fits } from '@/lib/studio/pick';
import { checkAndFix, classHistory, loadPool, translateItems, writeGapItems, type StudioCtx } from '@/lib/studio/server';
import { loadMaterial } from '@/lib/studio/materials';
import { isLanguage } from '@/lib/studio/languages';
import type { StudioItem } from '@/lib/studio/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * POST /api/teacher/studio/item { materialId, itemId, action: 'swap' | 'harder' | 'easier' | 'rewrite' | 'edit', item? }
 * One question at a time, without rebuilding the set. Returns the replacement item (the client saves the set):
 *   swap      another bank question for the same slot (no AI)
 *   harder / easier / rewrite   the AI writes one new question for the slot, checked like any new question
 *   edit      the teacher's own wording, kept as theirs: the teacher is the check
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`studioItem:${staff.id}`, ...limitOf('studioItem')).allowed) return bad('Lots of changes in a short time. Try again in a few minutes.', 429);
  const b = await req.json().catch(() => null);
  const m = await loadMaterial(db, staff, String(b?.materialId || ''));
  if (!m || m.teacher_id !== staff.id) return bad('Unknown material.', 404);
  const items: StudioItem[] = Array.isArray(m.content?.items) ? m.content.items : [];
  const action = String(b?.action || '');
  if (action === 'revise_set' || action === 'translate_set') return wholeSet(staff, db, m, items, action, b);
  const cur = items.find(i => i.id === b?.itemId);
  if (!cur) return bad('That question isn’t in this set.', 404);

  if (action === 'edit') {
    const it = parseItem({ ...b.item, id: cur.id, bankId: null, source: 'teacher', chapterKey: cur.chapterKey, topic: b.item?.topic || cur.topic, competency: b.item?.competency || cur.competency, marks: b.item?.marks ?? cur.marks, qtype: b.item?.qtype || cur.qtype });
    if (!it) return bad('Fill in the question (and every option, with the right one marked).');
    return NextResponse.json({ item: { ...it, check: { status: 'passed', notes: ['Written by you.'] } } });
  }

  const curr = getCurriculum(m.class, m.subject);
  const chapter = curr ? courseChapters(curr).find(c => topicKey(c.name) === (m.chapter_key || topicKey(m.chapter_name))) : null;
  if (!chapter) return bad('This material’s chapter isn’t in the syllabus any more.', 409);
  const ctx: StudioCtx = { db, userId: staff.id, schoolId: staff.schoolId, cls: m.class, subject: m.subject, chapter, language: m.language || 'en' };
  const slot = { competency: cur.competency, marks: cur.marks as 1, qtype: cur.qtype };

  if (action === 'swap') {
    const [pool, history] = await Promise.all([loadPool(ctx, topicKey(chapter.name)), classHistory(ctx)]);
    const inSet = new Set(items.map(i => i.bankId || i.id));
    const band = bandOf(cur.difficulty);
    const options = pool.filter(p => fits(p, slot) && !inSet.has(p.id) && !history.usedBankIds.has(p.id) && p.check.status !== 'flagged');
    // Same band first (keeps versions fair), then any; the same topic first within that.
    const pick = [...options].sort((x, y) => (bandOf(x.difficulty) === band ? 0 : 1) - (bandOf(y.difficulty) === band ? 0 : 1) || (x.topic === cur.topic ? 0 : 1) - (y.topic === cur.topic ? 0 : 1))[0];
    if (!pick) return bad('The bank has no other question for this slot yet. Try “Write again”.', 404);
    const [out] = m.language && m.language !== 'en' ? await translateItems(ctx, [pick], m.language) : [pick];
    return NextResponse.json({ item: { ...out, id: cur.id } });
  }

  if (!['harder', 'easier', 'rewrite'].includes(action)) return bad('Unknown action.');
  const blocked = await aiGate(staff.id, 'teacherTools');
  if (blocked) return blocked;
  try {
    const how = action === 'harder' ? 'Make it noticeably harder (fewer students should get it right), same topic.'
      : action === 'easier' ? 'Make it noticeably easier (more students should get it right), same topic.'
        : 'Write a different question for the same topic.';
    const history = await classHistory(ctx);
    const gap = { slotIndex: 0, slot, topic: cur.topic || null, count: 1 };
    const [written] = await writeGapItems(ctx, [gap], new Map([[0, `${how} The current one: "${cur.text.slice(0, 400)}"`]]));
    if (!written) return bad('A new question couldn’t be written this time. Try again.', 502);
    const [checked] = await checkAndFix(ctx, [{ ...written, id: cur.id }], () => gap, [...history.past, { text: cur.text, where: 'the question it replaces' }]);
    const [out] = ctx.language !== 'en' ? await translateItems(ctx, [checked], ctx.language) : [checked];
    return NextResponse.json({ item: out });
  } catch (e: any) {
    console.error('[studio item]', e?.message);
    const kind = aiFailure(e);
    return bad(kind === 'busy' ? 'The AI is overloaded right now. Try again in a minute.' : kind === 'quota' ? 'The school’s AI allowance has run out.' : 'That didn’t work this time. Try again.', kind === 'quota' ? 429 : 502);
  }
}

/**
 * The "Change it" box, on the whole set:
 *   revise_set     { instruction }  every question rewritten to the teacher's instruction, same slots, checked again
 *   translate_set  { language }     the set in another language (the checks ran in English and still hold)
 * Returns the new items (same ids); the client saves them as a new version, so it can be undone.
 */
async function wholeSet(staff: any, db: any, m: any, items: StudioItem[], action: string, b: any) {
  const blocked = await aiGate(staff.id, 'teacherTools');
  if (blocked) return blocked;
  const curr = getCurriculum(m.class, m.subject);
  const chapter = curr ? courseChapters(curr).find(c => topicKey(c.name) === (m.chapter_key || topicKey(m.chapter_name))) : null;
  if (!chapter) return bad('This material’s chapter isn’t in the syllabus any more.', 409);
  if (!items.length) return bad('There are no questions to change.');
  const language = action === 'translate_set' ? (isLanguage(b?.language) ? b.language : null) : m.language || 'en';
  if (!language) return bad('Pick a language.');
  const ctx: StudioCtx = { db, userId: staff.id, schoolId: staff.schoolId, cls: m.class, subject: m.subject, chapter, language };
  try {
    if (action === 'translate_set') return NextResponse.json({ items: await translateItems(ctx, items.slice(0, 120), language), language });
    const instruction = String(b?.instruction || '').trim().slice(0, 400);
    if (instruction.length < 3) return bad('Say what to change.');
    const list = items.slice(0, 30);
    const gaps = list.map((it, i) => ({ slotIndex: i, slot: { competency: it.competency, marks: it.marks as 1, qtype: it.qtype }, topic: it.topic || null, count: 1 }));
    const written = await writeGapItems({ ...ctx, language: 'en' }, gaps, new Map(list.map((it, i) => [i, `The teacher asked: "${instruction}". Rewrite this question accordingly, same topic and size: "${it.text.slice(0, 400)}"`])));
    if (written.length !== list.length) return bad('The set couldn’t be rewritten in one go. Try a shorter instruction, or change questions one at a time.', 502);
    const history = await classHistory(ctx);
    const ided = written.map((w, i) => ({ ...w, id: list[i].id }));
    let checked = await checkAndFix({ ...ctx, language: 'en' }, ided, it => gaps[ided.findIndex(x => x.id === it.id)] ?? gaps[0], history.past);
    if (language !== 'en') checked = await translateItems(ctx, checked, language);
    return NextResponse.json({ items: [...checked, ...items.slice(30)] });
  } catch (e: any) {
    console.error('[studio set]', e?.message);
    const kind = aiFailure(e);
    return bad(kind === 'busy' ? 'The AI is overloaded right now. Try again in a minute.' : kind === 'quota' ? 'The school’s AI allowance has run out.' : 'That didn’t work this time. Try again.', kind === 'quota' ? 429 : 502);
  }
}
