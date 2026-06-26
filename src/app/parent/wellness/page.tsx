'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { HeartHandshake, BatteryMedium, Sparkles, Brain, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function WellnessMonitor() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'parent')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  if (loading || !profile) return null;

  // NEP 2020 Aligned mock data for student well-being
  const energyData = [
    { day: 'Mon', energy: 80 },
    { day: 'Tue', energy: 85 },
    { day: 'Wed', energy: 75 },
    { day: 'Thu', energy: 60 },
    { day: 'Fri', energy: 90 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16">
      
      {/* Header */}
      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-gradient-to-br from-green-100 to-emerald-50 rounded-full blur-3xl -mr-20 -mt-20 opacity-60"></div>
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
            <HeartHandshake className="w-4 h-4" />
            <span>Wellness Monitor</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-[#002147]">Well-being Dashboard</h2>
          <p className="text-gray-500 font-medium mt-1 text-lg">CBSE-aligned holistic health tracking for your child.</p>
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
            <p className="relative z-10 font-medium leading-relaxed text-sm text-emerald-50">
              Energy dipped significantly on Thursday. This often correlates with the heavy homework load mid-week. Consider enforcing a strict digital-detox hour before bedtime to ensure better restorative sleep.
            </p>
          </div>

          {/* Teacher Flags */}
          <div className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm">
            <h4 className="font-bold text-[#002147] mb-6 flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <span>Teacher Observations</span>
            </h4>
            
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold text-amber-800 text-sm">Quiet in Math Class</h5>
                  <p className="text-xs text-amber-700 mt-1">Noticed a drop in participation during group work today. Just something to keep an eye on. — Mr. Sharma</p>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-start space-x-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold text-emerald-800 text-sm">Great teamwork!</h5>
                  <p className="text-xs text-emerald-700 mt-1">Showed excellent leadership in Science Lab today. — Mrs. Gupta</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
