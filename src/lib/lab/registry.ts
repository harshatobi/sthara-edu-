import { topicKey } from '@/lib/teacher/desk';
import { validateParams, type LabEngine, type Params, type Prediction } from './types';
import { optics } from './engines/optics';
import { circuits } from './engines/circuits';
import { acidBase } from './engines/acidBase';
import { motion } from './engines/motion';
import { forces } from './engines/forces';
import { energy } from './engines/energy';
import { sound } from './engines/sound';
import { eyePrism } from './engines/eyePrism';
import { magnetism } from './engines/magnetism';
import { reactions } from './engines/reactions';

// Class 9 first, then Class 10, in textbook chapter order.
export const ENGINES: LabEngine<any>[] = [motion, forces, energy, sound, reactions, optics, eyePrism, circuits, magnetism, acidBase];

export const engineById = (id: unknown): LabEngine<any> | null =>
  (typeof id === 'string' && ENGINES.find(e => e.id === id)) || null;

/** Engines that teach a chapter (by official chapter name). */
export const enginesForChapter = (chapter: string) =>
  ENGINES.filter(e => e.chapters.some(c => topicKey(c) === topicKey(chapter)));

/**
 * How the class answers a prediction, set by the teacher: most classrooms have no student devices.
 * hands = the teacher counts hands per option; class = the teacher taps the one answer the class
 * agreed on; think = no answering, the class predicts silently and the teacher reveals.
 */
export type AnswerMode = 'hands' | 'class' | 'think';
export const ANSWER_MODES: { value: AnswerMode; label: string; note: string }[] = [
  { value: 'hands', label: 'Count hands', note: 'You count the hands for each option.' },
  { value: 'class', label: 'Class answer', note: 'You tap the answer the class agrees on.' },
  { value: 'think', label: 'Think, then reveal', note: 'No answering: they predict silently.' },
];

/** A saved or Copilot-made setup: an engine, its values, and the questions to put to the class. */
export interface LabScene {
  engine: string;
  params: Params;
  title: string;
  /** Prediction template ids, optionally re-worded. The engine always supplies the options and answer. */
  predictions: { id: string; prompt?: string }[];
  narration?: string;
  answer: AnswerMode;
}

/**
 * Checks a scene from the Copilot, a saved row or a URL: unknown engine or any
 * value outside range rejects the whole scene; unknown or inapplicable
 * question ids are dropped. Returns null rather than a half-right setup.
 */
export function validateScene(raw: unknown): LabScene | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const engine = engineById(r.engine);
  if (!engine) return null;
  const params = validateParams(engine, r.params);
  if (!params) return null;
  const preds = (Array.isArray(r.predictions) ? r.predictions : [])
    .map(x => (typeof x === 'string' ? { id: x } : x && typeof x === 'object' ? x as Record<string, unknown> : null))
    .filter((x): x is Record<string, unknown> => !!x)
    .map(x => ({ id: String(x.id ?? ''), prompt: typeof x.prompt === 'string' ? x.prompt.trim().slice(0, 300) || undefined : undefined }))
    .filter((x, i, a) => {
      const t = engine.predictions.find(t => t.id === x.id);
      return !!t && (!t.applies || t.applies(params)) && a.findIndex(y => y.id === x.id) === i;
    })
    .slice(0, 6);
  const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 140) : engine.title;
  const narration = typeof r.narration === 'string' ? r.narration.trim().slice(0, 2000) || undefined : undefined;
  const answer = ANSWER_MODES.some(m => m.value === r.answer) ? r.answer as AnswerMode : 'hands';
  return { engine: engine.id, params, title, predictions: preds, narration, answer };
}

/** Questions for a scene: the ones it names, or every question that fits when it names none. */
export function scenePredictions(scene: LabScene): Prediction[] {
  const engine = engineById(scene.engine);
  if (!engine) return [];
  const fits = engine.predictions.filter(t => !t.applies || t.applies(scene.params));
  const picked = scene.predictions.length
    ? scene.predictions.map(x => ({ t: fits.find(t => t.id === x.id), prompt: x.prompt })).filter(x => x.t)
    : fits.map(t => ({ t, prompt: undefined }));
  return picked.map(({ t, prompt }) => {
    const built = t!.build(scene.params);
    return { id: t!.id, ...built, prompt: prompt || built.prompt };
  });
}
