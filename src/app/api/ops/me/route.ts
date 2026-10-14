import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { changeOwnPassword } from '@/lib/ops/org';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/** GET /api/ops/me — the signed-in operator: email, role, and whether they are still on a temporary password. */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, null);
  if (op instanceof Response) return op;
  return NextResponse.json({ email: op.email, role: op.role, mustChangePassword: op.mustChangePassword });
}

/**
 * POST /api/ops/me — { current, next }: change your own password. The current password is checked first, so a
 * borrowed session cannot lock the owner out. Five attempts in ten minutes.
 */
export async function POST(req: NextRequest) {
  const op = await operatorFor(req, null);
  if (op instanceof Response) return op;
  if (!checkRateLimit(`ops-password:${op.id}`, 5, 10 * 60_000).allowed) {
    return NextResponse.json({ error: 'Too many attempts. Wait ten minutes and try again.' }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  if (typeof b.current !== 'string' || typeof b.next !== 'string' || !b.current) return NextResponse.json({ error: 'Enter your current password and a new one.' }, { status: 400 });
  const out = await changeOwnPassword(createAdminClient(), op, b.current, b.next);
  return out.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: out.error }, { status: out.status });
}
