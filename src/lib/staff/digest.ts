import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canSeeSituation, isLeadership, type FeedCaller } from '@/lib/feed/access';
import { isEscalated, istDay, DAY_MS } from '@/lib/feed/rules';
import { displayClass, normClass } from '@/lib/teacher/scope';
import { linkUsable } from '@/lib/whatsapp/config';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { loadScheduleRows } from '@/lib/schedule/load';
import { agenda, hhmm } from '@/lib/schedule/engine';
import { needsOn } from '@/lib/schedule/cover';

/** Morning / afternoon / evening by the school's clock (IST). */
const greeting = () => {
  const h = new Date(Date.now() + 330 * 60_000).getUTCHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The day at a glance, as a WhatsApp message. Deterministic (no model call): it
 * counts what needs the person today. Teachers: their feed, parents waiting,
 * work to review, today's register. Leadership: escalations, critical items,
 * incident decisions, unmarked registers, office messages, leave to approve.
 */
export async function buildDigest(db: SupabaseClient, me: FeedCaller): Promise<{ text: string; options: string[] }> {
  const today = istDay();
  const { data: sit } = await db.from('situations').select('id, school_id, audience, teacher_id, class_name, severity, title, escalate_at, acknowledged_at, created_at')
    .eq('school_id', me.schoolId).is('acknowledged_at', null).gte('created_at', new Date(Date.now() - 30 * DAY_MS).toISOString()).limit(400);
  const open = (sit || []).filter(r => canSeeSituation(me, r));
  const esc = open.filter(r => isEscalated(r));
  const crit = open.filter(r => r.severity === 'critical');
  const top = [...esc, ...crit.filter(r => !esc.includes(r)), ...open.filter(r => r.severity === 'high' && !esc.includes(r))].slice(0, 3);
  const lines: string[] = [];

  // Scheduling: the day's lessons, covers, duties and check-in (missing tables just leave these lines out).
  const sched = await loadScheduleRows(db, me.schoolId).catch(() => null);

  if (me.role === 'teacher') {
    lines.push(`*${greeting()}, ${me.name.split(' ')[0]}.* Here's your day.`);
    if (sched) {
      const [day] = agenda({ kind: 'teacher', userId: me.id }, today, today, sched);
      const lessons = day.items.filter(i => i.kind === 'lesson' && !i.coverFor && !i.covered).length;
      const covers = day.items.filter(i => i.kind === 'lesson' && i.coverFor) as any[];
      const duties = day.items.filter(i => i.kind === 'duty') as any[];
      if (day.off) lines.push(`• ${day.off.title}: no classes today`);
      else if (lessons || covers.length || duties.length) {
        lines.push(`• Today: ${plural(lessons, 'period')}${covers.length ? `, *${plural(covers.length, 'cover')}* (${covers.map(c => `P${c.slot.period_no} ${c.slot.class}`).join(', ')})` : ''}${duties.length ? `, duty: ${duties.map(d => `${d.title} ${hhmm(d.start, true)}`).join(', ')}` : ''}`);
      }
      const { count: punched } = await db.from('staff_punches').select('id', { count: 'exact', head: true }).eq('user_id', me.id).gte('at', new Date(Date.parse(`${today}T00:00:00Z`) - 330 * 60_000).toISOString());
      if (!punched && !day.off && lessons) lines.push('• Not checked in yet. Reply *IN* when you reach school.');
    }
    lines.push(`• Feed: ${plural(open.length, 'open item')}${crit.length ? `, ${crit.length} critical` : ''}${esc.length ? `, ${esc.length} escalated` : ''}`);
    const { data: threads } = await db.from('school_threads').select('id, staff_read_at, last_message_at').eq('staff_id', me.id).eq('status', 'open');
    const unread = (threads || []).filter(t => !t.staff_read_at || t.staff_read_at < t.last_message_at).length;
    if (unread) lines.push(`• Parents waiting: ${unread}`);
    const { data: mine } = await db.from('assignments').select('id').eq('teacher_id', me.id).eq('status', 'published').gte('created_at', new Date(Date.now() - 45 * DAY_MS).toISOString());
    if (mine?.length) {
      const { count } = await db.from('submissions').select('id', { count: 'exact', head: true }).in('assignment_id', mine.map(a => a.id)).or('teacher_approved.is.null,teacher_approved.eq.false');
      if (count) lines.push(`• Work to review: ${count}`);
    }
    if (me.classTeacherOf && new Date(`${today}T00:00:00Z`).getUTCDay() !== 0) {
      const { data: roster } = await db.from('users').select('id, student_class').eq('school_id', me.schoolId).eq('role', 'student');
      const ids = (roster || []).filter(s => normClass(s.student_class) === me.classTeacherOf).map(s => s.id);
      const { count } = ids.length ? await db.from('attendance').select('id', { count: 'exact', head: true }).in('student_id', ids).eq('day', today) : { count: 0 };
      lines.push(count ? `• ${displayClass(me.classTeacherOf)} register: marked` : `• ${displayClass(me.classTeacherOf)} register: *not marked yet*. Reply e.g. *ABSENT 4, 12* (everyone else present) or *ALL PRESENT*.`);
    }
  } else {
    lines.push(`*${greeting()}, ${me.name.split(' ')[0]}.* The school today:`);
    lines.push(`• Feed: ${plural(open.length, 'open item')}, ${crit.length} critical, *${esc.length} escalated to you*`);
    const a = me.access!;
    if (a.can('incidents.manage')) {
      const { count } = await db.from('incidents').select('id', { count: 'exact', head: true }).eq('school_id', me.schoolId).eq('parent_notice', 'principal_decides');
      if (count) lines.push(`• Incidents waiting for your decision: ${count}`);
    }
    if (a.can('attendance.read') && new Date(`${today}T00:00:00Z`).getUTCDay() !== 0) {
      const { data: kids } = await db.from('users').select('student_class').eq('school_id', me.schoolId).eq('role', 'student');
      const classes = new Set((kids || []).map(k => normClass(k.student_class)).filter(Boolean));
      const { data: att } = await db.from('attendance').select('class_name').eq('school_id', me.schoolId).eq('day', today);
      const marked = new Set((att || []).map(r => normClass(r.class_name)));
      lines.push(`• Registers: ${[...classes].filter(c => marked.has(c)).length} of ${classes.size} marked`);
    }
    if (a.can('messages.office')) {
      const { data: threads } = await db.from('school_threads').select('id, staff_read_at, last_message_at').eq('school_id', me.schoolId).eq('audience', 'office').eq('status', 'open');
      const unread = (threads || []).filter(t => !t.staff_read_at || t.staff_read_at < t.last_message_at).length;
      if (unread) lines.push(`• Parent messages to the office: ${unread}`);
    }
    if (sched && (a.can('schedule.academic') || a.can('feed.read'))) {
      const { needs } = needsOn(today, sched);
      const openCover = needs.filter(n => n.state === 'open').length;
      const reported = sched.absences.filter(x => x.on_date === today && x.status === 'reported').length;
      if (needs.length) lines.push(`• Cover: ${openCover ? `*${plural(openCover, 'lesson')} still need cover*` : 'every lesson covered'}${reported ? `, ${plural(reported, 'absence')} reported on WhatsApp to confirm` : ''}`);
    }
    if (a.can('leave.approve')) {
      const { count } = await db.from('leave_requests').select('id', { count: 'exact', head: true }).eq('school_id', me.schoolId).eq('status', 'pending');
      if (count) lines.push(`• Leave to approve: ${count}`);
    }
  }
  if (top.length) lines.push(`\n*First:*\n${top.map(r => `– ${r.title}`).join('\n')}`);
  const options = me.role === 'teacher'
    ? ['What needs me first today?', 'Who is behind on homework?', 'Any parents waiting for me?']
    : ['What needs my attention first?', 'Which teachers have a grading backlog?', 'How are fee collections this month?'];
  lines.push(`\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n_Reply with a number, or ask anything._`);
  return { text: lines.join('\n'), options };
}

/**
 * Sends today's digest once per IST day, if this person linked WhatsApp, is opted in
 * and hasn't switched the digest off. Called when they first message or open the app
 * (there is no scheduler yet). `force` sends it again (they asked: TODAY).
 */
export async function maybeSendDigest(db: SupabaseClient, me: FeedCaller, force = false): Promise<boolean> {
  try {
    if (me.role !== 'teacher' && !isLeadership(me)) return false;
    const { data: link } = await db.from('whatsapp_links').select('phone_e164, opted_in, prefs, verified_at, verified_mode').eq('user_id', me.id).maybeSingle();
    if (!link || !linkUsable(link) || (!force && (!link.opted_in || (link.prefs as Record<string, boolean> | null)?.digest === false))) return false;
    const today = istDay();
    if (!force) {
      const { data: sent } = await db.from('whatsapp_log').select('id').eq('user_id', me.id).eq('direction', 'out').eq('kind', 'notify')
        .eq('meta->>digest', today).limit(1);
      if (sent?.length) return false;
    }
    const d = await buildDigest(db, me);
    const r = await sendWhatsApp(db, { to: link.phone_e164, userId: me.id, schoolId: me.schoolId, kind: 'notify', body: d.text, meta: { digest: today, options: d.options } });
    return r.ok;
  } catch (e: any) {
    console.warn('[digest]', e?.message);
    return false;
  }
}
