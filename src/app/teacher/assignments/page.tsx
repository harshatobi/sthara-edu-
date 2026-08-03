'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import {
  Trash2, FileText, CheckCircle, Search, Loader2, ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import { getAuthToken } from '@/lib/auth/getAuthToken';

export default function AssignmentManagerPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [assignments, setAssignments] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingAssignment, setViewingAssignment] = useState<any | null>(null);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId) return;

    const fetchAssignments = async () => {
      setFetching(true);
      try {
        const { data, error } = await supabase
          .from('assignments')
          .select('*')
          .eq('school_id', profile.schoolId)
          .eq('teacher_id', profile.uid)   // ✅ only THIS teacher's assignments
          .order('created_at', { ascending: false });

        if (error) throw error;
        setAssignments(data || []);
      } catch (err: any) {
        console.error('[assignments] fetch error:', err);
      } finally {
        setFetching(false);
      }
    };

    fetchAssignments();
  }, [profile?.schoolId]);

  const handleDeleteAssignment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this assignment and all its submissions?')) return;
    setDeletingId(id);
    try {
      const authToken = await getAuthToken();
      const res = await fetch('/api/teacher/delete-assignment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ assignmentId: id, schoolId: profile!.schoolId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Delete failed');
      setAssignments(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      alert('Failed to delete assignment: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Assignment Manager...</div>;

  const filteredAssignments = assignments.filter(a =>
    (a.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.class || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/teacher" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-[#002147]">Assignment &amp; Quiz Manager</h1>
            <p className="text-gray-500 text-sm mt-1">Manage, search, and delete posted course assignments</p>
          </div>
        </div>

        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search assignments..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-xl font-bold text-[#002147]">Posted Assignments ({filteredAssignments.length})</h2>

        {fetching ? (
          <div className="py-12 text-center text-gray-400">Loading assignments...</div>
        ) : filteredAssignments.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No assignments found matching search.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredAssignments.map(a => (
              <div key={a.id} className="p-5 bg-gray-50 border border-gray-200 rounded-2xl space-y-3 relative group">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md uppercase">
                    {a.subject || 'General'}
                  </span>
                  <span className="text-xs text-gray-400">Class: {a.class || 'All'}</span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-[#002147]">{a.title}</h3>
                  {a.description && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{a.description}</p>}
                  {/* Question count badge */}
                  {Array.isArray(a.questions) && a.questions.length > 0 && (
                    <span className="inline-block mt-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                      {a.questions.length} question{a.questions.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {a.question_paper_url && (
                    <span className="inline-block mt-1.5 ml-1.5 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-md">
                      📎 Paper attached
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-200/60 text-xs text-gray-500">
                  <span>Due: {a.due_date || 'No due date'}</span>
                  <div className="flex items-center gap-3">
                    {/* VIEW BUTTON */}
                    <button
                      onClick={() => setViewingAssignment(a)}
                      className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center space-x-1 hover:underline"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>
                    <button
                      onClick={() => handleDeleteAssignment(a.id)}
                      disabled={deletingId === a.id}
                      className="text-rose-500 hover:underline font-bold flex items-center space-x-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{deletingId === a.id ? 'Deleting...' : 'Delete'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assignment Viewer Modal */}
      {viewingAssignment && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewingAssignment(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-gray-100 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-t-2xl">
              <div>
                <span className="text-indigo-200 text-xs font-bold uppercase tracking-wider">{viewingAssignment.subject} · {viewingAssignment.class}</span>
                <h2 className="text-white font-extrabold text-xl mt-1">{viewingAssignment.title}</h2>
                <p className="text-indigo-200 text-sm mt-0.5">Due: {viewingAssignment.due_date || 'No due date'}</p>
              </div>
              <button onClick={() => setViewingAssignment(null)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white ml-4 shrink-0">
                <CheckCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Description */}
              {viewingAssignment.description && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Description</p>
                  <p className="text-gray-700 text-sm leading-relaxed bg-gray-50 rounded-xl p-4 border border-gray-100">{viewingAssignment.description}</p>
                </div>
              )}

              {/* Questions */}
              {Array.isArray(viewingAssignment.questions) && viewingAssignment.questions.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Questions ({viewingAssignment.questions.length})</p>
                  <div className="space-y-3">
                    {viewingAssignment.questions.map((q: any, idx: number) => (
                      <div key={idx} className="flex gap-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <div className="w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-black shrink-0">{idx+1}</div>
                        <div className="flex-1">
                          <p className="text-[#002147] font-semibold text-sm">{q.text || q.question || 'Question'}</p>
                          {q.marks && <p className="text-xs text-gray-400 mt-0.5">{q.marks} mark{q.marks !== 1 ? 's' : ''}</p>}
                          {/* MCQ options */}
                          {Array.isArray(q.options) && q.options.length > 0 && (
                            <div className="grid grid-cols-2 gap-1.5 mt-2">
                              {q.options.map((opt: any, oi: number) => (
                                <div key={oi} className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium ${
                                  oi === q.correctAnswerIndex ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-600'
                                }`}>
                                  {String.fromCharCode(65+oi)}. {typeof opt === 'string' ? opt : opt.text}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attached Question Paper */}
              {viewingAssignment.question_paper_url && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Attached Question Paper</p>
                  {viewingAssignment.question_paper_type === 'image' ? (
                    <img
                      src={viewingAssignment.question_paper_url}
                      alt="Question Paper"
                      className="w-full rounded-xl border border-gray-200 object-contain max-h-96"
                    />
                  ) : (
                    <a
                      href={viewingAssignment.question_paper_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 transition-colors"
                    >
                      <FileText className="w-5 h-5 text-violet-600" />
                      <div>
                        <p className="font-bold text-violet-700 text-sm">Open Question Paper (PDF)</p>
                        <p className="text-xs text-violet-400">Opens in a new tab</p>
                      </div>
                    </a>
                  )}
                </div>
              )}

              {!viewingAssignment.description && !(Array.isArray(viewingAssignment.questions) && viewingAssignment.questions.length > 0) && !viewingAssignment.question_paper_url && (
                <div className="text-center py-8 text-gray-400 text-sm">No detailed content attached to this assignment.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
