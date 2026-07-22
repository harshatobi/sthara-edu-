'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Activity, ShieldAlert, BrainCircuit,
  HeartPulse, CheckCircle2, MessageCircle, Clock,
  Filter, RefreshCw, AlertTriangle, Inbox
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

type SituationCategory = 'all' | 'security' | 'academic' | 'wellness' | 'submission';

interface SituationItem {
  id: string;
  type: string;
  message: string;
  studentName?: string;
  studentId?: string;
  acknowledged?: boolean;
  metadata?: any;
  created_at?: string;
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return 'Just now';
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TeacherFeedPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [situations, setSituations] = useState<SituationItem[]>([]);
  const [filterCategory, setFilterCategory] = useState<SituationCategory>('all');
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId) return;

    // Initial fetch from situations table
    const fetchSituations = async () => {
      try {
        const { data, error } = await supabase
          .from('situations')
          .select('*')
          .eq('school_id', profile.schoolId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSituations(data || []);
      } catch (err) {
        console.error('Error fetching situations:', err);
      } finally {
        setFetching(false);
      }
    };

    fetchSituations();

    // Realtime subscription via Supabase Realtime channel
    const channel = supabase
      .channel(`situations_${profile.schoolId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'situations',
          filter: `school_id=eq.${profile.schoolId}`,
        },
        (payload) => {
          if (payload.new) {
            setSituations(prev => [payload.new as SituationItem, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.schoolId]);

  const handleAcknowledge = async (sitId: string) => {
    try {
      const { error } = await supabase
        .from('situations')
        .update({ acknowledged: true })
        .eq('id', sitId);

      if (error) throw error;
      setSituations(prev => prev.map(s => s.id === sitId ? { ...s, acknowledged: true } : s));
    } catch (err) {
      console.error('Failed to acknowledge:', err);
    }
  };

  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading Situations Feed...</div>;

  const filtered = situations.filter(s => {
    if (filterCategory === 'all') return true;
    if (filterCategory === 'security') return s.type?.includes('foul') || s.type?.includes('cheat') || s.type?.includes('security');
    if (filterCategory === 'academic') return s.type?.includes('academic') || s.type?.includes('score') || s.type?.includes('weakness');
    if (filterCategory === 'wellness') return s.type?.includes('wellness') || s.type?.includes('mood');
    if (filterCategory === 'submission') return s.type?.includes('submission') || s.type?.includes('homework');
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/teacher" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-[#002147]">Realtime Situations Feed</h1>
            <p className="text-gray-500 text-sm mt-1">Live alerts for student misconduct, academic friction, and wellness</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-2 overflow-x-auto pb-2">
        {(['all', 'security', 'academic', 'wellness', 'submission'] as SituationCategory[]).map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-4 py-2 text-xs font-bold capitalize rounded-xl transition-all whitespace-nowrap ${
              filterCategory === cat
                ? 'bg-[#002147] text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Feed List */}
      <div className="space-y-4">
        {fetching ? (
          <div className="p-8 text-center text-gray-400">Loading feed...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 text-gray-400">
            No active situation alerts found.
          </div>
        ) : (
          filtered.map(sit => (
            <div
              key={sit.id}
              className={`p-5 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
                sit.acknowledged ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-red-200 shadow-sm'
              }`}
            >
              <div className="flex items-start space-x-4">
                <div className={`p-3 rounded-xl shrink-0 ${
                  sit.type?.includes('foul') || sit.type?.includes('cheat')
                    ? 'bg-red-100 text-red-600'
                    : 'bg-amber-100 text-amber-600'
                }`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-[#002147] text-sm">{sit.student_name || sit.student_id || 'Student'}</span>
                    <span className="text-xs text-gray-400">• {timeAgo(sit.created_at)}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-700 mt-1">{sit.message}</p>
                </div>
              </div>

              {!sit.acknowledged && (
                <button
                  onClick={() => handleAcknowledge(sit.id)}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition-colors shrink-0"
                >
                  Acknowledge
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
