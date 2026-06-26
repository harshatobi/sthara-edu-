'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, setDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Building2, Users, ArrowLeft, Loader2, Search, Database, PlusCircle, X, Edit2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface School {
  id: string;
  name: string;
  code: string;
  curriculum: string;
  adminEmail?: string;
  studentsCount?: number;
  status?: string;
  licenseTier?: string;
}

export default function ManageSchools() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  
  const [schools, setSchools] = useState<School[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  
  // Form State
  const [currentSchool, setCurrentSchool] = useState<School | null>(null);
  const [schoolCode, setSchoolCode] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [curriculum, setCurriculum] = useState('CBSE');
  const [adminEmail, setAdminEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  const handleAddSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    if (!schoolCode || !institutionName) {
      setError("Please fill all required fields");
      setIsSubmitting(false);
      return;
    }

    try {
      await setDoc(doc(db, 'schools', schoolCode.toUpperCase()), {
        name: institutionName,
        code: schoolCode.toUpperCase(),
        curriculum,
        adminEmail: adminEmail || '',
        studentsCount: 0,
        status: 'Active',
        licenseTier: 'Pro',
        createdAt: serverTimestamp()
      });

      await fetchSchools();
      setIsAddModalOpen(false);
      setSchoolCode('');
      setInstitutionName('');
      setAdminEmail('');
      setCurriculum('CBSE');
    } catch (err: any) {
      setError(err.message || "Failed to onboard school");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (school: School) => {
    setCurrentSchool(school);
    setSchoolCode(school.id);
    setInstitutionName(school.name);
    setCurriculum(school.curriculum || 'CBSE');
    setAdminEmail(school.adminEmail || '');
    setIsEditModalOpen(true);
  };

  const handleEditSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSchool) return;
    
    setIsSubmitting(true);
    setError('');

    try {
      const schoolRef = doc(db, 'schools', currentSchool.id);
      await updateDoc(schoolRef, {
        name: institutionName,
        curriculum,
        adminEmail
      });

      await fetchSchools();
      setIsEditModalOpen(false);
      setCurrentSchool(null);
    } catch (err: any) {
      setError(err.message || "Failed to update school");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateData = async () => {
    setIsDemoModalOpen(false);
    setGenerating(true);
    setSuccess('');
    setError('');
    
    try {
      const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      if (!apiKey) throw new Error("Firebase API Key is not configured for authentication.");

      const SCHOOLS = [
        { id: 'sch-dps', name: 'Delhi Public School', code: 'DPS101', curriculum: 'CBSE' },
        { id: 'sch-oak', name: 'Oakridge International', code: 'OAK202', curriculum: 'State Board' }
      ];
      const CLASSES = ['10A', '10B'];
      const STUDENTS_PER_CLASS = 30; // Total 60 per school -> 120 total
      const TEACHERS_PER_SCHOOL = 2; // Total 4 total

      for (const school of SCHOOLS) {
        await setDoc(doc(db, 'schools', school.id), {
          name: school.name,
          code: school.code,
          curriculum: school.curriculum,
          studentsCount: STUDENTS_PER_CLASS * CLASSES.length,
          status: 'Active',
          licenseTier: 'Pro',
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
            await setDoc(doc(db, 'global_users', uid), {
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
              await setDoc(doc(db, 'global_users', uid), {
                name: `Student ${globalCounter} (${school.code})`,
                email, role: 'student', schoolId: school.id, studentClass: className,
                demoPassword: password, createdAt: serverTimestamp()
              });
            }
            globalCounter++;
          }
        }
      }
      setSuccess('Demo data generated successfully!');
      fetchSchools();
    } catch (err: any) {
      setError(`Error generating data: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
    </div>
  );

  const filteredSchools = schools.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || (s.code && s.code.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#002147]">School Management</h1>
          <p className="text-gray-500 mt-1 font-medium">Manage partner schools and assigned curriculums.</p>
        </div>
        <Link href="/superadmin" className="px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-[#002147] font-bold shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center space-x-2">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Overview</span>
        </Link>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200/60">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-5 h-5 absolute left-4 top-3 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search schools..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-[#002147] outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
            />
          </div>
          <div className="flex space-x-3 w-full sm:w-auto">
            <button 
              onClick={() => setIsDemoModalOpen(true)} 
              disabled={generating}
              className="flex-1 sm:flex-none px-5 py-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-orange-500/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-70"
            >
              {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
              <span>{generating ? 'Generating...' : 'Generate Demo Data'}</span>
            </button>
            <button 
              onClick={() => {
                setSchoolCode(''); setInstitutionName(''); setCurriculum('CBSE'); setAdminEmail('');
                setIsAddModalOpen(true);
              }}
              className="flex-1 sm:flex-none px-5 py-3 bg-gradient-to-r from-[#002147] to-indigo-900 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-indigo-900/20 transition-all flex items-center justify-center space-x-2"
            >
              <PlusCircle className="w-5 h-5" />
              <span className="whitespace-nowrap">Add New School</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 font-bold flex items-center space-x-2 animate-in fade-in">
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 font-bold flex items-center space-x-2 animate-in fade-in">
            <CheckCircle2 className="w-5 h-5" />
            <span>{success}</span>
          </div>
        )}

        {fetching ? (
          <div className="py-20 text-center text-gray-500 font-bold flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-500" />
            Loading schools directory...
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">School Name</th>
                  <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Code / ID</th>
                  <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Curriculum</th>
                  <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSchools.map((school) => (
                  <tr key={school.id} className="hover:bg-indigo-50/30 transition-colors group">
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-4">
                        <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-[#002147]">{school.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-black text-gray-600 tracking-wider">{school.code || school.id}</td>
                    <td className="py-4 px-6">
                      <span className="px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-xs font-bold tracking-wide">
                        {school.curriculum || 'CBSE'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end space-x-3">
                        <button 
                          onClick={() => openEditModal(school)}
                          className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit School"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <Link 
                          href={`/superadmin/schools/manage?id=${school.id}`} 
                          className="text-sm font-bold bg-gray-50 text-[#002147] border border-gray-200 px-4 py-2 rounded-xl hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-all flex items-center space-x-2"
                        >
                          <Users className="w-4 h-4" />
                          <span>View Roster</span>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSchools.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-gray-400 font-medium">No schools found matching your search.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Demo Data Modal */}
      {isDemoModalOpen && (
        <div className="fixed inset-0 bg-[#001229]/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-orange-50">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-orange-100 rounded-xl">
                  <Database className="w-5 h-5 text-orange-600" />
                </div>
                <h3 className="text-xl font-black text-[#002147]">Generate Demo Data</h3>
              </div>
              <button onClick={() => setIsDemoModalOpen(false)} className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8">
              <p className="text-[#002147] font-medium mb-6">
                This action will automatically generate <strong>2 Partner Schools</strong> along with <strong>120 Students</strong> and <strong>4 Teachers</strong>. This requires Firebase Auth API keys to be configured.
              </p>
              <div className="flex space-x-3">
                <button onClick={() => setIsDemoModalOpen(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors">Cancel</button>
                <button onClick={handleGenerateData} className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors">Proceed</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add School Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#001229]/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-100 rounded-xl">
                  <PlusCircle className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="text-xl font-black text-[#002147]">Add New School</h3>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8">
              <form onSubmit={handleAddSchool} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-[#002147]">Institution Name</label>
                  <input
                    type="text"
                    required
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-[#002147]">School Code (Unique ID)</label>
                  <input
                    type="text"
                    required
                    value={schoolCode}
                    onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-black focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all uppercase"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-[#002147]">Curriculum</label>
                  <select
                    value={curriculum}
                    onChange={(e) => setCurriculum(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    <option value="CBSE">CBSE</option>
                    <option value="ICSE">ICSE</option>
                    <option value="State Board">State Board</option>
                    <option value="IB">IB</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-[#002147]">Primary Admin Email (Optional)</label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-[#002147] to-indigo-900 text-white py-4 rounded-xl font-black hover:shadow-lg transition-all mt-6 disabled:opacity-70 flex justify-center items-center space-x-2"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Add Institution</span>}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit School Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-[#001229]/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-100 rounded-xl">
                  <Edit2 className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="text-xl font-black text-[#002147]">Edit School</h3>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8">
              <form onSubmit={handleEditSchool} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-[#002147]">Institution Name</label>
                  <input
                    type="text"
                    required
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-[#002147]">School Code (Immutable)</label>
                  <input
                    type="text"
                    disabled
                    value={schoolCode}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-400 font-black cursor-not-allowed uppercase"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-[#002147]">Curriculum</label>
                  <select
                    value={curriculum}
                    onChange={(e) => setCurriculum(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    <option value="CBSE">CBSE</option>
                    <option value="ICSE">ICSE</option>
                    <option value="State Board">State Board</option>
                    <option value="IB">IB</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-[#002147]">Primary Admin Email</label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-[#002147] to-indigo-900 text-white py-4 rounded-xl font-black hover:shadow-lg transition-all mt-6 disabled:opacity-70 flex justify-center items-center space-x-2"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Save Changes</span>}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
