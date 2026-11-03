import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, requireAdmin } from '@/lib/admin/serverAuth';
import { feesFor, receipt, recordPayment, voidPayment } from '@/lib/admin/rteFeesServer';

export const dynamic = 'force-dynamic';

/**
 * Admission fees (admissions phase 4b), recorded by the office. Reads need admissions.read, writes admissions.manage.
 *   GET ?applicant=<id>       each fee: owed (after concessions), paid, the receipts; the seat deposit's date
 *   GET ?receipt=<payment>    one receipt, to print
 *   POST { action: 'pay', applicantId, kind, amount, mode, reference?, paidOn? }   the next receipt number
 *   POST { action: 'void', paymentId, reason }                                    a mistake: voided, never deleted
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.read');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const p = req.nextUrl.searchParams;
  const r = p.get('receipt');
  if (r) {
    if (!isUuid(r)) return bad('Pick a receipt.');
    const x = await receipt(db, admin.schoolId, r);
    return x ? NextResponse.json(x) : bad('Receipt not found.', 404);
  }
  const id = p.get('applicant');
  if (!isUuid(id)) return bad('Pick an applicant.');
  const x = await feesFor(db, admin.schoolId, id);
  return x ? NextResponse.json(x) : bad('Applicant not found.', 404);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const a = { id: admin.id, schoolId: admin.schoolId };
  const r = b.action === 'pay' ? (isUuid(b.applicantId) ? await recordPayment(db, a, b.applicantId, b) : { ok: false as const, error: 'Pick an applicant.', status: 400 })
    : b.action === 'void' ? (isUuid(b.paymentId) ? await voidPayment(db, a, b.paymentId, b.reason) : { ok: false as const, error: 'Pick a receipt.', status: 400 })
      : { ok: false as const, error: 'Unknown action.', status: 400 };
  return r.ok ? NextResponse.json(r) : bad(r.error, r.status);
}
