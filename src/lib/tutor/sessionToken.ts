import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Tamper-proof state for one Socratic tutor session. The hint count feeds the
 * TML "D" component (unaided=100 … revealed=10), so it can't be trusted from
 * the client: the server returns this HMAC-signed token every turn and only
 * accepts state it signed itself. Nothing is written until the session ends,
 * so an abandoned session leaves no evidence either way.
 */
export interface TutorSessionState {
  uid: string;
  subject: string;
  topic: string;
  step: number;        // Socratic questions asked so far (1-based once started)
  hints: number;       // wrong/partial replies that earned a hint
  revealed: boolean;
  done: boolean;
  /** The tutor question currently being answered — signed so the student can't swap in an easier one. */
  question?: string;
  iat: number;
}

const MAX_AGE_MS = 3 * 60 * 60 * 1000; // a session left open for 3h is stale

function secret(): string {
  const s = process.env.TUTOR_SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!s) throw new Error('Tutor session signing secret is not configured.');
  return s;
}

const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url');

export function signSession(state: TutorSessionState): string {
  const body = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifySession(token: unknown, uid: string): TutorSessionState | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.', 2);
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac || '');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const state = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TutorSessionState;
    if (state.uid !== uid || Date.now() - state.iat > MAX_AGE_MS) return null;
    return state;
  } catch {
    return null;
  }
}
