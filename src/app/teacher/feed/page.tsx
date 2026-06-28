'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Activity, ShieldAlert, BrainCircuit, 
  HeartPulse, CheckCircle2, MessageCircle, Clock, 
  Filter, Sparkles
} from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { 
  collection, query, where, getDocs, doc, 
  addDoc, serverTimestamp, onSnapshot, orderBy, updateDoc 
} from 'firebase/firestore';
import Link from 'next/link';

type SituationCategory = 'all' | 'security' | 'academic' | 'wellness';

export default function SituationalFeedPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [situations, setSituations] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<SituationCategory>('all');
  const [isSimulating, setIsSimulating] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId) return;

    // Real-time listener for situations
    const situationsRef = collection(db, 'schools', profile.schoolId, 'situations');
    const q = query(situationsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSituations(fetched);
    });

    return () => unsubscribe();
  }, [profile?.schoolId]);

  const handleSimulateDiagnostics = async () => {
    if (!profile?.schoolId) return;
    const targetClass = profile.teacherClass || 'Class 10';
    setIsSimulating(true);

    try {
      // 1. Fetch some students to attach alerts to
      const studentsSnap = await getDocs(query(
        collection(db, 'users'),
        where('schoolId', '==', profile.schoolId),
        where('role', '==', 'student'),
        where('studentClass', '==', targetClass)
      ));
      
      const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (students.length === 0) {
        alert("No students found in " + targetClass + " to run diagnostics on.");
        setIsSimulating(false);
        return;
      }

      // Templates for different algorithms
      const alertTemplates = [
        { cat: 'security', priority: 'high', title: 'Tab Switch Detected', detail: 'Switched tabs for 24 seconds during Physics Midterm Exam. Focus lost.', icon: 'ShieldAlert' },
        { cat: 'security', priority: 'medium', title: 'Background Noise', detail: 'Unusual background audio levels detected during remote assignment.', icon: 'ShieldAlert' },
        { cat: 'academic', priority: 'high', title: 'Conceptual Struggle', detail: 'Failed 3 consecutive attempts on "Quadratic Equations". Frustration detected.', icon: 'BrainCircuit' },
        { cat: 'academic', priority: 'low', title: 'Homework Completed', detail: 'Completed Chemistry HW with 92% AI-estimated accuracy.', icon: 'BrainCircuit' },
        { cat: 'wellness', priority: 'high', title: 'High Stress Indicators', detail: 'Typing patterns and rapid clicking indicate high stress levels. Intervention recommended.', icon: 'HeartPulse' },
        { cat: 'wellness', priority: 'medium', title: 'Low Energy Check', detail: 'Reported low energy during morning login sequence. Engagement is dropping.', icon: 'HeartPulse' },
      ];

      // Pick 3 random alerts and attach to random students
      for (let i = 0; i < 3; i++) {
        const student = students[Math.floor(Math.random() * students.length)] as any;
        const template = alertTemplates[Math.floor(Math.random() * alertTemplates.length)];
        
        await addDoc(collection(db, 'schools', profile.schoolId, 'situations'), {
          studentId: student.id,
          studentName: student.name || 'Unknown Student',
          class: targetClass,
          category: template.cat,
          priority: template.priority,
          title: template.title,
          detail: template.detail,
          acknowledged: false,
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.error(err);
      alert("Failed to simulate diagnostics.");
    } finally {
      setIsSimulating(false);
    }
  };

  const handleAcknowledge = async (id: string) => {
    if (!profile?.schoolId) return;
    setAcknowledgingId(id);
    try {
      const docRef = doc(db, 'schools', profile.schoolId, 'situations', id);
      await updateDoc(docRef, { acknowledged: true });
    } catch (err) {
      console.error("Failed to acknowledge", err);
    } finally {
      setAcknowledgingId(null);
    }
  };

  const getCategoryStyles = (category: string) => {
    switch (category) {
      case 'security': return 'bg-rose-100 text-rose-600 border-rose-200';
      case 'academic': return 'bg-indigo-100 text-indigo-600 border-indigo-200';
      case 'wellness': return 'bg-amber-100 text-amber-600 border-amber-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'security': return <ShieldAlert className="w-5 h-5" />;
      case 'academic': return <BrainCircuit className="w-5 h-5" />;
      case 'wellness': return <HeartPulse className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    const seconds = Math.floor((new Date().getTime() - timestamp.toDate().getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const unacknowledgedSituations = situations.filter(s => !s.acknowledged);
  const filteredSituations = activeFilter === 'all' 
    ? unacknowledgedSituations 
    : unacknowledgedSituations.filter(s => s.category === activeFilter);

  if (loading || !profile) return (
    <div className="min-h-screen bg-[#f8fafc] flex justify-center items-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-[#002147] font-semibold tracking-wide">Connecting to Live Feed...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-16 font-sans">
      
      {/* Header Banner */}
      <div className="bg-white border-b border-gray-200/60 shadow-sm sticky top-0 z-40 backdrop-blur-xl bg-white/80">
        <div className="max-w-[1000px] mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <Link href="/teacher" className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors border border-gray-200/60 group">
              <ArrowLeft className="w-5 h-5 text-gray-500 group-hover:text-[#002147] transition-colors" />
            </Link>
            <div>
              <div className="flex items-center space-x-2 text-rose-500 text-xs font-bold uppercase tracking-wider mb-1">
                <Activity className="w-4 h-4" />
                <span>Live Intelligence</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[#002147]">Situational Feed</h1>
            </div>
          </div>


        </div>
      </div>

      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 pt-8">
        
        {/* Filters */}
        <div className="flex items-center space-x-3 mb-10 overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex items-center justify-center p-2 bg-gray-200/50 rounded-lg mr-2">
            <Filter className="w-4 h-4 text-gray-500" />
          </div>
          {(['all', 'security', 'academic', 'wellness'] as SituationCategory[]).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={`px-5 py-2 rounded-xl text-sm font-bold capitalize transition-all whitespace-nowrap ${
                activeFilter === cat 
                  ? 'bg-[#002147] text-white shadow-md' 
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
              }`}
            >
              {cat === 'all' ? 'All Alerts' : cat}
              {cat === 'all' && unacknowledgedSituations.length > 0 && (
                <span className="ml-2 bg-rose-500 text-white px-2 py-0.5 rounded-full text-[10px]">
                  {unacknowledgedSituations.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Timeline Feed */}
        <div className="relative">
          {/* Vertical Timeline Line */}
          <div className="absolute left-[39px] top-4 bottom-8 w-0.5 bg-gray-200 hidden md:block" />

          {filteredSituations.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-gray-200/60 shadow-sm relative z-10">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-xl font-bold text-[#002147] mb-2">All Clear!</h3>
              <p className="text-gray-500 max-w-sm">There are no active situations or unacknowledged alerts for your class right now.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredSituations.map((situation) => (
                <div 
                  key={situation.id} 
                  className={`relative flex flex-col md:flex-row items-start md:space-x-6 group transition-all duration-500 ${
                    acknowledgingId === situation.id ? 'opacity-0 scale-95 translate-x-10' : 'opacity-100 scale-100'
                  }`}
                >
                  
                  {/* Timeline Node */}
                  <div className="hidden md:flex flex-col items-center relative z-10 pt-4">
                    <div className={`w-14 h-14 rounded-full border-4 border-gray-50 flex items-center justify-center shadow-sm ${getCategoryStyles(situation.category)}`}>
                      {getCategoryIcon(situation.category)}
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="flex-1 w-full bg-white p-6 rounded-2xl shadow-sm border border-gray-200/60 hover:shadow-md hover:border-gray-300 transition-all">
                    
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4">
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md ${getCategoryStyles(situation.category)}`}>
                            {situation.category}
                          </span>
                          {situation.priority === 'high' && (
                            <span className="flex items-center space-x-1 text-rose-600 text-xs font-bold animate-pulse">
                              <span className="w-1.5 h-1.5 bg-rose-600 rounded-full" />
                              <span>Urgent</span>
                            </span>
                          )}
                        </div>
                        <h3 className="text-xl font-bold text-[#002147] mt-1">{situation.title}</h3>
                        <div className="text-sm font-semibold text-blue-600 mt-0.5">
                          Student: {situation.studentName}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-1.5 text-gray-400 bg-gray-50 px-3 py-1 rounded-lg border border-gray-100 whitespace-nowrap">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-xs font-semibold">{formatTimeAgo(situation.createdAt)}</span>
                      </div>
                    </div>

                    <p className="text-gray-600 leading-relaxed mb-6">
                      {situation.detail}
                    </p>
                    
                    <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-100">
                      <button 
                        onClick={() => handleAcknowledge(situation.id)}
                        disabled={acknowledgingId === situation.id}
                        className="px-5 py-2 bg-[#002147] text-white text-sm font-bold rounded-xl hover:bg-[#003366] transition-colors shadow-sm disabled:opacity-50"
                      >
                        {acknowledgingId === situation.id ? 'Acknowledging...' : 'Acknowledge & Resolve'}
                      </button>
                      
                      <Link 
                        href={`/teacher/mastery?studentId=${situation.studentId}`}
                        className="px-4 py-2 bg-white border border-gray-200 text-[#002147] text-sm font-bold rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-colors flex items-center space-x-2"
                      >
                        <span>View Profile</span>
                      </Link>

                      <button className="px-4 py-2 bg-blue-50 text-blue-700 text-sm font-bold rounded-xl hover:bg-blue-100 transition-colors flex items-center space-x-2 ml-auto">
                        <MessageCircle className="w-4 h-4" />
                        <span className="hidden sm:inline">Message</span>
                      </button>
                    </div>

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
