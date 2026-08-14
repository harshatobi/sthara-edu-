'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Sparkles, BrainCircuit, Loader2, Plus, Trash2, Send,
  BookOpen, Target, RefreshCw, Tag, Flame
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';

type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';

interface Question {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
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

export default function TeacherQuizPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [targetClass, setTargetClass] = useState('');

  // Dynamic Syllabus Dropdowns
  const [chapters, setChapters] = useState<SyllabusChapterNode[]>([]);
  const [selectedChapter, setSelectedChapter] = useState('');
  const [availableTopics, setAvailableTopics] = useState<SyllabusTopicNode[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [weightageScore, setWeightageScore] = useState<number>(7.0);

  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [numQuestions, setNumQuestions] = useState(5);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  // Derive teacher assigned classes
  const assignedClasses = [...new Set(
    (profile?.assignments as any[] || []).map((a: any) => a.class).filter(Boolean)
  )];
  const assignedSubjects = [...new Set(
    (profile?.assignments as any[] || [])
      .filter((a: any) => !targetClass || a.class === targetClass)
      .map((a: any) => a.subject)
      .filter(Boolean)
  )];

  useEffect(() => {
    if (assignedClasses.length === 1 && !targetClass) setTargetClass(assignedClasses[0]);
    if (assignedSubjects.length === 1 && !subject) setSubject(assignedSubjects[0]);
  }, [profile?.assignments]);

  // Fetch Syllabus Tree when Class or Subject changes
  useEffect(() => {
    if (!targetClass || !subject) {
      setChapters([]);
      setSelectedChapter('');
      setAvailableTopics([]);
      return;
    }

    const fetchSyllabusTree = async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch(
          `/api/teacher/syllabus-tree?schoolId=${profile?.schoolId || 'all'}&class=${encodeURIComponent(targetClass)}&subject=${encodeURIComponent(subject)}`,
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
        console.error('[QuizPage] Syllabus tree load error:', err);
      }
    };

    fetchSyllabusTree();
  }, [targetClass, subject, profile?.schoolId]);

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
        setWeightageScore(tNode.weightageScore || 7.0);
      }
    }
  }, [selectedChapter, chapters]);

  const handleSelectTopicNode = (topicName: string) => {
    setTopic(topicName);
    const node = availableTopics.find(t => t.topic === topicName);
    if (node) {
      setSelectedTags(node.tags || []);
      setWeightageScore(node.weightageScore || 7.0);
    }
  };

  const handleGenerateAI = async () => {
    if (!topic.trim()) return alert('Please enter or select a topic');
    if (!targetClass) return alert('Please select a class');
    setIsGenerating(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/teacher/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          weaknesses: [topic],
          subject: subject || 'General',
          studentClass: targetClass || 'Class',
          numQuestions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate');
      if (data.questions && Array.isArray(data.questions)) {
        const parsed: Question[] = data.questions.map((q: any) => ({
          question: q.questionText || q.text || q.question || '',
          options: Array.isArray(q.options)
            ? q.options.map((o: any) => (typeof o === 'string' ? o : o.text || String(o)))
            : ['Option A', 'Option B', 'Option C', 'Option D'],
          correctAnswerIndex: typeof q.correctOptionId === 'number' ? q.correctOptionId : 0,
          explanation: q.explanation || '',
        }));
        setQuestions(parsed);
      } else {
        throw new Error('AI returned unexpected format. Please try again.');
      }
    } catch (err: any) {
      console.error(err);
      alert('Error generating quiz questions: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePostQuiz = async () => {
    if (!profile?.schoolId || questions.length === 0) return;
    setIsPosting(true);
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      const token = await getAuthToken();
      const res = await fetch('/api/teacher/post-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          schoolId: profile.schoolId,
          teacherId: profile.uid,
          teacherName: profile.name || 'Teacher',
          title: `AI Quiz: ${topic}`,
          description: `Automated assessment quiz covering ${topic}.`,
          type: 'quiz',
          subject: subject || 'General',
          class: targetClass || 'All',
          chapter: selectedChapter,
          topic: topic,
          tags: selectedTags,
          weightageScore,
          dueDate: dueDate.toISOString().split('T')[0],
          questions: questions.map(q => ({
            questionText: q.question,
            options: q.options,
            correctOptionId: q.correctAnswerIndex,
            explanation: q.explanation,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to post quiz');
      alert('Quiz posted successfully!');
      router.push('/teacher');
    } catch (err: any) {
      alert('Failed to post quiz: ' + err.message);
    } finally {
      setIsPosting(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Quiz Generator...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center space-x-4">
        <Link href="/teacher" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-[#002147]">AI Quiz Generator & Publisher</h1>
          <p className="text-gray-500 text-sm mt-1">Generate diagnostic quizzes in seconds using AI</p>
        </div>
      </div>

      {/* Generator Configuration Form */}
      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Target Class */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Target Class</label>
            <select
              value={targetClass}
              onChange={e => { setTargetClass(e.target.value); setSubject(''); }}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            >
              <option value="">— Select class —</option>
              {assignedClasses.map((cls: string) => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>

          {/* Subject Name */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Subject Name</label>
            <select
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              disabled={!targetClass}
            >
              <option value="">— Select subject —</option>
              {assignedSubjects.map((sub: string) => (
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
              disabled={!subject || chapters.length === 0}
            >
              {chapters.length === 0 ? (
                <option value="">— No syllabus chapters found —</option>
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
                    {t.topic} (Weight: {t.weightageScore})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. Depreciation & SLM vs WDV"
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            )}
          </div>

          {/* Tags & Weightage Info Pill */}
          {selectedTags.length > 0 && (
            <div className="md:col-span-2 bg-purple-50/70 border border-purple-100 p-3 rounded-2xl flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-purple-900 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-purple-600" /> Tags:
              </span>
              {selectedTags.map(tag => (
                <span key={tag} className="px-2 py-0.5 bg-white text-purple-700 border border-purple-200 text-xs font-semibold rounded-lg shadow-2xs">
                  #{tag}
                </span>
              ))}
              <span className="ml-auto text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-600" /> TML Weightage: {weightageScore}
              </span>
            </div>
          )}

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

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Difficulty Level</label>
            <select
              value={difficulty}
              onChange={e => setDifficulty(e.target.value as Difficulty)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerateAI}
          disabled={isGenerating}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-md flex items-center justify-center space-x-2 disabled:opacity-60"
        >
          <Sparkles className="w-5 h-5" />
          <span>{isGenerating ? 'Generating Quiz...' : 'Generate Quiz with AI'}</span>
          {isGenerating && <Loader2 className="w-4 h-4 animate-spin" />}
        </button>
      </div>

      {/* Generated Questions List */}
      {questions.length > 0 && (
        <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
          <h2 className="text-xl font-extrabold text-[#002147] flex items-center justify-between">
            <span>Quiz Preview ({questions.length} Questions)</span>
            <span className="text-xs font-normal text-gray-500">Subject: {subject || 'General'}</span>
          </h2>

          <div className="space-y-4">
            {questions.map((q, idx) => (
              <div key={idx} className="p-5 bg-gray-50 rounded-2xl border border-gray-200 space-y-3">
                <div className="flex items-start justify-between">
                  <span className="font-bold text-sm text-indigo-900">Q{idx + 1}. {q.question}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  {q.options.map((opt, oIdx) => (
                    <div
                      key={oIdx}
                      className={`p-2.5 rounded-xl border text-xs font-semibold ${
                        oIdx === q.correctAnswerIndex
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-white border-gray-200 text-gray-700'
                      }`}
                    >
                      {String.fromCharCode(65 + oIdx)}. {opt}
                      {oIdx === q.correctAnswerIndex && ' ✓ (Correct)'}
                    </div>
                  ))}
                </div>
                {q.explanation && (
                  <p className="text-xs text-gray-500 bg-white p-2.5 rounded-xl border border-gray-200 mt-2">
                    💡 <strong>Explanation:</strong> {q.explanation}
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handlePostQuiz}
            disabled={isPosting}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold transition-all shadow-md flex items-center justify-center space-x-2 disabled:opacity-60"
          >
            <Send className="w-5 h-5" />
            <span>{isPosting ? 'Publishing Quiz...' : 'Publish Quiz to Students'}</span>
            {isPosting && <Loader2 className="w-4 h-4 animate-spin" />}
          </button>
        </div>
      )}
    </div>
  );
}
