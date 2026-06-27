'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, Calendar, TrendingUp, CheckCircle2, LogOut, Loader2, BrainCircuit, Target, PlayCircle, Award } from 'lucide-react';
import AiEvaluationView from '@/components/AiEvaluationView';
import MasteryModal from './MasteryModal';
import PendingTasksModal from './PendingTasksModal';
import RecentScoresModal from './RecentScoresModal';
import { db, storage } from '@/lib/firebase/config';
import { collection, query, where, getDocs, getDoc, orderBy, setDoc, doc, serverTimestamp, arrayUnion, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuthToken } from '@/lib/auth/getAuthToken';

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
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [showMasteryModal, setShowMasteryModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showScoresModal, setShowScoresModal] = useState(false);

  const handleSelectAnswer = (questionId: string, optionId: string) => {
    setSelectedAnswers(prev => ({ ...prev, [questionId]: optionId }));
  };

  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.schoolId || !selectedTask) return;
    setIsSubmitting(true);
    
    try {
      let submissionData: any = {
        studentId: profile.uid,
        studentName: profile.name,
        studentClass: profile.studentClass,
        customStudentId: profile.customStudentId || null,
        submittedAt: serverTimestamp(),
      };

      if (selectedTask.questions && selectedTask.questions.length > 0) {
        // Auto-grade the quiz
        let score = 0;
        selectedTask.questions.forEach((q: any) => {
          if (selectedAnswers[q.id] === q.correctOptionId) {
            score++;
          }
        });
        submissionData = {
          ...submissionData,
          type: 'quiz',
          answers: selectedAnswers,
          score: score,
          total: selectedTask.questions.length
        };
      } else {
        submissionData = {
          ...submissionData,
          type: 'homework',
          text: submissionText,
        };
      }

      if (attachmentFile) {
        setSubmitStatus('Uploading to secure storage...');
        
        // Upload to Firebase Storage — avoids Firestore 1MB document limit
        const storageRef = ref(storage, `submissions/${profile.uid}/${selectedTask.id}/${Date.now()}_${attachmentFile.name}`);
        await uploadBytes(storageRef, attachmentFile);
        const imageUrl = await getDownloadURL(storageRef);
        submissionData.imageUrl = imageUrl;   // ✅ Storage URL only — no base64

        // Read as base64 only for sending to Gemini API
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(attachmentFile);
        });
        
        setSubmitStatus('Diagnostic Engine is scanning your work...');
        try {
          const authToken = await getAuthToken();
          const response = await fetch('/api/grade-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({ 
              imageBase64: base64Data,
              mimeType: attachmentFile.type,
              assignmentTitle: selectedTask.title,
              assignmentDescription: selectedTask.description,
              assignmentQuestions: selectedTask.questions || []
            })
          });
          
          if (response.ok) {
            const aiData = await response.json();
            submissionData.aiGraded = true;
            submissionData.aiResult = aiData;
            
            let calcTotalScore = 0;
            if (aiData.questions && Array.isArray(aiData.questions)) {
              aiData.questions.forEach((q: any) => { calcTotalScore += (q.awardedScore || 0); });
            } else {
              calcTotalScore = aiData.totalScore || 0;
            }
            const calcMaxScore = selectedTask.questions?.length ? selectedTask.questions.length * 5 : 15;
            
            submissionData.score = calcTotalScore;
            submissionData.maxScore = calcMaxScore;
            submissionData.total = calcMaxScore;
            
            if (aiData.weaknessTags && aiData.weaknessTags.length > 0) {
              const userRef = doc(db, 'users', profile.uid);
              try {
                await updateDoc(userRef, { historicalWeaknesses: arrayUnion(...aiData.weaknessTags) });
              } catch (updateErr) {
                console.error('Failed to update user weaknesses:', updateErr);
              }
            }
          } else {
            submissionData.aiGraded = false;
            const errBody = await response.json().catch(() => ({}));
            alert('Evaluation failed: ' + (errBody.error || 'Unknown error'));
          }
        } catch (apiErr) {
          console.error('Auto-grade failed:', apiErr);
          submissionData.aiGraded = false;
        }
      } else if (selectedTask.questions && selectedTask.questions.length > 0) {
        // AI Evaluation for multiple choice
        setSubmitStatus('Diagnostic Engine is analyzing your answers...');
        try {
          const authToken = await getAuthToken();
          const response = await fetch('/api/quiz/grade', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({ 
              title: selectedTask.title,
              description: selectedTask.description,
              questions: selectedTask.questions,
              studentAnswers: selectedAnswers
            })
          });
          
          if (response.ok) {
            const aiData = await response.json();
            submissionData.aiGraded = true;
            submissionData.aiResult = aiData;
            
            if (aiData.weaknessTags && aiData.weaknessTags.length > 0) {
              const userRef = doc(db, 'users', profile.uid);
              try {
                await updateDoc(userRef, { historicalWeaknesses: arrayUnion(...aiData.weaknessTags) });
              } catch (updateErr) {
                console.error('Failed to update user weaknesses:', updateErr);
              }
            }
          }
        } catch (apiErr) {
          console.error('Quiz evaluation failed:', apiErr);
        }
      }

      setSubmitStatus('Saving submission...');
      await setDoc(doc(db, 'schools', profile.schoolId, 'assignments', selectedTask.id, 'submissions', profile.uid), submissionData);
      
      // If it's a text submission, close immediately. If quiz, we keep it open to show the score.
      if (!selectedTask.questions) {
        setSelectedTask(null);
        setSubmissionText('');
        setSubmitStatus('');
      } else {
        // Show the quiz result UI ONLY after successful upload and DB save!
        setQuizResult({ 
          score: submissionData.score, 
          total: submissionData.maxScore || submissionData.total,
          aiResult: submissionData.aiResult,
          attachmentUrl: submissionData.attachmentUrl
        });
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to submit task: ' + (err.message || 'Unknown error. Have you enabled Firebase Storage in your console?'));
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
    if (!profile?.schoolId || !profile?.studentClass) return;
    const schoolId = profile.schoolId;
    const uid = profile.uid;

    const fetchAssignments = async () => {
      try {
        const classQuery = query(
          collection(db, 'schools', schoolId, 'assignments'),
          where('class', '==', profile.studentClass)
        );
        
        const targetedQuery = query(
          collection(db, 'schools', schoolId, 'assignments'),
          where('targetStudentId', '==', uid)
        );
        
        const [classSnap, targetedSnap] = await Promise.all([
          getDocs(classQuery),
          getDocs(targetedQuery)
        ]);

        const tasks: Assignment[] = [];
        const processDoc = async (docSnap: any) => {
          const taskData = { id: docSnap.id, ...docSnap.data() } as Assignment;
          // Check if the student has already submitted this task
          const subDocRef = doc(db, 'schools', schoolId, 'assignments', docSnap.id, 'submissions', uid);
          const subDoc = await getDoc(subDocRef);
          if (subDoc.exists()) {
            taskData.submission = subDoc.data();
          }
          // Avoid duplicates if any overlapping somehow
          if (!tasks.some(t => t.id === taskData.id)) {
            tasks.push(taskData);
          }
        };

        await Promise.all([
          ...classSnap.docs.map(processDoc),
          ...targetedSnap.docs.map(processDoc)
        ]);
        
        // Client-side sort by dueDate closest first
        tasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        setAssignments(tasks);
      } catch (error) {
        console.error("Error fetching assignments:", error);
      } finally {
        setLoadingTasks(false);
      }
    };

    fetchAssignments();
  }, [profile?.schoolId, profile?.studentClass]);

  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading Student Portal...</div>;

  const pendingTasksCount = assignments.filter((a: any) => !a.submission).length;
  const gradedSubmissions = assignments.filter((a: any) => a.submission && a.submission.score !== undefined);
  
  let masteryText = 'N/A';
  let recentScoreText = '-';
  let recentTopicText = 'No Recent';

  if (gradedSubmissions.length > 0) {
    let totalScore = 0;
    let totalMax = 0;
    gradedSubmissions.forEach(a => {
      totalScore += a.submission.score;
      totalMax += a.submission.maxScore || a.submission.total || 100;
    });
    masteryText = Math.round((totalScore / totalMax) * 100) + '%';
    
    const recent = [...gradedSubmissions].sort((a, b) => {
      const timeA = a.submission.submittedAt?.seconds || 0;
      const timeB = b.submission.submittedAt?.seconds || 0;
      return timeB - timeA;
    })[0];
    
    const percent = Math.round((recent.submission.score / (recent.submission.maxScore || recent.submission.total || 100)) * 100);
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
                Class: {profile.studentClass || 'Unassigned'}
              </span>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-2">
              Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-300 to-orange-500">{(profile.name || 'Student').split(' ')[0]}</span>!
            </h2>
            <p className="text-blue-100 text-lg max-w-xl font-medium opacity-90">
              Ready to crush today's goals? Your personalized learning path awaits.
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
            <span className="bg-gray-100 text-gray-600 font-bold px-4 py-2 rounded-xl text-sm">
              {assignments.length} Total
            </span>
          </div>
        </div>
        
        <div className="space-y-5">
          {loadingTasks ? (
            <div className="flex flex-col justify-center items-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
              <span className="text-gray-500 font-medium">Syncing with Diagnostic Engine...</span>
            </div>
          ) : assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-gradient-to-b from-gray-50 to-white rounded-2xl border border-dashed border-gray-200">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <h4 className="text-xl font-bold text-[#002147] mb-2">You're all caught up!</h4>
              <p className="text-gray-500 font-medium text-center max-w-sm">
                Hooray! You have no pending tasks. Enjoy your free time or explore the Video Library for extra credit.
              </p>
            </div>
          ) : (
            assignments.map((task) => (
              <TaskItem 
                key={task.id} 
                title={`${task.subject || 'Assignment'}: ${task.title}`} 
                time={`Due: ${task.dueDate || 'No Set Date'} • Posted by ${task.teacherName || 'Teacher'}`} 
                type={task.type as 'homework' | 'video' | 'announcement'} 
                status={task.submission ? 'completed' : 'pending'}
                onClick={() => {
                  setSelectedTask(task);
                  if (task.submission) {
                     setQuizResult({
                        score: task.submission.score,
                        total: task.submission.maxScore || task.submission.total,
                        aiResult: task.submission.aiResult,
                        attachmentUrl: task.submission.attachmentUrl
                     });
                  } else {
                     setQuizResult(null);
                  }
                }}
              />
            ))
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
                  <div className="inline-flex items-center justify-center w-24 h-24 bg-[#dc143c]/10 rounded-full mb-6">
                    <span className="text-4xl font-bold text-[#dc143c]">{quizResult.score}/{quizResult.total}</span>
                  </div>
                  <h3 className="text-2xl font-bold text-[#002147] mb-2">Quiz Completed!</h3>
                  <p className="text-[#002147]/60 mb-8">Your score has been automatically saved and graded.</p>
                  
                  {quizResult.aiResult && (
                    <div className="w-full text-left mb-8 max-w-full overflow-hidden">
                       <h4 className="font-bold text-[#002147] mb-4 text-lg border-b border-[#002147]/10 pb-2">AI Diagnostic Report</h4>
                       <div className="bg-white rounded-xl border border-[#002147]/10 overflow-hidden">
                         <AiEvaluationView scanResult={quizResult.aiResult} />
                       </div>
                    </div>
                  )}

                  {(() => {
                    const weaknesses = quizResult.aiResult?.weaknessTags || [];
                    const videos = quizResult.aiResult?.recommendedVideos && quizResult.aiResult.recommendedVideos.length > 0 
                      ? quizResult.aiResult.recommendedVideos 
                      : weaknesses.length > 0 
                        ? weaknesses.slice(0, 2).map((tag: string) => ({ title: tag.replace(/_/g, ' ') + ' Basics', duration: '5 min tutorial' }))
                        : [
                            { title: "Fixing Basics", duration: "5 min tutorial" },
                            { title: "Mastering Fundamentals", duration: "8 min tutorial" }
                          ];
                    
                    return (
                      <div className="w-full text-left bg-gradient-to-r from-blue-600 to-[#002147] rounded-3xl p-6 text-white shadow-lg relative overflow-hidden mb-8">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                          <BrainCircuit className="w-48 h-48" />
                        </div>
                        <div className="relative z-10">
                          <div className="flex items-center space-x-3 mb-4">
                            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                              <Target className="w-6 h-6 text-blue-200" />
                            </div>
                            <h2 className="text-2xl font-bold">AI Learning Path</h2>
                          </div>
                          
                          <p className="text-blue-100 text-sm max-w-lg leading-relaxed mb-6">
                            {weaknesses.length > 0 
                              ? `Based on your recent performance, our Diagnostic Engine suggests focusing on ${weaknesses[0].replace(/_/g, ' ')} to strengthen your foundation.`
                              : "Based on your recent performance, our Diagnostic Engine suggests focusing on the following topics to strengthen your foundation."}
                          </p>
  
                          <div className="space-y-3">
                            <h3 className="text-blue-200 text-xs font-bold uppercase tracking-wider flex items-center space-x-2">
                              <PlayCircle className="w-4 h-4" />
                              <span>Suggested Remedial Content</span>
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {videos.map((video: any, idx: number) => (
                                <div key={idx} className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl overflow-hidden hover:bg-white/20 transition-all cursor-pointer group shadow-sm">
                                  <div className="h-24 relative flex items-center justify-center overflow-hidden bg-[#002147]/40">
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#002147]/80 to-transparent z-10" />
                                    <PlayCircle className="w-10 h-10 text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all z-20 drop-shadow-md" />
                                  </div>
                                  <div className="p-3 bg-white/5">
                                    <div className="text-sm font-bold text-white mb-1 line-clamp-1 capitalize">{video.title}</div>
                                    <div className="text-xs text-blue-200 font-medium">{video.duration}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

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
                    <div className="space-y-8">
                      {selectedTask.questions.map((q: any, i: number) => (
                        <div key={q.id} className="bg-[#f8fafc] border border-[#002147]/10 p-5 rounded-xl">
                          <p className="font-bold text-[#002147] mb-4">Q{i + 1}: {q.text || q.questionText}</p>
                          <div className="space-y-2">
                            {q.options.map((opt: any, optIdx: number) => {
                              const optId = opt.id || ['a', 'b', 'c', 'd'][optIdx] || String(optIdx);
                              const optText = opt.text || (typeof opt === 'string' ? opt : 'Option');
                              return (
                                <label key={optId} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${selectedAnswers[q.id] === optId ? 'bg-[#dc143c]/5 border-[#dc143c] text-[#dc143c]' : 'bg-white border-[#002147]/10 text-[#002147] hover:border-[#002147]/30'}`}>
                                  <input 
                                    type="radio" 
                                    name={`question-${q.id}`} 
                                    value={optId}
                                    checked={selectedAnswers[q.id] === optId}
                                    onChange={() => handleSelectAnswer(q.id, optId)}
                                    className="w-4 h-4 mr-3 text-[#dc143c] focus:ring-[#dc143c]"
                                    required
                                  />
                                  <span className="font-medium">{optId.toUpperCase()}) {optText}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      
                      <div className="bg-[#f8fafc] border border-[#002147]/10 p-5 rounded-xl mt-4">
                        <label className="block text-sm font-medium text-[#002147]/70 mb-2">Optional: Attach Rough Work (Image/PDF)</label>
                        <input 
                          type="file" 
                          accept="image/*,.pdf"
                          onChange={(e) => setAttachmentFile(e.target.files ? e.target.files[0] : null)}
                          className="w-full text-sm text-[#002147]/60 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#002147]/5 file:text-[#002147] hover:file:bg-[#002147]/10 transition-colors"
                        />
                      </div>
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
                        <label className="block text-sm font-medium text-[#002147]/70 mb-2">Optional: Attach Rough Work (Image/PDF)</label>
                        <input 
                          type="file" 
                          accept="image/*,.pdf"
                          onChange={(e) => setAttachmentFile(e.target.files ? e.target.files[0] : null)}
                          className="w-full text-sm text-[#002147]/60 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#002147]/5 file:text-[#002147] hover:file:bg-[#002147]/10 transition-colors"
                        />
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
        <PendingTasksModal assignments={assignments} onClose={() => setShowPendingModal(false)} />
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
