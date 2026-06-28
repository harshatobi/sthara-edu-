'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, AlertTriangle, ChevronDown, BookOpen, BarChart2 } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Link from 'next/link';

export default function TeacherHeatmap() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  // subjectColumns: one entry per subject the teacher teaches
  // each entry has the subject name + per-student average scores
  const [students, setStudents] = useState<any[]>([]);
  const [subjectColumns, setSubjectColumns] = useState<{ subject: string; scores: Record<string, number | null> }[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);


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
        // ── 1. Fetch students from both collections ──────────────────────────
        const [usersSnap, globalUsersSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId), where('role', '==', 'student'))),
          getDocs(query(collection(db, 'global_users'), where('schoolId', '==', schoolId), where('role', '==', 'student'))),
        ]);
        const seenIds = new Set<string>();
        const allStudents: any[] = [];
        [...usersSnap.docs, ...globalUsersSnap.docs].forEach(s => {
          if (!seenIds.has(s.id)) { seenIds.add(s.id); allStudents.push({ id: s.id, ...s.data() }); }
        });

        // ── 2. Discover classes from student data ──────────────────────────
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

        // ── 3. Filter students to active class & teacher's assignment ──────
        const uniqueClasses = uniqueTeacherClasses.map(c => c.toLowerCase());
        let classStudents = activeClass
          ? allStudents.filter(s => s.studentClass && s.studentClass.toLowerCase() === activeClass.toLowerCase())
          : allStudents;
        if (uniqueClasses.length > 0) {
          classStudents = classStudents.filter(s => s.studentClass && uniqueClasses.includes(s.studentClass.toLowerCase()));
        }
        setStudents(classStudents);

        // ── 4. Determine teacher's subjects for this class ────────────────
        const teacherSubjects: string[] = [...new Set(
          (profile.assignments ?? [])
            .filter((a: any) => !activeClass || a.class?.toLowerCase() === activeClass.toLowerCase())
            .map((a: any) => a.subject)
            .filter(Boolean)
        )] as string[];

        // ── 5. Fetch all assignments for school, filter by class + subject ─
        const allAssignSnap = await getDocs(collection(db, 'schools', schoolId, 'assignments'));
        const allAssignments: any[] = allAssignSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const relevant = allAssignments.filter(a =>
          (!activeClass || a.class?.toLowerCase() === activeClass.toLowerCase()) &&
          (teacherSubjects.length === 0 || teacherSubjects.includes(a.subject))
        );

        // Group assignments by subject
        const bySubject: Record<string, any[]> = {};
        relevant.forEach(a => {
          const subj = a.subject || 'General';
          if (!bySubject[subj]) bySubject[subj] = [];
          bySubject[subj].push(a);
        });

        // Use teacherSubjects order, or discovered subjects
        const subjectOrder = teacherSubjects.length > 0 ? teacherSubjects : Object.keys(bySubject);
        // Always include teacher subjects even if no assignments yet
        subjectOrder.forEach(s => { if (!bySubject[s]) bySubject[s] = []; });

        // ── 6. Fetch submissions and compute per-student averages ──────────
        const subjectCols: { subject: string; scores: Record<string, number | null> }[] = [];

        for (const subject of subjectOrder) {
          const subjectAssignments = bySubject[subject] || [];
          // studentId -> [scores]
          const studentTotals: Record<string, { sum: number; count: number }> = {};
          classStudents.forEach(s => { studentTotals[s.id] = { sum: 0, count: 0 }; });

          for (const assign of subjectAssignments) {
            const subsSnap = await getDocs(collection(db, 'schools', schoolId, 'assignments', assign.id, 'submissions'));
            subsSnap.forEach(sub => {
              const sid = sub.id;
              if (!studentTotals[sid]) return;
              const data = sub.data();
              let score: number | null = null;
              if (data.score !== undefined && data.maxScore > 0) {
                score = Math.round((data.score / data.maxScore) * 100);
              } else if (typeof data.grade === 'number') {
                score = data.grade;
              }
              if (score !== null) {
                studentTotals[sid].sum += score;
                studentTotals[sid].count += 1;
              }
            });
          }

          const scores: Record<string, number | null> = {};
          classStudents.forEach(s => {
            const t = studentTotals[s.id];
            scores[s.id] = t.count > 0 ? Math.round(t.sum / t.count) : null;
          });
          subjectCols.push({ subject, scores });
        }

        setSubjectColumns(subjectCols);
      } catch (err) {
        console.error('Error fetching heatmap data', err);
      } finally {
        setIsLoadingData(false);
      }
    };
    fetchHeatmapData();
  }, [profile?.schoolId, selectedClass]);



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

          <div className="flex items-center gap-4">
            {/* Legend */}
            <div className="hidden md:flex items-center gap-3 text-xs font-semibold px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"/> Excellent</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400"/> Average</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"/> At Risk</span>
            </div>
            {/* Class selector */}
            {availableClasses.length > 0 && (
              <div className="relative">
                <select
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  className="appearance-none bg-white border border-gray-200 hover:border-gray-300 rounded-xl pl-4 pr-9 py-2.5 text-[#002147] font-bold text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                >
                  {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            )}
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
            {/* ── Column headers ─────────────────────────────────────── */}
            <div className="flex items-center gap-4 px-5 pb-1">
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
            {students.map((student, idx) => {
              const overall = getOverallAvg(student.id);
              const overallColor = getScoreColor(overall);
              const isAtRisk = overall !== null && overall < 55;

              return (
                <div
                  key={student.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 flex items-center gap-4 px-5 py-4"
                >
                  {/* Student name */}
                  <div className="w-48 shrink-0 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 border border-blue-300 flex items-center justify-center text-blue-700 font-bold text-sm shadow-inner">
                      {student.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-[#002147] truncate text-sm">{student.name}</p>
                      {isAtRisk && (
                        <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wide flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse inline-block" />
                          At Risk
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Subject blocks */}
                  {subjectColumns.map(col => {
                    const score = col.scores[student.id];
                    const c = getScoreColor(score);
                    return (
                      <div key={col.subject} className={`flex-1 rounded-xl border ${c.bg} ${c.border} p-3 transition-all duration-200 hover:scale-105 hover:shadow-md`}>
                        <div className={`text-lg font-black text-center ${c.text}`}>
                          {score !== null ? `${score}%` : '—'}
                        </div>
                        <div className="mt-1.5 w-full h-1.5 bg-white/70 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${c.bar} transition-all duration-700`}
                            style={{ width: score !== null ? `${score}%` : '0%' }}
                          />
                        </div>
                        <div className={`text-[10px] font-bold text-center mt-1 uppercase tracking-wide ${c.text} opacity-70`}>
                          {c.label}
                        </div>
                      </div>
                    );
                  })}

                  {subjectColumns.length === 0 && (
                    <div className="flex-1 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-center">
                      <p className="text-xs text-gray-400">No subjects configured</p>
                    </div>
                  )}

                  {/* Overall score */}
                  <Link href={`/teacher/mastery?studentId=${student.id}`} className="w-28 shrink-0">
                    <div className={`rounded-xl border ${overallColor.bg} ${overallColor.border} p-3 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden`}>
                      <div className={`text-xl font-black text-center ${overallColor.text}`}>
                        {overall !== null ? `${overall}%` : '—'}
                      </div>
                      <div className="mt-1.5 w-full h-1.5 bg-white/70 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${overallColor.bar} transition-all duration-700`}
                          style={{ width: overall !== null ? `${overall}%` : '0%' }}
                        />
                      </div>
                      <div className="absolute inset-0 bg-blue-600/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wide bg-white/90 px-2 py-0.5 rounded shadow-sm">View</span>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
