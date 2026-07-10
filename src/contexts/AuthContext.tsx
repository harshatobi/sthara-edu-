'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase/config';
import { onAuthStateChanged, User, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
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
  // Trial/plan info (populated from school doc)
  trialExpired?: boolean;
  daysLeftInTrial?: number;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
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

// ── Trial status checker ──────────────────────────────────────────────────────
async function checkTrialStatus(schoolId: string): Promise<{ expired: boolean; daysLeft: number }> {
  try {
    const schoolSnap = await getDoc(doc(db, 'schools', schoolId));
    if (!schoolSnap.exists()) return { expired: false, daysLeft: 30 };

    const data = schoolSnap.data();
    const plan: string = data.plan || 'trial';

    // Paid plans are never expired
    if (plan !== 'trial') return { expired: false, daysLeft: 999 };

    const trialEndsAt: Date = data.trialEndsAt?.toDate?.() ?? new Date(Date.now() + 30 * 86400_000);
    const now = new Date();
    const daysLeft = Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400_000);
    return { expired: daysLeft <= 0, daysLeft: Math.max(0, daysLeft) };
  } catch {
    // If we can't check, allow access (fail open for trial — better than locking out paying customers)
    return { expired: false, daysLeft: 30 };
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      clearCookie('__session');
      clearCookie('__trial_ok');
      setProfile(null);
      setUser(null);
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Set session cookie for proxy middleware
        const token = await firebaseUser.getIdToken();
        setCookie('__session', token, 3600);

        try {
          // 1. Superadmin check
          const superAdminSnap = await getDoc(doc(db, 'superadmins', firebaseUser.uid));
          if (superAdminSnap.exists()) {
            setCookie('__trial_ok', 'ok', 3600); // Superadmins never expire
            setProfile({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              role: 'superadmin',
              ...superAdminSnap.data(),
              trialExpired: false,
              daysLeftInTrial: 999,
            });
            setLoading(false);
            return;
          }

          // 2. Look up in global_users first, then fallback to users
          let userData: any = null;
          const globalSnap = await getDoc(doc(db, 'global_users', firebaseUser.uid));
          if (globalSnap.exists()) {
            userData = globalSnap.data();
          } else {
            const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (userSnap.exists()) userData = userSnap.data();
          }

          if (!userData) {
            console.warn('User profile not found in any collection');
            setProfile(null);
            setLoading(false);
            return;
          }

          // 3. Check trial status for school users
          let trialExpired = false;
          let daysLeftInTrial = 30;
          if (userData.schoolId) {
            const trialStatus = await checkTrialStatus(userData.schoolId);
            trialExpired = trialStatus.expired;
            daysLeftInTrial = trialStatus.daysLeft;
          }

          // 3b. Fetch institution type from school doc
          let institutionType: 'school' | 'college' = 'school';
          if (userData.schoolId) {
            try {
              const schoolSnap = await getDoc(doc(db, 'schools', userData.schoolId));
              if (schoolSnap.exists()) {
                institutionType = schoolSnap.data()?.type === 'college' ? 'college' : 'school';
              }
            } catch (e) {
              // Non-fatal — default to school
            }
          }

          // 4. Set trial cookie for proxy middleware
          setCookie('__trial_ok', trialExpired ? 'expired' : 'ok', 3600);

          setProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: userData.role as any,
            schoolId: userData.schoolId,
            name: userData.name,
            studentClass: userData.studentClass,
            teacherClass: userData.teacherClass,
            subjectsTaught: userData.subjectsTaught,
            customStudentId: userData.customStudentId,
            assignments: userData.assignments,
            linkedStudents: userData.linkedStudents,
            teachingSubjects: userData.teachingSubjects,
            institutionType,
            branch: userData.branch,
            year: userData.year,
            semester: userData.semester,
            trialExpired,
            daysLeftInTrial,
          });

        } catch (error) {
          console.error('Error fetching user profile:', error);
          setProfile(null);
        }
      } else {
        clearCookie('__session');
        clearCookie('__trial_ok');
        setProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
