'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Search, Users, ArrowLeft, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface GlobalUser {
  id: string;
  email: string;
  role: string;
  schoolId: string;
  name?: string;
}

export default function GlobalDirectoryPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<GlobalUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      setUsers([]);
      return;
    }

    setIsSearching(true);
    try {
      const q = searchQuery.trim().toLowerCase();
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`email.ilike.%${q}%,name.ilike.%${q}%`)
        .limit(20);

      if (error) throw error;

      setUsers((data || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        schoolId: u.school_id,
        name: u.name,
      })));
    } catch (err: any) {
      console.error('[global-directory] search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Directory...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center space-x-4">
        <Link href="/superadmin" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-[#002147]">Global User Directory</h1>
          <p className="text-gray-500 text-sm mt-1">Cross-tenant user search across all registered institutions</p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by email or name..."
            className="w-full pl-10 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>
        <button
          type="submit"
          className="px-6 py-3.5 bg-[#002147] hover:bg-blue-900 text-white rounded-2xl font-bold text-sm shadow-md transition-all"
        >
          Search
        </button>
      </form>

      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-xl font-bold text-[#002147]">Search Results ({users.length})</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="p-4 font-bold text-xs text-gray-500 uppercase">Name</th>
                <th className="p-4 font-bold text-xs text-gray-500 uppercase">Email</th>
                <th className="p-4 font-bold text-xs text-gray-500 uppercase">Role</th>
                <th className="p-4 font-bold text-xs text-gray-500 uppercase">School ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50/50">
                  <td className="p-4 font-bold text-sm text-[#002147]">{u.name || 'User'}</td>
                  <td className="p-4 text-xs text-gray-500">{u.email}</td>
                  <td className="p-4 text-xs font-bold capitalize text-indigo-600">{u.role}</td>
                  <td className="p-4 text-xs font-mono text-gray-400">{u.schoolId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
