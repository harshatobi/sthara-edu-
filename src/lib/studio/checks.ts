/**
 * Judging one item against a separate solve. Pure (the solve itself is an AI call in server.ts).
 * Fails on: a different answer, a numerical key the working doesn't reproduce, anything outside the syllabus,
 * anything unclear, and a repeat of this class's past work.
 */
import { findRepeat } from './fingerprint';
import { checkNumeric, parseAnswerNumber } from './numeric';
import { isChoice, type StudioItem } from './types';

export interface CheckResult { n: number; choice: number | null; expression: string | null; inSyllabus: boolean; syllabusNote: string; clear: boolean; clarityNote: string }

/** Problems with one item, as plain notes (empty = it passed).  */
export function judge(it: StudioItem, r: CheckResult, past: { text: string; where: string }[]): { fails: string[]; computed: boolean } {
  const fails: string[] = [];
  let computed = false;
  const numericKey = it.qtype === 'numerical' ? it.value ?? null
    : isChoice(it.qtype) && typeof it.answer === 'number' ? parseAnswerNumber(it.options![it.answer]) : null;
  if (r.expression && numericKey !== null) {
    const c = checkNumeric({ expression: r.expression, key: numericKey, options: it.options, answer: it.answer });
    if (c.ok) computed = true; else fails.push(c.note);
  } else if (isChoice(it.qtype) && r.choice !== null && r.choice !== it.answer) {
    fails.push(`A separate solve picked option ${'ABCDEF'[r.choice] ?? r.choice + 1}, not the keyed ${'ABCDEF'[it.answer!]}.`);
  } else if (it.qtype === 'numerical' && numericKey === null) {
    fails.push('The answer has no number to check.');
  }
  if (!r.inSyllabus) fails.push(`Outside the CBSE syllabus for this chapter${r.syllabusNote ? `: ${r.syllabusNote}` : '.'}`);
  if (!r.clear) fails.push(`Not clear enough to answer${r.clarityNote ? `: ${r.clarityNote}` : '.'}`);
  const rep = findRepeat(it.text, past);
  if (rep) fails.push(`Repeats ${rep.where}.`);
  return { fails, computed };
}

