'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import {
  TrendingUp, AlertTriangle, CheckCircle2, Minus,
  Loader2, BookOpen, ChevronRight, Award, Target, Sparkles, BarChart2,
  Calendar, FileSpreadsheet, Printer, Heart, User
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

interface LinkedChild {
  id: string;
  name: string;
  studentClass: string;
  customStudentId: string;
}

type DateFilterOption = 'all' | '30days' | '7days';

function getOxfordNavyBand(score: number | null) {
  if (score === null) {
    return {
      css: 'bg-[#eef3f8] text-[#a9b8c8] border-[#e2e9f1]',
      badge: 'bg-[#eef3f8] text-[#7a8b9e] border-[#d3dfed]',
      label: '—',
      bandName: 'Void / No Data'
    };
  }
  if (score < 50) {
    const isExtreme = score < 35;
    return {
      css: isExtreme
        ? 'bg-[#b8362a] text-white border-[#b8362a] font-black'
        : 'bg-[#f7d8d3] text-[#7a2119] border-[#e0a89f] font-bold',
      badge: 'bg-[#f7d8d3] text-[#7a2119] border-[#e0a89f]',
      label: `${score}%`,
      bandName: 'Needs Support (<50%)'
    };
  }
  if (score < 75) {
    const isExtreme = score >= 70;
    return {
      css: isExtreme
        ? 'bg-[#c98a00] text-white border-[#c98a00] font-black'
        : 'bg-[#f9e6bb] text-[#77510a] border-[#e6c87e] font-bold',
      badge: 'bg-[#f9e6bb] text-[#77510a] border-[#e6c87e]',
      label: `${score}%`,
      bandName: 'Developing (50–74%)'
    };
  }
  const isExtreme = score >= 90;
  return {
    css: isExtreme
      ? 'bg-[#1b7a53] text-white border-[#1b7a53] font-black'
      : 'bg-[#c8e7d7] text-[#0e5237] border-[#93cbb0] font-bold',
    badge: 'bg-[#c8e7d7] text-[#0e5237] border-[#93cbb0]',
    label: `${score}%`,
    bandName: 'Mastered (≥75%)'
  };
}

function overallGrade(s: number | null): string {
  if (s === null) return '—';
  if (s >= 90) return 'A+';
  if (s >= 80) return 'A';
  if (s >= 70) return 'B';
  if (s >= 60) return 'C';
  return 'D';
}

export default function ParentMasteryPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [childrenList, setChildrenList] = useState<LinkedChild[]>([]);
  const [selectedChildIdx, setSelectedChildIdx] = useState<number>(0);
  const [blocks, setBlocks] = useState<SubjectBlock[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('all');

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'parent')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  // Fetch Parent's Linked Children
  useEffect(() => {
    if (!profile?.schoolId) return;

    const fetchChildren = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;

        const res = await fetch('/api/parent/get-children', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: token })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.children && data.children.length > 0) {
            setChildrenList(data.children.map((c: any) => ({
              id: c.id,
              name: c.name,
              studentClass: c.studentClass,
              customStudentId: c.customStudentId
            })));
          }
        }
      } catch (err) {
        console.error('[Parent Mastery] Error fetching children:', err);
      }
    };

    fetchChildren();
  }, [profile?.schoolId, profile?.uid]);

  const activeChild = childrenList[selectedChildIdx] || null;

  // Build Heatmap Matrix for selected child
  useEffect(() => {
    if (!activeChild?.id) {
      setLoadingData(false);
      return;
    }

    const buildHeatmap = async () => {
      setLoadingData(true);
      try {
        let subsQuery = supabase
          .from('submissions')
          .select('assignment_id, score, max_score, teacher_approved, created_at')
          .eq('student_id', activeChild.id)
          .eq('teacher_approved', true);

        if (dateFilter === '30days') {
          const date30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          subsQuery = subsQuery.gte('created_at', date30);
        } else if (dateFilter === '7days') {
          const date7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          subsQuery = subsQuery.gte('created_at', date7);
        }

        const { data: subs, error: subErr } = await subsQuery;

        if (subErr) console.error('[Parent Mastery] submissions error:', subErr);
        if (!subs || subs.length === 0) { setBlocks([]); return; }

        const allAssignIds = [...new Set(subs.map(s => s.assignment_id))];
        const { data: assigns, error: assignErr } = await supabase
          .from('assignments')
          .select('id, subject, units, title')
          .in('id', allAssignIds);

        if (assignErr) console.error('[Parent Mastery] assignments error:', assignErr);
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
          const units: UnitRow[] = Object.keys(unitMap).map(u => {
            const scores = unitMap[u];
            const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
            const label = u.charAt(0).toUpperCase() + u.slice(1);
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
        console.error('[Parent Mastery]', err);
      } finally {
        setLoadingData(false);
      }
    };

    buildHeatmap();
  }, [activeChild?.id, dateFilter]);

  const overallAll = useMemo(() => {
    if (!blocks.length) return null;
    const all = blocks.map(b => b.overallScore).filter(Boolean) as number[];
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : null;
  }, [blocks]);

  const weakest = useMemo(() => {
    let min: { subject: string; unitLabel: string; score: number } | null = null;
    blocks.forEach(b => {
      b.units.forEach(u => {
        if (u.score !== null && (min === null || u.score < min.score)) {
          min = { subject: b.subject, unitLabel: u.unitLabel, score: u.score };
        }
      });
    });
    return min;
  }, [blocks]);

  const activeBlock = blocks.find(b => b.subject === selectedSubject) ?? blocks[0] ?? null;

  // Export CSV
  const handleExportCSV = () => {
    if (!blocks.length || !activeChild) return;

    let csvContent = 'Subject,Topic / Unit,Mastery Score %,Evidence Count,Status Band\n';

    blocks.forEach(b => {
      b.units.forEach(u => {
        const band = getOxfordNavyBand(u.score);
        csvContent += `"${b.subject.replace(/"/g, '""')}","${u.unitLabel.replace(/"/g, '""')}",${u.score !== null ? u.score : 'N/A'},${u.submissionCount},"${band.bandName}"\n`;
      });
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `TML_Mastery_Heatmap_${activeChild.name.replace(/[^a-zA-Z0-9]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Report Card
  const handlePrintReportCard = () => {
    window.print();
  };

  if (loading) return <div className="p-10 text-[#002147] text-center font-medium">Loading Parent Mastery Portal...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16 animate-in fade-in duration-500 font-sans">
      {/* Print CSS */}
      <style jsx global>{`
        @media print {
          body { background-color: white !important; color: black !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
        @media screen {
          .print-only { display: none !important; }
        }
      `}</style>

      {/* Printable Official Child Report Header */}
      <div className="print-only mb-6 text-black space-y-3">
        <div className="flex justify-between items-center border-b-2 border-[#002147] pb-4">
          <div>
            <h1 className="text-2xl font-black text-[#002147] uppercase tracking-tight">Sthara School OS</h1>
            <h2 className="text-lg font-bold text-gray-800">Child TML Mastery Matrix — Official Parent Report Card</h2>
          </div>
          <div className="text-right text-xs font-semibold text-gray-600">
            <p>Student: <strong>{activeChild?.name || 'Child'}</strong></p>
            <p>Class: <strong>{activeChild?.studentClass || '10A'}</strong></p>
            <p>Student ID: <strong>{activeChild?.customStudentId || 'N/A'}</strong></p>
            <p>Timeline: <strong>{dateFilter === 'all' ? 'All Time' : dateFilter === '30days' ? 'Last 30 Days' : 'Last 7 Days'}</strong></p>
            <p>Date Printed: <strong>{new Date().toLocaleDateString()}</strong></p>
          </div>
        </div>
      </div>

      {/* Header Banner */}
      <div className="relative bg-gradient-to-br from-[#002147] via-[#003b80] to-[#001a33] rounded-[2.5rem] p-8 md:p-10 text-white shadow-2xl overflow-hidden border border-white/10 no-print">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="bg-white/15 backdrop-blur-md px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-blue-200 border border-white/15 flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5 text-blue-300" /> Parent Portal · TML Mastery Heatmap
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white mb-2">
              Child Mastery Matrix
            </h1>
            <p className="text-blue-100 text-sm md:text-base max-w-xl font-medium opacity-90 leading-relaxed">
              Monitor your child's real-time academic progress across all subjects using Oxford Navy 4-band semantic color design (Red/Amber/Green/Void).
            </p>
          </div>

          {overallAll !== null && activeChild && (
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-6 rounded-3xl flex items-center gap-5 shadow-xl shrink-0">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke={overallAll >= 75 ? '#1b7a53' : overallAll >= 50 ? '#c98a00' : '#b8362a'}
                    strokeWidth="3"
                    strokeDasharray={`${overallAll} ${100 - overallAll}`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute font-black text-sm text-white">{overallAll}%</span>
              </div>
              <div>
                <p className="text-xs font-bold text-blue-200 uppercase tracking-wider">{activeChild.name}</p>
                <p className="text-3xl font-black text-white mt-0.5">Grade {overallGrade(overallAll)}</p>
                <p className="text-[11px] text-blue-100 mt-0.5">Class {activeChild.studentClass}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Child Selector Tabs (If Multiple Children Linked) */}
      {childrenList.length > 1 && (
        <div className="flex space-x-3 overflow-x-auto pb-2 no-print">
          {childrenList.map((child, idx) => (
            <button
              key={child.id}
              onClick={() => setSelectedChildIdx(idx)}
              className={`px-6 py-3 rounded-2xl font-bold transition-all text-sm whitespace-nowrap flex items-center gap-2 ${
                selectedChildIdx === idx
                  ? 'bg-[#002147] text-white shadow-md'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <User className="w-4 h-4" />
              <span>{child.name} (Class {child.studentClass})</span>
            </button>
          ))}
        </div>
      )}

      {/* Controls Bar: Timeline Filter, CSV Export, Print Report Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm no-print">
        <div className="flex items-center space-x-3 text-xs font-bold text-[#002147]">
          <Calendar className="w-4 h-4 text-[#002147]" />
          <span className="text-gray-400 uppercase text-[10px] tracking-wider">Timeline Filter:</span>
          <div className="flex items-center bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                dateFilter === 'all' ? 'bg-[#002147] text-white shadow' : 'text-gray-600 hover:text-[#002147]'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setDateFilter('30days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                dateFilter === '30days' ? 'bg-[#002147] text-white shadow' : 'text-gray-600 hover:text-[#002147]'
              }`}
            >
              Last 30 Days
            </button>
            <button
              onClick={() => setDateFilter('7days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                dateFilter === '7days' ? 'bg-[#002147] text-white shadow' : 'text-gray-600 hover:text-[#002147]'
              }`}
            >
              Last 7 Days
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handlePrintReportCard}
            className="px-4 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-900 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Printer className="w-4 h-4 text-indigo-700" />
            <span>Print Report Card</span>
          </button>
        </div>
      </div>

      {/* Weakest Unit Focus Alert */}
      {weakest && weakest.score < 75 && (
        <div className="bg-[#f7d8d3]/70 border-2 border-[#e0a89f] rounded-2xl p-5 flex items-start gap-4 shadow-sm no-print">
          <div className="w-10 h-10 bg-[#b8362a] text-white rounded-xl flex items-center justify-center shrink-0 font-bold mt-0.5 shadow-md">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-[#7a2119] text-sm">Targeted Support Opportunity</h4>
            <p className="text-xs text-[#7a2119] mt-1 leading-relaxed">
              {activeChild?.name}'s TML score in <strong className="font-extrabold text-[#7a2119]">{weakest.unitLabel}</strong> ({weakest.subject}) is currently at <strong className="font-black text-[#7a2119]">{weakest.score}%</strong>. Consider encouraging extra practice or sending a message to the class teacher.
            </p>
          </div>
        </div>
      )}

      {/* Main Heatmap Container */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-8 space-y-8">
        {loadingData ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin text-[#002147] mb-3" />
            <p className="font-bold text-sm text-[#002147]">Calculating child TML heatmap matrix...</p>
          </div>
        ) : !activeChild ? (
          <div className="py-20 text-center text-gray-400 space-y-2">
            <Heart className="w-12 h-12 mx-auto text-purple-400" />
            <p className="font-bold text-lg text-[#002147]">No Students Linked</p>
            <p className="text-xs text-gray-500">Link your child using their Student ID on the Parent Dashboard.</p>
          </div>
        ) : blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4 text-[#002147]">
              <BookOpen className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-black text-[#002147] mb-2">No Graded Submissions Found</h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-6">
              When {activeChild.name} completes homework and tests, teacher-approved grades will automatically update this Oxford Navy TML heatmap matrix.
            </p>
          </div>
        ) : (
          <>
            {/* Subject Tabs */}
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide border-b border-gray-100 no-print">
              {blocks.map(b => {
                const band = getOxfordNavyBand(b.overallScore);
                const isActive = b.subject === selectedSubject;
                return (
                  <button
                    key={b.subject}
                    onClick={() => setSelectedSubject(b.subject)}
                    className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl font-bold text-sm transition-all whitespace-nowrap border ${
                      isActive
                        ? 'bg-[#002147] text-white border-[#002147] shadow-lg scale-[1.02]'
                        : `${band.css} hover:border-indigo-300`
                    }`}
                  >
                    <span>{b.subject}</span>
                    {b.overallScore !== null && (
                      <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : band.badge}`}>
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
                      {activeBlock.units.length} topic/unit{activeBlock.units.length !== 1 ? 's' : ''} assessed across {activeBlock.units.reduce((s, u) => s + u.submissionCount, 0)} submission{activeBlock.units.reduce((s, u) => s + u.submissionCount, 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {activeBlock.overallScore !== null && (
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Subject TML</span>
                        <span className="text-2xl font-black text-[#002147]">{activeBlock.overallScore}%</span>
                      </div>
                      <div className={`text-xl font-black px-4 py-2 rounded-2xl ${getOxfordNavyBand(activeBlock.overallScore).badge}`}>
                        {getOxfordNavyBand(activeBlock.overallScore).bandName}
                      </div>
                    </div>
                  )}
                </div>

                {/* Oxford Navy 4-Band Topic Matrix Grid */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider px-1">
                    Oxford Navy 4-Band Semantic TML Breakdown
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeBlock.units.map(unit => {
                      const band = getOxfordNavyBand(unit.score);
                      return (
                        <div
                          key={unit.unitId}
                          className={`p-5 rounded-2xl border ${band.css} flex items-center gap-4 shadow-sm hover:shadow-md transition-all`}
                        >
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border ${
                            unit.score === null
                              ? 'bg-gray-200 text-gray-500'
                              : unit.score >= 75
                              ? 'bg-[#1b7a53] text-white'
                              : unit.score >= 50
                              ? 'bg-[#c98a00] text-white'
                              : 'bg-[#b8362a] text-white'
                          }`}>
                            {unit.score === null ? (
                              <Minus className="w-6 h-6" />
                            ) : unit.score >= 75 ? (
                              <CheckCircle2 className="w-6 h-6" />
                            ) : unit.score >= 50 ? (
                              <TrendingUp className="w-6 h-6" />
                            ) : (
                              <AlertTriangle className="w-6 h-6" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h5 className="font-black text-base truncate">{unit.unitLabel}</h5>
                              <span className="text-base font-black shrink-0">
                                {band.label}
                              </span>
                            </div>
                            <div className="w-full bg-white/70 rounded-full h-2.5 mt-2 overflow-hidden border border-black/5">
                              <div
                                className={`h-2.5 rounded-full transition-all duration-700 ${
                                  unit.score === null
                                    ? 'bg-gray-300'
                                    : unit.score >= 75
                                    ? 'bg-[#1b7a53]'
                                    : unit.score >= 50
                                    ? 'bg-[#c98a00]'
                                    : 'bg-[#b8362a]'
                                }`}
                                style={{ width: `${unit.score ?? 0}%` }}
                              />
                            </div>
                            <div className="flex justify-between items-center mt-1.5 text-xs opacity-90 font-medium">
                              <span>{unit.submissionCount} evidence point(s)</span>
                              <span className="font-bold text-[11px] uppercase tracking-wider">{band.bandName}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-gray-100 text-xs font-bold text-gray-600">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-[#f7d8d3] border border-[#e0a89f]" />
                  <span>Red Band: Needs Support &lt;50%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-[#f9e6bb] border border-[#e6c87e]" />
                  <span>Amber Band: Developing 50–74%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-[#c8e7d7] border border-[#93cbb0]" />
                  <span>Green Band: Mastered ≥75%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-[#eef3f8] border border-[#e2e9f1]" />
                  <span>Void: Not Attempted</span>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-[#002147] text-white text-[10px] font-black uppercase tracking-wider">
                100% Real Supabase Submissions
              </span>
            </div>
          </>
        )}
      </div>

      {/* Print Footer */}
      <div className="print-only mt-12 pt-6 border-t border-gray-400 flex justify-between text-xs text-gray-700">
        <div>
          <p>Parent / Guardian Signature: _______________________</p>
        </div>
        <div className="text-right">
          <p>Class Teacher Signature: _______________________</p>
        </div>
      </div>
    </div>
  );
}
