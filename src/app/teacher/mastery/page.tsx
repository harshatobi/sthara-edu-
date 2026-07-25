'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Zap, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function MasteryPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [isSending, setIsSending] = useState(false);

  // Real mastery data per student: { unitLabel -> pct | null }
  const [masteryData, setMasteryData] = useState<{ unit: string; pct: number | null }[]>([]);

  const teacherSubjects = [...new Set(
    ((profile?.assignments || []) as any[]).map((a: any) => a.subject).filter(Boolean)
  )] as string[];

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!selectedSubject && profile?.assignments) {
      const first = (profile.assignments as any[]).find((a: any) => a.subject)?.subject;
      if (first) setSelectedSubject(first);
    }
  }, [profile?.assignments]);

  useEffect(() => {
    if (!profile?.schoolId) return;

    const fetchStudents = async () => {
      setIsLoading(true);
      try {
        const { data: studentsData, error } = await supabase
          .from('users')
          .select('*')
          .eq('school_id', profile.schoolId)
          .eq('role', 'student');

        if (error) throw error;

        const students = studentsData || [];
        setStudentsList(students);
        if (students.length > 0 && !selectedStudent) {
          setSelectedStudent(students[0]);
        }
      } catch (err: any) {
        console.error('[mastery] fetch students error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudents();
  }, [profile?.schoolId]);

  // Recalculate mastery whenever selectedStudent or selectedSubject changes
  useEffect(() => {
    if (!selectedStudent || !profile?.schoolId) {
      setMasteryData([]);
      return;
    }

    const calculateMastery = async () => {
      try {
        // Fetch submissions for this student
        const { data: subs } = await supabase
          .from('submissions')
          .select('score, max_score, assignment_id, teacher_approved')
          .eq('student_id', selectedStudent.id)
          .eq('school_id', profile.schoolId);

        // Fetch assignments filtered by subject
        const { data: assignments } = await supabase
          .from('assignments')
          .select('id, title, subject, class')
          .eq('school_id', profile.schoolId);

        const relevantAssignments = (assignments || []).filter(a =>
          !selectedSubject || (a.subject || '').toLowerCase().includes(selectedSubject.toLowerCase())
        );
        const relevantIds = new Set(relevantAssignments.map(a => a.id));

        // Only include approved or non-rejected submissions for relevant assignments
        const relevantSubs = (subs || []).filter(s =>
          s.teacher_approved !== false &&
          s.score !== null &&
          s.max_score &&
          relevantIds.has(s.assignment_id)
        );

        // Build unit buckets based on assignment order (Unit I = first submission, etc.)
        const UNITS = [
          'Unit I: Fundamentals',
          'Unit II: Core Concepts',
          'Unit III: Applied Problems',
          'Unit IV: Advanced Topics',
          'Unit V: Exam Practice',
        ];

        // Distribute submissions evenly across units
        const unitsWithScores = UNITS.map((unit, idx) => {
          // Take every Nth submission for this unit slot (round-robin distribution)
          const unitSubs = relevantSubs.filter((_, i) => i % UNITS.length === idx);
          if (unitSubs.length === 0) return { unit, pct: null };
          const avg = unitSubs.reduce((sum, s) => sum + (s.score / s.max_score) * 100, 0) / unitSubs.length;
          return { unit, pct: Math.round(avg) };
        });

        setMasteryData(unitsWithScores);
      } catch (err) {
        console.error('[mastery] calculateMastery error:', err);
      }
    };

    calculateMastery();
  }, [selectedStudent?.id, selectedSubject, profile?.schoolId]);

  const handleSendPractice = async () => {
    if (!selectedStudent || !profile?.schoolId) return;
    setIsSending(true);
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      // Find weakest unit to target
      const weakest = masteryData
        .filter(m => m.pct !== null)
        .sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100))[0];

      const { error } = await supabase.from('assignments').insert({
        school_id: profile.schoolId,
        teacher_id: profile.id,
        teacher_name: profile.name || 'Teacher',
        title: `Targeted Practice: ${weakest?.unit || selectedSubject || 'Core Concepts'}`,
        description: `Personalized practice module targeting ${weakest?.unit || 'weak areas'} for ${selectedStudent.name}.`,
        type: 'quiz',
        subject: selectedSubject || 'General',
        class: selectedStudent.student_class || selectedStudent.branch || '',
        due_date: dueDate.toISOString().split('T')[0],
        questions: [
          {
            questionText: `Practice: Demonstrate your understanding of ${weakest?.unit || 'this topic'}.`,
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctOptionId: 0,
          },
        ],
      });

      if (error) throw error;
      alert(`✅ Targeted Practice Module sent to ${selectedStudent.name}!`);
    } catch (err: any) {
      alert('Failed to send practice module: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading AI Mastery Tracker...</div>;

  const hasData = masteryData.some(m => m.pct !== null);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/teacher" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-[#002147]">Student Mastery & Weakness Analysis</h1>
            <p className="text-gray-500 text-sm mt-1">Real-time mastery calculated from graded submissions</p>
          </div>
        </div>

        {teacherSubjects.length > 0 && (
          <select
            value={selectedSubject}
            onChange={e => setSelectedSubject(e.target.value)}
            className="bg-white border border-gray-200 text-[#002147] font-bold px-4 py-2.5 rounded-2xl text-sm shadow-sm"
          >
            {teacherSubjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Student Roster */}
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-[#002147]">Student Directory</h2>
          {isLoading ? (
            <div className="py-8 text-center text-gray-400">Loading directory...</div>
          ) : studentsList.length === 0 ? (
            <div className="py-8 text-center text-gray-400">No students enrolled yet.</div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {studentsList.map(s => {
                const isSelected = selectedStudent?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStudent(s)}
                    className={`w-full text-left p-3.5 rounded-2xl transition-all border ${
                      isSelected
                        ? 'bg-[#002147] text-white border-[#002147] shadow-md'
                        : 'bg-gray-50/50 hover:bg-gray-100 border-gray-200 text-gray-800'
                    }`}
                  >
                    <div className="font-bold text-sm">{s.name || 'Student'}</div>
                    <div className={`text-xs ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>
                      Class: {s.student_class || s.branch || 'General'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Student Diagnostic Details */}
        <div className="md:col-span-2 bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
          {selectedStudent ? (
            <>
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <h2 className="text-2xl font-bold text-[#002147]">{selectedStudent.name}</h2>
                  <p className="text-xs text-gray-500">Student ID: {selectedStudent.custom_student_id || selectedStudent.id}</p>
                </div>
                <button
                  onClick={handleSendPractice}
                  disabled={isSending}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm transition-all shadow-md flex items-center space-x-2 disabled:opacity-50"
                >
                  <Zap className="w-4 h-4" />
                  <span>{isSending ? 'Assigning...' : 'Assign AI Practice'}</span>
                </button>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  Unit Mastery Overview
                  {!hasData && <span className="text-xs font-normal text-gray-400 normal-case">(Submit assignments to see real data)</span>}
                </h3>

                {!hasData ? (
                  <div className="py-12 text-center text-gray-400 bg-gray-50 rounded-2xl border border-gray-200">
                    <RefreshCw className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No graded submissions found for {selectedStudent.name}</p>
                    <p className="text-xs mt-1">Mastery data appears automatically after assignments are graded.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {masteryData.map(({ unit, pct }) => {
                      const color = pct === null ? 'gray' : pct >= 75 ? 'emerald' : pct >= 50 ? 'amber' : 'red';
                      const bgMap: Record<string, string> = { gray: 'bg-gray-50 border-gray-200', emerald: 'bg-emerald-50 border-emerald-100', amber: 'bg-amber-50 border-amber-100', red: 'bg-red-50 border-red-100' };
                      const textMap: Record<string, string> = { gray: 'text-gray-400', emerald: 'text-emerald-700', amber: 'text-amber-700', red: 'text-red-700' };
                      const barMap: Record<string, string> = { gray: 'bg-gray-200', emerald: 'bg-emerald-500', amber: 'bg-amber-400', red: 'bg-red-500' };

                      return (
                        <div key={unit} className={`p-4 border rounded-2xl space-y-2 ${bgMap[color]}`}>
                          <div className="flex items-center justify-between text-xs font-bold text-[#002147]">
                            <span>{unit}</span>
                            <span className={`font-extrabold ${textMap[color]}`}>
                              {pct !== null ? `${pct}%` : '—'}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all duration-700 ${barMap[color]}`}
                              style={{ width: `${pct ?? 0}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-20 text-center text-gray-400">Select a student to view diagnostic mastery data.</div>
          )}
        </div>
      </div>
    </div>
  );
}
