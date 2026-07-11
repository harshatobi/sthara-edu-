'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, Calendar, TrendingUp, CheckCircle2, LogOut, Loader2, BrainCircuit, Target, PlayCircle, Award, ChevronRight, X } from 'lucide-react';

import AiEvaluationView from '@/components/AiEvaluationView';
import MasteryModal from './MasteryModal';
import PendingTasksModal from './PendingTasksModal';
import RecentScoresModal from './RecentScoresModal';
import { db, storage } from '@/lib/firebase/config';
import { collection, query, where, getDocs, getDoc, orderBy, setDoc, doc, serverTimestamp, arrayUnion, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';


interface Assignment {
  id: string;
  title: string;
  topic?: string;  // some docs use topic as alias for title
  type: string;
  dueDate: string;
  description: string;
  subject: string;
  teacherName: string;
  questions?: any[];
  submission?: any;
}

export default function StudentDashboard() {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();
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


  const handleSelectAnswer = (questionId: string, optionId: string) => {
    setSelectedAnswers(prev => ({ ...prev, [questionId]: optionId }));
  };

  // Compress image to max ~800KB before sending to Gemini API
  // Firebase Storage still receives the ORIGINAL full-quality file
  const compressImageForApi = (file: File): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        // Non-image: read as-is (PDF etc.)
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
        const MAX_DIM = 1600; // px — enough for Gemini to read handwriting clearly
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
          0.8   // 80% quality — readable by Gemini, small enough for API
        );
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    setAttachmentFiles(prev => {
      const combined = [...prev, ...newFiles];
      return combined.slice(0, 6); // max 6 pages
    });
    // Reset input so same file can be added again after removal
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
        submittedAt: serverTimestamp(),
      };

      // Determine actual total marks for this assignment
      const assignmentTotalMarks = selectedTask.totalMarks
        || (selectedTask.tasks?.reduce((sum: number, t: any) => sum + (t.marks || 0), 0))
        || (selectedTask.questions?.length ? selectedTask.questions.length : 10);

      if (selectedTask.questions && selectedTask.questions.length > 0) {
        // MCQ quiz — score immediately
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

      // ── Step 1: Upload attachment pages if provided ──
      if (attachmentFiles.length > 0) {
        setSubmitStatus(`Uploading ${attachmentFiles.length} page(s) to secure storage...`);
        try {
          const uploadResults = await Promise.all(
            attachmentFiles.map(async (file, idx) => {
              const storageRef = ref(
                storage,
                `submissions/${profile.uid}/${selectedTask.id}/${Date.now()}_page${idx + 1}_${file.name}`
              );
              await uploadBytes(storageRef, file);
              return getDownloadURL(storageRef);
            })
          );
          submissionData.imageUrls = uploadResults;
          submissionData.imageUrl = uploadResults[0];
        } catch (storageErr: any) {
          console.error('Storage upload failed:', storageErr);
          alert('Warning: Could not upload images (' + (storageErr?.message || 'storage error') + '). Your text submission will still be saved.');
        }
      }

      // ── Step 2: AI Grade — ALWAYS run for homework (text or image) ──
      const isHomework = !(selectedTask.questions && selectedTask.questions.length > 0);
      if (isHomework && (submissionData.imageUrl || submissionText.trim())) {
        setSubmitStatus('🤖 AI Examiner is grading your work...');
        try {
          const authToken = await getAuthToken();

          // Build payload — image takes priority, then text
          const gradePayload: any = {
            assignmentTitle: selectedTask.title,
            assignmentDescription: selectedTask.description,
            assignmentSubject: selectedTask.subject,
            assignmentTasks: selectedTask.tasks || [],
            assignmentQuestions: selectedTask.questions || [],
            totalMarks: assignmentTotalMarks,
          };

          if (submissionData.imageUrl) {
            // Compress page 1 for vision grading
            setSubmitStatus('🤖 Compressing & scanning your handwritten work...');
            const compressed = await compressImageForApi(attachmentFiles[0]);
            gradePayload.imageBase64 = compressed.base64;
            gradePayload.mimeType = compressed.mimeType;
          } else {
            // Text-only grading
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
            submissionData.aiGraded = true;
            submissionData.aiResult = aiData;
            submissionData.score = aiData.totalScore ?? 0;
            submissionData.maxScore = aiData.maxTotalScore ?? assignmentTotalMarks;
            submissionData.total = aiData.maxTotalScore ?? assignmentTotalMarks;
            submissionData.grade = aiData.grade || `${aiData.totalScore}/${aiData.maxTotalScore}`;

            if (aiData.weaknessTags?.length > 0) {
              updateDoc(doc(db, 'users', profile.uid), {
                historicalWeaknesses: arrayUnion(...aiData.weaknessTags),
              }).catch(console.warn);
            }
          } else {
            submissionData.aiGraded = false;
            console.warn('AI grading returned non-OK:', response.status);
          }
        } catch (apiErr) {
          console.error('Auto-grade failed:', apiErr);
          submissionData.aiGraded = false;
        }
      } else if (selectedTask.questions && selectedTask.questions.length > 0 && !attachmentFiles.length) {
        // MCQ AI evaluation
        setSubmitStatus('Diagnostic Engine is analyzing your answers...');
        try {
          const authToken = await getAuthToken();
          const response = await fetch('/api/quiz/grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({
              title: selectedTask.title,
              description: selectedTask.description,
              questions: selectedTask.questions,
              studentAnswers: selectedAnswers,
            }),
          });
          if (response.ok) {
            const aiData = await response.json();
            submissionData.aiGraded = true;
            submissionData.aiResult = aiData;
            if (aiData.weaknessTags?.length > 0) {
              updateDoc(doc(db, 'users', profile.uid), {
                historicalWeaknesses: arrayUnion(...aiData.weaknessTags),
              }).catch(console.warn);
            }
          }
        } catch (apiErr) {
          console.error('Quiz evaluation failed:', apiErr);
        }
      }

      // ── Step 3: Save to Firestore ──
      setSubmitStatus('Saving submission...');
      await setDoc(
        doc(db, 'schools', profile.schoolId, 'assignments', selectedTask.id, 'submissions', profile.uid),
        submissionData
      );

      // ── Step 4: Update local state ──
      setAssignments(prev => prev.map(a =>
        a.id === selectedTask.id
          ? { ...a, submission: { ...submissionData, submittedAt: new Date() } }
          : a
      ));

      setAttachmentFiles([]);
      setSubmissionText('');
      setSubmitStatus('');

      // Show result screen
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
    // College students have branch, school students have studentClass
    const isCollege = profile.institutionType === 'college';
    if (!isCollege && !profile.studentClass) return; // school student with no class

    const schoolId = profile.schoolId;
    const uid = profile.uid;

    const fetchAssignments = async () => {
      try {
        let classSnap: any;
        if (isCollege) {
          // College: query by branch
          const branchQuery = profile.branch
            ? query(collection(db, 'schools', schoolId, 'assignments'), where('class', '==', profile.branch))
            : query(collection(db, 'schools', schoolId, 'assignments'));
          classSnap = await getDocs(branchQuery);
        } else {
          classSnap = await getDocs(query(
            collection(db, 'schools', schoolId, 'assignments'),
            where('class', '==', profile.studentClass)
          ));
        }

        const targetedQuery = query(
          collection(db, 'schools', schoolId, 'assignments'),
          where('targetStudentId', '==', uid)
        );
        const targetedSnap = await getDocs(targetedQuery);

        const tasks: Assignment[] = [];
        const processDoc = async (docSnap: any) => {
          const taskData = { id: docSnap.id, ...docSnap.data() } as Assignment;
          const subDocRef = doc(db, 'schools', schoolId, 'assignments', docSnap.id, 'submissions', uid);
          const subDoc = await getDoc(subDocRef);
          if (subDoc.exists()) taskData.submission = subDoc.data();
          if (!tasks.some(t => t.id === taskData.id)) tasks.push(taskData);
        };

        await Promise.all([
          ...classSnap.docs.map(processDoc),
          ...targetedSnap.docs.map(processDoc)
        ]);

        tasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        // Subject-scoping: if an assignment has assignedStudentIds, only show it to those students
        const studentCustomId = profile.customStudentId || '';
        const studentUid = profile.uid || '';
        const visibleTasks = tasks.filter((t: any) => {
          // STRICT SUBJECT ENFORCEMENT: Only show to students explicitly mapped to the subject
          if (!t.assignedStudentIds || t.assignedStudentIds.length === 0) return false;
          return (
            (studentCustomId && t.assignedStudentIds.includes(studentCustomId)) ||
            (studentUid && t.assignedStudentIds.includes(studentUid))
          );
        });
        setAssignments(visibleTasks);
      } catch (error) {
        console.error('Error fetching assignments:', error);
      } finally {
        setLoadingTasks(false);
      }
    };

    fetchAssignments();
  }, [profile?.schoolId, profile?.studentClass, profile?.branch, profile?.uid, profile?.institutionType]);

  // Fetch teacher resources for student's class / branch
  useEffect(() => {
    if (!profile?.schoolId || !profile?.uid) return;
    const isCollege = profile.institutionType === 'college';
    const classKey = isCollege ? profile.branch : profile.studentClass;
    if (!classKey) return;
    const fetchResources = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'schools', profile.schoolId!, 'teacherResources'),
          where('targetClass', '==', classKey)
        ));
        const res = await Promise.all(snap.docs.map(async (d) => {
          const readDoc = await getDoc(doc(db, 'schools', profile.schoolId!, 'teacherResources', d.id, 'reads', profile.uid!));
          return { id: d.id, ...d.data(), isRead: readDoc.exists() };
        }));
        res.sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setResources(res);
      } catch (e) {
        console.error('Failed to fetch teacher resources:', e);
      }
    };
    fetchResources();
  }, [profile?.schoolId, profile?.studentClass, profile?.branch, profile?.uid]);

  const handleOpenResource = async (resource: any) => {
    setSelectedResource(resource);
    setResourceQuizAnswers(new Array(resource.quizQuestions?.length || 0).fill(-1));
    setResourceQuizResult(null);
    // Mark as read in Firestore
    if (profile?.uid && profile?.schoolId) {
      try {
        await setDoc(
          doc(db, 'schools', profile.schoolId, 'teacherResources', resource.id, 'reads', profile.uid),
          { readAt: serverTimestamp(), studentName: profile.name || profile.uid, studentId: profile.uid }
        );
        // Mark locally so the badge updates
        setResources(prev => prev.map(r => r.id === resource.id ? { ...r, isRead: true } : r));
      } catch (e) {
        console.warn('Could not mark resource as read:', e);
      }
    }
  };

  const handleSubmitResourceQuiz = async () => {
    if (!selectedResource || !profile?.uid || !profile?.schoolId) return;
    const questions = selectedResource.quizQuestions || [];
    if (resourceQuizAnswers.some(a => a === -1)) {
      alert('Please answer all questions before submitting.');
      return;
    }
    setIsSubmittingResourceQuiz(true);
    try {
      let score = 0;
      questions.forEach((q: any, i: number) => {
        if (resourceQuizAnswers[i] === q.correctIndex) score++;
      });
      await setDoc(
        doc(db, 'schools', profile.schoolId, 'teacherResources', selectedResource.id, 'quizResponses', profile.uid),
        {
          studentId: profile.uid,
          studentName: profile.name || profile.uid,
          score,
          total: questions.length,
          answers: resourceQuizAnswers,
          submittedAt: serverTimestamp(),
        }
      );
      setResourceQuizResult({ score, total: questions.length });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmittingResourceQuiz(false);
    }
  };


  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading Student Portal...</div>;

  const pendingTasks = assignments.filter((a: any) => !a.submission || a.submission.teacherApproved === false);
  const submittedTasks = assignments.filter((a: any) => !!a.submission && a.submission.teacherApproved !== false);
  const pendingTasksCount = pendingTasks.length;
  // ONLY count towards mastery if the teacher explicitly approved it!
  const gradedSubmissions = assignments.filter((a: any) => a.submission && a.submission.score !== undefined && a.submission.teacherApproved === true);
  
  let masteryText = 'N/A';
  let recentScoreText = '-';
  let recentTopicText = 'No Recent';

  if (gradedSubmissions.length > 0) {
    let totalScore = 0;
    let totalMax = 0;
    gradedSubmissions.forEach(a => {
      // If the teacher modified the grade (e.g. "8/10"), parse it. Otherwise fallback to raw score.
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
    
    const recent = [...gradedSubmissions].sort((a, b) => {
      const timeA = a.submission.submittedAt?.seconds || 0;
      const timeB = b.submission.submittedAt?.seconds || 0;
      return timeB - timeA;
    })[0];
    
    let recentScoreNum = recent.submission.score || 0;
    let recentMaxNum = recent.submission.maxScore || recent.submission.total || 100;
    if (recent.submission.finalGrade && typeof recent.submission.finalGrade === 'string' && recent.submission.finalGrade.includes('/')) {
        const [s, m] = recent.submission.finalGrade.split('/');
        recentScoreNum = parseFloat(s) || recentScoreNum;
        recentMaxNum = parseFloat(m) || recentMaxNum;
    }

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

      {/* ── Teacher Resources Section ── */}
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
            {resources.filter((r: any) => !r.isRead).length > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {resources.filter((r: any) => !r.isRead).length} New
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {resources.map((resource: any) => (
              <button
                key={resource.id}
                onClick={() => handleOpenResource(resource)}
                className={`text-left p-4 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-md group ${
                  resource.isRead
                    ? 'bg-white border-gray-200 hover:border-indigo-300'
                    : 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      {!resource.isRead && (
                        <span className="inline-block w-2 h-2 bg-red-500 rounded-full shrink-0" />
                      )}
                      <p className="font-bold text-gray-800 text-sm truncate">{resource.title}</p>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-1">{resource.summary || 'Tap to view'}</p>
                    <div className="flex items-center space-x-2 mt-2">
                      <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                        {resource.withQuiz ? '📝 Quiz Attached' : '📖 Reading'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {resource.teacherName || 'Teacher'}
                      </span>
                    </div>
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
            {/* Resource Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 rounded-t-2xl flex items-start justify-between">
              <div>
                <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">From {selectedResource.teacherName}</p>
                <h2 className="text-white font-bold text-lg leading-snug">{selectedResource.title}</h2>
              </div>
              <button onClick={() => setSelectedResource(null)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 shrink-0 ml-3">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Resource Content */}
              <div className="prose prose-sm max-w-none text-gray-800 bg-gray-50 rounded-xl p-4 border border-gray-200 max-h-64 overflow-y-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedResource.content || ''}</ReactMarkdown>
              </div>

              {/* Quiz Section */}
              {selectedResource.withQuiz && selectedResource.quizQuestions?.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-purple-100 rounded-lg flex items-center justify-center">
                      <span className="text-purple-600 font-bold text-xs">Q</span>
                    </div>
                    <h3 className="font-bold text-gray-800">Comprehension Quiz</h3>
                  </div>

                  {resourceQuizResult ? (
                    <div className={`p-6 rounded-2xl text-center border-2 ${
                      resourceQuizResult.score / resourceQuizResult.total >= 0.7
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-amber-50 border-amber-200'
                    }`}>
                      <p className="text-4xl font-black text-[#002147] mb-1">
                        {resourceQuizResult.score}/{resourceQuizResult.total}
                      </p>
                      <p className="font-bold text-gray-600">
                        {Math.round((resourceQuizResult.score / resourceQuizResult.total) * 100)}% — {
                          resourceQuizResult.score / resourceQuizResult.total >= 0.7 ? 'Great job! 🎉' : 'Keep practicing!'
                        }
                      </p>
                      <p className="text-sm text-gray-500 mt-2">Score sent to your teacher</p>
                    </div>
                  ) : (
                    <>
                      {selectedResource.quizQuestions.map((q: any, qIdx: number) => (
                        <div key={qIdx} className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
                          <p className="font-bold text-gray-800 text-sm">{qIdx + 1}. {q.question}</p>
                          <div className="grid grid-cols-1 gap-2">
                            {q.options.map((opt: string, optIdx: number) => (
                              <button
                                key={optIdx}
                                onClick={() => {
                                  const newAnswers = [...resourceQuizAnswers];
                                  newAnswers[qIdx] = optIdx;
                                  setResourceQuizAnswers(newAnswers);
                                }}
                                className={`text-left px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                                  resourceQuizAnswers[qIdx] === optIdx
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                    : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                                }`}
                              >
                                <span className="font-bold mr-2">{String.fromCharCode(65 + optIdx)}.</span>{opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      <button
                        onClick={handleSubmitResourceQuiz}
                        disabled={isSubmittingResourceQuiz || resourceQuizAnswers.some(a => a === -1)}
                        className="w-full flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
                      >
                        {isSubmittingResourceQuiz
                          ? <Loader2 className="w-5 h-5 animate-spin" />
                          : <CheckCircle2 className="w-5 h-5" />}
                        <span>{isSubmittingResourceQuiz ? 'Submitting...' : 'Submit Quiz'}</span>
                      </button>
                    </>
                  )}
                </div>
              )}
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
              {/* Pending tasks */}
              {pendingTasks.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-black text-amber-600 uppercase tracking-widest px-1">⏳ Pending Submission</p>
                  {pendingTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      title={`${task.subject || 'Assignment'}: ${task.title} ${task.submission?.teacherApproved === false ? '(Rejected - Please Resubmit)' : ''}`}
                      time={`Due: ${task.dueDate || 'No Set Date'} • Posted by ${task.teacherName || 'Teacher'}`}
                      type={task.type as 'homework' | 'video' | 'announcement'}
                      status="pending"
                      onClick={() => { setSelectedTask(task); setQuizResult(null); }}
                    />
                  ))}
                </div>
              )}

              {/* Submitted tasks — click redirects to Homework tab */}
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
                  {quizResult.isHomework ? (
                    /* ── Homework success screen with AI grade ── */
                    <>
                      <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
                        <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                      </div>
                      <h3 className="text-2xl font-bold text-[#002147] mb-2">Submitted Successfully!</h3>
                      <p className="text-[#002147]/60 mb-4">Your work has been sent to your teacher for review.</p>
                      {quizResult.aiGraded && quizResult.score != null && (
                        <div className="w-full max-w-sm mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5">
                          <p className="text-xs font-black text-blue-500 uppercase tracking-wider mb-2">🤖 AI Examiner Grade</p>
                          <div className="flex items-end gap-2 mb-1">
                            <span className="text-5xl font-black text-[#002147]">{quizResult.score}</span>
                            <span className="text-2xl font-bold text-gray-400 mb-1">/ {quizResult.total}</span>
                          </div>
                          <p className="text-sm text-blue-700 font-medium">
                            {Math.round((quizResult.score / quizResult.total) * 100)}% • {quizResult.total > 0 && quizResult.score / quizResult.total >= 0.9 ? '🏆 Excellent' : quizResult.score / quizResult.total >= 0.7 ? '✅ Good' : quizResult.score / quizResult.total >= 0.5 ? '📘 Average' : '⚠️ Needs Improvement'}
                          </p>
                          {quizResult.aiResult?.summary && (
                            <p className="text-xs text-gray-600 mt-2 text-left">{quizResult.aiResult.summary}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-3 italic">Pending teacher approval</p>
                        </div>
                      )}
                      {quizResult.aiGraded && quizResult.score == null && (
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full mb-6">
                          🤖 AI Pre-scan complete — teacher will review and confirm your grade
                        </span>
                      )}
                      {!quizResult.aiGraded && <div className="mb-6" />}
                      {/* Show uploaded pages */}
                      {quizResult.imageUrls && quizResult.imageUrls.length > 0 && (
                        <div className="w-full text-left mb-6">
                          <p className="text-sm font-bold text-gray-500 mb-3">Pages uploaded ({quizResult.imageUrls.length}):</p>
                          <div className="flex flex-wrap gap-3">
                            {quizResult.imageUrls.map((url: string, idx: number) => (
                              <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt={`Page ${idx+1}`} className="w-20 h-20 object-cover rounded-xl border-2 border-gray-100 hover:border-blue-400 transition-colors" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* ── Quiz score screen ── */
                    <>
                      <div className="inline-flex items-center justify-center w-28 h-28 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full mb-6 shadow-2xl">
                        <span className="text-2xl font-black text-white">{quizResult.score ?? 0}/{quizResult.total ?? 0}</span>
                      </div>
                      <h3 className="text-2xl font-black text-[#002147] mb-2">Quiz Complete! 🎉</h3>
                      <p className="text-gray-500 mb-2">
                        You scored <span className="font-black text-[#002147]">{Math.round(((quizResult.score ?? 0) / (quizResult.total || 1)) * 100)}%</span>
                      </p>
                      <p className="text-sm text-[#002147]/50 mb-6">Score automatically saved and sent to your teacher.</p>

                      {/* Answer review */}
                      {quizResult.questions && quizResult.questions.length > 0 && (
                        <div className="w-full text-left space-y-3 mb-8">
                          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Answer Review</p>
                          {quizResult.questions.map((q: any, idx: number) => {
                            const qKey = q.id || String(idx);
                            const studentAns = Number(quizResult.answers?.[qKey]);
                            const correct = q.correctAnswerIndex ?? -1;
                            const isCorrect = studentAns === correct;
                            return (
                              <div key={idx} className={`p-4 rounded-xl border text-sm ${isCorrect ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                                <p className="font-bold text-[#002147] mb-2">{idx+1}. {q.question || q.text || q.questionText}</p>
                                <div className="flex flex-col gap-1">
                                  {q.options.map((opt: any, oIdx: number) => {
                                    const optText = typeof opt === 'string' ? opt : (opt.text || opt);
                                    const isStudentChoice = studentAns === oIdx;
                                    const isCorrectOpt = oIdx === correct;
                                    return (
                                      <div key={oIdx} className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
                                        isCorrectOpt ? 'bg-emerald-200 text-emerald-900 font-bold' :
                                        isStudentChoice ? 'bg-rose-200 text-rose-900' :
                                        'text-gray-600'
                                      }`}>
                                        <span className="font-black">{String.fromCharCode(65+oIdx)}.</span> {optText}
                                        {isCorrectOpt && <span className="ml-auto text-emerald-700 font-black">✓</span>}
                                        {isStudentChoice && !isCorrectOpt && <span className="ml-auto text-rose-700">✗</span>}
                                      </div>
                                    );
                                  })}
                                </div>
                                {q.explanation && <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">💡 {q.explanation}</p>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
)}
                  {quizResult.aiResult && (
                    <div className="w-full text-left mb-8 max-w-full overflow-hidden">
                       <h4 className="font-bold text-[#002147] mb-4 text-lg border-b border-[#002147]/10 pb-2">AI Diagnostic Report</h4>
                       <div className="bg-white rounded-xl border border-[#002147]/10 overflow-hidden">
                         <AiEvaluationView scanResult={quizResult.aiResult} />
                       </div>
                    </div>
                  )}

                   {quizResult.attachmentUrl && quizResult.attachmentUrl !== 'uploaded_via_api' && (
                     <div className="w-full text-left mb-8 max-w-full overflow-hidden">
                        <h4 className="font-bold text-[#002147] mb-4 text-lg border-b border-[#002147]/10 pb-2">Your Attached Rough Work</h4>
                        <div className="bg-white rounded-xl border border-[#002147]/10 overflow-hidden p-2">
                          {quizResult.attachmentUrl.startsWith('data:application/pdf') ? (
                            <object data={quizResult.attachmentUrl} type="application/pdf" className="w-full h-[600px] rounded">
                              <p>PDF cannot be displayed. <a href={quizResult.attachmentUrl} download="submission.pdf" className="text-blue-600 underline">Download instead</a></p>
                            </object>
                          ) : (
                            <img src={quizResult.attachmentUrl} alt="Rough Work" className="max-w-full h-auto rounded" />
                          )}
                        </div>
                     </div>
                   )}

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
                        // Support both formats
                        const isNewFmt = q.correctAnswerIndex !== undefined;
                        const qKey = q.id || String(i);
                        const questionText = q.question || q.text || q.questionText || 'Question';
                        return (
                          <div key={qKey} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                            <div className="flex items-start gap-3 mb-4">
                              <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">{i+1}</div>
                              <p className="font-bold text-[#002147] text-base leading-relaxed">{questionText}</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 ml-11">
                              {q.options.map((opt: any, optIdx: number) => {
                                const optText = typeof opt === 'string' ? opt : (opt.text || String(opt));
                                const optKey = isNewFmt ? String(optIdx) : (opt.id || ['a','b','c','d'][optIdx] || String(optIdx));
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
                      
                      {/* Multi-page attachment uploader (text submission) */}
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
                              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center py-0.5 font-bold">Pg {idx + 1}</div>
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

                        {attachmentFiles.length === 0 && (
                          <p className="text-xs text-[#002147]/40 mt-1">📎 Upload your written homework pages here (up to 6 images)</p>
                        )}
                      </div>

                    </div>
                  )}
                  
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full bg-[#dc143c] text-white py-3 rounded-xl font-semibold hover:bg-[#dc143c]/90 transition-colors disabled:opacity-50 mt-4 shadow-lg flex flex-col items-center justify-center"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="flex items-center space-x-2"><Loader2 className="w-5 h-5 animate-spin" /><span>Processing...</span></span>
                        {submitStatus && <span className="text-xs text-white/80 mt-1 font-mono">{submitStatus}</span>}
                      </>
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

function StatCard({ title, value, icon: Icon, trend, alert = false }: any) {
  return (
    <div className="bg-white border border-[#002147]/10 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <div className="text-[#002147]/60 font-medium">{title}</div>
        <div className={`p-2 rounded-lg ${alert ? 'bg-[#dc143c]/10 text-[#dc143c]' : 'bg-[#002147]/5 text-[#002147]'}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div>
        <div className="text-3xl font-bold text-[#002147]">{value}</div>
        <div className={`text-sm mt-1 ${alert ? 'text-[#dc143c] font-medium' : 'text-[#002147]/60'}`}>{trend}</div>
      </div>
    </div>
  );
}

function TaskItem({ title, time, type, status, onClick }: { title: string, time: string, type: 'homework' | 'video' | 'announcement', status?: string, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick} 
      className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-hidden"
    >
      {/* Accent Line */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
        status === 'completed' ? 'bg-emerald-400' : 'bg-orange-400'
      }`} />

      <div className="flex-1 ml-2">
        <div className="font-bold text-[#002147] text-lg group-hover:text-blue-600 transition-colors flex items-center flex-wrap gap-2 mb-1">
          {title}
          {status === 'completed' && (
            <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] uppercase tracking-widest px-2.5 py-0.5 rounded-full font-extrabold">
              Completed
            </span>
          )}
        </div>
        <div className="text-sm font-medium text-gray-500 flex items-center space-x-1.5">
          <Calendar className="w-3.5 h-3.5 text-gray-400" />
          <span>{time}</span>
        </div>
      </div>
      
      <div className="mt-4 sm:mt-0 ml-2 sm:ml-6 shrink-0">
        <button className={`text-sm font-bold px-6 py-2.5 rounded-xl transition-all shadow-sm pointer-events-none ${
          status === 'completed' 
            ? 'bg-gray-50 text-gray-600 border border-gray-200 group-hover:bg-gray-100' 
            : 'bg-orange-500 text-white shadow-orange-500/20 group-hover:bg-orange-600 group-hover:shadow-orange-500/30 group-hover:-translate-y-0.5'
        }`}>
          {status === 'completed' ? 'Review' : type === 'homework' ? 'Start Task' : type === 'video' ? 'Watch Now' : 'View'}
        </button>
      </div>
    </div>
  );
}
