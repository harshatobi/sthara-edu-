'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import {
  Check, ArrowLeft, Loader2, BrainCircuit,
  FileText, Users, Inbox, BadgeCheck, AlertTriangle,
  Edit3, MessageSquare, Image as ImageIcon, X, ChevronLeft, ChevronRight,
  BookOpen, CheckSquare, ShieldAlert, Bot, Copy
} from 'lucide-react';
import AiEvaluationView from '@/components/AiEvaluationView';
import Link from 'next/link';

interface Submission {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  assignmentSubject: string;
  studentName: string;
  studentClass: string;
  customStudentId: string;
  score: number;
  maxScore: number;
  grade: string;
  aiResult: any;
  aiGraded: boolean;
  type: string;           // 'homework' | 'quiz' | 'image'
  text?: string;
  imageUrl?: string;
  imageUrls?: string[];
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
  const [overrideMax, setOverrideMax] = useState('');
  const [teacherNote, setTeacherNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Image lightbox
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // ── Integrity Check State ────────────────────────────────
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<{
    isAiGenerated: boolean;
    aiConfidence: number;
    aiReason: string;
    duplicateOf: string[];
    similarPairs?: { name: string; similarity: number }[];
  } | null>(null);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) router.push('/login');
  }, [profile, loading, router]);

  useEffect(() => {
    if (profile?.schoolId) fetchQueue();
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

      // Fetch all submissions in parallel across all assignments
      await Promise.all(assignmentsSnap.docs.map(async (aDoc) => {
        const aData = aDoc.data();
        const subsSnap = await getDocs(
          collection(db, 'schools', schoolId, 'assignments', aDoc.id, 'submissions')
        );

        subsSnap.forEach(sDoc => {
          const s = sDoc.data();
          // Show all un-approved submissions (not just AI-graded)
          if (!s.teacherApproved) {
            const score    = s.score    ?? s.totalScore    ?? 0;
            const maxScore = s.maxScore ?? s.maxTotalScore ?? (s.aiGraded ? 15 : 0);
            const imgs: string[] = s.imageUrls || (s.imageUrl ? [s.imageUrl] : []);

            pending.push({
              id: sDoc.id,
              assignmentId: aDoc.id,
              assignmentTitle: aData.title || aData.topic || 'Untitled',
              assignmentSubject: aData.subject || '',
              studentName: s.studentName || 'Student',
              studentClass: s.studentClass || '',
              customStudentId: s.customStudentId || '',
              score,
              maxScore,
              grade: maxScore > 0 ? `${score}/${maxScore}` : 'Pending',
              aiResult: s.aiResult || null,
              aiGraded: !!s.aiGraded,
              type: imgs.length > 0 ? 'image' : (s.type === 'quiz' ? 'quiz' : 'homework'),
              text: s.text || '',
              imageUrl: imgs[0] || '',
              imageUrls: imgs,
              teacherApproved: false,
              submittedAt: s.submittedAt,
            });
          }
        });
      }));

      // Newest first
      pending.sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
      setQueue(pending);
      if (pending.length > 0) setActive(pending[0]);
    } catch (err) {
      console.error('Fetch queue error:', err);
    } finally {
      setFetching(false);
    }
  };

  const handleSelectSubmission = async (sub: Submission) => {
    setActive(sub);
    setOverrideScore('');
    setOverrideMax('');
    setTeacherNote('');
    setLightboxIdx(null);
    setIntegrityResult(null);

    if (!profile?.schoolId) return;
    setIntegrityLoading(true);

    try {
      // ── IMAGE submission: fetch base64, compare against other image subs ──
      if (sub.imageUrl) {
        const imgResp = await fetch(sub.imageUrl);
        const blob = await imgResp.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const mimeType = blob.type || 'image/jpeg';

        const otherSubs = queue
          .filter(q => q.assignmentId === sub.assignmentId && q.id !== sub.id && q.imageUrl)
          .slice(0, 4);

        const othersWithBase64 = await Promise.all(
          otherSubs.map(async (o) => {
            try {
              const r = await fetch(o.imageUrl!);
              const b = await r.blob();
              const b64 = await new Promise<string>((res, rej) => {
                const rd = new FileReader();
                rd.onloadend = () => res((rd.result as string).split(',')[1]);
                rd.onerror = rej;
                rd.readAsDataURL(b);
              });
              return { submissionId: o.id, studentName: o.studentName, imageBase64: b64, mimeType: b.type || 'image/jpeg' };
            } catch { return null; }
          })
        ).then(results => results.filter(Boolean));

        const resp = await fetch('/api/homework/integrity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionId: sub.id, imageBase64: base64, mimeType, allSubmissions: othersWithBase64 }),
        });
        const data = await resp.json();
        if (data.success) {
          const ir = {
            isAiGenerated: data.isAiGenerated,
            aiConfidence: data.aiConfidence,
            aiReason: data.aiReason,
            duplicateOf: data.duplicateOf || [],
            similarPairs: data.similarPairs || [],
          };
          setIntegrityResult(ir);
          // Persist to Firestore
          await updateDoc(
            doc(db, 'schools', profile.schoolId, 'assignments', sub.assignmentId, 'submissions', sub.id),
            { integrityResult: ir }
          ).catch(() => {});
        }
      }

      // ── TEXT submission: compare text against other text subs ──
      else if (sub.text && sub.text.trim().length > 20) {
        const otherTextSubs = queue
          .filter(q => q.assignmentId === sub.assignmentId && q.id !== sub.id && q.text && q.text.trim().length > 20)
          .slice(0, 6)
          .map(o => ({ submissionId: o.id, studentName: o.studentName, text: o.text }));

        const resp = await fetch('/api/homework/integrity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionId: sub.id, text: sub.text, allSubmissions: otherTextSubs }),
        });
        const data = await resp.json();
        if (data.success) {
          const ir = {
            isAiGenerated: data.isAiGenerated,
            aiConfidence: data.aiConfidence,
            aiReason: data.aiReason,
            duplicateOf: data.duplicateOf || [],
            similarPairs: data.similarPairs || [],
          };
          setIntegrityResult(ir);
          // Persist to Firestore
          await updateDoc(
            doc(db, 'schools', profile.schoolId, 'assignments', sub.assignmentId, 'submissions', sub.id),
            { integrityResult: ir }
          ).catch(() => {});
        }
      }
      // ── No scannable content (quiz answers stored differently) ──
      else {
        setIntegrityLoading(false);
      }
    } catch (e) {
      console.warn('[grading] Integrity check error:', e);
    } finally {
      setIntegrityLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!active || !profile?.schoolId) return;
    const finalScore = overrideScore !== '' ? Number(overrideScore) : active.score;
    // For homework with no AI maxScore, teacher must enter it
    const finalMax = overrideMax !== '' ? Number(overrideMax) : (active.maxScore > 0 ? active.maxScore : 10);
    if (active.maxScore === 0 && overrideScore !== '' && overrideMax === '') {
      alert('Please also enter the "Out of" value (total marks) for this homework.');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(
        doc(db, 'schools', profile.schoolId, 'assignments', active.assignmentId, 'submissions', active.id),
        {
          teacherApproved: true,
          status: 'teacher_approved',
          score: finalScore,
          maxScore: finalMax,
          teacherNote: teacherNote || null,
          approvedAt: new Date(),
        }
      );

      const remaining = queue.filter(
        q => !(q.id === active.id && q.assignmentId === active.assignmentId)
      );
      setQueue(remaining);
      setActive(remaining.length > 0 ? remaining[0] : null);
      setOverrideScore('');
      setOverrideMax('');
      setTeacherNote('');
      setLightboxIdx(null);
    } catch (err: any) {
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

  const scorePercent = active && active.maxScore > 0
    ? Math.round((active.score / active.maxScore) * 100)
    : null;

  const activeImages = active?.imageUrls || (active?.imageUrl ? [active.imageUrl] : []);

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">

      {/* Lightbox */}
      {lightboxIdx !== null && activeImages.length > 0 && (
        <div
          className="fixed inset-0 bg-black/90 z-[999] flex items-center justify-center"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 rounded-full p-2"
            onClick={() => setLightboxIdx(null)}
          >
            <X className="w-6 h-6" />
          </button>

          {activeImages.length > 1 && (
            <>
              <button
                className="absolute left-4 text-white/80 hover:text-white bg-white/10 rounded-full p-3 disabled:opacity-30"
                onClick={(e) => { e.stopPropagation(); setLightboxIdx(Math.max(0, lightboxIdx - 1)); }}
                disabled={lightboxIdx === 0}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                className="absolute right-4 text-white/80 hover:text-white bg-white/10 rounded-full p-3 disabled:opacity-30"
                onClick={(e) => { e.stopPropagation(); setLightboxIdx(Math.min(activeImages.length - 1, lightboxIdx + 1)); }}
                disabled={lightboxIdx === activeImages.length - 1}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          <div className="max-w-4xl max-h-[90vh] px-4" onClick={e => e.stopPropagation()}>
            <img
              src={activeImages[lightboxIdx]}
              alt={`Page ${lightboxIdx + 1}`}
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
            <p className="text-white/60 text-center text-sm mt-3">
              Page {lightboxIdx + 1} of {activeImages.length}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
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
          <div className="flex items-center gap-3">
            <button
              onClick={fetchQueue}
              className="text-sm font-bold text-[#002147]/60 hover:text-[#002147] border border-gray-200 rounded-xl px-4 py-2 hover:bg-gray-50 transition-all"
            >
              Refresh
            </button>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-center">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Pending</p>
              <p className="text-2xl font-black text-amber-700">{queue.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex max-w-[1600px] mx-auto w-full">

        {/* LEFT SIDEBAR — Queue */}
        <div className="w-80 shrink-0 bg-white border-r border-gray-200/70 flex flex-col sticky top-[73px] h-[calc(100vh-73px)] overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-black text-[#002147] flex items-center gap-2 text-sm">
              <Users className="w-4 h-4" /> Student Queue
            </h2>
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
                <p className="text-xs text-gray-400 mt-1">All submissions reviewed.</p>
              </div>
            ) : (
              queue.map(sub => {
                const isActive = active?.id === sub.id && active?.assignmentId === sub.assignmentId;
                const pct = sub.maxScore > 0 ? Math.round((sub.score / sub.maxScore) * 100) : null;
                const chipColor = pct === null ? 'text-gray-500 bg-gray-50 border-gray-200'
                  : pct >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : pct >= 60 ? 'text-amber-700 bg-amber-50 border-amber-200'
                  : 'text-red-700 bg-red-50 border-red-200';

                const typeIcon = sub.type === 'image'
                  ? <ImageIcon className="w-3 h-3" />
                  : sub.type === 'quiz'
                  ? <CheckSquare className="w-3 h-3" />
                  : <BookOpen className="w-3 h-3" />;

                return (
                  <button
                    key={`${sub.assignmentId}-${sub.id}`}
                    onClick={() => handleSelectSubmission(sub)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all ${
                      isActive
                        ? 'bg-[#002147] border-[#002147] shadow-lg'
                        : 'bg-white border-gray-200 hover:border-[#002147]/40 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className={`font-black text-sm truncate ${isActive ? 'text-white' : 'text-[#002147]'}`}>
                          {sub.studentName}
                        </p>
                        <p className={`text-xs truncate mt-0.5 ${isActive ? 'text-blue-200' : 'text-gray-400'}`}>
                          {sub.assignmentTitle}
                        </p>
                        <div className={`flex items-center gap-1 mt-1.5 text-xs font-bold ${isActive ? 'text-blue-300' : 'text-gray-400'}`}>
                          {typeIcon}
                          <span className="capitalize">{sub.type}</span>
                          {sub.studentClass && <span>· {sub.studentClass}</span>}
                        </div>
                      </div>
                      <div className={`shrink-0 px-2 py-0.5 rounded-lg border text-xs font-black ${
                        isActive ? 'bg-white/20 border-white/20 text-white' : chipColor
                      }`}>
                        {sub.grade}
                      </div>
                    </div>

                    {/* Page count badge for image submissions */}
                    {sub.imageUrls && sub.imageUrls.length > 0 && (
                      <div className={`mt-2 flex items-center gap-1 text-[10px] font-bold ${isActive ? 'text-blue-200' : 'text-gray-400'}`}>
                        <ImageIcon className="w-3 h-3" />
                        {sub.imageUrls.length} page{sub.imageUrls.length > 1 ? 's' : ''} attached
                      </div>
                    )}
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
              <p className="text-gray-500 font-medium max-w-sm">
                No submissions waiting for review. Students' work will appear here once they submit.
              </p>
            </div>
          ) : (
            <div className="p-8 space-y-6 max-w-4xl mx-auto">

              {/* Submission Header */}
              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {active.assignmentSubject && (
                      <span className="text-xs font-bold uppercase tracking-widest text-blue-600">{active.assignmentSubject}</span>
                    )}
                    {active.assignmentSubject && active.studentClass && <span className="text-gray-300">·</span>}
                    <span className="text-xs font-bold text-gray-400">{active.studentClass}</span>
                  </div>
                  <h2 className="text-xl font-black text-[#002147]">{active.assignmentTitle}</h2>
                  <p className="text-gray-500 font-medium text-sm mt-1">
                    Submitted by <strong className="text-[#002147]">{active.studentName}</strong>
                    {active.customStudentId && <span className="text-gray-400"> · #{active.customStudentId}</span>}
                  </p>
                  <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-bold border ${
                    active.type === 'image' ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : active.type === 'quiz' ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}>
                    {active.type === 'image' ? <ImageIcon className="w-3 h-3" />
                      : active.type === 'quiz' ? <CheckSquare className="w-3 h-3" />
                      : <FileText className="w-3 h-3" />}
                    {active.type === 'image' ? 'Image Submission' : active.type === 'quiz' ? 'Quiz' : 'Text Submission'}
                    {active.aiGraded && <span className="ml-1 text-[10px] font-black uppercase">· AI Graded</span>}
                  </div>
                </div>

                {scorePercent !== null && (
                  <div className="flex items-center gap-3 shrink-0">
                    <div className={`px-5 py-2 rounded-2xl font-black text-xl border-2 ${
                      scorePercent >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      : scorePercent >= 60 ? 'text-amber-700 bg-amber-50 border-amber-200'
                      : 'text-red-700 bg-red-50 border-red-200'
                    }`}>
                      {active.grade}
                    </div>
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{
                        background: `conic-gradient(${scorePercent >= 80 ? '#10b981' : scorePercent >= 60 ? '#f59e0b' : '#dc143c'} ${scorePercent}%, #f1f5f9 0)`,
                      }}
                    >
                      <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center">
                        <span className="text-xs font-black text-gray-700">{scorePercent}%</span>
                      </div>
                    </div>
                  </div>
                )}
                </div>

              {/* ── Integrity Warnings ── */}
              {(integrityLoading || integrityResult) && (
                <div className="space-y-3">
                  {integrityLoading && (
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3 animate-pulse">
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />
                      <div>
                        <p className="text-blue-800 font-black text-sm">Scanning for integrity issues…</p>
                        <p className="text-blue-500 text-xs font-medium">AI is checking for copies and AI-generated content</p>
                      </div>
                    </div>
                  )}

                  {!integrityLoading && integrityResult && integrityResult.duplicateOf.length > 0 && (
                    <div className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-4 flex items-start gap-3">
                      <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center shrink-0 border border-orange-200">
                        <Copy className="w-5 h-5 text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-orange-900 font-black text-sm uppercase tracking-wide">⚠ Similarity / Copy Alert</p>
                        <p className="text-orange-700 font-medium text-sm mt-0.5">
                          This submission appears to match the work submitted by:{' '}
                          <span className="font-black">{integrityResult.duplicateOf.join(', ')}</span>
                        </p>
                        {/* Per-student similarity badges */}
                        {integrityResult.similarPairs && integrityResult.similarPairs.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {integrityResult.similarPairs.map((p, i) => (
                              <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black border ${
                                p.similarity >= 90 ? 'bg-red-100 text-red-700 border-red-300'
                                : p.similarity >= 75 ? 'bg-orange-100 text-orange-700 border-orange-300'
                                : 'bg-yellow-100 text-yellow-700 border-yellow-300'
                              }`}>
                                <Copy className="w-3 h-3" />
                                {p.name} — {p.similarity}% similar
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-orange-500 text-xs font-semibold mt-2">
                          Review both submissions carefully before approving grades.
                        </p>
                      </div>
                    </div>
                  )}

                  {!integrityLoading && integrityResult && integrityResult.isAiGenerated && (
                    <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 flex items-start gap-3">
                      <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center shrink-0 border border-red-200">
                        <Bot className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-red-900 font-black text-sm uppercase tracking-wide">🤖 AI Generated Content Detected</p>
                          <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                            {integrityResult.aiConfidence}% confidence
                          </span>
                        </div>
                        <p className="text-red-700 font-medium text-sm mt-0.5">{integrityResult.aiReason}</p>
                        <p className="text-red-400 text-xs font-semibold mt-1">
                          This image may not be the student's genuine handwritten work.
                        </p>
                      </div>
                    </div>
                  )}

                  {!integrityLoading && integrityResult && !integrityResult.isAiGenerated && integrityResult.duplicateOf.length === 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center gap-3">
                      <BadgeCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                      <p className="text-emerald-800 font-bold text-sm">Integrity check passed — no issues detected</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Submitted Images Gallery ── */}
              {activeImages.length > 0 && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
                  <h3 className="font-black text-[#002147] text-base flex items-center gap-2 mb-4">
                    <ImageIcon className="w-5 h-5 text-purple-500" />
                    Student's Submitted Work
                    <span className="ml-1 text-xs font-bold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                      {activeImages.length} page{activeImages.length > 1 ? 's' : ''}
                    </span>
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {activeImages.map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => setLightboxIdx(idx)}
                        className="group relative aspect-[3/4] rounded-2xl overflow-hidden border-2 border-gray-100 hover:border-purple-400 hover:shadow-lg transition-all bg-gray-50"
                      >
                        <img
                          src={url}
                          alt={`Page ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                          <span className="text-white text-xs font-bold">Click to enlarge</span>
                        </div>
                        <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm rounded-lg px-2 py-0.5 text-xs font-black text-gray-700">
                          Pg {idx + 1}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Text submission (when no image) */}
              {active.type === 'homework' && active.text && !active.imageUrl && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
                  <h3 className="font-black text-[#002147] text-base flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-blue-500" />
                    Student's Answer
                  </h3>
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">{active.text}</p>
                  </div>
                </div>
              )}

              {/* AI Evaluation Report */}
              {active.aiResult && (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
                  <h3 className="font-black text-[#002147] text-base flex items-center gap-2 mb-4">
                    <BrainCircuit className="w-5 h-5 text-blue-600" />
                    AI Diagnostic Report
                  </h3>
                  <AiEvaluationView scanResult={active.aiResult} />
                </div>
              )}

              {!active.aiResult && !active.imageUrl && !active.text && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-800 text-sm">No AI evaluation available</p>
                    <p className="text-amber-700 text-xs mt-1">This submission has no attached work or AI grading. Use the manual score below.</p>
                  </div>
                </div>
              )}

              {/* Teacher Action Panel */}
              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 space-y-6">
                <h3 className="font-black text-[#002147] text-lg flex items-center gap-2">
                  <Edit3 className="w-5 h-5" /> Teacher Review
                </h3>

                {/* Override Score */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    {active.aiGraded ? 'Override AI Score' : 'Assign Score'}
                    {active.aiGraded && (
                      <span className="font-normal text-gray-400">(optional — AI gave {active.grade})</span>
                    )}
                  </label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <input
                      type="number"
                      min="0"
                      max={overrideMax !== '' ? Number(overrideMax) : (active.maxScore || 100)}
                      value={overrideScore}
                      onChange={e => setOverrideScore(e.target.value)}
                      placeholder={active.aiGraded ? `AI: ${active.score}` : 'Score'}
                      className="w-28 border border-gray-200 rounded-xl px-4 py-2.5 text-[#002147] font-bold focus:outline-none focus:ring-2 focus:ring-[#002147]/20 focus:border-[#002147] text-center text-xl"
                    />
                    <span className="text-gray-400 font-bold text-lg">/</span>
                    {active.maxScore > 0 ? (
                      <span className="text-gray-600 font-black text-xl">{active.maxScore}</span>
                    ) : (
                      <input
                        type="number"
                        min="1"
                        value={overrideMax}
                        onChange={e => setOverrideMax(e.target.value)}
                        placeholder="Out of"
                        className="w-28 border-2 border-amber-300 rounded-xl px-4 py-2.5 text-[#002147] font-bold focus:outline-none focus:ring-2 focus:ring-amber-300 text-center text-xl bg-amber-50"
                      />
                    )}
                    {overrideScore !== '' && (
                      <button
                        onClick={() => { setOverrideScore(''); setOverrideMax(''); }}
                        className="text-xs text-gray-400 hover:text-red-500 font-bold transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {active.maxScore === 0 && (
                    <p className="text-xs text-amber-600 font-medium">
                      📝 Enter the score and total marks for this homework (e.g. 8 / 10)
                    </p>
                  )}
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
                    placeholder="Add encouragement, corrections, or specific feedback for this student…"
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
                  Once approved, this grade is recorded in the student's permanent record and class heatmap.
                </p>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
