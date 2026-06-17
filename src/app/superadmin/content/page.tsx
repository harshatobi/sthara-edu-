'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/firestore'; // Note: storage imports must come from firebase/storage
import { collection, doc, setDoc, getDocs, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Folder, Upload, Video, Trash2, PlusCircle, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

// We need to dynamically import firebase/storage since it might not be initialized properly in config if it wasn't used before
import { getApp } from 'firebase/app';
import { getStorage as getFirebaseStorage, ref as storageRef, uploadBytesResumable as uploadTask, getDownloadURL as downloadURL } from 'firebase/storage';

interface VideoFile {
  id: string;
  title: string;
  url: string;
  filename: string;
  uploadedAt: any;
}

export default function ContentCMS() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [curriculum, setCurriculum] = useState('CBSE');
  const [selectedClass, setSelectedClass] = useState('Class 10');
  const [subject, setSubject] = useState('Mathematics');
  
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [fetching, setFetching] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  const getCollectionPath = () => `content_library/${curriculum}/classes/${selectedClass}/subjects/${subject}/videos`;

  const fetchVideos = async () => {
    setFetching(true);
    try {
      const q = query(collection(db, getCollectionPath()), orderBy('uploadedAt', 'desc'));
      const snap = await getDocs(q);
      const list: VideoFile[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as VideoFile);
      });
      setVideos(list);
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (profile?.role === 'superadmin') {
      fetchVideos();
    }
  }, [profile, curriculum, selectedClass, subject]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !videoTitle) return;

    setUploading(true);
    setProgress(0);

    try {
      const storage = getFirebaseStorage(getApp());
      const fileRef = storageRef(storage, `content_library/${curriculum}/${selectedClass}/${subject}/${Date.now()}_${file.name}`);
      
      const upload = uploadTask(fileRef, file);

      upload.on('state_changed', 
        (snapshot) => {
          const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(p);
        },
        (error) => {
          console.error("Upload error", error);
          setUploading(false);
        },
        async () => {
          const url = await downloadURL(upload.snapshot.ref);
          
          // Save to Firestore
          const videoId = `VID-${Date.now()}`;
          await setDoc(doc(db, getCollectionPath(), videoId), {
            title: videoTitle,
            url,
            filename: file.name,
            uploadedAt: serverTimestamp()
          });

          setFile(null);
          setVideoTitle('');
          setUploading(false);
          setProgress(0);
          fetchVideos();
        }
      );
    } catch (err) {
      console.error(err);
      setUploading(false);
    }
  };

  const handleDelete = async (videoId: string) => {
    if (!confirm("Delete this video?")) return;
    try {
      await deleteDoc(doc(db, getCollectionPath(), videoId));
      fetchVideos();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-[#002147]">Centralized Video CMS</h1>
          <p className="text-[#002147]/60 mt-1">Upload and organize educational videos by curriculum, class, and subject.</p>
        </div>
        <Link href="/superadmin" className="px-4 py-2 bg-white border border-[#002147]/10 rounded-xl text-[#002147] font-medium shadow-sm hover:bg-[#f8fafc] flex items-center space-x-2">
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Navigator */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/10">
            <h2 className="text-lg font-bold text-[#002147] flex items-center space-x-2 mb-4">
              <Folder className="w-5 h-5 text-blue-500" />
              <span>Library Structure</span>
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#002147]/50 uppercase mb-1">Curriculum Folder</label>
                <input 
                  type="text"
                  list="curriculums"
                  value={curriculum} 
                  onChange={e => setCurriculum(e.target.value)}
                  placeholder="e.g., CBSE"
                  className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-lg px-3 py-2 text-[#002147] focus:ring-2 focus:ring-[#002147]/20 outline-none"
                />
                <datalist id="curriculums">
                  <option value="CBSE" />
                  <option value="State Board" />
                  <option value="ICSE" />
                </datalist>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-[#002147]/50 uppercase mb-1">Class Folder</label>
                <input 
                  type="text"
                  list="classes"
                  value={selectedClass} 
                  onChange={e => setSelectedClass(e.target.value)}
                  placeholder="e.g., Class 10"
                  className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-lg px-3 py-2 text-[#002147] focus:ring-2 focus:ring-[#002147]/20 outline-none"
                />
                <datalist id="classes">
                  {[...Array(12)].map((_, i) => (
                    <option key={i} value={`Class ${i + 1}`} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#002147]/50 uppercase mb-1">Subject Folder</label>
                <input 
                  type="text"
                  list="subjects"
                  value={subject} 
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g., Mathematics"
                  className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-lg px-3 py-2 text-[#002147] focus:ring-2 focus:ring-[#002147]/20 outline-none"
                />
                <datalist id="subjects">
                  <option value="Mathematics" />
                  <option value="Science" />
                  <option value="English" />
                  <option value="Social Studies" />
                </datalist>
              </div>
            </div>
          </div>

          {/* Upload Form */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#002147]/10">
            <h2 className="text-lg font-bold text-[#002147] flex items-center space-x-2 mb-4">
              <Upload className="w-5 h-5 text-green-500" />
              <span>Upload Video</span>
            </h2>
            
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#002147]/70 mb-1">Video Title</label>
                <input
                  type="text"
                  required
                  value={videoTitle}
                  onChange={e => setVideoTitle(e.target.value)}
                  placeholder="e.g., Algebra Basics Part 1"
                  className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-lg px-3 py-2 text-[#002147] outline-none focus:ring-2 focus:ring-[#002147]/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#002147]/70 mb-1">Select File</label>
                <input
                  type="file"
                  accept="video/*"
                  required
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-[#002147]/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#002147]/5 file:text-[#002147] hover:file:bg-[#002147]/10 cursor-pointer"
                />
                <p className="text-xs text-[#002147]/40 mt-1">Warning: Large files count towards 5GB limit.</p>
              </div>

              {uploading && (
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="bg-[#002147] h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
              )}

              <button
                type="submit"
                disabled={uploading || !file || !videoTitle}
                className="w-full bg-[#002147] text-white py-2 rounded-xl font-semibold hover:bg-[#002147]/90 transition-colors disabled:opacity-50 flex justify-center items-center space-x-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Uploading {Math.round(progress)}%</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Save to Library</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Col: Video List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-[#002147]/10 overflow-hidden h-full min-h-[500px]">
            <div className="p-6 border-b border-[#002147]/5 bg-[#f8fafc]">
              <h2 className="text-lg font-bold text-[#002147]">
                {curriculum} / {selectedClass} / {subject}
              </h2>
            </div>
            
            <div className="p-6">
              {fetching ? (
                <div className="text-center text-[#002147]/50 py-10">Loading videos...</div>
              ) : videos.length === 0 ? (
                <div className="text-center py-20 flex flex-col items-center">
                  <div className="p-4 bg-[#002147]/5 rounded-full mb-4">
                    <Video className="w-10 h-10 text-[#002147]/40" />
                  </div>
                  <h3 className="text-[#002147] font-bold text-lg mb-1">No videos found</h3>
                  <p className="text-[#002147]/50 text-sm">Upload a video to this folder to see it here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {videos.map(video => (
                    <div key={video.id} className="border border-[#002147]/10 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                      <div className="aspect-video bg-black/5 flex items-center justify-center relative group">
                        <video 
                          src={video.url} 
                          className="w-full h-full object-cover"
                          controls
                        />
                      </div>
                      <div className="p-4 flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-[#002147] truncate max-w-[200px]">{video.title}</h4>
                          <p className="text-xs text-[#002147]/50 mt-1 truncate max-w-[200px]">{video.filename}</p>
                        </div>
                        <button 
                          onClick={() => handleDelete(video.id)}
                          className="p-2 text-[#dc143c]/60 hover:text-[#dc143c] hover:bg-[#dc143c]/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
