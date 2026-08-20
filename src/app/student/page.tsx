'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { TrendingUp, Target, Award, ArrowRight, FileText, CheckCircle2, Clock, Play, MessageSquare, Heart, ChevronRight } from 'lucide-react';

interface HomeworkItem {
  id: string;
  subject: string;
  title: string;
  dueDate: string;
  status: 'PENDING' | 'SUBMITTED' | 'GRADED';
  col: string;
  instructions: string;
  score?: string;
  feedback?: string;
}

export default function StudentPage() {
  const router = useRouter();
  const { profile } = useAuth();
  
  // Interactive Energy Mood Scale (0 to 10)
  const [energyValue, setEnergyValue] = useState<number>(8);

  // Homework Modal State for submitting work when clicking "Open Workspace"
  const [selectedHw, setSelectedHw] = useState<HomeworkItem | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submittedFile, setSubmittedFile] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic Homework Tasks List
  const [homeworkList, setHomeworkList] = useState<HomeworkItem[]>([
    {
      id: 'hw-1',
      subject: 'MATHEMATICS',
      title: 'Quadratic Equations — Level 2',
      dueDate: 'Due 28 Jul',
      status: 'PENDING',
      col: 'r',
      instructions: 'Solve Questions 1 to 8 from NCERT Exercise 4.2. Upload photos of your handwritten working.',
    },
    {
      id: 'hw-2',
      subject: 'SCIENCE',
      title: 'Periodic Classification worksheet',
      dueDate: 'Due 30 Jul',
      status: 'PENDING',
      col: 'a',
      instructions: 'Complete modern periodic table trends exercise. Explain metallic character variation across Period 3.',
    },
    {
      id: 'hw-3',
      subject: 'SOCIAL STUDIES',
      title: 'Nationalism in India — map work',
      dueDate: 'Due 02 Aug',
      status: 'PENDING',
      col: 'n',
      instructions: 'Locate and label Dandi, Champaran, Kheda, and Jallianwala Bagh on the provided India outline map.',
    },
  ]);

  const handleOpenHwModal = (hw: HomeworkItem) => {
    setSelectedHw(hw);
    setSubmissionText('');
    setSubmittedFile(null);
  };

  const handleSubmitHw = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHw) return;
    setIsSubmitting(true);

    setTimeout(() => {
      setHomeworkList(prev => prev.map(h => h.id === selectedHw.id ? {
        ...h,
        status: 'SUBMITTED',
        col: 'g',
        score: '18/20',
        feedback: 'AI Evaluated: High accuracy on algebraic working. Clean step presentation!'
      } : h));
      setIsSubmitting(false);
      setSelectedHw(prev => prev ? {
        ...prev,
        status: 'SUBMITTED',
        col: 'g',
        score: '18/20',
        feedback: 'AI Evaluated: High accuracy on algebraic working. Clean step presentation!'
      } : null);
    }, 600);
  };

  const hmColor = (v: number) => (v >= 75 ? '#10B981' : v >= 55 ? '#5FC79B' : v >= 40 ? '#F5B60B' : v >= 25 ? '#F98A4B' : '#E11D48');
  const bar = (v: number, c?: string) => (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex-1 min-w-[60px]">
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${v}%`, background: c || hmColor(v) }} />
    </div>
  );

  const pendingCount = homeworkList.filter(h => h.status === 'PENDING').length;

  // Mood label helper for 0 to 10 scale
  const getEnergyLabel = (val: number) => {
    if (val <= 2) return { emoji: '😴', label: 'Low Energy', col: 'text-blue-300' };
    if (val <= 4) return { emoji: '🥱', label: 'Tired', col: 'text-amber-200' };
    if (val <= 6) return { emoji: '😐', label: 'Steady', col: 'text-amber-300' };
    if (val <= 8) return { emoji: '⚡', label: 'Energized', col: 'text-emerald-300' };
    return { emoji: '🚀', label: 'Max Power', col: 'text-amber-400 font-extrabold' };
  };

  const currentEnergy = getEnergyLabel(energyValue);

  return (
    <div className="max-w-7xl mx-auto pb-16 space-y-8">
      {/* ── Student Hero Banner ───────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-[#002147] via-[#003366] to-[#001a33] rounded-3xl p-6 md:p-8 overflow-hidden shadow-xl border border-white/10 text-white">
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="bg-white/15 backdrop-blur-md border border-white/20 px-3 py-1 rounded-full text-xs font-mono font-bold">
                {profile?.customStudentId ? `ID: ${profile.customStudentId}` : 'STU1042'}
              </span>
              <span className="bg-white/15 backdrop-blur-md border border-white/20 px-3 py-1 rounded-full text-xs font-semibold">
                Class: 10A
              </span>
              <span className="bg-white/15 backdrop-blur-md border border-white/20 px-3 py-1 rounded-full text-xs font-semibold">
                DPS Vasundhara
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Welcome back, <span className="text-amber-300">{profile?.name ? profile.name.split(' ')[0] : 'Ananya'}</span>!
            </h1>
            <p className="text-blue-100/90 text-sm md:text-base mt-2 max-w-xl">
              Ready to unleash yourself today? Your personalised learning path awaits.
            </p>
          </div>

          {/* Dynamic 0-10 Energy & Mood Scale Slider */}
          <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 w-full lg:w-72 space-y-2 shadow-lg">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-blue-200 tracking-wider uppercase font-extrabold flex items-center gap-1.5">
                <span>ENERGY MOOD SCALE</span>
              </span>
              <span className={`flex items-center gap-1 text-sm ${currentEnergy.col}`}>
                <span>{currentEnergy.emoji}</span>
                <span>{energyValue}/10</span>
              </span>
            </div>

            <div className="relative pt-1">
              <input
                type="range"
                min="0"
                max="10"
                value={energyValue}
                onChange={(e) => setEnergyValue(Number(e.target.value))}
                className="w-full h-2.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none"
                style={{
                  background: `linear-gradient(to right, #3B82F6 0%, #F59E0B ${energyValue * 10}%, rgba(255,255,255,0.2) ${energyValue * 10}%)`
                }}
              />
            </div>

            <div className="flex justify-between text-[10px] text-blue-200/70 font-semibold pt-0.5">
              <span>0 (Exhausted)</span>
              <span>5 (Balanced)</span>
              <span>10 (Peak)</span>
            </div>
          </div>
        </div>

        {/* Dynamic Hero Tracker Cards — Direct Navigation to Dedicated Feature Sections */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          {/* 1. TRUE MASTERY LEVEL CARD -> Direct Link to /student/mastery */}
          <div 
            onClick={() => router.push('/student/mastery')}
            className="bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/15 rounded-2xl p-5 flex justify-between items-start transition-all cursor-pointer group hover:-translate-y-1 hover:shadow-2xl"
          >
            <div>
              <p className="text-[11px] font-extrabold tracking-widest text-blue-200 uppercase group-hover:text-amber-300 transition-colors">TRUE MASTERY LEVEL</p>
              <p className="text-3xl font-extrabold mt-1">72%</p>
              <p className="text-xs text-blue-200/80 mt-1 flex items-center gap-1">
                <span>▲ 6 pts this fortnight</span>
                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white group-hover:bg-amber-400 group-hover:text-black transition-all font-bold">Open Heatmap →</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-white/15 group-hover:bg-amber-400 group-hover:text-black flex items-center justify-center text-xl transition-all">📈</div>
          </div>

          {/* 2. PENDING TASKS CARD -> Direct Link to /student/homework */}
          <div 
            onClick={() => router.push('/student/homework')}
            className="bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/15 rounded-2xl p-5 flex justify-between items-start transition-all cursor-pointer group hover:-translate-y-1 hover:shadow-2xl"
          >
            <div>
              <p className="text-[11px] font-extrabold tracking-widest text-blue-200 uppercase group-hover:text-amber-300 transition-colors">PENDING TASKS</p>
              <p className="text-3xl font-extrabold mt-1">{pendingCount}</p>
              <p className="text-xs text-blue-200/80 mt-1 flex items-center gap-1">
                <span>{pendingCount > 0 ? '1 due tomorrow' : 'All caught up!'}</span>
                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white group-hover:bg-amber-400 group-hover:text-black transition-all font-bold">Open Homework →</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-white/15 group-hover:bg-amber-400 group-hover:text-black flex items-center justify-center text-xl transition-all">🎯</div>
          </div>

          {/* 3. RECENT SCORE CARD -> Direct Link to /student/tutor */}
          <div 
            onClick={() => router.push('/student/tutor')}
            className="bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/15 rounded-2xl p-5 flex justify-between items-start transition-all cursor-pointer group hover:-translate-y-1 hover:shadow-2xl"
          >
            <div>
              <p className="text-[11px] font-extrabold tracking-widest text-blue-200 uppercase group-hover:text-amber-300 transition-colors">RECENT SCORE</p>
              <p className="text-3xl font-extrabold mt-1">18<span className="text-lg text-blue-200/70">/20</span></p>
              <p className="text-xs text-blue-200/80 mt-1 flex items-center gap-1">
                <span>Trigonometry quiz</span>
                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white group-hover:bg-amber-400 group-hover:text-black transition-all font-bold">Open AI Tutor →</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-white/15 group-hover:bg-amber-400 group-hover:text-black flex items-center justify-center text-xl transition-all">🏅</div>
          </div>
        </div>
      </div>

      {/* ── Main Dashboard Section ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Card: TML by Subject */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-bold text-[#002147]">Your TML by Subject</h2>
            <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-blue-50 text-blue-600">LIVE</span>
          </div>
          <p className="text-xs text-slate-500 mb-5">True Mastery Level blends classwork, graded homework, quizzes, tutor depth and attendance.</p>

          <div className="space-y-4">
            {[
              ['Mathematics', 78, 'Strong on Algebra, weak on Circles'],
              ['Science', 71, 'Chemical Reactions needs revision'],
              ['Social Studies', 64, 'Nationalism topics improving'],
              ['English', 83, 'Consistently strong'],
              ['Hindi', 69, 'Grammar drills recommended'],
            ].map(([s, v, n]) => (
              <div key={s as string} className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
                <div className="flex-1">
                  <p className="font-bold text-sm text-[#002147]">{s}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{n}</p>
                </div>
                {bar(v as number)}
                <span className="w-12 text-right font-extrabold text-sm" style={{ color: hmColor(v as number) }}>{v}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Section: Due Next & AI Learning Path */}
        <div className="space-y-6">
          {/* Due Next Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm">
            <h2 className="text-xl font-bold text-[#002147] mb-1">Due Next</h2>
            <p className="text-xs text-slate-500 mb-4">Tap any assignment below to open instructions &amp; submit work.</p>

            <div className="space-y-3">
              {homeworkList.map(hw => (
                <div
                  key={hw.id}
                  onClick={() => handleOpenHwModal(hw)}
                  className="flex items-center gap-4 p-3.5 rounded-2xl border border-slate-100 hover:bg-slate-50 transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg shrink-0">📄</div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">{hw.subject}</span>
                    <p className="font-bold text-sm text-[#002147] group-hover:text-blue-600 transition-colors truncate">{hw.title}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-lg text-xs font-bold shrink-0 ${
                    hw.status === 'SUBMITTED' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  }`}>
                    {hw.status === 'SUBMITTED' ? '✓ SUBMITTED' : hw.dueDate}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Learning Path Card */}
          <div className="bg-gradient-to-r from-[#123F84] to-[#0F5AB8] rounded-3xl p-6 text-white shadow-md">
            <div className="flex gap-4 items-start">
              <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center text-2xl shrink-0">🧠</div>
              <div>
                <h3 className="text-lg font-bold">Your AI Learning Path</h3>
                <p className="text-xs text-blue-100 leading-relaxed mt-2">
                  Circles is your lowest micro-topic at <b className="text-amber-300">31%</b>. Clear the 3-step Socratic module before Friday's test.
                </p>
                <button
                  onClick={() => router.push('/student/tutor')}
                  className="mt-4 px-5 py-2.5 rounded-xl bg-white text-[#002147] font-bold text-xs hover:bg-blue-50 transition-all flex items-center gap-2"
                >
                  Start with the AI Tutor <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Functional Homework Submission Workspace Modal ───────────────── */}
      {selectedHw && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedHw(null)}>
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedHw(null)} className="absolute top-6 right-6 w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">✕</button>

            <span className="text-xs font-extrabold tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">{selectedHw.subject}</span>
            <h2 className="text-2xl font-extrabold text-[#002147] mt-3">{selectedHw.title}</h2>
            <p className="text-xs text-slate-500 mt-1 mb-5">Deadline: {selectedHw.dueDate} · Status: <b>{selectedHw.status}</b></p>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 mb-6">
              <p className="text-xs font-extrabold text-[#002147] uppercase">TEACHER INSTRUCTIONS</p>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{selectedHw.instructions}</p>
            </div>

            {selectedHw.status === 'SUBMITTED' ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-emerald-900">
                <p className="font-bold text-base">✓ Homework Submitted &amp; Evaluated</p>
                <p className="text-3xl font-extrabold my-2">Score: {selectedHw.score}</p>
                <p className="text-xs text-emerald-700">{selectedHw.feedback}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitHw} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Write your response / step-by-step working:</label>
                  <textarea
                    value={submissionText}
                    onChange={e => setSubmissionText(e.target.value)}
                    placeholder="Type your final equations, reasoning, or answers here..."
                    rows={4}
                    required
                    className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${
                  submittedFile ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-300 hover:bg-blue-50/50'
                }`}>
                  {submittedFile ? (
                    <span className="text-xs font-bold text-emerald-700">📎 {submittedFile} uploaded successfully!</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSubmittedFile('Handwritten_Solution_NCERT.pdf')}
                      className="text-xs font-bold text-blue-600 hover:underline"
                    >
                      📷 Upload Handwritten Solution Photo / PDF
                    </button>
                  )}
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setSelectedHw(null)} className="px-5 py-2.5 rounded-xl border border-slate-200 font-bold text-xs text-slate-600">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 transition-all shadow-md">
                    {isSubmitting ? 'Evaluating with AI...' : 'Submit Homework →'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
