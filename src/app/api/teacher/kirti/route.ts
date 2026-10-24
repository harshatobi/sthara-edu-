import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { addMembers, attachmentUrl, findStudents, groupMembers, proposePoints, record, teacherView, updateMember } from '@/lib/cocurricular/server';
import { currentSession } from '@/lib/students/register';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Kirti for teachers (brief 06): any teacher records achievements and participation (they wait for the academic
 * coordinator's approval); a club's or team's teacher in charge keeps its members.
 *   GET                       my clubs and teams, houses, what I recorded
 *   GET ?cls= | ?q=           students to pick: a class roster this session, or a search by name or admission number
 *   GET ?groupId=             members of a group I run
 *   POST { action }:
 *     record { studentIds, entry, groupId?, attachment? } | attach-url { studentId, fileName, fileBytes }
 *     points { houseId, points, reason, onDate }          house points for the coordinator to approve
 *     members-add { groupId, studentIds, role } | member-update { groupId, memberId, role?, leave? }   in charge only
 */
async function runs(db: Parameters<typeof teacherView>[0], schoolId: string, staffId: string, groupId: unknown) {
  if (typeof groupId !== 'string' || !UUID.test(groupId)) return false;
  const { data } = await db.from('cc_groups').select('id').eq('id', groupId).eq('school_id', schoolId).eq('in_charge', staffId).maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  const p = req.nextUrl.searchParams;
  try {
    if (p.get('cls') || p.get('q')) return NextResponse.json({ students: await findStudents(db, staff.schoolId, { cls: p.get('cls')?.slice(0, 40), search: p.get('q')?.slice(0, 60) }) });
    if (p.get('groupId')) {
      if (!(await runs(db, staff.schoolId, staff.id, p.get('groupId')))) return NextResponse.json({ error: 'Only the teacher in charge sees the members.' }, { status: 403 });
      const { data: s } = await db.from('schools').select('settings').eq('id', staff.schoolId).maybeSingle();
      return NextResponse.json({ members: await groupMembers(db, staff.schoolId, p.get('groupId')!, currentSession(s?.settings)) });
    }
    return NextResponse.json({ ...(await teacherView(db, staff)), classes: [...new Set(staff.scope.map(e => e.cls))].sort() });
  } catch (e) {
    console.error('[teacher/kirti]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load Kirti.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  const b = (await req.json().catch(() => null)) || {};
  const a = { id: staff.id, schoolId: staff.schoolId };
  if ((b.action === 'members-add' || b.action === 'member-update') && !(await runs(db, staff.schoolId, staff.id, b.groupId))) {
    return NextResponse.json({ error: 'Only the teacher in charge changes the members.' }, { status: 403 });
  }
  const out = b.action === 'record' ? await record(db, a, b)
    : b.action === 'attach-url' ? (typeof b.studentId === 'string' && UUID.test(b.studentId) ? await attachmentUrl(db, a, b.studentId, b) : { ok: false as const, error: 'Pick the student.', status: 400 })
      : b.action === 'points' ? await proposePoints(db, a, b, false)
        : b.action === 'members-add' ? await addMembers(db, a, b.groupId, b.studentIds, b.role)
          : b.action === 'member-update' ? (typeof b.memberId === 'string' && UUID.test(b.memberId) ? await updateMember(db, a, b.groupId, b.memberId, b) : { ok: false as const, error: 'Pick the member.', status: 400 })
            : { ok: false as const, error: 'Unknown action.', status: 400 };
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
