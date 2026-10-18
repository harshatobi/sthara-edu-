import { topicKey } from '@/lib/teacher/topicKey';
import { buildPrediction, validateParams, type LabEngine, type Params, type Prediction } from './types';
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
import { ohm } from './engines/ohm';
import { pendulum } from './engines/pendulum';
import { pulse } from './engines/pulse';
import { trolley } from './engines/trolley';
import { incline } from './engines/incline';
import { slab } from './engines/slab';
import { acidProps } from './engines/acidProps';
import { reactivity } from './engines/reactivity';
import { soap } from './engines/soap';
import { mixtures } from './engines/mixtures';
import { microscope } from './engines/microscope';
import { specimens } from './engines/specimens';
import { osmosis } from './engines/osmosis';
import { photosynthesis } from './engines/photosynthesis';
import { respiration } from './engines/respiration';
import { tropism } from './engines/tropism';
import { reflex } from './engines/reflex';
import { heredity } from './engines/heredity';
import { foodChain } from './engines/foodChain';

// Class 9 first, then Class 10, in textbook chapter order.
export const ENGINES: LabEngine<any>[] = [
  // Class 9 (and 9-10 benches), in syllabus order
  microscope, osmosis, specimens, mixtures, reactions, motion, incline, forces, trolley, energy, pendulum, sound, pulse,
  // Class 10
  acidBase, acidProps, reactivity, soap, photosynthesis, respiration, tropism, reflex, heredity,
  optics, slab, eyePrism, circuits, ohm, magnetism, foodChain,
];

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

/** Every question that fits these values, with its engine-worked answer. */
export function fittingPredictions(engineId: string, params: Record<string, unknown>): Prediction[] {
  const engine = engineById(engineId);
  if (!engine) return [];
  return engine.predictions.filter(t => !t.applies || t.applies(params)).map(t => buildPrediction(engine, t, params));
}

/** Questions for a scene: exactly the ones it names. A scene that names none is a demo with no questions. */
export function scenePredictions(scene: LabScene): Prediction[] {
  const engine = engineById(scene.engine);
  if (!engine) return [];
  return scene.predictions.flatMap(x => {
    const t = engine.predictions.find(t => t.id === x.id);
    if (!t || (t.applies && !t.applies(scene.params))) return [];
    const built = buildPrediction(engine, t, scene.params);
    return [{ ...built, prompt: x.prompt || built.prompt }];
  });
}

/**
 * The engines as the Copilot sees them: ids, what each value may be, and the
 * question ids it can ask. Short on purpose; only the engines that fit the
 * request are listed.
 */
export function labCatalogue(engines: LabEngine<any>[]): string {
  return engines.map(e => {
    const values = e.params.map(s => s.kind === 'number'
      ? `${s.key} ${s.min}–${s.max}${s.unit ? ` ${s.unit}` : ''} (default ${s.default})`
      : `${s.key} one of ${s.options.map(o => o.value).join('|')} (default ${s.default})`).join('; ');
    return `- ${e.id}: ${e.title}. Chapters: ${e.chapters.join(', ')}. Values: ${values}. Question ids: ${e.predictions.map(t => `${t.id} (${t.label})`).join(', ')}.`;
  }).join('\n');
}

/** Engines to offer for a class and chapter: the chapter's own, else every engine for that class. */
export function enginesFor(cls: string, chapter?: string | null): LabEngine<any>[] {
  const byChapter = chapter ? enginesForChapter(chapter) : [];
  if (byChapter.length) return byChapter;
  const n = Number(/\d{1,2}/.exec(cls)?.[0]);
  return ENGINES.filter(e => !n || e.classes.includes(n));
}
