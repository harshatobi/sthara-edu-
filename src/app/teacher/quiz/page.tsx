'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Sparkles, BrainCircuit, PenTool, ChevronRight,
  ChevronLeft, Loader2, Plus, Trash2, CheckCircle2, Send,
  BookOpen, Zap, Target, RefreshCw,
  ClipboardList, X, Check, KeyRound, FileKey2, GraduationCap,
  Layers, CheckSquare, Square, Printer, Calendar
} from 'lucide-react';
import Link from 'next/link';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';


type Mode = null | 'full_ai' | 'semi_ai' | 'manual';
type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';
type Step = 'mode' | 'config' | 'preview' | 'post';
type TabView = 'create' | 'keys';

interface Question {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
  difficulty?: string;
}

interface SyllabusModule {
  id: string;
  topic: string;
  subject?: string;
  month?: string;
  grade?: string;
}

const DIFFICULTIES: { value: Difficulty; label: string; desc: string; color: string }[] = [
  { value: 'easy',   label: 'Easy',   desc: 'Basic recall & comprehension',    color: 'emerald' },
  { value: 'medium', label: 'Medium', desc: 'Application & analysis',           color: 'blue'    },
  { value: 'hard',   label: 'Hard',   desc: 'Evaluation & deep reasoning',      color: 'rose'    },
  { value: 'mixed',  label: 'Mixed',  desc: 'Variety across all levels',        color: 'violet'  },
];

const Q_COUNTS = [5, 10, 15, 20, 25];

export default function TeacherQuizPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const auth = getAuth();

  // ── UI Tabs ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabView>('create');

  // ── Quiz Creator state ────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('mode');
  const [mode, setMode] = useState<Mode>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('mixed');
  const [numQ, setNumQ] = useState(10);
  const [topicsInput, setTopicsInput] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [quizTitle, setQuizTitle] = useState('');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [generating, setGenerating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [syllabusData, setSyllabusData] = useState<string>('');
  const [syllabusLoading, setSyllabusLoading] = useState(false);
  const [editingQ, setEditingQ] = useState<number | null>(null);
  const [currentQuiz, setCurrentQuiz] = useState<any>(null); // just-posted quiz for answer key

  // ── Module Picker ─────────────────────────────────────────────────────────
  const [syllabusModules, setSyllabusModules] = useState<SyllabusModule[]>([]);
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);

  // ── My Quiz Keys tab ──────────────────────────────────────────────────────
  const [myQuizzes, setMyQuizzes] = useState<any[]>([]);
  const [quizzesLoading, setQuizzesLoading] = useState(false);
  const [keyQuiz, setKeyQuiz] = useState<any>(null); // shown in answer key modal

  // ── Manual mode state ─────────────────────────────────────────────────────
  const [manualQ, setManualQ] = useState<Question[]>([
    { question: '', options: ['', '', '', ''], correctAnswerIndex: 0, explanation: '' }
  ]);

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) router.push('/login');
  }, [profile, loading, router]);

  // ── Load available classes ────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.schoolId) return;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/teacher/get-students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ schoolId: profile.schoolId }),
        });
        const data = await res.json();
        const classSet = new Set<string>();
        (data.students || []).forEach((s: any) => { if (s.studentClass) classSet.add(s.studentClass); });
        const teacherClasses = [
          ...(profile.assignments?.map((a: any) => a.class).filter(Boolean) ?? []),
          ...(profile.teacherClass ? [profile.teacherClass] : []),
        ];
        const unique = [...new Set(teacherClasses)];
        const classes = unique.length > 0 ? unique : Array.from(classSet).sort();
        setAvailableClasses(classes);
        if (classes.length > 0) setSelectedClasses([classes[0]]);
        if (profile.assignments?.[0]?.subject) setSubject(profile.assignments[0].subject);
        else if (profile.teacherSubject) setSubject(profile.teacherSubject);
      } catch (e) { console.error(e); }
    })();
  }, [profile]);

  // ── Load syllabus modules for module picker ───────────────────────────────
  const loadSyllabusModules = useCallback(async () => {
    if (!profile?.schoolId || !profile?.uid) return;
    setModulesLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(
        `/api/teacher/syllabus?schoolId=${profile.schoolId}&teacherId=${profile.uid}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      setSyllabusModules(data.modules || []);
    } catch (e) { console.error(e); } finally { setModulesLoading(false); }
  }, [profile]);

  // ── Load all teacher's quizzes for key viewer ─────────────────────────────
  const loadMyQuizzes = useCallback(async () => {
    if (!profile?.schoolId) return;
    setQuizzesLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/teacher/get-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schoolId: profile.schoolId }),
      });
      const data = await res.json();
      const quizzes = (data.assignments || []).filter(
        (a: any) => a.type === 'quiz' && a.teacherId === profile.uid && Array.isArray(a.questions) && a.questions.length > 0
      );
      setMyQuizzes(quizzes);
    } catch (e) { console.error(e); } finally { setQuizzesLoading(false); }
  }, [profile]);

  useEffect(() => {
    if (activeTab === 'keys') loadMyQuizzes();
  }, [activeTab, loadMyQuizzes]);

  // ── Load syllabus data string for full_ai mode ────────────────────────────
  const loadSyllabus = async () => {
    if (!profile?.schoolId) return;
    setSyllabusLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(
        `/api/teacher/syllabus?schoolId=${profile.schoolId}&teacherId=${profile.uid}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      const items: string[] = [];
      (data.modules || []).forEach((d: any) => {
        if (d.topic) items.push(`${d.topic} (${d.subject || ''}, ${d.month || ''})`);
      });
      setSyllabusData(items.join('; ') || 'No syllabus entries found. Topics will be auto-selected based on grade level.');
    } catch (e) {
      setSyllabusData('Could not load syllabus. AI will generate questions based on the subject.');
    } finally {
      setSyllabusLoading(false);
    }
  };

  const handleAddTopic = () => {
    const t = topicsInput.trim();
    if (t && !topics.includes(t)) { setTopics([...topics, t]); setTopicsInput(''); }
  };
  const handleRemoveTopic = (t: string) => setTopics(topics.filter(x => x !== t));

  const toggleModule = (id: string) => {
    setSelectedModuleIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllModules = () => setSelectedModuleIds(syllabusModules.map(m => m.id));
  const deselectAllModules = () => setSelectedModuleIds([]);

  // ── Generate quiz ─────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const token = await auth.currentUser?.getIdToken();

      // Combine selected module topics + manually typed topics
      const moduleTopic = syllabusModules
        .filter(m => selectedModuleIds.includes(m.id))
        .map(m => m.topic);
      const allTopics = [...new Set([...moduleTopic, ...topics])];

      const res = await fetch('/api/teacher/quiz-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode,
          topics: mode === 'full_ai' ? allTopics : allTopics,
          syllabusData: mode === 'full_ai' ? syllabusData : '',
          numQuestions: numQ,
          difficulty,
          subject,
          className: selectedClasses[0] || '',
        }),
      });
      const data = await res.json();
      if (data.questions?.length) {
        setQuestions(data.questions);
        if (data.title) setQuizTitle(data.title);
        setStep('preview');
      } else {
        alert('AI could not generate questions. Please try again.');
      }
    } catch (e) {
      console.error(e);
      alert('Generation failed. Check your connection.');
    } finally {
      setGenerating(false);
    }
  };

  // ── Post quiz ─────────────────────────────────────────────────────────────
  const handlePostQuiz = async () => {
    if (!profile?.schoolId) return;
    if (!dueDate) { alert('Please set a due date first.'); return; }
    if (!quizTitle.trim()) { alert('Please set a quiz title.'); return; }

    const classesToPost = selectedClasses.length > 0 ? selectedClasses : availableClasses.slice(0, 1);
    if (classesToPost.length === 0) { alert('No classes found. Please ensure students are enrolled in your school.'); return; }
    if (selectedClasses.length === 0) setSelectedClasses(classesToPost);

    // Compute students assigned to this teacher for the selected class+subject
    const assignedStudentIds: string[] = Array.from(new Set(
      (profile.assignments || [])
        .filter((a: any) => classesToPost.includes(a.class) && (!subject || a.subject === subject))
        .flatMap((a: any) => a.assignedStudents || [])
    ));

    setPosting(true);
    try {
      const qs = mode === 'manual' ? manualQ.filter(q => q.question.trim()) : questions;
      await Promise.all(classesToPost.map(cls =>
        addDoc(collection(db, 'schools', profile.schoolId, 'assignments'), {
          title: quizTitle,
          type: 'quiz',
          subject: subject || 'General',
          class: cls,
          targetClass: cls,
          difficulty,
          dueDate,
          teacherId: profile.uid,
          teacherName: profile.name,
          questions: qs,
          totalQuestions: qs.length,
          maxScore: qs.length,
          generatedBy: mode === 'manual' ? 'teacher' : 'ai',
          createdAt: serverTimestamp(),
          status: 'published',
          assignedStudentIds,
        })
      ));
      // Save for answer key view
      setCurrentQuiz({
        title: quizTitle, subject, difficulty, dueDate,
        classes: classesToPost,
        questions: mode === 'manual' ? manualQ.filter(q => q.question.trim()) : questions,
      });
      setPosted(true);
      setStep('post');
    } catch (e) {
      console.error(e);
      alert('Failed to post quiz.');
    } finally {
      setPosting(false);
    }
  };

  const updateManualQ = (idx: number, field: string, val: any) => {
    setManualQ(prev => prev.map((q, i) => i === idx ? { ...q, [field]: val } : q));
  };
  const updateManualOption = (qIdx: number, optIdx: number, val: string) => {
    setManualQ(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const newOpts = [...q.options]; newOpts[optIdx] = val;
      return { ...q, options: newOpts };
    }));
  };

  const diffColor = (d: Difficulty | string) => {
    switch (d) {
      case 'easy':   return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'medium': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'hard':   return 'bg-rose-100 text-rose-700 border-rose-200';
      default:       return 'bg-violet-100 text-violet-700 border-violet-200';
    }
  };

  if (loading || !profile) return (
    <div className="min-h-screen bg-[#f8fafc] flex justify-center items-center">
      <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
    </div>
  );

  // ── Answer Key Modal ───────────────────────────────────────────────────────
  const answerKeyModal = keyQuiz && (
    <div className="fixed inset-0 z-[400] flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto p-4">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl my-6 overflow-hidden">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#002147] to-[#0a3a7a] px-8 py-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-blue-300 text-xs font-black uppercase tracking-wider mb-2">
              <KeyRound className="w-4 h-4" />
              <span>Answer Key</span>
            </div>
            <h2 className="text-white font-black text-2xl leading-tight">{keyQuiz.title || 'Untitled Quiz'}</h2>
            <div className="flex flex-wrap gap-3 mt-3">
              {keyQuiz.subject && <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">{keyQuiz.subject}</span>}
              {(keyQuiz.class || keyQuiz.classes) && (
                <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                  {Array.isArray(keyQuiz.classes) ? keyQuiz.classes.join(', ') : keyQuiz.class}
                </span>
              )}
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${diffColor(keyQuiz.difficulty || 'mixed')}`}>
                {keyQuiz.difficulty || 'mixed'}
              </span>
              <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                {keyQuiz.questions?.length || 0} Questions · {keyQuiz.questions?.length || 0} Marks
              </span>
              {keyQuiz.dueDate && (
                <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                  Due: {new Date(keyQuiz.dueDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={() => window.print()}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"
              title="Print answer key"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button onClick={() => setKeyQuiz(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Questions */}
        <div className="p-8 space-y-6">
          {(keyQuiz.questions || []).map((q: Question, idx: number) => (
            <div key={idx} className="border border-gray-200 rounded-2xl overflow-hidden">
              {/* Question header */}
              <div className="bg-gray-50 px-5 py-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 bg-[#002147] text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">{idx + 1}</span>
                  <p className="font-bold text-[#002147] text-base leading-relaxed">{q.question}</p>
                </div>
                {q.difficulty && (
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 ${diffColor(q.difficulty)}`}>
                    {q.difficulty}
                  </span>
                )}
              </div>
              {/* Options */}
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {q.options.map((opt, optIdx) => (
                  <div
                    key={optIdx}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
                      optIdx === q.correctAnswerIndex
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-300'
                        : 'bg-gray-50 border-gray-200 text-gray-600'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-black shrink-0 ${
                      optIdx === q.correctAnswerIndex
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-gray-300 text-gray-400'
                    }`}>
                      {optIdx === q.correctAnswerIndex ? <Check className="w-3.5 h-3.5" /> : String.fromCharCode(65 + optIdx)}
                    </span>
                    <span>{opt}</span>
                    {optIdx === q.correctAnswerIndex && (
                      <span className="ml-auto text-emerald-600 font-black text-xs">CORRECT</span>
                    )}
                  </div>
                ))}
              </div>
              {/* Correct answer summary + explanation */}
              <div className="px-5 pb-5 space-y-2">
                <div className="flex items-center gap-2 bg-emerald-100 border border-emerald-200 rounded-xl px-4 py-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-sm font-bold text-emerald-800">
                    ✓ Answer: {String.fromCharCode(65 + q.correctAnswerIndex)}. {q.options[q.correctAnswerIndex]}
                  </span>
                </div>
                {q.explanation && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
                    <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 font-medium">{q.explanation}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer summary */}
        <div className="bg-gray-50 border-t border-gray-200 px-8 py-5 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            <span className="font-bold text-[#002147]">{keyQuiz.questions?.length || 0}</span> questions ·{' '}
            <span className="font-bold text-emerald-600">{keyQuiz.questions?.length || 0}</span> marks total
          </div>
          <button
            onClick={() => setKeyQuiz(null)}
            className="px-5 py-2 bg-[#002147] text-white font-bold rounded-xl text-sm hover:bg-[#003366] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f4f6fb] pb-20 font-sans">

      {/* Header */}
      <div className="bg-white border-b border-gray-200/60 shadow-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/teacher" className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition border border-gray-200/60">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </Link>
            <div>
              <div className="flex items-center gap-2 text-indigo-500 text-xs font-bold uppercase tracking-wider mb-0.5">
                <ClipboardList className="w-4 h-4" />
                <span>Quiz Creator</span>
              </div>
              <h1 className="text-xl font-black text-[#002147]">Create a Quiz</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tab switcher */}
            <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => setActiveTab('create')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'create'
                    ? 'bg-white text-[#002147] shadow-sm'
                    : 'text-gray-500 hover:text-[#002147]'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Create Quiz
              </button>
              <button
                onClick={() => setActiveTab('keys')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'keys'
                    ? 'bg-white text-[#002147] shadow-sm'
                    : 'text-gray-500 hover:text-[#002147]'
                }`}
              >
                <KeyRound className="w-4 h-4" />
                My Quiz Keys
              </button>
            </div>

            {/* Breadcrumb (create tab only) */}
            {activeTab === 'create' && (
              <div className="hidden sm:flex items-center gap-2 text-xs font-bold">
                {(['mode', 'config', 'preview', 'post'] as Step[]).map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`px-3 py-1.5 rounded-full transition-all ${step === s ? 'bg-[#002147] text-white' : i < ['mode','config','preview','post'].indexOf(step) ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                      {i < ['mode','config','preview','post'].indexOf(step) ? <Check className="w-3 h-3" /> : s === 'mode' ? 'Mode' : s === 'config' ? 'Setup' : s === 'preview' ? 'Preview' : 'Done'}
                    </div>
                    {i < 3 && <ChevronRight className="w-3.5 h-3.5 text-gray-300" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">

        {/* ════════════════════════════════════════════════════════════════════
            MY QUIZ KEYS TAB
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'keys' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-[#002147]">My Quiz Answer Keys</h2>
                <p className="text-gray-500 text-sm mt-1">View the complete question paper and answer key for every quiz you've created</p>
              </div>
              <button
                onClick={loadMyQuizzes}
                disabled={quizzesLoading}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${quizzesLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {quizzesLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                <p className="text-gray-400 font-medium">Loading your quizzes…</p>
              </div>
            ) : myQuizzes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-4">
                  <FileKey2 className="w-10 h-10 text-indigo-300" />
                </div>
                <h3 className="text-xl font-bold text-gray-600 mb-2">No quizzes yet</h3>
                <p className="text-gray-400 max-w-sm">Quizzes you create will appear here with their full answer keys</p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="mt-6 flex items-center gap-2 px-6 py-3 bg-[#002147] text-white rounded-xl font-bold text-sm hover:bg-[#003366] transition-colors"
                >
                  <Plus className="w-4 h-4" /> Create Your First Quiz
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {myQuizzes.map((quiz: any) => (
                  <div key={quiz.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all overflow-hidden">
                    {/* Quiz card header */}
                    <div className="bg-gradient-to-r from-[#002147] to-[#0a3a7a] px-5 py-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-white font-black text-base leading-tight truncate">{quiz.title || 'Untitled Quiz'}</h3>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full shrink-0 border ${diffColor(quiz.difficulty || 'mixed')}`}>
                          {quiz.difficulty || 'mixed'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {quiz.subject && <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">{quiz.subject}</span>}
                        {quiz.class && <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">Class {quiz.class}</span>}
                      </div>
                    </div>
                    {/* Quiz card body */}
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Target className="w-4 h-4" />
                            <strong className="text-[#002147]">{quiz.questions?.length || 0}</strong> Questions
                          </span>
                          {quiz.dueDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(quiz.dueDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-bold text-gray-400 uppercase">
                          {quiz.generatedBy === 'ai' ? '✦ AI Generated' : '✏ Manual'}
                        </span>
                      </div>

                      {/* Quick answer summary */}
                      <div className="bg-gray-50 rounded-xl p-3 mb-4 max-h-24 overflow-hidden">
                        {(quiz.questions || []).slice(0, 3).map((q: Question, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-gray-600 mb-1">
                            <span className="font-black text-[#002147] shrink-0">Q{i + 1}.</span>
                            <span className="truncate">{q.question}</span>
                            <span className="shrink-0 font-black text-emerald-600 ml-auto">
                              {String.fromCharCode(65 + q.correctAnswerIndex)}
                            </span>
                          </div>
                        ))}
                        {(quiz.questions || []).length > 3 && (
                          <p className="text-xs text-gray-400 mt-1">+ {quiz.questions.length - 3} more questions…</p>
                        )}
                      </div>

                      <button
                        onClick={() => setKeyQuiz(quiz)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#002147] hover:bg-[#003366] text-white rounded-xl font-bold text-sm transition-all"
                      >
                        <KeyRound className="w-4 h-4" />
                        View Full Answer Key
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            CREATE QUIZ TAB — STEP 1: MODE SELECTION
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'create' && step === 'mode' && (
          <div className="space-y-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-black text-[#002147] mb-2">How do you want to create this quiz?</h2>
              <p className="text-gray-500 text-lg">Choose a creation mode that fits your workflow</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Option 1: Full AI */}
              <button
                onClick={() => { setMode('full_ai'); setStep('config'); loadSyllabus(); loadSyllabusModules(); }}
                className="group relative bg-white rounded-3xl border-2 border-transparent hover:border-indigo-300 p-8 text-left shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-violet-50 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform">
                    <BrainCircuit className="w-8 h-8 text-white" />
                  </div>
                  <div className="inline-block px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-black rounded-full uppercase tracking-wider mb-3">Option 1</div>
                  <h3 className="text-2xl font-black text-[#002147] mb-3">Complete AI</h3>
                  <p className="text-gray-500 leading-relaxed">AI reads your syllabus and auto-generates the perfect quiz. Select specific modules to test.</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {['Auto Topics', 'Syllabus-Aware', 'Instant', 'Module Picker'].map(tag => (
                      <span key={tag} className="text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-1 rounded-full">{tag}</span>
                    ))}
                  </div>
                  <div className="mt-6 flex items-center gap-2 text-indigo-600 font-bold text-sm">
                    <span>Select this mode</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>

              {/* Option 2: Semi AI */}
              <button
                onClick={() => { setMode('semi_ai'); setStep('config'); loadSyllabusModules(); }}
                className="group relative bg-white rounded-3xl border-2 border-transparent hover:border-blue-300 p-8 text-left shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-cyan-50 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <div className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-black rounded-full uppercase tracking-wider mb-3">Option 2</div>
                  <h3 className="text-2xl font-black text-[#002147] mb-3">Semi AI</h3>
                  <p className="text-gray-500 leading-relaxed">You choose the modules and topics, AI generates the questions. Best of both worlds.</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {['You Choose Topics', 'AI Questions', 'Module Picker', 'Flexible'].map(tag => (
                      <span key={tag} className="text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-1 rounded-full">{tag}</span>
                    ))}
                  </div>
                  <div className="mt-6 flex items-center gap-2 text-blue-600 font-bold text-sm">
                    <span>Select this mode</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>

              {/* Option 3: Manual */}
              <button
                onClick={() => { setMode('manual'); setStep('config'); }}
                className="group relative bg-white rounded-3xl border-2 border-transparent hover:border-emerald-300 p-8 text-left shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-teal-50 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform">
                    <PenTool className="w-8 h-8 text-white" />
                  </div>
                  <div className="inline-block px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-black rounded-full uppercase tracking-wider mb-3">Option 3</div>
                  <h3 className="text-2xl font-black text-[#002147] mb-3">Completely Manual</h3>
                  <p className="text-gray-500 leading-relaxed">Full control — write every question, option, and answer yourself. Perfect for precise, curriculum-specific assessments.</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {['Full Control', 'Your Questions', 'Custom Options', 'Precise'].map(tag => (
                      <span key={tag} className="text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-1 rounded-full">{tag}</span>
                    ))}
                  </div>
                  <div className="mt-6 flex items-center gap-2 text-emerald-600 font-bold text-sm">
                    <span>Select this mode</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            CREATE QUIZ TAB — STEP 2: CONFIG
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'create' && step === 'config' && (
          <div className="space-y-6">
            {/* Back + Mode badge */}
            <div className="flex items-center gap-3">
              <button onClick={() => setStep('mode')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-[#002147] transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                mode === 'full_ai' ? 'bg-indigo-100 text-indigo-700' :
                mode === 'semi_ai' ? 'bg-blue-100 text-blue-700' :
                'bg-emerald-100 text-emerald-700'
              }`}>
                {mode === 'full_ai' ? '✦ Complete AI' : mode === 'semi_ai' ? '⚡ Semi AI' : '✏ Manual'}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Left: Main Config */}
              <div className="lg:col-span-2 space-y-5">

                {/* Quiz Title */}
                <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
                  <label className="block text-sm font-bold text-[#002147] mb-2">Quiz Title</label>
                  <input
                    value={quizTitle}
                    onChange={e => setQuizTitle(e.target.value)}
                    placeholder={mode === 'full_ai' ? 'AI will generate a title...' : 'e.g. Chapter 5 — Quadratic Equations Quiz'}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>

                {/* ── MODULE PICKER (AI modes) ── */}
                {mode !== 'manual' && (
                  <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-500" />
                        <label className="text-sm font-bold text-[#002147]">Select Modules to Test</label>
                      </div>
                      {syllabusModules.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button onClick={selectAllModules} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
                            Select All
                          </button>
                          <span className="text-gray-300">|</span>
                          <button onClick={deselectAllModules} className="text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors">
                            Clear
                          </button>
                        </div>
                      )}
                    </div>

                    {modulesLoading ? (
                      <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading your syllabus modules…
                      </div>
                    ) : syllabusModules.length === 0 ? (
                      <div className="text-center py-6 bg-gray-50 rounded-xl">
                        <GraduationCap className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-400 font-medium">No modules found in your syllabus</p>
                        <p className="text-xs text-gray-400 mt-1">Add modules in the Curriculum Planner, or type topics below</p>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {syllabusModules.map(m => {
                          const isSelected = selectedModuleIds.includes(m.id);
                          return (
                            <button
                              key={m.id}
                              onClick={() => toggleModule(m.id)}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100'
                                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                              }`}
                            >
                              {isSelected
                                ? <CheckSquare className="w-3.5 h-3.5" />
                                : <Square className="w-3.5 h-3.5" />
                              }
                              {m.topic}
                              {m.month && (
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                  {m.month}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedModuleIds.length > 0 && (
                      <p className="text-xs text-indigo-600 font-bold mt-3">
                        ✦ {selectedModuleIds.length} module{selectedModuleIds.length > 1 ? 's' : ''} selected — AI will focus questions on these topics
                      </p>
                    )}
                  </div>
                )}

                {/* ── CUSTOM TOPICS INPUT (all AI modes + manual for custom topics) ── */}
                {mode !== 'manual' && (
                  <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
                    <label className="block text-sm font-bold text-[#002147] mb-1">
                      {mode === 'semi_ai' ? 'Topics to Cover' : 'Additional Topics'}
                      {mode === 'semi_ai' && <span className="text-rose-500 ml-1">*</span>}
                    </label>
                    <p className="text-xs text-gray-400 mb-3">
                      Type any specific topics you want covered. Press Enter or click Add. These combine with selected modules above.
                    </p>
                    <div className="flex gap-2 mb-3">
                      <input
                        value={topicsInput}
                        onChange={e => setTopicsInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddTopic()}
                        placeholder="e.g. Quadratic Equations, Newton's Laws, Photosynthesis…"
                        className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                      <button
                        onClick={handleAddTopic}
                        className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> Add
                      </button>
                    </div>
                    {topics.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {topics.map(t => (
                          <span key={t} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1.5 rounded-full text-sm font-bold">
                            {t}
                            <button onClick={() => handleRemoveTopic(t)} className="text-blue-400 hover:text-blue-700 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Full AI — Syllabus Preview */}
                {mode === 'full_ai' && (
                  <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-indigo-500" />
                        <label className="text-sm font-bold text-[#002147]">Syllabus Context</label>
                      </div>
                      <button onClick={loadSyllabus} className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:text-indigo-800">
                        <RefreshCw className="w-3 h-3" /> Refresh
                      </button>
                    </div>
                    {syllabusLoading ? (
                      <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading syllabus...
                      </div>
                    ) : (
                      <div className="bg-indigo-50 rounded-xl p-4 text-sm text-indigo-800 font-medium leading-relaxed max-h-32 overflow-y-auto">
                        {syllabusData || 'No syllabus entries yet. AI will generate questions based on subject and class level.'}
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-2">AI will use these topics to generate the most relevant questions.</p>
                  </div>
                )}

                {/* Manual Mode: Question Editor */}
                {mode === 'manual' && (
                  <div className="space-y-4">
                    {manualQ.map((q, qIdx) => (
                      <div key={qIdx} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                          <span className="w-8 h-8 bg-[#002147] text-white rounded-xl flex items-center justify-center font-black text-sm">{qIdx + 1}</span>
                          {manualQ.length > 1 && (
                            <button
                              onClick={() => setManualQ(prev => prev.filter((_, i) => i !== qIdx))}
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <input
                          value={q.question}
                          onChange={e => updateManualQ(qIdx, 'question', e.target.value)}
                          placeholder="Enter your question here…"
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 mb-4 transition-all"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                          {q.options.map((opt, optIdx) => (
                            <div key={optIdx} className={`flex items-center gap-2 rounded-xl border p-1.5 transition-all ${optIdx === q.correctAnswerIndex ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}>
                              <button
                                onClick={() => updateManualQ(qIdx, 'correctAnswerIndex', optIdx)}
                                className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center font-black text-xs shrink-0 transition-all ${
                                  optIdx === q.correctAnswerIndex
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'border-gray-300 text-gray-400 hover:border-emerald-400'
                                }`}
                              >
                                {optIdx === q.correctAnswerIndex ? <Check className="w-3.5 h-3.5" /> : String.fromCharCode(65 + optIdx)}
                              </button>
                              <input
                                value={opt}
                                onChange={e => updateManualOption(qIdx, optIdx, e.target.value)}
                                placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                                className="flex-1 bg-transparent border-0 outline-none text-sm font-medium text-[#002147] placeholder-gray-300"
                              />
                            </div>
                          ))}
                        </div>
                        <input
                          value={q.explanation || ''}
                          onChange={e => updateManualQ(qIdx, 'explanation', e.target.value)}
                          placeholder="Explanation (optional) — shown in answer key"
                          className="w-full border border-gray-200 rounded-xl px-4 py-2 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all"
                        />
                      </div>
                    ))}
                    <button
                      onClick={() => setManualQ(prev => [...prev, { question: '', options: ['', '', '', ''], correctAnswerIndex: 0, explanation: '' }])}
                      className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 hover:border-indigo-400 hover:text-indigo-600 font-bold transition-all"
                    >
                      <Plus className="w-4 h-4" /> Add Question
                    </button>
                  </div>
                )}
              </div>

              {/* Right: Settings Panel */}
              <div className="space-y-5">

                {/* Subject */}
                {(() => {
                  const selectedClass0 = selectedClasses[0] || '';
                  const teacherSubjects = [...new Set(
                    (profile.assignments || [])
                      .filter((a: any) => !selectedClass0 || a.class === selectedClass0)
                      .map((a: any) => a.subject)
                      .filter(Boolean)
                  )] as string[];
                  return (
                    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
                      <label className="block text-sm font-bold text-[#002147] mb-2">Subject</label>
                      {teacherSubjects.length > 0 ? (
                        <select
                          value={subject}
                          onChange={e => setSubject(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                        >
                          {teacherSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <input
                          value={subject}
                          onChange={e => setSubject(e.target.value)}
                          placeholder="e.g. Mathematics"
                          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        />
                      )}
                    </div>
                  );
                })()}

                {/* Due Date */}
                <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
                  <label className="block text-sm font-bold text-[#002147] mb-2">Due Date <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>

                {/* Classes */}
                {availableClasses.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
                    <label className="block text-sm font-bold text-[#002147] mb-3">Assign to Classes</label>
                    <div className="space-y-2">
                      {availableClasses.map(cls => (
                        <label key={cls} className="flex items-center gap-3 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={selectedClasses.includes(cls)}
                            onChange={() => setSelectedClasses(prev => prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls])}
                            className="w-4 h-4 accent-indigo-600"
                          />
                          <span className="text-sm font-medium text-gray-700 group-hover:text-[#002147] transition-colors">{cls}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Difficulty (AI modes only) */}
                {mode !== 'manual' && (
                  <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
                    <label className="block text-sm font-bold text-[#002147] mb-3">Difficulty</label>
                    <div className="space-y-2">
                      {DIFFICULTIES.map(d => (
                        <button
                          key={d.value}
                          onClick={() => setDifficulty(d.value)}
                          className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                            difficulty === d.value
                              ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="shrink-0 mt-0.5">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${difficulty === d.value ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'}`}>
                              {difficulty === d.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#002147]">{d.label}</p>
                            <p className="text-xs text-gray-400">{d.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Number of Questions (AI modes only) */}
                {mode !== 'manual' && (
                  <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
                    <label className="block text-sm font-bold text-[#002147] mb-3">Number of Questions</label>
                    <div className="flex flex-wrap gap-2">
                      {Q_COUNTS.map(n => (
                        <button
                          key={n}
                          onClick={() => setNumQ(n)}
                          className={`w-12 h-12 rounded-xl font-black text-sm transition-all ${numQ === n ? 'bg-[#002147] text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Generate button */}
                {mode !== 'manual' && (
                  <button
                    onClick={handleGenerate}
                    disabled={generating || (mode === 'semi_ai' && topics.length === 0 && selectedModuleIds.length === 0)}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl font-black text-base shadow-lg hover:shadow-xl hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50"
                  >
                    {generating ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Generating with AI…</>
                    ) : (
                      <><BrainCircuit className="w-5 h-5" /> Generate Quiz</>
                    )}
                  </button>
                )}
                {mode === 'manual' && (
                  <button
                    onClick={() => setStep('preview')}
                    disabled={manualQ.filter(q => q.question.trim()).length === 0}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-[#002147] text-white rounded-2xl font-black text-base shadow-lg hover:bg-[#003366] transition-all disabled:opacity-50"
                  >
                    Preview Quiz <ChevronRight className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            CREATE QUIZ TAB — STEP 3: PREVIEW
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'create' && step === 'preview' && (
          <div className="space-y-5">
            {/* Nav */}
            <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-200/60 shadow-sm px-5 py-4">
              <button onClick={() => setStep('config')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-[#002147] transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back to Setup
              </button>
              <div className="flex items-center gap-3">
                {/* View Answer Key while previewing */}
                <button
                  onClick={() => setKeyQuiz({
                    title: quizTitle || 'Untitled Quiz',
                    subject,
                    difficulty,
                    dueDate,
                    classes: selectedClasses,
                    questions: mode === 'manual' ? manualQ.filter(q => q.question.trim()) : questions,
                  })}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl font-bold text-sm hover:bg-amber-100 transition-colors"
                >
                  <KeyRound className="w-4 h-4" />
                  View Answer Key
                </button>
                {mode !== 'manual' && (
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#002147] rounded-xl font-bold text-sm transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
                    Regenerate
                  </button>
                )}
                <button
                  onClick={handlePostQuiz}
                  disabled={posting || !dueDate}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#002147] hover:bg-[#003366] text-white rounded-xl font-bold text-sm shadow-md transition-all disabled:opacity-50"
                >
                  {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {posting ? 'Posting…' : `Post to ${selectedClasses.join(', ') || 'Class'}`}
                </button>
              </div>
            </div>

            {/* Quiz summary banner */}
            <div className="bg-gradient-to-r from-[#002147] to-[#003b80] rounded-2xl p-6 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-blue-200 text-xs font-bold uppercase tracking-wider mb-1">
                    {mode === 'full_ai' ? '✦ Complete AI Generated' : mode === 'semi_ai' ? '⚡ Semi AI Generated' : '✏ Manually Created'} · {subject}
                  </p>
                  <h2 className="text-2xl font-black mb-1">{quizTitle || 'Untitled Quiz'}</h2>
                  <p className="text-blue-200 text-sm">
                    {(mode === 'manual' ? manualQ.filter(q => q.question.trim()) : questions).length} questions · {difficulty} difficulty · Due {dueDate || 'Not set'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedClasses.map(c => (
                    <span key={c} className="bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full">{c}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Questions list */}
            <div className="space-y-4">
              {(mode === 'manual' ? manualQ.filter(q => q.question.trim()) : questions).map((q, idx) => (
                <div key={idx} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-[#002147] text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">{idx + 1}</div>
                      <p className="font-bold text-[#002147] text-base leading-relaxed">{q.question}</p>
                    </div>
                    {q.difficulty && (
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 ${diffColor(q.difficulty as Difficulty)}`}>
                        {q.difficulty}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 ml-11">
                    {q.options.map((opt, optIdx) => (
                      <div
                        key={optIdx}
                        className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${optIdx === q.correctAnswerIndex ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-gray-50 border-gray-200 text-gray-700'}`}
                      >
                        <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-black shrink-0 ${optIdx === q.correctAnswerIndex ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 text-gray-400'}`}>
                          {optIdx === q.correctAnswerIndex ? <Check className="w-3 h-3" /> : String.fromCharCode(65 + optIdx)}
                        </span>
                        {opt}
                      </div>
                    ))}
                  </div>
                  {q.explanation && (
                    <div className="ml-11 mt-3 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
                      <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 font-medium">{q.explanation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Bottom post button */}
            <div className="flex justify-end pb-8">
              <button
                onClick={handlePostQuiz}
                disabled={posting || !dueDate}
                className="flex items-center gap-2 px-8 py-4 bg-[#002147] hover:bg-[#003366] text-white rounded-2xl font-black text-lg shadow-xl transition-all disabled:opacity-50"
              >
                {posting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {posting ? 'Posting Quiz…' : 'Post Quiz to Students'}
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            CREATE QUIZ TAB — STEP 4: SUCCESS
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'create' && step === 'post' && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-28 h-28 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mb-8 shadow-2xl shadow-emerald-200 animate-in zoom-in duration-500">
              <CheckCircle2 className="w-14 h-14 text-white" />
            </div>
            <h2 className="text-4xl font-black text-[#002147] mb-3">Quiz Posted! 🎉</h2>
            <p className="text-gray-500 text-xl mb-2">
              <span className="font-bold text-[#002147]">{quizTitle}</span> has been sent to
            </p>
            <div className="flex gap-2 mb-8">
              {selectedClasses.map(c => (
                <span key={c} className="bg-indigo-100 text-indigo-700 font-bold px-4 py-2 rounded-full">{c}</span>
              ))}
            </div>
            <p className="text-gray-400 mb-10">
              {(mode === 'manual' ? manualQ.filter(q => q.question.trim()) : questions).length} questions · {difficulty} · Due {dueDate}
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              {/* View Answer Key of just-posted quiz */}
              <button
                onClick={() => setKeyQuiz(currentQuiz)}
                className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-2xl shadow-lg transition-colors"
              >
                <KeyRound className="w-5 h-5" />
                View Answer Key
              </button>
              <button
                onClick={() => { setStep('mode'); setMode(null); setQuestions([]); setManualQ([{ question: '', options: ['', '', '', ''], correctAnswerIndex: 0, explanation: '' }]); setPosted(false); setTopics([]); setQuizTitle(''); setDueDate(''); setSelectedModuleIds([]); }}
                className="px-8 py-3 bg-[#002147] text-white font-black rounded-2xl hover:bg-[#003366] transition-colors shadow-lg"
              >
                Create Another Quiz
              </button>
              <Link href="/teacher" className="px-8 py-3 bg-white border border-gray-200 text-[#002147] font-black rounded-2xl hover:bg-gray-50 transition-colors">
                Back to Dashboard
              </Link>
            </div>
          </div>
        )}

      </div>

      {/* Answer Key Modal (global, shows for both tabs) */}
      {answerKeyModal}
    </div>
  );
}
