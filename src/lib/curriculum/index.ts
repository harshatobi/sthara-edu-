/**
 * Official CBSE curriculum registry. Each JSON file under ./cbse-2026-27 is
 * transcribed from the board's published subject document (URL recorded in
 * the file) and checked by ./validate.ts: unit marks sum to the theory total,
 * internal components sum to the internal total.
 *
 * To add a subject: add its JSON file to ./cbse-2026-27, then run
 *   node scripts/generate-curriculum-registry.mjs
 *   npx tsx --tsconfig tsconfig.json src/lib/curriculum/validate.ts
 */
import type { CurriculumChapter, CurriculumSubject, CurriculumUnit } from './types';

import { SUBJECT_FILES } from './registry';

export type { CurriculumSubject, CurriculumUnit, CurriculumChapter } from './types';

export const CURRENT_SESSION = '2026-27';

export const CURRICULUM: CurriculumSubject[] = SUBJECT_FILES;

// ── Lookup ──────────────────────────────────────────────────────────────────

/** "Class 10-A", "10A", "X", "10" → "10". Returns null when no class 8-12 is recognisable. */
export function normaliseClass(raw: string | null | undefined): string | null {
  const s = (raw || '').toUpperCase();
  const digits = s.match(/\b(8|9|10|11|12)(?!\d)/);
  if (digits) return digits[1];
  const roman: Record<string, string> = { VIII: '8', IX: '9', X: '10', XI: '11', XII: '12' };
  const r = s.match(/\b(XII|XI|IX|VIII|X)\b/);
  return r ? roman[r[1]] : null;
}

const SUBJECT_ALIASES: Record<string, string> = {
  maths: 'mathematics', math: 'mathematics', mathematics: 'mathematics',
  science: 'science', sci: 'science',
  'social science': 'social science', 'social studies': 'social science', sst: 'social science', 'social sciences': 'social science',
  physics: 'physics', chemistry: 'chemistry', biology: 'biology', bio: 'biology',
  accounts: 'accountancy', acc: 'accountancy', bst: 'business studies', eco: 'economics', econ: 'economics',
  'pol sci': 'political science', 'political sci': 'political science', civics: 'political science',
  cs: 'computer science', ip: 'informatics practices', pe: 'physical education', 'phy ed': 'physical education',
  geo: 'geography', hist: 'history', psych: 'psychology', socio: 'sociology',
};

export function normaliseSubject(raw: string | null | undefined): string | null {
  const k = (raw || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!k) return null;
  // Prefixes only match whole words ("bio chem" -> biology), never "biotechnology".
  return SUBJECT_ALIASES[k] ?? Object.entries(SUBJECT_ALIASES).find(([a]) => k.startsWith(a + ' '))?.[1] ?? k;
}

/** Lowercased name with punctuation collapsed, keeping non-Latin scripts (Hindi, Sanskrit names). */
const key = (s: string) => s.toLowerCase().replace(/[()\-–,.&]/g, ' ').replace(/\s+/g, ' ').trim();

/** The official curriculum for a class + subject, or null if it isn't ingested yet. */
export function getCurriculum(cls: string | null | undefined, subject: string | null | undefined, session = CURRENT_SESSION): CurriculumSubject | null {
  const c = normaliseClass(cls);
  if (!c || !subject) return null;
  const inClass = CURRICULUM.filter(x => x.session === session && x.class === c);
  const raw = key(subject);
  // 1. exact subject name, 2. a declared alias, 3. the abbreviation table.
  const exact = inClass.find(x => key(x.subject) === raw) ?? inClass.find(x => x.aliases?.some(a => key(a) === raw));
  if (exact) return exact;
  const s = normaliseSubject(subject);
  return s ? inClass.find(x => x.subject.toLowerCase() === s) ?? inClass.find(x => x.aliases?.some(a => key(a) === s)) ?? null : null;
}

/**
 * The subjects every student of a class takes, as a sensible default for
 * pickers and class setup. Classes 11-12 are stream-based, so only the core
 * language is compulsory there; electives come from subjectsForClass.
 */
export function coreSubjectsForClass(cls: string | null | undefined, session = CURRENT_SESSION): string[] {
  const c = normaliseClass(cls);
  const core: Record<string, string[]> = {
    '8': ['English', 'Hindi', 'Mathematics', 'Science', 'Social Science'],
    '9': ['English', 'Hindi', 'Mathematics', 'Science', 'Social Science'],
    '10': ['English Language and Literature', 'Hindi Course A', 'Mathematics', 'Science', 'Social Science'],
    '11': ['English Core'],
    '12': ['English Core'],
  };
  const have = new Set(subjectsForClass(c, session));
  return (c ? core[c] ?? [] : []).filter(s => have.has(s));
}

/** Ingested subjects of a class grouped by stream (Language, Science, Commerce ...), for grouped pickers. */
export function subjectsByStream(cls: string | null | undefined, session = CURRENT_SESSION): { stream: string; subjects: string[] }[] {
  const c = normaliseClass(cls);
  const groups = new Map<string, string[]>();
  for (const x of CURRICULUM) {
    if (x.session !== session || x.class !== c) continue;
    const k = x.stream ?? 'Other';
    groups.set(k, [...(groups.get(k) ?? []), x.subject]);
  }
  return [...groups].map(([stream, subjects]) => ({ stream, subjects: subjects.sort() }));
}

/** Subjects ingested for a class (for pickers). */
export function subjectsForClass(cls: string | null | undefined, session = CURRENT_SESSION): string[] {
  const c = normaliseClass(cls);
  return CURRICULUM.filter(x => x.session === session && x.class === c).map(x => x.subject);
}

// ── Derived views ───────────────────────────────────────────────────────────

export interface FlatChapter extends CurriculumChapter {
  unitCode: string;
  unitName: string;
  /** Marks of the whole unit the chapter sits in (null if not yet published). */
  unitMarks: number | null;
  /**
   * The chapter's even share of its unit's marks, among the unit's summative
   * chapters. An approximation for planning and prioritising only: the board
   * publishes unit marks, not chapter marks (and says so explicitly for Maths).
   * 0 for formative-only chapters; null when unit marks aren't published.
   */
  approxMarks: number | null;
}

export function flattenChapters(sub: CurriculumSubject): FlatChapter[] {
  return sub.units.flatMap((u: CurriculumUnit) => {
    const summative = u.chapters.filter(ch => !ch.formativeOnly).length;
    return u.chapters.map(ch => ({
      ...ch,
      unitCode: u.code,
      unitName: u.name,
      unitMarks: u.marks,
      approxMarks: ch.formativeOnly ? 0 : u.marks === null || summative === 0 ? null : Math.round((u.marks / summative) * 10) / 10,
    }));
  });
}

export interface CourseChapter extends FlatChapter {
  /** Position in teaching order, 1…n — what the UI numbers chapters by. */
  seq: number;
}

/**
 * Chapters in teaching order. Curriculum documents list chapters by unit
 * (theme), which can scramble the textbook order (Class 9 Science: 2, 3, 11,
 * 12, 5 …). When every chapter carries a distinct NCERT number, that number is
 * the teaching order; otherwise (unnumbered, or numbering restarting per book
 * as in Social Science) the document order stands.
 */
export function courseChapters(sub: CurriculumSubject): CourseChapter[] {
  const flat = flattenChapters(sub);
  const nums = flat.map(c => c.number);
  const ordered = nums.every((n): n is number => typeof n === 'number') && new Set(nums).size === nums.length
    ? [...flat].sort((a, b) => a.number! - b.number!)
    : flat;
  return ordered.map((c, i) => ({ ...c, seq: i + 1 }));
}

/** Chapters that appear in the year-end board paper (for tutor, tests, TML focus). */
export const summativeChapters = (sub: CurriculumSubject) => flattenChapters(sub).filter(ch => !ch.formativeOnly);
