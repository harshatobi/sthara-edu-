'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Activity, AlertTriangle, Users, BookOpen, LogOut, Plus, X, Send, CheckSquare, Trash2 } from 'lucide-react';
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
  const [homeworkQuestions, setHomeworkQuestions] = useState<{text: string; marks: string}[]>([]);
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

      const filtered = allAssignments.filter(a => a.class === className || a.subject === subjectName);

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
      const { error } = await supabase
        .from('assignments')
        .delete()
        .eq('id', taskId)
        .eq('school_id', profile.schoolId);

      if (error) throw error;
      
      setClassTasks(prev => prev.filter(t => t.id !== taskId));
      setSelectedTask(null);
      alert("Assignment has been deleted.");
    } catch (e) {
      console.error("Failed to delete assignment:", e);
      alert("Failed to delete assignment. Please try again.");
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

                  <button
                    type="submit"
                    disabled={isPosting || uploadingQP}
                    className="w-full py-4 bg-[#dc143c] hover:bg-[#b01030] text-white font-bold rounded-xl transition-all shadow-md disabled:opacity-50 mt-4"
                  >
                    {isPosting ? 'Posting Task...' : 'Post Task to Students'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
