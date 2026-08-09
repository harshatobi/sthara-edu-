'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Zap, TrendingUp, AlertTriangle, CheckCircle2, User, BookOpen, Layers } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface StudentRow {
  id: string;
  name: string;
  custom_student_id?: string;
  student_class?: string;
  branch?: string;
}

interface TopicColumn {
  id: string;
  name: string;
  subject: string;
}

interface CellData {
  score: number | null;
  count: number;
  confidence: 'insufficient' | 'provisional' | 'firm';
}

export default function ClassMasteryMatrixPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [classList, setClassList] = useState<string[]>([]);
  const [subjectList, setSubjectList] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [topics, setTopics] = useState<TopicColumn[]>([]);
  // Matrix data: matrix[studentId][topicId] = CellData
  const [matrix, setMatrix] = useState<Record<string, Record<string, CellData>>>({});

  const [selectedCell, setSelectedCell] = useState<{ student: StudentRow; topic: TopicColumn; data: CellData } | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  // Extract subjects and classes from profile
  useEffect(() => {
    if (!profile?.assignments) return;

    const assigns = profile.assignments as any[];
    const subSet = new Set<string>();
    const clsSet = new Set<string>();

    assigns.forEach(a => {
      if (a.subject) subSet.add(a.subject);
      if (a.class) clsSet.add(a.class);
    });

    const subs = [...subSet];
    const clss = [...clsSet];

    setSubjectList(subs);
    setClassList(clss);

    if (subs.length > 0 && !selectedSubject) setSelectedSubject(subs[0]);
    if (clss.length > 0 && !selectedClass) setSelectedClass(clss[0]);
  }, [profile?.assignments]);

  // Load students & build 2D Class Matrix
  useEffect(() => {
    if (!profile?.schoolId) return;

    const buildMatrix = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch Students in School (filtered by class if selected)
        let studentQuery = supabase
          .from('users')
          .select('id, name, custom_student_id, student_class, branch')
          .eq('school_id', profile.schoolId)
          .eq('role', 'student');

        const { data: studentData, error: sErr } = await studentQuery;
        if (sErr) throw sErr;

        let filteredStudents = studentData || [];
        if (selectedClass) {
          filteredStudents = filteredStudents.filter(s =>
            (s.student_class || s.branch || '').toLowerCase() === selectedClass.toLowerCase()
          );
        }
        setStudents(filteredStudents);

        // 2. Fetch Assignments for this school & subject
        let assignQuery = supabase
          .from('assignments')
          .select('id, title, subject, class, units')
          .eq('school_id', profile.schoolId);

        const { data: assignData } = await assignQuery;
        const relevantAssignments = (assignData || []).filter(a =>
          !selectedSubject || (a.subject || '').toLowerCase().includes(selectedSubject.toLowerCase())
        );

        // Extract distinct Curriculum Topics / Units
        const topicMap = new Map<string, TopicColumn>();
        relevantAssignments.forEach(a => {
          const rawUnits: string[] = Array.isArray(a.units) && a.units.length > 0
            ? a.units.filter((u: string) => u !== 'general' && u !== 'General')
            : [];

          const topicName = rawUnits.length > 0
            ? rawUnits[0]
            : (a.title ? a.title.trim() : 'Core Concepts');

          const topicId = topicName.toLowerCase().replace(/[^a-z0-9]/g, '_');
          if (!topicMap.has(topicId)) {
            topicMap.set(topicId, {
              id: topicId,
              name: topicName,
              subject: a.subject || selectedSubject || 'General',
            });
          }
        });

        // Default topics fallback if none exist yet
        if (topicMap.size === 0) {
          [
            'Chemical Reactions & Equations',
            'Acids, Bases & Salts',
            'Metals & Non-Metals',
            'Life Processes',
            'Control & Coordination',
          ].forEach(t => {
            const id = t.toLowerCase().replace(/[^a-z0-9]/g, '_');
            topicMap.set(id, { id, name: t, subject: selectedSubject || 'Science' });
          });
        }

        const topicColumns = Array.from(topicMap.values());
        setTopics(topicColumns);

        // 3. Fetch Submissions with Teacher Approval
        const { data: subsData } = await supabase
          .from('submissions')
          .select('student_id, assignment_id, score, max_score, teacher_approved')
          .eq('school_id', profile.schoolId)
          .eq('teacher_approved', true);

        // Map assignmentId -> topicId
        const assignToTopic: Record<string, string> = {};
        relevantAssignments.forEach(a => {
          const rawUnits: string[] = Array.isArray(a.units) && a.units.length > 0
            ? a.units.filter((u: string) => u !== 'general' && u !== 'General')
            : [];
          const topicName = rawUnits.length > 0 ? rawUnits[0] : (a.title ? a.title.trim() : 'Core Concepts');
          assignToTopic[a.id] = topicName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        });

        // 4. Aggregate Matrix Cells: matrix[studentId][topicId]
        const newMatrix: Record<string, Record<string, CellData>> = {};

        filteredStudents.forEach(st => {
          newMatrix[st.id] = {};
          topicColumns.forEach(tp => {
            newMatrix[st.id][tp.id] = { score: null, count: 0, confidence: 'insufficient' };
          });
        });

        (subsData || []).forEach(sub => {
          if (!newMatrix[sub.student_id]) return;
          const topicId = assignToTopic[sub.assignment_id];
          if (!topicId || !newMatrix[sub.student_id][topicId]) return;

          if (sub.score !== null && sub.max_score > 0) {
            const current = newMatrix[sub.student_id][topicId];
            const pct = (sub.score / sub.max_score) * 100;
            const newCount = current.count + 1;
            const newAvg = current.score === null
              ? pct
              : (current.score * current.count + pct) / newCount;

            const conf = newCount >= 8 ? 'firm' : newCount >= 4 ? 'provisional' : 'insufficient';

            newMatrix[sub.student_id][topicId] = {
              score: Math.round(newAvg),
              count: newCount,
              confidence: conf,
            };
          }
        });

        setMatrix(newMatrix);
      } catch (err) {
        console.error('[ClassMatrix] error building heatmap:', err);
      } finally {
        setIsLoading(false);
      }
    };

    buildMatrix();
  }, [profile?.schoolId, selectedClass, selectedSubject]);

  // Color helper for matrix cell boxes
  const getCellColor = (cell?: CellData) => {
    if (!cell || cell.score === null || cell.count < 4) {
      return {
        bg: 'bg-gray-100/90 hover:bg-gray-200',
        text: 'text-gray-400',
        border: 'border-gray-200',
        badge: 'bg-gray-200 text-gray-700',
        label: '—',
      };
    }
    if (cell.score >= 75) {
      return {
        bg: 'bg-emerald-500/15 hover:bg-emerald-500/25',
        text: 'text-emerald-800',
        border: 'border-emerald-300',
        badge: 'bg-emerald-600 text-white',
        label: `${cell.score}%`,
      };
    }
    if (cell.score >= 50) {
      return {
        bg: 'bg-amber-400/20 hover:bg-amber-400/35',
        text: 'text-amber-900',
        border: 'border-amber-300',
        badge: 'bg-amber-500 text-white',
        label: `${cell.score}%`,
      };
    }
    return {
      bg: 'bg-rose-500/20 hover:bg-rose-500/35',
      text: 'text-rose-950',
      border: 'border-rose-300',
      badge: 'bg-rose-600 text-white',
      label: `${cell.score}%`,
    };
  };

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
        title: `Targeted Practice: ${selectedCell.topic.name}`,
        description: `Personalized practice module targeting ${selectedCell.topic.name} for ${selectedCell.student.name}.`,
        type: 'quiz',
        subject: selectedCell.topic.subject || selectedSubject || 'General',
        class: selectedCell.student.student_class || selectedClass || '',
        units: [selectedCell.topic.name],
        due_date: dueDate.toISOString().split('T')[0],
        questions: [
          {
            questionText: `Solve: Demonstrating mastery in ${selectedCell.topic.name}.`,
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctOptionId: 0,
          },
        ],
      });

      if (error) throw error;
      alert(`✅ Targeted AI Practice module created for ${selectedCell.student.name}!`);
      setSelectedCell(null);
    } catch (err: any) {
      alert('Failed to assign practice: ' + err.message);
    } finally {
      setIsAssigning(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Class Mastery Matrix...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-[#002147] via-[#003b80] to-indigo-900 text-white p-8 rounded-3xl shadow-xl">
        <div className="flex items-center space-x-4">
          <Link href="/teacher" className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white backdrop-blur-md transition-all">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                Class Heatmap Matrix
              </span>
            </div>
            <h1 className="text-3xl font-extrabold mt-1">Class Topic Mastery Grid</h1>
            <p className="text-blue-200 text-sm mt-0.5">Live teacher-approved mastery scores per student & chapter</p>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3">
          {classList.length > 0 && (
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/10">
              <span className="text-xs font-bold text-blue-200 pl-3">Class:</span>
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="bg-white text-[#002147] font-black px-4 py-2 rounded-xl text-sm outline-none cursor-pointer"
              >
                {classList.map(c => <option key={c} value={c}>Class {c}</option>)}
              </select>
            </div>
          )}

          {subjectList.length > 0 && (
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/10">
              <span className="text-xs font-bold text-blue-200 pl-3">Subject:</span>
              <select
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                className="bg-white text-[#002147] font-black px-4 py-2 rounded-xl text-sm outline-none cursor-pointer"
              >
                {subjectList.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Mastery Color Code Legend */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs font-black text-gray-500 uppercase tracking-wider">
          <Layers className="w-4 h-4 text-indigo-600" />
          <span>Mastery Scale & Color Legend:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-emerald-800">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
            <span>≥75% Mastered (Green)</span>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl text-amber-800">
            <span className="w-3 h-3 rounded-full bg-amber-400 shrink-0" />
            <span>50–74% Developing (Yellow)</span>
          </div>
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl text-rose-800">
            <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
            <span>&lt;50% Needs Work (Red)</span>
          </div>
          <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-xl text-gray-600">
            <span className="w-3 h-3 rounded-full bg-gray-300 shrink-0" />
            <span>0–3 items (Grey / Insufficient)</span>
          </div>
        </div>
      </div>

      {/* 2D CLASS MASTERY MATRIX GRID TABLE */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-24 text-center text-gray-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
            <p className="font-bold text-sm text-[#002147]">Calculating Class Mastery Matrix...</p>
          </div>
        ) : students.length === 0 ? (
          <div className="py-24 text-center text-gray-400">
            <User className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="font-bold text-base text-[#002147]">No students found for Class {selectedClass}</p>
            <p className="text-xs mt-1">Select another class or add students in school settings.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              {/* Header Row: Topics & Chapters */}
              <thead>
                <tr className="bg-slate-50 border-b border-gray-200 text-[#002147]">
                  <th className="p-4 pl-6 font-black text-xs uppercase tracking-wider w-64 sticky left-0 bg-slate-50 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.03)]">
                    Student Roster ({students.length})
                  </th>
                  {topics.map(t => (
                    <th key={t.id} className="p-4 font-black text-xs tracking-tight text-center min-w-[150px] border-l border-gray-200/80">
                      <div className="line-clamp-2" title={t.name}>{t.name}</div>
                    </th>
                  ))}
                  <th className="p-4 pr-6 font-black text-xs uppercase tracking-wider text-center w-36 border-l-2 border-indigo-100 bg-indigo-50/50">
                    Overall Student Score
                  </th>
                </tr>
              </thead>

              {/* Matrix Rows: Student x Topics */}
              <tbody className="divide-y divide-gray-100">
                {students.map(st => {
                  const studentRow = matrix[st.id] || {};
                  // Calculate overall student score across topics with scores
                  const validCells = Object.values(studentRow).filter(c => c.score !== null && c.count >= 4);
                  const studentAvg = validCells.length > 0
                    ? Math.round(validCells.reduce((sum, c) => sum + (c.score || 0), 0) / validCells.length)
                    : null;

                  return (
                    <tr key={st.id} className="hover:bg-slate-50/60 transition-colors group">
                      {/* Student Name Cell (Sticky Left Column) */}
                      <td className="p-4 pl-6 font-bold text-sm text-[#002147] sticky left-0 bg-white group-hover:bg-slate-50/90 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.03)]">
                        <div className="font-bold text-sm text-[#002147]">{st.name}</div>
                        <div className="text-[11px] text-gray-400 font-medium">ID: {st.custom_student_id || st.id.slice(0, 8)}</div>
                      </td>

                      {/* Topic Score Cell Boxes */}
                      {topics.map(t => {
                        const cell = studentRow[t.id];
                        const style = getCellColor(cell);

                        return (
                          <td key={t.id} className="p-2.5 text-center border-l border-gray-100">
                            <button
                              onClick={() => setSelectedCell({ student: st, topic: t, data: cell })}
                              className={`w-full py-3 px-2 rounded-2xl border ${style.bg} ${style.border} transition-all duration-200 flex flex-col items-center justify-center space-y-0.5 group/box hover:scale-105 hover:shadow-md cursor-pointer`}
                            >
                              <span className={`font-black text-base ${style.text}`}>
                                {style.label}
                              </span>
                              {cell && cell.count > 0 && (
                                <span className="text-[10px] text-gray-400 font-medium group-hover/box:text-gray-700">
                                  {cell.count} item{cell.count !== 1 ? 's' : ''}
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}

                      {/* Overall Student Average Column */}
                      <td className="p-3 text-center border-l-2 border-indigo-100 bg-indigo-50/20 font-black">
                        {studentAvg !== null ? (
                          <span className={`inline-block px-3 py-1.5 rounded-xl text-xs font-black shadow-sm ${
                            studentAvg >= 75 ? 'bg-emerald-100 text-emerald-800' : studentAvg >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {studentAvg}%
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 font-normal">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Class Topic Average Row */}
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-gray-300 font-black text-xs text-[#002147]">
                  <td className="p-4 pl-6 sticky left-0 bg-slate-100 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.03)] uppercase tracking-wider">
                    Class Topic Averages
                  </td>
                  {topics.map(t => {
                    const topicScores = students
                      .map(st => matrix[st.id]?.[t.id]?.score)
                      .filter((sc): sc is number => sc !== null && sc !== undefined);

                    const classAvg = topicScores.length > 0
                      ? Math.round(topicScores.reduce((a, b) => a + b, 0) / topicScores.length)
                      : null;

                    const style = getCellColor(classAvg !== null ? { score: classAvg, count: 4, confidence: 'firm' } : undefined);

                    return (
                      <td key={t.id} className="p-3 text-center border-l border-gray-200">
                        {classAvg !== null ? (
                          <span className={`inline-block px-3 py-1.5 rounded-xl text-xs font-black ${style.badge}`}>
                            {classAvg}%
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-3 text-center border-l-2 border-indigo-200 bg-indigo-100/50">
                    Class Avg
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Drill-down / Assign Practice Modal */}
      {selectedCell && (
        <div className="fixed inset-0 bg-[#002147]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start border-b border-gray-100 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full">
                  Topic Diagnostic
                </span>
                <h3 className="text-xl font-bold text-[#002147] mt-1">{selectedCell.topic.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Student: {selectedCell.student.name}</p>
              </div>
              <button onClick={() => setSelectedCell(null)} className="text-gray-400 hover:text-gray-600 font-bold p-1">✕</button>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 font-medium">Calculated TML Score:</span>
                <span className="font-black text-lg text-[#002147]">
                  {selectedCell.data.score !== null && selectedCell.data.count >= 4
                    ? `${selectedCell.data.score}%`
                    : 'Insufficient Evidence (<4 items)'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Teacher-Approved Items:</span>
                <span className="font-bold text-gray-700">{selectedCell.data.count} items</span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Confidence Status:</span>
                <span className="font-bold text-indigo-600 uppercase tracking-wider">{selectedCell.data.confidence}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={handleAssignPractice}
                disabled={isAssigning}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>{isAssigning ? 'Creating Task...' : `Assign AI Practice on ${selectedCell.topic.name}`}</span>
              </button>
              <button
                onClick={() => setSelectedCell(null)}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-2xl transition-colors"
              >
                Close Diagnostic
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
