'use client';

import { useState } from 'react';
import { Settings, FileText, CheckCircle2, Loader2, Save, Sparkles, BookOpen, BrainCircuit } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function PaperGenPage() {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [generatedData, setGeneratedData] = useState<any>(null);
  const [error, setError] = useState('');
  const { profile } = useAuth();

  const [grade, setGrade] = useState('10th Grade Mathematics');
  const [difficulty, setDifficulty] = useState('CBSE Standard (30% Easy, 50% Med, 20% Hard)');
  const [chapters, setChapters] = useState<string[]>(['Quadratic Equations']);
  const [questionCount, setQuestionCount] = useState(5);

  const toggleChapter = (chapter: string) => {
    setChapters(prev => 
      prev.includes(chapter) 
        ? prev.filter(c => c !== chapter)
        : [...prev, chapter]
    );
  };

  const handleGenerate = async () => {
    if (chapters.length === 0) {
      setError("Please select at least one chapter.");
      return;
    }
    setError('');
    setGenerating(true);
    setGeneratedData(null);
    
    try {
      const prompt = `Generate a quiz for ${grade} covering chapters: ${chapters.join(', ')}. 
      Difficulty: ${difficulty}. 
      Generate EXACTLY ${questionCount} multiple choice questions.
      Return the result as a strict JSON array of objects, where each object has:
      - "id": a unique string (e.g. "q1")
      - "text": the question text
      - "options": an array of exactly 4 objects, each with "id" ("a", "b", "c", or "d") and "text"
      - "correctOptionId": the id of the correct option.
      Do not include any markdown formatting or code blocks (\`\`\`), just the raw JSON array starting with [ and ending with ].`;

      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, stream: false })
      });

      const data = await response.json();
      
      if (response.ok && data.text) {
        try {
          // Remove potential markdown code block artifacts added by LLMs
          let cleanText = data.text.trim();
          if (cleanText.startsWith('\`\`\`json')) cleanText = cleanText.substring(7);
          else if (cleanText.startsWith('\`\`\`')) cleanText = cleanText.substring(3);
          if (cleanText.endsWith('\`\`\`')) cleanText = cleanText.substring(0, cleanText.length - 3);
          cleanText = cleanText.trim();
          
          const parsed = JSON.parse(cleanText);
          setGeneratedData(parsed);
          setSaveSuccess(false);
        } catch (e) {
          setError('Failed to parse AI response. Please try again.');
          console.error('Parse error on:', data.text);
        }
      } else {
        setError(data.error || 'Failed to generate paper.');
      }
    } catch (err) {
      setError('Connection error.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generatedData || !profile?.schoolId) return;
    setSaving(true);
    try {
      // Calculate tomorrow's date for the dueDate
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dueDateStr = tomorrow.toISOString().split('T')[0];

      // Derive class and subject from the selected grade string
      // e.g. '10th Grade Mathematics' → class: 'Class 10', subject: 'Mathematics'
      const gradeMatch = grade.match(/(\d+)th Grade (.+)/);
      const classLabel = gradeMatch ? `Class ${gradeMatch[1]}` : grade;
      const subjectLabel = gradeMatch ? gradeMatch[2] : 'General';

      const assignmentsRef = collection(db, 'schools', profile.schoolId, 'assignments');
      await addDoc(assignmentsRef, {
        title: `${classLabel} ${subjectLabel} - ${chapters.join(', ')} Quiz`,
        grade,
        class: classLabel,
        subject: subjectLabel,
        type: 'quiz',
        dueDate: dueDateStr,
        difficulty,
        questions: generatedData,
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
        status: 'published'
      });
      setSaveSuccess(true);
    } catch (err) {
      console.error(err);
      setError('Failed to save assignment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16 font-sans">
      
      {/* Premium Header Banner */}
      <div className="bg-white/80 border-b border-gray-200/60 shadow-sm sticky top-0 z-40 backdrop-blur-xl">
        <div className="max-w-[1200px] mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-inner border border-indigo-400">
              <BrainCircuit className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2 text-indigo-600 text-xs font-bold uppercase tracking-wider mb-1">
                <Sparkles className="w-4 h-4" />
                <span>AI Assessment Engine</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-[#002147]">Instant Paper Gen</h1>
              <p className="text-sm font-medium text-gray-500 mt-0.5">Generate professional, syllabus-aligned quizzes instantly.</p>
            </div>
          </div>

          <div className="px-5 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-indigo-700 rounded-xl font-bold flex items-center space-x-2 shadow-sm">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            <span>Gemini 2.5 Flash Powered</span>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-8 flex flex-col lg:flex-row gap-8 animate-in fade-in duration-500">
        
        {/* Configuration Panel */}
        <div className="flex-1 space-y-6">
          <div className="bg-white border border-gray-200/60 p-8 rounded-3xl shadow-sm space-y-8 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -mr-20 -mt-20 opacity-50"></div>
            
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-sm font-bold text-[#002147] flex items-center space-x-2">
                  <BookOpen className="w-4 h-4 text-indigo-500" />
                  <span>Grade & Subject</span>
                </label>
                <select 
                  value={grade}
                  onChange={e => setGrade(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                >
                 <option>10th Grade Mathematics</option>
                  <option>10th Grade Science</option>
                  <option>10th Grade English</option>
                  <option>10th Grade Social Studies</option>
                  <option>10th Grade Hindi</option>
                  <option>9th Grade Mathematics</option>
                  <option>9th Grade Science</option>
                  <option>9th Grade English</option>
                  <option>9th Grade Social Studies</option>
                  <option>11th Grade Mathematics</option>
                  <option>11th Grade Physics</option>
                  <option>11th Grade Chemistry</option>
                  <option>11th Grade Biology</option>
                  <option>12th Grade Mathematics</option>
                  <option>12th Grade Physics</option>
                  <option>12th Grade Chemistry</option>
                  <option>12th Grade Biology</option>
                </select>
              </div>
              <div className="space-y-3">
                <label className="text-sm font-bold text-[#002147] flex items-center space-x-2">
                  <Settings className="w-4 h-4 text-indigo-500" />
                  <span>Difficulty Distribution</span>
                </label>
                <select 
                  value={difficulty}
                  onChange={e => setDifficulty(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                >
                  <option>CBSE Standard (30% Easy, 50% Med, 20% Hard)</option>
                  <option>Challenge Mode (10% Easy, 40% Med, 50% Hard)</option>
                  <option>Foundational (50% Easy, 40% Med, 10% Hard)</option>
                </select>
              </div>
              <div className="space-y-3">
                <label className="text-sm font-bold text-[#002147] flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                  <span>Number of Questions</span>
                </label>
                <select
                  value={questionCount}
                  onChange={e => setQuestionCount(Number(e.target.value))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                >
                  <option value={3}>3 Questions (Quick)</option>
                  <option value={5}>5 Questions (Standard)</option>
                  <option value={10}>10 Questions (Comprehensive)</option>
                  <option value={15}>15 Questions (Full Test)</option>
                </select>
              </div>
            </div>

            <div className="relative z-10 space-y-4">
              <label className="text-sm font-bold text-[#002147] flex items-center space-x-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                <span>Select Syllabus Chapters</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {['Real Numbers', 'Polynomials', 'Quadratic Equations', 'Arithmetic Progressions', 'Triangles', 'Coordinate Geometry'].map(chapter => {
                  const isSelected = chapters.includes(chapter);
                  return (
                    <label 
                      key={chapter} 
                      className={`flex items-center space-x-3 p-4 rounded-xl cursor-pointer transition-all duration-200 border-2 ${
                        isSelected 
                          ? 'border-indigo-500 bg-indigo-50/50 shadow-sm' 
                          : 'border-gray-100 bg-white hover:border-indigo-200 hover:bg-gray-50'
                      }`}
                    >
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" 
                        checked={isSelected}
                        onChange={() => toggleChapter(chapter)}
                      />
                      <span className={`font-semibold ${isSelected ? 'text-indigo-900' : 'text-gray-600'}`}>{chapter}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="relative z-10 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 font-medium text-sm flex items-center space-x-2 animate-in fade-in">
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span>{error}</span>
              </div>
            )}

            <button 
              onClick={handleGenerate}
              disabled={generating}
              className="relative z-10 w-full bg-gradient-to-r from-[#002147] to-indigo-900 text-white py-4 rounded-xl font-bold hover:shadow-lg transition-all flex items-center justify-center space-x-2 disabled:opacity-70 disabled:hover:shadow-none overflow-hidden group"
            >
              {generating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-200" />
                  <span>Synthesizing Quiz...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-indigo-200 group-hover:scale-110 transition-transform" />
                  <span>Generate Quiz</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="lg:w-[480px]">
          {generatedData ? (
            <div className="bg-[#002147] border border-indigo-500/30 text-white p-1 rounded-3xl shadow-2xl relative overflow-hidden animate-in slide-in-from-right-8 duration-500">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl mix-blend-screen pointer-events-none"></div>
              
              <div className="bg-indigo-950/40 rounded-[22px] p-6 backdrop-blur-sm max-h-[80vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-center mb-6 pt-4">
                  <div className="bg-gradient-to-br from-emerald-400 to-emerald-600 p-4 rounded-full shadow-lg shadow-emerald-500/20">
                    <CheckCircle2 className="w-12 h-12 text-white" />
                  </div>
                </div>
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-black mb-1 text-white">Quiz Generated!</h3>
                  <div className="inline-flex items-center space-x-1.5 bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-400/30">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                    <span className="text-indigo-200 text-xs font-bold tracking-wide">GEMINI 2.5 FLASH</span>
                  </div>
                </div>
                
                <div className="space-y-4 mb-8">
                  {generatedData.map((q: any, i: number) => (
                    <div key={q.id} className="bg-white/5 border border-white/10 p-5 rounded-2xl hover:bg-white/10 transition-colors">
                      <p className="font-bold mb-4 text-sm leading-relaxed text-indigo-50">
                        <span className="text-indigo-400 mr-2">Q{i + 1}.</span>
                        {q.text}
                      </p>
                      <ul className="space-y-2">
                        {q.options.map((opt: any) => {
                          const isCorrect = opt.id === q.correctOptionId;
                          return (
                            <li key={opt.id} className={`text-sm p-3 rounded-xl flex justify-between items-center transition-all ${
                              isCorrect 
                                ? 'bg-emerald-500/20 border border-emerald-500/50 font-bold text-emerald-100' 
                                : 'bg-black/20 text-indigo-200 border border-transparent'
                            }`}>
                              <div className="flex items-center space-x-3">
                                <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                  isCorrect ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/50'
                                }`}>
                                  {opt.id.toUpperCase()}
                                </span>
                                <span>{opt.text}</span>
                              </div>
                              {isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={handleSave}
                  disabled={saving || saveSuccess}
                  className={`w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center space-x-2 shadow-lg ${
                    saveSuccess 
                      ? 'bg-emerald-500 text-white shadow-emerald-500/20' 
                      : 'bg-white text-[#002147] hover:bg-indigo-50'
                  } disabled:opacity-90`}
                >
                  {saving ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /><span>Publishing...</span></>
                  ) : saveSuccess ? (
                    <><CheckCircle2 className="w-5 h-5" /><span>Published to Dashboard!</span></>
                  ) : (
                    <><Save className="w-5 h-5" /><span>Publish Assignment</span></>
                  )}
                </button>
                {saveSuccess && (
                  <div className="text-center space-y-2">
                    <a href="/admin/results" className="text-indigo-600 font-bold hover:underline text-sm mt-2 block">View in Results Dashboard →</a>
                    <button
                      onClick={() => { setSaveSuccess(false); setGeneratedData(null); setChapters(['Quadratic Equations']); }}
                      className="px-6 py-2.5 bg-gray-100 text-[#002147] font-bold rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      Generate Another Quiz
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full bg-white border border-gray-200/60 rounded-3xl flex flex-col items-center justify-center text-center p-10 min-h-[500px] shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-30"></div>
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6 border-8 border-white shadow-sm">
                  <BrainCircuit className="w-10 h-10 text-indigo-300" />
                </div>
                <h3 className="text-xl font-bold text-[#002147] mb-2">Awaiting Parameters</h3>
                <p className="text-gray-500 font-medium max-w-[250px]">Configure your parameters on the left to generate a live, AI-powered quiz.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
