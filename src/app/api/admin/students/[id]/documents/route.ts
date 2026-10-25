import { NextResponse, type NextRequest } from 'next/server';
import { isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import type { Access } from '@/lib/admin/rbac';
import { canManageKind, canSeeKind } from '@/lib/students/documents';
import { decideDoc, finishUpload, listDocs, openDoc, removeDoc, uploadUrl, type DocCan } from '@/lib/students/documentsServer';

export const dynamic = 'force-dynamic';

const canOf = (a: Access): DocCan => ({
  students: a.can('students.read'), health: a.can('health.read'), manageStudents: a.can('students.manage'), manageHealth: a.can('health.manage'),
});

/**
 * One student's documents (brief 04). Register readers see every kind but medical and disability ones, which need
 * health.read. The registrar (students.manage) adds, checks and removes them; the health officer (health.manage)
 * the medical ones.
 *   GET                                                    documents, the checklist for the student's class
 *   POST { action }:
 *     upload-url { kind, fileName, fileBytes }             a one-time upload link (up to 25 MB, any type)
 *     upload-done { path, kind, title?, document_no?, issued_on?, valid_until?, fileName, verified? }
 *                                                          verified: the office saw the original
 *     open { docId }                                       a two-minute link (recorded)
 *     verify { docId } | reject { docId, note }            the check against the original
 *     remove { docId, reason }                             an upload made by mistake (recorded)
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ['students.read', 'health.read']);
  if ('res' in auth) return auth.res;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const can = canOf(auth.admin.access);
  try {
    const out = await listDocs(auth.db, auth.admin.schoolId, id, can);
    if (!out) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    return NextResponse.json({ ...out, can: { add: can.manageStudents || can.manageHealth, students: can.manageStudents, health: can.manageHealth } });
  } catch (e) {
    console.error('[admin/students/documents]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load the documents.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ['students.read', 'health.read']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const can = canOf(admin.access);
  const manage = (kind: string) => canManageKind(kind, { students: can.manageStudents, health: can.manageHealth });
  const a = { id: admin.id, schoolId: admin.schoolId, role: 'admin' as const };
  const b = (await req.json().catch(() => null)) || {};
  const doc = isUuid(b.docId) ? b.docId : null;
  const noDoc = { ok: false as const, error: 'Pick a document.', status: 400 };
  const out = b.action === 'upload-url' ? await uploadUrl(db, a, id, b, manage)
    : b.action === 'upload-done' ? await finishUpload(db, a, id, b, manage, 'office')
      : b.action === 'open' ? (doc ? await openDoc(db, a, doc, d => d.student_id === id && canSeeKind(d.kind, { students: can.students, health: can.health })) : noDoc)
        : b.action === 'verify' ? (doc ? await decideDoc(db, a, doc, true, '', manage) : noDoc)
          : b.action === 'reject' ? (doc ? await decideDoc(db, a, doc, false, str(b.note, 300), manage) : noDoc)
            : b.action === 'remove' ? (doc ? await removeDoc(db, a, doc, str(b.reason, 300), manage) : noDoc)
              : { ok: false as const, error: 'Unknown action.', status: 400 };
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
