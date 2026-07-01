'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { HeartHandshake, BatteryMedium, Brain, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function WellnessMonitor() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [children, setChildren] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'parent')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId) return;

    const fetchChildren = async () => {
      try {
        const { getAuth } = await import('firebase/auth');
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) { setLoadingData(false); return; }

        const res = await fetch('/api/parent/get-children', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.children) setChildren(data.children);
        }
      } catch (err) {
        console.error('Error fetching children wellness:', err);
      } finally {
        setLoadingData(false);
      }
    };
    fetchChildren();
  }, [profile?.schoolId]);

  if (loading || loadingData || !profile) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-[#002147]" />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="bg-white border border-gray-100 p-12 rounded-3xl text-center max-w-xl mx-auto my-10">
        <HeartHandshake className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-[#002147] mb-2">No Students Linked Yet</h3>
        <p className="text-gray-500 text-sm">Please link your child's student account on the main dashboard to view wellness telemetry.</p>
      </div>
    );
  }

  const child = children[selectedIdx];
  
  // Format real wellness logs for the line chart (chronological order)
  const energyData = [...(child.wellnessLogs || [])]
    .slice(0, 7)
    .reverse()
    .map((log: any) => {
      const date = new Date(log.createdAt);
      return {
        day: date.toLocaleDateString(undefined, { weekday: 'short' }),
        energy: log.moodValue,
      };
    });

  // Calculate average energy
  const averageEnergy = child.wellnessLogs?.length > 0
    ? Math.round(child.wellnessLogs.reduce((acc: number, l: any) => acc + l.moodValue, 0) / child.wellnessLogs.length)
    : null;

  // Filter out academic notifications, keep behavioral ones (like misconduct alerts)
  const wellnessObservations = child.notifications?.filter((n: any) => 
    n.type === 'foul_language' || n.title?.toLowerCase().includes('wellness') || n.title?.toLowerCase().includes('misconduct')
  ) || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16">
      
      {/* Child Selector */}
      {children.length > 1 && (
        <div className="flex items-center space-x-3 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm max-w-sm">
          <label className="text-xs font-bold text-gray-400 uppercase ml-2">Child:</label>
          <select
            value={selectedIdx}
            onChange={e => setSelectedIdx(Number(e.target.value))}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-[#002147] outline-none cursor-pointer"
          >
            {children.map((c, i) => (
              <option key={c.id} value={i}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Header */}
      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-gradient-to-br from-green-100 to-emerald-50 rounded-full blur-3xl -mr-20 -mt-20 opacity-60"></div>
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
            <HeartHandshake className="w-4 h-4" />
            <span>Wellness Monitor</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-[#002147]">Well-being Dashboard ({child.name})</h2>
          <p className="text-gray-500 font-medium mt-1 text-lg">Holistic health tracking and teacher observations.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Energy Tracking */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-100 p-8 rounded-3xl shadow-sm h-full">
            <h4 className="font-bold text-xl text-[#002147] flex items-center space-x-2 mb-6">
              <BatteryMedium className="w-6 h-6 text-emerald-500" />
              <span>Weekly Energy Levels</span>
            </h4>
            
            {energyData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-gray-200 rounded-2xl bg-gray-50/50 p-6 text-center">
                <BatteryMedium className="w-10 h-10 text-gray-300 mb-2" />
                <p className="text-gray-400 font-semibold text-sm">No wellness check-ins recorded yet</p>
                <p className="text-gray-400 text-xs mt-1">Check-in data submitted during school sessions will appear here.</p>
              </div>
            ) : (
              <div className="h-64 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={energyData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 600 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 600 }} dx={-10} domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      cursor={{ stroke: '#10b981', strokeWidth: 2, strokeDasharray: '5 5' }}
                    />
                    <Line type="monotone" dataKey="energy" stroke="#10b981" strokeWidth={4} dot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Alerts & AI Advice */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* AI Advice Card */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
            <div className="relative z-10 flex items-center space-x-2 mb-4">
              <div className="p-2 bg-white/20 rounded-xl border border-white/30 backdrop-blur-sm">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-emerald-50 tracking-wide text-sm uppercase">AI Insight</span>
            </div>
            
            {averageEnergy === null ? (
              <p className="relative z-10 font-medium leading-relaxed text-sm text-emerald-50">
                Waiting for student well-being data. Once wellness data is recorded, Sthara AI will compile personalized health suggestions here.
              </p>
            ) : averageEnergy < 65 ? (
              <p className="relative z-10 font-medium leading-relaxed text-sm text-emerald-50">
                {child.name}'s average energy is slightly low ({averageEnergy}%). This often correlates with academic stress or bedtime screen time. Consider establishing a digital-detox hour before sleep to improve restorative rest.
              </p>
            ) : (
              <p className="relative z-10 font-medium leading-relaxed text-sm text-emerald-50">
                {child.name}'s wellness levels are in a healthy, positive range ({averageEnergy}%). Keep encouraging active physical playtime and standard sleep cycles to maintain this positive baseline!
              </p>
            )}
          </div>

          {/* Teacher Flags */}
          <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm">
            <h4 className="font-bold text-[#002147] mb-6 flex items-center space-x-2">
              <Heart className="w-5 h-5 text-amber-500" />
              <span>Teacher Observations</span>
            </h4>
            
            <div className="space-y-4">
              {wellnessObservations.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-gray-100 rounded-2xl bg-gray-50/50">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-gray-500 font-bold text-xs">No behavioral flags</p>
                  <p className="text-gray-400 text-[10px] mt-0.5">Behavior and participation are normal.</p>
                </div>
              ) : (
                wellnessObservations.map((obs: any) => (
                  <div key={obs.id} className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <h5 className="font-bold text-amber-800 text-sm">{obs.title}</h5>
                      <p className="text-xs text-amber-700 mt-1">{obs.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
