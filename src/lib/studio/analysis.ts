/**
 * After marking: how each question went, which wrong answers were popular, which topics the class (and each student)
 * missed, and who should get the retest. Pure: the analysis route loads the rows, this shapes them.
 *
 * A question is identified by its `key`: the bank item when there is one (so per-student versions and A/B/C sets,
 * where the same question sits at different positions, count together), else its position in the paper.
 */

export interface AQuestion {
  key: string;
  text: string;
  marks: number;
  topic: string | null;
  competency: string | null;
  options: string[] | null;
  /** Index of the right option, for choice questions. */
  answer: number | null;
  bankId: string | null;
}
export interface AMark { studentId: string; key: string; score: number; max: number; /** chosen option, when it's a choice question */ pick: number | null }
export interface AStudent { id: string; name: string }

export type QFlag = 'hard' | 'easy' | 'not_separating' | 'reversed' | 'distractor';
export interface QResult {
  key: string; n: number;
  /** Mean share of marks, 0-1. */
  facility: number | null;
  full: number;
  /** Top 27% minus bottom 27% mean share (by whole-paper share), -1..1; null under 6 answers. */
  discrimination: number | null;
  picks: number[] | null;
  /** The most-picked wrong option, when it drew at least two students and a fifth of the answers. */
  popularWrong: { option: number; count: number } | null;
  missed: string[];
  flags: QFlag[];
}
export interface TopicResult { topic: string; facility: number; students: number; missed: string[] }
export interface StudentResult { id: string; name: string; share: number | null; weakTopics: string[] }
export interface Analysis { questions: QResult[]; topics: TopicResult[]; students: StudentResult[]; handedIn: number; marked: number }

const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** A student "missed" a question when they got under half its marks. */
const missedIt = (m: AMark) => m.max > 0 && m.score / m.max < 0.5;

export function analyse(questions: AQuestion[], marks: AMark[], students: AStudent[], handedIn = students.length): Analysis {
  const qByKey = new Map(questions.map(q => [q.key, q]));
  const valid = marks.filter(m => qByKey.has(m.key) && m.max > 0);

  // Whole-paper share per student (only what they were marked on).
  const share = new Map<string, number>();
  const byStudent = new Map<string, AMark[]>();
  for (const m of valid) byStudent.set(m.studentId, [...(byStudent.get(m.studentId) ?? []), m]);
  for (const [id, ms] of byStudent) {
    const out = ms.reduce((n, m) => n + m.max, 0);
    if (out > 0) share.set(id, ms.reduce((n, m) => n + Math.max(0, Math.min(m.score, m.max)), 0) / out);
  }
  const ranked = [...share.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const cut = Math.max(1, Math.round(ranked.length * 0.27));
  const top = new Set(ranked.slice(0, cut)), bottom = new Set(ranked.slice(-cut));

  const qs: QResult[] = questions.map(q => {
    const ms = valid.filter(m => m.key === q.key);
    const shares = ms.map(m => Math.max(0, Math.min(m.score, m.max)) / m.max);
    const facility = ms.length ? r2(mean(shares)) : null;
    let discrimination: number | null = null;
    if (ms.length >= 6 && ranked.length >= 6) {
      const t = ms.filter(m => top.has(m.studentId)), b = ms.filter(m => bottom.has(m.studentId));
      if (t.length && b.length) discrimination = r2(mean(t.map(m => m.score / m.max)) - mean(b.map(m => m.score / m.max)));
    }
    let picks: number[] | null = null, popularWrong: QResult['popularWrong'] = null;
    if (q.options?.length) {
      picks = q.options.map(() => 0);
      for (const m of ms) if (m.pick !== null && m.pick >= 0 && m.pick < picks.length) picks[m.pick]++;
      const answered = picks.reduce((a, b) => a + b, 0);
      const wrong = picks.map((c, i) => ({ option: i, count: c })).filter(x => x.option !== q.answer).sort((a, b) => b.count - a.count)[0];
      if (wrong && wrong.count >= 2 && wrong.count >= answered * 0.2) popularWrong = wrong;
    }
    const flags: QFlag[] = [];
    if (facility !== null && ms.length >= 3) {
      if (facility < 0.4) flags.push('hard');
      if (facility > 0.9) flags.push('easy');
    }
    if (discrimination !== null) {
      if (discrimination < 0) flags.push('reversed');
      else if (discrimination < 0.15 && !flags.includes('easy')) flags.push('not_separating');
    }
    if (picks && q.answer !== null && popularWrong && popularWrong.count > picks[q.answer]) flags.push('distractor');
    return { key: q.key, n: ms.length, facility, full: ms.filter(m => m.score >= m.max).length, discrimination, picks, popularWrong, missed: ms.filter(missedIt).map(m => m.studentId), flags };
  });

  // Topics: share of marks per topic across the class, and who got under half of a topic's marks.
  const topicOf = (k: string) => qByKey.get(k)?.topic || null;
  const topicAcc = new Map<string, Map<string, { got: number; out: number }>>();
  for (const m of valid) {
    const t = topicOf(m.key);
    if (!t) continue;
    const per = topicAcc.get(t) ?? new Map();
    const c = per.get(m.studentId) ?? { got: 0, out: 0 };
    c.got += Math.max(0, Math.min(m.score, m.max)); c.out += m.max;
    per.set(m.studentId, c); topicAcc.set(t, per);
  }
  const topics: TopicResult[] = [...topicAcc.entries()].map(([topic, per]) => {
    const all = [...per.values()];
    const got = all.reduce((n, c) => n + c.got, 0), out = all.reduce((n, c) => n + c.out, 0);
    return { topic, facility: out ? r2(got / out) : 0, students: per.size, missed: [...per.entries()].filter(([, c]) => c.out > 0 && c.got / c.out < 0.5).map(([id]) => id) };
  }).sort((a, b) => a.facility - b.facility);

  const studentsOut: StudentResult[] = students.map(s => ({
    id: s.id, name: s.name, share: share.has(s.id) ? r2(share.get(s.id)!) : null,
    weakTopics: topics.filter(t => t.missed.includes(s.id)).map(t => t.topic),
  }));

  return { questions: qs, topics, students: studentsOut, handedIn, marked: share.size };
}

/**
 * The retest the analysis proposes (the teacher confirms before anything is made or assigned): students who missed
 * at least one weak topic, each on their own weak topics. A topic is weak when the class got under 60% of it.
 */
export function proposeRetest(a: Analysis): { topics: string[]; students: { id: string; name: string; topics: string[] }[] } {
  const weak = a.topics.filter(t => t.facility < 0.6 && t.missed.length).map(t => t.topic);
  const students = a.students
    .map(s => ({ id: s.id, name: s.name, topics: s.weakTopics.filter(t => weak.includes(t)) }))
    .filter(s => s.topics.length);
  return { topics: weak, students };
}

/** Plain words for each flag, shown beside the question. */
export const FLAG_TEXT: Record<QFlag, string> = {
  hard: 'Most of the class found this hard',
  easy: 'Nearly everyone got this',
  not_separating: 'Strong and weak students did about the same: check the wording',
  reversed: 'Weaker students did better than stronger ones: check the answer key and wording',
  distractor: 'A wrong option was picked more than the right one',
};

/** Retention checks run this many days after the work was due (decision: 2-3 weeks after it was taught). */
export const RETENTION_DAYS = 17;

/** The date a retention check falls on: the due date plus RETENTION_DAYS, moved off Sunday. */
export function retentionDate(dueIso: string): string {
  const d = new Date(Date.parse(`${dueIso}T00:00:00Z`) + RETENTION_DAYS * 86_400_000);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** What the retention picker needs of a bank question (a StudioItem fits). */
export interface RetentionCandidate {
  id: string; topic: string; qtype: string; marks: number; competency: string;
  check: { status: string }; stats?: { attempts: number; correct: number } | null;
}

/**
 * The 3-5 bank questions for a retention check: on the topics that were taught, instantly marked (choice questions,
 * so it costs the teacher nothing), not the questions the class already had, spread across topics and mixing
 * recall with application. Returns [] when fewer than three fit, so the teacher is asked instead.
 */
export function pickRetention<T extends RetentionCandidate>(pool: T[], topics: string[], exclude: Set<string>, n = 5): T[] {
  const choice = (q: T) => q.qtype === 'mcq' || q.qtype === 'assertion_reason';
  const onTopic = (q: T) => !topics.length || topics.some(t => q.topic && (q.topic.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(q.topic.toLowerCase())));
  const ok = pool.filter(q => choice(q) && onTopic(q) && !exclude.has(q.id) && q.check.status !== 'flagged');
  // Questions with real results and a clean check first, then a stable order.
  ok.sort((a, b) => Number((b.stats?.attempts ?? 0) >= 10) - Number((a.stats?.attempts ?? 0) >= 10)
    || Number(b.check.status === 'passed') - Number(a.check.status === 'passed') || a.id.localeCompare(b.id));
  const out: T[] = [];
  const byTopic = new Map<string, T[]>();
  for (const q of ok) byTopic.set(q.topic || '', [...(byTopic.get(q.topic || '') ?? []), q]);
  // Round-robin across topics, alternating recall and application where both exist.
  const queues = [...byTopic.values()].map(qs => [...qs.filter(q => q.competency !== 'remember_understand'), ...qs.filter(q => q.competency === 'remember_understand')]);
  let round = 0;
  while (out.length < n && queues.some(q => q.length)) {
    for (const q of queues) {
      if (out.length >= n || !q.length) continue;
      const wantRecall = round % 2 === 1;
      const i = Math.max(0, q.findIndex(x => (x.competency === 'remember_understand') === wantRecall));
      out.push(q.splice(i, 1)[0]);
    }
    round++;
  }
  return out.length >= 3 ? out : [];
}
