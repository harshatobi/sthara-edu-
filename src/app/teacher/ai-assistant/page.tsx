'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  Sparkles, ArrowLeft, Copy, CheckCircle, BrainCircuit, Download, SendIcon,
  Loader2, Maximize, Minimize, History, X, ChevronRight, BookOpen,
  Users, BarChart2, Eye, Plus, Trash2, ToggleLeft, ToggleRight
} from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { db } from '@/lib/firebase/config';
import {
  collection, addDoc, getDocs, query, where, orderBy,
  serverTimestamp, setDoc, doc, getDoc
} from 'firebase/firestore';
import { getAuthToken } from '@/lib/auth/getAuthToken';

/* ─────────────── TYPES ─────────────── */
interface QuizQuestion {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
}

interface HistorySession {
  id: string;
  topic: string;
  outputFormat: string;
  content: string;
  createdAt: any;
}

interface ResourceStats {
  reads: number;
  studentNames: string[];
  quizResponses: { studentName: string; score: number; total: number }[];
}

/* ─────────────── QUIZ WORKSHEET (print view) ─────────────── */
const QuizWorksheet = ({ data }: { data: any }) => (
  <div className="font-sans text-[#002147] w-full mx-auto bg-white">
    <h1 className="text-4xl font-black text-center mb-10 tracking-tight">{data.title || 'Quiz'}</h1>
    <div className="flex justify-between items-end mb-10 gap-8">
      <div className="flex-1">
        <label className="font-bold text-lg mb-2 block">Name:</label>
        <div className="border-b-2 border-gray-300 h-8" />
      </div>
      <div className="flex-1">
        <label className="font-bold text-lg mb-2 block">Date:</label>
        <div className="border-b-2 border-gray-300 h-8" />
      </div>
    </div>
    <div className="mb-10">
      <h2 className="font-bold text-xl mb-2">Directions</h2>
      <div className="text-gray-700 font-medium">{data.directions}</div>
    </div>
    <div className="space-y-10">
      {data.questions?.map((q: any, i: number) => (
        <div key={i} className="pb-8 border-b border-gray-100 last:border-0">
          <h3 className="font-bold text-lg mb-6 leading-relaxed">{i + 1}. {q.text}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
            {q.options?.map((opt: string, optIdx: number) => (
              <div key={optIdx} className="flex items-start space-x-3">
                <div className="w-6 h-6 rounded-full border border-gray-400 flex items-center justify-center text-sm shrink-0">
                  {String.fromCharCode(97 + optIdx)}
                </div>
                <span className="font-medium pt-0.5">{opt}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    <div className="mt-16 pt-8 border-t-2 border-dashed border-gray-300 print:hidden">
      <h2 className="font-bold text-2xl mb-6 text-purple-600 flex items-center">
        <CheckCircle className="w-6 h-6 mr-2" /> Teacher Answer Key
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {data.questions?.map((q: any, i: number) => (
          <div key={i} className="bg-purple-50 p-4 rounded-xl border border-purple-100">
            <span className="font-bold text-lg mr-2">Q{i + 1}:</span>
            <span className="uppercase font-black text-lg text-purple-700">
              {String.fromCharCode(97 + q.answerIndex)}
            </span>
            <p className="text-sm mt-2 text-purple-800">{q.explanation}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ─────────────── POST MODAL ─────────────── */
function PostModal({
  profile,
  topic,
  outputFormat,
  generatedContent,
  onClose,
  onPosted,
}: {
  profile: any;
  topic: string;
  outputFormat: string;
  generatedContent: string;
  onClose: () => void;
  onPosted: (resourceId: string) => void;
}) {
  const teacherClasses: string[] = Array.from(new Set(
    (profile.assignments || []).map((a: any) => a.class).filter(Boolean)
  ));

  const [targetClass, setTargetClass] = useState(teacherClasses[0] || '');
  const [customClass, setCustomClass] = useState('');
  const [withQuiz, setWithQuiz] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([
    { question: '', options: ['', '', '', ''], correctIndex: 0 },
  ]);

  const effectiveClass = teacherClasses.length > 0 ? targetClass : customClass;

  const addQuestion = () => {
    if (quizQuestions.length >= 5) return;
    setQuizQuestions(prev => [...prev, { question: '', options: ['', '', '', ''], correctIndex: 0 }]);
  };

  const removeQuestion = (idx: number) => {
    setQuizQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, field: keyof QuizQuestion, value: any) => {
    setQuizQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  };

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    setQuizQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const newOptions = [...q.options] as [string, string, string, string];
      newOptions[optIdx] = value;
      return { ...q, options: newOptions };
    }));
  };

  const handlePost = async () => {
    const cls = effectiveClass.trim();
    if (!cls) { alert('Please select or enter a target class.'); return; }
    if (withQuiz) {
      const incomplete = quizQuestions.some(q => !q.question.trim() || q.options.some(o => !o.trim()));
      if (incomplete) { alert('Please fill in all quiz question fields.'); return; }
    }

    setIsPosting(true);
    try {
      const resourceRef = await addDoc(
        collection(db, 'schools', profile.schoolId, 'teacherResources'),
        {
          title: `${outputFormat}: ${topic.substring(0, 60)}`,
          summary: topic.substring(0, 120),
          content: generatedContent,
          targetClass: cls,
          teacherId: profile.uid,
          teacherName: profile.name || 'Teacher',
          withQuiz,
          quizQuestions: withQuiz ? quizQuestions : [],
          createdAt: serverTimestamp(),
          type: 'teacherResource',
        }
      );
      onPosted(resourceRef.id);
    } catch (e: any) {
      alert('Failed to post: ' + e.message);
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-bold text-lg">Post to Students</h2>
              <p className="text-blue-200 text-sm mt-0.5">Send this resource to your class</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Target Class */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Target Class / Section</label>
            {teacherClasses.length > 0 ? (
              <select
                value={targetClass}
                onChange={e => setTargetClass(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                {teacherClasses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input
                type="text"
                value={customClass}
                onChange={e => setCustomClass(e.target.value)}
                placeholder="e.g. 10A, 11B, 9C"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            )}
          </div>

          {/* Quiz Toggle */}
          <div className="flex items-center justify-between p-4 bg-purple-50 rounded-xl border border-purple-100">
            <div>
              <p className="font-bold text-gray-800">Include a Comprehension Quiz?</p>
              <p className="text-sm text-gray-500 mt-0.5">Students must attempt it after reading</p>
            </div>
            <button onClick={() => setWithQuiz(v => !v)} className="shrink-0">
              {withQuiz
                ? <ToggleRight className="w-10 h-10 text-purple-600" />
                : <ToggleLeft className="w-10 h-10 text-gray-400" />}
            </button>
          </div>

          {/* Quiz Builder */}
          {withQuiz && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-800">Quiz Questions ({quizQuestions.length}/5)</h3>
                {quizQuestions.length < 5 && (
                  <button onClick={addQuestion} className="flex items-center space-x-1 text-sm text-blue-600 font-bold hover:underline">
                    <Plus className="w-4 h-4" />
                    <span>Add Question</span>
                  </button>
                )}
              </div>

              {quizQuestions.map((q, qIdx) => (
                <div key={qIdx} className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Question {qIdx + 1}</span>
                    {quizQuestions.length > 1 && (
                      <button onClick={() => removeQuestion(qIdx)} className="text-rose-500 hover:text-rose-700">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={q.question}
                    onChange={e => updateQuestion(qIdx, 'question', e.target.value)}
                    placeholder="Enter question..."
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {q.options.map((opt, optIdx) => (
                      <div key={optIdx} className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name={`correct-${qIdx}`}
                          checked={q.correctIndex === optIdx}
                          onChange={() => updateQuestion(qIdx, 'correctIndex', optIdx)}
                          className="text-blue-600 shrink-0"
                          title="Mark as correct answer"
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={e => updateOption(qIdx, optIdx, e.target.value)}
                          placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                          className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400">
                    ● Select the radio button next to the correct answer
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Post Button */}
          <button
            onClick={handlePost}
            disabled={isPosting}
            className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-colors disabled:opacity-50"
          >
            {isPosting ? <Loader2 className="w-5 h-5 animate-spin" /> : <SendIcon className="w-5 h-5" />}
            <span>{isPosting ? 'Posting...' : `Post to ${effectiveClass || 'class'}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── STATS MODAL ─────────────── */
function StatsModal({
  profile,
  resourceId,
  onClose,
}: {
  profile: any;
  resourceId: string;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<ResourceStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const readsSnap = await getDocs(
          collection(db, 'schools', profile.schoolId, 'teacherResources', resourceId, 'reads')
        );
        const quizSnap = await getDocs(
          collection(db, 'schools', profile.schoolId, 'teacherResources', resourceId, 'quizResponses')
        );
        setStats({
          reads: readsSnap.size,
          studentNames: readsSnap.docs.map(d => d.data().studentName || d.id),
          quizResponses: quizSnap.docs.map(d => ({
            studentName: d.data().studentName || d.id,
            score: d.data().score || 0,
            total: d.data().total || 0,
          })),
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [profile.schoolId, resourceId]);

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-5 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">Resource Stats</h2>
            <p className="text-emerald-100 text-sm">Who has opened &amp; completed the quiz</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : !stats ? (
            <p className="text-gray-500 text-center py-8">Failed to load stats.</p>
          ) : (
            <>
              <div className="flex items-center space-x-4">
                <div className="bg-blue-50 rounded-xl p-4 flex-1 text-center border border-blue-100">
                  <p className="text-3xl font-black text-blue-600">{stats.reads}</p>
                  <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-wider">Students Opened</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 flex-1 text-center border border-purple-100">
                  <p className="text-3xl font-black text-purple-600">{stats.quizResponses.length}</p>
                  <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-wider">Quiz Submitted</p>
                </div>
              </div>

              {stats.studentNames.length > 0 && (
                <div>
                  <h3 className="font-bold text-gray-700 mb-3 flex items-center space-x-2">
                    <Eye className="w-4 h-4 text-blue-500" />
                    <span>Opened by</span>
                  </h3>
                  <div className="space-y-2">
                    {stats.studentNames.map((name, i) => (
                      <div key={i} className="flex items-center space-x-3 p-2 bg-gray-50 rounded-lg">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                          {name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-gray-700">{name}</span>
                        <CheckCircle className="w-4 h-4 text-emerald-500 ml-auto" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats.quizResponses.length > 0 && (
                <div>
                  <h3 className="font-bold text-gray-700 mb-3 flex items-center space-x-2">
                    <BarChart2 className="w-4 h-4 text-purple-500" />
                    <span>Quiz Scores</span>
                  </h3>
                  <div className="space-y-2">
                    {stats.quizResponses.map((r, i) => {
                      const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-xs">
                              {r.studentName.charAt(0)}
                            </div>
                            <span className="text-sm font-medium text-gray-700">{r.studentName}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-bold text-gray-900">{r.score}/{r.total}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pct >= 70 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {pct}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {stats.reads === 0 && (
                <div className="text-center py-6 text-gray-400">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="font-medium">No students have opened this resource yet.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── HISTORY DRAWER ─────────────── */
function HistoryDrawer({
  profile,
  onClose,
  onRestore,
}: {
  profile: any;
  onClose: () => void;
  onRestore: (session: HistorySession) => void;
}) {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'schools', profile.schoolId, 'aiHistory'),
            where('teacherId', '==', profile.uid),
            orderBy('createdAt', 'desc')
          )
        );
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as HistorySession)));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [profile.schoolId, profile.uid]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-[150]" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl z-[160] flex flex-col">
        <div className="bg-[#002147] px-6 py-5 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Generation History</h2>
            <p className="text-white/60 text-sm">Your previous AI sessions</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : sessions.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No history yet.</p>
              <p className="text-sm mt-1">Generate something first!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map(session => {
                const date = session.createdAt?.toDate?.()
                  ? session.createdAt.toDate().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                  : 'Recent';
                return (
                  <button
                    key={session.id}
                    onClick={() => { onRestore(session); onClose(); }}
                    className="w-full text-left p-4 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-xl transition-all group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 mr-2">
                        <p className="font-bold text-gray-800 text-sm truncate">{session.topic || 'Untitled'}</p>
                        <p className="text-xs text-blue-600 font-semibold mt-0.5">{session.outputFormat}</p>
                        <p className="text-xs text-gray-400 mt-1">{date}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 shrink-0 mt-1" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─────────────── MAIN PAGE ─────────────── */
export default function TeacherAIAssistant() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [topic, setTopic] = useState('');
  const [gradeLevel, setGradeLevel] = useState('Grade 10');
  const [tone, setTone] = useState('Academic & Professional');
  const [outputFormat, setOutputFormat] = useState('Standard Lesson Plan');

  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');

  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Post modal
  const [showPostModal, setShowPostModal] = useState(false);
  const [postedResourceId, setPostedResourceId] = useState<string | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);

  // History
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setGeneratedContent('');
    setIsGenerating(true);
    setCopied(false);
    setPostedResourceId(null);

    setLoadingText('Synthesizing pedagogical requirements...');
    await new Promise(r => setTimeout(r, 1000));
    setLoadingText('Connecting to Sthara Intelligence Engine...');
    await new Promise(r => setTimeout(r, 1000));

    try {
      const authToken = await getAuthToken();
      const response = await fetch('/api/teacher/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ topic, gradeLevel, tone, outputFormat }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || 'Failed to generate content. Please try again.');
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Stream not available');

      const decoder = new TextDecoder();
      let fullContent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;
        setGeneratedContent(prev => prev + chunk);
      }

      // Auto-save to history
      if (profile?.schoolId && fullContent.trim()) {
        addDoc(collection(db, 'schools', profile.schoolId, 'aiHistory'), {
          teacherId: profile.uid,
          topic,
          gradeLevel,
          tone,
          outputFormat,
          content: fullContent,
          createdAt: serverTimestamp(),
        }).catch(console.warn);
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => window.print();

  const handlePosted = (resourceId: string) => {
    setShowPostModal(false);
    setPostedResourceId(resourceId);
  };

  const handleRestoreSession = (session: HistorySession) => {
    setTopic(session.topic || '');
    setOutputFormat(session.outputFormat || 'Standard Lesson Plan');
    setGeneratedContent(session.content || '');
    setPostedResourceId(null);
  };

  // Safe JSON parser for Quiz Worksheet
  let parsedQuizData = null;
  if (generatedContent && outputFormat.includes('Quiz')) {
    try {
      let c = generatedContent.trim();
      const m = c.match(/```json\n([\s\S]*?)\n```/);
      if (m?.[1]) c = m[1];
      else if (c.startsWith('```json')) c = c.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      const d = JSON.parse(c);
      if (d.isQuiz) parsedQuizData = d;
    } catch { /* ignore */ }
  }

  if (loading || !profile) {
    return (
      <div className="p-10 flex justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12 font-sans print:bg-white print:p-0">
      <style>{`@media print { @page { size: landscape; margin: 0.5cm; } }`}</style>

      {/* Modals */}
      {showPostModal && (
        <PostModal
          profile={profile}
          topic={topic}
          outputFormat={outputFormat}
          generatedContent={generatedContent}
          onClose={() => setShowPostModal(false)}
          onPosted={handlePosted}
        />
      )}
      {showStatsModal && postedResourceId && (
        <StatsModal
          profile={profile}
          resourceId={postedResourceId}
          onClose={() => setShowStatsModal(false)}
        />
      )}
      {showHistory && (
        <HistoryDrawer
          profile={profile}
          onClose={() => setShowHistory(false)}
          onRestore={handleRestoreSession}
        />
      )}

      {/* HEADER */}
      <div className="bg-[#002147] text-white pt-10 pb-16 px-8 relative overflow-hidden print:hidden">
        <div className="max-w-[1400px] mx-auto relative z-10 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/teacher" className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all">
              <ArrowLeft className="w-5 h-5 text-white" />
            </Link>
            <div>
              <div className="flex items-center space-x-2 text-purple-300 text-xs font-bold uppercase tracking-wider mb-1">
                <Sparkles className="w-3 h-3" />
                <span>Sthara Intelligence Engine</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight">AI Teaching Assistant</h1>
            </div>
          </div>
          {/* History button */}
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white font-semibold text-sm transition-all"
            title="Generation History"
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">History</span>
          </button>
        </div>
      </div>

      <div className="w-full max-w-[1400px] mx-auto px-4 -mt-8 relative z-20 flex flex-col lg:flex-row gap-8 print:block print:w-full print:mt-0 print:px-0 print:gap-0">

        {/* FORM PANEL */}
        <div className="lg:w-1/3 space-y-6 print:hidden">
          <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100">
            <form onSubmit={handleGenerate} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Topic or Concept</label>
                <textarea
                  required
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. The causes of the French Revolution, focusing on economic inequality."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px] resize-none font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Grade Level</label>
                <select
                  value={gradeLevel}
                  onChange={e => setGradeLevel(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  {['Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12','College Level'].map(g => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Tone</label>
                <select
                  value={tone}
                  onChange={e => setTone(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  {['Academic & Professional','Strictly Factual','Encouraging & Fun','Socratic / Questioning'].map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Output Format</label>
                <select
                  value={outputFormat}
                  onChange={e => setOutputFormat(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  {['Standard Lesson Plan','Grading Rubric Table','Multiple Choice Quiz','Bullet-point Summary'].map(f => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isGenerating || !topic.trim()}
                className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex justify-center items-center"
              >
                {isGenerating
                  ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> {loadingText}</>
                  : <><BrainCircuit className="w-5 h-5 mr-2" /> Generate Intelligence</>}
              </button>
            </form>
          </div>
        </div>

        {/* OUTPUT PANEL */}
        <div className={`print:w-full ${isFullscreen ? 'fixed inset-0 z-[100] bg-gray-100 overflow-y-auto p-4 md:p-8' : 'lg:w-2/3'}`}>
          {generatedContent ? (
            <div className={`bg-white overflow-hidden print:border-none print:shadow-none print:rounded-none ${isFullscreen ? 'min-h-screen max-w-5xl mx-auto rounded-2xl shadow-2xl border border-gray-200' : 'rounded-2xl shadow-lg border border-gray-200'}`}>

              {/* Top action bar */}
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center print:hidden">
                <span className="font-bold text-gray-600 text-sm tracking-wider uppercase">Generated Output</span>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  >
                    {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                  >
                    {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                  <button
                    onClick={handleExport}
                    className="flex items-center space-x-2 px-4 py-2 bg-[#002147] text-white rounded-lg hover:bg-[#003366] font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export PDF</span>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-8 md:p-12 print:p-0">
                {parsedQuizData
                  ? <QuizWorksheet data={parsedQuizData} />
                  : (
                    <div className="prose prose-lg max-w-none text-gray-800">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ node, ...props }) => <h1 className="text-3xl font-black mb-6 text-[#002147]" {...props} />,
                          h2: ({ node, ...props }) => <h2 className="text-2xl font-bold mt-8 mb-4 text-[#002147] border-b pb-2" {...props} />,
                          h3: ({ node, ...props }) => <h3 className="text-xl font-bold mt-6 mb-3 text-gray-800" {...props} />,
                          p: ({ node, ...props }) => <p className="mb-4 leading-relaxed" {...props} />,
                          ul: ({ node, ...props }) => <ul className="list-disc pl-6 mb-4 space-y-2" {...props} />,
                          li: ({ node, ...props }) => <li className="pl-2" {...props} />,
                          table: ({ node, ...props }) => (
                            <div className="my-8 w-full overflow-x-auto rounded-xl border border-gray-200">
                              <table className="w-full text-left border-collapse min-w-[800px]" {...props} />
                            </div>
                          ),
                          thead: ({ node, ...props }) => <thead className="bg-[#002147] text-white" {...props} />,
                          th: ({ node, ...props }) => <th className="p-4 font-bold tracking-wider text-white" {...props} />,
                          td: ({ node, ...props }) => <td className="p-4 border-t border-gray-200 align-top bg-white" {...props} />,
                          tr: ({ node, ...props }) => <tr className="even:bg-gray-50/50" {...props} />,
                        }}
                      >
                        {generatedContent}
                      </ReactMarkdown>
                    </div>
                  )}
              </div>

              {/* Bottom Action Bar */}
              <div className="bg-gray-50 px-6 py-5 border-t border-gray-200 flex items-center justify-center gap-4 print:hidden flex-wrap">
                {postedResourceId ? (
                  <>
                    <div className="flex items-center space-x-2 text-emerald-600 font-bold">
                      <CheckCircle className="w-5 h-5" />
                      <span>Posted to Students!</span>
                    </div>
                    <button
                      onClick={() => setShowStatsModal(true)}
                      className="flex items-center space-x-2 px-5 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-700 font-bold hover:bg-gray-50 transition-colors"
                    >
                      <BarChart2 className="w-4 h-4 text-purple-500" />
                      <span>View Stats</span>
                    </button>
                    <button
                      onClick={() => { setPostedResourceId(null); setShowPostModal(true); }}
                      className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
                    >
                      <SendIcon className="w-4 h-4" />
                      <span>Post Again</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowPostModal(true)}
                    disabled={!generatedContent}
                    className="flex items-center space-x-2 px-8 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5 transition-all shadow-md disabled:opacity-50"
                  >
                    <SendIcon className="w-5 h-5" />
                    <span>Post to Students</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl shadow-sm border border-dashed border-gray-300 print:hidden">
              <BrainCircuit className="w-16 h-16 text-gray-200 mb-4" />
              <h3 className="text-xl font-bold text-gray-400 mb-2">Awaiting Instructions</h3>
              <p className="text-gray-400 max-w-sm">
                Fill out the prompt configuration on the left and hit generate to create spectacular educational material.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
