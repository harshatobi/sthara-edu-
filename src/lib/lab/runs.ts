import { scenePredictions, type AnswerMode, type LabScene } from './registry';

/**
 * A class's answers in one Live Lab lesson, as the presenter saw them.
 * Anonymous by design: hands are counted, not named, so a run is class-level
 * evidence only and never counts toward any one student's TML.
 *
 * The presenter sends only what the class did (the mode, the hand counts or
 * the class's answer); the question, its options and the right answer are
 * rebuilt here from the engine, so a stored run can't claim a key the
 * simulation doesn't give.
 */

/** No real class raises more hands than this for one option. */
export const MAX_HANDS = 200;

export interface RunAnswer { mode: AnswerMode; tally?: number[]; pick?: number | null }

export interface RunResult {
  id: string;
  prompt: string;
  options: string[];
  correct: number;
  chapter: string;
  topic: string;
  mode: AnswerMode;
  /** hands: the count per option. */
  tally: number[] | null;
  /** class: the option the class agreed on. */
  pick: number | null;
}

const MODES: AnswerMode[] = ['hands', 'class', 'think'];

/** The questions the class reached, rebuilt from the engine; anything not in the scene or malformed is dropped. */
export function buildRunResults(scene: LabScene, raw: unknown): RunResult[] {
  const answers = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return scenePredictions(scene).flatMap((q): RunResult[] => {
    const a = answers[q.id];
    if (!a || typeof a !== 'object') return [];
    const r = a as Record<string, unknown>;
    const mode = MODES.includes(r.mode as AnswerMode) ? r.mode as AnswerMode : null;
    if (!mode) return [];
    const base = { id: q.id, prompt: q.prompt, options: q.options, correct: q.correct, chapter: q.chapter, topic: q.topic, mode };
    if (mode === 'hands') {
      const t = Array.isArray(r.tally) ? r.tally : [];
      const tally = q.options.map((_, k) => {
        const n = Number(t[k]);
        return Number.isInteger(n) && n >= 0 ? Math.min(n, MAX_HANDS) : 0;
      });
      return [{ ...base, tally, pick: null }];
    }
    if (mode === 'class') {
      const n = Number(r.pick);
      return [{ ...base, tally: null, pick: r.pick !== null && r.pick !== undefined && Number.isInteger(n) && n >= 0 && n < q.options.length ? n : null }];
    }
    return [{ ...base, tally: null, pick: null }];
  });
}

/** Did the class answer at all (any hands counted, or a class answer tapped)? */
export const answered = (r: RunResult) =>
  r.mode === 'hands' ? (r.tally ?? []).some(n => n > 0) : r.mode === 'class' ? r.pick !== null : false;
