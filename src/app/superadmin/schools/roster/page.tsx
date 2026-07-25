'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Search } from 'lucide-react';
import Link from 'next/link';

interface Student {
  id: string;
  name: string;
  email: string;
  role?: string;
  student_class?: string;
}

export default function SchoolRosterPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const schoolId = searchParams.get('id') as string;
  const supabase = createClient();

  const [students, setStudents] = useState<Student[]>([]);
  const [schoolName, setSchoolName] = useState('Institution');
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!schoolId) return;

    const fetchRoster = async () => {
      setFetching(true);
      try {
        const { data: schoolData } = await supabase
          .from('schools')
          .select('name')
          .eq('id', schoolId)
          .single();

        if (schoolData) setSchoolName(schoolData.name);

        const { data: usersData } = await supabase
          .from('users')
          .select('*')
          .eq('school_id', schoolId);

        setStudents(usersData || []);
      } catch (err: any) {
        console.error('[roster] error:', err);
      } finally {
        setFetching(false);
      }
    };

    fetchRoster();
  }, [schoolId]);

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Roster...</div>;

  const filteredStudents = students.filter(s =>
    (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/superadmin" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-[#002147]">{schoolName} — Roster</h1>
            <p className="text-gray-500 text-sm mt-1">School ID: {schoolId}</p>
          </div>
        </div>

        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search roster..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-xl font-bold text-[#002147]">Users Directory ({filteredStudents.length})</h2>

        {fetching ? (
          <div className="py-12 text-center text-gray-400">Loading roster...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Name</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Email</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Role</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Class</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStudents.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className="p-4 font-bold text-sm text-[#002147]">{s.name}</td>
                    <td className="p-4 text-xs text-gray-500">{s.email}</td>
                    <td className="p-4 text-xs font-bold capitalize text-indigo-600">{s.role || 'user'}</td>
                    <td className="p-4 text-xs text-gray-500">{s.student_class || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
