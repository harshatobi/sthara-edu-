'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { Award, BookOpen, Search, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';

interface StudentSubmission {
  id: string;
  studentName: string;
  className: string;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
}

export default function AcademicResults() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!profile?.schoolId) return;

    const fetchResults = async () => {
      setLoading(true);
      try {
        const { data: subsData } = await supabase
          .from('submissions')
          .select('*')
          .eq('school_id', profile.schoolId);

        const loaded: StudentSubmission[] = (subsData || []).map((sub: any) => {
          const sc = sub.score || 0;
          const mx = sub.max_score || 10;
          return {
            id: sub.id,
            studentName: sub.student_name || 'Student',
            className: sub.student_class || 'General',
            marksObtained: sc,
            maxMarks: mx,
            percentage: Math.round((sc / mx) * 100),
          };
        });

        setSubmissions(loaded);
      } catch (err: any) {
        console.error('[academic-results] error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [profile?.schoolId]);

  if (!profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Academic Results...</div>;

  const filtered = submissions.filter(s =>
    s.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.className.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-[#002147]">Institutional Exam & Task Results</h1>
          <p className="text-gray-500 text-sm mt-1">Cross-class academic performance report & merit rank listings</p>
        </div>

        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search student or class..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-xl font-bold text-[#002147]">Evaluated Submissions ({filtered.length})</h2>

        {loading ? (
          <div className="py-12 text-center text-gray-400">Calculating grade tallies...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No results found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Student</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Class</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase text-center">Score</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase text-center">Percentage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className="p-4 font-bold text-sm text-[#002147]">{s.studentName}</td>
                    <td className="p-4 text-xs text-gray-500">{s.className}</td>
                    <td className="p-4 text-xs text-center font-mono font-bold">{s.marksObtained}/{s.maxMarks}</td>
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1 rounded-xl text-xs font-bold ${
                        s.percentage >= 75 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {s.percentage}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
