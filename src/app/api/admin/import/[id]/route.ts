import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/serverAuth';
import { actionResponse, jobResponse } from '@/lib/import/routes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** GET one import (progress, problems, whether it can be undone). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(req, 'data.import');
  if ('res' in auth) return auth.res;
  return jobResponse(auth.db, auth.admin.schoolId, (await params).id);
}

/** POST { action: 'uploaded' | 'commit' | 'undo' | 'cancel' }. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(req, 'data.import');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  return actionResponse(db, { kind: 'admin', id: admin.id, name: admin.name, schoolId: admin.schoolId }, (await params).id, await req.json().catch(() => null));
}
