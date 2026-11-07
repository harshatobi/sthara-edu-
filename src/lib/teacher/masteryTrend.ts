/**
 * Mastery trends from tml_history (weekly roll-up, one row per student, subject, topic and week). Pure.
 *
 * A chapter's score in a week is its latest row on or before that week (a score holds until new evidence moves it);
 * a student's subject score in a week is the mean of the chapters they have scores for by then (the desk's rule,
 * lib/teacher/mastery studentOverall). Weeks before any evidence are gaps (null), never zeros.
 */
import { istWeek } from '@/lib/tml/engine';
import { topicKey } from './topicKey';

export interface HistoryRow { student_id: string; subject: string; topic_name: string; week: string; score: number | string; item_count?: number; confidence_band?: string }
export type Series = (number | null)[];

const DAY = 86_400_000;
const r0 = (n: number) => Math.round(n);

/** The last `n` India weeks (Mondays), oldest first, ending with the week of `nowMs`. */
export function weeksBack(n: number, nowMs: number): string[] {
  const out: string[] = [];
  let ms = nowMs;
  for (let i = 0; i < n; i++) { out.unshift(istWeek(ms)); ms -= 7 * DAY; }
  return out;
}

export interface StudentTrend {
  /** Desk chapter key -> weekly score. */
  chapters: Record<string, Series>;
  subject: Series;
}

/** One student's rows (already filtered to a subject) -> weekly series over `weeks`. */
export function studentTrend(rows: HistoryRow[], weeks: string[]): StudentTrend {
  const byChapter = new Map<string, { week: string; score: number }[]>();
  for (const r of rows) {
    const k = topicKey(r.topic_name);
    if (!k) continue;
    const list = byChapter.get(k) ?? [];
    list.push({ week: r.week, score: Number(r.score) });
    byChapter.set(k, list);
  }
  const chapters: Record<string, Series> = {};
  for (const [k, list] of byChapter) {
    list.sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));
    let i = 0, cur: number | null = null;
    chapters[k] = weeks.map(w => {
      while (i < list.length && list[i].week <= w) cur = list[i++].score;
      return cur === null ? null : r0(cur);
    });
  }
  const subject = weeks.map((_, wi) => {
    const vals = Object.values(chapters).map(s => s[wi]).filter((v): v is number => v !== null);
    return vals.length ? r0(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });
  return { chapters, subject };
}

/** Change over the last `back` weeks: latest value minus the value `back` weeks before it (null when either is missing). */
export function change(s: Series, back = 4): number | null {
  const last = s.length - 1;
  const now = s[last], then = s[last - back];
  return now == null || then == null ? null : now - then;
}

/** Week-by-week mean across students (null where nobody has a score). */
export function meanSeries(all: Series[], weeks: number): Series {
  return Array.from({ length: weeks }, (_, i) => {
    const vals = all.map(s => s[i]).filter((v): v is number => v != null);
    return vals.length ? r0(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });
}

export interface Spread { n: number; avg: number; min: number; q1: number; median: number; q3: number; max: number }

/** Distribution of a class's scores (null for none). Quartiles by linear interpolation. */
export function spread(values: number[]): Spread | null {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p: number) => { const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return r0(v[lo] + (v[hi] - v[lo]) * (i - lo)); };
  return { n: v.length, avg: r0(v.reduce((a, b) => a + b, 0) / v.length), min: v[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: v[v.length - 1] };
}

/** 1-based rank, highest first; ties share the better rank. */
export function rankOf(value: number, values: number[]): number {
  return values.filter(x => x > value).length + 1;
}

/** Students sorted by change, biggest risers and fallers (at least `min` points either way). */
export function movers<T extends { change: number | null }>(list: T[], min = 5, n = 5): { up: T[]; down: T[] } {
  const moved = list.filter((x): x is T & { change: number } => x.change !== null);
  return {
    up: moved.filter(x => x.change >= min).sort((a, b) => b.change - a.change).slice(0, n),
    down: moved.filter(x => x.change <= -min).sort((a, b) => a.change - b.change).slice(0, n),
  };
}
