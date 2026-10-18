import { buildPrediction, validateParams, type Params } from './types';
import { engineById } from './registry';

/**
 * A homework or quiz question set on a Live Lab simulation: a multiple-choice
 * question whose options, right answer and working all come from the engine.
 * The assignment stores the set-up (`lab`) alongside the built question, and
 * every save rebuilds the question from it, so a key sent from the browser is
 * never trusted.
 */
export interface LabRef { engine: string; params: Params; prediction: string }

export interface BuiltLabQuestion {
  lab: LabRef;
  prompt: string;
  options: string[];
  answer: number;
  why: string;
  chapter: string;
  topic: string;
}

/** The engine's question for this set-up, or null when the engine, a value or the question doesn't fit. */
export function buildLabQuestion(raw: unknown): BuiltLabQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const engine = engineById(r.engine);
  if (!engine) return null;
  const params = validateParams(engine, r.params);
  if (!params) return null;
  const t = engine.predictions.find(x => x.id === r.prediction);
  if (!t || (t.applies && !t.applies(params))) return null;
  const q = buildPrediction(engine, t, params);
  return {
    lab: { engine: engine.id, params, prediction: t.id },
    prompt: q.prompt, options: q.options, answer: q.correct, why: q.explain, chapter: q.chapter, topic: q.topic,
  };
}
