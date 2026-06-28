'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs, where, updateDoc, doc } from 'firebase/firestore';

import { 
  Heart, Activity, AlertTriangle,
  ArrowLeft, ChevronDown, MessageCircle, CheckCircle2
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
  
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);


  useEffect(() => {
    if (!authLoading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, authLoading, router]);

  // Classes discovered dynamically from student data (same pattern as heatmap)
  useEffect(() => {
    if (!profile?.schoolId) return;
    const discoverClasses = async () => {
      try {
        const [usSnap, guSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('schoolId', '==', profile.schoolId), where('role', '==', 'student'))),
          getDocs(query(collection(db, 'global_users'), where('schoolId', '==', profile.schoolId), where('role', '==', 'student'))),
        ]);
        const classSet = new Set<string>();
        [...usSnap.docs, ...guSnap.docs].forEach(d => {
          const c = d.data().studentClass;
          if (c) classSet.add(c);
        });
        const teacherClasses = [
          ...(profile.assignments?.map((a: any) => a.class).filter(Boolean) ?? []),
          ...(profile.teacherClass ? [profile.teacherClass] : []),
        ];
        const unique = [...new Set(teacherClasses)];
        const classes = unique.length > 0 ? unique : Array.from(classSet).sort();
        setAvailableClasses(classes);
        if (classes.length > 0 && !selectedClass) setSelectedClass(classes[0]);
      } catch {}
    };
    discoverClasses();
  }, [profile]);


  useEffect(() => {
    async function fetchData() {
      if (!profile?.schoolId || !selectedClass) return;
      setLoading(true);

      try {
        // 1. Fetch Students from BOTH collections (same as heatmap)
        const [usSnap, guSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'users'),
            where('schoolId', '==', profile.schoolId),
            where('role', '==', 'student'),
            where('studentClass', '==', selectedClass)
          )),
          getDocs(query(
            collection(db, 'global_users'),
            where('schoolId', '==', profile.schoolId),
            where('role', '==', 'student'),
            where('studentClass', '==', selectedClass)
          )),
        ]);
        
        const studentMap: Record<string, StudentData> = {};
        [...usSnap.docs, ...guSnap.docs].forEach(docSnap => {
          if (!studentMap[docSnap.id]) {
            const data = docSnap.data();
            studentMap[docSnap.id] = { id: docSnap.id, name: data.name, email: data.email };
          }
        });
        setStudents(studentMap);

        // If no students, clear data and return
        if (Object.keys(studentMap).length === 0) {
          setLogs([]);
          setLoading(false);
          return;
        }

        // 2. Fetch Wellness Logs — filter by schoolId only (no orderBy = no composite index needed)
        //    Sort in memory instead
        const logsSnap = await getDocs(query(
          collection(db, 'wellness_logs'),
          where('schoolId', '==', profile.schoolId)
        ));
        const fetchedLogs = logsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as WellnessLog))
          .filter(l => studentMap[l.userId])
          .sort((a, b) => {
            const aTime = a.createdAt?.toDate?.()?.getTime() ?? 0;
            const bTime = b.createdAt?.toDate?.()?.getTime() ?? 0;
            return bTime - aTime;
          });
        
        setLogs(fetchedLogs);


      } catch (err) {
        console.error("Error fetching wellness data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [profile?.schoolId, selectedClass]);




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

            {/* Energy Logs — full width */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200/60">
              <h2 className="text-lg font-bold text-[#002147] mb-8 flex items-center space-x-2">
                <Activity className="w-5 h-5 text-emerald-500" />
                <span>Unresolved Energy Check-ins</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {unresolvedLogs.length === 0 ? (
                  <div className="col-span-2 text-sm text-gray-500 text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">No unresolved energy logs!</div>
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
        )}
      </div>
    </div>
  );
}
