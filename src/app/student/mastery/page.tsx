'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { mapMasteryBand, MasteryBand } from '@/lib/tml/engine';
import {
  TrendingUp, AlertTriangle, CheckCircle2, Minus, RefreshCw,
  Loader2, BookOpen, BarChart2, Calendar, FileSpreadsheet, Printer
} from 'lucide-react';

interface TopicRow {
  topicName: string;
  score: number | null;
  confidenceBand: 'insufficient' | 'provisional' | 'firm';
  itemCount: number;
  computedAt: string;
}

interface SubjectBlock {
  subject: string;
  overallScore: number | null;
  topics: TopicRow[];
}

type DateFilterOption = 'all' | '30days' | '7days';

// Inline styles keyed off the exact spec hex values (Tailwind can't take dynamic hex classes).
function bandVisuals(score: number | null) {
  const band = mapMasteryBand(score);
  if (!band) return { color: '#a9b8c8', bg: '#eef3f8', border: '#e2e9f1', name: 'No Data', action: 'Complete graded work to generate a score.' };
  return { color: band.color, bg: `${band.color}1A`, border: `${band.color}55`, name: band.band, action: band.action };
}

export default function StudentMasteryPage() {
  const { profile, getAuthToken } = useAuth();
  const supabase = createClient();
  const [blocks, setBlocks] = useState<SubjectBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('all');

  const loadFromTmlScores = useCallback(async () => {
    if (!profile?.uid) return;
    setLoading(true);
    try {
      let asOf: string | null = null;
      if (dateFilter === '30days') asOf = new Date(Date.now() - 30 * 86400000).toISOString();
      else if (dateFilter === '7days') asOf = new Date(Date.now() - 7 * 86400000).toISOString();

      let query = supabase
        .from('tml_scores')
        .select('subject, topic_name, score, confidence_band, item_count, computed_at')
        .eq('student_id', profile.uid)
        .order('computed_at', { ascending: false });
      if (asOf) query = query.lte('computed_at', asOf);

      const { data, error } = await query;
      if (error) { console.error('[MasteryPage] tml_scores error:', error); setBlocks([]); return; }

      // Latest snapshot per (subject, topic_name) at or before the selected point in time.
      const latestPerTopic = new Map<string, any>();
      (data || []).forEach(row => {
        const key = `${row.subject}::${row.topic_name}`;
        if (!latestPerTopic.has(key)) latestPerTopic.set(key, row);
      });

      const grouped: Record<string, TopicRow[]> = {};
      latestPerTopic.forEach(row => {
        const subject = row.subject || 'General';
        if (!grouped[subject]) grouped[subject] = [];
        grouped[subject].push({
          topicName: row.topic_name,
          score: row.score,
          confidenceBand: row.confidence_band,
          itemCount: row.item_count,
          computedAt: row.computed_at,
        });
      });

      const result: SubjectBlock[] = Object.entries(grouped).map(([subject, topics]) => {
        const scored = topics.filter(t => t.score !== null && t.confidenceBand !== 'insufficient');
        const overall = scored.length
          ? Math.round(scored.reduce((a, t) => a + (t.score as number), 0) / scored.length)
          : null;
        return { subject, overallScore: overall, topics };
      });

      result.sort((a, b) => b.topics.length - a.topics.length);
      setBlocks(result);
      setSelectedSubject(prev => prev && result.some(r => r.subject === prev) ? prev : (result[0]?.subject ?? null));
    } finally {
      setLoading(false);
    }
  }, [profile?.uid, dateFilter]);

  const recompute = useCallback(async () => {
    if (!profile?.uid) return;
    setRecomputing(true);
    try {
      const token = await getAuthToken();
      if (token) {
        await fetch('/api/tml/compute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ studentId: profile.uid }),
        });
      }
    } catch (e) {
      console.error('[MasteryPage] recompute error:', e);
    } finally {
      setRecomputing(false);
      loadFromTmlScores();
    }
  }, [profile?.uid, getAuthToken, loadFromTmlScores]);

  useEffect(() => { loadFromTmlScores(); }, [loadFromTmlScores]);

  // First visit with no snapshots yet — compute once automatically.
  const [autoComputed, setAutoComputed] = useState(false);
  useEffect(() => {
    if (!loading && blocks.length === 0 && !autoComputed && profile?.uid) {
      setAutoComputed(true);
      recompute();
    }
  }, [loading, blocks.length, autoComputed, profile?.uid, recompute]);

  const overallAll = useMemo(() => {
    if (!blocks.length) return null;
    const all = blocks.map(b => b.overallScore).filter((s): s is number => s !== null);
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : null;
  }, [blocks]);

  const weakest = useMemo<{ subject: string; topicName: string; score: number } | null>(() => {
    let min: { subject: string; topicName: string; score: number } | null = null;
    blocks.forEach(b => {
      b.topics.forEach(t => {
        if (t.score !== null && (min === null || t.score < min.score)) {
          min = { subject: b.subject, topicName: t.topicName, score: t.score };
        }
      });
    });
    return min;
  }, [blocks]);

  const activeBlock = blocks.find(b => b.subject === selectedSubject) ?? blocks[0] ?? null;

  const handleExportCSV = () => {
    if (!blocks.length) return;
    let csv = 'Subject,Topic,TML Score %,Confidence,Evidence Count,Mastery Band\n';
    blocks.forEach(b => {
      b.topics.forEach(t => {
        const band = bandVisuals(t.score);
        csv += `"${b.subject.replace(/"/g, '""')}","${t.topicName.replace(/"/g, '""')}",${t.score ?? 'N/A'},${t.confidenceBand},${t.itemCount},"${band.name}"\n`;
      });
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TML_Mastery_${profile?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Student'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16 animate-in fade-in duration-500 font-sans">
      <style jsx global>{`
        @media print {
          body { background-color: white !important; color: black !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
        @media screen { .print-only { display: none !important; } }
      `}</style>

      <div className="print-only mb-6 text-black space-y-3">
        <div className="flex justify-between items-center border-b-2 border-[#002147] pb-4">
          <div>
            <h1 className="text-2xl font-black text-[#002147] uppercase tracking-tight">Sthara School OS</h1>
            <h2 className="text-lg font-bold text-gray-800">True Mastery Level — Individual Report Card</h2>
          </div>
          <div className="text-right text-xs font-semibold text-gray-600">
            <p>Student Name: <strong>{profile?.name || 'Student'}</strong></p>
            <p>Class: <strong>{profile?.studentClass || profile?.branch || '10A'}</strong></p>
            <p>Overall TML: <strong>{overallAll !== null ? `${overallAll}%` : 'N/A'}</strong></p>
            <p>Date Printed: <strong>{new Date().toLocaleDateString()}</strong></p>
          </div>
        </div>
      </div>

      <div className="relative bg-gradient-to-br from-[#002147] via-[#003b80] to-[#001a33] rounded-[2.5rem] p-8 md:p-10 text-white shadow-2xl overflow-hidden border border-white/10 no-print">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="bg-white/15 backdrop-blur-md px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-blue-200 border border-white/15 flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5 text-blue-300" /> True Mastery Level Engine
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white mb-2">My Personal Mastery Heatmap</h1>
            <p className="text-blue-100 text-sm md:text-base max-w-xl font-medium opacity-90 leading-relaxed">
              TML = 0.40×Homework + 0.40×Quiz + 0.20×AI Tutor Depth, time-decayed (14-day half-life),
              blended with your attendance and engagement signals — computed by the same engine your
              teachers see.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0">
            {overallAll !== null && (
              <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-6 rounded-3xl flex items-center gap-5 shadow-xl">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke={bandVisuals(overallAll).color} strokeWidth="3"
                      strokeDasharray={`${overallAll} ${100 - overallAll}`} strokeLinecap="round" />
                  </svg>
                  <span className="absolute font-black text-sm text-white">{overallAll}%</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-blue-200 uppercase tracking-wider">{bandVisuals(overallAll).name}</p>
                  <p className="text-3xl font-black text-white mt-0.5">{overallAll}%</p>
                  <p className="text-[11px] text-blue-100 mt-0.5">{blocks.length} subject{blocks.length !== 1 ? 's' : ''} assessed</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm no-print">
        <div className="flex items-center space-x-3 text-xs font-bold text-[#002147]">
          <Calendar className="w-4 h-4 text-[#002147]" />
          <span className="text-gray-400 uppercase text-[10px] tracking-wider">As Of:</span>
          <div className="flex items-center bg-gray-100 p-1 rounded-xl">
            {(['all', '30days', '7days'] as DateFilterOption[]).map(f => (
              <button key={f} onClick={() => setDateFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${dateFilter === f ? 'bg-[#002147] text-white shadow' : 'text-gray-600 hover:text-[#002147]'}`}>
                {f === 'all' ? 'Latest' : f === '30days' ? '30 Days Ago' : '7 Days Ago'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={recompute} disabled={recomputing}
            className="px-4 py-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 text-blue-700 ${recomputing ? 'animate-spin' : ''}`} />
            <span>{recomputing ? 'Recalculating…' : 'Refresh TML'}</span>
          </button>
          <button onClick={handleExportCSV}
            className="px-4 py-2 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span>Export CSV</span>
          </button>
          <button onClick={() => window.print()}
            className="px-4 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-900 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm">
            <Printer className="w-4 h-4 text-indigo-700" />
            <span>Print Report Card</span>
          </button>
        </div>
      </div>

      {weakest && weakest.score < 75 && (
        <div className="rounded-2xl p-5 flex items-start gap-4 shadow-sm no-print border-2" style={{ background: bandVisuals(weakest.score).bg, borderColor: bandVisuals(weakest.score).border }}>
          <div className="w-10 h-10 text-white rounded-xl flex items-center justify-center shrink-0 font-bold mt-0.5 shadow-md" style={{ background: bandVisuals(weakest.score).color }}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm" style={{ color: bandVisuals(weakest.score).color }}>Recommended Focus Area — {bandVisuals(weakest.score).name}</h4>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: bandVisuals(weakest.score).color }}>
              Your mastery in <strong>{weakest.topicName}</strong> ({weakest.subject}) is at <strong>{weakest.score}%</strong>. {bandVisuals(weakest.score).action}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-8 space-y-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin text-[#002147] mb-3" />
            <p className="font-bold text-sm text-[#002147]">Loading your True Mastery Level…</p>
          </div>
        ) : blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4 text-[#002147]">
              <BookOpen className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-black text-[#002147] mb-2">No TML Data Yet</h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-6">
              Complete homework, quizzes, or an AI Tutor session, then hit Refresh TML — your True
              Mastery Level generates automatically once there's graded evidence.
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide border-b border-gray-100 no-print">
              {blocks.map(b => {
                const v = bandVisuals(b.overallScore);
                const isActive = b.subject === selectedSubject;
                return (
                  <button key={b.subject} onClick={() => setSelectedSubject(b.subject)}
                    className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl font-bold text-sm transition-all whitespace-nowrap border-2 ${isActive ? 'bg-[#002147] text-white border-[#002147] shadow-lg scale-[1.02]' : ''}`}
                    style={!isActive ? { background: v.bg, borderColor: v.border, color: v.color } : undefined}>
                    <span>{b.subject}</span>
                    {b.overallScore !== null && (
                      <span className="text-xs font-black px-2.5 py-0.5 rounded-full" style={{ background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)', color: isActive ? '#fff' : v.color }}>
                        {b.overallScore}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {activeBlock && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 rounded-2xl border border-gray-200 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-extrabold text-[#002147]">{activeBlock.subject}</h3>
                    <p className="text-xs text-gray-500 font-medium mt-1">
                      {activeBlock.topics.length} topic{activeBlock.topics.length !== 1 ? 's' : ''} tracked · {activeBlock.topics.reduce((s, t) => s + t.itemCount, 0)} evidence point{activeBlock.topics.reduce((s, t) => s + t.itemCount, 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {activeBlock.overallScore !== null && (
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Subject TML</span>
                        <span className="text-2xl font-black text-[#002147]">{activeBlock.overallScore}%</span>
                      </div>
                      <div className="text-lg font-black px-4 py-2 rounded-2xl" style={{ background: bandVisuals(activeBlock.overallScore).bg, color: bandVisuals(activeBlock.overallScore).color }}>
                        {bandVisuals(activeBlock.overallScore).name}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider px-1">True Mastery Level Breakdown</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeBlock.topics.map(topic => {
                      const v = bandVisuals(topic.score);
                      return (
                        <div key={topic.topicName} className="p-5 rounded-2xl border-2 flex items-center gap-4 shadow-sm hover:shadow-md transition-all" style={{ background: v.bg, borderColor: v.border }}>
                          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm text-white" style={{ background: v.color }}>
                            {topic.score === null ? <Minus className="w-6 h-6" /> : topic.score >= 75 ? <CheckCircle2 className="w-6 h-6" /> : topic.score >= 50 ? <TrendingUp className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h5 className="font-black text-base truncate" style={{ color: v.color }}>{topic.topicName}</h5>
                              <span className="text-base font-black shrink-0" style={{ color: v.color }}>{topic.score !== null ? `${topic.score}%` : '—'}</span>
                            </div>
                            <div className="w-full bg-white/70 rounded-full h-2.5 mt-2 overflow-hidden border border-black/5">
                              <div className="h-2.5 rounded-full transition-all duration-700" style={{ width: `${topic.score ?? 0}%`, background: v.color }} />
                            </div>
                            <div className="flex justify-between items-center mt-1.5 text-xs opacity-90 font-medium" style={{ color: v.color }}>
                              <span>{topic.itemCount} evidence point(s) · {topic.confidenceBand}</span>
                              <span className="font-bold text-[11px] uppercase tracking-wider">{v.name}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-gray-100 text-xs font-bold text-gray-600">
              <div className="flex flex-wrap items-center gap-4">
                {(['Exemplary', 'Proficient', 'Developing', 'Critical Gap', 'Severe Need'] as MasteryBand[]).map(band => {
                  const sample = band === 'Exemplary' ? 95 : band === 'Proficient' ? 80 : band === 'Developing' ? 60 : band === 'Critical Gap' ? 40 : 20;
                  const v = bandVisuals(sample);
                  return (
                    <div key={band} className="flex items-center gap-1.5">
                      <span className="w-3.5 h-3.5 rounded" style={{ background: v.bg, border: `1px solid ${v.border}` }} />
                      <span>{band}</span>
                    </div>
                  );
                })}
              </div>
              <span className="px-3 py-1 rounded-full bg-[#002147] text-white text-[10px] font-black uppercase tracking-wider">
                Powered by the TML Engine
              </span>
            </div>
          </>
        )}
      </div>

      <div className="print-only mt-12 pt-6 border-t border-gray-400 flex justify-between text-xs text-gray-700">
        <div><p>Student Signature: _______________________</p></div>
        <div className="text-right"><p>Parent / Guardian Signature: _______________________</p></div>
      </div>
    </div>
  );
}
