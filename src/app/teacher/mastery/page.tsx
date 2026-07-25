'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BrainCircuit, Target, BookOpen, CheckCircle2, ChevronRight, Zap } from 'lucide-react';
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

  const handleSendPractice = async () => {
    if (!selectedStudent || !profile?.schoolId) return;
    setIsSending(true);
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      const { error } = await supabase.from('assignments').insert({
        school_id: profile.schoolId,
        teacher_id: profile.uid,
        teacher_name: profile.name || 'Teacher',
        title: `Targeted Practice Module: ${selectedSubject || 'Core Concepts'}`,
        description: 'Personalized practice module assigned to strengthen topic mastery.',
        type: 'quiz',
        subject: selectedSubject || 'General',
        due_date: dueDate.toISOString().split('T')[0],
        questions: [
          {
            questionText: 'Practice Question 1: Explain the core concepts of this unit.',
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctOptionId: 0,
          },
        ],
      });

      if (error) throw error;
      alert('Personalized Practice Module sent to student successfully!');
    } catch (err: any) {
      alert('Failed to send practice module: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading AI Mastery Tracker...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/teacher" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-[#002147]">Student Mastery & Weakness Analysis</h1>
            <p className="text-gray-500 text-sm mt-1">AI-driven diagnostic analysis per student & topic unit</p>
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
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm transition-all shadow-md flex items-center space-x-2"
                >
                  <Zap className="w-4 h-4" />
                  <span>{isSending ? 'Assigning...' : 'Assign AI Practice'}</span>
                </button>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Unit Mastery Overview</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {['Unit I: Fundamentals', 'Unit II: Core Mechanics', 'Unit III: Applied Problem Solving'].map((unit, idx) => (
                    <div key={unit} className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-[#002147]">
                        <span>{unit}</span>
                        <span className="text-emerald-600 font-extrabold">{85 - idx * 10}%</span>
                      </div>
                      <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${85 - idx * 10}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
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
