'use client';

import { useState } from 'react';
import { db, auth } from '@/lib/firebase/config';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';

const SCHOOL_ID = 'sch-test-batch';
const SCHOOL_CODE = 'TEST100';
const PASSWORD = '1234567890';

const USERS = [
  ...Array.from({ length: 10 }).map((_, i) => ({
    email: `teststu${i + 1}@gmail.com`,
    role: 'student',
    name: `Test Student ${i + 1}`,
    customStudentId: `STU00${i + 1}`,
    studentClass: '10A'
  })),
  {
    email: 'testteacher1@gmail.com',
    role: 'teacher',
    name: 'Moses',
    teacherClass: '10A',
    subject: 'Mathematics'
  },
  {
    email: 'testteacher2@gmail.com',
    role: 'teacher',
    name: 'Joshua',
    teacherClass: '10A',
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
        setStatus(`Creating ${u.role}: ${u.email}...`);
        
        let uid;
        try {
          const cred = await createUserWithEmailAndPassword(auth, u.email, PASSWORD);
          uid = cred.user.uid;
        } catch (e: any) {
          if (e.code === 'auth/email-already-in-use') {
            setStatus(`Error: ${u.email} already exists. Use the buttons below to fix names or classes for existing users.`);
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
          userData.studentClass = (u as any).studentClass;
          userData.customStudentId = (u as any).customStudentId;
        }
        
        if (u.role === 'teacher') {
          userData.teacherClass = (u as any).teacherClass;
          userData.subject = (u as any).subject;
        }
        
        await setDoc(doc(db, 'users', uid), userData);
      }
      
      setStatus('DONE! 10 students (Class 10A) and 2 teachers created successfully.');
    } catch (error: any) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    }
  };

  // Updates names for existing users
  const updateNames = async () => {
    setStatus('Updating names...');
    try {
      const updates = [
        { email: 'testteacher1@gmail.com', name: 'Moses' },
        { email: 'testteacher2@gmail.com', name: 'Joshua' },
      ];
      for (const u of updates) {
        setStatus(`Updating name: ${u.email} → "${u.name}"...`);
        const q = query(collection(db, 'users'), where('email', '==', u.email));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(snap.docs[0].ref, { name: u.name });
        } else {
          setStatus(`Could not find ${u.email}. Create users first.`);
          return;
        }
      }
      setStatus('DONE! Names updated: Moses (Maths) and Joshua (Social).');
    } catch (error: any) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    }
  };

  // Updates class assignment for all existing users to 10A
  const updateClasses = async () => {
    setStatus('Updating class assignments to 10A...');
    try {
      // Update all 10 students
      for (let i = 1; i <= 10; i++) {
        const email = `teststu${i}@gmail.com`;
        setStatus(`Updating class for ${email}...`);
        const q = query(collection(db, 'users'), where('email', '==', email));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(snap.docs[0].ref, { studentClass: '10A' });
        }
      }

      // Update both teachers
      const teachers = [
        { email: 'testteacher1@gmail.com', subject: 'Mathematics' },
        { email: 'testteacher2@gmail.com', subject: 'Social Studies' },
      ];
      for (const t of teachers) {
        setStatus(`Updating class for ${t.email}...`);
        const q = query(collection(db, 'users'), where('email', '==', t.email));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(snap.docs[0].ref, { teacherClass: '10A', subject: t.subject });
        }
      }

      setStatus('DONE! All students and teachers are now assigned to Class 10A. Log out and log back in to see the changes.');
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
          School Code: <strong>{SCHOOL_CODE}</strong>
          <br />Class: <strong>10A</strong>
          <br />10 Students: teststu1@gmail.com – teststu10@gmail.com
          <br />Teacher 1: testteacher1@gmail.com — <strong>Moses</strong> (Maths)
          <br />Teacher 2: testteacher2@gmail.com — <strong>Joshua</strong> (Social)
          <br />Password for all: <strong>{PASSWORD}</strong>
        </p>
        
        <button 
          onClick={runSeeding}
          className="w-full bg-[#1e88e5] text-white py-4 rounded-xl font-bold hover:bg-[#1565c0] transition-colors mb-4"
        >
          Create Test Users Now
        </button>

        <button 
          onClick={updateNames}
          className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold hover:bg-emerald-700 transition-colors mb-4"
        >
          ✏️ Update Names (Moses & Joshua)
        </button>

        <button 
          onClick={updateClasses}
          className="w-full bg-purple-600 text-white py-4 rounded-xl font-bold hover:bg-purple-700 transition-colors mb-4"
        >
          🏫 Update Classes → 10A (for existing users)
        </button>
        
        <div className="mt-4 p-4 bg-black/20 rounded-xl text-sm font-mono min-h-[60px] flex items-center justify-center text-center">
          {status}
        </div>
      </div>
    </div>
  );
}
