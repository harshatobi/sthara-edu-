/**
 * Official CBSE curriculum registry. Each JSON file under ./cbse-2026-27 is
 * transcribed from the board's published subject document (URL recorded in
 * the file) and checked by ./validate.ts: unit marks sum to the theory total,
 * internal components sum to the internal total.
 *
 * To add a subject: add its JSON file here and to FILES below, then run
 *   npx tsx src/lib/curriculum/validate.ts
 */
import type { CurriculumChapter, CurriculumSubject, CurriculumUnit } from './types';

import m9 from './cbse-2026-27/09-mathematics.json';
import s9 from './cbse-2026-27/09-science.json';
import ss9 from './cbse-2026-27/09-social-science.json';
import m10 from './cbse-2026-27/10-mathematics.json';
import s10 from './cbse-2026-27/10-science.json';
import ss10 from './cbse-2026-27/10-social-science.json';
import p11 from './cbse-2026-27/11-physics.json';
import c11 from './cbse-2026-27/11-chemistry.json';
import b11 from './cbse-2026-27/11-biology.json';
import m11 from './cbse-2026-27/11-mathematics.json';
import p12 from './cbse-2026-27/12-physics.json';
import c12 from './cbse-2026-27/12-chemistry.json';
import b12 from './cbse-2026-27/12-biology.json';
import m12 from './cbse-2026-27/12-mathematics.json';

export type { CurriculumSubject, CurriculumUnit, CurriculumChapter } from './types';

export const CURRENT_SESSION = '2026-27';

export const CURRICULUM: CurriculumSubject[] = [m9, s9, ss9, m10, s10, ss10, p11, c11, b11, m11, p12, c12, b12, m12] as CurriculumSubject[];

// ── Lookup ──────────────────────────────────────────────────────────────────

/** "Class 10-A", "10A", "X", "10" → "10". Returns null when no class 9-12 is recognisable. */
export function normaliseClass(raw: string | null | undefined): string | null {
  const s = (raw || '').toUpperCase();
  const digits = s.match(/\b(9|10|11|12)(?!\d)/);
  if (digits) return digits[1];
  const roman: Record<string, string> = { IX: '9', X: '10', XI: '11', XII: '12' };
  const r = s.match(/\b(XII|XI|IX|X)\b/);
  return r ? roman[r[1]] : null;
}

const SUBJECT_ALIASES: Record<string, string> = {
  maths: 'mathematics', math: 'mathematics', mathematics: 'mathematics',
  science: 'science', sci: 'science',
  'social science': 'social science', 'social studies': 'social science', sst: 'social science', 'social sciences': 'social science',
  physics: 'physics', chemistry: 'chemistry', biology: 'biology', bio: 'biology',
};

export function normaliseSubject(raw: string | null | undefined): string | null {
  const k = (raw || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!k) return null;
  return SUBJECT_ALIASES[k] ?? Object.entries(SUBJECT_ALIASES).find(([a]) => k.startsWith(a))?.[1] ?? k;
}

/** The official curriculum for a class + subject, or null if it isn't ingested yet. */
export function getCurriculum(cls: string | null | undefined, subject: string | null | undefined, session = CURRENT_SESSION): CurriculumSubject | null {
  const c = normaliseClass(cls);
  const s = normaliseSubject(subject);
  if (!c || !s) return null;
  return CURRICULUM.find(x => x.session === session && x.class === c && x.subject.toLowerCase() === s) ?? null;
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
