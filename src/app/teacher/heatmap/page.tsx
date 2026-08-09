'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Zap, User, ChevronRight, Layers, Award, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface StudentRow {
  id: string;
  name: string;
  custom_student_id?: string;
  student_class?: string;
  avatar_url?: string;
  roll?: string;
}

interface ChapterDef {
  id: string;
  name: string;
  topics: { id: string; name: string }[];
}

interface CellData {
  score: number | null;
  count: number;
  confidence: 'insufficient' | 'provisional' | 'firm';
}

const SCIENCE_CHAPTERS: ChapterDef[] = [
  {
    id: 'chem_rxn_chap',
    name: 'Chemical Reactions & Equations',
    topics: [
      { id: 'chem_rxn_1', name: 'Chemical Equations' },
      { id: 'chem_rxn_2', name: 'Combination & Decomposition' },
      { id: 'chem_rxn_3', name: 'Displacement & Redox' },
      { id: 'chem_rxn_4', name: 'Corrosion & Rancidity' }
    ]
  },
  {
    id: 'acids_bases_chap',
    name: 'Acids, Bases & Salts',
    topics: [
      { id: 'acids_bases_1', name: 'Indicators & Properties' },
      { id: 'acids_bases_2', name: 'pH Scale & Everyday Importance' },
      { id: 'acids_bases_3', name: 'Salts & Preparation' }
    ]
  },
  {
    id: 'metals_chap',
    name: 'Metals & Non-Metals',
    topics: [
      { id: 'metals_1', name: 'Physical & Chemical Properties' },
      { id: 'metals_2', name: 'Reactivity Series' },
      { id: 'metals_3', name: 'Extraction & Refining' }
    ]
  },
  {
    id: 'life_proc_chap',
    name: 'Life Processes',
    topics: [
      { id: 'life_proc_1', name: 'Nutrition & Photosynthesis' },
      { id: 'life_proc_2', name: 'Respiration in Organisms' },
      { id: 'life_proc_3', name: 'Transportation & Heart' },
      { id: 'life_proc_4', name: 'Excretion & Nephrons' }
    ]
  },
  {
    id: 'control_chap',
    name: 'Control & Coordination',
    topics: [
      { id: 'control_1', name: 'Nervous System & Reflex Arc' },
      { id: 'control_2', name: 'Plant Hormones & Tropism' },
      { id: 'control_3', name: 'Human Endocrine System' }
    ]
  },
  {
    id: 'electricity_chap',
    name: 'Electricity & Current',
    topics: [
      { id: 'elec_1', name: 'Ohm’s Law & Resistance' },
      { id: 'elec_2', name: 'Series & Parallel Combinations' },
      { id: 'elec_3', name: 'Heating Effect & Power' }
    ]
  }
];

function getBoxStyle(score: number | null) {
  if (score === null) {
    return {
      css: 'bg-[#eef3f8] text-[#a9b8c8] border-[#e2e9f1]',
      band: 'na',
      label: '—'
    };
  }
  if (score < 50) {
    const isExtreme = score < 35;
    return {
      css: isExtreme
        ? 'bg-[#b8362a] text-white border-[#b8362a] font-black'
        : 'bg-[#f7d8d3] text-[#7a2119] border-[#e0a89f] font-bold',
      band: 'red',
      label: `${score}%`
    };
  }
  if (score < 75) {
    const isExtreme = score >= 70;
    return {
      css: isExtreme
        ? 'bg-[#c98a00] text-white border-[#c98a00] font-black'
        : 'bg-[#f9e6bb] text-[#77510a] border-[#e6c87e] font-bold',
      band: 'amb',
      label: `${score}%`
    };
  }
  const isExtreme = score >= 90;
  return {
    css: isExtreme
      ? 'bg-[#1b7a53] text-white border-[#1b7a53] font-black'
      : 'bg-[#c8e7d7] text-[#0e5237] border-[#93cbb0] font-bold',
    band: 'grn',
    label: `${score}%`
  };
}

export default function TeacherHeatmapPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classList, setClassList] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('Science');

  // Navigation flow views: 1 = My Classes, 2 = Chapters List, 3 = Heatmap Table
  const [viewMode, setViewMode] = useState<1 | 2 | 3>(1);
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<number>(0);

  const [isLoading, setIsLoading] = useState(true);
  const [matrix, setMatrix] = useState<Record<string, Record<string, CellData>>>({});
  const [selectedCell, setSelectedCell] = useState<{ student: StudentRow; topicName: string; data: CellData } | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.assignments) return;
    const assigns = profile.assignments as any[];
    const clsSet = new Set<string>();
    assigns.forEach(a => { if (a.class) clsSet.add(a.class); });
    const clss = [...clsSet];
    setClassList(clss);
    if (clss.length > 0 && !selectedClass) setSelectedClass(clss[0]);
  }, [profile?.assignments]);

  useEffect(() => {
    if (!profile?.schoolId) return;

    const buildData = async () => {
      setIsLoading(true);
      try {
        let studentQuery = supabase
          .from('users')
          .select('id, name, custom_student_id, student_class, branch, avatar_url')
          .eq('school_id', profile.schoolId)
          .eq('role', 'student');

        const { data: studentData } = await studentQuery;
        let filteredStudents = studentData || [];
        if (selectedClass) {
          filteredStudents = filteredStudents.filter(s =>
            (s.student_class || s.branch || '').toLowerCase() === selectedClass.toLowerCase()
          );
        }

        const studentRows: StudentRow[] = filteredStudents.map((s, idx) => ({
          ...s,
          roll: String(idx + 1).padStart(2, '0')
        }));
        setStudents(studentRows);

        const studentIds = studentRows.map(s => s.id);
        const { data: subsData } = await supabase
          .from('submissions')
          .select('student_id, assignment_id, score, max_score, teacher_approved, assignments(title, units, subject)')
          .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

        const { data: tmlData } = await supabase
          .from('tml_scores')
          .select('student_id, topic_name, score, confidence_band, item_count')
          .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

        const newMatrix: Record<string, Record<string, CellData>> = {};
        studentRows.forEach(st => { newMatrix[st.id] = {}; });

        // Map live submissions
        (subsData || []).forEach(sub => {
          if (!newMatrix[sub.student_id] || sub.score === null || sub.max_score <= 0 || sub.teacher_approved === false) return;
          const assign = sub.assignments as any;
          const rawUnits = Array.isArray(assign?.units) && assign.units.length > 0 ? assign.units : [assign?.title || 'Core'];
          const topicKey = rawUnits[0].toLowerCase().replace(/[^a-z0-9]/g, '_');

          const current = newMatrix[sub.student_id][topicKey] || { score: null, count: 0, confidence: 'insufficient' };
          const pct = (sub.score / sub.max_score) * 100;
          const newCount = current.count + 1;
          const newAvg = current.score === null ? pct : (current.score * current.count + pct) / newCount;
          const conf = newCount >= 8 ? 'firm' : newCount >= 4 ? 'provisional' : 'insufficient';

          newMatrix[sub.student_id][topicKey] = {
            score: Math.round(newAvg),
            count: newCount,
            confidence: conf
          };
        });

        // Merge TML snapshots
        (tmlData || []).forEach(tml => {
          if (!newMatrix[tml.student_id] || tml.score === null) return;
          const topicKey = tml.topic_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          if (!newMatrix[tml.student_id][topicKey] || newMatrix[tml.student_id][topicKey].score === null) {
            newMatrix[tml.student_id][topicKey] = {
              score: Math.round(tml.score),
              count: tml.item_count || 4,
              confidence: (tml.confidence_band as any) || 'provisional'
            };
          }
        });

        setMatrix(newMatrix);
      } catch (err) {
        console.error('[TML Heatmap error]:', err);
      } finally {
        setIsLoading(false);
      }
    };

    buildData();
  }, [profile?.schoolId, selectedClass]);

  // Compute Chapter & Class TML stats dynamically
  const currentChapter = SCIENCE_CHAPTERS[selectedChapterIdx] || SCIENCE_CHAPTERS[0];

  const heatmapStats = useMemo(() => {
    if (students.length === 0) return { avg: 0, atRisk: 0, mastered: 0, gaps: 0, topicAvgs: [] };

    let totalScoreSum = 0;
    let totalCellsCount = 0;
    let atRiskStudents = 0;
    let masteredCount = 0;
    let gapCount = 0;

    const tAvgs: { topic: { id: string; name: string }; avg: number }[] = [];

    currentChapter.topics.forEach(tp => {
      const topicKey = tp.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      let tSum = 0;
      let tCount = 0;

      students.forEach(st => {
        const cell = matrix[st.id]?.[topicKey] || matrix[st.id]?.[tp.id];
        const sc = cell?.score ?? null;
        if (sc !== null) {
          tSum += sc;
          tCount++;
          totalScoreSum += sc;
          totalCellsCount++;
          if (sc >= 75) masteredCount++;
          if (sc < 50) gapCount++;
        }
      });

      tAvgs.push({
        topic: tp,
        avg: tCount > 0 ? Math.round(tSum / tCount) : 0
      });
    });

    students.forEach(st => {
      let stSum = 0;
      let stCnt = 0;
      currentChapter.topics.forEach(tp => {
        const topicKey = tp.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const sc = matrix[st.id]?.[topicKey]?.score ?? null;
        if (sc !== null) { stSum += sc; stCnt++; }
      });
      if (stCnt > 0 && (stSum / stCnt) < 50) atRiskStudents++;
    });

    const overallAvg = totalCellsCount > 0 ? Math.round(totalScoreSum / totalCellsCount) : 0;
    return {
      avg: overallAvg,
      atRisk: atRiskStudents,
      mastered: masteredCount,
      gaps: gapCount,
      topicAvgs: tAvgs
    };
  }, [students, matrix, currentChapter]);

  const handleAssignPractice = async () => {
    if (!selectedCell || !profile?.schoolId) return;
    setIsAssigning(true);
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      const { error } = await supabase.from('assignments').insert({
        school_id: profile.schoolId,
        teacher_id: profile.id,
        teacher_name: profile.name || 'Teacher',
        title: `Targeted AI Practice: ${selectedCell.topicName}`,
        description: `Personalized practice module targeting ${selectedCell.topicName} for ${selectedCell.student.name}.`,
        type: 'quiz',
        subject: selectedSubject,
        class: selectedClass || '10A',
        units: [selectedCell.topicName],
        due_date: dueDate.toISOString().split('T')[0],
        questions: [
          {
            questionText: `Demonstrating mastery in ${selectedCell.topicName}`,
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctOptionId: 0,
          },
        ],
      });

      if (error) throw error;
      alert(`✅ Targeted AI Practice assigned to ${selectedCell.student.name}!`);
      setSelectedCell(null);
    } catch (err: any) {
      alert('Failed to assign practice: ' + err.message);
    } finally {
      setIsAssigning(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading TML Mastery Matrix...</div>;

  return (
    <div className="min-h-screen bg-[#f2f6fa] text-[#0b1a2b] pb-24 font-sans">
      {/* Top Oxford Navy Brand Bar */}
      <header className="bg-[#002147] text-white px-6 py-3.5 flex items-center justify-between sticky top-0 z-40 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-black text-white text-sm border border-white/20">
            S
          </div>
          <div className="font-extrabold text-base tracking-tight">
            Sthara <span className="font-normal text-xs text-white/70 uppercase tracking-widest ml-2">School OS · TML Heatmap</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-white/70">Signed in as:</span>
            <span className="font-bold text-amber-300">{profile.name || 'Teacher'}</span>
          </div>
          {classList.length > 0 && (
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="bg-white/10 text-white font-bold text-xs px-3 py-1.5 rounded-lg border border-white/30 focus:outline-none cursor-pointer"
            >
              {classList.map(c => <option key={c} value={c} className="text-[#002147] bg-white">Class {c}</option>)}
            </select>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Breadcrumb Navigation Bar */}
        <nav className="flex items-center space-x-2 text-xs font-semibold text-gray-500">
          <button onClick={() => setViewMode(1)} className="hover:text-[#002147] transition-colors">
            {selectedSubject} · My Classes
          </button>
          {viewMode >= 2 && (
            <>
              <span>›</span>
              <button onClick={() => setViewMode(2)} className="hover:text-[#002147] transition-colors">
                Class {selectedClass || '10A'}
              </button>
            </>
          )}
          {viewMode === 3 && (
            <>
              <span>›</span>
              <span className="text-[#002147] font-bold">{currentChapter.name}</span>
            </>
          )}
        </nav>

        {/* ================= VIEW 1: MY CLASSES GRID ================= */}
        {viewMode === 1 && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <h2 className="text-2xl font-extrabold text-[#002147]">My Classes</h2>
              <p className="text-xs text-gray-500 mt-1">Select a class section to view topic breakdown & student mastery heatmaps</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {(classList.length > 0 ? classList : ['10A', '10B', '9A']).map((clsName, idx) => {
                const mockAvg = 78 - idx * 4;
                const boxStyle = getBoxStyle(mockAvg);

                return (
                  <button
                    key={clsName}
                    onClick={() => { setSelectedClass(clsName); setViewMode(2); }}
                    className="bg-white border border-gray-200 rounded-2xl p-6 text-left shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all border-l-4 border-l-[#002147] space-y-4 group"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-extrabold text-[#002147]">Class {clsName}</h3>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {selectedSubject} · CBSE
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 uppercase tracking-wider border-y border-gray-100 py-3">
                      <div>
                        <span>Students</span>
                        <p className="font-extrabold text-sm text-[#002147] normal-case mt-0.5">{students.length || 20}</p>
                      </div>
                      <div>
                        <span>Chapters</span>
                        <p className="font-extrabold text-sm text-[#002147] normal-case mt-0.5">{SCIENCE_CHAPTERS.length}</p>
                      </div>
                      <div>
                        <span>Topics</span>
                        <p className="font-extrabold text-sm text-[#002147] normal-case mt-0.5">20 Tagged</p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-gray-500 uppercase tracking-wider text-[10px]">Class TML Score</span>
                        <span className={`font-black ${boxStyle.band === 'grn' ? 'text-emerald-700' : 'text-amber-700'}`}>{mockAvg}%</span>
                      </div>
                      <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-[#002147] h-full rounded-full transition-all duration-500" style={{ width: `${mockAvg}%` }} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= VIEW 2: CHAPTERS LIST ================= */}
        {viewMode === 2 && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-extrabold text-[#002147]">Class {selectedClass || '10A'} — {selectedSubject}</h2>
                <p className="text-xs text-gray-500 mt-1">Select a chapter to open the student × topic mastery map matrix</p>
              </div>
              <button
                onClick={() => setViewMode(1)}
                className="px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Classes
              </button>
            </div>

            <div className="space-y-3">
              {SCIENCE_CHAPTERS.map((chap, idx) => {
                const mockAvg = 82 - idx * 5;
                const boxStyle = getBoxStyle(mockAvg);

                return (
                  <div
                    key={chap.id}
                    onClick={() => { setSelectedChapterIdx(idx); setViewMode(3); }}
                    className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 flex items-center justify-between gap-4 shadow-sm hover:shadow-md hover:border-[#002147] transition-all cursor-pointer group"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-[#002147] flex items-center justify-center font-black text-sm shrink-0 border border-indigo-100">
                        0{idx + 1}
                      </div>
                      <div>
                        <h4 className="font-extrabold text-base text-[#002147] group-hover:text-indigo-600 transition-colors">
                          {chap.name}
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {chap.topics.length} tagged topics: {chap.topics.map(t => t.name).join(' · ')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 shrink-0">
                      <div className="hidden sm:block w-36">
                        <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
                          <div className="bg-[#1b7a53] h-full" style={{ width: '65%' }} />
                          <div className="bg-[#c98a00] h-full" style={{ width: '25%' }} />
                          <div className="bg-[#b8362a] h-full" style={{ width: '10%' }} />
                        </div>
                      </div>
                      <div className={`px-3 py-1.5 rounded-lg font-black text-sm ${boxStyle.css}`}>
                        {mockAvg}%
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#002147] transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= VIEW 3: 2D HEATMAP MATRIX TABLE ================= */}
        {viewMode === 3 && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header & Control Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
              <div>
                <h2 className="text-2xl font-extrabold text-[#002147]">{currentChapter.name}</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Class {selectedClass || '10A'} · {selectedSubject} · {students.length} students × {currentChapter.topics.length} topics
                </p>
              </div>
              <button
                onClick={() => setViewMode(2)}
                className="px-3.5 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 transition-all flex items-center gap-1.5 self-start sm:self-auto"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Chapters
              </button>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Chapter TML</span>
                <p className="text-2xl font-black text-[#002147] mt-1">{heatmapStats.avg}%</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Students At Risk</span>
                <p className="text-2xl font-black text-[#b8362a] mt-1">{heatmapStats.atRisk} <span className="text-xs font-bold text-gray-400">/ {students.length}</span></p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Mastered Cells</span>
                <p className="text-2xl font-black text-[#1b7a53] mt-1">{heatmapStats.mastered}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Gap Cells</span>
                <p className="text-2xl font-black text-[#c98a00] mt-1">{heatmapStats.gaps}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm col-span-2 sm:col-span-1">
                <span className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Weakest Topic</span>
                <p className="text-xs font-bold text-[#002147] mt-1 truncate">
                  {heatmapStats.topicAvgs.length > 0
                    ? [...heatmapStats.topicAvgs].sort((a, b) => a.avg - b.avg)[0]?.topic.name
                    : 'N/A'}
                </p>
              </div>
            </div>

            {/* Color Legend Bar */}
            <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-gray-600">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-[#f7d8d3] border border-[#e0a89f]" />
                  <span>Needs support &lt;50%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-[#f9e6bb] border border-[#e6c87e]" />
                  <span>Approaching 50–74%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-[#c8e7d7] border border-[#93cbb0]" />
                  <span>Mastered ≥75%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-[#eef3f8] border border-[#e2e9f1]" />
                  <span>Not attempted</span>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-100">
                Solid fill = extreme band (&lt;35% / ≥90%)
              </span>
            </div>

            {/* Matrix Heatmap Table */}
            <div className="bg-white rounded-2xl border border-gray-300 shadow-md overflow-hidden">
              {isLoading ? (
                <div className="py-20 text-center text-gray-400 space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#002147]" />
                  <p className="font-bold text-sm text-[#002147]">Calculating TML Matrix...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse border border-gray-300 text-xs">
                    <thead>
                      <tr className="bg-[#002147] text-white">
                        <th className="p-3.5 pl-5 font-black uppercase text-[11px] tracking-wider w-60 sticky left-0 bg-[#002147] z-20 border-r border-white/20 shadow-md">
                          Student
                        </th>
                        {currentChapter.topics.map(tp => (
                          <th key={tp.id} className="p-3.5 font-bold text-center border-r border-white/20 min-w-[140px] align-top">
                            <div className="leading-snug">{tp.name}</div>
                            <span className="block text-[9px] text-white/60 font-normal uppercase tracking-widest mt-1">Topic</span>
                          </th>
                        ))}
                        <th className="p-3.5 font-black text-center bg-[#0a2f5c] w-32 border-l-2 border-white/30">
                          <div>Student TML</div>
                          <span className="block text-[9px] text-white/60 font-normal uppercase tracking-widest mt-1">Chapter</span>
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-200">
                      {students.map((st, sIdx) => {
                        let stSum = 0;
                        let stCount = 0;

                        currentChapter.topics.forEach(tp => {
                          const topicKey = tp.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                          const cell = matrix[st.id]?.[topicKey] || matrix[st.id]?.[tp.id];
                          if (cell?.score !== null && cell?.score !== undefined) {
                            stSum += cell.score;
                            stCount++;
                          }
                        });

                        const stAvg = stCount > 0 ? Math.round(stSum / stCount) : null;
                        const stBoxStyle = getBoxStyle(stAvg);

                        const bgColors = ['bg-[#002147]', 'bg-indigo-600', 'bg-blue-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600'];
                        const avatarBg = bgColors[sIdx % bgColors.length];

                        return (
                          <tr key={st.id} className="hover:bg-slate-50 transition-colors group">
                            {/* Sticky Student Column */}
                            <td className="p-3 pl-5 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-gray-300 shadow-md">
                              <div className="flex items-center space-x-3">
                                {st.avatar_url ? (
                                  <img src={st.avatar_url} alt={st.name} className="w-7 h-7 rounded-full object-cover shrink-0 border border-gray-200" />
                                ) : (
                                  <div className={`w-7 h-7 rounded-full ${avatarBg} text-white flex items-center justify-center font-bold text-[10px] shrink-0`}>
                                    {st.name ? st.name.split(' ').map(n => n[0]).join('') : 'S'}
                                  </div>
                                )}
                                <div>
                                  <p className="font-bold text-[#002147] text-xs leading-none truncate max-w-[130px]">{st.name}</p>
                                  <span className="text-[10px] text-gray-400 font-medium">Roll {st.roll}</span>
                                </div>
                              </div>
                            </td>

                            {/* Topic Score Boxes */}
                            {currentChapter.topics.map(tp => {
                              const topicKey = tp.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                              const cell = matrix[st.id]?.[topicKey] || matrix[st.id]?.[tp.id] || { score: null, count: 0, confidence: 'insufficient' };
                              const boxStyle = getBoxStyle(cell.score);

                              return (
                                <td key={tp.id} className="p-1.5 text-center border-r border-gray-200 align-middle">
                                  <button
                                    onClick={() => setSelectedCell({ student: st, topicName: tp.name, data: cell })}
                                    className={`w-full py-2.5 rounded-lg border text-xs text-center transition-all duration-150 cursor-pointer hover:scale-105 hover:shadow-md ${boxStyle.css}`}
                                    title={`${st.name} · ${tp.name}\n${cell.score === null ? 'Not attempted' : `${cell.score}% mastery · ${cell.count} evidence points`}`}
                                  >
                                    {boxStyle.label}
                                  </button>
                                </td>
                              );
                            })}

                            {/* Row Average (Student TML) */}
                            <td className="p-1.5 text-center bg-[#f8fafc] border-l-2 border-gray-300 align-middle">
                              <div className={`w-full py-2.5 rounded-lg border text-xs text-center font-black ${stBoxStyle.css}`}>
                                {stBoxStyle.label}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    {/* Table Footer: Topic Average Row */}
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-gray-300 font-bold">
                        <td className="p-3 pl-5 sticky left-0 bg-slate-100 z-20 border-r border-gray-300 text-gray-600 uppercase text-[10px] tracking-wider">
                          Topic Average
                        </td>
                        {currentChapter.topics.map(tp => {
                          const tStat = heatmapStats.topicAvgs.find(t => t.topic.id === tp.id);
                          const avgVal = tStat ? tStat.avg : 0;
                          const boxStyle = getBoxStyle(avgVal);

                          return (
                            <td key={tp.id} className="p-1.5 text-center border-r border-gray-300">
                              <div className={`w-full py-2 rounded-lg text-xs font-black text-center ${boxStyle.css}`}>
                                {avgVal}%
                              </div>
                            </td>
                          );
                        })}
                        <td className="p-1.5 text-center bg-[#0a2f5c] text-white">
                          <div className="w-full py-2 rounded-lg text-xs font-black text-center bg-[#002147] text-amber-300 border border-white/20">
                            {heatmapStats.avg}%
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Practice Module Modal */}
      {selectedCell && (
        <div className="fixed inset-0 bg-[#002147]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-start border-b border-gray-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full">
                  Topic Diagnostic
                </span>
                <h3 className="text-lg font-extrabold text-[#002147] mt-1">{selectedCell.topicName}</h3>
                <p className="text-xs text-gray-500">Student: {selectedCell.student.name}</p>
              </div>
              <button onClick={() => setSelectedCell(null)} className="text-gray-400 hover:text-gray-600 font-bold p-1">✕</button>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 font-medium">True Mastery Level (TML):</span>
                <span className="font-black text-base text-[#002147]">
                  {selectedCell.data.score !== null ? `${selectedCell.data.score}%` : 'Not attempted'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Evidence Submissions:</span>
                <span className="font-bold text-gray-700">{selectedCell.data.count} item(s) recorded</span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={handleAssignPractice}
                disabled={isAssigning}
                className="w-full py-3 bg-[#002147] hover:bg-blue-900 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <Zap className="w-4 h-4 text-amber-300" />
                <span>{isAssigning ? 'Creating Task...' : `Assign Targeted AI Practice on ${selectedCell.topicName}`}</span>
              </button>
              <button
                onClick={() => setSelectedCell(null)}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
