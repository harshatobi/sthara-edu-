'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Target, Award, BookOpen, Star, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { getAuth } from 'firebase/auth';


export default function MilestoneTimeline() {
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
        console.error('Error fetching children milestones:', err);
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
        <Target className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-[#002147] mb-2">No Students Linked Yet</h3>
        <p className="text-gray-500 text-sm">Please link your child's student account on the main dashboard to view milestones.</p>
      </div>
    );
  }

  const child = children[selectedIdx];
  const milestones = child.milestones || [];

  // Map icon strings to Lucide components
  const iconMap: Record<string, any> = {
    'Star': Star,
    'CheckCircle2': CheckCircle2,
    'Award': Award,
    'BookOpen': BookOpen,
  };

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
        <div className="absolute right-0 top-0 w-64 h-64 bg-gradient-to-br from-indigo-100 to-purple-50 rounded-full blur-3xl -mr-20 -mt-20 opacity-60"></div>
        <div className="relative z-10">
          <div className="inline-flex items-center space-x-2 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
            <Target className="w-4 h-4" />
            <span>Milestone Timeline</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-[#002147]">Academic & Holistic Growth Timeline ({child.name})</h2>
          <p className="text-gray-500 font-medium mt-1 text-lg">A chronological view of accomplishments and task submissions.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm max-w-3xl mx-auto">
        {milestones.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Target className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-semibold text-sm">No academic milestones recorded yet</p>
            <p className="text-xs mt-1 text-gray-400">Milestones will compile automatically as they complete assignments and master quizzes.</p>
          </div>
        ) : (
          <div className="relative border-l border-gray-200 ml-4 md:ml-6 space-y-8 py-2">
            {milestones.map((m: any, i: number) => {
              const IconComp = iconMap[m.icon] || Award;
              return (
                <div key={i} className="relative pl-8 md:pl-10 group">
                  
                  {/* Indicator bullet */}
                  <span className={`absolute left-0 top-1.5 -translate-x-1/2 w-8 h-8 rounded-xl flex items-center justify-center border shadow-sm transition-all duration-300 group-hover:scale-110 ${m.bgColor || 'bg-gray-100'} ${m.borderColor || 'border-gray-200'}`}>
                    <IconComp className={`w-4 h-4 ${m.color || 'text-gray-600'}`} />
                  </span>

                  {/* Body card */}
                  <div className="bg-gray-50/50 hover:bg-gray-50 border border-gray-100 rounded-2xl p-5 transition-all duration-200 hover:shadow-sm">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">{m.date}</span>
                    <h4 className="font-bold text-base text-[#002147] mb-1">{m.title}</h4>
                    <p className="text-gray-600 text-sm font-medium leading-relaxed">{m.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
