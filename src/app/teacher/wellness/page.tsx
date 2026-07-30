'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Heart, Activity, AlertTriangle, ArrowLeft, ChevronDown, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAuthToken } from '@/lib/auth/getAuthToken';

interface WellnessLog {
  id: string;
  student_id: string;
  mood_value: number;
  resolved?: boolean;
  created_at: string;
}

interface StudentData {
  id: string;
  name: string;
  email: string;
  student_class?: string;
  branch?: string;
}

export default function TeacherWellnessDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

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

  useEffect(() => {
    if (!profile?.schoolId) return;

    const discoverClasses = async () => {
      try {
        const { data: studentsData } = await supabase
          .from('users')
          .select('*')
          .eq('school_id', profile.schoolId)
          .eq('role', 'student');

        const allStudents = studentsData || [];
        const classSet = new Set<string>();
        const studentMap: Record<string, StudentData> = {};

        allStudents.forEach((s: any) => {
          studentMap[s.id] = { id: s.id, name: s.name, email: s.email, student_class: s.student_class, branch: s.branch };
          const c = s.student_class || s.branch;
          if (c) classSet.add(c);
        });

        setStudents(studentMap);

        const teacherClasses = [
          ...(profile.assignments?.map((a: any) => a.class).filter(Boolean) ?? []),
          ...(profile.teacherClass ? [profile.teacherClass] : []),
        ];

        const unique = [...new Set(teacherClasses)];
        const classes = unique.length > 0 ? unique : Array.from(classSet).sort();
        setAvailableClasses(classes);
        if (classes.length > 0 && !selectedClass) setSelectedClass(classes[0]);
      } catch (e) {
        console.error('[wellness] class discovery:', e);
      }
    };

    discoverClasses();
  }, [profile?.schoolId]);

  useEffect(() => {
    async function fetchData() {
      if (!profile?.schoolId || !selectedClass) return;
      setLoading(true);

      try {
        const { data: logsData, error: logsErr } = await supabase
          .from('wellness_logs')
          .select('*')
          .eq('school_id', profile.schoolId)
          .order('created_at', { ascending: false });

        if (logsErr) throw logsErr;
        setLogs(logsData || []);
      } catch (e) {
        console.error('[wellness] fetch data error:', e);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [profile?.schoolId, selectedClass]);

  const toggleResolved = async (logId: string, currentStatus: boolean) => {
    try {
      const authToken = await getAuthToken();
      const res = await fetch('/api/teacher/acknowledge-situation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ id: logId, schoolId: profile!.schoolId, table: 'wellness_logs', field: 'resolved', value: !currentStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setLogs(prev => prev.map(l => (l.id === logId ? { ...l, resolved: !currentStatus } : l)));
    } catch (e: any) {
      alert('Failed to update status: ' + e.message);
    }
  };

  if (authLoading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Wellness Dashboard...</div>;

  const lowMoodLogs = logs.filter(l => l.mood_value <= 40);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/teacher" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-[#002147]">Student Wellness & Support</h1>
            <p className="text-gray-500 text-sm mt-1">Monitor emotional wellbeing alerts and offer timely guidance.</p>
          </div>
        </div>

        {availableClasses.length > 0 && (
          <div className="relative">
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="bg-white border border-gray-200 text-[#002147] font-bold px-4 py-2.5 rounded-2xl text-sm shadow-sm"
            >
              {availableClasses.map(c => (
                <option key={c} value={c}>Class: {c}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center space-x-2 text-rose-600 font-bold text-xs uppercase">
            <AlertTriangle className="w-4 h-4" />
            <span>Low Mood Alerts</span>
          </div>
          <div className="text-3xl font-extrabold text-[#002147]">{lowMoodLogs.length}</div>
          <p className="text-xs text-gray-500">Check-ins requiring attention (score ≤ 40%)</p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center space-x-2 text-emerald-600 font-bold text-xs uppercase">
            <CheckCircle2 className="w-4 h-4" />
            <span>Resolved Alerts</span>
          </div>
          <div className="text-3xl font-extrabold text-[#002147]">
            {lowMoodLogs.filter(l => l.resolved).length}
          </div>
          <p className="text-xs text-gray-500">Student support cases marked complete</p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center space-x-2 text-blue-600 font-bold text-xs uppercase">
            <Activity className="w-4 h-4" />
            <span>Total Logged Days</span>
          </div>
          <div className="text-3xl font-extrabold text-[#002147]">{logs.length}</div>
          <p className="text-xs text-gray-500">Overall wellness check-in entries</p>
        </div>
      </div>

      {/* Wellness Alerts Table */}
      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-xl font-bold text-[#002147]">Recent Check-in Logs</h2>

        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading student check-ins...</div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No wellness logs found for this class.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Student</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase text-center">Mood Level</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase">Date</th>
                  <th className="p-4 font-bold text-xs text-gray-500 uppercase text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => {
                  const student = students[log.student_id];
                  const isLow = log.mood_value <= 40;
                  return (
                    <tr key={log.id} className="hover:bg-gray-50/50">
                      <td className="p-4">
                        <div className="font-bold text-[#002147] text-sm">{student?.name || 'Student'}</div>
                        <div className="text-xs text-gray-400">{student?.email || log.student_id.slice(0, 8)}</div>
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`inline-block px-3 py-1 rounded-xl text-xs font-bold ${
                            isLow ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {log.mood_value}%
                        </span>
                      </td>
                      <td className="p-4 text-xs text-gray-500">
                        {new Date(log.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => toggleResolved(log.id, !!log.resolved)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            log.resolved
                              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm'
                          }`}
                        >
                          {log.resolved ? 'Mark Pending' : 'Mark Resolved'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
