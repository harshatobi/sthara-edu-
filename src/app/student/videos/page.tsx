'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PlayCircle, BookOpen, Star, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface VideoFile {
  id: string;
  title: string;
  url: string;
  filename: string;
}

export default function StudentVideos() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  
  const [activeSubject, setActiveSubject] = useState('All');
  const [availableSubjects, setAvailableSubjects] = useState<string[]>(['All', 'Mathematics', 'Science', 'English', 'Social Studies']);
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'student')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.schoolId) return;

    const fetchVideos = async () => {
      setFetching(true);
      try {
        const { data: materialsData } = await supabase
          .from('materials')
          .select('*')
          .eq('school_id', profile.schoolId);

        const loadedVideos: VideoFile[] = (materialsData || []).map((m: any) => ({
          id: m.id,
          title: m.title || 'Curriculum Video',
          url: m.url || '',
          filename: m.filename || 'video.mp4',
          subject: m.subject || m.metadata?.subject || '',
        }));

        setVideos(loadedVideos);
        // Update subject tabs from actual data
        const subjects = Array.from(new Set(loadedVideos.map(v => (v as any).subject).filter(Boolean))) as string[];
        if (subjects.length > 0) {
          setAvailableSubjects(['All', ...subjects]);
        }
      } catch (err: any) {
        console.error('[student-videos] fetch error:', err);
      } finally {
        setFetching(false);
      }
    };

    fetchVideos();
  }, [profile?.schoolId]);

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Course Videos...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center space-x-4">
        <Link href="/student" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-[#002147]">Video Library & Modules</h1>
          <p className="text-gray-500 text-sm mt-1">Watch teacher-uploaded concepts and interactive video lessons</p>
        </div>
      </div>

      <div className="flex space-x-2 border-b border-gray-200 pb-2">
        {availableSubjects.map(s => (
          <button
            key={s}
            onClick={() => setActiveSubject(s)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubject === s
                ? 'bg-[#002147] text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-xl font-bold text-[#002147]">{activeSubject} Video Lessons</h2>

        {fetching ? (
          <div className="py-12 text-center text-gray-400">Loading videos...</div>
        ) : (() => {
          const filtered = activeSubject === 'All' ? videos : videos.filter(v => (v as any).subject === activeSubject);
          return filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No video materials found for <strong>{activeSubject}</strong>.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map(v => (
                <div key={v.id} className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden shadow-sm space-y-3 p-4">
                  <div className="aspect-video bg-black/10 rounded-xl flex items-center justify-center relative">
                    {v.url ? (
                      <video src={v.url} controls className="w-full h-full rounded-xl object-cover" />
                    ) : (
                      <PlayCircle className="w-12 h-12 text-indigo-600" />
                    )}
                  </div>
                  <h3 className="font-bold text-sm text-[#002147]">{v.title}</h3>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
