'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Activity, AlertTriangle, Users, BookOpen, LogOut, Plus, X, Send } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
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
        teacherId: profile.id,
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#002147]">Good Morning, {profile.name?.split(' ')[0]}</h2>
          <p className="text-[#002147]/60 mt-1">Teacher Portal • {profile.schoolId}</p>
        </div>
        <button 
          onClick={signOut}
          className="flex items-center space-x-2 bg-white border border-[#002147]/10 px-4 py-3 rounded-xl shadow-sm hover:bg-[#f8fafc] text-[#dc143c] transition-colors font-medium"
        >
          <LogOut className="w-5 h-5" />
          <span className="hidden md:inline">Sign Out</span>
        </button>
      </div>

      <div className="mb-4 text-xl font-bold text-[#002147]">Your Assigned Classes</div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(!profile.assignments || profile.assignments.length === 0) ? (
          <div className="col-span-full p-8 bg-white border border-[#002147]/10 rounded-2xl text-center text-[#002147]/60 shadow-sm">
            You do not have any active class assignments. Please contact your school administrator.
          </div>
        ) : (
          profile.assignments.map((assignment, index) => (
            <div key={index} className="bg-white border border-[#002147]/10 rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="bg-[#002147] p-4 text-white">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-white/60 text-sm font-medium uppercase tracking-wider mb-1">Class</div>
                    <div className="text-2xl font-bold">{assignment.class}</div>
                  </div>
                  <div className="bg-white/10 p-2 rounded-xl border border-white/20">
                    <BookOpen className="w-6 h-6" />
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="text-[#002147]/60 text-sm font-medium uppercase tracking-wider mb-1">Subject</div>
                <div className="text-xl font-bold text-[#002147] mb-6">{assignment.subject}</div>
                
                <div className="flex space-x-2">
                  <button 
                    onClick={() => openPostModal(assignment.class, assignment.subject)}
                    className="flex-1 flex items-center justify-center space-x-1 bg-[#dc143c] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#dc143c]/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Post Task</span>
                  </button>
                  <button className="flex-1 bg-[#f8fafc] border border-[#002147]/10 text-[#002147] py-2 rounded-lg text-sm font-semibold hover:bg-[#002147] hover:text-white transition-colors">
                    Grading
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <div className="bg-white border border-[#002147]/10 p-6 rounded-2xl shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="text-[#002147]/60 font-medium">Platform Averages</div>
            <div className="bg-[#002147]/5 text-[#002147] p-2 rounded-lg"><Users className="w-5 h-5" /></div>
          </div>
          <div className="text-4xl font-bold text-[#002147]">--</div>
          <div className="text-sm mt-2 text-[#002147]/60">Awaiting student data</div>
        </div>

        <div className="bg-white border border-[#dc143c]/20 p-6 rounded-2xl shadow-sm relative">
          <div className="flex justify-between items-start mb-4">
            <div className="text-[#dc143c] font-bold">Proctoring Alerts</div>
            <div className="bg-[#dc143c]/10 text-[#dc143c] p-2 rounded-lg"><AlertTriangle className="w-5 h-5" /></div>
          </div>
          <div className="text-4xl font-bold text-[#002147]">0</div>
          <div className="text-sm mt-2 text-[#002147]/60">All clear across active tests</div>
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
    </div>
  );
}
