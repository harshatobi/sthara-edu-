'use client';

import { useState, useEffect } from 'react';
import { X, Award, BookOpen, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
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
}

export default function RecentScoresModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const supabase = createClient();
  const [history, setHistory] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.schoolId || !profile?.uid) return;
    const fetchScores = async () => {
      try {
        const { data: subsData } = await supabase
          .from('submissions')
          .select('*')
          .eq('student_id', profile.uid)
          .order('created_at', { ascending: false });

        const entries: ScoreEntry[] = (subsData || []).map((sub: any) => {
          const sc = sub.score || 0;
          const mx = sub.max_score || 10;
          const pct = Math.round((sc / mx) * 100);
          return {
            id: sub.id,
            title: sub.assignment_title || 'Task Submission',
            subject: sub.subject || 'General',
            type: sub.type || 'homework',
            score: sc,
            maxScore: mx,
            percent: pct,
            grade: sub.grade || `${sc}/${mx}`,
            date: new Date(sub.created_at).toLocaleDateString(),
          };
        });

        setHistory(entries);
      } catch (err) {
        console.error('Error fetching scores:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchScores();
  }, [profile?.schoolId, profile?.uid]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#002147]/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300 border border-white/20">
        <div className="bg-gradient-to-r from-[#002147] to-[#003366] p-6 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <Award className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-bold">Recent Academic Scores</h2>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-red-500 text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
          {loading ? (
            <div className="py-16 text-center text-gray-400">Loading academic history...</div>
          ) : history.length === 0 ? (
            <div className="py-16 text-center text-gray-400">No evaluated submissions recorded yet.</div>
          ) : (
            <div className="space-y-3">
              {history.map(item => (
                <div key={item.id} className="p-4 bg-white rounded-2xl border border-gray-200 flex items-center justify-between shadow-sm">
                  <div>
                    <div className="font-bold text-sm text-[#002147]">{item.title}</div>
                    <div className="text-xs text-gray-400">{item.subject} • {item.date}</div>
                  </div>
                  <div className="text-right font-extrabold text-indigo-600 text-base">
                    {item.grade} ({item.percent}%)
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
