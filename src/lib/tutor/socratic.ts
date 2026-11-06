/**
 * The Socratic tutor's engine, pure part (no I/O): the stage machine, the depth
 * score D, and the shapes the judge returns. Decisions of 2026-11-06.
 *
 * A session runs in stages:
 *
 *   diagnose   one probe question on a concrete problem: answer and why.
 *              A strong answer (correct, reasoning >= 2 of 3) skips scaffolding.
 *   scaffold   2-4 guided steps through the problem. A wrong answer earns hint 1
 *              (a nudge), then hint 2 (the method); wrong again and the tutor
 *              walks through that step, which counts like a reveal.
 *   transfer   an unseen variant, unaided: one attempt, no hints.
 *   teachback  the student explains the idea in their own words.
 *
 * D = 30% independence + 30% reasoning + 30% transfer + 10% teach-back.
 * Anything not attempted scores 0 on its part, so ending a session early costs.
 */

export type Stage = 'diagnose' | 'scaffold' | 'transfer' | 'teachback' | 'done';
export const STAGES: Exclude<Stage, 'done'>[] = ['diagnose', 'scaffold', 'transfer', 'teachback'];
export type Mode = 'standard' | 'hots';

export const WEIGHTS = { independence: 0.30, reasoning: 0.30, transfer: 0.30, teachback: 0.10 } as const;
/** Hints allowed on a scaffold step before the tutor walks the student through it. */
export const MAX_HINTS = 2;
export const MIN_STEPS = 2;
export const MAX_STEPS = 4;
/** Diagnosis this good skips scaffolding. */
export const STRONG_REASONING = 2;

export interface StepRecord { hints: number; walked: boolean; reasoning: number | null }
export type TransferResult = 'correct' | 'partial' | 'wrong' | 'skipped';

export interface SocraticState {
  mode: Mode;
  /** The concrete problem the session is built on. */
  problem: string;
  /** The question being answered now (authoritative for the judge). */
  question: string;
  /** Hints given on the current scaffold step. */
  stepHints: number;
  scaffoldStep: number;
  scaffoldTotal: number;
  skippedScaffold: boolean;
  diagnose: { correct: boolean; reasoning: number } | null;
  scaffold: StepRecord[];
  transfer: { result: TransferResult; reasoning: number | null } | null;
  teachback: { score: number | null } | null;
  /** Every reasoning mark the judge gave (0-3), for the reasoning part of D. */
  reasoning: number[];
  /** Misconception ids found, with the stage first seen and how often. */
  misconceptions: Record<string, { stage: Exclude<Stage, 'done'>; seen: number }>;
}

export function initialState(mode: Mode, problem: string, question: string): SocraticState {
  return {
    mode, problem, question, stepHints: 0, scaffoldStep: 0, scaffoldTotal: 0, skippedScaffold: false,
    diagnose: null, scaffold: [], transfer: null, teachback: null, reasoning: [], misconceptions: {},
  };
}

// ── The judge's verdict ─────────────────────────────────────────────────────
export interface Verdict {
  /** diagnose/scaffold: right or not. transfer: 'correct' | 'partial' | 'wrong'. */
  correct: boolean;
  partial: boolean;
  /** 0 none · 1 fragments · 2 sound but incomplete · 3 complete justification. */
  reasoning: number;
  /** Ids from the chapter's bank only; anything else is dropped. */
  misconceptions: string[];
  /** For teach-back: 0-3. */
  teachback: number | null;
  /** What the judge read from a photo of working, if one was sent. */
  transcription: string | null;
  /** One line for the talker: what was right, what was off. Never shown verbatim. */
  note: string;
}

const clamp = (n: unknown, lo: number, hi: number): number | null => {
  const x = typeof n === 'number' ? n : typeof n === 'string' && n.trim() !== '' ? Number(n) : NaN;
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : null;
};
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Reads the judge's JSON defensively. Unknown misconception ids are dropped, so the bank stays the only vocabulary. */
export function parseVerdict(raw: Record<string, unknown>, bankIds: readonly string[]): Verdict {
  const result = str(raw.result, 10).toLowerCase();
  const partial = result === 'partial' || raw.partial === true;
  const correct = result ? result === 'correct' : raw.correct === true;
  const ids = Array.isArray(raw.misconceptions) ? raw.misconceptions : [];
  const known = new Set(bankIds);
  return {
    correct,
    partial: !correct && partial,
    reasoning: clamp(raw.reasoning, 0, 3) ?? (correct ? 1 : 0),
    misconceptions: [...new Set(ids.filter((x): x is string => typeof x === 'string' && known.has(x)))].slice(0, 3),
    teachback: clamp(raw.teachback, 0, 3),
    transcription: str(raw.transcription, 2000) || null,
    note: str(raw.note, 400),
  };
}

// ── Stage machine ───────────────────────────────────────────────────────────
export type Event = { type: 'answer'; verdict: Verdict } | { type: 'stuck' } | { type: 'finish' };

/**
 * What the tutor says next, for the talker to word:
 *   hint            same scaffold question, hint level `level` (1 nudge, 2 method)
 *   to_scaffold     address what the diagnosis showed, then scaffold step 1
 *   next_step       acknowledge, then the next scaffold step
 *   walkthrough     walk through the current step, then the next step (or the transfer problem when `then` is transfer)
 *   to_transfer     acknowledge (the diagnosis was strong, or scaffolding is done), then the transfer problem
 *   transfer_review feedback on the transfer attempt (or its solution if skipped), then the teach-back prompt
 *   wrap_up         the session is over
 */
export type Action =
  | { kind: 'hint'; level: number }
  | { kind: 'to_scaffold' }
  | { kind: 'next_step' }
  | { kind: 'walkthrough'; then: 'scaffold' | 'transfer' }
  | { kind: 'to_transfer'; skipped: boolean }
  | { kind: 'transfer_review'; result: TransferResult }
  | { kind: 'wrap_up'; early: boolean };

export interface Step { stage: Stage; state: SocraticState; action: Action }

function tag(s: SocraticState, stage: Exclude<Stage, 'done'>, ids: string[]): SocraticState {
  if (!ids.length) return s;
  const m = { ...s.misconceptions };
  for (const id of ids) m[id] = m[id] ? { ...m[id], seen: m[id].seen + 1 } : { stage, seen: 1 };
  return { ...s, misconceptions: m };
}

/** After the last scaffold step: the transfer problem; otherwise the next step. */
const afterStep = (s: SocraticState): 'scaffold' | 'transfer' => (s.scaffoldStep >= s.scaffoldTotal ? 'transfer' : 'scaffold');

export function advance(stage: Stage, state: SocraticState, ev: Event): Step {
  if (stage === 'done') throw new Error('Session already finished');
  if (ev.type === 'finish') return { stage: 'done', state, action: { kind: 'wrap_up', early: true } };

  switch (stage) {
    case 'diagnose': {
      if (ev.type === 'stuck') {
        const s = { ...state, diagnose: { correct: false, reasoning: 0 }, reasoning: [...state.reasoning, 0] };
        return { stage: 'scaffold', state: { ...s, scaffoldStep: 1, stepHints: 0 }, action: { kind: 'to_scaffold' } };
      }
      const v = ev.verdict;
      let s = tag({ ...state, diagnose: { correct: v.correct, reasoning: v.reasoning }, reasoning: [...state.reasoning, v.reasoning] }, 'diagnose', v.misconceptions);
      if (v.correct && v.reasoning >= STRONG_REASONING) {
        s = { ...s, skippedScaffold: true };
        return { stage: 'transfer', state: s, action: { kind: 'to_transfer', skipped: true } };
      }
      return { stage: 'scaffold', state: { ...s, scaffoldStep: 1, stepHints: 0 }, action: { kind: 'to_scaffold' } };
    }

    case 'scaffold': {
      if (ev.type === 'stuck') {
        const s = { ...state, scaffold: [...state.scaffold, { hints: state.stepHints, walked: true, reasoning: null }] };
        const then = afterStep(s);
        return {
          stage: then, state: then === 'scaffold' ? { ...s, scaffoldStep: s.scaffoldStep + 1, stepHints: 0 } : { ...s, stepHints: 0 },
          action: { kind: 'walkthrough', then },
        };
      }
      const v = ev.verdict;
      let s = tag({ ...state, reasoning: [...state.reasoning, v.reasoning] }, 'scaffold', v.misconceptions);
      if (v.correct) {
        s = { ...s, scaffold: [...s.scaffold, { hints: s.stepHints, walked: false, reasoning: v.reasoning }] };
        if (afterStep(s) === 'transfer') return { stage: 'transfer', state: { ...s, stepHints: 0 }, action: { kind: 'to_transfer', skipped: false } };
        return { stage: 'scaffold', state: { ...s, scaffoldStep: s.scaffoldStep + 1, stepHints: 0 }, action: { kind: 'next_step' } };
      }
      if (s.stepHints < MAX_HINTS) {
        const level = s.stepHints + 1;
        return { stage: 'scaffold', state: { ...s, stepHints: level }, action: { kind: 'hint', level } };
      }
      // Wrong after both hints: walk through the step.
      s = { ...s, scaffold: [...s.scaffold, { hints: s.stepHints, walked: true, reasoning: v.reasoning }] };
      const then = afterStep(s);
      return {
        stage: then, state: then === 'scaffold' ? { ...s, scaffoldStep: s.scaffoldStep + 1, stepHints: 0 } : { ...s, stepHints: 0 },
        action: { kind: 'walkthrough', then },
      };
    }

    case 'transfer': {
      if (ev.type === 'stuck') {
        return { stage: 'teachback', state: { ...state, transfer: { result: 'skipped', reasoning: null } }, action: { kind: 'transfer_review', result: 'skipped' } };
      }
      const v = ev.verdict;
      const result: TransferResult = v.correct ? 'correct' : v.partial ? 'partial' : 'wrong';
      const s = tag({ ...state, transfer: { result, reasoning: v.reasoning }, reasoning: [...state.reasoning, v.reasoning] }, 'transfer', v.misconceptions);
      return { stage: 'teachback', state: s, action: { kind: 'transfer_review', result } };
    }

    case 'teachback': {
      if (ev.type === 'stuck') return { stage: 'done', state: { ...state, teachback: { score: null } }, action: { kind: 'wrap_up', early: false } };
      const v = ev.verdict;
      const s = tag({ ...state, teachback: { score: v.teachback ?? v.reasoning } }, 'teachback', v.misconceptions);
      return { stage: 'done', state: s, action: { kind: 'wrap_up', early: false } };
    }
  }
}

// ── Depth score D ───────────────────────────────────────────────────────────
export interface Rubric {
  independence: number;
  reasoning: number;
  transfer: number;
  teachback: number;
  depth: number;
}

/** One scaffold step's independence, on the same scale as the old hints-only D. */
export const stepIndependence = (r: StepRecord) => (r.walked ? 10 : r.hints <= 0 ? 100 : r.hints === 1 ? 60 : 30);

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function computeRubric(s: SocraticState): Rubric {
  const independence = s.skippedScaffold ? 100 : mean(s.scaffold.map(stepIndependence)) ?? 0;
  const r = mean(s.reasoning);
  const reasoning = r === null ? 0 : (r / 3) * 100;
  const transfer = s.transfer?.result === 'correct' ? 100 : s.transfer?.result === 'partial' ? 50 : 0;
  const teachback = s.teachback?.score != null ? (s.teachback.score / 3) * 100 : 0;
  const depth = WEIGHTS.independence * independence + WEIGHTS.reasoning * reasoning + WEIGHTS.transfer * transfer + WEIGHTS.teachback * teachback;
  return { independence: round1(independence), reasoning: round1(reasoning), transfer: round1(transfer), teachback: round1(teachback), depth: round1(depth) };
}

/** Totals kept on the row for older readers (hint_depth / answer_revealed). */
export function legacyTotals(s: SocraticState): { hints: number; revealed: boolean } {
  return {
    hints: s.scaffold.reduce((n, r) => n + r.hints, 0) + s.stepHints,
    revealed: s.scaffold.some(r => r.walked) || s.transfer?.result === 'skipped',
  };
}

// ── Summary card ────────────────────────────────────────────────────────────
export interface Summary { strengths: string[]; toFix: string[]; next: string }

export function parseSummary(raw: Record<string, unknown>): Summary {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, 400)).slice(0, 3) : []);
  return { strengths: list(raw.strengths), toFix: list(raw.toFix ?? raw.to_fix), next: str(raw.next, 240) };
}

/** Scaffold length the talker proposed, kept within bounds. */
export const clampSteps = (n: unknown) => clamp(n, MIN_STEPS, MAX_STEPS) ?? 3;

/** Stages for the progress bar: which are done, current, skipped. */
export function progress(stage: Stage, s: Pick<SocraticState, 'skippedScaffold'>): { stage: Exclude<Stage, 'done'>; status: 'done' | 'current' | 'todo' | 'skipped' }[] {
  const at = stage === 'done' ? STAGES.length : STAGES.indexOf(stage);
  return STAGES.map((st, i) => ({
    stage: st,
    status: st === 'scaffold' && s.skippedScaffold ? 'skipped' : i < at ? 'done' : i === at ? 'current' : 'todo',
  }));
}
