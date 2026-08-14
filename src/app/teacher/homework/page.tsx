'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Sparkles, Loader2, Send, BookOpen, CheckCircle,
  ChevronDown, Plus, Trash2, FileText, Tag, Flame
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';

interface HomeworkQuestion {
  question: string;
  type: 'short' | 'long' | 'mcq';
  marks: number;
  answer?: string;
}

interface SyllabusTopicNode {
  id: string;
  topic: string;
  tags: string[];
  examWeightage: number;
  toughnessLevel: 'easy' | 'medium' | 'hard';
  weightageScore: number;
}

interface SyllabusChapterNode {
  chapterName: string;
  topics: SyllabusTopicNode[];
}

export default function TeacherHomeworkPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');

  // Dynamic Syllabus Dropdowns
  const [chapters, setChapters] = useState<SyllabusChapterNode[]>([]);
  const [selectedChapter, setSelectedChapter] = useState('');
  const [availableTopics, setAvailableTopics] = useState<SyllabusTopicNode[]>([]);

  const [topic, setTopic] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [weightageScore, setWeightageScore] = useState<number>(7.0);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [numQuestions, setNumQuestions] = useState(5);
  const [questionType, setQuestionType] = useState<'mixed' | 'short' | 'long' | 'mcq'>('mixed');
  const [dueDate, setDueDate] = useState('');

  const [questions, setQuestions] = useState<HomeworkQuestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  // Derive teacher's assigned classes and subjects
  const assignedClasses = [...new Set(
    (profile?.assignments as any[] || []).map((a: any) => a.class).filter(Boolean)
  )];
  const assignedSubjects = [...new Set(
    (profile?.assignments as any[] || [])
      .filter((a: any) => !selectedClass || a.class === selectedClass)
      .map((a: any) => a.subject)
      .filter(Boolean)
  )];

  // Auto-select first class/subject if only one
  useEffect(() => {
    if (assignedClasses.length === 1 && !selectedClass) setSelectedClass(assignedClasses[0]);
    if (assignedSubjects.length === 1 && !selectedSubject) setSelectedSubject(assignedSubjects[0]);
  }, [profile?.assignments]);

  // Fetch Syllabus Tree when Class or Subject changes
  useEffect(() => {
    if (!selectedClass || !selectedSubject) {
      setChapters([]);
      setSelectedChapter('');
      setAvailableTopics([]);
      return;
    }

    const fetchSyllabusTree = async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch(
          `/api/teacher/syllabus-tree?schoolId=${profile?.schoolId || 'all'}&class=${encodeURIComponent(selectedClass)}&subject=${encodeURIComponent(selectedSubject)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        const data = await res.json();
        if (data.success && Array.isArray(data.chapters)) {
          setChapters(data.chapters);
          if (data.chapters.length > 0) {
            setSelectedChapter(data.chapters[0].chapterName);
            setAvailableTopics(data.chapters[0].topics || []);
          }
        }
      } catch (err) {
        console.error('[HomeworkGen] Syllabus tree load error:', err);
      }
    };

    fetchSyllabusTree();
  }, [selectedClass, selectedSubject, profile?.schoolId]);

  // Update Available Topics when Chapter changes
  useEffect(() => {
    if (!selectedChapter) {
      setAvailableTopics([]);
      return;
    }
    const found = chapters.find(c => c.chapterName === selectedChapter);
    if (found) {
      setAvailableTopics(found.topics);
      if (found.topics.length > 0) {
        const tNode = found.topics[0];
        setTopic(tNode.topic);
        setSelectedTags(tNode.tags || []);
        setDifficulty(tNode.toughnessLevel || 'medium');
        setWeightageScore(tNode.weightageScore || 7.0);
      }
    }
  }, [selectedChapter, chapters]);

  // Handle Topic Selection from dropdown
  const handleSelectTopicNode = (topicName: string) => {
    setTopic(topicName);
    const node = availableTopics.find(t => t.topic === topicName);
    if (node) {
      setSelectedTags(node.tags || []);
      setDifficulty(node.toughnessLevel || 'medium');
      setWeightageScore(node.weightageScore || 7.0);
    }
  };

  // Set default due date to 3 days from now
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    setDueDate(d.toISOString().split('T')[0]);
  }, []);

  const handleGenerate = async () => {
    if (!topic.trim()) return alert('Please enter or select a topic');
    if (!selectedClass) return alert('Please select a class');
    if (!selectedSubject) return alert('Please select a subject');

    setIsGenerating(true);
    setError('');
    setPosted(false);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/teacher/homework-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          topic,
          subject: selectedSubject,
          studentClass: selectedClass,
          difficulty,
          numQuestions,
          questionType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      if (data.questions && Array.isArray(data.questions)) {
        setQuestions(data.questions);
      } else {
        throw new Error('Unexpected AI response format');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!profile?.schoolId || questions.length === 0) return;
    setIsPosting(true);
    setError('');
    try {
      const token = await getAuthToken();
      const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 0), 0);
      const res = await fetch('/api/teacher/post-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          schoolId: profile.schoolId,
          teacherId: profile.uid,
          teacherName: profile.name || 'Teacher',
          title: `Homework: ${topic}`,
          description: `AI-generated homework on ${topic} for ${selectedSubject}.`,
          type: 'homework',
          subject: selectedSubject,
          class: selectedClass,
          chapter: selectedChapter,
          topic: topic,
          tags: selectedTags,
          weightageScore,
          dueDate,
          totalMarks,
          questions: questions.map((q, i) => ({
            id: `hw_${i + 1}`,
            questionText: q.question,
            type: q.type,
            marks: q.marks,
            modelAnswer: q.answer || '',
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to publish');
      setPosted(true);
      setTimeout(() => router.push('/teacher'), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsPosting(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Link href="/teacher" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147] shadow-sm">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-[#002147]">AI Homework Generator</h1>
          <p className="text-gray-500 text-sm mt-1">Generate meaningful homework assignments with AI — instantly</p>
        </div>
      </div>

      {/* Config Form */}
      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
        <h2 className="text-lg font-bold text-[#002147] flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-500" /> Homework Configuration
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Class */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Class</label>
            <select
              value={selectedClass}
              onChange={e => { setSelectedClass(e.target.value); setSelectedSubject(''); }}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            >
              <option value="">— Select class —</option>
              {assignedClasses.map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Subject</label>
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              disabled={!selectedClass}
            >
              <option value="">— Select subject —</option>
              {assignedSubjects.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>

          {/* Dynamic Chapter Dropdown */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Chapter / Unit</label>
            <select
              value={selectedChapter}
              onChange={e => setSelectedChapter(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              disabled={!selectedSubject || chapters.length === 0}
            >
              {chapters.length === 0 ? (
                <option value="">— No chapters found for this subject —</option>
              ) : (
                chapters.map(c => (
                  <option key={c.chapterName} value={c.chapterName}>{c.chapterName}</option>
                ))
              )}
            </select>
          </div>

          {/* Dynamic Topic Dropdown */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Topic</label>
            {availableTopics.length > 0 ? (
              <select
                value={topic}
                onChange={e => handleSelectTopicNode(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              >
                {availableTopics.map(t => (
                  <option key={t.id || t.topic} value={t.topic}>
                    {t.topic} ({t.toughnessLevel.toUpperCase()} · Weight: {t.weightageScore})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. Quadratic Equations, Photosynthesis..."
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            )}
          </div>

          {/* Tags & Weightage Info Pill */}
          {selectedTags.length > 0 && (
            <div className="md:col-span-2 bg-indigo-50/70 border border-indigo-100 p-3 rounded-2xl flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-indigo-900 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-indigo-600" /> Topic Tags:
              </span>
              {selectedTags.map(tag => (
                <span key={tag} className="px-2 py-0.5 bg-white text-indigo-700 border border-indigo-200 text-xs font-semibold rounded-lg shadow-2xs">
                  #{tag}
                </span>
              ))}
              <span className="ml-auto text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-600" /> TML Weightage: {weightageScore}
              </span>
            </div>
          )}

          {/* Question Type */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Question Type</label>
            <select
              value={questionType}
              onChange={e => setQuestionType(e.target.value as any)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            >
              <option value="mixed">Mixed (Short + Long)</option>
              <option value="short">Short Answer (SAQ)</option>
              <option value="long">Long Answer (LAQ)</option>
              <option value="mcq">Multiple Choice (MCQ)</option>
            </select>
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Difficulty Level</label>
            <select
              value={difficulty}
              onChange={e => setDifficulty(e.target.value as any)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium (Standard)</option>
              <option value="hard">Hard / Advanced</option>
            </select>
          </div>

          {/* Num Questions */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Number of Questions</label>
            <select
              value={numQuestions}
              onChange={e => setNumQuestions(Number(e.target.value))}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            >
              {[3, 5, 8, 10].map(n => (
                <option key={n} value={n}>{n} Questions</option>
              ))}
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl font-medium">
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-2xl font-bold transition-all shadow-md flex items-center justify-center space-x-2 disabled:opacity-60"
        >
          <Sparkles className="w-5 h-5" />
          <span>{isGenerating ? 'Generating Homework...' : 'Generate Homework with AI'}</span>
          {isGenerating && <Loader2 className="w-4 h-4 animate-spin" />}
        </button>
      </div>

      {/* Generated Questions Section */}
      {questions.length > 0 && (
        <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-[#002147]">
              Generated Questions ({questions.length})
            </h2>
            <span className="text-xs font-bold px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
              Total Marks: {questions.reduce((sum, q) => sum + (q.marks || 0), 0)}
            </span>
          </div>

          <div className="space-y-4">
            {questions.map((q, idx) => (
              <div key={idx} className="p-5 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <span className="font-extrabold text-sm text-[#002147]">Q{idx + 1}.</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{q.question}</p>
                    {q.answer && (
                      <p className="text-xs text-gray-500 mt-2 bg-white p-3 rounded-xl border border-gray-200">
                        <strong className="text-indigo-600">Model Answer:</strong> {q.answer}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 bg-white text-gray-600 border border-gray-200 rounded-lg">
                    {q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {posted ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl font-bold text-center flex items-center justify-center space-x-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <span>Homework Published Successfully! Redirecting...</span>
            </div>
          ) : (
            <button
              onClick={handlePublish}
              disabled={isPosting}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold transition-all shadow-md flex items-center justify-center space-x-2 disabled:opacity-60"
            >
              <Send className="w-5 h-5" />
              <span>{isPosting ? 'Publishing Assignment...' : 'Publish to Class Roster'}</span>
              {isPosting && <Loader2 className="w-4 h-4 animate-spin" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
