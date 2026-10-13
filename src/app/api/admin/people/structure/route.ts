import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, money, requireAdmin, str } from '@/lib/admin/serverAuth';
import { CATEGORIES, DEPARTMENT_KINDS } from '@/lib/hr/engine';
import { hrError } from '@/lib/hr/server';

export const dynamic = 'force-dynamic';

/**
 * The school's structure (hr.manage): departments, grades with pay bands, sanctioned posts, and HR settings.
 *   PUT    { entity: 'department', id?, name, kind, headId?, active? }
 *          { entity: 'grade', id?, name, category?, payMin?, payMax?, sort?, active? }     pay bands need hr.sensitive
 *          { entity: 'post', id?, departmentId, gradeId?, sanctioned, note? }
 *          { entity: 'settings', codePrefix, codeWidth, probationMonths, noticeDays, alertDays }
 *   DELETE { entity: 'department' | 'grade' | 'post', id }
 *          A department or grade people have held is retired (kept for their history), not deleted.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, 'hr.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const school = admin.schoolId;
  const id = b.id ? (isUuid(b.id) ? b.id : undefined) : null;
  if (id === undefined) return bad('Unknown record.');
  const save = async (table: string, row: Record<string, unknown>, fail: string) => {
    const q = id
      ? db.from(table).update(row).eq('id', id).eq('school_id', school).select('id').maybeSingle()
      : db.from(table).insert({ ...row, school_id: school }).select('id').single();
    const { data, error } = await q;
    if (error) return hrError(error, fail);
    if (!data) return bad('That record is no longer there.', 404);
    return NextResponse.json({ ok: true, id: data.id });
  };

  if (b.entity === 'department') {
    const name = str(b.name, 80);
    if (!name) return bad('Give the department a name.');
    if (!(b.kind in DEPARTMENT_KINDS)) return bad('Pick the kind of department.');
    let headId: string | null = null;
    if (b.headId) {
      const { data: h } = isUuid(b.headId) ? await db.from('staff_members').select('id, active').eq('id', b.headId).eq('school_id', school).maybeSingle() : { data: null };
      if (!h?.active) return bad('The head of department must be someone on the register.');
      headId = h.id;
    }
    return save('hr_departments', { name, kind: b.kind, head_id: headId, active: b.active !== false }, 'Could not save the department.');
  }

  if (b.entity === 'grade') {
    const name = str(b.name, 60);
    if (!name) return bad('Give the grade a name.');
    const category = b.category ? (CATEGORIES.includes(b.category) ? b.category : undefined) : null;
    if (category === undefined) return bad('Pick a category, or leave it open to all.');
    const row: Record<string, unknown> = { name, category, sort: Number.isInteger(b.sort) ? Math.max(0, Math.min(999, b.sort)) : 0, active: b.active !== false };
    // Pay bands are only read and written by people allowed to see pay; others edit the grade and leave the band alone.
    if (admin.access.can('hr.sensitive')) {
      const blank = (v: unknown) => v === null || v === undefined || v === '';
      const min = blank(b.payMin) ? null : money(b.payMin), max = blank(b.payMax) ? null : money(b.payMax);
      if ((!blank(b.payMin) && min === null) || (!blank(b.payMax) && max === null)) return bad('Pay band amounts are rupees per month, like 35000.');
      if (min !== null && max !== null && max < min) return bad('The top of the pay band is below the bottom.');
      row.pay_min = min; row.pay_max = max;
    }
    return save('hr_grades', row, 'Could not save the grade.');
  }

  if (b.entity === 'post') {
    if (!isUuid(b.departmentId)) return bad('Pick a department.');
    const [{ data: d }, { data: g }] = await Promise.all([
      db.from('hr_departments').select('id').eq('id', b.departmentId).eq('school_id', school).maybeSingle(),
      isUuid(b.gradeId) ? db.from('hr_grades').select('id').eq('id', b.gradeId).eq('school_id', school).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!d) return bad('That department isn\'t in this school.');
    if (b.gradeId && !g) return bad('That grade isn\'t in this school.');
    const n = Number(b.sanctioned);
    if (!Number.isInteger(n) || n < 0 || n > 2000) return bad('Sanctioned posts is a whole number.');
    return save('hr_posts', { department_id: d.id, grade_id: g?.id ?? null, sanctioned: n, note: str(b.note, 300) || null, updated_by: admin.id }, 'Could not save the post.');
  }

  if (b.entity === 'settings') {
    const prefix = typeof b.codePrefix === 'string' ? b.codePrefix.trim() : '';
    if (!/^[A-Za-z0-9/_-]{0,12}$/.test(prefix)) return bad('The code prefix can use letters, digits, hyphen, slash and underscore, up to 12 characters.');
    const int = (v: unknown, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null);
    const width = int(b.codeWidth, 2, 8), probation = int(b.probationMonths, 0, 36), notice = int(b.noticeDays, 0, 365), alert = int(b.alertDays, 1, 180);
    if (width === null) return bad('Code numbers are 2 to 8 digits wide.');
    if (probation === null) return bad('Probation is 0 to 36 months.');
    if (notice === null) return bad('The notice period is 0 to 365 days.');
    if (alert === null) return bad('Alerts start 1 to 180 days ahead.');
    // The counter (code_last_no) is never set from here: numbers are issued in order and not reused.
    const { error } = await db.from('hr_settings').upsert({
      school_id: school, code_prefix: prefix, code_width: width, probation_months: probation, notice_days: notice, alert_days: alert, updated_by: admin.id,
    }, { onConflict: 'school_id' });
    return error ? hrError(error, 'Could not save the settings.') : NextResponse.json({ ok: true });
  }
  return bad('Unknown record type.');
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, 'hr.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!isUuid(b?.id)) return bad('Pick a record.');
  const school = admin.schoolId;
  if (b.entity === 'post') {
    const { error } = await db.from('hr_posts').delete().eq('id', b.id).eq('school_id', school);
    return error ? hrError(error, 'Could not remove the post.') : NextResponse.json({ ok: true });
  }
  if (b.entity !== 'department' && b.entity !== 'grade') return bad('Unknown record type.');
  const table = b.entity === 'department' ? 'hr_departments' : 'hr_grades', col = b.entity === 'department' ? 'department_id' : 'grade_id';
  const [{ count: now }, { count: ever }] = await Promise.all([
    db.from('staff_members').select('id', { count: 'exact', head: true }).eq('school_id', school).eq(col, b.id).eq('active', true),
    db.from('staff_jobs').select('id', { count: 'exact', head: true }).eq('school_id', school).eq(col, b.id),
  ]);
  if (now) return bad(`${now} ${now === 1 ? 'person is' : 'people are'} in this ${b.entity}. Move them first.`, 409);
  const { error } = ever
    ? await db.from(table).update({ active: false }).eq('id', b.id).eq('school_id', school)
    : await db.from(table).delete().eq('id', b.id).eq('school_id', school);
  return error ? hrError(error, `Could not remove the ${b.entity}.`) : NextResponse.json({ ok: true, retired: !!ever });
}
