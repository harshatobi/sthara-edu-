'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, TrendingUp, BookOpen, AlertTriangle, CheckCircle2, Minus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TopicRow {
  unitId: string;
  unitLabel: string;
  score: number | null;       // average % score across submissions for this unit
  submissionCount: number;
}

interface SubjectBlock {
  subject: string;
  overallScore: number | null;
  topics: TopicRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const UNIT_ORDER = ['unit_1', 'unit_2', 'unit_3', 'unit_4', 'unit_5', 'general'];
const UNIT_LABEL: Record<string, string> = {
  unit_1: 'Unit I',
  unit_2: 'Unit II',
  unit_3: 'Unit III',
  unit_4: 'Unit IV',
  unit_5: 'Unit V',
  general: 'General',
};

function heatCell(score: number | null) {
  if (score === null)  return { bg: 'bg-gray-100',    text: 'text-gray-400',    border: 'border-gray-200',    icon: null,         label: 'No data' };
  if (score >= 75)     return { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', icon: 'check',      label: `${score}%` };
  if (score >= 50)     return { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   icon: 'trend',      label: `${score}%` };
  return                { bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     icon: 'alert',      label: `${score}%` };
}

function barColor(score: number | null) {
  if (score === null) return 'bg-gray-200';
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-400';
  return 'bg-red-500';
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MasteryModal({ profile, onClose }: { profile: any; onClose: () => void }) {
  const supabase = createClient();
  const [blocks, setBlocks] = useState<SubjectBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.uid) return;

    const buildHeatmap = async () => {
      setLoading(true);
      try {
        // 1. Fetch all of the student's graded submissions
        const { data: subs } = await supabase
          .from('submissions')
          .select('assignment_id, score, max_score, teacher_approved')
          .eq('student_id', profile.uid)
          .not('score', 'is', null)
          .not('max_score', 'is', null);

        if (!subs || subs.length === 0) {
          setBlocks([]);
          return;
        }

        // 2. Fetch the assignments those submissions belong to
        const assignIds = [...new Set(subs.map(s => s.assignment_id))];
        const { data: assigns } = await supabase
          .from('assignments')
          .select('id, subject, units, title')
          .in('id', assignIds);

        if (!assigns || assigns.length === 0) {
          setBlocks([]);
          return;
        }

        // 3. Build a lookup: assignmentId → assignment
        const assignMap: Record<string, any> = {};
        assigns.forEach(a => { assignMap[a.id] = a; });

        // 4. Group submissions by subject → unit → scores[]
        // Structure: { subject: { unitId: number[] } }
        const grouped: Record<string, Record<string, number[]>> = {};

        subs.forEach(sub => {
          const assign = assignMap[sub.assignment_id];
          if (!assign) return;
          const subject = assign.subject || 'General';
          const pct = Math.round((sub.score / sub.max_score) * 100);

          if (!grouped[subject]) grouped[subject] = {};

          const rawUnits: string[] = Array.isArray(assign.units) && assign.units.length > 0
            ? assign.units.filter(u => u !== 'general' && u !== 'General')
            : [];
          
          const fallbackTopic = assign.title
            ? assign.title.trim().charAt(0).toUpperCase() + assign.title.trim().slice(1)
            : 'Core Concepts';

          const units: string[] = rawUnits.length > 0 ? rawUnits : [fallbackTopic];

          units.forEach(unitId => {
            if (!grouped[subject][unitId]) grouped[subject][unitId] = [];
            grouped[subject][unitId].push(pct);
          });
        });

        // 5. Convert to SubjectBlock[]
        const result: SubjectBlock[] = Object.entries(grouped).map(([subject, unitMap]) => {
          const topics: TopicRow[] = UNIT_ORDER
            .filter(u => u !== 'general' && unitMap[u])
            .map(u => {
              const scores = unitMap[u];
              const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
              const label = UNIT_LABEL[u] || (u.charAt(0).toUpperCase() + u.slice(1));
              return {
                unitId: u,
                unitLabel: label,
                score: avg,
                submissionCount: scores.length,
              };
            });

          // Also pick up any custom unit IDs not in UNIT_ORDER
          Object.keys(unitMap)
            .filter(u => !UNIT_ORDER.includes(u) && u !== 'general')
            .forEach(u => {
              const scores = unitMap[u];
              const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
              const label = u.charAt(0).toUpperCase() + u.slice(1);
              topics.push({ unitId: u, unitLabel: label, score: avg, submissionCount: scores.length });
            });

          const allScores = topics.map(t => t.score).filter(s => s !== null) as number[];
          const overall = allScores.length
            ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
            : null;

          return { subject, overallScore: overall, topics };
        });

        // Sort: subjects with most topics first
        result.sort((a, b) => b.topics.length - a.topics.length);
        setBlocks(result);
        if (result.length > 0) setSelectedSubject(result[0].subject);
      } catch (err) {
        console.error('[MasteryModal]', err);
      } finally {
        setLoading(false);
      }
    };

    buildHeatmap();
  }, [profile?.uid]);

  const activeBlock = blocks.find(b => b.subject === selectedSubject) ?? null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#002147]/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#002147] to-[#003b80] p-6 text-white flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-2xl font-black">📊 My Performance Heatmap</h2>
            <p className="text-blue-200 text-sm mt-1">
              Based on your graded submissions — unit by unit
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-red-500 transition-all">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-3" />
              <p className="text-gray-500 font-medium">Computing your heatmap from real data…</p>
            </div>
          ) : blocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center p-8">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <BookOpen className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="font-black text-gray-600 text-lg">No graded work yet</h3>
              <p className="text-gray-400 text-sm mt-2 max-w-xs">
                Complete and submit assignments. Once your teacher grades them, your heatmap will appear here.
              </p>
            </div>
          ) : (
            <div className="p-6 space-y-6">

              {/* Subject tabs */}
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {blocks.map(b => {
                  const cell = heatCell(b.overallScore);
                  const isActive = b.subject === selectedSubject;
                  return (
                    <button
                      key={b.subject}
                      onClick={() => setSelectedSubject(b.subject)}
                      className={`flex-shrink-0 px-5 py-2.5 rounded-2xl font-bold text-sm transition-all whitespace-nowrap border ${
                        isActive
                          ? 'bg-[#002147] text-white border-[#002147] shadow-md'
                          : `${cell.bg} ${cell.text} ${cell.border} hover:opacity-80`
                      }`}
                    >
                      {b.subject}
                      {b.overallScore !== null && (
                        <span className={`ml-2 text-xs font-black ${isActive ? 'text-blue-200' : ''}`}>
                          {b.overallScore}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Overall subject score card */}
              {activeBlock && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-black text-[#002147] text-lg">{activeBlock.subject}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {activeBlock.topics.length} unit{activeBlock.topics.length !== 1 ? 's' : ''} assessed •{' '}
                        {activeBlock.topics.reduce((s, t) => s + t.submissionCount, 0)} total submissions
                      </p>
                    </div>
                    {activeBlock.overallScore !== null && (
                      <div className={`text-3xl font-black px-5 py-2 rounded-2xl ${heatCell(activeBlock.overallScore).bg} ${heatCell(activeBlock.overallScore).text}`}>
                        {activeBlock.overallScore}%
                      </div>
                    )}
                  </div>
                  {/* Subject progress bar */}
                  <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all duration-1000 ${barColor(activeBlock.overallScore)}`}
                      style={{ width: `${activeBlock.overallScore ?? 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 font-semibold mt-1.5">
                    <span>Beginner</span><span>Developing</span><span>Mastered</span>
                  </div>
                </div>
              )}

              {/* Unit-level heatmap grid */}
              {activeBlock && activeBlock.topics.length > 0 && (
                <div>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
                    Unit-Level Breakdown
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeBlock.topics.map(topic => {
                      const cell = heatCell(topic.score);
                      return (
                        <div
                          key={topic.unitId}
                          className={`p-4 rounded-2xl border ${cell.bg} ${cell.border} flex items-center gap-4`}
                        >
                          {/* Icon */}
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            topic.score === null ? 'bg-gray-200' :
                            topic.score >= 75 ? 'bg-emerald-500' :
                            topic.score >= 50 ? 'bg-amber-400' : 'bg-red-500'
                          }`}>
                            {topic.score === null ? (
                              <Minus className="w-5 h-5 text-gray-400" />
                            ) : topic.score >= 75 ? (
                              <CheckCircle2 className="w-5 h-5 text-white" />
                            ) : topic.score >= 50 ? (
                              <TrendingUp className="w-5 h-5 text-white" />
                            ) : (
                              <AlertTriangle className="w-5 h-5 text-white" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className={`font-black text-sm ${cell.text}`}>{topic.unitLabel}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {topic.submissionCount} submission{topic.submissionCount !== 1 ? 's' : ''}
                            </div>
                            {/* Bar */}
                            <div className="w-full bg-white/60 rounded-full h-1.5 mt-2 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full ${barColor(topic.score)}`}
                                style={{ width: `${topic.score ?? 0}%`, transition: 'width 1s ease-out' }}
                              />
                            </div>
                          </div>

                          {/* Score badge */}
                          <div className={`text-xl font-black ${cell.text} shrink-0`}>
                            {topic.score !== null ? `${topic.score}%` : '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Legend */}
              <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-100 text-xs font-semibold text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />≥75% Mastered
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />50–74% Developing
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />&lt;50% Needs work
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />No submissions
                </span>
                <span className="ml-auto text-gray-400">Updated from graded submissions</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
