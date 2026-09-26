import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GRAPH_VERSION, whatsappConfig } from './config';

export type WaKind = 'ask' | 'answer' | 'notify' | 'otp' | 'message' | 'system';

export interface SendResult { ok: boolean; status: 'sent' | 'simulated' | 'failed'; id: string | null; error?: string }

const WINDOW_MS = 24 * 3600_000;

/** Has this number written to us in the last 24 hours (free-form replies allowed)? */
async function inServiceWindow(db: SupabaseClient, phone: string): Promise<boolean> {
  const { data } = await db.from('whatsapp_log').select('created_at').eq('phone_e164', phone).eq('direction', 'in')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return !!data && Date.now() - new Date(data.created_at).getTime() < WINDOW_MS;
}

async function post(payload: Record<string, unknown>): Promise<{ id: string | null; error?: string }> {
  const cfg = whatsappConfig();
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { id: null, error: body?.error?.message || `HTTP ${res.status}` };
  return { id: body?.messages?.[0]?.id ?? null };
}

/**
 * Sends one WhatsApp message and logs it. Inside the 24-hour service window it
 * goes as free text; outside it, as the approved alert template (WhatsApp's
 * rule for business-initiated messages). Simulated mode logs without sending.
 */
export async function sendWhatsApp(db: SupabaseClient, opts: {
  to: string; body: string; kind: WaKind; userId?: string | null; schoolId?: string | null;
  meta?: Record<string, unknown>; /** OTP codes always use the authentication template. */ otpCode?: string;
}): Promise<SendResult> {
  const cfg = whatsappConfig();
  const body = opts.body.slice(0, 4000);
  let result: { id: string | null; error?: string };
  let status: SendResult['status'];
  if (cfg.mode === 'simulated') {
    result = { id: null };
    status = 'simulated';
  } else {
    try {
      const to = opts.to.replace(/^\+/, '');
      if (opts.otpCode) {
        result = await post({
          to, type: 'template',
          template: { name: cfg.templateOtp, language: { code: 'en' }, components: [
            { type: 'body', parameters: [{ type: 'text', text: opts.otpCode }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: opts.otpCode }] },
          ] },
        });
      } else if (await inServiceWindow(db, opts.to)) {
        result = await post({ to, type: 'text', text: { preview_url: false, body } });
      } else {
        // Template parameters can't hold newlines or 4+ spaces.
        const flat = body.replace(/\s*\n+\s*/g, ' · ').replace(/\s{4,}/g, ' ').slice(0, 1000);
        result = await post({
          to, type: 'template',
          template: { name: cfg.templateAlert, language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: flat }] }] },
        });
      }
      status = result.error ? 'failed' : 'sent';
    } catch (e: any) {
      result = { id: null, error: e?.message || 'network error' };
      status = 'failed';
    }
  }
  const { error } = await db.from('whatsapp_log').insert({
    direction: 'out', user_id: opts.userId ?? null, school_id: opts.schoolId ?? null, phone_e164: opts.to,
    kind: opts.kind, body: opts.otpCode ? body.replace(opts.otpCode, '••••••') : body, status,
    provider_id: result.id, error: result.error ?? null, meta: opts.meta ?? {},
  });
  if (error) console.warn('[whatsapp] log failed:', error.message);
  if (status === 'failed') console.error('[whatsapp] send failed:', result.error);
  return { ok: status !== 'failed', status, id: result.id, error: result.error };
}

/** X-Hub-Signature-256 check on the raw webhook body. */
export function verifySignature(raw: string, header: string | null): boolean {
  const secret = whatsappConfig().appSecret;
  if (!secret || !header?.startsWith('sha256=')) return false;
  const want = Buffer.from(createHmac('sha256', secret).update(raw, 'utf8').digest('hex'));
  const got = Buffer.from(header.slice(7));
  return want.length === got.length && timingSafeEqual(want, got);
}
