import { NextResponse, type NextRequest } from 'next/server';
import { deny, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import {
  cancelEntry, correct, getRecord, moveStudent, photoSet, photoUpload, revealAadhaar, setRoll, setStudentLeft,
} from '@/lib/students/server';
import { decideSibling, removeFamily, saveFamily, setEmergency } from '@/lib/students/family';

export const dynamic = 'force-dynamic';

/**
 * One student's record.
 *   GET                                   register entry (Aadhaar masked), enrolment history, corrections (students.read)
 *   POST { action }:
 *     correct { fields, admissionNo?, aadhaar?, noAadhaar?, reason }    students.manage
 *     cancel { reason }                                                 students.manage (entries without a login)
 *     left { on?, reason } | rejoin { className, on? }                  students.manage
 *     move { className, from, reason }                                  students.manage (mid-year)
 *     roll { rollNo }                                                   students.manage
 *     photo-url { ext } | photo-set { path }                            students.manage
 *     reveal { why }                                                    students.aadhaar (recorded)
 *     family-save { member, memberId? } | family-remove { memberId }     students.manage
 *     emergency { list: [{ familyMemberId } | { name, relation, phone }] } up to 3, in calling order
 *     sibling { otherId, decision: confirmed | rejected }               students.manage
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, 'students.read');
  if ('res' in auth) return auth.res;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const rec = await getRecord(auth.db, auth.admin.schoolId, id);
  if (!rec) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  return NextResponse.json({ ...rec, can: { manage: auth.admin.access.can('students.manage'), aadhaar: auth.admin.access.can('students.aadhaar') } });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ['students.manage', 'students.aadhaar']);
  if ('res' in auth) return auth.res;
  const { admin, db } = auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const b = (await req.json().catch(() => null)) || {};
  const a = { id: admin.id, name: admin.name, schoolId: admin.schoolId };
  if (b.action === 'reveal') {
    const d = deny(admin, 'students.aadhaar'); if (d) return d;
    const out = await revealAadhaar(db, a, id, str(b.why, 200));
    return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
  }
  const d = deny(admin, 'students.manage'); if (d) return d;
  const out = b.action === 'correct' ? await correct(db, a, id, b)
    : b.action === 'cancel' ? await cancelEntry(db, a, id, str(b.reason, 300))
      : b.action === 'left' ? await setStudentLeft(db, a, id, true, { on: str(b.on, 10), reason: str(b.reason, 300) })
        : b.action === 'rejoin' ? await setStudentLeft(db, a, id, false, { on: str(b.on, 10), className: str(b.className, 40), reason: str(b.reason, 300) })
          : b.action === 'move' ? await moveStudent(db, a, id, str(b.className, 40), str(b.from, 10), str(b.reason, 300))
            : b.action === 'roll' ? await setRoll(db, a, id, str(b.rollNo, 12))
              : b.action === 'photo-url' ? await photoUpload(db, a, id, str(b.ext, 5).toLowerCase())
                : b.action === 'photo-set' ? await photoSet(db, a, id, str(b.path, 300))
                  : b.action === 'family-save' ? await saveFamily(db, a, id, b.member || {}, isUuid(b.memberId) ? b.memberId : undefined)
                    : b.action === 'family-remove' ? (isUuid(b.memberId) ? await removeFamily(db, a, id, b.memberId) : { ok: false as const, error: 'Pick a family member.', status: 400 })
                      : b.action === 'emergency' ? await setEmergency(db, a, id, Array.isArray(b.list) ? b.list : [])
                        : b.action === 'sibling' ? (isUuid(b.otherId) && (b.decision === 'confirmed' || b.decision === 'rejected')
                          ? await decideSibling(db, a, id, b.otherId, b.decision) : { ok: false as const, error: 'Pick a student and confirm or reject.', status: 400 })
                          : { ok: false as const, error: 'Unknown action.', status: 400 };
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
