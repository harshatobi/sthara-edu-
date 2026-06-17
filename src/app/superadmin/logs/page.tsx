'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Activity, Clock, ShieldAlert, UserPlus, FileText } from 'lucide-react';
import Link from 'next/link';

export default function SystemLogs() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  const MOCK_LOGS = [
    { id: 1, type: 'alert', message: 'Failed login attempt for admin@sthara.com', time: '2 mins ago', icon: ShieldAlert, color: 'text-red-500', bg: 'bg-red-50' },
    { id: 2, type: 'auth', message: 'Teacher 1 (DPS101) logged in', time: '15 mins ago', icon: UserPlus, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 3, type: 'content', message: 'New video uploaded: "Algebra Basics"', time: '1 hour ago', icon: FileText, color: 'text-green-500', bg: 'bg-green-50' },
    { id: 4, type: 'system', message: 'Nightly backup completed successfully', time: '5 hours ago', icon: Activity, color: 'text-purple-500', bg: 'bg-purple-50' },
    { id: 5, type: 'auth', message: 'Student 12 (DPS101) changed password', time: '1 day ago', icon: UserPlus, color: 'text-blue-500', bg: 'bg-blue-50' },
  ];

  if (loading || !profile) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-[#002147]">System Logs</h1>
          <p className="text-[#002147]/60 mt-1">Real-time platform activity and security alerts.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#002147]/10 overflow-hidden">
        <div className="p-6 border-b border-[#002147]/10 flex justify-between items-center bg-[#f8fafc]">
          <h2 className="text-lg font-bold text-[#002147]">Recent Activity</h2>
          <span className="text-xs font-bold text-[#002147]/40 uppercase tracking-wider">Last 24 Hours</span>
        </div>
        
        <div className="divide-y divide-[#002147]/5">
          {MOCK_LOGS.map((log) => {
            const Icon = log.icon;
            return (
              <div key={log.id} className="p-4 hover:bg-[#f8fafc] transition-colors flex items-center justify-between group">
                <div className="flex items-center space-x-4">
                  <div className={`p-2 rounded-xl ${log.bg} ${log.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-[#002147]">{log.message}</p>
                    <p className="text-xs text-[#002147]/50 capitalize mt-0.5">{log.type} Event</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 text-[#002147]/40 text-sm font-medium">
                  <Clock className="w-4 h-4" />
                  <span>{log.time}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
