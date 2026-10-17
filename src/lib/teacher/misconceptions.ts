/**
 * Where a class's understanding breaks, from what students actually did.
 * Pure: the Copilot route loads the rows; this finds the patterns.
 *
 *   wrong options   an MCQ where several students chose the same wrong answer,
 *                   the classic sign of a shared misconception
 *   weak questions  photographed written work where many lost marks on the
 *                   same question, with the grader's "to fix" notes
 *   stuck topics    tutor sessions that needed the answer revealed, or the
 *                   deepest hints, per chapter
 *
 * Counts and students always come from the data. The Copilot may only
 * suggest *what* the misconception probably is.
 */

import { normClass, normSubject } from './scope';
import { mcqCorrect } from './questions';

/** An option index stored as a number or a numeric string; anything else is null. */
const optionIndex = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
};

export interface McqAssignment { id: string; title: string; class: string; subject: string; units: string[] | null; questions: unknown }
export interface Submission { assignment_id: string; student_id: string; answers: unknown; ai_result: unknown }
export interface TutorSession { student_id: string; subject: string | null; topic: string | null; micro_topic: string | null; hint_depth: number | null; answer_revealed: boolean | null }

export interface WrongOption {
  assignment: string; chapter: string | null; q: number; question: string; correct: string; chosen: string;
  students: string[]; answered: number;
}
export interface WeakQuestion { assignment: string; chapter: string | null; q: number; avgPct: number; students: string[]; graded: number; notes: string[] }
export interface StuckTopic { topic: string; revealed: number; deepHints: number; students: string[] }
export interface Misconceptions { wrongOptions: WrongOption[]; weakQuestions: WeakQuestion[]; stuckTopics: StuckTopic[] }

/** A wrong answer counts as shared when at least this many students, and this share of those who answered, chose it. */
export const MIN_STUDENTS = 2;
export const MIN_SHARE = 0.2;
const DEEP_HINT = 3;

const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const short = (s: unknown, n = 220) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');

export function findMisconceptions(input: {
  cls: string; subject: string; roster: Set<string>;
  assignments: McqAssignment[]; submissions: Submission[]; tutor: TutorSession[];
}): Misconceptions {
  const { roster } = input;
  const mine = input.assignments.filter(a => normClass(a.class) === normClass(input.cls) && normSubject(a.subject) === normSubject(input.subject));
  const byAssignment = new Map<string, Submission[]>();
  for (const s of input.submissions) {
    if (!roster.has(s.student_id)) continue;
    const list = byAssignment.get(s.assignment_id) ?? [];
    list.push(s);
    byAssignment.set(s.assignment_id, list);
  }

  const wrongOptions: WrongOption[] = [];
  const weakQuestions: WeakQuestion[] = [];
  for (const a of mine) {
    const subs = byAssignment.get(a.id) ?? [];
    const chapter = Array.isArray(a.units) && a.units[0] ? a.units[0] : null;
    const qs = asArray(a.questions);

    // MCQs: tally the option each student picked.
    qs.forEach((q, i) => {
      const key = optionIndex(q?.answer);
      if (q?.type !== 'mcq' || !Array.isArray(q.options) || key === null) return;
      const picks = new Map<number, string[]>();
      let answered = 0;
      for (const s of subs) {
        const raw = s.answers && typeof s.answers === 'object' ? (s.answers as Record<string, unknown>)[String(i)] : undefined;
        // Answers may be stored as 2 or "2"; grading (mcqCorrect) accepts both, so this does too.
        const ans = optionIndex(raw);
        if (ans === null || ans >= q.options.length) continue;
        answered++;
        if (mcqCorrect(q, raw)) continue;
        picks.set(ans, [...(picks.get(ans) ?? []), s.student_id]);
      }
      for (const [opt, students] of picks) {
        if (students.length >= MIN_STUDENTS && students.length / answered >= MIN_SHARE) {
          wrongOptions.push({
            assignment: a.title, chapter, q: i + 1, question: short(q.questionText), correct: short(q.options[key], 120),
            chosen: short(q.options[opt], 120), students, answered,
          });
        }
      }
    });

    // Written work graded from photographs: questions most students lost marks on.
    const perQ = new Map<number, { pct: number[]; low: string[]; notes: string[] }>();
    for (const s of subs) {
      const r = s.ai_result && typeof s.ai_result === 'object' ? (s.ai_result as any) : null;
      for (const g of asArray(r?.questions)) {
        const max = Number(g?.max), got = Number(g?.awarded), idx = Number(g?.index);
        if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(got) || !Number.isInteger(idx)) continue;
        const e = perQ.get(idx) ?? { pct: [], low: [], notes: [] };
        e.pct.push(got / max);
        if (got / max < 0.5) {
          e.low.push(s.student_id);
          const note = short(g?.toFix, 160);
          if (note && e.notes.length < 3 && !/no improvements needed/i.test(note)) e.notes.push(note);
        }
        perQ.set(idx, e);
      }
    }
    for (const [idx, e] of perQ) {
      const avg = e.pct.reduce((x, y) => x + y, 0) / e.pct.length;
      if (e.low.length >= MIN_STUDENTS && e.low.length / e.pct.length >= MIN_SHARE) {
        weakQuestions.push({ assignment: a.title, chapter, q: idx + 1, avgPct: Math.round(avg * 100), students: e.low, graded: e.pct.length, notes: e.notes });
      }
    }
  }

  // Tutor: chapters where students needed the answer shown or the deepest hints.
  const topics = new Map<string, { revealed: number; deep: number; students: Set<string> }>();
  for (const t of input.tutor) {
    if (!roster.has(t.student_id) || normSubject(t.subject) !== normSubject(input.subject)) continue;
    const topic = short(t.micro_topic || t.topic, 160);
    if (!topic) continue;
    const struggled = !!t.answer_revealed || (t.hint_depth ?? 0) >= DEEP_HINT;
    if (!struggled) continue;
    const e = topics.get(topic) ?? { revealed: 0, deep: 0, students: new Set<string>() };
    if (t.answer_revealed) e.revealed++;
    if ((t.hint_depth ?? 0) >= DEEP_HINT) e.deep++;
    e.students.add(t.student_id);
    topics.set(topic, e);
  }
  const stuckTopics = [...topics.entries()]
    .filter(([, e]) => e.students.size >= MIN_STUDENTS)
    .map(([topic, e]) => ({ topic, revealed: e.revealed, deepHints: e.deep, students: [...e.students] }));

  return {
    wrongOptions: wrongOptions.sort((x, y) => y.students.length - x.students.length).slice(0, 8),
    weakQuestions: weakQuestions.sort((x, y) => y.students.length - x.students.length).slice(0, 6),
    stuckTopics: stuckTopics.sort((x, y) => y.students.length - x.students.length).slice(0, 6),
  };
}

/** The Copilot brief's section: students as tokens only. Empty string when nothing stands out. */
export function misconceptionBrief(m: Misconceptions, token: (studentId: string) => string): string {
  const who = (ids: string[]) => ids.slice(0, 12).map(id => `[[${token(id)}]]`).join(' ') + (ids.length > 12 ? ` and ${ids.length - 12} more` : '');
  const lines: string[] = [];
  for (const w of m.wrongOptions) {
    lines.push(`- MCQ "${w.question}" (${w.assignment}, Q${w.q}${w.chapter ? `, ${w.chapter}` : ''}): right answer "${w.correct}"; ${w.students.length} of ${w.answered} chose "${w.chosen}": ${who(w.students)}`);
  }
  for (const w of m.weakQuestions) {
    lines.push(`- Written Q${w.q} of ${w.assignment}${w.chapter ? ` (${w.chapter})` : ''}: class average ${w.avgPct}%, ${w.students.length} of ${w.graded} below half marks: ${who(w.students)}${w.notes.length ? `. Grader notes: ${w.notes.map(n => `"${n}"`).join('; ')}` : ''}`);
  }
  for (const t of m.stuckTopics) {
    lines.push(`- Tutor: ${t.topic}: ${t.students.length} students struggled (answer revealed ${t.revealed}×, deepest hints ${t.deepHints}×): ${who(t.students)}`);
  }
  return lines.length ? `MISCONCEPTION EVIDENCE (from answers students actually gave; counts are exact):\n${lines.join('\n')}` : '';
}
