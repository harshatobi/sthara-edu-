'use client';

import { useState, useEffect } from 'react';
import { Building2, Users, FileVideo, PlusCircle, X, Globe, Sparkles, Activity, Search, ShieldCheck, GraduationCap, School, Plus, Trash2 } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface School {
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
  const { profile, loading: authLoading } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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
      const querySnapshot = await getDocs(collection(db, 'schools'));
      const schoolsList: School[] = [];
      querySnapshot.forEach((doc) => {
        schoolsList.push({ id: doc.id, ...doc.data() } as School);
      });
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

  // Lock background scroll when modal is open
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


  const handleOnboardSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    if (!schoolCode || !institutionName || !adminEmail) {
      setError('Please fill all fields');
      setIsSubmitting(false);
      return;
    }
    if (institutionType === 'college' && branches.length === 0) {
      setError('Please add at least one branch for the college');
      setIsSubmitting(false);
      return;
    }

    try {
      await setDoc(doc(db, 'schools', schoolCode.toUpperCase()), {
        name: institutionName,
        adminEmail,
        type: institutionType,
        ...(institutionType === 'college' ? { branches } : {}),
        studentsCount: 0,
        status: 'Active',
        licenseTier: 'Pro',
        createdAt: serverTimestamp(),
      });

      await fetchSchools();
      setIsModalOpen(false);
      setSchoolCode('');
      setInstitutionName('');
      setAdminEmail('');
      setInstitutionType('school');
      setBranches(['Computer Science', 'Mechanical Engineering']);
    } catch (err: any) {
      setError(err.message || 'Failed to onboard institution');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16 font-sans">
      {/* Premium Header */}
      <div className="bg-white border-b border-gray-200/60 shadow-sm sticky top-0 z-40 backdrop-blur-xl bg-white/80">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gradient-to-br from-[#002147] to-indigo-900 rounded-2xl shadow-inner border border-indigo-400/30">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2 text-indigo-600 text-xs font-bold uppercase tracking-wider mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>Super Admin Portal</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-[#002147]">Global Overview</h1>
              <p className="text-sm font-medium text-gray-500 mt-0.5">Platform-wide metrics across all onboarded institutions.</p>
            </div>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="group bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-6 py-3 rounded-xl text-sm font-bold flex items-center space-x-2 hover:shadow-lg hover:shadow-emerald-500/30 transition-all overflow-hidden relative"
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform"></div>
            <PlusCircle className="w-5 h-5 relative z-10" />
            <span className="relative z-10">Onboard New School</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-8 animate-in fade-in duration-500">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200/60 flex items-center space-x-5 relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-50 rounded-full blur-2xl -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform"></div>
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl relative z-10">
              <Building2 className="w-8 h-8 text-indigo-600" />
            </div>
            <div className="relative z-10">
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wider">Total Schools</p>
              <p className="text-4xl font-black text-[#002147] mt-1">{loading ? '...' : schools.length}</p>
            </div>
          </div>

          <Link href="/superadmin/directory" className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200/60 flex items-center space-x-5 relative overflow-hidden group cursor-pointer hover:border-emerald-200 transition-colors">
            <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-50 rounded-full blur-2xl -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform"></div>
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl relative z-10 group-hover:scale-110 transition-transform">
              <Users className="w-8 h-8 text-emerald-600" />
            </div>
            <div className="relative z-10">
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wider">Global Directory</p>
              <div className="flex items-center space-x-2 mt-1">
                <p className="text-2xl font-bold text-[#002147]">View All</p>
                <div className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">Live</div>
              </div>
            </div>
          </Link>

          <Link href="/superadmin/content" className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200/60 flex items-center space-x-5 relative overflow-hidden group cursor-pointer hover:border-purple-200 transition-colors">
            <div className="absolute right-0 top-0 w-32 h-32 bg-purple-50 rounded-full blur-2xl -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform"></div>
            <div className="p-4 bg-purple-50 border border-purple-100 rounded-2xl relative z-10 group-hover:scale-110 transition-transform">
              <FileVideo className="w-8 h-8 text-purple-600" />
            </div>
            <div className="relative z-10">
              <p className="text-sm text-gray-500 font-bold uppercase tracking-wider">Global Video CMS</p>
              <p className="text-2xl font-bold text-[#002147] mt-1">Manage</p>
            </div>
          </Link>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200/60 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
            <Activity className="w-64 h-64 text-gray-400" />
          </div>
          
          <div className="p-6 border-b border-gray-100 flex justify-between items-center relative z-10 bg-white/50 backdrop-blur-sm">
            <div>
              <h2 className="text-xl font-bold text-[#002147]">Recent Onboardings</h2>
              <p className="text-sm text-gray-500 font-medium">Manage and monitor all institutions in your network.</p>
            </div>
            <div className="bg-gray-100 p-2 rounded-xl flex items-center space-x-2">
              <Search className="w-5 h-5 text-gray-400 ml-2" />
              <input type="text" placeholder="Search schools..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-transparent border-none focus:ring-0 text-sm font-medium w-48 text-[#002147]" />
            </div>
          </div>

          <div className="overflow-x-auto relative z-10">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4">Code</th>
                  <th className="px-6 py-4">Institution Name</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Admin Email</th>
                  <th className="px-6 py-4">Students</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">License</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                        <p className="text-indigo-600 font-bold">Loading Network Data...</p>
                      </div>
                    </td>
                  </tr>
                ) : schools.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400 font-medium">
                      No schools onboarded yet. Click "Onboard New School" to start.
                    </td>
                  </tr>
                ) : (
                  schools.filter(s =>
                    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    s.id?.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((school) => (
                    <tr 
                      key={school.id} 
                      onClick={() => router.push(`/superadmin/schools/manage?id=${school.id}`)}
                      className="hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-5 font-black text-[#002147] tracking-wider">{school.id}</td>
                      <td className="px-6 py-5 font-bold text-gray-700">{school.name}</td>
                      <td className="px-6 py-5">
                        {school.type === 'college' ? (
                          <span className="inline-flex items-center space-x-1 bg-violet-50 text-violet-700 text-xs font-bold px-2.5 py-1 rounded-full border border-violet-200">
                            <GraduationCap className="w-3 h-3" /><span>College</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-200">
                            <School className="w-3 h-3" /><span>School</span>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-gray-500">{school.adminEmail}</td>
                      <td className="px-6 py-5 font-semibold text-gray-700">{school.studentsCount || 0}</td>
                      <td className="px-6 py-5">
                        <div className="inline-flex items-center space-x-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-200">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                          <span>{school.status}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="bg-purple-50 text-purple-700 text-xs font-bold px-2.5 py-1 rounded-full border border-purple-200 flex inline-flex items-center space-x-1">
                          <Sparkles className="w-3 h-3 text-purple-500" />
                          <span>{school.licenseTier || 'Pro'}</span>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modern Glassmorphic Onboarding Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#001229]/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-100 rounded-xl">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="text-xl font-black text-[#002147]">New Institution</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 overscroll-contain">
              <form onSubmit={handleOnboardSchool} className="space-y-5">

                {/* Institution Type Selector */}
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[#002147]">Institution Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setInstitutionType('school')}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all font-bold text-sm ${
                        institutionType === 'school'
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-indigo-200'
                      }`}
                    >
                      <School className="w-6 h-6" />
                      <span>School</span>
                      <span className="text-xs font-normal opacity-70">Classes & Sections</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInstitutionType('college')}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all font-bold text-sm ${
                        institutionType === 'college'
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-violet-200'
                      }`}
                    >
                      <GraduationCap className="w-6 h-6" />
                      <span>College</span>
                      <span className="text-xs font-normal opacity-70">Branches & Semesters</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-[#002147]">Institution Name</label>
                  <input
                    type="text"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    placeholder={institutionType === 'college' ? 'e.g. Sthara Institute of Technology' : 'e.g. Sthara Demo Academy'}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-[#002147]">{institutionType === 'college' ? 'College' : 'School'} Code (Unique ID)</label>
                  <input
                    type="text"
                    value={schoolCode}
                    onChange={(e) => setSchoolCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="e.g. SIT-001"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-black focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm uppercase tracking-wider"
                  />
                  <p className="text-xs text-gray-500 font-medium">This code will be used by students and professors to log in.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-[#002147]">Primary Admin Email</label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@institution.edu"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                  />
                </div>

                {/* College-only: Branches */}
                {institutionType === 'college' && (
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-[#002147]">Branches / Departments</label>
                    <div className="space-y-2">
                      {branches.map((branch, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="flex-1 bg-violet-50 border border-violet-200 text-violet-800 text-sm font-semibold px-3 py-2 rounded-lg">{branch}</span>
                          <button
                            type="button"
                            onClick={() => setBranches(branches.filter((_, idx) => idx !== i))}
                            className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newBranch}
                          onChange={(e) => setNewBranch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (newBranch.trim()) { setBranches([...branches, newBranch.trim()]); setNewBranch(''); }
                            }
                          }}
                          placeholder="Add a branch (e.g. Civil Engineering)"
                          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                        />
                        <button
                          type="button"
                          onClick={() => { if (newBranch.trim()) { setBranches([...branches, newBranch.trim()]); setNewBranch(''); } }}
                          className="p-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 font-bold text-sm flex items-center space-x-2 animate-in fade-in">
                    <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    <span>{error}</span>
                  </div>
                )}
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full text-white py-4 rounded-xl font-black hover:shadow-lg transition-all mt-6 disabled:opacity-70 flex justify-center items-center space-x-2 ${
                    institutionType === 'college'
                      ? 'bg-gradient-to-r from-violet-600 to-purple-700 hover:shadow-violet-500/20'
                      : 'bg-gradient-to-r from-[#002147] to-indigo-900 hover:shadow-indigo-900/20'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>Creating Institution...</span>
                    </>
                  ) : (
                    <span>Onboard {institutionType === 'college' ? '🎓 College' : '🏫 School'}</span>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
