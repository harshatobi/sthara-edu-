import { NextResponse, type NextRequest } from 'next/server';
import { requireParent } from '@/lib/parent/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { finishUpload, openDoc, parentChild, parentDocs, requestErasure, uploadUrl } from '@/lib/students/documentsServer';

export const dynamic = 'force-dynamic';

/**
 * Documents on the parent's verified children's records (brief 04). A parent's upload waits for the registrar's check.
 *   GET                                                          each child: documents, the admission checklist, my erasure requests
 *   POST { studentId, action }:
 *     upload-url { kind, fileName, fileBytes } | upload-done { path, kind, title?, issued_on?, valid_until?, fileName }
 *     open { docId }                                             a two-minute link (recorded)
 *     erase { docId, note? }                                     ask the school to erase it (the registrar decides)
 */
export async function GET(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  const { data: kids } = await auth.db.from('guardians').select('student_id').eq('parent_id', auth.parent.id).eq('verified', true).limit(20);
  try {
    const children = await Promise.all((kids || []).map(async k => ({ studentId: k.student_id as string, view: await parentDocs(auth.db, auth.parent.id, k.student_id) })));
    return NextResponse.json({ children: children.filter(c => c.view) });
  } catch (e) {
    console.error('[parent/documents]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load the documents.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  if (!checkRateLimit(`parent-documents:${auth.parent.id}`, 30, 60_000).allowed) return NextResponse.json({ error: 'Too many at once. Wait a minute.' }, { status: 429 });
  const b = (await req.json().catch(() => null)) || {};
  if (typeof b.studentId !== 'string') return NextResponse.json({ error: 'Pick your child.' }, { status: 400 });
  const st = await parentChild(auth.db, auth.parent.id, b.studentId);
  if (!st) return NextResponse.json({ error: 'Only a verified parent can do this.' }, { status: 403 });
  const a = { id: auth.parent.id, schoolId: st.school_id, role: 'parent' as const };
  // A parent may send any kind; the registrar (or the health officer, for medical ones) checks it.
  const any = () => true;
  const out = b.action === 'upload-url' ? await uploadUrl(auth.db, a, st.id, b, any)
    : b.action === 'upload-done' ? await finishUpload(auth.db, a, st.id, b, any, 'parent')
      : b.action === 'open' ? (typeof b.docId === 'string' ? await openDoc(auth.db, a, b.docId, d => d.student_id === st.id) : { ok: false as const, error: 'Pick a document.', status: 400 })
        : b.action === 'erase' ? await requestErasure(auth.db, auth.parent.id, b.studentId, b.docId, b.note)
          : { ok: false as const, error: 'Unknown action.', status: 400 };
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
