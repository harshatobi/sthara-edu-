import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/serverAuth';
import { createResponse, listResponse } from '@/lib/import/routes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Bulk import for the school's own office (data.import: principal and school admin).
 *   GET                                    the school's import history
 *   POST { dataset, fileName, fileBytes }  start an import; upload the file to the returned URL, then
 *                                          POST /api/admin/import/:id { action: 'uploaded' }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, 'data.import');
  if ('res' in auth) return auth.res;
  return listResponse(auth.db, auth.admin.schoolId);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'data.import');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  return createResponse(db, { kind: 'admin', id: admin.id, name: admin.name, schoolId: admin.schoolId }, await req.json().catch(() => null));
}
