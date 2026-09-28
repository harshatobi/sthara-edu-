import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/serverAuth';
import { loadSubjectState, setElectives, setSubjectLeads } from '@/lib/subjects/server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/**
 * The school's subject links, for its own office.
 *   GET  what each class offers, who teaches it, electives, leads (academics.read or people.manage)
 *   POST { action: 'electives', classId, choices } | { action: 'leads', subjectKey, userIds }
 *        (people.manage or schedule.academic: school admin, principal, academic coordinator)
 * What a class offers stays with Sthara (set up in ops with the class list); the school
 * chooses electives per student and names subject leads.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ['academics.read', 'people.manage']);
  if ('res' in auth) return auth.res;
  const st = await loadSubjectState(auth.db, auth.admin.schoolId);
  if (!st.ok) return NextResponse.json({ error: st.error }, { status: st.status });
  // The school sees its own roster already; no linking plan (that's an ops tool).
  const { ok: _ok, plan: _plan, ...rest } = st;
  void _ok; void _plan;
  return NextResponse.json(rest);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ['people.manage', 'schedule.academic']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => ({}));
  let r;
  if (b.action === 'electives') {
    if (!isId(b.classId) || !b.choices || typeof b.choices !== 'object') return NextResponse.json({ error: 'Pick a class and the students’ electives.' }, { status: 400 });
    const choices: Record<string, string[]> = {};
    for (const [sid, v] of Object.entries(b.choices as Record<string, unknown>)) {
      if (!isId(sid) || !Array.isArray(v) || !v.every(isId)) return NextResponse.json({ error: 'Every choice must be a student and class subject ids.' }, { status: 400 });
      choices[sid] = v as string[];
    }
    r = await setElectives(db, admin.schoolId, admin.id, 'school_admin', b.classId, choices);
  } else if (b.action === 'leads') {
    if (typeof b.subjectKey !== 'string' || !Array.isArray(b.userIds) || !b.userIds.every(isId)) return NextResponse.json({ error: 'Pick a subject and its leads.' }, { status: 400 });
    r = await setSubjectLeads(db, admin.schoolId, admin.id, 'school_admin', b.subjectKey, b.userIds);
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  if (!r.ok) { const { ok: _ok, status, ...rest } = r; void _ok; return NextResponse.json(rest, { status }); }
  return NextResponse.json(r);
}
