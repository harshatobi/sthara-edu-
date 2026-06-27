'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs, doc, updateDoc, where } from 'firebase/firestore';
import {
  Check, ChevronRight, ArrowLeft, Loader2, BrainCircuit,
  FileText, Users, Inbox, BadgeCheck, AlertTriangle, Edit3, MessageSquare
} from 'lucide-react';
import AiEvaluationView from '@/components/AiEvaluationView';
import Link from 'next/link';

interface Submission {
  id: string;               // student uid
  assignmentId: string;
  assignmentTitle: string;
  assignmentSubject: string;
  studentName: string;
  studentClass: string;
  customStudentId: string;
  grade: string;
  totalScore: number;
  maxTotalScore: number;
  aiResult: any;
  status: string;
  teacherApproved: boolean;
  submittedAt?: any;
}

export default function GradingGalleryPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [queue, setQueue] = useState<Submission[]>([]);
  const [fetching, setFetching] = useState(true);
  const [active, setActive] = useState<Submission | null>(null);

  // Teacher override
  const [overrideScore, setOverrideScore] = useState('');
  const [teacherNote, setTeacherNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) router.push('/login');
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId) return;
    fetchQueue();
  }, [profile?.schoolId]);

  const fetchQueue = async () => {
    const schoolId = profile?.schoolId;
    if (!schoolId) return;
    setFetching(true);
    try {
      const assignmentsSnap = await getDocs(
        collection(db, 'schools', schoolId, 'assignments')
      );

      const pending: Submission[] = [];

      for (const aDoc of assignmentsSnap.docs) {
        const aData = aDoc.data();
        const subsSnap = await getDocs(
          collection(db, 'schools', schoolId, 'assignments', aDoc.id, 'submissions')
        );

        subsSnap.forEach(sDoc => {
          const s = sDoc.data();
          // Pick up submissions that have aiResult and are not yet teacher-approved
          if (s.aiResult && !s.teacherApproved) {
            pending.push({
              id: sDoc.id,
              assignmentId: aDoc.id,
              assignmentTitle: aData.title || aData.topic || 'Untitled',
              assignmentSubject: aData.subject || '',
              studentName: s.studentName || 'Student',
              studentClass: s.studentClass || '',
              customStudentId: s.customStudentId || '',
              grade: s.grade || `${s.totalScore}/${s.maxTotalScore}`,
              totalScore: s.totalScore ?? 0,
              maxTotalScore: s.maxTotalScore ?? 0,
              aiResult: s.aiResult,
              status: s.status || 'ai_graded',
              teacherApproved: false,
              submittedAt: s.submittedAt,
            });
          }
        });
      }

      // Sort by submission time descending
      pending.sort((a, b) => {
        const ta = a.submittedAt?.seconds || 0;
        const tb = b.submittedAt?.seconds || 0;
        return tb - ta;
      });

      setQueue(pending);
      if (pending.length > 0) setActive(pending[0]);
    } catch (err) {
      console.error('Fetch queue error:', err);
    } finally {
      setFetching(false);
    }
  };

  const handleSelectSubmission = (sub: Submission) => {
    setActive(sub);
    setOverrideScore('');
    setTeacherNote('');
  };

  const handleApprove = async () => {
    if (!active || !profile?.schoolId) return;
    const schoolId = profile.schoolId;
    setSaving(true);
    try {
      const finalScore = overrideScore !== ''
        ? Number(overrideScore)
        : active.totalScore;

      const subRef = doc(
        db, 'schools', schoolId,
        'assignments', active.assignmentId,
        'submissions', active.id
      );

      await updateDoc(subRef, {
        teacherApproved: true,
        status: 'teacher_approved',
        teacherScore: finalScore,
        teacherNote: teacherNote || null,
        score: finalScore,
        maxScore: active.maxTotalScore,
        approvedAt: new Date(),
      });

      setApprovedIds(prev => new Set([...prev, `${active.assignmentId}-${active.id}`]));
      const remaining = queue.filter(q => !(q.id === active.id && q.assignmentId === active.assignmentId));
      setQueue(remaining);
      setActive(remaining.length > 0 ? remaining[0] : null);
      setOverrideScore('');
      setTeacherNote('');
    } catch (err: any) {
      console.error(err);
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-[#002147]" />
    </div>
  );

  const scorePercent = active && active.maxTotalScore > 0
    ? Math.round((active.totalScore / active.maxTotalScore) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      {/* Top Header Bar */}
      <div className="bg-white border-b border-gray-200/70 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/teacher" className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 border border-gray-200 transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </Link>
            <div>
              <div className="flex items-center space-x-2 text-blue-600 text-xs font-bold uppercase tracking-widest">
                <BrainCircuit className="w-4 h-4" />
                <span>Diagnostic Engine</span>
              </div>
              <h1 className="text-xl font-black text-[#002147]">Grading Gallery</h1>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-center">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Pending Review</p>
              <p className="text-2xl font-black text-amber-700">{queue.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex max-w-[1600px] mx-auto w-full">

        {/* LEFT SIDEBAR — Queue */}
        <div className="w-80 shrink-0 bg-white border-r border-gray-200/70 flex flex-col sticky top-[73px] h-[calc(100vh-73px)] overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-[#002147] flex items-center gap-2">
                <Users className="w-4 h-4" /> Student Queue
              </h2>
              <button onClick={fetchQueue} className="text-xs text-gray-400 hover:text-[#002147] font-bold transition-colors">
                Refresh
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {fetching ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#002147]/40" />
              </div>
            ) : queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                  <Inbox className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="font-bold text-gray-500">Queue is empty</p>
                <p className="text-xs text-gray-400 mt-1">All submissions have been reviewed.</p>
              </div>
            ) : (
              queue.map(sub => {
                const isActive = active?.id === sub.id && active?.assignmentId === sub.assignmentId;
                const pct = sub.maxTotalScore > 0 ? Math.round((sub.totalScore / sub.maxTotalScore) * 100) : 0;
                const chipColor = pct >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : pct >= 60 ? 'text-amber-700 bg-amber-50 border-amber-200'
                  : 'text-red-700 bg-red-50 border-red-200';

                return (
                  <button
                    key={`${sub.assignmentId}-${sub.id}`}
                    onClick={() => handleSelectSubmission(sub)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all group ${
                      isActive
                        ? 'bg-[#002147] border-[#002147] shadow-lg shadow-[#002147]/10'
                        : 'bg-white border-gray-200 hover:border-[#002147]/40 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`font-black text-sm truncate ${isActive ? 'text-white' : 'text-[#002147]'}`}>
                          {sub.studentName}
                        </p>
                        <p className={`text-xs truncate mt-0.5 ${isActive ? 'text-blue-200' : 'text-gray-400'}`}>
                          {sub.assignmentTitle}
                        </p>
                        {sub.assignmentSubject && (
                          <p className={`text-xs font-bold mt-1 ${isActive ? 'text-blue-300' : 'text-gray-400'}`}>
                            {sub.assignmentSubject} · {sub.studentClass}
                          </p>
                        )}
                      </div>
                      <div className={`shrink-0 px-2 py-0.5 rounded-lg border text-xs font-black ${
                        isActive ? 'bg-white/20 border-white/20 text-white' : chipColor
                      }`}>
                        {sub.grade}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 overflow-y-auto">
          {!active ? (
            <div className="flex flex-col items-center justify-center min-h-full py-32 text-center px-8">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                <BadgeCheck className="w-12 h-12 text-gray-300" />
              </div>
              <h2 className="text-2xl font-black text-[#002147] mb-2">All Caught Up!</h2>
              <p className="text-gray-500 font-medium max-w-sm">No submissions are waiting for review. Students' work will appear here once they submit.</p>
            </div>
          ) : (
            <div className="p-8 space-y-8 max-w-4xl mx-auto">

              {/* Submission Header */}
              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-widest text-blue-600">{active.assignmentSubject}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs font-bold text-gray-400">{active.studentClass}</span>
                  </div>
                  <h2 className="text-xl font-black text-[#002147]">{active.assignmentTitle}</h2>
                  <p className="text-gray-500 font-medium text-sm mt-1">
                    Submitted by <strong className="text-[#002147]">{active.studentName}</strong>
                    {active.customStudentId && <span className="text-gray-400"> · #{active.customStudentId}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`px-5 py-2 rounded-2xl font-black text-xl border-2 ${
                    scorePercent >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : scorePercent >= 60 ? 'text-amber-700 bg-amber-50 border-amber-200'
                    : 'text-red-700 bg-red-50 border-red-200'
                  }`}>
                    {active.grade}
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-black" style={{
                      background: `conic-gradient(${scorePercent >= 80 ? '#10b981' : scorePercent >= 60 ? '#f59e0b' : '#dc143c'} ${scorePercent}%, #f1f5f9 0)`,
                    }}>
                      <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center">
                        <span className="text-xs font-black text-gray-700">{scorePercent}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Evaluation Report */}
              {active.aiResult && <AiEvaluationView scanResult={active.aiResult} />}

              {/* Teacher Action Panel */}
              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 space-y-6">
                <h3 className="font-black text-[#002147] text-lg flex items-center gap-2">
                  <Edit3 className="w-5 h-5" /> Teacher Review
                </h3>

                {/* Override Score */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Override AI Score
                    <span className="font-normal text-gray-400">(optional — AI gave {active.grade})</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      max={active.maxTotalScore}
                      value={overrideScore}
                      onChange={e => setOverrideScore(e.target.value)}
                      placeholder={`AI: ${active.totalScore}`}
                      className="w-32 border border-gray-200 rounded-xl px-4 py-2.5 text-[#002147] font-bold focus:outline-none focus:ring-2 focus:ring-[#002147]/20 focus:border-[#002147] text-center text-xl"
                    />
                    <span className="text-gray-400 font-bold">/ {active.maxTotalScore}</span>
                    {overrideScore !== '' && (
                      <button onClick={() => setOverrideScore('')} className="text-xs text-gray-400 hover:text-red-500 font-bold transition-colors">
                        Clear override
                      </button>
                    )}
                  </div>
                </div>

                {/* Teacher Note */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-500" />
                    Personal Note for Student
                    <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    value={teacherNote}
                    onChange={e => setTeacherNote(e.target.value)}
                    placeholder="Add a personal comment, encouragement, or specific correction for this student…"
                    rows={3}
                    className="w-full border border-gray-200 rounded-2xl px-5 py-3 text-[#002147] font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#002147]/20 focus:border-[#002147] resize-none placeholder:text-gray-300"
                  />
                </div>

                {/* Approve Button */}
                <button
                  onClick={handleApprove}
                  disabled={saving}
                  className="w-full py-4 bg-gradient-to-r from-[#002147] to-blue-700 text-white rounded-2xl font-black text-lg hover:shadow-xl hover:shadow-blue-500/20 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-wait"
                >
                  {saving ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</>
                  ) : (
                    <><Check className="w-5 h-5" /> Approve & Save Grade</>
                  )}
                </button>

                <p className="text-center text-xs text-gray-400 font-medium">
                  Once approved, this grade is recorded in the student's permanent record and the class heatmap.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
