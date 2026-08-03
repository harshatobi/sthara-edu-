'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import Link from 'next/link';

// ── Unit helpers ─────────────────────────────────────────────────────────────
const UNIT_ORDER = ['unit_1', 'unit_2', 'unit_3', 'unit_4', 'unit_5'];
const UNIT_LABEL: Record<string, string> = {
  unit_1: 'Unit I',
  unit_2: 'Unit II',
  unit_3: 'Unit III',
  unit_4: 'Unit IV',
  unit_5: 'Unit V',
};

function scoreCell(score: number | null): { bg: string; text: string; label: string; bar: string } {
  if (score === null) return { label: '—',         bg: 'bg-gray-100',    text: 'text-gray-400',    bar: 'bg-gray-200' };
  if (score >= 75)    return { label: `${score}%`, bg: 'bg-emerald-50',  text: 'text-emerald-700', bar: 'bg-emerald-500' };
  if (score >= 50)    return { label: `${score}%`, bg: 'bg-amber-50',    text: 'text-amber-700',   bar: 'bg-amber-400' };
  return               { label: `${score}%`, bg: 'bg-red-50',      text: 'text-red-700',     bar: 'bg-red-500' };
}

export default function TeacherHeatmap() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [teacherSubjects, setTeacherSubjects] = useState<string[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [unitCols, setUnitCols] = useState<string[]>([]);
  // unitScores[studentId][unitId] = pct | null
  const [unitScores, setUnitScores] = useState<Record<string, Record<string, number | null>>>({});
  const [overallScores, setOverallScores] = useState<Record<string, number | null>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) router.push('/login');
  }, [profile, loading, router]);

  // Derive subject list from teacher's own assignments
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
          body: JSON.stringify({
            schoolId: profile.schoolId,
            subjectFilter: selectedSubject,
          }),
        });
        if (!res.ok) throw new Error('Failed to fetch heatmap data');
        const { students: classStudents, assignments: assignmentsData, submissions } = await res.json();

        setStudents(classStudents);

        if (!classStudents.length || !assignmentsData.length) {
          setUnitCols([]);
          setUnitScores({});
          setOverallScores({});
          return;
        }

        // ── Determine which unit IDs appear in this teacher's assignments ──
        const unitSet = new Set<string>();
        (assignmentsData as any[]).forEach(a => {
          if (Array.isArray(a.units)) {
            a.units.forEach((u: string) => unitSet.add(u));
          }
        });

        // Sort units in canonical order (unit_1 first, then unit_2 …)
        const unitColsSorted = UNIT_ORDER.filter(u => unitSet.has(u));
        // If no unit tags at all — show a single "General" column
        if (unitColsSorted.length === 0) unitColsSorted.push('general');
        setUnitCols(unitColsSorted);

        // ── Build lookup: submissionsByStudent[studentId] = [sub, …] ─────
        const subByStudent: Record<string, any[]> = {};
        (submissions as any[]).forEach(sub => {
          if (!subByStudent[sub.student_id]) subByStudent[sub.student_id] = [];
          subByStudent[sub.student_id].push(sub);
        });

        // ── For each student, compute score per unit ───────────────────────
        const newUnitScores: Record<string, Record<string, number | null>> = {};
        const newOverall: Record<string, number | null> = {};

        classStudents.forEach((s: any) => {
          newUnitScores[s.id] = {};
          unitColsSorted.forEach(u => { newUnitScores[s.id][u] = null; });

          const studentSubs = subByStudent[s.id] || [];
          const allPcts: number[] = [];

          unitColsSorted.forEach(unitId => {
            // Find assignments tagged with this unit (for this subject)
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

            // Filter submissions for those assignments
            const unitSubs = studentSubs.filter(
              sub => matchingAssignIds.has(sub.assignment_id) &&
                sub.score !== null && sub.max_score
            );

            if (unitSubs.length === 0) return;

            // Average score across all submissions for this unit
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

  // ── Render ─────────────────────────────────────────────────────────────────
  const knownCount   = students.filter(s => (overallScores[s.id] ?? 0) >= 75).length;
  const atRiskCount  = students.filter(s => overallScores[s.id] !== null && (overallScores[s.id] ?? 0) < 50).length;
  const pendingCount = students.filter(s => overallScores[s.id] === null).length;

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href="/teacher" className="p-2 rounded-xl hover:bg-gray-200 text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-bold text-gray-900 text-2xl">Class Performance Heatmap</h1>
            <p className="text-sm text-gray-500">
              Scores mapped to actual units tagged on each assignment
            </p>
          </div>
        </div>

        {teacherSubjects.length > 0 && (
          <select
            value={selectedSubject}
            onChange={e => setSelectedSubject(e.target.value)}
            className="bg-[#002147] text-white font-bold px-4 py-2 rounded-xl text-sm"
          >
            {teacherSubjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {/* Summary badges */}
      {!isLoading && students.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
            <div className="text-2xl font-black text-emerald-700">{knownCount}</div>
            <div className="text-xs font-bold text-emerald-600 mt-1">Proficient (≥75%)</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
            <div className="text-2xl font-black text-amber-700">{students.length - knownCount - atRiskCount - pendingCount}</div>
            <div className="text-xs font-bold text-amber-600 mt-1">Developing (50–74%)</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
            <div className="text-2xl font-black text-red-700">{atRiskCount}</div>
            <div className="text-xs font-bold text-red-600 mt-1">At Risk (&lt;50%)</div>
          </div>
        </div>
      )}

      {/* Legend */}
      {!isLoading && unitCols.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap text-xs font-semibold">
          <span className="text-gray-400 uppercase tracking-wider">Legend:</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />≥75% Mastered</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />50–74% Developing</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />&lt;50% At Risk</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />No submissions yet</span>
        </div>
      )}

      {/* Heatmap table */}
      <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Computing heatmap from real submission data…</span>
          </div>
        ) : students.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No students found for this subject.</div>
        ) : unitCols.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p className="font-semibold">No unit tags found on any assignments for {selectedSubject}.</p>
            <p className="text-sm mt-2">When posting an assignment, select which Units (Unit I, II…) it covers. Those become the heatmap columns.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-100">
                <th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider min-w-[140px]">
                  Student
                </th>
                {unitCols.map(u => (
                  <th key={u} className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider text-center min-w-[100px]">
                    {UNIT_LABEL[u] || u.replace('_', ' ')}
                  </th>
                ))}
                <th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider text-center min-w-[90px]">
                  Overall
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.map(s => {
                const overallClr = scoreCell(overallScores[s.id] ?? null);
                return (
                  <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-[#002147] text-sm">{s.name || 'Student'}</div>
                      <div className="text-xs font-mono text-gray-400">
                        {s.custom_student_id || s.id.slice(0, 6)}
                      </div>
                      {/* Mini overall bar */}
                      <div className="w-20 bg-gray-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full ${overallClr.bar}`}
                          style={{ width: `${overallScores[s.id] ?? 0}%` }}
                        />
                      </div>
                    </td>
                    {unitCols.map(u => {
                      const score = unitScores[s.id]?.[u] ?? null;
                      const clr = scoreCell(score);
                      return (
                        <td key={u} className="p-3 text-center">
                          <div className={`px-3 py-2 rounded-xl text-xs font-black ${clr.bg} ${clr.text} mx-auto w-fit min-w-[52px]`}>
                            {clr.label}
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-3 text-center">
                      <div className={`px-3 py-2 rounded-xl text-xs font-black ${overallClr.bg} ${overallClr.text} mx-auto w-fit min-w-[52px]`}>
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

      {/* Explanation footer */}
      <p className="text-xs text-gray-400 text-center pb-4">
        Each column = a unit you tagged when posting an assignment. Scores are computed directly from graded submissions — no keyword guessing.
      </p>
    </div>
  );
}
