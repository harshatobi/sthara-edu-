'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Activity, AlertTriangle, Users, BookOpen, LogOut, Plus, X, Send, CheckSquare, Trash2,
  Sparkles, ClipboardList, BarChart2, Brain, BookMarked, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import Link from 'next/link';

export default function TeacherDashboard() {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  
  // Assignment Form State
  const [title, setTitle] = useState('');
  const [type, setType] = useState('homework');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [homeworkQuestions, setHomeworkQuestions] = useState<{id: string; text: string; marks: string}[]>([]);
  const [questionPaperFile, setQuestionPaperFile] = useState<File | null>(null);
  const [questionPaperPreview, setQuestionPaperPreview] = useState<string | null>(null);
  const [uploadingQP, setUploadingQP] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postSuccess, setPostSuccess] = useState(false);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [availableUnits, setAvailableUnits] = useState<{id: string, label: string}[]>([]);

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

  // Teacher grade editing
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editScore, setEditScore] = useState('');
  const [editMaxScore, setEditMaxScore] = useState('');
  const [editFeedback, setEditFeedback] = useState('');
  const [savingGrade, setSavingGrade] = useState(false);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.schoolId || !profile?.assignments?.length) { setPlatformLoading(false); return; }
    const compute = async () => {
      try {
        const { data: assignRows } = await supabase
          .from('assignments')
          .select('id')
          .eq('school_id', profile.schoolId);

        const assignIds = (assignRows || []).map(a => a.id);
        if (assignIds.length > 0) {
          const { data: subRows } = await supabase
            .from('submissions')
            .select('score, max_score, teacher_approved')
            .in('assignment_id', assignIds);

          let totalScore = 0, totalMax = 0;
          (subRows || []).forEach(s => {
            if (s.teacher_approved === false) return;
            if (s.score !== null && s.max_score) {
              totalScore += s.score;
              totalMax += s.max_score;
            }
          });
          setPlatformAvg(totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null);
        }
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
    setSelectedUnits([]);

    let units: {id: string, label: string}[] = [
      { id: 'unit_1', label: 'Unit I' },
      { id: 'unit_2', label: 'Unit II' },
      { id: 'unit_3', label: 'Unit III' },
      { id: 'unit_4', label: 'Unit IV' },
      { id: 'unit_5', label: 'Unit V' },
    ];
    setAvailableUnits(units);
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
      const authToken = await getAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      };

      const studRes = await fetch('/api/teacher/get-students', {
        method: 'POST', headers,
        body: JSON.stringify({ schoolId: profile.schoolId, classFilter: className }),
      });
      const studData = await studRes.json();
      let students: any[] = studData.students || [];
      setClassStudents(students);

      const assignRes = await fetch('/api/teacher/get-assignments', {
        method: 'POST', headers,
        body: JSON.stringify({ schoolId: profile.schoolId, teacherId: profile.uid }),
      });
      const assignData = await assignRes.json();
      const allAssignments: any[] = assignData.assignments || [];

      // Must match BOTH class AND subject — using || caused cross-subject bleed
      const filtered = allAssignments.filter(a => a.class === className && a.subject === subjectName);

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
    if (!window.confirm('Are you sure you want to permanently delete this assignment and all its submissions?')) return;
    
    try {
      const authToken = await getAuthToken();
      const res = await fetch('/api/teacher/delete-assignment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ assignmentId: taskId, schoolId: profile.schoolId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Delete failed');
      
      setClassTasks(prev => prev.filter(t => t.id !== taskId));
      setSelectedTask(null);
    } catch (e: any) {
      console.error('Failed to delete assignment:', e);
      alert('Failed to delete assignment: ' + e.message);
    }
  };

  const handlePostAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.schoolId) return;

    setIsPosting(true);
    try {
      const authToken = await getAuthToken();

      let questionPaperUrl: string | null = null;
      let questionPaperType: string | null = null;
      if (questionPaperFile) {
        setUploadingQP(true);
        const ext = questionPaperFile.name.split('.').pop() || 'file';
        const path = `${profile.schoolId}/${Date.now()}_${questionPaperFile.name}`;
        const { error: uploadErr } = await supabase.storage
          .from('question-papers')
          .upload(path, questionPaperFile, { contentType: questionPaperFile.type, upsert: true });

        if (uploadErr) throw uploadErr;
        const { data: publicUrlData } = supabase.storage
          .from('question-papers')
          .getPublicUrl(path);

        questionPaperUrl = publicUrlData.publicUrl;
        questionPaperType = questionPaperFile.type.startsWith('image/') ? 'image' : 'pdf';
        setUploadingQP(false);
      }

      // Compute total marks from per-question marks (sum), so the AI always
      // knows the real ceiling and max_score is stored correctly in the DB.
      const filteredQs = homeworkQuestions.filter(q => q.text.trim());
      const computedTotalMarks = filteredQs.reduce((sum, q) => sum + (q.marks ? Number(q.marks) : 0), 0) || null;

      const res = await fetch('/api/teacher/post-assignment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          schoolId: profile.schoolId,
          title,
          type,
          dueDate,
          description,
          questions: filteredQs.map(q => ({
            text: q.text.trim(),
            marks: q.marks ? Number(q.marks) : null,
          })),
          totalMarks: computedTotalMarks,   // ← always send the real total
          questionPaperUrl,
          questionPaperType,
          class: selectedClass,
          subject: selectedSubject,
          teacherId: profile.uid,
          teacherName: profile.name,
          units: selectedUnits,
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

  // Unit ID → display label
  const UNIT_LABELS: Record<string, string> = {
    unit_1: 'Unit I', unit_2: 'Unit II', unit_3: 'Unit III',
    unit_4: 'Unit IV', unit_5: 'Unit V',
  };

  const handleSaveGrade = async (studentId: string, submissionId: string, taskSubject: string) => {
    if (!profile?.uid) return;
    setSavingGrade(true);
    try {
      const score = parseFloat(editScore);
      const maxScore = parseFloat(editMaxScore);
      if (isNaN(score) || isNaN(maxScore) || maxScore <= 0) {
        alert('Please enter valid score and max score values.');
        return;
      }
      const pct = Math.round((score / maxScore) * 100);
      const grade = `${score}/${maxScore}`;

      // Update submission with teacher-corrected grade (fallback gracefully if teacher_note column missing)
      let { error: subErr } = await supabase
        .from('submissions')
        .update({
          final_grade: grade,
          score: score,
          max_score: maxScore,
          teacher_approved: true,
          teacher_note: editFeedback || null,
        })
        .eq('id', submissionId);

      if (subErr && (subErr.message.includes('teacher_note') || subErr.code === 'PGRST204')) {
        const { error: fallbackErr } = await supabase
          .from('submissions')
          .update({
            final_grade: grade,
            score: score,
            max_score: maxScore,
            teacher_approved: true,
          })
          .eq('id', submissionId);
        subErr = fallbackErr;
      }

      if (subErr) throw subErr;

      // ── Trigger TML Score Computation & Persistence ────────────────────────
      fetch('/api/tml/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, subject: taskSubject }),
      }).catch(e => console.warn('[TML AutoCompute] error:', e));

      // ── Update student memory_profile with per-TOPIC scores ──────────────
      try {
        const { data: userRow } = await supabase
          .from('users')
          .select('memory_profile')
          .eq('id', studentId)
          .maybeSingle();

        const mem = (userRow?.memory_profile as any) || {};
        const knownSet   = new Set<string>(mem.known || []);
        const struggling = new Set<string>(mem.struggling || []);
        // Existing per-topic score map: { "Subject__unit_1": 85, ... }
        const topicScores: Record<string, number> = mem.topicScores || {};

        // Get the units[] tagged on this specific assignment
        const assignmentUnits: string[] = selectedTask?.units || [];

        if (assignmentUnits.length > 0) {
          // Store a score entry for each tagged unit
          assignmentUnits.forEach((unitId: string) => {
            const key = `${taskSubject}__${unitId}`;
            topicScores[key] = pct;
            if (pct >= 70) {
              knownSet.add(key);
              struggling.delete(key);
            } else if (pct < 50) {
              struggling.add(key);
              knownSet.delete(key);
            }
          });
        } else {
          // No units tagged — fall back to assignment title entry instead of 'general'
          const topicName = selectedTask?.title
            ? selectedTask.title.trim().charAt(0).toUpperCase() + selectedTask.title.trim().slice(1)
            : 'Core Concepts';
          const key = `${taskSubject}__${topicName}`;
          topicScores[key] = pct;
          if (pct >= 70) { knownSet.add(key); struggling.delete(key); }
          else if (pct < 50) { struggling.add(key); knownSet.delete(key); }
        }

        await supabase
          .from('users')
          .update({
            memory_profile: {
              ...mem,
              topicScores,
              known: Array.from(knownSet),
              struggling: Array.from(struggling),
              lastUpdated: new Date().toISOString(),
            },
          })
          .eq('id', studentId);
      } catch (masteryErr) {
        console.warn('Mastery update failed:', masteryErr);
      }

      // Refresh local state
      setClassTasks(prev => prev.map(t => {
        if (t.id !== selectedTask?.id) return t;
        const newSubMap = { ...t.submissionsMap };
        newSubMap[studentId] = { ...newSubMap[studentId], score, maxScore, finalGrade: grade, teacherApproved: true };
        return { ...t, submissionsMap: newSubMap };
      }));

      setEditingSubId(null);
      setExpandedStudentId(null);

      const unitNames = (selectedTask?.units || [])
        .map((u: string) => UNIT_LABELS[u] || u).join(', ');
      alert(`✅ Grade saved: ${grade} (${pct}%)\nTopics updated: ${unitNames || taskSubject}`);
    } catch (err: any) {
      alert('Failed to save grade: ' + err.message);
    } finally {
      setSavingGrade(false);
    }
  };

  return (
    <div className="min-h-screen font-sans animate-in fade-in duration-500 space-y-8 max-w-7xl mx-auto">
      {/* Header section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#002147] via-[#003b80] to-[#002147] rounded-[2rem] p-8 sm:p-12 text-white shadow-xl">
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

        {/* High-level Stats */}
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

      {/* ── Teacher Tools ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-6 px-2">
          <h3 className="text-2xl font-bold text-[#002147] flex items-center space-x-3">
            <Zap className="w-7 h-7 text-amber-500" />
            <span>Teacher Tools</span>
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            {
              href: '/teacher/homework',
              icon: <Sparkles className="w-6 h-6" />,
              label: 'AI Homework',
              desc: 'Generate homework sets',
              gradient: 'from-violet-500 to-indigo-600',
              bg: 'bg-violet-50',
              text: 'text-violet-700',
            },
            {
              href: '/teacher/syllabus',
              icon: <BookMarked className="w-6 h-6" />,
              label: 'Syllabus Planner',
              desc: 'Plan topics by month',
              gradient: 'from-blue-500 to-cyan-600',
              bg: 'bg-blue-50',
              text: 'text-blue-700',
            },
            {
              href: '/teacher/quiz',
              icon: <ClipboardList className="w-6 h-6" />,
              label: 'Quiz Creator',
              desc: 'AI quiz generation',
              gradient: 'from-emerald-500 to-teal-600',
              bg: 'bg-emerald-50',
              text: 'text-emerald-700',
            },
            {
              href: '/teacher/heatmap',
              icon: <BarChart2 className="w-6 h-6" />,
              label: 'Heatmap',
              desc: 'Class performance map',
              gradient: 'from-orange-500 to-red-500',
              bg: 'bg-orange-50',
              text: 'text-orange-700',
            },
            {
              href: '/teacher/ai-assistant',
              icon: <Brain className="w-6 h-6" />,
              label: 'AI Assistant',
              desc: 'Lesson & content help',
              gradient: 'from-pink-500 to-rose-600',
              bg: 'bg-pink-50',
              text: 'text-pink-700',
            },
            {
              href: '/teacher/mastery',
              icon: <Activity className="w-6 h-6" />,
              label: 'Mastery Tracker',
              desc: 'Student skill insights',
              gradient: 'from-amber-500 to-yellow-500',
              bg: 'bg-amber-50',
              text: 'text-amber-700',
            },
          ].map(tool => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group flex flex-col items-center text-center p-5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
            >
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${tool.gradient} text-white flex items-center justify-center mb-3 shadow-md group-hover:scale-110 transition-transform duration-200`}>
                {tool.icon}
              </div>
              <div className="font-bold text-[#002147] text-sm">{tool.label}</div>
              <div className="text-xs text-gray-400 mt-0.5 leading-tight">{tool.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Post Assignment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#002147]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-[#002147]/10 bg-[#f8fafc]">
              <div>
                <h3 className="text-xl font-bold text-[#002147]">Post New Task</h3>
                <p className="text-sm text-[#002147]/60 mt-1">For Class {selectedClass} • {selectedSubject}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-[#002147]/40 hover:text-[#dc143c] transition-colors p-2 bg-white rounded-full border border-[#002147]/10 shadow-sm">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
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
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-[#002147]/70 mb-1">Description / Instructions</label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Describe the homework task, what students need to do..."
                      className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20 resize-none"
                    />
                  </div>

                  {/* Questions */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-[#002147]/70">Questions (optional)</label>
                      <button
                        type="button"
                        onClick={() => setHomeworkQuestions(prev => [...prev, { id: String(Date.now()), text: '', marks: '' }])}
                        className="text-xs font-bold text-[#dc143c] border border-[#dc143c]/30 px-3 py-1 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        + Add Question
                      </button>
                    </div>
                    <div className="space-y-2">
                      {homeworkQuestions.map((q, idx) => (
                        <div key={q.id} className="flex gap-2 items-start">
                          <div className="w-6 h-6 bg-[#002147] text-white rounded-full flex items-center justify-center text-xs font-bold mt-3 shrink-0">{idx+1}</div>
                          <input
                            value={q.text}
                            onChange={e => setHomeworkQuestions(prev => prev.map((p, i) => i === idx ? { ...p, text: e.target.value } : p))}
                            placeholder={`Question ${idx + 1}`}
                            className="flex-1 bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-3 py-2 text-[#002147] text-sm focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
                          />
                          <input
                            type="number"
                            value={q.marks}
                            onChange={e => setHomeworkQuestions(prev => prev.map((p, i) => i === idx ? { ...p, marks: e.target.value } : p))}
                            placeholder="Marks"
                            className="w-16 bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-2 py-2 text-[#002147] text-sm focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
                          />
                          <button
                            type="button"
                            onClick={() => setHomeworkQuestions(prev => prev.filter((_, i) => i !== idx))}
                            className="mt-2 text-red-400 hover:text-red-600 text-lg font-black"
                          >×</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Question Paper Upload */}
                  <div>
                    <label className="block text-sm font-medium text-[#002147]/70 mb-1">Attach Question Paper (PDF / Image)</label>
                    <label className="flex items-center gap-3 cursor-pointer bg-[#f8fafc] border border-dashed border-[#002147]/20 rounded-xl px-4 py-3 hover:border-[#dc143c]/40 hover:bg-red-50/20 transition-all">
                      <span className="text-2xl">📎</span>
                      <div>
                        <p className="text-sm font-medium text-[#002147]/70">
                          {questionPaperFile ? questionPaperFile.name : 'Click to upload PDF or image'}
                        </p>
                        <p className="text-xs text-[#002147]/40">PDF, PNG, JPG up to 10MB</p>
                      </div>
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        className="sr-only"
                        onChange={e => {
                          const f = e.target.files?.[0] || null;
                          setQuestionPaperFile(f);
                          setQuestionPaperPreview(f ? URL.createObjectURL(f) : null);
                        }}
                      />
                    </label>
                    {questionPaperPreview && questionPaperFile?.type.startsWith('image/') && (
                      <img src={questionPaperPreview} alt="preview" className="mt-2 max-h-32 rounded-xl border border-gray-200 object-contain" />
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isPosting || uploadingQP}
                    className="w-full py-4 bg-[#dc143c] hover:bg-[#b01030] text-white font-bold rounded-xl transition-all shadow-md disabled:opacity-50 mt-4"
                  >
                    {uploadingQP ? 'Uploading paper...' : isPosting ? 'Posting Task...' : 'Post Task to Students'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Grading / Task Modal ─────────────────────────────────────────── */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-[#002147]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-[#002147]/10 bg-[#f8fafc]">
              <div>
                <h3 className="text-xl font-bold text-[#002147]">Grading & Submissions</h3>
                <p className="text-sm text-[#002147]/60 mt-1">
                  Class {taskModalClass} • {taskModalSubject}
                  <span className="ml-2 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                    {classStudents.length} students
                  </span>
                </p>
              </div>
              <button
                onClick={() => { setIsTaskModalOpen(false); setSelectedTask(null); }}
                className="text-[#002147]/40 hover:text-[#dc143c] transition-colors p-2 bg-white rounded-full border border-[#002147]/10 shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Left: Assignment list */}
              <div className="w-2/5 border-r border-gray-100 overflow-y-auto p-4 space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Assignments ({classTasks.length})</p>
                {classTasks.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 text-sm">No assignments posted yet.</div>
                ) : (
                  classTasks.map(task => {
                    const submittedCount = task.submittedStudentIds?.size ?? 0;
                    const total = classStudents.length;
                    const pct = total > 0 ? Math.round((submittedCount / total) * 100) : 0;
                    const isSelected = selectedTask?.id === task.id;
                    return (
                      <button
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all ${
                          isSelected
                            ? 'bg-[#002147] text-white border-[#002147]'
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <div className={`font-bold text-sm mb-1 ${isSelected ? 'text-white' : 'text-[#002147]'}`}>
                          {task.title}
                        </div>
                        <div className={`text-xs mb-2 ${isSelected ? 'text-blue-200' : 'text-gray-500'}`}>
                          {task.type?.toUpperCase()} · Due {task.due_date || 'N/A'}
                        </div>
                        <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${isSelected ? 'bg-blue-300' : 'bg-indigo-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className={`text-xs mt-1 ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>
                          {submittedCount}/{total} submitted
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Right: Submission details with AI grading + teacher edit */}
              <div className="flex-1 overflow-y-auto p-4">
                {!selectedTask ? (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                    Select an assignment to view submissions
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-[#002147]">{selectedTask.title}</h4>
                      <button
                        onClick={() => handleDeleteTask(selectedTask.id)}
                        className="text-xs text-rose-500 hover:underline flex items-center gap-1 font-bold"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>

                    {classStudents.length === 0 ? (
                      <div className="py-8 text-center text-gray-400 text-sm">No students in this class.</div>
                    ) : (
                      <div className="space-y-3">
                        {classStudents.map((student: any) => {
                          const sub = selectedTask.submissionsMap?.[student.id];
                          const submitted = !!sub;
                          const isExpanded = expandedStudentId === student.id;
                          const aiResult = sub?.aiResult;
                          // Authoritative max = teacher-set marks, NOT the stale DB submission value.
                          // Try: (1) assignment totalMarks, (2) sum of per-question marks, (3) sub.maxScore
                          const perQSum: number = (selectedTask.questions || []).reduce(
                            (s: number, q: any) => s + (Number(q.marks) || 0), 0
                          );
                          const taskTotalMarks: number | null =
                            (selectedTask.totalMarks && Number(selectedTask.totalMarks) > 0)
                              ? Number(selectedTask.totalMarks)
                              : perQSum > 0
                                ? perQSum
                                : null;
                          const scoreNum = sub?.score ?? (sub?.maxScore != null ? 0 : null);
                          const maxNum = taskTotalMarks ?? sub?.maxScore ?? null;
                          const displayScore = sub?.finalGrade
                            || (scoreNum != null && maxNum ? `${scoreNum}/${maxNum}` : null);
                          const pct = scoreNum != null && maxNum ? Math.round((scoreNum / maxNum) * 100) : null;
                          const isEditing = editingSubId === student.id;

                          return (
                            <div key={student.id} className="rounded-2xl border border-gray-200 overflow-hidden">
                              {/* Student row header */}
                              <div
                                className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                                  isExpanded ? 'bg-[#002147] text-white' : 'bg-gray-50 hover:bg-gray-100'
                                }`}
                                onClick={() => {
                                  if (submitted) setExpandedStudentId(isExpanded ? null : student.id);
                                }}
                              >
                                <div>
                                  <div className={`font-bold text-sm ${isExpanded ? 'text-white' : 'text-[#002147]'}`}>{student.name}</div>
                                  <div className={`text-xs ${isExpanded ? 'text-blue-200' : 'text-gray-400'}`}>{student.custom_student_id || student.student_class}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {submitted ? (
                                    <>
                                      {displayScore && (
                                        <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${
                                          pct != null ? (pct >= 70 ? 'bg-emerald-100 text-emerald-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700') : 'bg-blue-50 text-blue-700'
                                        }`}>
                                          {displayScore}
                                        </span>
                                      )}
                                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                        isExpanded ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'
                                      }`}>
                                        {sub?.aiGraded ? '🤖 AI Graded' : '✓ Submitted'}
                                      </span>
                                      {submitted && <span className={`text-xs ${isExpanded ? 'text-blue-200' : 'text-gray-400'}`}>▾</span>}
                                    </>
                                  ) : (
                                    <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">Pending</span>
                                  )}
                                </div>
                              </div>

                              {/* Expanded: AI result + image + teacher edit */}
                              {isExpanded && submitted && (
                                <div className="p-4 space-y-4 bg-white border-t border-gray-100">

                                  {/* Submitted images */}
                                  {(() => {
                                    const rawImgs = sub?.imageUrls || sub?.imageUrl || sub?.image_urls || sub?.attachmentUrl;
                                    const imageList: string[] = Array.isArray(rawImgs)
                                      ? rawImgs
                                      : (typeof rawImgs === 'string' && rawImgs.trim().length > 0 ? [rawImgs.trim()] : []);

                                    if (imageList.length === 0) return null;

                                    return (
                                      <div>
                                        <p className="text-xs font-black text-[#002147] uppercase tracking-wider mb-2">📸 Student's Handwritten Work</p>
                                        <div className="flex flex-wrap gap-3">
                                          {imageList.map((url: string, idx: number) => (
                                            <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="group relative block">
                                              <img
                                                src={url}
                                                alt={`Page ${idx+1}`}
                                                onError={(e) => {
                                                  // Fallback for old 404 links uploaded before storage bucket setup
                                                  (e.target as HTMLElement).style.display = 'none';
                                                  const parent = (e.target as HTMLElement).parentElement;
                                                  if (parent && !parent.querySelector('.img-error-fallback')) {
                                                    const fb = document.createElement('div');
                                                    fb.className = 'img-error-fallback w-32 h-32 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-2 flex flex-col items-center justify-center text-center';
                                                    fb.innerHTML = '<span class="text-xs font-bold text-amber-800">📷 Answer Sheet</span><span class="text-[10px] text-amber-600 mt-1">Uploaded before storage setup</span>';
                                                    parent.appendChild(fb);
                                                  }
                                                }}
                                                className="w-32 h-32 object-cover rounded-2xl border-2 border-indigo-200 group-hover:border-indigo-600 transition-all shadow-sm group-hover:shadow-md"
                                              />
                                              <span className="absolute bottom-1.5 right-1.5 bg-[#002147]/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                Page {idx+1} ↗
                                              </span>
                                            </a>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {/* AI Grading Breakdown */}
                                  {aiResult && (
                                    <div>
                                      <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">🤖 AI Grading Breakdown</p>
                                      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl p-3 border border-indigo-100 mb-2">
                                        <div className="flex items-center justify-between mb-1">
                                          {/* Always show the corrected score using teacher-set marks, not the stale AI-stored grade string */}
                                          <span className="font-black text-indigo-800">{displayScore || aiResult.grade}</span>
                                          <span className="text-xs text-indigo-600 font-semibold">{pct != null ? `${pct}%` : (aiResult.percentageScore != null ? `${aiResult.percentageScore}%` : '')}</span>
                                        </div>
                                        {aiResult.summary && <p className="text-xs text-indigo-700 leading-relaxed">{aiResult.summary}</p>}
                                      </div>
                                      {Array.isArray(aiResult.questions) && (() => {
                                        // The AI may use an internal per-question maxScore (e.g. 1 each)
                                        // but the real assignment total may differ (e.g. 5 total).
                                        // Scale each question's marks to reflect the real total.
                                        const aiInternalTotal = aiResult.questions.reduce(
                                          (s: number, q: any) => s + (parseFloat(q.maxScore) || 1), 0
                                        );
                                        const realTotal = sub?.maxScore || aiResult.maxTotalScore || aiInternalTotal;
                                        const scale = aiInternalTotal > 0 ? realTotal / aiInternalTotal : 1;
                                        return aiResult.questions.map((q: any, qi: number) => {
                                          const rawMax = parseFloat(q.maxScore) || 1;
                                          const rawAwarded = parseFloat(q.awardedScore) ?? 0;
                                          const scaledMax = Math.round(rawMax * scale * 10) / 10;
                                          const scaledAwarded = Math.round(rawAwarded * scale * 10) / 10;
                                          return (
                                            <div key={qi} className="mb-2.5 p-3 bg-gray-50 rounded-xl border border-gray-200">
                                              <div className="flex items-start justify-between gap-2">
                                                <p className="text-xs font-bold text-[#002147] flex-1">{q.questionText || `Q${qi+1}`}</p>
                                                <span className={`text-xs font-black px-2 py-0.5 rounded-lg shrink-0 ${
                                                  q.isFinalAnswerCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                                }`}>
                                                  {scaledAwarded}/{scaledMax}
                                                </span>
                                              </div>
                                              {q.studentWrittenAnswer && (
                                                <p className="text-xs italic text-gray-700 mt-1 bg-white p-2 rounded-lg border border-gray-200 font-serif">
                                                  ✍ Transcribed Answer: "{q.studentWrittenAnswer}"
                                                </p>
                                              )}
                                              {q.whatStudentGotRight && (
                                                <p className="text-xs text-emerald-800 font-semibold mt-1">
                                                  ✅ Correct Parts: {q.whatStudentGotRight}
                                                </p>
                                              )}
                                              {q.lostMarksReason && (
                                                <p className="text-xs text-rose-800 font-bold mt-1 bg-rose-50 p-2 rounded-lg border border-rose-200">
                                                  ⚠ Where Student Went Wrong: {q.lostMarksReason}
                                                  {q.exactStepByStepMistake && (
                                                    <span className="block font-normal mt-0.5 text-[11px] text-rose-700">Step Error: {q.exactStepByStepMistake}</span>
                                                  )}
                                                </p>
                                              )}
                                              {q.howToFix && (
                                                <p className="text-[11px] text-indigo-800 font-semibold mt-1">
                                                  💡 Correction Guide: {q.howToFix}
                                                </p>
                                              )}
                                            </div>
                                          );
                                        });
                                      })()}
                                      {Array.isArray(aiResult.weaknessTags) && aiResult.weaknessTags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {aiResult.weaknessTags.map((tag: string, ti: number) => (
                                            <span key={ti} className="text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">⚡ {tag}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Teacher Grade Edit */}
                                  {!isEditing ? (
                                    <button
                                      onClick={() => {
                                        setEditingSubId(student.id);
                                        setEditScore(String(scoreNum ?? ''));
                                        setEditMaxScore(String(maxNum ?? ''));
                                        setEditFeedback('');
                                      }}
                                      className="w-full py-2.5 rounded-xl border-2 border-dashed border-indigo-300 text-indigo-600 font-bold text-sm hover:bg-indigo-50 transition-colors"
                                    >
                                      ✏️ Override / Confirm Grade
                                    </button>
                                  ) : (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                                      <p className="text-xs font-black text-amber-800 uppercase tracking-wider">Teacher Grade Override</p>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="text-xs font-semibold text-gray-500 mb-1 block">Score</label>
                                          <input
                                            type="number"
                                            value={editScore}
                                            onChange={e => setEditScore(e.target.value)}
                                            className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-sm font-bold text-[#002147] focus:outline-none focus:ring-2 focus:ring-amber-400"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-xs font-semibold text-gray-500 mb-1 block">Out of</label>
                                          <input
                                            type="number"
                                            value={editMaxScore}
                                            onChange={e => setEditMaxScore(e.target.value)}
                                            className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-sm font-bold text-[#002147] focus:outline-none focus:ring-2 focus:ring-amber-400"
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Feedback (optional)</label>
                                        <textarea
                                          rows={2}
                                          value={editFeedback}
                                          onChange={e => setEditFeedback(e.target.value)}
                                          placeholder="Add feedback for the student..."
                                          className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-sm text-[#002147] focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                                        />
                                      </div>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => handleSaveGrade(student.id, sub?.id || student.id, selectedTask.subject)}
                                          disabled={savingGrade}
                                          className="flex-1 py-2.5 bg-[#002147] text-white rounded-xl font-bold text-sm hover:bg-[#003b80] disabled:opacity-50 transition-colors"
                                        >
                                          {savingGrade ? 'Saving...' : '✅ Save & Update Mastery'}
                                        </button>
                                        <button
                                          onClick={() => setEditingSubId(null)}
                                          className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
