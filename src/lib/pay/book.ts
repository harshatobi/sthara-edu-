/**
 * Sthara Pay, from this side of the wire: checking what it signs and sealing its keys. Pure, so it can be tested alone.
 * Pay is a separate service. Nothing in School OS depends on it until a school is connected.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const MAX_AGE_MS = 5 * 60_000;

/** Pay signs `${timestamp}.${raw body}`. An old message is refused, so a captured one cannot be replayed later. */
export function verifyPaySignature(secret: string, timestamp: string | null, signature: string | null, raw: string, now = Date.now()): boolean {
  if (!secret || !timestamp || !signature?.startsWith('v1=')) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_AGE_MS) return false;
  const want = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex'));
  const got = Buffer.from(signature.slice(3));
  return want.length === got.length && timingSafeEqual(want, got);
}

const key = (b64: string) => {
  const k = Buffer.from(b64, 'base64');
  if (k.length !== 32) throw new Error('PAY_CONNECTION_KEY must be 32 bytes, base64');
  return k;
};
/** AES-256-GCM, bound to the school, so one school's sealed key cannot be copied onto another's row. */
export function seal(plain: string, schoolId: string, keyB64: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(keyB64), iv);
  c.setAAD(Buffer.from(schoolId));
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}
export function unseal(sealed: string, schoolId: string, keyB64: string): string {
  const [v, iv, tag, body] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !body) throw new Error('Unknown sealed format');
  const d = createDecipheriv('aes-256-gcm', key(keyB64), Buffer.from(iv, 'base64'));
  d.setAAD(Buffer.from(schoolId));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]).toString('utf8');
}

/** Rupees to whole paise, exactly: 0.1 + 0.2 style float error must never reach a payment. */
export function toPaise(rupees: number): number {
  return Math.round(Number(rupees) * 100);
}
/** One link per invoice, balance and India day: reopening today returns today's link instead of a second payable one. */
export const feeLinkKey = (invoiceId: string, balancePaise: number, day: string) => `fee:${invoiceId}:${balancePaise}:${day}`;
/** Backoff for reporting a counter receipt, capped at six hours. */
export const retryDelaySeconds = (attempts: number) => Math.min(60 * 2 ** Math.max(0, attempts - 1), 6 * 3600);
