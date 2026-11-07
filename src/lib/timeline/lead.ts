/**
 * What each role's timeline opens with (Moses, 2026-11-06: "each one, student, teacher, admin and parent, has a
 * different view of the timeline"). Pure, from the same rows and lens as the rest of the timeline, so a role's lead
 * never shows anything its lens doesn't already allow.
 *
 *   student  wins to celebrate, a streak, and one next step (the lowest chapter, with the tutor).
 *   parent   how the child is doing in plain words, what to celebrate, what needs attention and how to help at home.
 *   teacher  teaching signals in their scope: chapters slipping and improving, tutor depth, homework, attendance runs,
 *            and a suggested action.
 *   office   by role: the principal's office everything, accounts the fees, the counsellor wellbeing, the registrar
 *            the register.
 */
import { normSubject } from '@/lib/teacher/scope';
import { topicKey } from '@/lib/teacher/topicKey';
import { inr, plural } from '@/lib/admin/format';
import { day, feesOf, homeworkOf, monthLabel, sees, visible, type Lens, type MonthPoint, type OfficeFocus, type Rows, type TimelineEvent } from './rules';

export interface ChapterNow { subject: string; topic: string; score: number; prev: number | null }
export interface Attention { key: string; tone: 'a' | 'r'; title: string; detail: string; help?: string }
export interface Lead {
  who: Lens['who'];
  focus: OfficeFocus | null;
  /** Milestones from the last 45 days, newest first (at most 4). */
  wins: TimelineEvent[];
  attention: Attention[];
  /** The lowest chapter now, when it is under 75%. */
  next: ChapterNow | null;
  improving: ChapterNow[];
  slipping: ChapterNow[];
  /** Consecutive recent months with attendance of 95% or more. */
  streak: number;
  /** The last 60 days. */
  homework: { done: number; set: number } | null;
  /** The last 30 days. */
  tutor: { sessions: number; depth: number | null } | null;
  fees: { billed: number; paid: number; due: number } | null;
  care: { months: { month: string; checkins: number; low: number }[]; counselling: string | null } | null;
}

const DAY = 86_400_000;
const ago = (today: string, days: number) => new Date(Date.parse(`${today}T00:00:00Z`) - days * DAY).toISOString().slice(0, 10);

/** Latest score per chapter, and what it was about a month earlier. */
export function chaptersNow(tml: { subject: string; topic_name: string; score: number | string; computed_at: string }[], today: string): ChapterNow[] {
  const cut = ago(today, 30);
  const by = new Map<string, { subject: string; topic: string; snaps: { at: string; score: number }[] }>();
  for (const r of tml) {
    const k = `${normSubject(r.subject)}::${topicKey(r.topic_name)}`;
    const e = by.get(k) ?? { subject: r.subject, topic: r.topic_name, snaps: [] };
    e.snaps.push({ at: day(r.computed_at), score: Number(r.score) });
    by.set(k, e);
  }
  return [...by.values()].map(c => {
    const s = c.snaps.sort((a, b) => a.at.localeCompare(b.at));
    const before = s.filter(x => x.at <= cut);
    return { subject: c.subject, topic: c.topic, score: Math.round(s[s.length - 1].score), prev: before.length ? Math.round(before[before.length - 1].score) : null };
  });
}

export function leadOf(rows: Rows, lens: Lens, events: TimelineEvent[], series: MonthPoint[]): Lead {
  const v = visible(rows, lens);
  const today = rows.today;
  const who = lens.who;
  const recent45 = ago(today, 45), recent60 = ago(today, 60), recent30 = ago(today, 30);

  const wins = events.filter(e => e.tier === 'milestone' && e.on >= recent45).sort((a, b) => b.on.localeCompare(a.on)).slice(0, 4);
  const chapters = sees(lens, 'tml') ? chaptersNow(v.tml, today) : [];
  const lowest = [...chapters].sort((a, b) => a.score - b.score)[0];
  const next = lowest && lowest.score < 75 ? lowest : null;
  const moved = chapters.filter(c => c.prev !== null).map(c => ({ ...c, d: c.score - c.prev! }));
  const improving = moved.filter(c => c.d >= 8).sort((a, b) => b.d - a.d).slice(0, 4).map(({ d: _d, ...c }) => c);
  const slipping = moved.filter(c => c.d <= -8).sort((a, b) => a.d - b.d).slice(0, 4).map(({ d: _d, ...c }) => c);

  // Attendance: the streak of strong months, counted back from the latest month with attendance.
  const att = series.filter(p => p.attendance).reverse();
  let streak = 0;
  for (const p of att) { if (p.attendance!.pct >= 95) streak++; else break; }

  const hwRecent = sees(lens, 'homework') ? homeworkOf(v.work, rows.subs, today).filter(w => w.past && w.due >= recent60) : [];
  const homework = hwRecent.length ? { done: hwRecent.filter(w => w.done).length, set: hwRecent.length } : null;
  const tutorRecent = v.tutor.filter(t => day(t.completed_at) >= recent30);
  const depths = tutorRecent.map(t => Number(t.depth_score)).filter(n => Number.isFinite(n) && n > 0);
  const tutor = sees(lens, 'tutor') && tutorRecent.length ? { sessions: tutorRecent.length, depth: depths.length ? Math.round(depths.reduce((s, n) => s + n, 0) / depths.length) : null } : null;

  let fees: Lead['fees'] = null;
  if (sees(lens, 'fees')) {
    const f = feesOf(v.invoices.filter(i => i.session === rows.currentSession), rows.payments);
    if (f.length) {
      const billed = f.reduce((n, x) => n + x.billed, 0), paid = f.reduce((n, x) => n + x.paid, 0);
      fees = { billed, paid, due: Math.max(0, billed - paid) };
    }
  }
  let care: Lead['care'] = null;
  if (sees(lens, 'wellness') || sees(lens, 'counselling')) {
    const months = series.filter(p => p.wellness).slice(-6).map(p => ({ month: p.month, checkins: p.wellness!.checkins, low: p.wellness!.low }));
    const open = v.counselling.filter(c => !c.closed_on).sort((a, b) => b.opened_on.localeCompare(a.opened_on))[0];
    care = { months, counselling: sees(lens, 'counselling') ? (open ? `Open since ${open.opened_on}` : v.counselling.length ? 'Closed' : 'None') : null };
  }

  // What needs attention, written for the viewer.
  const attention: Attention[] = [];
  const parent = who === 'parent';
  const lastAtt = att[0]?.attendance;
  if (lastAtt && lastAtt.pct < 85) attention.push({
    key: 'attendance', tone: lastAtt.pct < 75 ? 'r' : 'a', title: `Attendance was ${lastAtt.pct}% in ${monthLabel(att[0].month)}`,
    detail: `${plural(lastAtt.marked, 'school day')} marked.`, help: parent ? 'A steady morning routine helps. If something is keeping them home, the class teacher can help.' : undefined,
  });
  const runs = (v.attendance?.runs || []).filter(r => r.from >= recent60);
  if (runs.length && who !== 'student') attention.push({ key: 'runs', tone: 'a', title: `Away ${runs[0].days} school days in a row`, detail: `From ${runs[0].from} to ${runs[0].to}.` });
  const gap = chapters.filter(c => c.score < 50).sort((a, b) => a.score - b.score);
  if (gap.length && who !== 'student') attention.push({
    key: 'gap', tone: gap[0].score < 35 ? 'r' : 'a', title: `${plural(gap.length, 'chapter')} under 50%`,
    detail: gap.slice(0, 3).map(c => `${c.topic} ${c.score}%`).join(', ') + (gap.length > 3 ? ` and ${gap.length - 3} more` : '') + '.',
    help: parent ? 'Ask them to try a session with the AI tutor on the lowest one. It guides them step by step and never just gives the answer.' : undefined,
  });
  if (homework && homework.done / homework.set < 0.75) attention.push({
    key: 'homework', tone: homework.done / homework.set < 0.5 ? 'r' : 'a', title: `Homework: ${homework.done} of ${homework.set} handed in`,
    detail: 'In the last two months.', help: parent ? 'A fixed time each evening for homework makes a difference.' : undefined,
  });
  if (fees && fees.due > 0) attention.push({ key: 'fees', tone: 'a', title: `Fees due: ${inr(fees.due)}`, detail: `${inr(fees.paid)} paid of ${inr(fees.billed)} this year.` });
  const hard = events.filter(e => e.tier === 'record' && e.on >= recent60 && who !== 'student');
  for (const e of hard.filter(e => e.kind === 'discipline' || e.kind === 'incidents').slice(0, 2)) attention.push({ key: `rec-${e.on}-${e.kind}`, tone: 'r', title: e.title, detail: e.detail ?? e.on });
  if (sees(lens, 'wellness') && who !== 'student') {
    const lowMonth = care?.months.filter(m => m.month >= recent60.slice(0, 7) && m.low >= 3)[0];
    if (lowMonth) attention.push({ key: 'care', tone: 'a', title: `A harder month: ${plural(lowMonth.low, 'low day')}`, detail: `${monthLabel(lowMonth.month)}, ${plural(lowMonth.checkins, 'check-in')}.` });
  }

  // The office role's focus orders what matters to it first.
  const focus = who === 'office' ? lens.focus ?? 'all' : null;
  const order: Record<OfficeFocus, string[]> = { all: [], fees: ['fees'], care: ['care', 'rec'], register: ['runs', 'attendance'] };
  if (focus && order[focus].length) attention.sort((a, b) => Number(!order[focus].some(k => a.key.startsWith(k))) - Number(!order[focus].some(k => b.key.startsWith(k))));

  return { who, focus, wins, attention: attention.slice(0, 6), next, improving, slipping, streak, homework, tutor, fees, care: focus === 'care' || who === 'office' ? care : null };
}

