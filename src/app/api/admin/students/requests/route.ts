import { NextResponse, type NextRequest } from 'next/server';
import { isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import type { Access } from '@/lib/admin/rbac';
import { decideRequest, pendingRequests } from '@/lib/students/family';
import { awaitingDocs } from '@/lib/students/documentsServer';
import type { RequestKind } from '@/lib/students/register';

export const dynamic = 'force-dynamic';

/** Which requests this person decides: the registrar all of them; the DPO the erasure requests. */
const decides = (a: Access): RequestKind[] => [...(a.can('students.manage') ? ['address', 'family', 'emergency'] as const : []),
  ...(a.any('students.manage', 'compliance.act') ? ['document_erasure'] as const : [])];

/**
 * Changes parents propose to family and contact details, their requests to erase a document, and the documents
 * waiting for the registrar's check.
 *   GET                               pending requests, oldest first (students.read; the DPO sees erasures), documents to check
 *   POST { id, approve, note }        apply or reject (students.manage; erasures also compliance.act); a rejection needs a note
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ['students.read', 'compliance.act', 'health.read']);
  if ('res' in auth) return auth.res;
  const a = auth.admin.access;
  const kinds: RequestKind[] = [...(a.can('students.read') ? ['address', 'family', 'emergency'] as const : []), ...(a.any('students.read', 'compliance.act') ? ['document_erasure'] as const : [])];
  try {
    const can = { students: a.can('students.read'), health: a.can('health.read'), manageStudents: a.can('students.manage'), manageHealth: a.can('health.manage') };
    const [requests, documents] = await Promise.all([
      kinds.length ? pendingRequests(auth.db, auth.admin.schoolId, kinds) : [],
      awaitingDocs(auth.db, auth.admin.schoolId, can),
    ]);
    return NextResponse.json({ requests, documents, can: { manage: a.can('students.manage'), decides: decides(a) } });
  } catch (e) {
    console.error('[admin/students/requests]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load the requests.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ['students.manage', 'compliance.act']);
  if ('res' in auth) return auth.res;
  const b = (await req.json().catch(() => null)) || {};
  if (!isUuid(b.id)) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  const out = await decideRequest(auth.db, { id: auth.admin.id, schoolId: auth.admin.schoolId }, b.id, b.approve === true, str(b.note, 300), decides(auth.admin.access));
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
