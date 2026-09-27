/**
 * Competitive exam syllabi linked to the CBSE curriculum. Used for the exam
 * track (enabled per school/section, then chosen per student): the tutor and
 * planner can show which board chapters feed an exam and what lies beyond the
 * board syllabus.
 *
 * To add an exam: add its JSON to this folder, then run
 *   node scripts/generate-curriculum-registry.mjs
 *   npx tsx --tsconfig tsconfig.json src/lib/curriculum/validate.ts
 */
import type { ChapterRef, ExamSyllabus, ExamUnit } from './types';
import { EXAM_FILES } from './registry';

export type { ChapterRef, ExamSubject, ExamSyllabus, ExamTrack, ExamUnit } from './types';

export const EXAMS: ExamSyllabus[] = EXAM_FILES;

export const getExam = (id: string | null | undefined) => EXAMS.find(e => e.id === id) ?? null;

export interface ExamHit { exam: ExamSyllabus; subject: string; unit: ExamUnit }

/** Every exam unit that draws on a given CBSE chapter ("this chapter matters for NEET, JEE Main ..."). */
export function examsForChapter(cls: string, subject: string, chapter: string, examIds?: string[]): ExamHit[] {
  const hits: ExamHit[] = [];
  for (const exam of EXAMS) {
    if (examIds && !examIds.includes(exam.id)) continue;
    for (const s of exam.subjects) {
      for (const unit of s.units) {
        if (unit.mapsTo.some(r => r.class === cls && r.subject === subject && r.chapter === chapter)) hits.push({ exam, subject: s.subject, unit });
      }
    }
  }
  return hits;
}

/** Units of an exam with content beyond the CBSE board syllabus: what a board student must study extra. */
export function beyondBoard(examId: string): ExamHit[] {
  const exam = getExam(examId);
  if (!exam) return [];
  return exam.subjects.flatMap(s => s.units.filter(u => u.beyondBoard?.length || u.mapsTo.length === 0).map(unit => ({ exam, subject: s.subject, unit })));
}

export const chapterKey = (r: ChapterRef) => `${r.class}|${r.subject}|${r.chapter}`;
