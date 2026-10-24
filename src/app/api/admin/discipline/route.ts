import { NextResponse, type NextRequest } from 'next/server';
import { isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { cancel, decide, forStudent, linkableIncidents, propose, register, waiting } from '@/lib/conduct/discipline';
import { cases } from '@/lib/conduct/counselling';

export const dynamic = 'force-dynamic';

/**
 * Discipline (brief 07), for the office.
 *   GET                         waiting for a decision (approvers) and the current record
 *   GET ?archive=1              past sessions' warnings and detentions (discipline.archive)
 *   GET ?studentId=             one student: actions (archive with discipline.archive), counselling dates and status
 *                               (counselling.overview / counselling.notes), incidents to link
 *   POST { action }:
 *     record { studentId, kind, onDate, untilDate?, reason, details?, incidentId?, notify? }   an approver records it approved
 *     propose { ... same }                    the registrar (or another discipline role) proposes it
 *     approve { id, notify? } | return { id, note }   the approver of its kind (a suspension is the principal's)
 *     cancel { id, reason }
 */
// Discipline is for those who decide it and the registrar; an office member who only reads the register sees none.
const READ = ['discipline.approve', 'discipline.suspend', 'discipline.archive'] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, [...READ, 'students.read', 'counselling.overview', 'counselling.notes']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const a = admin.access;
  const can = { approve: a.can('discipline.approve'), suspend: a.can('discipline.suspend'), archive: a.can('discipline.archive'), propose: a.any(...READ) };
  const p = req.nextUrl.searchParams;
  try {
    const studentId = p.get('studentId');
    if (studentId) {
      if (!isUuid(studentId)) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      const { data: st } = await db.from('students').select('id, user_id').eq('id', studentId).eq('school_id', admin.schoolId).maybeSingle();
      if (!st) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      const seesActions = a.any(...READ);
      const seesCounselling = a.any('counselling.overview', 'counselling.notes');
      const [actions, counselling, incidents] = await Promise.all([
        seesActions ? forStudent(db, admin.schoolId, st.id, can.archive) : Promise.resolve(null),
        seesCounselling ? cases(db, admin.schoolId, st.id) : Promise.resolve(null),
        can.propose ? linkableIncidents(db, admin.schoolId, st.user_id) : Promise.resolve([]),
      ]);
      return NextResponse.json({ actions, counselling, incidents, can: { ...can, counsellor: a.can('counselling.notes') } });
    }
    if (!a.any(...READ)) return NextResponse.json({ error: 'Your role doesn’t include discipline.' }, { status: 403 });
    if (p.get('archive')) {
      if (!can.archive) return NextResponse.json({ error: 'Only the principal and the registrar open the archive.' }, { status: 403 });
      return NextResponse.json({ actions: await register(db, admin.schoolId, { archive: true, search: str(p.get('q'), 60) }), can });
    }
    const [w, rows] = await Promise.all([
      can.approve || can.suspend ? waiting(db, admin.schoolId) : Promise.resolve([]),
      register(db, admin.schoolId, { archive: false, search: str(p.get('q'), 60) }),
    ]);
    return NextResponse.json({ waiting: w, actions: rows, can });
  } catch (e) {
    console.error('[admin/discipline]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load discipline.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, [...READ]);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = (await req.json().catch(() => null)) || {};
  const a = { id: admin.id, schoolId: admin.schoolId };
  const id = isUuid(b.id) ? b.id : null;
  const noId = { ok: false as const, error: 'Pick the action.', status: 400 };
  let out;
  switch (b.action) {
    case 'record': out = isUuid(b.studentId) ? await propose(db, a, b.studentId, b, { access: admin.access, notify: b.notify === true }) : { ok: false as const, error: 'Pick the student.', status: 400 }; break;
    case 'propose': out = isUuid(b.studentId) ? await propose(db, a, b.studentId, b, null) : { ok: false as const, error: 'Pick the student.', status: 400 }; break;
    case 'approve': out = id ? await decide(db, a, admin.access, id, true, { notify: b.notify === true }) : noId; break;
    case 'return': out = id ? await decide(db, a, admin.access, id, false, { note: str(b.note, 300) }) : noId; break;
    case 'cancel': out = id ? await cancel(db, a, admin.access, id, str(b.reason, 300)) : noId; break;
    default: out = { ok: false as const, error: 'Unknown action.', status: 400 };
  }
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
