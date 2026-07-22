'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, Calendar, TrendingUp, CheckCircle2, LogOut, Loader2, Target, Award, ChevronRight, X } from 'lucide-react';

import AiEvaluationView from '@/components/AiEvaluationView';
import MasteryModal from './MasteryModal';
import PendingTasksModal from './PendingTasksModal';
import RecentScoresModal from './RecentScoresModal';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Assignment {
  id: string;
  title: string;
  topic?: string;
  type: string;
  dueDate: string;
  description: string;
  subject: string;
  teacherName: string;
  questions?: any[];
  tasks?: any[];
  units?: string[];
  totalMarks?: number;
  assignedStudentIds?: string[];
  submission?: any;
}

export default function StudentDashboard() {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Assignment | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<any>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);

  const [showMasteryModal, setShowMasteryModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showScoresModal, setShowScoresModal] = useState(false);

  // Teacher Resources
  const [resources, setResources] = useState<any[]>([]);
  const [selectedResource, setSelectedResource] = useState<any | null>(null);
  const [resourceQuizAnswers, setResourceQuizAnswers] = useState<number[]>([]);
  const [isSubmittingResourceQuiz, setIsSubmittingResourceQuiz] = useState(false);
  const [resourceQuizResult, setResourceQuizResult] = useState<{score: number; total: number} | null>(null);

  const compressImageForApi = (file: File): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => resolve({
          base64: (reader.result as string).split(',')[1],
          mimeType: file.type,
        });
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }

      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width, height } = img;
        const MAX_DIM = 1600;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width >= height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Canvas compression failed')); return; }
            const reader = new FileReader();
            reader.onloadend = () => resolve({
              base64: (reader.result as string).split(',')[1],
              mimeType: 'image/jpeg',
            });
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          'image/jpeg',
          0.8
        );
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    setAttachmentFiles(prev => [...prev, ...newFiles].slice(0, 6));
    e.target.value = '';
  };

  const removeAttachmentFile = (idx: number) => {
    setAttachmentFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.schoolId || !selectedTask) return;
    setIsSubmitting(true);
    setSubmitStatus('');
    
    try {
      let submissionData: any = {
        studentId: profile.uid,
        studentName: profile.name,
        studentClass: profile.studentClass || null,
        branch: profile.branch || null,
        year: profile.year || null,
        semester: profile.semester || null,
        customStudentId: profile.customStudentId || null,
        submittedAt: new Date().toISOString(),
      };

      const assignmentTotalMarks = selectedTask.totalMarks
        || (selectedTask.tasks?.reduce((sum: number, t: any) => sum + (t.marks || 0), 0))
        || (selectedTask.questions?.length ? selectedTask.questions.length : 10);

      if (selectedTask.questions && selectedTask.questions.length > 0) {
        let score = 0;
        selectedTask.questions.forEach((q: any, qIdx: number) => {
          const selectedVal = selectedAnswers[q.id || String(qIdx)];
          if (q.correctAnswerIndex !== undefined) {
            if (Number(selectedVal) === q.correctAnswerIndex) score++;
          } else {
            if (selectedVal === q.correctOptionId) score++;
          }
        });
        submissionData = {
          ...submissionData,
          type: 'quiz',
          answers: selectedAnswers,
          score,
          maxScore: selectedTask.questions.length,
          total: selectedTask.questions.length,
        };
      } else {
        submissionData = {
          ...submissionData,
          type: 'homework',
          text: submissionText,
        };
      }

      // Upload files to Supabase Storage bucket 'submissions'
      if (attachmentFiles.length > 0) {
        setSubmitStatus(`Uploading ${attachmentFiles.length} page(s) to secure storage...`);
        try {
          const uploadResults = await Promise.all(
            attachmentFiles.map(async (file, idx) => {
              const ext = file.name.split('.').pop() || 'jpg';
              const path = `${profile.uid}/${selectedTask.id}/${Date.now()}_page${idx + 1}.${ext}`;
              const { error: uploadErr } = await supabase.storage
                .from('submissions')
                .upload(path, file, { contentType: file.type, upsert: true });

              if (uploadErr) throw uploadErr;
              const { data: publicUrlData } = supabase.storage
                .from('submissions')
                .getPublicUrl(path);
              return publicUrlData.publicUrl;
            })
          );
          submissionData.imageUrls = uploadResults;
          submissionData.imageUrl = uploadResults[0];
        } catch (storageErr: any) {
          console.error('Storage upload failed:', storageErr);
          alert('Warning: Could not upload images (' + (storageErr?.message || 'storage error') + '). Your text submission will still be saved.');
        }
      }

      // AI Grade for homework
      const isHomework = !(selectedTask.questions && selectedTask.questions.length > 0);
      if (isHomework && (submissionData.imageUrl || submissionText.trim())) {
        setSubmitStatus('🤖 AI Examiner is grading your work...');
        try {
          const authToken = await getAuthToken();
          const gradePayload: any = {
            assignmentTitle: selectedTask.title,
            assignmentDescription: selectedTask.description,
            assignmentSubject: selectedTask.subject,
            assignmentTasks: selectedTask.tasks || [],
            assignmentQuestions: selectedTask.questions || [],
            assignmentUnits: selectedTask.units || [],
            totalMarks: assignmentTotalMarks,
          };

          if (submissionData.imageUrl) {
            setSubmitStatus('🤖 Compressing & scanning your handwritten work...');
            const compressed = await compressImageForApi(attachmentFiles[0]);
            gradePayload.imageBase64 = compressed.base64;
            gradePayload.mimeType = compressed.mimeType;
          } else {
            gradePayload.submissionText = submissionText.trim();
          }

          const response = await fetch('/api/grade-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify(gradePayload),
          });

          if (response.ok) {
            const aiData = await response.json();
            if (!aiData.success && aiData.error) throw new Error(aiData.error);
            submissionData.aiGraded = true;
            submissionData.aiResult = aiData;
            submissionData.score = aiData.totalScore ?? 0;
            submissionData.maxScore = aiData.maxTotalScore ?? assignmentTotalMarks;
            submissionData.total = aiData.maxTotalScore ?? assignmentTotalMarks;
            submissionData.grade = aiData.grade || `${aiData.totalScore}/${aiData.maxTotalScore}`;
          } else {
            throw new Error(`AI grading returned error code ${response.status}. Please try again.`);
          }
        } catch (apiErr: any) {
          console.error('Auto-grade failed:', apiErr);
          setIsSubmitting(false);
          setSubmitStatus('');
          alert(`AI Grading failed: ${apiErr.message}. Please try submitting again.`);
          return;
        }
      }

      // Save submission into Supabase submissions table
      setSubmitStatus('Saving submission...');
      const { error: insertErr } = await supabase
        .from('submissions')
        .insert({
          assignment_id: selectedTask.id,
          student_id: profile.uid,
          school_id: profile.schoolId,
          score: submissionData.score ?? null,
          max_score: submissionData.maxScore ?? null,
          grade: submissionData.grade || null,
          ai_graded: !!submissionData.aiGraded,
          ai_result: submissionData.aiResult || null,
          image_urls: submissionData.imageUrls || [],
          submission_text: submissionText || null,
          answers: selectedAnswers || null,
          type: submissionData.type || 'homework',
        });

      if (insertErr) throw insertErr;

      setAssignments(prev => prev.map(a =>
        a.id === selectedTask.id
          ? { ...a, submission: { ...submissionData, submittedAt: new Date().toISOString() } }
          : a
      ));

      setAttachmentFiles([]);
      setSubmissionText('');
      setSubmitStatus('');

      if (selectedTask.questions && selectedTask.questions.length > 0) {
        const qs = selectedTask.questions;
        const isNewFormat = qs[0]?.correctAnswerIndex !== undefined;
        setQuizResult({
          score: submissionData.score ?? 0,
          total: submissionData.maxScore || submissionData.total || qs.length,
          aiResult: submissionData.aiResult,
          attachmentUrl: submissionData.imageUrl || null,
          isHomework: false,
          questions: qs,
          answers: selectedAnswers,
          isNewFormat,
        });
      } else {
        setQuizResult({
          score: submissionData.score ?? null,
          total: submissionData.maxScore ?? null,
          aiResult: submissionData.aiResult,
          attachmentUrl: submissionData.imageUrl || null,
          isHomework: true,
          aiGraded: !!submissionData.aiGraded,
          imageUrls: submissionData.imageUrls || [],
          grade: submissionData.grade || null,
        });
      }

    } catch (err: any) {
      console.error('Submission failed:', err);
      alert('Submission failed: ' + (err?.message || 'Unknown error. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'student')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId || !profile?.uid) return;
    const schoolId = profile.schoolId;
    const uid = profile.uid;

    const fetchAssignments = async () => {
      try {
        // Query assignments table from Supabase
        const { data: assignRows, error: assignErr } = await supabase
          .from('assignments')
          .select('*')
          .eq('school_id', schoolId);

        if (assignErr) throw assignErr;

        // Fetch submissions by this student
        const { data: subRows, error: subErr } = await supabase
          .from('submissions')
          .select('*')
          .eq('student_id', uid);

        if (subErr) console.warn('[student dashboard] Submissions fetch error:', subErr);

        const subMap = new Map((subRows || []).map(s => [s.assignment_id, s]));

        const studentCustomId = profile.customStudentId || '';

        const tasks: Assignment[] = (assignRows || [])
          .filter((a) => {
            const assignedIds: string[] = a.assigned_student_ids || [];
            if (assignedIds.length === 0) return true; // general assignment for class
            return (
              (studentCustomId && assignedIds.includes(studentCustomId)) ||
              assignedIds.includes(uid)
            );
          })
          .map((a) => {
            const sub = subMap.get(a.id);
            return {
              id: a.id,
              title: a.title,
              type: a.type,
              dueDate: a.due_date || '',
              description: a.description || '',
              subject: a.subject || 'General',
              teacherName: 'Teacher',
              questions: a.questions || [],
              tasks: a.tasks || [],
              units: a.units || [],
              totalMarks: a.total_marks || undefined,
              assignedStudentIds: a.assigned_student_ids || [],
              submission: sub ? {
                id: sub.id,
                score: sub.score,
                maxScore: sub.max_score,
                grade: sub.grade,
                finalGrade: sub.final_grade,
                aiGraded: sub.ai_graded,
                aiResult: sub.ai_result,
                teacherApproved: sub.teacher_approved,
                imageUrls: sub.image_urls,
                submissionText: sub.submission_text,
                submittedAt: sub.submitted_at,
              } : undefined,
            };
          });

        tasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        setAssignments(tasks);
      } catch (error) {
        console.error('Error fetching assignments:', error);
      } font-medium {
        setLoadingTasks(false);
      }
    };

    fetchAssignments();
  }, [profile?.schoolId, profile?.studentClass, profile?.branch, profile?.uid, profile?.institutionType]);

  // Fetch materials
  useEffect(() => {
    if (!profile?.schoolId || !profile?.uid) return;
    const fetchResources = async () => {
      try {
        const { data: matRows, error } = await supabase
          .from('materials')
          .select('*')
          .eq('school_id', profile.schoolId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        setResources((matRows || []).map(m => ({
          id: m.id,
          title: m.title,
          content: m.content?.body || m.content || '',
          teacherName: 'Teacher',
          isRead: false,
        })));
      } catch (e) {
        console.error('Failed to fetch materials:', e);
      }
    };
    fetchResources();
  }, [profile?.schoolId, profile?.uid]);

  const handleOpenResource = (resource: any) => {
    setSelectedResource(resource);
    setResourceQuizAnswers([]);
    setResourceQuizResult(null);
  };

  const handleSubmitResourceQuiz = async () => {
    if (!selectedResource) return;
    setIsSubmittingResourceQuiz(true);
    setTimeout(() => {
      setResourceQuizResult({ score: 100, total: 100 });
      setIsSubmittingResourceQuiz(false);
    }, 500);
  };

  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading Student Portal...</div>;

  const pendingTasks = assignments.filter((a: any) => !a.submission || a.submission.teacherApproved === false);
  const submittedTasks = assignments.filter((a: any) => !!a.submission && a.submission.teacherApproved !== false);
  const pendingTasksCount = pendingTasks.length;
  const gradedSubmissions = assignments.filter((a: any) => a.submission && a.submission.score !== undefined && a.submission.teacherApproved === true);
  
  let masteryText = 'N/A';
  let recentScoreText = '-';
  let recentTopicText = 'No Recent';

  if (gradedSubmissions.length > 0) {
    let totalScore = 0;
    let totalMax = 0;
    gradedSubmissions.forEach(a => {
      if (a.submission.finalGrade && typeof a.submission.finalGrade === 'string' && a.submission.finalGrade.includes('/')) {
        const [s, m] = a.submission.finalGrade.split('/');
        totalScore += parseFloat(s) || 0;
        totalMax += parseFloat(m) || 100;
      } else {
        totalScore += a.submission.score || 0;
        totalMax += a.submission.maxScore || a.submission.total || 100;
      }
    });
    masteryText = Math.round((totalScore / Math.max(totalMax, 1)) * 100) + '%';
    
    const recent = [...gradedSubmissions].sort((a, b) => new Date(b.submission.submittedAt || 0).getTime() - new Date(a.submission.submittedAt || 0).getTime())[0];
    
    let recentScoreNum = recent.submission.score || 0;
    let recentMaxNum = recent.submission.maxScore || recent.submission.total || 100;

    const percent = Math.round((recentScoreNum / Math.max(recentMaxNum, 1)) * 100);
    let grade = 'F';
    if (percent >= 90) grade = 'A';
    else if (percent >= 80) grade = 'B';
    else if (percent >= 70) grade = 'C';
    else if (percent >= 60) grade = 'D';
    recentScoreText = grade;
    recentTopicText = recent.title || recent.topic || 'Assignment';
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-7xl mx-auto pb-16">
      
      {/* Premium Hero Header */}
      <div className="relative bg-gradient-to-br from-[#002147] via-[#003366] to-[#001a33] rounded-[2rem] p-10 overflow-hidden shadow-2xl border border-white/10">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-orange-500/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center space-x-3 mb-3">
              <span className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-4 py-1.5 rounded-full text-xs font-bold font-mono shadow-sm tracking-wide">
                {profile.customStudentId || 'ID Pending'}
              </span>
              <span className="text-blue-200 font-medium text-sm bg-[#001a33]/50 px-3 py-1 rounded-full border border-white/5">
                {profile.institutionType === 'college'
                  ? `${profile.branch || 'Branch N/A'} · ${profile.year || ''} · ${profile.semester || ''}`
                  : `Class: ${profile.studentClass || 'Unassigned'}`
                }
              </span>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-2">
              Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-300 to-orange-500">{(profile.name || 'Student').split(' ')[0]}</span>!
            </h2>
            <p className="text-blue-100 text-lg max-w-xl font-medium opacity-90">
              {profile.institutionType === 'college'
                ? 'Your academic dashboard. Stay on top of your coursework and assignments.'
                : 'Ready to crush today\'s goals? Your personalized learning path awaits.'}
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 px-6 py-4 rounded-2xl shadow-xl flex items-center justify-between sm:justify-start space-x-4">
              <span className="text-sm font-bold text-white uppercase tracking-wider">Energy</span>
              <div className="flex space-x-3 bg-black/20 p-1.5 rounded-full border border-white/5">
                <button className="text-2xl hover:scale-125 transition-transform opacity-60 hover:opacity-100 grayscale hover:grayscale-0">😴</button>
                <button className="text-2xl hover:scale-125 transition-transform opacity-60 hover:opacity-100 grayscale hover:grayscale-0">😐</button>
                <button className="text-2xl hover:scale-110 transition-transform ring-2 ring-orange-500 rounded-full bg-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.5)]">🚀</button>
              </div>
            </div>
            
            <button 
              onClick={signOut}
              className="flex items-center justify-center space-x-2 bg-white/5 border border-white/10 px-5 py-4 rounded-2xl shadow-sm hover:bg-white/10 text-white transition-all font-bold group"
            >
              <LogOut className="w-5 h-5 text-red-400 group-hover:text-red-300" />
              <span className="group-hover:text-red-100 whitespace-nowrap">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all hover:-translate-y-1 cursor-pointer"
          onClick={() => setShowMasteryModal(true)}
        >
          <div className="flex justify-between items-start mb-4">
            <div className="bg-blue-50 p-3 rounded-2xl text-blue-600">
              <TrendingUp className="w-6 h-6" />
            </div>
            {masteryText !== 'N/A' && (
              <span className="bg-green-50 text-green-600 text-xs font-bold px-2.5 py-1 rounded-full border border-green-100">
                Active Learner
              </span>
            )}
          </div>
          <h3 className="text-gray-500 font-bold text-sm uppercase tracking-wider mb-1">Overall Mastery</h3>
          <p className="text-4xl font-extrabold text-[#002147]">{masteryText}</p>
        </div>

        <div 
          className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all hover:-translate-y-1 cursor-pointer"
          onClick={() => {
            const hwSection = document.getElementById('homework');
            if (hwSection) hwSection.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <div className="flex justify-between items-start mb-4">
            <div className="bg-orange-50 p-3 rounded-2xl text-orange-600">
              <Target className="w-6 h-6" />
            </div>
            {pendingTasksCount > 0 && (
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
              </span>
            )}
          </div>
          <h3 className="text-gray-500 font-bold text-sm uppercase tracking-wider mb-1">Pending Tasks</h3>
          <p className="text-4xl font-extrabold text-[#002147]">{pendingTasksCount}</p>
          <p className="text-sm font-medium text-gray-400 mt-2">Active assignments</p>
        </div>

        <div 
          className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all hover:-translate-y-1 cursor-pointer"
          onClick={() => setShowScoresModal(true)}
        >
          <div className="flex justify-between items-start mb-4">
            <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600">
              <Award className="w-6 h-6" />
            </div>
            <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full border border-gray-200 truncate max-w-[120px]">
              {recentTopicText}
            </span>
          </div>
          <h3 className="text-gray-500 font-bold text-sm uppercase tracking-wider mb-1">Recent Score</h3>
          <p className="text-4xl font-extrabold text-emerald-600">{recentScoreText}</p>
        </div>
      </div>

      {/* Teacher Resources Section */}
      {resources.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center space-x-3 mb-2">
            <div className="bg-indigo-50 p-2.5 rounded-xl">
              <Bell className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#002147]">From Your Teacher</h3>
              <p className="text-sm text-gray-500">Click a resource to read it</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {resources.map((resource: any) => (
              <button
                key={resource.id}
                onClick={() => handleOpenResource(resource)}
                className="text-left p-4 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-md group bg-white border-gray-200 hover:border-indigo-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm truncate">{resource.title}</p>
                    <p className="text-xs text-gray-500 line-clamp-1">Tap to view material</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Resource Modal */}
      {selectedResource && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-4" onClick={() => setSelectedResource(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 rounded-t-2xl flex items-start justify-between">
              <div>
                <h2 className="text-white font-bold text-lg leading-snug">{selectedResource.title}</h2>
              </div>
              <button onClick={() => setSelectedResource(null)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 shrink-0 ml-3">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="prose prose-sm max-w-none text-gray-800 bg-gray-50 rounded-xl p-4 border border-gray-200 max-h-64 overflow-y-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedResource.content || ''}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="bg-white border border-gray-100 rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-100">
          <div className="flex items-center space-x-4">
            <div className="bg-red-50 p-3 rounded-2xl">
              <Bell className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-[#002147] tracking-tight">Notifications & Tasks</h3>
              <p className="text-gray-500 font-medium mt-1">Stay on top of your learning schedule</p>
            </div>
          </div>
          <div className="hidden sm:block">
            <span className="bg-amber-100 text-amber-700 font-bold px-4 py-2 rounded-xl text-sm">
              {pendingTasksCount} Pending
            </span>
          </div>
        </div>
        
        <div className="space-y-5">
          {loadingTasks ? (
            <div className="flex flex-col justify-center items-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
              <span className="text-gray-500 font-medium">Syncing with Diagnostic Engine...</span>
            </div>
          ) : pendingTasksCount === 0 && submittedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-gradient-to-b from-gray-50 to-white rounded-2xl border border-dashed border-gray-200">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <h4 className="text-xl font-bold text-[#002147] mb-2">You're all caught up!</h4>
              <p className="text-gray-500 font-medium text-center max-w-sm">
                No tasks assigned yet. Enjoy your free time!
              </p>
            </div>
          ) : (
            <>
              {pendingTasks.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-black text-amber-600 uppercase tracking-widest px-1">⏳ Pending Submission</p>
                  {pendingTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      title={`${task.subject || 'Assignment'}: ${task.title}`}
                      time={`Due: ${task.dueDate || 'No Set Date'} • Posted by ${task.teacherName || 'Teacher'}`}
                      type={task.type as 'homework' | 'video' | 'announcement'}
                      status="pending"
                      onClick={() => { setSelectedTask(task); setQuizResult(null); }}
                    />
                  ))}
                </div>
              )}

              {submittedTasks.length > 0 && (
                <div className="space-y-3 mt-4">
                  <p className="text-xs font-black text-emerald-600 uppercase tracking-widest px-1">✅ Submitted</p>
                  {submittedTasks.map((task) => {
                    const sub = task.submission;
                    const aiGrade = sub?.grade || (sub?.score != null && sub?.maxScore ? `${sub.score}/${sub.maxScore}` : null);
                    return (
                      <Link key={task.id} href="/student/homework" className="block">
                        <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-100 rounded-2xl hover:border-emerald-300 hover:shadow-sm transition-all group cursor-pointer">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[#002147] text-sm truncate">{task.subject || 'Assignment'}: {task.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">Submitted • Posted by {task.teacherName || 'Teacher'}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {aiGrade && (
                              <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                                🤖 {aiGrade}
                              </span>
                            )}
                            <span className="text-xs font-bold text-emerald-700 bg-white border border-emerald-200 px-3 py-1.5 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                              View →
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Submit Task Modal */}
      {selectedTask && (
        <div className="fixed inset-0 bg-[#002147]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-[#002147]/10 bg-[#f8fafc]">
              <div>
                <h3 className="text-xl font-bold text-[#002147]">Submit Task</h3>
                <p className="text-sm text-[#002147]/60 mt-1">{selectedTask.title}</p>
              </div>
              <button onClick={() => { setSelectedTask(null); setQuizResult(null); setSelectedAnswers({}); }} className="text-[#002147]/40 hover:text-[#dc143c] transition-colors">
                ✕
              </button>
            </div>
            
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {quizResult ? (
                <div className="text-center py-8 flex flex-col items-center">
                  <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-[#002147] mb-2">Submitted Successfully!</h3>
                  <p className="text-[#002147]/60 mb-4">Your work has been saved to your account.</p>

                  <button 
                    onClick={() => { setSelectedTask(null); setQuizResult(null); setSelectedAnswers({}); }}
                    className="w-full max-w-md bg-[#002147] text-white py-3 rounded-xl font-semibold hover:bg-[#002147]/90 transition-colors"
                  >
                    Back to Dashboard
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitTask} className="space-y-6">
                  {selectedTask.questions && selectedTask.questions.length > 0 ? (
                    <div className="space-y-6">
                      {selectedTask.questions.map((q: any, i: number) => {
                        const qKey = q.id || String(i);
                        const questionText = q.question || q.text || 'Question';
                        return (
                          <div key={qKey} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                            <div className="flex items-start gap-3 mb-4">
                              <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">{i+1}</div>
                              <p className="font-bold text-[#002147] text-base leading-relaxed">{questionText}</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 ml-11">
                              {q.options.map((opt: any, optIdx: number) => {
                                const optText = typeof opt === 'string' ? opt : (opt.text || String(opt));
                                const optKey = String(optIdx);
                                const isSelected = selectedAnswers[qKey] === optKey;
                                return (
                                  <button
                                    key={optKey}
                                    type="button"
                                    onClick={() => setSelectedAnswers(prev => ({ ...prev, [qKey]: optKey }))}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all ${
                                      isSelected
                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                                        : 'bg-gray-50 border-gray-200 text-[#002147] hover:border-indigo-300 hover:bg-indigo-50'
                                    }`}
                                  >
                                    <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center font-black text-xs shrink-0 ${
                                      isSelected ? 'border-white bg-white text-indigo-600' : 'border-gray-300 text-gray-500'
                                    }`}>{String.fromCharCode(65+optIdx)}</span>
                                    {optText}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-[#002147]/70 mb-1">Your Submission (Link or Text)</label>
                      <textarea 
                        required 
                        rows={4}
                        value={submissionText}
                        onChange={e => setSubmissionText(e.target.value)}
                        className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20" 
                      />
                      
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <label className="block text-sm font-medium text-[#002147]/70">Attach Homework Pages (Images)</label>
                          <span className="text-xs text-[#002147]/40">{attachmentFiles.length}/6 pages</span>
                        </div>

                        <div className="flex flex-wrap gap-3 mb-2">
                          {attachmentFiles.map((file, idx) => (
                            <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-[#002147]/10 bg-white shadow-sm group">
                              <img
                                src={URL.createObjectURL(file)}
                                alt={`Page ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => removeAttachmentFile(idx)}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-black"
                              >
                                ×
                              </button>
                            </div>
                          ))}

                          {attachmentFiles.length < 6 && (
                            <label className="w-20 h-20 rounded-xl border-2 border-dashed border-[#002147]/20 flex flex-col items-center justify-center cursor-pointer hover:border-[#dc143c]/50 hover:bg-red-50/30 transition-all bg-white">
                              <span className="text-2xl text-[#002147]/30 leading-none">+</span>
                              <span className="text-[9px] text-[#002147]/40 mt-1 font-medium">Add Page</span>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="sr-only"
                                onChange={handleFileChange}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full bg-[#dc143c] text-white py-3 rounded-xl font-semibold hover:bg-[#dc143c]/90 transition-colors disabled:opacity-50 mt-4 shadow-lg flex flex-col items-center justify-center"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center space-x-2"><Loader2 className="w-5 h-5 animate-spin" /><span>Processing...</span></span>
                    ) : 'Turn In Task'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {showMasteryModal && (
        <MasteryModal profile={profile} onClose={() => setShowMasteryModal(false)} />
      )}

      {showPendingModal && (
        <PendingTasksModal assignments={pendingTasks} onClose={() => setShowPendingModal(false)} />
      )}

      {showScoresModal && (
        <RecentScoresModal onClose={() => setShowScoresModal(false)} />
      )}
    </div>
  );
}

function TaskItem({ title, time, type, status, onClick }: { title: string, time: string, type: 'homework' | 'video' | 'announcement', status?: string, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick} 
      className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-hidden"
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
        status === 'completed' ? 'bg-emerald-400' : 'bg-orange-400'
      }`} />

      <div className="flex-1 ml-2">
        <div className="font-bold text-[#002147] text-lg group-hover:text-blue-600 transition-colors flex items-center flex-wrap gap-2 mb-1">
          {title}
        </div>
        <div className="text-sm font-medium text-gray-500 flex items-center space-x-1.5">
          <Calendar className="w-3.5 h-3.5 text-gray-400" />
          <span>{time}</span>
        </div>
      </div>
      
      <div className="mt-4 sm:mt-0 ml-2 sm:ml-6 shrink-0">
        <button className="text-sm font-bold px-6 py-2.5 rounded-xl bg-orange-500 text-white shadow-orange-500/20 group-hover:bg-orange-600 transition-all shadow-sm">
          Start Task
        </button>
      </div>
    </div>
  );
}
