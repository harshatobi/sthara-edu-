import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { linkUsable } from '@/lib/whatsapp/config';

export type GuardianPref = 'grades' | 'homework_due' | 'alerts' | 'fees' | 'messages';

/**
 * Tells a student's verified parents something: an in-app notification always,
 * and a WhatsApp message to each parent who linked and opted in to this kind of
 * update. Never throws: a failed notice must not fail the school action behind it.
 */
export async function notifyGuardians(db: SupabaseClient, n: {
  schoolId: string; studentId: string; type: string; title: string; body: string;
  pref: GuardianPref; metadata?: Record<string, unknown>;
  /** Plain-text WhatsApp version; defaults to title + body. */
  whatsapp?: string;
  /** Only these parents (e.g. the one a teacher replied to). */
  parentIds?: string[];
  /** Skip the in-app notification (the caller already wrote one). */
  skipInApp?: boolean;
}): Promise<{ parents: number; whatsapp: number }> {
  try {
    let q = db.from('guardians').select('parent_id').eq('student_id', n.studentId).eq('verified', true);
    if (n.parentIds?.length) q = q.in('parent_id', n.parentIds);
    const { data: links } = await q;
    const parents = [...new Set((links || []).map(l => l.parent_id as string))];
    if (!parents.length) return { parents: 0, whatsapp: 0 };
    if (!n.skipInApp) {
      const { error } = await db.from('notifications').insert(parents.map(pid => ({
        school_id: n.schoolId, user_id: pid, student_id: n.studentId, type: n.type, title: n.title, body: n.body, metadata: n.metadata ?? {},
      })));
      if (error) console.warn('[notifyGuardians] in-app failed:', error.message);
    }
    const { data: wa, error: waErr } = await db.from('whatsapp_links').select('user_id, phone_e164, prefs, verified_at, verified_mode')
      .in('user_id', parents).eq('opted_in', true).not('verified_at', 'is', null);
    if (waErr) return { parents: parents.length, whatsapp: 0 };
    let sent = 0;
    for (const l of wa || []) {
      if (!linkUsable(l) || (l.prefs as Record<string, boolean> | null)?.[n.pref] === false) continue;
      const r = await sendWhatsApp(db, {
        to: l.phone_e164, userId: l.user_id, schoolId: n.schoolId, kind: 'notify',
        body: n.whatsapp ?? `${n.title}\n${n.body}\n\nReply to ask the School OS anything about your child.`,
        meta: { type: n.type, studentId: n.studentId },
      });
      if (r.ok) sent++;
    }
    return { parents: parents.length, whatsapp: sent };
  } catch (e: any) {
    console.warn('[notifyGuardians]', e?.message);
    return { parents: 0, whatsapp: 0 };
  }
}
