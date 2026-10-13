import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SchoolAdmin } from '@/lib/admin/serverAuth';
import { isUuid, str } from '@/lib/admin/serverAuth';
import { CATEGORIES, DEFAULT_HR_SETTINGS, EMPLOYMENTS, day, managerLoop, type Department, type DocRow, type Employee, type ExitRow, type Grade, type HrSettings, type Job, type Post } from './engine';

export const BUCKET = 'staff-docs';

/** The school's date today (India), the same day the database uses for "in force today". */
export const schoolToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export function toEmployee(m: any, u?: { name: string | null; email: string | null; role: string } | null): Employee {
  return {
    id: m.id, userId: m.user_id ?? null, login: u ? (u.role === 'teacher' ? 'teacher' : 'admin') : null, email: u?.email ?? null,
    // The login's name is the source of truth for people with an account (renames happen in the user directory).
    name: u?.name || m.name, category: m.category, designation: m.designation || '', employment: m.employment || 'permanent',
    contractFrom: m.contract_from ?? null, contractTo: m.contract_to ?? null, departmentId: m.department_id ?? null, gradeId: m.grade_id ?? null,
    managerId: m.manager_id ?? null, wingId: m.wing_id ?? null, phone: m.phone_e164 ?? null, whatsappOptIn: !!m.whatsapp_opt_in,
    employeeCode: m.employee_code ?? null, joinedOn: m.joined_on ?? null, active: !!m.active,
    probationUntil: m.probation_until ?? null, confirmedOn: m.confirmed_on ?? null, exitOn: m.exit_on ?? null,
  };
}
export const toJob = (j: any): Job => ({
  id: j.id, staffMemberId: j.staff_member_id, effectiveFrom: j.effective_from, action: j.action, designation: j.designation || '', category: j.category,
  departmentId: j.department_id ?? null, gradeId: j.grade_id ?? null, managerId: j.manager_id ?? null, employment: j.employment,
  contractFrom: j.contract_from ?? null, contractTo: j.contract_to ?? null, reason: j.reason ?? null, authority: j.authority ?? null, createdAt: j.created_at,
});
export const toDepartment = (d: any): Department => ({ id: d.id, name: d.name, kind: d.kind, headId: d.head_id ?? null, active: !!d.active });
/** Pay bands go only to people allowed to see pay. */
export const toGrade = (g: any, pay: boolean): Grade => ({
  id: g.id, name: g.name, category: g.category ?? null, payMin: pay && g.pay_min !== null ? Number(g.pay_min) : null,
  payMax: pay && g.pay_max !== null ? Number(g.pay_max) : null, sort: g.sort, active: !!g.active,
});
export const toPost = (p: any): Post => ({ id: p.id, departmentId: p.department_id, gradeId: p.grade_id ?? null, sanctioned: p.sanctioned, note: p.note ?? null });
export const toExit = (x: any): ExitRow => ({
  id: x.id, staffMemberId: x.staff_member_id, kind: x.kind, noticeOn: x.notice_on, lastDay: x.last_day, reason: x.reason ?? null,
  checklist: Array.isArray(x.checklist) ? x.checklist : [], status: x.status, loginFlaggedAt: x.login_flagged_at ?? null,
});
export const toDoc = (d: any): DocRow => ({
  id: d.id, staffMemberId: d.staff_member_id, kind: d.kind, title: d.title, issuedOn: d.issued_on ?? null, expiresOn: d.expires_on ?? null,
  hasFile: !!d.storage_path, fileName: d.file_name ?? null, createdAt: d.created_at,
});
export const toSettings = (s: any): HrSettings => (s ? {
  codePrefix: s.code_prefix, codeWidth: s.code_width, codeLastNo: s.code_last_no, probationMonths: s.probation_months, noticeDays: s.notice_days, alertDays: s.alert_days,
} : DEFAULT_HR_SETTINGS);

/** Everyone on the register, with their login's name, email and kind. */
export async function loadPeople(db: SupabaseClient, schoolId: string): Promise<Employee[]> {
  const [{ data: members, error }, { data: users }] = await Promise.all([
    db.from('staff_members').select('*').eq('school_id', schoolId).order('name').limit(5000),
    db.from('users').select('id, name, email, role').eq('school_id', schoolId).in('role', ['teacher', 'admin']).limit(5000),
  ]);
  if (error) throw error;
  const byId = new Map((users || []).map(u => [u.id, u]));
  return (members || []).map(m => toEmployee(m, m.user_id ? byId.get(m.user_id) : null)).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadSettings(db: SupabaseClient, schoolId: string): Promise<HrSettings> {
  const { data } = await db.from('hr_settings').select('*').eq('school_id', schoolId).maybeSingle();
  return toSettings(data);
}

/** Records that someone looked at (or exported) restricted details: who, whose, which fields; never the values. */
export async function recordView(db: SupabaseClient, admin: SchoolAdmin, table: string, rowId: string, fields: string[], action: 'VIEW' | 'EXPORT' = 'VIEW'): Promise<void> {
  const { error } = await db.from('audit_log').insert({
    actor_id: admin.id, actor_role: 'admin', action, table_name: table, row_id: rowId, school_id: admin.schoolId, new_values: { fields },
  });
  if (error) console.error('[hr] audit view failed:', error.message);
}

/** Postgres errors from the employee master's constraints, in words HR can act on. */
export function hrError(e: { code?: string; message?: string } | null, fallback: string): NextResponse {
  const m = e?.message || '';
  if (e?.code === '42P01' || e?.code === 'PGRST205' || e?.code === 'PGRST202') return NextResponse.json({ error: 'The employee master isn\'t in this database yet. It arrives with the employee master migration.' }, { status: 503 });
  if (e?.code === '23505') {
    const msg = /uq_staff_members_code/.test(m) ? 'Another employee has that employee code.'
      : /uq_hr_departments_name/.test(m) ? 'There is already a department with that name.'
      : /uq_hr_grades_name/.test(m) ? 'There is already a grade with that name.'
      : /uq_hr_posts/.test(m) ? 'That department and grade already has a sanctioned post count. Edit it instead.'
      : /uq_staff_exits_open/.test(m) ? 'They already have an exit in progress.'
      : /staff_jobs_staff_member_id_effective_from/.test(m) ? 'There is already a job change on that date.'
      : 'That already exists.';
    return NextResponse.json({ error: msg }, { status: 409 });
  }
  if (e?.code === '23514') return NextResponse.json({ error: 'Some of those values aren\'t allowed. Check the dates and numbers.' }, { status: 400 });
  console.error('[hr]', e?.code, m);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export interface JobFields {
  designation: string; category: Employee['category']; department_id: string | null; grade_id: string | null; manager_id: string | null;
  employment: Employee['employment']; contract_from: string | null; contract_to: string | null;
}
/**
 * The job part of a request, checked against the school's structure and people. `id` is the employee the job is
 * for (null for a new hire), used to refuse a reporting line that loops back to them.
 */
export function cleanJob(b: any, ctx: { id: string | null; people: Employee[]; departmentIds: Set<string>; gradeIds: Set<string> }): JobFields | string {
  const category = CATEGORIES.includes(b?.category) ? b.category : null;
  if (!category) return 'Pick a category.';
  const employment = EMPLOYMENTS.includes(b?.employment) ? b.employment : 'permanent';
  const dept = b?.departmentId ? (isUuid(b.departmentId) && ctx.departmentIds.has(b.departmentId) ? b.departmentId : undefined) : null;
  if (dept === undefined) return 'That department isn\'t in this school.';
  const grade = b?.gradeId ? (isUuid(b.gradeId) && ctx.gradeIds.has(b.gradeId) ? b.gradeId : undefined) : null;
  if (grade === undefined) return 'That grade isn\'t in this school.';
  let manager: string | null = null;
  if (b?.managerId) {
    const m = ctx.people.find(p => p.id === b.managerId);
    if (!m) return 'That manager isn\'t on this school\'s staff.';
    if (!m.active) return `${m.name} has left the school and can't be a reporting manager.`;
    if (m.id === ctx.id) return 'Someone can\'t report to themselves.';
    if (ctx.id && managerLoop(ctx.people, ctx.id, m.id)) return `${m.name} already reports up to this person, so that would make a loop.`;
    manager = m.id;
  }
  let from: string | null = null, to: string | null = null;
  if (employment !== 'permanent') {
    from = b?.contractFrom ? day(b.contractFrom) : null;
    to = b?.contractTo ? day(b.contractTo) : null;
    if (b?.contractFrom && !from) return 'Pick the contract start date.';
    if (!to) return `A ${employment} member of staff needs an end date for their contract.`;
    if (from && to < from) return 'The contract must end after it starts.';
  }
  return { designation: str(b?.designation, 80), category, department_id: dept, grade_id: grade, manager_id: manager, employment, contract_from: from, contract_to: to };
}

/**
 * A corrected joining date moves the start of someone's history, as long as nothing else happened before it.
 * Returns whether the history moved.
 */
export async function moveHire(db: SupabaseClient, memberId: string, joined: string, today: string): Promise<boolean> {
  if (joined > today) return false;
  const { data: jobs } = await db.from('staff_jobs').select('id, action, effective_from').eq('staff_member_id', memberId).order('effective_from').limit(2);
  const first = jobs?.[0];
  if (!first || first.action !== 'hire' || first.effective_from === joined || (jobs![1] && joined >= jobs![1].effective_from)) return false;
  const { error } = await db.from('staff_jobs').update({ effective_from: joined }).eq('id', first.id);
  return !error;
}
