import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { linkUsable } from '@/lib/whatsapp/config';
import { sendWhatsApp } from '@/lib/whatsapp/send';

export type StaffPref = 'alerts' | 'messages' | 'digest';

/**
 * WhatsApp to teachers / office staff who linked a number, opted in and didn't
 * switch this kind of message off. Never throws; returns how many were sent.
 */
export async function whatsappStaff(db: SupabaseClient, schoolId: string, userIds: string[], pref: StaffPref, body: string, meta: Record<string, unknown> = {}): Promise<number> {
  try {
    const ids = [...new Set(userIds)].filter(Boolean);
    if (!ids.length) return 0;
    const { data: links } = await db.from('whatsapp_links').select('user_id, phone_e164, prefs, verified_at, verified_mode')
      .in('user_id', ids).eq('opted_in', true).not('verified_at', 'is', null);
    let sent = 0;
    for (const l of links || []) {
      if (!linkUsable(l) || (l.prefs as Record<string, boolean> | null)?.[pref] === false) continue;
      const r = await sendWhatsApp(db, { to: l.phone_e164, userId: l.user_id, schoolId, kind: 'notify', body, meta: { ...meta, pref } });
      if (r.ok) sent++;
    }
    return sent;
  } catch (e: any) {
    console.warn('[whatsappStaff]', e?.message);
    return 0;
  }
}
