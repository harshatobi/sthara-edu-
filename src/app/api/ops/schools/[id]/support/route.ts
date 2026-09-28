import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import type { CorrectionInput } from '@/lib/ops/corrections';
import {
  applyCorrections, linkGuardian, loadFamilies, moveStudents, previewCorrections, promoteClass, setGuardianVerified, setLeft, unlinkGuardian,
} from '@/lib/ops/support';
import { parseReason } from '@/lib/settings/registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** GET /api/ops/schools/:id/support — students with their guardian links, and the school's parents. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  const r = await loadFamilies(createAdminClient(), id);
  return r.ok ? NextResponse.json({ families: r.families, parents: r.parents }) : NextResponse.json({ error: r.error }, { status: r.status });
}

/**
 * POST /api/ops/schools/:id/support — { action, reason, ... }
 *   link { parentId, studentId, relationship? } · verify / unverify / unlink { parentId, studentId }
 *   move { studentIds, toClass } · promote { fromClass, toClass } · left / returned { userId }
 *   corrections-preview { rows } (no reason needed) · corrections-apply { rows }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const { data: school } = await db.from('schools').select('id').eq('id', id).maybeSingle();
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  const rows: CorrectionInput[] = Array.isArray(b.rows) ? b.rows.slice(0, 500).map((r: Record<string, unknown>) => ({
    email: str(r?.email).trim().toLowerCase(),
    name: typeof r?.name === 'string' ? r.name : undefined,
    newEmail: typeof r?.newEmail === 'string' ? r.newEmail : undefined,
    rollNo: typeof r?.rollNo === 'string' ? r.rollNo : undefined,
    className: typeof r?.className === 'string' ? r.className : undefined,
  })) : [];
  if (b.action === 'corrections-preview') {
    if (!rows.length) return NextResponse.json({ error: 'No rows to preview.' }, { status: 400 });
    return NextResponse.json({ plan: await previewCorrections(db, id, rows) });
  }

  const reason = parseReason(b.reason);
  if (!reason) return NextResponse.json({ error: 'Give a reason (at least 4 characters). It goes in the audit log.' }, { status: 400 });

  let out: { ok: boolean; error?: string; status?: number; [k: string]: unknown };
  switch (b.action) {
    case 'link':
      if (!isId(b.parentId) || !isId(b.studentId)) return NextResponse.json({ error: 'Pick a parent and a student.' }, { status: 400 });
      out = await linkGuardian(db, id, op.id, b.parentId, b.studentId, str(b.relationship) || null, reason); break;
    case 'verify': case 'unverify':
      if (!isId(b.parentId) || !isId(b.studentId)) return NextResponse.json({ error: 'Pick a link.' }, { status: 400 });
      out = await setGuardianVerified(db, id, op.id, b.parentId, b.studentId, b.action === 'verify', reason); break;
    case 'unlink':
      if (!isId(b.parentId) || !isId(b.studentId)) return NextResponse.json({ error: 'Pick a link.' }, { status: 400 });
      out = await unlinkGuardian(db, id, op.id, b.parentId, b.studentId, reason); break;
    case 'move':
      if (!Array.isArray(b.studentIds) || !b.studentIds.every(isId) || !str(b.toClass)) return NextResponse.json({ error: 'Pick students and a class.' }, { status: 400 });
      out = await moveStudents(db, id, op.id, b.studentIds, str(b.toClass), reason); break;
    case 'promote':
      if (!str(b.fromClass) || !str(b.toClass)) return NextResponse.json({ error: 'Pick both classes.' }, { status: 400 });
      out = await promoteClass(db, id, op.id, str(b.fromClass), str(b.toClass), reason); break;
    case 'left': case 'returned':
      if (!isId(b.userId)) return NextResponse.json({ error: 'Pick an account.' }, { status: 400 });
      out = await setLeft(db, id, op.id, b.userId, b.action === 'left', reason); break;
    case 'corrections-apply':
      if (!rows.length) return NextResponse.json({ error: 'No rows to apply.' }, { status: 400 });
      out = await applyCorrections(db, id, op.id, rows, reason); break;
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  if (!out.ok) {
    const { status, ...rest } = out;
    return NextResponse.json(rest, { status: status ?? 400 });
  }
  return NextResponse.json(out);
}
