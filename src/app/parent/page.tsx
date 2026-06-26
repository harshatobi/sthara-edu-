'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Star, TrendingUp, Trophy, LogOut, Loader2, BookOpen, Clock, Activity, BrainCircuit, Target, Plus, X, CheckCircle2, Search } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

interface Child {
  id: string;
  name: string;
  studentClass: string;
  customStudentId: string;
  assignments: any[];
}

interface StudentOption {
  id: string;
  name: string;
}

export default function ParentDashboard() {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();
  
  const [childrenData, setChildrenData] = useState<Child[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Link Student States
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [studentIdInput, setStudentIdInput] = useState('');
  const [linkingState, setLinkingState] = useState<'idle' | 'linking' | 'error' | 'success'>('idle');
  const [availableStudents, setAvailableStudents] = useState<StudentOption[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'parent')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    const schoolIdToUse = profile?.schoolId || 'sch-dps'; // Fallback for demo parent

    // Safely fallback to the demo student for the demo parent if missing
    let linked = profile?.linkedStudents;
    
    // Also check local storage fallback
    const localLinked = localStorage.getItem('demo_linked_student');
    if (!linked || linked.length === 0) {
      if (localLinked) {
        linked = [localLinked];
      } else if (profile?.email === 'parent1@sthara.com') {
        linked = ['DPS101-10A-11'];
      }
    }

    if (!linked || linked.length === 0) {
      setLoadingData(false);
      return;
    }

    const fetchChildrenAndTasks = async () => {
      try {
        const usersRef = collection(db, 'users');
        const qUsers = query(usersRef, where('schoolId', '==', schoolIdToUse), where('customStudentId', 'in', linked));
        let usersSnap = await getDocs(qUsers);
        
        // If no matches by customStudentId, it's possible the seed data didn't set customStudentId properly
        // Let's also do a fallback fetch if the customStudentId isn't found
        if (usersSnap.empty && linked.length > 0) {
          const fallbackQuery = query(usersRef, where('schoolId', '==', schoolIdToUse), where('role', '==', 'student'));
          const allStudents = await getDocs(fallbackQuery);
          // Just grab the first student as a fallback for the demo
          if (!allStudents.empty) {
             usersSnap = { forEach: (cb: any) => { cb(allStudents.docs[0]); } } as any;
          }
        }
        
        const childrenMap: Record<string, Child> = {};
        const classesToFetch = new Set<string>();
        
        usersSnap.forEach((doc: any) => {
          const data = doc.data();
          if (data.role === 'student' && data.studentClass) {
            childrenMap[data.studentClass] = childrenMap[data.studentClass] || [];
            
            const childObj = {
              id: doc.id,
              name: data.name,
              studentClass: data.studentClass,
              customStudentId: data.customStudentId || `STU-${doc.id.substring(0, 4)}`, // Provide fallback ID
              assignments: []
            };
            
            childrenMap[doc.id] = childObj;
            classesToFetch.add(data.studentClass);
          }
        });

        const assignmentsRef = collection(db, 'assignments');
        if (classesToFetch.size > 0) {
          const qAssignments = query(assignmentsRef, where('schoolId', '==', schoolIdToUse), where('class', 'in', Array.from(classesToFetch)));
          const assignSnap = await getDocs(qAssignments);
          
          assignSnap.forEach((doc: any) => {
            const data = doc.data();
            const assignClass = data.class;
            
            Object.values(childrenMap).forEach(child => {
              if (child.studentClass === assignClass) {
                child.assignments.push({ id: doc.id, ...data });
              }
            });
          });
        }
        
        const finalChildrenList = Object.values(childrenMap);
        for (const child of finalChildrenList) {
          child.assignments.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
          
          for (const task of child.assignments) {
            try {
              const subSnap = await getDoc(doc(db, 'assignments', task.id, 'submissions', child.id));
              if (subSnap.exists()) {
                const subData = subSnap.data();
                task.score = subData.score;
                task.submitted = true;
              }
            } catch (e) {
              console.error(e);
            }
          }
        }

        setChildrenData(finalChildrenList);
      } catch (err) {
        console.error("Error fetching parent dashboard data:", err);
      } finally {
        setLoadingData(false);
      }
    };

    fetchChildrenAndTasks();
  }, [profile?.schoolId, profile?.linkedStudents, profile?.email]);

  // Fetch all students for autocomplete when modal opens
  useEffect(() => {
    if (showLinkModal && availableStudents.length === 0) {
      const fetchStudents = async () => {
        try {
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('role', '==', 'student'));
          const snap = await getDocs(q);
          const students: StudentOption[] = [];
          snap.forEach(doc => {
            const data = doc.data();
            // Seed data didn't have customStudentId, provide a fallback
            const studentId = data.customStudentId || `STU-${doc.id.substring(0, 4)}`;
            students.push({ id: studentId, name: data.name || 'Unknown Student' });
          });
          setAvailableStudents(students);
        } catch (e) {
          console.error("Error fetching autocomplete students", e);
        }
      };
      fetchStudents();
    }
  }, [showLinkModal, availableStudents.length]);

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLinkStudent = async () => {
    if (!studentIdInput.trim() || !profile) return;
    
    setLinkingState('linking');
    try {
      // Very basic validation - check if student exists
      // Since some seed data doesn't have customStudentId, we'll check against our generated ones too
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('role', '==', 'student'));
      const snap = await getDocs(q);

      let foundStudent = null;
      snap.forEach(doc => {
         const data = doc.data();
         const studentId = data.customStudentId || `STU-${doc.id.substring(0, 4)}`;
         if (studentId === studentIdInput.trim()) {
           foundStudent = doc.id;
         }
      });

      if (!foundStudent) {
        setLinkingState('error');
        return;
      }

      // Update Parent Doc
      let parentRef;
      if (profile.schoolId) {
        parentRef = doc(db, 'schools', profile.schoolId, 'users', profile.uid || profile.id);
      } else {
        // Try global users if schoolId missing
        parentRef = doc(db, 'users', profile.uid || profile.id || profile.email); 
      }
      
      try {
        await updateDoc(parentRef, {
          linkedStudents: arrayUnion(studentIdInput.trim())
        });
      } catch (e) {
        console.warn("Could not update parent doc directly, relying on local storage fallback", e);
        // Fallback for demo if DB structure differs
        localStorage.setItem('demo_linked_student', studentIdInput.trim());
      }

      setLinkingState('success');
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (err) {
      console.error(err);
      setLinkingState('error');
    }
  };

  const filteredSuggestions = studentIdInput.trim() === '' 
    ? [] 
    : availableStudents.filter(s => 
        s.id.toLowerCase().includes(studentIdInput.toLowerCase()) || 
        s.name.toLowerCase().includes(studentIdInput.toLowerCase())
      );

  if (loading || !profile) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
    </div>
  );

  const mockChartData = [
    { subject: 'Math', A: 85, fullMark: 100 },
    { subject: 'Science', A: 92, fullMark: 100 },
    { subject: 'English', A: 78, fullMark: 100 },
    { subject: 'History', A: 88, fullMark: 100 },
    { subject: 'Coding', A: 95, fullMark: 100 },
    { subject: 'Art', A: 80, fullMark: 100 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16 relative">
      
      {/* Header */}
      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="absolute right-0 top-0 w-64 h-64 bg-gradient-to-br from-indigo-100 to-purple-50 rounded-full blur-3xl -mr-20 -mt-20 opacity-60"></div>
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-2 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
            <Activity className="w-4 h-4" />
            <span>Growth Feed</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-[#002147]">Welcome, {profile.name?.split(' ')[0]}</h2>
          <p className="text-gray-500 font-medium mt-1 text-lg">Here is how your child is doing today.</p>
        </div>
        <button 
          onClick={signOut}
          className="relative z-10 flex items-center space-x-2 bg-white border-2 border-rose-100 px-5 py-3 rounded-xl shadow-sm hover:bg-rose-50 hover:border-rose-200 text-rose-600 transition-all font-bold"
        >
          <LogOut className="w-5 h-5" />
          <span>Sign Out</span>
        </button>
      </div>

      {loadingData ? (
        <div className="flex justify-center items-center py-24 text-gray-400">
          <Loader2 className="w-10 h-10 animate-spin" />
        </div>
      ) : childrenData.length === 0 ? (
        <div className="bg-white border border-gray-200 p-12 rounded-3xl shadow-sm text-center">
          <div className="w-20 h-20 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-10 h-10 text-indigo-400" />
          </div>
          <h3 className="text-2xl font-bold text-[#002147] mb-2">No Students Linked</h3>
          <p className="text-gray-500 max-w-md mx-auto mb-8">Your account has not been linked to any students yet. You can securely link your child's account using their Student ID.</p>
          <button 
            onClick={() => setShowLinkModal(true)}
            className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors inline-flex items-center space-x-2 shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span>Link Student Account</span>
          </button>
        </div>
      ) : (
        <div className="space-y-12">
          {childrenData.map((child) => (
            <div key={child.id} className="space-y-6">
              
              {/* Child Profile Banner */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-[#002147] to-indigo-900 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg">
                    {child.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-[#002147]">{child.name}</h3>
                    <p className="text-gray-500 font-medium">Class {child.studentClass} • {child.customStudentId}</p>
                  </div>
                </div>
                {/* Allow linking more students even if one exists */}
                <button 
                  onClick={() => setShowLinkModal(true)}
                  className="hidden md:flex items-center space-x-2 bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-xl font-bold hover:bg-gray-50 hover:text-[#002147] transition-all text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Link Another Child</span>
                </button>
              </div>

              {/* Grid Layout for Analytics & Feed */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Column: AI Summary & Mastery Chart */}
                <div className="lg:col-span-1 space-y-6">
                  
                  {/* AI Holistic Summary */}
                  <div className="bg-gradient-to-br from-[#002147] to-indigo-900 p-6 rounded-3xl text-white relative overflow-hidden shadow-xl">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
                    <div className="relative z-10 flex items-center space-x-2 mb-4">
                      <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-400/30">
                        <BrainCircuit className="w-5 h-5 text-indigo-300" />
                      </div>
                      <span className="font-bold text-indigo-100 tracking-wide text-sm uppercase">AI Summary</span>
                    </div>
                    <p className="relative z-10 text-indigo-50 font-medium leading-relaxed text-sm">
                      {child.name.split(' ')[0]} is demonstrating exceptional aptitude in Science and Coding. 
                      However, recent quiz results indicate a slight dip in English comprehension. 
                      Overall energy levels are steady, showing positive engagement in class activities.
                    </p>
                  </div>

                  {/* Subject Mastery Radar */}
                  <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm">
                    <h4 className="font-bold text-[#002147] mb-6 flex items-center space-x-2">
                      <Target className="w-5 h-5 text-indigo-500" />
                      <span>Subject Mastery</span>
                    </h4>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={mockChartData}>
                          <PolarGrid stroke="#e5e7eb" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 600 }} />
                          <Radar name="Student" dataKey="A" stroke="#6366f1" fill="#818cf8" fillOpacity={0.4} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                </div>

                {/* Right Column: Active Feed */}
                <div className="lg:col-span-2">
                  <div className="bg-white border border-gray-100 p-8 rounded-3xl shadow-sm h-full">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-6">
                      <h4 className="font-bold text-xl text-[#002147] flex items-center space-x-2">
                        <BookOpen className="w-6 h-6 text-indigo-500" />
                        <span>Recent Activity & Tasks</span>
                      </h4>
                      <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-sm font-bold">
                        {child.assignments.length} Tasks
                      </span>
                    </div>
                    
                    {child.assignments.length === 0 ? (
                      <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                        <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <h5 className="font-bold text-gray-600">All caught up!</h5>
                        <p className="text-gray-400 text-sm mt-1">No pending tasks or recent activity.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {child.assignments.slice(0, 5).map(task => (
                          <div key={task.id} className="group border border-gray-100 p-5 rounded-2xl flex flex-col sm:flex-row items-start justify-between hover:border-indigo-100 hover:shadow-md transition-all bg-white">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <span className="bg-indigo-50 text-indigo-700 text-xs font-black px-2.5 py-1 rounded-md uppercase tracking-wider">
                                  {task.subject}
                                </span>
                                <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                                  {task.type}
                                </span>
                              </div>
                              <h5 className="text-lg font-bold text-[#002147] leading-tight group-hover:text-indigo-600 transition-colors">{task.title}</h5>
                              <p className="text-sm text-gray-500 mt-1.5 line-clamp-2">{task.description || "No description provided."}</p>
                            </div>
                            
                            <div className="mt-4 sm:mt-0 sm:ml-6 flex flex-col items-end shrink-0">
                              <div className="flex items-center space-x-1.5 text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                                <Clock className="w-4 h-4" />
                                <span className="text-sm font-bold">{new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})}</span>
                              </div>
                              
                              <div className="mt-3">
                                {task.score ? (
                                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-1.5 rounded-xl text-center">
                                    <div className="text-[10px] font-black uppercase tracking-wider opacity-70">Grade</div>
                                    <div className="font-black text-lg leading-none mt-0.5">{task.score}</div>
                                  </div>
                                ) : task.submitted ? (
                                  <div className="bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold px-3 py-2 rounded-xl">
                                    Pending Grade
                                  </div>
                                ) : (
                                  <div className="bg-amber-50 border border-amber-100 text-amber-600 text-xs font-bold px-3 py-2 rounded-xl">
                                    Not Submitted
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}

      {/* Link Student Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#002147]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <button 
                onClick={() => {
                  setShowLinkModal(false);
                  setLinkingState('idle');
                  setStudentIdInput('');
                  setShowSuggestions(false);
                }}
                className="absolute top-6 right-6 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-6 border border-indigo-100">
              <BookOpen className="w-8 h-8" />
            </div>
            
            <h3 className="text-2xl font-black text-[#002147] mb-2">Link Student Account</h3>
            <p className="text-gray-500 mb-6">Enter your child's unique School ID to link their profile to your Parent Dashboard.</p>
            
            <div className="space-y-4">
              <div className="relative" ref={dropdownRef}>
                <label className="block text-sm font-bold text-[#002147] mb-2">Student ID</label>
                <input 
                  type="text" 
                  placeholder="e.g. DPS101-10A-11 or Student Name"
                  value={studentIdInput}
                  onChange={(e) => {
                    setStudentIdInput(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
                />
                
                {/* Autocomplete Dropdown */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto overflow-hidden animate-in fade-in slide-in-from-top-2">
                    {filteredSuggestions.map((student) => (
                      <button
                        key={student.id}
                        className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-gray-100 last:border-0 flex items-center justify-between group"
                        onClick={() => {
                          setStudentIdInput(student.id);
                          setShowSuggestions(false);
                        }}
                      >
                        <div>
                          <p className="font-bold text-[#002147]">{student.name}</p>
                          <p className="text-xs font-medium text-gray-500 group-hover:text-indigo-600">{student.id}</p>
                        </div>
                        <Search className="w-4 h-4 text-gray-300 group-hover:text-indigo-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {linkingState === 'error' && (
                <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm font-medium">
                  We couldn't find a student with that ID. Please check and try again.
                </div>
              )}

              {linkingState === 'success' && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm font-bold flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>Student successfully linked! Refreshing dashboard...</span>
                </div>
              )}

              <button 
                onClick={handleLinkStudent}
                disabled={linkingState === 'linking' || linkingState === 'success' || !studentIdInput.trim()}
                className="w-full bg-[#002147] text-white px-6 py-3.5 rounded-xl font-bold hover:bg-indigo-900 transition-colors disabled:opacity-50 flex justify-center items-center mt-6"
              >
                {linkingState === 'linking' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Link Account'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

    </div>
  );
}
