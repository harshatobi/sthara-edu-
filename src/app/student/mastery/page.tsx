'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import {
  TrendingUp, AlertTriangle, CheckCircle2, Minus,
  Loader2, BookOpen, ChevronRight, Award, Target, Sparkles, BarChart2
} from 'lucide-react';

interface UnitRow {
  unitId: string;
  unitLabel: string;
  score: number | null;
  submissionCount: number;
}

interface SubjectBlock {
  subject: string;
  overallScore: number | null;
  units: UnitRow[];
}

const UNIT_ORDER = ['unit_1', 'unit_2', 'unit_3', 'unit_4', 'unit_5'];
const UNIT_LABEL: Record<string, string> = {
  unit_1: 'Unit I: Core Foundations',
  unit_2: 'Unit II: Advanced Concepts',
  unit_3: 'Unit III: Practical Applications',
  unit_4: 'Unit IV: Problem Solving',
  unit_5: 'Unit V: Revision & Synthesis',
};

function scoreColor(s: number | null, itemCount: number = 4) {
  if (s === null || itemCount < 4) {
    return { bg: 'bg-gray-100/90', text: 'text-gray-400', bar: 'bg-gray-300', border: 'border-gray-200', badge: 'bg-gray-200 text-gray-600', band: 'insufficient', label: 'Insufficient Evidence' };
  }
  if (s >= 75)   return { bg: 'bg-emerald-50/80', text: 'text-emerald-700', bar: 'bg-emerald-500', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-800', band: itemCount < 8 ? 'provisional' : 'firm', label: `${s}%` };
  if (s >= 50)   return { bg: 'bg-amber-50/80', text: 'text-amber-700', bar: 'bg-amber-400', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-800', band: itemCount < 8 ? 'provisional' : 'firm', label: `${s}%` };
  return           { bg: 'bg-red-50/80', text: 'text-red-700', bar: 'bg-red-500', border: 'border-red-200', badge: 'bg-red-100 text-red-800', band: itemCount < 8 ? 'provisional' : 'firm', label: `${s}%` };
}

function overallGrade(s: number | null): string {
  if (s === null) return '—';
  if (s >= 90) return 'A+';
  if (s >= 80) return 'A';
  if (s >= 70) return 'B';
  if (s >= 60) return 'C';
  return 'D';
}

export default function StudentMasteryPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [blocks, setBlocks] = useState<SubjectBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.uid) return;

    const buildHeatmap = async () => {
      setLoading(true);
      try {
        const { data: subs, error: subErr } = await supabase
          .from('submissions')
          .select('assignment_id, score, max_score, teacher_approved')
          .eq('student_id', profile.uid);

        if (subErr) console.error('[MasteryPage] submissions error:', subErr);
        if (!subs || subs.length === 0) { setBlocks([]); return; }

        const allAssignIds = [...new Set(subs.map(s => s.assignment_id))];
        const { data: assigns, error: assignErr } = await supabase
          .from('assignments')
          .select('id, subject, units, title')
          .in('id', allAssignIds);

        if (assignErr) console.error('[MasteryPage] assignments error:', assignErr);
        if (!assigns || assigns.length === 0) { setBlocks([]); return; }

        const assignMap: Record<string, any> = {};
        assigns.forEach(a => { assignMap[a.id] = a; });

        const grouped: Record<string, Record<string, number[]>> = {};

        subs.forEach(sub => {
          const assign = assignMap[sub.assignment_id];
          if (!assign) return;
          const subject = assign.subject || 'General';
          if (sub.score === null || sub.max_score === null || sub.max_score === 0) return;

          const pct = Math.round((sub.score / sub.max_score) * 100);
          if (!grouped[subject]) grouped[subject] = {};

          const rawUnits: string[] = Array.isArray(assign.units) && assign.units.length > 0
            ? assign.units.filter(u => u !== 'general' && u !== 'General')
            : [];
          
          const fallbackTopic = assign.title
            ? assign.title.trim().charAt(0).toUpperCase() + assign.title.trim().slice(1)
            : 'Core Concepts';

          const units: string[] = rawUnits.length > 0 ? rawUnits : [fallbackTopic];

          units.forEach(uid => {
            if (!grouped[subject][uid]) grouped[subject][uid] = [];
            grouped[subject][uid].push(Math.min(100, Math.max(0, pct)));
          });
        });

        const result: SubjectBlock[] = Object.entries(grouped).map(([subject, unitMap]) => {
          const ordered = UNIT_ORDER.filter(u => unitMap[u]);
          const extras  = Object.keys(unitMap).filter(u => !UNIT_ORDER.includes(u) && u !== 'general');

          const units: UnitRow[] = [...ordered, ...extras].map(u => {
            const scores = unitMap[u];
            const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
            const label = UNIT_LABEL[u] || (u.charAt(0).toUpperCase() + u.slice(1));
            return { unitId: u, unitLabel: label, score: avg, submissionCount: scores.length };
          });

          const allScores = units.map(t => t.score).filter(Boolean) as number[];
          const overall = allScores.length
            ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
            : null;

          return { subject, overallScore: overall, units };
        });

        result.sort((a, b) => b.units.length - a.units.length);
        setBlocks(result);
        if (result.length > 0) setSelectedSubject(result[0].subject);
      } catch (err) {
        console.error('[MasteryPage]', err);
      } finally {
        setLoading(false);
      }
    };

    buildHeatmap();
  }, [profile?.uid]);

  const overallAll = (() => {
    if (!blocks.length) return null;
    const all = blocks.map(b => b.overallScore).filter(Boolean) as number[];
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : null;
  })();

  const weakest = (() => {
    let min: { subject: string; unitLabel: string; score: number } | null = null;
    blocks.forEach(b => {
      b.units.forEach(u => {
        if (u.score !== null && (min === null || u.score < min.score)) {
          min = { subject: b.subject, unitLabel: u.unitLabel, score: u.score };
        }
      });
    });
    return min as { subject: string; unitLabel: string; score: number } | null;
  })();

  const activeBlock = blocks.find(b => b.subject === selectedSubject) ?? blocks[0] ?? null;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16 animate-in fade-in duration-500">
      {/* Top Header Card */}
      <div className="relative bg-gradient-to-br from-[#002147] via-[#003b80] to-[#001a33] rounded-[2.5rem] p-8 md:p-10 text-white shadow-2xl overflow-hidden border border-white/10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="bg-white/15 backdrop-blur-md px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-blue-200 border border-white/15 flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5 text-blue-300" /> Topic & Unit Mastery
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white mb-2">
              My Mastery Heatmap
            </h1>
            <p className="text-blue-100 text-sm md:text-base max-w-xl font-medium opacity-90 leading-relaxed">
              Track your subject performance, topic strengths, and areas needing improvement based on real graded work.
            </p>
          </div>

          {/* Overall Performance Circle Badge */}
          {overallAll !== null && (
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-6 rounded-3xl flex items-center gap-5 shadow-xl shrink-0">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke={overallAll >= 75 ? '#10b981' : overallAll >= 50 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="3"
                    strokeDasharray={`${overallAll} ${100 - overallAll}`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute font-black text-sm text-white">{overallAll}%</span>
              </div>
              <div>
                <p className="text-xs font-bold text-blue-200 uppercase tracking-wider">Overall Score</p>
                <p className="text-3xl font-black text-white mt-0.5">Grade {overallGrade(overallAll)}</p>
                <p className="text-[11px] text-blue-100 mt-0.5">{blocks.length} subject{blocks.length !== 1 ? 's' : ''} assessed</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Weakest Unit Alert */}
      {weakest && (weakest as any).score < 75 && (
        <div className="bg-amber-50/90 border-2 border-amber-200/80 rounded-2xl p-5 flex items-start gap-4 shadow-sm">
          <div className="w-10 h-10 bg-amber-400 text-white rounded-xl flex items-center justify-center shrink-0 font-bold mt-0.5 shadow-md">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-amber-900 text-sm">Recommended Focus Area</h4>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              Your mastery in <strong className="font-extrabold text-amber-950">{(weakest as any).unitLabel}</strong> ({(weakest as any).subject}) is currently at <strong className="font-black text-amber-950">{(weakest as any).score}%</strong>. Review relevant notes or complete extra practice to boost this topic.
            </p>
          </div>
        </div>
      )}

      {/* Main Heatmap Section */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-8 space-y-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-3" />
            <p className="font-bold text-sm text-gray-600">Analyzing graded submissions & building heatmap...</p>
          </div>
        ) : blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4 text-blue-500">
              <BookOpen className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-black text-[#002147] mb-2">No Graded Submissions Yet</h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-6">
              Complete your homework and assignments. Once graded, your detailed topic heatmap will automatically generate here.
            </p>
          </div>
        ) : (
          <>
            {/* Subject Tabs */}
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide border-b border-gray-100">
              {blocks.map(b => {
                const c = scoreColor(b.overallScore);
                const isActive = b.subject === selectedSubject;
                return (
                  <button
                    key={b.subject}
                    onClick={() => setSelectedSubject(b.subject)}
                    className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl font-bold text-sm transition-all whitespace-nowrap border ${
                      isActive
                        ? 'bg-[#002147] text-white border-[#002147] shadow-lg scale-[1.02]'
                        : `${c.bg} ${c.text} ${c.border} hover:border-indigo-300`
                    }`}
                  >
                    <span>{b.subject}</span>
                    {b.overallScore !== null && (
                      <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : c.badge}`}>
                        {b.overallScore}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Subject Breakdown */}
            {activeBlock && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 rounded-2xl border border-gray-200 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-extrabold text-[#002147]">{activeBlock.subject}</h3>
                    <p className="text-xs text-gray-500 font-medium mt-1">
                      {activeBlock.units.length} unit{activeBlock.units.length !== 1 ? 's' : ''} assessed across {activeBlock.units.reduce((s, u) => s + u.submissionCount, 0)} submission{activeBlock.units.reduce((s, u) => s + u.submissionCount, 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {activeBlock.overallScore !== null && (
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Subject Average</span>
                        <span className="text-2xl font-black text-[#002147]">{activeBlock.overallScore}%</span>
                      </div>
                      <div className={`text-2xl font-black px-4 py-2 rounded-2xl ${scoreColor(activeBlock.overallScore).badge}`}>
                        Grade {overallGrade(activeBlock.overallScore)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Unit / Topic Grid */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider px-1">
                    Curriculum Unit Breakdown
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeBlock.units.map(unit => {
                      const uc = scoreColor(unit.score, unit.submissionCount);
                      return (
                        <div
                          key={unit.unitId}
                          className={`p-5 rounded-2xl border ${uc.bg} ${uc.border} flex items-center gap-4 shadow-sm hover:shadow-md transition-all`}
                        >
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${uc.bar}`}>
                            {unit.score === null || unit.submissionCount < 4 ? (
                              <Minus className="w-6 h-6 text-gray-400" />
                            ) : unit.score >= 75 ? (
                              <CheckCircle2 className="w-6 h-6 text-white" />
                            ) : unit.score >= 50 ? (
                              <TrendingUp className="w-6 h-6 text-white" />
                            ) : (
                              <AlertTriangle className="w-6 h-6 text-white" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h5 className={`font-black text-base truncate ${uc.text}`}>{unit.unitLabel}</h5>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {uc.band === 'provisional' && (
                                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                                    Provisional
                                  </span>
                                )}
                                {uc.band === 'insufficient' && (
                                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 border border-gray-300">
                                    Grey (0-3 items)
                                  </span>
                                )}
                                <span className={`text-base font-black ${uc.text}`}>
                                  {unit.score !== null && unit.submissionCount >= 4 ? `${unit.score}%` : '—'}
                                </span>
                              </div>
                            </div>
                            <div className="w-full bg-white/70 rounded-full h-2 mt-2 overflow-hidden border border-black/5">
                              <div
                                className={`h-2 rounded-full transition-all duration-700 ${uc.bar}`}
                                style={{ width: `${unit.submissionCount < 4 ? 0 : (unit.score ?? 0)}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-400 font-medium mt-1.5">
                              {unit.submissionCount} item{unit.submissionCount !== 1 ? 's' : ''} recorded {unit.submissionCount < 4 ? '(needs ≥4 for score)' : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-6 pt-4 border-t border-gray-100 text-xs font-semibold text-gray-500">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-sm" /> ≥75% Mastered
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-400 inline-block shadow-sm" /> 50–74% Developing
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500 inline-block shadow-sm" /> &lt;50% Needs Work
              </span>
              <span className="ml-auto text-gray-400 font-medium">Auto-updated from graded homework</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
