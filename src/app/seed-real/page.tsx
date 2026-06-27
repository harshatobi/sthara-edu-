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
    studentClass: 'Class 10'
  })),
  {
    email: 'testteacher1@gmail.com',
    role: 'teacher',
    name: 'Moses',
    teacherClass: 'Class 10',
    subject: 'Mathematics'
  },
  {
    email: 'testteacher2@gmail.com',
    role: 'teacher',
    name: 'Joshua',
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
        setStatus(`Creating ${u.role}: ${u.email}...`);
        
        let uid;
        try {
          const cred = await createUserWithEmailAndPassword(auth, u.email, PASSWORD);
          uid = cred.user.uid;
        } catch (e: any) {
          if (e.code === 'auth/email-already-in-use') {
            setStatus(`Error: ${u.email} already exists. Use the green "Update Names" button below to fix names for existing users.`);
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
      
      setStatus('DONE! 10 students and 2 teachers created successfully.');
    } catch (error: any) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    }
  };

  // Updates names of existing users in Firestore by querying by email
  const updateNames = async () => {
    setStatus('Updating names...');
    try {
      const namesToUpdate = [
        { email: 'testteacher1@gmail.com', name: 'Moses' },
        { email: 'testteacher2@gmail.com', name: 'Joshua' },
      ];

      for (const u of namesToUpdate) {
        setStatus(`Updating ${u.email} → "${u.name}"...`);
        const q = query(collection(db, 'users'), where('email', '==', u.email));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(snap.docs[0].ref, { name: u.name });
        } else {
          setStatus(`Could not find ${u.email} in Firestore. Create users first.`);
          return;
        }
      }

      setStatus('DONE! Names updated. Moses (Maths) and Joshua (Social) are ready. Log out and log back in to see the changes.');
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
          ✏️ Update Names (for existing users)
        </button>
        
        <div className="mt-4 p-4 bg-black/20 rounded-xl text-sm font-mono min-h-[60px] flex items-center justify-center text-center">
          {status}
        </div>
      </div>
    </div>
  );
}
