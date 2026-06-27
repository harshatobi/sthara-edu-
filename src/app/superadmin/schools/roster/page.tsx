'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Users, ArrowLeft, Loader2, Search, Mail, Lock, BookOpen } from 'lucide-react';
import Link from 'next/link';

interface Student {
  id: string;
  name: string;
  email: string;
  role?: string;
  studentClass?: string;
  demoPassword?: string;
}

function SchoolRosterContent() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const schoolId = searchParams.get('id') as string;
  
  const [students, setStudents] = useState<Student[]>([]);
  const [schoolName, setSchoolName] = useState('Loading...');
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    const fetchRoster = async () => {
      setFetching(true);
      try {
        // Fetch school details
        const schoolDoc = await getDoc(doc(db, 'schools', schoolId));
        if (schoolDoc.exists()) {
          setSchoolName(schoolDoc.data().name);
        } else {
          setSchoolName('Unknown School');
        }

        // Fetch users (students and teachers)
        const q = query(collection(db, 'users'), where('schoolId', '==', schoolId));
        const snap = await getDocs(q);
        const list: Student[] = [];
        snap.forEach(d => {
          const data = d.data();
          if (data.role === 'student' || data.role === 'teacher') {
            list.push({ id: d.id, ...data } as Student);
          }
        });
        
        // Sort by role (teacher first), then class, then name
        list.sort((a, b) => {
          if (a.role !== b.role) return a.role === 'teacher' ? -1 : 1;
          if (a.studentClass === b.studentClass) {
            return a.name.localeCompare(b.name);
          }
          return (a.studentClass || '').localeCompare(b.studentClass || '');
        });

        setStudents(list);
      } catch (err) {
        console.error(err);
      } finally {
        setFetching(false);
      }
    };

    if (profile?.role === 'superadmin' && schoolId) {
      fetchRoster();
    }
  }, [profile, schoolId]);

  if (loading || !profile) return <div className="p-10 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[#002147]" /></div>;

  const filteredStudents = students.filter(s => 
    s.name?.toLowerCase().includes(search.toLowerCase()) || 
    s.email?.toLowerCase().includes(search.toLowerCase()) ||
    s.studentClass?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-[#002147]">{schoolName} - Roster</h1>
          <p className="text-[#002147]/60 mt-1">Total Enrolled: {students.length} students</p>
        </div>
        <Link href="/superadmin/schools" className="px-4 py-2 bg-white border border-[#002147]/10 rounded-xl text-[#002147] font-medium shadow-sm hover:bg-[#f8fafc] flex items-center space-x-2">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Schools</span>
        </Link>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/10">
        <div className="flex justify-between items-center mb-6">
          <div className="relative w-96">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-[#002147]/40" />
            <input 
              type="text" 
              placeholder="Search by name, email, or class..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl pl-10 pr-4 py-2 text-[#002147] outline-none focus:ring-2 focus:ring-[#002147]/20"
            />
          </div>
        </div>

        {fetching ? (
          <div className="py-20 text-center text-[#002147]/50">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[#002147]/40" />
            Loading student roster...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#002147]/10">
                  <th className="py-4 px-6 text-sm font-bold text-[#002147]/60 uppercase">Student Name</th>
                  <th className="py-4 px-6 text-sm font-bold text-[#002147]/60 uppercase">Role</th>
                  <th className="py-4 px-6 text-sm font-bold text-[#002147]/60 uppercase">Class</th>
                  <th className="py-4 px-6 text-sm font-bold text-[#002147]/60 uppercase">Login Email</th>
                  <th className="py-4 px-6 text-sm font-bold text-[#dc143c]/80 uppercase">Demo Password</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="border-b border-[#002147]/5 hover:bg-[#f8fafc] transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${student.role === 'teacher' ? 'bg-[#f59e0b]/10 text-[#f59e0b]' : 'bg-[#002147]/10 text-[#002147]'}`}>
                          <Users className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-[#002147]">{student.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${student.role === 'teacher' ? 'bg-[#f59e0b]/10 text-[#f59e0b]' : 'bg-[#002147]/5 text-[#002147]/60'}`}>
                        {student.role}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-2 text-[#002147]/80">
                        {student.studentClass ? (
                          <>
                            <BookOpen className="w-4 h-4 text-[#002147]/40" />
                            <span className="font-medium">{student.studentClass}</span>
                          </>
                        ) : (
                          <span className="text-[#002147]/40 italic text-sm">All Classes</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-2 text-[#002147]/80">
                        <Mail className="w-4 h-4 text-[#002147]/40" />
                        <span className="font-medium">{student.email}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-2 text-[#dc143c]">
                        <Lock className="w-4 h-4 opacity-50" />
                        <span className="font-mono font-bold tracking-wider">{student.demoPassword || 'Not Set'}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-[#002147]/50">No users found in this roster.</td>
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

export default function SchoolRoster() {
  return (
    <Suspense fallback={<div className="p-10 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[#002147]" /></div>}>
      <SchoolRosterContent />
    </Suspense>
  );
}
