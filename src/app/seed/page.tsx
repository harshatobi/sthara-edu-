'use client';

import { useState } from 'react';
import { db, auth } from '@/lib/firebase/config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

const SCHOOLS = [
  { id: 'sch-dps', name: 'Delhi Public School', code: 'DPS101', curriculum: 'CBSE' },
  { id: 'sch-oak', name: 'Oakridge International', code: 'OAK202', curriculum: 'State Board' }
];

const CLASSES = ['Class 10', 'Class 11'];
const STUDENTS_PER_CLASS = 15;
const TEACHERS_PER_SCHOOL = 2;

export default function SeedPage() {
  const [status, setStatus] = useState('Idle');
  const [progress, setProgress] = useState(0);

  const runSeeding = async () => {
    setStatus('Running... Please wait, this takes about 1-2 minutes.');
    try {
      let total = SCHOOLS.length + (SCHOOLS.length * TEACHERS_PER_SCHOOL) + (SCHOOLS.length * CLASSES.length * STUDENTS_PER_CLASS);
      let current = 0;

      for (const school of SCHOOLS) {
        setStatus(`Setting up ${school.name}...`);
        await setDoc(doc(db, 'schools', school.id), {
          name: school.name,
          code: school.code,
          curriculum: school.curriculum,
          createdAt: serverTimestamp()
        });
        current++;
        setProgress((current / total) * 100);

        for (let i = 1; i <= TEACHERS_PER_SCHOOL; i++) {
          const email = `teacher${i}_${school.id}@demo.com`;
          const password = `Teach${school.code}${i}!`;
          
          try {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, 'users', cred.user.uid), {
              name: `Teacher ${i} (${school.code})`,
              email,
              role: 'teacher',
              schoolId: school.id,
              teacherClass: CLASSES[(i - 1) % CLASSES.length],
              demoPassword: password,
              createdAt: serverTimestamp()
            });
          } catch (e: any) {
            if (e.code === 'auth/email-already-in-use') {
              // Ignore if exists
            } else throw e;
          }
          current++;
          setProgress((current / total) * 100);
        }

        let c = 1;
        for (const className of CLASSES) {
          for (let i = 1; i <= STUDENTS_PER_CLASS; i++) {
            const safeClass = className.replace(/\s+/g, '_').toLowerCase();
            const email = `student${c}_${school.id}_${safeClass}@demo.com`;
            const password = `Pass${school.code}${c}!`;
            
            try {
              const cred = await createUserWithEmailAndPassword(auth, email, password);
              await setDoc(doc(db, 'users', cred.user.uid), {
                name: `Student ${c} (${school.code})`,
                email,
                role: 'student',
                schoolId: school.id,
                studentClass: className,
                demoPassword: password,
                createdAt: serverTimestamp()
              });
            } catch (e: any) {
               if (e.code === 'auth/email-already-in-use') {
                 // Ignore if exists
               } else throw e;
            }
            c++;
            current++;
            setProgress((current / total) * 100);
          }
        }
      }
      setStatus('DONE! All 64 demo users have been successfully created.');
    } catch (error: any) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#001229] p-6 text-white font-sans">
      <div className="bg-white/10 p-8 rounded-2xl w-full max-w-lg text-center">
        <h1 className="text-3xl font-bold mb-4">Database Seeder</h1>
        <p className="mb-8 text-white/70">Click the button below to inject all schools, teachers, and students into your live Firebase database.</p>
        
        <button 
          onClick={runSeeding}
          className="bg-[#dc143c] hover:bg-[#dc143c]/80 text-white px-8 py-4 rounded-xl font-bold text-lg mb-6 transition-colors"
        >
          Inject Demo Data
        </button>

        <div className="bg-black/30 rounded-full h-4 mb-2 overflow-hidden">
          <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
        </div>
        <p className="text-sm font-medium">{status}</p>
      </div>
    </div>
  );
}
