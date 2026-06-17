'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, AlertTriangle, CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !assignment || !profile) return;

    setUploading(true);

    try {
      // In a real app, upload image to Storage, then send URL to Gemini Vision.
      // For this demo without Storage properly hooked to Vision securely, we'll convert to Base64 
      // and send it directly to our API route. (Limit file size in UI).
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
            studentId: profile.id,
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

  if (loading) return <div className="p-10 text-center animate-pulse">Loading assignment...</div>;
  if (!assignment) return <div className="p-10 text-center">Assignment not found.</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <Link href="/student/homework" className="text-[#002147]/60 hover:text-[#002147] flex items-center space-x-2 font-medium">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Assignments</span>
        </Link>
        {assignment.status !== 'completed' && violations > 0 && (
          <div className="flex items-center space-x-2 text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-200">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-bold">Proctor Warning: Tab Switched ({violations} times)</span>
          </div>
        )}
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#002147]/10">
        <div className="mb-8 border-b border-[#002147]/10 pb-6">
          <h1 className="text-3xl font-black text-[#002147]">{assignment.topic}</h1>
          <p className="text-[#002147]/60 font-semibold uppercase tracking-wider text-sm mt-2">{assignment.subject}</p>
        </div>

        <div className="space-y-6 mb-8">
          <h2 className="text-lg font-bold text-[#002147]">Questions</h2>
          <div className="space-y-4">
            {assignment.questions.map((q: string, idx: number) => (
              <div key={idx} className="flex space-x-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#002147]/5 text-[#002147] font-bold flex items-center justify-center">
                  {idx + 1}
                </div>
                <div className="pt-1 text-[#002147]/80 text-lg leading-relaxed">
                  {q}
                </div>
              </div>
            ))}
          </div>
        </div>

        {assignment.status === 'completed' ? (
          <div className="bg-green-50 border border-green-200 p-6 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-green-900 flex items-center space-x-2">
                <CheckCircle className="w-6 h-6" />
                <span>Graded Successfully</span>
              </h2>
              <div className="text-3xl font-black text-green-700">{assignment.grade}</div>
            </div>
            <div className="pt-4 border-t border-green-200 text-green-800 leading-relaxed">
              <p className="font-bold mb-2">AI Feedback:</p>
              {assignment.feedback}
            </div>
          </div>
        ) : (
          <div className="bg-[#f8fafc] border border-[#002147]/10 p-6 rounded-xl">
            <h3 className="font-bold text-[#002147] mb-2">Submit Your Work</h3>
            <p className="text-sm text-[#002147]/60 mb-4">Write your answers on a piece of paper, take a clear photo, and upload it here. The AI will instantly grade your work.</p>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="file"
                  accept="image/*"
                  required
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-[#002147]/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#002147]/10 file:text-[#002147] hover:file:bg-[#002147]/20 cursor-pointer"
                />
              </div>
              <button
                type="submit"
                disabled={uploading || !file}
                className="w-full bg-[#002147] text-white py-3 rounded-xl font-bold hover:bg-[#002147]/90 transition-colors disabled:opacity-50 flex justify-center items-center space-x-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>AI is Grading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    <span>Submit for Grading</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
