import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { maskStatutory } from '@/lib/hr/engine';
import { hrError, schoolToday, toDepartment, toDoc, toEmployee, toJob } from '@/lib/hr/server';

export const dynamic = 'force-dynamic';

/**
 * My record: what the school holds about the signed-in teacher or office account. Read-only (HR keeps the
 * record); account and bank numbers come back masked to their last four characters.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  const sync = await db.rpc('hr_sync_jobs', { p_school: staff.schoolId });
  if (sync.error) return hrError(sync.error, 'Could not load your record.');
  const { data: m, error } = await db.from('staff_members').select('*').eq('school_id', staff.schoolId).eq('user_id', staff.id).maybeSingle();
  if (error) return hrError(error, 'Could not load your record.');
  if (!m) return NextResponse.json({ person: null });
  const [u, jobs, events, quals, docs, profile, statutory, depts, grades, mgr] = await Promise.all([
    db.from('users').select('name, email, role').eq('id', staff.id).maybeSingle(),
    db.from('staff_jobs').select('*').eq('staff_member_id', m.id).lte('effective_from', schoolToday()).order('effective_from'),
    db.from('staff_events').select('id, kind, on_date').eq('staff_member_id', m.id).in('kind', ['probation_set', 'probation_extended', 'confirmed', 'rehired']).order('on_date'),
    db.from('staff_qualifications').select('id, kind, title, institution, year, result, verified_on').eq('staff_member_id', m.id).order('year', { ascending: false, nullsFirst: false }),
    db.from('staff_documents').select('id, staff_member_id, kind, title, issued_on, expires_on, storage_path, file_name, created_at').eq('staff_member_id', m.id).order('created_at', { ascending: false }),
    db.from('staff_profiles').select('*').eq('staff_member_id', m.id).maybeSingle(),
    db.from('staff_statutory').select('*').eq('staff_member_id', m.id).maybeSingle(),
    db.from('hr_departments').select('*').eq('school_id', staff.schoolId),
    db.from('hr_grades').select('id, name').eq('school_id', staff.schoolId),
    m.manager_id ? db.from('staff_members').select('id, name').eq('id', m.manager_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return NextResponse.json({
    person: toEmployee(m, u.data), today: schoolToday(),
    // Job history up to today only: a change HR has planned but not announced isn't shown early.
    jobs: (jobs.data || []).map(toJob),
    events: (events.data || []).map(e => ({ id: e.id, kind: e.kind, onDate: e.on_date })),
    qualifications: (quals.data || []).map(q => ({ id: q.id, kind: q.kind, title: q.title, institution: q.institution, year: q.year, result: q.result, verifiedOn: q.verified_on })),
    documents: (docs.data || []).map(toDoc),
    profile: profile.data ?? null, statutory: maskStatutory(statutory.data as any),
    departments: (depts.data || []).map(toDepartment), grades: (grades.data || []).map(g => ({ id: g.id, name: g.name })),
    manager: mgr.data ? { id: mgr.data.id, name: mgr.data.name } : null,
  });
}
