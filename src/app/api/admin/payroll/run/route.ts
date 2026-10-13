import { NextResponse, type NextRequest } from 'next/server';
import { bad, deny, isUuid, money, requireAdmin, str } from '@/lib/admin/serverAuth';
import { day } from '@/lib/hr/engine';
import { schoolToday } from '@/lib/hr/server';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { monthName, monthStart, type PayLine, type Settlement } from '@/lib/payroll/engine';
import { buildLines, payrollError, recordPayView, saveLines, toRunLine } from '@/lib/payroll/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Pay runs: a month's payroll, or one person's full and final settlement.
 *
 *   GET ?id=            a run with every line (payroll.read, .prepare or .approve); recorded in the audit trail
 *   POST { action }
 *     compute           { month }                 payroll.prepare. Works the month out from what is on record and saves it
 *                                                 as a draft; run it again any time until the run is submitted.
 *     settlement        { exitId, leaveDays, noticeShortDays, gratuity: 'auto' | 'none' | amount }   payroll.prepare
 *     submit            { id }                    payroll.prepare. Sends the draft for approval.
 *     recall            { id }                    payroll.prepare. Takes a submitted run back to draft.
 *     send_back         { id, note }              payroll.approve. Back to draft, with the reason.
 *     approve           { id }                    payroll.approve, and not the person who submitted it. Freezes the run,
 *                                                 books loan recoveries and tells staff their payslip is ready.
 *     delete            { id }                    payroll.prepare. A draft only.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ['payroll.read', 'payroll.prepare', 'payroll.approve']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const id = req.nextUrl.searchParams.get('id');
  if (!isUuid(id)) return bad('Pick a run.');
  const { data: run, error } = await db.from('pay_runs').select('*').eq('id', id).eq('school_id', admin.schoolId).maybeSingle();
  if (error) return payrollError(error, 'Could not load the run.');
  if (!run) return bad('That run is no longer there.', 404);
  const { data: lines } = await db.from('pay_run_lines').select('*').eq('run_id', run.id).order('person->>name');
  await recordPayView(db, admin, `${run.kind} run ${run.month.slice(0, 7)}`, run.id);
  return NextResponse.json({ run: { id: run.id, kind: run.kind, month: run.month, status: run.status, totals: run.totals, warnings: run.warnings, inputs: run.inputs, note: run.note, submittedBy: run.submitted_by }, lines: (lines || []).map(toRunLine) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ['payroll.prepare', 'payroll.approve']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || typeof b.action !== 'string') return bad('Invalid request.');
  const school = admin.schoolId, today = schoolToday();
  const need = (p: 'payroll.prepare' | 'payroll.approve') => deny(admin, p);
  const runOf = async (id: unknown) => {
    if (!isUuid(id)) return null;
    const { data } = await db.from('pay_runs').select('*').eq('id', id).eq('school_id', school).maybeSingle();
    return data;
  };

  try {
    switch (b.action) {
      case 'compute': {
        const no = need('payroll.prepare'); if (no) return no;
        const month = day(typeof b.month === 'string' ? `${b.month.slice(0, 7)}-01` : null);
        if (!month) return bad('Pick the month.');
        if (month > monthStart(today)) return bad('That month hasn\'t started.');
        const { data: earlier } = await db.from('pay_runs').select('month, status').eq('school_id', school).eq('kind', 'regular').lt('month', month).neq('status', 'approved').order('month').limit(1);
        if (earlier?.length) return bad(`The run for ${monthName(earlier[0].month)} isn't approved yet. Finish it first, so this month's tax and arrears start from the right figures.`);
        let { data: run } = await db.from('pay_runs').select('*').eq('school_id', school).eq('kind', 'regular').eq('month', month).maybeSingle();
        if (run && run.status !== 'draft') return bad(run.status === 'approved' ? 'That month is approved and frozen.' : 'That run is waiting for approval. Recall it to change it.', 409);
        const built = await buildLines(db, school, month);
        if ('error' in built) return bad(built.error, 409);
        if (!built.lines.length) return bad(built.noSalary.length ? 'Nobody has a salary set yet. Set salaries first.' : 'Nobody was employed in that month.', 409);
        if (!run) {
          const ins = await db.from('pay_runs').insert({ school_id: school, kind: 'regular', month }).select('*').single();
          if (ins.error) return payrollError(ins.error, 'Could not start the run.');
          run = ins.data;
        }
        const saved = await saveLines(db, school, run.id, month, built, admin.id);
        if (saved.error) return payrollError(saved.error, 'Could not save the run.');
        return NextResponse.json({ ok: true, id: run.id, people: built.lines.length });
      }

      case 'settlement': {
        const no = need('payroll.prepare'); if (no) return no;
        if (!isUuid(b.exitId)) return bad('Pick the exit.');
        const { data: x } = await db.from('staff_exits').select('id, staff_member_id, last_day, status').eq('id', b.exitId).eq('school_id', school).maybeSingle();
        if (!x || x.status === 'withdrawn') return bad('That exit isn\'t in progress or complete.', 404);
        const leave = Number(b.leaveDays) || 0, shortfall = Number(b.noticeShortDays) || 0;
        if (leave < 0 || leave > 365 || shortfall < 0 || shortfall > 365) return bad('Check the days.');
        const g = b.gratuity === 'none' ? 'none' : b.gratuity === 'auto' || b.gratuity === undefined ? 'auto' : money(b.gratuity);
        if (g === null) return bad('Give the gratuity as an amount, or leave it to be worked out.');
        const month = monthStart(x.last_day);
        let { data: run } = await db.from('pay_runs').select('*').eq('school_id', school).eq('kind', 'settlement').eq('exit_id', x.id).maybeSingle();
        if (run && run.status !== 'draft') return bad(run.status === 'approved' ? 'That settlement is approved and frozen.' : 'That settlement is waiting for approval. Recall it to change it.', 409);
        // If the month's regular run already carries their salary (and is past draft), the settlement holds only the extras.
        const { data: paid } = await db.from('pay_run_lines').select('id, pay_runs!inner(kind, status)').eq('staff_member_id', x.staff_member_id).eq('month', month).eq('pay_runs.kind', 'regular').neq('pay_runs.status', 'draft').limit(1);
        const settlement: Settlement = { lastDay: x.last_day, leaveDays: leave, noticeShortDays: shortfall, gratuity: g, includeSalary: !paid?.length };
        const inputs = { last_day: x.last_day, leave_days: leave, notice_short_days: shortfall, gratuity: g, include_salary: settlement.includeSalary };
        if (!run) {
          const ins = await db.from('pay_runs').insert({ school_id: school, kind: 'settlement', month, staff_member_id: x.staff_member_id, exit_id: x.id, inputs }).select('*').single();
          if (ins.error) return payrollError(ins.error, 'Could not start the settlement.');
          run = ins.data;
        } else {
          const upd = await db.from('pay_runs').update({ inputs }).eq('id', run.id);
          if (upd.error) return payrollError(upd.error, 'Could not save the settlement.');
        }
        const built = await buildLines(db, school, month, { memberId: x.staff_member_id, settlement });
        if ('error' in built) return bad(built.error, 409);
        if (!built.lines.length) return bad('They have no salary on record, so there is nothing to settle from. Set their salary first.', 409);
        const saved = await saveLines(db, school, run.id, month, built, admin.id);
        if (saved.error) return payrollError(saved.error, 'Could not save the settlement.');
        return NextResponse.json({ ok: true, id: run.id });
      }

      case 'submit':
      case 'recall':
      case 'delete': {
        const no = need('payroll.prepare'); if (no) return no;
        const run = await runOf(b.id);
        if (!run) return bad('That run is no longer there.', 404);
        if (b.action === 'delete') {
          if (run.status !== 'draft') return bad('Only a draft can be removed.', 409);
          const { error } = await db.from('pay_runs').delete().eq('id', run.id);
          return error ? payrollError(error, 'Could not remove the run.') : NextResponse.json({ ok: true });
        }
        if (b.action === 'recall') {
          if (run.status !== 'submitted') return bad('That run isn\'t waiting for approval.', 409);
          const { error } = await db.from('pay_runs').update({ status: 'draft', submitted_by: null, submitted_at: null }).eq('id', run.id);
          return error ? payrollError(error, 'Could not recall the run.') : NextResponse.json({ ok: true });
        }
        if (run.status !== 'draft') return bad('That run has already been submitted.', 409);
        const { data: lines } = await db.from('pay_run_lines').select('net, flags').eq('run_id', run.id);
        if (!lines?.length) return bad('Work the run out first.');
        const negative = lines.filter(l => Number(l.net) < 0).length;
        if (negative) return bad(`${negative} ${negative === 1 ? 'person has' : 'people have'} deductions larger than their pay. Reduce a recovery or put their pay on hold, then work the run out again.`);
        const { error } = await db.from('pay_runs').update({ status: 'submitted', submitted_by: admin.id, submitted_at: new Date().toISOString(), note: str(b.note, 1000) || null }).eq('id', run.id);
        return error ? payrollError(error, 'Could not submit the run.') : NextResponse.json({ ok: true });
      }

      case 'send_back': {
        const no = need('payroll.approve'); if (no) return no;
        const run = await runOf(b.id);
        if (!run) return bad('That run is no longer there.', 404);
        if (run.status !== 'submitted') return bad('That run isn\'t waiting for approval.', 409);
        const note = str(b.note, 1000);
        if (!note) return bad('Say what needs to change.');
        const { error } = await db.from('pay_runs').update({ status: 'draft', note, submitted_at: null }).eq('id', run.id);
        if (error) return payrollError(error, 'Could not send the run back.');
        if (run.submitted_by) {
          await db.from('notifications').insert({ school_id: school, user_id: run.submitted_by, type: 'payroll', title: `Pay run for ${monthName(run.month)} sent back`, body: `${admin.name}: ${note}`, metadata: { runId: run.id } });
        }
        return NextResponse.json({ ok: true });
      }

      case 'approve': {
        const no = need('payroll.approve'); if (no) return no;
        const run = await runOf(b.id);
        if (!run) return bad('That run is no longer there.', 404);
        if (run.status !== 'submitted') return bad('That run isn\'t waiting for approval.', 409);
        if (run.submitted_by === admin.id) return bad('You submitted this run, so someone else has to approve it.', 409);
        const { data: lines } = await db.from('pay_run_lines').select('staff_member_id, deductions, net, on_hold').eq('run_id', run.id);
        const recoveries = (lines || []).flatMap(l => (l.deductions as PayLine[]).filter(d => d.source === 'loan' && d.loanId).map(d => ({ loan_id: d.loanId, amount: d.amount })));
        const done = await db.rpc('payroll_approve_run', { p_school: school, p_run: run.id, p_by: admin.id, p_recoveries: recoveries });
        if (done.error) return payrollError(done.error, 'Could not approve the run.');

        // Payslips: an in-app note to staff with logins, a WhatsApp line to staff with none who agreed to messages.
        const ids = (lines || []).filter(l => !l.on_hold).map(l => l.staff_member_id);
        const { data: members } = ids.length ? await db.from('staff_members').select('id, user_id, name, phone_e164, whatsapp_opt_in').in('id', ids) : { data: [] as any[] };
        const what = run.kind === 'settlement' ? 'final settlement statement' : `payslip for ${monthName(run.month)}`;
        const notes = (members || []).filter(m => m.user_id).map(m => ({ school_id: school, user_id: m.user_id, type: 'payroll', title: `Your ${what} is ready`, body: 'Open My record to see and print it.', metadata: { runId: run.id } }));
        if (notes.length) { const n = await db.from('notifications').insert(notes); if (n.error) console.warn('[payroll] payslip notifications failed:', n.error.message); }
        const netOf = new Map((lines || []).map(l => [l.staff_member_id, Number(l.net)]));
        let whatsapp = 0;
        for (const m of (members || []).filter(x => !x.user_id && x.whatsapp_opt_in && x.phone_e164)) {
          try {
            const r = await sendWhatsApp(db, { to: m.phone_e164, schoolId: school, kind: 'notify', body: `${admin.schoolName}: your ${what} is ready. Net pay Rs ${netOf.get(m.id)?.toLocaleString('en-IN')}. Ask the office for a printed copy.`, meta: { runId: run.id, staffMemberId: m.id } });
            if (r.ok) whatsapp++;
          } catch (e: any) { console.warn('[payroll] WhatsApp payslip failed:', e?.message); }
        }
        return NextResponse.json({ ok: true, notified: notes.length, whatsapp });
      }

      default:
        return bad('Unknown action.');
    }
  } catch (e: any) {
    return payrollError(e, 'Something went wrong. Try again.');
  }
}
