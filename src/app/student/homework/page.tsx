'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, CheckCircle, Clock, ChevronRight, FileText, Activity } from 'lucide-react';
import Link from 'next/link';

interface Assignment {
  id: string;
  topic: string;
  subject: string;
  dueDate: string;
  status: 'pending' | 'completed';
  grade?: string;
  teacherApproved?: boolean;
  questions?: string[];
  [key: string]: unknown;
}

const isOverdue = (dateStr: string) => {
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
};

export default function StudentHomework() {
  const { profile, loading } = useAuth();
  const supabase = createClient();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [fetching, setFetching] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  useEffect(() => {
    if (!profile?.schoolId || !profile?.uid) {
      setFetching(false);
      return;
    }

    const fetchAssignments = async () => {
      try {
        const { data: assignRows, error } = await supabase
          .from('assignments')
          .select('*')
          .eq('school_id', profile.schoolId);

        if (error) throw error;

        const { data: subRows } = await supabase
          .from('submissions')
          .select('*')
          .eq('student_id', profile.uid);

        const subMap = new Map((subRows || []).map(s => [s.assignment_id, s]));

        const studentCustomId = profile.customStudentId || '';

        const list: Assignment[] = (assignRows || [])
          .filter(a => {
            const assignedIds: string[] = a.assigned_student_ids || [];
            if (assignedIds.length === 0) return true;
            return (
              (studentCustomId && assignedIds.includes(studentCustomId)) ||
              assignedIds.includes(profile.uid)
            );
          })
          .map(a => {
            const sub = subMap.get(a.id);
            const isSubmitted = !!sub;
            return {
              id: a.id,
              topic: a.title || 'Assignment',
              subject: a.subject || 'General',
              dueDate: a.due_date || 'No Date',
              status: isSubmitted ? 'completed' : 'pending',
              grade: sub?.grade || (sub?.score != null && sub?.max_score ? `${sub.score}/${sub.max_score}` : undefined),
              teacherApproved: sub?.teacher_approved ?? true,
              questions: a.questions || [],
            };
          });

        setAssignments(list);
      } catch (e) {
        console.error('Error loading homework:', e);
      } finally {
        setFetching(false);
      }
    };

    fetchAssignments();
  }, [profile?.schoolId, profile?.uid]);

  if (loading || fetching) {
    return <div className="p-10 text-[#002147] text-center font-medium">Loading Homework Portal...</div>;
  }

  const filtered = assignments.filter(a => {
    if (filter === 'pending') return a.status === 'pending';
    if (filter === 'completed') return a.status === 'completed';
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#002147]">Your Assignments</h1>
          <p className="text-gray-500 text-sm mt-1">View homework, quizzes, and submission statuses</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-2xl border border-gray-200 self-start sm:self-auto">
          {(['all', 'pending', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-xs font-bold capitalize rounded-xl transition-all ${
                filter === f ? 'bg-[#002147] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map(a => (
          <div key={a.id} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md uppercase tracking-wider">{a.subject}</span>
              <h3 className="text-lg font-bold text-[#002147] mt-2">{a.topic}</h3>
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Due: {a.dueDate}
                {isOverdue(a.dueDate) && a.status === 'pending' && (
                  <span className="text-red-500 font-bold ml-2">Overdue</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {a.status === 'completed' ? (
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                    <CheckCircle className="w-3.5 h-3.5" /> Submitted
                  </span>
                  {a.grade && <p className="text-xs font-mono font-bold text-gray-700 mt-1">Grade: {a.grade}</p>}
                </div>
              ) : (
                <Link href="/student" className="px-4 py-2 bg-[#002147] text-white text-xs font-bold rounded-xl hover:bg-blue-900 transition-all">
                  Open Task →
                </Link>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 text-gray-400">
            No assignments found for this filter.
          </div>
        )}
      </div>
    </div>
  );
}
