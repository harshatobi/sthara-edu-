'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, Send, Loader2, CheckCircle } from 'lucide-react';

export default function SyllabusSync() {
  const { profile } = useAuth();
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const fetchHistory = async () => {
    if (!profile?.teacherClass) return;
    try {
      const q = query(
        collection(db, 'class_state'), 
        where('class', '==', profile.teacherClass),
        orderBy('timestamp', 'desc')
      );
      const snap = await getDocs(q);
      const items: any[] = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      setHistory(items);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (profile) fetchHistory();
  }, [profile]);

  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic || !subject || !profile?.teacherClass) return;
    
    setLoading(true);
    try {
      // Save global class state
      await addDoc(collection(db, 'class_state'), {
        teacherId: profile.id,
        teacherName: profile.name,
        class: profile.teacherClass,
        subject,
        topic,
        timestamp: serverTimestamp()
      });

      // Trigger personalized homework generation
      await fetch('/api/homework/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class: profile.teacherClass,
          subject,
          topic,
          teacherId: profile.id
        })
      });

      setSuccess(true);
      setTopic('');
      setSubject('');
      fetchHistory();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert('Failed to sync syllabus and generate homework');
    } finally {
      setLoading(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-[#002147]">Syllabus Sync & Homework</h1>
        <p className="text-[#002147]/60 mt-1">Tell the AI what you taught today. It will instantly generate personalized homework for every student in {profile.teacherClass}.</p>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/10">
        <h2 className="text-xl font-bold text-[#002147] mb-4 flex items-center space-x-2">
          <BookOpen className="w-5 h-5 text-blue-500" />
          <span>Today's Lesson</span>
        </h2>

        <form onSubmit={handleSync} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#002147]/70 mb-1">Subject</label>
              <select 
                required
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-lg px-3 py-2 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
              >
                <option value="">Select Subject</option>
                <option value="Mathematics">Mathematics</option>
                <option value="Science">Science</option>
                <option value="English">English</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#002147]/70 mb-1">Topic Covered</label>
              <input 
                required
                type="text"
                placeholder="e.g. Factoring Quadratic Equations"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-lg px-3 py-2 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20"
              />
            </div>
          </div>
          
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-[#002147] text-white py-3 rounded-xl font-bold shadow-sm hover:bg-[#002147]/90 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /><span>Syncing & Generating...</span></>
            ) : success ? (
              <><CheckCircle className="w-5 h-5 text-green-400" /><span>Synced Successfully!</span></>
            ) : (
              <><Send className="w-5 h-5" /><span>Sync & Assign Personalized Homework</span></>
            )}
          </button>
        </form>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/10">
        <h2 className="text-lg font-bold text-[#002147] mb-4">Syllabus History</h2>
        {history.length === 0 ? (
          <p className="text-[#002147]/50 text-sm">No topics logged yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map(h => (
              <div key={h.id} className="p-4 rounded-xl border border-[#002147]/10 bg-[#f8fafc] flex justify-between items-center">
                <div>
                  <p className="font-bold text-[#002147]">{h.topic}</p>
                  <p className="text-xs text-[#002147]/60">{h.subject}</p>
                </div>
                <div className="text-xs font-semibold text-[#002147]/40 bg-white px-2 py-1 rounded-md border border-[#002147]/10">
                  {h.timestamp?.toDate ? h.timestamp.toDate().toLocaleDateString() : 'Just now'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
