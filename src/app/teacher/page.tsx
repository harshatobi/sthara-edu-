'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Activity, AlertTriangle, Users, BookOpen, LogOut, Plus, X, Send, CheckSquare,
  ChevronLeft, MessageSquare, Star, Image as ImageIcon, FileText, CheckCircle, ArrowRight, Trash2 } from 'lucide-react';

import { db, storage } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import Link from 'next/link';



export default function TeacherDashboard() {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  
  // Assignment Form State
  const [title, setTitle] = useState('');
  const [type, setType] = useState('homework');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [homeworkQuestions, setHomeworkQuestions] = useState<{text: string; marks: string}[]>([]);
  const [questionPaperFile, setQuestionPaperFile] = useState<File | null>(null);
  const [questionPaperPreview, setQuestionPaperPreview] = useState<string | null>(null);
  const [uploadingQP, setUploadingQP] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postSuccess, setPostSuccess] = useState(false);



  // Task Modal State
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalClass, setTaskModalClass] = useState('');
  const [taskModalSubject, setTaskModalSubject] = useState('');
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [classTasks, setClassTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);

  // Platform average stat
  const [platformAvg, setPlatformAvg] = useState<number | null>(null);
  const [platformLoading, setPlatformLoading] = useState(true);

  // Submission detail viewer
  const [viewSubmission, setViewSubmission] = useState<{ sub: any; student: any; taskId: string } | null>(null);

  useEffect(() => {
    if (!profile?.schoolId || !profile?.assignments?.length) { setPlatformLoading(false); return; }
    const compute = async () => {
      try {
        const classes = [...new Set(profile.assignments.map((a: any) => a.class).filter(Boolean))];
        let totalScore = 0, totalMax = 0;
        await Promise.all(classes.map(async (cls: string) => {
          const assignSnap = await getDocs(query(
            collection(db, 'schools', profile.schoolId, 'assignments'),
            where('class', '==', cls)
          ));
          await Promise.all(assignSnap.docs.map(async (aDoc) => {
            const subsSnap = await getDocs(collection(db, 'schools', profile.schoolId, 'assignments', aDoc.id, 'submissions'));
            subsSnap.forEach(s => {
              const d = s.data();
              if (d.score !== undefined && d.maxScore) {
                totalScore += d.score;
                totalMax += d.maxScore;
              }
            });
          }));
        }));
        setPlatformAvg(totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null);
      } catch (e) { console.warn('Platform avg error:', e); }
      finally { setPlatformLoading(false); }
    };
    compute();
  }, [profile?.schoolId, profile?.assignments]);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading Teacher Portal...</div>;

  const openPostModal = (className: string, subjectName: string) => {
    setSelectedClass(className);
    setSelectedSubject(subjectName);
    setPostSuccess(false);
    setTitle('');
    setDescription('');
    setHomeworkQuestions([]);
    setQuestionPaperFile(null);
    setQuestionPaperPreview(null);
    setIsModalOpen(true);
  };



  const openTaskModal = async (className: string, subjectName: string) => {
    setTaskModalClass(className);
    setTaskModalSubject(subjectName);
    setSelectedTask(null);
    setClassTasks([]);
    setClassStudents([]);
    setIsTaskModalOpen(true);

    if (!profile?.schoolId) return;
    
    try {
      const idToken = await getAuth().currentUser?.getIdToken();

      const headers = {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      };

      // 1. Fetch students filtered by class/branch via Admin SDK API
      const studRes = await fetch('/api/teacher/get-students', {
        method: 'POST', headers,
        body: JSON.stringify({ schoolId: profile.schoolId, classFilter: className }),
      });
      const studData = await studRes.json();
      let students: any[] = studData.students || [];

      // For college professors: further filter to only students assigned to THIS subject
      const subjectAssignment = (profile.assignments || []).find(
        (a: any) => a.class === className && a.subject === subjectName
      );
      if (subjectAssignment?.assignedStudents?.length > 0) {
        const assignedIds = new Set(subjectAssignment.assignedStudents as string[]);
        students = students.filter(s => s.customStudentId && assignedIds.has(s.customStudentId));
      }
      setClassStudents(students);

      // 2. Fetch all assignments — filter by class (loose match, no strict subject)
      const assignRes = await fetch('/api/teacher/get-assignments', {
        method: 'POST', headers,
        body: JSON.stringify({ schoolId: profile.schoolId }),
      });
      const assignData = await assignRes.json();
      const allAssignments: any[] = assignData.assignments || [];

      // For college: match by class + teacher, show all subjects (teacher posted for this class)
      // For school: strict class + subject match
      const isCollegeClass = !!(subjectAssignment?.assignedStudents !== undefined ||
        (profile.assignments || []).some((a: any) => a.class === className && a.assignedStudents));

      const filtered = allAssignments.filter(a => {
        const classMatch = a.class === className;
        const teacherMatch = a.teacherId === profile.uid;
        if (isCollegeClass) {
          // College: show all assignments by this teacher for this class
          return classMatch && teacherMatch;
        }
        // School: strict class + subject match
        return classMatch && a.subject === subjectName;
      });

      // submittedData is already included from the get-assignments API
      const tasksWithStats = filtered.map(task => {
        const submittedStudentIds = new Set(Object.keys(task.submittedData || {}));
        const submissionsMap: Record<string, any> = {};
        Object.entries(task.submittedData || {}).forEach(([sid, sub]: [string, any]) => {
          submissionsMap[sid] = { id: sid, ...sub };
        });
        const isCompleted = students.length > 0 && submittedStudentIds.size >= students.length;
        return { ...task, submittedStudentIds, submissionsMap, isCompleted };
      });

      setClassTasks(tasksWithStats);
    } catch (err: any) {
      console.error('[openTaskModal]', err);
    }
  };


  const handleDeleteTask = async (taskId: string) => {
    if (!profile?.schoolId) return;
    if (!window.confirm("Are you sure you want to permanently delete this assignment?")) return;
    
    try {
      await deleteDoc(doc(db, 'schools', profile.schoolId, 'assignments', taskId));

      
      setClassTasks(prev => prev.filter(t => t.id !== taskId));
      setSelectedTask(null);
      alert("Assignment has been deleted.");
    } catch (e) {
      console.error("Failed to delete assignment:", e);
      alert("Failed to delete assignment. Please try again.");
    }
  };

  const handleSendReminder = (studentName: string) => {
    alert(`A reminder has been sent to ${studentName}!`);
  };

  const handlePostAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.schoolId) return;

    setIsPosting(true);
    try {
      const idToken = await getAuth().currentUser?.getIdToken();

      // Upload question paper file to Firebase Storage if provided
      let questionPaperUrl: string | null = null;
      let questionPaperType: string | null = null;
      if (questionPaperFile) {
        setUploadingQP(true);
        const ext = questionPaperFile.name.split('.').pop()?.toLowerCase() || '';
        const storageRef = ref(
          storage,
          `questionPapers/${profile.schoolId}/${Date.now()}_${questionPaperFile.name}`
        );
        await uploadBytes(storageRef, questionPaperFile);
        questionPaperUrl = await getDownloadURL(storageRef);
        questionPaperType = questionPaperFile.type.startsWith('image/') ? 'image' : 'pdf';
        setUploadingQP(false);
      }

      const res = await fetch('/api/teacher/post-assignment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          schoolId: profile.schoolId,
          title,
          type,
          dueDate,
          description,
          questions: homeworkQuestions.filter(q => q.text.trim()).map(q => ({
            text: q.text.trim(),
            marks: q.marks ? Number(q.marks) : null,
          })),
          questionPaperUrl,
          questionPaperType,
          class: selectedClass,
          subject: selectedSubject,
          teacherId: profile.uid,
          teacherName: profile.name,
          assignedStudentIds: (() => {
            const subjectAssign = (profile.assignments || []).find(
              (a: any) => a.class === selectedClass && a.subject === selectedSubject
            );
            return subjectAssign?.assignedStudents || [];
          })(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Server returned an error');

      setPostSuccess(true);
      setTimeout(() => setIsModalOpen(false), 2000);
    } catch (error: any) {
      console.error('Error posting assignment:', error);
      alert(`Failed to post assignment: ${error?.message || 'Unknown error.'}`);
    } finally {
      setIsPosting(false);
      setUploadingQP(false);
    }
  };



  return (
    <div className="min-h-screen font-sans animate-in fade-in duration-500 space-y-8 max-w-7xl mx-auto">
      {/* Header section with Stats embedded */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#002147] via-[#003b80] to-[#002147] rounded-[2rem] p-8 sm:p-12 text-white shadow-xl">
        {/* Background Blobs for Glassmorphism effect */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-56 h-56 bg-[#dc143c]/20 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-2">
              Good Morning, {profile.name?.split(' ')[0] || 'Teacher'}
            </h2>
            <p className="text-blue-100/80 text-lg flex items-center space-x-2 mt-2">
              <span>Teacher Portal</span>
              <span>•</span>
              <span className="font-mono bg-white/10 px-2 py-0.5 rounded-md text-sm">{profile.schoolId}</span>
            </p>
          </div>
          
          <button 
            onClick={signOut}
            className="self-start md:self-auto flex items-center space-x-2 bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md px-5 py-3 rounded-2xl shadow-sm transition-all duration-300 font-semibold active:scale-95"
          >
            <LogOut className="w-5 h-5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>

        {/* High-level Stats embedded in header */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-4 mt-12">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-2xl flex items-center justify-between hover:bg-white/15 transition-colors">
            <div>
              <div className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-1">Platform Average</div>
              <div className="text-3xl font-bold">
                {platformLoading ? '...' : platformAvg !== null ? `${platformAvg}%` : '--'}
              </div>
              <div className="text-sm text-white/50 mt-1">
                {platformAvg !== null ? (platformAvg >= 75 ? 'Class performing well ✓' : platformAvg >= 55 ? 'Needs attention' : 'At risk — review topics') : 'No graded submissions yet'}
              </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-200" />
            </div>
          </div>
          
          <div className="bg-[#dc143c]/20 backdrop-blur-md border border-[#dc143c]/30 p-6 rounded-2xl flex items-center justify-between hover:bg-[#dc143c]/30 transition-colors">
            <div>
              <div className="text-red-200/80 text-sm font-semibold uppercase tracking-wider mb-1">Proctoring Alerts</div>
              <div className="text-3xl font-bold text-white">0</div>
              <div className="text-sm text-red-200/60 mt-1">All clear across active tests</div>
            </div>
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-300" />
            </div>
          </div>
        </div>
      </div>

      {/* Classes Section */}
      <div>
        <div className="flex items-center justify-between mb-6 px-2">
          <h3 className="text-2xl font-bold text-[#002147] flex items-center space-x-3">
            <BookOpen className="w-7 h-7 text-[#dc143c]" />
            <span>Your Assigned Classes</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(!profile.assignments || profile.assignments.length === 0) ? (
            <div className="col-span-full p-12 bg-white border border-[#002147]/5 rounded-[2rem] text-center shadow-sm flex flex-col items-center justify-center space-y-4">
              <div className="w-20 h-20 bg-blue-50 text-blue-200 rounded-full flex items-center justify-center">
                <BookOpen className="w-10 h-10" />
              </div>
              <div className="text-[#002147]/60 font-medium text-lg">
                You do not have any active class assignments.<br/>Please contact your school administrator.
              </div>
            </div>
          ) : (
            profile.assignments.map((assignment, index) => (
              <div key={index} className="group bg-white rounded-[2rem] shadow-sm hover:shadow-xl border border-[#002147]/5 overflow-hidden transition-all duration-300 hover:-translate-y-1 relative flex flex-col h-full">
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-50 to-transparent rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-700 pointer-events-none"></div>
                
                <div className="p-8 relative z-10 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="inline-block px-3 py-1 bg-[#002147]/5 text-[#002147] rounded-lg text-xs font-bold uppercase tracking-wider mb-4">
                        Class {assignment.class}
                      </div>
                      <h4 className="text-3xl font-extrabold text-[#002147] mb-1">{assignment.subject}</h4>
                    </div>
                    <div className="w-14 h-14 bg-gradient-to-br from-[#002147] to-[#003b80] text-white rounded-2xl flex items-center justify-center shadow-md rotate-3 group-hover:rotate-12 transition-transform duration-300 flex-shrink-0">
                      <BookOpen className="w-7 h-7" />
                    </div>
                  </div>
                  
                  <div className="mt-auto pt-8 grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => openPostModal(assignment.class, assignment.subject)}
                      className="flex items-center justify-center space-x-2 bg-[#dc143c] hover:bg-[#b01030] text-white py-3.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Post Task</span>
                    </button>
                    <button 
                      onClick={() => openTaskModal(assignment.class, assignment.subject)}
                      className="flex items-center justify-center space-x-2 bg-[#f8fafc] hover:bg-[#002147] border border-[#002147]/10 text-[#002147] hover:text-white py-3.5 rounded-xl text-sm font-bold transition-all active:scale-95 group/btn"
                    >
                      <CheckSquare className="w-4 h-4 opacity-50 group-hover/btn:opacity-100" />
                      <span>Grading</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Post Assignment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#002147]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-[#002147]/10 bg-[#f8fafc]">
              <div>
                <h3 className="text-xl font-bold text-[#002147]">Post New Task</h3>
                <p className="text-sm text-[#002147]/60 mt-1">For Class {selectedClass} • {selectedSubject}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-[#002147]/40 hover:text-[#dc143c] transition-colors p-2 bg-white rounded-full border border-[#002147]/10 shadow-sm">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              {postSuccess ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Send className="w-8 h-8" />
                  </div>
                  <h4 className="text-xl font-bold text-[#002147]">Successfully Posted!</h4>
                  <p className="text-[#002147]/60 mt-2">The students in {selectedClass} have been notified.</p>
                </div>
              ) : (
                <form onSubmit={handlePostAssignment} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#002147]/70 mb-1">Task Title</label>
                    <input 
                      required 
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="e.g. Chapter 4 Exercise" 
                      className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20" 
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#002147]/70 mb-1">Type</label>
                      <select 
                        value={type}
                        onChange={e => setType(e.target.value)}
                        className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
                      >
                        <option value="homework">Homework</option>
                        <option value="video">Video Assignment</option>
                        <option value="announcement">Announcement</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#002147]/70 mb-1">Due Date</label>
                      <input 
                        type="date"
                        required 
                        value={dueDate}
                        onChange={e => setDueDate(e.target.value)}
                        className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20" 
                      />
                    </div>
                                    {/* ══ UPLOAD QUESTION PAPER (Primary) ══ */}
                  <div className="border-2 border-dashed border-[#002147]/20 rounded-2xl overflow-hidden bg-[#f8fafc]">
                    <div className="px-4 py-3 bg-[#002147] flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-blue-200" />
                      <h4 className="text-sm font-black text-white">Upload Question Paper</h4>
                      <span className="ml-auto text-[10px] font-bold text-blue-200 bg-white/10 px-2 py-0.5 rounded-full">Image / PDF</span>
                    </div>

                    {questionPaperPreview ? (
                      <div className="p-3 space-y-2">
                        {questionPaperFile?.type.startsWith('image/') ? (
                          <img src={questionPaperPreview} alt="Question Paper" className="w-full rounded-xl border border-[#002147]/10 max-h-64 object-contain bg-white" />
                        ) : (
                          <div className="flex items-center gap-3 bg-white border border-[#002147]/10 rounded-xl p-3">
                            <FileText className="w-8 h-8 text-[#002147]" />
                            <div>
                              <p className="text-sm font-bold text-[#002147]">{questionPaperFile?.name}</p>
                              <p className="text-xs text-gray-400">{questionPaperFile ? (questionPaperFile.size / 1024).toFixed(0) + ' KB' : ''}</p>
                            </div>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => { setQuestionPaperFile(null); setQuestionPaperPreview(null); }}
                          className="w-full text-xs font-bold text-red-500 hover:text-red-700 py-1.5 flex items-center justify-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Remove & Upload Different File
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center py-8 px-4 cursor-pointer hover:bg-[#002147]/5 transition-colors">
                        <div className="w-12 h-12 bg-[#002147]/10 rounded-2xl flex items-center justify-center mb-3">
                          <ImageIcon className="w-6 h-6 text-[#002147]" />
                        </div>
                        <p className="text-sm font-black text-[#002147] mb-1">Click to upload question paper</p>
                        <p className="text-xs text-gray-400">Supports: JPG, PNG, PDF — students will see it directly</p>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setQuestionPaperFile(file);
                            if (file.type.startsWith('image/')) {
                              const url = URL.createObjectURL(file);
                              setQuestionPaperPreview(url);
                            } else {
                              setQuestionPaperPreview('pdf');
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>

                  {/* ── Instructions (optional) ── */}
                  <div>
                    <label className="block text-sm font-medium text-[#002147]/70 mb-1">Instructions <span className="text-[#002147]/40 font-normal">(optional)</span></label>
                    <textarea 
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={2} 
                      placeholder="e.g. Answer all questions. Show your working." 
                      className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
                    ></textarea>
                  </div>

                  {/* ── Type Questions Manually (secondary option) ── */}
                  <details className="group border border-[#002147]/10 rounded-2xl overflow-hidden">
                    <summary className="flex items-center justify-between bg-[#002147]/5 px-4 py-3 cursor-pointer list-none">
                      <h4 className="text-sm font-black text-[#002147] flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Or Type Questions Manually
                        {homeworkQuestions.filter(q=>q.text.trim()).length > 0 && (
                          <span className="bg-[#002147] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                            {homeworkQuestions.filter(q=>q.text.trim()).length} Q
                          </span>
                        )}
                      </h4>
                      <Plus className="w-4 h-4 text-[#002147] group-open:rotate-45 transition-transform" />
                    </summary>
                    <div className="p-3 space-y-2">
                      {homeworkQuestions.map((q, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="w-6 h-6 bg-[#002147] text-white rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 mt-1.5">{i+1}</span>
                          <textarea
                            value={q.text}
                            onChange={e => setHomeworkQuestions(prev => prev.map((x,j) => j===i ? {...x, text:e.target.value} : x))}
                            placeholder={`Question ${i+1}...`}
                            rows={2}
                            className="flex-1 bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-3 py-2 text-sm text-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]/20 resize-none"
                          />
                          <input
                            type="number"
                            min="0"
                            value={q.marks}
                            onChange={e => setHomeworkQuestions(prev => prev.map((x,j) => j===i ? {...x, marks:e.target.value} : x))}
                            placeholder="Mks"
                            className="w-14 bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-2 py-2 text-sm text-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]/20 text-center shrink-0 mt-1.5"
                          />
                          <button
                            type="button"
                            onClick={() => setHomeworkQuestions(prev => prev.filter((_,j) => j!==i))}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors mt-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setHomeworkQuestions(prev => [...prev, {text:'', marks:''}])}
                        className="w-full flex items-center justify-center gap-1 text-xs font-bold text-[#002147] bg-[#002147]/5 hover:bg-[#002147]/10 py-2 rounded-xl transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Add Question
                      </button>
                    </div>
                  </details>

                  <button 
                    disabled={isPosting || uploadingQP}
                    type="submit" 
                    className="w-full bg-[#002147] text-white py-3 rounded-xl font-bold hover:bg-[#002147]/90 transition-colors mt-2 disabled:opacity-50 flex justify-center items-center space-x-2"
                  >
                    {uploadingQP ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/><span>Uploading...</span></> :
                     isPosting ? <span>Posting...</span> : 
                     <><Send className="w-5 h-5"/><span>Post to {selectedClass}</span></>}
                  </button>

                </form>
              )}
            </div>
          </div>
        </div>
      )}
            {/* Class Tasks Modal */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-[#002147]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-[#002147]/10 bg-[#f8fafc] shrink-0">
              <div>
                <h3 className="text-2xl font-bold text-[#002147]">Class Task Manager</h3>
                <p className="text-[#002147]/60 mt-1 font-medium">Class {taskModalClass} • {taskModalSubject}</p>
              </div>
              <button onClick={() => setIsTaskModalOpen(false)} className="text-[#002147]/40 hover:text-[#dc143c] transition-colors p-3 bg-white rounded-full border border-[#002147]/10 shadow-sm hover:shadow active:scale-95">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12">
              <div className="md:col-span-4 border-r border-[#002147]/10 bg-[#f8fafc]/50 p-6 overflow-y-auto">
                <h4 className="font-bold text-[#002147] mb-4 flex items-center justify-between">
                  <span>Assigned Tasks</span>
                  <span className="text-xs bg-[#002147]/10 px-2 py-1 rounded-md">{classTasks.length}</span>
                </h4>
                
                <div className="space-y-3">
                  {classTasks.length === 0 ? <p className="text-sm text-[#002147]/60 p-4 border border-dashed rounded-xl border-[#002147]/20 text-center">No tasks posted for this class yet.</p> : null}
                  {classTasks.map(task => (
                    <div 
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={`w-full text-left p-4 rounded-xl cursor-pointer transition-all border ${selectedTask?.id === task.id ? 'bg-white border-[#002147] shadow-md ring-1 ring-[#002147]' : 'bg-white border-[#002147]/10 hover:border-[#002147]/30 hover:shadow-sm'}`}
                    >
                      <div className="font-bold text-[#002147] leading-tight">{task.title}</div>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-xs font-semibold text-[#002147]/60 uppercase tracking-wider">{task.type}</span>
                        {task.isCompleted ? (
                           <span className="text-[10px] font-extrabold uppercase tracking-wider bg-green-100 text-green-700 px-2 py-1 rounded-md">Completed</span>
                        ) : (
                           <span className="text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-1 rounded-md">Pending</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="md:col-span-8 p-6 lg:p-8 bg-white overflow-y-auto relative">
                {selectedTask ? (
                  <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-6 bg-[#f8fafc] p-6 rounded-2xl border border-[#002147]/5">
                      <div>
                        <div className="inline-block px-3 py-1 bg-white border border-[#002147]/10 rounded-lg text-xs font-bold uppercase tracking-wider text-[#002147]/60 mb-3">{selectedTask.type}</div>
                        <h4 className="font-extrabold text-2xl text-[#002147] tracking-tight">{selectedTask.title}</h4>
                        <div className="text-[#002147]/60 mt-1 font-medium text-sm">Due: {new Date(selectedTask.dueDate).toLocaleDateString()}</div>
                      </div>
                      {/* Submission counter - clear and correct */}
                      <div className="flex flex-col items-end gap-2">
                        <div className="bg-white border border-[#002147]/10 rounded-xl px-4 py-2 text-center shadow-sm">
                          <div className="text-2xl font-black text-[#002147]">
                            <span className="text-emerald-600">{selectedTask.submittedStudentIds.size}</span>
                            <span className="text-gray-300 mx-1">/</span>
                            <span>{classStudents.length}</span>
                          </div>
                          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Students Submitted</div>
                        </div>
                        <div className="flex gap-2 mt-2">
                          {selectedTask.isCompleted && (
                            <button
                              onClick={() => {
                                // Archive visually but don't delete
                                setClassTasks(prev => prev.filter(t => t.id !== selectedTask.id));
                                setSelectedTask(null);
                              }}
                              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center space-x-1.5"
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                              <span>Archive</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteTask(selectedTask.id)}
                            className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center space-x-1.5"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Submitted */}
                      <div>
                        <h5 className="font-bold text-emerald-700 mb-3 flex items-center text-sm pb-2 border-b border-emerald-100">
                          <CheckSquare className="w-4 h-4 mr-2"/>Submitted ({selectedTask.submittedStudentIds.size})
                        </h5>
                        <div className="space-y-2">
                          {classStudents.filter(s => selectedTask.submittedStudentIds.has(s.id)).length === 0 && (
                            <div className="text-sm text-gray-400 italic p-4 bg-gray-50 rounded-xl text-center">No one has submitted yet.</div>
                          )}
                          {classStudents.filter(s => selectedTask.submittedStudentIds.has(s.id)).map(student => {
                            const sub = selectedTask.submissionsMap?.[student.id];
                            const imgs: string[] = sub?.imageUrls || (sub?.imageUrl ? [sub.imageUrl] : []);
                            const score = sub?.score ?? null;
                            const maxScore = sub?.maxScore || sub?.total || null;
                            const approved = sub?.teacherApproved;
                            return (
                              <div
                                key={student.id}
                                className="bg-white border border-emerald-200/60 shadow-sm p-3 rounded-xl group"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center space-x-2 min-w-0">
                                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs shrink-0">{student.name.charAt(0)}</div>
                                    <div className="min-w-0">
                                      <p className="font-bold text-[#002147] text-sm truncate">{student.name}</p>
                                      <p className="text-xs text-gray-400">{student.studentClass}</p>
                                    </div>
                                  </div>
                                  {/* Score badge */}
                                  {approved && score !== null && maxScore ? (
                                    <span className="shrink-0 bg-emerald-100 text-emerald-700 font-black text-xs px-2 py-1 rounded-lg">{score}/{maxScore}</span>
                                  ) : sub?.aiGraded && score !== null ? (
                                    <span className="shrink-0 bg-blue-50 text-blue-600 font-black text-xs px-2 py-1 rounded-lg">AI: {score}/{maxScore}</span>
                                  ) : (
                                    <span className="shrink-0 bg-amber-50 text-amber-600 font-bold text-xs px-2 py-1 rounded-lg">Pending Grade</span>
                                  )}
                                </div>
                                {/* Thumbnails */}
                                {imgs.length > 0 && (
                                  <div className="flex gap-1.5 mt-2 flex-wrap">
                                    {imgs.slice(0, 4).map((url, i) => (
                                      <img key={i} src={url} alt={`pg${i+1}`} className="w-10 h-10 object-cover rounded-lg border border-gray-100" />
                                    ))}
                                    {imgs.length > 4 && <span className="text-xs text-gray-400 self-center">+{imgs.length - 4} more</span>}
                                  </div>
                                )}
                                {/* Text preview */}
                                {!imgs.length && sub?.text && (
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-1 italic">"{sub.text}"</p>
                                )}
                                {/* Grade / View button */}
                                <button
                                  onClick={() => approved
                                    ? setViewSubmission({ sub, student, taskId: selectedTask.id })
                                    : router.push(`/teacher/grading`)
                                  }
                                  className={`mt-2 w-full text-xs font-bold rounded-lg py-1.5 transition-colors ${
                                    approved
                                      ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                                      : 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                                  }`}
                                >
                                  {approved ? '✓ Graded — View Details' : '→ Grade Now'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Not Submitted */}
                      <div>
                        <h5 className="font-bold text-amber-600 mb-3 flex items-center text-sm pb-2 border-b border-amber-100">
                          <Activity className="w-4 h-4 mr-2"/>Not Submitted ({classStudents.filter(s => !selectedTask.submittedStudentIds.has(s.id)).length})
                        </h5>
                        <div className="space-y-2">
                          {classStudents.filter(s => !selectedTask.submittedStudentIds.has(s.id)).length === 0 && (
                            <div className="text-sm text-gray-400 italic p-4 bg-gray-50 rounded-xl text-center">Everyone submitted! 🎉</div>
                          )}
                          {classStudents.filter(s => !selectedTask.submittedStudentIds.has(s.id)).map(student => (
                            <div key={student.id} className="bg-white border border-amber-200/60 shadow-sm p-3 rounded-xl flex justify-between items-center">
                              <div className="flex items-center space-x-2">
                                <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-700 font-bold text-xs">{student.name.charAt(0)}</div>
                                <p className="font-bold text-[#002147] text-sm">{student.name}</p>
                              </div>
                              <button
                                onClick={() => handleSendReminder(student.name)}
                                className="text-xs font-bold bg-amber-100 text-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-200 transition-colors"
                              >
                                Remind
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-[#002147]/40 text-center p-12 bg-[#f8fafc] rounded-3xl border-2 border-dashed border-[#002147]/10">
                    <div className="w-20 h-20 bg-white rounded-full shadow-sm flex items-center justify-center mb-6">
                      <CheckSquare className="w-10 h-10 text-[#002147]/20" />
                    </div>
                    <h3 className="text-xl font-bold text-[#002147]/60 mb-2">Select a Task</h3>
                    <p className="max-w-xs">Click on an assigned task from the left panel to view completion status and evaluate student submissions.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          SUBMISSION DETAIL OVERLAY
      ═══════════════════════════════════════════════════════ */}
      {viewSubmission && (() => {
        const { sub, student } = viewSubmission;
        const imgs: string[] = sub?.imageUrls || (sub?.imageUrl ? [sub.imageUrl] : []);
        const score = sub?.score ?? sub?.totalScore ?? null;
        const maxScore = sub?.maxScore ?? sub?.maxTotalScore ?? null;
        const pct = score !== null && maxScore ? Math.round((score / maxScore) * 100) : null;
        const aiR = sub?.aiResult;
        return (
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setViewSubmission(null)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <button onClick={() => setViewSubmission(null)}
                    className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors">
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                  </button>
                  <div>
                    <p className="font-black text-[#002147] text-base">{student.name}</p>
                    <p className="text-xs text-gray-400 font-medium">{student.studentClass}</p>
                  </div>
                </div>
                {score !== null && maxScore ? (
                  <div className={`px-4 py-2 rounded-2xl font-black text-lg border-2 ${
                    pct! >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : pct! >= 60 ? 'text-amber-700 bg-amber-50 border-amber-200'
                    : 'text-red-700 bg-red-50 border-red-200'
                  }`}>
                    {score}/{maxScore}
                    {pct !== null && <span className="text-xs font-bold ml-1 opacity-70">({pct}%)</span>}
                  </div>
                ) : (
                  <span className="px-4 py-2 rounded-2xl bg-blue-50 text-blue-600 text-sm font-black border-2 border-blue-200">AI Graded</span>
                )}
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">

                {/* Images */}
                {imgs.length > 0 && (
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" /> Submitted Images
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {imgs.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt={`Page ${i+1}`}
                            className="w-full aspect-[3/4] object-cover rounded-xl border border-gray-100 hover:scale-105 transition-transform" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Text answer */}
                {!imgs.length && sub?.text && (
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" /> Student's Answer
                    </p>
                    <p className="text-sm text-[#002147]/80 font-medium leading-relaxed whitespace-pre-line">{sub.text}</p>
                  </div>
                )}

                {/* AI Evaluation */}
                {aiR && (
                  <div className="space-y-3">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5" /> AI Evaluation
                    </p>

                    {/* Per-question breakdown */}
                    {Array.isArray(aiR.questions) && aiR.questions.length > 0 && (
                      <div className="space-y-2">
                        {aiR.questions.map((q: any, i: number) => {
                          const qPct = q.maxScore > 0 ? Math.round((q.score / q.maxScore) * 100) : 0;
                          return (
                            <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <p className="text-xs font-bold text-[#002147] flex-1 leading-relaxed">{q.question}</p>
                                <span className={`shrink-0 text-xs font-black px-2 py-0.5 rounded-lg ${
                                  qPct >= 80 ? 'bg-emerald-50 text-emerald-700'
                                  : qPct >= 50 ? 'bg-amber-50 text-amber-700'
                                  : 'bg-red-50 text-red-700'
                                }`}>{q.score}/{q.maxScore}</span>
                              </div>
                              {q.feedback && <p className="text-[11px] text-gray-500 font-medium leading-relaxed">{q.feedback}</p>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Summary */}
                    {aiR.summary && (
                      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                        <p className="text-xs font-black text-blue-400 uppercase tracking-wider mb-1">AI Summary</p>
                        <p className="text-sm text-blue-900 font-medium leading-relaxed">{aiR.summary}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Teacher note */}
                {sub?.teacherNote && (
                  <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
                    <p className="text-xs font-black text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" /> Your Note to Student
                    </p>
                    <p className="text-sm text-amber-900 font-medium leading-relaxed whitespace-pre-line">{sub.teacherNote}</p>
                  </div>
                )}

                {/* Status badge */}
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold ${
                  sub?.teacherApproved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  {sub?.teacherApproved ? 'Teacher reviewed & approved' : 'AI graded — awaiting teacher review'}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-100 flex gap-3">
                <button onClick={() => setViewSubmission(null)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 transition-colors">
                  Close
                </button>
                <button onClick={() => { setViewSubmission(null); router.push('/teacher/grading'); }}
                  className="flex-1 py-2.5 rounded-xl bg-[#002147] text-white font-bold text-sm hover:bg-blue-800 transition-colors flex items-center justify-center gap-2">
                  Open in Grading Gallery <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
