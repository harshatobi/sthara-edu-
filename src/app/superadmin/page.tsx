'use client';

import { useState, useEffect } from 'react';
import { Building2, Users, PlusCircle, X, Sparkles, Activity, Search, ShieldCheck, GraduationCap, School, Plus, Trash2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface SchoolItem {
  id: string;
  name: string;
  adminEmail: string;
  studentsCount: number;
  status: string;
  licenseTier: string;
  type?: 'school' | 'college';
}

export default function SuperAdminDashboard() {
  const router = useRouter();
  const { profile, loading: authLoading, signOut } = useAuth();
  const supabase = createClient();

  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingSchoolId, setDeletingSchoolId] = useState<string | null>(null);

  // Form State
  const [schoolCode, setSchoolCode] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [institutionType, setInstitutionType] = useState<'school' | 'college'>('school');
  const [branches, setBranches] = useState<string[]>(['Computer Science', 'Mechanical Engineering']);
  const [newBranch, setNewBranch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchSchools = async () => {
    try {
      const { data, error: fetchErr } = await supabase.from('schools').select('*');
      if (fetchErr) throw fetchErr;

      const schoolsList: SchoolItem[] = (data || []).map((doc) => ({
        id: doc.id,
        name: doc.name || 'Unnamed Institution',
        adminEmail: doc.settings?.adminEmail || 'N/A',
        studentsCount: 0,
        status: doc.settings?.active === false ? 'Inactive' : 'Active',
        licenseTier: 'Trial',
        type: doc.institution_type === 'college' ? 'college' : 'school',
      }));
      setSchools(schoolsList);
    } catch (err) {
      console.error("Error fetching schools", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, authLoading, router]);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isModalOpen]);

  useEffect(() => {
    if (profile?.role === 'superadmin') {
      fetchSchools();
    }
  }, [profile?.role]);

  const handleDeleteSchool = async (schoolId: string, schoolName: string) => {
    const confirmMsg = `⚠️ PERMANENTLY DELETE "${schoolName}" (${schoolId})?

This will delete:
• All assignments and student submissions
• All users, teachers, and admins
• All notifications, materials, and situations
• All AI chat history for every student
• The school/college itself

This CANNOT be undone. Type the school code to confirm:`;
    const typed = window.prompt(confirmMsg);
    if (typed !== schoolId) {
      if (typed !== null) alert('School code did not match. Deletion cancelled.');
      return;
    }
    setDeletingSchoolId(schoolId);
    try {
      const authToken = await getAuthToken();
      const res = await fetch('/api/admin/delete-school', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ schoolId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete school');

      alert(`School "${schoolName}" permanently deleted.`);
      setSchools(prev => prev.filter(s => s.id !== schoolId));
    } catch (err: any) {
      console.error('Delete school failed:', err);
      alert(`Deletion failed: ${err.message}`);
    } finally {
      setDeletingSchoolId(null);
    }
  };

  const handleAddBranch = () => {
    if (!newBranch.trim()) return;
    if (!branches.includes(newBranch.trim())) {
      setBranches([...branches, newBranch.trim()]);
    }
    setNewBranch('');
  };

  const handleRemoveBranch = (b: string) => {
    setBranches(branches.filter(x => x !== b));
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolCode.trim() || !institutionName.trim()) return;

    setIsSubmitting(true);
    setError('');

    try {
      const codeUpper = schoolCode.trim().toUpperCase();

      const { data, error: insertErr } = await supabase
        .from('schools')
        .insert({
          name: institutionName.trim(),
          institution_type: institutionType,
          settings: {
            code: codeUpper,
            adminEmail: adminEmail.trim().toLowerCase(),
            branches: institutionType === 'college' ? branches : [],
            active: true,
          },
        })
        .select('*')
        .single();

      if (insertErr) throw insertErr;

      setSchools(prev => [
        ...prev,
        {
          id: data.id,
          name: data.name,
          adminEmail: data.settings?.adminEmail || adminEmail.trim(),
          studentsCount: 0,
          status: 'Active',
          licenseTier: 'Trial',
          type: institutionType,
        },
      ]);

      setIsModalOpen(false);
      setSchoolCode('');
      setInstitutionName('');
      setAdminEmail('');
      setBranches(['Computer Science', 'Mechanical Engineering']);
    } catch (err: any) {
      console.error('Failed to create institution:', err);
      setError(err.message || 'Failed to create institution');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSchools = schools.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.adminEmail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading || !profile) return (
    <div className="min-h-screen bg-[#f8fafc] flex justify-center items-center">
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="text-[#002147] font-semibold tracking-wide">Loading SuperAdmin Control Panel...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-16 font-sans">
      {/* Header Banner */}
      <div className="bg-[#002147] text-white border-b border-indigo-900 shadow-md">
        <div className="max-w-[1200px] mx-auto px-6 py-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-white/10 rounded-2xl border border-white/20">
              <ShieldCheck className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
                <Sparkles className="w-4 h-4" />
                <span>Super Admin Portal</span>
              </div>
              <h1 className="text-3xl font-black tracking-tight">Sthara OS Platform Control</h1>
              <p className="text-sm font-medium text-blue-200 mt-0.5">Global Tenant Management & Provisioning</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-all shadow-md flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Provision Institution</span>
            </button>
            <button
              onClick={signOut}
              className="px-5 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl font-bold transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-8 space-y-8 animate-in fade-in duration-500">
        {/* Search & Stats Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search institutions..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Total Institutions: <span className="text-[#002147] font-black text-sm">{schools.length}</span>
          </div>
        </div>

        {/* Institutions Table */}
        <div className="bg-white border border-gray-200/60 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200/60 flex items-center justify-between bg-gray-50/50">
            <h2 className="text-lg font-bold text-[#002147]">Registered Institutions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50/80 border-b border-gray-200/60">
                <tr>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Institution</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Admin Contact</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400">Loading institutions...</td>
                  </tr>
                ) : filteredSchools.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400">No institutions found.</td>
                  </tr>
                ) : (
                  filteredSchools.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-[#002147]">{s.name}</div>
                        <div className="text-xs font-mono text-gray-400">ID: {s.id}</div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                          s.type === 'college' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200'
                        }`}>
                          {s.type === 'college' ? 'College / Univ' : 'K-12 School'}
                        </span>
                      </td>
                      <td className="p-4 font-medium text-gray-600 text-sm">{s.adminEmail}</td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                          {s.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleDeleteSchool(s.id, s.name)}
                          disabled={deletingSchoolId === s.id}
                          className="p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete Institution"
                        >
                          {deletingSchoolId === s.id ? <Loader2 className="w-4 h-4 animate-spin text-rose-600" /> : <Trash2 className="w-4 h-4" />}
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

      {/* Provision Institution Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-[#002147]">Provision Institution</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && <p className="text-red-600 text-xs font-semibold bg-red-50 p-3 rounded-xl border border-red-200">{error}</p>}

            <form onSubmit={handleCreateSchool} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Institution Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setInstitutionType('school')}
                    className={`py-3 rounded-xl border font-bold text-sm transition-all ${
                      institutionType === 'school'
                        ? 'bg-[#002147] text-white border-[#002147]'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    K-12 School
                  </button>
                  <button
                    type="button"
                    onClick={() => setInstitutionType('college')}
                    className={`py-3 rounded-xl border font-bold text-sm transition-all ${
                      institutionType === 'college'
                        ? 'bg-[#002147] text-white border-[#002147]'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    College / Univ
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Institution Name</label>
                <input
                  type="text"
                  required
                  value={institutionName}
                  onChange={e => setInstitutionName(e.target.value)}
                  placeholder="e.g. Delhi Public School"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">School Code</label>
                <input
                  type="text"
                  required
                  value={schoolCode}
                  onChange={e => setSchoolCode(e.target.value.toUpperCase())}
                  placeholder="e.g. DPS101"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Admin Email</label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={e => setAdminEmail(e.target.value)}
                  placeholder="admin@school.edu"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 bg-[#002147] hover:bg-indigo-900 text-white font-bold rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center justify-center space-x-2 mt-4"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                <span>{isSubmitting ? 'Provisioning...' : 'Create Institution'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
