import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import { fulfil, type AccountRequest } from '@/lib/ops/requests';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/ops/requests?school=  — login requests from schools: every pending one, and the last 100 decided.
 * Operators only (404 for everyone else).
 */
export async function GET(req: NextRequest) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  const school = req.nextUrl.searchParams.get('school') || '';
  const db = createAdminClient();
  const cols = 'id, school_id, kind, applicant_id, people, options, note, status, requested_by, created_at, decided_by, decided_at, decision_note, result';
  let pendingQ = db.from('account_requests').select(cols).eq('status', 'pending');
  let decidedQ = db.from('account_requests').select(cols).neq('status', 'pending');
  if (UUID.test(school)) { pendingQ = pendingQ.eq('school_id', school); decidedQ = decidedQ.eq('school_id', school); }
  const [pending, decided, schools] = await Promise.all([
    pendingQ.order('created_at'),
    decidedQ.order('decided_at', { ascending: false, nullsFirst: false }).limit(100),
    db.from('schools').select('id, name, settings'),
  ]);
  if (pending.error) return NextResponse.json({ error: pending.error.message }, { status: 500 });
  const rows = [...(pending.data || []), ...(decided.data || [])];
  const userIds = [...new Set(rows.flatMap(r => [r.requested_by, r.decided_by]).filter(Boolean))] as string[];
  const applicantIds = [...new Set(rows.map(r => r.applicant_id).filter(Boolean))] as string[];
  const [{ data: users }, { data: applicants }] = await Promise.all([
    userIds.length ? db.from('users').select('id, name, email').in('id', userIds) : Promise.resolve({ data: [] as { id: string; name: string; email: string }[] }),
    applicantIds.length ? db.from('admission_applicants').select('id, name, grade, guardian_name, guardian_email, guardian_phone, stage').in('id', applicantIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const who = new Map((users || []).map(u => [u.id, u.name || u.email]));
  const app = new Map((applicants || []).map(a => [a.id as string, a]));
  const sch = new Map((schools.data || []).map(s => [s.id, { name: s.name as string, code: (s.settings as { code?: string } | null)?.code ?? null }]));
  return NextResponse.json({
    requests: rows.map(r => ({
      ...r,
      school: sch.get(r.school_id)?.name ?? 'Deleted school', schoolCode: sch.get(r.school_id)?.code ?? null,
      requestedByName: r.requested_by ? who.get(r.requested_by) ?? null : null,
      decidedByName: r.decided_by ? who.get(r.decided_by) ?? null : null,
      applicant: r.applicant_id ? app.get(r.applicant_id) ?? null : null,
    })),
  });
}

/**
 * PATCH /api/ops/requests — { id, decision: 'approve' | 'reject', note? }
 * Approving creates the logins (temporary passwords come back once, here, and are never stored); a rejection needs
 * a note the school will see. Whoever asked is told either way.
 */
export async function PATCH(req: NextRequest) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== 'string' || !UUID.test(b.id)) return NextResponse.json({ error: 'Pick a request.' }, { status: 400 });
  if (b.decision !== 'approve' && b.decision !== 'reject') return NextResponse.json({ error: 'Approve or reject.' }, { status: 400 });
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 1000) : '';
  const db = createAdminClient();
  const { data: r } = await db.from('account_requests').select('*').eq('id', b.id).maybeSingle();
  if (!r) return NextResponse.json({ error: 'That request no longer exists.' }, { status: 404 });
  if (r.status !== 'pending') return NextResponse.json({ error: `That request was already ${r.status}.` }, { status: 409 });

  const what = r.kind === 'enrolment'
    ? `the enrolment of ${(r.options as { rollNo?: string } | null)?.rollNo ? `admission no. ${(r.options as { rollNo: string }).rollNo}` : 'an applicant'}`
    : `${(r.people as unknown[]).length} new login${(r.people as unknown[]).length === 1 ? '' : 's'}`;

  if (b.decision === 'reject') {
    if (!note) return NextResponse.json({ error: 'Say why, for the school (they see this note).' }, { status: 400 });
    const { data: moved, error } = await db.from('account_requests').update({ status: 'rejected', decided_by: op.id, decided_at: new Date().toISOString(), decision_note: note })
      .eq('id', r.id).eq('status', 'pending').select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!moved?.length) return NextResponse.json({ error: 'Someone else just decided this request.' }, { status: 409 });
    await tell(db, r, 'Login request not approved', `Sthara didn't approve ${what}: "${note.slice(0, 300)}"`);
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  const out = await fulfil(db, r as AccountRequest, op.id);
  if (!out.ok) return NextResponse.json({ error: out.error, issues: out.issues ?? [] }, { status: 422 });
  const { error } = await db.from('account_requests').update({
    status: 'approved', decided_by: op.id, decided_at: new Date().toISOString(), decision_note: note || null, result: out.summary,
  }).eq('id', r.id);
  if (error) console.error('[requests] approved but not marked:', error.message);
  await tell(db, r, 'Logins created', `Sthara created ${what}. The sign-in details come to you from Sthara.${note ? ` "${note.slice(0, 300)}"` : ''}`);
  return NextResponse.json({ ok: true, status: 'approved', issued: out.issued, summary: out.summary });
}

/** Tells whoever asked (in the app). */
async function tell(db: ReturnType<typeof createAdminClient>, r: { school_id: string; requested_by: string | null; id: string }, title: string, body: string) {
  if (!r.requested_by) return;
  const { error } = await db.from('notifications').insert({ school_id: r.school_id, user_id: r.requested_by, type: 'account', title, body, metadata: { requestId: r.id } });
  if (error) console.warn('[requests] notify:', error.message);
}
