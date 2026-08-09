'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, Calendar, TrendingUp, CheckCircle2, LogOut, Loader2, Target, Award, ChevronRight, X } from 'lucide-react';

import AiEvaluationView from '@/components/AiEvaluationView';
import MasteryModal from './MasteryModal';
import PendingTasksModal from './PendingTasksModal';
import RecentScoresModal from './RecentScoresModal';
import StudentHeatmapSidebar from './StudentHeatmapSidebar';
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
  questionPaperUrl?: string | null;
  questionPaperType?: string | null;
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

  // ── Quiz Proctoring ─────────────────────────────────────────────────────
  const [showProctoringWarning, setShowProctoringWarning] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [pendingQuizTask, setPendingQuizTask] = useState<Assignment | null>(null);
  const isSubmittingRef = { current: false };

  const searchParams = useSearchParams();

  // Auto-open a specific task when ?task=ID is in the URL
  useEffect(() => {
    if (!searchParams) return;
    const taskId = searchParams.get('task');
    if (taskId && assignments.length > 0 && !selectedTask) {
      const found = assignments.find(a => a.id === taskId);
      if (found) setSelectedTask(found);
    }
  }, [searchParams, assignments]);

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

  // ── Quiz proctoring: tab-switch detection ──────────────────────────────────
  useEffect(() => {
    // Only activate when an MCQ quiz is open and student hasn't submitted yet
    const isMcqActive = quizStarted && selectedTask &&
      Array.isArray(selectedTask.questions) &&
      selectedTask.questions.length > 0 &&
      Array.isArray(selectedTask.questions[0]?.options) &&
      !selectedTask.submission;

    if (!isMcqActive) return;

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        const newCount = tabSwitchCount + 1;
        setTabSwitchCount(newCount);

        // Notify teacher via proctoring alert API
        try {
          await fetch('/api/student/proctor-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              schoolId: profile?.schoolId,
              studentId: profile?.uid,
              studentName: profile?.name,
              taskId: selectedTask.id,
              taskTitle: selectedTask.title,
              switchCount: newCount,
              timestamp: new Date().toISOString(),
            }),
          });
        } catch (e) { /* silent */ }

        if (newCount >= 3) {
          alert(
            '🚨 FINAL WARNING — You have switched tabs 3 times.\n\nYour quiz is being automatically submitted now. You cannot attempt it again.'
          );
          // Auto-submit the quiz
          const fakeEvent = { preventDefault: () => {} } as any;
          handleSubmitTask(fakeEvent);
        } else {
          alert(
            `⚠️ Tab Switch Detected (${newCount}/3)\n\nYour teacher has been notified. If you switch tabs ${3 - newCount} more time(s), your quiz will be automatically submitted.`
          );
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [quizStarted, selectedTask, tabSwitchCount, profile]);

  // ── Quiz proctoring: auto-submit on page unload ────────────────────────────
  useEffect(() => {
    const isMcqActive = quizStarted && selectedTask &&
      Array.isArray(selectedTask.questions) &&
      selectedTask.questions.length > 0 &&
      Array.isArray(selectedTask.questions[0]?.options) &&
      !selectedTask.submission;

    if (!isMcqActive) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Your quiz will be auto-submitted if you leave this page.';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [quizStarted, selectedTask]);

  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.schoolId || !selectedTask) return;

    // Block open-ended homework if no photo uploaded
    const hasOpenEnded = selectedTask.questions && selectedTask.questions.length > 0 &&
      !selectedTask.questions.every((q: any) => Array.isArray(q.options) && q.options.length > 0);
    const isPlainHomework = !selectedTask.questions || selectedTask.questions.length === 0;
    if ((hasOpenEnded || isPlainHomework) && attachmentFiles.length === 0) {
      alert('📸 Please upload a photo of your handwritten work before submitting.');
      return;
    }

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
        // Sum per-question marks if set (e.g. 1 question worth 5 marks → 5)
        || (selectedTask.questions?.reduce((sum: number, q: any) => sum + (q.marks || 0), 0) || 0) > 0
          ? selectedTask.questions?.reduce((sum: number, q: any) => sum + (q.marks || 0), 0)
          : (selectedTask.tasks?.reduce((sum: number, t: any) => sum + (t.marks || 0), 0) || 10);

      // Determine if this is a true MCQ quiz (has option arrays) or open-ended homework
      const isMcqQuiz = selectedTask.questions &&
        selectedTask.questions.length > 0 &&
        Array.isArray(selectedTask.questions[0]?.options) &&
        selectedTask.questions[0].options.length > 0;

      if (isMcqQuiz) {
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
        // Open-ended questions or plain homework — collect text answers
        const answersText = selectedTask.questions && selectedTask.questions.length > 0
          ? selectedTask.questions.map((q: any, i: number) => {
              const qKey = q.id || String(i);
              const qText = q.questionText || q.question || q.text || q.stem || `Q${i+1}`;
              return `${qText}\nAnswer: ${selectedAnswers[qKey] || '(no answer)'}\n`;
            }).join('\n')
          : submissionText;
        submissionData = {
          ...submissionData,
          type: 'homework',
          text: answersText || submissionText,
        };
      }

      // Upload files via server-side API (uses admin client to bypass Supabase Storage RLS)
      if (attachmentFiles.length > 0) {
        setSubmitStatus(`Uploading ${attachmentFiles.length} page(s) to secure storage...`);
        try {
          const authToken = await getAuthToken();
          const uploadResults = await Promise.all(
            attachmentFiles.map(async (file, idx) => {
              const formData = new FormData();
              formData.append('file', file);
              formData.append('studentId', profile.uid);
              formData.append('assignmentId', selectedTask.id);
              formData.append('pageIndex', String(idx));

              const res = await fetch('/api/student/upload-submission', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` },
                body: formData,
              });
              const data = await res.json();
              if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');
              return data.url as string;
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
      const isHomework = !isMcqQuiz;
      if (isHomework && (submissionData.imageUrl || submissionText.trim() || submissionData.text?.trim())) {
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
            // Pass the formatted Q&A text (open-ended) or plain submission text
            gradePayload.submissionText = (submissionData.text || submissionText).trim();
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

            // ─── Update True Mastery (memory_profile) ───────────────────────
            try {
              setSubmitStatus('📊 Updating your mastery profile...');
              const pct = aiData.percentageScore ?? Math.round((aiData.totalScore / (aiData.maxTotalScore || 1)) * 100);
              const subject = selectedTask.subject || '';

              // Fetch current memory_profile
              const { data: userRow } = await supabase
                .from('users')
                .select('memory_profile')
                .eq('id', profile.uid)
                .maybeSingle();

              const mem = (userRow?.memory_profile as any) || { known: [], struggling: [] };
              const knownSet = new Set<string>(mem.known || []);
              const strugglingSet = new Set<string>(mem.struggling || []);

              // If score ≥ 70% → subject is "known", remove from struggling
              if (subject && pct >= 70) {
                knownSet.add(subject);
                strugglingSet.delete(subject);
              }

              // Add AI-detected weakness tags → struggling (avoid duplicating known)
              if (Array.isArray(aiData.weaknessTags)) {
                aiData.weaknessTags.forEach((tag: string) => {
                  if (tag && !knownSet.has(tag)) strugglingSet.add(tag);
                });
              }

              await supabase
                .from('users')
                .update({
                  memory_profile: {
                    ...mem,
                    known: Array.from(knownSet),
                    struggling: Array.from(strugglingSet),
                    lastUpdated: new Date().toISOString(),
                  }
                })
                .eq('id', profile.uid);
            } catch (masteryErr) {
              console.warn('Mastery update failed (non-fatal):', masteryErr);
            }
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

      // Save submission — update if one already exists (e.g. retry after image upload failure), insert if new
      setSubmitStatus('Saving submission...');
      const existingSubId = selectedTask.submission?.id ?? null;
      let saveErr: any = null;

      if (existingSubId) {
        // Update the existing row (e.g. student is resubmitting with images)
        const { error } = await supabase
          .from('submissions')
          .update({
            score: submissionData.score ?? null,
            max_score: submissionData.maxScore ?? null,
            grade: submissionData.grade || null,
            ai_graded: !!submissionData.aiGraded,
            ai_result: submissionData.aiResult || null,
            image_urls: submissionData.imageUrls || [],
            submission_text: submissionText || null,
            answers: selectedAnswers || null,
          })
          .eq('id', existingSubId);
        saveErr = error;
      } else {
        // Insert a brand-new submission row
        const { error } = await supabase
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
        saveErr = error;
      }

      if (saveErr) throw saveErr;

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
        // ── Step 1: Find which teachers teach this student's class ────────────
        // Look at the 'users' table for teachers whose assignments[] include this class.
        // This prevents a student from seeing assignments from unrelated teachers.
        const studentClass = (profile.studentClass || '').toLowerCase().trim();

        const { data: teacherRows } = await supabase
          .from('users')
          .select('uid, assignments')
          .eq('school_id', schoolId)
          .eq('role', 'teacher');

        // Collect teacher UIDs who teach the student's class
        const relevantTeacherIds = new Set<string>();
        (teacherRows || []).forEach((t: any) => {
          const teacherAssignments: any[] = t.assignments || [];
          const teachesThisClass = teacherAssignments.some((a: any) => {
            const tc = (a.class || '').toLowerCase().trim();
            return !studentClass || !tc || tc.includes(studentClass) || studentClass.includes(tc);
          });
          if (teachesThisClass && t.uid) relevantTeacherIds.add(t.uid);
        });

        // ── Step 2: Fetch assignments only from those teachers ────────────────
        let assignQuery = supabase
          .from('assignments')
          .select('*')
          .eq('school_id', schoolId);

        // If we found relevant teachers, scope to them; otherwise fall back to school-wide
        if (relevantTeacherIds.size > 0) {
          assignQuery = assignQuery.in('teacher_id', [...relevantTeacherIds]);
        }

        const { data: assignRows, error: assignErr } = await assignQuery;
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
            // Class-level filter: if assignment specifies a class, it must match the student's class
            const aClass = (a.class || '').toLowerCase().trim();
            if (aClass && studentClass && !aClass.includes(studentClass) && !studentClass.includes(aClass)) {
              return false;
            }
            // Student-specific filter: if the assignment is assigned to specific students
            const assignedIds: string[] = a.assigned_student_ids || [];
            if (assignedIds.length === 0) return true; // general class assignment
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
              // ✅ Manually uploaded question paper (image or PDF)
              questionPaperUrl: a.question_paper_url || null,
              questionPaperType: a.question_paper_type || null,
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
      } finally {
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
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-7xl mx-auto pb-16 space-y-10">
      
      {/* Premium Hero Header */}
      <div className="relative bg-gradient-to-br from-[#002147] via-[#003366] to-[#001a33] rounded-[2.5rem] p-8 md:p-10 overflow-hidden shadow-2xl border border-white/10">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-indigo-500/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 mb-3">
              <span className="bg-white/15 backdrop-blur-md border border-white/20 text-white px-3.5 py-1 rounded-full text-xs font-bold font-mono shadow-sm tracking-wide">
                {(() => {
                  const raw = profile.customStudentId || '';
                  if (!raw) return 'ID Pending';
                  if (raw.length > 20) {
                    const parts = raw.split('-');
                    const lastPart = parts[parts.length - 1];
                    return `ID: ${lastPart.length <= 8 ? lastPart : raw.substring(0, 10)}`;
                  }
                  return `ID: ${raw}`;
                })()}
              </span>
              <span className="text-blue-100 font-semibold text-xs bg-white/10 backdrop-blur-md px-3.5 py-1 rounded-full border border-white/15">
                {profile.institutionType === 'college'
                  ? `${profile.branch || 'Branch N/A'} · ${profile.year || ''}`
                  : `Class: ${profile.studentClass || 'Unassigned'}`
                }
              </span>
              <span className="text-emerald-300 font-semibold text-xs bg-emerald-500/20 backdrop-blur-md px-3 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active Student
              </span>
            </div>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white mb-2 leading-tight">
              Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-400">{(profile.name || 'Student').split(' ')[0]}</span>!
            </h2>
            <p className="text-blue-100 text-sm md:text-base max-w-xl font-medium opacity-90 leading-relaxed">
              {profile.institutionType === 'college'
                ? 'Your academic dashboard. Stay on top of your coursework and assignments.'
                : 'Ready to crush today\'s goals? Your personalized learning path awaits.'}
            </p>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button 
              onClick={signOut}
              className="flex items-center justify-center space-x-2 bg-white/10 border border-white/20 px-5 py-3 rounded-2xl shadow-md hover:bg-red-500/20 hover:border-red-400/40 text-white transition-all font-bold text-sm group backdrop-blur-md"
            >
              <LogOut className="w-4 h-4 text-red-300 group-hover:text-red-200 transition-colors" />
              <span className="group-hover:text-red-100 whitespace-nowrap">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all hover:-translate-y-1 cursor-pointer"
          onClick={() => router.push('/student/mastery')}
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
                      onClick={() => {
                        // MCQ quizzes: show proctoring warning first
                        const isMcq = Array.isArray(task.questions) &&
                          task.questions.length > 0 &&
                          Array.isArray(task.questions[0]?.options);
                        if (isMcq && !task.submission) {
                          setPendingQuizTask(task);
                          setShowProctoringWarning(true);
                          setQuizResult(null);
                        } else {
                          setSelectedTask(task);
                          setQuizResult(null);
                          setQuizStarted(false);
                        }
                      }}
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
                      <button
                        key={task.id}
                        onClick={() => { setSelectedTask(task); setQuizResult(null); setSelectedAnswers({}); }}
                        className="w-full text-left block"
                      >
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
                      </button>
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
                <h3 className="text-xl font-bold text-[#002147]">
                  {selectedTask.submission ? '📋 View Submission' : '📝 Submit Task'}
                </h3>
                <p className="text-sm text-[#002147]/60 mt-1">{selectedTask.title}</p>
                {quizStarted && !selectedTask.submission && (
                  <span className="inline-flex items-center gap-1 mt-1 text-xs font-black text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                    🔴 PROCTORED · Tab switches: {tabSwitchCount}/3
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  if (quizStarted && !selectedTask.submission) {
                    const leave = window.confirm(
                      '⚠️ Warning: Leaving will auto-submit your quiz and you cannot attempt it again.\n\nAre you sure you want to exit?'
                    );
                    if (!leave) return;
                    // Auto-submit before closing
                    const fakeEvent = { preventDefault: () => {} } as any;
                    handleSubmitTask(fakeEvent);
                    return;
                  }
                  setSelectedTask(null);
                  setQuizResult(null);
                  setSelectedAnswers({});
                  setQuizStarted(false);
                  setTabSwitchCount(0);
                }}
                className="text-[#002147]/40 hover:text-[#dc143c] transition-colors"
              >
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
                  {/* ── Manually Uploaded Question Paper (teacher-uploaded image or PDF) ── */}
                  {selectedTask.questionPaperUrl && (
                    <div className="rounded-2xl overflow-hidden border-2 border-violet-200 bg-violet-50">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-100 border-b border-violet-200">
                        <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <span className="text-xs font-black text-violet-700 uppercase tracking-wider">Question Paper</span>
                        <span className="ml-auto text-[10px] font-medium text-violet-500">uploaded by teacher</span>
                      </div>
                      {selectedTask.questionPaperType === 'image' ? (
                        <img
                          src={selectedTask.questionPaperUrl}
                          alt="Question Paper"
                          className="w-full object-contain max-h-[60vh]"
                        />
                      ) : (
                        <a
                          href={selectedTask.questionPaperUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-4 hover:bg-violet-100 transition-colors"
                        >
                          <div className="w-10 h-10 bg-violet-200 rounded-xl flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-violet-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-bold text-violet-800 text-sm">Open Question Paper (PDF)</p>
                            <p className="text-xs text-violet-500">Tap to open in a new tab</p>
                          </div>
                          <svg className="w-4 h-4 text-violet-500 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Questions — displayed read-only for open-ended, interactive for MCQ */}

                  {selectedTask.questions && selectedTask.questions.length > 0 && (
                    <div className="space-y-4">
                      {selectedTask.questions.map((q: any, i: number) => {
                        const qKey = q.id || String(i);
                        const questionText = q.questionText || q.question || q.text || q.stem || q.title || `Question ${i + 1}`;
                        const hasOptions = Array.isArray(q.options) && q.options.length > 0;
                        return (
                          <div key={qKey} className="bg-[#f8fafc] border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-start gap-3 mb-3">
                              <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">{i+1}</div>
                              <div className="flex-1">
                                <p className="font-bold text-[#002147] text-base leading-relaxed">{questionText}</p>
                                {q.marks && (
                                  <span className="inline-block mt-1 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                                    {q.marks} mark{q.marks !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                            {hasOptions && (() => {
                              const isViewOnly = !!selectedTask.submission;
                              const submittedAnswers: Record<string, string> =
                                selectedTask.submission?.answers || {};
                              return (
                                // MCQ — render clickable A/B/C/D buttons (or read-only if submitted)
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-11">
                                  {q.options.map((opt: any, optIdx: number) => {
                                    const optText = typeof opt === 'string' ? opt : (opt.text || String(opt));
                                    const optKey = String(optIdx);
                                    const isSelected = isViewOnly
                                      ? submittedAnswers[qKey] === optKey
                                      : selectedAnswers[qKey] === optKey;
                                    const isCorrect = q.correctAnswerIndex !== undefined
                                      ? optIdx === q.correctAnswerIndex
                                      : optKey === q.correctOptionId;
                                    const wasSelectedWrong = isViewOnly && isSelected && !isCorrect;
                                    const isCorrectAnswer = isViewOnly && isCorrect;

                                    let btnClass = 'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all w-full ';
                                    let circleClass = 'w-6 h-6 rounded-full border-2 flex items-center justify-center font-black text-xs shrink-0 ';

                                    if (isViewOnly) {
                                      if (isCorrectAnswer) {
                                        btnClass += 'bg-emerald-50 border-emerald-400 text-emerald-800 cursor-default';
                                        circleClass += 'border-emerald-500 bg-emerald-500 text-white';
                                      } else if (wasSelectedWrong) {
                                        btnClass += 'bg-red-50 border-red-400 text-red-800 cursor-default';
                                        circleClass += 'border-red-500 bg-red-500 text-white';
                                      } else {
                                        btnClass += 'bg-white border-gray-200 text-gray-400 cursor-default opacity-60';
                                        circleClass += 'border-gray-300 text-gray-400';
                                      }
                                    } else {
                                      btnClass += isSelected
                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                                        : 'bg-white border-gray-200 text-[#002147] hover:border-indigo-300 hover:bg-indigo-50';
                                      circleClass += isSelected
                                        ? 'border-white bg-white text-indigo-600'
                                        : 'border-gray-300 text-gray-500';
                                    }

                                    return (
                                      <button
                                        key={optKey}
                                        type="button"
                                        disabled={isViewOnly}
                                        onClick={() => {
                                          if (!isViewOnly) {
                                            setSelectedAnswers(prev => ({ ...prev, [qKey]: optKey }));
                                          }
                                        }}
                                        className={btnClass}
                                      >
                                        <span className={circleClass}>
                                          {isViewOnly && isCorrectAnswer ? '✓' : isViewOnly && wasSelectedWrong ? '✗' : String.fromCharCode(65 + optIdx)}
                                        </span>
                                        {optText}
                                        {isViewOnly && isCorrectAnswer && (
                                          <span className="ml-auto text-[10px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">Correct</span>
                                        )}
                                        {isViewOnly && wasSelectedWrong && (
                                          <span className="ml-auto text-[10px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">Your Answer</span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                            {/* Open-ended: no text area — student writes on paper and uploads photo */}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Submission View (When already submitted) OR Photo Upload Zone (When submitting) ── */}
                  {selectedTask.submission ? (
                    <div className="space-y-5 mt-4">
                      {/* Submitted Handwritten Work */}
                      {(() => {
                        const sub = selectedTask.submission;
                        const rawImgs = sub.imageUrls || sub.imageUrl || sub.image_urls || sub.attachmentUrl;
                        const imageList: string[] = Array.isArray(rawImgs)
                          ? rawImgs
                          : (typeof rawImgs === 'string' && rawImgs.trim().length > 0 ? [rawImgs.trim()] : []);

                        if (imageList.length === 0) return null;

                        return (
                          <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4">
                            <p className="text-xs font-black text-[#002147] uppercase tracking-wider mb-2">📸 Your Submitted Handwritten Answer Sheet</p>
                            <div className="flex flex-wrap gap-3">
                              {imageList.map((url: string, idx: number) => (
                                <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="group relative block">
                                  <img
                                    src={url}
                                    alt={`Submitted Page ${idx + 1}`}
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = 'none';
                                      const parent = (e.target as HTMLElement).parentElement;
                                      if (parent && !parent.querySelector('.img-error-fallback')) {
                                        const fb = document.createElement('div');
                                        fb.className = 'img-error-fallback w-28 h-28 rounded-xl border-2 border-dashed border-indigo-300 bg-white p-2 flex flex-col items-center justify-center text-center';
                                        fb.innerHTML = '<span class="text-xs font-bold text-indigo-800">📷 Answer Sheet</span><span class="text-[9px] text-gray-500 mt-1">Old submission link</span>';
                                        parent.appendChild(fb);
                                      }
                                    }}
                                    className="w-28 h-28 object-cover rounded-xl border-2 border-indigo-200 group-hover:border-indigo-600 transition-all shadow-sm"
                                  />
                                  <span className="absolute bottom-1 right-1 bg-[#002147]/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                    Page {idx + 1} ↗
                                  </span>
                                </a>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* AI Evaluation & Where Student Went Wrong */}
                      {(() => {
                        const sub = selectedTask.submission;
                        const ai = sub.aiResult || sub.ai_feedback || {};
                        const questions = Array.isArray(ai.questions) ? ai.questions : [];
                        const scoreNum = sub.score ?? (sub.maxScore != null ? 0 : null);
                        const maxNum = sub.maxScore || selectedTask.totalMarks || 5;
                        const displayScore = sub.finalGrade || (scoreNum != null ? `${scoreNum}/${maxNum}` : null);
                        const pct = scoreNum != null && maxNum ? Math.round((scoreNum / maxNum) * 100) : (ai.percentageScore || null);

                        return (
                          <div className="space-y-3">
                            <div className="bg-gradient-to-r from-indigo-900 to-[#002147] text-white p-5 rounded-2xl shadow-md">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/20">
                                    {sub.teacher_approved ? '✓ Teacher Approved' : '🤖 AI Evaluated (Pending Teacher Review)'}
                                  </span>
                                </div>
                                {displayScore && (
                                  <span className="text-2xl font-black text-amber-300">
                                    {displayScore} {pct != null ? `(${pct}%)` : ''}
                                  </span>
                                )}
                              </div>
                              {sub.ai_feedback && (
                                <p className="text-sm text-indigo-100 mt-2 leading-relaxed font-medium">{typeof sub.ai_feedback === 'string' ? sub.ai_feedback : (ai.summary || 'AI grading complete.')}</p>
                              )}
                              {sub.teacher_note && (
                                <div className="mt-3 p-3 bg-amber-400/20 border border-amber-400/30 rounded-xl text-xs text-amber-100 font-semibold">
                                  📝 Teacher Feedback: {sub.teacher_note}
                                </div>
                              )}
                            </div>

                            {/* Detailed Question Errors & Suggestions */}
                            {questions.length > 0 && (
                              <div className="space-y-2">
                                <h5 className="text-xs font-black text-[#002147] uppercase tracking-wider px-1">Detailed AI Question Analysis</h5>
                                {questions.map((q: any, qi: number) => {
                                  const isCorrect = q.isFinalAnswerCorrect !== false;
                                  return (
                                    <div
                                      key={qi}
                                      className={`p-4 rounded-2xl border ${
                                        isCorrect ? 'bg-emerald-50/60 border-emerald-200' : 'bg-red-50/60 border-red-200'
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                          <span className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-xs ${
                                            isCorrect ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                                          }`}>
                                            {isCorrect ? '✓' : '✗'}
                                          </span>
                                          <p className="font-bold text-[#002147] text-sm">{q.questionText || `Question ${qi+1}`}</p>
                                        </div>
                                        {q.awardedScore != null && (
                                          <span className={`text-xs font-black px-2 py-0.5 rounded-lg shrink-0 ${
                                            isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                                          }`}>
                                            {q.awardedScore}/{q.maxScore || 1}
                                          </span>
                                        )}
                                      </div>

                                      {/* Transcribed Handwriting */}
                                      {q.studentWrittenAnswer && (
                                        <div className="mt-2 text-xs text-gray-700 bg-white/80 p-2.5 rounded-xl border border-gray-200">
                                          <span className="font-bold text-gray-500 block text-[10px] uppercase">✍ Your Written Answer (Transcribed):</span>
                                          <p className="italic mt-0.5 text-gray-800 font-serif">{q.studentWrittenAnswer}</p>
                                        </div>
                                      )}

                                      {/* What Student Got Right */}
                                      {q.whatStudentGotRight && (
                                        <div className="mt-2 text-xs text-emerald-800 bg-emerald-100/60 p-2.5 rounded-xl border border-emerald-200">
                                          <span className="font-black text-emerald-900">✅ What you got right: </span>
                                          {q.whatStudentGotRight}
                                        </div>
                                      )}

                                      {/* Where Student Went Wrong */}
                                      {q.lostMarksReason && (
                                        <div className="mt-2 text-xs font-semibold text-rose-900 bg-rose-100/70 p-2.5 rounded-xl border border-rose-200">
                                          <span className="font-black text-rose-950">⚠ Where you went wrong: </span>
                                          {q.lostMarksReason}
                                          {q.exactStepByStepMistake && (
                                            <p className="mt-1 text-[11px] text-rose-800 font-normal">
                                              <span className="font-bold">Exact Error Step: </span>{q.exactStepByStepMistake}
                                            </p>
                                          )}
                                        </div>
                                      )}

                                      {/* Key Concept & How to Fix */}
                                      {q.teacherExplanation && (
                                        <div className="mt-2 text-xs text-indigo-900 bg-indigo-50 p-2.5 rounded-xl border border-indigo-100">
                                          <span className="font-black text-indigo-950">💡 Key Concept: </span>
                                          {q.teacherExplanation}
                                          {q.howToFix && (
                                            <p className="mt-1 text-[11px] text-indigo-800 font-semibold">
                                              <span className="font-bold">🎯 How to fix: </span>{q.howToFix}
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {Array.isArray(ai.weaknessTags) && ai.weaknessTags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                <span className="text-xs font-bold text-gray-400 mr-1">Focus Areas:</span>
                                {ai.weaknessTags.map((tag: string, ti: number) => (
                                  <span key={ti} className="text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-200 px-2.5 py-0.5 rounded-full">
                                    ⚡ {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    /* Photo Upload Zone — for open-ended homework and plain homework when not yet submitted */
                    (() => {
                      const hasOpenEnded = selectedTask.questions && selectedTask.questions.length > 0 &&
                        !selectedTask.questions.every((q: any) => Array.isArray(q.options) && q.options.length > 0);
                      const isPlainHomework = !selectedTask.questions || selectedTask.questions.length === 0;
                      if (!hasOpenEnded && !isPlainHomework) return null; // pure MCQ — no upload zone
                      return (
                        <div className="mt-2">
                          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border-2 border-dashed border-indigo-200 rounded-2xl p-6">
                            <div className="text-center mb-4">
                              <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <svg className="w-7 h-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                                </svg>
                              </div>
                              <h4 className="font-black text-[#002147] text-base">📸 Upload Your Handwritten Work</h4>
                              <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">Write your answers on paper, then take a clear photo and upload it here. Our AI will read and grade it instantly.</p>
                            </div>

                            {/* Photo Previews */}
                            {attachmentFiles.length > 0 && (
                              <div className="flex flex-wrap gap-3 mb-4 justify-center">
                                {attachmentFiles.map((file, idx) => (
                                  <div key={idx} className="relative w-24 h-24 rounded-xl overflow-hidden border-2 border-indigo-300 bg-white shadow-sm group">
                                    <img
                                      src={URL.createObjectURL(file)}
                                      alt={`Page ${idx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />
                                    <button
                                      type="button"
                                      onClick={() => removeAttachmentFile(idx)}
                                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs font-black shadow"
                                    >
                                      ×
                                    </button>
                                    <span className="absolute bottom-1 left-1 text-[10px] font-bold bg-black/50 text-white px-1.5 py-0.5 rounded-full">P{idx+1}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Upload / Camera Button */}
                            {attachmentFiles.length < 6 && (
                              <label className={`flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold text-sm cursor-pointer transition-all border-2 ${
                                attachmentFiles.length === 0
                                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-lg shadow-indigo-500/20'
                                  : 'bg-white hover:bg-indigo-50 text-indigo-600 border-indigo-300'
                              }`}>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                </svg>
                                {attachmentFiles.length === 0 ? '📷 Upload Photo of Answer Sheet' : `Add Another Page (${attachmentFiles.length}/6)`}
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  multiple
                                  className="sr-only"
                                  onChange={handleFileChange}
                                />
                              </label>
                            )}

                            {attachmentFiles.length === 0 && (
                              <p className="text-center text-xs text-indigo-400 mt-2 font-medium">📱 Opens camera directly on your phone</p>
                            )}
                            {attachmentFiles.length > 0 && (
                              <p className="text-center text-xs text-emerald-600 mt-2 font-semibold">✅ {attachmentFiles.length} page{attachmentFiles.length !== 1 ? 's' : ''} ready — AI will grade your handwriting</p>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  )}


                  {/* ── Submit / Turn In Button ── */}
                  {(() => {
                    // Submission is fully complete only if images were saved in DB
                    const isFullySubmitted = selectedTask.submission && (
                      selectedTask.submission.imageUrls?.length > 0 ||
                      selectedTask.submission.imageUrl
                    );

                    if (isFullySubmitted) {
                      return (
                        <div className="w-full mt-4 py-3 bg-emerald-50 border-2 border-emerald-200 rounded-xl text-center">
                          <p className="font-black text-emerald-700">✅ Already Submitted</p>
                          <p className="text-xs text-emerald-500 mt-0.5">Your work has been received and graded.</p>
                        </div>
                      );
                    }

                    // Submission incomplete (image upload failed) or brand new — always show submit button
                    return (
                      <div className="mt-4 space-y-2">
                        {selectedTask.submission && (
                          <div className="py-2.5 px-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
                            <p className="font-bold text-amber-700 text-sm">⚠️ Image upload failed previously — upload your work above and resubmit</p>
                          </div>
                        )}
                        <button
                          type="submit"
                          disabled={isSubmitting || attachmentFiles.length === 0}
                          onClick={(e) => {
                            const isMcq = selectedTask.questions?.length > 0 &&
                              Array.isArray(selectedTask.questions[0]?.options);
                            if (isMcq) {
                              const confirmed = window.confirm(
                                '⚠️ Final Confirmation\n\nOnce you submit this quiz, you CANNOT go back or change your answers.\nYour submission is final.\n\nAre you ready to submit?'
                              );
                              if (!confirmed) { e.preventDefault(); return; }
                            }
                          }}
                          className="w-full bg-[#dc143c] text-white py-3 rounded-xl font-semibold hover:bg-[#dc143c]/90 transition-colors disabled:opacity-40 shadow-lg flex items-center justify-center gap-2"
                        >
                          {isSubmitting ? (
                            <><Loader2 className="w-5 h-5 animate-spin" /><span>Processing...</span></>
                          ) : attachmentFiles.length === 0 ? (
                            '📸 Upload your work above to submit'
                          ) : selectedTask.submission ? (
                            `📤 Submit Work (${attachmentFiles.length} page${attachmentFiles.length > 1 ? 's' : ''})`
                          ) : (
                            `✅ Turn In Task (${attachmentFiles.length} page${attachmentFiles.length > 1 ? 's' : ''})`
                          )}
                        </button>
                      </div>
                    );
                  })()}
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Quiz Proctoring Warning Modal ─────────────────────────────────── */}
      {showProctoringWarning && pendingQuizTask && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Red warning header */}
            <div className="bg-gradient-to-br from-red-600 to-rose-700 p-8 text-center">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">🔒</span>
              </div>
              <h2 className="text-2xl font-black text-white">Proctored Quiz</h2>
              <p className="text-red-100 text-sm mt-1 font-medium">{pendingQuizTask.title}</p>
            </div>

            {/* Rules */}
            <div className="p-6 space-y-4">
              <p className="text-[#002147] font-black text-base text-center">Please read these rules carefully before starting</p>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl">
                  <span className="text-xl shrink-0">👁️</span>
                  <div>
                    <p className="font-bold text-amber-900 text-sm">Tab Switching is Monitored</p>
                    <p className="text-xs text-amber-700 mt-0.5">Every time you switch tabs or leave this window, your teacher is instantly notified. After 3 switches, your quiz is auto-submitted.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-2xl">
                  <span className="text-xl shrink-0">🚪</span>
                  <div>
                    <p className="font-bold text-red-900 text-sm">Exiting Auto-Submits Your Quiz</p>
                    <p className="text-xs text-red-700 mt-0.5">If you close this page or navigate away, your quiz will be automatically submitted with whatever answers you have selected. You cannot re-attempt.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-2xl">
                  <span className="text-xl shrink-0">✅</span>
                  <div>
                    <p className="font-bold text-blue-900 text-sm">Submission is Final</p>
                    <p className="text-xs text-blue-700 mt-0.5">Once you click "Turn In Task", your answers are locked. You will be asked to confirm before final submission.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowProctoringWarning(false);
                    setPendingQuizTask(null);
                  }}
                  className="py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setSelectedTask(pendingQuizTask);
                    setQuizStarted(true);
                    setTabSwitchCount(0);
                    setShowProctoringWarning(false);
                    setPendingQuizTask(null);
                  }}
                  className="py-3 rounded-xl bg-[#002147] text-white font-black text-sm hover:bg-[#003b80] transition-colors shadow-lg"
                >
                  I Understand — Start Quiz
                </button>
              </div>
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
