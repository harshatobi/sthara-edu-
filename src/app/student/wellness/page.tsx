'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs, addDoc, serverTimestamp, where } from 'firebase/firestore';

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
  const [loading, setLoading] = useState(true);
  const [todaysMood, setTodaysMood] = useState<number | null>(null);
  const [history, setHistory] = useState<{date: string, value: number}[]>([]);
  


  // Breathing state
  const [isBreathing, setIsBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'Inhale' | 'Hold' | 'Exhale' | 'Hold2' | 'Idle'>('Idle');

  
  // Load initial data
  useEffect(() => {
    if (!profile?.uid) return;
    
    async function loadWellness() {
      try {
        const logsRef = collection(db, 'wellness_logs');
        // Use only 'where' to avoid composite index requirement; sort & slice in-memory
        const q = query(logsRef, where('userId', '==', profile?.uid));
        const snapshot = await getDocs(q);
        
        // Sort by createdAt descending in-memory, take last 7
        const sortedDocs = snapshot.docs
          .filter(d => d.data().createdAt)
          .sort((a, b) => b.data().createdAt.toMillis() - a.data().createdAt.toMillis())
          .slice(0, 7);
        
        const todayString = new Date().toDateString();
        const loadedHistory: {date: string, value: number}[] = [];
        let foundToday = false;

        sortedDocs.forEach(doc => {
          const data = doc.data();
          const dateObj = data.createdAt.toDate();
          loadedHistory.push({
            date: dateObj.toISOString(),
            value: data.moodValue
          });
          if (dateObj.toDateString() === todayString && !foundToday) {
            foundToday = true;
            setTodaysMood(data.moodValue);
          }
        });
        
        // sortedDocs is newest-first; reverse for chronological chart display
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
    if (todaysMood !== null) return; // already logged today

    setTodaysMood(value);
    
    try {
      await addDoc(collection(db, 'wellness_logs'), {
        userId: profile?.uid,
        schoolId: profile?.schoolId,
        moodValue: value,
        createdAt: serverTimestamp()
      });

      
      setHistory(prev => [...prev, { date: new Date().toISOString(), value }]);
    } catch (err) {
      console.error("Failed to save mood", err);
    }
  };


  useEffect(() => {
    let timeout1: any;
    let timeout2: any;
    let timeout3: any;
    let timeout4: any;
    let cycleInterval: any;

    if (isBreathing) {
      const cycle = () => {
        setBreathPhase('Inhale');
        timeout1 = setTimeout(() => {
          setBreathPhase('Hold');
          timeout2 = setTimeout(() => {
            setBreathPhase('Exhale');
            timeout3 = setTimeout(() => {
              setBreathPhase('Hold2');
            }, 4000);
          }, 4000);
        }, 4000);
      };

      cycle();
      cycleInterval = setInterval(cycle, 16000); // 4+4+4+4 = 16s
    } else {
      setBreathPhase('Idle');
    }

    return () => {
      clearInterval(cycleInterval);
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
      clearTimeout(timeout4);
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
                  ${breathPhase === 'Hold2' ? 'scale-100 opacity-80' : ''}
                `}
                style={{
                  transitionDuration: (breathPhase === 'Hold' || breathPhase === 'Hold2') ? '4000ms' : (isBreathing ? '4000ms' : '500ms')
                }}
              >
                <span className={`${isBreathing ? 'scale-75 transition-transform' : ''}`}>
                  {isBreathing ? (breathPhase === 'Hold2' ? 'Hold' : breathPhase) : 'Start'}
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


        </div>
      </div>
    </div>
  );
}
