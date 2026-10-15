/**
 * Teacher Copilot protocol, shared by the API route and the UI. Pure.
 *
 * Every reply from the model is one JSON object:
 *   say          short markdown to the teacher
 *   ask          up to 3 clarifying questions, each with tappable options
 *   artifact     something usable: a question set, a lesson plan, a rubric,
 *                a Live Lab demo, or a document (parent note, explanations, …)
 *   suggestions  2–4 one-tap follow-ups
 */
import { sanitizeQuestions, type Question } from './questions';
import { validateScene, type LabScene } from '@/lib/lab/registry';
import { sanitizeSvg } from './svg';
import { checkPaper, type Paper } from '@/lib/papers/paper';
import { designsFor } from '@/lib/papers/designs';

export type StudioKind =
  | 'worksheet' | 'quiz' | 'remedial' | 'lesson' | 'rubric' | 'answer_key'
  | 'parent_note' | 'explain' | 'discussion' | 'exit_tickets' | 'lab_demo' | 'misconceptions' | 'bundle' | 'diagram' | 'illustration' | 'board_paper';

export type StudioGroup = 'students' | 'you' | 'parents';
export interface StudioType {
  kind: StudioKind; label: string; blurb: string; group: StudioGroup; needsChapter: boolean;
  /** Which settings apply. */
  items?: boolean; level?: boolean; minutes?: boolean;
  /** 'many': whole class / below 40% / pick students; 'one': a single student. */
  who?: 'many' | 'one';
  /** Rough wait, shown before generating. */
  seconds: number;
}

/** The generation studio (mockup AI_GEN_TYPES, extended), grouped by who it's for. */
export const STUDIO: StudioType[] = [
  { kind: 'worksheet', label: 'Worksheet', blurb: 'Mixed practice with a marking scheme', group: 'students', needsChapter: true, items: true, level: true, who: 'many', seconds: 15 },
  { kind: 'quiz', label: 'Quiz', blurb: 'Multiple choice, marked the moment they submit', group: 'students', needsChapter: true, items: true, level: true, who: 'many', seconds: 12 },
  { kind: 'remedial', label: 'Remedial pack', blurb: 'Easiest first, with hints, for those who need it', group: 'students', needsChapter: true, items: true, who: 'many', seconds: 15 },
  { kind: 'exit_tickets', label: 'Exit tickets', blurb: 'Three quick checks for the last five minutes', group: 'students', needsChapter: true, seconds: 8 },
  { kind: 'lesson', label: 'Lesson plan', blurb: 'Timed stages, support and stretch, exit check', group: 'you', needsChapter: true, minutes: true, seconds: 20 },
  { kind: 'explain', label: 'Explain it 3 ways', blurb: 'Concrete, visual and abstract takes on one idea', group: 'you', needsChapter: true, seconds: 10 },
  { kind: 'discussion', label: 'Discussion prompts', blurb: 'Questions that make them think out loud', group: 'you', needsChapter: true, items: true, seconds: 10 },
  { kind: 'rubric', label: 'Rubric', blurb: 'Criteria and levels for written or project work', group: 'you', needsChapter: false, seconds: 10 },
  { kind: 'answer_key', label: 'Marking scheme', blurb: 'Step marks for a paper you paste in', group: 'you', needsChapter: false, seconds: 12 },
  { kind: 'bundle', label: 'Lesson bundle', blurb: 'Plan, demo, exit ticket and catch-up pack for one period', group: 'you', needsChapter: true, minutes: true, who: 'many', seconds: 45 },
  { kind: 'diagram', label: 'Labelled diagram', blurb: 'A clean, labelled diagram to print or put on the board', group: 'you', needsChapter: true, seconds: 15 },
  { kind: 'illustration', label: 'Illustration', blurb: 'A picture for a scene or real-world context (you choose to generate it)', group: 'you', needsChapter: false, seconds: 8 },
  { kind: 'misconceptions', label: 'Fix misconceptions', blurb: 'What they got wrong, why, and what will fix it', group: 'you', needsChapter: false, seconds: 15 },
  { kind: 'lab_demo', label: 'Live lab demo', blurb: 'A simulation for the board, with predictions', group: 'you', needsChapter: true, seconds: 10 },
  { kind: 'board_paper', label: 'Board exam paper', blurb: 'A full paper in the CBSE 2026-27 pattern, with marking scheme', group: 'students', needsChapter: false, seconds: 90 },
  { kind: 'parent_note', label: 'Parent note', blurb: 'Warm, specific, one thing to do at home', group: 'parents', needsChapter: false, who: 'one', seconds: 8 },
];

export const STUDIO_GROUPS: { key: StudioGroup; label: string }[] = [
  { key: 'students', label: 'For students' }, { key: 'you', label: 'For you' }, { key: 'parents', label: 'For parents' },
];

export interface AskItem { id: string; question: string; options: string[]; multi: boolean }

export type Artifact =
  | { kind: 'questions'; title: string; purpose: 'worksheet' | 'quiz' | 'remedial' | 'exit_tickets'; chapter: string | null; questions: Question[]; notes: string }
  | { kind: 'lesson'; title: string; chapter: string | null; topics: string[]; durationMin: number; objectives: string[]; successCriteria: string[];
      priorKnowledge: string; stages: { name: string; minutes: number; teacher: string; students: string }[];
      differentiation: { support: string; stretch: string }; checkForUnderstanding: string; materials: { label: string }[] }
  | { kind: 'rubric'; title: string; criteria: { name: string; levels: { label: string; descriptor: string; points: number }[] }[] }
  | { kind: 'document'; title: string; audience: 'teacher' | 'parent' | 'student'; markdown: string }
  /** A Live Lab set-up. Only the engine, its values and the wording come from the model; answers come from the engine. */
  | { kind: 'lab'; title: string; scene: LabScene }
  /** A labelled diagram the model drew; the SVG is rebuilt from a whitelist before anyone sees it. */
  | { kind: 'diagram'; title: string; caption: string; svg: string }
  /** An illustration. The model writes the prompt; the teacher generates it (it costs money), then `path` is set. */
  | { kind: 'image'; title: string; prompt: string; caption: string; path: string | null }
  /** A full board-pattern paper: every question checked against the official design before it arrives. */
  | { kind: 'paper'; title: string; paper: Paper }
  /** Everything for one period in one go; each part is checked like a standalone artifact. */
  | { kind: 'bundle'; title: string; parts: Exclude<Artifact, { kind: 'bundle' }>[] };

/** Studio types that only make sense for some subjects (the Live Lab covers science). */
export const isScienceSubject = (subject: string) => /science|physics|chemistry/i.test(subject);
export const studioFor = (subject: string, cls = '') => STUDIO.filter(t =>
  (t.kind !== 'lab_demo' || isScienceSubject(subject)) && (t.kind !== 'board_paper' || designsFor(cls, subject).length > 0));

export interface CopilotReply { say: string; ask: AskItem[]; artifact: Artifact | null; suggestions: string[] }

export interface ChatTurn {
  role: 'teacher' | 'copilot'; text: string; reply?: CopilotReply; at: number;
  /** Students a Studio request was for (their ids), so "Send to class" targets them. */
  targets?: string[];
}

// ── Sanitising what the model returns ───────────────────────────────────────
const s = (v: unknown, n = 4000) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const list = (v: unknown, n = 10, len = 400) => (Array.isArray(v) ? v.map(x => s(x, len)).filter(Boolean).slice(0, n) : []);

function artifactOf(a: any, nested = false): Artifact | null {
  if (!a || typeof a !== 'object') return null;
  const title = s(a.title, 200) || 'Untitled';
  if (a.kind === 'bundle') {
    if (nested) return null;
    const parts = (Array.isArray(a.parts) ? a.parts : []).slice(0, 8).map((x: unknown) => artifactOf(x, true)).filter(Boolean) as Exclude<Artifact, { kind: 'bundle' }>[];
    // A bundle that lost all but one part is just that part.
    return parts.length >= 2 ? { kind: 'bundle', title, parts } : parts[0] ?? null;
  }
  if (a.kind === 'questions') {
    const { questions, error } = sanitizeQuestions(a.questions);
    if (error || !questions.length) return null;
    const purpose = ['worksheet', 'quiz', 'remedial', 'exit_tickets'].includes(a.purpose) ? a.purpose : 'worksheet';
    return { kind: 'questions', title, purpose, chapter: s(a.chapter, 200) || null, questions, notes: s(a.notes, 3000) };
  }
  if (a.kind === 'lesson') {
    const stages = (Array.isArray(a.stages) ? a.stages : []).slice(0, 8).map((x: any) => ({
      name: s(x?.name, 80) || 'Stage', minutes: Math.max(1, Math.min(240, Math.round(Number(x?.minutes) || 5))), teacher: s(x?.teacher, 1500), students: s(x?.students, 1500),
    }));
    if (!stages.length) return null;
    return {
      kind: 'lesson', title, chapter: s(a.chapter, 200) || null, topics: list(a.topics, 8, 500),
      durationMin: Math.max(10, Math.min(240, Math.round(Number(a.durationMin) || stages.reduce((n: number, x: any) => n + x.minutes, 0)))),
      objectives: list(a.objectives), successCriteria: list(a.successCriteria), priorKnowledge: s(a.priorKnowledge, 1500), stages,
      differentiation: { support: s(a.differentiation?.support, 1500), stretch: s(a.differentiation?.stretch, 1500) },
      checkForUnderstanding: s(a.checkForUnderstanding, 1500),
      materials: (Array.isArray(a.materials) ? a.materials : []).map((m: any) => ({ label: s(m?.label ?? m, 200) })).filter((m: any) => m.label).slice(0, 12),
    };
  }
  if (a.kind === 'rubric') {
    const criteria = (Array.isArray(a.criteria) ? a.criteria : []).slice(0, 8).map((c: any) => ({
      name: s(c?.name, 120),
      levels: (Array.isArray(c?.levels) ? c.levels : []).slice(0, 5).map((l: any) => ({ label: s(l?.label, 40), descriptor: s(l?.descriptor, 500), points: Math.max(0, Math.round(Number(l?.points) || 0)) })),
    })).filter((c: any) => c.name && c.levels.length);
    return criteria.length ? { kind: 'rubric', title, criteria } : null;
  }
  if (a.kind === 'lab') {
    // The engine's own check: an unknown engine or any value outside its ranges drops the whole demo.
    // Accepts the flat shape the prompt asks for, or the nested { scene } shape it sees in the history.
    const flat = a.scene && typeof a.scene === 'object' ? { ...a.scene, title: s(a.title, 200) || a.scene.title } : a;
    const scene = validateScene({ ...flat, title: s(flat.title, 200) || title });
    return scene ? { kind: 'lab', title: scene.title, scene } : null;
  }
  if (a.kind === 'paper') {
    if (nested) return null;
    const paper = checkPaper(a.paper);
    return paper ? { kind: 'paper', title: paper.title, paper } : null;
  }
  if (a.kind === 'diagram') {
    const svg = sanitizeSvg(a.svg);
    return svg ? { kind: 'diagram', title, caption: s(a.caption, 600), svg } : null;
  }
  if (a.kind === 'image') {
    const prompt = s(a.prompt, 800);
    // Only a path the image route itself produced: <school>/<teacher>/<uuid>.png
    const path = typeof a.path === 'string' && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/.test(a.path) ? a.path : null;
    return prompt ? { kind: 'image', title, prompt, caption: s(a.caption, 600), path } : null;
  }
  if (a.kind === 'document') {
    const markdown = s(a.markdown, 12000);
    if (!markdown) return null;
    return { kind: 'document', title, audience: ['teacher', 'parent', 'student'].includes(a.audience) ? a.audience : 'teacher', markdown };
  }
  return null;
}

export function parseReply(raw: unknown): CopilotReply {
  const r = (raw ?? {}) as any;
  const ask: AskItem[] = (Array.isArray(r.ask) ? r.ask : []).slice(0, 3).map((q: any, i: number) => ({
    id: s(q?.id, 40) || `q${i + 1}`, question: s(q?.question, 300), options: list(q?.options, 6, 120), multi: !!q?.multi,
  })).filter((q: AskItem) => q.question && q.options.length >= 2);
  return { say: s(r.say, 6000), ask, artifact: artifactOf(r.artifact), suggestions: list(r.suggestions, 4, 140) };
}

// ── Privacy: student names never reach the model ────────────────────────────
/** Replaces [[S3]]-style tokens with real names, after the model has answered. */
export function restoreNames<T>(value: T, names: Map<string, string>): T {
  const fix = (x: string) => x.replace(/\[\[(S\d{1,3})\]\]/g, (m, id) => names.get(id) ?? m);
  const walk = (v: any): any => (typeof v === 'string' ? fix(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
  return walk(value);
}

/** Short, human title for a thread from its first request. */
export const threadTitle = (text: string) => (text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text) || 'New conversation';
