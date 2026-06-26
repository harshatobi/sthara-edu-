'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { Heart, Wind, PenTool, Activity, MessageCircle, CheckCircle2, ChevronRight } from 'lucide-react';

const MOODS = [
  { label: 'Great', icon: '🤩', color: 'bg-green-100 text-green-600 border-green-200', hover: 'hover:bg-green-50', value: 100 },
  { label: 'Good', icon: '😌', color: 'bg-blue-100 text-blue-600 border-blue-200', hover: 'hover:bg-blue-50', value: 80 },
  { label: 'Okay', icon: '😐', color: 'bg-yellow-100 text-yellow-600 border-yellow-200', hover: 'hover:bg-yellow-50', value: 60 },
  { label: 'Low', icon: '😔', color: 'bg-orange-100 text-orange-600 border-orange-200', hover: 'hover:bg-orange-50', value: 40 },
  { label: 'Exhausted', icon: '😫', color: 'bg-red-100 text-red-600 border-red-200', hover: 'hover:bg-red-50', value: 20 },
];

export default function WellnessPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [todaysMood, setTodaysMood] = useState<number | null>(null);
  const [history, setHistory] = useState<{date: string, value: number}[]>([]);
  
  // Journal state
  const [journalText, setJournalText] = useState('');
  const [journalSaved, setJournalSaved] = useState(false);

  // Breathing state
  const [isBreathing, setIsBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'Inhale' | 'Hold' | 'Exhale' | 'Idle'>('Idle');
  
  // Load initial data
  useEffect(() => {
    if (!profile?.uid) return;
    
    async function loadWellness() {
      try {
        const logsRef = collection(db, 'wellness_logs');
        const q = query(logsRef, where('userId', '==', profile?.uid), orderBy('createdAt', 'desc'), limit(7));
        const snapshot = await getDocs(q);
        
        const loadedHistory: {date: string, value: number}[] = [];
        const todayString = new Date().toDateString();

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.createdAt) {
            const dateObj = data.createdAt.toDate();
            loadedHistory.push({
              date: dateObj.toISOString(),
              value: data.moodValue
            });
            if (dateObj.toDateString() === todayString && !todaysMood) {
              setTodaysMood(data.moodValue);
            }
          }
        });
        
        setHistory(loadedHistory.reverse());
      } catch (err) {
        console.error("Failed to load wellness history", err);
      } finally {
        setLoading(false);
      }
    }
    loadWellness();
  }, [profile?.uid]);

  const handleMoodSelect = async (value: number) => {
    if (todaysMood) return; // already logged today
    setTodaysMood(value);
    
    try {
      await addDoc(collection(db, 'wellness_logs'), {
        userId: profile?.uid,
        moodValue: value,
        createdAt: serverTimestamp()
      });
      
      setHistory(prev => [...prev, { date: new Date().toISOString(), value }]);
    } catch (err) {
      console.error("Failed to save mood", err);
    }
  };

  const handleJournalSubmit = async () => {
    if (!journalText.trim()) return;
    try {
      await addDoc(collection(db, 'journal_entries'), {
        userId: profile?.uid,
        text: journalText,
        createdAt: serverTimestamp()
      });
      setJournalText('');
      setJournalSaved(true);
      setTimeout(() => setJournalSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save journal", err);
    }
  };

  // Breathing Animation Loop
  useEffect(() => {
    let interval: any;
    let timeout1: any;
    let timeout2: any;

    if (isBreathing) {
      const cycle = () => {
        setBreathPhase('Inhale');
        timeout1 = setTimeout(() => {
          setBreathPhase('Hold');
          timeout2 = setTimeout(() => {
            setBreathPhase('Exhale');
          }, 2000);
        }, 4000);
      };
      
      cycle();
      interval = setInterval(cycle, 10000);
    } else {
      setBreathPhase('Idle');
    }

    return () => {
      clearInterval(interval);
      clearTimeout(timeout1);
      clearTimeout(timeout2);
    };
  }, [isBreathing]);

  if (loading) {
    return <div className="p-8 text-center text-[#002147]/60">Loading wellness dashboard...</div>;
  }

  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-[#002147]/10 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-[#002147]">Wellness Center</h2>
          <p className="text-[#002147]/60 mt-1">Your mental health and well-being matters. Track your daily energy and access resources here.</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* Left Column */}
        <div className="space-y-8">
          
          {/* Daily Check-in */}
          <div className="bg-[#f8fafc] p-6 rounded-xl border border-[#002147]/5">
            <h3 className="font-semibold text-[#002147] mb-4 flex items-center space-x-2">
              <Activity className="w-5 h-5 text-[#dc143c]" />
              <span>Daily Energy Check-in</span>
            </h3>
            {todaysMood ? (
               <div className="bg-green-50/50 border border-green-100 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-2">
                 <CheckCircle2 className="w-10 h-10 text-green-500 mb-2" />
                 <h4 className="font-medium text-green-800">You're checked in for today!</h4>
                 <p className="text-sm text-green-600">Great job tracking your energy.</p>
               </div>
            ) : (
              <div className="grid grid-cols-5 gap-2 sm:gap-4">
                {MOODS.map(m => (
                  <button 
                    key={m.label}
                    onClick={() => handleMoodSelect(m.value)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border hover:scale-105 transition-all ${m.color} ${m.hover} bg-white shadow-sm cursor-pointer`}
                  >
                    <span className="text-2xl sm:text-3xl mb-1">{m.icon}</span>
                    <span className="font-medium text-[10px] sm:text-xs">{m.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Energy History Chart */}
          <div className="bg-[#f8fafc] p-6 rounded-xl border border-[#002147]/5">
            <h3 className="font-semibold text-[#002147] mb-6 flex items-center space-x-2">
              <Activity className="w-5 h-5 text-[#002147]/70" />
              <span>Energy History (Last 7 Logs)</span>
            </h3>
            <div className="h-40 flex items-end justify-between space-x-2 relative">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-5">
                <div className="w-full h-px bg-[#002147]"></div>
                <div className="w-full h-px bg-[#002147]"></div>
                <div className="w-full h-px bg-[#002147]"></div>
              </div>

              {history.length > 0 ? history.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center group z-10 h-full justify-end">
                  <div 
                    className="w-full max-w-[40px] bg-[#002147]/20 rounded-t-sm group-hover:bg-[#dc143c] transition-colors relative" 
                    style={{ height: `${day.value}%` }}
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#002147] text-white text-[10px] py-1 px-2 rounded whitespace-nowrap">
                      {day.value}%
                    </div>
                  </div>
                  <span className="text-[10px] sm:text-xs font-medium text-[#002147]/50 mt-3">
                    {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                </div>
              )) : (
                <div className="absolute inset-0 flex items-center justify-center text-[#002147]/40 text-sm">
                  No history found. Complete your check-in above!
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column */}
        <div className="space-y-8">
          
          {/* Breathing Exercise */}
          <div className="bg-[#f8fafc] p-6 rounded-xl border border-[#002147]/5 flex flex-col items-center text-center">
            <h3 className="font-semibold text-[#002147] mb-2 flex items-center space-x-2">
              <Wind className="w-5 h-5 text-teal-600" />
              <span>Box Breathing</span>
            </h3>
            <p className="text-xs text-[#002147]/60 mb-6">Reduce stress and regain focus</p>

            <div className="relative w-40 h-40 mb-6 flex items-center justify-center">
              <div className={`absolute inset-0 rounded-full border-2 border-teal-200 transition-all duration-1000 ${isBreathing ? 'opacity-100 scale-110' : 'opacity-0 scale-90'}`}></div>
              
              <div 
                className={`w-24 h-24 rounded-full bg-teal-500 flex items-center justify-center text-white font-semibold text-lg shadow-md transition-all ease-in-out origin-center z-10
                  ${!isBreathing ? 'scale-100 opacity-90' : ''}
                  ${breathPhase === 'Inhale' ? 'scale-[1.5]' : ''}
                  ${breathPhase === 'Hold' ? 'scale-[1.5] opacity-90' : ''}
                  ${breathPhase === 'Exhale' ? 'scale-100' : ''}
                `}
                style={{
                  transitionDuration: breathPhase === 'Hold' ? '2000ms' : (isBreathing ? '4000ms' : '500ms')
                }}
              >
                <span className={`${isBreathing ? 'scale-75 transition-transform' : ''}`}>
                  {isBreathing ? breathPhase : 'Start'}
                </span>
              </div>
            </div>

            <button 
              onClick={() => setIsBreathing(!isBreathing)}
              className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${isBreathing ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100' : 'bg-[#002147] text-white hover:bg-[#003b80]'}`}
            >
              {isBreathing ? 'Stop Exercise' : 'Begin Exercise'}
            </button>
          </div>

          {/* Journaling */}
          <div className="bg-[#f8fafc] p-6 rounded-xl border border-[#002147]/5">
            <h3 className="font-semibold text-[#002147] mb-2 flex items-center space-x-2">
              <PenTool className="w-5 h-5 text-indigo-600" />
              <span>Private Journal</span>
            </h3>
            <p className="text-[11px] text-[#002147]/60 mb-4 bg-indigo-50 text-indigo-800 p-2 rounded-lg border border-indigo-100">
              <span className="font-semibold">Transparency Note:</span> Your teachers and counselors can read these entries to better understand and support your well-being.
            </p>
            
            <textarea
              value={journalText}
              onChange={(e) => setJournalText(e.target.value)}
              placeholder="How are you feeling right now? Unload your thoughts here..."
              className="w-full h-24 p-3 bg-white border border-[#002147]/10 rounded-lg focus:ring-1 focus:ring-[#002147] focus:border-[#002147] outline-none resize-none text-sm placeholder:text-[#002147]/30 mb-3"
            ></textarea>
            
            <div className="flex items-center justify-between">
              <a href="mailto:counselor@sthara.edu" className="text-sm font-medium text-[#dc143c] hover:underline flex items-center space-x-1">
                <MessageCircle className="w-4 h-4" />
                <span>Chat with Counselor</span>
              </a>
              <button 
                onClick={handleJournalSubmit}
                disabled={!journalText.trim() || journalSaved}
                className="py-2 px-4 bg-[#002147] text-white rounded-lg text-sm font-medium hover:bg-[#003b80] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
              >
                {journalSaved ? (
                  <><CheckCircle2 className="w-4 h-4" /> <span>Saved</span></>
                ) : (
                  <span>Save Entry</span>
                )}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
