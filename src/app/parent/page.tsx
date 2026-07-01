'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  Star, TrendingUp, Trophy, LogOut, Loader2, BookOpen, Clock, Activity, BrainCircuit,
  Target, Plus, X, CheckCircle2, Search, AlertTriangle, Bell, MessageSquare,
  Send, ChevronRight, Heart, Shield, Calendar, BarChart3, User, Sparkles,
  CheckCircle, XCircle, FileText, Award, ArrowUp, ArrowDown, Minus
} from 'lucide-react';
import { db } from '@/lib/firebase/config';
import {
  collection, query, where, getDocs, doc, getDoc, updateDoc,
  arrayUnion, addDoc, serverTimestamp, onSnapshot, orderBy, limit
} from 'firebase/firestore';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer as RC2 } from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────────
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
  notifications: any[];
  recentScores: { date: string; score: number }[];
}

interface StudentOption { id: string; name: string; }

// ── Helpers ──────────────────────────────────────────────────────────────────
function getGrade(p: number) { return p >= 90 ? 'A+' : p >= 80 ? 'A' : p >= 70 ? 'B' : p >= 60 ? 'C' : p >= 50 ? 'D' : 'F'; }
function getGradeColor(p: number) { return p >= 80 ? 'text-emerald-600' : p >= 60 ? 'text-amber-600' : 'text-red-600'; }
function getGradeBg(p: number) { return p >= 80 ? 'bg-emerald-50 border-emerald-200' : p >= 60 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'; }

// ── Tab Navigation ────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'assignments', label: 'Assignments', icon: BookOpen },
  { id: 'wellness', label: 'Wellness', icon: Heart },
  { id: 'notifications', label: 'Alerts', icon: Bell },
  { id: 'message', label: 'Message Teacher', icon: MessageSquare },
];

export default function ParentDashboard() {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();

  const [childrenData, setChildrenData] = useState<Child[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedChildIdx, setSelectedChildIdx] = useState(0);

  // Link modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [studentIdInput, setStudentIdInput] = useState('');
  const [linkingState, setLinkingState] = useState<'idle' | 'linking' | 'error' | 'success'>('idle');
  const [availableStudents, setAvailableStudents] = useState<StudentOption[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Message teacher
  const [messageText, setMessageText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [msgSuccess, setMsgSuccess] = useState(false);
  const [teacherMessages, setTeacherMessages] = useState<any[]>([]);

  // Auth guard
  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'parent')) router.push('/login');
  }, [profile, loading, router]);

  // ── Load children data ────────────────────────────────────────────────────
  useEffect(() => {
    const schoolId = profile?.schoolId;
    if (!schoolId) { setLoadingData(false); return; }

    const fetchChildren = async () => {
      try {
        const { getAuth } = await import('firebase/auth');
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) { setLoadingData(false); return; }

        const res = await fetch('/api/parent/get-children', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.children) {
            setChildrenData(data.children);
          }
        } else {
          console.error('Failed to load children data');
        }
      } catch (err) {
        console.error('Parent dashboard error:', err);
      } finally {
        setLoadingData(false);
      }
    };
    fetchChildren();
  }, [profile?.schoolId, profile?.linkedStudents]);

  // ── Load available students for link modal ────────────────────────────────
  useEffect(() => {
    if (!showLinkModal || availableStudents.length > 0 || !profile?.schoolId) return;
    const fetch_ = async () => {
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
          students.push({ id: data.customStudentId || d.id.slice(0, 6).toUpperCase(), name: data.name || 'Unknown' });
        }
      });
      setAvailableStudents(students);
    };
    fetch_().catch(console.error);
  }, [showLinkModal, availableStudents.length, profile?.schoolId]);

  // ── Click outside ─────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Link student ──────────────────────────────────────────────────────────
  const handleLinkStudent = async () => {
    if (!studentIdInput.trim() || !profile?.schoolId) return;
    setLinkingState('linking');
    try {
      const [s1, s2] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('schoolId', '==', profile.schoolId), where('customStudentId', '==', studentIdInput.trim()))),
        getDocs(query(collection(db, 'global_users'), where('schoolId', '==', profile.schoolId), where('customStudentId', '==', studentIdInput.trim()))),
      ]);
      if (s1.empty && s2.empty) { setLinkingState('error'); return; }
      try { await updateDoc(doc(db, 'global_users', profile.uid), { linkedStudents: arrayUnion(studentIdInput.trim()) }); }
      catch { try { await updateDoc(doc(db, 'users', profile.uid), { linkedStudents: arrayUnion(studentIdInput.trim()) }); } catch { localStorage.setItem('demo_linked_student', studentIdInput.trim()); } }
      setLinkingState('success');
      setTimeout(() => window.location.reload(), 1200);
    } catch { setLinkingState('error'); }
  };

  // ── Send message to teacher ───────────────────────────────────────────────
  const handleSendMessage = async () => {
    const child = childrenData[selectedChildIdx];
    if (!messageText.trim() || !profile?.schoolId || !child) return;
    setSendingMsg(true);
    try {
      await addDoc(collection(db, 'schools', profile.schoolId, 'parent_messages'), {
        fromParentId: profile.uid,
        fromParentName: profile.name || 'Parent',
        studentId: child.id,
        studentName: child.name,
        studentClass: child.studentClass,
        message: messageText.trim(),
        read: false,
        createdAt: serverTimestamp(),
      });
      setMessageText('');
      setMsgSuccess(true);
      setTimeout(() => setMsgSuccess(false), 3000);
    } catch (e) { console.error(e); }
    finally { setSendingMsg(false); }
  };

  // ── Loading / auth states ─────────────────────────────────────────────────
  if (loading || !profile) return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50">
      <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
    </div>
  );

  const child = childrenData[selectedChildIdx];
  const filteredSuggestions = studentIdInput.trim() === '' ? [] :
    availableStudents.filter(s => s.id.toLowerCase().includes(studentIdInput.toLowerCase()) || s.name.toLowerCase().includes(studentIdInput.toLowerCase()));

  const pendingAssignments = child?.assignments.filter(a => !a.submitted) || [];
  const submittedAssignments = child?.assignments.filter(a => a.submitted) || [];
  const unreadNotifs = child?.notifications.filter(n => !n.read).length || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/20">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 pb-24">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl border border-white shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-3xl" />
          <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-lg">
                {(profile.name || 'P').charAt(0)}
              </div>
              <div>
                <div className="inline-flex items-center space-x-1.5 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-1">
                  <Shield className="w-3 h-3" /><span>Parent Portal</span>
                </div>
                <h1 className="text-2xl font-black text-[#002147]">Welcome, {profile.name?.split(' ')[0]} 👋</h1>
                <p className="text-gray-500 text-sm font-medium">Monitoring {childrenData.length} student{childrenData.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowLinkModal(true)}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-sm">
                <Plus className="w-4 h-4" /><span>Link Child</span>
              </button>
              <button onClick={signOut}
                className="flex items-center gap-2 bg-white border-2 border-rose-100 px-4 py-2.5 rounded-xl text-rose-600 font-bold text-sm hover:bg-rose-50 transition-all">
                <LogOut className="w-4 h-4" /><span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Loading ───────────────────────────────────────────────────── */}
        {loadingData ? (
          <div className="flex justify-center items-center py-32 text-gray-300">
            <Loader2 className="w-12 h-12 animate-spin" />
          </div>
        ) : childrenData.length === 0 ? (
          /* ── No students linked ──────────────────────────────────────── */
          <div className="bg-white border border-gray-100 p-16 rounded-3xl shadow-sm text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <User className="w-12 h-12 text-indigo-400" />
            </div>
            <h3 className="text-2xl font-black text-[#002147] mb-3">No Students Linked Yet</h3>
            <p className="text-gray-500 max-w-sm mx-auto mb-8 leading-relaxed">Link your child's account using their Student ID (given by the school) to monitor their progress here.</p>
            <button onClick={() => setShowLinkModal(true)}
              className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-colors inline-flex items-center gap-2 shadow-lg">
              <Plus className="w-5 h-5" />Link Student Account
            </button>
          </div>
        ) : (
          <>
            {/* ── Child selector tabs (if multiple) ──────────────────────── */}
            {childrenData.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {childrenData.map((c, i) => (
                  <button key={c.id} onClick={() => setSelectedChildIdx(i)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm whitespace-nowrap transition-all ${selectedChildIdx === i ? 'bg-[#002147] text-white shadow-lg' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-black">{c.name.charAt(0)}</div>
                    {c.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}

            {child && (
              <>
                {/* ── Quick Stats Bar ─────────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {
                      label: 'Overall Grade', icon: Award,
                      value: child.avgPercent !== null ? getGrade(child.avgPercent) : '—',
                      sub: child.avgPercent !== null ? `${child.avgPercent}%` : 'No grades yet',
                      color: child.avgPercent !== null ? (child.avgPercent >= 80 ? 'emerald' : child.avgPercent >= 60 ? 'amber' : 'red') : 'gray',
                      trend: child.avgPercent !== null && child.avgPercent >= 70 ? 'up' : child.avgPercent !== null ? 'down' : null,
                    },
                    {
                      label: 'Submitted', icon: CheckCircle,
                      value: `${child.submittedCount}/${child.totalCount}`,
                      sub: `${child.totalCount > 0 ? Math.round((child.submittedCount / child.totalCount) * 100) : 0}% completion`,
                      color: 'blue', trend: null,
                    },
                    {
                      label: 'Pending', icon: Clock,
                      value: pendingAssignments.length,
                      sub: pendingAssignments.length === 0 ? 'All done! 🎉' : 'tasks remaining',
                      color: pendingAssignments.length === 0 ? 'emerald' : 'amber', trend: null,
                    },
                    {
                      label: 'Alerts', icon: Bell,
                      value: unreadNotifs || child.notifications.length,
                      sub: `${child.notifications.length} total notifications`,
                      color: unreadNotifs > 0 ? 'red' : 'gray', trend: null,
                    },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider">{stat.label}</p>
                        <stat.icon className={`w-4 h-4 text-${stat.color}-500`} />
                      </div>
                      <p className={`text-2xl font-black text-${stat.color}-600`}>{stat.value}</p>
                      <p className="text-xs text-gray-400 font-medium mt-0.5">{stat.sub}</p>
                    </div>
                  ))}
                </div>

                {/* ── Tab Navigation ─────────────────────────────────── */}
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 p-1.5 flex overflow-x-auto gap-1">
                  {TABS.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all flex-1 justify-center ${activeTab === tab.id ? 'bg-[#002147] text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
                      <tab.icon className="w-4 h-4" />{tab.label}
                      {tab.id === 'notifications' && unreadNotifs > 0 && (
                        <span className="bg-red-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">{unreadNotifs}</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* ── OVERVIEW TAB ───────────────────────────────────── */}
                {activeTab === 'overview' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* AI Summary */}
                    <div className="bg-gradient-to-br from-[#002147] to-indigo-900 p-6 rounded-3xl text-white relative overflow-hidden shadow-xl">
                      <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]" />
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="p-1.5 bg-indigo-500/20 rounded-xl border border-indigo-400/20">
                            <Sparkles className="w-4 h-4 text-indigo-300" />
                          </div>
                          <span className="text-xs font-black text-indigo-200 uppercase tracking-widest">AI Parent Report</span>
                        </div>
                        <h4 className="font-black text-white text-lg mb-3">{child.name.split(' ')[0]}'s Performance</h4>
                        <p className="text-indigo-100 font-medium leading-relaxed text-sm">
                          {child.avgPercent !== null
                            ? `${child.name.split(' ')[0]} has completed ${child.submittedCount} of ${child.totalCount} assignments with an overall average of ${child.avgPercent}%${child.subjectScores.length > 0 ? `, performing best in ${child.subjectScores.reduce((a, b) => a.A > b.A ? a : b).subject}` : ''}. ${child.avgPercent >= 75 ? '🌟 Excellent performance — keep encouraging!' : child.avgPercent >= 55 ? '📈 Good progress. Encourage regular revision.' : '⚠️ Needs support. Consider extra practice sessions.'}`
                            : `${child.name.split(' ')[0]} has ${child.totalCount} assignments due. No graded work yet — check back soon after submissions are reviewed.`
                          }
                        </p>

                        {/* Subject highlights */}
                        {child.subjectScores.length > 0 && (
                          <div className="mt-5 space-y-2">
                            {child.subjectScores.slice(0, 3).map((s, i) => (
                              <div key={i} className="flex items-center gap-3">
                                <span className="text-xs font-bold text-indigo-200 w-20 truncate">{s.subject}</span>
                                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full transition-all duration-700"
                                    style={{ width: `${s.A}%` }} />
                                </div>
                                <span className="text-xs font-black text-white/80 w-8 text-right">{s.A}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Subject Mastery Radar */}
                    <div className="bg-white border border-gray-100 p-5 rounded-3xl shadow-sm">
                      <h4 className="font-bold text-[#002147] mb-4 flex items-center gap-2 text-sm">
                        <Target className="w-4 h-4 text-indigo-500" />Subject Mastery
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
                        <div className="h-48 flex flex-col items-center justify-center text-center">
                          <AlertTriangle className="w-8 h-8 text-gray-200 mb-2" />
                          <p className="text-sm text-gray-400">Submit assignments to see subject mastery</p>
                        </div>
                      )}
                    </div>

                    {/* Score Trend Chart */}
                    <div className="bg-white border border-gray-100 p-5 rounded-3xl shadow-sm">
                      <h4 className="font-bold text-[#002147] mb-4 flex items-center gap-2 text-sm">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />Score Trend
                      </h4>
                      {child.recentScores.length > 1 ? (
                        <div className="h-52">
                          <RC2 width="100%" height="100%">
                            <LineChart data={child.recentScores}>
                              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                              <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                              <Tooltip formatter={(v: any) => [`${v}%`, 'Score']} />
                              <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={3} dot={{ fill: '#6366f1', strokeWidth: 0, r: 4 }} />
                            </LineChart>
                          </RC2>
                        </div>
                      ) : (
                        <div className="h-48 flex flex-col items-center justify-center text-center">
                          <BarChart3 className="w-8 h-8 text-gray-200 mb-2" />
                          <p className="text-sm text-gray-400">Score trend appears after 2+ graded tasks</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── ASSIGNMENTS TAB ────────────────────────────────── */}
                {activeTab === 'assignments' && (
                  <div className="space-y-4">
                    {/* Pending */}
                    {pendingAssignments.length > 0 && (
                      <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
                          <h4 className="font-black text-[#002147] flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-500" />Pending ({pendingAssignments.length})
                          </h4>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {pendingAssignments.map(task => (
                            <div key={task.id} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-amber-50/30 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded uppercase">{task.subject}</span>
                                  <span className="text-[10px] text-gray-400 font-bold uppercase">{task.type === 'quiz' ? '📝 Quiz' : '📚 Homework'}</span>
                                </div>
                                <p className="font-bold text-[#002147] text-sm truncate">{task.title}</p>
                                {task.dueDate && <p className="text-xs text-amber-600 font-medium mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" />Due: {task.dueDate}</p>}
                              </div>
                              <span className="bg-amber-100 text-amber-700 text-xs font-black px-3 py-1.5 rounded-xl shrink-0">⏳ Pending</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Submitted & Graded */}
                    <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-100 bg-emerald-50/50 flex items-center justify-between">
                        <h4 className="font-black text-[#002147] flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />Submitted & Graded ({submittedAssignments.length})
                        </h4>
                      </div>
                      {submittedAssignments.length === 0 ? (
                        <div className="p-12 text-center text-gray-400">
                          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                          <p className="font-medium text-sm">No graded work yet</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {submittedAssignments.map(task => {
                            const pct = task.maxScore ? Math.round((task.score / task.maxScore) * 100) : null;
                            return (
                              <div key={task.id} className="px-6 py-4 hover:bg-gray-50/50 transition-colors">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded uppercase">{task.subject}</span>
                                    </div>
                                    <p className="font-bold text-[#002147] text-sm">{task.title}</p>
                                    {/* Teacher Note */}
                                    {task.teacherNote && (
                                      <div className="mt-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
                                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-wider mb-1">💬 Teacher's Note</p>
                                        <p className="text-xs text-blue-800 font-medium leading-relaxed">{task.teacherNote}</p>
                                      </div>
                                    )}
                                  </div>
                                  {pct !== null && (
                                    <div className={`shrink-0 border rounded-2xl px-4 py-2 text-center ${getGradeBg(pct)}`}>
                                      <p className={`text-2xl font-black ${getGradeColor(pct)}`}>{getGrade(pct)}</p>
                                      <p className={`text-xs font-bold ${getGradeColor(pct)}`}>{task.score}/{task.maxScore}</p>
                                      <p className={`text-[10px] font-bold ${getGradeColor(pct)}`}>{pct}%</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── WELLNESS TAB ────────────────────────────────────── */}
                {activeTab === 'wellness' && (
                  <div className="bg-white border border-gray-100 rounded-3xl shadow-sm p-8 text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-rose-100 to-pink-100 rounded-3xl flex items-center justify-center mx-auto mb-5">
                      <Heart className="w-10 h-10 text-rose-400" />
                    </div>
                    <h4 className="text-xl font-black text-[#002147] mb-2">Student Wellness</h4>
                    <p className="text-gray-500 max-w-sm mx-auto text-sm leading-relaxed mb-6">
                      Wellness check-in data from your child's daily school sessions will appear here. This includes mood tracking, stress levels, and wellbeing scores recorded by the school.
                    </p>
                    <div className="grid grid-cols-3 gap-4 max-w-xs mx-auto">
                      {['😊 Happy', '😐 Neutral', '😟 Stressed'].map((mood, i) => (
                        <div key={i} className="bg-gray-50 rounded-2xl p-3 text-center border border-gray-100">
                          <p className="text-xs font-bold text-gray-500">{mood}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-4 italic">Data updates daily from school wellness check-ins</p>
                  </div>
                )}

                {/* ── NOTIFICATIONS TAB ──────────────────────────────── */}
                {activeTab === 'notifications' && (
                  <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                      <h4 className="font-black text-[#002147] flex items-center gap-2">
                        <Bell className="w-4 h-4 text-indigo-500" />School Notifications
                      </h4>
                      {unreadNotifs > 0 && (
                        <span className="bg-red-100 text-red-700 text-xs font-black px-3 py-1 rounded-full">{unreadNotifs} unread</span>
                      )}
                    </div>
                    {child.notifications.length === 0 ? (
                      <div className="p-12 text-center">
                        <Bell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-400 font-medium text-sm">No notifications yet</p>
                        <p className="text-gray-300 text-xs mt-1">School alerts and teacher messages will appear here</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {child.notifications.map(notif => (
                          <div key={notif.id} className={`px-6 py-4 ${!notif.read ? 'bg-indigo-50/30' : ''}`}>
                            <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${notif.type === 'foul_language' ? 'bg-red-100' : notif.type === 'grade' ? 'bg-emerald-100' : 'bg-indigo-100'}`}>
                                {notif.type === 'foul_language' ? '⚠️' : notif.type === 'grade' ? '✅' : '📢'}
                              </div>
                              <div className="flex-1">
                                <p className="font-black text-[#002147] text-sm">{notif.title || 'School Notification'}</p>
                                <p className="text-gray-600 text-xs font-medium mt-0.5 leading-relaxed">{notif.message}</p>
                                {notif.createdAt?.seconds && (
                                  <p className="text-gray-400 text-[10px] mt-1">{new Date(notif.createdAt.seconds * 1000).toLocaleString()}</p>
                                )}
                              </div>
                              {!notif.read && <div className="w-2 h-2 bg-indigo-500 rounded-full shrink-0 mt-2" />}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── MESSAGE TEACHER TAB ─────────────────────────────── */}
                {activeTab === 'message' && (
                  <div className="space-y-4">
                    <div className="bg-white border border-gray-100 rounded-3xl shadow-sm p-6">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center">
                          <MessageSquare className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <h4 className="font-black text-[#002147]">Message the Teacher</h4>
                          <p className="text-sm text-gray-500">Regarding {child.name} • Class {child.studentClass}</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex gap-2 flex-wrap">
                          {['My child is unwell today', 'Please schedule a meeting', 'Regarding recent exam results', 'Requesting extra practice materials'].map(quick => (
                            <button key={quick} onClick={() => setMessageText(quick)}
                              className="bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 text-gray-600 text-xs font-bold px-3 py-2 rounded-xl transition-colors border border-transparent hover:border-indigo-200">
                              {quick}
                            </button>
                          ))}
                        </div>

                        <textarea
                          value={messageText}
                          onChange={e => setMessageText(e.target.value)}
                          placeholder="Type your message to the teacher here..."
                          rows={5}
                          className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-[#002147] focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium text-sm resize-none"
                        />

                        {msgSuccess && (
                          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-2xl flex items-center gap-2 font-bold text-sm">
                            <CheckCircle2 className="w-5 h-5 shrink-0" />Message sent! The teacher will respond soon.
                          </div>
                        )}

                        <button onClick={handleSendMessage}
                          disabled={sendingMsg || !messageText.trim()}
                          className="w-full bg-[#002147] text-white py-4 rounded-2xl font-black hover:bg-indigo-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                          {sendingMsg ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-5 h-5" />Send Message</>}
                        </button>
                      </div>
                    </div>

                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
                      <p className="text-xs text-indigo-600 font-bold">📌 Note: Messages are delivered to the class teacher. For urgent matters, please contact the school office directly.</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Link Student Modal ──────────────────────────────────────────── */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#002147]/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl">
            <div className="p-6 sm:p-8">
              <button onClick={() => { setShowLinkModal(false); setLinkingState('idle'); setStudentIdInput(''); setShowSuggestions(false); }}
                className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-5 border border-indigo-100">
                <User className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-black text-[#002147] mb-1">Link Student Account</h3>
              <p className="text-gray-500 mb-5 text-sm">Enter your child's unique Student ID provided by the school.</p>

              <div className="space-y-4">
                <div className="relative" ref={dropdownRef}>
                  <label className="block text-sm font-bold text-[#002147] mb-2">Student ID or Name</label>
                  <input type="text" placeholder="e.g. SCHOOL-CLASS-001"
                    value={studentIdInput}
                    onChange={e => { setStudentIdInput(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-[#002147] focus:outline-none focus:border-indigo-500 transition-all font-medium text-sm"
                  />
                  {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 max-h-48 overflow-y-auto">
                      {filteredSuggestions.map(s => (
                        <button key={s.id} onClick={() => { setStudentIdInput(s.id); setShowSuggestions(false); }}
                          className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-gray-100 last:border-0 flex items-center justify-between">
                          <div>
                            <p className="font-bold text-[#002147] text-sm">{s.name}</p>
                            <p className="text-xs font-mono text-gray-500">{s.id}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {linkingState === 'error' && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-2xl text-sm font-medium flex items-center gap-2">
                    <XCircle className="w-4 h-4 shrink-0" />Student ID not found. Please verify with the school.
                  </div>
                )}
                {linkingState === 'success' && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-2xl text-sm font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />Linked! Refreshing dashboard...
                  </div>
                )}

                <button onClick={handleLinkStudent}
                  disabled={linkingState === 'linking' || linkingState === 'success' || !studentIdInput.trim()}
                  className="w-full bg-[#002147] text-white py-4 rounded-2xl font-black hover:bg-indigo-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {linkingState === 'linking' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Plus className="w-5 h-5" />Link Account</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
