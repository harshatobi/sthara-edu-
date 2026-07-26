'use client';

import { useState, useEffect } from 'react';
import {
  Sparkles, FileText, CheckCircle2, Loader2, Save, ArrowLeft,
  BookOpen, AlertCircle, Printer, ChevronDown, ChevronUp
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import Link from 'next/link';

interface Question {
  question: string;
  options: { a: string; b: string; c: string; d: string };
  correctOptionId: string;
}

const DIFFICULTY_OPTIONS = [
  'Easy (Class-level basics)',
  'CBSE Standard',
  'CBSE Advanced',
  'Competitive Exam Level',
  'Mixed (Easy + Hard)',
];

const SUBJECTS = [
  'Mathematics', 'Science', 'Physics', 'Chemistry', 'Biology',
  'English', 'Hindi', 'Social Studies', 'History', 'Geography',
  'Economics', 'Computer Science', 'Environmental Science',
];

export default function PaperGenPage() {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState('');
  const [expandedKey, setExpandedKey] = useState<number | null>(null);

  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (profile && profile.role !== 'admin') router.push('/login');
  }, [profile, router]);

  const [classNum, setClassNum] = useState('10');
  const [section, setSection] = useState('A');
  const [subject, setSubject] = useState('Mathematics');
  const [difficulty, setDifficulty] = useState('CBSE Standard');
  const [numQuestions, setNumQuestions] = useState(10);

  const sectionClass = section === 'Standalone' ? `Class ${classNum}` : `Class ${classNum}-${section}`;

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setQuestions([]);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/paper-gen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          grade: sectionClass,
          chapters: [subject],
          difficulty,
          numQuestions,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `API error: ${res.status}`);
      }

      const data = await res.json();

      // data can be an array of questions or { questions: [...] }
      const parsed: Question[] = Array.isArray(data)
        ? data
        : Array.isArray(data.questions)
        ? data.questions
        : [];

      if (parsed.length === 0) throw new Error('No questions generated. Try again.');
      setQuestions(parsed);
    } catch (err: any) {
      setError(err.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!profile?.schoolId || questions.length === 0) return;
    setSaving(true);
    try {
      const { error: insertErr } = await supabase.from('assignments').insert({
        school_id: profile.schoolId,
        teacher_id: profile.id,
        title: `${subject} Question Paper — ${sectionClass}`,
        type: 'exam',
        class: sectionClass,
        subject,
        questions: questions.map((q, i) => ({
          questionText: `Q${i + 1}: ${q.question}`,
          options: q.options,
          correctOptionId: q.correctOptionId,
          marks: 1,
        })),
      });
      if (insertErr) throw insertErr;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const OPTION_LABELS: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D' };

  if (!profile) return (
    <div className="p-10 text-center text-[#002147] font-medium">Loading Question Paper Generator...</div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 shadow-sm">
          <ArrowLeft className="w-5 h-5 text-[#002147]" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-[#002147]">AI Question Paper Generator</h1>
          <p className="text-gray-500 text-sm mt-1">Generate CBSE &amp; State Board aligned exam papers instantly</p>
        </div>
      </div>

      {/* Config Card */}
      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">

        {saveSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-2xl flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            Paper saved and assigned to {sectionClass}!
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-2xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Class Number */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">Class</label>
            <select
              value={classNum}
              onChange={e => setClassNum(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {['1','2','3','4','5','6','7','8','9','10','11','12'].map(c => (
                <option key={c} value={c}>Class {c}</option>
              ))}
            </select>
          </div>

          {/* Section */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">Section</label>
            <select
              value={section}
              onChange={e => setSection(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Standalone">Standalone (No Section)</option>
              {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(s => (
                <option key={s} value={s}>Section {s}</option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">Subject</label>
            <select
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Difficulty */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">Difficulty</label>
            <select
              value={difficulty}
              onChange={e => setDifficulty(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {DIFFICULTY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Number of Questions */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">Number of Questions</label>
            <select
              value={numQuestions}
              onChange={e => setNumQuestions(Number(e.target.value))}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {[5, 10, 15, 20, 25].map(n => <option key={n} value={n}>{n} Questions</option>)}
            </select>
          </div>

          {/* Preview Label */}
          <div className="space-y-1.5 flex items-end">
            <div className="w-full p-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-sm">
              <span className="text-gray-500">Generating for: </span>
              <span className="font-bold text-indigo-700">{sectionClass} — {subject}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl font-bold text-sm transition-all shadow-md flex items-center gap-2 disabled:opacity-60"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating Paper...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate AI Question Paper</>
          )}
        </button>
      </div>

      {/* Generated Paper Preview */}
      {questions.length > 0 && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Paper Header */}
          <div className="bg-gradient-to-r from-[#002147] to-indigo-800 p-8 text-white">
            <div className="text-center space-y-1">
              <div className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-2">Question Paper</div>
              <h2 className="text-2xl font-black">{subject} Examination</h2>
              <p className="text-indigo-200 text-sm">{sectionClass} &nbsp;|&nbsp; {difficulty} &nbsp;|&nbsp; {questions.length} Questions</p>
              <p className="text-indigo-300 text-xs mt-1">Total Marks: {questions.length}</p>
            </div>
          </div>

          {/* Instructions */}
          <div className="px-8 py-4 bg-amber-50 border-b border-amber-100">
            <p className="text-xs text-amber-700 font-medium">
              📋 Instructions: Choose the most appropriate answer for each question. Each question carries 1 mark.
            </p>
          </div>

          {/* Questions */}
          <div className="p-8 space-y-4">
            {questions.map((q, i) => (
              <div
                key={i}
                className="border border-gray-200 rounded-2xl overflow-hidden hover:border-indigo-200 transition-colors"
              >
                {/* Question Row */}
                <button
                  type="button"
                  onClick={() => setExpandedKey(expandedKey === i ? null : i)}
                  className="w-full flex items-start justify-between gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#002147] text-white text-sm font-black flex items-center justify-center">
                      {i + 1}
                    </span>
                    <p className="text-sm font-semibold text-[#002147] leading-relaxed">{q.question}</p>
                  </div>
                  {expandedKey === i
                    ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  }
                </button>

                {/* Options (expanded) */}
                {expandedKey === i && (
                  <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Object.entries(q.options) as [string, string][]).map(([key, val]) => (
                      <div
                        key={key}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium transition-all ${
                          key === q.correctOptionId
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-gray-50 border-gray-200 text-gray-700'
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
                          key === q.correctOptionId
                            ? 'bg-emerald-500 text-white'
                            : 'bg-gray-200 text-gray-600'
                        }`}>
                          {OPTION_LABELS[key]}
                        </span>
                        {val}
                        {key === q.correctOptionId && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Save / Print Footer */}
          <div className="px-8 pb-8 flex flex-wrap gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-[#002147] hover:bg-indigo-900 text-white rounded-2xl font-bold text-sm transition-all shadow-md disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Publishing...' : 'Publish to Class'}
            </button>

            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-2xl font-bold text-sm hover:bg-gray-50 transition-all shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Print Paper
            </button>

            <button
              onClick={() => { setQuestions([]); setError(''); }}
              className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-2xl font-bold text-sm hover:bg-gray-50 transition-all shadow-sm"
            >
              Generate New Paper
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
