import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadTeacherRows } from '@/lib/teacher/loadRows';
import { assembleDesk } from '@/lib/teacher/desk';
import { loadAdminRows } from '@/lib/admin/loadRows';
import { assembleAdminDesk } from '@/lib/admin/desk';
import { probe } from '@/lib/admin/probe';
import { loadFamily } from '@/lib/parent/load';
import { probeFamily } from '@/lib/parent/probe';
import { canSeeSituation, type FeedCaller } from '@/lib/feed/access';
import { isEscalated, istDay, DAY_MS } from '@/lib/feed/rules';
import { displayClass, normClass } from '@/lib/teacher/scope';
import { pageAll } from '@/lib/ops/page';
import { masteryWeeks } from './lookups';
import { inrShort, topTiles, type TodayTile, type Tone } from './protocol';
import type { Asker } from './engine';
import { parentQuestionsLeft } from './store';

/**
 * What the Ask page shows before anyone types, built straight from the records
 * (no AI): four "Today for you" cards, "Worth a look" findings, and "This week
 * at a glance" trends. Everything is scoped exactly as the person's screens are.
 */

export interface Insight { key: string; tone: Tone; title: string; detail: string; ask: string; href: string | null }
export interface Glance { key: string; label: string; value: string; tone: Tone; series: number[]; seriesLabels: string[]; unit: '%' | '₹' | ''; hint: string; href: string | null }
export interface TodayPayload {
  greeting: string;
  scope: string;
  tiles: TodayTile[];
  insights: Insight[];
  glance: Glance[];
  starters: string[];
  quota: { left: number; limit: number } | null;
  /** Parents: their children, for addressing a drafted message. */
  children?: { id: string; name: string }[];
}

const pctOf = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
const short = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const isSunday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() === 0;
const LEVEL_TONE: Record<string, Tone> = { critical: 'r', high: 'r', medium: 'a', low: 'b' };

async function openFeed(db: SupabaseClient, me: FeedCaller) {
  const { data } = await db.from('situations').select('id, school_id, audience, teacher_id, class_name, severity, title, created_at, escalate_at, acknowledged_at')
    .eq('school_id', me.schoolId).is('acknowledged_at', null).gte('created_at', new Date(Date.now() - 30 * DAY_MS).toISOString()).limit(400);
  const mine = (data || []).filter(r => r.audience !== 'principal' && canSeeSituation(me, r));
  return { open: mine.length, escalated: mine.filter(r => isEscalated(r)).length, critical: mine.filter(r => r.severity === 'critical').length, top: mine.find(r => isEscalated(r) || r.severity === 'critical') ?? mine[0] ?? null };
}

async function waitingThreads(db: SupabaseClient, me: FeedCaller, office: boolean) {
  let q = db.from('school_threads').select('id, staff_read_at, last_message_at').eq('school_id', me.schoolId).eq('status', 'open')
    .gte('last_message_at', new Date(Date.now() - 21 * DAY_MS).toISOString()).order('last_message_at', { ascending: true }).limit(100);
  q = office ? q.eq('audience', 'office') : q.eq('staff_id', me.id);
  const { data: threads } = await q;
  if (!threads?.length) return { waiting: 0, oldestDays: 0 };
  const { data: msgs } = await db.from('school_messages').select('thread_id, sender_role, created_at').in('thread_id', threads.map(t => t.id)).order('created_at', { ascending: false }).limit(500);
  const last = new Map<string, any>();
  for (const m of msgs || []) if (!last.has(m.thread_id)) last.set(m.thread_id, m);
  const waiting = threads.filter(t => { const m = last.get(t.id); return m && m.sender_role === 'parent' && (!t.staff_read_at || t.staff_read_at < m.created_at); });
  const oldest = waiting.map(t => last.get(t.id).created_at).sort()[0];
  return { waiting: waiting.length, oldestDays: oldest ? Math.max(0, Math.floor((Date.now() - Date.parse(oldest)) / DAY_MS)) : 0 };
}

/** School attendance rate per day over the last ~2 weeks (school days only). */
async function attendanceDays(db: SupabaseClient, schoolId: string, classes?: string[]) {
  const from = istDay(new Date(Date.now() - 16 * DAY_MS));
  const { data } = await pageAll<any>((f, t) => db.from('attendance').select('id, class_name, day, status').eq('school_id', schoolId).gte('day', from).order('day').order('id').range(f, t), 60_000);
  const wanted = classes ? new Set(classes.map(normClass)) : null;
  const by = new Map<string, { n: number; p: number }>();
  for (const r of data) {
    if (wanted && !wanted.has(normClass(r.class_name))) continue;
    const x = by.get(r.day) ?? { n: 0, p: 0 }; x.n++; if (r.status !== 'absent') x.p++; by.set(r.day, x);
  }
  return [...by].sort((a, b) => a[0].localeCompare(b[0])).slice(-10).map(([day, x]) => ({ day, pct: pctOf(x.p, x.n) ?? 0 }));
}

export async function todayFor(db: SupabaseClient, a: Asker): Promise<TodayPayload> {
  if (a.kind === 'parent') return parentToday(db, a);
  return a.me.role === 'teacher' ? teacherToday(db, a.me) : officeToday(db, a);
}

async function teacherToday(db: SupabaseClient, me: FeedCaller): Promise<TodayPayload> {
  const today = istDay();
  const rows = await loadTeacherRows(db, { schoolId: me.schoolId, uid: me.id }, me.scope);
  const desk = assembleDesk(rows, { id: me.id, name: me.name, subject: me.scope[0]?.subject || '' }, me.scope, 'live');
  const [feed, threads] = await Promise.all([openFeed(db, me), waitingThreads(db, me, false)]);
  const tiles: TodayTile[] = [];
  if (me.classTeacherOf && !isSunday(today)) {
    const roster = desk.classes.find(c => normClass(c.cls) === me.classTeacherOf)?.students || [];
    const { count } = await db.from('attendance').select('id', { count: 'exact', head: true }).eq('school_id', me.schoolId).eq('day', today).in('student_id', roster.slice(0, 150).map(s => s.id));
    const marked = (count ?? 0) > 0;
    tiles.push({ key: 'register', tone: marked ? 'g' : 'r', icon: marked ? 'check' : 'clock', label: 'REGISTER', value: marked ? 'Marked' : 'Not marked', detail: `${displayClass(me.classTeacherOf)}, ${roster.length} students.`, ask: `Who is absent in ${displayClass(me.classTeacherOf)} today, and who has been absent most this month?`, href: '/teacher/attendance', weight: marked ? 10 : 95 });
  }
  if (threads.waiting) tiles.push({ key: 'parents', tone: 'a', icon: 'mail', label: 'PARENTS WAITING', value: String(threads.waiting), detail: threads.oldestDays ? `Oldest waiting ${threads.oldestDays} day${threads.oldestDays === 1 ? '' : 's'}.` : 'Since today.', ask: 'Which parents are waiting for a reply, and draft a reply to the oldest one.', href: '/teacher/messages', weight: 80 + threads.oldestDays });
  const toMark = desk.classes.reduce((n, c) => n + c.pendingReview, 0);
  tiles.push({ key: 'mark', tone: toMark > 30 ? 'a' : 'b', icon: 'check', label: 'TO MARK', value: String(toMark), detail: toMark ? `Across ${desk.classes.filter(c => c.pendingReview).map(c => c.cls).join(', ')}.` : 'All marked. Nice.', ask: 'What do I have to mark, oldest first?', href: '/teacher/grading', weight: toMark ? 50 + Math.min(30, toMark / 2) : 5 });
  if (feed.open) tiles.push({ key: 'feed', tone: feed.critical || feed.escalated ? 'r' : 'a', icon: 'warn', label: 'FEED', value: `${feed.open} open`, detail: feed.top ? feed.top.title : '', ask: 'What is open on my situational feed, most urgent first?', href: '/teacher/feed', weight: feed.critical || feed.escalated ? 90 : 45 });
  const behind = desk.assignments.filter(x => x.status === 'published' && x.dueAt && x.dueAt.slice(0, 10) < today && x.dueAt.slice(0, 10) >= istDay(new Date(Date.now() - 14 * DAY_MS)))
    .map(x => ({ x, missing: x.roster.length - new Set(x.submissions.map(s => s.studentId)).size })).filter(y => y.missing > 0).sort((p, q) => q.missing - p.missing);
  if (behind[0]) tiles.push({ key: 'missing', tone: 'a', icon: 'people', label: 'NOT HANDED IN', value: String(behind[0].missing), detail: `"${behind[0].x.title}" (${behind[0].x.cls}).`, ask: `Who hasn't handed in "${behind[0].x.title}" and what else are they behind on?`, href: '/teacher/homework', weight: 60 });

  const insights: Insight[] = [];
  for (const c of desk.classes) {
    if (c.belowForty.length >= 3) insights.push({ key: `below:${c.cls}`, tone: 'r', title: `${c.belowForty.length} students in ${c.cls} are below 40%`, detail: `Class mastery ${c.tml === null ? 'not yet measured' : `${Math.round(c.tml)}%`}; ${c.evidenced} of ${c.students.length} have evidence.`, ask: `Why are students in ${c.cls} below 40%, and what should I reteach first?`, href: '/teacher/mastery' });
    if (c.proctorFlags) insights.push({ key: `proctor:${c.cls}`, tone: 'a', title: `${c.proctorFlags} proctoring flags in ${c.cls}`, detail: 'Tab switches during proctored work in the last 14 days.', ask: `Tell me about the proctoring flags in ${c.cls}.`, href: '/teacher/homework' });
  }
  for (const y of behind.slice(1, 3)) insights.push({ key: `behind:${y.x.id}`, tone: 'a', title: `${y.missing} haven't handed in "${y.x.title}"`, detail: `${y.x.cls} ${y.x.subject}, due ${short(y.x.dueAt!.slice(0, 10))}.`, ask: `Who hasn't handed in "${y.x.title}"?`, href: '/teacher/homework' });

  const kids = desk.classes.flatMap(c => c.students.map(s => ({ id: s.id, cls: c.cls })));
  const glance: Glance[] = [];
  const m = kids.length ? await masteryWeeks(db, me.schoolId, kids.map(k => k.id), istDay(new Date(Date.now() - 56 * DAY_MS))) : null;
  for (const c of desk.classes.slice(0, 3)) {
    const sub = m?.series.find(sr => c.subjects.some(x => x.toLowerCase() === sr.subject.toLowerCase())) ?? m?.series[0];
    const pts = (sub?.points || []).filter(p => p.score !== null).slice(-8);
    const v = c.tml;
    glance.push({ key: `class:${c.cls}`, label: `${c.cls} mastery`, value: v === null ? '—' : `${Math.round(v)}%`, tone: v === null ? 'n' : v < 50 ? 'r' : v < 65 ? 'a' : 'g', series: pts.map(p => Math.round(p.score!)), seriesLabels: pts.map(p => short(p.week)), unit: '%', hint: `${c.belowForty.length} below 40%`, href: '/teacher/mastery' });
  }
  if (me.classTeacherOf) {
    const days = await attendanceDays(db, me.schoolId, [me.classTeacherOf]);
    if (days.length) glance.push({ key: 'att', label: `${displayClass(me.classTeacherOf)} attendance`, value: `${days[days.length - 1].pct}%`, tone: days[days.length - 1].pct < 85 ? 'a' : 'g', series: days.map(d => d.pct), seriesLabels: days.map(d => short(d.day)), unit: '%', hint: 'last school days', href: '/teacher/attendance' });
  }
  return {
    greeting: `Good ${greet()}, ${me.name.split(' ')[0]}`, scope: 'Your classes only', tiles: topTiles(tiles), insights: insights.slice(0, 4), glance,
    starters: ['Which students are slipping, and why?', "Who hasn't submitted this week's homework?", 'Any parents waiting for a reply?', 'Plan my week around the weakest chapters'],
    quota: null,
  };
}

async function officeToday(db: SupabaseClient, a: Extract<Asker, { kind: 'staff' }>): Promise<TodayPayload> {
  const me = a.me;
  const acc = me.access!;
  const today = istDay();
  const rows = await loadAdminRows(db, { schoolId: me.schoolId, uid: me.id, superadmin: false });
  const d = assembleAdminDesk(rows);
  const tiles: TodayTile[] = [];
  const glance: Glance[] = [];
  if (acc.any('feed.read', 'incidents.manage')) {
    const f = await openFeed(db, me);
    if (f.open) tiles.push({ key: 'feed', tone: f.escalated || f.critical ? 'r' : 'a', icon: 'warn', label: f.escalated ? 'ESCALATED TO YOU' : 'FEED', value: String(f.escalated || f.open), detail: f.top?.title || `${f.open} open items.`, ask: 'What has escalated to me, and what should I do about each?', href: '/admin/feed', weight: f.escalated ? 100 : 40 });
  }
  if (acc.can('attendance.read') && !isSunday(today)) {
    const { data: att } = await pageAll<any>((f, t) => db.from('attendance').select('id, class_name').eq('school_id', me.schoolId).eq('day', today).order('id').range(f, t), 50_000);
    const classes = [...new Set(d.students.map(s => normClass(s.cls)).filter(Boolean))];
    const marked = new Set(att.map(r => normClass(r.class_name)));
    const missing = classes.filter(c => !marked.has(c));
    tiles.push({ key: 'registers', tone: missing.length ? 'a' : 'g', icon: missing.length ? 'clock' : 'check', label: 'REGISTERS', value: missing.length ? `${missing.length} of ${classes.length} not marked` : 'All marked', detail: missing.length ? `${missing.slice(0, 4).map(displayClass).join(', ')}${missing.length > 4 ? '…' : ''}` : `${classes.length} classes.`, ask: 'Which registers are not marked today, and how is attendance this week?', href: '/admin/attendance', weight: missing.length ? 85 : 10 });
    const days = await attendanceDays(db, me.schoolId);
    if (days.length) glance.push({ key: 'att', label: 'School attendance', value: `${days[days.length - 1].pct}%`, tone: days[days.length - 1].pct < 88 ? 'a' : 'g', series: days.map(x => x.pct), seriesLabels: days.map(x => short(x.day)), unit: '%', hint: 'last school days', href: '/admin/attendance' });
  }
  if (acc.can('messages.office')) {
    const t = await waitingThreads(db, me, true);
    if (t.waiting) tiles.push({ key: 'parents', tone: 'a', icon: 'mail', label: 'PARENTS WAITING', value: String(t.waiting), detail: `Oldest waiting ${t.oldestDays} day${t.oldestDays === 1 ? '' : 's'}.`, ask: 'Which parents are waiting for the office, oldest first? Draft a reply to the oldest.', href: '/admin/messages', weight: 75 + t.oldestDays });
  }
  if (acc.can('academics.read')) {
    const A = d.academics;
    const delta = A.schoolTml !== null && A.schoolTmlBefore !== null ? Math.round(A.schoolTml - A.schoolTmlBefore) : null;
    tiles.push({ key: 'mastery', tone: delta !== null && delta < -2 ? 'r' : 'b', icon: 'chart', label: 'MASTERY THIS FORTNIGHT', value: A.schoolTml === null ? '—' : `${Math.round(A.schoolTml)}%`, detail: delta === null ? `${A.evidenced} students with evidence.` : `${delta >= 0 ? 'Up' : 'Down'} ${Math.abs(delta)} points${A.weakest ? `; weakest Class ${A.weakest.grade} ${A.weakest.subject}` : ''}.`, ask: 'Where is mastery slipping most this fortnight, and why?', href: '/admin/academic', weight: delta !== null && delta < -2 ? 70 : 30 });
    const pts = d.tmlSeries.filter(p => p.tml !== null);
    glance.push({ key: 'tml', label: 'School mastery', value: A.schoolTml === null ? '—' : `${Math.round(A.schoolTml)}%`, tone: (A.schoolTml ?? 100) < 50 ? 'r' : (A.schoolTml ?? 100) < 65 ? 'a' : 'g', series: pts.map(p => Math.round(p.tml!)), seriesLabels: pts.map(p => short(p.week)), unit: '%', hint: `${A.atRisk.length} students at risk`, href: '/admin/academic' });
  }
  if (acc.can('fees.read')) {
    const F = d.fees;
    const old = F.ageing.filter(b => b.key === '61-90' || b.key === '90+').reduce((s, b) => ({ n: s.n + b.families, amt: s.amt + b.amount }), { n: 0, amt: 0 });
    if (old.amt) tiles.push({ key: 'overdue', tone: 'r', icon: 'money', label: 'OVERDUE 60+ DAYS', value: inrShort(old.amt), detail: `${old.n} families.`, ask: 'Overdue over 60 days by class, and who has not been reminded?', href: '/admin/fees', weight: 65 });
    const months: { m: string; amt: number }[] = [];
    for (let i = 5; i >= 0; i--) { const dt = new Date(); dt.setUTCDate(1); dt.setUTCMonth(dt.getUTCMonth() - i); months.push({ m: dt.toISOString().slice(0, 7), amt: 0 }); }
    for (const r of F.receipts) if (!r.voided) { const x = months.find(mm => mm.m === r.paidOn.slice(0, 7)); if (x) x.amt += r.amount; }
    const thisMonth = months[months.length - 1].amt;
    tiles.push({ key: 'collected', tone: 'b', icon: 'money', label: 'COLLECTED THIS MONTH', value: inrShort(thisMonth), detail: `${Math.round(F.totals.collectionRate ?? 0)}% of billed collected this session.`, ask: 'How are fee collections this month compared with last month and last year?', href: '/admin/fees', weight: 35 });
    glance.push({ key: 'fees', label: 'Fees collected', value: inrShort(thisMonth), tone: 'b', series: months.map(x => Math.round(x.amt)), seriesLabels: months.map(x => new Date(`${x.m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })), unit: '₹', hint: 'by month', href: '/admin/fees' });
  }
  if (acc.can('admissions.read')) {
    const P = d.admissions;
    if (P.stale.length) tiles.push({ key: 'admissions', tone: 'a', icon: 'people', label: 'ADMISSIONS IDLE', value: String(P.stale.length), detail: `${P.total} applicants, ${P.enrolled} enrolled.`, ask: 'Which applicants are idle too long, and what should we do next for each stage?', href: '/admin/admissions', weight: 55 });
    glance.push({ key: 'adm', label: 'Admissions funnel', value: P.conversion === null ? '—' : `${Math.round(P.conversion)}%`, tone: 'b', series: P.funnel.map(f => f.reached), seriesLabels: P.funnel.map(f => String(f.stage)), unit: '', hint: 'enquiry to enrolled', href: '/admin/admissions' });
  }
  if (acc.can('workforce.read')) {
    const W = d.workforce;
    if (W.backlog) tiles.push({ key: 'backlog', tone: W.backlog > 200 ? 'a' : 'b', icon: 'check', label: 'GRADING BACKLOG', value: String(W.backlog), detail: `${W.teachers.filter(t => t.backlog > 20).length} teachers with 20+ waiting.`, ask: 'Which teachers have a grading backlog, and how old is it?', href: '/admin/staff', weight: 45 });
    if (acc.can('leave.approve') && W.pendingLeave.length) tiles.push({ key: 'leave', tone: 'a', icon: 'calendar', label: 'LEAVE TO APPROVE', value: String(W.pendingLeave.length), detail: W.onLeaveToday.length ? `${W.onLeaveToday.length} on leave today.` : 'Nobody on leave today.', ask: 'What leave is waiting for approval, and who would cover?', href: '/admin/staff', weight: 60 });
  }
  const pr = probe(d);
  const insights: Insight[] = pr.findings.slice(0, 4).map(f => {
    const link = f.actions.find(x => x.kind === 'link') as { href: string } | undefined;
    return { key: f.key, tone: LEVEL_TONE[f.level] ?? 'b', title: f.title, detail: f.summary, ask: `Tell me more about this: ${f.title}. Why is it happening and what should I do?`, href: link?.href ?? '/admin/probe' };
  });
  return {
    greeting: `Good ${greet()}, ${me.name.split(' ')[0]}`, scope: `${a.viewer.label} · what your role can see`, tiles: topTiles(tiles), insights, glance: glance.slice(0, 4),
    starters: [
      acc.can('academics.read') ? 'Which classes are struggling most, and why?' : null,
      acc.can('fees.read') ? 'How are fee collections this month?' : null,
      acc.can('workforce.read') ? 'Which teachers have a grading backlog?' : null,
      acc.can('admissions.read') ? 'Where are we losing applicants?' : null,
      'What needs my attention today?',
    ].filter((x): x is string => !!x).slice(0, 4),
    quota: null,
  };
}

async function parentToday(db: SupabaseClient, a: Extract<Asker, { kind: 'parent' }>): Promise<TodayPayload> {
  const view = await loadFamily(db, a.parent);
  const today = istDay();
  const tiles: TodayTile[] = [];
  const kids = view.children;
  const due = kids.flatMap(k => k.work.filter(w => w.state === 'todo' || w.state === 'overdue').map(w => ({ k, w }))).sort((p, q) => String(p.w.dueOn).localeCompare(String(q.w.dueOn)));
  if (due.length) tiles.push({ key: 'homework', tone: due.some(x => x.w.state === 'overdue') ? 'r' : 'a', icon: 'clock', label: 'HOMEWORK', value: `${due.length} to do`, detail: due.slice(0, 2).map(x => `${x.k.firstName}: ${x.w.subject}${x.w.dueOn ? ` (${short(x.w.dueOn)})` : ''}`).join('; '), ask: 'What homework is due this week, and is anything overdue?', href: '/parent/schoolwork', weight: due.some(x => x.w.state === 'overdue') ? 90 : 60 });
  const events = kids.flatMap(k => k.calendar).filter(e => e.endsOn >= today).sort((p, q) => p.startsOn.localeCompare(q.startsOn));
  const exam = events.find(e => /exam|test|assessment/i.test(`${e.kind} ${e.title}`)) ?? events[0];
  if (exam) tiles.push({ key: 'event', tone: 'b', icon: 'calendar', label: /exam|test/i.test(`${exam.kind} ${exam.title}`) ? 'NEXT EXAM' : 'COMING UP', value: short(exam.startsOn), detail: exam.title, ask: `What is coming up at school, and how should we prepare for ${exam.title}?`, href: '/parent', weight: 50 });
  const fee = kids.map(k => ({ k, n: k.fees.nextDue })).filter(x => x.n).sort((p, q) => String(p.n!.dueOn).localeCompare(String(q.n!.dueOn)))[0];
  if (fee?.n) tiles.push({ key: 'fee', tone: fee.n.dueOn && fee.n.dueOn < today ? 'r' : 'a', icon: 'money', label: 'FEE DUE', value: short(String(fee.n.dueOn)), detail: `${fee.n.label}, ${inrShort(fee.n.balance)}.`, ask: 'What fees are due and what have we paid so far?', href: '/parent/fees', weight: fee.n.dueOn && fee.n.dueOn < today ? 85 : 40 });
  for (const k of kids) {
    if (k.attendance.pct !== null) tiles.push({ key: `att:${k.id}`, tone: k.attendance.pct < 85 ? 'a' : 'g', icon: 'check', label: `${k.firstName.toUpperCase()} ATTENDANCE`, value: `${k.attendance.pct}%`, detail: `${k.attendance.absent} absent, ${k.attendance.late} late this session.`, ask: `How is ${k.firstName}'s attendance this month?`, href: '/parent/attendance', weight: k.attendance.pct < 85 ? 70 : 20 });
  }
  const insights: Insight[] = probeFamily(view).slice(0, 4).map(f => ({ key: f.id, tone: f.tone, title: f.title, detail: f.detail, ask: f.ask, href: f.kind === 'fees' ? '/parent/fees' : f.kind === 'homework' ? '/parent/schoolwork' : '/parent/progress' }));
  const glance: Glance[] = [];
  if (kids.length) {
    const m = await masteryWeeks(db, a.parent.schoolId, kids.map(k => k.id), istDay(new Date(Date.now() - 84 * DAY_MS)));
    for (const k of kids.slice(0, 3)) {
      const one = kids.length === 1 ? m : await masteryWeeks(db, a.parent.schoolId, [k.id], istDay(new Date(Date.now() - 84 * DAY_MS)));
      const weeks = new Map<string, number[]>();
      for (const sr of one.series) for (const p of sr.points) if (p.score !== null) weeks.set(p.week, [...(weeks.get(p.week) || []), p.score]);
      const pts = [...weeks].sort((p, q) => p[0].localeCompare(q[0])).slice(-8);
      glance.push({ key: `tml:${k.id}`, label: `${k.firstName}'s mastery`, value: k.tml === null ? '—' : `${k.tml}%`, tone: k.tml === null ? 'n' : k.tml < 50 ? 'r' : k.tml < 65 ? 'a' : 'g', series: pts.map(([, xs]) => Math.round(xs.reduce((s, x) => s + x, 0) / xs.length)), seriesLabels: pts.map(([w]) => short(w)), unit: '%', hint: k.band?.band ? String(k.band.band) : 'all subjects', href: '/parent/progress' });
    }
  }
  const q = await parentQuestionsLeft(db, a.parent.id);
  const first = kids[0]?.firstName || 'my child';
  return {
    greeting: `Good ${greet()}${a.parent.name ? `, ${a.parent.name.split(' ')[0]}` : ''}`, scope: kids.length ? `${kids.map(k => k.firstName).join(' and ')} only` : 'Your children only',
    tiles: topTiles(tiles), insights, glance,
    starters: [`How is ${first} doing this term?`, 'What is due this week?', `Where does ${first} need help, and how can I help at home?`, 'When are the next exams?'],
    quota: { left: q.left, limit: q.limit },
    children: kids.map(k => ({ id: k.id, name: k.name })),
  };
}

function greet() {
  const h = new Date(Date.now() + 5.5 * 3600_000).getUTCHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
