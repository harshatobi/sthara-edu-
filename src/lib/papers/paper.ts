import { sanitizeSvg } from '@/lib/teacher/svg';
import type { BlueprintItem } from './blueprint';
import { designByKey, slotsOf, type PaperDesign, type QType } from './designs';

/**
 * A generated board-pattern paper, and the checks every section must pass
 * before a teacher sees it. Marks always come from the design, never from the
 * model; a question that doesn't fit its slot sends the section back.
 */

export interface Figure { svg: string; caption: string }
export interface Part { label: string; text: string; marks: number; options?: string[]; answer?: number; scheme: string; or?: { text: string; options?: string[]; answer?: number; scheme: string } }
export interface QBody {
  text: string;
  /** Case, source, passage or extract the parts are about. */
  passage?: string;
  options?: string[];
  answer?: number;
  assertion?: string;
  reason?: string;
  figure?: Figure;
  /** The version for visually impaired candidates, required whenever there is a figure or map. */
  vi?: string;
  parts?: Part[];
  scheme: string;
}
export interface PaperQuestion extends QBody { q: number; type: QType; marks: number; chapter: string; alt?: QBody }
export interface PaperSection { id: string; title: string; questions: PaperQuestion[] }
export interface Paper { design: string; title: string; seed: number; sections: PaperSection[] }

/** The four standard assertion–reason options used on every CBSE paper. */
export const AR_OPTIONS = [
  'Both A and R are true, and R is the correct explanation of A.',
  'Both A and R are true, but R is not the correct explanation of A.',
  'A is true, but R is false.',
  'A is false, but R is true.',
];

const s = (v: unknown, n = 6000) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const WRITTEN: QType[] = ['vsa', 'sa', 'la', 'map', 'writing', 'lit_long'];
const WITH_PARTS: QType[] = ['case', 'passage', 'extract', 'grammar', 'lit_short'];

function figureOf(v: any): Figure | undefined {
  const svg = sanitizeSvg(v?.svg);
  return svg ? { svg, caption: s(v?.caption, 300) } : undefined;
}

function optionsOf(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const o = v.map(x => s(x, 500)).filter(Boolean);
  return o.length ? o : undefined;
}

function partOf(v: any, i: number): Part {
  const or = v?.or && typeof v.or === 'object' ? { text: s(v.or.text, 2000), options: optionsOf(v.or.options), answer: Number.isInteger(v.or.answer) ? v.or.answer : undefined, scheme: s(v.or.scheme, 2000) } : undefined;
  return {
    label: s(v?.label, 10) || `(${['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'][i] ?? i + 1})`,
    text: s(v?.text, 2000), marks: Number(v?.marks) || 0, options: optionsOf(v?.options),
    answer: Number.isInteger(v?.answer) ? v.answer : undefined, scheme: s(v?.scheme, 2000), ...(or && or.text ? { or } : {}),
  };
}

function bodyOf(v: any): QBody {
  return {
    text: s(v?.text, 3000), passage: s(v?.passage, 6000) || undefined, options: optionsOf(v?.options),
    answer: Number.isInteger(v?.answer) ? v.answer : undefined, assertion: s(v?.assertion, 800) || undefined, reason: s(v?.reason, 800) || undefined,
    figure: figureOf(v?.figure), vi: s(v?.vi, 2000) || undefined, parts: Array.isArray(v?.parts) ? v.parts.slice(0, 14).map(partOf) : undefined,
    scheme: s(v?.scheme, 4000),
  };
}

/** What's wrong with one body against its slot, in words the model can act on. */
function problems(item: BlueprintItem, b: QBody, what: string): string[] {
  const p: string[] = [];
  const t = item.type;
  if (t === 'mcq' && (b.options?.length !== 4 || b.answer === undefined || b.answer < 0 || b.answer > 3 || !b.text)) p.push(`${what}: an MCQ needs text, exactly 4 options and answer 0–3`);
  if (t === 'assertion_reason' && (!b.assertion || !b.reason || b.answer === undefined || b.answer < 0 || b.answer > 3)) p.push(`${what}: needs assertion, reason and answer 0–3`);
  if (WRITTEN.includes(t) && (!b.text || !b.scheme)) p.push(`${what}: needs text and a marking scheme`);
  if (t === 'map' && !b.vi) p.push(`${what}: a map question needs the visually impaired alternative ("vi")`);
  if (WITH_PARTS.includes(t)) {
    const parts = b.parts ?? [];
    if ((t === 'case' || t === 'passage' || t === 'extract') && !b.passage) p.push(`${what}: needs the passage/case/extract text`);
    if (item.choice?.kind === 'any') {
      const each = item.marks / item.choice.attempt;
      if (parts.length !== item.choice.of) p.push(`${what}: needs exactly ${item.choice.of} parts (students attempt ${item.choice.attempt})`);
      if (parts.some(x => x.marks !== each)) p.push(`${what}: each part carries ${each} mark${each === 1 ? '' : 's'}`);
    } else if (item.parts) {
      if (parts.length !== item.parts.length || parts.some((x, i) => x.marks !== item.parts![i])) p.push(`${what}: needs ${item.parts.length} parts carrying ${item.parts.join(', ')} marks`);
    } else if (parts.reduce((n, x) => n + x.marks, 0) !== item.marks) {
      p.push(`${what}: its parts must add up to ${item.marks} marks`);
    }
    for (const x of parts) {
      if (!x.text || !x.scheme) p.push(`${what} part ${x.label}: needs text and a scheme`);
      if (x.options && (x.options.length !== 4 || x.answer === undefined || x.answer < 0 || x.answer > 3)) p.push(`${what} part ${x.label}: an MCQ part needs 4 options and answer 0–3`);
    }
    if (item.choice?.kind === 'subpart' && !parts.some(x => x.or)) p.push(`${what}: the ${Math.max(...(item.parts ?? [2]))}-mark sub-part needs an "or" alternative`);
  }
  if (b.figure && !b.vi) p.push(`${what}: has a figure, so it needs the visually impaired alternative ("vi")`);
  if (!b.scheme && !WITH_PARTS.includes(t)) p.push(`${what}: needs a marking scheme`);
  return p;
}

/**
 * Checks a section the model wrote against its blueprint. Returns the questions in order (marks and chapter
 * from the blueprint) and the problems found; a section with problems is sent back once.
 */
export function readSection(items: BlueprintItem[], raw: unknown): { questions: PaperQuestion[]; problems: string[] } {
  const list = Array.isArray((raw as any)?.questions) ? (raw as any).questions : [];
  const byQ = new Map<number, any>(list.map((x: any) => [Number(x?.q), x]));
  const out: PaperQuestion[] = [];
  const issues: string[] = [];
  for (const item of items) {
    const v = byQ.get(item.q);
    if (!v) { issues.push(`Q${item.q} is missing`); continue; }
    const body = bodyOf(v);
    issues.push(...problems(item, body, `Q${item.q}`));
    let alt: QBody | undefined;
    if (item.choice?.kind === 'either') {
      alt = v?.alt ? bodyOf(v.alt) : undefined;
      if (!alt) issues.push(`Q${item.q}: needs an "alt" alternative (students answer one)`);
      else issues.push(...problems(item, alt, `Q${item.q} alternative`));
    }
    if (item.type === 'assertion_reason') { body.options = AR_OPTIONS; if (alt) alt.options = AR_OPTIONS; }
    out.push({ ...body, q: item.q, type: item.type, marks: item.marks, chapter: item.chapter, ...(alt ? { alt } : {}) });
  }
  return { questions: out, problems: issues };
}

/** Re-checks a stored paper (from the Copilot history) against its design: null if it no longer fits. */
export function checkPaper(raw: unknown): Paper | null {
  const r = raw as any;
  const design = designByKey(r?.design);
  if (!design || !Array.isArray(r?.sections)) return null;
  const slots = slotsOf(design);
  const qs: PaperQuestion[] = r.sections.flatMap((x: any) => (Array.isArray(x?.questions) ? x.questions : []));
  if (qs.length !== slots.length) return null;
  const sections = design.sections.map(sec => ({
    id: sec.id, title: sec.title,
    questions: sec.slots.map(slot => {
      const q = qs.find(x => Number(x?.q) === slot.q);
      return q ? { ...bodyOf(q), q: slot.q, type: slot.type, marks: slot.marks, chapter: s(q.chapter, 200), ...(q.alt ? { alt: bodyOf(q.alt) } : {}) } : null;
    }),
  }));
  if (sections.some(x => x.questions.some(q => !q))) return null;
  return { design: design.key, title: s(r.title, 200) || paperTitle(design), seed: Number(r.seed) || 0, sections: sections as PaperSection[] };
}

export const paperTitle = (d: PaperDesign) => `${d.subject}${d.variant ? ` (${d.variant})` : ''}: Class ${d.cls === 10 ? 'X' : 'XII'} practice paper, CBSE 2026-27 pattern`;
