'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { getApp } from 'firebase/app';
import { getStorage as getFirebaseStorage, ref as storageRef, uploadBytesResumable as uploadTask, getDownloadURL as downloadURL } from 'firebase/storage';
import { collection, doc, setDoc, getDocs, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Folder, Upload, Video, Trash2, PlusCircle, ArrowLeft, Loader2, PlayCircle, X, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

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

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState<string | null>(null);
  
  const [success, setSuccess] = useState('');

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
    setSuccess('');

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
          setSuccess('Video successfully uploaded to library!');
          fetchVideos();
          
          setTimeout(() => setSuccess(''), 4000);
        }
      );
    } catch (err) {
      console.error(err);
      setUploading(false);
    }
  };

  const confirmDelete = (videoId: string) => {
    setVideoToDelete(videoId);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!videoToDelete) return;
    try {
      await deleteDoc(doc(db, getCollectionPath(), videoToDelete));
      fetchVideos();
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleteModalOpen(false);
      setVideoToDelete(null);
    }
  };

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#002147]">Centralized Video CMS</h1>
          <p className="text-gray-500 mt-1 font-medium">Upload and organize educational videos by curriculum, class, and subject.</p>
        </div>
        <Link href="/superadmin" className="px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-[#002147] font-bold shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center space-x-2">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Overview</span>
        </Link>
      </div>

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 font-bold flex items-center space-x-2 animate-in slide-in-from-top-4">
          <CheckCircle2 className="w-5 h-5" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Navigator & Upload */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Library Structure */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200/60">
            <h2 className="text-lg font-black text-[#002147] flex items-center space-x-2 mb-6">
              <div className="p-2 bg-indigo-50 rounded-xl">
                <Folder className="w-5 h-5 text-indigo-600" />
              </div>
              <span>Library Structure</span>
            </h2>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Curriculum</label>
                <select 
                  value={curriculum} 
                  onChange={e => setCurriculum(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                >
                  <option value="CBSE">CBSE</option>
                  <option value="State Board">State Board</option>
                  <option value="ICSE">ICSE</option>
                  <option value="IB">IB</option>
                </select>
              </div>
              
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Class Level</label>
                <select 
                  value={selectedClass} 
                  onChange={e => setSelectedClass(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                >
                  {[...Array(12)].map((_, i) => (
                    <option key={i} value={`Class ${i + 1}`}>Class {i + 1}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Subject</label>
                <select 
                  value={subject} 
                  onChange={e => setSubject(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                >
                  <option value="Mathematics">Mathematics</option>
                  <option value="Science">Science</option>
                  <option value="English">English</option>
                  <option value="Social Studies">Social Studies</option>
                  <option value="Physics">Physics</option>
                  <option value="Chemistry">Chemistry</option>
                  <option value="Biology">Biology</option>
                </select>
              </div>
            </div>
          </div>

          {/* Upload Form */}
          <div className="bg-gradient-to-br from-[#002147] to-indigo-900 p-1 rounded-3xl shadow-lg">
            <div className="bg-white p-6 rounded-[22px] h-full">
              <h2 className="text-lg font-black text-[#002147] flex items-center space-x-2 mb-6">
                <div className="p-2 bg-emerald-50 rounded-xl">
                  <Upload className="w-5 h-5 text-emerald-600" />
                </div>
                <span>Upload Video</span>
              </h2>
              
              <form onSubmit={handleUpload} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-[#002147]">Video Title</label>
                  <input
                    type="text"
                    required
                    value={videoTitle}
                    onChange={e => setVideoTitle(e.target.value)}
                    placeholder="e.g., Algebra Basics Part 1"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-[#002147]">Select File (.mp4, .mov)</label>
                  <div className="relative group">
                    <input
                      type="file"
                      accept="video/*"
                      required
                      onChange={e => setFile(e.target.files?.[0] || null)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className={`w-full border-2 border-dashed rounded-xl px-4 py-6 text-center transition-all ${file ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 bg-gray-50 group-hover:border-indigo-400 group-hover:bg-indigo-50'}`}>
                      {file ? (
                        <div className="flex flex-col items-center">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                          <span className="font-bold text-emerald-700 truncate max-w-[200px]">{file.name}</span>
                          <span className="text-xs text-emerald-600 mt-1">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <Upload className="w-8 h-8 text-gray-400 mb-2 group-hover:text-indigo-500 transition-colors" />
                          <span className="font-medium text-gray-500 group-hover:text-indigo-600">Click to browse or drag file</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-amber-600 font-medium mt-2 flex items-center space-x-1">
                    <span>⚠️</span>
                    <span>Large files count towards 5GB limit.</span>
                  </p>
                </div>

                {uploading && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-[#002147]">
                      <span>Uploading...</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                      <div className="bg-gradient-to-r from-[#002147] to-indigo-600 h-2.5 rounded-full transition-all duration-300 relative" style={{ width: `${progress}%` }}>
                        <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={uploading || !file || !videoTitle}
                  className="w-full bg-gradient-to-r from-[#002147] to-indigo-900 text-white py-3.5 rounded-xl font-black hover:shadow-lg hover:shadow-indigo-900/20 transition-all disabled:opacity-50 disabled:hover:shadow-none flex justify-center items-center space-x-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle className="w-5 h-5" />
                      <span>Save to Library</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Right Col: Video List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200/60 overflow-hidden h-full min-h-[600px] flex flex-col">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h2 className="text-xl font-black text-[#002147] flex items-center space-x-2">
                <PlayCircle className="w-6 h-6 text-indigo-600" />
                <span>{curriculum} / {selectedClass} / {subject}</span>
              </h2>
              <span className="px-3 py-1 bg-indigo-100 text-indigo-800 font-bold text-xs rounded-full">
                {videos.length} Videos
              </span>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              {fetching ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 font-bold">
                  <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-500" />
                  Loading library...
                </div>
              ) : videos.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
                  <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                    <Video className="w-12 h-12 text-indigo-300" />
                  </div>
                  <h3 className="text-[#002147] font-black text-2xl mb-2">Library is Empty</h3>
                  <p className="text-gray-500 font-medium max-w-sm">No videos have been uploaded to this specific path yet. Use the upload panel to add content.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {videos.map(video => (
                    <div key={video.id} className="group bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-xl hover:border-indigo-200 transition-all duration-300">
                      <div className="aspect-video bg-[#001229] relative overflow-hidden">
                        <video 
                          src={video.url} 
                          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                          controls
                          controlsList="nodownload"
                        />
                      </div>
                      <div className="p-5 flex justify-between items-start bg-gray-50/50">
                        <div className="pr-4">
                          <h4 className="font-black text-[#002147] line-clamp-1 mb-1" title={video.title}>{video.title}</h4>
                          <p className="text-xs font-medium text-gray-500 line-clamp-1 truncate" title={video.filename}>{video.filename}</p>
                          <p className="text-[10px] font-bold text-indigo-400 mt-2 uppercase tracking-wide">
                            {video.uploadedAt?.toDate ? video.uploadedAt.toDate().toLocaleDateString() : 'Just now'}
                          </p>
                        </div>
                        <button 
                          onClick={() => confirmDelete(video.id)}
                          className="p-2.5 text-gray-400 hover:text-white hover:bg-rose-500 rounded-xl transition-all shadow-sm bg-white border border-gray-200 hover:border-rose-500"
                          title="Delete Video"
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

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-[#001229]/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-rose-50">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-rose-100 rounded-xl">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <h3 className="text-xl font-black text-[#002147]">Delete Video</h3>
              </div>
              <button onClick={() => setIsDeleteModalOpen(false)} className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8">
              <p className="text-[#002147] font-medium mb-6">
                Are you sure you want to permanently delete this video from the library? This action cannot be undone.
              </p>
              <div className="flex space-x-3">
                <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors">Cancel</button>
                <button onClick={handleDelete} className="flex-1 py-3 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 transition-colors">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
