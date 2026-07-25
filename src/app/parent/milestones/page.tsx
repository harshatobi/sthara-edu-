'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Target, Award, Star, CheckCircle2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function MilestoneTimeline() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'parent')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Milestones...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center space-x-4">
        <Link href="/parent" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-[#002147]">Academic Milestones & Growth</h1>
          <p className="text-gray-500 text-sm mt-1">Track key learning achievements and subject mastery progressions</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
        <div className="flex items-center space-x-3 text-indigo-700 bg-indigo-50 p-4 rounded-2xl border border-indigo-200">
          <Award className="w-6 h-6 flex-shrink-0 text-indigo-600" />
          <div>
            <div className="font-bold text-sm">Term 1 Core Competency On-Track</div>
            <div className="text-xs">Your child has achieved foundational proficiency in Mathematics and Science.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
