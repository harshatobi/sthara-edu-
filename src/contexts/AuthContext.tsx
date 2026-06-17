'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase/config';
import { onAuthStateChanged, User, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

export interface UserProfile {
  uid: string;
  email: string;
  role: 'student' | 'teacher' | 'admin' | 'parent' | 'superadmin';
  schoolId?: string;
  name?: string;
  studentClass?: string;
  customStudentId?: string;
  assignments?: { class: string; subject: string }[];
  linkedStudents?: string[];
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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setProfile(null);
      setUser(null);
      router.push('/login');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          // 1. Check if user is a global Super Admin
          const superAdminRef = doc(db, 'superadmins', firebaseUser.uid);
          const superAdminSnap = await getDoc(superAdminRef);
          
          if (superAdminSnap.exists()) {
            setProfile({ uid: firebaseUser.uid, email: firebaseUser.email || '', role: 'superadmin', ...superAdminSnap.data() });
            setLoading(false);
            return;
          } 

          // 2. If not SuperAdmin, find user across all schools (or we could structure it differently, but for now we search schools/{schoolId}/users/{uid})
          // Since we might not know their schoolId immediately upon just Auth state change, a global users collection is easier for lookup.
          const globalUserRef = doc(db, 'global_users', firebaseUser.uid);
          const globalUserSnap = await getDoc(globalUserRef);
          
          if (globalUserSnap.exists()) {
            const data = globalUserSnap.data();
            setProfile({ 
              uid: firebaseUser.uid, 
              email: firebaseUser.email || '', 
              role: data.role, 
              schoolId: data.schoolId, 
              name: data.name,
              studentClass: data.studentClass,
              customStudentId: data.customStudentId,
              assignments: data.assignments,
              linkedStudents: data.linkedStudents
            });
          } else {
             // Check 'users' collection where the seed script places them
             const userRef = doc(db, 'users', firebaseUser.uid);
             const userSnap = await getDoc(userRef);
             if (userSnap.exists()) {
               const data = userSnap.data();
               setProfile({ 
                 uid: firebaseUser.uid, 
                 email: firebaseUser.email || '', 
                 role: data.role as any, 
                 schoolId: data.schoolId, 
                 name: data.name,
                 studentClass: data.studentClass || data.teacherClass,
                 customStudentId: data.customStudentId,
                 assignments: data.assignments,
                 linkedStudents: data.linkedStudents
               });
             } else {
               console.warn("User profile not found in global_users, superadmins, or users");
               setProfile(null);
             }
          }
          
        } catch (error) {
          console.error("Error fetching user profile:", error);
          setProfile(null);
        }
      } else {
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
