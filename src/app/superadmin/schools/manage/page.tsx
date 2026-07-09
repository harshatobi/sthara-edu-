'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, UserPlus, GraduationCap, Users, BookOpen, Plus, Trash2, Link as LinkIcon, CheckSquare, Square, Pencil, X, Loader2 } from 'lucide-react';

import { db } from '@/lib/firebase/config';
import { doc, getDoc, collection, getDocs, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';


import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

interface TeacherAssignment {
  class: string;
  subject: string;
  assignedStudents?: string[]; // customStudentIds assigned to THIS subject
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

// ─── Edit Teacher Modal ──────────────────────────────────────────────────────
function EditTeacherModal({
  teacher, allStudents, onClose, onSave,
}: {
  teacher: UserData;
  allStudents: UserData[];
  onClose: () => void;
  onSave: (uid: string, assignments: TeacherAssignment[]) => Promise<void>;
}) {
  const [assignments, setAssignments] = useState<TeacherAssignment[]>(
    (teacher.assignments || []).map(a => ({ ...a, assignedStudents: a.assignedStudents || [] }))
  );
  const [saving, setSaving] = useState(false);

  const studentsForClass = (cls: string) => {
    const clsN = cls.toLowerCase().replace(/[\s.]/g, '');
    return allStudents.filter(s => {
      const sClass = ((s as any).branch || s.studentClass || s as any).toLowerCase?.()?.replace(/[\s.]/g, '') ||
        ((s as any).branch || s.studentClass || '').toLowerCase().replace(/[\s.]/g, '');
      return sClass && (sClass === clsN || sClass.includes(clsN) || clsN.includes(sClass));
    });
  };

  const toggle = (idx: number, studentId: string) =>
    setAssignments(prev => prev.map((a, i) => {
      if (i !== idx) return a;
      const cur = a.assignedStudents || [];
      return { ...a, assignedStudents: cur.includes(studentId) ? cur.filter(x => x !== studentId) : [...cur, studentId] };
    }));

  const selectAll = (idx: number) => {
    const ids = studentsForClass(assignments[idx].class).map(s => s.id);
    setAssignments(prev => prev.map((a, i) => i === idx ? { ...a, assignedStudents: ids } : a));
  };
  const clearAll = (idx: number) =>
    setAssignments(prev => prev.map((a, i) => i === idx ? { ...a, assignedStudents: [] } : a));

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(teacher.id, assignments); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-[#002147]">Edit Teacher — Assign Students</h2>
            <p className="text-sm text-gray-500 mt-0.5">{teacher.name} · {teacher.email}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {assignments.length === 0 && (
            <p className="text-gray-400 text-center py-8">No class-subject assignments found for this teacher.</p>
          )}
          {assignments.map((assign, idx) => {
            const classStudents = studentsForClass(assign.class);
            const selected = assign.assignedStudents || [];
            return (
              <div key={idx} className="border border-gray-200 rounded-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-[#002147] to-indigo-700 px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold">{assign.subject || '—'}</p>
                    <p className="text-white/70 text-xs mt-0.5">{assign.class || '—'}</p>
                  </div>
                  <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                    {selected.length} / {classStudents.length} assigned
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex gap-2 mb-4">
                    <button onClick={() => selectAll(idx)} className="text-xs font-bold text-[#002147] bg-[#002147]/5 hover:bg-[#002147]/10 px-3 py-1.5 rounded-lg transition-colors">Select All</button>
                    <button onClick={() => clearAll(idx)} className="text-xs font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">Clear All</button>
                  </div>
                  {classStudents.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-4">No students in class "{assign.class}"</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {classStudents.map(student => {
                        const checked = selected.includes(student.id);
                        return (
                          <label key={student.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                            checked ? 'bg-[#002147]/5 border-[#002147]/20' : 'bg-gray-50 border-transparent hover:border-gray-200'
                          }`}>
                            <input type="checkbox" checked={checked} onChange={() => toggle(idx, student.id)} className="w-4 h-4 rounded accent-[#002147]" />
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#002147]/10 to-[#002147]/20 flex items-center justify-center text-[#002147] font-black text-xs flex-shrink-0">
                              {(student.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-[#002147] truncate">{student.name}</p>
                              <p className="text-xs text-gray-400 truncate">{student.customStudentId || student.email}</p>
                            </div>
                            {checked && <CheckSquare className="w-4 h-4 text-[#002147] flex-shrink-0" />}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-5 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            onClick={handleSave} disabled={saving}
            className="flex-1 py-3 rounded-xl bg-[#002147] text-white font-bold hover:bg-[#002147]/90 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}



function SchoolManagementContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const schoolId = searchParams.get('id');
  const decodedSchoolId = schoolId ? decodeURIComponent(schoolId) : '';

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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null); // userId to delete
  const [deletingId, setDeletingId] = useState<string | null>(null);


  // Extended Data Fields
  const [studentClass, setStudentClass] = useState('');
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([{ class: '', subject: '', assignedStudents: [] }]);
  const [selectedStudentsForParent, setSelectedStudentsForParent] = useState<string[]>([]);
  const [editingTeacher, setEditingTeacher] = useState<UserData | null>(null);

  // College-specific
  const [institutionType, setInstitutionType] = useState<'school' | 'college'>('school');
  const [schoolBranches, setSchoolBranches] = useState<string[]>([]);
  const [studentBranch, setStudentBranch] = useState('');
  const [studentYear, setStudentYear] = useState('');
  const [studentSemester, setStudentSemester] = useState('');



  useEffect(() => {
    if (!decodedSchoolId) return;
    
    const fetchSchoolData = async () => {
      try {
        const schoolDoc = await getDoc(doc(db, 'schools', decodedSchoolId));
        if (schoolDoc.exists()) {
          const schoolData = schoolDoc.data();
          setSchoolName(schoolData.name);
          setInstitutionType(schoolData.type === 'college' ? 'college' : 'school');
          setSchoolBranches(schoolData.branches || []);
        } else {
          setSchoolName('School Not Found');
        }

        const usersSnap = await getDocs(collection(db, 'schools', decodedSchoolId, 'users'));
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
  }, [decodedSchoolId]);

  const handleDeleteUser = async (userId: string, userRole?: string) => {
    if (!decodedSchoolId) return;
    setDeletingId(userId);
    setError('');
    try {
      // Call server API to delete from Firebase AUTH + cascade delete all data
      let authDeleted = false;
      try {
        const { getAuthToken } = await import('@/lib/auth/getAuthToken');
        const authToken = await getAuthToken();
        const res = await fetch('/api/superadmin/delete-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ uid: userId, schoolId: decodedSchoolId, role: userRole }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          authDeleted = true;
          setUsers(prev => prev.filter(u => u.id !== userId));
          setSuccessMsg('✅ User and all their data fully deleted. Email can be re-used immediately.');
          setTimeout(() => setSuccessMsg(''), 5000);
          return;
        } else {
          console.warn('API delete failed:', data.error);
        }
      } catch (apiErr) {
        console.warn('Admin API unavailable, falling back to client deletes:', apiErr);
      }

      // Fallback: client-side Firestore deletes only (Auth not cleaned)
      await Promise.allSettled([
        deleteDoc(doc(db, 'global_users', userId)),
        deleteDoc(doc(db, 'schools', decodedSchoolId, 'users', userId)),
      ]);
      setUsers(prev => prev.filter(u => u.id !== userId));
      setSuccessMsg(authDeleted
        ? '✅ User fully deleted. You can re-create with the same email immediately.'
        : '⚠️ Partial delete — data removed from database but Firebase Auth cleanup may have failed.');
      setTimeout(() => setSuccessMsg(''), 5000);

    } catch (err) {
      console.error(err);
      setError('Failed to delete user. Try again.');
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  const handleSaveTeacher = async (uid: string, assignments: TeacherAssignment[]) => {
    const subjectsTaught = [...new Set(assignments.map(a => a.subject).filter(Boolean))];
    const updates = { assignments, subjectsTaught };
    await Promise.allSettled([
      updateDoc(doc(db, 'schools', decodedSchoolId, 'users', uid), updates),
      updateDoc(doc(db, 'global_users', uid), updates),
    ]);
    setUsers(prev => prev.map(u => u.id === uid ? { ...u, ...updates } : u));
    setEditingTeacher(null);
  };






  const handleAddAssignmentRow = () => {
    setTeacherAssignments([...teacherAssignments, { class: '', subject: '', assignedStudents: [] }]);
  };



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

  // Toggle a student inside a specific subject assignment row
  const handleAssignmentStudentToggle = (rowIdx: number, sid: string) => {
    setTeacherAssignments(prev => prev.map((a, i) => {
      if (i !== rowIdx) return a;
      const current = a.assignedStudents || [];
      return {
        ...a,
        assignedStudents: current.includes(sid)
          ? current.filter(s => s !== sid)
          : [...current, sid],
      };
    }));
  };

  // Select / clear all students for a row
  const handleAssignmentSelectAll = (rowIdx: number, allIds: string[]) => {
    setTeacherAssignments(prev => prev.map((a, i) =>
      i === rowIdx ? { ...a, assignedStudents: allIds } : a
    ));
  };
  const handleAssignmentClearAll = (rowIdx: number) => {
    setTeacherAssignments(prev => prev.map((a, i) =>
      i === rowIdx ? { ...a, assignedStudents: [] } : a
    ));
  };



  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decodedSchoolId) return;
    
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
        if (institutionType === 'college') {
          userData.branch = studentBranch;
          userData.year = studentYear;
          userData.semester = studentSemester;
          // Generate clean ID: strip spaces from branch → abbreviation
          const branchAbbr = studentBranch.replace(/\s+/g, '').slice(0, 4).toUpperCase();
          const existingInBranch = users.filter(u => u.role === 'student' && (u as any).branch === studentBranch);
          const sequenceNumber = existingInBranch.length + 1;
          const sequentialId = `${decodedSchoolId}-${branchAbbr}-${String(sequenceNumber).padStart(3, '0')}`;
          userData.customStudentId = sequentialId.toUpperCase();
        } else {
          const parsedClass = studentClass.trim();
          userData.studentClass = parsedClass;
          const existingStudentsInClass = users.filter(u => u.role === 'student' && u.studentClass === parsedClass);
          const sequenceNumber = existingStudentsInClass.length + 1;
          const sequentialId = `${decodedSchoolId}-${parsedClass}-${String(sequenceNumber).padStart(3, '0')}`;
          userData.customStudentId = sequentialId.toUpperCase();
        }
      } else if (role === 'teacher') {
        // For college: each assignment row already contains its own assignedStudents[]
        // For school: standard class+subject assignments
        userData.assignments = teacherAssignments.filter(a => a.class.trim() !== '' && a.subject.trim() !== '');

      } else if (role === 'parent') {
        userData.linkedStudents = selectedStudentsForParent;
      }

      await setDoc(doc(db, 'global_users', newUid), {
        ...userData,
        schoolId: decodedSchoolId
      });

      await setDoc(doc(db, 'schools', decodedSchoolId, 'users', newUid), userData);

      setSuccessMsg(`Successfully created ${role} account for ${name}!`);
      
      setUsers([...users, { id: newUid, ...userData }]);
      
      setEmail('');
      setPassword('');
      setName('');
      setStudentClass('');
      setStudentBranch('');
      setStudentYear('');
      setStudentSemester('');
      setTeacherAssignments([{ class: '', subject: '', assignedStudents: [] }]);
      setSelectedStudentsForParent([]);


      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  // Group Users Logically
  const groupedUsers = useMemo(() => {
    const groups: { [key: string]: UserData[] } = {
      'Administrators': [],
      'Teachers': [],
      'Parents': [],
      'Unassigned Students': []
    };

    users.forEach(u => {
      if (u.role === 'admin') groups['Administrators'].push(u);
      else if (u.role === 'teacher') groups['Teachers'].push(u);
      else if (u.role === 'parent') groups['Parents'].push(u);
      else if (u.role === 'student') {
        // College students group by branch; school students group by class
        const groupKey = (u as any).branch
          ? `Branch: ${(u as any).branch}${(u as any).year ? ' · ' + (u as any).year : ''}`
          : u.studentClass
            ? `Class: ${u.studentClass}`
            : null;
        if (groupKey) {
          if (!groups[groupKey]) groups[groupKey] = [];
          groups[groupKey].push(u);
        } else {
          groups['Unassigned Students'].push(u);
        }
      }

    });

    // Clean up empty groups
    Object.keys(groups).forEach(key => {
      if (groups[key].length === 0) delete groups[key];
    });

    return groups;
  }, [users]);

  // Extract all students for the Parent linkage dropdown
  const allStudents = useMemo(() => {
    return users.filter(u => u.role === 'student' && u.customStudentId);
  }, [users]);

  // Helper: get students from a specific branch (for per-row college picker)
  const getStudentsByBranch = (branch: string) => {
    if (!branch) return users.filter(u => u.role === 'student' && (u as any).branch);
    return users.filter(u => u.role === 'student' && (u as any).branch === branch);
  };



  if (!decodedSchoolId) {
    return <div className="p-10 text-center">No School Selected</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <button 
        onClick={() => router.push('/superadmin')}
        className="flex items-center space-x-2 text-[#002147]/60 hover:text-[#dc143c] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Global Overview</span>
      </button>

      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-[#002147]">{schoolName}</h1>
          <p className="text-[#002147]/60 mt-1">School Code: <span className="font-mono font-bold">{decodedSchoolId}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* User Creation Portal */}
        <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/10 h-fit">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2 bg-[#dc143c]/10 rounded-lg">
              <UserPlus className="w-5 h-5 text-[#dc143c]" />
            </div>
            <h2 className="text-xl font-bold text-[#002147]">Add New User</h2>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#002147]/70 mb-1">Role</label>
              <select 
                value={role} 
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
              >
                <option value="student">Student</option>
                <option value="teacher">{institutionType === 'college' ? 'Professor' : 'Teacher'}</option>
                {institutionType === 'school' && <option value="parent">Parent</option>}
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

            {/* Dynamic Fields based on Role */}
            {role === 'student' && (
              <div className="animate-in fade-in duration-300 space-y-3">
                {institutionType === 'college' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-[#002147]/70 mb-1">Branch / Department</label>
                      <select
                        required
                        value={studentBranch}
                        onChange={(e) => setStudentBranch(e.target.value)}
                        className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
                      >
                        <option value="">Select Branch</option>
                        {schoolBranches.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-[#002147]/70 mb-1">Year</label>
                        <select
                          required
                          value={studentYear}
                          onChange={(e) => setStudentYear(e.target.value)}
                          className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-2.5 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
                        >
                          <option value="">Year</option>
                          {['1st Year','2nd Year','3rd Year','4th Year'].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#002147]/70 mb-1">Semester</label>
                        <select
                          required
                          value={studentSemester}
                          onChange={(e) => setStudentSemester(e.target.value)}
                          className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-2.5 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
                        >
                          <option value="">Sem</option>
                          {['1st','2nd','3rd','4th','5th','6th','7th','8th'].map(s => <option key={s} value={s}>{s} Sem</option>)}
                        </select>
                      </div>
                    </div>
                    <p className="text-xs text-[#002147]/50">A unique enrollment ID will be auto-generated from the branch code.</p>
                  </>
                ) : (
                  <>
                    <label className="block text-sm font-medium text-[#002147]/70 mb-1">Class / Grade</label>
                    <input
                      type="text"
                      required
                      value={studentClass}
                      onChange={(e) => setStudentClass(e.target.value)}
                      placeholder="e.g. 10A"
                      className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
                    />
                    <p className="text-xs text-[#002147]/50 mt-1">A unique ID (e.g. SDS-10A-001) will be generated automatically.</p>
                  </>
                )}
              </div>
            )}

            {role === 'teacher' && (
              <div className="animate-in fade-in duration-300 space-y-3">
                <label className="block text-sm font-medium text-[#002147]/70">
                  {institutionType === 'college' ? 'Branch & Subject Assignments' : 'Subject & Class Assignments'}
                </label>

                {/* Each assignment row is a self-contained card */}
                {teacherAssignments.map((assignment, idx) => {
                  const branchStudents = institutionType === 'college' ? getStudentsByBranch(assignment.class) : [];
                  const assigned = assignment.assignedStudents || [];
                  return (
                    <div key={idx} className="rounded-2xl border border-[#002147]/15 overflow-hidden shadow-sm">

                      {/* Row header: Branch + Subject + Remove */}
                      <div className="flex items-center gap-2 bg-[#f8fafc] px-3 py-2.5 border-b border-[#002147]/10">
                        <div className="flex-1 flex items-center gap-2">
                          {institutionType === 'college' ? (
                            <select
                              value={assignment.class}
                              onChange={(e) => handleAssignmentChange(idx, 'class', e.target.value)}
                              className="flex-1 bg-white border border-[#002147]/15 rounded-lg px-2 py-1.5 text-sm text-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]/30"
                            >
                              <option value="">Select Branch</option>
                              {schoolBranches.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={assignment.class}
                              onChange={(e) => handleAssignmentChange(idx, 'class', e.target.value)}
                              placeholder="Class (10A)"
                              className="flex-1 bg-white border border-[#002147]/15 rounded-lg px-2 py-1.5 text-sm text-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]/30"
                            />
                          )}
                          <input
                            type="text"
                            value={assignment.subject}
                            onChange={(e) => handleAssignmentChange(idx, 'subject', e.target.value)}
                            placeholder={institutionType === 'college' ? 'Subject' : 'Subject (Math)'}
                            className="flex-1 bg-white border border-[#002147]/15 rounded-lg px-2 py-1.5 text-sm text-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]/30"
                          />
                        </div>
                        {teacherAssignments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAssignmentRow(idx)}
                            className="p-1.5 text-[#dc143c]/50 hover:text-[#dc143c] hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Per-subject student picker — colleges only */}
                      {institutionType === 'college' && (
                        <div className="bg-white">
                          {/* Subheader */}
                          <div className="flex items-center justify-between px-3 py-2 bg-indigo-50 border-b border-indigo-100">
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              Students for {assignment.subject || 'this subject'}
                              {assigned.length > 0 && (
                                <span className="ml-1 bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">{assigned.length}</span>
                              )}
                            </span>
                            {branchStudents.length > 0 && (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleAssignmentSelectAll(idx, branchStudents.map(s => s.customStudentId!).filter(Boolean))}
                                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                                >All</button>
                                <span className="text-indigo-200">|</span>
                                <button
                                  type="button"
                                  onClick={() => handleAssignmentClearAll(idx)}
                                  className="text-[10px] font-bold text-indigo-400 hover:text-indigo-600 transition-colors"
                                >None</button>
                              </div>
                            )}
                          </div>

                          {/* Student list */}
                          {!assignment.class ? (
                            <p className="text-xs text-gray-400 italic px-3 py-2.5">← Select a branch to see students</p>
                          ) : branchStudents.length === 0 ? (
                            <p className="text-xs text-amber-600 font-medium px-3 py-2.5">No students registered in this branch yet.</p>
                          ) : (
                            <div className="max-h-44 overflow-y-auto divide-y divide-gray-50">
                              {branchStudents.map(student => {
                                const sid = student.customStudentId!;
                                const isSelected = assigned.includes(sid);
                                return (
                                  <div
                                    key={student.id}
                                    onClick={() => handleAssignmentStudentToggle(idx, sid)}
                                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                                      isSelected ? 'bg-emerald-50' : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                                      isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'
                                    }`}>
                                      {isSelected && (
                                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm font-semibold truncate ${ isSelected ? 'text-emerald-800' : 'text-[#002147]' }`}>
                                        {student.name}
                                      </p>
                                      <p className="text-[10px] text-gray-400">
                                        {sid} · {(student as any).year || ''}
                                      </p>
                                    </div>
                                    {isSelected && <span className="text-[10px] font-black text-emerald-600">✓</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={handleAddAssignmentRow}
                  className="flex items-center space-x-1 text-sm font-medium text-[#002147]/60 hover:text-[#002147] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add Another Subject</span>
                </button>
              </div>
            )}



            {role === 'parent' && (
              <div className="animate-in fade-in duration-300">
                <label className="block text-sm font-medium text-[#002147]/70 mb-2">
                  Link Students to this Parent
                </label>
                <div className="bg-[#f8fafc] border border-[#002147]/10 rounded-xl max-h-48 overflow-y-auto p-2 space-y-1">
                  {allStudents.length === 0 ? (
                    <p className="text-xs text-[#002147]/50 p-2 italic">No students available. Please add students first.</p>
                  ) : (
                    allStudents.map(student => (
                      <div 
                        key={student.id} 
                        onClick={() => toggleParentStudentSelection(student.customStudentId!)}
                        className="flex items-center space-x-3 p-2 rounded-lg hover:bg-white cursor-pointer transition-colors"
                      >
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

            {error && <p className="text-[#dc143c] text-sm font-medium bg-[#dc143c]/10 p-3 rounded-lg">{error}</p>}
            {successMsg && <p className="text-green-700 text-sm font-medium bg-green-100 p-3 rounded-lg">{successMsg}</p>}

            <button
              type="submit"
              disabled={isCreating}
              className="w-full bg-[#002147] text-white py-3 rounded-xl font-semibold hover:bg-[#002147]/90 transition-colors mt-2 disabled:opacity-50"
            >
              {isCreating ? 'Creating Account...' : 'Generate Account'}
            </button>
          </form>
        </div>

        {/* User Directory */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-[#002147]/10 overflow-hidden">
            <div className="p-6 border-b border-[#002147]/5 flex items-center space-x-3">
              <Users className="w-5 h-5 text-[#002147]" />
              <h2 className="text-lg font-bold text-[#002147]">Registered Users by Group</h2>
            </div>
            
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto p-0">
              {Object.keys(groupedUsers).length === 0 ? (
                <div className="px-6 py-8 text-center text-[#002147]/50">No users found. Create one using the portal.</div>
              ) : (
                Object.keys(groupedUsers).map(groupName => (
                  <div key={groupName} className="mb-6 last:mb-0">
                    <div className="bg-[#f8fafc] px-6 py-2 border-y border-[#002147]/10 sticky top-0 font-bold text-[#002147]/70 text-sm">
                      {groupName} ({groupedUsers[groupName].length})
                    </div>
                    <table className="w-full text-left text-sm text-[#002147]/80">
                      <tbody>
                        {groupedUsers[groupName].map((u) => (
                          <tr key={u.id} className="border-b border-[#002147]/5 hover:bg-[#f8fafc] transition-colors">
                            <td className="px-6 py-4 w-1/3">
                              <p className="font-medium text-[#002147]">{u.name}</p>
                              {u.role === 'student' && u.customStudentId && (
                                <p className="text-xs font-mono text-[#002147]/50 mt-1">{u.customStudentId}</p>
                              )}
                            </td>
                            <td className="px-6 py-4 w-1/3">{u.email}</td>
                            <td className="px-6 py-4 w-1/3">
                              {/* Teacher Assignments Visualizer */}
                              {u.role === 'teacher' && u.assignments && u.assignments.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {u.assignments.map((assignment, idx) => (
                                    <span key={idx} className="bg-[#002147]/5 text-[#002147] pl-2 pr-3 py-1 rounded-md text-xs border border-[#002147]/10 flex items-center space-x-2">
                                      <div className="bg-white p-1 rounded border border-[#002147]/10">
                                        <BookOpen className="w-3 h-3 text-[#dc143c]" />
                                      </div>
                                      <span className="font-semibold">{assignment.class}</span>
                                      <span className="text-[#002147]/40">-</span>
                                      <span>{assignment.subject}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : u.role === 'teacher' ? (
                                <span className="text-[#002147]/40 italic">No Assignments</span>
                              ) : null}
                              
                              {/* Parent Linked Students Visualizer */}
                              {u.role === 'parent' && u.linkedStudents && u.linkedStudents.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs font-semibold text-[#002147]/50 uppercase tracking-wider">Linked To:</span>
                                  <div className="flex flex-wrap gap-1">
                                    {u.linkedStudents.map((stuId, idx) => {
                                      const matchedStudent = users.find(s => s.customStudentId === stuId);
                                      return (
                                        <span key={idx} title={stuId} className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded text-xs border border-blue-200 flex items-center space-x-1">
                                          <LinkIcon className="w-3 h-3" />
                                          <span className="font-medium">{matchedStudent ? matchedStudent.name : stuId}</span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : u.role === 'parent' ? (
                                <span className="text-[#002147]/40 italic">No Linked Students</span>
                              ) : null}

                              {/* Admin Badge */}
                              {(u.role === 'admin') && (
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize bg-purple-100 text-purple-800`}>
                                  Administrator
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4 w-12 text-right">
                              {confirmDelete === u.id ? (
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() => handleDeleteUser(u.id, u.role)}
                                    disabled={deletingId === u.id}
                                    className="text-xs px-2 py-1 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {deletingId === u.id ? 'Deleting...' : 'Yes, Delete All'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  {u.role === 'teacher' && (
                                    <button
                                      onClick={() => setEditingTeacher(u)}
                                      className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="Edit teacher assignments"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setConfirmDelete(u.id)}
                                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete user"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Edit Teacher Modal */}
      {editingTeacher && (
        <EditTeacherModal
          teacher={editingTeacher}
          allStudents={allStudents}
          onClose={() => setEditingTeacher(null)}
          onSave={handleSaveTeacher}
        />
      )}
    </div>
  );
}


export default function SchoolManagementPage() {
  return (
    <Suspense fallback={<div>Loading Management Portal...</div>}>
      <SchoolManagementContent />
    </Suspense>
  );
}
