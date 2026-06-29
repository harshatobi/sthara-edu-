'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  TrendingUp, Users, BookOpen, UserPlus, Trash2, Plus, 
  Link as LinkIcon, CheckSquare, Square, Building2, 
  GraduationCap, ShieldAlert, Sparkles, ChevronRight, Loader2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, collection, getDocs, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

interface TeacherAssignment {
  class: string;
  subject: string;
}

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  studentClass?: string;
  customStudentId?: string;
  assignments?: TeacherAssignment[];
  linkedStudents?: string[];
}

export default function AdminDashboard() {
  const { profile, loading: authLoading, signOut: handleSignOut } = useAuth();
  const router = useRouter();
  
  const [schoolName, setSchoolName] = useState('Loading...');
  const [users, setUsers] = useState<UserData[]>([]);
  const [totalAssignments, setTotalAssignments] = useState<number | string>('--');
  const [statsLoading, setStatsLoading] = useState(true);
  
  // New User Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'student' | 'teacher' | 'admin' | 'parent'>('student');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Extended Data Fields
  const [studentClass, setStudentClass] = useState('');
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([{ class: '', subject: '' }]);
  const [selectedStudentsForParent, setSelectedStudentsForParent] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading && (!profile || profile.role !== 'admin')) {
      router.push('/login');
    }
  }, [profile, authLoading, router]);

  useEffect(() => {
    if (!profile?.schoolId) return;
    
    const fetchSchoolData = async () => {
      setStatsLoading(true);
      try {
        const schoolDoc = await getDoc(doc(db, 'schools', profile.schoolId));
        if (schoolDoc.exists()) {
          setSchoolName(schoolDoc.data().name);
        } else {
          setSchoolName('School Not Found');
        }

        // Query BOTH collections — users are written to both in some flows
        const [usersSnap, globalSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('schoolId', '==', profile.schoolId))),
          getDocs(query(collection(db, 'global_users'), where('schoolId', '==', profile.schoolId))),
        ]);

        // Merge, deduplicating by UID
        const seen = new Set<string>();
        const usersList: UserData[] = [];
        const addUser = (docId: string, data: any) => {
          if (!seen.has(docId)) {
            seen.add(docId);
            usersList.push({ id: docId, ...data } as UserData);
          }
        };
        usersSnap.forEach(d => addUser(d.id, d.data()));
        globalSnap.forEach(d => addUser(d.id, d.data()));

        // Fallback: if still 0, scan all users and filter client-side
        if (usersList.length === 0) {
          const allUsersSnap = await getDocs(collection(db, 'users'));
          allUsersSnap.forEach(d => {
            const data = d.data();
            if (data.schoolId === profile.schoolId || data.school === profile.schoolId) {
              addUser(d.id, data);
            }
          });
        }

        console.log('[admin] users found:', usersList.length, usersList.map(u => `${u.name}(${u.role})`));
        setUsers(usersList);

        const assignSnap = await getDocs(collection(db, 'schools', profile.schoolId, 'assignments'));
        setTotalAssignments(assignSnap.size);
      } catch (err) {
        console.error('[admin] fetchSchoolData error:', err);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchSchoolData();
  }, [profile?.schoolId]);

  const handleAddAssignmentRow = () => setTeacherAssignments([...teacherAssignments, { class: '', subject: '' }]);
  
  const handleRemoveAssignmentRow = (index: number) => {
    const newArr = [...teacherAssignments];
    newArr.splice(index, 1);
    setTeacherAssignments(newArr);
  };

  const handleAssignmentChange = (index: number, field: 'class' | 'subject', value: string) => {
    const newArr = [...teacherAssignments];
    newArr[index][field] = value;
    setTeacherAssignments(newArr);
  };

  const toggleParentStudentSelection = (customStudentId: string) => {
    if (selectedStudentsForParent.includes(customStudentId)) {
      setSelectedStudentsForParent(selectedStudentsForParent.filter(id => id !== customStudentId));
    } else {
      setSelectedStudentsForParent([...selectedStudentsForParent, customStudentId]);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.schoolId) return;
    
    setIsCreating(true);
    setError('');
    setSuccessMsg('');

    try {
      const primaryApp = getApp();
      let secondaryApp;
      try {
        secondaryApp = getApp('SecondaryApp');
      } catch (e) {
        secondaryApp = initializeApp(primaryApp.options, 'SecondaryApp');
      }
      
      const secondaryAuth = getAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const newUid = userCredential.user.uid;

      await signOut(secondaryAuth);

      const userData: any = {
        email,
        name,
        role,
        createdAt: new Date().toISOString()
      };

      if (role === 'student') {
        const parsedClass = studentClass.trim();
        userData.studentClass = parsedClass;
        
        const existingStudentsInClass = users.filter(u => u.role === 'student' && u.studentClass === parsedClass);
        const sequenceNumber = existingStudentsInClass.length + 1;
        const sequentialId = `${profile.schoolId}-${parsedClass}-${String(sequenceNumber).padStart(3, '0')}`;
        
        userData.customStudentId = sequentialId.toUpperCase();
      } else if (role === 'teacher') {
        userData.assignments = teacherAssignments.filter(a => a.class.trim() !== '' && a.subject.trim() !== '');
      } else if (role === 'parent') {
        userData.linkedStudents = selectedStudentsForParent;
      }

      await setDoc(doc(db, 'users', newUid), {
        ...userData,
        schoolId: profile.schoolId
      });

      setSuccessMsg(`Successfully created ${role} account for ${name}!`);
      setUsers([...users, { id: newUid, ...userData }]);
      
      setEmail('');
      setPassword('');
      setName('');
      setStudentClass('');
      setTeacherAssignments([{ class: '', subject: '' }]);
      setSelectedStudentsForParent([]);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!profile?.schoolId || !confirm('Are you sure you want to delete this user from the school?')) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      setUsers(users.filter(u => u.id !== userId));
    } catch (err) {
      console.error("Error deleting user", err);
      alert('Failed to delete user.');
    }
  };

  const allStudents = useMemo(() => users.filter(u => u.role === 'student' && u.customStudentId), [users]);
  const totalStudents = users.filter(u => u.role === 'student').length;
  const totalTeachers = users.filter(u => u.role === 'teacher').length;

  const getRoleBadgeStyle = (userRole: string) => {
    switch (userRole) {
      case 'admin': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'teacher': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'student': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'parent': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  if (authLoading || !profile) return (
    <div className="min-h-screen bg-[#f8fafc] flex justify-center items-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-[#002147] font-semibold tracking-wide">Loading Command Center...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-16 font-sans">
      
      {/* Premium Header Banner */}
      <div className="bg-white border-b border-gray-200/60 shadow-sm sticky top-0 z-40 backdrop-blur-xl bg-white/80">
        <div className="max-w-[1200px] mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-inner border border-indigo-400">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2 text-indigo-600 text-xs font-bold uppercase tracking-wider mb-1">
                <Sparkles className="w-4 h-4" />
                <span>Command Center</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-[#002147]">Institutional Analytics</h1>
              <p className="text-sm font-medium text-gray-500 mt-0.5">{schoolName}</p>
            </div>
          </div>

          <button 
            onClick={handleSignOut}
            className="px-5 py-2.5 bg-white border border-rose-200 text-rose-600 rounded-xl font-bold hover:bg-rose-50 hover:border-rose-300 transition-all shadow-sm"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-8 space-y-8 animate-in fade-in duration-500">
        
        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Students */}
          <Link href="/admin" className="block">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-6 relative overflow-hidden group cursor-pointer hover:shadow-md hover:ring-2 hover:ring-emerald-200 transition-all duration-200">
              <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:scale-110 group-hover:opacity-10 transition-all duration-500">
                <Users className="w-40 h-40 text-emerald-500" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4 border border-emerald-100">
                  <Users className="w-6 h-6 text-emerald-600" />
                </div>
                {statsLoading ? (
                  <div className="flex items-center gap-2 mb-1">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                    <span className="text-lg font-bold text-gray-400">Loading...</span>
                  </div>
                ) : (
                  <h3 className="text-4xl font-black text-[#002147] mb-1">{totalStudents}</h3>
                )}
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Total Students</p>
                <div className="inline-flex items-center space-x-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                  <TrendingUp className="w-3 h-3" />
                  <span>View Directory →</span>
                </div>
              </div>
            </div>
          </Link>

          {/* Teachers */}
          <Link href="/admin" className="block">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-6 relative overflow-hidden group cursor-pointer hover:shadow-md hover:ring-2 hover:ring-blue-200 transition-all duration-200">
              <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:scale-110 group-hover:opacity-10 transition-all duration-500">
                <GraduationCap className="w-40 h-40 text-blue-500" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 border border-blue-100">
                  <GraduationCap className="w-6 h-6 text-blue-600" />
                </div>
                {statsLoading ? (
                  <div className="flex items-center gap-2 mb-1">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                    <span className="text-lg font-bold text-gray-400">Loading...</span>
                  </div>
                ) : (
                  <h3 className="text-4xl font-black text-[#002147] mb-1">{totalTeachers}</h3>
                )}
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Total Teachers</p>
                <div className="inline-flex items-center space-x-1 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                  <Users className="w-3 h-3" />
                  <span>Manage Staff →</span>
                </div>
              </div>
            </div>
          </Link>

          {/* Assignments */}
          <Link href="/admin/results" className="block">
            <div className="bg-gradient-to-br from-[#002147] to-indigo-900 rounded-2xl shadow-lg border border-indigo-800 p-6 relative overflow-hidden group cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all duration-200">
              <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:scale-110 group-hover:opacity-20 transition-all duration-500">
                <BookOpen className="w-40 h-40 text-white" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-4 border border-white/20 backdrop-blur-sm">
                  <BookOpen className="w-6 h-6 text-indigo-200" />
                </div>
                <h3 className="text-4xl font-black text-white mb-1">{totalAssignments}</h3>
                <p className="text-sm font-bold text-indigo-200 uppercase tracking-wider mb-2">Active Assignments</p>
                <div className="inline-flex items-center space-x-1 text-xs font-bold text-indigo-100 bg-indigo-950/50 px-2 py-1 rounded-md border border-indigo-800">
                  <TrendingUp className="w-3 h-3" />
                  <span>View Results →</span>
                </div>
              </div>
            </div>
          </Link>

        </div>

        {/* Directory Management Table */}
        <div className="bg-white border border-gray-200/60 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200/60 flex items-center justify-between bg-gray-50/50">
            <div>
              <h2 className="text-lg font-bold text-[#002147]">Directory Management</h2>
              <p className="text-sm font-medium text-gray-500 mt-0.5">Manage school staff and administrators</p>
            </div>
            <div className="p-2 bg-indigo-50 rounded-xl">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50/80 border-b border-gray-200/60">
                <tr>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.filter(u => u.role !== 'student').map(u => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-600 font-bold border border-gray-300 shadow-inner">
                          {u.name.charAt(0)}
                        </div>
                        <div className="font-bold text-[#002147]">{u.name}</div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${getRoleBadgeStyle(u.role)}`}>
                        {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                      </span>
                    </td>
                    <td className="p-4 font-medium text-gray-500 text-sm">{u.email}</td>
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
                {users.filter(u => u.role !== 'student').length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
                          <Users className="w-6 h-6 text-gray-400" />
                        </div>
                        <p className="text-gray-500 font-medium">No directory users found.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add User Form */}
        <div className="bg-white border border-gray-200/60 p-8 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
          
          <div className="flex items-center space-x-3 mb-8">
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
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full appearance-none bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl pl-4 pr-10 py-3.5 text-[#002147] font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                  >
                    <option value="student">Student Account</option>
                    <option value="teacher">Teacher Account</option>
                    <option value="parent">Parent Account</option>
                    <option value="admin">Administrator Account</option>
                  </select>
                  <ChevronRight className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transform rotate-90" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-gray-600">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., John Doe"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-gray-600">Login Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.doe@school.edu"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-gray-600">Initial Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            {/* Dynamic Role Sections */}
            <div className="pt-4 border-t border-gray-100">
              
              {role === 'student' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-1.5 max-w-sm">
                  <label className="text-sm font-bold text-emerald-700 flex items-center space-x-1.5">
                    <GraduationCap className="w-4 h-4" />
                    <span>Student specific: Class / Grade</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={studentClass}
                    onChange={(e) => setStudentClass(e.target.value)}
                    placeholder="e.g. 10A"
                    className="w-full bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3.5 text-[#002147] font-bold placeholder-emerald-700/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              )}

              {role === 'teacher' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-3 p-5 bg-blue-50/50 rounded-2xl border border-blue-100">
                  <label className="text-sm font-bold text-blue-800 flex items-center space-x-1.5 mb-1">
                    <BookOpen className="w-4 h-4" />
                    <span>Teacher specific: Subject & Class Assignments</span>
                  </label>
                  {teacherAssignments.map((assignment, idx) => (
                    <div key={idx} className="flex space-x-3 items-center bg-white p-2 rounded-xl border border-blue-200 shadow-sm">
                      <input
                        type="text"
                        value={assignment.class}
                        onChange={(e) => handleAssignmentChange(idx, 'class', e.target.value)}
                        placeholder="Class (e.g. 10A)"
                        className="w-1/2 bg-transparent px-3 py-2 text-sm font-bold text-[#002147] placeholder-gray-400 focus:outline-none focus:bg-blue-50 rounded-lg transition-colors"
                      />
                      <div className="w-[1px] h-8 bg-blue-100"></div>
                      <input
                        type="text"
                        value={assignment.subject}
                        onChange={(e) => handleAssignmentChange(idx, 'subject', e.target.value)}
                        placeholder="Subject (e.g. Math)"
                        className="w-1/2 bg-transparent px-3 py-2 text-sm font-bold text-[#002147] placeholder-gray-400 focus:outline-none focus:bg-blue-50 rounded-lg transition-colors"
                      />
                      {teacherAssignments.length > 1 && (
                        <button type="button" onClick={() => handleRemoveAssignmentRow(idx)} className="p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={handleAddAssignmentRow} className="flex items-center space-x-1.5 text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors pt-1">
                    <Plus className="w-4 h-4" />
                    <span>Add Another Subject</span>
                  </button>
                </div>
              )}

              {role === 'parent' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <label className="text-sm font-bold text-purple-800 flex items-center space-x-1.5 mb-3">
                    <LinkIcon className="w-4 h-4" />
                    <span>Parent specific: Link Students</span>
                  </label>
                  <div className="bg-white border border-purple-200 shadow-sm rounded-xl max-h-60 overflow-y-auto p-3 space-y-1">
                    {allStudents.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-gray-200 rounded-lg bg-gray-50">
                        No students available. Please provision student accounts first.
                      </div>
                    ) : (
                      allStudents.map(student => (
                        <div 
                          key={student.id} 
                          onClick={() => toggleParentStudentSelection(student.customStudentId!)} 
                          className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-all border ${
                            selectedStudentsForParent.includes(student.customStudentId!) 
                              ? 'bg-purple-50 border-purple-200 shadow-sm' 
                              : 'bg-transparent border-transparent hover:bg-gray-50'
                          }`}
                        >
                          <div className={selectedStudentsForParent.includes(student.customStudentId!) ? "text-purple-600" : "text-gray-300"}>
                            {selectedStudentsForParent.includes(student.customStudentId!) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-[#002147]">{student.name}</p>
                            <p className="text-xs font-semibold text-gray-500 tracking-wide mt-0.5">{student.customStudentId} • {student.studentClass}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center space-x-2 text-rose-700 text-sm font-bold bg-rose-50 border border-rose-200 p-4 rounded-xl animate-in fade-in">
                <ShieldAlert className="w-5 h-5" />
                <span>{error}</span>
              </div>
            )}
            
            {successMsg && (
              <div className="flex items-center space-x-2 text-emerald-700 text-sm font-bold bg-emerald-50 border border-emerald-200 p-4 rounded-xl animate-in fade-in">
                <Sparkles className="w-5 h-5" />
                <span>{successMsg}</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isCreating} 
              className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-gradient-to-r from-[#002147] to-indigo-900 text-white px-8 py-3.5 rounded-xl font-bold shadow-md hover:shadow-lg hover:from-indigo-900 hover:to-[#002147] transition-all disabled:opacity-70 disabled:cursor-not-allowed mt-4"
            >
              {isCreating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Provisioning Account...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5 text-indigo-300" />
                  <span>Generate Account</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
