'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, AlertTriangle, ChevronDown, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, doc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import Link from 'next/link';

export default function TeacherHeatmap() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [assignmentsList, setAssignmentsList] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  // Class list is populated dynamically after fetching students — no hardcoded defaults

  useEffect(() => {
    const fetchHeatmapData = async () => {
      if (!profile?.schoolId) return;
      const schoolId = profile.schoolId;
      setIsLoadingData(true);

      try {
        // Query BOTH collections — users (old) and global_users (new signup flow)
        const [usersSnap, globalUsersSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId), where('role', '==', 'student'))),
          getDocs(query(collection(db, 'global_users'), where('schoolId', '==', schoolId), where('role', '==', 'student'))),
        ]);

        const seenIds = new Set<string>();
        const allStudents: any[] = [];
        const addStudents = (snap: any) => snap.forEach((s: any) => {
          if (!seenIds.has(s.id)) { seenIds.add(s.id); allStudents.push({ id: s.id, ...s.data(), grades: {} }); }
        });
        addStudents(usersSnap);
        addStudents(globalUsersSnap);

        // Dynamically build class list from actual student data
        const classSet = new Set<string>();
        allStudents.forEach(s => { if (s.studentClass) classSet.add(s.studentClass); });
        const discoveredClasses = Array.from(classSet).sort();

        // If teacher has a specific class assigned, use only that; otherwise use discovered ones
        const classesToShow = profile.teacherClass ? [profile.teacherClass] : discoveredClasses;
        setAvailableClasses(classesToShow);

        // Auto-select class: keep current if valid, else pick first
        const activeClass = selectedClass && classesToShow.some(c => c.toLowerCase() === selectedClass.toLowerCase())
          ? selectedClass
          : (classesToShow[0] || '');

        if (activeClass !== selectedClass) {
          setSelectedClass(activeClass);
          // setSelectedClass triggers this effect again, so we stop here to avoid double-render
          setIsLoadingData(false);
          return;
        }

        // Filter students by the active class (case-insensitive)
        const students = activeClass
          ? allStudents.filter(s => !s.studentClass || s.studentClass.toLowerCase() === activeClass.toLowerCase())
          : allStudents;

        // Fetch assignments — try matching the class exactly, then case-insensitive fallback
        let assignments: any[] = [];
        const tryClasses = activeClass
          ? [activeClass, ...discoveredClasses.filter(c => c !== activeClass)]
          : discoveredClasses;

        for (const cls of tryClasses) {
          const aSnap = await getDocs(query(
            collection(db, 'schools', schoolId, 'assignments'),
            where('class', '==', cls)
          ));
          if (!aSnap.empty) {
            aSnap.forEach(a => assignments.push({ id: a.id, ...a.data() }));
            break;
          }
        }
        // If still no assignments, fetch all for the school
        if (assignments.length === 0) {
          const allASnap = await getDocs(collection(db, 'schools', schoolId, 'assignments'));
          allASnap.forEach(a => assignments.push({ id: a.id, ...a.data() }));
        }
        assignments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        setAssignmentsList(assignments);

        const submissionPromises = assignments.map(async (task) => {
          const subsSnap = await getDocs(collection(db, 'schools', schoolId, 'assignments', task.id, 'submissions'));
          subsSnap.forEach(sub => {
            const studentId = sub.id;
            const student = students.find(s => s.id === studentId);
            const data = sub.data();
            if (student && data.teacherApproved) {
              if (data.score !== undefined && data.maxScore > 0) {
                student.grades[task.id] = {
                  percentage: Math.round((data.score / data.maxScore) * 100),
                  display: `${data.score}/${data.maxScore}`
                };
              } else if (data.grade !== undefined) {
                student.grades[task.id] = data.grade;
              }
            } else if (student && data.grade !== undefined && !data.hasOwnProperty('teacherApproved')) {
               student.grades[task.id] = data.grade;
            }
          });
        });

        await Promise.all(submissionPromises);

        students.forEach(student => {
          assignments.forEach(task => {
            if (student.grades[task.id] === undefined) {
              student.grades[task.id] = null;
            }
          });
        });

        setHeatmapData(students);
      } catch (err) {
        console.error("Error fetching heatmap data", err);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchHeatmapData();
  }, [profile?.schoolId, selectedClass]);


  const getHeatmapStyle = (scoreVal: string | number | null | undefined) => {
    if (scoreVal === null || scoreVal === undefined || scoreVal === '') 
      return 'bg-gray-50/50 text-gray-300 border-gray-100 hover:border-gray-300'; 
    let score = typeof scoreVal === 'number' ? scoreVal : parseInt(scoreVal);
    if (isNaN(score)) return 'bg-gray-50/50 text-gray-300 border-gray-100';
    
    // Premium refined color palette
    if (score >= 90) return 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400 hover:shadow-emerald-100';
    if (score >= 80) return 'bg-teal-50 text-teal-700 border-teal-200 hover:border-teal-400 hover:shadow-teal-100';
    if (score >= 70) return 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400 hover:shadow-amber-100';
    if (score >= 60) return 'bg-orange-50 text-orange-700 border-orange-200 hover:border-orange-400 hover:shadow-orange-100';
    return 'bg-rose-50 text-rose-700 border-rose-200 hover:border-rose-400 hover:shadow-rose-100 font-bold';
  };

  const getProgressColor = (score: number) => {
    if (score >= 90) return 'bg-emerald-500';
    if (score >= 80) return 'bg-teal-500';
    if (score >= 70) return 'bg-amber-500';
    if (score >= 60) return 'bg-orange-500';
    return 'bg-rose-500';
  };

  const handleSeedData = async () => {
    if (!profile?.schoolId || !selectedClass) return;
    const schoolId = profile.schoolId;
    setIsSeeding(true);
    try {
      const [usSnap, guSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId), where('role', '==', 'student'))),
        getDocs(query(collection(db, 'global_users'), where('schoolId', '==', schoolId), where('role', '==', 'student'))),
      ]);
      const seenS = new Set<string>();
      const allS: any[] = [];
      [...usSnap.docs, ...guSnap.docs].forEach(d => { if (!seenS.has(d.id)) { seenS.add(d.id); allS.push({ id: d.id, ...d.data() }); } });
      const students = selectedClass
        ? allS.filter((s: any) => !s.studentClass || s.studentClass.toLowerCase() === selectedClass.toLowerCase())
        : allS;
      
      if (students.length === 0) {
        alert('Failed to seed data: No students found for this school.');
        setIsSeeding(false);
        return;
      }

      const fakeAssignments = [
        { title: 'Algebra Quiz 1', type: 'Quiz', subject: 'Math' },
        { title: 'Essay Draft', type: 'Homework', subject: 'English' },
        { title: 'Midterm Exam', type: 'Exam', subject: 'Science' },
        { title: 'History Project', type: 'Project', subject: 'History' },
        { title: 'Lab Report', type: 'Homework', subject: 'Science' },
      ];

      const assignmentRefs: string[] = [];

      for (let i = 0; i < fakeAssignments.length; i++) {
        const a = fakeAssignments[i];
        const d = new Date();
        d.setDate(d.getDate() - (10 - i * 2));
        const dueDate = d.toISOString().split('T')[0];

        const assignmentRef = await addDoc(collection(db, 'schools', schoolId, 'assignments'), {
          title: a.title,
          type: a.type,
          subject: a.subject,
          class: selectedClass,
          description: `Auto-generated demo assignment for ${selectedClass}`,
          teacherId: profile.uid || 'demo-teacher',
          teacherName: profile.name || 'Demo Teacher',
          dueDate: dueDate,
          createdAt: serverTimestamp()
        });
        assignmentRefs.push(assignmentRef.id);
      }

      for (const student of students) {
        for (const assignmentId of assignmentRefs) {
          const hash = student.id.charCodeAt(0) + student.id.charCodeAt(student.id.length - 1);
          const baseSkill = 50 + (hash % 50); 
          
          let grade = baseSkill + (Math.floor(Math.random() * 30) - 15);
          if (grade > 100) grade = 100;
          if (grade < 30) grade = 30;

          await setDoc(doc(db, 'schools', schoolId, 'assignments', assignmentId, 'submissions', student.id), {
            studentId: student.id,
            studentName: (student as any).name || 'Unknown Student',
            studentClass: (student as any).studentClass || selectedClass,
            text: 'Demo submission text.',
            grade: grade,
            teacherApproved: true,
            score: grade,
            maxScore: 100,
            gradedAt: serverTimestamp(),
            submittedAt: serverTimestamp()
          });
        }
      }

      window.location.reload();
    } catch (err) {
      console.error(err);
      alert('An error occurred while seeding data.');
    } finally {
      setIsSeeding(false);
    }
  };

  if (loading || !profile) return (
    <div className="min-h-screen bg-[#f8fafc] flex justify-center items-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-[#002147] font-semibold tracking-wide">Loading Diagnostics...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 pb-16 font-sans">
      
      {/* Header Banner */}
      <div className="bg-white border-b border-gray-200/60 shadow-sm sticky top-0 z-40 backdrop-blur-xl bg-white/80">
        <div className="max-w-[1400px] mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <Link href="/teacher" className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors border border-gray-200/60 group">
              <ArrowLeft className="w-5 h-5 text-gray-500 group-hover:text-[#002147] transition-colors" />
            </Link>
            <div>
              <div className="flex items-center space-x-2 text-blue-600 text-xs font-bold uppercase tracking-wider mb-1">
                <TrendingUp className="w-4 h-4" />
                <span>Diagnostic Engine</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[#002147]">Class Heatmap</h1>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <div className="hidden lg:flex items-center space-x-4 text-xs font-semibold px-4 py-2 bg-gray-50 border border-gray-200/60 rounded-xl">
              <div className="flex items-center space-x-2"><div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-sm" /><span className="text-gray-600">Excellent</span></div>
              <div className="flex items-center space-x-2"><div className="w-2.5 h-2.5 bg-amber-400 rounded-full shadow-sm" /><span className="text-gray-600">Average</span></div>
              <div className="flex items-center space-x-2"><div className="w-2.5 h-2.5 bg-rose-500 rounded-full shadow-sm" /><span className="text-gray-600">At Risk</span></div>
            </div>
            
            <div className="relative">
              <select 
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="appearance-none bg-white border border-gray-200 hover:border-gray-300 rounded-xl pl-4 pr-10 py-2.5 text-[#002147] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold shadow-sm transition-all cursor-pointer"
              >
                {availableClasses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-8">
        
        {/* Main Grid Container */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-200/60 overflow-hidden relative">
          
          {isLoadingData ? (
            <div className="p-12">
              <div className="animate-pulse space-y-6">
                <div className="h-8 bg-gray-100 rounded-lg w-1/4 mb-10"></div>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex space-x-4">
                    <div className="h-12 bg-gray-100 rounded-lg w-1/5"></div>
                    <div className="h-12 bg-gray-50 rounded-lg w-full"></div>
                  </div>
                ))}
              </div>
            </div>
          ) : heatmapData.length === 0 ? (
            <div className="py-32 px-6 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                <AlertTriangle className="w-10 h-10 text-blue-500" />
              </div>
              <h3 className="text-2xl font-bold text-[#002147] mb-2">No Students Found</h3>
              <p className="text-gray-500 max-w-md mb-8">We couldn't find any student records for {selectedClass}. Make sure students are registered and assigned to this class.</p>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="px-6 py-5 bg-gray-50/90 backdrop-blur-md sticky left-0 z-20 border-b border-gray-200/60 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] w-64">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Student Name</span>
                    </th>
                    
                    {assignmentsList.length === 0 ? (
                      <th className="px-6 py-8 text-center border-b border-gray-200/60 bg-white">
                        <div className="flex flex-col items-center justify-center space-y-4 py-10">
                          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100">
                            <CheckCircle2 className="w-8 h-8 text-gray-300" />
                          </div>
                          <div className="text-center">
                            <p className="text-gray-500 font-medium mb-4">No assignments graded yet.</p>
                            <button 
                              onClick={handleSeedData}
                              disabled={isSeeding}
                              className="bg-[#002147] text-white px-6 py-2.5 rounded-xl font-bold hover:bg-[#003366] transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center space-x-2 mx-auto"
                            >
                              {isSeeding ? (
                                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Generating...</span></>
                              ) : (
                                <span>Populate Demo Data</span>
                              )}
                            </button>
                          </div>
                        </div>
                      </th>
                    ) : (
                      assignmentsList.map(a => (
                        <th key={a.id} className="px-4 py-4 text-center bg-white border-b border-gray-200/60 min-w-[140px] group relative">
                          <div className="text-sm font-bold text-[#002147] truncate w-28 mx-auto">{a.title}</div>
                          <div className="text-[10px] font-semibold text-gray-400 mt-1 uppercase tracking-wider">{a.dueDate}</div>
                        </th>
                      ))
                    )}
                    
                    {assignmentsList.length > 0 && (
                      <th className="px-6 py-5 text-center bg-gray-50/50 border-b border-gray-200/60 border-l border-gray-100 min-w-[120px] sticky right-0 z-20 backdrop-blur-md shadow-[-1px_0_0_0_rgba(0,0,0,0.02)]">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Average</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {heatmapData.map((student, idx) => {
                    let total = 0;
                    let count = 0;
                    Object.values(student.grades).forEach((g: any) => {
                      const num = g?.percentage !== undefined ? g.percentage : parseInt(g);
                      if (!isNaN(num)) { total += num; count++; }
                    });
                    const avg = count > 0 ? Math.round(total / count) : null;

                    return (
                      <tr key={student.id} className="hover:bg-blue-50/30 transition-colors group">
                        
                        {/* Student Name Sticky Column */}
                        <td className="px-6 py-4 bg-white/90 group-hover:bg-blue-50/90 backdrop-blur-md sticky left-0 z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center border border-blue-300 text-blue-700 font-bold text-xs shadow-inner">
                                {student.name.charAt(0)}
                              </div>
                              <span className="font-bold text-[#002147] whitespace-nowrap">{student.name}</span>
                            </div>
                            {avg !== null && avg < 60 && (
                              <div title="At Risk" className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                            )}
                          </div>
                        </td>
                        
                        {/* Assignment Grades */}
                        {assignmentsList.length > 0 && assignmentsList.map(a => {
                          const gradeObj = student.grades[a.id];
                          const scoreVal = gradeObj?.percentage ?? gradeObj;
                          const displayVal = gradeObj?.display || gradeObj || '-';
                          
                          return (
                            <td key={a.id} className="p-2 relative group/cell">
                              <div className={`
                                h-14 flex items-center justify-center rounded-xl border transition-all duration-300 ease-out
                                ${getHeatmapStyle(scoreVal)}
                                ${scoreVal !== null ? 'hover:scale-110 hover:-translate-y-1 hover:z-30 shadow-sm cursor-default' : ''}
                                relative z-0
                              `}>
                                <span className="font-bold tracking-tight">{displayVal}</span>
                                
                                {/* Tooltip */}
                                {scoreVal !== null && (
                                  <div className="absolute bottom-full mb-2 opacity-0 group-hover/cell:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap pointer-events-none shadow-xl border border-gray-700 z-50 flex flex-col items-center">
                                    <span className="font-bold mb-1">{a.title}</span>
                                    <span className="text-gray-300">Score: {displayVal}</span>
                                    <div className="absolute top-full w-2 h-2 bg-gray-900 rotate-45 -mt-1 border-r border-b border-gray-700"></div>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        
                        {/* Average Column */}
                        {assignmentsList.length > 0 && (
                          <td className="p-3 bg-gray-50/30 group-hover:bg-blue-50/50 border-l border-gray-100 transition-colors sticky right-0 backdrop-blur-md shadow-[-1px_0_0_0_rgba(0,0,0,0.02)] z-10">
                            <Link href={`/teacher/mastery?studentId=${student.id}`} className="block w-full h-full">
                              <div className="bg-white border border-gray-200 rounded-xl p-2 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer relative overflow-hidden group/avg">
                                <div className="text-center font-bold text-[#002147] text-lg mb-1">{avg ? `${avg}%` : '-'}</div>
                                {avg && (
                                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full ${getProgressColor(avg)} transition-all duration-1000 ease-out`} 
                                      style={{ width: `${avg}%` }}
                                    />
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-blue-600/5 flex items-center justify-center opacity-0 group-hover/avg:opacity-100 transition-opacity">
                                  <span className="text-[10px] uppercase font-bold text-blue-700 tracking-wider bg-white/90 px-2 py-1 rounded backdrop-blur-sm shadow-sm">View Insights</span>
                                </div>
                              </div>
                            </Link>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {/* CSS for custom invisible scrollbar to keep it clean */}
        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            height: 8px;
            width: 8px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
          }
        `}</style>
      </div>
    </div>
  );
}
