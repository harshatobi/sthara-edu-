import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { decideDoc, finishUpload, openDoc, removeDoc, uploadUrl, type AppCan } from '@/lib/admin/applicationServer';

export const dynamic = 'force-dynamic';

/**
 * Documents with an application. The file goes straight from the browser to the private bucket through a one-time
 * link; the record is written once it has arrived. Medical kinds need the health roles, as on the student record.
 *   POST { action: 'upload-url', applicantId, kind, fileName, fileBytes }               admissions.manage
 *   POST { action: 'upload-done', applicantId, path, kind, fileName, title?, document_no?, issued_on?, valid_until?, verified? }
 *   POST { action: 'open', id }                                                           admissions.read
 *   POST { action: 'verify' | 'reject', id, note? }                                       admissions.manage (reject needs a note)
 *   POST { action: 'remove', id, reason }                                                 admissions.manage
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ['admissions.read', 'admissions.manage']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const can: AppCan = {
    see: admin.access.any('admissions.read', 'admissions.manage'), manage: admin.access.can('admissions.manage'),
    health: admin.access.can('health.read'), manageHealth: admin.access.can('health.manage'),
  };
  const actor = { id: admin.id, schoolId: admin.schoolId };
  const out = (r: { ok: true } | { ok: false; error: string; status: number }) => (r.ok ? NextResponse.json(r) : bad(r.error, r.status));
  const writing = b.action !== 'open';
  if (writing && !can.manage && !can.manageHealth) return bad('Your role doesn’t allow this (add applicants, move them between stages and propose offers). Ask a school admin.', 403);

  switch (b.action) {
    case 'upload-url':
      if (!isUuid(b.applicantId)) return bad('Pick the applicant.');
      return out(await uploadUrl(db, actor, b.applicantId, b, can));
    case 'upload-done':
      if (!isUuid(b.applicantId)) return bad('Pick the applicant.');
      return out(await finishUpload(db, actor, b.applicantId, b, can));
    case 'open':
      if (!isUuid(b.id)) return bad('Pick the document.');
      return out(await openDoc(db, actor, b.id, can));
    case 'verify':
    case 'reject':
      if (!isUuid(b.id)) return bad('Pick the document.');
      return out(await decideDoc(db, actor, b.id, b.action === 'verify', str(b.note, 300), can));
    case 'remove':
      if (!isUuid(b.id)) return bad('Pick the document.');
      return out(await removeDoc(db, actor, b.id, str(b.reason, 300), can));
    default:
      return bad('Unknown action.');
  }
}
