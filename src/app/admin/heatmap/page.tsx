'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, Users, BookOpen, BarChart2, ChevronRight, X, Loader2, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Link from 'next/link';

// ── Colour helpers ─────────────────────────────────────────────────
function getScoreColor(score: number | null) {
  if (score === null) return { bg: 'bg-gray-50', text: 'text-gray-400', bar: 'bg-gray-200', border: 'border-gray-100', label: 'No Data' };
  if (score >= 85) return { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', border: 'border-emerald-200', label: 'Excellent' };
  if (score >= 70) return { bg: 'bg-teal-50', text: 'text-teal-700', bar: 'bg-teal-400', border: 'border-teal-200', label: 'Good' };
  if (score >= 55) return { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-400', border: 'border-amber-200', label: 'Average' };
  return { bg: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-500', border: 'border-rose-200', label: 'At Risk' };
}

interface ClassSummary {
  className: string;
  studentCount: number;
  subjectScores: Record<string, number | null>; // subject -> avg%
  overallAvg: number | null;
}

interface StudentDetail {
  id: string;
  name: string;
  subjectScores: Record<string, number | null>;
  overallAvg: number | null;
}

export default function AdminHeatmap() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [classSummaries, setClassSummaries] = useState<ClassSummary[]>([]);
  const [allSubjects, setAllSubjects] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Drill-down state
  const [drillClass, setDrillClass] = useState<string | null>(null);
  const [drillStudents, setDrillStudents] = useState<StudentDetail[]>([]);
  const [drillSubjects, setDrillSubjects] = useState<string[]>([]);
  const [isDrillLoading, setIsDrillLoading] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin'))) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  // ── Fetch class-level heatmap ──────────────────────────────────────
  useEffect(() => {
    if (!profile?.schoolId) return;
    const fetchHeatmap = async () => {
      setIsLoading(true);
      try {
        const schoolId = profile.schoolId;

        // 1. Get all students
        const [usersSnap, globalSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId), where('role', '==', 'student'))),
          getDocs(query(collection(db, 'global_users'), where('schoolId', '==', schoolId), where('role', '==', 'student'))),
        ]);
        const seen = new Set<string>();
        const allStudents: any[] = [];
        [...usersSnap.docs, ...globalSnap.docs].forEach(d => {
          if (!seen.has(d.id)) { seen.add(d.id); allStudents.push({ id: d.id, ...d.data() }); }
        });

        // 2. Group students by class
        const classMap: Record<string, any[]> = {};
        allStudents.forEach(s => {
          const cls = s.studentClass || 'Unassigned';
          if (!classMap[cls]) classMap[cls] = [];
          classMap[cls].push(s);
        });

        // 3. Get all assignments
        const assignSnap = await getDocs(collection(db, 'schools', schoolId, 'assignments'));
        const assignments = assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

        // 4. Get all submissions
        const subjectSet = new Set<string>();
        const allSubs: Record<string, Record<string, { score: number; max: number }[]>> = {};
        // allSubs[studentId][subject] = [{score, max}, ...]

        await Promise.all(assignments.map(async (a) => {
          if (a.subject) subjectSet.add(a.subject);
          const subsSnap = await getDocs(collection(db, 'schools', schoolId, 'assignments', a.id, 'submissions'));
          subsSnap.forEach(s => {
            const d = s.data();
            if (d.score === undefined || !d.maxScore) return;
            const sid = s.id;
            const subj = a.subject || 'General';
            if (!allSubs[sid]) allSubs[sid] = {};
            if (!allSubs[sid][subj]) allSubs[sid][subj] = [];
            allSubs[sid][subj].push({ score: d.score, max: d.maxScore });
          });
        }));

        const subjects = Array.from(subjectSet).sort();
        setAllSubjects(subjects);

        // 5. Build class summaries
        const summaries: ClassSummary[] = Object.entries(classMap).map(([cls, students]) => {
          const subjectScores: Record<string, number | null> = {};
          subjects.forEach(subj => {
            let totalScore = 0, totalMax = 0;
            students.forEach(s => {
              (allSubs[s.id]?.[subj] || []).forEach(({ score, max }) => {
                totalScore += score; totalMax += max;
              });
            });
            subjectScores[subj] = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null;
          });

          const vals = Object.values(subjectScores).filter(v => v !== null) as number[];
          const overallAvg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;

          return { className: cls, studentCount: students.length, subjectScores, overallAvg };
        });

        summaries.sort((a, b) => a.className.localeCompare(b.className));
        setClassSummaries(summaries);
      } catch (e) {
        console.error('Admin heatmap error:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHeatmap();
  }, [profile?.schoolId]);

  // ── Drill into a class ─────────────────────────────────────────────
  const handleDrillClass = async (className: string) => {
    setDrillClass(className);
    setIsDrillLoading(true);
    setDrillStudents([]);
    setDrillSubjects([]);
    try {
      const schoolId = profile!.schoolId;

      // Get students in this class
      const [u1, u2] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId), where('role', '==', 'student'), where('studentClass', '==', className))),
        getDocs(query(collection(db, 'global_users'), where('schoolId', '==', schoolId), where('role', '==', 'student'), where('studentClass', '==', className))),
      ]);
      const seen = new Set<string>();
      const students: any[] = [];
      [...u1.docs, ...u2.docs].forEach(d => {
        if (!seen.has(d.id)) { seen.add(d.id); students.push({ id: d.id, ...d.data() }); }
      });

      // Get assignments for this class
      const assignSnap = await getDocs(query(
        collection(db, 'schools', schoolId, 'assignments'),
        where('class', '==', className)
      ));
      const assignments = assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const subjSet = new Set<string>();
      assignments.forEach(a => { if (a.subject) subjSet.add(a.subject); });
      const subjects = Array.from(subjSet).sort();
      setDrillSubjects(subjects);

      // Get all submissions
      const studentSubs: Record<string, Record<string, { score: number; max: number }[]>> = {};
      await Promise.all(assignments.map(async (a) => {
        const subsSnap = await getDocs(collection(db, 'schools', schoolId, 'assignments', a.id, 'submissions'));
        subsSnap.forEach(s => {
          const d = s.data();
          if (d.score === undefined || !d.maxScore) return;
          if (!studentSubs[s.id]) studentSubs[s.id] = {};
          const subj = a.subject || 'General';
          if (!studentSubs[s.id][subj]) studentSubs[s.id][subj] = [];
          studentSubs[s.id][subj].push({ score: d.score, max: d.maxScore });
        });
      }));

      // Build student details
      const details: StudentDetail[] = students.map(student => {
        const subjectScores: Record<string, number | null> = {};
        subjects.forEach(subj => {
          const entries = studentSubs[student.id]?.[subj] || [];
          if (entries.length === 0) { subjectScores[subj] = null; return; }
          const tot = entries.reduce((s, e) => s + e.score, 0);
          const mx = entries.reduce((s, e) => s + e.max, 0);
          subjectScores[subj] = mx > 0 ? Math.round((tot / mx) * 100) : null;
        });
        const vals = Object.values(subjectScores).filter(v => v !== null) as number[];
        return {
          id: student.id,
          name: student.name || 'Unknown',
          subjectScores,
          overallAvg: vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
        };
      });
      details.sort((a, b) => (b.overallAvg ?? -1) - (a.overallAvg ?? -1));
      setDrillStudents(details);
    } catch (e) {
      console.error('Drill error:', e);
    } finally {
      setIsDrillLoading(false);
    }
  };

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 pb-16 font-sans">

      {/* Header */}
      <div className="bg-white border-b border-gray-200/60 shadow-sm sticky top-0 z-40 backdrop-blur-xl bg-white/90">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <Link href="/admin" className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors border border-gray-200/60">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </Link>
            <div>
              <div className="flex items-center space-x-2 text-blue-600 text-xs font-bold uppercase tracking-wider mb-0.5">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Admin Analytics</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#002147]">School Heatmap</h1>
            </div>
          </div>
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 text-xs font-semibold px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"/>≥85%</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-teal-400"/>≥70%</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400"/>≥55%</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"/>At Risk</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-8">

        {/* ── CLASS × SUBJECT OVERVIEW ─────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100">
              <BarChart2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#002147]">Class Performance Overview</h2>
              <p className="text-xs text-gray-400 font-medium">Average scores per class & subject — click a class to drill down</p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse flex items-center gap-4">
                  <div className="w-24 h-4 bg-gray-100 rounded-full" />
                  <div className="flex gap-3 flex-1">{[1,2,3].map(j => <div key={j} className="flex-1 h-14 bg-gray-50 rounded-xl" />)}</div>
                </div>
              ))}
            </div>
          ) : classSummaries.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-20 flex flex-col items-center text-center shadow-sm">
              <AlertTriangle className="w-10 h-10 text-gray-300 mb-4" />
              <h3 className="text-lg font-bold text-[#002147] mb-1">No Data Yet</h3>
              <p className="text-gray-400 text-sm">Students need to submit graded assignments to generate heatmap data.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Column headers */}
              <div className="hidden sm:flex items-center gap-3 px-5 pb-1">
                <div className="w-36 shrink-0" />
                {allSubjects.map(s => (
                  <div key={s} className="flex-1 text-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center justify-center gap-1">
                      <BookOpen className="w-3 h-3" />{s}
                    </span>
                  </div>
                ))}
                <div className="w-24 shrink-0 text-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Overall</span>
                </div>
                <div className="w-10 shrink-0" />
              </div>

              {classSummaries.map(cls => {
                const oc = getScoreColor(cls.overallAvg);
                return (
                  <button
                    key={cls.className}
                    onClick={() => handleDrillClass(cls.className)}
                    className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-blue-200 transition-all duration-200 p-4 sm:p-5 text-left group"
                  >
                    {/* Mobile layout */}
                    <div className="flex items-center justify-between mb-3 sm:hidden">
                      <div>
                        <p className="font-black text-[#002147] text-base">Class {cls.className}</p>
                        <p className="text-xs text-gray-400 font-medium">{cls.studentCount} students</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`rounded-xl border ${oc.bg} ${oc.border} px-3 py-1.5 text-center min-w-[56px]`}>
                          <div className={`text-base font-black ${oc.text}`}>{cls.overallAvg !== null ? `${cls.overallAvg}%` : '—'}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors" />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:hidden">
                      {allSubjects.map(s => {
                        const score = cls.subjectScores[s];
                        const c = getScoreColor(score);
                        return (
                          <div key={s} className={`flex items-center gap-1 rounded-xl border ${c.bg} ${c.border} px-2 py-1`}>
                            <span className="text-[9px] font-bold text-gray-400">{s}:</span>
                            <span className={`text-xs font-black ${c.text}`}>{score !== null ? `${score}%` : '—'}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:flex items-center gap-3">
                      <div className="w-36 shrink-0">
                        <p className="font-black text-[#002147] text-sm">Class {cls.className}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Users className="w-3 h-3 text-gray-400" />
                          <p className="text-xs text-gray-400 font-medium">{cls.studentCount} students</p>
                        </div>
                      </div>
                      {allSubjects.map(s => {
                        const score = cls.subjectScores[s];
                        const c = getScoreColor(score);
                        return (
                          <div key={s} className={`flex-1 rounded-xl border ${c.bg} ${c.border} p-2.5 text-center`}>
                            <div className={`text-sm font-black ${c.text}`}>{score !== null ? `${score}%` : '—'}</div>
                            <div className="mt-1 w-full h-1 bg-white/70 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${c.bar}`} style={{ width: score !== null ? `${score}%` : '0%' }} />
                            </div>
                            <div className={`text-[9px] font-bold mt-0.5 uppercase ${c.text} opacity-60`}>{c.label}</div>
                          </div>
                        );
                      })}
                      <div className={`w-24 shrink-0 rounded-xl border ${oc.bg} ${oc.border} p-2.5 text-center`}>
                        <div className={`text-base font-black ${oc.text}`}>{cls.overallAvg !== null ? `${cls.overallAvg}%` : '—'}</div>
                        <div className="mt-1 w-full h-1 bg-white/70 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${oc.bar}`} style={{ width: cls.overallAvg !== null ? `${cls.overallAvg}%` : '0%' }} />
                        </div>
                      </div>
                      <div className="w-10 shrink-0 flex items-center justify-center">
                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── DRILL-DOWN MODAL (Student × Subject for one class) ──── */}
      {drillClass && (
        <div className="fixed inset-0 z-50 bg-[#002147]/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-4xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">

            {/* Modal header */}
            <div className="bg-gradient-to-br from-[#002147] to-[#003b80] text-white p-6 rounded-t-3xl sm:rounded-t-3xl shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-blue-200 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />Student Breakdown
                  </div>
                  <h2 className="text-xl sm:text-2xl font-extrabold">Class {drillClass}</h2>
                  <p className="text-blue-100/70 text-sm mt-0.5">Student × Subject performance heatmap</p>
                </div>
                <button onClick={() => setDrillClass(null)} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Subject headers inside modal */}
              {!isDrillLoading && drillSubjects.length > 0 && (
                <div className="flex items-center gap-2 mt-5 overflow-x-auto pb-1">
                  <div className="w-40 shrink-0 text-blue-200/60 text-xs font-bold uppercase">Student</div>
                  {drillSubjects.map(s => (
                    <div key={s} className="flex-1 min-w-[70px] text-center text-blue-100/80 text-[10px] font-bold uppercase tracking-wider">{s}</div>
                  ))}
                  <div className="w-20 shrink-0 text-center text-blue-100/80 text-[10px] font-bold uppercase tracking-wider">Overall</div>
                </div>
              )}
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-2 bg-gray-50/50">
              {isDrillLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <p className="text-gray-400 text-sm font-medium">Loading student data...</p>
                </div>
              ) : drillStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                  <AlertTriangle className="w-10 h-10 text-gray-200" />
                  <p className="text-gray-500 font-semibold">No graded submissions yet</p>
                  <p className="text-gray-400 text-sm">Students in this class haven't submitted graded work yet.</p>
                </div>
              ) : (
                drillStudents.map(student => {
                  const oc = getScoreColor(student.overallAvg);
                  const isAtRisk = student.overallAvg !== null && student.overallAvg < 55;
                  return (
                    <div key={student.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                      {/* Mobile: stack */}
                      <div className="flex items-center gap-3 mb-2 sm:hidden">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[#002147] text-sm truncate">{student.name}</p>
                          {isAtRisk && <span className="text-[9px] text-rose-600 font-bold uppercase">⚠ At Risk</span>}
                        </div>
                        <div className={`rounded-xl border ${oc.bg} ${oc.border} px-2 py-1 min-w-[50px] text-center`}>
                          <div className={`text-sm font-black ${oc.text}`}>{student.overallAvg !== null ? `${student.overallAvg}%` : '—'}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:hidden">
                        {drillSubjects.map(s => {
                          const score = student.subjectScores[s];
                          const c = getScoreColor(score);
                          return (
                            <div key={s} className={`flex items-center gap-1 rounded-xl border ${c.bg} ${c.border} px-2 py-1`}>
                              <span className="text-[9px] font-bold text-gray-400">{s}:</span>
                              <span className={`text-xs font-black ${c.text}`}>{score !== null ? `${score}%` : '—'}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop: row */}
                      <div className="hidden sm:flex items-center gap-2">
                        <div className="w-40 shrink-0 flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                            {student.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-[#002147] text-sm truncate">{student.name}</p>
                            {isAtRisk && <span className="text-[9px] text-rose-600 font-bold uppercase">⚠ Risk</span>}
                          </div>
                        </div>
                        {drillSubjects.map(s => {
                          const score = student.subjectScores[s];
                          const c = getScoreColor(score);
                          return (
                            <div key={s} className={`flex-1 min-w-[70px] rounded-xl border ${c.bg} ${c.border} p-2 text-center`}>
                              <div className={`text-sm font-black ${c.text}`}>{score !== null ? `${score}%` : '—'}</div>
                              <div className="mt-1 w-full h-1 bg-white/70 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${c.bar}`} style={{ width: score !== null ? `${score}%` : '0%' }} />
                              </div>
                              <div className={`text-[8px] font-bold mt-0.5 uppercase ${c.text} opacity-60`}>{c.label}</div>
                            </div>
                          );
                        })}
                        <div className={`w-20 shrink-0 rounded-xl border ${oc.bg} ${oc.border} p-2 text-center`}>
                          <div className={`text-base font-black ${oc.text}`}>{student.overallAvg !== null ? `${student.overallAvg}%` : '—'}</div>
                          <div className="mt-1 w-full h-1 bg-white/70 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${oc.bar}`} style={{ width: student.overallAvg !== null ? `${student.overallAvg}%` : '0%' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
