import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, requireAdmin } from '@/lib/admin/serverAuth';
import { loadApplication } from '@/lib/admin/applicationServer';
import { codeStatus, issueCode, revokeCode } from '@/lib/admin/familyServer';
import { applyPath } from '@/lib/admin/familyAccess';

export const dynamic = 'force-dynamic';

/**
 * One applicant's application for the office (admissions.read): the form, documents with it, the checks (age for
 * the class, the document checklist, siblings at the school, staff in the family), what is still missing, and the
 * family's access code if one is live (its last two characters only).
 *   GET ?id=<applicant>
 *   POST { action: 'code', applicantId }       a new access code for the family, shown once (admissions.manage)
 *   POST { action: 'end-code', applicantId }   the family's code stops working
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.read');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const id = req.nextUrl.searchParams.get('id');
  if (!isUuid(id)) return bad('Pick an applicant.');
  const can = admin.access;
  const [app, code, { data: school }] = await Promise.all([
    loadApplication(db, admin.schoolId, id, {
      see: true, manage: can.can('admissions.manage'), health: can.can('health.read'), manageHealth: can.can('health.manage'),
    }),
    codeStatus(db, admin.schoolId, id),
    db.from('schools').select('settings').eq('id', admin.schoolId).maybeSingle(),
  ]);
  if (!app) return bad('Applicant not found.', 404);
  const schoolCode = (school?.settings as { code?: unknown } | null)?.code;
  return NextResponse.json({ ...app, accessCode: code, applyPath: typeof schoolCode === 'string' && schoolCode ? applyPath(schoolCode) : null });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.applicantId)) return bad('Pick an applicant.');
  const actor = { id: admin.id, schoolId: admin.schoolId };
  const r = b.action === 'code' ? await issueCode(db, actor, b.applicantId)
    : b.action === 'end-code' ? await revokeCode(db, actor, b.applicantId)
      : { ok: false as const, error: 'Unknown action.', status: 400 };
  return r.ok ? NextResponse.json(r) : bad(r.error, r.status);
}
