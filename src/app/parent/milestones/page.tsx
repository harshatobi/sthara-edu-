'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Target, Award, BookOpen, Star, ArrowUpRight, CheckCircle2, Loader2 } from 'lucide-react';

export default function MilestoneTimeline() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [loadingMore, setLoadingMore] = useState(false);
  const [visibleCount, setVisibleCount] = useState(4);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'parent')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  if (loading || !profile) return null;

  const allMilestones = [
    {
      id: 1,
      date: 'Today, 10:30 AM',
      title: 'Mastered Linear Equations',
      description: 'Successfully completed the advanced module on linear equations with a 95% accuracy rate.',
      type: 'achievement',
      icon: Star,
      color: 'text-amber-500',
      bgColor: 'bg-amber-100',
      borderColor: 'border-amber-200'
    },
    {
      id: 2,
      date: 'Yesterday, 2:15 PM',
      title: 'Submitted Science Project',
      description: '"Ecosystems & Sustainability" project submitted 2 days early.',
      type: 'task',
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-100',
      borderColor: 'border-emerald-200'
    },
    {
      id: 3,
      date: 'Oct 15, 2023',
      title: 'Reading Comprehension Level Up',
      description: 'Advanced from Level B2 to Level C1 in English Reading.',
      type: 'progression',
      icon: ArrowUpRight,
      color: 'text-blue-500',
      bgColor: 'bg-blue-100',
      borderColor: 'border-blue-200'
    },
    {
      id: 4,
      date: 'AI Prediction',
      title: 'Ready for Advanced Coding',
      description: 'Based on current trajectory in logical reasoning tasks, ready to begin Python Basics next week.',
      type: 'prediction',
      icon: Target,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-100',
      borderColor: 'border-indigo-200'
    },
    {
      id: 5,
      date: 'Sep 28, 2023',
      title: 'Perfect Attendance',
      description: 'Achieved 100% attendance for the month of September.',
      type: 'achievement',
      icon: Award,
      color: 'text-purple-500',
      bgColor: 'bg-purple-100',
      borderColor: 'border-purple-200'
    },
    {
      id: 6,
      date: 'Sep 15, 2023',
      title: 'Completed Foundational Coding',
      description: 'Finished the HTML/CSS module and deployed first personal webpage.',
      type: 'achievement',
      icon: BookOpen,
      color: 'text-teal-500',
      bgColor: 'bg-teal-100',
      borderColor: 'border-teal-200'
    }
  ];

  const handleLoadMore = () => {
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount(prev => Math.min(prev + 2, allMilestones.length));
      setLoadingMore(false);
    }, 800);
  };

  const visibleMilestones = allMilestones.slice(0, visibleCount);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16 max-w-4xl mx-auto">
      
      {/* Header */}
      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-gradient-to-br from-indigo-100 to-blue-50 rounded-full blur-3xl -mr-20 -mt-20 opacity-60"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
              <Award className="w-4 h-4" />
              <span>Timeline</span>
            </div>
            <h2 className="text-3xl font-black tracking-tight text-[#002147]">Milestones & Achievements</h2>
            <p className="text-gray-500 font-medium mt-1 text-lg">A chronological view of academic and holistic growth.</p>
          </div>
          <div className="bg-white border-2 border-indigo-50 px-6 py-4 rounded-2xl text-center shadow-sm">
            <div className="text-3xl font-black text-indigo-600">{allMilestones.length}</div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Milestones This Term</div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white border border-gray-100 p-8 md:p-12 rounded-3xl shadow-sm">
        <div className="relative border-l-2 border-gray-100 ml-4 md:ml-8 space-y-12">
          
          {visibleMilestones.map((milestone, index) => (
            <div key={milestone.id} className="relative pl-8 md:pl-12 animate-in slide-in-from-top-4 fade-in duration-500 fill-mode-both" style={{ animationDelay: `${index * 100}ms` }}>
              
              {/* Timeline Dot/Icon */}
              <div className={`absolute -left-[21px] top-1 w-10 h-10 rounded-full border-4 border-white flex items-center justify-center ${milestone.bgColor} shadow-sm z-10`}>
                <milestone.icon className={`w-4 h-4 ${milestone.color}`} />
              </div>
              
              {/* Content Card */}
              <div className={`bg-white border ${milestone.borderColor} p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group`}>
                
                {/* Subtle background glow on hover */}
                <div className={`absolute inset-0 bg-gradient-to-r from-transparent to-white opacity-0 group-hover:opacity-50 transition-opacity ${milestone.bgColor}`}></div>
                
                <div className="relative z-10">
                  <span className={`inline-block px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider mb-3 ${milestone.bgColor} ${milestone.color}`}>
                    {milestone.date}
                  </span>
                  
                  <h3 className="text-xl font-bold text-[#002147] mb-2">{milestone.title}</h3>
                  <p className="text-gray-500">{milestone.description}</p>
                </div>
              </div>
              
            </div>
          ))}

        </div>
        
        {visibleCount < allMilestones.length && (
          <div className="mt-12 text-center">
            <button 
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="bg-gray-50 text-gray-500 border border-gray-200 px-6 py-3 rounded-xl font-bold hover:bg-gray-100 transition-colors flex items-center justify-center mx-auto space-x-2 disabled:opacity-70"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <span>Load Older Milestones</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
