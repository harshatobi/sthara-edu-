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

// ── Types ────────────────────────────────────────────────────────────────────
type PaperType = 'mcq' | 'saq' | 'laq' | 'mixed';

interface MCQQuestion {
  type: 'mcq';
  question: string;
  options: { a: string; b: string; c: string; d: string };
  correctOptionId: string;
  marks: number;
}
interface WrittenQuestion {
  type: 'saq' | 'laq';
  question: string;
  modelAnswer: string;
  marks: number;
}
type Question = MCQQuestion | WrittenQuestion;

// ── Constants ────────────────────────────────────────────────────────────────
const DIFFICULTY_OPTIONS = [
  'Easy (Class-level basics)',
  'CBSE Standard',
  'CBSE Advanced',
  'Competitive Exam Level',
  'Mixed (Easy + Hard)',
  'State Board Standard',
  'University Level',
];

const SUBJECTS = [
  'Mathematics', 'Science', 'Physics', 'Chemistry', 'Biology',
  'English', 'Hindi', 'Social Studies', 'History', 'Geography',
  'Economics', 'Computer Science', 'Environmental Science',
  'Commerce', 'Accountancy', 'Business Studies', 'Political Science',
];

const PAPER_TYPE_OPTIONS: { value: PaperType; label: string; desc: string }[] = [
  { value: 'mcq',   label: 'MCQ',   desc: 'Multiple Choice Questions' },
  { value: 'saq',   label: 'SAQ',   desc: 'Short Answer Questions' },
  { value: 'laq',   label: 'LAQ',   desc: 'Long Answer / Essay Questions' },
  { value: 'mixed', label: 'Mixed', desc: 'MCQ + SAQ + LAQ combined paper' },
];

const OPTION_LABELS: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D' };

// ── Component ────────────────────────────────────────────────────────────────
export default function PaperGenPage() {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [paperType, setPaperType] = useState<PaperType>('mcq');
  const [error, setError] = useState('');
  const [expandedKey, setExpandedKey] = useState<number | null>(null);

  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (profile && !['admin', 'superadmin'].includes(profile.role)) router.push('/login');
  }, [profile, router]);

  const [classNum, setClassNum]     = useState('10');
  const [section, setSection]       = useState('Standalone');
  const [subject, setSubject]       = useState('Mathematics');
  const [difficulty, setDifficulty] = useState('CBSE Standard');
  const [numQuestions, setNumQuestions] = useState(10);

  const sectionClass = section === 'Standalone' ? `Class ${classNum}` : `Class ${classNum}-${section}`;

  const totalMarks = questions.reduce((acc, q) => acc + (q.marks || 1), 0);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setQuestions([]);
    setExpandedKey(null);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/paper-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          grade: sectionClass,
          subject,
          chapters: [subject],
          difficulty,
          numQuestions,
          paperType,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `API error: ${res.status}`);
      }

      const data = await res.json();
      const parsed: Question[] = Array.isArray(data)
        ? data
        : Array.isArray(data.questions)
        ? data.questions
        : [];

      if (parsed.length === 0) throw new Error('No questions generated. Try again.');
      setQuestions(parsed);
      setPaperType(data.paperType || paperType);
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
        teacher_id: profile.uid,           // ← fixed: was profile.id (doesn't exist)
        teacher_name: profile.name || 'Admin',
        title: `${subject} — ${sectionClass} (${PAPER_TYPE_OPTIONS.find(p => p.value === paperType)?.label || 'Paper'})`,
        type: 'exam',
        class: sectionClass,
        subject,
        questions: questions.map((q, i) => ({
          id: `q_${i + 1}`,
          questionText: q.question,
          type: q.type,
          marks: q.marks || 1,
          ...(q.type === 'mcq'
            ? { options: (q as MCQQuestion).options, correctOptionId: (q as MCQQuestion).correctOptionId }
            : { modelAnswer: (q as WrittenQuestion).modelAnswer }
          ),
        })),
      });
      if (insertErr) throw insertErr;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

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
          <p className="text-gray-500 text-sm mt-1">Generate CBSE, State Board &amp; University aligned exam papers instantly</p>
        </div>
      </div>

      {/* Config Card */}
      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">

        {saveSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-2xl flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            Paper published and assigned to {sectionClass}!
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-2xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Paper Type Selector */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-3">Paper Type</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PAPER_TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPaperType(opt.value)}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  paperType === opt.value
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 bg-gray-50 hover:border-indigo-300'
                }`}
              >
                <div className={`text-base font-black ${paperType === opt.value ? 'text-indigo-700' : 'text-gray-700'}`}>
                  {opt.label}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Class Number */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">Class</label>
            <select
              value={classNum}
              onChange={e => setClassNum(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {['1','2','3','4','5','6','7','8','9','10','11','12','UG I Year','UG II Year','UG III Year'].map(c => (
                <option key={c} value={c}>{c.startsWith('UG') ? c : `Class ${c}`}</option>
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
            <label className="text-sm font-bold text-gray-700">Difficulty / Board</label>
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
              <span className="text-gray-500">Generating: </span>
              <span className="font-bold text-indigo-700">{sectionClass} — {subject}</span>
              <br />
              <span className="text-gray-500">Type: </span>
              <span className="font-semibold text-indigo-600">{PAPER_TYPE_OPTIONS.find(p => p.value === paperType)?.label}</span>
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
              <p className="text-indigo-200 text-sm">
                {sectionClass} &nbsp;|&nbsp; {difficulty} &nbsp;|&nbsp;{' '}
                {PAPER_TYPE_OPTIONS.find(p => p.value === paperType)?.label} &nbsp;|&nbsp; {questions.length} Questions
              </p>
              <p className="text-indigo-300 text-xs mt-1">Total Marks: {totalMarks}</p>
            </div>
          </div>

          {/* Instructions */}
          <div className="px-8 py-4 bg-amber-50 border-b border-amber-100">
            <p className="text-xs text-amber-700 font-medium">
              📋 Instructions: {paperType === 'mcq'
                ? 'Choose the most appropriate answer for each question. Each question carries 1 mark.'
                : paperType === 'saq'
                ? 'Answer all questions concisely. Each answer should be 2-3 sentences.'
                : paperType === 'laq'
                ? 'Answer all questions in detail. Support your answers with examples.'
                : 'This paper contains MCQ, Short Answer, and Long Answer questions. Read each section carefully.'}
            </p>
          </div>

          {/* Questions */}
          <div className="p-8 space-y-4">
            {questions.map((q, i) => {
              const isMCQ = q.type === 'mcq';
              const isExpanded = expandedKey === i;

              return (
                <div key={i} className="border border-gray-200 rounded-2xl overflow-hidden hover:border-indigo-200 transition-colors">
                  {/* Question Header */}
                  <button
                    type="button"
                    onClick={() => setExpandedKey(isExpanded ? null : i)}
                    className="w-full flex items-start justify-between gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#002147] text-white text-sm font-black flex items-center justify-center">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[#002147] leading-relaxed">{q.question}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            q.type === 'mcq' ? 'bg-blue-100 text-blue-700' :
                            q.type === 'saq' ? 'bg-amber-100 text-amber-700' :
                            'bg-purple-100 text-purple-700'
                          }`}>
                            {q.type.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-400">{q.marks} mark{q.marks > 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                      : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                    }
                  </button>

                  {/* Expanded: MCQ Options */}
                  {isExpanded && isMCQ && (
                    <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(Object.entries((q as MCQQuestion).options) as [string, string][]).map(([key, val]) => (
                        <div
                          key={key}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium transition-all ${
                            key === (q as MCQQuestion).correctOptionId
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-gray-50 border-gray-200 text-gray-700'
                          }`}
                        >
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
                            key === (q as MCQQuestion).correctOptionId
                              ? 'bg-emerald-500 text-white'
                              : 'bg-gray-200 text-gray-600'
                          }`}>
                            {OPTION_LABELS[key]}
                          </span>
                          {val}
                          {key === (q as MCQQuestion).correctOptionId && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto flex-shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Expanded: SAQ/LAQ Model Answer */}
                  {isExpanded && !isMCQ && (
                    <div className="px-5 pb-5">
                      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                        <p className="text-xs font-bold text-indigo-600 mb-1">Model Answer</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{(q as WrittenQuestion).modelAnswer}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
              onClick={() => { setQuestions([]); setError(''); setExpandedKey(null); }}
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
