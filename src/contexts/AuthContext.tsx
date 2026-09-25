'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { isRole, withTimeout, type Role } from '@/lib/auth/roles';
import { schoolPolicy } from '@/lib/settings/registry';

export interface UserProfile {
  uid: string;
  id: string;           // alias for uid — used by heatmap/mastery pages
  email: string;
  role: 'student' | 'teacher' | 'admin' | 'parent' | 'superadmin';
  schoolId?: string;
  name?: string;
  subject?: string;     // primary subject (alias for teacherSubject)
  subjects?: string[];  // all subjects taught
  // School-specific
  studentClass?: string;
  teacherClass?: string;
  teacherSubject?: string;
  subjectsTaught?: string[];
  customStudentId?: string;
  assignments?: { class: string; subject: string; assignedStudents?: string[] }[];
  linkedStudents?: string[];
  teachingSubjects?: {
    classId: string;
    className: string;
    subjectId: string;
    subjectName: string;
    curriculum?: string;
    units?: { unitNo: number; name: string; topics?: string[] }[];
  }[];
  // College-specific
  institutionType?: 'school' | 'college';
  branch?: string;
  year?: string;
  semester?: string;
  // Trial/plan info
  trialExpired?: boolean;
  daysLeftInTrial?: number;
  /** The school's account is suspended by Sthara (operator console). */
  schoolSuspended?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  startDemo: (role: Role) => void;
  signOut: () => Promise<void>;
  getAuthToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  error: null,
  startDemo: () => {},
  signOut: async () => {},
  getAuthToken: async () => '',
});

export const useAuth = () => useContext(AuthContext);

// ── Cookie helpers ────────────────────────────────────────────────────────────
function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Strict`;
}
function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Strict`;
}
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  try { return match ? decodeURIComponent(match[1]) : null; } catch { return null; }
}

// ── Dev-only demo profile ────────────────────────────────────────────────────
// When there's no real Supabase session (no backend wired up yet), fall back
// to a mock profile built from the __role cookie the login page sets, so the
// app is usable for local development without live auth.
function buildDemoProfile(role: Role): UserProfile {
  return {
    uid: 'demo-user',
    id: 'demo-user',
    email: 'priya.menon@dpsvasundhara.edu.in',
    role: role as UserProfile['role'],
    schoolId: 'demo-school',
    name: 'Priya Menon',
    studentClass: 'Class 10-A',
    teacherClass: 'Class 10-A',
    subject: 'Mathematics',
    subjects: ['Mathematics'],
    trialExpired: false,
    daysLeftInTrial: 999,
  };
}

// Profile reads run outside the auth notification callback (which holds an SDK lock).
async function fetchProfile(session: Session): Promise<UserProfile> {
  const supabase = createClient();
  const { data: row, error } = await supabase.from('users').select('*').eq('id', session.user.id).single();
  if (error || !row || !isRole(row.role)) {
    throw new Error('Your account profile is unavailable. Ask your school administrator to check your account.');
  }
  let trialExpired = false;
  let daysLeftInTrial = 999;
  let schoolSuspended = false;
  let institutionType: 'school' | 'college' = 'school';
  if (row.school_id) {
    const { data: school, error: schoolError } = await supabase.from('schools')
      .select('id, name, trial_expires_at, settings, institution_type').eq('id', row.school_id).single();
    if (schoolError || !school) throw new Error('Your school could not be loaded. Please try again.');
    // Same rules the API enforces (src/lib/settings/registry.ts).
    const policy = schoolPolicy(school);
    institutionType = policy.institutionType;
    if (policy.trialDaysLeft !== null) {
      daysLeftInTrial = policy.trialDaysLeft;
      trialExpired = policy.trialExpired;
    }
    schoolSuspended = row.role !== 'superadmin' && !policy.active;
  }
  const assignments = (Array.isArray(row.assignments) ? row.assignments : []).filter(
    (a: unknown): a is { class: string; subject: string } => !!a && typeof a === 'object'
      && 'class' in a && typeof a.class === 'string' && 'subject' in a && typeof a.subject === 'string'
  );
  const subjects = [...new Set<string>(assignments.map((a: { subject: string }) => a.subject).filter(Boolean))];
  const subject = row.teacher_subject || subjects[0];
  return {
    uid: row.id, id: row.id, email: row.email || session.user.email || '', role: row.role,
    schoolId: row.school_id || undefined, name: row.name || undefined,
    subject, subjects: subjects.length ? subjects : subject ? [subject] : [],
    studentClass: row.student_class, teacherClass: row.teacher_class, teacherSubject: subject,
    customStudentId: row.custom_student_id, assignments,
    linkedStudents: Array.isArray(row.metadata?.linkedStudents) ? row.metadata.linkedStudents : [],
    teachingSubjects: Array.isArray(row.teaching_subjects) ? row.teaching_subjects : [],
    institutionType, branch: row.branch, year: row.year, semester: row.semester,
    trialExpired, daysLeftInTrial, schoolSuspended,
  };
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const demoActive = useRef(false);
  const router = useRouter();

  const getAuthToken = async () => {
    const { data, error } = await withTimeout(createClient().auth.getSession());
    if (error) throw error;
    return data.session?.access_token || '';
  };

  const startDemo = (role: Role) => {
    if (process.env.NODE_ENV !== 'development' || !isRole(role) || role === 'superadmin' || user) return;
    revision.current++;
    demoActive.current = true;
    clearCookie('__session');
    clearCookie('__trial_ok');
    setCookie('__role', role, 86400);
    setProfile(buildDemoProfile(role));
    setError(null);
    setLoading(false);
    router.replace(`/${role}`);
  };

  const signOut = async () => {
    revision.current++;
    demoActive.current = false;
    clearCookie('__session');
    clearCookie('__trial_ok');
    clearCookie('__role');
    setProfile(null);
    setUser(null);
    setSession(null);
    setLoading(false);
    setError(null);
    try {
      if (!user) { router.replace('/login'); router.refresh(); return; }
      const { error } = await withTimeout(createClient().auth.signOut({ scope: 'local' }), 5000);
      if (error) throw error;
      router.replace('/login');
      router.refresh();
    } catch {
      setError('Sign-out could not complete. Check your connection and try again.');
    }
  };

  useEffect(() => {
    let disposed = false;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const supabase = createClient();
    // This also covers SDK initialization that never emits INITIAL_SESSION.
    const watchdog = setTimeout(() => {
      if (!disposed && !demoActive.current) {
        revision.current++;
        setLoading(false);
        setError('Sign-in is taking too long. Check your connection and retry.');
      }
    }, 12000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (disposed) return;
      clearTimeout(watchdog);
      clearTimeout(pending);
      const request = ++revision.current;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setError(null);
      if (!nextSession) {
        clearCookie('__session');
        clearCookie('__trial_ok');
        if (event === 'SIGNED_OUT') {
          clearCookie('__role');
          demoActive.current = false;
        }
        const demoRole = getCookie('__role');
        const demo = process.env.NODE_ENV === 'development' && isRole(demoRole) && demoRole !== 'superadmin';
        demoActive.current = demo;
        setProfile(demo ? buildDemoProfile(demoRole) : null);
        setLoading(false);
        return;
      }
      demoActive.current = false;
      setLoading(true);
      // Never return a promise to Supabase's notification handler.
      pending = setTimeout(() => {
        void withTimeout(fetchProfile(nextSession)).then(nextProfile => {
          if (disposed || request !== revision.current) return;
          setCookie('__session', nextSession.access_token, Math.max(1, (nextSession.expires_at ?? 0) - Math.floor(Date.now() / 1000)));
          setCookie('__role', nextProfile.role, 3600);
          setCookie('__trial_ok', nextProfile.schoolSuspended ? 'suspended' : nextProfile.trialExpired ? 'expired' : 'ok', 3600);
          setProfile(nextProfile);
        }).catch(() => {
          if (disposed || request !== revision.current) return;
          setProfile(null);
          setError('We could not load your account. Check your connection or ask your school administrator to check your profile.');
        }).finally(() => {
          if (!disposed && request === revision.current) setLoading(false);
        });
      }, 0);
    });
    return () => {
      disposed = true;
      clearTimeout(watchdog);
      clearTimeout(pending);
      subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ user, session, profile, loading, error, startDemo, signOut, getAuthToken }}>
    {children}
  </AuthContext.Provider>;
};
