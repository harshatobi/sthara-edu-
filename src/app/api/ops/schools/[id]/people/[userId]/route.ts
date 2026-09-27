import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import { resetPassword, updateTeacherAssignments } from '@/lib/ops/accounts';
import { deleteAccount } from '@/lib/ops/deletions';
import { parseReason } from '@/lib/settings/registry';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; userId: string }> };

/** PATCH — { subjects: [{class, subject}], classTeacherOf } : replace a teacher's assignments. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const { id, userId } = await params;
  const b = await req.json().catch(() => ({}));
  const subjects = Array.isArray(b.subjects) ? b.subjects.slice(0, 60) : [];
  const { error } = await updateTeacherAssignments(createAdminClient(), id, op.id, userId, subjects, b.classTeacherOf || null);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** POST — { action: 'reset-password' } : issue a new temporary password (shown once). */
export async function POST(req: NextRequest, { params }: Ctx) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const { id, userId } = await params;
  const b = await req.json().catch(() => ({}));
  if (b.action !== 'reset-password') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  const r = await resetPassword(createAdminClient(), id, op.id, userId);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ tempPassword: r.tempPassword });
}

/**
 * DELETE — { reason }: permanently delete one account (profile and login). Refused (409) for a
 * student with fee records, which are kept, and for the school's only school admin.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const { id, userId } = await params;
  const b = await req.json().catch(() => ({}));
  const reason = parseReason(b.reason);
  if (!reason) return NextResponse.json({ error: 'Give a reason for deleting the account (at least 4 characters).' }, { status: 400 });
  const out = await deleteAccount(createAdminClient(), op, id, userId, reason);
  return out.ok ? NextResponse.json({ ok: true, ...out.result }) : NextResponse.json({ error: out.error }, { status: out.status });
}
