'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, CheckCircle, Clock, ChevronRight, ArrowLeft, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface Assignment {
  id: string;
  topic: string;
  subject: string;
  dueDate: string;
  type: string;
  status: 'pending' | 'completed';
  grade?: string;
  score?: number;
  maxScore?: number;
  teacherApproved?: boolean;
  questions?: any[];
  [key: string]: unknown;
}

const isOverdue = (dateStr: string) => {
  if (!dateStr || dateStr === 'No Date') return false;
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
};

const TYPE_COLORS: Record<string, string> = {
  homework: 'bg-blue-50 text-blue-700 border-blue-200',
  quiz: 'bg-purple-50 text-purple-700 border-purple-200',
  announcement: 'bg-amber-50 text-amber-700 border-amber-200',
  video: 'bg-teal-50 text-teal-700 border-teal-200',
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
        const studentClass = (profile.studentClass || '').toLowerCase().trim();

        // ── Step 1: Find teachers who teach this student's class ──────────────
        const { data: teacherRows } = await supabase
          .from('users')
          .select('uid, assignments')
          .eq('school_id', profile.schoolId)
          .eq('role', 'teacher');

        const relevantTeacherIds = new Set<string>();
        (teacherRows || []).forEach((t: any) => {
          const tas: any[] = t.assignments || [];
          const teachesClass = tas.some((a: any) => {
            const tc = (a.class || '').toLowerCase().trim();
            return !studentClass || !tc || tc.includes(studentClass) || studentClass.includes(tc);
          });
          if (teachesClass && t.uid) relevantTeacherIds.add(t.uid);
        });

        // ── Step 2: Fetch only from those teachers ────────────────────────────
        let assignQuery = supabase
          .from('assignments')
          .select('*')
          .eq('school_id', profile.schoolId);

        if (relevantTeacherIds.size > 0) {
          assignQuery = assignQuery.in('teacher_id', [...relevantTeacherIds]);
        }

        const { data: assignRows, error } = await assignQuery;
        if (error) throw error;

        const { data: subRows } = await supabase
          .from('submissions')
          .select('*')
          .eq('student_id', profile.uid);

        const subMap = new Map((subRows || []).map(s => [s.assignment_id, s]));
        const studentCustomId = profile.customStudentId || '';

        const list: Assignment[] = (assignRows || [])
          .filter(a => {
            // Class-level filter
            const aClass = (a.class || '').toLowerCase().trim();
            if (aClass && studentClass && !aClass.includes(studentClass) && !studentClass.includes(aClass)) {
              return false;
            }
            // Student-specific filter
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
              type: a.type || 'homework',
              dueDate: a.due_date || 'No Date',
              status: isSubmitted ? 'completed' : 'pending',
              score: sub?.score ?? undefined,
              maxScore: sub?.max_score ?? undefined,
              grade: sub?.grade || (sub?.score != null && sub?.max_score ? `${sub.score}/${sub.max_score}` : undefined),
              teacherApproved: sub?.teacher_approved ?? true,
              questions: a.questions || [],
            };
          });

        // Sort: pending first, then by due date
        list.sort((a, b) => {
          if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
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
    return (
      <div className="p-10 text-[#002147] text-center font-medium">
        <div className="w-8 h-8 border-4 border-[#002147]/20 border-t-[#002147] rounded-full animate-spin mx-auto mb-3" />
        Loading Homework Portal...
      </div>
    );
  }

  const filtered = assignments.filter(a => {
    if (filter === 'pending') return a.status === 'pending';
    if (filter === 'completed') return a.status === 'completed';
    return true;
  });

  const pendingCount = assignments.filter(a => a.status === 'pending').length;
  const completedCount = assignments.filter(a => a.status === 'completed').length;
  const overdueCount = assignments.filter(a => a.status === 'pending' && isOverdue(a.dueDate)).length;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/student" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147] shadow-sm">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-extrabold text-[#002147]">Your Assignments</h1>
          <p className="text-gray-500 text-sm mt-1">
            {profile?.studentClass ? `Class ${profile.studentClass} ·` : ''} {assignments.length} assignment{assignments.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center shadow-sm">
          <div className="text-3xl font-black text-[#002147]">{pendingCount}</div>
          <div className="text-xs font-bold text-gray-500 uppercase mt-1">Pending</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center shadow-sm">
          <div className="text-3xl font-black text-emerald-600">{completedCount}</div>
          <div className="text-xs font-bold text-gray-500 uppercase mt-1">Submitted</div>
        </div>
        <div className={`rounded-2xl border p-5 text-center shadow-sm ${overdueCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <div className={`text-3xl font-black ${overdueCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>{overdueCount}</div>
          <div className="text-xs font-bold text-gray-500 uppercase mt-1">Overdue</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex bg-gray-100 p-1 rounded-2xl border border-gray-200 self-start w-fit">
        {(['all', 'pending', 'completed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-2 text-xs font-bold capitalize rounded-xl transition-all ${
              filter === f ? 'bg-[#002147] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {f} {f === 'all' ? `(${assignments.length})` : f === 'pending' ? `(${pendingCount})` : `(${completedCount})`}
          </button>
        ))}
      </div>

      {/* Assignment cards */}
      <div className="space-y-3">
        {filtered.map(a => (
          <div key={a.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md uppercase tracking-wider border border-blue-100">
                    {a.subject}
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-md capitalize border ${TYPE_COLORS[a.type] || TYPE_COLORS.homework}`}>
                    {a.type}
                  </span>
                  {isOverdue(a.dueDate) && a.status === 'pending' && (
                    <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-md border border-red-200">
                      <AlertCircle className="w-3 h-3" /> Overdue
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-[#002147] mb-1">{a.topic}</h3>
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Due: {a.dueDate}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {a.status === 'completed' ? (
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                      <CheckCircle className="w-3.5 h-3.5" /> Submitted
                    </span>
                    {a.grade && (
                      <p className="text-xs font-mono font-bold text-gray-700 mt-1.5 text-right">
                        {a.score != null && a.maxScore != null
                          ? `${a.score}/${a.maxScore} (${Math.round((a.score / a.maxScore) * 100)}%)`
                          : `Grade: ${a.grade}`}
                      </p>
                    )}
                    {a.teacherApproved === false && (
                      <p className="text-xs text-amber-600 font-semibold mt-1">Awaiting review</p>
                    )}
                  </div>
                ) : (
                  <Link
                    href={`/student?task=${a.id}`}
                    className="flex items-center gap-1 px-4 py-2 bg-[#002147] text-white text-xs font-bold rounded-xl hover:bg-blue-900 transition-all"
                  >
                    Open <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
            <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">
              {filter === 'all' ? "No assignments yet. Check back later." : `No ${filter} assignments.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
