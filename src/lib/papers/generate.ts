import 'server-only';
import type { GoogleGenAI } from '@google/genai';
import type { CurriculumSubject } from '@/lib/curriculum/types';
import { generateMetered, type UsageMeta } from '@/lib/ai/usage';
import { AI_MODELS } from '@/lib/settings/limits';
import { buildBlueprint, type BlueprintItem } from './blueprint';
import { paperTitle, readSection, type Paper, type PaperSection } from './paper';
import type { PaperDesign, QType } from './designs';

/**
 * Writes a full board-pattern paper: the blueprint fixes every question's
 * type, marks and chapter; each section is written by the model in parallel,
 * checked against its slots, and sent back once with the exact problems if it
 * doesn't fit. A section that still doesn't fit fails the paper rather than
 * handing a teacher something that isn't the board's shape.
 */

const SHAPES: Record<QType, string> = {
  mcq: '{"q":N,"text":"…","options":["…","…","…","…"],"answer":0-3,"scheme":"the answer, with a one-line reason"}',
  assertion_reason: '{"q":N,"assertion":"…","reason":"…","answer":0-3,"scheme":"why"}  (answer indexes the four standard A/R options: 0 both true and R explains A, 1 both true but R does not explain A, 2 A true R false, 3 A false R true)',
  vsa: '{"q":N,"text":"…","scheme":"value points with marks, e.g. (1) … (1) …"}',
  sa: '{"q":N,"text":"…","scheme":"value points with marks"}',
  la: '{"q":N,"text":"… (may have sub-parts written inside the text)","scheme":"value points with marks"}',
  map: '{"q":N,"text":"what to locate and label","scheme":"the places/features","vi":"a question in place of the map for visually impaired candidates"}',
  case: '{"q":N,"passage":"the case or source, 100–180 words","text":"","scheme":"","parts":[{"label":"(i)","text":"…","marks":M,"scheme":"…"}, …]}  (a part may be an MCQ: add "options" and "answer")',
  passage: '{"q":N,"passage":"the passage (see its note for length)","text":"","scheme":"","parts":[{"label":"(i)","text":"…","marks":M,"scheme":"…","options":[…]?,"answer":0-3?}, …]}',
  grammar: '{"q":N,"text":"Complete any ten of the twelve tasks…","scheme":"","parts":[twelve × {"label":"(i)","text":"a sentence or short passage with the task","marks":1,"scheme":"the answer"}]}',
  writing: '{"q":N,"text":"the full task with its situation and word limit","scheme":"format, content and expression points with marks"}',
  extract: '{"q":N,"passage":"the extract","text":"","scheme":"","parts":[{"label":"(i)","text":"…","marks":M,"scheme":"…"}, …]}',
  lit_short: '{"q":N,"text":"Answer any … of the following…","scheme":"","parts":[{"label":"(i)","text":"…","marks":3,"scheme":"value points"}, …]}',
  lit_long: '{"q":N,"text":"…","scheme":"value points with marks"}',
};

function slotLine(i: BlueprintItem): string {
  const choice = i.choice?.kind === 'either' ? ' · internal choice: add "alt" with a complete alternative question of the same type, marks and chapter (students answer one)'
    : i.choice?.kind === 'subpart' ? ` · the ${Math.max(...(i.parts ?? [2]))}-mark sub-part has an alternative: give that part an "or" {"text","scheme"}`
      : i.choice?.kind === 'any' ? ` · write ${i.choice.of} parts of ${i.marks / i.choice.attempt} mark(s) each; students attempt ${i.choice.attempt}` : '';
  const parts = i.parts ? ` · parts carry ${i.parts.join(' + ')} marks` : '';
  const topics = i.topics.length ? ` · content points: ${i.topics.slice(0, 6).join('; ').slice(0, 500)}` : '';
  const excl = i.exclusions.length ? ` · NOT assessed: ${i.exclusions.join('; ').slice(0, 300)}` : '';
  return `Q${i.q} · ${i.type} · ${i.marks} mark${i.marks === 1 ? '' : 's'} · chapter "${i.chapter}"${parts}${choice}${i.note ? ` · ${i.note}` : ''}${topics}${excl}`;
}

function sectionPrompt(design: PaperDesign, section: { id: string; title: string }, items: BlueprintItem[]): string {
  const types = [...new Set(items.map(i => i.type))];
  return `You are an experienced CBSE paper setter. Write Section ${section.id}${section.title !== `Section ${section.id}` ? ` (${section.title})` : ''} of a Class ${design.cls === 10 ? 'X' : 'XII'} ${design.subject}${design.variant ? ` ${design.variant}` : ''} practice paper that follows the CBSE 2026-27 board design exactly.

THE SLOTS (write exactly these question numbers, types and marks; each from its chapter):
${items.map(slotLine).join('\n')}

HOW TO WRITE IT
- Original questions in clear Indian English, NCERT-aligned, at board level. Do not copy NCERT exercise questions word for word.
- About half the marks should be competency-based: application in real Indian contexts, data, diagrams, cases and analysis, not just recall.
- Mix of difficulty across the section: roughly 40% easy, 40% average, 20% challenging.
- Stay strictly inside each chapter's content points; never use content marked NOT assessed.
- A question may have a figure when the board would use one: add "figure": {"svg":"<svg viewBox=\\"0 0 600 300\\">…</svg>","caption":"…"} using only simple shapes and <text> labels, and then always add "vi": a complete alternative question for visually impaired candidates. Use figures sparingly (at most 3 in this section).
- Every question has a marking scheme a teacher can mark from: the answer and the value points with their marks; MCQs give the answer with a one-line reason.
- Units in SI; numbers that work out cleanly without a calculator.

FORMATS
${types.map(t => `${t}: ${SHAPES[t]}`).join('\n')}

Reply with ONE JSON object only: {"questions":[ … one object per slot, in order … ]}`;
}

async function writeSection(ai: GoogleGenAI, design: PaperDesign, section: { id: string; title: string }, items: BlueprintItem[], meta: UsageMeta): Promise<PaperSection> {
  const prompt = sectionPrompt(design, section, items);
  const ask = async (contents: { role: 'user' | 'model'; parts: { text: string }[] }[]) => {
    const res = await generateMetered(ai, {
      model: AI_MODELS.standard, contents,
      config: { responseMimeType: 'application/json', temperature: 0.6, maxOutputTokens: 32000 },
    }, meta);
    const text = (res.text || '{}').replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let raw: unknown = null;
    try { raw = JSON.parse(text); } catch { /* reported below as missing questions */ }
    return { text, ...readSection(items, raw) };
  };
  const first = await ask([{ role: 'user', parts: [{ text: prompt }] }]);
  if (!first.problems.length) return { id: section.id, title: section.title, questions: first.questions };
  const second = await ask([
    { role: 'user', parts: [{ text: prompt }] },
    { role: 'model', parts: [{ text: first.text.slice(0, 60000) }] },
    { role: 'user', parts: [{ text: `That doesn't fit the board design yet. Fix exactly these and reply with the whole section again as one JSON object:\n${first.problems.slice(0, 30).map(p => `- ${p}`).join('\n')}` }] },
  ]);
  if (second.problems.length) throw new Error(`Section ${section.id}: ${second.problems.slice(0, 3).join('; ')}`);
  return { id: section.id, title: section.title, questions: second.questions };
}

export async function generatePaper(ai: GoogleGenAI, design: PaperDesign, cur: CurriculumSubject, meta: UsageMeta, seed: number): Promise<Paper> {
  const plan = buildBlueprint(design, cur, seed);
  const sections = await Promise.all(design.sections.map(sec => writeSection(ai, design, sec, plan.filter(i => i.section === sec.id), meta)));
  return { design: design.key, title: paperTitle(design), seed, sections };
}
