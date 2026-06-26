'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Activity, AlertTriangle, Users, BookOpen, LogOut, Plus, X, Send, CheckSquare } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
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
  const [isPosting, setIsPosting] = useState(false);
  const [postSuccess, setPostSuccess] = useState(false);

  // Task Modal State
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalClass, setTaskModalClass] = useState('');
  const [taskModalSubject, setTaskModalSubject] = useState('');
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [classTasks, setClassTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);

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
      // 1. Fetch Students in this class
      const usersQ = query(
        collection(db, 'users'), 
        where('schoolId', '==', profile.schoolId), 
        where('role', '==', 'student'), 
        where('studentClass', '==', className)
      );
      const usersSnap = await getDocs(usersQ);
      const students: any[] = [];
      usersSnap.forEach(d => students.push({ id: d.id, ...d.data() }));
      setClassStudents(students);

      // 2. Fetch Assignments
      const q = query(
        collection(db, 'schools', profile.schoolId, 'assignments'),
        where('class', '==', className),
        where('subject', '==', subjectName)
      );
      const snap = await getDocs(q);
      const tasks: any[] = [];
      snap.forEach(d => tasks.push({ id: d.id, ...d.data() }));
      
      // 3. Fetch submissions for each task to determine completion
      const tasksWithStats = await Promise.all(tasks.map(async (task) => {
         const subsSnap = await getDocs(collection(db, 'schools', profile.schoolId, 'assignments', task.id, 'submissions'));
         const submittedStudentIds = new Set<string>();
         subsSnap.forEach(s => {
            submittedStudentIds.add(s.id); 
         });
         
         const isCompleted = students.length > 0 && submittedStudentIds.size >= students.length;
         return { ...task, submittedStudentIds, isCompleted };
      }));

      setClassTasks(tasksWithStats);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    // Note: Since we are not using a server action, this is just a UI update prototype.
    // In production we would delete all subcollections then the doc.
    alert("Task has been approved and deleted from the class list!");
    setClassTasks(prev => prev.filter(t => t.id !== taskId));
    setSelectedTask(null);
  };

  const handleSendReminder = (studentName: string) => {
    alert(`A reminder has been sent to ${studentName}!`);
  };

  const handlePostAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.schoolId) return;

    setIsPosting(true);
    try {
      const assignmentsRef = collection(db, 'schools', profile.schoolId, 'assignments');
      await addDoc(assignmentsRef, {
        title,
        type,
        dueDate,
        description,
        class: selectedClass,
        subject: selectedSubject,
        teacherId: profile.uid,
        teacherName: profile.name,
        createdAt: serverTimestamp(),
      });
      setPostSuccess(true);
      setTimeout(() => setIsModalOpen(false), 2000);
    } catch (error) {
      console.error("Error posting assignment:", error);
    } finally {
      setIsPosting(false);
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
              <div className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-1">Platform Averages</div>
              <div className="text-3xl font-bold">--</div>
              <div className="text-sm text-white/50 mt-1">Awaiting student data</div>
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
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#002147]/70 mb-1">Description / Instructions</label>
                    <textarea 
                      required 
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={3} 
                      placeholder="Complete exercises 1 through 10 on page 42." 
                      className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
                    ></textarea>
                  </div>

                  <button 
                    disabled={isPosting}
                    type="submit" 
                    className="w-full bg-[#002147] text-white py-3 rounded-xl font-bold hover:bg-[#002147]/90 transition-colors mt-4 disabled:opacity-50 flex justify-center items-center space-x-2"
                  >
                    {isPosting ? <span>Posting...</span> : <><Send className="w-5 h-5"/> <span>Post to {selectedClass}</span></>}
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
                    <div className="flex justify-between items-start mb-8 bg-[#f8fafc] p-6 rounded-2xl border border-[#002147]/5">
                      <div>
                        <div className="inline-block px-3 py-1 bg-white border border-[#002147]/10 rounded-lg text-xs font-bold uppercase tracking-wider text-[#002147]/60 mb-3">{selectedTask.type}</div>
                        <h4 className="font-extrabold text-3xl text-[#002147] tracking-tight">{selectedTask.title}</h4>
                        <div className="text-[#002147]/60 mt-2 font-medium">Due: {new Date(selectedTask.dueDate).toLocaleDateString()}</div>
                      </div>
                      
                      <div className="flex flex-col items-end">
                        <div className="text-sm font-bold text-[#002147] mb-3 bg-white px-4 py-2 rounded-xl shadow-sm border border-[#002147]/5">
                          <span className="text-xl text-[#dc143c] mr-1">{selectedTask.submittedStudentIds.size}</span> / {classStudents.length} Submitted
                        </div>
                        {selectedTask.isCompleted && (
                          <button 
                            onClick={() => handleDeleteTask(selectedTask.id)}
                            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center space-x-2 active:scale-95"
                          >
                            <CheckSquare className="w-4 h-4" />
                            <span>Approve & Delete</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10">
                      {/* Completed List */}
                      <div>
                        <h5 className="font-bold text-green-700 mb-4 flex items-center text-lg pb-2 border-b border-green-100"><CheckSquare className="w-5 h-5 mr-2"/> Completed</h5>
                        <div className="space-y-3">
                          {classStudents.filter(s => selectedTask.submittedStudentIds.has(s.id)).length === 0 && (
                            <div className="text-sm text-gray-400 italic p-4 bg-gray-50 rounded-xl text-center">No one has submitted yet.</div>
                          )}
                          {classStudents.filter(s => selectedTask.submittedStudentIds.has(s.id)).map(student => (
                            <div 
                              key={student.id} 
                              onClick={() => router.push(`/teacher/grading?focus=${student.id}&task=${selectedTask.id}`)}
                              className="bg-white border border-green-200/60 shadow-sm p-4 rounded-xl flex justify-between items-center cursor-pointer hover:bg-green-50 hover:border-green-300 transition-all group"
                            >
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs">{student.name.charAt(0)}</div>
                                <span className="font-bold text-[#002147]">{student.name}</span>
                              </div>
                              <span className="text-xs font-bold text-green-600 opacity-0 group-hover:opacity-100 transition-opacity bg-green-100 px-3 py-1.5 rounded-lg">Grade &rarr;</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Not Completed List */}
                      <div>
                        <h5 className="font-bold text-amber-600 mb-4 flex items-center text-lg pb-2 border-b border-amber-100"><Activity className="w-5 h-5 mr-2"/> Not Completed</h5>
                        <div className="space-y-3">
                          {classStudents.filter(s => !selectedTask.submittedStudentIds.has(s.id)).length === 0 && (
                            <div className="text-sm text-gray-400 italic p-4 bg-gray-50 rounded-xl text-center">Everyone submitted!</div>
                          )}
                          {classStudents.filter(s => !selectedTask.submittedStudentIds.has(s.id)).map(student => (
                            <div key={student.id} className="bg-white border border-amber-200/60 shadow-sm p-4 rounded-xl flex justify-between items-center group">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-700 font-bold text-xs">{student.name.charAt(0)}</div>
                                <span className="font-bold text-[#002147]">{student.name}</span>
                              </div>
                              <button 
                                onClick={() => handleSendReminder(student.name)}
                                className="text-xs font-bold bg-amber-100 text-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-200 transition-colors active:scale-95"
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
    </div>
  );
}
