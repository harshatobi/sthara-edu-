/**
 * Request-explorer helpers shared by the server and the console. Pure, so they are unit-tested.
 */

/** Headers the proxy stamps on every /api request, read back by the auth helpers to time it. */
export const REQ_PATH = 'x-sthara-path', REQ_METHOD = 'x-sthara-method', REQ_START = 'x-sthara-start';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A request path as a route: ids become ":id", so /api/ops/schools/<uuid>/support and its siblings group together
 * and no record id is stored. Query strings never reach here.
 */
export function routeOf(path: string): string {
  const clean = path.split('?')[0].split('#')[0];
  return clean.split('/').map(seg => (UUID.test(seg) || /^\d{4,}$/.test(seg) || seg.length > 40 ? ':id' : seg)).join('/').slice(0, 300) || '/';
}

export const SINCE = { '15m': 15, '1h': 60, '6h': 360, '24h': 1440, '7d': 10080 } as const;
export type Since = keyof typeof SINCE;
export const isSince = (v: unknown): v is Since => typeof v === 'string' && Object.hasOwn(SINCE, v);

/** How slow a request was, as the explorer colours it. */
export const speed = (ms: number): 'fast' | 'slow' | 'very_slow' => (ms >= 5000 ? 'very_slow' : ms >= 1500 ? 'slow' : 'fast');

export interface Timed { userId: string | null; at: string; durationMs: number }
/**
 * Whether something logged at `at` by `userId` happened during this request: after it started (with a second's
 * grace for clock skew between the function and the database) and before it was recorded as finished.
 */
export function during(req: Timed, userId: string | null, at: string, graceMs = 1000): boolean {
  if (!req.userId || req.userId !== userId) return false;
  const end = Date.parse(req.at), t = Date.parse(at);
  return t >= end - req.durationMs - graceMs && t <= end + graceMs;
}

/** Whether an AI call failed because the provider's rate or quota limit was hit. */
export const isRateLimited = (error: string | null | undefined) => !!error && /\b429\b|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(error);

/** The pth percentile (0-100) of a list of numbers, or null when it is empty. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}
