'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Building2, Users, ArrowLeft, Loader2, Search, Database } from 'lucide-react';
import Link from 'next/link';

interface School {
  id: string;
  name: string;
  code: string;
  curriculum: string;
}

export default function ManageSchools() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  
  const [schools, setSchools] = useState<School[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  const fetchSchools = async () => {
    setFetching(true);
    try {
      const q = query(collection(db, 'schools'));
      const snap = await getDocs(q);
      const list: School[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as School);
      });
      setSchools(list);
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (profile?.role === 'superadmin') {
      fetchSchools();
    }
  }, [profile]);

  const handleGenerateData = async () => {
    if (!confirm('This will generate 120 students and 4 teachers. Proceed?')) return;
    setGenerating(true);
    try {
      const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      const SCHOOLS = [
        { id: 'sch-dps', name: 'Delhi Public School', code: 'DPS101', curriculum: 'CBSE' },
        { id: 'sch-oak', name: 'Oakridge International', code: 'OAK202', curriculum: 'State Board' }
      ];
      const CLASSES = ['10A', '10B'];
      const STUDENTS_PER_CLASS = 30;
      const TEACHERS_PER_SCHOOL = 2;

      for (const school of SCHOOLS) {
        await setDoc(doc(db, 'schools', school.id), {
          name: school.name,
          code: school.code,
          curriculum: school.curriculum,
          createdAt: serverTimestamp()
        });

        for (let i = 1; i <= TEACHERS_PER_SCHOOL; i++) {
          const email = `teacher${i}_${school.id}@demo.com`;
          const password = `Teach${school.code}${i}!`;
          const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
          });
          const data = await res.json();
          let uid = data.localId;
          if (!res.ok && data.error?.message === 'EMAIL_EXISTS') {
            const signRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password, returnSecureToken: true })
            });
            uid = (await signRes.json()).localId;
          }
          if (uid) {
            await setDoc(doc(db, 'users', uid), {
              name: `Teacher ${i} (${school.code})`,
              email, role: 'teacher', schoolId: school.id,
              demoPassword: password, createdAt: serverTimestamp()
            });
          }
        }

        let globalCounter = 1;
        for (const className of CLASSES) {
          for (let i = 1; i <= STUDENTS_PER_CLASS; i++) {
            const email = `student${globalCounter}_${school.id}_${className.toLowerCase()}@demo.com`;
            const password = `Pass${school.code}${globalCounter}!`;
            const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password, returnSecureToken: true })
            });
            const data = await res.json();
            let uid = data.localId;
            if (!res.ok && data.error?.message === 'EMAIL_EXISTS') {
              const signRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, returnSecureToken: true })
              });
              uid = (await signRes.json()).localId;
            }
            if (uid) {
              await setDoc(doc(db, 'users', uid), {
                name: `Student ${globalCounter} (${school.code})`,
                email, role: 'student', schoolId: school.id, studentClass: className,
                demoPassword: password, createdAt: serverTimestamp()
              });
            }
            globalCounter++;
          }
        }
      }
      alert('Demo data generated successfully!');
      fetchSchools();
    } catch (err: any) {
      alert(`Error generating data: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[#002147]" /></div>;

  const filteredSchools = schools.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-[#002147]">School Management</h1>
          <p className="text-[#002147]/60 mt-1">Manage partner schools and assigned curriculums.</p>
        </div>
        <Link href="/superadmin" className="px-4 py-2 bg-white border border-[#002147]/10 rounded-xl text-[#002147] font-medium shadow-sm hover:bg-[#f8fafc] flex items-center space-x-2">
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </Link>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/10">
        <div className="flex justify-between items-center mb-6">
          <div className="relative w-72">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-[#002147]/40" />
            <input 
              type="text" 
              placeholder="Search schools..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl pl-10 pr-4 py-2 text-[#002147] outline-none focus:ring-2 focus:ring-[#002147]/20"
            />
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={handleGenerateData} 
              disabled={generating}
              className="px-4 py-2 bg-[#f59e0b] text-white rounded-xl font-medium hover:bg-[#d97706] transition-colors flex items-center space-x-2 disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              <span>{generating ? 'Generating...' : 'Generate Demo Data'}</span>
            </button>
            <button className="px-4 py-2 bg-[#002147] text-white rounded-xl font-medium hover:bg-[#002147]/90 transition-colors">
              + Add New School
            </button>
          </div>
        </div>

        {fetching ? (
          <div className="py-20 text-center text-[#002147]/50">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[#002147]/40" />
            Loading schools...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#002147]/10">
                  <th className="py-4 px-6 text-sm font-bold text-[#002147]/60 uppercase">School Name</th>
                  <th className="py-4 px-6 text-sm font-bold text-[#002147]/60 uppercase">Code</th>
                  <th className="py-4 px-6 text-sm font-bold text-[#002147]/60 uppercase">Curriculum</th>
                  <th className="py-4 px-6 text-sm font-bold text-[#002147]/60 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchools.map((school) => (
                  <tr key={school.id} className="border-b border-[#002147]/5 hover:bg-[#f8fafc] transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-[#dc143c]/10 text-[#dc143c] rounded-lg">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-[#002147]">{school.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-medium text-[#002147]/70">{school.code}</td>
                    <td className="py-4 px-6">
                      <span className="px-3 py-1 bg-[#002147]/5 text-[#002147] rounded-full text-sm font-medium">
                        {school.curriculum || 'CBSE'}
                      </span>
                    </td>
                    <td className="py-4 px-6 flex items-center space-x-3">
                      <Link href={`/superadmin/schools/roster?id=${school.id}`} className="text-sm font-bold bg-[#002147]/5 text-[#002147] px-3 py-1.5 rounded-lg hover:bg-[#002147]/10 transition-colors">
                        View Roster
                      </Link>
                      <button className="text-sm font-semibold text-blue-600 hover:text-blue-800">Edit</button>
                    </td>
                  </tr>
                ))}
                {filteredSchools.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-[#002147]/50">No schools found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
