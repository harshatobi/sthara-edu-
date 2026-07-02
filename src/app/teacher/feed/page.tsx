'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Activity, ShieldAlert, BrainCircuit,
  HeartPulse, CheckCircle2, MessageCircle, Clock,
  Filter, RefreshCw, Bell, BookOpen, AlertTriangle,
  TrendingDown, UserX, FileX, ChevronRight, Inbox,
  Zap, Users, BarChart2, Award
} from 'lucide-react';
import { db } from '@/lib/firebase/config';
import {
  collection, query, where, getDocs,
  doc, addDoc, serverTimestamp, onSnapshot,
  orderBy, updateDoc, Timestamp
} from 'firebase/firestore';
import Link from 'next/link';

type SituationCategory = 'all' | 'security' | 'academic' | 'wellness' | 'submission';

// ─── helpers ─────────────────────────────────────────────────────────────────
function timeAgo(ts: any) {
  if (!ts) return 'Just now';
  const secs = Math.floor((Date.now() - ts.toDate().getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function catStyle(cat: string) {
  switch (cat) {
    case 'security':   return { bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-600',   badge: 'bg-rose-100 text-rose-700 border-rose-200',   dot: 'bg-rose-500' };
    case 'academic':   return { bg: 'bg-indigo-50',  border: 'border-indigo-200', text: 'text-indigo-600', badge: 'bg-indigo-100 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' };
    case 'wellness':   return { bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-600',  badge: 'bg-amber-100 text-amber-700 border-amber-200',   dot: 'bg-amber-500' };
    case 'submission': return { bg: 'bg-orange-50',  border: 'border-orange-200', text: 'text-orange-600', badge: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' };
    default:           return { bg: 'bg-gray-50',    border: 'border-gray-200',   text: 'text-gray-600',   badge: 'bg-gray-100 text-gray-700 border-gray-200',       dot: 'bg-gray-400' };
  }
}

function catIcon(cat: string, cls = 'w-5 h-5') {
  switch (cat) {
    case 'security':   return <ShieldAlert className={cls} />;
    case 'academic':   return <BrainCircuit className={cls} />;
    case 'wellness':   return <HeartPulse className={cls} />;
    case 'submission': return <FileX className={cls} />;
    default:           return <Activity className={cls} />;
  }
}

// ─── component ────────────────────────────────────────────────────────────────
export default function SituationalFeedPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [situations, setSituations]     = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<SituationCategory>('all');
  const [scanning, setScanning]         = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, high: 0, students: 0, pending: 0 });
  const [lastScanned, setLastScanned]   = useState<Date | null>(null);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) router.push('/login');
  }, [profile, loading, router]);

  // ── Real-time listener ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.schoolId) return;
    const q = query(
      collection(db, 'schools', profile.schoolId, 'situations'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSituations(data);
      const unack = data.filter((s: any) => !s.acknowledged);
      const uniqueStudents = new Set(unack.map((s: any) => s.studentId)).size;
      setStats({
        total: unack.length,
        high: unack.filter((s: any) => s.priority === 'high').length,
        students: uniqueStudents,
        pending: unack.filter((s: any) => s.category === 'submission').length,
      });
    });
    return unsub;
  }, [profile?.schoolId]);

  // ── Scan class data and generate real alerts ────────────────────────────────
  const runDiagnosticScan = useCallback(async () => {
    if (!profile?.schoolId) return;
    setScanning(true);

    try {
      const schoolId = profile.schoolId;
      // teacherClass may be empty for teachers assigned to multiple classes
      const teacherClass = profile.teacherClass || profile.studentClass || '';
      
      // Get classes this teacher is responsible for
      const teacherAssignments: string[] = profile.assignments?.map((a: any) => a.class).filter(Boolean) || [];
      const classesToScan = teacherClass ? [teacherClass] : teacherAssignments;

      // 1. Get all students (both collections) — no class filter if teacher has no assigned class
      const [usersSnap, globalSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'),
          where('schoolId', '==', schoolId),
          where('role', '==', 'student')
        )),
        getDocs(query(collection(db, 'global_users'),
          where('schoolId', '==', schoolId),
          where('role', '==', 'student')
        )),
      ]);
      const seen = new Set<string>();
      const allStudents: any[] = [];
      [...usersSnap.docs, ...globalSnap.docs].forEach(d => {
        if (!seen.has(d.id)) { seen.add(d.id); allStudents.push({ id: d.id, ...d.data() }); }
      });
      
      // Filter to teacher's classes if known, otherwise use all
      const students = classesToScan.length > 0
        ? allStudents.filter(s => classesToScan.includes(s.studentClass))
        : allStudents;

      if (students.length === 0) {
        alert(`No students found${classesToScan.length > 0 ? ` for class(es): ${classesToScan.join(', ')}` : ' in this school'}. Please make sure students are enrolled.`);
        setScanning(false);
        return;
      }

      // 2. Get all assignments
      const assignmentsQ = teacherClass
        ? query(collection(db, 'schools', schoolId, 'assignments'), where('class', '==', teacherClass))
        : query(collection(db, 'schools', schoolId, 'assignments'));
      const assignmentsSnap = await getDocs(assignmentsQ);
      const assignments = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 3. Get existing unacknowledged alert IDs to avoid duplicates
      const existingSnap = await getDocs(query(
        collection(db, 'schools', schoolId, 'situations'),
        where('acknowledged', '==', false)
      ));
      const existingKeys = new Set(existingSnap.docs.map(d => {
        const data = d.data();
        return `${data.studentId}_${data.alertKey || data.title}`;
      }));

      const newAlerts: any[] = [];

      // ── ALERT TYPE 1: Overdue submissions (assignment past due, no submission) ──
      const today = new Date();
      for (const assignment of assignments) {
        const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
        if (!dueDate || dueDate > today) continue; // not yet overdue

        // Get who submitted
        const subsSnap = await getDocs(
          collection(db, 'schools', schoolId, 'assignments', assignment.id, 'submissions')
        );
        const submittedIds = new Set(subsSnap.docs.map(d => d.id));

        for (const student of students) {
          if (submittedIds.has(student.id)) continue;
          const key = `${student.id}_overdue_${assignment.id}`;
          if (existingKeys.has(key)) continue;

          const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          newAlerts.push({
            studentId: student.id,
            studentName: student.name || 'Student',
            class: student.studentClass || teacherClass,
            category: 'submission',
            priority: daysOverdue >= 2 ? 'high' : 'medium',
            title: 'Overdue Submission',
            detail: `"${assignment.title || assignment.topic}" was due ${daysOverdue === 0 ? 'today' : `${daysOverdue} day${daysOverdue > 1 ? 's' : ''} ago`} and has not been submitted yet.`,
            alertKey: `overdue_${assignment.id}`,
            actionLink: `/teacher/grading`,
            actionLabel: 'Go to Grading',
            acknowledged: false,
            createdAt: serverTimestamp(),
          });
        }
      }

      // ── ALERT TYPE 2: Low quiz score (scored below 50%) ──
      for (const assignment of assignments) {
        const subsSnap = await getDocs(
          collection(db, 'schools', schoolId, 'assignments', assignment.id, 'submissions')
        );
        subsSnap.forEach(subDoc => {
          const sub = subDoc.data();
          const score = sub.score ?? null;
          const maxScore = sub.maxScore || sub.total || null;
          if (score === null || !maxScore) return;
          const pct = (score / maxScore) * 100;
          if (pct >= 50) return; // not low

          const key = `${subDoc.id}_lowscore_${assignment.id}`;
          if (existingKeys.has(key)) return;

          const student = students.find(s => s.id === subDoc.id);
          if (!student) return;

          newAlerts.push({
            studentId: student.id,
            studentName: student.name || sub.studentName || 'Student',
            class: student.studentClass || teacherClass,
            category: 'academic',
            priority: pct < 30 ? 'high' : 'medium',
            title: 'Low Score Detected',
            detail: `Scored ${Math.round(pct)}% (${score}/${maxScore}) on "${assignment.title || assignment.topic}". ${pct < 30 ? 'Immediate intervention recommended.' : 'Consider providing additional support.'}`,
            alertKey: `lowscore_${assignment.id}`,
            actionLink: `/teacher/mastery?studentId=${student.id}`,
            actionLabel: 'View Mastery',
            acknowledged: false,
            createdAt: serverTimestamp(),
          });
        });
      }

      // ── ALERT TYPE 3: Student with no submissions at all ──
      for (const student of students) {
        let totalSubmissions = 0;
        for (const assignment of assignments) {
          const subDoc = await getDocs(
            collection(db, 'schools', schoolId, 'assignments', assignment.id, 'submissions')
          );
          if (subDoc.docs.some(d => d.id === student.id)) totalSubmissions++;
        }

        if (assignments.length > 0 && totalSubmissions === 0) {
          const key = `${student.id}_nosubmissions`;
          if (!existingKeys.has(key)) {
            newAlerts.push({
              studentId: student.id,
              studentName: student.name || 'Student',
              class: student.studentClass || teacherClass,
              category: 'academic',
              priority: 'high',
              title: 'No Activity Detected',
              detail: `${student.name || 'This student'} has not submitted any of the ${assignments.length} assignment${assignments.length > 1 ? 's' : ''} assigned to their class. They may need a check-in.`,
              alertKey: 'nosubmissions',
              actionLink: `/teacher/mastery?studentId=${student.id}`,
              actionLabel: 'View Profile',
              acknowledged: false,
              createdAt: serverTimestamp(),
            });
          }
        }
      }

      // ── ALERT TYPE 4: Wellness — students who reported low energy ──
      for (const student of students) {
        const wellness = student.wellnessLastCheck;
        const energyLevel = student.energyLevel;
        if (energyLevel === 'low' || energyLevel === '😴') {
          const key = `${student.id}_lowenergy`;
          if (!existingKeys.has(key)) {
            newAlerts.push({
              studentId: student.id,
              studentName: student.name || 'Student',
              class: student.studentClass || teacherClass,
              category: 'wellness',
              priority: 'medium',
              title: 'Low Energy Reported',
              detail: `${student.name || 'This student'} reported feeling low energy at their last login. Consider a quick check-in or reducing workload today.`,
              alertKey: 'lowenergy',
              actionLink: `/teacher/wellness`,
              actionLabel: 'View Wellness',
              acknowledged: false,
              createdAt: serverTimestamp(),
            });
          }
        }
      }

      // ── Write all new alerts to Firestore ──
      if (newAlerts.length === 0) {
        // If no real issues found, still write a positive summary
        await addDoc(collection(db, 'schools', schoolId, 'situations'), {
          studentId: 'class',
          studentName: 'Your Class',
          class: teacherClass,
          category: 'academic',
          priority: 'low',
          title: 'Scan Complete — All Good!',
          detail: `Scanned ${students.length} student${students.length > 1 ? 's' : ''} and ${assignments.length} assignment${assignments.length > 1 ? 's' : ''}. No critical issues detected at this time.`,
          alertKey: `scan_${Date.now()}`,
          acknowledged: false,
          createdAt: serverTimestamp(),
        });
      } else {
        await Promise.all(newAlerts.map(alert =>
          addDoc(collection(db, 'schools', schoolId, 'situations'), alert)
        ));
      }

      setLastScanned(new Date());
    } catch (err: any) {
      console.error('Diagnostic scan failed:', err);
      const msg = err?.code === 'permission-denied'
        ? 'Permission denied. Please ensure Firestore rules allow teachers to write to the situations collection.'
        : (err?.message || 'Unknown error');
      alert(`Scan failed: ${msg}`);
    } finally {
      setScanning(false);
    }
  }, [profile]);

  const handleAcknowledge = async (id: string) => {
    if (!profile?.schoolId) return;
    setAcknowledgingId(id);
    try {
      await updateDoc(doc(db, 'schools', profile.schoolId, 'situations', id), {
        acknowledged: true,
        acknowledgedAt: serverTimestamp(),
        acknowledgedBy: profile.uid,
      });
    } catch (err) {
      console.error('Acknowledge failed:', err);
    } finally {
      setAcknowledgingId(null);
    }
  };

  const handleAcknowledgeAll = async () => {
    if (!profile?.schoolId) return;
    const unack = situations.filter(s => !s.acknowledged);
    await Promise.all(unack.map(s =>
      updateDoc(doc(db, 'schools', profile.schoolId, 'situations', s.id), {
        acknowledged: true,
        acknowledgedAt: serverTimestamp(),
      })
    ));
  };

  // ─── derived state ──────────────────────────────────────────────────────────
  const unacked = situations.filter(s => !s.acknowledged);
  const filtered = activeFilter === 'all'
    ? unacked
    : unacked.filter(s => s.category === activeFilter);

  const catCounts = {
    security:   unacked.filter(s => s.category === 'security').length,
    academic:   unacked.filter(s => s.category === 'academic').length,
    wellness:   unacked.filter(s => s.category === 'wellness').length,
    submission: unacked.filter(s => s.category === 'submission').length,
  };

  if (loading || !profile) return (
    <div className="min-h-screen bg-[#f8fafc] flex justify-center items-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-[#002147] font-semibold tracking-wide">Connecting to Live Feed...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f4f6fb] pb-20 font-sans">

      {/* ── Sticky Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200/60 shadow-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <Link href="/teacher" className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition border border-gray-200/60">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </Link>
            <div>
              <div className="flex items-center space-x-2 text-rose-500 text-xs font-bold uppercase tracking-wider mb-0.5">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                <span>Live Intelligence</span>
              </div>
              <h1 className="text-xl font-black text-[#002147] tracking-tight">Situational Feed</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {unacked.length > 0 && (
              <button
                onClick={handleAcknowledgeAll}
                className="text-xs font-bold text-gray-500 hover:text-emerald-600 border border-gray-200 hover:border-emerald-300 px-3 py-2 rounded-xl transition-colors bg-white"
              >
                Clear All
              </button>
            )}
            <button
              onClick={runDiagnosticScan}
              disabled={scanning}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#002147] text-white rounded-xl font-bold text-sm hover:bg-[#003366] transition-all shadow-md disabled:opacity-60"
            >
              {scanning
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Scanning…</>
                : <><Zap className="w-4 h-4" /> Run Scan</>
              }
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 space-y-8">

        {/* ── Stats Row ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Active Alerts', value: stats.total, icon: Bell, color: 'text-rose-600', bg: 'bg-rose-50' },
            { label: 'Urgent', value: stats.high, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: 'Students Flagged', value: stats.students, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Pending Submissions', value: stats.pending, icon: FileX, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-200/60 p-5 shadow-sm flex items-center gap-4">
              <div className={`${bg} p-3 rounded-xl`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-2xl font-black text-[#002147]">{value}</p>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Scan CTA when empty ─────────────────────────────────────────────── */}
        {situations.length === 0 && (
          <div className="bg-gradient-to-br from-[#002147] to-[#003b80] rounded-3xl p-10 text-white text-center shadow-xl">
            <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Zap className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-black mb-3">Run Your First Scan</h2>
            <p className="text-blue-200 mb-8 max-w-md mx-auto text-lg">
              Analyze your students' submissions, scores, and activity to automatically surface issues that need attention.
            </p>
            <button
              onClick={runDiagnosticScan}
              disabled={scanning}
              className="inline-flex items-center gap-3 px-8 py-4 bg-white text-[#002147] rounded-2xl font-black text-lg hover:bg-blue-50 transition-all shadow-lg"
            >
              {scanning ? <><RefreshCw className="w-5 h-5 animate-spin" /> Scanning…</> : <><Zap className="w-5 h-5" /> Scan Class Now</>}
            </button>
            <p className="text-blue-300 text-sm mt-4">Checks overdue tasks, low scores, missing activity & wellness</p>
          </div>
        )}

        {/* ── Filter Tabs ─────────────────────────────────────────────────────── */}
        {situations.length > 0 && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              {(['all', 'submission', 'academic', 'wellness', 'security'] as SituationCategory[]).map(cat => {
                const count = cat === 'all' ? unacked.length : catCounts[cat as keyof typeof catCounts];
                const st = catStyle(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveFilter(cat)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold capitalize transition-all border ${
                      activeFilter === cat
                        ? 'bg-[#002147] text-white border-[#002147] shadow-md'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {cat === 'all' ? 'All' : cat}
                    {count > 0 && (
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${activeFilter === cat ? 'bg-white/20 text-white' : `${st.badge}`}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}

              {lastScanned && (
                <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Last scanned: {lastScanned.toLocaleTimeString()}
                </span>
              )}
            </div>

            {/* ── Feed ────────────────────────────────────────────────────────── */}
            {filtered.length === 0 ? (
              <div className="py-20 flex flex-col items-center text-center bg-white rounded-3xl border border-gray-200/60 shadow-sm">
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </div>
                <h3 className="text-xl font-bold text-[#002147] mb-2">All Clear!</h3>
                <p className="text-gray-500 max-w-sm">No active alerts in this category. Run a scan to check for new issues.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filtered.map(situation => {
                  const st = catStyle(situation.category);
                  const isAcking = acknowledgingId === situation.id;
                  return (
                    <div
                      key={situation.id}
                      className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-500 ${
                        isAcking ? 'opacity-0 scale-95' : 'opacity-100'
                      } ${st.border}`}
                    >
                      {/* Top accent bar */}
                      <div className={`h-1 w-full ${st.dot}`} />

                      <div className="p-6">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex items-start gap-4">
                            {/* Icon */}
                            <div className={`p-3 rounded-xl ${st.bg} ${st.text} shrink-0`}>
                              {catIcon(situation.category)}
                            </div>

                            <div>
                              {/* Badges */}
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className={`text-[10px] uppercase tracking-wider font-black px-2.5 py-0.5 rounded-full border ${st.badge}`}>
                                  {situation.category}
                                </span>
                                {situation.priority === 'high' && (
                                  <span className="flex items-center gap-1 text-rose-600 text-xs font-bold">
                                    <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                                    Urgent
                                  </span>
                                )}
                                {situation.priority === 'low' && (
                                  <span className="text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-0.5 rounded-full">✓ Info</span>
                                )}
                              </div>

                              <h3 className="text-lg font-black text-[#002147]">{situation.title}</h3>
                              <p className="text-sm font-bold text-blue-600 mt-0.5">
                                👤 {situation.studentName}
                                {situation.class && <span className="text-gray-400 font-medium ml-2">· {situation.class}</span>}
                              </p>
                            </div>
                          </div>

                          <span className="text-xs text-gray-400 font-medium whitespace-nowrap flex items-center gap-1 shrink-0">
                            <Clock className="w-3.5 h-3.5" />
                            {timeAgo(situation.createdAt)}
                          </span>
                        </div>

                        <p className="text-gray-600 text-sm leading-relaxed mb-5 pl-[52px]">
                          {situation.detail}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-100 pl-[52px]">
                          <button
                            onClick={() => handleAcknowledge(situation.id)}
                            disabled={isAcking}
                            className="px-5 py-2 bg-[#002147] text-white text-sm font-bold rounded-xl hover:bg-[#003366] transition-colors shadow-sm disabled:opacity-50"
                          >
                            {isAcking ? 'Resolving…' : '✓ Resolve'}
                          </button>

                          {situation.actionLink && (
                            <Link
                              href={situation.actionLink}
                              className="px-4 py-2 bg-white border border-gray-200 text-[#002147] text-sm font-bold rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                            >
                              {situation.actionLabel || 'View'}
                              <ChevronRight className="w-4 h-4" />
                            </Link>
                          )}

                          {!situation.actionLink && (
                            <Link
                              href={`/teacher/mastery?studentId=${situation.studentId}`}
                              className="px-4 py-2 bg-white border border-gray-200 text-[#002147] text-sm font-bold rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                            >
                              View Profile <ChevronRight className="w-4 h-4" />
                            </Link>
                          )}

                          <button className="ml-auto px-4 py-2 bg-blue-50 text-blue-700 text-sm font-bold rounded-xl hover:bg-blue-100 transition-colors flex items-center gap-1.5">
                            <MessageCircle className="w-4 h-4" />
                            <span className="hidden sm:inline">Message</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Acknowledged history ─────────────────────────────────────────── */}
            {situations.filter(s => s.acknowledged).length > 0 && (
              <details className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                <summary className="px-6 py-4 cursor-pointer text-sm font-bold text-gray-500 hover:text-[#002147] transition-colors flex items-center gap-2 list-none">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  {situations.filter(s => s.acknowledged).length} Resolved Alerts
                  <ChevronRight className="w-4 h-4 ml-auto" />
                </summary>
                <div className="divide-y divide-gray-100 px-6 pb-4">
                  {situations.filter(s => s.acknowledged).slice(0, 20).map(s => (
                    <div key={s.id} className="py-3 flex items-center gap-3 text-sm opacity-50">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-[#002147] truncate">{s.title}</p>
                        <p className="text-gray-400 text-xs">{s.studentName} · {timeAgo(s.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}

      </div>
    </div>
  );
}
