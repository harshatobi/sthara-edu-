'use client';

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  Upload, CheckCircle, ArrowLeft, Loader2, FileText,
  Camera, BookOpen, Clock, ChevronLeft, AlertTriangle,
  Image as ImageIcon, X, Sparkles, Eye
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
  const [violations, setViolations] = useState(0);

  // Generate preview when file changes
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Proctoring
  useEffect(() => {
    if (aiResult) return;
    const handler = () => setViolations(v => v + 1);
    window.addEventListener('blur', handler);
    return () => window.removeEventListener('blur', handler);
  }, [aiResult]);

  // Fetch assignment
  useEffect(() => {
    if (!profile?.schoolId) return;
    const schoolId = profile.schoolId;
    const fetchAssignment = async () => {
      try {
        const d = await getDoc(doc(db, 'schools', schoolId, 'assignments', id));
        if (d.exists()) {
          const data = d.data();
          setAssignment({ id: d.id, topic: data.title || data.topic, ...data });

          // Check for existing submission
          const subDoc = await getDoc(doc(db, 'schools', schoolId, 'assignments', id, 'submissions', profile.uid));
          if (subDoc.exists()) {
            const sub = subDoc.data();
            if (sub.aiResult) {
              setAiResult(sub.aiResult);
              setAssignment((prev: any) => ({ ...prev, status: 'completed', grade: sub.grade }));
            }
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAssignment();
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
    if (file.size > 4 * 1024 * 1024) { alert('File too large. Max 4MB.'); return; }

    setUploading(true);
    setProgress(0);
    setStageIdx(0);

    try {
      // Read file as base64
      animateToStage(0);
      const base64String = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      animateToStage(1);

      const res = await fetch('/api/grade-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      // Write to submissions subcollection — this is what the teacher queue reads
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
        console.warn('Firestore submission write failed (non-critical):', fsErr);
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

      {/* Nav + Proctor Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <Link href="/student/homework" className="inline-flex items-center space-x-2 text-[#002147]/60 hover:text-[#002147] font-bold bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md max-w-fit">
          <ChevronLeft className="w-5 h-5" />
          <span>Back to Assignments</span>
        </Link>
        {!aiResult && violations > 0 && (
          <div className="flex items-center space-x-3 bg-red-50 border border-red-200 px-5 py-3 rounded-xl shadow-sm animate-in slide-in-from-top-4">
            <div className="bg-red-100 p-2 rounded-lg text-red-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-red-800 font-black text-sm uppercase tracking-wider">Proctor Warning</p>
              <p className="text-red-600 font-medium text-xs">Tab switched {violations} times during session.</p>
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
                <p className="text-[#002147]/80 font-medium leading-relaxed text-base whitespace-pre-line">{assignment.description}</p>
              </div>
            )}

            {assignment.questions && assignment.questions.length > 0 && (
              <div className="space-y-4 relative">
                <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-gray-100" />
                {assignment.questions.map((q: string, idx: number) => (
                  <div key={idx} className="relative flex space-x-6 bg-gray-50/50 p-6 rounded-3xl border border-gray-100/50">
                    <div className="relative z-10 flex-shrink-0 w-10 h-10 rounded-full bg-[#002147] text-white font-black flex items-center justify-center shadow-md">{idx + 1}</div>
                    <div className="pt-2 text-[#002147]/80 text-lg font-medium leading-relaxed">{q}</div>
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
                      <h3 className="text-emerald-900 font-black text-xl">Graded!</h3>
                      <p className="text-emerald-700/80 font-bold text-sm">AI Evaluation Complete</p>
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
