import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, requireAdmin } from '@/lib/admin/serverAuth';
import { fyEnd, fyStart, monthEnd, monthName, rateOn } from '@/lib/payroll/engine';
import { bankRows, ecrText, esiRows, taxYearRows, tdsRows } from '@/lib/payroll/outputs';
import { loadRates, loadSecrets, payrollError, recordPayView, toRunLine } from '@/lib/payroll/server';
import { pageAll } from '@/lib/ops/page';

export const dynamic = 'force-dynamic';

/**
 * Exports that carry account or identity numbers, built on the server and recorded in the audit trail.
 *   GET ?run=&kind=bank | ecr | esi | tds        from an approved run (payroll.prepare or .approve)
 *   GET ?fy=2026-27&kind=tax                      the year's salary and tax statement
 * The register, professional tax statement and journal carry no such numbers and are made in the browser.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ['payroll.prepare', 'payroll.approve']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const q = req.nextUrl.searchParams, kind = q.get('kind') || '';
  try {
    const secrets = await loadSecrets(db, admin.schoolId);
    if (kind === 'tax') {
      const fy = q.get('fy') || '';
      if (!/^\d{4}-\d{2}$/.test(fy)) return bad('Pick the financial year.');
      // The whole year, paged (a year of a school's staff passes 1,000 lines).
      const { data, error: yearErr } = await pageAll<any>((f, t) => db.from('pay_run_lines').select('*, pay_runs!inner(status)').eq('school_id', admin.schoolId).eq('pay_runs.status', 'approved').gte('month', fyStart(fy)).lte('month', fyEnd(fy)).order('month').order('id').range(f, t), 200_000);
      if (yearErr) return bad(`Could not read the year's pay: ${yearErr.message}`, 500);
      if (!data?.length) return bad('There are no approved runs in that year yet.', 404);
      await recordPayView(db, admin, `tax statement ${fy}`, fy, 'EXPORT');
      return NextResponse.json({ filename: `salary-tax-statement-${fy}.csv`, rows: taxYearRows(data.map(toRunLine), secrets) });
    }
    const id = q.get('run');
    if (!isUuid(id)) return bad('Pick a run.');
    const { data: run } = await db.from('pay_runs').select('id, month, status, kind').eq('id', id).eq('school_id', admin.schoolId).maybeSingle();
    if (!run) return bad('That run is no longer there.', 404);
    if (run.status !== 'approved') return bad('These files come from an approved run. Until then, use the register to check the figures.', 409);
    const { data } = await db.from('pay_run_lines').select('*').eq('run_id', run.id);
    const lines = (data || []).map(toRunLine), tag = run.month.slice(0, 7);
    await recordPayView(db, admin, `${kind} file ${tag}`, run.id, 'EXPORT');
    if (kind === 'bank') {
      const r = bankRows(lines, secrets, `Salary ${monthName(run.month, true)} ${admin.schoolName}`.slice(0, 30));
      return NextResponse.json({ filename: `bank-transfer-${tag}.csv`, rows: r.rows, skipped: r.skipped });
    }
    if (kind === 'ecr') {
      const pf = rateOn(await loadRates(db, admin.schoolId), 'pf', monthEnd(run.month))?.value;
      const r = ecrText(lines, secrets, pf?.ceiling ?? 15000);
      if (!r.text) return bad('Nobody in this run has PF deducted.', 404);
      return NextResponse.json({ filename: `pf-ecr-${tag}.txt`, text: r.text, skipped: r.skipped });
    }
    if (kind === 'esi') {
      const r = esiRows(lines, secrets);
      return NextResponse.json({ filename: `esi-contribution-${tag}.csv`, rows: r.rows, skipped: r.skipped });
    }
    if (kind === 'tds') return NextResponse.json({ filename: `tds-on-salary-${tag}.csv`, rows: tdsRows(lines, secrets) });
    return bad('Unknown file.');
  } catch (e: any) {
    return payrollError(e, 'Could not make the file.');
  }
}
