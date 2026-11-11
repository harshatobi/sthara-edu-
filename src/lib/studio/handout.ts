/**
 * From Studio items to what students get. Pure.
 *   toQuestion      a StudioItem as an assignment Question (the shape every marking path already understands)
 *   forStudent      a student's questions with their access needs applied
 *   readingLevel    a quick check that wording suits the class
 */
import type { Question } from '@/lib/teacher/questions';
import { isChoice, type AccessNeed, type StudioItem } from './types';

export function toQuestion(it: StudioItem): Question {
  const figureText = it.figure?.alt ? `\n\nFigure: ${it.figure.alt}` : '';
  // Bank pictures go with the question; the answer's pictures (schemeFigures) never reach students.
  const figs = it.figures?.length ? { figures: it.figures } : {};
  if (isChoice(it.qtype) && it.options?.length && typeof it.answer === 'number') {
    return { type: 'mcq', questionText: it.text, options: it.options, answer: it.answer, marks: 1, ...(it.scheme ? { why: it.scheme } : {}), level: levelOf(it), ...figs };
  }
  // Written answers carry their value points as `why`, which the marking prompt and the teacher's review read.
  return { type: 'short', questionText: `${it.text}${it.figure && !it.figure.svg ? figureText : ''}`, marks: it.marks, ...(it.scheme ? { why: it.scheme } : {}), level: levelOf(it), ...figs };
}

/**
 * The question for a student who needs text instead of figures: CBSE's own text-only version when the paper
 * printed one (same marks, its own key), else the question with its pictures described.
 */
export function withoutFigures(it: StudioItem): StudioItem {
  const tv = it.textVersion;
  if (!tv || !(it.figures?.length || it.figure)) return it;
  const choice = isChoice(it.qtype);
  if (choice && !(tv.options?.length && typeof tv.answer === 'number')) return it;
  return { ...it, text: tv.text, figures: undefined, figure: null, ...(choice ? { options: tv.options, answer: tv.answer as number } : {}), scheme: tv.scheme || it.scheme };
}

const levelOf = (it: StudioItem): Question['level'] =>
  it.difficulty === null || it.difficulty === undefined ? 'MEDIUM' : it.difficulty >= 0.7 ? 'EASY' : it.difficulty >= 0.4 ? 'MEDIUM' : 'HARD';

/**
 * A student's version with their needs applied. Large print and read aloud are how the workspace shows it (kept on
 * the variant as `access`); "no figures" is applied to the text here, so it holds on paper too.
 */
export function forStudent(items: StudioItem[], needs: AccessNeed[]): { questions: Question[]; access: AccessNeed[] } {
  const noFigures = needs.includes('no_figures');
  const questions = items.map(raw => {
    const it = noFigures ? withoutFigures(raw) : raw;
    const q = toQuestion(it);
    if (noFigures && it.figure?.alt && !q.questionText.includes(it.figure.alt)) q.questionText = `${q.questionText}\n\nFigure described: ${it.figure.alt}`;
    return q;
  });
  return { questions, access: needs };
}

/** Words per sentence a class can comfortably read in a question (CBSE papers sit well inside these). */
export function readingLimit(cls: string): number {
  const n = Number(String(cls).match(/\d+/)?.[0] ?? 10);
  return n <= 5 ? 14 : n <= 8 ? 20 : n <= 10 ? 26 : 32;
}

/** Null when the wording suits the class; otherwise a plain note. Only for English (other scripts aren't measured). */
export function readingLevel(text: string, cls: string, language = 'en'): string | null {
  if (language !== 'en') return null;
  const sentences = text.split(/[.?!]+\s|\n+/).map(s => s.trim()).filter(s => s.split(/\s+/).length > 2);
  if (!sentences.length) return null;
  const longest = Math.max(...sentences.map(s => s.split(/\s+/).length));
  const limit = readingLimit(cls);
  return longest > limit ? `One sentence is ${longest} words long; for ${cls} keep sentences under ${limit}.` : null;
}

export const LETTERS = 'ABCDEF';

/**
 * Access needs the office may pre-fill from a student's health record (impairments, as UDISE records them). Only
 * suggestions: a person confirms them, and teachers only ever see the resulting needs, never the impairment.
 */
export function suggestedNeeds(impairments: string[]): AccessNeed[] {
  const out = new Set<AccessNeed>();
  for (const i of impairments) {
    if (i === 'low_vision') { out.add('large_print'); out.add('read_aloud'); }
    if (i === 'blindness') { out.add('read_aloud'); out.add('no_figures'); out.add('extra_time'); }
    if (i === 'specific_learning') { out.add('read_aloud'); out.add('extra_time'); out.add('simplified_language'); }
    if (i === 'intellectual' || i === 'autism') { out.add('simplified_language'); out.add('extra_time'); }
    if (i === 'locomotor' || i === 'cerebral_palsy' || i === 'multiple') out.add('extra_time');
  }
  return [...out];
}
