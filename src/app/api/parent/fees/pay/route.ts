import { NextResponse, type NextRequest } from 'next/server';
import { isUuid } from '@/lib/admin/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { guardianOf, requireParent } from '@/lib/parent/serverAuth';
import { feePaymentLink, payConnection, PayError } from '@/lib/pay/server';

export const dynamic = 'force-dynamic';

/**
 * GET   { enabled }: can this school take fees online?
 * POST  { invoiceId } gives { url }, a payment link for what is due now. Only for a verified guardian of that student.
 */
export async function GET(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  const c = await payConnection(auth.db, auth.parent.schoolId).catch(() => null);
  return NextResponse.json({ enabled: !!c });
}
export async function POST(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  const { db, parent } = auth;
  if (!checkRateLimit(`parent-pay:${parent.id}`, 10, 60_000).allowed) return NextResponse.json({ error: 'Too many requests. Wait a minute and try again.' }, { status: 429 });
  const b = await req.json().catch(() => null);
  if (!isUuid(b?.invoiceId)) return NextResponse.json({ error: 'Pick an invoice.' }, { status: 400 });
  const { data: inv } = await db.from('fee_invoices').select('student_id').eq('id', b.invoiceId).eq('school_id', parent.schoolId).maybeSingle();
  // The same answer for someone else's invoice as for one that does not exist.
  if (!inv || !(await guardianOf(db, parent.id, inv.student_id))) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  const c = await payConnection(db, parent.schoolId);
  if (!c) return NextResponse.json({ error: 'Your school does not take fees online yet.' }, { status: 409 });
  // Some gateways need a phone number. Only one this parent has verified is ever passed on.
  const { data: link } = await db.from('whatsapp_links').select('phone_e164').eq('user_id', parent.id).not('verified_at', 'is', null).maybeSingle();
  const phone = link?.phone_e164?.replace(/^\+/, '') || null;
  try {
    const r = await feePaymentLink(db, c, b.invoiceId, phone && /^[0-9]{10,15}$/.test(phone) ? phone : null, `${req.nextUrl.origin}/parent/fees`);
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 409 });
    return NextResponse.json({ url: r.url });
  } catch (e) {
    if (e instanceof PayError && e.status < 500) console.error('[parent pay]', e.status);
    return NextResponse.json({ error: 'Online payment is not available right now. Please try again shortly.' }, { status: 502 });
  }
}
