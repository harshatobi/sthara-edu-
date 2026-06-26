'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, AlertTriangle, CheckCircle, ArrowLeft, Loader2, FileText, Camera, BookOpen, Clock, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function HomeworkAssignment() {
  const params = useParams();
  const id = params.id as string;
  const { profile } = useAuth();
  const router = useRouter();

  const [assignment, setAssignment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [violations, setViolations] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  // Proctoring: Track window focus
  useEffect(() => {
    if (assignment?.status === 'completed') return;

    const handleBlur = () => {
      setViolations(v => v + 1);
    };

    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [assignment]);

  useEffect(() => {
    const fetchAssignment = async () => {
      try {
        const d = await getDoc(doc(db, 'homework_assignments', id));
        if (d.exists()) {
          setAssignment({ id: d.id, ...d.data() });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAssignment();
  }, [id]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!file || !assignment || !profile) return;

    setUploading(true);

    try {
      if (file.size > 4 * 1024 * 1024) {
        alert("File too large. Please upload an image under 4MB.");
        setUploading(false);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        
        const res = await fetch('/api/homework/grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assignmentId: id,
            studentId: profile.uid,
            imageBase64: base64String,
            mimeType: file.type,
            questions: assignment.questions
          })
        });

        const data = await res.json();
        if (data.success) {
          // Re-fetch assignment
          const d = await getDoc(doc(db, 'homework_assignments', id));
          if (d.exists()) setAssignment({ id: d.id, ...d.data() });
        } else {
          alert('Grading failed: ' + data.error);
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);

    } catch (err) {
      console.error(err);
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  if (loading || !profile) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <div className="w-12 h-12 border-4 border-[#002147]/20 border-t-[#002147] rounded-full animate-spin"></div>
      <p className="text-[#002147]/60 font-bold tracking-widest uppercase text-sm">Loading Assignment...</p>
    </div>
  );

  if (!assignment) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <FileText className="w-16 h-16 text-gray-300" />
      <h2 className="text-2xl font-bold text-[#002147]">Assignment Not Found</h2>
      <Link href="/student/homework" className="text-blue-600 font-bold hover:underline">Return to Dashboard</Link>
    </div>
  );

  const isCompleted = assignment.status === 'completed';

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-12">
      {/* Top Navigation & Proctoring Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <Link href="/student/homework" className="inline-flex items-center space-x-2 text-[#002147]/60 hover:text-[#002147] font-bold bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md max-w-fit">
          <ChevronLeft className="w-5 h-5" />
          <span>Back to Assignments</span>
        </Link>
        
        {!isCompleted && violations > 0 && (
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
        
        {/* LEFT PANEL: Assignment Details */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
            {/* Header Info */}
            <div className="flex items-center space-x-3 mb-6">
              <span className="inline-flex items-center space-x-1.5 bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                <BookOpen className="w-3.5 h-3.5" />
                <span>{assignment.subject}</span>
              </span>
              {!isCompleted && assignment.dueDate && (
                <span className="inline-flex items-center space-x-1.5 bg-red-50 text-red-600 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Due: {new Date(assignment.dueDate).toLocaleDateString()}</span>
                </span>
              )}
            </div>
            
            <h1 className="text-4xl md:text-5xl font-black text-[#002147] leading-tight mb-8">
              {assignment.topic}
            </h1>

            {/* Questions List */}
            <div className="space-y-6 relative">
              <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-gray-100"></div>
              {assignment.questions && assignment.questions.map((q: string, idx: number) => (
                <div key={idx} className="relative flex space-x-6 bg-gray-50/50 p-6 rounded-3xl border border-gray-100/50 transition-colors hover:bg-gray-50">
                  <div className="relative z-10 flex-shrink-0 w-10 h-10 rounded-full bg-[#002147] text-white font-black flex items-center justify-center shadow-md">
                    {idx + 1}
                  </div>
                  <div className="pt-2 text-[#002147]/80 text-lg font-medium leading-relaxed">
                    {q}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Submission / Feedback (Sticky) */}
        <div className="lg:col-span-5">
          <div className="sticky top-8 space-y-6">
            
            {isCompleted ? (
              // COMPLETED / GRADED STATE
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-[2.5rem] p-8 border border-emerald-100 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                  <CheckCircle className="w-48 h-48 text-emerald-900" />
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-center space-x-3 mb-8">
                    <div className="bg-emerald-500 text-white p-3 rounded-2xl shadow-md">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-emerald-900 font-black text-xl">Graded Successfully</h3>
                      <p className="text-emerald-700/80 font-bold text-sm">AI Evaluation Complete</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-emerald-100 mb-8">
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-2">Final Score</p>
                    <div className="text-7xl font-black text-emerald-600 tracking-tighter">
                      {assignment.grade}
                    </div>
                  </div>

                  <div className="bg-white/60 backdrop-blur-sm rounded-3xl p-6 border border-emerald-200/50">
                    <p className="font-black text-emerald-900 mb-3 flex items-center space-x-2">
                      <FileText className="w-4 h-4" />
                      <span>AI Feedback Notes</span>
                    </p>
                    <p className="text-emerald-800 leading-relaxed font-medium">
                      {assignment.feedback}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              // PENDING / SUBMISSION STATE
              <div className="bg-white rounded-[2.5rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-gray-100">
                <div className="mb-6">
                  <h3 className="text-2xl font-black text-[#002147] mb-2">Submit Your Work</h3>
                  <p className="text-[#002147]/60 font-medium leading-relaxed">
                    Write your answers on paper, snap a clear photo, and upload it here. Our AI will grade it instantly.
                  </p>
                </div>

                {/* Drag and Drop Zone */}
                <div 
                  className={`relative border-2 border-dashed rounded-[2rem] p-10 text-center transition-all ${
                    isDragOver 
                      ? 'border-blue-500 bg-blue-50 scale-[1.02]' 
                      : file 
                        ? 'border-emerald-500 bg-emerald-50' 
                        : 'border-gray-300 hover:border-[#002147]/30 hover:bg-gray-50'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    id="file-upload"
                  />
                  
                  {file ? (
                    <div className="flex flex-col items-center space-y-3">
                      <div className="bg-emerald-100 p-4 rounded-full text-emerald-600 mb-2">
                        <CheckCircle className="w-8 h-8" />
                      </div>
                      <p className="font-bold text-emerald-800 truncate max-w-[200px]">{file.name}</p>
                      <p className="text-emerald-600/70 text-xs font-bold uppercase">Ready to submit</p>
                      <p className="text-xs text-gray-400 mt-4 underline decoration-dashed z-20 relative pointer-events-none">Click to change file</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center space-y-4">
                      <div className="bg-[#002147]/5 p-5 rounded-full text-[#002147] mb-2 group-hover:bg-[#002147]/10 transition-colors">
                        <Camera className="w-10 h-10" />
                      </div>
                      <div>
                        <p className="font-bold text-[#002147] text-lg">Click to browse</p>
                        <p className="text-[#002147]/50 font-medium text-sm mt-1">or drag and drop your photo here</p>
                      </div>
                      <div className="flex items-center space-x-2 text-xs font-bold text-gray-400 uppercase tracking-wider mt-4">
                        <span>JPG, PNG</span>
                        <span>•</span>
                        <span>Max 4MB</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  onClick={() => handleSubmit()}
                  disabled={uploading || !file}
                  className={`w-full mt-6 py-4 rounded-2xl font-black text-lg transition-all flex justify-center items-center space-x-3 shadow-lg ${
                    !file 
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' 
                      : uploading
                        ? 'bg-[#002147]/80 text-white cursor-wait'
                        : 'bg-[#002147] text-white hover:bg-blue-600 hover:shadow-blue-500/25 hover:-translate-y-1'
                  }`}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span>AI is Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6" />
                      <span>Submit for Grading</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
