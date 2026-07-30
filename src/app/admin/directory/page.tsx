'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Search, ArrowLeft, GraduationCap, BookOpen, UserCheck, Shield, Trash2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthToken } from '@/lib/auth/getAuthToken';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  student_class?: string;
  branch?: string;
  custom_student_id?: string;
  assignments?: { class: string; subject: string }[];
  metadata?: { linkedStudents?: string[] };
}

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  student:  { label: 'Student',  color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: GraduationCap },
  teacher:  { label: 'Teacher',  color: 'bg-blue-100 text-blue-700 border-blue-200',           icon: BookOpen },
  parent:   { label: 'Parent',   color: 'bg-purple-100 text-purple-700 border-purple-200',     icon: UserCheck },
  admin:    { label: 'Admin',    color: 'bg-rose-100 text-rose-700 border-rose-200',           icon: Shield },
};

export default function AdminDirectoryPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<UserData[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'student' | 'teacher' | 'parent' | 'admin'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'admin')) router.push('/login');
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId) return;
    fetchUsers();
  }, [profile?.schoolId]);

  const fetchUsers = async () => {
    setFetching(true);
    setFetchError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/admin/users?schoolId=${profile!.schoolId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to load users');
      }
      const { users: data } = await res.json();
      setUsers(data || []);
    } catch (err: any) {
      setFetchError(err.message || 'Failed to load directory');
    } finally {
      setFetching(false);
    }
  };

  const handleDelete = async (u: UserData) => {
    if (!profile?.schoolId) return;
    if (u.id === profile.id) {
      alert('You cannot delete your own account.');
      return;
    }
    const confirmed = window.confirm(
      `⚠️ Delete "${u.name}" (${u.role})?\n\nThis will permanently remove their account and all associated data. This action CANNOT be undone.`
    );
    if (!confirmed) return;

    setDeletingId(u.id);
    setDeleteError('');
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: u.id, schoolId: profile.schoolId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      // Remove from local list instantly
      setUsers(prev => prev.filter(usr => usr.id !== u.id));
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete user');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Directory...</div>;

  const filtered = users.filter(u => {
    const matchSearch =
      (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.custom_student_id || '').toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === 'all' || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const counts = {
    all:     users.length,
    student: users.filter(u => u.role === 'student').length,
    teacher: users.filter(u => u.role === 'teacher').length,
    parent:  users.filter(u => u.role === 'parent').length,
    admin:   users.filter(u => u.role === 'admin').length,
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-4">
          <Link href="/admin" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147] shadow-sm">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-[#002147]">School Directory</h1>
            <p className="text-gray-500 text-sm mt-1">{users.length} total users registered</p>
          </div>
        </div>
        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email or ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>
      </div>

      {/* Role Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'student', 'teacher', 'parent', 'admin'] as const).map(r => (
          <button
            key={r}
            onClick={() => setFilterRole(r)}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
              filterRole === r
                ? 'bg-[#002147] text-white border-[#002147]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1) + 's'} ({counts[r]})
          </button>
        ))}
      </div>

      {/* Errors */}
      {fetchError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {fetchError}
        </div>
      )}
      {deleteError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {deleteError}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#002147]">
            {filterRole === 'all' ? 'All Users' : `${filterRole.charAt(0).toUpperCase() + filterRole.slice(1)}s`} ({filtered.length})
          </h2>
          <Users className="w-5 h-5 text-gray-400" />
        </div>

        {fetching ? (
          <div className="py-16 text-center text-gray-400">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
            Loading directory...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No users found</p>
            <p className="text-xs mt-1">Try a different search or filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Name</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Role</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Email</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Class / ID</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Details</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(u => {
                  const roleConf = ROLE_CONFIG[u.role] || ROLE_CONFIG.admin;
                  const RoleIcon = roleConf.icon;
                  const isDeleting = deletingId === u.id;
                  const isSelf = u.id === profile.id;

                  return (
                    <tr key={u.id} className={`transition-colors ${isDeleting ? 'opacity-40' : 'hover:bg-gray-50/50'}`}>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center font-bold text-gray-600 border border-gray-300 text-sm">
                            {(u.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="font-bold text-sm text-[#002147]">{u.name || '—'}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${roleConf.color}`}>
                          <RoleIcon className="w-3 h-3" />
                          {roleConf.label}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-gray-500">{u.email}</td>
                      <td className="p-4 text-xs text-gray-600">
                        {u.role === 'student' ? (
                          <div>
                            <div className="font-semibold">{u.student_class || u.branch || '—'}</div>
                            {u.custom_student_id && (
                              <div className="text-gray-400 font-mono mt-0.5">{u.custom_student_id}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="p-4 text-xs text-gray-500">
                        {u.role === 'teacher' && u.assignments && u.assignments.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {u.assignments.map((a, i) => (
                              <span key={i} className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md font-medium">
                                {a.subject} • {a.class}
                              </span>
                            ))}
                          </div>
                        ) : u.role === 'parent' && u.metadata?.linkedStudents?.length ? (
                          <span className="text-purple-600 font-medium">
                            Linked: {u.metadata.linkedStudents.join(', ')}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        {isSelf ? (
                          <span className="text-xs text-gray-400 font-medium">You</span>
                        ) : (
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={isDeleting || !!deletingId}
                            title={`Delete ${u.name}`}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isDeleting
                              ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                              : <Trash2 className="w-4 h-4" />
                            }
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
