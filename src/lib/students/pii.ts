import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { maskAadhaar, parseAadhaar } from './aadhaar';

export { maskAadhaar, parseAadhaar };

/**
 * Aadhaar on the student register. The number is encrypted in the app (AES-256-GCM) with STUDENT_PII_KEY (64 hex
 * characters, kept in Vercel and the disaster-recovery runbook); the database holds the ciphertext, the last 4
 * digits for display, and an HMAC of the number with the same key, so a repeat is found without decrypting.
 * Losing the key loses the stored numbers, never the rest of the record.
 */

function key(): Buffer {
  const hex = process.env.STUDENT_PII_KEY?.trim() || '';
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('STUDENT_PII_KEY is not set (64 hex characters). Aadhaar numbers cannot be stored or read.');
  return Buffer.from(hex, 'hex');
}

/** True when the server can store and read Aadhaar numbers. */
export const piiReady = () => /^[0-9a-f]{64}$/i.test(process.env.STUDENT_PII_KEY?.trim() || '');

/** What the register stores for a number: ciphertext ("v1:" iv, tag and data in base64url), last 4 and the HMAC. */
export function sealAadhaar(digits: string): { aadhaar_cipher: string; aadhaar_last4: string; aadhaar_hash: string } {
  const k = key();
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const data = Buffer.concat([c.update(digits, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return {
    aadhaar_cipher: `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${data.toString('base64url')}`,
    aadhaar_last4: digits.slice(-4),
    aadhaar_hash: aadhaarHash(digits),
  };
}

/** The keyed hash of a number (domain-separated from the encryption). */
export function aadhaarHash(digits: string): string {
  return createHmac('sha256', key()).update(`aadhaar:${digits}`).digest('hex');
}

/** The number back from its ciphertext. Throws when the key is wrong or the ciphertext was altered. */
export function openAadhaar(cipher: string): string {
  const [v, iv, tag, data] = cipher.split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unknown Aadhaar ciphertext format.');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}
