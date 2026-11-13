import 'server-only';
/**
 * After marking, on the server (plan ~/.claude/plans/copilot-studio-pr-b.md):
 *   loadMarked        a marked assignment as analysis input: every student's own questions, confirmed marks and picks
 *   misconceptions    the likely thinking behind a popular wrong answer or a badly missed written question, with a
 *                     five-minute reteach move (the school's tutor misconception bank first, then Haiku), cached
 *   scheduleRetention a retention check 17 days after the work was due (teacher can skip or move it)
 *   runRetention      hands out the retention checks that are due: 3-5 bank questions, marked instantly, no AI
 *   componentOf       'retention' for a retention check's marks, so TML counts them as such
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '@/lib/settings/limits';
import { generateAi } from '@/lib/ai/generate';
import { withRetry } from '@/lib/ai/retry';
import { pageAll, byIds } from '@/lib/ops/page';
import { normClass } from '@/lib/teacher/scope';
import { topicKey } from '@/lib/teacher/topicKey';
import { marksOf, sanitizeQuestions, totalMarks, type Question } from '@/lib/teacher/questions';
import { normalizeComponentType } from '@/lib/tml/engine';
import { courseChapters, getCurriculum } from '@/lib/curriculum';
import { addDays } from '@/lib/teacher/course';
import { fingerprint } from './fingerprint';
import { loadPool } from './server';
import { toQuestion } from './handout';
import { analyse, pickRetention, retentionDate, type AMark, type AQuestion, type Analysis, type QResult } from './analysis';

export const ASSIGNMENT_COLS = 'id, school_id, teacher_id, title, type, class, subject, questions, due_date, assigned_student_ids, units, status, submission_mode, created_at';

export interface Marked {
  assignment: any;
  questions: AQuestion[];
  marks: AMark[];
  students: { id: string; name: string }[];
  handedIn: number;
  /** Changes whenever a mark is confirmed or changed, so cached wording is rebuilt only then. */
  basis: string;
  analysis: Analysis;
}

const choiceOf = (q: Question) => q.type === 'mcq' && Array.isArray(q.options) && q.options.length >= 2;

export async function loadMarked(db: SupabaseClient, a: any): Promise<Marked> {
  const [{ data: users }, { data: variants }, { data: subs }, { data: rows }, { data: uses }] = await Promise.all([
    pageAll<any>((x, y) => db.from('users').select('id, name, student_class').eq('school_id', a.school_id).eq('role', 'student').order('id').range(x, y)),
    pageAll<any>((x, y) => db.from('assignment_variants').select('student_id, questions, access').eq('assignment_id', a.id).order('id').range(x, y)),
    pageAll<any>((x, y) => db.from('submissions').select('id, student_id, answers, updated_at').eq('assignment_id', a.id).order('id').range(x, y)),
    pageAll<any>((x, y) => db.from('submission_items').select('submission_id, student_id, question_index, score, max_score, created_at').eq('assignment_id', a.id).eq('teacher_confirmed', true).order('id').range(x, y)),
    pageAll<any>((x, y) => db.from('bank_item_uses').select('item_id, student_id, question_index').eq('assignment_id', a.id).order('id').range(x, y)),
  ]);
  const targeted = new Set((a.assigned_student_ids || []).map(String));
  const students = users.filter(u => (targeted.size ? targeted.has(u.id) : normClass(u.student_class) === normClass(a.class)))
    .map(u => ({ id: u.id, name: u.name || 'Student' })).sort((p, q) => p.name.localeCompare(q.name));
  const { data: bank } = uses.length
    ? await byIds<any>([...new Set(uses.map(u => u.item_id))], (chunk, x, y) => db.from('bank_items').select('id, topic, competency').in('id', chunk).order('id').range(x, y))
    : { data: [] as any[] };
  const bankBy = new Map(bank.map(b => [b.id, b]));
  const variantOf = new Map(variants.map(v => [v.student_id, v]));
  const subBy = new Map(subs.map(s => [s.id, s]));
  const base = sanitizeQuestions(a.questions).questions;

  const qmap = new Map<string, AQuestion>();
  const keyFor = (studentId: string, qi: number, q: Question, own: boolean) => {
    const use = uses.find(u => u.question_index === qi && (own ? u.student_id === studentId : !u.student_id));
    const key = use?.item_id ?? (own ? `t:${fingerprint(q.questionText, q.options ?? [])}` : `q${qi}`);
    if (!qmap.has(key)) {
      const b = use ? bankBy.get(use.item_id) : null;
      qmap.set(key, {
        key, text: q.questionText, marks: marksOf(q), topic: b?.topic || null, competency: b?.competency || null,
        options: choiceOf(q) ? q.options! : null, answer: choiceOf(q) && typeof q.answer === 'number' ? q.answer : null, bankId: use?.item_id ?? null,
      });
    }
    return key;
  };
  // Whole-class questions first, in paper order, so the table reads like the paper.
  base.forEach((q, i) => keyFor('', i, q, false));

  const bySub = new Map<string, any[]>();
  for (const r of rows) bySub.set(r.submission_id, [...(bySub.get(r.submission_id) ?? []), r]);
  const marks: AMark[] = [];
  for (const [subId, rs] of bySub) {
    const sub = subBy.get(subId);
    if (!sub) continue;
    const v = variantOf.get(sub.student_id);
    const qs = v ? sanitizeQuestions(v.questions).questions : base;
    // One overall mark for the whole paper (marked without per-question marks) says nothing about any one question.
    if (rs.length === 1 && qs.length > 1 && Number(rs[0].max_score) > marksOf(qs[rs[0].question_index] ?? null)) continue;
    // A student with figure-free questions answered different options: their picks aren't comparable.
    const picksComparable = !(v?.access || []).includes('no_figures');
    for (const r of rs) {
      const q = qs[r.question_index];
      if (!q) continue;
      const key = keyFor(sub.student_id, r.question_index, q, !!v);
      const raw = sub.answers?.[String(r.question_index)];
      const pick = picksComparable && choiceOf(q) && raw !== undefined && raw !== null && /^[0-5]$/.test(String(raw)) ? Number(raw) : null;
      marks.push({ studentId: sub.student_id, key, score: Number(r.score) || 0, max: Number(r.max_score) || 0, pick });
    }
  }
  const questions = [...qmap.values()];
  const latest = [...subs.map(s => s.updated_at || ''), ...rows.map(r => r.created_at || '')].sort().pop() || '';
  return {
    assignment: a, questions, marks, students, handedIn: subs.length,
    basis: `${rows.length}:${latest}`.slice(0, 200),
    analysis: analyse(questions, marks, students, subs.length),
  };
}

// ── Misconceptions ───────────────────────────────────────────────────────────
export interface Misconception { label: string; thinking: string; reteach: string; fromBank: boolean }

const ANALYST = `You help an Indian school teacher after marking. For each question the class struggled with, name the most likely
misconception behind the wrong answers and give one short reteach move.
- If one of the KNOWN MISCONCEPTIONS fits, use its label exactly and set "known": true.
- "label": at most 8 words, the wrong idea itself (e.g. "Current gets used up in a resistor").
- "thinking": one sentence in plain words: what a student who chose this is probably thinking.
- "reteach": one concrete move for the next class, under 5 minutes (a demonstration, a counter-example, a contrast question). No generic advice.
Return JSON: {"items":[{"n":1,"label":"","thinking":"","reteach":"","known":false}]}`;

/** Questions worth explaining: a popular wrong option, or a written question most of the class missed. */
export const needsExplaining = (r: QResult, q: AQuestion) => !!r.popularWrong || (!q.options && r.n >= 3 && (r.facility ?? 1) < 0.5);

export async function misconceptions(db: SupabaseClient, m: Marked, opts: { userId: string; chapter: string | null }): Promise<Record<string, Misconception>> {
  const a = m.assignment;
  const { data: cached } = await db.from('studio_analyses').select('basis, content').eq('assignment_id', a.id).maybeSingle();
  if (cached?.basis === m.basis && cached.content?.misconceptions) return cached.content.misconceptions;

  const qBy = new Map(m.questions.map(q => [q.key, q]));
  const targets = m.analysis.questions.filter(r => needsExplaining(r, qBy.get(r.key)!)).slice(0, 8);
  const out: Record<string, Misconception> = {};
  if (targets.length) {
    const chapterKey = opts.chapter ? topicKey(opts.chapter) : null;
    // bounded: one school's misconception labels for one chapter (a few dozen)
    const { data: known } = chapterKey
      ? await db.from('tutor_misconceptions').select('label, description').eq('school_id', a.school_id).eq('chapter_key', chapterKey).eq('status', 'active').limit(60)
      : { data: [] as any[] };
    const knownLabels = new Set((known || []).map(k => k.label.toLowerCase()));
    const list = targets.map((r, i) => {
      const q = qBy.get(r.key)!;
      const lines = [`${i + 1}. ${q.text}`];
      if (q.options) {
        lines.push(...q.options.map((o, k) => `   ${'ABCDEF'[k]}. ${o}${k === q.answer ? ' (correct)' : ''} [${r.picks?.[k] ?? 0} chose]`));
      } else {
        lines.push(`   ${q.marks} marks. Class average ${Math.round((r.facility ?? 0) * 100)}% of the marks; ${r.missed.length} of ${r.n} got under half.`);
      }
      return lines.join('\n');
    });
    try {
      const res = await withRetry(() => generateAi({
        model: AI_MODELS.fast,
        contents: [{ role: 'user', parts: [{ text: [
          `CLASS: ${a.class} · SUBJECT: ${a.subject}${opts.chapter ? ` · CHAPTER: ${opts.chapter}` : ''}`,
          `KNOWN MISCONCEPTIONS:\n${(known || []).map(k => `- ${k.label}${k.description ? `: ${k.description}` : ''}`).join('\n') || '- none yet'}`,
          `QUESTIONS:\n${list.join('\n\n')}`,
        ].join('\n\n') }] }],
        config: { systemInstruction: ANALYST, responseMimeType: 'application/json', temperature: 0.2 },
      }, { feature: 'studioAnalyse', userId: opts.userId, schoolId: a.school_id }), { tries: 2, baseMs: 1500 });
      const raw = JSON.parse((res.text || '{}').replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '').trim());
      const items = Array.isArray(raw?.items) ? raw.items : [];
      targets.forEach((r, i) => {
        const x = items.find((y: any) => Number(y?.n) === i + 1);
        const label = String(x?.label || '').trim().slice(0, 120);
        if (!label) return;
        out[r.key] = { label, thinking: String(x?.thinking || '').trim().slice(0, 300), reteach: String(x?.reteach || '').trim().slice(0, 400), fromBank: knownLabels.has(label.toLowerCase()) };
      });
    } catch (e: any) {
      // The numbers stand on their own; the wording is a help. Not cached, so the next open tries again.
      console.warn('[studio analysis] misconceptions failed:', e?.message);
      return {};
    }
  }
  await db.from('studio_analyses').upsert({ assignment_id: a.id, school_id: a.school_id, basis: m.basis, content: { misconceptions: out }, built_at: new Date().toISOString() });
  return out;
}

// ── Retention checks ──────────────────────────────────────────────────────────
export async function scheduleRetention(db: SupabaseClient, f: {
  schoolId: string; teacherId: string; assignmentId: string; materialId: string | null; cls: string; subject: string;
  chapterKey: string | null; chapterName: string | null; topics: string[]; studentIds: string[]; due: string;
}) {
  const { error } = await db.from('studio_followups').insert({
    school_id: f.schoolId, teacher_id: f.teacherId, source_assignment_id: f.assignmentId, material_id: f.materialId,
    class: f.cls, subject: f.subject, chapter_key: f.chapterKey, chapter_name: f.chapterName, topics: f.topics.slice(0, 30),
    student_ids: f.studentIds, due_on: retentionDate(f.due),
  });
  // A retention check is a help, never a reason to fail the assignment it follows.
  if (error) console.warn('[studio retention] schedule failed:', error.message);
}

/**
 * Hands out every retention check that's due (optionally one teacher's, or one check now). Nothing is written by AI:
 * the questions come from the bank, are choice questions marked the moment the student hands in, and are not ones
 * the class already had. When the bank can't supply three, the check is marked 'failed' and the teacher is asked.
 */
export async function runRetention(db: SupabaseClient, opts: { today: string; teacherId?: string; id?: string; limit?: number }): Promise<{ assigned: number; failed: number }> {
  let q = db.from('studio_followups').select('*').eq('status', 'scheduled');
  q = opts.id ? q.eq('id', opts.id) : q.lte('due_on', opts.today);
  if (opts.teacherId) q = q.eq('teacher_id', opts.teacherId);
  // bounded: due retention checks, at most `limit` per run
  const { data: due } = await q.order('due_on').limit(opts.limit ?? 40);
  let assigned = 0, failed = 0;
  for (const f of due || []) {
    try {
      const cur = f.chapter_name ? getCurriculum(f.class, f.subject) : null;
      const chapter = cur ? courseChapters(cur).find(c => topicKey(c.name) === topicKey(f.chapter_name)) : null;
      const chapterKey = f.chapter_key || (chapter ? topicKey(chapter.name) : null);
      const pool = chapterKey ? await loadPool({ db, schoolId: f.school_id, cls: f.class, subject: f.subject }, chapterKey) : [];
      // bounded: the questions one assignment used
      const { data: used } = f.source_assignment_id ? await db.from('bank_item_uses').select('item_id').eq('assignment_id', f.source_assignment_id).limit(500) : { data: [] as any[] };
      const picked = pickRetention(pool, f.topics || [], new Set((used || []).map(u => u.item_id)));
      if (!picked.length) {
        await db.from('studio_followups').update({ status: 'failed', note: 'The bank doesn’t have three quick questions on these topics yet.' }).eq('id', f.id).eq('status', 'scheduled');
        failed++; continue;
      }
      const { questions } = sanitizeQuestions(picked.map(toQuestion));
      const { data: a, error } = await db.from('assignments').insert({
        school_id: f.school_id, teacher_id: f.teacher_id, title: `Still remember? ${f.chapter_name || f.subject}`, type: 'quiz',
        class: f.class, subject: f.subject, due_date: addDays(opts.today, 3),
        description: 'A few quick questions on what you learnt a couple of weeks ago, to check it has stayed with you.',
        questions, total_marks: totalMarks(questions), units: [f.chapter_name || f.subject], submission_mode: 'typed', proctored: false, status: 'published',
        assigned_student_ids: f.student_ids || [],
      }).select('id').single();
      if (error) throw new Error(error.message);
      // Claim it; if another run already did, take this copy back.
      const { data: claimed } = await db.from('studio_followups').update({ status: 'assigned', assignment_id: a.id }).eq('id', f.id).eq('status', 'scheduled').select('id');
      if (!claimed?.length) { await db.from('assignments').delete().eq('id', a.id); continue; }
      await db.from('bank_item_uses').insert(picked.map((it, i) => ({ item_id: it.bankId || it.id, school_id: f.school_id, assignment_id: a.id, question_index: i, used_by: f.teacher_id })));
      assigned++;
    } catch (e: any) {
      console.error('[studio retention] run failed for', f.id, e?.message);
      await db.from('studio_followups').update({ status: 'failed', note: 'It couldn’t be handed out automatically.' }).eq('id', f.id).eq('status', 'scheduled');
      failed++;
    }
  }
  return { assigned, failed };
}

/** The evidence component for an assignment's marks: a retention check counts as retention, else as before. */
export async function componentOf(db: SupabaseClient, a: { id: string; type: string | null }): Promise<'retention' | 'quiz' | 'homework'> {
  const base = normalizeComponentType(a.type ?? undefined) === 'quiz' ? 'quiz' : 'homework';
  if (base !== 'quiz') return base;
  const { data } = await db.from('studio_followups').select('id').eq('assignment_id', a.id).maybeSingle();
  return data ? 'retention' : base;
}
