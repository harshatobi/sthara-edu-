import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { reportError } from '@/lib/errors/log';
import { isNoise } from '@/lib/errors/fingerprint';

export const dynamic = 'force-dynamic';

const KINDS = ['client', 'render', 'unhandled'] as const;
const MAX_BODY = 16 * 1024;

/**
 * POST /api/errors — errors from the browser (window errors, unhandled promise rejections, error boundaries).
 *   { kind: 'client' | 'render' | 'unhandled', message, stack?, path?, digest? }
 * Same-origin only, size-capped and rate-limited per address. The signed-in user (from the session cookie) and
 * their school are attached when there is one. Always answers 204, so a page never learns more than "sent".
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) return new NextResponse(null, { status: 204 });
  if (!checkRateLimit(`errors:${getClientIp(req)}`, ...limitOf('clientErrors')).allowed) return new NextResponse(null, { status: 204 });
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY) return new NextResponse(null, { status: 204 });
  // Read at most MAX_BODY bytes whatever the headers claim (a chunked body has no Content-Length).
  const text = await readCapped(req, MAX_BODY);
  if (text === null) return new NextResponse(null, { status: 204 });
  let b: Record<string, unknown> | null = null;
  try { b = JSON.parse(text) as Record<string, unknown>; } catch { b = null; }
  if (!b || typeof b.message !== 'string' || !b.message.trim()) return new NextResponse(null, { status: 204 });
  const kind = KINDS.includes(b.kind as (typeof KINDS)[number]) ? (b.kind as (typeof KINDS)[number]) : 'client';
  const message = b.message.slice(0, 2000);
  const stack = typeof b.stack === 'string' ? b.stack.slice(0, 8000) : null;
  if (isNoise({ message, stack })) return new NextResponse(null, { status: 204 });

  // Who saw it: the access token the app keeps in the __session cookie, if it's still valid.
  let who: { userId: string | null; schoolId: string | null; userRole: string | null } = { userId: null, schoolId: null, userRole: null };
  const token = req.cookies.get('__session')?.value;
  if (token) {
    try {
      const db = createAdminClient();
      const { data } = await db.auth.getUser(token);
      if (data.user) {
        const { data: row } = await db.from('users').select('school_id, role').eq('id', data.user.id).maybeSingle();
        who = { userId: data.user.id, schoolId: row?.school_id ?? null, userRole: row?.role ?? null };
      }
    } catch { /* anonymous */ }
  }
  const path = typeof b.path === 'string' ? b.path : null;
  await reportError({
    source: 'client', kind, message, stack, path, route: path,
    digest: typeof b.digest === 'string' ? b.digest.slice(0, 120) : null,
    userAgent: req.headers.get('user-agent'), ...who,
  });
  return new NextResponse(null, { status: 204 });
}

/** The request body as text, or null if it is longer than `max` bytes (reading stops there). */
async function readCapped(req: NextRequest, max: number): Promise<string | null> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}
