/**
 * Prompts for the Socratic engine (pure). Two voices:
 *
 *   talker  Haiku. Words every tutor turn: the problem, questions, hints,
 *           walkthroughs, reviews. Never decides correctness.
 *   judge   Sonnet on the stages that set the score (diagnose, transfer,
 *           teach-back, with the summary folded into teach-back); Haiku on
 *           scaffold steps. Returns marks only, never student-facing text.
 *
 * Everything that stays the same for a whole session (rules, syllabus scope,
 * the misconception bank, the problem) goes in the system prompt, so prompt
 * caching reads it at a tenth of the price on every later turn.
 */
import type { Action, Mode, SocraticState, Stage } from './socratic';

export interface Lesson {
  cls: string;
  /** "Subject: Class 10 Mathematics. Chapter: ..." */
  line: string;
  /** Official syllabus scope for the chapter, or ''. */
  scope: string;
  mode: Mode;
  studySkills: boolean;
}

export interface BankItem { id: string; label: string; description: string }

const HOTS = 'This is a HOTS / Olympiad extension session for a student who has already mastered the chapter at board level: pitch the problem at higher-order-thinking or Olympiad level (multi-step, non-routine, needing insight), while staying on this chapter\'s ideas.';

export function talkerSystem(l: Lesson): string {
  return `You are Sthara's Socratic AI tutor for an Indian CBSE school student${l.cls ? ` in class ${l.cls}` : ''}.
${l.line}${l.scope}
${l.mode === 'hots' ? `${HOTS}\n` : ''}
How a session runs: a diagnostic question on one concrete problem, then guided steps if needed, then an unseen transfer problem the student solves alone, then the student explains the idea in their own words.
Rules you never break:
- Ask exactly ONE question at a time. Ask for the reasoning, not just the result ("and why?").
- Never give the answer to a question you have asked unless the instruction for this turn says to walk through it or review it.
- A level-1 hint is a nudge: point at the relevant fact or what to look at. A level-2 hint names the method or first move, still without the result.
- Be warm, brief and encouraging (2-5 sentences). Plain text only: no markdown, no LaTeX; use Unicode like x², √, π, θ, →.
- School environment, ages 10-18: strictly academic, age-appropriate language.
Always reply with a single JSON object and nothing else.`;
}

const say = (fields: string) => `Reply as ${fields}`;

/** The opening turn: set up the problem and ask the diagnostic question. */
export function startPrompt(): string {
  return `Start the session. Set up ONE concrete, grade-appropriate problem on this topic (state all the data it needs), then ask the diagnostic question: what the student would do first or what the key idea is, and why. The diagnostic should reveal whether they understand the core idea, not just recall a formula.
${say('{"problem": "<the problem, self-contained>", "text": "<short warm opener + the problem + the diagnostic question>"}')}`;
}

/** What the talker must say after the judge and the stage machine have decided. */
export function actionPrompt(a: Action, ctx: { s: SocraticState; note: string; misconceptions: string[]; answer: string | null }): string {
  const { s } = ctx;
  const heard = ctx.answer ? `\nThe student's last answer: ${ctx.answer}` : '';
  const off = ctx.misconceptions.length ? `\nWhat went wrong (likely misconception): ${ctx.misconceptions.join('; ')}.` : '';
  const note = ctx.note ? `\nMarker's note (for you, do not quote): ${ctx.note}` : '';
  const q = `\nThe question being answered: ${s.question}`;
  switch (a.kind) {
    case 'hint':
      return `${q}${heard}${note}${off}
The answer is not right yet. Give a level-${a.level} hint for this same question${a.level === 1 ? ' (a nudge)' : ' (name the method or first move)'}, gently addressing the misconception if there is one, and ask them to try again. Do not give the result.
${say('{"text": "<hint + invitation to retry>"}')}`;
    case 'to_scaffold':
      return `${q}${heard}${note}${off}
The diagnosis shows the student needs guiding. Briefly and kindly respond to their answer (correct the misconception without lecturing), then break the problem into 2 to 4 small guided steps and ask step 1 only.
${say('{"steps": <2-4>, "text": "<response + step 1 question>"}')}`;
    case 'next_step':
      return `${q}${heard}${note}
Correct. Acknowledge in a few words (name what they did well), then ask guided step ${s.scaffoldStep} of ${s.scaffoldTotal}.
${say('{"text": "<ack + next step question>"}')}`;
    case 'walkthrough':
      return `${q}${heard}${note}${off}
The student is stuck on this step. Walk through it clearly and briefly, showing the reasoning and the result. Then ${a.then === 'scaffold'
        ? `ask guided step ${s.scaffoldStep} of ${s.scaffoldTotal}.`
        : 'say the guided part is done and give the TRANSFER problem: a new problem on the same idea with different numbers or context, not a copy. Tell them to solve it on their own (no hints this time) and explain their reasoning.'}
${say(a.then === 'scaffold' ? '{"text": "<walkthrough + next step question>"}' : '{"text": "<walkthrough + transfer problem>"}')}`;
    case 'to_transfer':
      return `${q}${heard}${note}
${a.skipped ? 'Excellent: the diagnosis shows they already understand the idea, so skip the guided steps.' : 'Correct, and that completes the guided steps.'} Acknowledge briefly, then give the TRANSFER problem: a new problem on the same idea with different numbers or context, not a copy of the first. Tell them to solve it on their own (no hints this time) and explain their reasoning.
${say('{"text": "<ack + transfer problem>"}')}`;
    case 'transfer_review':
      return `${q}${heard}${note}${off}
${a.result === 'skipped' ? 'The student chose to see the solution.' : `The transfer attempt was ${a.result}.`} ${a.result === 'correct' ? 'Confirm it in one sentence.' : 'Show the correct solution briefly, pointing at exactly where their approach went off if they attempted it.'}
Then ask for the teach-back: "Explain the key idea of this topic in your own words, as if to a classmate: what it is and why the method works."
${say('{"text": "<review + teach-back prompt>"}')}`;
    case 'wrap_up':
      return `${a.early ? 'The student ended the session early.' : 'The session is complete.'}${heard}
Close warmly in one or two sentences${a.early ? ', and invite them to come back to finish the topic' : ''}.
${say('{"text": "<closing>"}')}`;
  }
}

// ── Judge ───────────────────────────────────────────────────────────────────
export function judgeSystem(l: Lesson, problem: string, bank: BankItem[]): string {
  const list = bank.length
    ? bank.map(b => `- ${b.id}: ${b.label}${b.description ? ` (${b.description})` : ''}`).join('\n')
    : '(none listed for this chapter)';
  return `You are the marker for Sthara's Socratic tutor. You never talk to the student; you return marks as JSON.
Student: Indian CBSE school student${l.cls ? `, class ${l.cls}` : ''}. ${l.line}${l.scope}
${l.mode === 'hots' ? 'This is a HOTS / Olympiad extension session: mark against that level.\n' : ''}The session's problem: ${problem}

Known misconceptions for this chapter (tag ONLY with these ids, and only when the answer clearly shows one):
${list}

Reasoning scale (0-3): 0 no reasoning or wrong idea · 1 fragments, or a bare correct result with no why · 2 sound reasoning with a gap · 3 complete, correct justification in the student's own words.
Be fair to short answers from young students and to minor wording, spelling or arithmetic-format differences. A partially right answer is not correct.
If a photo of handwritten working is attached, read it carefully and judge the working shown.
Always reply with a single JSON object and nothing else.`;
}

export function judgePrompt(stage: Exclude<Stage, 'done'>, ctx: { question: string; answer: string; transcript: string; photo: boolean }): string {
  const head = `Conversation so far:\n${ctx.transcript || '(start)'}\n\nThe question being answered (authoritative): ${ctx.question}\nStudent's answer: ${ctx.answer || '(see the attached photo)'}${ctx.photo ? '\nA photo of the student\'s working is attached: first transcribe it faithfully.' : ''}`;
  const t = ctx.photo ? ', "transcription": "<what the photo shows, plain text>"' : '';
  switch (stage) {
    case 'diagnose':
    case 'scaffold':
      return `${head}

Mark this answer. Reply {"correct": true|false, "reasoning": 0-3, "misconceptions": ["<id>", ...], "note": "<one line: what was right or off>"${t}}`;
    case 'transfer':
      return `${head}

This is the unaided transfer problem. Mark the attempt as correct, partial (right approach, slip or incomplete) or wrong. Reply {"result": "correct"|"partial"|"wrong", "reasoning": 0-3, "misconceptions": ["<id>", ...], "note": "<one line>"${t}}`;
    case 'teachback':
      return `${head}

This is the teach-back: the student explains the topic's key idea in their own words. Score it 0-3: 0 wrong or missing · 1 vague or copied phrasing · 2 correct but incomplete · 3 correct, complete and in their own words.
Then write the session summary for the student from the whole conversation: up to 3 short strengths they showed, up to 3 specific things to fix (name the misconception plainly, if any), and one next step.
Reply {"teachback": 0-3, "misconceptions": ["<id>", ...], "note": "<one line>", "summary": {"strengths": ["..."], "toFix": ["..."], "next": "..."}${t}}`;
  }
}

/** Summary for a session that ended without a teach-back (finished early or skipped). */
export function summaryPrompt(transcript: string): string {
  return `Conversation:\n${transcript || '(nothing yet)'}\n\nWrite the session summary for the student: up to 3 short strengths they showed, up to 3 specific things to fix, and one next step. If there was too little to judge, say so kindly in "next".
Reply {"strengths": ["..."], "toFix": ["..."], "next": "..."}`;
}

// ── Misconception bank seed ─────────────────────────────────────────────────
export function seedPrompt(l: { cls: string; subject: string; chapter: string; topics: string[] }): string {
  return `List the 4 to 8 most common misconceptions Indian CBSE Class ${l.cls} students have in ${l.subject}, chapter "${l.chapter}"${l.topics.length ? ` (content: ${l.topics.join('; ')})` : ''}.
Each must be a specific, recognisable error in thinking (e.g. "Adds denominators when adding fractions"), not a vague weakness ("weak at fractions"). Labels under 80 characters; descriptions one sentence on how it shows up in an answer.
Reply {"misconceptions": [{"label": "...", "description": "..."}]}`;
}

export function parseSeed(raw: Record<string, unknown>): { label: string; description: string }[] {
  const list = Array.isArray(raw.misconceptions) ? raw.misconceptions : [];
  const seen = new Set<string>();
  const out: { label: string; description: string }[] = [];
  for (const m of list) {
    const label = typeof m?.label === 'string' ? m.label.trim().slice(0, 120) : '';
    const description = typeof m?.description === 'string' ? m.description.trim().slice(0, 400) : '';
    if (label.length < 3 || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push({ label, description });
  }
  return out.slice(0, 8);
}
