'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Zap, User, ChevronRight, Download, Printer, Filter } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface StudentRow {
  id: string;
  name: string;
  custom_student_id?: string;
  student_class?: string;
  avatar_url?: string;
  roll: string;
}

interface TopicDef {
  id: string;
  name: string;
}

interface ChapterDef {
  id: string;
  name: string;
  topics: TopicDef[];
}

interface CellData {
  score: number | null;
  count: number;
  confidence: 'insufficient' | 'provisional' | 'firm';
}

const DEFAULT_SUBJECTS = ['Mathematics', 'Science', 'Physics', 'Chemistry', 'Biology', 'English', 'Social Science'];

const cleanStr = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const formatClassName = (c: string) => {
  if (!c) return 'Class 10A';
  const trimmed = c.trim();
  if (trimmed.toLowerCase().startsWith('class ')) return trimmed;
  return `Class ${trimmed}`;
};

const SUBJECT_CURRICULUM_MAP: Record<string, ChapterDef[]> = {
  Mathematics: [
    {
      id: 'chap_real_num',
      name: 'Chapter 1: Real Numbers',
      topics: [
        { id: 'topic_euclid', name: 'Euclid’s Division Lemma' },
        { id: 'topic_fund_thm', name: 'Fundamental Theorem of Arithmetic' },
        { id: 'topic_irrational', name: 'Irrational Proofs & Decimals' }
      ]
    },
    {
      id: 'chap_poly',
      name: 'Chapter 2: Polynomials',
      topics: [
        { id: 'topic_zeros', name: 'Zeros & Geometrical Meaning' },
        { id: 'topic_coeff_rel', name: 'Zeros & Coefficients Relation' },
        { id: 'topic_div_algo', name: 'Division Algorithm' }
      ]
    },
    {
      id: 'chap_linear_eq',
      name: 'Chapter 3: Pair of Linear Equations',
      topics: [
        { id: 'topic_graphical', name: 'Graphical Solutions' },
        { id: 'topic_algebraic', name: 'Substitution & Elimination' },
        { id: 'topic_cross_mult', name: 'Cross-Multiplication Method' }
      ]
    },
    {
      id: 'chap_triangles',
      name: 'Chapter 4: Triangles & Geometry',
      topics: [
        { id: 'topic_bpt', name: 'Basic Proportionality Theorem' },
        { id: 'topic_similarity', name: 'Criteria for Similarity' },
        { id: 'topic_pythagoras', name: 'Pythagoras Theorem' }
      ]
    }
  ],
  Science: [
    {
      id: 'chap_chem_rxn',
      name: 'Chemical Reactions & Equations',
      topics: [
        { id: 'topic_chem_eq', name: 'Chemical Equations' },
        { id: 'topic_comb_decomp', name: 'Combination & Decomposition' },
        { id: 'topic_disp_redox', name: 'Displacement & Redox' },
        { id: 'topic_corr_rancid', name: 'Corrosion & Rancidity' }
      ]
    },
    {
      id: 'chap_acids_bases',
      name: 'Acids, Bases & Salts',
      topics: [
        { id: 'topic_ind_prop', name: 'Indicators & Properties' },
        { id: 'topic_ph_scale', name: 'pH Scale & Applications' },
        { id: 'topic_salts_prep', name: 'Salts & Preparation' }
      ]
    },
    {
      id: 'chap_metals',
      name: 'Metals & Non-Metals',
      topics: [
        { id: 'topic_metal_prop', name: 'Physical & Chemical Properties' },
        { id: 'topic_reactivity', name: 'Reactivity Series' },
        { id: 'topic_extraction', name: 'Extraction & Refining' }
      ]
    },
    {
      id: 'chap_life_proc',
      name: 'Life Processes',
      topics: [
        { id: 'topic_nutrition', name: 'Nutrition & Photosynthesis' },
        { id: 'topic_respiration', name: 'Respiration in Organisms' },
        { id: 'topic_transport', name: 'Transportation & Heart' },
        { id: 'topic_excretion', name: 'Excretion & Nephrons' }
      ]
    }
  ]
};

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
  const { profile, loading, getAuthToken } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classList, setClassList] = useState<string[]>([]);
  const [subjectList, setSubjectList] = useState<string[]>(DEFAULT_SUBJECTS);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('Mathematics');

  const [timelineFilter, setTimelineFilter] = useState<'all' | '30d' | '7d'>('all');
  const [viewMode, setViewMode] = useState<1 | 2 | 3>(1);
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<number>(0);

  const [isLoading, setIsLoading] = useState(true);
  const [chapters, setChapters] = useState<ChapterDef[]>([]);

  const [matrix, setMatrix] = useState<Record<string, Record<string, CellData>>>({});
  const [selectedCell, setSelectedCell] = useState<{ student: StudentRow; topicName: string; data: CellData } | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  // Discover Teacher Classes & Subjects from Syllabus Table + Assignments + Profile
  useEffect(() => {
    if (!profile) return;
    const fetchTeacherMeta = async () => {
      const subSet = new Set<string>(DEFAULT_SUBJECTS);
      const clsSet = new Set<string>();

      if (profile?.subject) subSet.add(profile.subject);
      if (Array.isArray((profile as any)?.subjects)) {
        (profile as any).subjects.forEach((s: string) => subSet.add(s));
      }
      if (Array.isArray(profile?.assignments)) {
        profile.assignments.forEach((a: any) => {
          if (a.class) clsSet.add(a.class);
          if (a.subject) subSet.add(a.subject);
        });
      }

      // Query Syllabus table for planned topics, subjects & classes!
      let sylQuery = supabase.from('syllabus').select('subject, class, grade');
      if (profile?.schoolId) sylQuery = sylQuery.eq('school_id', profile.schoolId);
      const { data: dbSyllabus } = await sylQuery;

      (dbSyllabus || []).forEach(s => {
        if (s.subject) subSet.add(s.subject);
        const c = s.class || s.grade;
        if (c) clsSet.add(c);
      });

      // Query Assignments table
      let assignQuery = supabase.from('assignments').select('subject, class');
      if (profile?.schoolId) assignQuery = assignQuery.eq('school_id', profile.schoolId);
      const { data: dbAssigns } = await assignQuery;

      (dbAssigns || []).forEach(a => {
        if (a.subject) subSet.add(a.subject);
        if (a.class) clsSet.add(a.class);
      });

      const finalClasses = clsSet.size > 0 ? [...clsSet] : ['10-A', '10B', '9A'];
      const finalSubjects = [...subSet];

      setClassList(finalClasses);
      setSubjectList(finalSubjects);

      if (!selectedClass && finalClasses.length > 0) setSelectedClass(finalClasses[0]);
      if (!selectedSubject && finalSubjects.length > 0) setSelectedSubject(finalSubjects[0]);
    };

    fetchTeacherMeta();
  }, [profile]);

  // Load Real Supabase Data: RLS Bypass Students, Syllabus Topics, Assignments, Submissions
  useEffect(() => {
    if (!profile) return;

    const loadRealData = async () => {
      setIsLoading(true);
      try {
        const schoolId = profile.schoolId || 'sthara_demo_school';
        const authToken = await getAuthToken();

        // 1. Fetch Students via Admin RLS Bypass Route
        const studRes = await fetch('/api/teacher/get-students', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ schoolId })
        });

        const studJson = await studRes.json();
        let rawStudents: any[] = studJson.students || [];

        // Discover student classes
        const discoveredClss = new Set<string>();
        rawStudents.forEach(s => {
          const c = s.studentClass || s.branch;
          if (c && c.trim()) discoveredClss.add(c.trim());
        });

        if (discoveredClss.size > 0) {
          const discList = [...discoveredClss];
          setClassList(prev => [...new Set([...prev, ...discList])]);
        }

        // Flexible Class Filtering Engine
        let matchedStudents = rawStudents;
        if (selectedClass) {
          const targetClean = cleanStr(selectedClass);
          const matched = rawStudents.filter(s => {
            const sClassRaw = s.studentClass || s.branch || s.student_class || '';
            const sClean = cleanStr(sClassRaw);
            if (!sClean) return false;

            return (
              sClean === targetClean ||
              sClean.includes(targetClean) ||
              targetClean.includes(sClean) ||
              sClean.replace(/^class/, '') === targetClean.replace(/^class/, '') ||
              sClean.replace(/^grade/, '') === targetClean.replace(/^grade/, '')
            );
          });

          if (matched.length > 0) matchedStudents = matched;
        }

        const studentRows: StudentRow[] = matchedStudents.map((s, idx) => ({
          id: s.id,
          name: s.name || `Student ${idx + 1}`,
          custom_student_id: s.customStudentId || s.custom_student_id || s.id,
          student_class: s.studentClass || s.branch || selectedClass,
          avatar_url: s.avatar_url || s.avatarUrl,
          roll: String(idx + 1).padStart(2, '0')
        }));
        setStudents(studentRows);

        const studentIds = studentRows.map(s => s.id);

        // 2. Fetch Syllabus Topics from `syllabus` Table (Syllabus Manager)
        let sylQuery = supabase
          .from('syllabus')
          .select('id, topic, subject, class, month, objectives, publisher');
        if (profile?.schoolId) sylQuery = sylQuery.eq('school_id', profile.schoolId);
        const { data: syllabusData } = await sylQuery;

        // 3. Fetch Real Assignments
        let assignQuery = supabase
          .from('assignments')
          .select('id, title, subject, class, units, created_at');
        if (profile?.schoolId) assignQuery = assignQuery.eq('school_id', profile.schoolId);
        const { data: assignData } = await assignQuery;

        // 4. Fetch TML Snapshots
        const { data: tmlData } = await supabase
          .from('tml_scores')
          .select('student_id, subject, topic_name, score, confidence_band, item_count, computed_at')
          .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

        // 5. Build Chapters & Topics from BOTH `syllabus` table AND `assignments` table
        const chapMap = new Map<string, TopicDef[]>();

        // Process Syllabus Topics (from Syllabus Manager /teacher/syllabus)
        (syllabusData || []).forEach(syl => {
          const subjMatches = !selectedSubject ||
            !syl.subject ||
            cleanStr(syl.subject).includes(cleanStr(selectedSubject)) ||
            cleanStr(selectedSubject).includes(cleanStr(syl.subject));

          const classMatches = !selectedClass ||
            !syl.class ||
            cleanStr(syl.class).includes(cleanStr(selectedClass)) ||
            cleanStr(selectedClass).includes(cleanStr(syl.class));

          if (!subjMatches && !classMatches) return;

          const rawTopic = syl.topic || 'General Topic';
          let chapName = syl.month ? `${syl.month} Topics` : `${selectedSubject} Syllabus`;
          let topicName = rawTopic;

          if (rawTopic.toLowerCase().includes('chapter') || rawTopic.includes(':')) {
            const parts = rawTopic.split(':');
            chapName = parts[0].trim();
            topicName = parts.slice(1).join(':').trim() || rawTopic;
          }

          const topicId = rawTopic.toLowerCase().replace(/[^a-z0-9]/g, '_');

          if (!chapMap.has(chapName)) chapMap.set(chapName, []);
          const existing = chapMap.get(chapName)!;
          if (!existing.some(t => t.name.toLowerCase() === topicName.toLowerCase())) {
            existing.push({ id: topicId, name: topicName });
          }
        });

        // Process Assignment Topics
        (assignData || []).forEach(a => {
          const subjMatches = !selectedSubject ||
            !a.subject ||
            cleanStr(a.subject).includes(cleanStr(selectedSubject)) ||
            cleanStr(selectedSubject).includes(cleanStr(a.subject));

          if (!subjMatches) return;

          const unitList: string[] = Array.isArray(a.units) && a.units.length > 0
            ? a.units.filter((u: string) => u && u.trim().length > 0)
            : [a.title || `${selectedSubject} Unit`];

          const chapName = unitList[0] || a.title || `${selectedSubject} Chapter`;
          const topicName = a.title || unitList[0];
          const topicId = topicName.toLowerCase().replace(/[^a-z0-9]/g, '_');

          if (!chapMap.has(chapName)) chapMap.set(chapName, []);
          const existing = chapMap.get(chapName)!;
          if (!existing.some(t => t.name.toLowerCase() === topicName.toLowerCase())) {
            existing.push({ id: topicId, name: topicName });
          }
        });

        // Add TML topic_name entries
        (tmlData || []).forEach(tml => {
          if (!tml.topic_name) return;
          const subjMatches = !selectedSubject || !tml.subject || cleanStr(tml.subject).includes(cleanStr(selectedSubject));
          if (!subjMatches) return;

          const chapName = `${selectedSubject} Mastery Topics`;
          const topicName = tml.topic_name;
          const topicId = topicName.toLowerCase().replace(/[^a-z0-9]/g, '_');

          if (!chapMap.has(chapName)) chapMap.set(chapName, []);
          const existing = chapMap.get(chapName)!;
          if (!existing.some(t => t.name.toLowerCase() === topicName.toLowerCase())) {
            existing.push({ id: topicId, name: topicName });
          }
        });

        const dynamicChapters: ChapterDef[] = [];
        let cIdx = 1;
        chapMap.forEach((topList, chapName) => {
          dynamicChapters.push({
            id: `chap_dyn_${cIdx++}`,
            name: chapName,
            topics: topList
          });
        });

        // Fallback to rich subject curriculum map if dynamic topics are empty
        if (dynamicChapters.length === 0) {
          const stdChapters = SUBJECT_CURRICULUM_MAP[selectedSubject] || SUBJECT_CURRICULUM_MAP.Mathematics;
          dynamicChapters.push(...stdChapters);
        }
        setChapters(dynamicChapters);

        // 6. Fetch Submissions
        const { data: subsData } = await supabase
          .from('submissions')
          .select('student_id, assignment_id, score, max_score, teacher_approved, created_at, assignments(id, title, units, subject)')
          .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

        // 7. Build Matrix
        const newMatrix: Record<string, Record<string, CellData>> = {};
        studentRows.forEach(st => { newMatrix[st.id] = {}; });

        (subsData || []).forEach(sub => {
          if (!newMatrix[sub.student_id] || sub.score === null || sub.max_score <= 0 || sub.teacher_approved === false) return;
          const assign = sub.assignments as any;
          if (selectedSubject && assign?.subject && !assign.subject.toLowerCase().includes(selectedSubject.toLowerCase())) return;

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

        (tmlData || []).forEach(tml => {
          if (!newMatrix[tml.student_id] || tml.score === null) return;
          if (selectedSubject && tml.subject && !tml.subject.toLowerCase().includes(selectedSubject.toLowerCase())) return;

          const topicKey = tml.topic_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          if (!newMatrix[tml.student_id][topicKey] || newMatrix[tml.student_id][topicKey].score === null) {
            newMatrix[tml.student_id][topicKey] = {
              score: Math.round(tml.score),
              count: tml.item_count || 1,
              confidence: (tml.confidence_band as any) || 'provisional'
            };
          }
        });

        setMatrix(newMatrix);
      } catch (err) {
        console.error('[TML Heatmap loadRealData error]:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadRealData();
  }, [profile, selectedClass, selectedSubject, timelineFilter]);

  const currentChapter = chapters[selectedChapterIdx] || chapters[0] || { id: 'c1', name: 'Curriculum Unit', topics: [] };

  const heatmapStats = useMemo(() => {
    if (students.length === 0 || !currentChapter?.topics) {
      return { avg: 0, atRisk: 0, mastered: 0, gaps: 0, topicAvgs: [] };
    }

    let totalScoreSum = 0;
    let totalCellsCount = 0;
    let atRiskStudents = 0;
    let masteredCount = 0;
    let gapCount = 0;

    const tAvgs: { topic: TopicDef; avg: number | null }[] = [];

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
        avg: tCount > 0 ? Math.round(tSum / tCount) : null
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

  const classOverallAvg = useMemo(() => {
    if (students.length === 0) return 0;
    let sum = 0;
    let count = 0;
    students.forEach(st => {
      const row = matrix[st.id] || {};
      Object.values(row).forEach(c => {
        if (c.score !== null) {
          sum += c.score;
          count++;
        }
      });
    });
    return count > 0 ? Math.round(sum / count) : 0;
  }, [students, matrix]);

  const handleExportCSV = () => {
    if (!students.length || !currentChapter.topics.length) return;

    let csvContent = `Student Name,Roll,Student ID,`;
    csvContent += currentChapter.topics.map(t => `"${t.name}"`).join(',') + `,Student TML Average\n`;

    students.forEach(st => {
      let rowStr = `"${st.name}",${st.roll},"${st.custom_student_id || st.id}",`;
      let stSum = 0;
      let stCount = 0;

      currentChapter.topics.forEach(tp => {
        const topicKey = tp.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const sc = matrix[st.id]?.[topicKey]?.score ?? null;
        if (sc !== null) { stSum += sc; stCount++; }
        rowStr += `${sc !== null ? sc + '%' : 'N/A'},`;
      });

      const avgVal = stCount > 0 ? Math.round(stSum / stCount) + '%' : 'N/A';
      rowStr += `${avgVal}\n`;
      csvContent += rowStr;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TML_Heatmap_${formatClassName(selectedClass).replace(/\s+/g, '_')}_${selectedSubject}_${currentChapter.name.replace(/\s+/g, '_')}.csv`;
    link.click();
  };

  const handlePrint = () => { window.print(); };

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

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading TML Heatmap...</div>;

  return (
    <div className="min-h-screen bg-[#f2f6fa] text-[#0b1a2b] pb-24 font-sans print:bg-white print:pb-0">
      {/* Header */}
      <header className="bg-[#002147] text-white px-6 py-3.5 flex items-center justify-between sticky top-0 z-40 shadow-md print:hidden">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-black text-white text-sm border border-white/20">
            S
          </div>
          <div className="font-extrabold text-base tracking-tight">
            Sthara <span className="font-normal text-xs text-white/70 uppercase tracking-widest ml-2">School OS · Class Heat Map</span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Subject Dropdown */}
          <div className="flex items-center space-x-1.5 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
            <span className="text-xs text-white/70 font-semibold uppercase">Subject:</span>
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
            >
              {subjectList.map(s => <option key={s} value={s} className="text-[#002147] bg-white">{s}</option>)}
            </select>
          </div>

          {/* Class Dropdown */}
          <div className="flex items-center space-x-1.5 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
            <span className="text-xs text-white/70 font-semibold uppercase">Class:</span>
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
            >
              {classList.map(c => <option key={c} value={c} className="text-[#002147] bg-white">{formatClassName(c)}</option>)}
            </select>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <nav className="flex items-center space-x-2 text-xs font-semibold text-gray-500">
            <button onClick={() => setViewMode(1)} className="hover:text-[#002147] transition-colors">
              {selectedSubject} · My Classes
            </button>
            {viewMode >= 2 && (
              <>
                <span>›</span>
                <button onClick={() => setViewMode(2)} className="hover:text-[#002147] transition-colors">
                  {formatClassName(selectedClass)}
                </button>
              </>
            )}
            {viewMode === 3 && (
              <>
                <span>›</span>
                <span className="text-[#002147] font-bold">{currentChapter?.name}</span>
              </>
            )}
          </nav>

          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1 text-xs font-bold shadow-sm">
              <span className="text-gray-400 px-2 flex items-center gap-1 text-[10px] uppercase">
                <Filter className="w-3 h-3" /> Timeline:
              </span>
              <button
                onClick={() => setTimelineFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-all ${timelineFilter === 'all' ? 'bg-[#002147] text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                All Time
              </button>
              <button
                onClick={() => setTimelineFilter('30d')}
                className={`px-2.5 py-1 rounded-lg transition-all ${timelineFilter === '30d' ? 'bg-[#002147] text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Last 30D
              </button>
              <button
                onClick={() => setTimelineFilter('7d')}
                className={`px-2.5 py-1 rounded-lg transition-all ${timelineFilter === '7d' ? 'bg-[#002147] text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Last 7D
              </button>
            </div>

            {viewMode === 3 && (
              <>
                <button
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow transition-all flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
                <button
                  onClick={handlePrint}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow transition-all flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
              </>
            )}
          </div>
        </div>

        {/* ================= VIEW 1: MY CLASSES GRID ================= */}
        {viewMode === 1 && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <h2 className="text-2xl font-extrabold text-[#002147]">My Classes — {selectedSubject}</h2>
              <p className="text-xs text-gray-500 mt-1">Select a class section to view topic breakdown and cohort heatmaps</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {classList.map((clsName) => {
                const realAvg = classOverallAvg;

                return (
                  <button
                    key={clsName}
                    onClick={() => { setSelectedClass(clsName); setViewMode(2); }}
                    className="bg-white border border-gray-200 rounded-2xl p-6 text-left shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all border-l-4 border-l-[#002147] space-y-4 group"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-extrabold text-[#002147]">{formatClassName(clsName)}</h3>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {selectedSubject} · CBSE
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 uppercase tracking-wider border-y border-gray-100 py-3">
                      <div>
                        <span>Students</span>
                        <p className="font-extrabold text-sm text-[#002147] normal-case mt-0.5">{students.length}</p>
                      </div>
                      <div>
                        <span>Chapters</span>
                        <p className="font-extrabold text-sm text-[#002147] normal-case mt-0.5">{chapters.length}</p>
                      </div>
                      <div>
                        <span>Topics</span>
                        <p className="font-extrabold text-sm text-[#002147] normal-case mt-0.5">
                          {chapters.reduce((n, c) => n + c.topics.length, 0)} Tagged
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-gray-500 uppercase tracking-wider text-[10px]">Real Class TML Score</span>
                        <span className={`font-black ${realAvg >= 75 ? 'text-emerald-700' : realAvg > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                          {realAvg > 0 ? `${realAvg}%` : '—'}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-[#002147] h-full rounded-full transition-all duration-500" style={{ width: `${realAvg}%` }} />
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
                <h2 className="text-2xl font-extrabold text-[#002147]">{formatClassName(selectedClass)} — {selectedSubject}</h2>
                <p className="text-xs text-gray-500 mt-1">Select a chapter to open the student × topic heatmap matrix</p>
              </div>
              <button
                onClick={() => setViewMode(1)}
                className="px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Classes
              </button>
            </div>

            <div className="space-y-3">
              {chapters.map((chap, idx) => {
                let chapSum = 0;
                let chapCnt = 0;

                chap.topics.forEach(tp => {
                  const topicKey = tp.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                  students.forEach(st => {
                    const sc = matrix[st.id]?.[topicKey]?.score ?? null;
                    if (sc !== null) { chapSum += sc; chapCnt++; }
                  });
                });

                const chapAvg = chapCnt > 0 ? Math.round(chapSum / chapCnt) : null;
                const boxStyle = getBoxStyle(chapAvg);

                return (
                  <div
                    key={chap.id}
                    onClick={() => { setSelectedChapterIdx(idx); setViewMode(3); }}
                    className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 flex items-center justify-between gap-4 shadow-sm hover:shadow-md hover:border-[#002147] transition-all cursor-pointer group"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-[#002147] flex items-center justify-center font-black text-sm shrink-0 border border-indigo-100">
                        {String(idx + 1).padStart(2, '0')}
                      </div>
                      <div>
                        <h4 className="font-extrabold text-base text-[#002147] group-hover:text-indigo-600 transition-colors">
                          {chap.name}
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {chap.topics.length} tagged topic{chap.topics.length !== 1 ? 's' : ''}: {chap.topics.map(t => t.name).join(' · ')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 shrink-0">
                      <div className={`px-3 py-1.5 rounded-lg font-black text-sm ${boxStyle.css}`}>
                        {boxStyle.label}
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm print:shadow-none print:border-none">
              <div>
                <h2 className="text-2xl font-extrabold text-[#002147]">{currentChapter.name}</h2>
                <p className="text-xs text-gray-500 mt-1">
                  {formatClassName(selectedClass)} · {selectedSubject} · {students.length} students × {currentChapter.topics.length} topics
                </p>
              </div>
              <button
                onClick={() => setViewMode(2)}
                className="px-3.5 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 transition-all flex items-center gap-1.5 self-start sm:self-auto print:hidden"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Chapters
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 print:grid-cols-5">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Chapter TML</span>
                <p className="text-2xl font-black text-[#002147] mt-1">{heatmapStats.avg > 0 ? `${heatmapStats.avg}%` : '—'}</p>
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
                  {heatmapStats.topicAvgs.length > 0 && heatmapStats.topicAvgs.some(t => t.avg !== null)
                    ? [...heatmapStats.topicAvgs].filter(t => t.avg !== null).sort((a, b) => (a.avg || 0) - (b.avg || 0))[0]?.topic.name
                    : 'No Data'}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-300 shadow-md overflow-hidden print:border-gray-400">
              {isLoading ? (
                <div className="py-20 text-center text-gray-400 space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#002147]" />
                  <p className="font-bold text-sm text-[#002147]">Calculating Heatmap Matrix...</p>
                </div>
              ) : students.length === 0 ? (
                <div className="py-20 text-center text-gray-400 space-y-2">
                  <User className="w-10 h-10 mx-auto text-gray-300" />
                  <p className="font-bold text-[#002147]">No students found for {formatClassName(selectedClass)}</p>
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

                            {currentChapter.topics.map(tp => {
                              const topicKey = tp.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                              const cell = matrix[st.id]?.[topicKey] || matrix[st.id]?.[tp.id] || { score: null, count: 0, confidence: 'insufficient' };
                              const boxStyle = getBoxStyle(cell.score);

                              return (
                                <td key={tp.id} className="p-1.5 text-center border-r border-gray-200 align-middle">
                                  <button
                                    onClick={() => setSelectedCell({ student: st, topicName: tp.name, data: cell })}
                                    className={`w-full py-2.5 rounded-lg border text-xs text-center transition-all duration-150 cursor-pointer hover:scale-105 hover:shadow-md ${boxStyle.css}`}
                                  >
                                    {boxStyle.label}
                                  </button>
                                </td>
                              );
                            })}

                            <td className="p-1.5 text-center bg-[#f8fafc] border-l-2 border-gray-300 align-middle">
                              <div className={`w-full py-2.5 rounded-lg border text-xs text-center font-black ${stBoxStyle.css}`}>
                                {stBoxStyle.label}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-gray-300 font-bold">
                        <td className="p-3 pl-5 sticky left-0 bg-slate-100 z-20 border-r border-gray-300 text-gray-600 uppercase text-[10px] tracking-wider">
                          Topic Average
                        </td>
                        {currentChapter.topics.map(tp => {
                          const tStat = heatmapStats.topicAvgs.find(t => t.topic.id === tp.id);
                          const avgVal = tStat?.avg ?? null;
                          const boxStyle = getBoxStyle(avgVal);

                          return (
                            <td key={tp.id} className="p-1.5 text-center border-r border-gray-200">
                              <div className={`w-full py-2 rounded-lg text-xs font-black text-center ${boxStyle.css}`}>
                                {boxStyle.label}
                              </div>
                            </td>
                          );
                        })}
                        <td className="p-1.5 text-center bg-[#0a2f5c] text-white">
                          <div className="w-full py-2 rounded-lg text-xs font-black text-center bg-[#002147] text-amber-300 border border-white/20">
                            {heatmapStats.avg > 0 ? `${heatmapStats.avg}%` : '—'}
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

      {selectedCell && (
        <div className="fixed inset-0 bg-[#002147]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
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
