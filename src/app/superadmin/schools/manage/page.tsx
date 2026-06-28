'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, UserPlus, GraduationCap, Users, BookOpen, Plus, Trash2, Link as LinkIcon, CheckSquare, Square } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, collection, getDocs, setDoc, deleteDoc } from 'firebase/firestore';

import { initializeApp, getApps, getApp } from 'firebase/app';
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
  linkedStudents?: string[]; // Array of customStudentIds
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
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([{ class: '', subject: '' }]);
  const [selectedStudentsForParent, setSelectedStudentsForParent] = useState<string[]>([]);

  useEffect(() => {
    if (!decodedSchoolId) return;
    
    const fetchSchoolData = async () => {
      try {
        const schoolDoc = await getDoc(doc(db, 'schools', decodedSchoolId));
        if (schoolDoc.exists()) {
          setSchoolName(schoolDoc.data().name);
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

  const handleDeleteUser = async (userId: string) => {
    if (!decodedSchoolId) return;
    setDeletingId(userId);
    try {
      const results = await Promise.allSettled([
        deleteDoc(doc(db, 'global_users', userId)),
        deleteDoc(doc(db, 'schools', decodedSchoolId, 'users', userId)),
      ]);
      const anyFailed = results.some(r => r.status === 'rejected');
      if (anyFailed) {
        setError('Partial delete failure — user may still exist in one location. Please try again.');
      } else {
        setUsers(prev => prev.filter(u => u.id !== userId));
        setSuccessMsg('User removed successfully.');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to delete user. Try again.');
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };




  const handleAddAssignmentRow = () => {
    setTeacherAssignments([...teacherAssignments, { class: '', subject: '' }]);
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
        const parsedClass = studentClass.trim();
        userData.studentClass = parsedClass;
        
        // Generate Sequential ID based on current users in this class
        const existingStudentsInClass = users.filter(u => u.role === 'student' && u.studentClass === parsedClass);
        const sequenceNumber = existingStudentsInClass.length + 1;
        const sequentialId = `${decodedSchoolId}-${parsedClass}-${String(sequenceNumber).padStart(3, '0')}`;
        
        userData.customStudentId = sequentialId.toUpperCase();
      } else if (role === 'teacher') {
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
      setTeacherAssignments([{ class: '', subject: '' }]);
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
        if (u.studentClass) {
          const className = `Class: ${u.studentClass}`;
          if (!groups[className]) groups[className] = [];
          groups[className].push(u);
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
              <div className="animate-in fade-in duration-300">
                <label className="block text-sm font-medium text-[#002147]/70 mb-1">
                  Class / Grade
                </label>
                <input
                  type="text"
                  required={role === 'student'}
                  value={studentClass}
                  onChange={(e) => setStudentClass(e.target.value)}
                  placeholder="e.g. 10A"
                  className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
                />
                <p className="text-xs text-[#002147]/50 mt-2">A unique, sequential ID (e.g. SDS-10A-001) will be generated automatically.</p>
              </div>
            )}

            {role === 'teacher' && (
              <div className="animate-in fade-in duration-300 space-y-3">
                <label className="block text-sm font-medium text-[#002147]/70">
                  Subject & Class Assignments
                </label>
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
                      <button 
                        type="button" 
                        onClick={() => handleRemoveAssignmentRow(idx)}
                        className="p-1 text-[#dc143c]/60 hover:text-[#dc143c]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddAssignmentRow}
                  className="flex items-center space-x-1 text-sm font-medium text-[#002147]/60 hover:text-[#002147] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Another Assignment</span>
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
                                    onClick={() => handleDeleteUser(u.id)}
                                    disabled={deletingId === u.id}
                                    className="text-xs px-2 py-1 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {deletingId === u.id ? '...' : 'Yes'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDelete(u.id)}
                                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete user"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
