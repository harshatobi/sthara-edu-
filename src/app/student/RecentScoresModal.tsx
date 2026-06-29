'use client';

import { useState, useEffect } from 'react';
import { X, CheckCircle2, TrendingUp, Award, BookOpen, Calendar as CalendarIcon, FileText, Activity, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';

interface ScoreEntry {
  id: string;
  title: string;
  subject: string;
  type: string;
  score: number;
  maxScore: number;
  percent: number;
  grade: string;
  date: string;
  feedback: string;
}

function getGrade(pct: number) {
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

function getScoreColor(pct: number) {
  if (pct >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (pct >= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

export default function RecentScoresModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const [filter, setFilter] = useState('All');
  const [history, setHistory] = useState<ScoreEntry[]>([]);
  const [subjects, setSubjects] = useState<string[]>(['All']);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.schoolId || !profile?.uid) return;
    const fetchScores = async () => {
      try {
        // Fetch all assignments for student's class
        const snap = await getDocs(query(
          collection(db, 'schools', profile.schoolId, 'assignments'),
          where('class', '==', profile.studentClass)
        ));

        const entries: ScoreEntry[] = [];
        await Promise.all(snap.docs.map(async (aDoc) => {
          const aData = aDoc.data();
          // Check for submission by this student
          const subDoc = await getDoc(doc(db, 'schools', profile.schoolId, 'assignments', aDoc.id, 'submissions', profile.uid));
          if (!subDoc.exists()) return;
          const sub = subDoc.data();
          // Only include if score is defined
          if (sub.score === undefined && sub.grade === undefined) return;

          const rawScore = sub.score ?? 0;
          const rawMax = sub.maxScore || sub.total || 100;
          const pct = rawMax > 0 ? Math.round((rawScore / rawMax) * 100) : 0;

          // Date from submission or assignment
          const dateVal = sub.submittedAt?.toDate?.() || aData.createdAt?.toDate?.() || new Date();

          entries.push({
            id: aDoc.id,
            title: aData.title || aData.topic || 'Assignment',
            subject: aData.subject || 'General',
            type: aData.type === 'quiz' ? 'Quiz' : 'Homework',
            score: rawScore,
            maxScore: rawMax,
            percent: pct,
            grade: getGrade(pct),
            date: dateVal.toISOString(),
            feedback: sub.aiResult?.summary || sub.aiResult?.overallFeedback || (pct >= 80 ? 'Great work!' : pct >= 60 ? 'Good effort, keep practicing.' : 'Needs improvement — review this topic.'),
          });
        }));

        // Sort newest first
        entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setHistory(entries);

        // Build subject filter list
        const subjectSet = new Set(entries.map(e => e.subject));
        setSubjects(['All', ...Array.from(subjectSet)]);
      } catch (e) {
        console.error('RecentScores fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchScores();
  }, [profile?.schoolId, profile?.uid, profile?.studentClass]);

  const filtered = filter === 'All' ? history : history.filter(h => h.subject === filter);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#002147]/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl w-full max-w-lg sm:max-w-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 border border-white/20">
        
        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 p-6 text-white relative shrink-0 overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <TrendingUp className="w-32 h-32" />
          </div>
          <div className="relative z-10 flex justify-between items-start">
            <div>
              <div className="inline-flex items-center space-x-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold mb-3">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Academic History</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">Recent Scores</h2>
              <p className="text-emerald-50 text-sm max-w-xs">Your performance across all submissions this term.</p>
            </div>
            <button onClick={onClose} className="p-2 bg-white/20 rounded-full hover:bg-black/20 transition-all text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mt-4 relative z-10">
            {subjects.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-xl font-bold transition-all text-xs ${
                  filter === f
                    ? 'bg-white text-emerald-600 shadow-md scale-105'
                    : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-gray-50/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              <p className="text-gray-400 text-sm font-medium">Loading your scores...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                <Award className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-gray-500 font-semibold">No scores yet</p>
              <p className="text-gray-400 text-sm">Complete and submit your assignments to see scores here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((entry, idx) => (
                <div key={entry.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex items-center gap-4">
                  {/* Score badge */}
                  <div className={`shrink-0 w-16 h-16 rounded-2xl border-2 flex flex-col items-center justify-center ${getScoreColor(entry.percent)}`}>
                    <span className="text-2xl font-black leading-none">{entry.grade}</span>
                    <span className="text-[10px] font-bold mt-0.5">{entry.percent}%</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${entry.type === 'Quiz' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                        {entry.type}
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium">{entry.subject}</span>
                    </div>
                    <p className="font-bold text-[#002147] text-sm truncate">{entry.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{entry.score}/{entry.maxScore} pts</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1 italic">"{entry.feedback}"</p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-[10px] text-gray-400 font-medium">
                      {new Date(entry.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
