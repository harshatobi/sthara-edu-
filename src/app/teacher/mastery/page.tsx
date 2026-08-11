'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Search, Filter, Zap, User, ArrowLeft, RefreshCw, Award, TrendingUp, AlertTriangle, CheckCircle2, BookOpen } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface StudentRosterItem {
  id: string;
  name: string;
  custom_student_id?: string;
  student_class?: string;
  avatar_url?: string;
  roll: string;
  overallScore: number | null;
  grade: string;
  totalSubmissions: number;
  confidence: 'firm' | 'provisional' | 'insufficient';
  unitScores: Record<string, number | null>;
}

const DEFAULT_SUBJECTS = ['Science', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'Social Science'];
const STANDARD_UNITS = [
  { id: 'u1', label: 'Unit I: Core Foundations' },
  { id: 'u2', label: 'Unit II: Advanced Concepts' },
  { id: 'u3', label: 'Unit III: Practical Applications' },
  { id: 'u4', label: 'Unit IV: Problem Solving' },
  { id: 'u5', label: 'Unit V: Revision & Synthesis' }
];

const cleanStr = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function getGradeLetter(s: number | null): string {
  if (s === null) return '—';
  if (s >= 90) return 'A+';
  if (s >= 80) return 'A';
  if (s >= 70) return 'B';
  if (s >= 60) return 'C';
  return 'D';
}

function getScoreBadge(score: number | null) {
  if (score === null) return 'bg-[#eef3f8] text-[#a9b8c8] border-[#e2e9f1]';
  if (score < 50) return 'bg-[#f7d8d3] text-[#7a2119] border-[#e0a89f] font-bold';
  if (score < 75) return 'bg-[#f9e6bb] text-[#77510a] border-[#e6c87e] font-bold';
  return 'bg-[#c8e7d7] text-[#0e5237] border-[#93cbb0] font-bold';
}

export default function TeacherMasteryTrackerPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [classList, setClassList] = useState<string[]>([]);
  const [subjectList, setSubjectList] = useState<string[]>(DEFAULT_SUBJECTS);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('Science');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'at_risk' | 'mastered'>('all');

  const [roster, setRoster] = useState<StudentRosterItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedStudent, setSelectedStudent] = useState<StudentRosterItem | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  // Load Teacher Meta & Discover Real Database Classes & Subjects
  useEffect(() => {
    const fetchMeta = async () => {
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

      let assignQuery = supabase.from('assignments').select('subject, class');
      if (profile?.schoolId) assignQuery = assignQuery.eq('school_id', profile.schoolId);
      const { data: dbAssigns } = await assignQuery;

      (dbAssigns || []).forEach(a => {
        if (a.subject) subSet.add(a.subject);
        if (a.class) clsSet.add(a.class);
      });

      let studentQuery = supabase
        .from('users')
        .select('student_class, branch, school_id')
        .eq('role', 'student');
      if (profile?.schoolId) studentQuery = studentQuery.eq('school_id', profile.schoolId);
      const { data: dbStudents } = await studentQuery;

      (dbStudents || []).forEach(s => {
        const clsName = s.student_class || s.branch;
        if (clsName && clsName.trim()) clsSet.add(clsName.trim());
      });

      const finalClasses = clsSet.size > 0 ? [...clsSet] : ['10A', '10B', '9A'];
      const finalSubjects = [...subSet];

      setClassList(finalClasses);
      setSubjectList(finalSubjects);

      if (!selectedClass && finalClasses.length > 0) setSelectedClass(finalClasses[0]);
      if (!selectedSubject && finalSubjects.length > 0) setSelectedSubject(finalSubjects[0]);
    };

    fetchMeta();
  }, [profile]);

  // Load Real Supabase Roster & Mastery Progression with Smart Student Matching
  useEffect(() => {
    const loadMasteryData = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch Students
        let studentQuery = supabase
          .from('users')
          .select('id, name, custom_student_id, student_class, branch, avatar_url, school_id')
          .eq('role', 'student');

        if (profile?.schoolId) {
          studentQuery = studentQuery.eq('school_id', profile.schoolId);
        }

        const { data: rawStudents } = await studentQuery;
        const allStudents = rawStudents || [];

        // Flexible Class Matching Engine
        let matchedStudents = allStudents;
        if (selectedClass) {
          const targetClean = cleanStr(selectedClass);
          const matched = allStudents.filter(s => {
            const sClassRaw = s.student_class || s.branch || '';
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

        const studentIds = matchedStudents.map(s => s.id);

        // 2. Fetch Submissions
        const { data: subsData } = await supabase
          .from('submissions')
          .select('student_id, score, max_score, teacher_approved, assignments(subject, units, title)')
          .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

        // 3. Fetch TML Scores
        const { data: tmlData } = await supabase
          .from('tml_scores')
          .select('student_id, subject, topic_name, score, item_count, confidence_band')
          .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

        const rosterList: StudentRosterItem[] = matchedStudents.map((s, idx) => {
          const stSubs = (subsData || []).filter(sub => {
            if (sub.student_id !== s.id || !sub.teacher_approved || sub.score === null) return false;
            const assign = sub.assignments as any;
            return !selectedSubject || (assign?.subject || '').toLowerCase().includes(selectedSubject.toLowerCase());
          });

          let scoreSum = 0;
          let scoreCount = 0;
          const unitScores: Record<string, number | null> = {
            u1: null, u2: null, u3: null, u4: null, u5: null
          };

          stSubs.forEach(sub => {
            if (sub.max_score <= 0) return;
            const pct = Math.round((sub.score / sub.max_score) * 100);
            scoreSum += pct;
            scoreCount++;

            const assign = sub.assignments as any;
            const unitName = (Array.isArray(assign?.units) && assign.units[0]) || assign?.title || '';

            if (unitName.toLowerCase().includes('foundation') || unitName.toLowerCase().includes('reaction')) unitScores.u1 = pct;
            else if (unitName.toLowerCase().includes('acid') || unitName.toLowerCase().includes('concept')) unitScores.u2 = pct;
            else if (unitName.toLowerCase().includes('metal') || unitName.toLowerCase().includes('practical')) unitScores.u3 = pct;
            else if (unitName.toLowerCase().includes('life') || unitName.toLowerCase().includes('problem')) unitScores.u4 = pct;
            else unitScores.u5 = pct;
          });

          const stTmls = (tmlData || []).filter(t =>
            t.student_id === s.id && (!selectedSubject || t.subject.toLowerCase().includes(selectedSubject.toLowerCase()))
          );

          stTmls.forEach(tml => {
            if (tml.score === null) return;
            scoreSum += Math.round(tml.score);
            scoreCount++;
          });

          const overall = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null;
          const conf = scoreCount >= 8 ? 'firm' : scoreCount >= 4 ? 'provisional' : 'insufficient';

          return {
            id: s.id,
            name: s.name || `Student ${idx + 1}`,
            custom_student_id: s.custom_student_id,
            student_class: s.student_class || s.branch || selectedClass,
            avatar_url: s.avatar_url,
            roll: String(idx + 1).padStart(2, '0'),
            overallScore: overall,
            grade: getGradeLetter(overall),
            totalSubmissions: scoreCount,
            confidence: conf,
            unitScores
          };
        });

        setRoster(rosterList);
      } catch (err) {
        console.error('[MasteryTracker error]:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadMasteryData();
  }, [profile, selectedClass, selectedSubject]);

  const filteredRoster = useMemo(() => {
    return roster.filter(st => {
      const matchesSearch = !searchQuery ||
        st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        st.roll.includes(searchQuery) ||
        (st.custom_student_id && st.custom_student_id.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;
      if (statusFilter === 'at_risk') return st.overallScore !== null && st.overallScore < 50;
      if (statusFilter === 'mastered') return st.overallScore !== null && st.overallScore >= 75;
      return true;
    });
  }, [roster, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const scored = roster.filter(r => r.overallScore !== null);
    const avg = scored.length > 0 ? Math.round(scored.reduce((s, r) => s + (r.overallScore || 0), 0) / scored.length) : 0;
    const mastered = roster.filter(r => r.overallScore !== null && r.overallScore >= 75).length;
    const atRisk = roster.filter(r => r.overallScore !== null && r.overallScore < 50).length;

    return { avg, mastered, atRisk, total: roster.length };
  }, [roster]);

  const handleAssignTargeted = async () => {
    if (!selectedStudent || !profile?.schoolId) return;
    setIsAssigning(true);
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      const { error } = await supabase.from('assignments').insert({
        school_id: profile.schoolId,
        teacher_id: profile.id,
        teacher_name: profile.name || 'Teacher',
        title: `Targeted Mastery Booster: ${selectedSubject}`,
        description: `Personalized AI mastery booster module generated for ${selectedStudent.name}.`,
        type: 'quiz',
        subject: selectedSubject,
        class: selectedClass || '10A',
        units: [`${selectedSubject} Revision`],
        due_date: dueDate.toISOString().split('T')[0],
        questions: [
          {
            questionText: `Mastery synthesis questions for ${selectedStudent.name}`,
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctOptionId: 0,
          },
        ],
      });

      if (error) throw error;
      alert(`✅ Targeted AI Mastery Booster assigned to ${selectedStudent.name}!`);
      setSelectedStudent(null);
    } catch (err: any) {
      alert('Failed to assign mastery booster: ' + err.message);
    } finally {
      setIsAssigning(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Mastery Tracker...</div>;

  return (
    <div className="min-h-screen bg-[#f2f6fa] text-[#0b1a2b] pb-24 font-sans">
      {/* Header */}
      <header className="bg-[#002147] text-white px-6 py-3.5 flex items-center justify-between sticky top-0 z-40 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-black text-white text-sm border border-white/20">
            S
          </div>
          <div className="font-extrabold text-base tracking-tight">
            Sthara <span className="font-normal text-xs text-white/70 uppercase tracking-widest ml-2">School OS · Mastery Progression Tracker</span>
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
              {classList.map(c => <option key={c} value={c} className="text-[#002147] bg-white">Class {c}</option>)}
            </select>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div>
            <h2 className="text-2xl font-extrabold text-[#002147]">Class {selectedClass || '10A'} — {selectedSubject} Mastery Roster</h2>
            <p className="text-xs text-gray-500 mt-1">Individual student grade progression, evidence confidence, and unit mastery status</p>
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student name or roll..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#002147] w-64"
              />
            </div>

            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl p-1 text-xs font-bold">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-all ${statusFilter === 'all' ? 'bg-[#002147] text-white shadow' : 'text-gray-600'}`}
              >
                All ({roster.length})
              </button>
              <button
                onClick={() => setStatusFilter('mastered')}
                className={`px-2.5 py-1 rounded-lg transition-all ${statusFilter === 'mastered' ? 'bg-emerald-600 text-white shadow' : 'text-gray-600'}`}
              >
                Mastered ({stats.mastered})
              </button>
              <button
                onClick={() => setStatusFilter('at_risk')}
                className={`px-2.5 py-1 rounded-lg transition-all ${statusFilter === 'at_risk' ? 'bg-red-600 text-white shadow' : 'text-gray-600'}`}
              >
                At Risk ({stats.atRisk})
              </button>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-[#002147] flex items-center justify-center font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase text-gray-400">Total Enrolled</span>
              <p className="text-xl font-black text-[#002147]">{stats.total} Students</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase text-gray-400">Subject TML Average</span>
              <p className="text-xl font-black text-[#002147]">{stats.avg > 0 ? `${stats.avg}%` : '—'}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase text-gray-400">Mastered Students</span>
              <p className="text-xl font-black text-emerald-700">{stats.mastered}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center font-bold">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase text-gray-400">Students At Risk</span>
              <p className="text-xl font-black text-red-700">{stats.atRisk}</p>
            </div>
          </div>
        </div>

        {/* Student Roster Progression Table */}
        <div className="bg-white rounded-2xl border border-gray-300 shadow-md overflow-hidden">
          {isLoading ? (
            <div className="py-20 text-center text-gray-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#002147]" />
              <p className="font-bold text-sm text-[#002147]">Loading Student Mastery Progression...</p>
            </div>
          ) : filteredRoster.length === 0 ? (
            <div className="py-20 text-center text-gray-400 space-y-2">
              <User className="w-10 h-10 mx-auto text-gray-300" />
              <p className="font-bold text-[#002147]">No matching students found</p>
              <p className="text-xs">Try adjusting your search query or status filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-gray-200 text-xs">
                <thead>
                  <tr className="bg-[#002147] text-white">
                    <th className="p-3.5 pl-5 font-black uppercase text-[11px] tracking-wider w-56">Student</th>
                    <th className="p-3.5 font-bold text-center w-28">Subject Grade</th>
                    <th className="p-3.5 font-bold text-center w-40">Overall TML Score</th>
                    {STANDARD_UNITS.map(u => (
                      <th key={u.id} className="p-3.5 font-bold text-center min-w-[120px]">
                        <div>{u.label.split(':')[0]}</div>
                        <span className="block text-[9px] text-white/60 font-normal uppercase tracking-widest mt-0.5">{u.label.split(':')[1]}</span>
                      </th>
                    ))}
                    <th className="p-3.5 font-bold text-center w-36">Evidence Confidence</th>
                    <th className="p-3.5 font-bold text-center w-32 pr-5">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200">
                  {filteredRoster.map((st, idx) => {
                    const bgColors = ['bg-[#002147]', 'bg-indigo-600', 'bg-blue-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600'];
                    const avatarBg = bgColors[idx % bgColors.length];

                    return (
                      <tr key={st.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 pl-5 border-r border-gray-200">
                          <div className="flex items-center space-x-3">
                            {st.avatar_url ? (
                              <img src={st.avatar_url} alt={st.name} className="w-8 h-8 rounded-full object-cover shrink-0 border border-gray-200" />
                            ) : (
                              <div className={`w-8 h-8 rounded-full ${avatarBg} text-white flex items-center justify-center font-bold text-xs shrink-0`}>
                                {st.name ? st.name.split(' ').map(n => n[0]).join('') : 'S'}
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-[#002147] text-xs leading-none">{st.name}</p>
                              <span className="text-[10px] text-gray-400 font-medium mt-1 block">Roll {st.roll}</span>
                            </div>
                          </div>
                        </td>

                        <td className="p-3 text-center border-r border-gray-200">
                          <span className={`inline-block px-3 py-1 rounded-lg font-black text-sm ${
                            st.grade === 'A+' || st.grade === 'A' ? 'bg-emerald-100 text-emerald-800' :
                            st.grade === 'B' || st.grade === 'C' ? 'bg-amber-100 text-amber-800' :
                            st.grade === 'D' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {st.grade}
                          </span>
                        </td>

                        <td className="p-3 border-r border-gray-200">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between font-bold text-[11px]">
                              <span className="text-gray-500">TML Score</span>
                              <span className={st.overallScore !== null && st.overallScore >= 75 ? 'text-emerald-700' : 'text-amber-700'}>
                                {st.overallScore !== null ? `${st.overallScore}%` : '—'}
                              </span>
                            </div>
                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-[#002147] h-full rounded-full transition-all"
                                style={{ width: `${st.overallScore || 0}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {STANDARD_UNITS.map(u => {
                          const sc = st.unitScores[u.id];
                          const bStyle = getScoreBadge(sc);

                          return (
                            <td key={u.id} className="p-2 text-center border-r border-gray-200 align-middle">
                              <div className={`py-2 px-2.5 rounded-lg border text-xs text-center font-bold ${bStyle}`}>
                                {sc !== null ? `${sc}%` : '—'}
                              </div>
                            </td>
                          );
                        })}

                        <td className="p-3 text-center border-r border-gray-200">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${
                            st.confidence === 'firm' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            st.confidence === 'provisional' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-gray-50 text-gray-400 border-gray-200'
                          }`}>
                            {st.confidence === 'firm' ? 'Firm TML (8+ items)' : st.confidence === 'provisional' ? 'Provisional' : 'Insufficient'}
                          </span>
                        </td>

                        <td className="p-3 text-center pr-5">
                          <button
                            onClick={() => setSelectedStudent(st)}
                            className="px-3 py-1.5 bg-[#002147] hover:bg-blue-900 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center justify-center space-x-1.5 mx-auto"
                          >
                            <Zap className="w-3.5 h-3.5 text-amber-300" />
                            <span>Target</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {selectedStudent && (
        <div className="fixed inset-0 bg-[#002147]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-start border-b border-gray-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full">
                  Mastery Booster Diagnostic
                </span>
                <h3 className="text-lg font-extrabold text-[#002147] mt-1">{selectedStudent.name}</h3>
                <p className="text-xs text-gray-500">Roll {selectedStudent.roll} · Class {selectedClass || '10A'}</p>
              </div>
              <button onClick={() => setSelectedStudent(null)} className="text-gray-400 hover:text-gray-600 font-bold p-1">✕</button>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 font-medium">Subject Grade & TML:</span>
                <span className="font-black text-base text-[#002147]">
                  {selectedStudent.grade} ({selectedStudent.overallScore !== null ? `${selectedStudent.overallScore}%` : 'No Data'})
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Evidence Items Count:</span>
                <span className="font-bold text-gray-700">{selectedStudent.totalSubmissions} graded item(s)</span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={handleAssignTargeted}
                disabled={isAssigning}
                className="w-full py-3 bg-[#002147] hover:bg-blue-900 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <Zap className="w-4 h-4 text-amber-300" />
                <span>{isAssigning ? 'Generating Practice...' : `Assign AI Mastery Booster for ${selectedSubject}`}</span>
              </button>
              <button
                onClick={() => setSelectedStudent(null)}
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
