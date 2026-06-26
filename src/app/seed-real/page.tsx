'use client';

import { useState } from 'react';
import { db, auth } from '@/lib/firebase/config';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, fetchSignInMethodsForEmail } from 'firebase/auth';

const SCHOOL_ID = 'sch-test-batch';
const SCHOOL_CODE = 'TEST100';
const PASSWORD = '1234567890';

const USERS = [
  ...Array.from({ length: 10 }).map((_, i) => ({
    email: `teststu${i + 1}@gmail.com`,
    role: 'student',
    name: `Test Student ${i + 1}`,
    customStudentId: `STU00${i + 1}`,
    studentClass: 'Class 10'
  })),
  {
    email: 'testteacher1@gmail.com',
    role: 'teacher',
    name: 'Maths Teacher',
    teacherClass: 'Class 10',
    subject: 'Mathematics'
  },
  {
    email: 'testteacher2@gmail.com',
    role: 'teacher',
    name: 'Social Teacher',
    teacherClass: 'Class 10',
    subject: 'Social Studies'
  }
];

export default function SeedRealPage() {
  const [status, setStatus] = useState('Idle');

  const runSeeding = async () => {
    setStatus('Running... Please wait.');
    try {
      setStatus('Creating Test School...');
      await setDoc(doc(db, 'schools', SCHOOL_ID), {
        name: 'Test Data School',
        code: SCHOOL_CODE,
        curriculum: 'CBSE',
        createdAt: serverTimestamp()
      });

      for (const u of USERS) {
        setStatus(`Creating ${u.role} ${u.email}...`);
        
        let uid;
        try {
          // Attempt to create user
          const cred = await createUserWithEmailAndPassword(auth, u.email, PASSWORD);
          uid = cred.user.uid;
        } catch (e: any) {
          if (e.code === 'auth/email-already-in-use') {
             // If already exists, we will query Firestore for this user to update them instead of failing, 
             // but Auth client SDK doesn't let us get the UID easily if they already exist unless we sign in.
             // Since we know the password, we could sign in, but it's better to just error clearly for testing.
             setStatus(`Error: User ${u.email} already exists in Auth. You must delete them in Firebase Auth first if you want to recreate them.`);
             return;
          } else {
             throw e;
          }
        }
        
        const userData: any = {
          name: u.name,
          email: u.email,
          role: u.role,
          schoolId: SCHOOL_ID,
          createdAt: serverTimestamp()
        };
        
        if (u.role === 'student') {
          userData.studentClass = u.studentClass;
          userData.customStudentId = u.customStudentId;
        }
        
        if (u.role === 'teacher') {
          userData.teacherClass = u.teacherClass;
          userData.subject = u.subject;
        }
        
        await setDoc(doc(db, 'users', uid), userData);
      }
      
      setStatus('DONE! Your 10 test students and 2 test teachers have been successfully created.');
    } catch (error: any) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#001229] p-6 text-white font-sans">
      <div className="bg-white/10 p-8 rounded-2xl w-full max-w-lg text-center">
        <h1 className="text-3xl font-bold mb-4">Create Test Batch Data</h1>
        <p className="text-white/60 mb-8 text-sm">
          This will create:
          <br/>School Code: {SCHOOL_CODE}
          <br/>10 Students: teststu1@gmail.com - teststu10@gmail.com (Class 10)
          <br/>2 Teachers: testteacher1@gmail.com (Math) & testteacher2@gmail.com (Social)
          <br/>Password: {PASSWORD}
        </p>
        
        <button 
          onClick={runSeeding}
          className="w-full bg-[#1e88e5] text-white py-4 rounded-xl font-bold hover:bg-[#1565c0] transition-colors mb-4"
        >
          Create Test Users Now
        </button>
        
        <div className="mt-4 p-4 bg-black/20 rounded-xl text-sm font-mono min-h-[60px] flex items-center justify-center">
          {status}
        </div>
      </div>
    </div>
  );
}
