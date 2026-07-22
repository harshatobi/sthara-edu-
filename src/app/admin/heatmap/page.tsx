'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, Users, BookOpen, ChevronRight, X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

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
  subjectScores: Record<string, number | null>;
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
  const supabase = createClient();

  const [classSummaries, setClassSummaries] = useState<ClassSummary[]>([]);
  const [allSubjects, setAllSubjects] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Drill-down state
  const [drillClass, setDrillClass] = useState<string | null>(null);
  const [drillStudents, setDrillStudents] = useState<StudentDetail[]>([]);
  const [drillSubjects, setDrillSubjects] = useState<string[]>([]);

  useEffect(() => {
    if (!loading && (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin'))) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId) return;

    const fetchHeatmap = async () => {
      setIsLoading(true);
      try {
        const schoolId = profile.schoolId;

        // 1. Get all students
        const { data: studentsData } = await supabase
          .from('users')
          .select('*')
          .eq('school_id', schoolId)
          .eq('role', 'student');

        const allStudents = studentsData || [];

        // 2. Group students by class
        const classMap: Record<string, any[]> = {};
        allStudents.forEach(s => {
          const cls = s.student_class || s.branch || 'Unassigned';
          if (!classMap[cls]) classMap[cls] = [];
          classMap[cls].push(s);
        });

        // 3. Get all assignments
        const { data: assignmentsData } = await supabase
          .from('assignments')
          .select('*')
          .eq('school_id', schoolId);

        const assignments = assignmentsData || [];
        const assignMap = new Map(assignments.map(a => [a.id, a]));

        // 4. Get all submissions (both homework and quizzes)
        const { data: submissionsData } = await supabase
          .from('submissions')
          .select('*')
          .eq('school_id', schoolId);

        const submissions = submissionsData || [];

        const subjectSet = new Set<string>();
        const allSubs: Record<string, Record<string, { score: number; max: number }[]>> = {};

        assignments.forEach(a => {
          if (a.subject) subjectSet.add(a.subject);
        });

        submissions.forEach(sub => {
          if (sub.teacher_approved === false) return; // skip rejected

          const assign = assignMap.get(sub.assignment_id);
          const subj = assign?.subject || 'General';
          subjectSet.add(subj);

          let sc = sub.score ?? sub.ai_result?.totalScore;
          let mx = sub.max_score ?? sub.ai_result?.maxTotalScore ?? 10;

          if (sub.final_grade && typeof sub.final_grade === 'string' && sub.final_grade.includes('/')) {
            const [fs, fm] = sub.final_grade.split('/');
            sc = parseFloat(fs);
            mx = parseFloat(fm);
          }

          if (sc !== null && sc !== undefined && mx > 0) {
            const sid = sub.student_id;
            if (!allSubs[sid]) allSubs[sid] = {};
            if (!allSubs[sid][subj]) allSubs[sid][subj] = [];
            allSubs[sid][subj].push({ score: sc, max: mx });
          }
        });

        const subjectsList = Array.from(subjectSet).sort();
        setAllSubjects(subjectsList);

        // 5. Compute class averages
        const summaries: ClassSummary[] = Object.entries(classMap).map(([cls, stds]) => {
          const subjectScores: Record<string, number | null> = {};
          const overallList: number[] = [];

          subjectsList.forEach(subj => {
            let classSubjScoreSum = 0;
            let classSubjMaxSum = 0;

            stds.forEach(s => {
              const studentScores = allSubs[s.id]?.[subj] || [];
              studentScores.forEach(item => {
                classSubjScoreSum += item.score;
                classSubjMaxSum += item.max;
              });
            });

            if (classSubjMaxSum > 0) {
              const avg = Math.round((classSubjScoreSum / classSubjMaxSum) * 100);
              subjectScores[subj] = avg;
              overallList.push(avg);
            } else {
              subjectScores[subj] = null;
            }
          });

          const overallAvg = overallList.length > 0
            ? Math.round(overallList.reduce((a, b) => a + b, 0) / overallList.length)
            : null;

          return {
            className: cls,
            studentCount: stds.length,
            subjectScores,
            overallAvg,
          };
        });

        setClassSummaries(summaries);
      } catch (err) {
        console.error('Error fetching admin heatmap:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHeatmap();
  }, [profile?.schoolId]);

  const openDrillDown = (summary: ClassSummary) => {
    setDrillClass(summary.className);
    setDrillSubjects(allSubjects);

    // Compute student level detail
    const details: StudentDetail[] = [];
    // We can show student details using stored data
    setClassSummaries(prev => prev);
  };

  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading Heatmap Analytics...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-[#002147]">Institutional Heatmap</h1>
            <p className="text-gray-500 text-sm mt-1">Cross-class mastery matrix across both homework & quizzes</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
            <span>Calculating institutional performance matrix...</span>
          </div>
        ) : classSummaries.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No class data found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider">Class</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider">Students</th>
                  {allSubjects.map(subj => (
                    <th key={subj} className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider text-center">{subj}</th>
                  ))}
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider text-center">Overall</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {classSummaries.map(summary => {
                  const overallClr = getScoreColor(summary.overallAvg);
                  return (
                    <tr key={summary.className} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-4 font-bold text-[#002147] text-sm">{summary.className}</td>
                      <td className="p-4 text-xs font-semibold text-gray-500">{summary.studentCount} students</td>
                      {allSubjects.map(subj => {
                        const score = summary.subjectScores[subj];
                        const clr = getScoreColor(score);
                        return (
                          <td key={subj} className="p-3 text-center">
                            <div className={`px-3 py-2 rounded-xl text-xs font-bold border ${clr.bg} ${clr.text} ${clr.border}`}>
                              {score !== null ? `${score}%` : '—'}
                            </div>
                          </td>
                        );
                      })}
                      <td className="p-3 text-center">
                        <div className={`px-3 py-2 rounded-xl text-xs font-black border ${overallClr.bg} ${overallClr.text} ${overallClr.border}`}>
                          {summary.overallAvg !== null ? `${summary.overallAvg}%` : '—'}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
