'use client';

import { useState } from 'react';
import { db, auth } from '@/lib/firebase/config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';

const SCHOOL_ID = 'sch-real';
const SCHOOL_CODE = 'REAL101';
const PASSWORD = '1234567890';

const USERS = [
  {
    email: '23B61A05E3@sthara.com',
    role: 'student',
    name: 'Student (23B61A05E3)',
    customStudentId: '23B61A05E3',
    studentClass: 'Class 10'
  },
  {
    email: '23B61A05J3@sthara.com',
    role: 'student',
    name: 'Student (23B61A05J3)',
    customStudentId: '23B61A05J3',
    studentClass: 'Class 10'
  },
  {
    email: '23B61A05H0@sthara.com',
    role: 'teacher',
    name: 'Maths Teacher',
    teacherClass: 'Class 10',
    subject: 'Mathematics'
  }
];

export default function SeedRealPage() {
  const [status, setStatus] = useState('Idle');

  const runSeeding = async () => {
    setStatus('Running... Please wait.');
    try {
      setStatus('Creating Real Testing School...');
      await setDoc(doc(db, 'schools', SCHOOL_ID), {
        name: 'Real Testing School',
        code: SCHOOL_CODE,
        curriculum: 'CBSE',
        createdAt: serverTimestamp()
      });

      for (const u of USERS) {
        setStatus(`Creating ${u.role} ${u.email}...`);
        
        let uid;
        try {
          const cred = await createUserWithEmailAndPassword(auth, u.email, PASSWORD);
          uid = cred.user.uid;
        } catch (e: any) {
          if (e.code === 'auth/email-already-in-use') {
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
      
      setStatus('DONE! Your real users have been successfully created.');
    } catch (error: any) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#001229] p-6 text-white font-sans">
      <div className="bg-white/10 p-8 rounded-2xl w-full max-w-lg text-center">
        <h1 className="text-3xl font-bold mb-4">Create Real Testing Data</h1>
        <p className="text-white/60 mb-8 text-sm">
          This will create:
          <br/>Teacher: 23B61A05H0 (Maths, Class 10)
          <br/>Student: 23B61A05E3 (Class 10)
          <br/>Student: 23B61A05J3 (Class 10)
          <br/>School Code: REAL101
          <br/>Password: {PASSWORD}
        </p>
        
        <button 
          onClick={runSeeding}
          className="w-full bg-[#1e88e5] text-white py-4 rounded-xl font-bold hover:bg-[#1565c0] transition-colors mb-4"
        >
          Create Real Users Now
        </button>
        
        <div className="mt-4 p-4 bg-black/20 rounded-xl text-sm font-mono min-h-[60px] flex items-center justify-center">
          {status}
        </div>
      </div>
    </div>
  );
}
