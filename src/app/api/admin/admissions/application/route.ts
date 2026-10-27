import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, requireAdmin } from '@/lib/admin/serverAuth';
import { loadApplication } from '@/lib/admin/applicationServer';

export const dynamic = 'force-dynamic';

/**
 * One applicant's application for the office (admissions.read): the form, documents with it, the checks (age for
 * the class, the document checklist, siblings at the school, staff in the family) and what is still missing.
 *   GET ?id=<applicant>
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.read');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const id = req.nextUrl.searchParams.get('id');
  if (!isUuid(id)) return bad('Pick an applicant.');
  const can = admin.access;
  const app = await loadApplication(db, admin.schoolId, id, {
    see: true, manage: can.can('admissions.manage'), health: can.can('health.read'), manageHealth: can.can('health.manage'),
  });
  if (!app) return bad('Applicant not found.', 404);
  return NextResponse.json(app);
}
