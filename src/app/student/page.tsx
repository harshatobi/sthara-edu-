'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, Calendar, TrendingUp, CheckCircle2, LogOut, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

interface Assignment {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  description: string;
  subject: string;
  teacherName: string;
}

export default function StudentDashboard() {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'student')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId || !profile?.studentClass) return;

    const fetchAssignments = async () => {
      try {
        const q = query(
          collection(db, 'schools', profile.schoolId, 'assignments'),
          where('class', '==', profile.studentClass)
          // Note: orderBy('createdAt', 'desc') requires a composite index in Firestore.
          // For now, we fetch and sort on the client to avoid errors if the index doesn't exist.
        );
        
        const querySnapshot = await getDocs(q);
        const tasks: Assignment[] = [];
        querySnapshot.forEach((doc) => {
          tasks.push({ id: doc.id, ...doc.data() } as Assignment);
        });
        
        // Client-side sort by dueDate closest first
        tasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        setAssignments(tasks);
      } catch (error) {
        console.error("Error fetching assignments:", error);
      } finally {
        setLoadingTasks(false);
      }
    };

    fetchAssignments();
  }, [profile?.schoolId, profile?.studentClass]);

  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading Student Portal...</div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#002147]">Welcome back, {profile.name?.split(' ')[0]}!</h2>
          <div className="flex items-center space-x-3 mt-2">
            <span className="bg-[#002147]/10 text-[#002147] px-3 py-1 rounded-full text-sm font-bold font-mono">
              {profile.customStudentId || 'ID Pending'}
            </span>
            <span className="text-[#002147]/60 font-medium">Class: {profile.studentClass || 'Unassigned'}</span>
          </div>
        </div>
        
        <div className="flex space-x-4">
          <div className="hidden md:flex bg-white border border-[#002147]/10 px-4 py-3 rounded-xl shadow-sm items-center space-x-4">
            <span className="text-sm font-medium text-[#002147]/70">Daily Energy:</span>
            <div className="flex space-x-2">
              <button className="text-2xl hover:scale-110 transition-transform">😴</button>
              <button className="text-2xl hover:scale-110 transition-transform">😐</button>
              <button className="text-2xl hover:scale-110 transition-transform ring-2 ring-[#dc143c] rounded-full">🚀</button>
            </div>
          </div>
          
          <button 
            onClick={signOut}
            className="flex items-center space-x-2 bg-white border border-[#002147]/10 px-4 py-3 rounded-xl shadow-sm hover:bg-[#f8fafc] text-[#dc143c] transition-colors font-medium"
          >
            <LogOut className="w-5 h-5" />
            <span className="hidden md:inline">Sign Out</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Overall Mastery" value="84%" icon={TrendingUp} trend="+2% this week" />
        <StatCard title="Pending Tasks" value={assignments.length.toString()} icon={Calendar} trend="Active assignments" alert={assignments.length > 0} />
        <StatCard title="Recent Scores" value="A-" icon={CheckCircle2} trend="Math: Quadratic Eq" />
      </div>

      <div className="bg-white border border-[#002147]/10 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center space-x-3 mb-6">
          <Bell className="w-6 h-6 text-[#dc143c]" />
          <h3 className="text-xl font-semibold text-[#002147]">Notifications & Tasks</h3>
        </div>
        
        <div className="space-y-4">
          {loadingTasks ? (
            <div className="flex justify-center items-center py-8 text-[#002147]/50">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span>Loading tasks from teachers...</span>
            </div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-8 text-[#002147]/50 bg-[#f8fafc] rounded-xl border border-dashed border-[#002147]/10">
              Hooray! You have no pending tasks.
            </div>
          ) : (
            assignments.map((task) => (
              <TaskItem 
                key={task.id} 
                title={`${task.subject}: ${task.title}`} 
                time={`Due: ${task.dueDate} • Posted by ${task.teacherName}`} 
                type={task.type as 'homework' | 'video' | 'announcement'} 
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, alert = false }: any) {
  return (
    <div className="bg-white border border-[#002147]/10 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <div className="text-[#002147]/60 font-medium">{title}</div>
        <div className={`p-2 rounded-lg ${alert ? 'bg-[#dc143c]/10 text-[#dc143c]' : 'bg-[#002147]/5 text-[#002147]'}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div>
        <div className="text-3xl font-bold text-[#002147]">{value}</div>
        <div className={`text-sm mt-1 ${alert ? 'text-[#dc143c] font-medium' : 'text-[#002147]/60'}`}>{trend}</div>
      </div>
    </div>
  );
}

function TaskItem({ title, time, type }: { title: string, time: string, type: 'homework' | 'video' | 'announcement' }) {
  return (
    <div className="flex items-center justify-between p-4 bg-[#f8fafc] rounded-xl border border-[#002147]/5 hover:bg-white hover:border-[#002147]/10 transition-colors cursor-pointer group">
      <div>
        <div className="font-medium text-[#002147] group-hover:text-[#dc143c] transition-colors">{title}</div>
        <div className="text-sm text-[#002147]/60 mt-1">{time}</div>
      </div>
      <button className="text-sm font-medium text-[#002147] bg-white border border-[#002147]/20 px-4 py-2 rounded-lg group-hover:bg-[#002147] group-hover:text-white transition-colors">
        {type === 'homework' ? 'Start' : type === 'video' ? 'Watch' : 'View'}
      </button>
    </div>
  );
}
