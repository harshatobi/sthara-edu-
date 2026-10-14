import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SchoolAdmin } from '@/lib/admin/serverAuth';
import { loadScheduleRows } from '@/lib/schedule/load';
import { agenda, minutes } from '@/lib/schedule/engine';
import {
  DEFAULT_PERSON_PAY, DEFAULT_SCHOOL_PAY, addMonth, basicDaPaid, computeLine, fyOf, fyStart, monthEnd, overriddenItems, paidByItem, ratesOn, runTotals,
  type Adjustment, type Counts, type Declaration, type LineResult, type LoanDue, type PayItem, type PayLine, type PersonPay, type PriorMonth, type RateRow,
  type Salary, type SchoolPay, type Settlement,
} from './engine';
import type { RunLine, Secrets } from './outputs';
import { pageAll } from '@/lib/ops/page';

export const toItem = (r: any): PayItem => ({
  id: r.id, code: r.code, name: r.name, kind: r.kind, calc: r.calc, percentOf: r.percent_of ?? null, countSource: r.count_source ?? null,
  threshold: Number(r.threshold), defaultValue: Number(r.default_value), role: r.role ?? null, taxable: !!r.taxable, pfWage: !!r.pf_wage, esiWage: !!r.esi_wage,
  prorate: !!r.prorate, sort: r.sort, active: !!r.active,
});
export const toSalary = (r: any): Salary => ({
  id: r.id, staffMemberId: r.staff_member_id, effectiveFrom: r.effective_from, templateId: r.template_id ?? null, reason: r.reason ?? null,
  lines: (Array.isArray(r.lines) ? r.lines : []).map((l: any) => ({ itemId: l.item_id, value: Number(l.value) })),
});
export const toSchoolPay = (r: any): SchoolPay => (r ? {
  dayBasis: r.day_basis, pfEnabled: !!r.pf_enabled, pfPolicy: r.pf_policy, pfCode: r.pf_code ?? null, esiEnabled: !!r.esi_enabled, esiCode: r.esi_code ?? null,
  ptState: r.pt_state ?? null, tdsEnabled: !!r.tds_enabled, tan: r.tan ?? null, employerPan: r.employer_pan ?? null, bonusEnabled: !!r.bonus_enabled,
  bonusMonth: r.bonus_month, gratuityEnabled: !!r.gratuity_enabled,
} : DEFAULT_SCHOOL_PAY);
export const toPersonPay = (r: any): PersonPay => (r ? {
  taxRegime: r.tax_regime, pfMode: r.pf_mode, vpfPct: Number(r.vpf_pct), esiExempt: !!r.esi_exempt, ptExempt: !!r.pt_exempt, tdsExempt: !!r.tds_exempt,
  payMode: r.pay_mode, onHold: !!r.on_hold, holdReason: r.hold_reason ?? null,
} : DEFAULT_PERSON_PAY);
export const toRunLine = (r: any): RunLine => ({
  id: r.id, staffMemberId: r.staff_member_id, month: r.month, person: r.person, days: r.days, earnings: r.earnings, deductions: r.deductions, employer: r.employer,
  tax: r.tax && Object.keys(r.tax).length ? r.tax : null, gross: Number(r.gross), totalDeductions: Number(r.total_deductions), net: Number(r.net),
  onHold: !!r.on_hold, payMode: r.pay_mode, flags: r.flags ?? [],
});

export async function loadRates(db: SupabaseClient, schoolId: string): Promise<RateRow[]> {
  const [{ data: base, error }, { data: over }] = await Promise.all([
    db.from('statutory_rates').select('key, effective_from, value, note'),
    db.from('statutory_overrides').select('key, effective_from, value, reason').eq('school_id', schoolId),
  ]);
  if (error) throw error;
  return [
    ...(base || []).map(r => ({ key: r.key, effectiveFrom: r.effective_from, value: r.value, note: r.note })),
    ...(over || []).map(r => ({ key: r.key, effectiveFrom: r.effective_from, value: r.value, override: true, reason: r.reason })),
  ];
}

export function payrollError(e: { code?: string; message?: string } | null, fallback: string): NextResponse {
  const m = e?.message || '';
  if (e?.code === '42P01' || e?.code === 'PGRST205' || e?.code === 'PGRST202') return NextResponse.json({ error: 'Payroll isn\'t in this database yet. It arrives with the payroll migration.' }, { status: 503 });
  if (/approved and frozen/.test(m)) return NextResponse.json({ error: 'That pay run is approved and can\'t be changed. Put the correction in the next run as an adjustment.' }, { status: 409 });
  if (e?.code === 'P0001') {
    const msg = /cannot approve it/.test(m) ? 'You submitted this run, so someone else has to approve it.' : /not awaiting approval/.test(m) ? 'That run isn\'t waiting for approval.' : null;
    if (msg) return NextResponse.json({ error: msg }, { status: 409 });
  }
  if (e?.code === '23505') {
    const msg = /uq_pay_runs_month/.test(m) ? 'There is already a pay run for that month.' : /pay_items_school_id_code/.test(m) ? 'Another pay item has that code.'
      : /uq_salary_templates_name/.test(m) ? 'Another template has that name.' : /staff_salaries_staff_member_id_effective_from/.test(m) ? 'They already have a salary starting that day. Pick another date or edit that one.'
      : /uq_pay_adjustments_override/.test(m) ? 'That item is already overridden for them this month. Remove the first override.' : /uq_pay_runs_settlement/.test(m) ? 'That exit already has a settlement.' : 'That already exists.';
    return NextResponse.json({ error: msg }, { status: 409 });
  }
  if (e?.code === '23514') return NextResponse.json({ error: 'Some of those values aren\'t allowed. Check the amounts and dates.' }, { status: 400 });
  console.error('[payroll]', e?.code, m);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** Records that someone looked at or exported pay: who, what, never the figures. */
export async function recordPayView(db: SupabaseClient, admin: SchoolAdmin, what: string, rowId: string, action: 'VIEW' | 'EXPORT' = 'VIEW'): Promise<void> {
  const { error } = await db.from('audit_log').insert({ actor_id: admin.id, actor_role: 'admin', action, table_name: 'pay_run_lines', row_id: rowId, school_id: admin.schoolId, new_values: { what } });
  if (error) console.error('[payroll] audit view failed:', error.message);
}

export async function loadSecrets(db: SupabaseClient, schoolId: string): Promise<Map<string, Secrets>> {
  const { data } = await db.from('staff_statutory').select('staff_member_id, pan, uan, esi_no, bank_account, bank_ifsc, bank_holder, bank_name').eq('school_id', schoolId);
  return new Map((data || []).map(r => [r.staff_member_id, { bankAccount: r.bank_account, bankIfsc: r.bank_ifsc, bankHolder: r.bank_holder, bankName: r.bank_name, pan: r.pan, uan: r.uan, esiNo: r.esi_no }]));
}

export interface Built {
  lines: (LineResult & { staffMemberId: string; person: RunLine['person']; onHold: boolean; payMode: string })[];
  warnings: string[]; noSalary: { id: string; name: string }[];
}
const taxableOf = (earnings: PayLine[]) => earnings.filter(e => e.taxable).reduce((n, e) => n + e.amount, 0);
const code = (xs: PayLine[], ...cs: string[]) => xs.filter(x => cs.includes(x.code)).reduce((n, x) => n + x.amount, 0);

/**
 * Works out a month's pay for the school, or one person's settlement, from what is on record now: salaries,
 * the confirmed attendance month, the month's sessions and duties, adjustments, loans, the year so far and the
 * rates in force. Nothing is saved here.
 */
export async function buildLines(db: SupabaseClient, schoolId: string, month: string, only?: { memberId: string; settlement: Settlement }): Promise<Built | { error: string }> {
  const end = monthEnd(month), fy = fyOf(month);
  const [members, users, depts, grades, itemsQ, salariesQ, settingsQ, personQ, rateRows, profiles, statutory, reviews, adjustments, loans, recoveries, decls, settlements] = await Promise.all([
    db.from('staff_members').select('*').eq('school_id', schoolId),
    db.from('users').select('id, name').eq('school_id', schoolId).in('role', ['teacher', 'admin']),
    db.from('hr_departments').select('id, name').eq('school_id', schoolId),
    db.from('hr_grades').select('id, name').eq('school_id', schoolId),
    db.from('pay_items').select('*').eq('school_id', schoolId),
    db.from('staff_salaries').select('*').eq('school_id', schoolId).lte('effective_from', end),
    db.from('payroll_settings').select('*').eq('school_id', schoolId).maybeSingle(),
    db.from('staff_pay_settings').select('*').eq('school_id', schoolId),
    loadRates(db, schoolId),
    db.from('staff_profiles').select('staff_member_id, date_of_birth').eq('school_id', schoolId),
    db.from('staff_statutory').select('staff_member_id, pan, uan, esi_no, bank_account').eq('school_id', schoolId),
    db.from('attendance_month_reviews').select('user_id, staff_member_id, lop_days').eq('school_id', schoolId).eq('month', month),
    db.from('pay_adjustments').select('*').eq('school_id', schoolId).eq('month', month),
    db.from('staff_loans').select('*').eq('school_id', schoolId).eq('status', 'open'),
    db.from('loan_recoveries').select('loan_id, amount').eq('school_id', schoolId),
    db.from('tax_declarations').select('staff_member_id, items').eq('school_id', schoolId).eq('fy', fy),
    db.from('pay_runs').select('staff_member_id, month, inputs').eq('school_id', schoolId).eq('kind', 'settlement'),
  ]);
  if (members.error) return { error: members.error.message };
  if (itemsQ.error) throw itemsQ.error;
  const school = toSchoolPay(settingsQ.data);
  const rates = ratesOn(rateRows, end, school.ptState);
  if ('missing' in rates) return { error: `The rate table for ${rates.missing} has nothing in force for ${month.slice(0, 7)}. Sthara needs to add it before this month can be run.` };
  const items = (itemsQ.data || []).map(toItem);
  const userName = new Map((users.data || []).map(u => [u.id, u.name as string | null]));
  const deptName = new Map((depts.data || []).map(d => [d.id, d.name as string])), gradeName = new Map((grades.data || []).map(g => [g.id, g.name as string]));
  const salaries = new Map<string, Salary[]>();
  for (const r of salariesQ.data || []) salaries.set(r.staff_member_id, [...(salaries.get(r.staff_member_id) ?? []), toSalary(r)]);
  const personPay = new Map((personQ.data || []).map(r => [r.staff_member_id, toPersonPay(r)]));
  const dob = new Map((profiles.data || []).map(r => [r.staff_member_id, r.date_of_birth as string | null]));
  const stat = new Map((statutory.data || []).map(r => [r.staff_member_id, r]));
  const decl = new Map((decls.data || []).map(r => [r.staff_member_id, r.items as Declaration]));
  const recovered = new Map<string, number>();
  for (const r of recoveries.data || []) recovered.set(r.loan_id, (recovered.get(r.loan_id) ?? 0) + Number(r.amount));

  // Whose salary this month is being paid through a settlement instead of the regular run.
  const settledHere = new Set((settlements.data || []).filter(s => s.month === month && (s.inputs as any)?.include_salary !== false).map(s => s.staff_member_id));
  const employed = (members.data || []).filter(m => {
    if (only) return m.id === only.memberId;
    if (settledHere.has(m.id)) return false;
    if (m.joined_on && m.joined_on > end) return false;
    return m.active || (m.exit_on && m.exit_on >= month);
  });

  // Loss of pay comes from the confirmed attendance month. A school that records no staff attendance has none.
  const lop = new Map<string, number>();
  for (const r of reviews.data || []) lop.set(r.user_id ?? `s:${r.staff_member_id}`, Number(r.lop_days));
  let tracking = lop.size > 0;
  if (!tracking) {
    const [p, k] = await Promise.all([
      db.from('staff_punches').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).gte('at', `${month}T00:00:00+05:30`).lte('at', `${end}T23:59:59+05:30`),
      db.from('staff_day_marks').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).gte('on_date', month).lte('on_date', end),
    ]);
    tracking = !!(p.count || k.count);
  }

  // Approved lines: this financial year (for tax), the last year (for bonus) and the last twelve months (for arrears).
  const since = [fyStart(fy), addMonth(month, -12), fyStart(fyOf(addMonth(fyStart(fy), -1)))].sort()[0];
  // Every line, paged: two years of a school's staff pass the 1,000 rows one request returns, and the cut fell on the
  // current year, so tax to date was worked out as if nothing had been paid since April.
  const { data: past, error: pastErr } = await pageAll<any>((f, t) => db.from('pay_run_lines').select('id, staff_member_id, month, days, earnings, deductions, pay_runs!inner(status, kind)')
    .eq('school_id', schoolId).eq('pay_runs.status', 'approved').gte('month', since).lt('month', month).order('month').order('id').range(f, t), 200_000);
  if (pastErr) return { error: `Could not read earlier pay runs: ${pastErr.message}` };
  const history = new Map<string, any[]>();
  for (const r of past) history.set(r.staff_member_id, [...(history.get(r.staff_member_id) ?? []), r]);

  // Counts for rate x count rules, only if some salary uses one.
  const ruleItems = new Set(items.filter(i => i.calc === 'rate_count' && i.active).map(i => i.id));
  const needCounts = employed.some(m => (salaries.get(m.id) ?? []).some(s => s.lines.some(l => ruleItems.has(l.itemId))));
  const sched = needCounts ? await loadScheduleRows(db, schoolId) : null;
  const countsFor = (m: any): Counts => {
    if (!sched) return {};
    const key = m.user_id ?? `s:${m.id}`;
    const c: Required<Counts> = { sessions: 0, duties: 0, duty_hours: 0, invigilation: 0, event_duty: 0, covers: 0, lessons: 0 };
    c.sessions = sched.visits.filter(v => v.staff_member_id === m.id && v.status === 'taken' && v.on_date >= month && v.on_date <= end).length;
    for (const d of agenda({ kind: 'teacher', userId: key }, month, end, sched)) {
      for (const it of d.items) {
        if (it.kind === 'lesson') { if (it.coverFor) c.covers++; else if (!it.covered) c.lessons++; }
        else if (it.kind === 'duty') {
          if (it.dutyKind === 'invigilation') c.invigilation++; else if (it.dutyKind === 'event') c.event_duty++; else c.duties++;
          c.duty_hours += Math.max(0, (minutes(it.end) - minutes(it.start)) / 60);
        }
      }
    }
    c.duty_hours = Math.round(c.duty_hours * 10) / 10;
    return c;
  };

  const prevFy = fyOf(addMonth(fyStart(fy), -1));
  const out: Built = { lines: [], warnings: [], noSalary: [] };
  for (const m of employed) {
    const name = (m.user_id && userName.get(m.user_id)) || m.name;
    const sal = salaries.get(m.id) ?? [];
    if (!sal.length) { if (m.active) out.noSalary.push({ id: m.id, name }); continue; }
    const hist = history.get(m.id) ?? [];
    const inFy = hist.filter(h => h.month >= fyStart(fy));
    const prior: PriorMonth[] = only ? [] : hist.filter(h => h.pay_runs.kind === 'regular' && h.month >= addMonth(month, -12)).map(h => ({
      month: h.month, days: h.days, paid: paidByItem(h.earnings), overridden: overriddenItems(h.earnings),
      arrearsPaid: hist.filter(x => x.month > h.month).flatMap(x => [...x.earnings, ...x.deductions] as PayLine[]).filter(e => e.source === 'arrears' && e.forMonth === h.month)
        .reduce((n, e) => n + (e.code === 'EXCESS' ? -e.amount : e.amount), 0),
    }));
    const lastYear = hist.filter(h => fyOf(h.month) === prevFy && h.pay_runs.kind === 'regular');
    const s = stat.get(m.id);
    const myLoans: LoanDue[] = (loans.data || []).filter(l => l.staff_member_id === m.id).map(l => ({
      id: l.id, kind: l.kind, instalment: Number(l.instalment), outstanding: Number(l.principal) - (recovered.get(l.id) ?? 0), startMonth: l.start_month,
    }));
    const key = m.user_id ?? `s:${m.id}`;
    const pay = personPay.get(m.id) ?? DEFAULT_PERSON_PAY;
    const r = computeLine({
      month, joinedOn: m.joined_on, lastDay: m.exit_on, dateOfBirth: dob.get(m.id) ?? null, salaries: sal, items, school, person: pay, rates,
      lopDays: lop.has(key) ? lop.get(key)! : tracking ? null : 0,
      counts: countsFor(m),
      adjustments: (adjustments.data || []).filter(a => a.staff_member_id === m.id).map((a): Adjustment => ({ id: a.id, mode: a.mode, itemId: a.item_id, kind: a.kind, label: a.label, amount: Number(a.amount), taxable: !!a.taxable, note: a.note })),
      loans: myLoans,
      ytd: { taxable: inFy.reduce((n, h) => n + taxableOf(h.earnings), 0), pfEmployee: inFy.reduce((n, h) => n + code(h.deductions, 'PF', 'VPF'), 0), pt: inFy.reduce((n, h) => n + code(h.deductions, 'PT'), 0), tds: inFy.reduce((n, h) => n + code(h.deductions, 'TDS'), 0) },
      declaration: decl.get(m.id) ?? null, prior,
      bonusBase: lastYear.length ? lastYear.reduce((n, h) => n + Math.min(basicDaPaid(h.earnings), rates.bonus.calc_ceiling), 0) : null,
      has: { bank: !!s?.bank_account, pan: !!s?.pan, uan: !!s?.uan, esiNo: !!s?.esi_no },
      settlement: only?.settlement ?? null,
    });
    out.lines.push({
      ...r, staffMemberId: m.id, onHold: pay.onHold, payMode: pay.payMode,
      person: { name, code: m.employee_code ?? null, designation: m.designation || '', department: deptName.get(m.department_id) ?? '', grade: gradeName.get(m.grade_id) ?? '', category: m.category },
    });
  }
  out.lines.sort((a, b) => a.person.name.localeCompare(b.person.name));
  if (out.noSalary.length) out.warnings.push(`${out.noSalary.length} ${out.noSalary.length === 1 ? 'person has' : 'people have'} no salary set and ${out.noSalary.length === 1 ? 'is' : 'are'} not in this run: ${out.noSalary.slice(0, 8).map(p => p.name).join(', ')}${out.noSalary.length > 8 ? ' and others' : ''}.`);
  const open = out.lines.filter(l => l.flags.includes('attendance_open')).length;
  if (open) out.warnings.push(`The month's attendance is not confirmed for ${open} ${open === 1 ? 'person' : 'people'}, so no loss of pay was applied to them. Confirm the month in Schedule > Attendance and work the run out again.`);
  if (!school.ptState) out.warnings.push('No professional tax state is set, so none was deducted.');
  // A school that starts payroll here part-way through the year: tax is worked only on what Sthara knows was paid.
  if (!only && school.tdsEnabled && month !== fyStart(fy) && out.lines.length && !(past || []).some(h => h.month >= fyStart(fy))) {
    out.warnings.push(`This is the first run of ${fy} and the year began in April. Tax is worked only on pay Sthara knows about, so for anyone paid earlier this year enter that salary and the TDS already deducted in their tax declaration (Salaries, open the person), then work the run out again. Otherwise too little tax is deducted.`);
  }
  return out;
}

/** Replaces a draft run's lines with freshly worked-out ones. */
export async function saveLines(db: SupabaseClient, schoolId: string, runId: string, month: string, built: Built, by: string): Promise<{ error?: any }> {
  const del = await db.from('pay_run_lines').delete().eq('run_id', runId);
  if (del.error) return { error: del.error };
  if (built.lines.length) {
    const ins = await db.from('pay_run_lines').insert(built.lines.map(l => ({
      run_id: runId, school_id: schoolId, staff_member_id: l.staffMemberId, month, person: l.person, days: l.days, earnings: l.earnings, deductions: l.deductions,
      employer: l.employer, tax: l.tax ?? {}, gross: l.gross, total_deductions: l.totalDeductions, net: l.net, on_hold: l.onHold, pay_mode: l.payMode, flags: l.flags,
    })));
    if (ins.error) return { error: ins.error };
  }
  const upd = await db.from('pay_runs').update({ totals: runTotals(built.lines), warnings: built.warnings, computed_at: new Date().toISOString(), computed_by: by }).eq('id', runId);
  return { error: upd.error ?? undefined };
}
