'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { db, storage } from '@/lib/firebase/config';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, arrayUnion, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import {
  Upload, CheckCircle, ArrowLeft, Loader2, FileText,
  Camera, BookOpen, Clock, ChevronLeft, AlertTriangle,
  Image as ImageIcon, X, Sparkles, Eye, Maximize2, ShieldAlert, MessageSquare
} from 'lucide-react';
import Link from 'next/link';
import AiEvaluationView from '@/components/AiEvaluationView';

const LOADING_STAGES = [
  { label: 'Uploading image…', pct: 15 },
  { label: 'Reading handwriting…', pct: 40 },
  { label: 'Analysing each step…', pct: 65 },
  { label: 'Calculating score…', pct: 85 },
  { label: 'Finalising report…', pct: 95 },
];

/* ── Clean LaTeX notation into plain readable math ── */
function cleanMath(text: string): string {
  if (!text) return text;
  return text
    // Remove inline LaTeX delimiters  \( ... \)  and  \[ ... \]
    .replace(/\\\\/g, '\n')
    .replace(/\\\(|\\\)/g, '')
    .replace(/\\\[|\\\]/g, '')
    // Remove \text{} wrapper
    .replace(/\\text\{([^}]*)\}/g, '$1')
    // Fractions: \frac{a}{b} → (a/b)
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1⁄$2)')
    // Square roots: \sqrt{x} → √x
    .replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
    .replace(/\\sqrt/g, '√')
    // Superscripts
    .replace(/\^\{2\}|\^2/g, '²')
    .replace(/\^\{3\}|\^3/g, '³')
    .replace(/\^\{4\}|\^4/g, '⁴')
    .replace(/\^\{([^}]+)\}/g, '^$1')
    // Math symbols
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\cdot/g, '·')
    .replace(/\\pm/g, '±')
    .replace(/\\geq/g, '≥')
    .replace(/\\leq/g, '≤')
    .replace(/\\neq/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')
    .replace(/\\pi/g, 'π')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\theta/g, 'θ')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\delta/g, 'δ')
    // Clean up leftover backslashes before letters (e.g. \x → x)
    .replace(/\\([a-zA-Z])/g, '$1')
    .trim();
}

export default function HomeworkAssignment() {
  const params = useParams();
  const id = params.id as string;
  const { profile } = useAuth();
  const router = useRouter();

  const [assignment, setAssignment] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Upload / grading state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  // Results
  const [aiResult, setAiResult] = useState<any>(null);
  const [teacherNote, setTeacherNote] = useState<string | null>(null);
  const [teacherApproved, setTeacherApproved] = useState(false);

  // ── Proctoring State ─────────────────────────────────────
  const [violations, setViolations] = useState(0);
  const [violationLog, setViolationLog] = useState<{type: string; ts: number}[]>([]);
  const [showFullscreenPrompt, setShowFullscreenPrompt] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const proctoringActive = useRef(false);

  const logViolation = useCallback(async (type: string) => {
    if (!proctoringActive.current) return;
    const entry = { type, ts: Date.now() };
    setViolations(v => v + 1);
    setViolationLog(prev => [...prev, entry]);

    // Write to Firestore
    if (profile?.schoolId && profile?.uid) {
      try {
        await updateDoc(
          doc(db, 'schools', profile.schoolId, 'assignments', id, 'submissions', profile.uid),
          {
            proctoringViolations: arrayUnion({ ...entry }),
            violationCount: violations + 1,
          }
        );
      } catch {
        // Submission doc might not exist yet — create a proctoring-only doc
        try {
          await setDoc(
            doc(db, 'schools', profile.schoolId, 'assignments', id, 'proctoring', profile.uid),
            { violations: arrayUnion({ ...entry }), studentId: profile.uid, studentName: profile.name },
            { merge: true }
          );
        } catch {/* ignore */}
      }
    }
  }, [profile, id, violations]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ── Comprehensive Proctoring ──────────────────────────────
  useEffect(() => {
    if (aiResult) { proctoringActive.current = false; return; }
    if (!assignment) return;
    proctoringActive.current = true;

    // Prompt fullscreen for quizzes
    if (assignment.type === 'quiz' && !document.fullscreenElement) {
      setShowFullscreenPrompt(true);
    }

    const onBlur = () => logViolation('window_blur');
    const onVisibility = () => { if (document.hidden) logViolation('tab_switch'); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'a')) {
        logViolation('copy_paste_attempt');
      }
    };
    const onCtxMenu = (e: MouseEvent) => { if (proctoringActive.current) { e.preventDefault(); logViolation('right_click'); } };
    const onFSChange = () => {
      const isFS = !!document.fullscreenElement;
      setIsFullscreen(isFS);
      if (!isFS && assignment.type === 'quiz') logViolation('fullscreen_exit');
    };

    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('keydown', onKey);
    document.addEventListener('contextmenu', onCtxMenu);
    document.addEventListener('fullscreenchange', onFSChange);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('contextmenu', onCtxMenu);
      document.removeEventListener('fullscreenchange', onFSChange);
    };
  }, [aiResult, assignment, logViolation]);

  // Fetch assignment + real-time submission listener
  useEffect(() => {
    if (!profile?.schoolId || !profile?.uid) return;
    const schoolId = profile.schoolId;
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      try {
        // Fetch the assignment details (one-time)
        const d = await getDoc(doc(db, 'schools', schoolId, 'assignments', id));
        if (d.exists()) {
          const data = d.data();
          setAssignment({ id: d.id, topic: data.title || data.topic, ...data });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }

      // ── Real-time listener on the student's submission doc ──
      // Fires immediately with current data AND whenever teacher updates it
      unsubscribe = onSnapshot(
        doc(db, 'schools', schoolId, 'assignments', id, 'submissions', profile.uid),
        (snap) => {
          if (!snap.exists()) return;
          const sub = snap.data();

          // Always sync teacher note (shows as soon as teacher saves)
          setTeacherNote(sub.teacherNote || null);
          setTeacherApproved(!!sub.teacherApproved);

          // Show graded result card
          if (sub.aiResult) {
            setAiResult(sub.aiResult);
          } else if (sub.teacherApproved || sub.score !== undefined) {
            setAiResult((prev: any) => prev || { summary: sub.teacherNote || 'Your submission has been graded.' });
          }

          // Always sync the grade displayed
          const gradeStr = sub.grade ||
            (sub.score !== undefined && sub.maxScore !== undefined ? `${sub.score}/${sub.maxScore}` : null);
          if (gradeStr) {
            setAssignment((prev: any) => prev ? { ...prev, status: 'completed', grade: gradeStr } : prev);
          }
        },
        (err) => console.error('[submission listener]', err)
      );
    };

    init();
    return () => { if (unsubscribe) unsubscribe(); };
  }, [id, profile?.schoolId, profile?.uid]);

  // Animated progress bar during grading
  const progressRef = useRef<any>(null);
  const animateToStage = (idx: number) => {
    setStageIdx(idx);
    const target = LOADING_STAGES[idx].pct;
    let current = LOADING_STAGES[idx - 1]?.pct || 0;
    clearInterval(progressRef.current);
    progressRef.current = setInterval(() => {
      current += 1;
      setProgress(current);
      if (current >= target) clearInterval(progressRef.current);
    }, 30);
  };

  const handleSubmit = async () => {
    if (!file || !assignment || !profile) return;
    if (file.size > 8 * 1024 * 1024) { alert('File too large. Max 8MB.'); return; }

    setUploading(true);
    setProgress(0);
    setStageIdx(0);

    try {
      // Step 1: Upload image to Firebase Storage
      animateToStage(0);
      const storageRef = ref(storage, `submissions/${profile.uid}/${id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const imageUrl = await getDownloadURL(storageRef);

      // Step 2: Read file as base64 for Gemini Vision API
      const base64String = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      animateToStage(1);

      // Step 3: Call grading API with auth token
      const authToken = await getAuthToken();
      const res = await fetch('/api/grade-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          imageBase64: base64String,
          mimeType: file.type,
          assignmentTitle: assignment.topic || assignment.title,
          assignmentSubject: assignment.subject,
          assignmentDescription: assignment.description,
          assignmentQuestions: assignment.questions,
        })
      });

      animateToStage(2);
      const data = await res.json();

      if (!data.success) throw new Error(data.error || 'Grading failed');

      animateToStage(3);

      const gradeStr = data.grade || `${data.totalScore}/${data.maxTotalScore}`;

      // Step 4: Write to Firestore with Storage URL (not base64)
      try {
        await setDoc(
          doc(db, 'schools', profile.schoolId!, 'assignments', id, 'submissions', profile.uid),
          {
            studentId: profile.uid,
            studentName: profile.name || 'Student',
            studentClass: profile.studentClass || '',
            customStudentId: profile.customStudentId || null,
            submittedAt: serverTimestamp(),
            grade: gradeStr,
            totalScore: data.totalScore,
            maxTotalScore: data.maxTotalScore,
            imageUrl,          // ✅ Storage URL — not base64
            score: data.totalScore,
            maxScore: data.maxTotalScore,
            aiResult: {
              questions: data.questions,
              totalScore: data.totalScore,
              maxTotalScore: data.maxTotalScore,
              summary: data.summary,
              weaknessTags: data.weaknessTags || [],
              recommendedVideos: data.recommendedVideos || [],
            },
            status: 'ai_graded',
            teacherApproved: false,
          }
        );
      } catch (fsErr) {
        console.warn('Firestore submission write failed:', fsErr);
      }

      animateToStage(4);
      await new Promise(r => setTimeout(r, 600));
      setProgress(100);
      await new Promise(r => setTimeout(r, 400));

      setAiResult({
        questions: data.questions,
        totalScore: data.totalScore,
        maxTotalScore: data.maxTotalScore,
        summary: data.summary,
        weaknessTags: data.weaknessTags || [],
        recommendedVideos: data.recommendedVideos || [],
        imageUrl,
      });
      setAssignment((prev: any) => ({ ...prev, status: 'completed', grade: gradeStr }));

    } catch (err: any) {
      console.error(err);
      alert('Grading failed: ' + (err.message || 'Unknown error'));
    } finally {
      clearInterval(progressRef.current);
      setUploading(false);
    }
  };

  if (loading || !profile) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <div className="w-12 h-12 border-4 border-[#002147]/20 border-t-[#002147] rounded-full animate-spin" />
      <p className="text-[#002147]/60 font-bold tracking-widest uppercase text-sm">Loading Assignment…</p>
    </div>
  );

  if (!assignment) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <FileText className="w-16 h-16 text-gray-300" />
      <h2 className="text-2xl font-bold text-[#002147]">Assignment Not Found</h2>
      <Link href="/student/homework" className="text-blue-600 font-bold hover:underline">Return to Dashboard</Link>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-16">

      {/* ── Fullscreen Prompt Modal (quiz only) ── */}
      {showFullscreenPrompt && !isFullscreen && (
        <div className="fixed inset-0 z-[999] bg-[#002147]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5 border-2 border-red-100">
              <ShieldAlert className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-black text-[#002147] mb-2">Proctored Quiz</h2>
            <p className="text-gray-500 font-medium text-sm mb-6">
              This quiz is proctored. Tab switching, copy-paste, right-clicking, and exiting fullscreen will be logged and reported to your teacher.
            </p>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  try {
                    await document.documentElement.requestFullscreen();
                    setIsFullscreen(true);
                  } catch {}
                  setShowFullscreenPrompt(false);
                }}
                className="w-full bg-[#002147] text-white py-3.5 rounded-2xl font-black text-base hover:bg-blue-800 transition-colors flex items-center justify-center gap-2"
              >
                <Maximize2 className="w-5 h-5" /> Enter Fullscreen &amp; Start
              </button>
              <button
                onClick={() => setShowFullscreenPrompt(false)}
                className="w-full text-gray-400 text-sm font-semibold py-2 hover:text-gray-600 transition-colors"
              >
                Continue without fullscreen (violations will still be logged)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Nav + Proctor Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <Link href="/student/homework" className="inline-flex items-center space-x-2 text-[#002147]/60 hover:text-[#002147] font-bold bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md max-w-fit">
          <ChevronLeft className="w-5 h-5" />
          <span>Back to Assignments</span>
        </Link>
        {!aiResult && violations > 0 && (
          <div className="flex items-center space-x-3 bg-red-50 border border-red-200 px-5 py-3 rounded-xl shadow-sm animate-in slide-in-from-top-4">
            <div className="bg-red-100 p-2 rounded-lg text-red-600">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <p className="text-red-800 font-black text-sm uppercase tracking-wider">⚠ Proctor Alert — {violations} violation{violations > 1 ? 's' : ''} logged</p>
              <p className="text-red-600 font-medium text-xs">
                {violationLog.slice(-1)[0]?.type?.replace(/_/g, ' ')} detected. This is recorded.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* LEFT: Assignment Info */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-sm border border-gray-100">
            <div className="flex items-center space-x-3 mb-6">
              <span className="inline-flex items-center space-x-1.5 bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                <BookOpen className="w-3.5 h-3.5" />
                <span>{assignment.subject}</span>
              </span>
              {!aiResult && assignment.dueDate && (
                <span className="inline-flex items-center space-x-1.5 bg-red-50 text-red-600 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Due: {new Date(assignment.dueDate).toLocaleDateString()}</span>
                </span>
              )}
              {aiResult && (
                <span className="inline-flex items-center space-x-1.5 bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Graded — {assignment.grade}</span>
                </span>
              )}
            </div>

            <h1 className="text-4xl md:text-5xl font-black text-[#002147] leading-tight mb-8">{assignment.topic}</h1>

            {assignment.description && (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-6">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2">Assignment Instructions</p>
                <p className="text-[#002147]/80 font-medium leading-relaxed text-base whitespace-pre-line">{cleanMath(assignment.description)}</p>
              </div>
            )}

            {assignment.questions && assignment.questions.length > 0 && (
              <div className="space-y-4 relative">
                <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-gray-100" />
                {assignment.questions.map((q: string, idx: number) => (
                  <div key={idx} className="relative flex space-x-6 bg-gray-50/50 p-6 rounded-3xl border border-gray-100/50">
                    <div className="relative z-10 flex-shrink-0 w-10 h-10 rounded-full bg-[#002147] text-white font-black flex items-center justify-center shadow-md">{idx + 1}</div>
                    <div className="pt-2 text-[#002147]/80 text-lg font-medium leading-relaxed">{cleanMath(q)}</div>
                  </div>
                ))}
              </div>
            )}

            {(!assignment.questions || assignment.questions.length === 0) && !assignment.description && (
              <p className="text-[#002147]/50 font-medium italic text-center py-4">No specific questions — submit your handwritten work below.</p>
            )}
          </div>

          {/* AI Result Breakdown (shown in left panel on desktop after grading) */}
          {aiResult && (
            <div className="animate-in slide-in-from-bottom-8 duration-700">
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gray-200" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> AI Evaluation Report
                </span>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gray-200" />
              </div>
              <AiEvaluationView scanResult={aiResult} />
            </div>
          )}
        </div>

        {/* RIGHT: Upload / Submission Panel (sticky) */}
        <div className="lg:col-span-5">
          <div className="sticky top-8 space-y-4">
            {!aiResult ? (
              <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
                <div className="mb-6">
                  <h3 className="text-2xl font-black text-[#002147] mb-2">Submit Your Work</h3>
                  <p className="text-[#002147]/60 font-medium leading-relaxed text-sm">
                    Write your answers on paper, snap a clear photo, and upload it. Our AI will grade it instantly.
                  </p>
                </div>

                {/* Upload Zone */}
                <div
                  className={`relative border-2 border-dashed rounded-[2rem] overflow-hidden transition-all ${
                    isDragOver ? 'border-blue-500 bg-blue-50 scale-[1.01]'
                    : file ? 'border-emerald-400 bg-emerald-50'
                    : 'border-gray-200 hover:border-[#002147]/30 hover:bg-gray-50'
                  }`}
                  onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={e => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={uploading}
                  />

                  {preview ? (
                    <div className="relative">
                      <img src={preview} alt="Preview" className="w-full max-h-72 object-cover rounded-[2rem]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-[2rem] flex flex-col justify-end p-5">
                        <div className="flex items-center gap-2 text-white">
                          <Eye className="w-4 h-4" />
                          <span className="text-sm font-bold truncate">{file?.name}</span>
                        </div>
                        <p className="text-white/60 text-xs mt-1">Click to change photo</p>
                      </div>
                      <button
                        onClick={e => { e.preventDefault(); e.stopPropagation(); setFile(null); }}
                        className="absolute top-3 right-3 z-20 bg-white/90 backdrop-blur-sm rounded-full p-1.5 shadow-md hover:bg-red-50 transition-colors"
                      >
                        <X className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  ) : (
                    <div className="p-12 flex flex-col items-center space-y-4">
                      <div className="bg-[#002147]/5 p-5 rounded-full text-[#002147]">
                        <Camera className="w-10 h-10" />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-[#002147] text-lg">Click to browse</p>
                        <p className="text-[#002147]/50 font-medium text-sm mt-1">or drag and drop your photo here</p>
                      </div>
                      <div className="flex items-center space-x-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>JPG, PNG • Max 4MB</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Loading Stages */}
                {uploading && (
                  <div className="mt-6 space-y-3 animate-in fade-in duration-300">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-bold text-[#002147]">{LOADING_STAGES[stageIdx]?.label}</span>
                      <span className="text-xs font-bold text-[#002147]/50">{progress}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#002147] to-blue-500 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between">
                      {LOADING_STAGES.map((s, i) => (
                        <div key={i} className={`w-2 h-2 rounded-full transition-all duration-300 ${i <= stageIdx ? 'bg-[#002147]' : 'bg-gray-200'}`} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={uploading || !file}
                  className={`w-full mt-6 py-4 rounded-2xl font-black text-lg transition-all flex justify-center items-center space-x-3 shadow-lg ${
                    !file
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                      : uploading
                        ? 'bg-[#002147]/80 text-white cursor-wait'
                        : 'bg-[#002147] text-white hover:bg-blue-700 hover:shadow-blue-500/25 hover:-translate-y-1'
                  }`}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span>AI is Working…</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6" />
                      <span>Submit for Grading</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* Graded summary card (sticky right panel) */
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-[2.5rem] p-8 border border-emerald-100 shadow-lg relative overflow-hidden animate-in zoom-in-95 duration-500">
                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                  <CheckCircle className="w-48 h-48 text-emerald-900" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="bg-emerald-500 text-white p-3 rounded-2xl shadow-md">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-emerald-900 font-black text-xl">
                        {teacherApproved ? 'Teacher Reviewed!' : 'Graded!'}
                      </h3>
                      <p className="text-emerald-700/80 font-bold text-sm">
                        {teacherApproved ? 'AI + Teacher Evaluation' : 'AI Evaluation Complete'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-emerald-100 mb-6">
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-2">Final Score</p>
                    <div className="text-7xl font-black text-emerald-600 tracking-tighter">{assignment.grade}</div>
                    {aiResult?.maxTotalScore > 0 && (
                      <p className="text-sm text-gray-400 mt-1">
                        {Math.round((aiResult.totalScore / aiResult.maxTotalScore) * 100)}% accuracy
                      </p>
                    )}
                  </div>

                  {/* ── Teacher Personal Note ── */}
                  {teacherNote && (
                    <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 mb-4 animate-in slide-in-from-bottom-4 duration-500">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="bg-amber-100 p-2 rounded-xl">
                          <MessageSquare className="w-4 h-4 text-amber-700" />
                        </div>
                        <p className="font-black text-amber-900 text-sm uppercase tracking-wider">Note from your Teacher</p>
                      </div>
                      <p className="text-amber-800 font-medium leading-relaxed text-sm whitespace-pre-line">
                        {teacherNote}
                      </p>
                    </div>
                  )}

                  <div className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 border border-emerald-200/50 text-sm text-emerald-800 leading-relaxed font-medium">
                    <p className="font-black text-emerald-900 mb-2 text-xs uppercase tracking-wider">AI Summary</p>
                    {aiResult?.summary}
                  </div>

                  <p className="text-center text-emerald-600/60 text-xs font-bold mt-4">
                    ↓ Scroll down to see the full breakdown
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
