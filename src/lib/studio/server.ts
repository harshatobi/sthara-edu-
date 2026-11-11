import 'server-only';
/**
 * Copilot Studio on the server: the bank, the class's history, weak topics, AI writing for the gaps, and the
 * answer checks (plan ~/.claude/plans/copilot-studio-pr-a.md).
 *
 * Order of trust: a bank item with real results beats a checked new item, which beats an unchecked one. The AI
 * writes only what the bank can't supply, and nothing it writes reaches a student unchecked: a separate model solves
 * each question without the key, numericals are computed in code (numeric.ts), the syllabus exclusions are checked,
 * and repeats of this class's past work are caught. One rewrite on failure, then the item is flagged and blocks
 * handing the set out until the teacher fixes or removes it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '@/lib/settings/limits';
import { generateAi } from '@/lib/ai/generate';
import { withRetry } from '@/lib/ai/retry';
import type { CourseChapter } from '@/lib/curriculum';
import { topicKey } from '@/lib/teacher/topicKey';
import { normClass, normSubject } from '@/lib/teacher/scope';
import { pageAll, byIds } from '@/lib/ops/page';
import { sanitizeQuestions } from '@/lib/teacher/questions';
import { fingerprint } from './fingerprint';
import { judge, type CheckResult } from './checks';
import { parseItem } from './items';
import { readingLevel } from './handout';
import { languageOf } from './languages';
import type { Gap } from './pick';
import { COMPETENCY_LABEL, QTYPE_LABEL, isChoice, type StudioItem } from './types';
import type { TopicEvidence } from './weak';

export interface StudioCtx {
  db: SupabaseClient;
  userId: string;
  schoolId: string;
  cls: string;
  subject: string;
  chapter: CourseChapter;
  language: string;
  /** Aborts the AI calls when the request is cancelled or runs out of time. */
  signal?: AbortSignal;
}

// ── The bank ─────────────────────────────────────────────────────────────────
const BANK_COLS = 'id, scope, school_id, class, subject, chapter_key, topic, outcome_code, competency, qtype, marks, language, body, status, checks';

/** Bank items for a chapter: Sthara's (any status but retired) and this school's own, in English. */
export async function loadPool(ctx: Pick<StudioCtx, 'db' | 'schoolId' | 'cls' | 'subject'>, chapterKey: string): Promise<StudioItem[]> {
  const { data } = await pageAll<any>((a, b) => ctx.db.from('bank_items').select(BANK_COLS)
    .eq('chapter_key', chapterKey).eq('language', 'en').neq('status', 'retired')
    .or(`school_id.is.null,school_id.eq.${ctx.schoolId}`).order('id').range(a, b), 3000);
  const rows = data.filter(r => normClass(r.class) === normClass(ctx.cls) && normSubject(r.subject) === normSubject(ctx.subject));
  const stats = await itemStats(ctx.db, ctx.schoolId, rows.map(r => r.id));
  return rows.map(r => bankToItem(r, stats.get(r.id))).filter((x): x is StudioItem => !!x);
}

export function bankToItem(r: any, stats?: { attempts: number; correct: number }): StudioItem | null {
  const it = parseItem({ ...r.body, id: r.id, bankId: r.id, source: 'bank', qtype: r.qtype, competency: r.competency, marks: r.marks, chapterKey: r.chapter_key, topic: r.topic, outcomeCode: r.outcome_code, check: r.checks?.status ? r.checks : { status: 'passed', notes: [] } });
  if (!it) return null;
  if (stats && stats.attempts > 0) {
    it.stats = { attempts: stats.attempts, correct: stats.correct, schools: 1 };
    // Ten answers are enough to trust the measured difficulty over the writer's estimate.
    if (stats.attempts >= 10) it.difficulty = stats.correct / stats.attempts;
  }
  return it;
}

/**
 * How this school's students did on each item, from the marks teachers confirmed. A use with a student is that
 * student's own version; a use without one is the whole-class set (students who had their own version excluded).
 */
export async function itemStats(db: SupabaseClient, schoolId: string, itemIds: string[]): Promise<Map<string, { attempts: number; correct: number }>> {
  const out = new Map<string, { attempts: number; correct: number }>();
  if (!itemIds.length) return out;
  const { data: uses } = await byIds<any>(itemIds, (chunk, a, b) => db.from('bank_item_uses').select('item_id, assignment_id, student_id, question_index')
    .in('item_id', chunk).eq('school_id', schoolId).not('assignment_id', 'is', null).order('id').range(a, b));
  if (!uses.length) return out;
  const assignmentIds = [...new Set(uses.map(u => u.assignment_id))];
  const { data: marks } = await byIds<any>(assignmentIds, (chunk, a, b) => db.from('submission_items').select('assignment_id, student_id, question_index, score, max_score')
    .in('assignment_id', chunk).eq('teacher_confirmed', true).order('id').range(a, b));
  const own = new Set(uses.filter(u => u.student_id).map(u => `${u.assignment_id}|${u.student_id}`));
  for (const u of uses) {
    for (const m of marks) {
      if (m.assignment_id !== u.assignment_id || m.question_index !== u.question_index) continue;
      if (u.student_id ? m.student_id !== u.student_id : own.has(`${m.assignment_id}|${m.student_id}`)) continue;
      const s = out.get(u.item_id) ?? { attempts: 0, correct: 0 };
      s.attempts++;
      if (Number(m.max_score) > 0 && Number(m.score) >= Number(m.max_score)) s.correct++;
      out.set(u.item_id, s);
    }
  }
  return out;
}

/** This class's past questions in the subject (for repeat checks) and the bank items it has already had. */
export async function classHistory(ctx: Pick<StudioCtx, 'db' | 'schoolId' | 'cls' | 'subject'>): Promise<{ past: { text: string; where: string }[]; usedBankIds: Set<string> }> {
  const { data: work } = await pageAll<any>((a, b) => ctx.db.from('assignments').select('id, title, class, subject, questions')
    .eq('school_id', ctx.schoolId).neq('status', 'draft').order('id').range(a, b), 5000);
  const mine = work.filter(a => normClass(a.class) === normClass(ctx.cls) && normSubject(a.subject) === normSubject(ctx.subject));
  const past = mine.flatMap(a => sanitizeQuestions(a.questions).questions.map((q, i) => ({ text: q.questionText, where: `${a.title || 'an earlier assignment'}, question ${i + 1}` })));
  const { data: uses } = mine.length
    ? await byIds<any>(mine.map(a => a.id), (chunk, a, b) => ctx.db.from('bank_item_uses').select('item_id').in('assignment_id', chunk).order('id').range(a, b))
    : { data: [] as any[] };
  return { past, usedBankIds: new Set(uses.map(u => u.item_id)) };
}

/** Per-student topic evidence: Studio questions they answered (by topic) and tutor sessions on a micro-topic. */
export async function topicEvidence(db: SupabaseClient, schoolId: string, studentIds: string[], subject: string, chapterKey: string): Promise<TopicEvidence[]> {
  if (!studentIds.length) return [];
  const out: TopicEvidence[] = [];
  const { data: sessions } = await byIds<any>(studentIds, (chunk, a, b) => db.from('tutor_sessions').select('student_id, subject, chapter_key, micro_topic, topic, hint_depth, answer_revealed')
    .in('student_id', chunk).order('id').range(a, b));
  for (const s of sessions) {
    if (normSubject(s.subject) !== normSubject(subject)) continue;
    if (s.chapter_key && topicKey(s.chapter_key) !== topicKey(chapterKey) && s.chapter_key !== chapterKey) continue;
    const t = s.micro_topic || s.topic;
    if (t) out.push({ studentId: s.student_id, topic: t, kind: 'tutor', score: 0, max: 0, struggled: !!s.answer_revealed || Number(s.hint_depth) >= 3 });
  }
  const { data: marks } = await byIds<any>(studentIds, (chunk, a, b) => db.from('submission_items').select('assignment_id, student_id, question_index, score, max_score')
    .in('student_id', chunk).eq('school_id', schoolId).eq('teacher_confirmed', true).order('id').range(a, b));
  const asg = [...new Set(marks.map(m => m.assignment_id))];
  if (asg.length) {
    const { data: uses } = await byIds<any>(asg, (chunk, a, b) => db.from('bank_item_uses').select('item_id, assignment_id, student_id, question_index').in('assignment_id', chunk).order('id').range(a, b));
    const { data: items } = uses.length
      ? await byIds<any>([...new Set(uses.map(u => u.item_id))], (chunk, a, b) => db.from('bank_items').select('id, topic, chapter_key').in('id', chunk).order('id').range(a, b))
      : { data: [] as any[] };
    const topicOf = new Map(items.filter(i => i.chapter_key === chapterKey).map(i => [i.id, i.topic as string]));
    for (const m of marks) {
      const u = uses.find(x => x.assignment_id === m.assignment_id && x.question_index === m.question_index && (!x.student_id || x.student_id === m.student_id));
      const t = u && topicOf.get(u.item_id);
      if (t) out.push({ studentId: m.student_id, topic: t, kind: 'answer', score: Number(m.score) || 0, max: Number(m.max_score) || 1 });
    }
  }
  return out;
}

// ── AI ───────────────────────────────────────────────────────────────────────
/**
 * A Studio AI call. A model that's briefly busy (the provider's own "high demand" reply) is asked again twice,
 * with a short wait, before the teacher is told the AI is overloaded; a stopped request is never retried.
 */
const ai = (...args: Parameters<typeof generateAi>) =>
  withRetry(() => {
    if (args[0].config?.abortSignal?.aborted) throw new Error('aborted');
    return generateAi(...args);
  }, { tries: 3, baseMs: 1500 });

const jsonOf = (text: string) => JSON.parse((text || '{}').replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '').trim());

function chapterBrief(ctx: StudioCtx): string {
  const c = ctx.chapter;
  return [
    `CLASS: ${ctx.cls} · SUBJECT: ${ctx.subject} · CBSE 2026-27`,
    `CHAPTER: ${c.name}${c.number ? ` (NCERT chapter ${c.number})` : ''}`,
    `CONTENT POINTS:\n${c.topics.map(t => `- ${t}`).join('\n')}`,
    `LEARNING OUTCOMES:\n${(c.outcomes || []).map(o => `- ${o}`).join('\n') || '- none listed'}`,
    `EXCLUDED OR RESTRICTED BY CBSE (never ask these):\n${(c.notes || []).map(n => `- ${n}`).join('\n') || '- none listed'}`,
  ].join('\n\n');
}

const WRITER = `You write questions for Indian school students, for their teacher to check and hand out.
Rules:
- Stay strictly inside the chapter's content points and CBSE 2026-27 syllabus. Never ask anything listed as excluded.
- Match each requested slot exactly: competency, marks and question kind.
  Competencies (CBSE): remember_understand = recall and explain; apply = use in a new situation or calculate;
  analyse_evaluate = reason from evidence, compare, justify, case-based.
- mcq: exactly 4 options, one clearly correct, wrong options are real misconceptions, no "all of the above".
- assertion_reason: the standard CBSE four options (both true and R explains A / both true but R does not explain A / A true R false / A false R true).
- numerical: give "value" (a number) and "unit"; numbers that work out cleanly.
- short, long, case: "scheme" lists the value points with marks, adding up to the marks.
- Use Indian contexts and names where a context helps. Plain words; short sentences.
- If the question needs a figure, describe it fully in "figure": {"alt": "..."} so it can be answered from the words alone.
- "scheme" for choice questions: one sentence on why the answer is right.
Return JSON: {"items":[{"n":1,"qtype":"","competency":"","marks":1,"topic":"one content point it tests","text":"","options":[],"answer":0,"value":null,"unit":null,"scheme":"","figure":null,"difficulty":0.6}]}
"difficulty" = your estimate of the share of the class who will get it fully right (0 to 1).`;

/** The AI writes exactly the gaps: one item per gap slot, on the gap's topic when it has one. */
export async function writeGapItems(ctx: StudioCtx, gaps: Gap[], feedback: Map<number, string> = new Map()): Promise<StudioItem[]> {
  const want = gaps.flatMap(g => Array.from({ length: g.count }, () => g)).slice(0, 30);
  if (!want.length) return [];
  const slots = want.map((g, i) => `${i + 1}. ${COMPETENCY_LABEL[g.slot.competency]} (${g.slot.competency}), ${g.slot.marks} mark${g.slot.marks === 1 ? '' : 's'}, ${QTYPE_LABEL[g.slot.qtype]} (${g.slot.qtype})${g.topic ? `, on: ${g.topic}` : ''}${feedback.get(i) ? `\n   Previous attempt failed a check: ${feedback.get(i)} Write a different, correct question.` : ''}`);
  const res = await ai({
    model: AI_MODELS.standard,
    contents: [{ role: 'user', parts: [{ text: `${chapterBrief(ctx)}\n\nWRITE THESE ${want.length} QUESTIONS (in English):\n${slots.join('\n')}` }] }],
    config: { systemInstruction: WRITER, responseMimeType: 'application/json', temperature: 0.6, abortSignal: ctx.signal },
  }, { feature: 'studioWrite', userId: ctx.userId, schoolId: ctx.schoolId || null });
  const raw = Array.isArray(jsonOf(res.text)?.items) ? jsonOf(res.text).items : [];
  const out: StudioItem[] = [];
  want.forEach((g, i) => {
    const r = raw.find((x: any) => Number(x?.n) === i + 1) ?? raw[i];
    const it = r && parseItem({ ...r, source: 'ai', check: { status: 'unchecked', notes: [] } }, { qtype: g.slot.qtype, competency: g.slot.competency, marks: g.slot.marks, chapterKey: topicKey(ctx.chapter.name), topic: g.topic ?? '' });
    // The slot decides the shape, whatever the model wrote.
    if (it && it.competency === g.slot.competency && it.marks === g.slot.marks && isChoice(it.qtype) === isChoice(g.slot.qtype)) out.push({ ...it, topic: g.topic || it.topic || '' });
  });
  return out;
}

const CHECKER = `You check questions written for Indian school students. For each question, without being told the answer:
- Solve it yourself. For a choice question give "choice" (0-based index of the option you think is right).
- If the answer is a number, give "expression": the arithmetic that produces it, using only numbers, + - * / ^ ( ), sqrt, sin, cos, tan (degrees), log, ln, pi. No units, no variables. Otherwise null.
- "inSyllabus": false if it needs anything outside the chapter's content points or anything listed as excluded; say what in "syllabusNote".
- "clear": false if it is ambiguous, has two right answers, or can't be answered from what's given; say why in "clarityNote".
Return JSON: {"results":[{"n":1,"choice":null,"expression":null,"inSyllabus":true,"syllabusNote":"","clear":true,"clarityNote":""}]}`;


async function solveSeparately(ctx: StudioCtx, items: StudioItem[]): Promise<CheckResult[]> {
  const list = items.map((it, i) => [
    `${i + 1}. [${QTYPE_LABEL[it.qtype]}, ${it.marks} mark${it.marks === 1 ? '' : 's'}] ${it.text}`,
    it.figure?.alt ? `   Figure: ${it.figure.alt}` : '',
    it.options ? it.options.map((o, k) => `   ${k}. ${o}`).join('\n') : '',
  ].filter(Boolean).join('\n'));
  const res = await ai({
    model: AI_MODELS.standard,
    contents: [{ role: 'user', parts: [{ text: `${chapterBrief(ctx)}\n\nQUESTIONS:\n${list.join('\n\n')}` }] }],
    config: { systemInstruction: CHECKER, responseMimeType: 'application/json', temperature: 0, abortSignal: ctx.signal },
  }, { feature: 'studioCheck', userId: ctx.userId, schoolId: ctx.schoolId || null });
  const raw = Array.isArray(jsonOf(res.text)?.results) ? jsonOf(res.text).results : [];
  return items.map((_, i) => {
    const r = raw.find((x: any) => Number(x?.n) === i + 1) ?? {};
    return {
      n: i + 1, choice: Number.isInteger(r.choice) ? r.choice : null, expression: typeof r.expression === 'string' && r.expression.trim() ? r.expression : null,
      inSyllabus: r.inSyllabus !== false, syllabusNote: String(r.syllabusNote || '').slice(0, 300), clear: r.clear !== false, clarityNote: String(r.clarityNote || '').slice(0, 300),
    };
  });
}

/**
 * Checks new items (bank items already passed), rewrites failures once, re-checks, and flags what still fails.
 * Returns the items in the same slots, each with its check result.
 */
export async function checkAndFix(ctx: StudioCtx, items: StudioItem[], gapsFor: (it: StudioItem) => Gap, past: { text: string; where: string }[]): Promise<StudioItem[]> {
  const fresh = items.filter(i => i.source !== 'bank');
  if (!fresh.length) return items;
  const round = async (xs: StudioItem[]) => {
    const solved = await solveSeparately(ctx, xs);
    return xs.map((it, i) => ({ it, ...judge(it, solved[i], past) }));
  };
  const first = await round(fresh);
  const failed = first.filter(x => x.fails.length);
  const fixed = new Map<string, StudioItem>();
  for (const x of first) if (!x.fails.length) fixed.set(x.it.id, withCheck(x.it, 'passed', x.computed ? ['Answer worked out separately and matches.'] : ['Solved separately; the key matches.'], x.computed));
  if (failed.length) {
    const feedback = new Map(failed.map((x, i) => [i, x.fails.join(' ')]));
    const rewritten = await writeGapItems(ctx, failed.map(x => gapsFor(x.it)), feedback).catch(() => [] as StudioItem[]);
    const second = rewritten.length ? await round(rewritten) : [];
    failed.forEach((x, i) => {
      const r = second[i];
      if (r && !r.fails.length) fixed.set(x.it.id, { ...withCheck(r.it, 'rewritten', [`Rewritten once: ${x.fails[0]}`, r.computed ? 'Answer worked out separately and matches.' : 'Now passes the checks.'], r.computed), id: x.it.id });
      else fixed.set(x.it.id, withCheck(r?.it ? { ...r.it, id: x.it.id } : x.it, 'flagged', r?.fails.length ? r.fails : x.fails, false));
    });
  }
  return items.map(it => fixed.get(it.id) ?? it).map(it => {
    const rl = readingLevel(it.text, ctx.cls);
    return rl && it.check.status !== 'flagged' ? { ...it, check: { ...it.check, notes: [...it.check.notes, rl] } } : it;
  });
}

const withCheck = (it: StudioItem, status: StudioItem['check']['status'], notes: string[], computed: boolean): StudioItem =>
  ({ ...it, check: { status, notes: notes.slice(0, 6), ...(computed ? { computed: true } : {}) } });

const TRANSLATOR = (lang: string) => `Translate these school questions into ${lang} for students in Indian schools.
Keep every number, unit, formula, chemical symbol and option order exactly. Use the standard school terms of that language (as in state-board textbooks), with the English term in brackets after a technical word the first time it appears.
Return JSON: {"items":[{"n":1,"text":"","options":[],"scheme":"","figure":null}]} with "options" only for choice questions and "figure" as {"alt":""} only when the question has one.`;

/** Indian-language versions of checked items. The English item keeps the checks; the translation inherits them. */
export async function translateItems(ctx: StudioCtx, items: StudioItem[], language: string): Promise<StudioItem[]> {
  if (language === 'en' || !items.length) return items;
  const lang = languageOf(language);
  const list = items.map((it, i) => ({ n: i + 1, text: it.text, options: it.options, scheme: it.scheme, figure: it.figure?.alt ? { alt: it.figure.alt } : null }));
  const res = await ai({
    model: AI_MODELS.standard,
    contents: [{ role: 'user', parts: [{ text: JSON.stringify({ items: list }) }] }],
    config: { systemInstruction: TRANSLATOR(`${lang.name} (${lang.native})`), responseMimeType: 'application/json', temperature: 0.2, abortSignal: ctx.signal },
  }, { feature: 'studioTranslate', userId: ctx.userId, schoolId: ctx.schoolId || null });
  const raw = Array.isArray(jsonOf(res.text)?.items) ? jsonOf(res.text).items : [];
  return items.map((it, i) => {
    const r = raw.find((x: any) => Number(x?.n) === i + 1);
    if (!r?.text) return it;
    const options = isChoice(it.qtype) && Array.isArray(r.options) && r.options.length === it.options?.length ? r.options.map((o: unknown) => String(o).slice(0, 500)) : it.options;
    return { ...it, text: String(r.text).slice(0, 2000), options, scheme: r.scheme ? String(r.scheme).slice(0, 3000) : it.scheme, figure: it.figure && r.figure?.alt ? { ...it.figure, alt: String(r.figure.alt).slice(0, 600) } : it.figure };
  });
}

// ── Saving to the bank ───────────────────────────────────────────────────────
/**
 * New items enter the school bank once a teacher uses them (assigns or prints), as "unreviewed" until the
 * subject lead approves. Returns item id -> bank id. Items already in the bank keep their id.
 */
export async function saveToBank(ctx: Pick<StudioCtx, 'db' | 'schoolId' | 'userId' | 'cls' | 'subject'>, items: StudioItem[], language = 'en'): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const it of items) if (it.bankId) out.set(it.id, it.bankId);
  const fresh = items.filter(it => !it.bankId && it.check.status !== 'flagged');
  if (!fresh.length) return out;
  const rows = fresh.map(it => ({
    scope: 'school', school_id: ctx.schoolId, class: ctx.cls, subject: ctx.subject, chapter_key: it.chapterKey || 'general', topic: it.topic || null,
    outcome_code: it.outcomeCode ?? null, competency: it.competency, qtype: it.qtype, marks: it.marks, language,
    body: { text: it.text, options: it.options, answer: it.answer, value: it.value, unit: it.unit, scheme: it.scheme, figure: it.figure, difficulty: it.difficulty },
    status: 'unreviewed', source: it.source === 'teacher' ? 'teacher' : 'ai', checks: it.check,
    fingerprint: fingerprint(it.text, it.options ?? []), created_by: ctx.userId,
  }));
  // Already in this school's bank (the same question made before)? Reuse it; insert only the new ones.
  const { data: have } = await ctx.db.from('bank_items').select('id, fingerprint').eq('school_id', ctx.schoolId).eq('language', language).in('fingerprint', rows.map(r => r.fingerprint));
  const byFp = new Map((have || []).map(r => [r.fingerprint as string, r.id as string]));
  const missing = rows.filter(r => !byFp.has(r.fingerprint)).filter((r, i, xs) => xs.findIndex(x => x.fingerprint === r.fingerprint) === i);
  if (missing.length) {
    const { data: added, error } = await ctx.db.from('bank_items').insert(missing).select('id, fingerprint');
    if (error) console.error('[studio bank] insert failed:', error.message);
    for (const r of added || []) byFp.set(r.fingerprint, r.id);
  }
  fresh.forEach((it, i) => { const id = byFp.get(rows[i].fingerprint); if (id) out.set(it.id, id); });
  return out;
}
