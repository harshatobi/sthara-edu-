import { notifyGuardians } from '@/lib/parent/notify';
import { NextResponse, type NextRequest } from 'next/server';
import { bad, deny, ISO_DAY, isUuid, money, requireAdmin, str } from '@/lib/admin/serverAuth';
import { assembleLedger, reminderMessage, validateSchedule, PAY_MODES, type ScheduleItem } from '@/lib/admin/fees';
import { fmtDate, gradeOf, inr, isoDay, sessionOf } from '@/lib/admin/format';
import { displayClass } from '@/lib/teacher/scope';
import type { Perm } from '@/lib/admin/rbac';

export const dynamic = 'force-dynamic';

/**
 * Fee ledger actions (school admins only; school from the caller's own row).
 *   POST { action: 'structure', grade, annualFee, schedule: [{no,label,dueOn,share}], note? }
 *   POST { action: 'raise', instalment }                       raise one instalment for every eligible student
 *   POST { action: 'payment', invoiceId, amount, mode, reference?, paidOn }
 *   POST { action: 'void_payment', paymentId, reason }
 *   POST { action: 'concession', invoiceId, amount, reason }   a request; applied once someone else approves it
 *   POST { action: 'concession_decide', requestId, approve, note? }
 *   POST { action: 'void_invoice', invoiceId, reason }
 *   POST { action: 'remind', studentIds: [] }                  in-app notice to verified parents, tone from history
 *   POST { action: 'day_close', day, cashCounted, note? }      totals computed in the database
 *   POST { action: 'day_reopen', day, reason }
 * Each action checks its own permission (lib/admin/rbac). Amounts are rupees.
 * Balances are always recomputed from receipts in the database.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'fees.read');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return bad('Invalid request.');
  const session = sessionOf();
  const today = isoDay();
  const need = NEEDS[b.action as string];
  if (!need) return bad('Unknown action.');
  const no = deny(admin, need);
  if (no) return no;

  switch (b.action) {
    case 'structure': {
      const grade = Number(b.grade);
      if (!Number.isInteger(grade) || grade < 1 || grade > 12) return bad('Pick a grade from 1 to 12.');
      const annualFee = money(b.annualFee);
      if (annualFee === null || annualFee <= 0) return bad('Enter the annual fee in rupees.');
      const schedule: ScheduleItem[] = (Array.isArray(b.schedule) ? b.schedule : []).map((e: any) => ({
        no: Number(e?.no), label: str(e?.label, 60), dueOn: str(e?.dueOn, 10), share: Number(e?.share),
      }));
      const problem = validateSchedule(schedule, session);
      if (problem) return bad(problem);
      const { data, error } = await db.from('fee_structures').upsert({
        school_id: admin.schoolId, session, grade, annual_fee: annualFee, note: str(b.note, 500) || null, updated_by: admin.id,
        schedule: schedule.map(s => ({ no: s.no, label: s.label, due_on: s.dueOn, share: s.share })),
      }, { onConflict: 'school_id,session,grade' }).select('id').single();
      if (error) return bad(error.message, 500);
      // Invoices already raised keep their amounts; say so, so nobody assumes they were re-billed.
      const { data: roll } = await db.from('users').select('id, student_class').eq('school_id', admin.schoolId).eq('role', 'student');
      const inGrade = (roll || []).filter(u => gradeOf(u.student_class) === grade).map(u => u.id);
      const { count } = inGrade.length
        ? await db.from('fee_invoices').select('id', { count: 'exact', head: true })
          .eq('school_id', admin.schoolId).eq('session', session).is('voided_at', null).in('student_id', inGrade)
        : { count: 0 };
      return NextResponse.json({ id: data.id, alreadyInvoiced: count || 0 });
    }

    case 'raise': {
      const no = Number(b.instalment);
      if (!Number.isInteger(no) || no < 1 || no > 12) return bad('Pick an instalment.');
      const { data, error } = await db.rpc('admin_raise_invoices', { p_school: admin.schoolId, p_session: session, p_instalment: no, p_actor: admin.id });
      if (error) return bad(error.message, 500);
      return NextResponse.json({ raised: data ?? 0 });
    }

    case 'payment': {
      if (!isUuid(b.invoiceId)) return bad('Pick an invoice.');
      const amount = money(b.amount);
      if (amount === null || amount <= 0) return bad('Enter the amount received, in rupees.');
      if (!(b.mode in PAY_MODES)) return bad('Pick how it was paid.');
      const paidOn = str(b.paidOn, 10);
      if (!ISO_DAY.test(paidOn)) return bad('Enter the date the payment was received.');
      if (paidOn > today) return bad('The payment date can\'t be in the future.');
      const reference = str(b.reference, 120);
      if ((b.mode === 'cheque' || b.mode === 'bank_transfer' || b.mode === 'upi' || b.mode === 'dd') && !reference) {
        return bad(b.mode === 'cheque' ? 'Enter the cheque number.' : b.mode === 'upi' ? 'Enter the UPI transaction ID.' : 'Enter the transaction reference.');
      }
      // Called as FROM (not SELECT f().*), so the receipt is recorded exactly once.
      const { data, error } = await db.rpc('admin_record_payment', {
        p_school: admin.schoolId, p_invoice: b.invoiceId, p_amount: amount, p_mode: b.mode, p_reference: reference, p_paid_on: paidOn, p_actor: admin.id,
      });
      if (error) return bad(error.code === 'P0002' ? 'Invoice not found.' : error.message, error.code === '22023' || error.code === 'P0002' ? 400 : 500);
      const receipt = Array.isArray(data) ? data[0] : data;
      return NextResponse.json({ receiptNo: receipt?.receipt_no, id: receipt?.id });
    }

    case 'void_payment': {
      if (!isUuid(b.paymentId)) return bad('Pick a receipt.');
      const reason = str(b.reason, 300);
      if (!reason) return bad('Give a reason for voiding this receipt.');
      const { data, error } = await db.from('fee_payments')
        .update({ voided_at: new Date().toISOString(), void_reason: reason, voided_by: admin.id })
        .eq('id', b.paymentId).eq('school_id', admin.schoolId).is('voided_at', null).select('receipt_no');
      if (error) return bad(error.message, 500);
      if (!data?.length) return bad('Receipt not found, or already void.', 404);
      return NextResponse.json({ voided: data[0].receipt_no });
    }

    case 'concession': {
      if (!isUuid(b.invoiceId)) return bad('Pick an invoice.');
      const amount = money(b.amount);
      if (amount === null) return bad('Enter the concession in rupees.');
      const reason = str(b.reason, 300);
      if (!reason) return bad('Give a reason for the concession (it appears on the family\'s statement).');
      const inv = await invoiceWithPaid(db, admin.schoolId, b.invoiceId);
      if ('err' in inv) return inv.err;
      if (amount > inv.row.amount - inv.paid) return bad(`The concession can be at most ${inr(inv.row.amount - inv.paid)} (the unpaid part of this invoice).`);
      const { data: req0, error } = await db.from('fee_concession_requests').insert({
        school_id: admin.schoolId, invoice_id: b.invoiceId, student_id: inv.row.student_id, amount, reason, requested_by: admin.id,
      }).select('id').single();
      if (error) return bad(error.code === '23505' ? 'This invoice already has a concession waiting for approval.' : error.message, error.code === '23505' ? 409 : 500);
      // An approver who is the school's only approver can't get a second pair of eyes: apply it now, flagged as self-approved.
      if (admin.access.can('fees.concession.approve')) {
        const { data: dec, error: e2 } = await db.rpc('admin_decide_concession', { p_school: admin.schoolId, p_request: req0.id, p_approve: true, p_note: '', p_actor: admin.id });
        if (!e2) return NextResponse.json({ status: 'approved', selfApproved: (Array.isArray(dec) ? dec[0] : dec)?.self_approved ?? true });
        // The database refuses when another approver exists: it stays pending for them.
      }
      return NextResponse.json({ status: 'pending' });
    }

    case 'concession_decide': {
      if (!isUuid(b.requestId)) return bad('Pick a request.');
      const { data, error } = await db.rpc('admin_decide_concession', {
        p_school: admin.schoolId, p_request: b.requestId, p_approve: !!b.approve, p_note: str(b.note, 300), p_actor: admin.id,
      });
      if (error) return bad(error.message, error.code === '42501' ? 403 : 400);
      return NextResponse.json({ status: (Array.isArray(data) ? data[0] : data)?.status });
    }

    case 'void_invoice': {
      if (!isUuid(b.invoiceId)) return bad('Pick an invoice.');
      const reason = str(b.reason, 300);
      if (!reason) return bad('Give a reason for voiding this invoice.');
      const inv = await invoiceWithPaid(db, admin.schoolId, b.invoiceId);
      if ('err' in inv) return inv.err;
      if (inv.paid > 0) return bad('This invoice has receipts against it. Void those receipts first.');
      const { error } = await db.from('fee_invoices').update({ voided_at: new Date().toISOString(), void_reason: reason }).eq('id', b.invoiceId);
      if (error) return bad(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    case 'remind': {
      const ids: string[] = (Array.isArray(b.studentIds) ? b.studentIds : []).filter(isUuid).slice(0, 500);
      if (!ids.length) return bad('Pick at least one family.');
      return remind(db, admin, ids, session, today);
    }

    case 'day_close': {
      const day = str(b.day, 10);
      if (!ISO_DAY.test(day)) return bad('Pick the day to close.');
      const counted = money(b.cashCounted ?? 0);
      if (counted === null) return bad('Enter the cash counted, in rupees.');
      const { data, error } = await db.rpc('admin_close_day', { p_school: admin.schoolId, p_day: day, p_cash_counted: counted, p_note: str(b.note, 500), p_actor: admin.id });
      if (error) return bad(error.message, error.code === '42501' ? 403 : 400);
      const row = Array.isArray(data) ? data[0] : data;
      return NextResponse.json({ receipts: row?.receipts, variance: Number(row?.variance ?? 0) });
    }

    case 'day_reopen': {
      const day = str(b.day, 10);
      const reason = str(b.reason, 300);
      if (!ISO_DAY.test(day)) return bad('Pick the day to reopen.');
      if (!reason) return bad('Give a reason for reopening a closed day.');
      const { data, error } = await db.from('fee_day_closes')
        .update({ status: 'reopened', reopened_by: admin.id, reopened_at: new Date().toISOString(), reopen_reason: reason })
        .eq('school_id', admin.schoolId).eq('day', day).eq('status', 'closed').select('id');
      if (error) return bad(error.message, 500);
      if (!data?.length) return bad('That day isn\'t closed.', 404);
      return NextResponse.json({ ok: true });
    }
  }
}

/** The permission each action needs. */
const NEEDS: Record<string, Perm> = {
  structure: 'fees.bill', raise: 'fees.bill', payment: 'fees.collect', void_payment: 'fees.void', void_invoice: 'fees.void',
  concession: 'fees.concession.request', concession_decide: 'fees.concession.approve', remind: 'fees.remind',
  day_close: 'fees.dayclose', day_reopen: 'fees.void',
};

async function invoiceWithPaid(db: any, schoolId: string, id: string) {
  const { data: row } = await db.from('fee_invoices').select('id, student_id, amount, concession, voided_at').eq('id', id).eq('school_id', schoolId).maybeSingle();
  if (!row) return { err: bad('Invoice not found.', 404) };
  if (row.voided_at) return { err: bad('This invoice was voided.') };
  const { data: pays } = await db.from('fee_payments').select('amount').eq('invoice_id', id).is('voided_at', null);
  return { row: { ...row, amount: Number(row.amount) }, paid: (pays || []).reduce((s: number, p: any) => s + Number(p.amount), 0) };
}

/** Reminders use the family's balance and history as the database has it now, not what the browser showed. */
async function remind(db: any, admin: { id: string; schoolId: string; schoolName: string }, ids: string[], session: string, today: string) {
  const [students, invoices, reminders, guardians] = await Promise.all([
    db.from('users').select('id, name, student_class').eq('school_id', admin.schoolId).eq('role', 'student').in('id', ids),
    db.from('fee_invoices').select('*').eq('school_id', admin.schoolId).eq('session', session).in('student_id', ids),
    db.from('fee_reminders').select('id, student_id, tone, sent_at').eq('school_id', admin.schoolId).in('student_id', ids),
    db.from('guardians').select('parent_id, student_id').eq('verified', true).in('student_id', ids),
  ]);
  if (students.error || invoices.error) return bad((students.error || invoices.error).message, 500);
  const invIds = (invoices.data || []).map((i: any) => i.id);
  const payments = invIds.length ? await db.from('fee_payments').select('*').in('invoice_id', invIds) : { data: [] };
  const ledger = assembleLedger({
    session, today, students: (students.data || []).map((s: any) => ({ id: s.id, name: s.name || 'Student', cls: displayClass(s.student_class) })),
    structures: [], invoices: invoices.data || [], payments: payments.data || [], reminders: reminders.data || [],
  });

  // Don't re-send to a family already reminded in the last 3 days.
  const recent = new Set((reminders.data || []).filter((r: any) => Date.now() - new Date(r.sent_at).getTime() < 3 * 86_400_000).map((r: any) => r.student_id));
  const parents = new Map<string, string[]>();
  for (const g of guardians.data || []) parents.set(g.student_id, [...(parents.get(g.student_id) || []), g.parent_id]);

  const sent: string[] = [];
  const skipped: { studentId: string; why: string }[] = [];
  for (const f of ledger.families) {
    if (f.outstanding <= 0) { skipped.push({ studentId: f.studentId, why: 'nothing due' }); continue; }
    if (recent.has(f.studentId)) { skipped.push({ studentId: f.studentId, why: 'reminded in the last 3 days' }); continue; }
    const to = parents.get(f.studentId) || [];
    if (!to.length) { skipped.push({ studentId: f.studentId, why: 'no verified parent linked' }); continue; }
    const oldest = f.invoices.filter(i => i.balance > 0).map(i => i.dueOn).sort()[0];
    const msg = reminderMessage(f.tone, f.name, inr(f.outstanding), fmtDate(oldest), admin.schoolName);
    const { error } = await db.from('notifications').insert(to.map(pid => ({
      school_id: admin.schoolId, user_id: pid, student_id: f.studentId, type: 'fee_reminder', title: msg.title, body: msg.body,
      metadata: { outstanding: f.outstanding, tone: f.tone, invoiceIds: f.invoices.filter(i => i.balance > 0).map(i => i.id) },
    })));
    if (error) { skipped.push({ studentId: f.studentId, why: 'notification failed' }); continue; }
    // WhatsApp copy for parents who opted in to fee updates (in-app row written above).
    const wa = await notifyGuardians(db, {
      schoolId: admin.schoolId, studentId: f.studentId, pref: 'fees', type: 'fee_reminder', title: msg.title, body: msg.body,
      skipInApp: true, whatsapp: `${msg.title}\n\n${msg.body}\n\nReply to ask about the fee schedule or to message the school office.`,
    });
    await db.from('fee_reminders').insert({
      school_id: admin.schoolId, student_id: f.studentId, invoice_ids: f.invoices.filter(i => i.balance > 0).map(i => i.id),
      outstanding: f.outstanding, tone: f.tone, channel: wa.whatsapp ? 'whatsapp' : 'in_app', recipients: to.length, sent_by: admin.id,
    });
    sent.push(f.studentId);
  }
  for (const id of ids) if (!ledger.families.some(f => f.studentId === id)) skipped.push({ studentId: id, why: 'no invoices this session' });
  return NextResponse.json({ sent: sent.length, skipped });
}
