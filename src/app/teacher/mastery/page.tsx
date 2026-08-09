'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Zap, User, Layers } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface StudentRow {
  id: string;
  name: string;
  custom_student_id?: string;
  student_class?: string;
  avatar_url?: string;
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

function getLetterGrade(s: number | null): string {
  if (s === null) return '—';
  if (s >= 95) return 'A+';
  if (s >= 90) return 'A';
  if (s >= 85) return 'A-';
  if (s >= 75) return 'B+';
  if (s >= 65) return 'B';
  if (s >= 55) return 'C+';
  if (s >= 50) return 'C';
  return 'D';
}

function getGradeBadgeStyle(letter: string) {
  if (letter === 'A+' || letter === 'A') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (letter === 'A-' || letter === 'B+') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (letter === 'B' || letter === 'C+') return 'bg-amber-100 text-amber-800 border-amber-300';
  if (letter === 'C') return 'bg-orange-100 text-orange-800 border-orange-300';
  if (letter === 'D') return 'bg-rose-100 text-rose-800 border-rose-300';
  return 'bg-gray-100 text-gray-500 border-gray-200';
}

// Fixed set of standard CBSE Science & Math topics matching exact design layout
const DEFAULT_TOPICS: TopicColumn[] = [
  { id: 'chem_rxn', name: 'Chemical Reactions', subject: 'Science' },
  { id: 'acids_bases', name: 'Acids, Bases & Salts', subject: 'Science' },
  { id: 'metals_nonmetals', name: 'Metals & Non-Metals', subject: 'Science' },
  { id: 'life_proc', name: 'Life Processes', subject: 'Science' },
  { id: 'control_coord', name: 'Control & Coordination', subject: 'Science' },
  { id: 'comp_curr', name: 'Computing Current', subject: 'Science' },
  { id: 'eff_curr_1', name: 'Effects & Current', subject: 'Science' },
  { id: 'eff_curr_2', name: 'Effects of Current', subject: 'Science' },
  { id: 'nat_resources', name: 'Natural Resources', subject: 'Science' },
];

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
  const [topics, setTopics] = useState<TopicColumn[]>(DEFAULT_TOPICS);
  const [matrix, setMatrix] = useState<Record<string, Record<string, CellData>>>({});

  const [selectedCell, setSelectedCell] = useState<{ student: StudentRow; topic: TopicColumn; data: CellData } | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

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

  useEffect(() => {
    if (!profile?.schoolId) return;

    const buildMatrix = async () => {
      setIsLoading(true);
      try {
        let studentQuery = supabase
          .from('users')
          .select('id, name, custom_student_id, student_class, branch, avatar_url')
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

        let assignQuery = supabase
          .from('assignments')
          .select('id, title, subject, class, units')
          .eq('school_id', profile.schoolId);

        const { data: assignData } = await assignQuery;
        const relevantAssignments = (assignData || []).filter(a =>
          !selectedSubject || (a.subject || '').toLowerCase().includes(selectedSubject.toLowerCase())
        );

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
              subject: a.subject || selectedSubject || 'Science',
            });
          }
        });

        // Use default topics list if no dynamically extracted topics exist yet
        let topicColumns = Array.from(topicMap.values());
        if (topicColumns.length === 0) {
          topicColumns = DEFAULT_TOPICS;
        } else {
          // Ensure we have at least 5-9 columns for a complete grid layout
          DEFAULT_TOPICS.forEach(dt => {
            if (!topicColumns.some(tc => tc.id === dt.id)) {
              topicColumns.push(dt);
            }
          });
        }
        setTopics(topicColumns);

        const { data: subsData } = await supabase
          .from('submissions')
          .select('student_id, assignment_id, score, max_score, teacher_approved')
          .eq('school_id', profile.schoolId)
          .eq('teacher_approved', true);

        const assignToTopic: Record<string, string> = {};
        relevantAssignments.forEach(a => {
          const rawUnits: string[] = Array.isArray(a.units) && a.units.length > 0
            ? a.units.filter((u: string) => u !== 'general' && u !== 'General')
            : [];
          const topicName = rawUnits.length > 0 ? rawUnits[0] : (a.title ? a.title.trim() : 'Core Concepts');
          assignToTopic[a.id] = topicName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        });

        const newMatrix: Record<string, Record<string, CellData>> = {};

        filteredStudents.forEach(st => {
          newMatrix[st.id] = {};
          topicColumns.forEach(tp => {
            newMatrix[st.id][tp.id] = { score: null, count: 0, confidence: 'insufficient' };
          });
        });

        (subsData || []).forEach(sub => {
          if (!newMatrix[sub.student_id]) return;
          const topicId = assignToTopic[sub.assignment_id] || topicColumns[0]?.id;
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
        console.error('[ClassMatrix] error building matrix:', err);
      } finally {
        setIsLoading(false);
      }
    };

    buildMatrix();
  }, [profile?.schoolId, selectedClass, selectedSubject]);

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
    <div className="max-w-[1500px] mx-auto space-y-6 animate-in fade-in duration-500 pb-20 px-2 sm:px-4">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-4">
          <Link href="/teacher" className="p-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl text-[#002147] border border-gray-200 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-[#002147]">Class Mastery Heatmap Grid</h1>
            <p className="text-gray-500 text-xs mt-0.5">Real-time student performance matrix per curriculum chapter</p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {classList.length > 0 && (
            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
              <span className="text-xs font-bold text-gray-500 pl-2">Class:</span>
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="bg-white text-[#002147] font-bold px-3 py-1.5 rounded-lg text-xs outline-none cursor-pointer border border-gray-200"
              >
                {classList.map(c => <option key={c} value={c}>Class {c}</option>)}
              </select>
            </div>
          )}

          {subjectList.length > 0 && (
            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
              <span className="text-xs font-bold text-gray-500 pl-2">Subject:</span>
              <select
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                className="bg-white text-[#002147] font-bold px-3 py-1.5 rounded-lg text-xs outline-none cursor-pointer border border-gray-200"
              >
                {subjectList.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Color Code Legend */}
      <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs font-bold">
        <div className="flex items-center gap-2 text-gray-500 uppercase tracking-wider font-black text-[11px]">
          <Layers className="w-4 h-4 text-indigo-600" />
          <span>Mastery Scale:</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-md bg-[#22c55e] text-white flex items-center justify-center text-[10px] font-black">75+</span>
            <span className="text-gray-700">Mastered (Green)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-md bg-[#eab308] text-black flex items-center justify-center text-[10px] font-black">50+</span>
            <span className="text-gray-700">Developing (Yellow)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-md bg-[#ef4444] text-white flex items-center justify-center text-[10px] font-black">&lt;50</span>
            <span className="text-gray-700">Needs Work (Red)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-md bg-[#9ca3af] text-white flex items-center justify-center text-[10px] font-black">-</span>
            <span className="text-gray-500">Insufficient Data (Grey)</span>
          </div>
        </div>
      </div>

      {/* 2D CLASS MASTERY MATRIX GRID TABLE */}
      <div className="bg-white rounded-2xl border border-gray-300 shadow-md overflow-hidden">
        {isLoading ? (
          <div className="py-24 text-center text-gray-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
            <p className="font-bold text-sm text-[#002147]">Building Class Mastery Heatmap Matrix...</p>
          </div>
        ) : students.length === 0 ? (
          <div className="py-24 text-center text-gray-400">
            <User className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="font-bold text-base text-[#002147]">No students found for Class {selectedClass}</p>
            <p className="text-xs mt-1">Select another class or register students in school settings.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-gray-300 text-sm">
              {/* Header Row: Student Name + Topics + Overall Grade */}
              <thead>
                <tr className="bg-[#f8fafc] border-b border-gray-300 text-[#002147]">
                  <th className="p-3 pl-4 font-black text-xs text-gray-800 w-56 sticky left-0 bg-[#f8fafc] z-20 border-r border-gray-300 shadow-[2px_0_5px_rgba(0,0,0,0.03)]">
                    Student Name
                  </th>
                  {topics.map(t => (
                    <th key={t.id} className="p-3 font-bold text-xs text-center min-w-[130px] border-r border-gray-300 align-top">
                      <div className="leading-tight text-gray-800" title={t.name}>{t.name}</div>
                    </th>
                  ))}
                  <th className="p-3 pr-4 font-black text-xs text-center w-28 bg-[#f1f5f9] border-l-2 border-gray-300 text-gray-800">
                    Overall Grade
                  </th>
                </tr>
              </thead>

              {/* Rows: Student x Topics */}
              <tbody className="divide-y divide-gray-200">
                {students.map((st, sIdx) => {
                  const studentRow = matrix[st.id] || {};
                  const validCells = Object.values(studentRow).filter(c => c.score !== null);
                  const studentAvg = validCells.length > 0
                    ? Math.round(validCells.reduce((sum, c) => sum + (c.score || 0), 0) / validCells.length)
                    : null;
                  const letterGrade = getLetterGrade(studentAvg);
                  const letterStyle = getGradeBadgeStyle(letterGrade);

                  // Generate initial colors for student avatars
                  const bgColors = ['bg-indigo-600', 'bg-blue-600', 'bg-violet-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600', 'bg-teal-600', 'bg-purple-600'];
                  const avatarBg = bgColors[sIdx % bgColors.length];

                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition-colors group border-b border-gray-200">
                      {/* Student Name Cell with Round Avatar */}
                      <td className="p-3 pl-4 font-bold text-xs text-[#002147] sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-gray-300 shadow-[2px_0_5px_rgba(0,0,0,0.03)]">
                        <div className="flex items-center space-x-2.5">
                          {st.avatar_url ? (
                            <img src={st.avatar_url} alt={st.name} className="w-8 h-8 rounded-full object-cover shrink-0 border border-gray-200 shadow-sm" />
                          ) : (
                            <div className={`w-8 h-8 rounded-full ${avatarBg} text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm`}>
                              {st.name ? st.name.charAt(0).toUpperCase() : 'S'}
                            </div>
                          )}
                          <span className="font-extrabold text-[#002147] text-xs truncate max-w-[150px]">{st.name}</span>
                        </div>
                      </td>

                      {/* Topic Percentage Cell Badges */}
                      {topics.map(t => {
                        const cell = studentRow[t.id];
                        const hasScore = cell && cell.score !== null;
                        const score = cell?.score ?? null;

                        let pillClass = 'bg-[#9ca3af] text-white'; // Grey
                        if (hasScore) {
                          if (score! >= 75) pillClass = 'bg-[#22c55e] text-white';        // Green
                          else if (score! >= 50) pillClass = 'bg-[#eab308] text-[#002147]'; // Yellow
                          else pillClass = 'bg-[#ef4444] text-white';                     // Red
                        }

                        return (
                          <td key={t.id} className="p-2 text-center border-r border-gray-200 align-middle">
                            <button
                              onClick={() => setSelectedCell({ student: st, topic: t, data: cell })}
                              className="w-full focus:outline-none"
                            >
                              <div className={`w-16 mx-auto py-1.5 rounded-lg font-black text-xs text-center shadow-sm transition-transform hover:scale-105 cursor-pointer ${pillClass}`}>
                                {hasScore ? `${score}%` : '-'}
                              </div>
                            </button>
                          </td>
                        );
                      })}

                      {/* Overall Grade Badge Column */}
                      <td className="p-2 text-center bg-[#f8fafc] border-l-2 border-gray-300 align-middle">
                        {studentAvg !== null ? (
                          <span className={`inline-block w-10 py-1 rounded-lg text-xs font-black border text-center shadow-sm ${letterStyle}`}>
                            {letterGrade}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 font-bold">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drill-down / Assign Practice Modal */}
      {selectedCell && (
        <div className="fixed inset-0 bg-[#002147]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start border-b border-gray-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full">
                  Topic Diagnostic
                </span>
                <h3 className="text-lg font-extrabold text-[#002147] mt-1">{selectedCell.topic.name}</h3>
                <p className="text-xs text-gray-500">Student: {selectedCell.student.name}</p>
              </div>
              <button onClick={() => setSelectedCell(null)} className="text-gray-400 hover:text-gray-600 font-bold p-1">✕</button>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 font-medium">Calculated Score:</span>
                <span className="font-black text-base text-[#002147]">
                  {selectedCell.data.score !== null ? `${selectedCell.data.score}%` : 'No data recorded yet'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Teacher-Approved Submissions:</span>
                <span className="font-bold text-gray-700">{selectedCell.data.count} submission(s)</span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={handleAssignPractice}
                disabled={isAssigning}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>{isAssigning ? 'Creating Task...' : `Assign Practice on ${selectedCell.topic.name}`}</span>
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
