import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assembleDesk } from '@/lib/teacher/desk';
import { loadTeacherRows } from '@/lib/teacher/loadRows';
import { displayClass, normClass } from '@/lib/teacher/scope';
import { assembleAdminDesk } from '@/lib/admin/desk';
import { loadAdminRows } from '@/lib/admin/loadRows';
import { probe } from '@/lib/admin/probe';
import { inr } from '@/lib/admin/format';
import { canSeeSituation, type FeedCaller } from '@/lib/feed/access';
import { isEscalated, istDay, DAY_MS } from '@/lib/feed/rules';
import { personToken, tokenize, type Book } from './ask';

/**
 * The data brief behind Ask the School OS for staff: what the screens would
 * show this person, as text, with every person replaced by a token. Teachers
 * get their own classes; leadership gets the school, section by section, only
 * where their office roles allow (the same permissions as the /admin screens).
 */

/** Sunday in IST: no school, so no register is expected today. */
const isSunday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() === 0;

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);
const ageDays = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / DAY_MS));

/** Open feed items this person can see (escalated and critical first), as F tokens. */
async function feedLines(db: SupabaseClient, me: FeedCaller, book: Book, limit: number): Promise<{ lines: string[]; open: number; escalated: number; critical: number }> {
  const { data } = await db.from('situations')
    .select('id, school_id, audience, teacher_id, class_name, severity, category, title, message, student_id, student_name, created_at, escalate_at, acknowledged_at')
    .eq('school_id', me.schoolId).is('acknowledged_at', null).gte('created_at', new Date(Date.now() - 30 * DAY_MS).toISOString())
    .order('created_at', { ascending: false }).limit(400);
  const rank = { critical: 0, high: 1, normal: 2 } as Record<string, number>;
  const mine = (data || []).filter(r => canSeeSituation(me, r))
    .sort((a, b) => Number(isEscalated(b)) - Number(isEscalated(a)) || rank[a.severity] - rank[b.severity] || b.created_at.localeCompare(a.created_at));
  const lines = mine.slice(0, limit).map((r, i) => {
    const t = `F${i + 1}`;
    book.items.set(t, { id: r.id, title: r.title });
    if (r.student_id && r.student_name) personToken(book, 'S', r.student_id, r.student_name);
    return `- [[${t}]] [${r.severity}${isEscalated(r) ? ', ESCALATED to the principal' : ''}] ${r.category}: ${r.title}. ${r.message} (${ageDays(r.created_at)} days old)`;
  });
  return { lines, open: mine.length, escalated: mine.filter(r => isEscalated(r)).length, critical: mine.filter(r => r.severity === 'critical').length };
}

/** Open parent conversations addressed to this person (or the office), unread first, as M tokens. */
async function threadLines(db: SupabaseClient, me: FeedCaller, book: Book, office: boolean): Promise<string[]> {
  let q = db.from('school_threads').select('id, subject, topic, parent_id, student_id, staff_id, staff_read_at, last_message_at, status')
    .eq('school_id', me.schoolId).eq('status', 'open').gte('last_message_at', new Date(Date.now() - 21 * DAY_MS).toISOString())
    .order('last_message_at', { ascending: false }).limit(12);
  q = office ? q.eq('audience', 'office') : q.eq('staff_id', me.id);
  const { data: threads } = await q;
  if (!threads?.length) return [];
  const ids = threads.map(t => t.id);
  const { data: msgs } = await db.from('school_messages').select('thread_id, sender_role, body, created_at').in('thread_id', ids).order('created_at', { ascending: false }).limit(200);
  const last = new Map<string, any>();
  for (const m of msgs || []) if (!last.has(m.thread_id)) last.set(m.thread_id, m);
  const pids = [...new Set(threads.flatMap(t => [t.parent_id, t.student_id]))];
  const { data: people } = await db.from('users').select('id, name, student_class').in('id', pids);
  const who = new Map((people || []).map(p => [p.id, p]));
  return threads.map((t, i) => {
    const m = last.get(t.id);
    const parent = who.get(t.parent_id), kid = who.get(t.student_id);
    const pTok = personToken(book, 'P', t.parent_id, parent?.name || 'Parent');
    const sTok = personToken(book, 'S', t.student_id, kid?.name || 'Student');
    const tk = `M${i + 1}`;
    book.threads.set(tk, { id: t.id, label: `${parent?.name || 'the parent'} (about ${kid?.name?.split(' ')[0] || 'their child'})`, subject: t.subject });
    const unread = !!m && m.sender_role === 'parent' && (!t.staff_read_at || new Date(t.staff_read_at) < new Date(m.created_at));
    return `- [[${tk}]] ${pTok}, parent of ${sTok} (${displayClass(kid?.student_class)}): "${t.subject}" [${t.topic}]${unread ? ', UNREAD, waiting for a reply' : ''}. Last: ${m ? `${m.sender_role === 'parent' ? 'parent' : 'school'} ${ageDays(m.created_at)} days ago: "${String(m.body).slice(0, 280)}"` : 'no messages'}`;
  });
}

export async function teacherBrief(db: SupabaseClient, me: FeedCaller, book: Book): Promise<string> {
  const rows = await loadTeacherRows(db, { schoolId: me.schoolId, uid: me.id }, me.scope);
  const desk = assembleDesk(rows, { id: me.id, name: me.name, subject: me.scope[0]?.subject || '' }, me.scope, 'live');
  const today = istDay();
  const S = (id: string, name: string) => personToken(book, 'S', id, name);
  const out: string[] = [`TODAY: ${today} (IST) · YOU: a teacher${me.classTeacherOf ? `, class teacher of ${displayClass(me.classTeacherOf)}` : ''} · teaching ${me.scope.map(e => `${e.cls}${e.subject ? ` ${e.subject}` : ''}`).join(', ') || 'no classes on record'}`];

  for (const c of desk.classes) {
    out.push([
      `CLASS ${c.cls} (${c.subjects.join(', ') || 'class teacher'}): ${c.students.length} students, mastery ${pct(c.tml)} (${c.evidenced} with evidence), ${c.pendingReview} submissions waiting for your review, ${c.proctorFlags} proctoring flags (14 days).`,
      `Below 40%: ${c.belowForty.slice(0, 10).map(s => `${S(s.id, s.name)} ${pct(Object.values(s.tml).filter((v): v is number => v !== null)[0])}`).join(', ') || 'none'}.`,
    ].join('\n'));
  }

  const recent = desk.assignments.filter(a => a.status === 'published' && (!a.dueAt || ageDays(a.dueAt) <= 14 || a.dueAt.slice(0, 10) >= today)).slice(0, 12);
  if (recent.length) {
    out.push(`YOUR WORK (last two weeks and upcoming):\n${recent.map(a => {
      const done = new Set(a.submissions.map(s => s.studentId));
      const missing = a.roster.filter(s => !done.has(s.id));
      const late = a.dueAt && a.dueAt.slice(0, 10) < today;
      return `- ${a.type} "${a.title}" · ${a.cls} ${a.subject} · due ${a.dueAt?.slice(0, 10) ?? 'no date'} · ${a.submissions.length}/${a.roster.length} submitted, ${a.pendingCount} to review${late && missing.length ? ` · missing (overdue): ${missing.slice(0, 8).map(s => S(s.id, s.name)).join(', ')}${missing.length > 8 ? ` and ${missing.length - 8} more` : ''}` : ''}`;
    }).join('\n')}`);
  } else out.push('YOUR WORK: nothing published in the last two weeks.');

  if (me.classTeacherOf && isSunday(today)) out.push('ATTENDANCE TODAY: it is Sunday, no school and no register today.');
  else if (me.classTeacherOf) {
    const { data: att } = await db.from('attendance').select('student_id, status').eq('school_id', me.schoolId).eq('day', today);
    const roster = desk.classes.find(c => normClass(c.cls) === me.classTeacherOf)?.students || [];
    const ids = new Set(roster.map(s => s.id));
    const marks = (att || []).filter(a => ids.has(a.student_id));
    const absent = marks.filter(a => a.status === 'absent').map(a => roster.find(s => s.id === a.student_id)!);
    out.push(marks.length
      ? `ATTENDANCE TODAY (${displayClass(me.classTeacherOf)}): marked, ${absent.length} absent${absent.length ? `: ${absent.map(s => S(s.id, s.name)).join(', ')}` : ''}.`
      : `ATTENDANCE TODAY (${displayClass(me.classTeacherOf)}): NOT MARKED yet (${roster.length} students).`);
  }

  // Wellness, teacher-safe: energy only, never journal text.
  const kids = desk.classes.flatMap(c => c.students);
  if (kids.length) {
    const { data: w } = await db.from('wellness_logs').select('student_id, energy, created_at').in('student_id', kids.map(k => k.id).slice(0, 800))
      .gte('created_at', new Date(Date.now() - 7 * DAY_MS).toISOString()).not('energy', 'is', null);
    const low = new Map<string, number>();
    for (const r of w || []) if ((r.energy ?? 5) <= 2) low.set(r.student_id, (low.get(r.student_id) || 0) + 1);
    out.push(`WELLNESS (last 7 days, energy 1–5 only; journals are private): ${(w || []).length} check-ins from your students; low (2 or below): ${[...low].map(([id, n]) => `${S(id, kids.find(k => k.id === id)!.name)} ×${n}`).join(', ') || 'none'}.`);
  }

  const feed = await feedLines(db, me, book, 12);
  out.push(`SITUATIONAL FEED: ${feed.open} open (${feed.critical} critical, ${feed.escalated} escalated)${feed.lines.length ? `\n${feed.lines.join('\n')}` : ''}`);
  const threads = await threadLines(db, me, book, false);
  out.push(threads.length ? `PARENT CONVERSATIONS WITH YOU:\n${threads.join('\n')}` : 'PARENT CONVERSATIONS WITH YOU: none open.');
  return tokenize(out.join('\n\n'), book);
}

export async function leadershipBrief(db: SupabaseClient, me: FeedCaller, book: Book): Promise<string> {
  const rows = await loadAdminRows(db, { schoolId: me.schoolId, uid: me.id, superadmin: false });
  const d = assembleAdminDesk(rows);
  const a = d.me.access;
  const today = istDay();
  const S = (id: string, name: string) => personToken(book, 'S', id, name);
  const T = (id: string, name: string) => personToken(book, 'T', id, name);
  const out: string[] = [`TODAY: ${today} (IST) · SCHOOL: ${d.school.name} · YOU: ${a.label} · ${d.students.length} students`];
  const cannot: string[] = [];

  const pr = probe(d);
  if (pr.findings.length) out.push(`PROBE (what the School OS noticed, most severe first):\n${pr.findings.slice(0, 8).map(f => `- [${f.severity}] ${f.title}. ${f.summary}`).join('\n')}`);

  if (a.can('academics.read')) {
    const A = d.academics;
    out.push([
      `ACADEMICS: school mastery ${pct(A.schoolTml)} (two weeks ago ${pct(A.schoolTmlBefore)}); ${A.evidenced} students with evidence, ${A.noEvidence} without.`,
      `By class: ${A.sections.map(s => `${s.cls} ${pct(s.tml)} (${s.atRisk} at risk)`).join('; ') || 'no data'}.`,
      A.weakest ? `Weakest: Class ${A.weakest.grade} ${A.weakest.subject} ${pct(A.weakest.tml)}.` : '',
      `At risk (lowest first): ${A.atRisk.slice(0, 10).map(s => `${S(s.id, s.name)} ${s.cls} ${pct(s.overall)}`).join(', ') || 'none'}.`,
    ].filter(Boolean).join('\n'));
  } else cannot.push('academics');

  if (a.can('workforce.read')) {
    const W = d.workforce;
    out.push([
      `STAFF: ${W.teachers.length} teachers, ratio ${W.ratio ?? '—'}:1, ${W.backlog} submissions waiting to be graded school-wide.`,
      `On leave today: ${W.onLeaveToday.map(l => T(l.staffId, l.staffName)).join(', ') || 'nobody'}. Leave awaiting approval: ${W.pendingLeave.length}.`,
      `Inactive teachers (nothing in 30 days): ${W.teachers.filter(t => t.activity === 'none').map(t => T(t.id, t.name)).join(', ') || 'none'}.`,
      `Biggest grading backlogs: ${W.teachers.filter(t => t.backlog > 0).sort((x, y) => y.backlog - x.backlog).slice(0, 5).map(t => `${T(t.id, t.name)} ${t.backlog}${t.oldestPendingDays ? ` (oldest ${t.oldestPendingDays} days)` : ''}`).join(', ') || 'none'}.`,
    ].join('\n'));
  } else cannot.push('staff and leave');

  if (a.can('fees.read')) {
    const F = d.fees.totals;
    const month = today.slice(0, 7);
    const monthIn = d.fees.receipts.filter(r => !r.voided && r.paidOn.slice(0, 7) === month).reduce((n, r) => n + r.amount, 0);
    const worst = d.fees.families.filter(f => f.overdue > 0).sort((x, y) => y.overdue - x.overdue).slice(0, 6);
    out.push([
      `FEES (${d.fees.session}): billed ${inr(F.billed)}, collected ${inr(F.collected)} (${pct(F.collectionRate)}), outstanding ${inr(F.outstanding)}, overdue ${inr(F.overdue)} across ${F.familiesOverdue} families. Collected this month: ${inr(monthIn)}.`,
      `Largest overdue: ${worst.map(f => `${S(f.studentId, f.name)} ${f.cls} ${inr(f.overdue)} (${f.maxDaysOverdue} days)`).join(', ') || 'none'}.`,
    ].join('\n'));
  } else cannot.push('fees');

  if (a.can('admissions.read')) {
    const P = d.admissions;
    out.push(`ADMISSIONS (${P.session}): ${P.total} applicants, ${P.enrolled} enrolled, conversion ${pct(P.conversion)}, ${P.stale.length} idle too long. Funnel: ${P.funnel.map(f => `${f.stage} ${f.reached}`).join(' → ')}.`);
  } else cannot.push('admissions');

  if (a.can('wellness.read')) {
    // Anonymised: school level only, suppressed under 5 students (as the CBSE report).
    const { data: w } = await db.from('wellness_logs').select('student_id, energy').eq('school_id', me.schoolId)
      .gte('created_at', new Date(Date.now() - 14 * DAY_MS).toISOString()).not('energy', 'is', null);
    const n = new Set((w || []).map(r => r.student_id)).size;
    const avg = n >= 5 ? (w || []).reduce((s, r) => s + (r.energy ?? 0), 0) / (w || []).length : null;
    const low = n >= 5 ? (w || []).filter(r => (r.energy ?? 5) <= 2).length / (w || []).length : null;
    out.push(`WELLNESS (anonymised, 14 days): ${n} students checked in${avg !== null ? `, average energy ${avg.toFixed(1)}/5, ${pct(low! * 100)} of check-ins low` : ' (too few to report without identifying anyone)'}. CBSE wellness filing: ${d.filing.status}${d.filing.dueOn ? `, due ${d.filing.dueOn}` : ''}.`);
  } else cannot.push('wellness');

  if (a.can('compliance.read')) {
    out.push(`COMPLIANCE (DPDP): ${d.compliance.flags.map(f => `[${f.tone === 'r' ? 'urgent' : 'watch'}] ${f.title}`).join('; ') || 'no flags'}. Guardian coverage ${pct(d.compliance.guardianCoverage)}.`);
  }

  if (a.any('feed.read', 'incidents.manage')) {
    const feed = await feedLines(db, me, book, 10);
    out.push(`SITUATIONAL FEED: ${feed.open} open across the school (${feed.critical} critical, ${feed.escalated} escalated to you)${feed.lines.length ? `\n${feed.lines.join('\n')}` : ''}`);
  }
  if (a.can('incidents.manage')) {
    const { data: inc } = await db.from('incidents').select('id, category, severity, summary, student_id, class_name, parent_notice, status, created_at')
      .eq('school_id', me.schoolId).eq('status', 'open').order('created_at', { ascending: false }).limit(20);
    const waiting = (inc || []).filter(i => i.parent_notice === 'principal_decides');
    out.push(`INCIDENTS: ${(inc || []).length} open; waiting for your decision on parents: ${waiting.map(i => `${i.category} "${i.summary}" (${i.class_name || 'no class'}, ${ageDays(i.created_at)} days)`).join('; ') || 'none'}.`);
  }
  if (a.can('attendance.read') && isSunday(today)) out.push('ATTENDANCE TODAY: it is Sunday, no school and no registers today.');
  else if (a.can('attendance.read')) {
    const { data: att } = await db.from('attendance').select('class_name, status').eq('school_id', me.schoolId).eq('day', today);
    const classes = [...new Set(d.students.map(s => normClass(s.cls)).filter(Boolean))];
    const marked = new Set((att || []).map(r => normClass(r.class_name)));
    const absent = (att || []).filter(r => r.status === 'absent').length;
    out.push(`ATTENDANCE TODAY: ${marked.size} of ${classes.length} classes marked, ${absent} students absent. Not marked: ${classes.filter(c => !marked.has(c)).map(c => displayClass(c)).join(', ') || 'none'}.`);
  }
  if (a.can('messages.office')) {
    const threads = await threadLines(db, me, book, true);
    out.push(threads.length ? `PARENT MESSAGES TO THE OFFICE:\n${threads.join('\n')}` : 'PARENT MESSAGES TO THE OFFICE: none open.');
  }
  if (cannot.length) out.push(`OUTSIDE THIS PERSON'S OFFICE ROLE (if asked, tell them it is outside their role and who can see it, e.g. the finance head or principal): ${cannot.join(', ')}.`);
  return tokenize(out.join('\n\n'), book);
}
