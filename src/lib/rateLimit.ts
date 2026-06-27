/**
 * In-memory rate limiter for API routes.
 * Uses a sliding window counter per IP address.
 *
 * For production multi-instance deployments, swap this with Upstash Redis.
 * For single-instance Vercel serverless, this provides meaningful protection.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now - entry.windowStart > 60_000 * 5) {
        store.delete(key);
      }
    }
  }, 60_000 * 5);
}

/**
 * Check if an IP is rate-limited.
 * @param ip - The IP address of the requester
 * @param limit - Max requests per window (default: 20)
 * @param windowMs - Window size in ms (default: 60 seconds)
 */
export function checkRateLimit(
  ip: string,
  limit = 20,
  windowMs = 60_000
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.windowStart > windowMs) {
    // New window
    store.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, resetMs: windowMs };
  }

  if (entry.count >= limit) {
    const resetMs = windowMs - (now - entry.windowStart);
    return { allowed: false, remaining: 0, resetMs };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetMs: windowMs - (now - entry.windowStart),
  };
}

/**
 * Extract the real client IP from a Next.js request.
 */
export function getClientIp(request: Request): string {
  const headers = request.headers as any;
  return (
    headers.get?.('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get?.('x-real-ip') ||
    '127.0.0.1'
  );
}
