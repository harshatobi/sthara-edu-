'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { Heart, Wind, Activity, CheckCircle2, ChevronRight } from 'lucide-react';

const MOODS = [
  { label: 'Great', icon: '🤩', color: 'bg-green-100 text-green-600 border-green-200', hover: 'hover:bg-green-50', value: 100 },
  { label: 'Good', icon: '😌', color: 'bg-blue-100 text-blue-600 border-blue-200', hover: 'hover:bg-blue-50', value: 80 },
  { label: 'Okay', icon: '😐', color: 'bg-yellow-100 text-yellow-600 border-yellow-200', hover: 'hover:bg-yellow-50', value: 60 },
  { label: 'Low', icon: '😔', color: 'bg-orange-100 text-orange-600 border-orange-200', hover: 'hover:bg-orange-50', value: 40 },
  { label: 'Exhausted', icon: '😫', color: 'bg-red-100 text-red-600 border-red-200', hover: 'hover:bg-red-50', value: 20 },
];

export default function WellnessPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [todaysMood, setTodaysMood] = useState<number | null>(null);
  const [history, setHistory] = useState<{ date: string; value: number }[]>([]);

  // Breathing state
  const [isBreathing, setIsBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'Inhale' | 'Hold' | 'Exhale' | 'Hold2' | 'Idle'>('Idle');

  // Load initial data
  useEffect(() => {
    if (!profile?.uid) return;

    async function loadWellness() {
      try {
        const { data, error } = await supabase
          .from('wellness_logs')
          .select('*')
          .eq('student_id', profile.uid)
          .order('created_at', { ascending: false })
          .limit(7);

        if (error) throw error;

        const todayString = new Date().toDateString();
        const loadedHistory: { date: string; value: number }[] = [];
        let foundToday = false;

        (data || []).forEach(log => {
          const dateObj = new Date(log.created_at);
          loadedHistory.push({
            date: dateObj.toISOString(),
            value: log.mood_value,
          });
          if (dateObj.toDateString() === todayString && !foundToday) {
            foundToday = true;
            setTodaysMood(log.mood_value);
          }
        });

        setHistory(loadedHistory.reverse());
      } catch (err) {
        console.error('[Wellness Load Error]:', err);
      } finally {
        setLoading(false);
      }
    }

    loadWellness();
  }, [profile?.uid]);

  const logMood = async (value: number) => {
    if (!profile?.uid) return;
    setTodaysMood(value);

    try {
      const { error } = await supabase.from('wellness_logs').insert({
        student_id: profile.uid,
        school_id: profile.schoolId || 'global',
        mood_value: value,
        resolved: value >= 60,
      });

      if (error) throw error;

      setHistory(prev => [...prev.slice(-6), { date: new Date().toISOString(), value }]);
    } catch (err) {
      console.error('[Log Mood Error]:', err);
    }
  };

  const startBreathing = () => {
    if (isBreathing) return;
    setIsBreathing(true);
    setBreathPhase('Inhale');
  };

  useEffect(() => {
    if (!isBreathing) return;

    let timer: NodeJS.Timeout;

    if (breathPhase === 'Inhale') {
      timer = setTimeout(() => setBreathPhase('Hold'), 4000);
    } else if (breathPhase === 'Hold') {
      timer = setTimeout(() => setBreathPhase('Exhale'), 4000);
    } else if (breathPhase === 'Exhale') {
      timer = setTimeout(() => setBreathPhase('Hold2'), 4000);
    } else if (breathPhase === 'Hold2') {
      timer = setTimeout(() => setBreathPhase('Inhale'), 4000);
    }

    return () => clearTimeout(timer);
  }, [breathPhase, isBreathing]);

  const stopBreathing = () => {
    setIsBreathing(false);
    setBreathPhase('Idle');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div>
        <h1 className="text-3xl font-extrabold text-[#002147]">Wellness & Mindset Center</h1>
        <p className="text-gray-500 text-sm mt-1">Track your daily energy, de-stress, and keep your mind balanced.</p>
      </div>

      {/* Mood Check-In (Feature Flagged) */}
      {process.env.NEXT_PUBLIC_FEATURE_WELLNESS_CHECKIN_ENABLED === 'true' ? (
        <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
              <Heart className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#002147]">Daily Mood Check-In</h2>
              <p className="text-xs text-gray-500">How are you feeling about your studies today?</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {MOODS.map(m => {
              const isSelected = todaysMood === m.value;
              return (
                <button
                  key={m.label}
                  onClick={() => logMood(m.value)}
                  className={`p-4 rounded-2xl border text-center transition-all ${m.hover} ${
                    isSelected ? `${m.color} ring-2 ring-indigo-600 shadow-sm scale-105` : 'border-gray-200 bg-gray-50/50'
                  }`}
                >
                  <div className="text-3xl mb-1">{m.icon}</div>
                  <div className="font-bold text-xs text-gray-700">{m.label}</div>
                </button>
              );
            })}
          </div>

          {todaysMood && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-3 text-emerald-800 text-xs font-semibold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span>Check-in recorded for today! Your wellbeing helps personalize your study workload.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-amber-50/80 border-2 border-amber-200/80 rounded-3xl p-6 flex items-center gap-4 text-amber-900 text-xs font-semibold shadow-sm">
          <div className="w-10 h-10 bg-amber-400 text-white rounded-2xl flex items-center justify-center shrink-0 font-bold">
            <Heart className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-sm text-amber-950">Wellness Logging Pending DPDP Consent Verification</p>
            <p className="text-amber-800 mt-0.5">Daily energy & mood logging is currently paused until student consent verification lands. Mindset & breathing exercises remain fully available below.</p>
          </div>
        </div>
      )}

      {/* 4-7-8 Breathing Exercise */}
      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl">
            <Wind className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#002147]">Box Breathing Exercise</h2>
            <p className="text-xs text-gray-500">Take a 2-minute reset to enhance focus and clear mental fatigue.</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-8 space-y-6">
          <div
            className={`w-36 h-36 rounded-full border-4 flex items-center justify-center transition-all duration-1000 ${
              breathPhase === 'Inhale'
                ? 'scale-125 border-sky-500 bg-sky-50 shadow-xl'
                : breathPhase === 'Hold' || breathPhase === 'Hold2'
                ? 'scale-125 border-amber-500 bg-amber-50 shadow-lg'
                : breathPhase === 'Exhale'
                ? 'scale-90 border-emerald-500 bg-emerald-50'
                : 'border-gray-200 bg-gray-50'
            }`}
          >
            <span className="font-extrabold text-sm text-[#002147] capitalize">
              {isBreathing ? breathPhase : 'Ready'}
            </span>
          </div>

          <button
            onClick={isBreathing ? stopBreathing : startBreathing}
            className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-md ${
              isBreathing
                ? 'bg-rose-500 hover:bg-rose-600 text-white'
                : 'bg-[#002147] hover:bg-blue-900 text-white'
            }`}
          >
            {isBreathing ? 'Stop Exercise' : 'Start 4-4-4 Breathing'}
          </button>
        </div>
      </div>
    </div>
  );
}
