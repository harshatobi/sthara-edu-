'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import Link from 'next/link';
import type { ClassSummary, Heatmap } from '@/lib/admin/heatmap';
import { Pager, usePaged } from '@/components/canon/Pager';


function getScoreColor(score: number | null) {
  if (score === null) return { bg: 'bg-gray-50', text: 'text-gray-400', bar: 'bg-gray-200', border: 'border-gray-100', label: 'No Data' };
  if (score >= 85) return { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', border: 'border-emerald-200', label: 'Excellent' };
  if (score >= 70) return { bg: 'bg-teal-50', text: 'text-teal-700', bar: 'bg-teal-400', border: 'border-teal-200', label: 'Good' };
  if (score >= 55) return { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-400', border: 'border-amber-200', label: 'Average' };
  return { bg: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-500', border: 'border-rose-200', label: 'At Risk' };
}

export default function AdminHeatmap() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [classSummaries, setClassSummaries] = useState<ClassSummary[]>([]);
  const [allSubjects, setAllSubjects] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [needle, setNeedle] = useState('');
  const filtered = useMemo(() => {
    const q = needle.trim().toLowerCase();
    return q ? classSummaries.filter(c => c.className.toLowerCase().includes(q)) : classSummaries;
  }, [classSummaries, needle]);
  const { shown, pager } = usePaged(filtered, needle);

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
        const token = await getAuthToken();
        const res = await fetch('/api/admin/heatmap-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ schoolId: profile.schoolId }),
        });
        if (!res.ok) throw new Error('Failed to fetch heatmap data');
        const heat: Heatmap = await res.json();
        setAllSubjects(heat.subjects);
        setClassSummaries(heat.classes);
      } catch (err) {
        console.error('Error fetching admin heatmap:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHeatmap();
  }, [profile?.schoolId]);

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
          <>
          <input type="search" value={needle} onChange={e => setNeedle(e.target.value)} placeholder="Filter classes"
            aria-label="Filter classes" className="mb-4 w-full max-w-xs rounded-xl border border-gray-200 px-3 py-2 text-sm" />
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
                {shown.map(summary => {
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
          <Pager {...pager} noun="classes" />
          </>
        )}
      </div>
    </div>
  );
}
