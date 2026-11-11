/**
 * Sanitising Studio items and question-set content, whoever sent them (the AI, the bank, a teacher's edit, a
 * stored row). Pure. Anything that can't be made valid is dropped, never stored broken.
 */
import { parseFigures, parseTextVersion } from './figures';
import { sanitizeSvg } from '@/lib/teacher/svg';
import { parseBlueprint, defaultBlueprint } from './blueprint';
import { ACCESS_NEEDS, COMPETENCIES, QTYPES, isChoice, newItemId, type AccessNeed, type Audience, type CheckStatus, type QuestionSetContent, type SetKind, type StudioItem } from './types';

const s = (v: unknown, n = 2000) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const CHECK: CheckStatus[] = ['unchecked', 'passed', 'rewritten', 'flagged'];
const SET_KINDS: SetKind[] = ['worksheet', 'quiz', 'catchup', 'exit_ticket', 'test'];
const AUDIENCES: Audience[] = ['class', 'per_student', 'abc'];
const UUID = /^[0-9a-f-]{36}$/i;

export function parseItem(raw: unknown, defaults: Partial<StudioItem> = {}): StudioItem | null {
  const r = (raw ?? {}) as any;
  const qtype = (QTYPES as readonly string[]).includes(r.qtype) ? r.qtype : defaults.qtype ?? (Array.isArray(r.options) && r.options.length ? 'mcq' : 'short');
  const competency = (COMPETENCIES as readonly string[]).includes(r.competency) ? r.competency : defaults.competency ?? 'apply';
  const text = s(r.text ?? r.question ?? r.questionText, 2000);
  if (!text) return null;
  const marks = Math.max(1, Math.min(10, Math.round(Number(r.marks ?? defaults.marks) || 1)));
  const item: StudioItem = {
    id: typeof r.id === 'string' && r.id.length <= 64 && r.id ? r.id : newItemId(),
    bankId: typeof r.bankId === 'string' && UUID.test(r.bankId) ? r.bankId : defaults.bankId ?? null,
    source: r.source === 'bank' || r.source === 'teacher' || r.source === 'ai' ? r.source : defaults.source ?? 'ai',
    qtype, competency, marks: isChoice(qtype) ? 1 : marks,
    chapterKey: s(r.chapterKey, 200) || defaults.chapterKey || '',
    topic: s(r.topic, 300) || defaults.topic || '',
    outcomeCode: s(r.outcomeCode, 40) || null,
    text,
    scheme: s(r.scheme ?? r.why ?? r.explanation ?? r.markingScheme, 3000),
    check: {
      status: CHECK.includes(r.check?.status) ? r.check.status : 'unchecked',
      notes: Array.isArray(r.check?.notes) ? r.check.notes.map((x: unknown) => s(x, 400)).filter(Boolean).slice(0, 6) : [],
      ...(r.check?.computed ? { computed: true } : {}),
    },
    difficulty: typeof r.difficulty === 'number' && r.difficulty >= 0 && r.difficulty <= 1 ? r.difficulty : null,
    stats: r.stats && Number.isFinite(r.stats.attempts) ? { attempts: Math.max(0, r.stats.attempts | 0), correct: Math.max(0, r.stats.correct | 0), schools: Math.max(0, r.stats.schools | 0) } : null,
  };
  if (isChoice(qtype)) {
    const options = (Array.isArray(r.options) ? r.options : []).slice(0, 6).map((o: unknown) => s(o, 500).replace(/^\(?[A-F][.)]\s+/, ''));
    const answer = Number(r.answer ?? r.correctAnswerIndex);
    if (options.length < 2 || options.some((o: string) => !o) || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
    if (new Set(options.map((o: string) => o.toLowerCase())).size !== options.length) return null;
    item.options = options; item.answer = answer;
  }
  if (qtype === 'numerical') {
    const v = Number(r.value);
    item.value = Number.isFinite(v) ? v : null;
    item.unit = s(r.unit, 40) || null;
  }
  const alt = s(r.figure?.alt, 600);
  const svg = r.figure?.svg ? sanitizeSvg(r.figure.svg) : null;
  if (alt || svg) item.figure = { svg: svg || null, alt: alt || 'A figure for this question.' };
  const figures = parseFigures(r.figures), schemeFigures = parseFigures(r.schemeFigures);
  if (figures.length) item.figures = figures;
  if (schemeFigures.length) item.schemeFigures = schemeFigures;
  const tv = parseTextVersion(r.textVersion ?? r.access);
  if (tv) item.textVersion = tv;
  if (typeof r.sourceRef === 'string' && r.sourceRef.trim()) item.sourceRef = r.sourceRef.trim().slice(0, 300);
  return item;
}

export function parseItems(raw: unknown, max = 120): StudioItem[] {
  return (Array.isArray(raw) ? raw : []).slice(0, max).map(x => parseItem(x)).filter((x): x is StudioItem => !!x);
}

export const parseNeeds = (raw: unknown): AccessNeed[] =>
  [...new Set((Array.isArray(raw) ? raw : []).filter((x): x is AccessNeed => (ACCESS_NEEDS as readonly string[]).includes(x as string)))];

/** A stored or posted question set; references to items that aren't in `items` are dropped. */
export function parseQuestionSet(raw: unknown): QuestionSetContent | null {
  const r = (raw ?? {}) as any;
  if (r.type !== 'questions') return null;
  const items = parseItems(r.items);
  if (!items.length) return null;
  const ids = new Set(items.map(i => i.id));
  const keep = (xs: unknown) => (Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string' && ids.has(x)) : []);
  const setKind: SetKind = SET_KINDS.includes(r.setKind) ? r.setKind : 'worksheet';
  return {
    type: 'questions', setKind,
    topics: (Array.isArray(r.topics) ? r.topics : []).map((t: unknown) => s(t, 300)).filter(Boolean).slice(0, 12),
    blueprint: parseBlueprint(r.blueprint) ?? defaultBlueprint(setKind),
    audience: AUDIENCES.includes(r.audience) ? r.audience : 'class',
    items,
    order: keep(r.order).length ? keep(r.order) : items.map(i => i.id),
    versions: (Array.isArray(r.versions) ? r.versions : []).slice(0, 200)
      .filter((v: any) => typeof v?.studentId === 'string' && UUID.test(v.studentId))
      .map((v: any) => ({ studentId: v.studentId, itemIds: keep(v.itemIds), reason: s(v.reason, 300), access: parseNeeds(v.access) })),
    sets: (Array.isArray(r.sets) ? r.sets : []).slice(0, 4).map((x: any, i: number) => ({ label: s(x?.label, 4) || 'ABCD'[i], itemIds: keep(x?.itemIds) })),
    handout: r.handout === 'paper' || r.handout === 'both' ? r.handout : 'online',
    basis: s(r.basis, 600),
  };
}

/** Items that block handing the set out (a check failed even after one rewrite). */
export const blocking = (c: QuestionSetContent) => c.items.filter(i => i.check.status === 'flagged');
