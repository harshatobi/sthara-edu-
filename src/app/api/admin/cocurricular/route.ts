import { NextResponse, type NextRequest } from 'next/server';
import { deny, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import {
  addMembers, balance, decideKirti, decidePoints, groupMembers, kirtiLog, pending, placeInHouse, proposePoints, record, saveGroup, saveHouse,
  saveSettings, setup, standings, studentRecord, teachers, updateMember,
} from '@/lib/cocurricular/server';

export const dynamic = 'force-dynamic';

/**
 * Co-curricular for the office (brief 06).
 *   GET                        houses, standings, clubs and teams, settings, what waits for approval, teachers (cocurricular.*)
 *   GET ?studentId=            one student's houses, memberships and Kirti (also students.read)
 *   GET ?groupId=&session=     a club's or team's members
 *   GET ?view=log&session=     approved and rejected Kirti of a session
 *   POST { action }:
 *     house-save | group-save | settings-save                      cocurricular.manage
 *     place { studentId, houseId, from, reason } | balance { all }  cocurricular.manage
 *     members-add { groupId, studentIds, role } | member-update { groupId, memberId, role?, leave? }   cocurricular.manage
 *     decide-kirti { ids, approve, note } | decide-points { ids, approve, note } | award-points { houseId, points, reason, onDate }
 *     record { studentIds, entry, groupId? }                       cocurricular.approve
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ['cocurricular.manage', 'cocurricular.approve', 'students.read']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const p = req.nextUrl.searchParams;
  const can = { manage: admin.access.can('cocurricular.manage'), approve: admin.access.can('cocurricular.approve') };
  try {
    const studentId = p.get('studentId');
    if (studentId) {
      if (!isUuid(studentId)) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      const [rec, set] = await Promise.all([studentRecord(db, admin.schoolId, studentId, false), setup(db, admin.schoolId)]);
      return NextResponse.json({ ...rec, houseList: set.houses.filter(h => h.active), can });
    }
    const d = deny(admin, can.manage ? 'cocurricular.manage' : 'cocurricular.approve');
    if (d) return d;
    const s = await setup(db, admin.schoolId);
    const session = /^\d{4}-\d{2}$/.test(p.get('session') ?? '') ? p.get('session')! : s.session;
    const groupId = p.get('groupId');
    if (groupId) return isUuid(groupId) ? NextResponse.json({ members: await groupMembers(db, admin.schoolId, groupId, session) }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (p.get('view') === 'log') return NextResponse.json({ log: await kirtiLog(db, admin.schoolId, session) });
    const [st, wait, t] = await Promise.all([standings(db, admin.schoolId, session), pending(db, admin.schoolId), teachers(db, admin.schoolId)]);
    return NextResponse.json({ ...s, sessionShown: session, standings: st, pending: wait, teachers: t, can });
  } catch (e) {
    console.error('[admin/cocurricular]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load co-curricular.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ['cocurricular.manage', 'cocurricular.approve']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = (await req.json().catch(() => null)) || {};
  const a = { id: admin.id, schoolId: admin.schoolId };
  const manage = ['house-save', 'group-save', 'settings-save', 'place', 'balance', 'members-add', 'member-update'].includes(b.action);
  const d = deny(admin, manage ? 'cocurricular.manage' : 'cocurricular.approve');
  if (d) return d;
  const out = b.action === 'house-save' ? await saveHouse(db, a, b)
    : b.action === 'group-save' ? await saveGroup(db, a, b)
      : b.action === 'settings-save' ? await saveSettings(db, a, b)
        : b.action === 'place' ? (isUuid(b.studentId) && isUuid(b.houseId) ? await placeInHouse(db, a, b.studentId, b.houseId, str(b.from, 10), str(b.reason, 200)) : { ok: false as const, error: 'Pick the student and house.', status: 400 })
          : b.action === 'balance' ? await balance(db, a, b.all === true)
            : b.action === 'members-add' ? (isUuid(b.groupId) ? await addMembers(db, a, b.groupId, b.studentIds, b.role) : { ok: false as const, error: 'Pick the club or team.', status: 400 })
              : b.action === 'member-update' ? (isUuid(b.groupId) && isUuid(b.memberId) ? await updateMember(db, a, b.groupId, b.memberId, b) : { ok: false as const, error: 'Pick the member.', status: 400 })
                : b.action === 'decide-kirti' ? await decideKirti(db, a, b.ids, b.approve === true, str(b.note, 300))
                  : b.action === 'decide-points' ? await decidePoints(db, a, b.ids, b.approve === true, str(b.note, 300))
                    : b.action === 'award-points' ? await proposePoints(db, a, b, true)
                      : b.action === 'record' ? await record(db, a, b)
                        : { ok: false as const, error: 'Unknown action.', status: 400 };
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
