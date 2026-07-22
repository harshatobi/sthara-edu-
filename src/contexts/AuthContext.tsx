'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

export interface UserProfile {
  uid: string;
  email: string;
  role: 'student' | 'teacher' | 'admin' | 'parent' | 'superadmin';
  schoolId?: string;
  name?: string;
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
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// ── Cookie helpers ────────────────────────────────────────────────────────────
function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Strict`;
}
function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Strict`;
}

// ── Trial status checker (Supabase) ──────────────────────────────────────────
async function checkTrialStatus(schoolId: string): Promise<{ expired: boolean; daysLeft: number }> {
  try {
    const supabase = createClient();
    const { data: school } = await supabase
      .from('schools')
      .select('trial_expires_at, settings')
      .eq('id', schoolId)
      .single();

    if (!school) return { expired: false, daysLeft: 30 };

    const plan = school.settings?.plan || 'trial';
    if (plan !== 'trial') return { expired: false, daysLeft: 999 };

    if (!school.trial_expires_at) return { expired: false, daysLeft: 30 };

    const trialEndsAt = new Date(school.trial_expires_at);
    const now = new Date();
    const daysLeft = Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400_000);
    return { expired: daysLeft <= 0, daysLeft: Math.max(0, daysLeft) };
  } catch {
    return { expired: false, daysLeft: 30 };
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user,    setUser]    = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearCookie('__session');
    clearCookie('__trial_ok');
    setProfile(null);
    setUser(null);
    setSession(null);
    router.push('/login');
  };

  useEffect(() => {
    const supabase = createClient();

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id, session.access_token);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setCookie('__session', session.access_token, 3600);
          await loadProfile(session.user.id, session.access_token);
        } else {
          clearCookie('__session');
          clearCookie('__trial_ok');
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (uid: string, token: string) => {
    const supabase = createClient();
    try {
      // Set session cookie for middleware
      setCookie('__session', token, 3600);

      // 1. Fetch user profile from users table
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', uid)
        .single();

      if (error || !userData) {
        // New user — profile not created yet (happens briefly on first sign up)
        console.warn('User profile not found yet:', uid);
        setProfile(null);
        setLoading(false);
        return;
      }

      // 2. Check superadmin
      if (userData.role === 'superadmin') {
        setCookie('__trial_ok', 'ok', 3600);
        setProfile({
          uid,
          email: userData.email || '',
          role: 'superadmin',
          name: userData.name,
          trialExpired: false,
          daysLeftInTrial: 999,
        });
        setLoading(false);
        return;
      }

      // 3. Check trial status
      let trialExpired = false;
      let daysLeftInTrial = 30;
      let institutionType: 'school' | 'college' = 'school';

      if (userData.school_id) {
        const trialStatus = await checkTrialStatus(userData.school_id);
        trialExpired = trialStatus.expired;
        daysLeftInTrial = trialStatus.daysLeft;

        // Fetch institution type from school
        const { data: school } = await supabase
          .from('schools')
          .select('institution_type')
          .eq('id', userData.school_id)
          .single();

        if (school?.institution_type === 'college') institutionType = 'college';
      }

      setCookie('__trial_ok', trialExpired ? 'expired' : 'ok', 3600);

      setProfile({
        uid,
        email: userData.email || '',
        role: userData.role as any,
        schoolId: userData.school_id || undefined,
        name: userData.name || undefined,
        studentClass: userData.student_class || undefined,
        teacherClass: userData.teacher_class || undefined,
        teacherSubject: userData.teacher_subject || undefined,
        customStudentId: userData.custom_student_id || undefined,
        assignments: userData.assignments || [],
        linkedStudents: userData.metadata?.linkedStudents || [],
        teachingSubjects: userData.teaching_subjects || [],
        institutionType,
        branch: userData.branch || undefined,
        year: userData.year || undefined,
        semester: userData.semester || undefined,
        trialExpired,
        daysLeftInTrial,
      });
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
