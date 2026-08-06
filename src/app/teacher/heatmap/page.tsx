'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Users, TrendingUp, AlertTriangle, Clock } from 'lucide-react';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import Link from 'next/link';

const UNIT_ORDER = ['unit_1', 'unit_2', 'unit_3', 'unit_4', 'unit_5'];
const UNIT_LABEL: Record<string, string> = {
  unit_1: 'Unit I',
  unit_2: 'Unit II',
  unit_3: 'Unit III',
  unit_4: 'Unit IV',
  unit_5: 'Unit V',
};

function scoreCell(score: number | null): { bg: string; text: string; label: string; bar: string; ring: string } {
  if (score === null) return { label: '—',         bg: 'bg-gray-100',    text: 'text-gray-400',    bar: 'bg-gray-200',    ring: 'ring-gray-200' };
  if (score >= 75)   return { label: `${score}%`, bg: 'bg-emerald-50',  text: 'text-emerald-700', bar: 'bg-emerald-500', ring: 'ring-emerald-200' };
  if (score >= 50)   return { label: `${score}%`, bg: 'bg-amber-50',    text: 'text-amber-700',   bar: 'bg-amber-400',   ring: 'ring-amber-200' };
  return               { label: `${score}%`, bg: 'bg-red-50',      text: 'text-red-700',     bar: 'bg-red-500',     ring: 'ring-red-200' };
}

function getInitials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

export default function TeacherHeatmap() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [teacherSubjects, setTeacherSubjects] = useState<string[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [unitCols, setUnitCols] = useState<string[]>([]);
  const [unitScores, setUnitScores] = useState<Record<string, Record<string, number | null>>>({});
  const [overallScores, setOverallScores] = useState<Record<string, number | null>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnitData, setHasUnitData] = useState(true);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) router.push('/login');
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.assignments) return;
    const subs = [...new Set(
      (profile.assignments as any[]).map((a: any) => a.subject).filter(Boolean)
    )] as string[];
    setTeacherSubjects(subs);
    if (!selectedSubject && subs.length > 0) setSelectedSubject(subs[0]);
  }, [profile?.assignments]);

  useEffect(() => {
    if (!profile?.schoolId || !selectedSubject) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const token = await getAuthToken();
        const res = await fetch('/api/teacher/heatmap-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ schoolId: profile.schoolId, subjectFilter: selectedSubject }),
        });
        if (!res.ok) throw new Error('Failed to fetch heatmap data');
        const { students: classStudents, assignments: assignmentsData, submissions } = await res.json();

        setStudents(classStudents || []);

        if (!classStudents?.length) {
          setUnitCols([]);
          setUnitScores({});
          setOverallScores({});
          setHasUnitData(false);
          return;
        }

        // Check if any assignments have unit tags
        const unitSet = new Set<string>();
        (assignmentsData as any[]).forEach(a => {
          if (Array.isArray(a.units)) a.units.forEach((u: string) => unitSet.add(u));
        });

        const unitColsSorted = UNIT_ORDER.filter(u => unitSet.has(u));
        const noUnitTags = unitColsSorted.length === 0;
        setHasUnitData(!noUnitTags || assignmentsData.length > 0);

        // ── Fallback: use memory_profile scores when no unit tags ─────────────
        if (noUnitTags) {
          // Use the student's memory_profile for a general overview
          const overallMap: Record<string, number | null> = {};
          classStudents.forEach((s: any) => {
            const mp = s.memory_profile;
            if (mp?.overallMastery !== undefined) {
              overallMap[s.id] = Math.round(Number(mp.overallMastery));
            } else if (mp?.unitScores) {
              const vals = Object.values(mp.unitScores).map(Number).filter(v => !isNaN(v));
              overallMap[s.id] = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
            } else {
              overallMap[s.id] = null;
            }
          });
          setUnitCols([]);
          setUnitScores({});
          setOverallScores(overallMap);
          return;
        }

        setUnitCols(unitColsSorted);

        const subByStudent: Record<string, any[]> = {};
        (submissions as any[]).forEach(sub => {
          if (!subByStudent[sub.student_id]) subByStudent[sub.student_id] = [];
          subByStudent[sub.student_id].push(sub);
        });

        const newUnitScores: Record<string, Record<string, number | null>> = {};
        const newOverall: Record<string, number | null> = {};

        classStudents.forEach((s: any) => {
          newUnitScores[s.id] = {};
          unitColsSorted.forEach(u => { newUnitScores[s.id][u] = null; });

          const studentSubs = subByStudent[s.id] || [];
          const allPcts: number[] = [];

          unitColsSorted.forEach(unitId => {
            const matchingAssignIds = new Set<string>(
              (assignmentsData as any[])
                .filter(a =>
                  unitId === 'general'
                    ? (!a.units || a.units.length === 0)
                    : Array.isArray(a.units) && a.units.includes(unitId)
                )
                .map((a: any) => a.id)
            );
            if (matchingAssignIds.size === 0) return;

            const unitSubs = studentSubs.filter(
              sub => matchingAssignIds.has(sub.assignment_id) && sub.score !== null && sub.max_score
            );
            if (unitSubs.length === 0) return;

            const pcts = unitSubs.map(sub => Math.round((sub.score / sub.max_score) * 100));
            const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
            newUnitScores[s.id][unitId] = avg;
            allPcts.push(avg);
          });

          newOverall[s.id] = allPcts.length > 0
            ? Math.round(allPcts.reduce((a, b) => a + b, 0) / allPcts.length)
            : null;
        });

        setUnitScores(newUnitScores);
        setOverallScores(newOverall);

      } catch (err: any) {
        console.error('[teacher heatmap]', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [profile?.schoolId, selectedSubject]);

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const proficientCount = students.filter(s => (overallScores[s.id] ?? 0) >= 75).length;
  const atRiskCount     = students.filter(s => overallScores[s.id] !== null && (overallScores[s.id] ?? 0) < 50).length;
  const developingCount = students.filter(s => overallScores[s.id] !== null && (overallScores[s.id] ?? 0) >= 50 && (overallScores[s.id] ?? 0) < 75).length;
  const pendingCount    = students.filter(s => overallScores[s.id] === null).length;

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href="/teacher" className="p-2 rounded-xl hover:bg-gray-200 text-gray-700 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-bold text-gray-900 text-2xl">Class Performance Heatmap</h1>
            <p className="text-sm text-gray-500">
              {unitCols.length > 0
                ? 'Scores mapped to units tagged on each assignment'
                : 'Student overview — assign unit-tagged work to see per-unit breakdown'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {teacherSubjects.length > 0 && (
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="bg-[#002147] text-white font-bold px-4 py-2 rounded-xl text-sm"
            >
              {teacherSubjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button
            onClick={() => setSelectedSubject(s => s)} // trigger re-fetch
            className="p-2 bg-white border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {!isLoading && students.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-black text-gray-900">{students.length}</div>
              <div className="text-xs font-semibold text-gray-500">Total Students</div>
            </div>
          </div>

          <div className="bg-white border border-emerald-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-2xl font-black text-emerald-700">{proficientCount}</div>
              <div className="text-xs font-semibold text-emerald-600">Proficient ≥75%</div>
            </div>
          </div>

          <div className="bg-white border border-amber-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="text-2xl font-black text-amber-700">{developingCount}</div>
              <div className="text-xs font-semibold text-amber-600">Developing 50–74%</div>
            </div>
          </div>

          <div className="bg-white border border-red-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <div className="text-2xl font-black text-red-700">{atRiskCount}</div>
              <div className="text-xs font-semibold text-red-600">At Risk &lt;50%</div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      {!isLoading && students.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap text-xs font-semibold">
          <span className="text-gray-400 uppercase tracking-wider">Legend:</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />≥75% Proficient</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />50–74% Developing</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />&lt;50% At Risk</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />No data yet</span>
        </div>
      )}

      {/* Heatmap table */}
      <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm overflow-x-auto">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
            <span className="font-medium">Computing heatmap from submission data…</span>
          </div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <p className="font-bold text-gray-600">No students found for {selectedSubject}</p>
            <p className="text-sm text-gray-400 mt-2">Make sure students are enrolled and assigned to this subject.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-100">
                <th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider min-w-[160px]">
                  Student
                </th>
                {unitCols.map(u => (
                  <th key={u} className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider text-center min-w-[100px]">
                    {UNIT_LABEL[u] || u.replace('_', ' ')}
                  </th>
                ))}
                <th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider text-center min-w-[100px]">
                  {unitCols.length > 0 ? 'Overall' : 'Score'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.map(s => {
                const overallClr = scoreCell(overallScores[s.id] ?? null);
                return (
                  <tr key={s.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-black text-indigo-700 shrink-0">
                          {getInitials(s.name || 'ST')}
                        </div>
                        <div>
                          <div className="font-bold text-[#002147] text-sm">{s.name || 'Student'}</div>
                          <div className="text-xs font-mono text-gray-400">
                            {s.custom_student_id || s.id.slice(0, 6)}
                          </div>
                          {/* Mini bar */}
                          <div className="w-20 bg-gray-100 h-1 rounded-full mt-1 overflow-hidden">
                            <div
                              className={`h-1 rounded-full ${overallClr.bar}`}
                              style={{ width: `${overallScores[s.id] ?? 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                    {unitCols.map(u => {
                      const score = unitScores[s.id]?.[u] ?? null;
                      const clr = scoreCell(score);
                      return (
                        <td key={u} className="p-3 text-center">
                          <div className={`inline-flex items-center justify-center px-3 py-2 rounded-xl text-xs font-black ring-1 ${clr.ring} ${clr.bg} ${clr.text} min-w-[56px]`}>
                            {clr.label}
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-3 text-center">
                      <div className={`inline-flex items-center justify-center px-3 py-2 rounded-xl text-xs font-black ring-1 ${overallClr.ring} ${overallClr.bg} ${overallClr.text} min-w-[56px]`}>
                        {overallClr.label}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer hint */}
      {!isLoading && unitCols.length === 0 && students.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-2xl text-sm text-blue-800">
          <Clock className="w-5 h-5 shrink-0 mt-0.5 text-blue-500" />
          <div>
            <p className="font-bold">Unit breakdown not yet available</p>
            <p className="text-xs mt-1 text-blue-600">When you post an assignment, select which Unit (I, II, III…) it covers. Those unit tags become separate heatmap columns automatically.</p>
          </div>
        </div>
      )}

      {!isLoading && students.length > 0 && (
        <p className="text-xs text-gray-400 text-center pb-4">
          {unitCols.length > 0
            ? 'Each column = a unit you tagged when posting an assignment. Scores are computed from graded submissions.'
            : 'Scores shown from student performance profiles. Tag units on assignments for a detailed breakdown.'}
        </p>
      )}
    </div>
  );
}
