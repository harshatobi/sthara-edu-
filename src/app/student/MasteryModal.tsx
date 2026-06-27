'use client';

import { useState, useEffect } from 'react';
import { X, ChevronRight, PlayCircle, Loader2, ArrowLeft, BookOpen, Trophy } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface Video {
  id: string;
  title: string;
  duration: string;
}

interface Chapter {
  id: string;
  name: string;
  score: number;
  videos: Video[];
}

interface Subject {
  id: string;
  name: string;
  score: number;
  chapters: Chapter[];
}

interface MasteryData {
  subjects: Subject[];
}

const defaultMasteryData: MasteryData = {
  subjects: []
};

export default function MasteryModal({ profile, onClose }: { profile: any, onClose: () => void }) {
  const [data, setData] = useState<MasteryData | null>(null);
  const [loading, setLoading] = useState(true);

  // View state: 'subjects' | 'chapters' | 'videos'
  const [view, setView] = useState<'subjects' | 'chapters' | 'videos'>('subjects');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  useEffect(() => {
    const fetchOrSeedData = async () => {
      if (!profile?.schoolId || !profile?.uid) return;
      setLoading(true);
      try {
        const docRef = doc(db, 'schools', profile.schoolId, 'users', profile.uid, 'mastery_data', 'overall');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setData(docSnap.data() as MasteryData);
        } else {
          setData(defaultMasteryData);
        }
      } catch (err) {
        console.error('Error fetching mastery data:', err);
        setData(defaultMasteryData); // Fallback
      } finally {
        setLoading(false);
      }
    };
    fetchOrSeedData();
  }, [profile]);

  const handleSubjectClick = (subject: Subject) => {
    setSelectedSubject(subject);
    setView('chapters');
  };

  const handleChapterClick = (chapter: Chapter) => {
    setSelectedChapter(chapter);
    setView('videos');
  };

  const handleBack = () => {
    if (view === 'videos') {
      setView('chapters');
      setSelectedChapter(null);
    } else if (view === 'chapters') {
      setView('subjects');
      setSelectedSubject(null);
    }
  };

  // Helper for progress bar color
  const getScoreColor = (score: number) => {
    if (score >= 85) return 'bg-emerald-500';
    if (score >= 70) return 'bg-blue-500';
    if (score >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#002147]/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300 border border-white/20">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-[#002147] to-[#003366] p-6 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-4">
            {view !== 'subjects' && (
              <button onClick={handleBack} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
            )}
            <div>
              <h2 className="text-2xl font-bold flex items-center space-x-2">
                <Trophy className="w-6 h-6 text-orange-400" />
                <span>
                  {view === 'subjects' ? 'Overall Mastery' : 
                   view === 'chapters' ? `${selectedSubject?.name} Mastery` : 
                   `${selectedChapter?.name} Resources`}
                </span>
              </h2>
              <p className="text-blue-200 text-sm mt-1">
                {view === 'subjects' ? 'Track your proficiency across all subjects.' : 
                 view === 'chapters' ? 'Drill down into specific chapters and topics.' : 
                 'Review suggested videos to improve your understanding.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-red-500 hover:text-white transition-all text-white/70">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-8 overflow-y-auto flex-1 bg-gray-50/50 relative min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
              <p className="text-[#002147]/60 font-medium">Analyzing learning patterns...</p>
            </div>
          ) : !data ? (
            <div className="text-center text-red-500 p-10 h-full flex items-center justify-center">Failed to load mastery data.</div>
          ) : (
            <div className="space-y-6">
              
              {/* SUBJECTS VIEW */}
              {view === 'subjects' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {data.subjects.map(subject => (
                    <div 
                      key={subject.id} 
                      onClick={() => handleSubjectClick(subject)}
                      className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group"
                    >
                      <div className="flex justify-between items-end mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="bg-blue-50 p-3 rounded-xl">
                            <BookOpen className="w-6 h-6 text-blue-600" />
                          </div>
                          <h3 className="text-xl font-bold text-[#002147]">{subject.name}</h3>
                        </div>
                        <span className="text-2xl font-black text-[#002147]">{subject.score}%</span>
                      </div>
                      
                      <div className="w-full bg-gray-100 rounded-full h-3 mb-2 overflow-hidden">
                        <div 
                          className={`h-3 rounded-full ${getScoreColor(subject.score)} transition-all duration-1000 ease-out`}
                          style={{ width: `${subject.score}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs font-bold text-gray-400 mt-2">
                        <span>Beginner</span>
                        <span className="text-blue-500">Proficient</span>
                        <span>Master</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* CHAPTERS VIEW */}
              {view === 'chapters' && selectedSubject && (
                <div className="space-y-4 animate-in slide-in-from-right-8 duration-300">
                  {selectedSubject.chapters.map(chapter => (
                    <div 
                      key={chapter.id}
                      onClick={() => handleChapterClick(chapter)}
                      className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center justify-between hover:border-blue-200 hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="flex-1 pr-6">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-lg text-[#002147] group-hover:text-blue-600 transition-colors">{chapter.name}</h4>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            chapter.score >= 85 ? 'bg-emerald-100 text-emerald-700' :
                            chapter.score >= 70 ? 'bg-blue-100 text-blue-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                            {chapter.score}% Mastery
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-2 rounded-full ${getScoreColor(chapter.score)} transition-all duration-1000 ease-out`}
                            style={{ width: `${chapter.score}%` }}
                          />
                        </div>
                        {chapter.score < 70 && (
                          <p className="text-xs text-orange-500 font-medium mt-2 flex items-center">
                            <span className="w-2 h-2 rounded-full bg-orange-500 mr-2 inline-block animate-pulse"></span>
                            Needs improvement. Click to view suggested resources.
                          </p>
                        )}
                      </div>
                      <div className="bg-gray-50 p-3 rounded-full group-hover:bg-blue-50 transition-colors">
                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* VIDEOS VIEW */}
              {view === 'videos' && selectedChapter && (
                <div className="space-y-4 animate-in slide-in-from-right-8 duration-300">
                  {selectedChapter.videos.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                      <PlayCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">No recommended videos for this chapter right now.</p>
                    </div>
                  ) : (
                    selectedChapter.videos.map(video => (
                      <div 
                        key={video.id}
                        className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between hover:shadow-md transition-all group"
                      >
                        <div className="flex items-center space-x-4 mb-4 sm:mb-0">
                          <div className="w-32 h-20 bg-gray-900 rounded-xl relative overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform shadow-inner cursor-pointer">
                            <div className="absolute inset-0 flex items-center justify-center">
                              <PlayCircle className="w-8 h-8 text-white/80 group-hover:text-white group-hover:scale-110 transition-all" />
                            </div>
                            <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                              {video.duration}
                            </div>
                          </div>
                          <div>
                            <h4 className="font-bold text-[#002147] group-hover:text-blue-600 transition-colors line-clamp-2">{video.title}</h4>
                            <p className="text-xs text-gray-500 font-medium mt-1">Sthara Diagnostic Engine Recommendation</p>
                          </div>
                        </div>
                        <button className="w-full sm:w-auto bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-5 py-2.5 rounded-xl font-bold transition-colors">
                          Watch Now
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
