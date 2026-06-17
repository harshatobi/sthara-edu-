'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, Users, BookOpen, UserPlus, Trash2, Plus, Link as LinkIcon, CheckSquare, Square } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, collection, getDocs, setDoc } from 'firebase/firestore';
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
      try {
        const schoolDoc = await getDoc(doc(db, 'schools', profile.schoolId));
        if (schoolDoc.exists()) {
          setSchoolName(schoolDoc.data().name);
        } else {
          setSchoolName('School Not Found');
        }

        const usersSnap = await getDocs(collection(db, 'schools', profile.schoolId, 'users'));
        const usersList: UserData[] = [];
        usersSnap.forEach((doc) => {
          usersList.push({ id: doc.id, ...doc.data() } as UserData);
        });
        setUsers(usersList);
      } catch (err) {
        console.error(err);
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

      await setDoc(doc(db, 'global_users', newUid), {
        ...userData,
        schoolId: profile.schoolId
      });

      await setDoc(doc(db, 'schools', profile.schoolId, 'users', newUid), userData);

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

  const allStudents = useMemo(() => users.filter(u => u.role === 'student' && u.customStudentId), [users]);
  const totalStudents = users.filter(u => u.role === 'student').length;
  const totalTeachers = users.filter(u => u.role === 'teacher').length;

  if (authLoading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading School Portal...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#002147]">Institutional Analytics</h2>
          <p className="text-[#002147]/60 mt-1">{schoolName} Overview</p>
        </div>
        <button 
          onClick={handleSignOut}
          className="bg-white border border-[#002147]/10 px-4 py-2 rounded-xl text-[#dc143c] font-medium shadow-sm hover:bg-[#f8fafc]"
        >
          Sign Out
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-[#002147]/10 p-6 rounded-2xl shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="text-[#002147]/60 font-medium">Total Students</div>
            <div className="bg-[#002147]/5 text-[#002147] p-2 rounded-lg"><Users className="w-5 h-5" /></div>
          </div>
          <div className="text-4xl font-bold text-[#002147]">{totalStudents}</div>
          <div className="text-sm mt-2 text-green-600 font-medium flex items-center">Active Enrollment</div>
        </div>

        <div className="bg-white border border-[#002147]/10 p-6 rounded-2xl shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="text-[#002147]/60 font-medium">Total Teachers</div>
            <div className="bg-[#002147]/5 text-[#002147] p-2 rounded-lg"><BookOpen className="w-5 h-5" /></div>
          </div>
          <div className="text-4xl font-bold text-[#002147]">{totalTeachers}</div>
          <div className="text-sm mt-2 text-[#002147]/60">Staff Accounts</div>
        </div>

        <div className="bg-[#002147] text-white p-6 rounded-2xl shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <div className="text-white/80 font-medium">Overall Mastery</div>
            <div className="bg-white/20 p-2 rounded-lg"><TrendingUp className="w-5 h-5" /></div>
          </div>
          <div className="text-4xl font-bold">--</div>
          <div className="text-sm mt-2 text-white/80">Pending student data</div>
        </div>
      </div>

      <div className="bg-white border border-[#002147]/10 p-8 rounded-2xl shadow-sm">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-[#dc143c]/10 rounded-lg">
            <UserPlus className="w-5 h-5 text-[#dc143c]" />
          </div>
          <h2 className="text-xl font-bold text-[#002147]">Add New User to School</h2>
        </div>

        <form onSubmit={handleCreateUser} className="space-y-4 max-w-2xl">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#002147]/70 mb-1">Role</label>
              <select 
                value={role} 
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="parent">Parent</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#002147]/70 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#002147]/70 mb-1">Login Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john.doe@school.edu"
                className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#002147]/70 mb-1">Working Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
              />
            </div>
          </div>

          {role === 'student' && (
            <div className="animate-in fade-in duration-300">
              <label className="block text-sm font-medium text-[#002147]/70 mb-1">Class / Grade</label>
              <input
                type="text"
                required
                value={studentClass}
                onChange={(e) => setStudentClass(e.target.value)}
                placeholder="e.g. 10A"
                className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
              />
            </div>
          )}

          {role === 'teacher' && (
            <div className="animate-in fade-in duration-300 space-y-3">
              <label className="block text-sm font-medium text-[#002147]/70">Subject & Class Assignments</label>
              {teacherAssignments.map((assignment, idx) => (
                <div key={idx} className="flex space-x-2 items-center bg-[#f8fafc] p-2 rounded-xl border border-[#002147]/10">
                  <input
                    type="text"
                    value={assignment.class}
                    onChange={(e) => handleAssignmentChange(idx, 'class', e.target.value)}
                    placeholder="Class (10A)"
                    className="w-1/2 bg-transparent px-2 py-1 text-sm text-[#002147] focus:outline-none"
                  />
                  <div className="w-[1px] h-6 bg-[#002147]/10"></div>
                  <input
                    type="text"
                    value={assignment.subject}
                    onChange={(e) => handleAssignmentChange(idx, 'subject', e.target.value)}
                    placeholder="Subject (Math)"
                    className="w-1/2 bg-transparent px-2 py-1 text-sm text-[#002147] focus:outline-none"
                  />
                  {teacherAssignments.length > 1 && (
                    <button type="button" onClick={() => handleRemoveAssignmentRow(idx)} className="p-1 text-[#dc143c]/60 hover:text-[#dc143c]">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={handleAddAssignmentRow} className="flex items-center space-x-1 text-sm font-medium text-[#002147]/60 hover:text-[#002147] transition-colors">
                <Plus className="w-4 h-4" />
                <span>Add Another Assignment</span>
              </button>
            </div>
          )}

          {role === 'parent' && (
            <div className="animate-in fade-in duration-300">
              <label className="block text-sm font-medium text-[#002147]/70 mb-2">Link Students to this Parent</label>
              <div className="bg-[#f8fafc] border border-[#002147]/10 rounded-xl max-h-48 overflow-y-auto p-2 space-y-1">
                {allStudents.length === 0 ? (
                  <p className="text-xs text-[#002147]/50 p-2 italic">No students available. Please add students first.</p>
                ) : (
                  allStudents.map(student => (
                    <div key={student.id} onClick={() => toggleParentStudentSelection(student.customStudentId!)} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-white cursor-pointer transition-colors">
                      <div className="text-[#002147]">
                        {selectedStudentsForParent.includes(student.customStudentId!) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[#002147]">{student.name}</p>
                        <p className="text-xs text-[#002147]/60">{student.customStudentId} • {student.studentClass}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {error && <p className="text-[#dc143c] text-sm font-medium bg-[#dc143c]/10 p-3 rounded-lg">{error}</p>}
          {successMsg && <p className="text-green-700 text-sm font-medium bg-green-100 p-3 rounded-lg">{successMsg}</p>}

          <button type="submit" disabled={isCreating} className="w-auto bg-[#002147] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#002147]/90 transition-colors mt-2 disabled:opacity-50">
            {isCreating ? 'Creating...' : 'Generate Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
