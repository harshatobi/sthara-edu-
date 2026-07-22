'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  Star, TrendingUp, LogOut, Loader2, BookOpen, Clock, Heart,
  Plus, X, CheckCircle2, AlertTriangle, Bell, MessageSquare,
  Send, ChevronRight, BarChart3, Award
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';

interface Child {
  id: string;
  name: string;
  studentClass: string;
  customStudentId: string;
  assignments: any[];
  subjectScores: { subject: string; A: number; fullMark: number }[];
  submittedCount: number;
  totalCount: number;
  avgPercent: number | null;
  notifications: any[];
  recentScores: { date: string; score: number }[];
}

interface StudentOption { id: string; name: string; }

function getGrade(p: number) { return p >= 90 ? 'A+' : p >= 80 ? 'A' : p >= 70 ? 'B' : p >= 60 ? 'C' : p >= 50 ? 'D' : 'F'; }

export default function ParentDashboard() {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [childrenData, setChildrenData] = useState<Child[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedChildIdx, setSelectedChildIdx] = useState(0);

  // Link modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [studentIdInput, setStudentIdInput] = useState('');
  const [linkingState, setLinkingState] = useState<'idle' | 'linking' | 'error' | 'success'>('idle');

  // Message teacher
  const [messageText, setMessageText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [msgSuccess, setMsgSuccess] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'parent')) router.push('/login');
  }, [profile, loading, router]);

  useEffect(() => {
    const schoolId = profile?.schoolId;
    if (!schoolId) { setLoadingData(false); return; }

    const fetchChildren = async () => {
      try {
        const token = await getAuthToken();

        if (!token) { setLoadingData(false); return; }

        const res = await fetch('/api/parent/get-children', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: token })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.children) {
            setChildrenData(data.children);
          }
        }
      } catch (err) {
        console.error('[parent dashboard] Error fetching children data:', err);
      } finally {
        setLoadingData(false);
      }
    };

    fetchChildren();
  }, [profile?.schoolId, profile?.uid]);

  const handleLinkStudent = async () => {
    if (!studentIdInput.trim() || !profile?.uid) return;
    setLinkingState('linking');

    try {
      const currentLinked: string[] = profile.linkedStudents || [];
      const updatedLinked = [...new Set([...currentLinked, studentIdInput.trim().toUpperCase()])];

      const { error } = await supabase
        .from('users')
        .update({ metadata: { linkedStudents: updatedLinked } })
        .eq('id', profile.uid);

      if (error) throw error;

      setLinkingState('success');
      setTimeout(() => {
        setShowLinkModal(false);
        setLinkingState('idle');
        setStudentIdInput('');
        window.location.reload();
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setLinkingState('error');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !profile?.schoolId) return;

    setSendingMsg(true);
    try {
      const activeChild = childrenData[selectedChildIdx];
      const { error } = await supabase
        .from('notifications')
        .insert({
          school_id: profile.schoolId,
          student_id: activeChild?.id || null,
          title: `Message from Parent (${profile.name || profile.email})`,
          body: messageText,
          read: false,
        });

      if (error) throw error;

      setMsgSuccess(true);
      setMessageText('');
      setTimeout(() => setMsgSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error sending message:', err);
      alert('Failed to send message: ' + err.message);
    } finally {
      setSendingMsg(false);
    }
  };

  if (loading || loadingData) return <div className="p-10 text-[#002147] text-center font-medium">Loading Parent Dashboard...</div>;

  const activeChild = childrenData[selectedChildIdx] || null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#002147] via-[#003b80] to-[#002147] rounded-[2rem] p-8 sm:p-12 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
            Welcome, {profile?.name || 'Parent'}
          </h2>
          <p className="text-blue-100/80 text-lg">
            Track your child's academic progress & growth
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLinkModal(true)}
            className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 border border-white/20 px-5 py-3 rounded-2xl font-bold transition-all"
          >
            <Plus className="w-5 h-5" />
            <span>Link Child</span>
          </button>
          <button
            onClick={signOut}
            className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 border border-white/20 px-5 py-3 rounded-2xl font-bold transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {childrenData.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-gray-200 shadow-sm max-w-lg mx-auto">
          <Heart className="w-16 h-16 text-purple-500 mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-[#002147] mb-2">No Students Linked</h3>
          <p className="text-gray-500 mb-6">Link your child using their Student ID to see their progress.</p>
          <button
            onClick={() => setShowLinkModal(true)}
            className="py-3 px-6 bg-[#002147] text-white rounded-2xl font-bold hover:bg-blue-900 transition-all"
          >
            + Link Student ID
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Child Selector Tabs */}
          {childrenData.length > 1 && (
            <div className="flex space-x-3 overflow-x-auto pb-2">
              {childrenData.map((child, idx) => (
                <button
                  key={child.id}
                  onClick={() => setSelectedChildIdx(idx)}
                  className={`px-6 py-3 rounded-2xl font-bold transition-all text-sm whitespace-nowrap ${
                    selectedChildIdx === idx
                      ? 'bg-[#002147] text-white shadow-md'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {child.name} ({child.studentClass})
                </button>
              ))}
            </div>
          )}

          {activeChild && (
            <div className="space-y-6">
              {/* Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Average Score</h4>
                  <p className="text-4xl font-black text-[#002147]">{activeChild.avgPercent !== null ? `${activeChild.avgPercent}%` : 'N/A'}</p>
                  <p className="text-xs text-gray-500 mt-2 font-medium">Grade: {activeChild.avgPercent !== null ? getGrade(activeChild.avgPercent) : '-'}</p>
                </div>
                <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Assignments Completed</h4>
                  <p className="text-4xl font-black text-emerald-600">{activeChild.submittedCount} / {activeChild.totalCount}</p>
                  <p className="text-xs text-gray-500 mt-2 font-medium">{activeChild.totalCount > 0 ? `${Math.round((activeChild.submittedCount / activeChild.totalCount) * 100)}% completion rate` : 'No assignments'}</p>
                </div>
                <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Student ID</h4>
                  <p className="text-2xl font-black text-indigo-600 font-mono">{activeChild.customStudentId}</p>
                  <p className="text-xs text-gray-500 mt-2 font-medium">Class: {activeChild.studentClass}</p>
                </div>
              </div>

              {/* Assignments list */}
              <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4">
                <h3 className="text-xl font-bold text-[#002147]">Recent Assignments</h3>
                <div className="space-y-3">
                  {activeChild.assignments.map((a: any) => (
                    <div key={a.id} className="p-4 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="font-bold text-[#002147]">{a.title}</p>
                        <p className="text-xs text-gray-500">{a.subject} • Due: {a.dueDate || 'No Date'}</p>
                      </div>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                        a.submitted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {a.submitted ? (a.score !== undefined ? `Score: ${a.score}/${a.maxScore}` : 'Submitted') : 'Pending'}
                      </span>
                    </div>
                  ))}
                  {activeChild.assignments.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-6">No assignments for this student yet.</p>
                  )}
                </div>
              </div>

              {/* Message Teacher Form */}
              <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4">
                <h3 className="text-xl font-bold text-[#002147]">Message Class Teacher</h3>
                <form onSubmit={handleSendMessage} className="space-y-3">
                  <textarea
                    rows={3}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder={`Write a note to ${activeChild.name}'s teacher...`}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  {msgSuccess && <p className="text-emerald-600 text-xs font-bold bg-emerald-50 p-2 rounded-xl">Message sent to teacher!</p>}
                  <button
                    type="submit"
                    disabled={sendingMsg || !messageText.trim()}
                    className="px-6 py-3 bg-[#002147] text-white font-bold text-sm rounded-xl hover:bg-blue-900 transition-all disabled:opacity-50"
                  >
                    {sendingMsg ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Link Student Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-[#002147]">Link Student</h3>
              <button onClick={() => setShowLinkModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500">Enter your child's custom Student ID (e.g. DPS101-10A-001)</p>
            <input
              type="text"
              value={studentIdInput}
              onChange={(e) => setStudentIdInput(e.target.value.toUpperCase())}
              placeholder="DPS101-10A-001"
              className="w-full border border-gray-200 rounded-xl p-3 uppercase font-mono font-bold text-[#002147] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {linkingState === 'error' && <p className="text-red-500 text-xs font-semibold">Failed to link student. Check Student ID.</p>}
            {linkingState === 'success' && <p className="text-emerald-600 text-xs font-semibold">Student linked successfully! Reloading...</p>}
            <button
              onClick={handleLinkStudent}
              disabled={linkingState === 'linking' || !studentIdInput.trim()}
              className="w-full py-3 bg-[#002147] text-white font-bold rounded-xl hover:bg-blue-900 transition-all disabled:opacity-50"
            >
              {linkingState === 'linking' ? 'Linking...' : 'Link Student'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
