'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, orderBy, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, CheckCircle, Clock, ChevronRight, FileText, Activity } from 'lucide-react';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';

export default function StudentHomework() {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');

  useEffect(() => {
    const fetchHomework = async () => {
      if (!profile?.uid) return;
      try {
        const q = query(
          collection(db, 'homework_assignments'),
          where('studentId', '==', profile.uid),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const items: any[] = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() }));

        // Dynamic Seeding for Demo Purposes
        if (items.length === 0) {
          console.log("No assignments found. Seeding dummy assignments for demo.");
          
          const dummyAssignments = [
            {
              id: uuidv4(),
              studentId: profile.uid,
              topic: 'Polynomial Division and Remainder Theorem',
              subject: 'Mathematics',
              status: 'pending',
              questions: [
                'Use long division to divide P(x) = x³ - 4x² + 2x - 3 by (x - 2).',
                'State the Remainder Theorem.',
                'Use the Remainder Theorem to find the remainder when P(x) = x⁴ - 2x³ + x - 1 is divided by (x + 1).'
              ],
              createdAt: serverTimestamp(),
              dueDate: new Date(Date.now() + 86400000 * 2).toISOString() // 2 days from now
            },
            {
              id: uuidv4(),
              studentId: profile.uid,
              topic: 'Chemical Bonding: Ionic vs Covalent',
              subject: 'Science',
              status: 'pending',
              questions: [
                'Explain the primary difference between an ionic bond and a covalent bond.',
                'Draw the Lewis dot structure for Water (H2O).',
                'Why do ionic compounds typically have higher melting points than covalent compounds?'
              ],
              createdAt: serverTimestamp(),
              dueDate: new Date(Date.now() + 86400000).toISOString() // Tomorrow
            },
            {
              id: uuidv4(),
              studentId: profile.uid,
              topic: 'Literary Devices in Poetry',
              subject: 'English',
              status: 'completed',
              grade: 'A-',
              feedback: 'Great job identifying metaphors and similes. Make sure to provide more context when explaining personification in stanza 3.',
              questions: [
                'Define a metaphor and provide an example from "The Road Not Taken".',
                'How does the author use personification to set the mood of the poem?'
              ],
              createdAt: serverTimestamp(),
              dueDate: new Date(Date.now() - 86400000 * 5).toISOString() // 5 days ago
            }
          ];

          for (const hw of dummyAssignments) {
            await setDoc(doc(db, 'homework_assignments', hw.id), hw);
            items.push(hw);
          }
        }

        const uniqueItems = Array.from(new Map(items.map(item => [item.topic, item])).values());
        setAssignments(uniqueItems);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchHomework();
  }, [profile]);

  if (loading || !profile) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <div className="w-12 h-12 border-4 border-[#002147]/20 border-t-[#002147] rounded-full animate-spin"></div>
      <p className="text-[#002147]/60 font-bold tracking-widest uppercase text-sm">Syncing Assignments...</p>
    </div>
  );

  const pendingAssignments = assignments.filter(a => a.status !== 'completed');
  const completedAssignments = assignments.filter(a => a.status === 'completed');
  const currentList = activeTab === 'pending' ? pendingAssignments : completedAssignments;

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="bg-[#002147] text-white p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden mb-8">
        <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
          <BookOpen className="w-64 h-64" />
        </div>
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-2 bg-white/20 backdrop-blur-md px-4 py-1.5 rounded-full text-sm font-bold mb-6">
            <Activity className="w-4 h-4 text-orange-400" />
            <span className="text-orange-50">{pendingAssignments.length} Active Tasks</span>
          </div>
          <h1 className="text-5xl font-black tracking-tight mb-4">My Assignments</h1>
          <p className="text-blue-100/80 font-medium text-lg max-w-2xl">
            Tackle your personalized homework, upload your solutions, and receive instant AI-powered grading and feedback.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 mb-8 bg-white p-2 rounded-2xl shadow-sm border border-gray-100 max-w-fit">
        <button 
          onClick={() => setActiveTab('pending')}
          className={`px-6 py-2.5 rounded-xl font-bold transition-all flex items-center space-x-2 ${activeTab === 'pending' ? 'bg-[#002147] text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <Clock className="w-4 h-4" />
          <span>To-Do ({pendingAssignments.length})</span>
        </button>
        <button 
          onClick={() => setActiveTab('completed')}
          className={`px-6 py-2.5 rounded-xl font-bold transition-all flex items-center space-x-2 ${activeTab === 'completed' ? 'bg-emerald-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <CheckCircle className="w-4 h-4" />
          <span>Completed ({completedAssignments.length})</span>
        </button>
      </div>

      {/* Grid */}
      {currentList.length === 0 ? (
        <div className="bg-white py-20 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
          <div className="bg-gray-50 p-6 rounded-full mb-6">
            <CheckCircle className="w-16 h-16 text-gray-300" />
          </div>
          <h2 className="text-2xl font-bold text-[#002147] mb-2">You're all caught up!</h2>
          <p className="text-gray-500 font-medium max-w-md">
            {activeTab === 'pending' 
              ? "Awesome job! You have no pending assignments at the moment. Take a break or explore the video library." 
              : "You haven't completed any assignments yet. Head over to the To-Do tab to get started!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {currentList.map(a => (
            <Link key={a.id} href={`/student/homework/${a.id}`} className="block group">
              <div className="bg-white p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 transition-all hover:-translate-y-1 relative h-full flex flex-col">
                
                {/* Status Indicator Bar */}
                <div className={`absolute top-0 left-0 w-full h-1.5 rounded-t-[2rem] ${a.status === 'completed' ? 'bg-emerald-400' : 'bg-orange-400'}`}></div>
                
                <div className="flex justify-between items-start mb-6">
                  <div className={`p-3 rounded-2xl ${a.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                    <FileText className="w-6 h-6" />
                  </div>
                  {a.status === 'completed' ? (
                    <span className="flex items-center space-x-1.5 text-emerald-700 bg-emerald-100/50 px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-200">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Graded</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1.5 text-orange-700 bg-orange-100/50 px-3 py-1.5 rounded-full text-xs font-bold border border-orange-200">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Pending</span>
                    </span>
                  )}
                </div>

                <div className="flex-1">
                  <div className="inline-block px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold uppercase tracking-wider mb-3">
                    {a.subject}
                  </div>
                  <h3 className="font-black text-[#002147] text-2xl mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">{a.topic}</h3>
                  <p className="text-gray-500 font-medium text-sm line-clamp-2">
                    {a.questions && a.questions.length > 0 ? `${a.questions.length} questions to complete.` : 'Review the attached prompt.'}
                  </p>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between">
                  {a.status === 'completed' && a.grade ? (
                    <div>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Final Score</span>
                      <span className="text-2xl font-black text-emerald-600">{a.grade}</span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Due Date</span>
                      <span className="text-sm font-bold text-red-500">
                        {a.dueDate ? new Date(a.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No Due Date'}
                      </span>
                    </div>
                  )}

                  <div className={`flex items-center justify-center w-12 h-12 rounded-full transition-colors ${
                    a.status === 'completed' 
                      ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white' 
                      : 'bg-[#002147]/5 text-[#002147] group-hover:bg-[#002147] group-hover:text-white'
                  }`}>
                    <ChevronRight className="w-5 h-5 ml-0.5" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
