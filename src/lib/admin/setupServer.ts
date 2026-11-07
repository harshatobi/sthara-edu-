import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { activeGrants } from './rbac';
import { isoDay } from './format';
import { currentSession, nextSessionOf, sessionSettings } from '@/lib/students/register';
import type { SetupCounts } from './setup';

/** Head counts for the setup checklist (lib/admin/setup.ts), one school; never row data. */
export async function setupCounts(db: SupabaseClient, schoolId: string): Promise<SetupCounts> {
  const { data: school } = await db.from('schools').select('settings').eq('id', schoolId).maybeSingle();
  const settings = (school?.settings as Record<string, unknown>) || {};
  const session = currentSession(settings);
  const count = async (table: string, f: (q: any) => any = q => q) => {
    const { count: c, error } = await f(db.from(table).select('*', { count: 'exact', head: true }).eq('school_id', schoolId));
    return error ? 0 : c ?? 0;
  };
  const [grants, teachers, studentLogins, parentLogins, loginRequests, students, classSubjects, studentSubjects, events, bells, rooms, tt, schemes,
    fees, stages, seats, salary, payItems, leave, cert, houses] = await Promise.all([
    // bounded: one school's role grants
    db.from('role_grants').select('user_id, role_key, revoked_at, expires_on').eq('school_id', schoolId).limit(2000),
    // bounded: one school's teachers (ids and what they teach)
    db.from('users').select('id, teacher_class, assignments').eq('school_id', schoolId).eq('role', 'teacher').limit(5000),
    count('users', q => q.eq('role', 'student')),
    count('users', q => q.eq('role', 'parent')),
    count('account_requests', q => q.eq('status', 'pending')),
    count('students', q => q.neq('status', 'cancelled')),
    count('class_subjects'),
    count('student_subjects'),
    count('academic_events', q => q.gte('starts_on', `${session.slice(0, 4)}-${String(sessionSettings(settings).startMonth).padStart(2, '0')}-01`)),
    count('bell_schedules'),
    count('rooms', q => q.eq('active', true)),
    count('timetable_versions', q => q.eq('session', session).eq('status', 'published')),
    count('exam_schemes', q => q.eq('session', session)),
    count('fee_structures', q => q.eq('session', session)),
    count('admission_stages'),
    count('admission_seats', q => q.eq('session', nextSessionOf(session))),
    count('salary_templates', q => q.eq('active', true)),
    count('pay_items', q => q.eq('active', true)),
    count('leave_policies', q => q.eq('session', session)),
    db.from('certificate_settings').select('principal_name, signature').eq('school_id', schoolId).maybeSingle(),
    count('houses', q => q.eq('active', true)),
  ]);
  const active = activeGrants(grants.data || [], isoDay());
  // bounded: the teachers above; who has a teacher_subjects row
  const { data: ts } = await db.from('teacher_subjects').select('teacher_id').eq('school_id', schoolId).limit(20000);
  const assigned = new Set((ts || []).map(r => r.teacher_id));
  const t = teachers.data || [];
  const teachersAssigned = t.filter(x => assigned.has(x.id) || x.teacher_class || (Array.isArray(x.assignments) && x.assignments.length)).length;
  return {
    officeHolders: new Set(active.map(g => g.userId)).size, safeguardingLead: active.some(g => g.role === 'safeguarding_lead'),
    teachers: t.length, teachersAssigned, studentLogins, parentLogins, loginRequestsPending: loginRequests,
    sessionSet: !!(settings.session && typeof settings.session === 'object' && (settings.session as any).startMonth),
    students, classSubjects, studentSubjects, calendarEvents: events, bellSchedules: bells, rooms, timetablePublished: tt > 0, examSchemes: schemes,
    feeStructures: fees, admissionStages: stages, admissionSeats: seats, salaryTemplates: salary, payItems, leavePolicies: leave,
    certificateSettings: !!(cert.data?.principal_name && cert.data?.signature), houses,
  };
}
