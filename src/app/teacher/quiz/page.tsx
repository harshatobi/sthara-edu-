'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Sparkles, BrainCircuit, Loader2, Plus, Trash2, Send,
  BookOpen, Target, RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';

interface Question {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
}

export default function TeacherQuizPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [targetClass, setTargetClass] = useState('');
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

  const handleGenerateAI = async () => {
    if (!topic.trim()) return alert('Please enter a topic');
    setIsGenerating(true);
    try {
      const res = await fetch('/api/teacher/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weaknesses: [topic],
          subject: subject || 'General',
          studentClass: targetClass || 'Class',
          numQuestions,
        }),
      });
      const data = await res.json();
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
        // Fallback default set if AI endpoint returns simple list
        setQuestions(
          Array.from({ length: numQuestions }).map((_, i) => ({
            question: `Sample Question ${i + 1} on ${topic}`,
            options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
            correctAnswerIndex: 0,
            explanation: 'Correct explanation',
          }))
        );
      }
    } catch (err: any) {
      console.error(err);
      alert('Error generating quiz questions');
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

      const { error } = await supabase.from('assignments').insert({
        school_id: profile.schoolId,
        teacher_id: profile.uid,
        teacher_name: profile.name || 'Teacher',
        title: `AI Quiz: ${topic}`,
        description: `Automated assessment quiz covering ${topic}.`,
        type: 'quiz',
        subject: subject || 'General',
        class: targetClass || 'All',
        due_date: dueDate.toISOString().split('T')[0],
        questions: questions.map(q => ({
          questionText: q.question,
          options: q.options,
          correctOptionId: q.correctAnswerIndex,
          explanation: q.explanation,
        })),
      });

      if (error) throw error;
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
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Topic / Subject Module</label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Depreciation & SLM vs WDV"
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Subject Name</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Corporate Accounting"
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Target Class / Branch</label>
            <input
              type="text"
              value={targetClass}
              onChange={e => setTargetClass(e.target.value)}
              placeholder="e.g. B.Com II Year"
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Number of Questions</label>
            <select
              value={numQuestions}
              onChange={e => setNumQuestions(Number(e.target.value))}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            >
              {[5, 10, 15, 20].map(n => (
                <option key={n} value={n}>{n} Questions</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerateAI}
          disabled={isGenerating}
          className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-md flex items-center justify-center space-x-2"
        >
          <Sparkles className="w-5 h-5" />
          <span>{isGenerating ? 'Generating Quiz Questions...' : 'Generate Questions with AI'}</span>
        </button>
      </div>

      {/* Generated Questions Preview & Publish */}
      {questions.length > 0 && (
        <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#002147]">Generated Questions ({questions.length})</h2>
            <button
              onClick={handlePostQuiz}
              disabled={isPosting}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-sm transition-all shadow-md flex items-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>{isPosting ? 'Posting...' : 'Publish Quiz to Class'}</span>
            </button>
          </div>

          <div className="space-y-4">
            {questions.map((q, idx) => (
              <div key={idx} className="p-5 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
                <div className="font-bold text-[#002147] text-sm">
                  Q{idx + 1}: {q.question}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {q.options.map((opt, oIdx) => (
                    <div
                      key={oIdx}
                      className={`p-2.5 rounded-xl border ${
                        oIdx === q.correctAnswerIndex
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold'
                          : 'bg-white border-gray-200 text-gray-700'
                      }`}
                    >
                      {String.fromCharCode(65 + oIdx)}. {opt}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
