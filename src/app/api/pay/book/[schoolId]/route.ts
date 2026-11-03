import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/admin/serverAuth';
import { verifyPaySignature } from '@/lib/pay/book';
import { paySigningSecret } from '@/lib/pay/server';

export const dynamic = 'force-dynamic';

/**
 * Sthara Pay posts here: this is the school's fee ledger acting as the book. The signature is the only authentication.
 *   200 { bookRef }   written; bookRef is the receipt number, which Pay keeps against the payment
 *   422 { error }     refused (a closed day, more than the balance). Pay stops and puts it in front of a person.
 *   other             Pay retries later
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = await params;
  if (!isUuid(schoolId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const raw = await req.text();
  const db = createAdminClient();
  const secret = await paySigningSecret(db, schoolId);
  // The same answer for an unknown school as for a bad signature, so this cannot be used to find out who is connected.
  if (!secret || !verifyPaySignature(secret, req.headers.get('x-sthara-pay-timestamp'), (req.headers.get('x-sthara-pay-signature')), raw)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Not JSON.' }, { status: 422 }); }
  if (!isUuid(body?.postingId) || !isUuid(body?.entry?.id)) return NextResponse.json({ error: 'Not a posting.' }, { status: 422 });
  const { data, error } = await db.rpc('pay_book_post', { p_school: schoolId, p_posting: body.postingId, p_entry: body.entry });
  if (error) {
    if (error.code === '22023' || error.code === 'P0002') return NextResponse.json({ error: error.message }, { status: 422 });
    console.error('[pay book]', error.code);
    return NextResponse.json({ error: 'Could not post.' }, { status: 500 });
  }
  return NextResponse.json({ bookRef: data?.bookRef ?? null });
}
