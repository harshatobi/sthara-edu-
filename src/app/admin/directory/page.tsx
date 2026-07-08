'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, UserPlus, Trash2, Plus, Link as LinkIcon,
  CheckSquare, Square, GraduationCap, ShieldAlert,
  Sparkles, ChevronRight, Loader2, BookOpen, Search,
  Filter, ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, collection, getDocs, setDoc, deleteDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

interface TeacherAssignment { class: string; subject: string; }
interface UserData {
  id: string; name: string; email: string; role: string;
  studentClass?: string; customStudentId?: string;
  assignments?: TeacherAssignment[]; linkedStudents?: string[];
}

function getRoleBadgeStyle(role: string) {
  switch (role) {
    case 'admin':    return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'teacher':  return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'student':  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'parent':   return 'bg-amber-50 text-amber-700 border-amber-200';
    default:         return 'bg-gray-50 text-gray-600 border-gray-200';
  }
}

export default function AdminDirectory() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<UserData[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');

  // Add user form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'student' | 'teacher' | 'admin' | 'parent'>('student');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [studentClass, setStudentClass] = useState('');
  // College-specific student fields
  const [branch, setBranch] = useState('');
  const [semester, setSemester] = useState('');
  const [year, setYear] = useState('');
  const [institutionType, setInstitutionType] = useState<'school' | 'college'>('school');
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([{ class: '', subject: '' }]);
  const [selectedStudentsForParent, setSelectedStudentsForParent] = useState<string[]>([]);


  useEffect(() => {
    if (!authLoading && (!profile || profile.role !== 'admin')) router.push('/login');
  }, [profile, authLoading, router]);

  const fetchUsers = async () => {
    if (!profile?.schoolId) return;
    setLoadingUsers(true);
    try {
      // Also fetch institution type from school doc
      const schoolDoc = await getDoc(doc(db, 'schools', profile.schoolId));
      if (schoolDoc.exists()) {
        setInstitutionType(schoolDoc.data().type === 'college' ? 'college' : 'school');
      }
      const [usersSnap, globalSnap] = await Promise.all([

        getDocs(query(collection(db, 'users'), where('schoolId', '==', profile.schoolId))),
        getDocs(query(collection(db, 'global_users'), where('schoolId', '==', profile.schoolId))),
      ]);
      const seen = new Set<string>();
      const list: UserData[] = [];
      const add = (id: string, data: any) => {
        if (!seen.has(id)) { seen.add(id); list.push({ id, ...data } as UserData); }
      };
      usersSnap.forEach(d => add(d.id, d.data()));
      globalSnap.forEach(d => add(d.id, d.data()));
      setUsers(list);
    } catch (e) { console.error(e); }
    finally { setLoadingUsers(false); }
  };

  useEffect(() => { fetchUsers(); }, [profile?.schoolId]);

  const allStudents = users.filter(u => u.role === 'student' && u.customStudentId);

  const filtered = useMemo(() => {
    return users.filter(u => {
      const matchRole = filterRole === 'all' || u.role === filterRole;
      const q = search.toLowerCase();
      const matchSearch = !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
      return matchRole && matchSearch;
    });
  }, [users, search, filterRole]);

  const handleDeleteUser = async (uid: string) => {
    if (!confirm('Remove this user from the school?')) return;
    try {
      await Promise.allSettled([
        deleteDoc(doc(db, 'users', uid)),
        deleteDoc(doc(db, 'global_users', uid)),
      ]);
      setUsers(prev => prev.filter(u => u.id !== uid));
    } catch (e: any) { alert('Delete failed: ' + e.message); }
  };

  const handleAssignmentChange = (idx: number, field: 'class' | 'subject', value: string) => {
    setTeacherAssignments(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccessMsg(''); setIsCreating(true);
    try {
      const firebaseConfig = JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_CONFIG || '{}');
      let secondaryApp;
      try { secondaryApp = getApp('secondary'); } catch { secondaryApp = initializeApp(firebaseConfig, 'secondary'); }
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const newUid = cred.user.uid;
      await signOut(secondaryAuth);

      const userData: any = {
        name, email, role, schoolId: profile!.schoolId,
        createdAt: serverTimestamp(),
      };
      if (role === 'student') {
        if (institutionType === 'college') {
          userData.branch = branch.trim();
          userData.semester = semester.trim();
          userData.year = year.trim();
          const branchKey = branch.trim().replace(/\s+/g, '').slice(0, 6).toUpperCase();
          userData.customStudentId = `${profile!.schoolId}-${branchKey}-${Date.now()}`;
        } else {
          userData.studentClass = studentClass;
          userData.customStudentId = `STU-${Date.now()}`;
        }
      } else if (role === 'teacher') {

        userData.assignments = teacherAssignments.filter(a => a.class && a.subject);
        userData.subjectsTaught = [...new Set(teacherAssignments.map(a => a.subject).filter(Boolean))];
      } else if (role === 'parent') {
        userData.linkedStudents = selectedStudentsForParent;
      }

      await setDoc(doc(db, 'users', newUid), userData);
      await setDoc(doc(db, 'global_users', newUid), userData);

      setSuccessMsg(`✓ Account created for ${name}`);
      setEmail(''); setPassword(''); setName(''); setStudentClass('');
      setBranch(''); setSemester(''); setYear('');
      setTeacherAssignments([{ class: '', subject: '' }]);

      setSelectedStudentsForParent([]);
      setRole('student');
      fetchUsers();
    } catch (e: any) {
      setError(e.message || 'Failed to create account.');
    } finally { setIsCreating(false); }
  };

  if (authLoading || !profile) {
    return <div className="flex justify-center items-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-[#002147] text-white pt-10 pb-16 px-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        <div className="max-w-[1200px] mx-auto relative z-10 flex items-center gap-4">
          <Link href="/admin" className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-1">
              <Users className="w-3 h-3" />
              <span>Admin · Directory</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">User Directory</h1>
            <p className="text-white/60 text-sm mt-1">Manage all students, teachers and staff</p>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 -mt-8 relative z-10 space-y-8 animate-in fade-in duration-500">

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {['all','student','teacher','admin'].map(r => {
            const count = r === 'all' ? users.length : users.filter(u => u.role === r).length;
            const colors: Record<string, string> = {
              all: 'bg-white border-gray-200 text-gray-700',
              student: 'bg-emerald-50 border-emerald-200 text-emerald-700',
              teacher: 'bg-blue-50 border-blue-200 text-blue-700',
              admin: 'bg-purple-50 border-purple-200 text-purple-700',
            };
            return (
              <button
                key={r}
                onClick={() => setFilterRole(r)}
                className={`rounded-2xl border p-4 text-left transition-all shadow-sm hover:shadow-md ${colors[r]} ${filterRole === r ? 'ring-2 ring-offset-1 ring-indigo-400' : ''}`}
              >
                <p className="text-2xl font-black">{count}</p>
                <p className="text-xs font-bold uppercase tracking-wider mt-1 opacity-70">
                  {r === 'all' ? 'Total Users' : r + 's'}
                </p>
              </button>
            );
          })}
        </div>

        {/* Directory Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden">
          {/* Table header with search */}
          <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <h2 className="text-lg font-bold text-[#002147]">Directory</h2>
              <p className="text-sm text-gray-500">{filtered.length} {filterRole === 'all' ? 'users' : filterRole + 's'} found</p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search name or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-full sm:w-64"
              />
            </div>
          </div>

          {loadingUsers ? (
            <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-400" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50/80 border-b border-gray-200/60">
                  <tr>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Details</th>
                    <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-blue-200 flex items-center justify-center text-indigo-700 font-black border border-indigo-200 text-sm shadow-inner">
                            {(u.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-[#002147]">{u.name}</p>
                            {u.customStudentId && <p className="text-xs text-gray-400 font-mono">{u.customStudentId}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${getRoleBadgeStyle(u.role)}`}>
                          {u.role?.charAt(0).toUpperCase() + u.role?.slice(1)}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-500 font-medium">{u.email}</td>
                      <td className="p-4 text-sm text-gray-500">
                        {u.studentClass && <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md text-xs font-bold border border-emerald-200">Class {u.studentClass}</span>}
                        {u.assignments && u.assignments.length > 0 && (
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-xs font-bold border border-blue-200">
                            {u.assignments.length} class{u.assignments.length > 1 ? 'es' : ''}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
                          title="Remove User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-12 text-center">
                        <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-400 font-medium">No users found</p>
                        <p className="text-gray-400 text-sm mt-1">Try adjusting your search or filter</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add User Form */}
        <div className="bg-white border border-gray-200/60 p-8 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
              <UserPlus className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#002147]">Add New Account</h2>
              <p className="text-sm font-medium text-gray-500 mt-0.5">Provision access for students, teachers, parents, or admins</p>
            </div>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-6 max-w-3xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-gray-600">Account Type</label>
                <div className="relative">
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as any)}
                    className="w-full appearance-none bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl pl-4 pr-10 py-3.5 text-[#002147] font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                  >
                    <option value="student">Student Account</option>
                    <option value="teacher">Teacher Account</option>
                    <option value="parent">Parent Account</option>
                    <option value="admin">Administrator Account</option>
                  </select>
                  <ChevronRight className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none rotate-90" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-gray-600">Full Name</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g., John Doe"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-gray-600">Login Email</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="john.doe@school.edu"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-gray-600">Initial Password</label>
                <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimum 6 characters"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              {role === 'student' && institutionType === 'school' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-1.5 max-w-sm">
                  <label className="text-sm font-bold text-emerald-700 flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4" /><span>Class / Grade</span>
                  </label>
                  <input type="text" required value={studentClass} onChange={e => setStudentClass(e.target.value)} placeholder="e.g. 10A"
                    className="w-full bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3.5 text-[#002147] font-bold placeholder-emerald-700/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                </div>
              )}

              {role === 'student' && institutionType === 'college' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-3 max-w-lg p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <label className="text-sm font-bold text-emerald-700 flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4" /><span>College Placement</span>
                  </label>
                  <input type="text" required value={branch} onChange={e => setBranch(e.target.value)} placeholder="Branch (e.g. Computer Science)"
                    className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-3 text-[#002147] font-bold placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" required value={year} onChange={e => setYear(e.target.value)} placeholder="Year (e.g. 1st Year)"
                      className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-3 text-[#002147] font-bold placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                    <input type="text" required value={semester} onChange={e => setSemester(e.target.value)} placeholder="Semester (e.g. Sem 1)"
                      className="w-full bg-white border border-emerald-200 rounded-xl px-4 py-3 text-[#002147] font-bold placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                  </div>
                </div>
              )}


              {role === 'teacher' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-3 p-5 bg-blue-50/50 rounded-2xl border border-blue-100">
                  <label className="text-sm font-bold text-blue-800 flex items-center gap-1.5 mb-1">
                    <BookOpen className="w-4 h-4" /><span>Subject & Class Assignments</span>
                  </label>
                  {teacherAssignments.map((a, idx) => (
                    <div key={idx} className="flex gap-3 items-center bg-white p-2 rounded-xl border border-blue-200 shadow-sm">
                      <input type="text" value={a.class} onChange={e => handleAssignmentChange(idx, 'class', e.target.value)} placeholder="Class (e.g. 10A)"
                        className="w-1/2 bg-transparent px-3 py-2 text-sm font-bold text-[#002147] placeholder-gray-400 focus:outline-none focus:bg-blue-50 rounded-lg transition-colors" />
                      <div className="w-px h-8 bg-blue-100" />
                      <input type="text" value={a.subject} onChange={e => handleAssignmentChange(idx, 'subject', e.target.value)} placeholder="Subject (e.g. Math)"
                        className="w-1/2 bg-transparent px-3 py-2 text-sm font-bold text-[#002147] placeholder-gray-400 focus:outline-none focus:bg-blue-50 rounded-lg transition-colors" />
                      {teacherAssignments.length > 1 && (
                        <button type="button" onClick={() => setTeacherAssignments(prev => prev.filter((_, i) => i !== idx))}
                          className="p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => setTeacherAssignments(prev => [...prev, { class: '', subject: '' }])}
                    className="flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors pt-1">
                    <Plus className="w-4 h-4" /><span>Add Another Subject</span>
                  </button>
                </div>
              )}

              {role === 'parent' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <label className="text-sm font-bold text-purple-800 flex items-center gap-1.5 mb-3">
                    <LinkIcon className="w-4 h-4" /><span>Link Students</span>
                  </label>
                  <div className="bg-white border border-purple-200 shadow-sm rounded-xl max-h-60 overflow-y-auto p-3 space-y-1">
                    {allStudents.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-gray-200 rounded-lg bg-gray-50">
                        No student accounts found. Create student accounts first.
                      </div>
                    ) : allStudents.map(s => (
                      <div key={s.id} onClick={() => setSelectedStudentsForParent(prev =>
                        prev.includes(s.customStudentId!) ? prev.filter(x => x !== s.customStudentId) : [...prev, s.customStudentId!]
                      )}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${selectedStudentsForParent.includes(s.customStudentId!) ? 'bg-purple-50 border-purple-200' : 'bg-transparent border-transparent hover:bg-gray-50'}`}>
                        <div className={selectedStudentsForParent.includes(s.customStudentId!) ? 'text-purple-600' : 'text-gray-300'}>
                          {selectedStudentsForParent.includes(s.customStudentId!) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#002147]">{s.name}</p>
                          <p className="text-xs font-semibold text-gray-500">{s.customStudentId} · {s.studentClass}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-rose-700 text-sm font-bold bg-rose-50 border border-rose-200 p-4 rounded-xl">
                <ShieldAlert className="w-5 h-5" /><span>{error}</span>
              </div>
            )}
            {successMsg && (
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-bold bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                <Sparkles className="w-5 h-5" /><span>{successMsg}</span>
              </div>
            )}

            <button type="submit" disabled={isCreating}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-[#002147] to-indigo-900 text-white px-8 py-3.5 rounded-xl font-bold shadow-md hover:shadow-lg hover:from-indigo-900 hover:to-[#002147] transition-all disabled:opacity-70 disabled:cursor-not-allowed mt-4">
              {isCreating ? (
                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Provisioning Account...</span></>
              ) : (
                <><UserPlus className="w-5 h-5 text-indigo-300" /><span>Generate Account</span></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
