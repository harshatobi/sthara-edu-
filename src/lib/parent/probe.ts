/**
 * Probe for parents: deterministic detectors over the family view. No AI, no
 * cost — this is what the School OS noticed before the parent asked. Each
 * finding carries the question to ask about it and, when it helps, who at
 * school to write to. The Ask engine sees the same findings, so the chat
 * raises them when they matter.
 */
import { DAY, ENERGY_LABEL, upcoming, type Child, type FamilyView, type StaffRef } from './family';
import { inr, fmtDate } from '@/lib/admin/format';

export type ProbeTone = 'r' | 'a' | 'g' | 'b';

export interface ProbeFinding {
  id: string;
  childId: string;
  /** 0–100, higher first. */
  severity: number;
  tone: ProbeTone;
  kind: 'mastery' | 'trend' | 'homework' | 'wellbeing' | 'fees' | 'messages' | 'consent' | 'strength';
  title: string;
  detail: string;
  /** Evidence chips: label/value. */
  evidence: { label: string; value: string }[];
  /** Pre-filled question for Ask the School OS. */
  ask: string;
  /** Who to write to about it. */
  contact?: { to: StaffRef | null; audience: 'teacher' | 'office'; topic: string; subject: string };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function probeChild(c: Child, view: FamilyView, now: number): ProbeFinding[] {
  const out: ProbeFinding[] = [];
  const f = c.firstName;
  const add = (x: Omit<ProbeFinding, 'childId'>) => out.push({ ...x, childId: c.id });

  // Overdue work
  const overdue = c.work.filter(w => w.state === 'overdue');
  if (overdue.length) {
    const first = overdue[0];
    add({
      id: `overdue:${c.id}`, severity: Math.min(90, 60 + overdue.length * 8), tone: 'r', kind: 'homework',
      title: `${plural(overdue.length, 'piece')} of work past due`,
      detail: `${f} hasn't handed in ${overdue.map(w => `"${w.title}" (${w.subject})`).slice(0, 3).join(', ')}${overdue.length > 3 ? ' and more' : ''}.`,
      evidence: overdue.slice(0, 4).map(w => ({ label: w.subject, value: `due ${fmtDate(w.dueOn, true)}` })),
      ask: `What is ${f} behind on, and what should we do first?`,
      contact: first.teacher ? { to: first.teacher, audience: 'teacher', topic: 'homework', subject: `${first.title}: late submission` } : undefined,
    });
  }

  // Due soon
  const soon = upcoming(c, 2, now);
  if (soon.length) {
    add({
      id: `soon:${c.id}`, severity: 45, tone: 'a', kind: 'homework',
      title: `${plural(soon.length, 'task')} due in the next two days`,
      detail: soon.map(w => `${w.subject}: ${w.title} (${fmtDate(w.dueOn, true)})`).join(' · '),
      evidence: soon.slice(0, 4).map(w => ({ label: w.subject, value: fmtDate(w.dueOn, true) })),
      ask: `What does ${f} have due this week?`,
    });
  }

  // Mastery gaps (firm or provisional evidence only)
  for (const s of c.subjects) {
    const weak = s.chapters.filter(ch => ch.score < 50 && ch.confidence !== 'insufficient');
    if (weak.length) {
      const worst = weak[0];
      const severe = worst.score < 35;
      add({
        id: `gap:${c.id}:${s.subject}`, severity: severe ? 82 : 62, tone: severe ? 'r' : 'a', kind: 'mastery',
        title: `${s.subject}: ${severe ? 'needs support now' : 'a gap to close'} in ${worst.name}`,
        detail: `${f}'s mastery of ${worst.name} is ${worst.score}%${weak.length > 1 ? `, and ${plural(weak.length - 1, 'more chapter')} under 50%` : ''}. ${severe ? 'Below 35% the school starts a remediation plan.' : 'Between 35% and 49% the AI tutor sets a guided session.'}`,
        evidence: [
          { label: 'Mastery', value: `${worst.score}%` },
          { label: 'Homework', value: worst.homework === null ? 'no evidence' : `${worst.homework}%` },
          { label: 'Quiz', value: worst.quiz === null ? 'no evidence' : `${worst.quiz}%` },
          { label: 'Tutor depth', value: worst.tutor === null ? 'no sessions' : `${worst.tutor}%` },
        ],
        ask: `How can I help ${f} with ${worst.name} in ${s.subject} at home?`,
        contact: s.teacher ? { to: s.teacher, audience: 'teacher', topic: 'academics', subject: `${s.subject}: ${worst.name}` } : undefined,
      });
    }
    // Trend
    if (s.delta !== null && s.delta <= -8) {
      add({
        id: `trend:${c.id}:${s.subject}`, severity: 58, tone: 'a', kind: 'trend',
        title: `${s.subject} slipping`,
        detail: `On the chapters measured three weeks ago, ${f}'s ${s.subject} mastery is down ${-s.delta} points.`,
        evidence: [{ label: 'Change', value: `${s.delta} pts` }, { label: 'Subject now', value: `${s.score}%` }],
        ask: `Why has ${f}'s ${s.subject} dropped recently?`,
        contact: s.teacher ? { to: s.teacher, audience: 'teacher', topic: 'academics', subject: `${s.subject}: recent dip` } : undefined,
      });
    } else if (s.delta !== null && s.delta >= 8) {
      add({
        id: `up:${c.id}:${s.subject}`, severity: 18, tone: 'g', kind: 'strength',
        title: `${s.subject} climbing`, detail: `Up ${s.delta} points in three weeks on the same chapters. Worth telling ${f} you noticed.`,
        evidence: [{ label: 'Change', value: `+${s.delta} pts` }, { label: 'Subject now', value: `${s.score}%` }],
        ask: `What has ${f} improved on in ${s.subject}?`,
      });
    }
  }
  const strong = c.subjects.flatMap(s => s.chapters.filter(ch => ch.score >= 90 && ch.confidence === 'firm').map(ch => ({ s, ch })));
  if (strong.length) {
    add({
      id: `strong:${c.id}`, severity: 12, tone: 'g', kind: 'strength',
      title: `Exemplary in ${strong[0].ch.name}`,
      detail: `${f} is at ${strong[0].ch.score}% on ${strong[0].ch.name} (${strong[0].s.subject}), with firm evidence. The school opens stretch work at this level.`,
      evidence: strong.slice(0, 3).map(x => ({ label: x.s.subject, value: `${x.ch.name} ${x.ch.score}%` })),
      ask: `What is ${f} doing best at?`,
    });
  }

  // Recently graded with a note
  const noted = c.work.filter(w => w.state === 'graded' && w.note && w.submittedAt && now - new Date(w.submittedAt).getTime() < 10 * DAY);
  if (noted.length) {
    add({
      id: `note:${c.id}`, severity: 30, tone: 'b', kind: 'homework',
      title: `${plural(noted.length, 'teacher note')} on recent work`,
      detail: noted.slice(0, 2).map(w => `${w.subject}, "${w.title}": ${w.note}`).join(' · '),
      evidence: noted.slice(0, 3).map(w => ({ label: w.subject, value: w.pct === null ? 'graded' : `${w.pct}%` })),
      ask: `What did ${f}'s teachers say about the latest work?`,
    });
  }

  // Wellbeing (consented only)
  if (c.wellness.consented && c.wellness.lowDays >= 3) {
    add({
      id: `energy:${c.id}`, severity: 66, tone: 'r', kind: 'wellbeing',
      title: 'Low energy on several days',
      detail: `${f} logged low energy on ${c.wellness.lowDays} of ${c.wellness.checkins} check-ins in the last two weeks (average ${c.wellness.avgEnergy}/5). Journal entries stay private to ${f}.`,
      evidence: [{ label: 'Low days', value: String(c.wellness.lowDays) }, { label: 'Average', value: `${c.wellness.avgEnergy}/5` },
        { label: 'Latest', value: c.wellness.latestEnergy ? ENERGY_LABEL[c.wellness.latestEnergy] : '—' }],
      ask: `How has ${f} been feeling at school lately?`,
      contact: c.classTeacher ? { to: c.classTeacher, audience: 'teacher', topic: 'wellbeing', subject: `Checking in about ${f}` } : undefined,
    });
  }

  // Fees
  if (c.fees.overdue > 0) {
    const inv = c.fees.invoices.find(i => i.status === 'overdue')!;
    add({
      id: `fees:${c.id}`, severity: 60, tone: 'r', kind: 'fees',
      title: `${inr(c.fees.overdue)} in fees overdue`,
      detail: `${inv.label} (${inv.invoiceNo}) was due ${fmtDate(inv.dueOn)}.`,
      evidence: [{ label: 'Overdue', value: inr(c.fees.overdue) }, { label: 'Total due', value: inr(c.fees.outstanding) }],
      ask: `What fees are due for ${f}, and by when?`,
      contact: { to: null, audience: 'office', topic: 'fees', subject: `Fees for ${f}` },
    });
  } else if (c.fees.nextDue && new Date(c.fees.nextDue.dueOn).getTime() - now < 7 * DAY) {
    add({
      id: `feesoon:${c.id}`, severity: 38, tone: 'a', kind: 'fees',
      title: `${inr(c.fees.nextDue.balance)} due ${fmtDate(c.fees.nextDue.dueOn, true)}`,
      detail: `${c.fees.nextDue.label} (${c.fees.nextDue.invoiceNo}).`,
      evidence: [{ label: 'Due', value: fmtDate(c.fees.nextDue.dueOn) }],
      ask: `What fees are due for ${f}?`,
    });
  }

  // Consent
  const missing = (['ai_tutor', 'wellness_checkin'] as const).filter(k => c.consents[k] === undefined);
  if (missing.length) {
    add({
      id: `consent:${c.id}`, severity: 20, tone: 'b', kind: 'consent',
      title: 'Privacy choices waiting for you',
      detail: `You haven't decided on ${missing.map(k => (k === 'ai_tutor' ? 'the AI tutor' : 'wellness check-ins')).join(' and ')} for ${f}. Until you do, ${missing.includes('wellness_checkin') ? 'you won\'t see wellbeing trends here' : 'the default applies'}.`,
      evidence: missing.map(k => ({ label: k === 'ai_tutor' ? 'AI tutor' : 'Wellness', value: 'not decided' })),
      ask: 'What does the school do with my child\'s data?',
    });
  }

  // Replies waiting
  const unread = view.threads.filter(t => t.studentId === c.id && t.unread);
  if (unread.length) {
    add({
      id: `msg:${c.id}`, severity: 50, tone: 'b', kind: 'messages',
      title: `${plural(unread.length, 'reply', 'replies')} from school`,
      detail: unread.slice(0, 2).map(t => `${t.staff?.name ?? 'School office'}: ${t.preview}`).join(' · '),
      evidence: unread.slice(0, 3).map(t => ({ label: t.staff?.name ?? 'Office', value: t.subject })),
      ask: 'What has the school replied?',
    });
  }
  return out;
}

export function probeFamily(view: FamilyView, now = Date.now()): ProbeFinding[] {
  return view.children.flatMap(c => probeChild(c, view, now)).sort((a, b) => b.severity - a.severity);
}
