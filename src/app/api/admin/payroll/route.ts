import { NextResponse, type NextRequest } from 'next/server';
import { bad, deny, isUuid, money, requireAdmin, str } from '@/lib/admin/serverAuth';
import { day } from '@/lib/hr/engine';
import { loadPeople, schoolToday } from '@/lib/hr/server';
import {
  COUNT_SOURCES, fyOf, monthEnd, monthStart, rateOn, salaryOn, salarySummary, type PayItem, type SalaryLine,
} from '@/lib/payroll/engine';
import { loadRates, payrollError, recordPayView, toItem, toPersonPay, toSalary, toSchoolPay } from '@/lib/payroll/server';

export const dynamic = 'force-dynamic';

const READ = ['payroll.read', 'payroll.prepare', 'payroll.approve'] as const;
const RATE_KEYS = ['pf', 'esi', 'bonus', 'gratuity', 'it:new', 'it:old'];
/** The standard set a school starts from; everything can be renamed, changed or switched off. */
const STANDARD_ITEMS = [
  { code: 'BASIC', name: 'Basic pay', kind: 'earning', calc: 'fixed', role: 'basic', pf_wage: true, sort: 10 },
  { code: 'DA', name: 'Dearness allowance', kind: 'earning', calc: 'percent', percent_of: 'basic', role: 'da', pf_wage: true, sort: 20 },
  { code: 'HRA', name: 'House rent allowance', kind: 'earning', calc: 'percent', percent_of: 'basic_da', role: 'hra', sort: 30 },
  { code: 'CONV', name: 'Conveyance allowance', kind: 'earning', calc: 'fixed', sort: 40 },
  { code: 'SPECIAL', name: 'Special allowance', kind: 'earning', calc: 'fixed', sort: 50 },
  { code: 'SESSION', name: 'Session fee', kind: 'earning', calc: 'rate_count', count_source: 'sessions', prorate: false, esi_wage: false, sort: 60 },
  { code: 'DUTY', name: 'Duty allowance', kind: 'earning', calc: 'rate_count', count_source: 'duties', prorate: false, sort: 70 },
  { code: 'INVIG', name: 'Invigilation allowance', kind: 'earning', calc: 'rate_count', count_source: 'invigilation', prorate: false, sort: 80 },
];

/**
 * Payroll set-up and salaries.
 *
 *   GET            everything the payroll pages need (payroll.read, .prepare or .approve): settings, pay items,
 *                  templates, each person's current salary and pay settings, runs, loans, the rates in force.
 *   GET ?member=   one person's salary history, adjustments, loans, declaration and payslips.
 *   POST { action } payroll.prepare:
 *     settings | seed_items | item | item_delete | template | template_delete
 *     salary { id, effectiveFrom, lines: [{ itemId, value }], templateId?, reason }   a dated salary
 *     salary_delete { salaryId }      a salary no approved run has used
 *     pay_setting { id, taxRegime, pfMode, vpfPct, esiExempt, ptExempt, tdsExempt, payMode, onHold, holdReason }
 *     adjustment { id, month, mode, itemId?, kind, label, amount, taxable, note } | adjustment_delete { adjustmentId }
 *     loan { id, kind, principal, issuedOn, instalment, startMonth, note } | loan_close { loanId, writeOff? }
 *     declaration { id, fy, items, proofsVerified }
 *     rate_override { key, effectiveFrom, value, reason } | rate_override_delete { key, effectiveFrom }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, [...READ]);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const school = admin.schoolId, today = schoolToday(), thisMonth = monthStart(today);
  const can = { prepare: admin.access.can('payroll.prepare'), approve: admin.access.can('payroll.approve'), sensitive: admin.access.can('hr.sensitive') };
  const memberId = req.nextUrl.searchParams.get('member');
  try {
    if (memberId) {
      if (!isUuid(memberId)) return bad('Unknown employee.', 404);
      const fy = fyOf(thisMonth);
      const [sal, adj, loans, rec, decl, slips, pay] = await Promise.all([
        db.from('staff_salaries').select('*').eq('school_id', school).eq('staff_member_id', memberId).order('effective_from', { ascending: false }),
        db.from('pay_adjustments').select('*').eq('school_id', school).eq('staff_member_id', memberId).order('month', { ascending: false }).limit(60),
        db.from('staff_loans').select('*').eq('school_id', school).eq('staff_member_id', memberId).order('issued_on', { ascending: false }),
        db.from('loan_recoveries').select('loan_id, amount').eq('school_id', school),
        db.from('tax_declarations').select('*').eq('school_id', school).eq('staff_member_id', memberId).order('fy', { ascending: false }),
        db.from('pay_run_lines').select('id, run_id, month, gross, total_deductions, net, pay_runs!inner(status, kind)').eq('school_id', school).eq('staff_member_id', memberId).eq('pay_runs.status', 'approved').order('month', { ascending: false }).limit(36),
        db.from('staff_pay_settings').select('*').eq('staff_member_id', memberId).maybeSingle(),
      ]);
      if (sal.error) return payrollError(sal.error, 'Could not load their pay.');
      await recordPayView(db, admin, 'salary history', memberId);
      const got = new Map<string, number>();
      for (const r of rec.data || []) got.set(r.loan_id, (got.get(r.loan_id) ?? 0) + Number(r.amount));
      return NextResponse.json({
        fy, salaries: (sal.data || []).map(toSalary), pay: toPersonPay(pay.data),
        adjustments: (adj.data || []).map(a => ({ id: a.id, month: a.month, mode: a.mode, itemId: a.item_id, kind: a.kind, label: a.label, amount: Number(a.amount), taxable: a.taxable, note: a.note })),
        loans: (loans.data || []).map(l => ({ id: l.id, kind: l.kind, principal: Number(l.principal), issuedOn: l.issued_on, instalment: Number(l.instalment), startMonth: l.start_month, status: l.status, note: l.note, recovered: got.get(l.id) ?? 0 })),
        declarations: (decl.data || []).map(d => ({ fy: d.fy, items: d.items, proofsVerified: d.proofs_verified })),
        payslips: (slips.data || []).map((s: any) => ({ id: s.id, runId: s.run_id, month: s.month, gross: Number(s.gross), deductions: Number(s.total_deductions), net: Number(s.net), kind: s.pay_runs.kind })),
      });
    }

    const [people, settings, items, templates, salaries, pay, runs, loans, rec, rateRows, depts, grades, exits, users] = await Promise.all([
      loadPeople(db, school),
      db.from('payroll_settings').select('*').eq('school_id', school).maybeSingle(),
      db.from('pay_items').select('*').eq('school_id', school).order('sort').order('name'),
      db.from('salary_templates').select('*').eq('school_id', school).order('name'),
      db.from('staff_salaries').select('*').eq('school_id', school),
      db.from('staff_pay_settings').select('*').eq('school_id', school),
      db.from('pay_runs').select('*').eq('school_id', school).order('month', { ascending: false }).limit(60),
      db.from('staff_loans').select('*').eq('school_id', school).order('issued_on', { ascending: false }).limit(500),
      db.from('loan_recoveries').select('loan_id, amount').eq('school_id', school),
      loadRates(db, school),
      db.from('hr_departments').select('id, name').eq('school_id', school),
      db.from('hr_grades').select('id, name, pay_min, pay_max').eq('school_id', school).order('sort'),
      db.from('staff_exits').select('id, staff_member_id, kind, last_day, status').eq('school_id', school).in('status', ['notice', 'completed']).order('last_day', { ascending: false }).limit(200),
      db.from('users').select('id, name').eq('school_id', school).eq('role', 'admin'),
    ]);
    if (items.error) return payrollError(items.error, 'Could not load payroll.');
    const its = (items.data || []).map(toItem);
    const byMember = new Map<string, ReturnType<typeof toSalary>[]>();
    for (const r of salaries.data || []) byMember.set(r.staff_member_id, [...(byMember.get(r.staff_member_id) ?? []), toSalary(r)]);
    const payBy = new Map((pay.data || []).map(r => [r.staff_member_id, toPersonPay(r)]));
    const got = new Map<string, number>();
    for (const r of rec.data || []) got.set(r.loan_id, (got.get(r.loan_id) ?? 0) + Number(r.amount));
    const who = new Map((users.data || []).map(u => [u.id, u.name as string]));
    const sp = toSchoolPay(settings.data);
    const keys = [...RATE_KEYS, ...[...new Set(rateRows.filter(r => r.key.startsWith('pt:')).map(r => r.key))]];
    // Seeing everyone's pay is recorded, at most once every ten minutes per person looking.
    const { data: recent } = await db.from('audit_log').select('id').eq('actor_id', admin.id).eq('table_name', 'pay_run_lines').eq('row_id', 'salaries').gte('at', new Date(Date.now() - 600_000).toISOString()).limit(1);
    if (!recent?.length) await recordPayView(db, admin, 'all salaries', 'salaries');

    return NextResponse.json({
      can, today, month: thisMonth, fy: fyOf(thisMonth), settings: sp, configured: !!settings.data, items: its,
      templates: (templates.data || []).map(t => ({ id: t.id, name: t.name, gradeId: t.grade_id, active: t.active, lines: (t.lines || []).map((l: any) => ({ itemId: l.item_id, value: Number(l.value) })) })),
      people: people.map(p => {
        const ss = byMember.get(p.id) ?? [], cur = salaryOn(ss, monthEnd(thisMonth));
        return {
          id: p.id, name: p.name, employeeCode: p.employeeCode, designation: p.designation, category: p.category, departmentId: p.departmentId, gradeId: p.gradeId,
          employment: p.employment, active: p.active, joinedOn: p.joinedOn, exitOn: p.exitOn, pay: payBy.get(p.id) ?? null,
          salary: cur ? { id: cur.id, effectiveFrom: cur.effectiveFrom, lines: cur.lines, ...salarySummary(cur.lines, its) } : null,
          upcoming: ss.filter(s => s.effectiveFrom > monthEnd(thisMonth)).length,
        };
      }),
      runs: (runs.data || []).map(r => ({
        id: r.id, kind: r.kind, month: r.month, status: r.status, totals: r.totals, warnings: r.warnings, staffMemberId: r.staff_member_id, exitId: r.exit_id, inputs: r.inputs,
        computedAt: r.computed_at, submittedBy: r.submitted_by, submittedByName: who.get(r.submitted_by) ?? null, submittedAt: r.submitted_at,
        approvedByName: who.get(r.approved_by) ?? null, approvedAt: r.approved_at, note: r.note,
      })),
      loans: (loans.data || []).map(l => ({ id: l.id, staffMemberId: l.staff_member_id, kind: l.kind, principal: Number(l.principal), issuedOn: l.issued_on, instalment: Number(l.instalment), startMonth: l.start_month, status: l.status, note: l.note, recovered: got.get(l.id) ?? 0 })),
      rates: keys.map(k => ({ key: k, inForce: rateOn(rateRows, k, monthEnd(thisMonth)), sthara: rateOn(rateRows.filter(r => !r.override), k, monthEnd(thisMonth)) })),
      overrides: rateRows.filter(r => r.override),
      ptStates: [...new Set(rateRows.filter(r => r.key.startsWith('pt:')).map(r => r.key.slice(3)))].sort(),
      departments: depts.data || [], grades: (grades.data || []).map(g => ({ id: g.id, name: g.name, payMin: g.pay_min === null ? null : Number(g.pay_min), payMax: g.pay_max === null ? null : Number(g.pay_max) })),
      exits: (exits.data || []).map(x => ({ id: x.id, staffMemberId: x.staff_member_id, kind: x.kind, lastDay: x.last_day, status: x.status })),
      me: admin.id,
    });
  } catch (e: any) {
    return payrollError(e, 'Could not load payroll.');
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'payroll.prepare');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || typeof b.action !== 'string') return bad('Invalid request.');
  const school = admin.schoolId, today = schoolToday();
  const now = () => new Date().toISOString();
  const member = async (id: unknown) => {
    if (!isUuid(id)) return null;
    const { data } = await db.from('staff_members').select('id, name, joined_on, active').eq('id', id).eq('school_id', school).maybeSingle();
    return data;
  };
  const itemsOf = async (): Promise<PayItem[]> => ((await db.from('pay_items').select('*').eq('school_id', school)).data || []).map(toItem);
  /** Salary or template lines against the school's items: one line an item, sensible figures. */
  const cleanLines = (raw: unknown, items: PayItem[]): SalaryLine[] | string => {
    if (!Array.isArray(raw) || !raw.length) return 'Add at least one pay item.';
    const seen = new Set<string>(), out: SalaryLine[] = [];
    for (const l of raw) {
      const i = items.find(x => x.id === l?.itemId);
      if (!i) return 'One of those pay items isn\'t in this school.';
      if (seen.has(i.id)) return `${i.name} is listed twice.`;
      seen.add(i.id);
      const v = Number(l.value);
      if (!Number.isFinite(v) || v < 0) return `Give ${i.name} a figure.`;
      if (i.calc === 'percent' && v > 500) return `${i.name} is a percentage; ${v} looks too high.`;
      if (v > 1e8) return `${i.name} is too large.`;
      out.push({ itemId: i.id, value: Math.round(v * 100) / 100 });
    }
    return out;
  };
  /** The last month an approved run covers: nothing dated in or before it can be changed here. */
  const lockedThrough = async (memberId?: string) => {
    let q = db.from('pay_run_lines').select('month, pay_runs!inner(status)').eq('school_id', school).eq('pay_runs.status', 'approved').order('month', { ascending: false }).limit(1);
    if (memberId) q = q.eq('staff_member_id', memberId);
    const { data } = await q;
    return data?.[0]?.month ? monthEnd(data[0].month) : null;
  };

  try {
    switch (b.action) {
      case 'settings': {
        const basis = ['calendar', 'fixed30', 'working26'].includes(b.dayBasis) ? b.dayBasis : null;
        if (!basis) return bad('Pick how a day\'s pay is worked out.');
        const up = (v: unknown, n: number) => str(v, n).toUpperCase() || null;
        const tan = up(b.tan, 10), pan = up(b.employerPan, 10), state = up(b.ptState, 2);
        if (tan && !/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(tan)) return bad('That TAN doesn\'t look right. It is four letters, five digits and a letter.');
        if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return bad('That PAN doesn\'t look right.');
        if (state) {
          const { data: has } = await db.from('statutory_rates').select('key').eq('key', `pt:${state}`).limit(1);
          const { data: own } = await db.from('statutory_overrides').select('key').eq('school_id', school).eq('key', `pt:${state}`).limit(1);
          if (!has?.length && !own?.length) return bad('Sthara has no professional tax table for that state yet. Add your own table under Rates, or ask Sthara to add it.');
        }
        const bm = Number(b.bonusMonth);
        if (!Number.isInteger(bm) || bm < 1 || bm > 12) return bad('Pick the bonus month.');
        const { error } = await db.from('payroll_settings').upsert({
          school_id: school, day_basis: basis, pf_enabled: !!b.pfEnabled, pf_policy: b.pfPolicy === 'full' ? 'full' : 'capped', pf_code: str(b.pfCode, 40) || null,
          esi_enabled: !!b.esiEnabled, esi_code: str(b.esiCode, 40) || null, pt_state: state, tds_enabled: b.tdsEnabled !== false, tan, employer_pan: pan,
          bonus_enabled: !!b.bonusEnabled, bonus_month: bm, gratuity_enabled: b.gratuityEnabled !== false, updated_by: admin.id,
        }, { onConflict: 'school_id' });
        return error ? payrollError(error, 'Could not save the settings.') : NextResponse.json({ ok: true });
      }

      case 'seed_items': {
        const { count } = await db.from('pay_items').select('id', { count: 'exact', head: true }).eq('school_id', school);
        if (count) return bad('This school already has pay items.');
        // Every row carries every column: a bulk insert needs the same keys on each.
        const blank = { percent_of: null, count_source: null, role: null, pf_wage: false, esi_wage: true, prorate: true };
        const { error } = await db.from('pay_items').insert(STANDARD_ITEMS.map(i => ({ ...blank, ...i, school_id: school, active: i.code !== 'DUTY' && i.code !== 'INVIG' })));
        return error ? payrollError(error, 'Could not add the standard items.') : NextResponse.json({ ok: true });
      }

      case 'item': {
        const name = str(b.name, 60), code = str(b.code, 16).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        if (!name || !code) return bad('Give the item a name and a short code.');
        if (['PF', 'VPF', 'ESI', 'PT', 'TDS', 'ARREARS', 'EXCESS', 'ADJ', 'BONUS', 'GRATUITY', 'LEAVE_ENC', 'NOTICE', 'ADVANCE', 'LOAN'].includes(code)) return bad(`${code} is used by payroll itself. Pick another code.`);
        if (b.kind !== 'earning' && b.kind !== 'deduction') return bad('Is it an earning or a deduction?');
        if (!['fixed', 'percent', 'rate_count'].includes(b.calc)) return bad('Pick how it is worked out.');
        const percentOf = b.calc === 'percent' ? (['basic', 'basic_da', 'gross'].includes(b.percentOf) ? b.percentOf : null) : null;
        if (b.calc === 'percent' && !percentOf) return bad('A percentage of what?');
        const source = b.calc === 'rate_count' ? (b.countSource in COUNT_SOURCES ? b.countSource : null) : null;
        if (b.calc === 'rate_count' && !source) return bad('Pick what it counts.');
        const role = b.kind === 'earning' && ['basic', 'da', 'hra'].includes(b.role) ? b.role : null;
        if (role && percentOf === 'gross') return bad('Basic, DA and HRA can\'t be a percentage of gross.');
        if (role === 'basic' && b.calc !== 'fixed') return bad('Basic pay is a fixed amount.');
        const threshold = Number(b.threshold) || 0, def = Number(b.defaultValue) || 0;
        if (threshold < 0 || def < 0) return bad('Figures can\'t be negative.');
        const row = {
          code, name, kind: b.kind, calc: b.calc, percent_of: percentOf, count_source: source, threshold: source ? threshold : 0, default_value: def, role,
          taxable: b.kind === 'earning' ? b.taxable !== false : false, pf_wage: b.kind === 'earning' && !!b.pfWage, esi_wage: b.kind === 'earning' && b.esiWage !== false,
          prorate: b.calc === 'rate_count' ? false : b.prorate !== false, sort: Number.isInteger(b.sort) ? Math.max(0, Math.min(999, b.sort)) : 100, active: b.active !== false,
        };
        if (b.id) {
          if (!isUuid(b.id)) return bad('Unknown item.');
          const { data, error } = await db.from('pay_items').update(row).eq('id', b.id).eq('school_id', school).select('id').maybeSingle();
          if (error) return payrollError(error, 'Could not save the item.');
          return data ? NextResponse.json({ ok: true, id: data.id }) : bad('That item is no longer there.', 404);
        }
        const { data, error } = await db.from('pay_items').insert({ ...row, school_id: school }).select('id').single();
        return error ? payrollError(error, 'Could not add the item.') : NextResponse.json({ ok: true, id: data.id });
      }

      case 'item_delete': {
        if (!isUuid(b.id)) return bad('Pick an item.');
        const [{ data: sal }, { data: tpl }] = await Promise.all([
          db.from('staff_salaries').select('id, lines').eq('school_id', school),
          db.from('salary_templates').select('id, lines').eq('school_id', school),
        ]);
        const used = [...(sal || []), ...(tpl || [])].some(r => (r.lines as any[]).some(l => l.item_id === b.id));
        // An item salaries were built on is switched off, not removed: past payslips still name it.
        const { error } = used
          ? await db.from('pay_items').update({ active: false }).eq('id', b.id).eq('school_id', school)
          : await db.from('pay_items').delete().eq('id', b.id).eq('school_id', school);
        return error ? payrollError(error, 'Could not remove the item.') : NextResponse.json({ ok: true, retired: used });
      }

      case 'template': {
        const name = str(b.name, 80);
        if (!name) return bad('Give the template a name.');
        const lines = cleanLines(b.lines, await itemsOf());
        if (typeof lines === 'string') return bad(lines);
        let gradeId: string | null = null;
        if (b.gradeId) {
          const { data: g } = isUuid(b.gradeId) ? await db.from('hr_grades').select('id').eq('id', b.gradeId).eq('school_id', school).maybeSingle() : { data: null };
          if (!g) return bad('That grade isn\'t in this school.');
          gradeId = g.id;
        }
        const row = { name, grade_id: gradeId, lines: lines.map(l => ({ item_id: l.itemId, value: l.value })), active: b.active !== false, updated_by: admin.id };
        const { data, error } = b.id && isUuid(b.id)
          ? await db.from('salary_templates').update(row).eq('id', b.id).eq('school_id', school).select('id').maybeSingle()
          : await db.from('salary_templates').insert({ ...row, school_id: school }).select('id').single();
        if (error) return payrollError(error, 'Could not save the template.');
        return data ? NextResponse.json({ ok: true, id: data.id }) : bad('That template is no longer there.', 404);
      }
      case 'template_delete': {
        if (!isUuid(b.id)) return bad('Pick a template.');
        const { error } = await db.from('salary_templates').delete().eq('id', b.id).eq('school_id', school);
        return error ? payrollError(error, 'Could not remove the template.') : NextResponse.json({ ok: true });
      }

      case 'salary': {
        const m = await member(b.id);
        if (!m) return bad('That employee isn\'t on this school\'s register.', 404);
        const from = day(b.effectiveFrom);
        if (!from) return bad('Pick the date the salary starts.');
        if (m.joined_on && from < m.joined_on) return bad(`That is before ${m.name} joined (${m.joined_on}).`);
        const items = await itemsOf();
        const lines = cleanLines(b.lines, items);
        if (typeof lines === 'string') return bad(lines);
        if (!lines.some(l => items.find(i => i.id === l.itemId)?.kind === 'earning')) return bad('A salary needs at least one earning.');
        const { data: existing } = await db.from('staff_salaries').select('id, effective_from').eq('staff_member_id', m.id).order('effective_from');
        const reason = str(b.reason, 500);
        if (existing?.length && !reason) return bad('Say why the salary is changing (increment, promotion, correction).');
        const templateId = isUuid(b.templateId) ? b.templateId : null;
        const row = { lines: lines.map(l => ({ item_id: l.itemId, value: l.value })), template_id: templateId, reason: reason || null };
        const same = existing?.find(s => s.effective_from === from);
        // A back-dated start is allowed: months already approved stay as paid, and the difference comes as arrears in the next run.
        const { error } = same
          ? await db.from('staff_salaries').update(row).eq('id', same.id)
          : await db.from('staff_salaries').insert({ ...row, school_id: school, staff_member_id: m.id, effective_from: from, created_by: admin.id });
        if (error) return payrollError(error, 'Could not save the salary.');
        const locked = await lockedThrough(m.id);
        return NextResponse.json({ ok: true, arrears: !!locked && from <= locked });
      }
      case 'salary_delete': {
        if (!isUuid(b.salaryId)) return bad('Pick a salary.');
        const { data: s } = await db.from('staff_salaries').select('id, staff_member_id, effective_from').eq('id', b.salaryId).eq('school_id', school).maybeSingle();
        if (!s) return bad('That salary is no longer there.', 404);
        const locked = await lockedThrough(s.staff_member_id);
        if (locked && s.effective_from <= locked) return bad('An approved pay run used that salary, so it stays on record. Add a new dated salary to change their pay.');
        const { error } = await db.from('staff_salaries').delete().eq('id', s.id);
        return error ? payrollError(error, 'Could not remove the salary.') : NextResponse.json({ ok: true });
      }

      case 'pay_setting': {
        const m = await member(b.id);
        if (!m) return bad('That employee isn\'t on this school\'s register.', 404);
        const vpf = Number(b.vpfPct) || 0;
        if (vpf < 0 || vpf > 88) return bad('Voluntary PF is between 0 and 88 percent.');
        const hold = !!b.onHold, why = str(b.holdReason, 300);
        if (hold && !why) return bad('Say why their pay is on hold.');
        const { error } = await db.from('staff_pay_settings').upsert({
          staff_member_id: m.id, school_id: school, tax_regime: b.taxRegime === 'old' ? 'old' : 'new',
          pf_mode: ['policy', 'exempt', 'capped', 'full'].includes(b.pfMode) ? b.pfMode : 'policy', vpf_pct: vpf, esi_exempt: !!b.esiExempt, pt_exempt: !!b.ptExempt,
          tds_exempt: !!b.tdsExempt, pay_mode: ['bank', 'cash', 'cheque'].includes(b.payMode) ? b.payMode : 'bank', on_hold: hold, hold_reason: hold ? why : null, updated_by: admin.id,
        }, { onConflict: 'staff_member_id' });
        return error ? payrollError(error, 'Could not save.') : NextResponse.json({ ok: true });
      }

      case 'adjustment': {
        const m = await member(b.id);
        if (!m) return bad('That employee isn\'t on this school\'s register.', 404);
        const month = day(typeof b.month === 'string' ? `${b.month.slice(0, 7)}-01` : null);
        if (!month) return bad('Pick the month.');
        const { data: run } = await db.from('pay_runs').select('status').eq('school_id', school).eq('kind', 'regular').eq('month', month).maybeSingle();
        if (run && run.status !== 'draft') return bad(`The run for ${month.slice(0, 7)} is ${run.status === 'approved' ? 'approved' : 'awaiting approval'}. Put this in the next month, or have the run sent back first.`);
        const amount = money(b.amount);
        if (amount === null) return bad('Give the amount in rupees.');
        const note = str(b.note, 500);
        if (!note) return bad('Add a note saying what this is for.');
        const mode = b.mode === 'override' ? 'override' : 'add';
        let item: PayItem | undefined;
        if (b.itemId) { item = (await itemsOf()).find(i => i.id === b.itemId); if (!item) return bad('That pay item isn\'t in this school.'); }
        if (mode === 'override' && !item) return bad('Pick the item to override.');
        const kind = item ? item.kind : b.kind === 'deduction' ? 'deduction' : 'earning';
        const label = str(b.label, 80) || item?.name || '';
        if (!label) return bad('Give it a label for the payslip.');
        if (mode === 'add' && !amount) return bad('The amount can\'t be zero.');
        const { error } = await db.from('pay_adjustments').insert({
          school_id: school, staff_member_id: m.id, month, mode, item_id: item?.id ?? null, kind, label, amount, taxable: kind === 'earning' ? (item ? item.taxable : b.taxable !== false) : false, note, created_by: admin.id,
        });
        return error ? payrollError(error, 'Could not save the adjustment.') : NextResponse.json({ ok: true, recompute: !!run });
      }
      case 'adjustment_delete': {
        if (!isUuid(b.adjustmentId)) return bad('Pick an adjustment.');
        const { data: a } = await db.from('pay_adjustments').select('id, month').eq('id', b.adjustmentId).eq('school_id', school).maybeSingle();
        if (!a) return bad('That adjustment is no longer there.', 404);
        const { data: run } = await db.from('pay_runs').select('status').eq('school_id', school).eq('kind', 'regular').eq('month', a.month).maybeSingle();
        if (run && run.status !== 'draft') return bad('That month\'s run is no longer a draft, so its adjustments stay as they are.');
        const { error } = await db.from('pay_adjustments').delete().eq('id', a.id);
        return error ? payrollError(error, 'Could not remove the adjustment.') : NextResponse.json({ ok: true });
      }

      case 'loan': {
        const m = await member(b.id);
        if (!m) return bad('That employee isn\'t on this school\'s register.', 404);
        const principal = money(b.principal), instalment = money(b.instalment);
        if (!principal) return bad('Give the amount lent.');
        if (!instalment || instalment > principal) return bad('The monthly instalment must be more than zero and no more than the amount.');
        const issued = day(b.issuedOn) ?? today;
        const start = day(typeof b.startMonth === 'string' ? `${b.startMonth.slice(0, 7)}-01` : null);
        if (!start) return bad('Pick the month recovery starts.');
        if (start < monthStart(issued)) return bad('Recovery can\'t start before the money was given.');
        const { error } = await db.from('staff_loans').insert({
          school_id: school, staff_member_id: m.id, kind: b.kind === 'loan' ? 'loan' : 'advance', principal, issued_on: issued, instalment, start_month: start, note: str(b.note, 500) || null, created_by: admin.id,
        });
        return error ? payrollError(error, 'Could not record it.') : NextResponse.json({ ok: true });
      }
      case 'loan_close': {
        if (!isUuid(b.loanId)) return bad('Pick an advance or loan.');
        const note = str(b.note, 500);
        if (!note) return bad('Say why it is being closed (repaid outside payroll, or written off).');
        const { data, error } = await db.from('staff_loans').update({ status: b.writeOff ? 'written_off' : 'closed', closed_at: now(), note }).eq('id', b.loanId).eq('school_id', school).eq('status', 'open').select('id').maybeSingle();
        if (error) return payrollError(error, 'Could not close it.');
        return data ? NextResponse.json({ ok: true }) : bad('That one is already closed.', 409);
      }

      case 'declaration': {
        const m = await member(b.id);
        if (!m) return bad('That employee isn\'t on this school\'s register.', 404);
        if (typeof b.fy !== 'string' || !/^\d{4}-\d{2}$/.test(b.fy)) return bad('Pick the financial year.');
        const items: Record<string, number | boolean> = {};
        for (const k of ['c80', 'd80', 'rent_annual', 'home_loan_interest', 'nps_80ccd1b', 'other_income', 'prev_income', 'prev_tds']) {
          const v = b.items?.[k];
          if (v === undefined || v === null || v === '') continue;
          const n = money(v);
          if (n === null) return bad('Declaration amounts are rupees for the year.');
          if (n) items[k] = n;
        }
        if (b.items?.metro) items.metro = true;
        const verified = !!b.proofsVerified;
        const { error } = await db.from('tax_declarations').upsert({
          school_id: school, staff_member_id: m.id, fy: b.fy, items, proofs_verified: verified, verified_by: verified ? admin.id : null, verified_at: verified ? now() : null, updated_by: admin.id, updated_at: now(),
        }, { onConflict: 'staff_member_id,fy' });
        return error ? payrollError(error, 'Could not save the declaration.') : NextResponse.json({ ok: true });
      }

      case 'rate_override':
      case 'rate_override_delete': {
        // A school's own rate changes what everyone is paid, so it needs the approver as well as the preparer's role.
        const no = deny(admin, 'payroll.approve');
        if (no) return no;
        if (typeof b.key !== 'string' || !/^(pf|esi|bonus|gratuity|it:(new|old)|pt:[A-Z]{2})$/.test(b.key)) return bad('Unknown rate.');
        const from = day(b.effectiveFrom);
        if (!from) return bad('Pick the date it applies from.');
        if (b.action === 'rate_override_delete') {
          const { error } = await db.from('statutory_overrides').delete().eq('school_id', school).eq('key', b.key).eq('effective_from', from);
          return error ? payrollError(error, 'Could not remove the override.') : NextResponse.json({ ok: true });
        }
        const locked = await lockedThrough();
        if (locked && from <= locked) return bad(`Pay is approved up to ${locked}. A rate can change only from a later date.`);
        const reason = str(b.reason, 500);
        if (!reason) return bad('Say why the school is using its own rate.');
        let value = cleanRate(b.key, b.value);
        if (typeof value === 'string') return bad(value);
        if (b.key.startsWith('it:')) {
          const { data: base } = await db.from('statutory_rates').select('value').eq('key', b.key).lte('effective_from', from).order('effective_from', { ascending: false }).limit(1).maybeSingle();
          const keep = (base?.value ?? {}) as Record<string, unknown>;
          value = { ...value, ...Object.fromEntries(['surcharge', 'caps', 'senior_exemption', 'super_senior_exemption'].filter(k => keep[k] !== undefined).map(k => [k, keep[k]])) };
        }
        const { error } = await db.from('statutory_overrides').upsert({ school_id: school, key: b.key, effective_from: from, value, reason, created_by: admin.id }, { onConflict: 'school_id,key,effective_from' });
        return error ? payrollError(error, 'Could not save the override.') : NextResponse.json({ ok: true });
      }

      default:
        return bad('Unknown action.');
    }
  } catch (e: any) {
    return payrollError(e, 'Something went wrong. Try again.');
  }
}

/** A rate table as a school may set it: the same shape as Sthara's, with every figure checked. */
function cleanRate(key: string, v: any): Record<string, unknown> | string {
  if (!v || typeof v !== 'object') return 'Give the rate.';
  const num = (x: unknown, lo: number, hi: number) => (typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : null);
  const pick = (fields: [string, number, number][]) => {
    const out: Record<string, number> = {};
    for (const [f, lo, hi] of fields) { const n = num(v[f], lo, hi); if (n === null) return `Check ${f.replace(/_/g, ' ')}.`; out[f] = n; }
    return out;
  };
  const slabs = (field: 'pct' | 'amount', hi: number) => {
    if (!Array.isArray(v.slabs) || !v.slabs.length || v.slabs.length > 12) return 'Add the slabs.';
    const out: Record<string, number | null>[] = [];
    let last = -1;
    for (const [i, s] of v.slabs.entries()) {
      const top = i === v.slabs.length - 1;
      const upto = top ? null : num(s?.upto, 0, 1e9), val = num(s?.[field], 0, hi);
      if ((!top && upto === null) || val === null) return 'Check the slab figures. The last slab has no upper limit.';
      if (upto !== null && upto <= last) return 'Slabs must go upwards.';
      if (upto !== null) last = upto;
      out.push({ upto, [field]: val });
    }
    return out;
  };
  if (key === 'pf') return pick([['employee_pct', 0, 100], ['employer_pct', 0, 100], ['eps_pct', 0, 100], ['ceiling', 0, 1e7], ['admin_pct', 0, 10], ['edli_pct', 0, 10]]);
  if (key === 'esi') return pick([['employee_pct', 0, 100], ['employer_pct', 0, 100], ['ceiling', 0, 1e7]]);
  if (key === 'bonus') return pick([['pct', 0, 100], ['wage_ceiling', 0, 1e7], ['calc_ceiling', 0, 1e7]]);
  if (key === 'gratuity') return pick([['min_years', 0, 60], ['days', 1, 31], ['divisor', 1, 31], ['cap', 0, 1e9]]);
  if (key.startsWith('pt:')) {
    const s = slabs('amount', 5000);
    if (typeof s === 'string') return s;
    const feb = v.february_amount === undefined || v.february_amount === null ? null : num(v.february_amount, 0, 5000);
    return { slabs: s, ...(feb ? { february_amount: feb } : {}) };
  }
  const s = slabs('pct', 100);
  if (typeof s === 'string') return s;
  const base = pick([['standard_deduction', 0, 1e7], ['rebate_income', 0, 1e9], ['rebate_max', 0, 1e7], ['cess_pct', 0, 100]]);
  if (typeof base === 'string') return base;
  // Surcharge tiers, age exemptions and deduction caps aren't a school's to set: the caller copies Sthara's in.
  return { ...base, slabs: s, marginal_relief: !!v.marginal_relief };
}
