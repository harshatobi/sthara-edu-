'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Search, Users, ArrowLeft, Mail } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs, orderBy, limit, where } from 'firebase/firestore';
import Link from 'next/link';

interface GlobalUser {
  id: string;
  email: string;
  role: string;
  schoolId: string;
}

export default function GlobalDirectoryPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  
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
      // In Firestore, searching by prefix requires a range query. 
      // For a simple directory search, we might just query the collection where email == searchQuery or similar.
      // We will do a full fetch and filter locally for this demo, or a where query if exact.
      // Here we'll just fetch a limit of users and filter.
      const usersRef = collection(db, 'global_users');
      const q = query(usersRef, limit(100)); // Limiting to 100 for safety
      const snap = await getDocs(q);
      
      const results: GlobalUser[] = [];
      snap.forEach(doc => {
        const data = doc.data() as GlobalUser;
        if (
          data.email?.toLowerCase().includes(searchQuery.toLowerCase()) || 
          data.schoolId?.toLowerCase().includes(searchQuery.toLowerCase())
        ) {
          results.push({ id: doc.id, ...data });
        }
      });
      setUsers(results);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading Directory...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto py-8 px-4">
      <div className="flex items-center space-x-4 mb-8">
        <Link href="/superadmin" className="p-2 bg-white rounded-full border border-[#002147]/10 hover:bg-[#f8fafc] transition-colors text-[#002147]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-[#002147]">Global Directory Search</h1>
          <p className="text-[#002147]/60 mt-1">Locate and manage any user across the Sthara network.</p>
        </div>
      </div>

      <div className="bg-white border border-[#002147]/10 p-6 rounded-2xl shadow-sm">
        <form onSubmit={handleSearch} className="flex space-x-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-[#002147]/40" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by exact email or school ID..."
              className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl pl-12 pr-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
            />
          </div>
          <button 
            type="submit"
            className="bg-[#002147] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#002147]/90 transition-colors shadow-sm"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#002147]/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[#002147]/80">
            <thead className="bg-[#f8fafc] text-xs uppercase font-semibold text-[#002147]/60 border-b border-[#002147]/10">
              <tr>
                <th className="px-6 py-4">UID</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">School ID</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[#002147]/50">
                    <Users className="w-10 h-10 mx-auto text-[#002147]/20 mb-3" />
                    <p>Enter a search query to find users.</p>
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className="border-b border-[#002147]/5 hover:bg-[#f8fafc] transition-colors">
                    <td className="px-6 py-4 font-mono text-xs">{u.id}</td>
                    <td className="px-6 py-4 font-medium flex items-center space-x-2">
                      <Mail className="w-4 h-4 text-[#002147]/40" />
                      <span>{u.email}</span>
                    </td>
                    <td className="px-6 py-4 capitalize">
                      <span className="bg-[#002147]/5 text-[#002147] px-2.5 py-0.5 rounded-full text-xs font-semibold">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold">{u.schoolId}</td>
                    <td className="px-6 py-4">
                      <button className="text-[#002147]/60 hover:text-[#002147] font-semibold text-xs border border-[#002147]/20 px-3 py-1 rounded-lg">
                        Manage
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
