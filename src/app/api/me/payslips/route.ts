import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { isUuid } from '@/lib/admin/serverAuth';
import { payrollError, toRunLine } from '@/lib/payroll/server';

export const dynamic = 'force-dynamic';

/**
 * My payslips: the signed-in teacher's or office account's own approved pay lines, newest first, and one in full
 * with ?id=. Nobody else's, and nothing from a run that isn't approved.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  const { data: m, error } = await db.from('staff_members').select('id').eq('school_id', staff.schoolId).eq('user_id', staff.id).maybeSingle();
  if (error) return payrollError(error, 'Could not load your payslips.');
  if (!m) return NextResponse.json({ payslips: [] });
  const id = req.nextUrl.searchParams.get('id');
  const base = db.from('pay_run_lines').select('*, pay_runs!inner(status, kind, approved_at)').eq('staff_member_id', m.id).eq('pay_runs.status', 'approved').eq('on_hold', false);
  if (id) {
    if (!isUuid(id)) return NextResponse.json({ error: 'Unknown payslip.' }, { status: 404 });
    const { data: one, error: e } = await base.eq('id', id).maybeSingle();
    if (e) return payrollError(e, 'Could not load the payslip.');
    if (!one) return NextResponse.json({ error: 'That payslip isn\'t yours or isn\'t ready.' }, { status: 404 });
    const { data: school } = await db.from('schools').select('name').eq('id', staff.schoolId).maybeSingle();
    return NextResponse.json({ line: toRunLine(one), kind: (one as any).pay_runs.kind, school: school?.name ?? '' });
  }
  const { data, error: e } = await base.order('month', { ascending: false }).limit(36);
  if (e) return payrollError(e, 'Could not load your payslips.');
  return NextResponse.json({ payslips: (data || []).map((r: any) => ({ id: r.id, month: r.month, net: Number(r.net), gross: Number(r.gross), kind: r.pay_runs.kind })) });
}
