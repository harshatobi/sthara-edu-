'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Search, Users, ArrowLeft, KeyRound, X, CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import Link from 'next/link';

interface GlobalUser {
  id: string;
  email: string;
  role: string;
  schoolId: string;
  name?: string;
}

// Default password for all new school users
export const DEFAULT_USER_PASSWORD = 'Sthara@123';

export default function GlobalDirectoryPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<GlobalUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Change password modal state
  const [changePwdUser, setChangePwdUser] = useState<GlobalUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const [changeSuccess, setChangeSuccess] = useState('');
  const [changeError, setChangeError] = useState('');

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) { setUsers([]); return; }

    setIsSearching(true);
    try {
      const q = searchQuery.trim().toLowerCase();
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`email.ilike.%${q}%,name.ilike.%${q}%,school_id.ilike.%${q}%`)
        .limit(30);

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

  const openChangePwd = (user: GlobalUser) => {
    setChangePwdUser(user);
    setNewPassword('');
    setShowPassword(false);
    setChangeError('');
    setChangeSuccess('');
  };

  const handleChangePassword = async () => {
    if (!changePwdUser || !newPassword.trim()) {
      setChangeError('Please enter a new password');
      return;
    }
    if (newPassword.length < 6) {
      setChangeError('Password must be at least 6 characters');
      return;
    }

    setIsChanging(true);
    setChangeError('');
    setChangeSuccess('');

    try {
      const authToken = await getAuthToken();
      const res = await fetch('/api/superadmin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ userId: changePwdUser.id, newPassword }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to change password');

      setChangeSuccess(`✅ Password for ${changePwdUser.email} changed successfully!`);
      setNewPassword('');
      setTimeout(() => {
        setChangePwdUser(null);
        setChangeSuccess('');
      }, 2000);
    } catch (err: any) {
      setChangeError(err.message || 'Failed to change password');
    } finally {
      setIsChanging(false);
    }
  };

  const roleBadgeColor: Record<string, string> = {
    superadmin: 'bg-purple-100 text-purple-700',
    admin: 'bg-orange-100 text-orange-700',
    teacher: 'bg-green-100 text-green-700',
    student: 'bg-blue-100 text-blue-700',
    parent: 'bg-pink-100 text-pink-700',
  };

  if (loading || !profile) return (
    <div className="p-10 text-center text-[#002147] font-medium flex items-center justify-center space-x-2">
      <Loader2 className="w-5 h-5 animate-spin" /><span>Loading Directory...</span>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">

      {/* Header */}
      <div className="flex items-center space-x-4">
        <Link href="/superadmin" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-[#002147]">Global User Directory</h1>
          <p className="text-gray-500 text-sm mt-1">Search & manage users across all institutions</p>
        </div>
      </div>

      {/* Default password info banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start space-x-3">
        <KeyRound className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-amber-800">Default Password for New Users</p>
          <p className="text-xs text-amber-700 mt-0.5">
            All newly onboarded school users get the default password:{' '}
            <code className="bg-amber-100 px-2 py-0.5 rounded font-mono font-bold text-amber-900">{DEFAULT_USER_PASSWORD}</code>
            {' '} — Users should change this on first login. Use the 🔑 button below to change any user's password.
          </p>
        </div>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by email, name, or school ID..."
            className="w-full pl-10 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>
        <button type="submit" disabled={isSearching}
          className="px-6 py-3.5 bg-[#002147] hover:bg-blue-900 disabled:opacity-60 text-white rounded-2xl font-bold text-sm shadow-md transition-all flex items-center space-x-2">
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          <span>Search</span>
        </button>
      </form>

      {/* Results */}
      {users.length > 0 && (
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#002147]">Results ({users.length})</h2>
            <div className="flex items-center space-x-1 text-xs text-gray-500">
              <Users className="w-4 h-4" />
              <span>Click 🔑 to change password</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Name</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Email</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Role</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">School ID</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4 font-bold text-sm text-[#002147]">{u.name || 'User'}</td>
                    <td className="p-4 text-xs text-gray-500">{u.email}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize ${roleBadgeColor[u.role] || 'bg-gray-100 text-gray-600'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="p-4 text-xs font-mono text-gray-400">{u.schoolId || '—'}</td>
                    <td className="p-4">
                      <button
                        onClick={() => openChangePwd(u)}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all"
                        title="Change Password"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Change Password</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {users.length === 0 && searchQuery && !isSearching && (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No users found for "{searchQuery}"</p>
        </div>
      )}

      {/* Change Password Modal */}
      {changePwdUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold text-[#002147]">Change Password</h3>
              <button onClick={() => setChangePwdUser(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 space-y-1">
              <p className="text-xs text-gray-500 font-medium">User</p>
              <p className="font-bold text-[#002147] text-sm">{changePwdUser.name || 'User'}</p>
              <p className="text-xs text-gray-500">{changePwdUser.email}</p>
              <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold capitalize mt-1 ${roleBadgeColor[changePwdUser.role] || 'bg-gray-100 text-gray-600'}`}>
                {changePwdUser.role}
              </span>
            </div>

            {changeError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-2xl">
                ⚠️ {changeError}
              </div>
            )}

            {changeSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-xs font-semibold rounded-2xl flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{changeSuccess}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">New Password</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 chars)"
                  className="w-full pl-11 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5 pl-1">Minimum 6 characters required</p>
            </div>

            <div className="flex space-x-3">
              <button onClick={() => setChangePwdUser(null)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-bold text-sm transition-all">
                Cancel
              </button>
              <button onClick={handleChangePassword} disabled={isChanging || !newPassword.trim()}
                className="flex-1 py-3 bg-[#002147] hover:bg-blue-900 disabled:opacity-60 text-white rounded-2xl font-bold text-sm transition-all flex items-center justify-center space-x-2">
                {isChanging
                  ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Changing...</span></>
                  : <><KeyRound className="w-4 h-4" /><span>Change Password</span></>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
