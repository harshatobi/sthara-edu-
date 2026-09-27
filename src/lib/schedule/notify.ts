import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { whatsappStaff } from '@/lib/staff/notify';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import type { PersonKey } from './types';

/**
 * Tells one person about a cover or duty. Accounts get an in-app notification and, if they linked
 * WhatsApp and kept alerts on, a WhatsApp message. Register staff with no login get WhatsApp on their
 * register number only when the school recorded their consent. Never throws.
 */
export async function notifyPerson(db: SupabaseClient, schoolId: string, who: PersonKey, title: string, body: string, meta: Record<string, unknown> = {}): Promise<void> {
  try {
    if (!who.startsWith('s:')) {
      await db.from('notifications').insert({ school_id: schoolId, user_id: who, type: 'schedule', title, body, metadata: meta })
        .then(({ error }) => { if (error) console.warn('[schedule notify] in-app failed:', error.message); });
      await whatsappStaff(db, schoolId, [who], 'alerts', `${title}\n${body}`, meta);
      return;
    }
    const { data: m } = await db.from('staff_members').select('phone_e164, whatsapp_opt_in, active').eq('id', who.slice(2)).eq('school_id', schoolId).maybeSingle();
    if (m?.active && m.whatsapp_opt_in && m.phone_e164) {
      await sendWhatsApp(db, { to: m.phone_e164, schoolId, kind: 'notify', body: `${title}\n${body}`, meta: { ...meta, staffMemberId: who.slice(2) } });
    }
  } catch (e: any) {
    console.warn('[schedule notify]', e?.message);
  }
}

/** Office accounts in a school that currently hold a permission (for alerts to whoever arranges cover). */
export async function holdersOf(db: SupabaseClient, schoolId: string, perm: string): Promise<string[]> {
  const { data: roles } = await db.from('role_permissions').select('role_key').eq('perm', perm);
  const keys = (roles || []).map(r => r.role_key);
  if (!keys.length) return [];
  const today = new Date().toISOString().slice(0, 10);
  const { data: grants } = await db.from('role_grants').select('user_id, expires_on').eq('school_id', schoolId).in('role_key', keys).is('revoked_at', null);
  return [...new Set((grants || []).filter(g => !g.expires_on || g.expires_on >= today).map(g => g.user_id as string))];
}

/** In-app (and WhatsApp alert) to everyone who arranges cover. */
export async function alertCoordinators(db: SupabaseClient, schoolId: string, title: string, body: string, meta: Record<string, unknown> = {}): Promise<void> {
  const ids = await holdersOf(db, schoolId, 'schedule.academic');
  if (!ids.length) return;
  await db.from('notifications').insert(ids.map(id => ({ school_id: schoolId, user_id: id, type: 'schedule', title, body, metadata: meta })))
    .then(({ error }) => { if (error) console.warn('[schedule notify] coordinators failed:', error.message); });
  await whatsappStaff(db, schoolId, ids, 'alerts', `${title}\n${body}`, meta);
}
