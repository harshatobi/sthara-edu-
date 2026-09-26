import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { linkUsable, whatsappConfig } from '@/lib/whatsapp/config';
import { normClass } from '@/lib/teacher/scope';
import { shapeFamily, type FamilyRows, type FamilyView, type WhatsAppStatus } from './family';

const DEFAULT_PREFS = { grades: true, homework_due: true, alerts: true, fees: true, messages: true };
const empty = { data: [] as any[], error: null };

/**
 * Everything a parent may see, fetched with the service key but scoped to the
 * children they are a VERIFIED guardian of (set by the school). Missing
 * optional tables degrade to "nothing yet" rather than failing the portal.
 */
export async function loadFamily(db: SupabaseClient, parent: { id: string; name: string | null; schoolId: string }): Promise<FamilyView> {
  const [{ data: links, error: linkErr }, { data: school }] = await Promise.all([
    db.from('guardians').select('student_id, relationship').eq('parent_id', parent.id).eq('verified', true),
    db.from('schools').select('name').eq('id', parent.schoolId).maybeSingle(),
  ]);
  if (linkErr) throw linkErr;
  const ids = (links || []).map(l => l.student_id as string);

  const { data: students } = ids.length
    ? await db.from('users').select('id, name, student_class, custom_student_id').in('id', ids).eq('school_id', parent.schoolId).eq('role', 'student')
    : empty;
  const kids = students || [];
  const kidIds = kids.map(s => s.id);
  const classes = [...new Set(kids.map(s => s.student_class).filter(Boolean))];
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString();

  const [teachers, assignments, submissions, tml, wellness, consents, invoices, threads, notices, wa] = await Promise.all([
    db.from('users').select('id, name, teacher_class, assignments').eq('school_id', parent.schoolId).eq('role', 'teacher'),
    kidIds.length ? db.from('assignments').select('id, title, type, subject, class, due_date, units, status, assigned_student_ids, created_at, teacher_id')
      .eq('school_id', parent.schoolId).gte('created_at', since).order('created_at', { ascending: false }).limit(400) : empty,
    kidIds.length ? db.from('submissions').select('id, assignment_id, student_id, score, max_score, teacher_approved, submitted_at, teacher_note').in('student_id', kidIds) : empty,
    kidIds.length ? db.from('tml_scores').select('student_id, subject, topic_name, score, confidence_band, components, item_count, computed_at')
      .in('student_id', kidIds).order('computed_at', { ascending: false }).limit(3000) : empty,
    // Energy only, never journal text (a row with a note is the student's private journal).
    kidIds.length ? db.from('wellness_logs').select('student_id, energy, created_at').in('student_id', kidIds).is('note', null)
      .gte('created_at', new Date(Date.now() - 14 * 86_400_000).toISOString()) : empty,
    kidIds.length ? db.from('consents').select('student_id, consent_type, granted').in('student_id', kidIds) : empty,
    kidIds.length ? db.from('fee_invoices').select('*').in('student_id', kidIds) : empty,
    db.from('school_threads').select('*').eq('parent_id', parent.id).order('last_message_at', { ascending: false }).limit(60),
    db.from('notifications').select('id, title, body, type, created_at, read, student_id').eq('user_id', parent.id).order('created_at', { ascending: false }).limit(30),
    db.from('whatsapp_links').select('phone_e164, opted_in, verified_at, verified_mode, otp_expires_at, prefs').eq('user_id', parent.id).maybeSingle(),
  ]);
  const invIds = (invoices.data || []).map((i: any) => i.id);
  const threadIds = (threads.data || []).map((t: any) => t.id);
  const [payments, lastMessages] = await Promise.all([
    invIds.length ? db.from('fee_payments').select('*').in('invoice_id', invIds) : Promise.resolve(empty),
    threadIds.length ? db.from('school_messages').select('thread_id, sender_role, body, created_at').in('thread_id', threadIds)
      .order('created_at', { ascending: false }).limit(400) : Promise.resolve(empty),
  ]);
  for (const [k, r] of Object.entries({ teachers, assignments, submissions, tml, wellness, consents, invoices, threads, notices })) {
    if ((r as any).error) console.warn(`[parent] ${k} unavailable:`, (r as any).error.message);
  }

  const cfg = whatsappConfig();
  const link = wa.error ? null : wa.data;
  const whatsapp: WhatsAppStatus = {
    mode: cfg.mode, businessNumber: cfg.businessNumber,
    linked: linkUsable(link), phone: link?.phone_e164 ?? null, optedIn: !!link?.opted_in && linkUsable(link),
    pending: !!link && !link.verified_at && !!link.otp_expires_at && new Date(link.otp_expires_at).getTime() > Date.now(),
    prefs: { ...DEFAULT_PREFS, ...((link?.prefs as Record<string, boolean>) || {}) },
  };

  const rows: FamilyRows = {
    parent: { id: parent.id, name: parent.name },
    schoolName: school?.name || 'School',
    links: links || [],
    students: kids,
    teachers: teachers.data || [],
    assignments: (assignments.data || []).filter((a: any) => classes.some(c => normClass(c) === normClass(a.class))),
    submissions: submissions.data || [],
    tml: tml.data || [],
    wellness: wellness.data || [],
    consents: consents.data || [],
    invoices: invoices.data || [],
    payments: payments.data || [],
    threads: threads.data || [],
    lastMessages: lastMessages.data || [],
    notices: notices.data || [],
    whatsapp,
  };
  return shapeFamily(rows);
}
