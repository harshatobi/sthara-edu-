'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import {
  Upload, CheckCircle, ArrowLeft, Loader2, FileText,
  Clock, AlertTriangle, Image as ImageIcon, X, Sparkles
} from 'lucide-react';
import Link from 'next/link';
import AiEvaluationView from '@/components/AiEvaluationView';

export default function StudentHomeworkDetailPage() {
  const params = useParams();
  const homeworkId = params?.id as string;
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [assignment, setAssignment] = useState<any | null>(null);
  const [submission, setSubmission] = useState<any | null>(null);
  const [fetching, setFetching] = useState(true);
  const [submissionText, setSubmissionText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'student')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!homeworkId || !profile?.uid) return;

    const fetchData = async () => {
      setFetching(true);
      try {
        const { data: assignData } = await supabase
          .from('assignments')
          .select('*')
          .eq('id', homeworkId)
          .single();

        setAssignment(assignData);

        const { data: subData } = await supabase
          .from('submissions')
          .select('*')
          .eq('assignment_id', homeworkId)
          .eq('student_id', profile.uid)
          .maybeSingle();

        setSubmission(subData);
      } catch (err: any) {
        console.error('[homework-detail] fetch error:', err);
      } finally {
        setFetching(false);
      }
    };

    fetchData();
  }, [homeworkId, profile?.uid]);

  const handleSubmit = async () => {
    if (!profile?.uid || !assignment || isSubmitting) return;
    setIsSubmitting(true);

    try {
      let imageUrl = '';
      if (imageFile) {
        const path = `${profile.uid}/${Date.now()}_${imageFile.name}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('submissions')
          .upload(path, imageFile);

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage.from('submissions').getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }

      // Grade submission via AI
      const token = await getAuthToken();
      const gradeRes = await fetch('/api/grade-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          imageUrl,
          submissionText,
          assignmentTitle: assignment.title,
          assignmentSubject: assignment.subject,
          assignmentDescription: assignment.description,
        }),
      });

      const gradeJson = await gradeRes.json();

      const { data: subObj, error: subErr } = await supabase
        .from('submissions')
        .insert({
          assignment_id: homeworkId,
          student_id: profile.uid,
          school_id: profile.schoolId || 'global',
          student_name: profile.name || 'Student',
          score: gradeJson.totalScore || 0,
          max_score: gradeJson.maxTotalScore || 10,
          grade: gradeJson.grade || '0/10',
          ai_result: gradeJson.success ? gradeJson : null,
          ai_graded: true,
          submission_text: submissionText,
          image_url: imageUrl,
          teacher_approved: false,
        })
        .select('*')
        .single();

      if (subErr) throw subErr;
      setSubmission(subObj);
    } catch (err: any) {
      alert('Submission failed: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || fetching || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Assignment Details...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center space-x-4">
        <Link href="/student" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-[#002147]">{assignment?.title || 'Homework Task'}</h1>
          <p className="text-gray-500 text-sm mt-1">Subject: {assignment?.subject || 'General'}</p>
        </div>
      </div>

      {submission ? (
        <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
          <div className="flex items-center space-x-3 text-emerald-700 bg-emerald-50 p-4 rounded-2xl border border-emerald-200">
            <CheckCircle className="w-6 h-6 flex-shrink-0" />
            <div>
              <div className="font-bold text-sm">Submission Evaluated</div>
              <div className="text-xs">Your score: {submission.grade}</div>
            </div>
          </div>

          {submission.ai_result ? (
            <AiEvaluationView aiResult={submission.ai_result} />
          ) : (
            <div className="p-4 bg-gray-50 rounded-2xl text-sm">{submission.submission_text}</div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[#002147]">Task Description</h2>
            <p className="text-sm text-gray-700">{assignment?.description || 'No detailed instructions provided.'}</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Typed Submission</label>
              <textarea
                rows={5}
                value={submissionText}
                onChange={e => setSubmissionText(e.target.value)}
                placeholder="Write or paste your answer here..."
                className="w-full p-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Upload Photo of Handwritten Work</label>
              <input
                type="file"
                accept="image/*"
                onChange={e => setImageFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={isSubmitting || (!submissionText.trim() && !imageFile)}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-md flex items-center justify-center space-x-2"
            >
              <Sparkles className="w-5 h-5" />
              <span>{isSubmitting ? 'Evaluating Submission with AI...' : 'Submit for AI Evaluation'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
