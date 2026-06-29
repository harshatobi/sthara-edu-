'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Star, TrendingUp, Trophy, LogOut, Loader2, BookOpen, Clock, Activity, BrainCircuit, Target, Plus, X, CheckCircle2, Search, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';

interface Child {
  id: string;
  name: string;
  studentClass: string;
  customStudentId: string;
  assignments: any[];
  subjectScores: { subject: string; A: number; fullMark: number }[];
  submittedCount: number;
  totalCount: number;
  avgPercent: number | null;
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
    const schoolId = profile?.schoolId;
    let linked: string[] = profile?.linkedStudents || [];

    // local storage fallback
    const localLinked = typeof window !== 'undefined' ? localStorage.getItem('demo_linked_student') : null;
    if (linked.length === 0 && localLinked) linked = [localLinked];

    if (!linked || linked.length === 0) { setLoadingData(false); return; }
    if (!schoolId) { setLoadingData(false); return; }

    const fetchChildren = async () => {
      try {
        // ── 1. Find students by customStudentId in both user collections ──
        const [usersSnap, globalSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId), where('customStudentId', 'in', linked))),
          getDocs(query(collection(db, 'global_users'), where('schoolId', '==', schoolId), where('customStudentId', 'in', linked))),
        ]);

        const seen = new Set<string>();
        const studentDocs: any[] = [];
        [...usersSnap.docs, ...globalSnap.docs].forEach(d => {
          if (!seen.has(d.id)) { seen.add(d.id); studentDocs.push({ id: d.id, ...d.data() }); }
        });

        // ── 2. For each student, fetch assignments + submissions ──
        const children: Child[] = await Promise.all(studentDocs.map(async (student) => {
          // Fetch assignments for student's class
          const assignSnap = await getDocs(query(
            collection(db, 'schools', schoolId, 'assignments'),
            where('class', '==', student.studentClass)
          ));

          const assignments: any[] = [];
          const subjectScoreMap: Record<string, { sum: number; count: number }> = {};
          let totalScore = 0, totalMax = 0, submittedCount = 0;

          await Promise.all(assignSnap.docs.map(async (aDoc) => {
            const aData = aDoc.data();
            const task: any = { id: aDoc.id, ...aData, submitted: false };

            // Check submission
            try {
              const subDoc = await getDoc(doc(db, 'schools', schoolId, 'assignments', aDoc.id, 'submissions', student.id));
              if (subDoc.exists()) {
                const sub = subDoc.data();
                task.submitted = true;
                task.score = sub.score;
                task.maxScore = sub.maxScore || sub.total;
                task.aiGraded = sub.aiGraded;
                submittedCount++;

                // Track per-subject scores
                if (sub.score !== undefined && sub.maxScore) {
                  const subj = aData.subject || 'General';
                  if (!subjectScoreMap[subj]) subjectScoreMap[subj] = { sum: 0, count: 0 };
                  subjectScoreMap[subj].sum += (sub.score / sub.maxScore) * 100;
                  subjectScoreMap[subj].count++;
                  totalScore += sub.score;
                  totalMax += sub.maxScore;
                }
              }
            } catch (e) { /* ignore */ }

            assignments.push(task);
          }));

          // Sort by dueDate newest first
          assignments.sort((a, b) => new Date(b.dueDate || 0).getTime() - new Date(a.dueDate || 0).getTime());

          // Build radar chart data
          const subjectScores = Object.entries(subjectScoreMap).map(([subject, val]) => ({
            subject,
            A: Math.round(val.sum / val.count),
            fullMark: 100,
          }));

          const avgPercent = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null;

          return {
            id: student.id,
            name: student.name || 'Student',
            studentClass: student.studentClass || '',
            customStudentId: student.customStudentId || student.id.substring(0, 6).toUpperCase(),
            assignments,
            subjectScores,
            submittedCount,
            totalCount: assignSnap.size,
            avgPercent,
          };
        }));

        setChildrenData(children);
      } catch (err) {
        console.error('Parent dashboard fetch error:', err);
      } finally {
        setLoadingData(false);
      }
    };

    fetchChildren();
  }, [profile?.schoolId, profile?.linkedStudents, profile?.email]);

  // Autocomplete fetch
  useEffect(() => {
    if (!showLinkModal || availableStudents.length > 0 || !profile?.schoolId) return;
    const fetch_ = async () => {
      try {
        const [s1, s2] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('schoolId', '==', profile.schoolId), where('role', '==', 'student'))),
          getDocs(query(collection(db, 'global_users'), where('schoolId', '==', profile.schoolId), where('role', '==', 'student'))),
        ]);
        const seen = new Set<string>();
        const students: StudentOption[] = [];
        [...s1.docs, ...s2.docs].forEach(d => {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            const data = d.data();
            const sid = data.customStudentId || d.id.substring(0, 6).toUpperCase();
            students.push({ id: sid, name: data.name || 'Unknown' });
          }
        });
        setAvailableStudents(students);
      } catch (e) { console.error(e); }
    };
    fetch_();
  }, [showLinkModal, availableStudents.length, profile?.schoolId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLinkStudent = async () => {
    if (!studentIdInput.trim() || !profile?.schoolId) return;
    setLinkingState('linking');
    try {
      // Verify student exists
      const [s1, s2] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('schoolId', '==', profile.schoolId), where('customStudentId', '==', studentIdInput.trim()))),
        getDocs(query(collection(db, 'global_users'), where('schoolId', '==', profile.schoolId), where('customStudentId', '==', studentIdInput.trim()))),
      ]);
      if (s1.empty && s2.empty) { setLinkingState('error'); return; }

      // Update parent doc
      try {
        await updateDoc(doc(db, 'users', profile.uid), { linkedStudents: arrayUnion(studentIdInput.trim()) });
      } catch {
        try {
          await updateDoc(doc(db, 'global_users', profile.uid), { linkedStudents: arrayUnion(studentIdInput.trim()) });
        } catch {
          if (typeof window !== 'undefined') localStorage.setItem('demo_linked_student', studentIdInput.trim());
        }
      }
      setLinkingState('success');
      setTimeout(() => window.location.reload(), 1200);
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

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500 pb-16 relative">
      
      {/* Header */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="absolute right-0 top-0 w-48 sm:w-64 h-48 sm:h-64 bg-gradient-to-br from-indigo-100 to-purple-50 rounded-full blur-3xl -mr-16 sm:-mr-20 -mt-16 sm:-mt-20 opacity-60" />
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-2 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
            <Activity className="w-3.5 h-3.5" />
            <span>Parent Portal</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#002147]">Welcome, {profile.name?.split(' ')[0]}</h2>
          <p className="text-gray-500 font-medium mt-0.5 text-sm sm:text-base">Here is how your child is doing today.</p>
        </div>
        <button
          onClick={signOut}
          className="relative z-10 flex items-center space-x-2 bg-white border-2 border-rose-100 px-4 py-2.5 rounded-xl shadow-sm hover:bg-rose-50 hover:border-rose-200 text-rose-600 transition-all font-bold text-sm"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>

      {loadingData ? (
        <div className="flex justify-center items-center py-24 text-gray-400">
          <Loader2 className="w-10 h-10 animate-spin" />
        </div>
      ) : childrenData.length === 0 ? (
        <div className="bg-white border border-gray-200 p-10 sm:p-12 rounded-3xl shadow-sm text-center">
          <div className="w-20 h-20 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-10 h-10 text-indigo-400" />
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-[#002147] mb-2">No Students Linked</h3>
          <p className="text-gray-500 max-w-md mx-auto mb-8 text-sm sm:text-base">Link your child's account using their Student ID to see their progress here.</p>
          <button
            onClick={() => setShowLinkModal(true)}
            className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors inline-flex items-center space-x-2 shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span>Link Student Account</span>
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {childrenData.map((child) => {
            const submissionRate = child.totalCount > 0 ? Math.round((child.submittedCount / child.totalCount) * 100) : 0;
            const avgPct = child.avgPercent;
            const getGrade = (p: number) => p >= 90 ? 'A' : p >= 80 ? 'B' : p >= 70 ? 'C' : p >= 60 ? 'D' : 'F';

            // Build AI summary from real data
            const bestSubject = child.subjectScores.length > 0
              ? child.subjectScores.reduce((a, b) => a.A > b.A ? a : b).subject
              : null;
            const weakSubject = child.subjectScores.length > 1
              ? child.subjectScores.reduce((a, b) => a.A < b.A ? a : b).subject
              : null;
            const aiSummary = avgPct !== null
              ? `${child.name.split(' ')[0]} has completed ${child.submittedCount} of ${child.totalCount} assignments with an overall average of ${avgPct}%${bestSubject ? `, performing best in ${bestSubject}` : ''}${weakSubject && weakSubject !== bestSubject ? `. Additional attention recommended for ${weakSubject}` : ''}. ${avgPct >= 75 ? 'Keep up the excellent work!' : avgPct >= 55 ? 'Encourage regular study sessions.' : 'Consider scheduling extra practice time.'}`
              : `${child.name.split(' ')[0]} has ${child.totalCount} assignment(s) assigned. No graded submissions yet — check back after assignments are submitted and reviewed.`;

            return (
              <div key={child.id} className="space-y-5">
                {/* Child Profile Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-[#002147] to-indigo-900 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-lg shrink-0">
                      {child.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-xl sm:text-2xl font-bold text-[#002147]">{child.name}</h3>
                      <p className="text-gray-500 font-medium text-sm">Class {child.studentClass} • {child.customStudentId}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowLinkModal(true)}
                    className="self-start sm:self-auto flex items-center space-x-2 bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-xl font-bold hover:bg-gray-50 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Link Another Child</span>
                  </button>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-center">
                    <p className="text-2xl sm:text-3xl font-black text-[#002147]">{avgPct !== null ? `${getGrade(avgPct)}` : '—'}</p>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Overall Grade</p>
                    {avgPct !== null && <p className="text-xs text-gray-400 mt-0.5">{avgPct}%</p>}
                  </div>
                  <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-center">
                    <p className="text-2xl sm:text-3xl font-black text-[#002147]">{child.submittedCount}/{child.totalCount}</p>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Tasks Done</p>
                    <p className="text-xs text-gray-400 mt-0.5">{submissionRate}% rate</p>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-center col-span-2 sm:col-span-1">
                    <p className="text-2xl sm:text-3xl font-black text-indigo-600">{child.subjectScores.length}</p>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Subjects Active</p>
                  </div>
                </div>

                {/* Grid Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  
                  {/* Left Column */}
                  <div className="lg:col-span-1 space-y-5">
                    
                    {/* AI Summary */}
                    <div className="bg-gradient-to-br from-[#002147] to-indigo-900 p-5 rounded-3xl text-white relative overflow-hidden shadow-xl">
                      <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
                      <div className="relative z-10 flex items-center space-x-2 mb-3">
                        <div className="p-1.5 bg-indigo-500/20 rounded-xl border border-indigo-400/30">
                          <BrainCircuit className="w-4 h-4 text-indigo-300" />
                        </div>
                        <span className="font-bold text-indigo-100 tracking-wide text-xs uppercase">AI Summary</span>
                      </div>
                      <p className="relative z-10 text-indigo-50 font-medium leading-relaxed text-sm">{aiSummary}</p>
                    </div>

                    {/* Subject Mastery Radar */}
                    <div className="bg-white border border-gray-100 p-5 rounded-3xl shadow-sm">
                      <h4 className="font-bold text-[#002147] mb-4 flex items-center space-x-2 text-sm">
                        <Target className="w-4 h-4 text-indigo-500" />
                        <span>Subject Mastery</span>
                      </h4>
                      {child.subjectScores.length > 0 ? (
                        <div className="h-56 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={child.subjectScores}>
                              <PolarGrid stroke="#e5e7eb" />
                              <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 600 }} />
                              <Radar name="Score" dataKey="A" stroke="#6366f1" fill="#818cf8" fillOpacity={0.4} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-40 flex flex-col items-center justify-center text-center">
                          <AlertTriangle className="w-8 h-8 text-gray-200 mb-2" />
                          <p className="text-sm text-gray-400">Submit assignments to see subject mastery chart</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Assignment Feed */}
                  <div className="lg:col-span-2">
                    <div className="bg-white border border-gray-100 p-5 sm:p-6 rounded-3xl shadow-sm h-full">
                      <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-5">
                        <h4 className="font-bold text-lg text-[#002147] flex items-center space-x-2">
                          <BookOpen className="w-5 h-5 text-indigo-500" />
                          <span>Assignments & Tasks</span>
                        </h4>
                        <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-sm font-bold">
                          {child.assignments.length} Total
                        </span>
                      </div>
                      
                      {child.assignments.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                          <Trophy className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                          <h5 className="font-bold text-gray-500 text-sm">No assignments yet</h5>
                          <p className="text-gray-400 text-xs mt-1">Check back when the teacher posts tasks.</p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                          {child.assignments.map(task => (
                            <div key={task.id} className="group border border-gray-100 p-4 rounded-2xl flex flex-col sm:flex-row items-start justify-between hover:border-indigo-100 hover:shadow-md transition-all bg-white gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                  <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">{task.subject}</span>
                                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{task.type === 'quiz' ? '📝 Quiz' : '📚 Homework'}</span>
                                </div>
                                <h5 className="text-sm font-bold text-[#002147] leading-tight truncate group-hover:text-indigo-600 transition-colors">{task.title}</h5>
                                {task.dueDate && (
                                  <div className="flex items-center space-x-1 text-gray-400 mt-1">
                                    <Clock className="w-3 h-3" />
                                    <span className="text-xs font-medium">Due: {task.dueDate}</span>
                                  </div>
                                )}
                              </div>
                              
                              <div className="shrink-0 flex sm:flex-col items-center sm:items-end gap-2">
                                {task.submitted && task.score !== undefined && task.maxScore ? (
                                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-xl text-center min-w-[60px]">
                                    <div className="text-[9px] font-black uppercase tracking-wider opacity-70">Score</div>
                                    <div className="font-black text-sm leading-none mt-0.5">{task.score}/{task.maxScore}</div>
                                    <div className="text-[9px] font-bold">{Math.round((task.score/task.maxScore)*100)}%</div>
                                  </div>
                                ) : task.submitted ? (
                                  <div className="bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold px-3 py-1.5 rounded-xl">
                                    ✓ Submitted
                                  </div>
                                ) : (
                                  <div className="bg-amber-50 border border-amber-100 text-amber-600 text-xs font-bold px-3 py-1.5 rounded-xl">
                                    ⏳ Pending
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Link Student Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#002147]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl relative animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <div className="p-6 sm:p-8">
              <button
                onClick={() => { setShowLinkModal(false); setLinkingState('idle'); setStudentIdInput(''); setShowSuggestions(false); }}
                className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-5 border border-indigo-100">
                <BookOpen className="w-7 h-7" />
              </div>
              
              <h3 className="text-xl font-black text-[#002147] mb-1">Link Student Account</h3>
              <p className="text-gray-500 mb-5 text-sm">Enter your child's unique Student ID to link their profile.</p>
              
              <div className="space-y-4">
                <div className="relative" ref={dropdownRef}>
                  <label className="block text-sm font-bold text-[#002147] mb-2">Student ID</label>
                  <input
                    type="text"
                    placeholder="e.g. STU-AB12 or Student Name"
                    value={studentIdInput}
                    onChange={(e) => { setStudentIdInput(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium text-sm"
                  />
                  
                  {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                      {filteredSuggestions.map((student) => (
                        <button
                          key={student.id}
                          className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-gray-100 last:border-0 flex items-center justify-between group"
                          onClick={() => { setStudentIdInput(student.id); setShowSuggestions(false); }}
                        >
                          <div>
                            <p className="font-bold text-[#002147] text-sm">{student.name}</p>
                            <p className="text-xs font-medium text-gray-500">{student.id}</p>
                          </div>
                          <Search className="w-4 h-4 text-gray-300 group-hover:text-indigo-400" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {linkingState === 'error' && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm font-medium">
                    Student ID not found. Please check and try again.
                  </div>
                )}

                {linkingState === 'success' && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm font-bold flex items-center space-x-2">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>Linked! Refreshing dashboard...</span>
                  </div>
                )}

                <button
                  onClick={handleLinkStudent}
                  disabled={linkingState === 'linking' || linkingState === 'success' || !studentIdInput.trim()}
                  className="w-full bg-[#002147] text-white px-6 py-3.5 rounded-xl font-bold hover:bg-indigo-900 transition-colors disabled:opacity-50 flex justify-center items-center"
                >
                  {linkingState === 'linking' ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Link Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
