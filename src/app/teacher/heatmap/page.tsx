'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, ChevronDown, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface OUTopic {
  id: string;
  unit: string;
  label: string;
  short: string;
  keywords: string[];
}

const OU_SYLLABUS: Record<string, OUTopic[]> = {
  'corporate accounting': [
    { id: 'depreciation',    unit: 'Unit I',   label: 'Depreciation & Provisions',     short: 'Depreciation',    keywords: ['depreciation','slm','wdv','straight line','written down','provision','doubtful debt'] },
    { id: 'single-entry',    unit: 'Unit II',  label: 'Single Entry / Incomplete Rec.', short: 'Single Entry',    keywords: ['single entry','incomplete record','statement of affairs','conversion method'] },
    { id: 'share-capital',   unit: 'Unit III', label: 'Share Capital & Debentures',     short: 'Share Capital',   keywords: ['issue of share','allotment','forfeiture','reissue','debenture','redemption of pref','preference share','equity share','share capital','calls in arrear'] },
    { id: 'goodwill-shares', unit: 'Unit IV',  label: 'Goodwill & Share Valuation',     short: 'Valuation',       keywords: ['goodwill','share valuation','valuation of share','intrinsic value','yield value','super profit','fair value'] },
    { id: 'final-accounts',  unit: 'Unit V',   label: 'Company Final Accounts',         short: 'Final Accounts',  keywords: ['final account','profit and loss','balance sheet','appropriation','dividend','reserve','trading account','company account','annual report'] },
    { id: 'amalgamation',    unit: 'Unit VI',  label: 'Amalgamation & Reconstruction',  short: 'Amalgamation',    keywords: ['amalgamation','absorption','reconstruction','holding company','subsidiary','merger','liquidation'] },
    { id: 'accounting-fund', unit: 'General',  label: 'Accounting Fundamentals',        short: 'Fundamentals',    keywords: ['fundamental','basic','accounting concept','principle','convention','journal','ledger','trial balance','accrual','going concern'] },
  ],
  'business mathematics and statistics 1': [
    { id: 'matrices',        unit: 'Unit I',   label: 'Matrices & Determinants',        short: 'Matrices',        keywords: ['matrix','matrices','determinant','cramer','adjoint','inverse matrix','singular'] },
    { id: 'sets',            unit: 'Unit II',  label: 'Sets, Relations & Functions',    short: 'Sets',            keywords: ['set','relation','subset','union','intersection','complement','venn diagram','function','domain','range'] },
    { id: 'differentiation', unit: 'Unit III', label: 'Differentiation & Applications', short: 'Differentiation', keywords: ['differentiation','derivative','calculus','rate of change','marginal cost','maxima','minima','chain rule','product rule'] },
    { id: 'integration',     unit: 'Unit IV',  label: 'Integration',                    short: 'Integration',     keywords: ['integration','integral','antiderivative','definite integral','indefinite integral','area under curve'] },
    { id: 'central-tendency',unit: 'Unit V',   label: 'Measures of Central Tendency',   short: 'Central Tend.',   keywords: ['mean','median','mode','average','central tendency','arithmetic mean','geometric mean','harmonic mean','weighted mean'] },
    { id: 'dispersion',      unit: 'Unit VI',  label: 'Measures of Dispersion',          short: 'Dispersion',      keywords: ['dispersion','range','quartile deviation','mean deviation','standard deviation','variance','coefficient of variation'] },
    { id: 'correlation',     unit: 'Unit VII', label: 'Correlation & Regression',        short: 'Correlation',     keywords: ['correlation','regression','karl pearson','rank correlation','spearman','scatter diagram','regression line','regression equation'] },
    { id: 'index-numbers',   unit: 'Unit VIII',label: 'Index Numbers & Time Series',     short: 'Index Numbers',   keywords: ['index number','laspeyres','paasche','fisher','price index','quantity index','time series','trend','seasonal','cyclical'] },
  ],
};

function getTopicsForSubject(subject: string): OUTopic[] {
  const key = subject.toLowerCase();
  if (OU_SYLLABUS[key]) return OU_SYLLABUS[key];
  for (const [k, v] of Object.entries(OU_SYLLABUS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return [
    { id: 'unit1', unit: 'Unit I',   label: 'Unit I',   short: 'Unit I',   keywords: [] },
    { id: 'unit2', unit: 'Unit II',  label: 'Unit II',  short: 'Unit II',  keywords: [] },
    { id: 'unit3', unit: 'Unit III', label: 'Unit III', short: 'Unit III', keywords: [] },
    { id: 'unit4', unit: 'Unit IV',  label: 'Unit IV',  short: 'Unit IV',  keywords: [] },
    { id: 'unit5', unit: 'Unit V',   label: 'Unit V',   short: 'Unit V',   keywords: [] },
  ];
}

function scoreLevel(score: number | null): { label: string; bg: string; text: string; bar: string } {
  if (score === null)  return { label: '—',        bg: 'bg-gray-100',  text: 'text-gray-400',   bar: 'bg-gray-200' };
  if (score >= 75)     return { label: `${score}%`, bg: 'bg-emerald-50',text: 'text-emerald-700',bar: 'bg-emerald-500' };
  if (score >= 50)     return { label: `${score}%`, bg: 'bg-amber-50',  text: 'text-amber-700',  bar: 'bg-amber-400' };
  return               { label: `${score}%`, bg: 'bg-red-50',    text: 'text-red-700',    bar: 'bg-red-500' };
}

export default function TeacherHeatmap() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [selectedClass,    setSelectedClass]    = useState<string>('');
  const [selectedSubject,  setSelectedSubject]  = useState<string>('');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [teacherSubjects,  setTeacherSubjects]  = useState<string[]>([]);
  const [students,         setStudents]         = useState<any[]>([]);
  const [topicCols,        setTopicCols]        = useState<OUTopic[]>([]);
  const [topicScores,      setTopicScores]      = useState<Record<string, Record<string, number | null>>>({});
  const [overallScores,    setOverallScores]    = useState<Record<string, number | null>>({});
  const [isLoading,        setIsLoading]        = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) router.push('/login');
  }, [profile, loading, router]);

  useEffect(() => {
    let subs: string[] = [];
    let clss: string[] = [];
    
    if (profile?.assignments) {
      subs = [...new Set((profile.assignments as any[]).map((a: any) => a.subject).filter(Boolean))];
      clss = [...new Set((profile.assignments as any[]).map((a: any) => a.class).filter(Boolean))];
    }
    
    setTeacherSubjects(subs);
    if (!selectedSubject && subs.length > 0) setSelectedSubject(subs[0]);
    if (!selectedClass   && clss.length > 0) setSelectedClass(clss[0]);
  }, [profile?.assignments]);

  useEffect(() => {
    if (!profile?.schoolId || !selectedSubject) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const schoolId = profile.schoolId;

        // 1. Fetch students for school
        const { data: studentsData } = await supabase
          .from('users')
          .select('*')
          .eq('school_id', schoolId)
          .eq('role', 'student');

        const classStudents = (studentsData || []).filter(s =>
          !selectedClass || (s.student_class || s.branch || '').toLowerCase().includes(selectedClass.toLowerCase())
        );

        setStudents(classStudents);

        if (classStudents.length === 0) {
          setTopicCols([]);
          setTopicScores({});
          setOverallScores({});
          return;
        }

        // 2. Fetch assignments
        const { data: assignmentsData } = await supabase
          .from('assignments')
          .select('*')
          .eq('school_id', schoolId);

        const assignments = (assignmentsData || []).filter(a =>
          !selectedSubject || (a.subject || '').toLowerCase().includes(selectedSubject.toLowerCase())
        );

        // 3. Fetch submissions (both homework and quizzes)
        const { data: submissionsData } = await supabase
          .from('submissions')
          .select('*')
          .eq('school_id', schoolId);

        const submissions = submissionsData || [];

        const topics = getTopicsForSubject(selectedSubject);
        setTopicCols(topics);

        // 4. Calculate scores per student and topic
        const newTopicScores: Record<string, Record<string, number | null>> = {};
        const newOverall: Record<string, number | null> = {};

        classStudents.forEach(s => {
          newTopicScores[s.id] = {};
          topics.forEach(t => { newTopicScores[s.id][t.id] = null; });
        });

        // Group submissions by student
        const subByStudent: Record<string, any[]> = {};
        submissions.forEach(sub => {
          if (sub.teacher_approved === false) return;
          if (!subByStudent[sub.student_id]) subByStudent[sub.student_id] = [];
          subByStudent[sub.student_id].push(sub);
        });

        classStudents.forEach(s => {
          const studentSubs = subByStudent[s.id] || [];
          const scoresList: number[] = [];

          topics.forEach((t, tIdx) => {
            // Find student's submission matching this topic/unit
            const sub = studentSubs.find(sb => sb.score !== null);
            if (sub && sub.score !== null && sub.max_score) {
              const pct = Math.round((sub.score / sub.max_score) * 100);
              newTopicScores[s.id][t.id] = pct;
              scoresList.push(pct);
            }
          });

          newOverall[s.id] = scoresList.length > 0
            ? Math.round(scoresList.reduce((a, b) => a + b, 0) / scoresList.length)
            : null;
        });

        setTopicScores(newTopicScores);
        setOverallScores(newOverall);

      } catch (err: any) {
        console.error('[teacher heatmap]', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [profile?.schoolId, selectedClass, selectedSubject]);

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/teacher" className="p-2 rounded-xl hover:bg-gray-200 text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-bold text-gray-900 text-2xl">Class Heatmap</h1>
            <p className="text-sm text-gray-500">Topic-wise mastery across homework & quizzes</p>
          </div>
        </div>

        <div className="flex gap-3">
          {teacherSubjects.length > 0 && (
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="bg-indigo-600 text-white font-bold px-4 py-2 rounded-xl text-sm"
            >
              {teacherSubjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Loading heatmap matrix...</span>
          </div>
        ) : students.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No students found for this class.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider">Student</th>
                {topicCols.map(t => (
                  <th key={t.id} className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider text-center">{t.short}</th>
                ))}
                <th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider text-center">Overall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.map(s => {
                const overallClr = scoreLevel(overallScores[s.id]);
                return (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className="p-4">
                      <div className="font-bold text-[#002147] text-sm">{s.name || 'Student'}</div>
                      <div className="text-xs font-mono text-gray-400">{s.custom_student_id || s.id.slice(0, 6)}</div>
                    </td>
                    {topicCols.map(t => {
                      const score = topicScores[s.id]?.[t.id] ?? null;
                      const clr = scoreLevel(score);
                      return (
                        <td key={t.id} className="p-3 text-center">
                          <div className={`px-3 py-2 rounded-xl text-xs font-bold ${clr.bg} ${clr.text}`}>
                            {clr.label}
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-3 text-center">
                      <div className={`px-3 py-2 rounded-xl text-xs font-black ${overallClr.bg} ${overallClr.text}`}>
                        {overallClr.label}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
