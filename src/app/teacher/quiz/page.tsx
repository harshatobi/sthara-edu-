'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Sparkles, BrainCircuit, PenTool, ChevronRight,
  ChevronLeft, Loader2, Plus, Trash2, CheckCircle2, Send,
  BookOpen, Zap, Target, BarChart2, RefreshCw, Eye, Edit3,
  ClipboardList, X, Check
} from 'lucide-react';
import Link from 'next/link';
import { db } from '@/lib/firebase/config';
import {
  collection, query, where, getDocs, addDoc, serverTimestamp
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

type Mode = null | 'full_ai' | 'semi_ai' | 'manual';
type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';
type Step = 'mode' | 'config' | 'preview' | 'post';

interface Question {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
  difficulty?: string;
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

  // Manual mode state
  const [manualQ, setManualQ] = useState<Question[]>([
    { question: '', options: ['', '', '', ''], correctAnswerIndex: 0, explanation: '' }
  ]);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) router.push('/login');
  }, [profile, loading, router]);

  // Load available classes and subject
  useEffect(() => {
    if (!profile?.schoolId) return;
    const loadClasses = async () => {
      try {
        const [usSnap, guSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('schoolId', '==', profile.schoolId), where('role', '==', 'student'))),
          getDocs(query(collection(db, 'global_users'), where('schoolId', '==', profile.schoolId), where('role', '==', 'student'))),
        ]);
        const classSet = new Set<string>();
        [...usSnap.docs, ...guSnap.docs].forEach(d => { const c = d.data().studentClass; if (c) classSet.add(c); });
        const teacherClasses = [
          ...(profile.assignments?.map((a: any) => a.class).filter(Boolean) ?? []),
          ...(profile.teacherClass ? [profile.teacherClass] : []),
        ];
        const unique = [...new Set(teacherClasses)];
        const classes = unique.length > 0 ? unique : Array.from(classSet).sort();
        setAvailableClasses(classes);
        if (classes.length > 0) setSelectedClasses([classes[0]]);
        // Infer subject from teacher assignments
        if (profile.assignments?.[0]?.subject) setSubject(profile.assignments[0].subject);
        else if (profile.teacherSubject) setSubject(profile.teacherSubject);
      } catch (e) { console.error(e); }
    };
    loadClasses();
  }, [profile]);

  // Load syllabus for full AI mode
  const loadSyllabus = async () => {
    if (!profile?.schoolId) return;
    setSyllabusLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'schools', profile.schoolId, 'syllabus'),
        where('teacherId', '==', profile.uid)
      ));
      const items: string[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.topic) items.push(`${data.topic} (${data.subject || ''}, ${data.month || ''})`);
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

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/teacher/quiz-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode,
          topics: mode === 'full_ai' ? [] : topics,
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

  const handlePostQuiz = async () => {
    if (!profile?.schoolId) return;
    if (!dueDate) { alert('Please set a due date first.'); return; }
    if (!quizTitle.trim()) { alert('Please set a quiz title.'); return; }

    // Auto-select first class if teacher hasn't checked any
    const classesToPost = selectedClasses.length > 0 ? selectedClasses : availableClasses.slice(0, 1);
    if (classesToPost.length === 0) { alert('No classes found. Please ensure students are enrolled in your school.'); return; }
    if (selectedClasses.length === 0) setSelectedClasses(classesToPost);

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
        })
      ));
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

  const diffColor = (d: Difficulty) => {
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

          {/* Breadcrumb Steps */}
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
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">

        {/* ═══ STEP 1: MODE SELECTION ═══════════════════════════════════════════ */}
        {step === 'mode' && (
          <div className="space-y-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-black text-[#002147] mb-2">How do you want to create this quiz?</h2>
              <p className="text-gray-500 text-lg">Choose a creation mode that fits your workflow</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Option 1: Full AI */}
              <button
                onClick={() => { setMode('full_ai'); setStep('config'); loadSyllabus(); }}
                className="group relative bg-white rounded-3xl border-2 border-transparent hover:border-indigo-300 p-8 text-left shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-purple-50 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <div className="inline-block px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-black rounded-full uppercase tracking-wider mb-3">Option 1</div>
                  <h3 className="text-2xl font-black text-[#002147] mb-3">Complete AI</h3>
                  <p className="text-gray-500 leading-relaxed">AI analyses your completed syllabus topics and submitted homework to auto-generate a perfectly relevant quiz — zero effort needed.</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {['Reads Syllabus', 'Analyses Homework', 'Auto Topics', 'Instant'].map(tag => (
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
                onClick={() => { setMode('semi_ai'); setStep('config'); }}
                className="group relative bg-white rounded-3xl border-2 border-transparent hover:border-blue-300 p-8 text-left shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-cyan-50 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform">
                    <BrainCircuit className="w-8 h-8 text-white" />
                  </div>
                  <div className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-black rounded-full uppercase tracking-wider mb-3">Option 2</div>
                  <h3 className="text-2xl font-black text-[#002147] mb-3">Semi AI</h3>
                  <p className="text-gray-500 leading-relaxed">You provide the topics, the AI handles the rest — question writing, options, correct answers, and explanations all generated instantly.</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {['You Pick Topics', 'AI Writes Questions', 'Fast', 'Customizable'].map(tag => (
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

        {/* ═══ STEP 2: CONFIG ══════════════════════════════════════════════════ */}
        {step === 'config' && (
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

                {/* Topics — Semi AI only */}
                {mode === 'semi_ai' && (
                  <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
                    <label className="block text-sm font-bold text-[#002147] mb-2">Topics <span className="text-rose-500">*</span></label>
                    <p className="text-xs text-gray-400 mb-3">Add the topics you want the quiz to cover. Press Enter or click Add.</p>
                    <div className="flex gap-2 mb-3">
                      <input
                        value={topicsInput}
                        onChange={e => setTopicsInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddTopic()}
                        placeholder="e.g. Quadratic Equations, Linear Algebra..."
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
                  <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6 space-y-5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-[#002147]">Questions</h3>
                      <button
                        onClick={() => setManualQ([...manualQ, { question: '', options: ['', '', '', ''], correctAnswerIndex: 0, explanation: '' }])}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Add Question
                      </button>
                    </div>

                    {manualQ.map((q, qIdx) => (
                      <div key={qIdx} className="border border-gray-200 rounded-2xl p-5 space-y-4 relative">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Question {qIdx + 1}</span>
                          {manualQ.length > 1 && (
                            <button onClick={() => setManualQ(manualQ.filter((_, i) => i !== qIdx))} className="text-rose-400 hover:text-rose-600 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <textarea
                          value={q.question}
                          onChange={e => updateManualQ(qIdx, 'question', e.target.value)}
                          placeholder="Type your question here..."
                          rows={2}
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none transition-all"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {q.options.map((opt, optIdx) => (
                            <div key={optIdx} className={`flex items-center gap-2 border rounded-xl px-3 py-2 transition-colors ${q.correctAnswerIndex === optIdx ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
                              <button
                                onClick={() => updateManualQ(qIdx, 'correctAnswerIndex', optIdx)}
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${q.correctAnswerIndex === optIdx ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'}`}
                              >
                                {q.correctAnswerIndex === optIdx && <Check className="w-3 h-3 text-white" />}
                              </button>
                              <span className="text-xs font-black text-gray-400 shrink-0">{String.fromCharCode(65 + optIdx)}</span>
                              <input
                                value={opt}
                                onChange={e => updateManualOption(qIdx, optIdx, e.target.value)}
                                placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                                className="flex-1 text-sm text-[#002147] font-medium bg-transparent outline-none"
                              />
                            </div>
                          ))}
                        </div>
                        <input
                          value={q.explanation || ''}
                          onChange={e => updateManualQ(qIdx, 'explanation', e.target.value)}
                          placeholder="Explanation (optional) — shown to students after submission"
                          className="w-full border border-gray-100 rounded-xl px-4 py-2.5 text-xs text-gray-500 bg-gray-50 focus:outline-none focus:border-gray-300 transition-all"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Settings Panel */}
              <div className="space-y-5">
                {/* Subject */}
                <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
                  <label className="block text-sm font-bold text-[#002147] mb-2">Subject</label>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="e.g. Mathematics"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>

                {/* Number of Questions (AI modes only) */}
                {mode !== 'manual' && (
                  <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
                    <label className="block text-sm font-bold text-[#002147] mb-3">Number of Questions</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {Q_COUNTS.map(n => (
                        <button
                          key={n}
                          onClick={() => setNumQ(n)}
                          className={`py-2 rounded-xl text-sm font-black transition-all border ${numQ === n ? 'bg-[#002147] text-white border-[#002147] shadow-md' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Difficulty */}
                <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
                  <label className="block text-sm font-bold text-[#002147] mb-3">Difficulty Level</label>
                  <div className="space-y-2">
                    {DIFFICULTIES.map(d => (
                      <button
                        key={d.value}
                        onClick={() => setDifficulty(d.value)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${difficulty === d.value ? `border-${d.color}-300 bg-${d.color}-50` : 'border-gray-200 bg-white hover:border-gray-300'}`}
                      >
                        <div>
                          <p className={`font-bold text-sm ${difficulty === d.value ? `text-${d.color}-700` : 'text-[#002147]'}`}>{d.label}</p>
                          <p className="text-xs text-gray-400">{d.desc}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${difficulty === d.value ? `border-${d.color}-500 bg-${d.color}-500` : 'border-gray-300'}`}>
                          {difficulty === d.value && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Classes */}
                <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
                  <label className="block text-sm font-bold text-[#002147] mb-3">Post to Class</label>
                  <div className="space-y-2">
                    {availableClasses.map(cls => (
                      <button
                        key={cls}
                        onClick={() => setSelectedClasses(prev =>
                          prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls]
                        )}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-bold transition-all ${selectedClasses.includes(cls) ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-[#002147] hover:border-gray-300'}`}
                      >
                        <span>{cls}</span>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${selectedClasses.includes(cls) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                          {selectedClasses.includes(cls) && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </button>
                    ))}
                    {availableClasses.length === 0 && (
                      <p className="text-sm text-gray-400 italic">No classes found. Make sure students are enrolled.</p>
                    )}
                  </div>
                </div>

                {/* Due Date */}
                <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
                  <label className="block text-sm font-bold text-[#002147] mb-2">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>

                {/* Action Button */}
                {mode === 'manual' ? (
                  <button
                    onClick={() => { setStep('preview'); }}
                    disabled={manualQ.filter(q => q.question.trim()).length === 0}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-lg shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Eye className="w-5 h-5" /> Preview Quiz
                  </button>
                ) : (
                  <button
                    onClick={handleGenerate}
                    disabled={generating || (mode === 'semi_ai' && topics.length === 0)}
                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl font-black text-lg shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {generating ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Generating Quiz…</>
                    ) : (
                      <><Sparkles className="w-5 h-5" /> Generate Quiz</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 3: PREVIEW ════════════════════════════════════════════════ */}
        {step === 'preview' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <button onClick={() => setStep('config')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-[#002147] transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back to Setup
              </button>
              <div className="flex items-center gap-3">
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

        {/* ═══ STEP 4: SUCCESS ════════════════════════════════════════════════ */}
        {step === 'post' && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
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
            <div className="flex gap-4">
              <button
                onClick={() => { setStep('mode'); setMode(null); setQuestions([]); setManualQ([{ question: '', options: ['', '', '', ''], correctAnswerIndex: 0, explanation: '' }]); setPosted(false); setTopics([]); setQuizTitle(''); setDueDate(''); }}
                className="px-8 py-4 bg-[#002147] text-white font-black rounded-2xl hover:bg-[#003366] transition-colors shadow-lg"
              >
                Create Another Quiz
              </button>
              <Link href="/teacher" className="px-8 py-4 bg-white border border-gray-200 text-[#002147] font-black rounded-2xl hover:bg-gray-50 transition-colors">
                Back to Dashboard
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
