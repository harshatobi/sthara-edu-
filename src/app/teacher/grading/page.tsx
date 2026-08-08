'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import {
  Check, ArrowLeft, Loader2, FileText, BadgeCheck, AlertTriangle,
  Edit3, Image as ImageIcon, X, BookOpen, CheckSquare
} from 'lucide-react';
import AiEvaluationView from '@/components/AiEvaluationView';
import Link from 'next/link';
import { getAuthToken } from '@/lib/auth/getAuthToken';

interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  student_name?: string;
  student_class?: string;
  custom_student_id?: string;
  score: number;
  max_score: number;
  grade: string;
  ai_result: any;
  ai_graded: boolean;
  submission_text?: string;
  image_url?: string;
  teacher_approved: boolean;
  teacher_note?: string | null;
  created_at?: string;
  assignment_title?: string;
}

export default function GradingGalleryPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [queue, setQueue] = useState<Submission[]>([]);
  const [fetching, setFetching] = useState(true);
  const [active, setActive] = useState<Submission | null>(null);
  const [queueFilter, setQueueFilter] = useState<'pending' | 'reviewed' | 'all'>('pending');

  const [overrideScore, setOverrideScore] = useState('');
  const [overrideMax, setOverrideMax] = useState('');
  const [teacherNote, setTeacherNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId) return;

    const fetchSubmissions = async () => {
      setFetching(true);
      try {
        // Step 1: Get this teacher's assignment IDs only
        const { data: assignData, error: assignErr } = await supabase
          .from('assignments')
          .select('id')
          .eq('school_id', profile.schoolId)
          .eq('teacher_id', profile.uid);

        if (assignErr) throw assignErr;

        const assignmentIds = (assignData || []).map((a: any) => a.id);

        if (assignmentIds.length === 0) {
          setQueue([]);
          setFetching(false);
          return;
        }

        // Step 2: Fetch submissions ONLY for this teacher's assignments
        const { data: subsData, error: subsErr } = await supabase
          .from('submissions')
          .select('*')
          .in('assignment_id', assignmentIds)
          .order('created_at', { ascending: false });

        if (subsErr) throw subsErr;

        const submissions = (subsData || []).map((s: any) => ({
          ...s,
          assignment_title: s.assignment_title || 'Homework Task',
        }));

        setQueue(submissions);
        if (submissions.length > 0) setActive(submissions[0]);
      } catch (err: any) {
        console.error('[grading] fetch error:', err);
      } finally {
        setFetching(false);
      }
    };

    fetchSubmissions();
  }, [profile?.schoolId, profile?.uid]);

  const handleReview = async (approved: boolean) => {
    if (!active || !profile?.schoolId) return;
    setSaving(true);
    try {
      const finalGrade = overrideScore && overrideMax
        ? `${overrideScore}/${overrideMax}`
        : active.grade || `${active.score}/${active.max_score}`;

      const authToken = await getAuthToken();
      const res = await fetch('/api/teacher/review-submission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          submissionId: active.id,
          schoolId: profile.schoolId,
          teacherApproved: approved,
          grade: finalGrade,
          teacherNote: teacherNote || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');

      setQueue(prev =>
        prev.map(s =>
          s.id === active.id
            ? { ...s, teacher_approved: approved, grade: finalGrade, teacher_note: teacherNote }
            : s
        )
      );

      setActive(prev => (prev ? { ...prev, teacher_approved: approved, grade: finalGrade, teacher_note: teacherNote } : null));
      setIsEditMode(false);
    } catch (err: any) {
      alert('Failed to save grade: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Grading Gallery...</div>;

  const filteredQueue = queue.filter(s => {
    if (queueFilter === 'pending') return s.teacher_approved === false || s.teacher_approved == null;
    if (queueFilter === 'reviewed') return s.teacher_approved === true;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/teacher" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-[#002147]">AI Grading & Review Gallery</h1>
            <p className="text-gray-500 text-sm mt-1">Review student homework submissions and AI step-by-step mark breakdown</p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex space-x-2 bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm">
          {(['pending', 'reviewed', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setQueueFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${
                queueFilter === f ? 'bg-[#002147] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f} ({queue.filter(s => f === 'all' ? true : f === 'reviewed' ? s.teacher_approved : !s.teacher_approved).length})
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Submissions Queue */}
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-[#002147]">Submissions Queue</h2>

          {fetching ? (
            <div className="py-12 text-center text-gray-400">Loading submissions...</div>
          ) : filteredQueue.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No submissions in this queue.</div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {filteredQueue.map(item => {
                const isSelected = active?.id === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActive(item);
                      setOverrideScore(String(item.score || ''));
                      setOverrideMax(String(item.max_score || ''));
                      setTeacherNote(item.teacher_note || '');
                    }}
                    className={`w-full text-left p-4 rounded-2xl border transition-all ${
                      isSelected
                        ? 'bg-[#002147] text-white border-[#002147] shadow-md'
                        : 'bg-gray-50/50 hover:bg-gray-100 border-gray-200 text-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm">{item.student_name || 'Student'}</div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                        item.teacher_approved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.grade || `${item.score}/${item.max_score}`}
                      </span>
                    </div>
                    <div className={`text-xs mt-1 ${isSelected ? 'text-blue-200' : 'text-gray-500'}`}>
                      {item.assignment_title || 'Homework'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Submission Review */}
        <div className="md:col-span-2 bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
          {active ? (
            <>
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-[#002147]">{active.student_name || 'Student Submission'}</h2>
                  <p className="text-xs text-gray-500">{active.assignment_title}</p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleReview(true)}
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs transition-all shadow-sm"
                  >
                    Approve Grade
                  </button>
                </div>
              </div>

              {/* AI Evaluation View or Text / Image Content */}
              {active.ai_result ? (
                <AiEvaluationView aiResult={active.ai_result} />
              ) : active.submission_text ? (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm text-gray-800 whitespace-pre-wrap">
                  {active.submission_text}
                </div>
              ) : active.image_url ? (
                <div className="rounded-2xl overflow-hidden border border-gray-200">
                  <img src={active.image_url} alt="Submission" className="w-full max-h-96 object-contain bg-black/5" />
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">No content attached to this submission.</div>
              )}
            </>
          ) : (
            <div className="py-24 text-center text-gray-400">Select a submission from the queue to review.</div>
          )}
        </div>
      </div>
    </div>
  );
}
