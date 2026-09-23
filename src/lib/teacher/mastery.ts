/**
 * Chapter-level mastery for the Class Heat Map and Mastery Tracker. Pure.
 *
 * TML is stored per topic, and a topic is the chapter an assignment was set
 * on (assignments.units[0]) or the chapter of a tutor session. So the grain
 * the data really has is student × chapter; these helpers never invent
 * finer (micro-topic) scores than that.
 */
import { courseChapters, getCurriculum } from '@/lib/curriculum';
import { normSubject } from './scope';
import { topicKey, type TStudent, type TopicScore } from './desk';

export interface ChapterRef {
  key: string; name: string;
  /** 1…n in teaching order (what the UI shows). */
  seq: number;
  /** NCERT textbook chapter number, when the curriculum gives one. */
  ncert: number | null;
  unit: string | null; inCurriculum: boolean;
}

/** The class's chapters for a subject: the official curriculum, then any other topic with evidence. */
export function chaptersFor(cls: string, subject: string, roster: TStudent[]): ChapterRef[] {
  const cur = getCurriculum(cls, subject);
  const list: ChapterRef[] = cur
    ? courseChapters(cur).map(c => ({ key: topicKey(c.name), name: c.name, seq: c.seq, ncert: c.number ?? null, unit: c.unitName, inCurriculum: true }))
    : [];
  const known = new Set(list.map(c => c.key));
  const sk = normSubject(subject);
  for (const s of roster) {
    for (const [k, t] of Object.entries(s.topics[sk] ?? {})) {
      if (known.has(k)) continue;
      known.add(k);
      list.push({ key: k, name: t.name, seq: list.length + 1, ncert: null, unit: null, inCurriculum: false });
    }
  }
  return list;
}

export const scoreFor = (s: TStudent, subject: string, chapterKey: string): TopicScore | null =>
  s.topics[normSubject(subject)]?.[chapterKey] ?? null;

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export interface ChapterStat extends ChapterRef {
  avg: number | null;
  /** Students with a score, split by the heat bands (<40 / 40–74 / ≥75). */
  r: number; a: number; g: number; scored: number;
}

export function chapterStats(chapters: ChapterRef[], roster: TStudent[], subject: string): ChapterStat[] {
  return chapters.map(c => {
    const vals = roster.map(s => scoreFor(s, subject, c.key)?.score).filter((v): v is number => typeof v === 'number');
    return { ...c, avg: mean(vals), r: vals.filter(v => v < 40).length, a: vals.filter(v => v >= 40 && v < 75).length, g: vals.filter(v => v >= 75).length, scored: vals.length };
  });
}

/** A student's subject mastery: mean of their chapter scores (same rule as the student desk). */
export function studentOverall(s: TStudent, subject: string): number | null {
  return mean(Object.values(s.topics[normSubject(subject)] ?? {}).map(t => t.score));
}

export const BAND_LABEL: Record<string, string> = { firm: 'Confirmed', provisional: 'Still building', insufficient: 'Not enough yet' };

/** Short radar label: "Pair of Linear Equations in Two Variables" -> "Pair of Li…". */
export const shortLabel = (name: string, n = 12) => (name.length > n ? `${name.slice(0, n - 1)}…` : name);
