'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Upload, Video, Trash2, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface VideoFile {
  id: string;
  title: string;
  url: string;
  filename: string;
  created_at: string;
}

export default function ContentCMS() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [curriculum, setCurriculum] = useState('CBSE');
  const [selectedClass, setSelectedClass] = useState('Class 10');
  const [subject, setSubject] = useState('Mathematics');
  
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [fetching, setFetching] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !videoTitle.trim() || uploading) return;
    setUploading(true);

    try {
      const path = `cms/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('materials')
        .upload(path, file);

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('materials').getPublicUrl(path);

      const newVid: VideoFile = {
        id: Date.now().toString(),
        title: videoTitle.trim(),
        url: urlData.publicUrl,
        filename: file.name,
        created_at: new Date().toISOString(),
      };

      setVideos(prev => [newVid, ...prev]);
      setVideoTitle('');
      setFile(null);
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Content CMS...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center space-x-4">
        <Link href="/superadmin" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-[#002147]">Global Content CMS</h1>
          <p className="text-gray-500 text-sm mt-1">Upload and manage global video curriculum & study materials</p>
        </div>
      </div>

      <form onSubmit={handleUpload} className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
        <h2 className="text-xl font-bold text-[#002147]">Upload Video Material</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Video Title</label>
            <input
              type="text"
              value={videoTitle}
              onChange={e => setVideoTitle(e.target.value)}
              placeholder="e.g. Intro to Matrices"
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Select Video File</label>
            <input
              type="file"
              accept="video/*"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={uploading}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm transition-all shadow-md flex items-center space-x-2"
        >
          <Upload className="w-4 h-4" />
          <span>{uploading ? 'Uploading Video...' : 'Upload Material'}</span>
        </button>
      </form>
    </div>
  );
}
