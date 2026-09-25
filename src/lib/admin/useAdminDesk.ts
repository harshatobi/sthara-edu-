'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth, type UserProfile } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { assembleAdminDesk, type AdminDesk, type AdminRows } from './desk';
import { nextSession, sessionOf, sessionStart } from './format';

const PAGE = 1000;
const MAX_ROWS = 50_000;

type Result = { data: any[]; missing: boolean };

/**
 * Every row of a query, paged past PostgREST's 1,000-row cap. A table that
 * doesn't exist yet (migration not applied) comes back as missing, not as an error.
 */
async function all(build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<Result> {
  const out: any[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || /does not exist|schema cache/i.test(error.message || '')) {
        return { data: [], missing: true };
      }
      throw new Error(error.message || 'Could not load school data.');
    }
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, missing: false };
}

async function loadLive(supabase: SupabaseClient, profile: UserProfile): Promise<AdminRows> {
  const school = profile.schoolId!;
  const session = sessionOf();
  const since = sessionStart(session);
  const s = (table: string, cols: string) => supabase.from(table).select(cols);

  // Row-level security limits an admin to their own school; the school filter keeps the queries indexed.
  const [schoolRow, users, tml, assignments, lessons, consents, guardians, audit, leave, structures, invoices, payments,
    reminders, applicants, events, filings, proctor] = await Promise.all([
    supabase.from('schools').select('id, name, settings').eq('id', school).maybeSingle(),
    all((a, b) => s('users', 'id, name, email, role, student_class, custom_student_id, teacher_class, teacher_subject, assignments, created_at')
      .eq('school_id', school).order('id').range(a, b)),
    all((a, b) => s('tml_scores', 'student_id, subject, topic_name, score, confidence_band, components, item_count, computed_at')
      .eq('school_id', school).order('id').range(a, b)),
    all((a, b) => s('assignments', 'id, teacher_id, class, subject, type, status, created_at, due_date')
      .eq('school_id', school).order('id').range(a, b)),
    all((a, b) => s('lesson_plans', 'teacher_id, status, ai_drafted, created_at, updated_at, lesson_date')
      .eq('school_id', school).gte('created_at', since).order('id').range(a, b)),
    all((a, b) => s('consents', 'student_id, consent_type, granted, granted_at, revoked_at').eq('school_id', school).order('id').range(a, b)),
    all((a, b) => s('guardians', 'parent_id, student_id, verified').order('id').range(a, b)),
    supabase.from('audit_log').select('id, at, actor_id, actor_role, action, table_name, row_id, old_values, new_values')
      .eq('school_id', school).order('at', { ascending: false }).limit(300),
    all((a, b) => s('leave_requests', '*').eq('school_id', school).gte('to_date', since).order('id').range(a, b)),
    all((a, b) => s('fee_structures', '*').eq('school_id', school).eq('session', session).order('grade').range(a, b)),
    all((a, b) => s('fee_invoices', '*').eq('school_id', school).eq('session', session).order('id').range(a, b)),
    all((a, b) => s('fee_payments', '*').eq('school_id', school).gte('paid_on', since).order('id').range(a, b)),
    all((a, b) => s('fee_reminders', 'id, student_id, tone, sent_at').eq('school_id', school).gte('sent_at', since).order('id').range(a, b)),
    all((a, b) => s('admission_applicants', '*').eq('school_id', school).eq('session', nextSession(session)).order('id').range(a, b)),
    all((a, b) => s('admission_events', '*').eq('school_id', school).gte('at', since).order('id').range(a, b)),
    all((a, b) => s('school_filings', '*').eq('school_id', school).eq('session', session).range(a, b)),
    all((a, b) => s('proctor_alerts', 'id, flagged_at').eq('school_id', school).gte('flagged_at', since).order('id').range(a, b)),
  ]);
  // Access and ERP controls (RLS returns only what this person's roles allow).
  const [grants, dayCloses, concessions, leavePolicies, probeAcks] = await Promise.all([
    all((a, b) => s('role_grants', '*').eq('school_id', school).order('granted_at').range(a, b)),
    all((a, b) => s('fee_day_closes', '*').eq('school_id', school).gte('day', since).order('day').range(a, b)),
    all((a, b) => s('fee_concession_requests', '*').eq('school_id', school).gte('requested_at', since).order('id').range(a, b)),
    all((a, b) => s('leave_policies', 'leave_type, days_per_year').eq('school_id', school).eq('session', session).range(a, b)),
    all((a, b) => s('probe_acks', '*').eq('school_id', school).range(a, b)),
  ]);
  if (schoolRow.error || !schoolRow.data) throw new Error(schoolRow.error?.message || 'Your school record could not be found.');

  // Submissions on this school's assignments (the table has no school index for this query shape).
  const asgIds = assignments.data.map(a => a.id);
  const subs: Result = { data: [], missing: false };
  for (let i = 0; i < asgIds.length; i += 150) {
    const chunk = asgIds.slice(i, i + 150);
    const r = await all((a, b) => s('submissions', 'id, assignment_id, student_id, teacher_approved, score, max_score, submitted_at, updated_at')
      .in('assignment_id', chunk).order('id').range(a, b));
    subs.data.push(...r.data);
  }
  const wellness = await supabase.rpc('school_wellness_report', { p_since: since });

  const named: Record<string, Result> = {
    leave_requests: leave, fee_structures: structures, fee_invoices: invoices, fee_payments: payments, fee_reminders: reminders,
    admission_applicants: applicants, school_filings: filings, consents, guardians, lesson_plans: lessons, proctor_alerts: proctor,
    role_grants: grants, fee_day_closes: dayCloses, fee_concession_requests: concessions, leave_policies: leavePolicies, probe_acks: probeAcks,
  };
  const missing = Object.entries(named).filter(([, r]) => r.missing).map(([k]) => k);
  if (wellness.error) missing.push('school_wellness_report');

  return {
    school: schoolRow.data,
    users: users.data, tml: tml.data, assignments: assignments.data, submissions: subs.data, lessons: lessons.data,
    consents: consents.data, guardians: guardians.data, audit: audit.error ? [] : audit.data || [], leave: leave.data,
    structures: structures.data, invoices: invoices.data, payments: payments.data, reminders: reminders.data,
    applicants: applicants.data, admissionEvents: events.data, filings: filings.data,
    wellness: wellness.error ? [] : wellness.data || [], proctor: proctor.data, missing,
    meId: profile.uid, superadmin: profile.role === 'superadmin',
    grants: grants.data, dayCloses: dayCloses.data, concessions: concessions.data, leavePolicies: leavePolicies.data, probeAcks: probeAcks.data,
  };
}

const STALE_MS = 30_000;

interface DeskState {
  desk: AdminDesk | null;
  error: string | null;
  reload: () => void;
  /** Authenticated call to an admin API route; throws the route's error message. */
  call: <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
}

const Ctx = createContext<DeskState | null>(null);

/** Loads the whole school once for the /admin area (mounted in the layout). */
export function AdminDeskProvider({ children }: { children: ReactNode }) {
  const { profile, user, loading: authLoading, getAuthToken } = useAuth();
  const [desk, setDesk] = useState<AdminDesk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loadedAt = useRef(0);
  const inFlight = useRef(false);
  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    if (authLoading || !profile || !user || !profile.schoolId) return;
    let cancelled = false;
    inFlight.current = true;
    loadLive(createClient(), profile)
      .then(rows => { if (!cancelled) { setDesk(assembleAdminDesk(rows)); setError(null); loadedAt.current = Date.now(); } })
      .catch(e => { if (!cancelled) setError(prev => (loadedAt.current ? prev : e?.message || 'Could not load the school.')); })
      .finally(() => { inFlight.current = false; });
    return () => { cancelled = true; };
  }, [authLoading, profile, user, nonce]);

  useEffect(() => {
    const onFocus = () => { if (!inFlight.current && loadedAt.current && Date.now() - loadedAt.current > STALE_MS) reload(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const call = useCallback(async (path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const res = await fetch(path, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.');
    return data;
  }, [getAuthToken]);

  const value = useMemo(() => ({ desk, error, reload, call }), [desk, error, reload, call]);
  return createElement(Ctx.Provider, { value }, children);
}

export function useAdminDesk() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdminDesk must be used inside <AdminDeskProvider> (the admin layout).');
  return ctx;
}
