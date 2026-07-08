'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, AlertTriangle, ChevronDown, BookOpen, BarChart2 } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import Link from 'next/link';


export default function TeacherHeatmap() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  // subjectColumns: one entry per subject the teacher teaches
  // each entry has the subject name + per-student average scores
  const [students, setStudents] = useState<any[]>([]);
  const [subjectColumns, setSubjectColumns] = useState<{ subject: string; scores: Record<string, number | null> }[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Auto-select the first subject this teacher teaches when profile loads
  useEffect(() => {
    if (!profile?.assignments || selectedSubject) return;
    const first = (profile.assignments as any[]).find(a => a.subject)?.subject;
    if (first) setSelectedSubject(first);
  }, [profile?.assignments]);


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
        // Get auth token
        const idToken = await getAuth().currentUser?.getIdToken();

        const headers = {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        };

        // ── 1. Fetch students via Admin SDK API ──────────────────────────────
        const studRes = await fetch('/api/teacher/get-students', {
          method: 'POST', headers,
          body: JSON.stringify({ schoolId }),
        });
        const studData = await studRes.json();
        if (!studRes.ok) throw new Error(studData.error || 'Failed to fetch students');
        const allStudents: any[] = studData.students || [];

        // ── 2. Fetch ONLY this teacher's assignments ──────────────────────────
        const assignRes = await fetch('/api/teacher/get-assignments', {
          method: 'POST', headers,
          body: JSON.stringify({ schoolId, teacherId: profile.uid }),
        });

        const assignData = await assignRes.json();
        if (!assignRes.ok) throw new Error(assignData.error || 'Failed to fetch assignments');
        const allAssignments: any[] = assignData.assignments || [];

        // ── 3. Discover classes from student data ──────────────────────────
        const classSet = new Set<string>();
        allStudents.forEach(s => { if (s.studentClass) classSet.add(s.studentClass); });
        const discoveredClasses = Array.from(classSet).sort();
        const teacherAssignedClasses = [
          ...(profile.assignments?.map((a: any) => a.class).filter(Boolean) ?? []),
          ...(profile.teacherClass ? [profile.teacherClass] : []),
        ];
        const uniqueTeacherClasses = [...new Set(teacherAssignedClasses)];
        const classesToShow = uniqueTeacherClasses.length > 0 ? uniqueTeacherClasses : discoveredClasses;
        setAvailableClasses(classesToShow);

        const activeClass = selectedClass && classesToShow.some(c => c.toLowerCase() === selectedClass.toLowerCase())
          ? selectedClass : (classesToShow[0] || '');
        if (activeClass !== selectedClass) {
          setSelectedClass(activeClass);
          setIsLoadingData(false);
          return;
        }

        // ── 4. Filter students to active class & teacher's assignment ──────
        const uniqueClasses = uniqueTeacherClasses.map(c => c.toLowerCase());
        let classStudents = activeClass
          ? allStudents.filter(s => s.studentClass && s.studentClass.toLowerCase() === activeClass.toLowerCase())
          : allStudents;
        if (uniqueClasses.length > 0) {
          classStudents = classStudents.filter(s => s.studentClass && uniqueClasses.includes(s.studentClass.toLowerCase()));
        }

        // If a specific subject is selected, further filter to only students assigned to that subject
        if (selectedSubject) {
          const subjectAssign = (profile.assignments || []).find(
            (a: any) => a.class?.toLowerCase() === activeClass.toLowerCase() &&
                        a.subject?.toLowerCase() === selectedSubject.toLowerCase()
          );
          if (subjectAssign?.assignedStudents?.length > 0) {
            const assignedSet = new Set(subjectAssign.assignedStudents as string[]);
            // Match against BOTH Firestore doc ID and customStudentId
            classStudents = classStudents.filter(s =>
              (s.id && assignedSet.has(s.id)) ||
              (s.customStudentId && assignedSet.has(s.customStudentId))
            );
          }
        }

        setStudents(classStudents);

        // ── 5. Determine teacher's subjects for this class ────────────────
        const allTeacherSubjects: string[] = [...new Set(
          (profile.assignments ?? [])
            .filter((a: any) => !activeClass || a.class?.toLowerCase() === activeClass.toLowerCase())
            .map((a: any) => a.subject)
            .filter(Boolean)
        )] as string[];

        // If a subject is selected, only show that column; otherwise show all
        const teacherSubjects = selectedSubject
          ? [selectedSubject]
          : allTeacherSubjects;

        // ── 6. Filter assignments by class + subject ─────────────────────
        const relevant = allAssignments.filter((a: any) =>
          (!activeClass || a.class?.toLowerCase() === activeClass.toLowerCase()) &&
          (teacherSubjects.length === 0 || teacherSubjects.includes(a.subject))
        );

        // Group assignments by subject
        const bySubject: Record<string, any[]> = {};
        relevant.forEach((a: any) => {
          const subj = a.subject || 'General';
          if (!bySubject[subj]) bySubject[subj] = [];
          bySubject[subj].push(a);
        });

        const subjectOrder = teacherSubjects.length > 0 ? teacherSubjects : Object.keys(bySubject);
        subjectOrder.forEach(s => { if (!bySubject[s]) bySubject[s] = []; });

        // ── 7. Compute per-student averages from submission data already in assignment ─
        const subjectCols: { subject: string; scores: Record<string, number | null> }[] = [];

        for (const subject of subjectOrder) {
          const subjectAssignments = bySubject[subject] || [];
          const studentTotals: Record<string, { sum: number; count: number }> = {};
          classStudents.forEach(s => { studentTotals[s.id] = { sum: 0, count: 0 }; });

          for (const assign of subjectAssignments) {
            // Use submittedData already included in the assignment from get-assignments API
            const submittedData = assign.submittedData || {};
            Object.entries(submittedData).forEach(([studentId, sub]: [string, any]) => {
              if (!studentTotals[studentId]) studentTotals[studentId] = { sum: 0, count: 0 };
              const score = sub?.score ?? sub?.aiResult?.totalScore;
              const max = sub?.maxScore ?? sub?.aiResult?.maxTotalScore ?? 10;
              if (score != null) {
                studentTotals[studentId].sum += (score / max) * 100;
                studentTotals[studentId].count += 1;
              }
            });
          }

          const scores: Record<string, number | null> = {};
          classStudents.forEach(s => {
            const t = studentTotals[s.id];
            scores[s.id] = t && t.count > 0 ? Math.round(t.sum / t.count) : null;
          });
          subjectCols.push({ subject, scores });
        }

        setSubjectColumns(subjectCols);
      } catch (err: any) {
        console.error('[heatmap] Error:', err);
        alert(`Heatmap load failed: ${err.message}`);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchHeatmapData();
  }, [profile?.schoolId, selectedClass, selectedSubject]);





  const getScoreColor = (score: number | null) => {
    if (score === null) return { bg: 'bg-gray-50', text: 'text-gray-400', bar: 'bg-gray-200', border: 'border-gray-100', label: 'No Data' };
    if (score >= 85) return { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', border: 'border-emerald-200', label: 'Excellent' };
    if (score >= 70) return { bg: 'bg-teal-50', text: 'text-teal-700', bar: 'bg-teal-400', border: 'border-teal-200', label: 'Good' };
    if (score >= 55) return { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-400', border: 'border-amber-200', label: 'Average' };
    return { bg: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-500', border: 'border-rose-200', label: 'At Risk' };
  };

  const getOverallAvg = (studentId: string) => {
    const vals = subjectColumns.map(c => c.scores[studentId]).filter(v => v !== null) as number[];
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
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

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200/60 shadow-sm sticky top-0 z-40 backdrop-blur-xl bg-white/80">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <Link href="/teacher" className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors border border-gray-200/60">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </Link>
            <div>
              <div className="flex items-center space-x-2 text-blue-600 text-xs font-bold uppercase tracking-wider mb-0.5">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Diagnostic Engine</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[#002147]">Class Heatmap</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Legend */}
            <div className="hidden md:flex items-center gap-3 text-xs font-semibold px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"/> Excellent</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400"/> Average</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"/> At Risk</span>
            </div>
            {/* Subject selector — always visible, no 'All Subjects' option */}
            {(() => {
              const subjectsForClass = [...new Set(
                (profile?.assignments || []).filter((a: any) => !selectedClass || a.class === selectedClass).map((a: any) => a.subject).filter(Boolean)
              )] as string[];
              if (subjectsForClass.length === 0) return null;
              return (
                <div className="relative">
                  <select
                    value={selectedSubject}
                    onChange={e => setSelectedSubject(e.target.value)}
                    className="appearance-none bg-indigo-50 border border-indigo-200 hover:border-indigo-300 rounded-xl pl-4 pr-9 py-2.5 text-indigo-800 font-bold text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/20 cursor-pointer"
                  >
                    {subjectsForClass.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                </div>
              );
            })()}
            {/* Class selector — hidden, auto-selected in background */}
          </div>

        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">

        {isLoadingData ? (
          <div className="space-y-4">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse flex items-center gap-6">
                <div className="w-36 h-4 bg-gray-100 rounded-full" />
                <div className="flex gap-4 flex-1">
                  <div className="flex-1 h-16 bg-gray-50 rounded-xl" />
                  <div className="flex-1 h-16 bg-gray-50 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : students.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-28 flex flex-col items-center text-center shadow-sm">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-5">
              <AlertTriangle className="w-9 h-9 text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-[#002147] mb-2">No Students Found</h3>
            <p className="text-gray-400 max-w-sm text-sm">
              No students are assigned to {selectedClass || 'this class'} yet.
              Make sure students are registered and assigned in the admin portal.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* ── Column headers (desktop only) ─────────────────────────── */}
            <div className="hidden md:flex items-center gap-4 px-5 pb-1">
              <div className="w-48 shrink-0" />
              {subjectColumns.map(col => (
                <div key={col.subject} className="flex-1 text-center">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center justify-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />{col.subject}
                  </span>
                </div>
              ))}
              <div className="w-28 shrink-0 text-center">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center justify-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5" />Overall
                </span>
              </div>
            </div>

            {/* ── Student rows ───────────────────────────────────────── */}
            {students.map((student) => {
              const overall = getOverallAvg(student.id);
              const overallColor = getScoreColor(overall);
              const isAtRisk = overall !== null && overall < 55;

              return (
                <div
                  key={student.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 p-4 sm:p-5"
                >
                  {/* Top row: avatar + name + overall badge */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 border border-blue-300 flex items-center justify-center text-blue-700 font-bold text-sm shadow-inner shrink-0">
                      {student.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[#002147] truncate text-sm">{student.name}</p>
                      {isAtRisk && (
                        <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wide flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse inline-block" />
                          At Risk
                        </span>
                      )}
                    </div>
                    {/* Overall score — always visible */}
                    <Link href={`/teacher/mastery?studentId=${student.id}`}>
                      <div className={`rounded-xl border ${overallColor.bg} ${overallColor.border} px-3 py-2 text-center min-w-[60px] hover:shadow-md transition-all`}>
                        <div className={`text-base font-black ${overallColor.text}`}>
                          {overall !== null ? `${overall}%` : '—'}
                        </div>
                        <div className={`text-[9px] font-bold uppercase tracking-wide ${overallColor.text} opacity-70`}>Overall</div>
                      </div>
                    </Link>
                  </div>

                  {/* Subject chips row */}
                  {subjectColumns.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {subjectColumns.map(col => {
                        const score = col.scores[student.id];
                        const c = getScoreColor(score);
                        return (
                          <div key={col.subject} className={`flex items-center gap-1.5 rounded-xl border ${c.bg} ${c.border} px-3 py-1.5`}>
                            <span className="text-[10px] font-bold text-gray-400 uppercase">{col.subject}:</span>
                            <span className={`text-sm font-black ${c.text}`}>{score !== null ? `${score}%` : '—'}</span>
                            <span className={`text-[9px] font-bold ${c.text} opacity-60`}>{c.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
