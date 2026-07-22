'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  TrendingUp, Users, BookOpen, UserPlus, Trash2, Plus, 
  Building2, GraduationCap, Sparkles, ChevronRight, Loader2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';

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
  const supabase = createClient();
  
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
  const [branch, setBranch] = useState('');
  const [semester, setSemester] = useState('');
  const [year, setYear] = useState('');
  const [institutionType, setInstitutionType] = useState<'school' | 'college'>('school');
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
        // Fetch school details
        const { data: school, error: schoolErr } = await supabase
          .from('schools')
          .select('*')
          .eq('id', profile.schoolId)
          .single();

        if (school) {
          setSchoolName(school.name);
          setInstitutionType(school.institution_type === 'college' ? 'college' : 'school');
        } else {
          setSchoolName('School Not Found');
        }

        // Fetch users for school
        const { data: userRows, error: userErr } = await supabase
          .from('users')
          .select('*')
          .eq('school_id', profile.schoolId);

        if (userErr) throw userErr;

        const usersList: UserData[] = (userRows || []).map((u) => ({
          id: u.id,
          name: u.name || 'Unknown',
          email: u.email || '',
          role: u.role || 'student',
          studentClass: u.student_class || u.branch || undefined,
          customStudentId: u.custom_student_id || undefined,
          assignments: u.assignments || [],
          linkedStudents: u.metadata?.linkedStudents || [],
        }));

        setUsers(usersList);

        // Fetch assignments count
        const { count, error: assignErr } = await supabase
          .from('assignments')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', profile.schoolId);

        if (assignErr) console.warn('[admin] assignments count error:', assignErr);
        setTotalAssignments(count ?? 0);

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
      // 1. Create auth user with Supabase
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            name: name.trim(),
            role,
          },
        },
      });

      if (authErr || !authData.user) {
        throw new Error(authErr?.message || 'Failed to create user account');
      }

      const newUid = authData.user.id;

      let customStudentId: string | undefined = undefined;
      let parsedClass: string | undefined = undefined;

      if (role === 'student') {
        if (institutionType === 'college') {
          const branchKey = branch.trim().replace(/\s+/g, '').slice(0, 6).toUpperCase();
          const existingInBranch = users.filter(u => u.role === 'student' && (u as any).branch === branch.trim());
          const seq = existingInBranch.length + 1;
          customStudentId = `${profile.schoolId}-${branchKey}-${String(seq).padStart(3, '0')}`;
        } else {
          parsedClass = studentClass.trim();
          const existingStudentsInClass = users.filter(u => u.role === 'student' && u.studentClass === parsedClass);
          const sequenceNumber = existingStudentsInClass.length + 1;
          customStudentId = `${profile.schoolId}-${parsedClass}-${String(sequenceNumber).padStart(3, '0')}`.toUpperCase();
        }
      }

      const validTeacherAssignments = teacherAssignments.filter(a => a.class.trim() !== '' && a.subject.trim() !== '');

      // 2. Insert user into users table
      const { error: dbErr } = await supabase.from('users').insert({
        id: newUid,
        school_id: profile.schoolId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        student_class: role === 'student' ? (parsedClass || null) : null,
        branch: role === 'student' ? (branch.trim() || null) : null,
        semester: role === 'student' ? (semester.trim() || null) : null,
        year: role === 'student' ? (year.trim() || null) : null,
        custom_student_id: customStudentId || null,
        assignments: validTeacherAssignments,
        metadata: { linkedStudents: selectedStudentsForParent },
      });

      if (dbErr) throw dbErr;

      const newUserObj: UserData = {
        id: newUid,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        studentClass: parsedClass || branch.trim() || undefined,
        customStudentId,
        assignments: validTeacherAssignments,
        linkedStudents: selectedStudentsForParent,
      };

      setSuccessMsg(`Successfully created ${role} account for ${name}!`);
      setUsers([...users, newUserObj]);
      
      setEmail('');
      setPassword('');
      setName('');
      setStudentClass('');
      setBranch('');
      setSemester('');
      setYear('');
      setTeacherAssignments([{ class: '', subject: '' }]);
      setSelectedStudentsForParent([]);

    } catch (err: any) {
      setError(err.message || 'Failed to create user account');
    } font-medium {
      setIsCreating(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!profile?.schoolId || !confirm('Are you sure you want to delete this user from the school?')) return;
    try {
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (error) throw error;
      setUsers(users.filter(u => u.id !== userId));
    } catch (err: any) {
      console.error("Error deleting user", err);
      alert('Failed to delete user: ' + err.message);
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
          <Link href="/admin/directory" className="block">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-6 relative overflow-hidden group cursor-pointer hover:shadow-md hover:ring-2 hover:ring-emerald-200 transition-all duration-200">
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
          <Link href="/admin/directory" className="block">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-6 relative overflow-hidden group cursor-pointer hover:shadow-md hover:ring-2 hover:ring-blue-200 transition-all duration-200">
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
        <div id="directory-section" className="bg-white border border-gray-200/60 rounded-2xl shadow-sm overflow-hidden scroll-mt-24">
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

          {error && <p className="mb-4 text-red-600 text-sm font-semibold bg-red-50 p-3 rounded-xl border border-red-200">{error}</p>}
          {successMsg && <p className="mb-4 text-emerald-600 text-sm font-semibold bg-emerald-50 p-3 rounded-xl border border-emerald-200">{successMsg}</p>}

          <form onSubmit={handleCreateUser} className="space-y-6 max-w-3xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-gray-600">Account Type</label>
                <select 
                  value={role} 
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="student">Student Account</option>
                  <option value="teacher">Teacher Account</option>
                  <option value="parent">Parent Account</option>
                  <option value="admin">Administrator Account</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-gray-600">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., John Doe"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-gray-600">Initial Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {role === 'student' && (
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-bold text-gray-600">Class / Grade</label>
                  <input
                    type="text"
                    required
                    value={studentClass}
                    onChange={(e) => setStudentClass(e.target.value)}
                    placeholder="e.g., Class 10-A"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              <span>{isCreating ? 'Creating Account...' : 'Create Account'}</span>
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
