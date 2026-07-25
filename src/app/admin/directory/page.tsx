'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Search, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  studentClass?: string;
}

export default function AdminDirectoryPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [users, setUsers] = useState<UserData[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'admin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId) return;

    const fetchUsers = async () => {
      setFetching(true);
      try {
        const { data: usersData } = await supabase
          .from('users')
          .select('*')
          .eq('school_id', profile.schoolId);

        const loaded: UserData[] = (usersData || []).map((u: any) => ({
          id: u.id,
          name: u.name || 'User',
          email: u.email,
          role: u.role,
          studentClass: u.student_class,
        }));

        setUsers(loaded);
      } catch (err: any) {
        console.error('[admin-directory] fetch error:', err);
      } finally {
        setFetching(false);
      }
    };

    fetchUsers();
  }, [profile?.schoolId]);

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Directory...</div>;

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-[#002147]">School User Directory</h1>
            <p className="text-gray-500 text-sm mt-1">Manage teachers, students, and parent profiles</p>
          </div>
        </div>

        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search directory..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-xl font-bold text-[#002147]">Users ({filtered.length})</h2>

        {fetching ? (
          <div className="py-12 text-center text-gray-400">Loading user directory...</div>
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
                {filtered.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50/50">
                    <td className="p-4 font-bold text-sm text-[#002147]">{u.name}</td>
                    <td className="p-4 text-xs text-gray-500">{u.email}</td>
                    <td className="p-4 text-xs font-bold capitalize text-indigo-600">{u.role}</td>
                    <td className="p-4 text-xs text-gray-500">{u.studentClass || 'N/A'}</td>
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
