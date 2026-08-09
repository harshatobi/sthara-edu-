'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  TrendingUp, AlertTriangle, CheckCircle2, Minus,
  Loader2, BookOpen, ChevronDown, ChevronUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
const UNIT_ORDER = ['unit_1', 'unit_2', 'unit_3', 'unit_4', 'unit_5', 'general'];
const UNIT_LABEL: Record<string, string> = {
  unit_1: 'Unit I', unit_2: 'Unit II', unit_3: 'Unit III',
  unit_4: 'Unit IV', unit_5: 'Unit V', general: 'General',
};

function scoreColor(s: number | null): {
  bar: string; bg: string; text: string; dot: string; ring: string;
} {
  if (s === null) return { bar: 'bg-gray-200', bg: 'bg-gray-50',     text: 'text-gray-400',    dot: 'bg-gray-300',   ring: 'ring-gray-200' };
  if (s >= 75)   return { bar: 'bg-emerald-500', bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'ring-emerald-200' };
  if (s >= 50)   return { bar: 'bg-amber-400',   bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-400',   ring: 'ring-amber-200' };
  return           { bar: 'bg-red-500',    bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500',     ring: 'ring-red-200' };
}

function overallGrade(s: number | null): string {
  if (s === null) return '—';
  if (s >= 90) return 'A';
  if (s >= 80) return 'B';
  if (s >= 70) return 'C';
  if (s >= 60) return 'D';
  return 'F';
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StudentHeatmapSidebar({ profile }: { profile: any }) {
  const supabase = createClient();
  const [blocks, setBlocks] = useState<SubjectBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!profile?.uid) return;

    const buildHeatmap = async () => {
      setLoading(true);
      try {
        // 1. ALL submissions for this student (AI-graded OR teacher-graded)
        // We show score-based data when available, pending state when not yet graded
        const { data: subs, error: subErr } = await supabase
          .from('submissions')
          .select('assignment_id, score, max_score, teacher_approved')
          .eq('student_id', profile.uid);

        if (subErr) console.error('[Heatmap] submissions query error:', subErr);
        if (!subs || subs.length === 0) { setBlocks([]); return; }

        // Only use submissions that have a numeric score
        const scoredSubs = subs.filter(s => s.score !== null && s.max_score !== null && s.max_score > 0);

        // 2. Assignments those submissions belong to
        const allAssignIds = [...new Set(subs.map(s => s.assignment_id))];
        const { data: assigns, error: assignErr } = await supabase
          .from('assignments')
          .select('id, subject, units, title')
          .in('id', allAssignIds);

        if (assignErr) console.error('[Heatmap] assignments query error:', assignErr);
        if (!assigns || assigns.length === 0) { setBlocks([]); return; }

        const assignMap: Record<string, any> = {};
        assigns.forEach(a => { assignMap[a.id] = a; });

        // 3. Group: subject → unitId → scores[] (only from scored subs)
        const grouped: Record<string, Record<string, number[]>> = {};
        // Also track subjects that have any submission (for pending display)
        const pendingSubjects = new Set<string>();

        subs.forEach(sub => {
          const assign = assignMap[sub.assignment_id];
          if (!assign) return;
          const subject = assign.subject || 'General';
          if (sub.score === null || sub.max_score === null || sub.max_score === 0) {
            pendingSubjects.add(subject);
            return;
          }
          const pct = Math.round((sub.score / sub.max_score) * 100);
          if (!grouped[subject]) grouped[subject] = {};

          // Determine units/topics for this assignment
          const rawUnits: string[] = Array.isArray(assign.units) && assign.units.length > 0
            ? assign.units.filter(u => u !== 'general' && u !== 'General')
            : [];
          
          // If no units tagged, use the assignment title formatted as a topic name
          const fallbackTopic = assign.title
            ? assign.title.trim().charAt(0).toUpperCase() + assign.title.trim().slice(1)
            : 'Core Concepts';

          const units: string[] = rawUnits.length > 0 ? rawUnits : [fallbackTopic];

          units.forEach(uid => {
            if (!grouped[subject][uid]) grouped[subject][uid] = [];
            grouped[subject][uid].push(Math.min(100, Math.max(0, pct)));
          });
        });

        // Add pending subjects as empty blocks if not already in grouped
        pendingSubjects.forEach(sub => {
          if (!grouped[sub]) grouped[sub] = {};
        });

        // 4. Convert to SubjectBlock[]
        const result: SubjectBlock[] = Object.entries(grouped).map(([subject, unitMap]) => {
          const ordered = UNIT_ORDER.filter(u => u !== 'general' && unitMap[u]);
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

        // Default: expand the first subject
        if (result.length > 0) setExpanded({ [result[0].subject]: true });
      } catch (err) {
        console.error('[StudentHeatmapSidebar]', err);
      } finally {
        setLoading(false);
      }
    };

    buildHeatmap();
  }, [profile?.uid]);

  const toggle = (subject: string) =>
    setExpanded(prev => ({ ...prev, [subject]: !prev[subject] }));

  // ── Overall mastery across all subjects ───────────────────────────────────
  const overallAll = (() => {
    if (!blocks.length) return null;
    const all = blocks.map(b => b.overallScore).filter(Boolean) as number[];
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : null;
  })();

  // ── Weakest unit (for the "focus" tip) ────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.06)] overflow-hidden flex flex-col">

      {/* Sidebar Header */}
      <div className="bg-gradient-to-br from-[#002147] to-[#003b80] px-5 py-5 text-white">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <span className="font-black text-sm tracking-wide uppercase">My Mastery Heatmap</span>
        </div>

        {/* Overall score ring */}
        {loading ? (
          <div className="flex items-center gap-2 mt-1">
            <Loader2 className="w-4 h-4 animate-spin text-blue-200" />
            <span className="text-blue-200 text-xs">Computing…</span>
          </div>
        ) : overallAll !== null ? (
          <div className="flex items-end gap-3">
            <div>
              <p className="text-blue-200 text-xs font-semibold">Overall Performance</p>
              <p className="text-4xl font-black mt-0.5">
                {overallAll}%
                <span className="text-xl ml-2 text-blue-200 font-bold">
                  {overallGrade(overallAll)}
                </span>
              </p>
            </div>
            {/* Mini progress arc */}
            <div className="ml-auto">
              <div className="relative w-12 h-12">
                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke={overallAll >= 75 ? '#10b981' : overallAll >= 50 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="3"
                    strokeDasharray={`${overallAll} ${100 - overallAll}`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white">
                  {overallAll}%
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-blue-200 text-xs mt-1">Submit work to see your scores here.</p>
        )}

        {/* Weakest unit tip */}
        {weakest && weakest.score < 75 && (
          <div className="mt-3 flex items-start gap-2 bg-white/10 rounded-xl p-2.5 border border-white/10">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-100 leading-relaxed">
              Focus on <strong className="text-white">{weakest.unitLabel}</strong> in{' '}
              <strong className="text-white">{weakest.subject}</strong> — {weakest.score}% mastery
            </p>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">

        {loading && (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm font-medium">Building heatmap…</p>
          </div>
        )}

        {!loading && blocks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center px-6">
            <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mb-3">
              <BookOpen className="w-7 h-7 text-amber-400" />
            </div>
            <p className="font-bold text-gray-600 text-sm">No submissions yet</p>
            <p className="text-gray-400 text-xs mt-1 leading-relaxed">
              Complete your assignments. Your mastery heatmap builds automatically from your graded work.
            </p>
          </div>
        )}

        {!loading && blocks.map(block => {
          const isOpen = !!expanded[block.subject];
          const c = scoreColor(block.overallScore);

          return (
            <div key={block.subject}>
              {/* Subject header row — clickable to expand */}
              <button
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                onClick={() => toggle(block.subject)}
              >
                {/* Colour dot */}
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#002147] text-sm truncate">{block.subject}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {block.units.length} unit{block.units.length !== 1 ? 's' : ''} assessed
                  </p>
                </div>

                {/* Overall badge */}
                <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${c.bg} ${c.text} shrink-0`}>
                  {block.overallScore !== null ? `${block.overallScore}%` : '—'}
                </span>

                {isOpen
                  ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                }
              </button>

              {/* Unit breakdown — only when expanded */}
              {isOpen && (
                <div className="bg-gray-50 px-4 pb-3 pt-1 space-y-2">
                  {block.units.map(unit => {
                    const uc = scoreColor(unit.score);
                    return (
                      <div
                        key={unit.unitId}
                        className={`rounded-xl border ${uc.bg} ${uc.ring} ring-1 p-3 flex items-center gap-3`}
                      >
                        {/* Icon */}
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${uc.bar}`}>
                          {unit.score === null ? (
                            <Minus className="w-3.5 h-3.5 text-gray-400" />
                          ) : unit.score >= 75 ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          ) : unit.score >= 50 ? (
                            <TrendingUp className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-white" />
                          )}
                        </div>

                        {/* Label + bar */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-black ${uc.text}`}>{unit.unitLabel}</span>
                            <span className={`text-xs font-black ${uc.text}`}>
                              {unit.score !== null ? `${unit.score}%` : '—'}
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-white/60 rounded-full h-1.5 mt-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-700 ${uc.bar}`}
                              style={{ width: `${unit.score ?? 0}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {unit.submissionCount} submission{unit.submissionCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer legend */}
      {!loading && blocks.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex flex-wrap gap-3 text-[10px] font-semibold text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />≥75% Mastered</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />50–74% Developing</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />&lt;50% Needs work</span>
        </div>
      )}
    </div>
  );
}
