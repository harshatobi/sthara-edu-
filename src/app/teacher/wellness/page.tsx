'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, orderBy, getDocs, where, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { 
  Heart, Activity, PenTool, AlertTriangle, User, 
  ArrowLeft, ChevronDown, MessageCircle, Sparkles, BrainCircuit, CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface WellnessLog {
  id: string;
  userId: string;
  moodValue: number;
  resolved?: boolean;
  createdAt: any;
}

interface JournalEntry {
  id: string;
  userId: string;
  text: string;
  sentiment?: string;
  resolved?: boolean;
  createdAt: any;
}

interface StudentData {
  id: string;
  name: string;
  email: string;
}

export default function TeacherWellnessDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Record<string, StudentData>>({});
  const [logs, setLogs] = useState<WellnessLog[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  useEffect(() => {
    if (!authLoading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, authLoading, router]);

  useEffect(() => {
    if (profile?.schoolId) {
      if (profile.teacherClass) {
        setAvailableClasses([profile.teacherClass]);
        setSelectedClass(profile.teacherClass);
      } else {
        const defaultClasses = ['Class 10', 'Class 11'];
        setAvailableClasses(defaultClasses);
        setSelectedClass(defaultClasses[0]);
      }
    }
  }, [profile]);

  useEffect(() => {
    async function fetchData() {
      if (!profile?.schoolId || !selectedClass) return;
      setLoading(true);

      try {
        // 1. Fetch Students in this class
        const usersSnap = await getDocs(query(
          collection(db, 'users'),
          where('schoolId', '==', profile.schoolId),
          where('role', '==', 'student'),
          where('studentClass', '==', selectedClass)
        ));
        
        const studentMap: Record<string, StudentData> = {};
        usersSnap.docs.forEach(doc => {
          const data = doc.data();
          studentMap[doc.id] = { id: doc.id, name: data.name, email: data.email };
        });
        setStudents(studentMap);

        // If no students, clear data and return
        if (Object.keys(studentMap).length === 0) {
          setLogs([]);
          setJournals([]);
          setLoading(false);
          return;
        }

        // 2. Fetch Wellness Logs
        const logsQ = query(collection(db, 'wellness_logs'), orderBy('createdAt', 'desc'));
        const logsSnap = await getDocs(logsQ);
        const fetchedLogs = logsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as WellnessLog))
          .filter(l => studentMap[l.userId]); // Keep all logs for accurate averages
        
        setLogs(fetchedLogs);

        // 3. Fetch Journals
        const journalQ = query(collection(db, 'journal_entries'), orderBy('createdAt', 'desc'));
        const journalSnap = await getDocs(journalQ);
        const fetchedJournals = journalSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as JournalEntry))
          .filter(j => studentMap[j.userId]); 
          
        setJournals(fetchedJournals);

      } catch (err) {
        console.error("Error fetching wellness data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [profile?.schoolId, selectedClass]);

  const handleSimulateData = async () => {
    if (!profile?.schoolId || !selectedClass) return;
    setIsSimulating(true);

    try {
      const studentIds = Object.keys(students);
      if (studentIds.length === 0) {
        alert(`No students found in ${selectedClass} to attach data to.`);
        setIsSimulating(false);
        return;
      }

      const fakeJournals = [
        { text: "I felt really overwhelmed by the physics assignment today. Too many formulas.", sentiment: "Stressed" },
        { text: "The group project is going well! I finally understand factorization.", sentiment: "Positive" },
        { text: "Just tired today. Didn't sleep well because of exam anxiety.", sentiment: "Anxious" },
        { text: "I'm starting to enjoy literature more. The new book is interesting.", sentiment: "Reflective" },
        { text: "I can't seem to focus in the mornings. Everything is a blur.", sentiment: "Low Energy" }
      ];

      for (const fj of fakeJournals) {
        const randomStudentId = studentIds[Math.floor(Math.random() * studentIds.length)];
        await addDoc(collection(db, 'journal_entries'), {
          userId: randomStudentId,
          text: fj.text,
          sentiment: fj.sentiment,
          resolved: false,
          createdAt: serverTimestamp()
        });
      }

      for (let i = 0; i < 10; i++) {
        const randomStudentId = studentIds[Math.floor(Math.random() * studentIds.length)];
        const energyLevels = [20, 35, 50, 65, 80, 95];
        const randomEnergy = energyLevels[Math.floor(Math.random() * energyLevels.length)];
        
        await addDoc(collection(db, 'wellness_logs'), {
          userId: randomStudentId,
          moodValue: randomEnergy,
          resolved: false,
          createdAt: serverTimestamp()
        });
      }

      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Failed to simulate data.");
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResolveJournal = async (id: string) => {
    // Optimistic UI update by setting resolved locally
    setJournals(prev => prev.map(j => j.id === id ? { ...j, resolved: true } : j));
    try {
      await updateDoc(doc(db, 'journal_entries', id), { resolved: true });
    } catch (err) {
      console.error("Failed to resolve journal", err);
    }
  };

  const handleResolveLog = async (id: string) => {
    // Optimistic UI update
    setLogs(prev => prev.map(l => l.id === id ? { ...l, resolved: true } : l));
    try {
      await updateDoc(doc(db, 'wellness_logs', id), { resolved: true });
    } catch (err) {
      console.error("Failed to resolve log", err);
    }
  };

  const getSentimentStyle = (sentiment?: string) => {
    switch (sentiment) {
      case 'Positive': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Stressed': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'Anxious': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Low Energy': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Reflective': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  if (authLoading || !profile) return (
    <div className="min-h-screen bg-[#f8fafc] flex justify-center items-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-[#002147] font-semibold tracking-wide">Loading Wellness Engine...</p>
      </div>
    </div>
  );

  const averageEnergy = logs.length > 0 
    ? Math.round(logs.reduce((acc, l) => acc + l.moodValue, 0) / logs.length) 
    : 0;

  const unresolvedLogs = logs.filter(l => !l.resolved);
  const unresolvedJournals = journals.filter(j => !j.resolved);
  
  const lowEnergyCount = unresolvedLogs.filter(l => l.moodValue <= 40).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-16 font-sans">
      
      {/* Header Banner */}
      <div className="bg-white border-b border-gray-200/60 shadow-sm sticky top-0 z-40 backdrop-blur-xl bg-white/80">
        <div className="max-w-[1200px] mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <Link href="/teacher" className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors border border-gray-200/60 group">
              <ArrowLeft className="w-5 h-5 text-gray-500 group-hover:text-[#002147] transition-colors" />
            </Link>
            <div>
              <div className="flex items-center space-x-2 text-rose-500 text-xs font-bold uppercase tracking-wider mb-1">
                <Heart className="w-4 h-4" />
                <span>Classroom Pulse</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[#002147]">Wellness Dashboard</h1>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button 
              onClick={handleSimulateData}
              disabled={isSimulating}
              className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 text-[#002147] rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50"
            >
              {isSimulating ? (
                <div className="w-4 h-4 border-2 border-[#002147]/30 border-t-[#002147] rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-purple-500" />
              )}
              <span>Simulate Data</span>
            </button>

            <div className="relative">
              <select 
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="appearance-none bg-white border border-gray-200 hover:border-gray-300 rounded-xl pl-4 pr-10 py-2.5 text-[#002147] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold shadow-sm transition-all cursor-pointer"
              >
                {availableClasses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-8">
        
        {loading ? (
           <div className="py-20 text-center text-[#002147]/50 font-medium animate-pulse">
             Analyzing student wellness records...
           </div>
        ) : Object.keys(students).length === 0 ? (
           <div className="py-32 px-6 flex flex-col items-center justify-center text-center bg-white rounded-2xl shadow-sm border border-gray-200/60">
             <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6">
               <AlertTriangle className="w-10 h-10 text-blue-500" />
             </div>
             <h3 className="text-2xl font-bold text-[#002147] mb-2">No Students Found</h3>
             <p className="text-gray-500 max-w-md">We couldn't find any student records for {selectedClass}.</p>
           </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-500">
            
            {/* Top Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-6 flex items-center justify-between overflow-hidden relative group">
                <div className="absolute -right-10 -bottom-10 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Activity className="w-48 h-48 text-emerald-500" />
                </div>
                <div className="relative z-10">
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Class Avg Energy</p>
                  <h2 className="text-5xl font-black text-[#002147]">{averageEnergy}%</h2>
                  <p className="text-sm font-medium text-emerald-600 mt-2 flex items-center">
                    <Activity className="w-4 h-4 mr-1" /> Healthy Baseline
                  </p>
                </div>
                <div className="relative w-24 h-24 mr-4">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-gray-100" />
                    <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="12" fill="transparent" 
                      strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * averageEnergy) / 100}
                      className="text-emerald-500 transition-all duration-1000 ease-out" 
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-6 flex items-center justify-between overflow-hidden relative group">
                <div className="absolute -right-10 -bottom-10 opacity-5 group-hover:opacity-10 transition-opacity">
                  <AlertTriangle className="w-48 h-48 text-rose-500" />
                </div>
                <div className="relative z-10">
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Unresolved At-Risk</p>
                  <h2 className="text-5xl font-black text-rose-600">{lowEnergyCount}</h2>
                  <p className="text-sm font-medium text-rose-500 mt-2 flex items-center">
                    <Heart className="w-4 h-4 mr-1" /> Needs Attention
                  </p>
                </div>
                <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mr-6 border-4 border-rose-100 group-hover:scale-110 transition-transform">
                  <AlertTriangle className="w-10 h-10 text-rose-500" />
                </div>
              </div>

            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              
              {/* Recent Journals */}
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200/60">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-lg font-bold text-[#002147] flex items-center space-x-2">
                    <PenTool className="w-5 h-5 text-indigo-500" />
                    <span>Unreviewed Journals</span>
                  </h2>
                  <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-3 py-1 rounded-full border border-indigo-100">
                    AI Analyzed
                  </span>
                </div>
                
                <div className="space-y-4">
                  {unresolvedJournals.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">No unreviewed journal entries!</div>
                  ) : (
                    unresolvedJournals.map(journal => {
                      const studentName = students[journal.userId]?.name || 'Unknown Student';
                      const date = journal.createdAt ? journal.createdAt.toDate().toLocaleString() : 'Just now';
                      const sentiment = journal.sentiment || 'Reflective';
                      
                      return (
                        <div key={journal.id} className="p-5 rounded-2xl border border-gray-200/60 hover:border-indigo-300 hover:shadow-md transition-all bg-white group relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 flex items-center justify-center text-indigo-700 font-bold border border-indigo-200 shadow-inner">
                                {studentName.charAt(0)}
                              </div>
                              <div>
                                <span className="font-bold text-[#002147] block">{studentName}</span>
                                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">{date}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end space-y-2">
                              <div className="flex items-center space-x-1.5">
                                <BrainCircuit className="w-3.5 h-3.5 text-gray-400" />
                                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md border ${getSentimentStyle(sentiment)}`}>
                                  {sentiment}
                                </span>
                              </div>
                              <button 
                                onClick={() => handleResolveJournal(journal.id)}
                                className="text-xs font-bold text-gray-500 hover:text-indigo-600 transition-colors flex items-center space-x-1"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Mark Reviewed</span>
                              </button>
                            </div>
                          </div>
                          <p className="text-gray-700 leading-relaxed font-medium">
                            "{journal.text}"
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Energy Logs List */}
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200/60">
                <h2 className="text-lg font-bold text-[#002147] mb-8 flex items-center space-x-2">
                  <Activity className="w-5 h-5 text-emerald-500" />
                  <span>Unresolved Energy Check-ins</span>
                </h2>

                <div className="space-y-4">
                  {unresolvedLogs.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">No unresolved energy logs!</div>
                  ) : (
                    unresolvedLogs.map(log => {
                      const studentName = students[log.userId]?.name || 'Unknown Student';
                      const date = log.createdAt ? log.createdAt.toDate().toLocaleString() : 'Just now';
                      
                      let colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                      let barColor = 'bg-emerald-500';
                      if (log.moodValue <= 40) {
                        colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
                        barColor = 'bg-amber-500';
                      }
                      if (log.moodValue <= 20) {
                        colorClass = 'bg-rose-50 text-rose-700 border-rose-200';
                        barColor = 'bg-rose-500';
                      }
                      
                      return (
                        <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-gray-200/60 hover:bg-gray-50 transition-colors gap-4">
                          
                          <div className="flex items-center space-x-4">
                            <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center border font-black shadow-sm ${colorClass}`}>
                              <span className="text-lg leading-none">{log.moodValue}</span>
                              <span className="text-[9px] uppercase tracking-widest opacity-80 mt-0.5">%</span>
                            </div>
                            <div>
                              <div className="font-bold text-[#002147]">{studentName}</div>
                              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-0.5">{date}</div>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-3 w-full sm:w-auto">
                            {/* Visual Bar representing energy */}
                            <div className="hidden sm:block w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full ${barColor}`} style={{ width: `${log.moodValue}%` }} />
                            </div>

                            {log.moodValue <= 40 ? (
                              <button 
                                onClick={() => handleResolveLog(log.id)}
                                className="flex-1 sm:flex-none px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors flex items-center justify-center space-x-2"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>Check-in</span>
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleResolveLog(log.id)}
                                className="flex-1 sm:flex-none px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 text-xs font-bold rounded-xl text-center flex items-center justify-center space-x-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Acknowledge</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
