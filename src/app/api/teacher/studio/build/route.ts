import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { inScope, normClass } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';
import { aiConfigured } from '@/lib/ai/generate';
import { aiFailure } from '@/lib/ai/retry';
import { courseChapters, getCurriculum } from '@/lib/curriculum';
import { topicKey } from '@/lib/teacher/topicKey';
import { pageAll } from '@/lib/ops/page';
import { defaultBlueprint, isNumericSubject, parseBlueprint, slotsOf } from '@/lib/studio/blueprint';
import { abcSets, assembleClass, bandMid, perStudent, reasonFor, type Band, type Gap } from '@/lib/studio/pick';
import { checkAndFix, classHistory, loadPool, topicEvidence, translateItems, writeGapItems, type StudioCtx } from '@/lib/studio/server';
import { rankWeakTopics } from '@/lib/studio/weak';
import { accessNeeds, createMaterial } from '@/lib/studio/materials';
import { isLanguage } from '@/lib/studio/languages';
import { parseNeeds } from '@/lib/studio/items';
import { SET_KIND_LABEL, type Audience, type QuestionSetContent, type SetKind, type StudioItem } from '@/lib/studio/types';

export const dynamic = 'force-dynamic';
// Writing the gaps, a separate solve of every new question, one rewrite and a translation can take a while.
export const maxDuration = 300;

const str = (v: unknown, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const SET_KINDS: SetKind[] = ['worksheet', 'quiz', 'catchup', 'exit_ticket', 'test'];
const AUDIENCES: Audience[] = ['class', 'per_student', 'abc'];

/**
 * POST /api/teacher/studio/build
 * { class, subject, chapter, topics[], setKind, blueprint, audience, students[] (per_student), language, handout, title?, basis? }
 * Builds a question set from the bank first, has the AI write only the gaps, checks every new question, and saves
 * it as a draft in the teacher's library. Nothing reaches students until the teacher assigns or prints it.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`studioBuild:${staff.id}`, ...limitOf('studioBuild')).allowed) {
    return NextResponse.json({ error: 'That’s a lot of building in a short time. Try again in a few minutes.' }, { status: 429 });
  }
  const b = await req.json().catch(() => null);
  const cls = str(b?.class, 40), subject = str(b?.subject, 80);
  if (!cls || !subject) return NextResponse.json({ error: 'Pick a class and subject.' }, { status: 400 });
  if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject)) return NextResponse.json({ error: `You don't teach ${subject} to ${cls}.` }, { status: 403 });
  const cur = getCurriculum(cls, subject);
  const chapter = cur ? courseChapters(cur).find(c => topicKey(c.name) === topicKey(str(b?.chapter, 200))) : null;
  if (!chapter) return NextResponse.json({ error: 'Pick a chapter from the syllabus.' }, { status: 400 });
  const setKind: SetKind = SET_KINDS.includes(b?.setKind) ? b.setKind : 'worksheet';
  const audience: Audience = AUDIENCES.includes(b?.audience) ? b.audience : 'class';
  const blueprint = parseBlueprint(b?.blueprint) ?? defaultBlueprint(setKind);
  const language = isLanguage(b?.language) ? b.language : 'en';
  const topics = (Array.isArray(b?.topics) ? b.topics : []).map((t: unknown) => str(t, 300)).filter((t: string) => chapter.topics.includes(t)).slice(0, 8);
  const chosen = topics.length ? topics : chapter.topics;

  const blocked = await aiGate(staff.id, 'teacherTools');
  if (blocked) return blocked;
  if (!aiConfigured()) return NextResponse.json({ error: 'The Studio isn’t configured on this server (no AI key).' }, { status: 503 });

  // Students: the class roster; for per-student versions, the ones the teacher picked from it.
  const { data: users } = await pageAll<any>((a, z) => db.from('users').select('id, name, student_class').eq('school_id', staff.schoolId).eq('role', 'student').order('id').range(a, z));
  const roster = users.filter(u => normClass(u.student_class) === normClass(cls));
  const wanted = new Set((Array.isArray(b?.students) ? b.students : []).filter((x: unknown) => typeof x === 'string'));
  const students = audience === 'per_student' ? roster.filter(u => wanted.has(u.id)) : [];
  if (audience === 'per_student' && !students.length) return NextResponse.json({ error: 'Choose the students to make versions for.' }, { status: 400 });
  if (students.length > 60) return NextResponse.json({ error: 'At most 60 students at a time.' }, { status: 400 });

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 270_000);
  const ctx: StudioCtx = { db, userId: staff.id, schoolId: staff.schoolId, cls, subject, chapter, language, signal: abort.signal };
  try {
    const chapterKey = topicKey(chapter.name);
    const [pool0, history] = await Promise.all([loadPool(ctx, chapterKey), classHistory(ctx)]);
    const slots = slotsOf(blueprint, { numeric: isNumericSubject(subject), quiz: setKind === 'quiz' });
    const exclude = history.usedBankIds;
    const seed = Math.floor(Math.random() * 1e9);
    let pool = pool0;

    // Pick from the bank, have the AI write exactly the gaps, then pick again with the new items in the pool.
    let weak = new Map<string, string[]>();
    if (audience === 'per_student') weak = rankWeakTopics(await topicEvidence(db, staff.schoolId, students.map(s => s.id), subject, chapterKey), chosen, students.map(s => s.id));
    const needs = students.map(s => ({ studentId: s.id, weakTopics: weak.get(s.id) ?? chosen }));
    const first = audience === 'per_student' ? perStudent(slots, pool, needs, { exclude, seed, topics: chosen })
      : audience === 'abc' ? abcSets(slots, pool, 3, { exclude, seed, topics: chosen })
        : { ...assembleClass(slots, pool, { exclude, seed, topics: chosen }), bands: undefined as Band[] | undefined };
    const bands = first.bands;
    const gapOf = new Map<string, Gap>();
    if (first.gaps.length) {
      const written = await writeGapItems(ctx, first.gaps);
      // A new item for a fixed-band slot sits in that band until students answer it, so every version stays equal.
      let k = 0;
      for (const g of first.gaps) for (let c = 0; c < g.count && k < written.length; c++, k++) {
        const it = written[k];
        if (bands) it.difficulty = bandMid(bands[g.slotIndex]);
        gapOf.set(it.id, g);
      }
      pool = [...pool, ...written];
    }
    const again = audience === 'per_student' ? perStudent(slots, pool, needs, { exclude, seed, topics: chosen, bands })
      : audience === 'abc' ? abcSets(slots, pool, 3, { exclude, seed, topics: chosen, bands })
        : assembleClass(slots, pool, { exclude, seed, topics: chosen });

    // Every question used, once; new ones checked (and rewritten once) before the teacher sees them.
    const lists: (StudioItem | null)[][] = 'versions' in again ? again.versions.map(v => v.picked) : 'sets' in again ? again.sets : [again.picked];
    const used = new Map<string, StudioItem>();
    for (const l of lists) for (const it of l) if (it) used.set(it.id, it);
    const fallbackGap = (it: StudioItem): Gap => gapOf.get(it.id) ?? { slotIndex: 0, slot: { competency: it.competency, marks: it.marks as 1, qtype: it.qtype }, topic: it.topic || null, count: 1 };
    let checked = await checkAndFix(ctx, [...used.values()], fallbackGap, history.past);
    if (language !== 'en') checked = await translateItems(ctx, checked, language);
    const byId = new Map(checked.map(i => [i.id, i]));
    const ids = (l: (StudioItem | null)[]) => l.filter((x): x is StudioItem => !!x && byId.has(x.id)).map(x => x.id);
    const unfilled = lists.reduce((n, l) => Math.max(n, l.filter(x => !x).length), 0);

    const needsOf = await accessNeeds(db, staff.schoolId, students.map(s => s.id));
    const content: QuestionSetContent = {
      type: 'questions', setKind, topics: chosen, blueprint, audience, items: checked,
      order: 'picked' in again ? ids(again.picked) : [],
      versions: 'versions' in again ? again.versions.map(v => {
        const mine = ids(v.picked);
        const focus = [...new Set(mine.map(id => byId.get(id)!.topic).filter(t => (weak.get(v.studentId) ?? []).slice(0, 2).includes(t)))];
        return { studentId: v.studentId, itemIds: mine, reason: reasonFor(focus), access: parseNeeds(needsOf.get(v.studentId)) };
      }) : [],
      sets: 'sets' in again ? again.sets.map((l, i) => ({ label: 'ABC'[i], itemIds: ids(l) })) : [],
      handout: b?.handout === 'paper' || b?.handout === 'both' ? b.handout : 'online',
      basis: str(b?.basis, 600),
    };
    const material = await createMaterial(db, staff, {
      class: cls, subject, chapter_key: chapterKey, chapter_name: chapter.name,
      kind: setKind === 'catchup' ? 'catchup' : setKind, language,
      title: str(b?.title, 200) || `${SET_KIND_LABEL[setKind]}: ${topics.length === 1 ? topics[0] : chapter.name}`, content,
    });
    const fromBank = checked.filter(i => i.source === 'bank').length;
    return NextResponse.json({ material, summary: { fromBank, written: checked.length - fromBank, flagged: checked.filter(i => i.check.status === 'flagged').length, unfilled } });
  } catch (e: any) {
    console.error('[studio build]', e?.message);
    const kind = aiFailure(e);
    return NextResponse.json({
      error: abort.signal.aborted ? 'That took too long. Try fewer questions, or build it again.'
        : kind === 'busy' ? 'The AI is overloaded right now. Try again in a few minutes.'
          : kind === 'quota' ? 'The school’s AI allowance has run out. Your Sthara administrator can check the AI plan.'
            : 'The set couldn’t be built this time. Try again.',
    }, { status: kind === 'quota' ? 429 : kind === 'busy' ? 503 : 502 });
  } finally {
    clearTimeout(timer);
  }
}
