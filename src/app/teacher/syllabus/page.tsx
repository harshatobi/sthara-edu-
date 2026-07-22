'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, BookOpen, Calendar, Plus, X, Loader2,
  Sparkles, Target, Trash2, Send, Edit2
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';

const MONTHS = ['June','July','August','September','October','November','December','January','February','March','April','May'];

export default function SyllabusPlanner() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [syllabus, setSyllabus] = useState<{ [key: string]: any[] }>({});
  const [selectedMonth, setSelectedMonth] = useState('June');
  const [selectedModule, setSelectedModule] = useState<any | null>(null);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
      return;
    }

    if (profile?.schoolId && profile?.uid) {
      const fetchSyllabus = async () => {
        try {
          const authToken = await getAuthToken();
          const res = await fetch(
            `/api/teacher/syllabus?schoolId=${profile.schoolId}&teacherId=${profile.uid}`,
            { headers: { Authorization: `Bearer ${authToken}` } }
          );
          const data = await res.json();
          const loaded: { [key: string]: any[] } = Object.fromEntries(MONTHS.map(m => [m, []]));
          
          (data.modules || []).forEach((mod: any) => {
            if (loaded[mod.month] !== undefined) {
              loaded[mod.month].push(mod);
            }
          });
          setSyllabus(loaded);
        } catch (err) {
          console.error('[syllabus load]', err);
        }
      };

      fetchSyllabus();
    }
  }, [profile, loading, router]);

  const handleDeleteModule = async (modId: string) => {
    if (!confirm('Are you sure you want to delete this syllabus topic?')) return;
    try {
      const { error } = await supabase.from('syllabus').delete().eq('id', modId);
      if (error) throw error;

      setSyllabus(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(m => {
          next[m] = next[m].filter(mod => mod.id !== modId);
        });
        return next;
      });
      setSelectedModule(null);
    } catch (e: any) {
      alert('Delete failed: ' + e.message);
    }
  };

  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading Syllabus Planner...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/teacher" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-[#002147]">Syllabus & Lesson Planner</h1>
            <p className="text-gray-500 text-sm mt-1">Plan, schedule, and track monthly curriculum topics</p>
          </div>
        </div>
      </div>

      {/* Month selector */}
      <div className="flex space-x-2 overflow-x-auto pb-2">
        {MONTHS.map(month => (
          <button
            key={month}
            onClick={() => setSelectedMonth(month)}
            className={`px-5 py-2.5 rounded-2xl font-bold text-sm transition-all whitespace-nowrap ${
              selectedMonth === month
                ? 'bg-[#002147] text-white shadow-md'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {month} ({(syllabus[month] || []).length})
          </button>
        ))}
      </div>

      {/* Topics List */}
      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-xl font-bold text-[#002147] mb-4">{selectedMonth} Topics</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(syllabus[selectedMonth] || []).map(mod => (
            <div key={mod.id} className="p-5 bg-gray-50 border border-gray-200 rounded-2xl space-y-2 relative group">
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md uppercase">{mod.subject || 'Subject'}</span>
              <h3 className="text-lg font-bold text-[#002147]">{mod.topic}</h3>
              {mod.objectives && <p className="text-xs text-gray-600">{mod.objectives}</p>}
              <div className="flex items-center justify-between pt-2 text-xs text-gray-400">
                <span>Class: {mod.grade || mod.class || 'All'}</span>
                <button onClick={() => handleDeleteModule(mod.id)} className="text-rose-500 hover:underline flex items-center gap-1 font-bold">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}

          {(syllabus[selectedMonth] || []).length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-400">
              No syllabus topics planned for {selectedMonth}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
