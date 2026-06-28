import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { collection, query, orderBy, getDocs, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { PlayCircle, BookOpen, Star, Loader2, HelpCircle, CheckCircle, X } from 'lucide-react';

interface VideoFile {
  id: string;
  title: string;
  url: string;
  filename: string;
}

export default function StudentVideos() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  
  const [activeSubject, setActiveSubject] = useState('');
  const [availableSubjects, setAvailableSubjects] = useState<string[]>(['Mathematics', 'Science', 'English']);
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [fetching, setFetching] = useState(true);

  // Quiz State
  const [showQuiz, setShowQuiz] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<VideoFile | null>(null);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [quizData, setQuizData] = useState<any>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [quizScore, setQuizScore] = useState<number | null>(null);

  const handleVideoEnd = async (video: VideoFile) => {
    setCurrentVideo(video);
    setShowQuiz(true);
    setGeneratingQuiz(true);
    setQuizScore(null);
    setCurrentQuestionIdx(0);

    try {
      const res = await fetch('/api/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: video.title, subject: activeSubject })
      });
      const data = await res.json();
      setQuizData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const handleAnswer = async (index: number) => {
    const isCorrect = index === quizData.questions[currentQuestionIdx].correctAnswerIndex;
    const newScore = isCorrect ? (quizScore || 0) + 1 : (quizScore || 0);
    
    if (currentQuestionIdx < quizData.questions.length - 1) {
      if (isCorrect) setQuizScore(newScore);
      setCurrentQuestionIdx(idx => idx + 1);
    } else {
      // Quiz complete — compute final score and save to Firestore
      const finalScore = isCorrect ? newScore : (quizScore || 0);
      setQuizScore(finalScore);
      if (profile?.uid && profile?.schoolId) {
        try {
          await addDoc(collection(db, 'schools', profile.schoolId, 'masteryScores'), {
            studentId: profile.uid,
            studentName: profile.name || '',
            studentClass: profile.studentClass || '',
            subject: activeSubject,
            videoTitle: currentVideo?.title || '',
            score: finalScore,
            total: quizData.questions.length,
            percentage: Math.round((finalScore / quizData.questions.length) * 100),
            completedAt: serverTimestamp(),
          });
        } catch (e) {
          console.warn('Could not save quiz score:', e);
        }
      }
    }
  };

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'student')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  // Derive available subjects from teacher assignments in this school
  useEffect(() => {
    if (!profile?.schoolId || !profile?.studentClass) return;
    const fetchSubjects = async () => {
      try {
        const teachersSnap = await getDocs(query(
          collection(db, 'global_users'),
          where('schoolId', '==', profile.schoolId),
          where('role', '==', 'teacher')
        ));
        const subjectSet = new Set<string>();
        teachersSnap.docs.forEach(d => {
          const assigns: { class: string; subject: string }[] = d.data().assignments || [];
          assigns.forEach(a => {
            if (a.class === profile.studentClass) subjectSet.add(a.subject);
          });
        });
        const subjects = subjectSet.size > 0 ? Array.from(subjectSet).sort() : ['Mathematics', 'Science', 'English'];
        setAvailableSubjects(subjects);
        setActiveSubject(subjects[0]);
      } catch {
        setAvailableSubjects(['Mathematics', 'Science', 'English']);
        setActiveSubject('Mathematics');
      }
    };
    fetchSubjects();
  }, [profile?.schoolId, profile?.studentClass]);

  useEffect(() => {
    const fetchContent = async () => {
      if (!profile?.studentClass) return;
      setFetching(true);
      try {
        // We assume the school uses CBSE for this demo unless specified otherwise
        // Real implementation would fetch the school's mapped curriculum
        const curriculum = 'CBSE'; 
        
        // Extract the numerical class (e.g. "10A" -> "Class 10")
        const match = profile.studentClass.match(/\d+/);
        const classStr = match ? `Class ${match[0]}` : profile.studentClass;
        
        const path = `content_library/${curriculum}/classes/${classStr}/subjects/${activeSubject}/videos`;
        const q = query(collection(db, path), orderBy('uploadedAt', 'desc'));
        
        const snap = await getDocs(q);
        const list: VideoFile[] = [];
        snap.forEach(d => {
          list.push({ id: d.id, ...d.data() } as VideoFile);
        });
        setVideos(list);
      } catch (err) {
        console.error("Failed to fetch videos", err);
      } finally {
        setFetching(false);
      }
    };

    fetchContent();
  }, [profile, activeSubject]);

  if (loading || !profile) return <div className="p-10 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[#002147]" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      <div>
        <h1 className="text-3xl font-bold text-[#002147]">Video Library</h1>
        <p className="text-[#002147]/60 mt-1">Watch and learn at your own pace.</p>
      </div>

      <div className="flex space-x-2 overflow-x-auto pb-2">
        {availableSubjects.map((subject) => (
          <button
            key={subject}
            onClick={() => setActiveSubject(subject)}
            className={`px-6 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors shadow-sm ${
              activeSubject === subject
                ? 'bg-[#002147] text-white'
                : 'bg-white text-[#002147]/60 border border-[#002147]/10 hover:bg-[#f8fafc]'
            }`}
          >
            {subject}
          </button>
        ))}
      </div>

      {fetching ? (
        <div className="py-20 text-center text-[#002147]/50">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[#002147]/40" />
          Loading your {activeSubject} curriculum...
        </div>
      ) : videos.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl shadow-sm border border-[#002147]/10 text-center">
          <div className="p-4 bg-[#002147]/5 rounded-full inline-block mb-4">
            <BookOpen className="w-12 h-12 text-[#002147]/40" />
          </div>
          <h2 className="text-xl font-bold text-[#002147] mb-2">No Videos Available Yet</h2>
          <p className="text-[#002147]/60 max-w-md mx-auto">
            Your school hasn't uploaded any {activeSubject} videos for {profile.studentClass ? `Class ${profile.studentClass}` : 'your class'} yet. Check back later!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video) => (
            <div key={video.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[#002147]/10 group hover:shadow-md transition-all">
              <div className="aspect-video bg-black/5 relative">
                <video 
                  src={video.url} 
                  controls 
                  onEnded={() => handleVideoEnd(video)}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-xs font-semibold text-white flex items-center space-x-1 pointer-events-none">
                  <PlayCircle className="w-3 h-3" />
                  <span>Video</span>
                </div>
              </div>
              <div className="p-5">
                <h3 className="font-bold text-[#002147] text-lg mb-1 leading-tight line-clamp-2 group-hover:text-[#dc143c] transition-colors">{video.title}</h3>
                <div className="flex items-center space-x-4 mt-4 pt-4 border-t border-[#002147]/5 text-xs text-[#002147]/50 font-medium">
                  <span className="flex items-center space-x-1">
                    <BookOpen className="w-3 h-3" />
                    <span>{activeSubject}</span>
                  </span>
                  <span className="flex items-center space-x-1 text-[#f5a623]">
                    <Star className="w-3 h-3 fill-current" />
                    <span>Curriculum</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quiz Modal */}
      {showQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-[#002147] p-6 text-white flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold flex items-center space-x-2">
                  <HelpCircle className="w-6 h-6 text-[#dc143c]" />
                  <span>Knowledge Check</span>
                </h2>
                <p className="text-white/70 text-sm mt-1">{currentVideo?.title}</p>
              </div>
              <button
                onClick={() => setShowQuiz(false)}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                title="Close quiz"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            
            <div className="p-8">
              {generatingQuiz ? (
                <div className="text-center py-10">
                  <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-[#002147]" />
                  <p className="text-[#002147]/70 font-semibold text-lg">Generating personalized quiz...</p>
                </div>
              ) : quizData ? (
                quizScore !== null ? (
                  <div className="text-center py-10 space-y-4">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 text-green-600 mb-2">
                      <CheckCircle className="w-10 h-10" />
                    </div>
                    <h3 className="text-3xl font-black text-[#002147]">You scored {quizScore}/{quizData.questions.length}!</h3>
                    <p className="text-[#002147]/60">Your learning profile has been updated.</p>
                    <button 
                      onClick={() => setShowQuiz(false)}
                      className="mt-6 px-8 py-3 bg-[#002147] text-white rounded-xl font-bold hover:bg-[#002147]/90 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="flex justify-between items-center text-sm font-bold text-[#002147]/50 uppercase tracking-wider">
                      <span>Question {currentQuestionIdx + 1} of {quizData.questions.length}</span>
                    </div>
                    <h3 className="text-xl font-bold text-[#002147] leading-relaxed">
                      {quizData.questions[currentQuestionIdx].questionText}
                    </h3>
                    <div className="space-y-3">
                      {quizData.questions[currentQuestionIdx].options.map((opt: string, i: number) => (
                        <button
                          key={i}
                          onClick={() => handleAnswer(i)}
                          className="w-full text-left p-4 rounded-xl border-2 border-[#002147]/10 hover:border-[#002147] hover:bg-[#f8fafc] font-semibold text-[#002147] transition-all"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              ) : (
                <div className="text-center py-10">
                  <p className="text-red-500 mb-4">Failed to load quiz.</p>
                  <button onClick={() => setShowQuiz(false)} className="px-6 py-2 bg-gray-100 text-[#002147] font-bold rounded-xl hover:bg-gray-200 transition-colors">Close</button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
