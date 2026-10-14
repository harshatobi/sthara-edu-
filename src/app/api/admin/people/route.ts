import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bad, deny, isUuid, requireAdmin, str, type SchoolAdmin } from '@/lib/admin/serverAuth';
import { toE164 } from '@/lib/whatsapp/config';
import { holdersOf } from '@/lib/schedule/notify';
import {
  DEFAULT_EXIT_CHECKLIST, EXIT_KINDS, JOB_ACTIONS, addMonths, cleanProfile, cleanStatutory, day, maskStatutory, recordGaps,
  type ChecklistItem, type JobAction,
} from '@/lib/hr/engine';
import {
  cleanJob, hrError, loadPeople, loadSettings, moveHire, recordView, schoolToday, toDepartment, toDoc, toExit, toGrade, toJob, toPost,
} from '@/lib/hr/server';

export const dynamic = 'force-dynamic';

/**
 * The employee master.
 *
 *   GET                 the directory and the school's structure (workforce.read or hr.manage). People who only
 *                       hold workforce.read get names, roles and departments; hr.manage adds lifecycle, exits,
 *                       expiring documents and upcoming job changes; hr.sensitive adds what each record lacks.
 *   GET ?id=            one employee's record (hr.manage): job history, lifecycle, qualifications, documents;
 *                       with hr.sensitive also personal details and statutory details with numbers masked.
 *   POST { action }     hr.manage unless noted:
 *     hire              { name, category, designation, departmentId, gradeId, managerId, employment, contractFrom,
 *                         contractTo, joinedOn, phone, wingId, employeeCode? (blank issues the next code), probationMonths }
 *     basics            { id, name?, phone, employeeCode, issueCode?, joinedOn }
 *     job               { id, effectiveFrom, kind, reason, authority, ...job fields }     a dated job change
 *     job_delete        { jobId }                              undo a future-dated or the latest change
 *     probation         { id, op: 'set' | 'confirm', until?, on?, note }
 *     exit_start        { id, kind, noticeOn, lastDay, reason }
 *     exit_check        { exitId, key, done }
 *     exit_withdraw     { exitId, note }
 *     exit_complete     { exitId, reportsTo? }                 on or after the last day; flags the login for removal.
 *                                                              With direct reports, reportsTo (an employee id, or null for
 *                                                              nobody) says who they move to
 *     link_login        { id, userId }                         someone with no login was given one: join the two
 *     rehire            { id, on }
 *     issue_codes       {}                                     gives every active employee without a code the next one
 *     profile           { id, ...personal fields }             hr.sensitive
 *     statutory         { id, ...statutory fields }            hr.sensitive
 *     reveal            { id }                                 hr.sensitive; unmasked statutory details, audited
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ['workforce.read', 'hr.manage']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const manage = admin.access.can('hr.manage'), sensitive = admin.access.can('hr.sensitive');
  const today = schoolToday();

  // Job changes dated up to today take effect on the register before anything is read.
  const sync = await db.rpc('hr_sync_jobs', { p_school: admin.schoolId });
  if (sync.error) return hrError(sync.error, 'Could not load the employee master.');

  const id = req.nextUrl.searchParams.get('id');
  try {
    if (id) return await detail(db, admin, id, { manage, sensitive, today });
    const [people, settings, depts, grades, posts] = await Promise.all([
      loadPeople(db, admin.schoolId), loadSettings(db, admin.schoolId),
      db.from('hr_departments').select('*').eq('school_id', admin.schoolId).order('name'),
      db.from('hr_grades').select('*').eq('school_id', admin.schoolId).order('sort').order('name'),
      db.from('hr_posts').select('*').eq('school_id', admin.schoolId),
    ]);
    const base = {
      can: { manage, sensitive }, today, settings, people,
      departments: (depts.data || []).map(toDepartment), grades: (grades.data || []).map(g => toGrade(g, sensitive)), posts: (posts.data || []).map(toPost),
    };
    if (!manage) {
      // Without hr.manage: no lifecycle dates, no phone numbers beyond what the staff register already shows them.
      return NextResponse.json({ ...base, people: people.map(p => ({ ...p, probationUntil: null, confirmedOn: null, exitOn: null })), exits: [], documents: [], upcoming: [], gaps: {} });
    }
    const [exits, docs, upcoming, profiles, statutory] = await Promise.all([
      db.from('staff_exits').select('*').eq('school_id', admin.schoolId).in('status', ['notice', 'completed']).order('last_day', { ascending: false }).limit(500),
      db.from('staff_documents').select('id, staff_member_id, kind, title, issued_on, expires_on, storage_path, file_name, created_at').eq('school_id', admin.schoolId).not('expires_on', 'is', null),
      db.from('staff_jobs').select('*').eq('school_id', admin.schoolId).gt('effective_from', today).order('effective_from'),
      sensitive ? db.from('staff_profiles').select('staff_member_id, date_of_birth, emergency_phone').eq('school_id', admin.schoolId) : Promise.resolve({ data: [] as any[] }),
      sensitive ? db.from('staff_statutory').select('staff_member_id, pan, bank_account').eq('school_id', admin.schoolId) : Promise.resolve({ data: [] as any[] }),
    ]);
    const gaps: Record<string, string[]> = {};
    if (sensitive) {
      const prof = new Map((profiles.data || []).map(r => [r.staff_member_id, r])), stat = new Map((statutory.data || []).map(r => [r.staff_member_id, r]));
      for (const p of people) if (p.active) { const g = recordGaps(p, prof.get(p.id) ?? null, stat.get(p.id) ?? null); if (g.length) gaps[p.id] = g; }
    }
    return NextResponse.json({ ...base, exits: (exits.data || []).map(toExit), documents: (docs.data || []).map(toDoc), upcoming: (upcoming.data || []).map(toJob), gaps });
  } catch (e: any) {
    return hrError(e, 'Could not load the employee master.');
  }
}

async function detail(db: SupabaseClient, admin: SchoolAdmin, id: string, o: { manage: boolean; sensitive: boolean; today: string }) {
  if (!o.manage) return deny(admin, 'hr.manage')!;
  if (!isUuid(id)) return bad('Unknown employee.', 404);
  const people = await loadPeople(db, admin.schoolId);
  const person = people.find(p => p.id === id);
  if (!person) return bad('That employee isn\'t on this school\'s register.', 404);
  const [jobs, events, exits, quals, docs, profile, statutory] = await Promise.all([
    db.from('staff_jobs').select('*').eq('staff_member_id', id).order('effective_from'),
    db.from('staff_events').select('id, kind, on_date, note, meta, created_at').eq('staff_member_id', id).order('on_date').order('created_at'),
    db.from('staff_exits').select('*').eq('staff_member_id', id).order('created_at', { ascending: false }),
    db.from('staff_qualifications').select('*').eq('staff_member_id', id).order('year', { ascending: false, nullsFirst: false }),
    db.from('staff_documents').select('id, staff_member_id, kind, title, issued_on, expires_on, storage_path, file_name, created_at').eq('staff_member_id', id).order('created_at', { ascending: false }),
    o.sensitive ? db.from('staff_profiles').select('*').eq('staff_member_id', id).maybeSingle() : Promise.resolve({ data: null }),
    o.sensitive ? db.from('staff_statutory').select('*').eq('staff_member_id', id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return NextResponse.json({
    person, today: o.today, can: { manage: o.manage, sensitive: o.sensitive },
    jobs: (jobs.data || []).map(toJob),
    events: (events.data || []).map(e => ({ id: e.id, kind: e.kind, onDate: e.on_date, note: e.note })),
    exits: (exits.data || []).map(toExit),
    qualifications: (quals.data || []).map(q => ({
      id: q.id, kind: q.kind, title: q.title, institution: q.institution, year: q.year, result: q.result, verifiedOn: q.verified_on, documentId: q.document_id,
    })),
    documents: (docs.data || []).map(toDoc),
    reports: people.filter(p => p.managerId === id && p.active).map(p => p.id),
    profile: o.sensitive ? profile.data ?? null : undefined,
    // Numbers stay masked until someone asks to see them (the "reveal" action, which is audited).
    statutory: o.sensitive ? maskStatutory(statutory.data as any) : undefined,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'hr.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || typeof b.action !== 'string') return bad('Invalid request.');
  const today = schoolToday();
  const school = admin.schoolId;
  const now = () => new Date().toISOString();
  const event = (memberId: string, kind: string, onDate: string, note: string | null, meta: Record<string, unknown> = {}) =>
    db.from('staff_events').insert({ school_id: school, staff_member_id: memberId, kind, on_date: onDate, note, meta, created_by: admin.id });
  /** The employee an action is about, from this school only. */
  const member = async (id: unknown) => {
    if (!isUuid(id)) return null;
    const { data } = await db.from('staff_members').select('*').eq('id', id).eq('school_id', school).maybeSingle();
    return data;
  };
  const structure = async () => {
    const [people, d, g] = await Promise.all([
      loadPeople(db, school),
      db.from('hr_departments').select('id').eq('school_id', school).eq('active', true),
      db.from('hr_grades').select('id').eq('school_id', school).eq('active', true),
    ]);
    return { people, departmentIds: new Set((d.data || []).map(r => r.id as string)), gradeIds: new Set((g.data || []).map(r => r.id as string)) };
  };

  try {
    switch (b.action) {
      case 'hire': {
        const name = str(b.name, 120);
        if (!name) return bad('Give their name.');
        const ctx = await structure();
        const job = cleanJob(b, { id: null, ...ctx });
        if (typeof job === 'string') return bad(job);
        const joined = b.joinedOn ? day(b.joinedOn) : today;
        if (!joined) return bad('Pick the joining date.');
        const phone = b.phone ? toE164(String(b.phone)) : null;
        if (b.phone && !phone) return bad('That mobile number doesn\'t look right. Use a 10-digit mobile or +country code.');
        const wingId = isUuid(b.wingId) ? b.wingId : null;
        if (wingId) {
          const { data: w } = await db.from('sched_wings').select('id').eq('id', wingId).eq('school_id', school).maybeSingle();
          if (!w) return bad('Unknown wing.');
        }
        const settings = await loadSettings(db, school);
        const months = Number.isInteger(b.probationMonths) ? Math.min(36, Math.max(0, b.probationMonths)) : settings.probationMonths;
        let code = str(b.employeeCode, 40) || null;
        if (!code) {
          const r = await db.rpc('hr_next_employee_code', { p_school: school });
          if (r.error) return hrError(r.error, 'Could not issue an employee code.');
          code = r.data as string;
        }
        const probationUntil = job.employment === 'permanent' && months > 0 ? addMonths(joined, months) : null;
        const { data, error } = await db.from('staff_members').insert({
          school_id: school, name, ...job, wing_id: wingId, phone_e164: phone, employee_code: code, joined_on: joined, active: true,
          probation_until: probationUntil, created_by: admin.id,
        }).select('id').single();
        if (error) return hrError(error, 'Could not add the employee.');
        if (probationUntil) await event(data.id, 'probation_set', joined, null, { until: probationUntil });
        return NextResponse.json({ ok: true, id: data.id, employeeCode: code });
      }

      case 'basics': {
        const m = await member(b.id);
        if (!m) return bad('That employee isn\'t on this school\'s register.', 404);
        const phone = b.phone ? toE164(String(b.phone)) : null;
        if (b.phone && !phone) return bad('That mobile number doesn\'t look right. Use a 10-digit mobile or +country code.');
        const joined = b.joinedOn ? day(b.joinedOn) : null;
        if (b.joinedOn && !joined) return bad('Pick the joining date.');
        let code = str(b.employeeCode, 40) || null;
        if (!code && b.issueCode) {
          const r = await db.rpc('hr_next_employee_code', { p_school: school });
          if (r.error) return hrError(r.error, 'Could not issue an employee code.');
          code = r.data as string;
        }
        // The wing and WhatsApp consent stay with the schedule's staff register; a number that goes takes the consent with it.
        const row: Record<string, unknown> = { phone_e164: phone, employee_code: code, joined_on: joined, updated_at: now() };
        if (!phone) row.whatsapp_opt_in = false;
        // People with a login are renamed in the user directory, so the two never disagree.
        if (!m.user_id) { const name = str(b.name, 120); if (!name) return bad('Give their name.'); row.name = name; }
        const { error } = await db.from('staff_members').update(row).eq('id', m.id);
        if (error) return hrError(error, 'Could not save.');
        if (joined && joined !== m.joined_on) await moveHire(db, m.id, joined, today);
        return NextResponse.json({ ok: true, employeeCode: code });
      }

      case 'job': {
        const m = await member(b.id);
        if (!m) return bad('That employee isn\'t on this school\'s register.', 404);
        if (!m.active) return bad(`${m.name} has left the school. Record them as rejoined first.`);
        const from = day(b.effectiveFrom);
        if (!from) return bad('Pick the date the change takes effect.');
        const action: JobAction | null = typeof b.kind === 'string' && b.kind in JOB_ACTIONS && b.kind !== 'hire' && b.kind !== 'rehire' ? b.kind : null;
        if (!action) return bad('Pick what kind of change this is.');
        const reason = str(b.reason, 500);
        if (!reason) return bad('Say why, for the record.');
        const job = cleanJob(b, { id: m.id, ...(await structure()) });
        if (typeof job === 'string') return bad(job);
        const { data: jobs } = await db.from('staff_jobs').select('id, action, effective_from, contract_to').eq('staff_member_id', m.id).order('effective_from');
        const first = jobs?.[0];
        if (first && from < first.effective_from) return bad(`That is before ${m.name} joined (${first.effective_from}). Correct the joining date first.`);
        if (action === 'renewal') {
          if (job.employment === 'permanent') return bad('A renewal is for contract and visiting staff. Use "Change of employment" to make someone permanent.');
          const current = [...(jobs || [])].reverse().find(j => j.effective_from <= from);
          if (current?.contract_to && job.contract_to! <= current.contract_to) return bad(`The new end date must be after the current one (${current.contract_to}).`);
        }
        const same = (jobs || []).find(j => j.effective_from === from);
        const row = { ...job, reason, authority: str(b.authority, 120) || null };
        const { error } = same
          // A second change on a day replaces the first; a correction keeps what the day's row originally was.
          ? await db.from('staff_jobs').update({ ...row, action: action === 'correction' ? same.action : action }).eq('id', same.id)
          : await db.from('staff_jobs').insert({ ...row, school_id: school, staff_member_id: m.id, effective_from: from, action, created_by: admin.id });
        if (error) return hrError(error, 'Could not save the change.');
        return NextResponse.json({ ok: true, inForce: from <= today });
      }

      case 'job_delete': {
        if (!isUuid(b.jobId)) return bad('Pick a job change.');
        const { data: j } = await db.from('staff_jobs').select('id, staff_member_id, effective_from').eq('id', b.jobId).eq('school_id', school).maybeSingle();
        if (!j) return bad('That change is no longer there.', 404);
        const { data: jobs } = await db.from('staff_jobs').select('id, effective_from').eq('staff_member_id', j.staff_member_id).order('effective_from');
        if (jobs![0].id === j.id) return bad('The first entry is when they joined and can\'t be removed. Correct it instead.');
        if (j.effective_from <= today && jobs![jobs!.length - 1].id !== j.id && jobs!.some(x => x.effective_from > j.effective_from && x.effective_from <= today)) {
          return bad('Only the latest change, or one that hasn\'t taken effect yet, can be removed. Record a correction instead.');
        }
        const { error } = await db.from('staff_jobs').delete().eq('id', j.id);
        return error ? hrError(error, 'Could not remove the change.') : NextResponse.json({ ok: true });
      }

      case 'probation': {
        const m = await member(b.id);
        if (!m) return bad('That employee isn\'t on this school\'s register.', 404);
        if (!m.active) return bad(`${m.name} has left the school.`);
        const note = str(b.note, 1000) || null;
        if (b.op === 'confirm') {
          const on = b.on ? day(b.on) : today;
          if (!on || on > today) return bad('Pick the confirmation date (today or earlier).');
          if (m.joined_on && on < m.joined_on) return bad('They can\'t be confirmed before they joined.');
          const { error } = await db.from('staff_members').update({ confirmed_on: on, updated_at: now() }).eq('id', m.id);
          if (error) return hrError(error, 'Could not confirm.');
          await event(m.id, 'confirmed', on, note);
          return NextResponse.json({ ok: true });
        }
        if (b.op === 'set') {
          const until = day(b.until);
          if (!until) return bad('Pick the date the probation ends.');
          if (m.joined_on && until <= m.joined_on) return bad('Probation must end after the joining date.');
          const extended = !!m.probation_until && until > m.probation_until;
          if (extended && !note) return bad('Say why the probation is being extended.');
          const { error } = await db.from('staff_members').update({ probation_until: until, confirmed_on: null, updated_at: now() }).eq('id', m.id);
          if (error) return hrError(error, 'Could not save the probation.');
          await event(m.id, extended ? 'probation_extended' : 'probation_set', today, note, { until, was: m.probation_until });
          return NextResponse.json({ ok: true });
        }
        return bad('Confirm, or set a probation end date.');
      }

      case 'exit_start': {
        const m = await member(b.id);
        if (!m) return bad('That employee isn\'t on this school\'s register.', 404);
        if (!m.active) return bad(`${m.name} has already left the school.`);
        if (!(b.kind in EXIT_KINDS)) return bad('Pick the kind of exit.');
        const noticeOn = day(b.noticeOn), lastDay = day(b.lastDay);
        if (!noticeOn || !lastDay) return bad('Pick the notice date and the last working day.');
        if (noticeOn > today) return bad('The notice date can\'t be in the future.');
        if (lastDay < noticeOn) return bad('The last working day can\'t be before the notice date.');
        const reason = str(b.reason, 1000) || null;
        if (b.kind === 'termination' && !reason) return bad('A termination needs its reason on record.');
        const { data, error } = await db.from('staff_exits').insert({
          school_id: school, staff_member_id: m.id, kind: b.kind, notice_on: noticeOn, last_day: lastDay, reason,
          checklist: DEFAULT_EXIT_CHECKLIST, created_by: admin.id,
        }).select('id').single();
        if (error) return hrError(error, 'Could not start the exit.');
        const { error: exitOnErr } = await db.from('staff_members').update({ exit_on: lastDay, updated_at: now() }).eq('id', m.id);
        if (exitOnErr) return hrError(exitOnErr, 'The exit is started, but the last day did not reach the register. Try again.');
        await event(m.id, 'exit_started', noticeOn, reason, { kind: b.kind, lastDay });
        return NextResponse.json({ ok: true, id: data.id });
      }

      case 'exit_check':
      case 'exit_withdraw':
      case 'exit_complete': {
        if (!isUuid(b.exitId)) return bad('Pick an exit.');
        const { data: x } = await db.from('staff_exits').select('*').eq('id', b.exitId).eq('school_id', school).maybeSingle();
        if (!x) return bad('That exit is no longer there.', 404);
        if (x.status !== 'notice') return bad(`That exit is already ${x.status}.`, 409);
        const m = await member(x.staff_member_id);
        if (!m) return bad('That employee isn\'t on this school\'s register.', 404);
        if (b.action === 'exit_check') {
          const list: ChecklistItem[] = (x.checklist as ChecklistItem[]).map(c => (c.key === b.key ? { ...c, done: !!b.done, by: b.done ? admin.name : null, at: b.done ? now() : null } : c));
          const { error } = await db.from('staff_exits').update({ checklist: list }).eq('id', x.id);
          return error ? hrError(error, 'Could not update the checklist.') : NextResponse.json({ ok: true });
        }
        if (b.action === 'exit_withdraw') {
          const note = str(b.note, 1000);
          if (!note) return bad('Say why the exit is being withdrawn.');
          const { error } = await db.from('staff_exits').update({ status: 'withdrawn', closed_by: admin.id, closed_at: now() }).eq('id', x.id);
          if (error) return hrError(error, 'Could not withdraw the exit.');
          await db.from('staff_members').update({ exit_on: null, updated_at: now() }).eq('id', m.id);
          await event(m.id, 'exit_withdrawn', today, note);
          return NextResponse.json({ ok: true });
        }
        if (x.last_day > today) return bad(`${m.name}'s last working day is ${x.last_day}. Close the exit on or after that day, or change the date by withdrawing and starting again.`);
        const { data: reports } = await db.from('staff_members').select('id').eq('school_id', school).eq('manager_id', m.id).eq('active', true);
        if (reports?.length) {
          if (b.reportsTo === undefined) return bad(`${reports.length} ${reports.length === 1 ? 'person reports' : 'people report'} to ${m.name}. Pick who they report to now.`);
          const to = b.reportsTo === null ? null : isUuid(b.reportsTo) && b.reportsTo !== m.id ? b.reportsTo : undefined;
          if (to === undefined) return bad('Pick someone else on the register as the new manager.');
          const moved = await db.rpc('hr_reassign_reports', { p_school: school, p_from: m.id, p_to: to, p_on: today, p_reason: `${m.name} left the school`, p_by: admin.id });
          if (moved.error) return hrError(moved.error, 'Could not move their reports.');
        }
        const flag = m.user_id ? now() : null;
        const { error } = await db.from('staff_exits').update({ status: 'completed', closed_by: admin.id, closed_at: now(), login_flagged_at: flag }).eq('id', x.id);
        if (error) return hrError(error, 'Could not close the exit.');
        // The register must show them gone, or payroll and rosters keep counting them.
        const { error: offErr } = await db.from('staff_members').update({ active: false, exit_on: x.last_day, whatsapp_opt_in: false, updated_at: now() }).eq('id', m.id);
        if (offErr) return hrError(offErr, 'The exit is closed, but the register still shows them as working here. Close it again.');
        // A department can't be headed by someone who has gone. Their reports keep the line until HR moves them (People shows it).
        await db.from('hr_departments').update({ head_id: null }).eq('school_id', school).eq('head_id', m.id);
        await event(m.id, 'exited', x.last_day, x.reason, { kind: x.kind });
        if (m.user_id) {
          // The school removes its own logins; whoever can do that is told the account is still live.
          const holders = await holdersOf(db, school, 'people.manage');
          if (holders.length) {
            const { error: nErr } = await db.from('notifications').insert(holders.map(uid => ({
              school_id: school, user_id: uid, type: 'hr', title: `${m.name} has left: remove their login`,
              body: `Their last working day was ${x.last_day}. Their Sthara account still works until it is removed in the user directory, along with any office roles they hold.`,
              metadata: { staffMemberId: m.id, exitId: x.id },
            })));
            if (nErr) console.warn('[hr] exit notification failed:', nErr.message);
          }
        }
        return NextResponse.json({ ok: true, loginFlagged: !!flag });
      }

      case 'rehire': {
        const m = await member(b.id);
        if (!m) return bad('That employee isn\'t on this school\'s register.', 404);
        if (m.active) return bad(`${m.name} is already on the register.`);
        const on = b.on ? day(b.on) : today;
        if (!on || on > today) return bad('Pick the date they rejoined (today or earlier).');
        if (m.exit_on && on <= m.exit_on) return bad(`They left on ${m.exit_on}. The rejoining date must be after that.`);
        if (m.employment !== 'permanent' && (!m.contract_to || m.contract_to < on)) {
          const to = day(b.contractTo);
          if (!to || to < on) return bad('Give the end date of their new contract.');
          m.contract_from = on; m.contract_to = to;
        }
        const { error } = await db.from('staff_jobs').upsert({
          school_id: school, staff_member_id: m.id, effective_from: on, action: 'rehire', designation: m.designation, category: m.category,
          department_id: m.department_id, grade_id: m.grade_id, manager_id: m.manager_id, employment: m.employment,
          contract_from: m.contract_from, contract_to: m.contract_to, reason: str(b.note, 500) || 'Rejoined', created_by: admin.id,
        }, { onConflict: 'staff_member_id,effective_from' });
        if (error) return hrError(error, 'Could not record the rejoining.');
        const { error: backErr } = await db.from('staff_members').update({ active: true, exit_on: null, probation_until: null, confirmed_on: null, updated_at: now() }).eq('id', m.id);
        if (backErr) return hrError(backErr, 'The rejoining is recorded, but the register still shows them as gone. Try again.');
        await event(m.id, 'rehired', on, str(b.note, 1000) || null);
        return NextResponse.json({ ok: true });
      }

      case 'link_login': {
        const m = await member(b.id);
        if (!m) return bad('That employee isn\'t on this school\'s register.', 404);
        if (!isUuid(b.userId)) return bad('Pick the login.');
        const r = await db.rpc('hr_link_login', { p_school: school, p_member: m.id, p_user: b.userId });
        if (r.error) return hrError(r.error, 'Could not link the login. Nothing was changed.');
        return NextResponse.json({ ok: true });
      }

      case 'issue_codes': {
        const { data: rows } = await db.from('staff_members').select('id').eq('school_id', school).eq('active', true).is('employee_code', null).order('joined_on', { nullsFirst: false }).order('created_at');
        let issued = 0;
        for (const r of rows || []) {
          const c = await db.rpc('hr_next_employee_code', { p_school: school });
          if (c.error) return hrError(c.error, 'Could not issue employee codes.');
          const { error } = await db.from('staff_members').update({ employee_code: c.data, updated_at: now() }).eq('id', r.id).is('employee_code', null);
          if (!error) issued++;
        }
        return NextResponse.json({ ok: true, issued });
      }

      case 'profile':
      case 'statutory':
      case 'reveal': {
        const no = deny(admin, 'hr.sensitive');
        if (no) return no;
        const m = await member(b.id);
        if (!m) return bad('That employee isn\'t on this school\'s register.', 404);
        if (b.action === 'reveal') {
          const { data } = await db.from('staff_statutory').select('*').eq('staff_member_id', m.id).maybeSingle();
          await recordView(db, admin, 'staff_statutory', m.id, ['pan', 'uan', 'esi_no', 'bank_account']);
          return NextResponse.json({ statutory: data ?? null });
        }
        const c = b.action === 'profile' ? cleanProfile(b, today) : cleanStatutory(b);
        if ('error' in c) return bad(c.error);
        if (b.action === 'profile' && (c.row as any).date_of_birth && m.joined_on && (c.row as any).date_of_birth >= m.joined_on) return bad('The date of birth is after the joining date.');
        const { error } = await db.from(b.action === 'profile' ? 'staff_profiles' : 'staff_statutory')
          .upsert({ staff_member_id: m.id, school_id: school, ...c.row, updated_by: admin.id, updated_at: now() }, { onConflict: 'staff_member_id' });
        return error ? hrError(error, 'Could not save.') : NextResponse.json({ ok: true });
      }

      default:
        return bad('Unknown action.');
    }
  } catch (e: any) {
    return hrError(e, 'Something went wrong. Try again.');
  }
}
