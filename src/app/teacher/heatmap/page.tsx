'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, ChevronDown, RefreshCw, Info } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────────
// OU B.Com General Syllabus — Topic definitions with keyword matching
// ─────────────────────────────────────────────────────────────────────────────
interface OUTopic {
  id: string;
  unit: string;
  label: string;
  short: string;
  keywords: string[];
}

const OU_SYLLABUS: Record<string, OUTopic[]> = {
  'corporate accounting': [
    { id: 'depreciation',    unit: 'Unit I',   label: 'Depreciation & Provisions',     short: 'Depreciation',    keywords: ['depreciation','slm','wdv','straight line','written down','provision','doubtful debt'] },
    { id: 'single-entry',    unit: 'Unit II',  label: 'Single Entry / Incomplete Rec.', short: 'Single Entry',    keywords: ['single entry','incomplete record','statement of affairs','conversion method'] },
    { id: 'share-capital',   unit: 'Unit III', label: 'Share Capital & Debentures',     short: 'Share Capital',   keywords: ['issue of share','allotment','forfeiture','reissue','debenture','redemption of pref','preference share','equity share','share capital','calls in arrear'] },
    { id: 'goodwill-shares', unit: 'Unit IV',  label: 'Goodwill & Share Valuation',     short: 'Valuation',       keywords: ['goodwill','share valuation','valuation of share','intrinsic value','yield value','super profit','fair value'] },
    { id: 'final-accounts',  unit: 'Unit V',   label: 'Company Final Accounts',         short: 'Final Accounts',  keywords: ['final account','profit and loss','balance sheet','appropriation','dividend','reserve','trading account','company account','annual report'] },
    { id: 'amalgamation',    unit: 'Unit VI',  label: 'Amalgamation & Reconstruction',  short: 'Amalgamation',    keywords: ['amalgamation','absorption','reconstruction','holding company','subsidiary','merger','liquidation'] },
    { id: 'accounting-fund', unit: 'General',  label: 'Accounting Fundamentals',        short: 'Fundamentals',    keywords: ['fundamental','basic','accounting concept','principle','convention','journal','ledger','trial balance','accrual','going concern'] },
  ],
  'business mathematics and statistics 1': [
    { id: 'matrices',        unit: 'Unit I',   label: 'Matrices & Determinants',        short: 'Matrices',        keywords: ['matrix','matrices','determinant','cramer','adjoint','inverse matrix','singular'] },
    { id: 'sets',            unit: 'Unit II',  label: 'Sets, Relations & Functions',    short: 'Sets',            keywords: ['set','relation','subset','union','intersection','complement','venn diagram','function','domain','range'] },
    { id: 'differentiation', unit: 'Unit III', label: 'Differentiation & Applications', short: 'Differentiation', keywords: ['differentiation','derivative','calculus','rate of change','marginal cost','maxima','minima','chain rule','product rule'] },
    { id: 'integration',     unit: 'Unit IV',  label: 'Integration',                    short: 'Integration',     keywords: ['integration','integral','antiderivative','definite integral','indefinite integral','area under curve'] },
    { id: 'central-tendency',unit: 'Unit V',   label: 'Measures of Central Tendency',   short: 'Central Tend.',   keywords: ['mean','median','mode','average','central tendency','arithmetic mean','geometric mean','harmonic mean','weighted mean'] },
    { id: 'dispersion',      unit: 'Unit VI',  label: 'Measures of Dispersion',          short: 'Dispersion',      keywords: ['dispersion','range','quartile deviation','mean deviation','standard deviation','variance','coefficient of variation'] },
    { id: 'correlation',     unit: 'Unit VII', label: 'Correlation & Regression',        short: 'Correlation',     keywords: ['correlation','regression','karl pearson','rank correlation','spearman','scatter diagram','regression line','regression equation'] },
    { id: 'index-numbers',   unit: 'Unit VIII',label: 'Index Numbers & Time Series',     short: 'Index Numbers',   keywords: ['index number','laspeyres','paasche','fisher','price index','quantity index','time series','trend','seasonal','cyclical'] },
  ],
  'business economics': [
    { id: 'demand-supply',   unit: 'Unit I',   label: 'Demand & Supply Analysis',       short: 'Demand/Supply',   keywords: ['demand','supply','law of demand','law of supply','equilibrium','elasticity','price elasticity','income elasticity'] },
    { id: 'production',      unit: 'Unit II',  label: 'Theory of Production & Cost',    short: 'Production',      keywords: ['production','cost','total cost','marginal cost','average cost','returns to scale','isoquant','factor of production','variable cost','fixed cost'] },
    { id: 'market',          unit: 'Unit III', label: 'Market Structures',               short: 'Markets',         keywords: ['market structure','perfect competition','monopoly','oligopoly','monopolistic','price discrimination','kinked demand'] },
    { id: 'national-income', unit: 'Unit IV',  label: 'National Income & Money',         short: 'Macro Economics', keywords: ['national income','gdp','gnp','money','banking','inflation','deflation','monetary policy','fiscal policy','multiplier','balance of payment'] },
  ],
  'financial accounting': [
    { id: 'basic-accounting',unit: 'Unit I',   label: 'Basic Accounting Concepts',      short: 'Basic Accounting',keywords: ['journal','ledger','trial balance','double entry','accounting equation','debit','credit','basic','fundamental'] },
    { id: 'final-accounts-fa',unit:'Unit II',  label: 'Final Accounts (Sole Trader)',   short: 'Final Accounts',  keywords: ['trading account','profit loss','balance sheet','sole trader','proprietor','final account','capital account','drawings'] },
    { id: 'depreciation-fa', unit: 'Unit III', label: 'Depreciation Methods',           short: 'Depreciation',    keywords: ['depreciation','straight line','written down','slm','wdv','provision','depletion'] },
    { id: 'bills',           unit: 'Unit IV',  label: 'Bills of Exchange & Promissory', short: 'Bills',           keywords: ['bill of exchange','promissory note','accommodation bill','dishonour','endorsement','drawer','drawee','payee','acceptor'] },
    { id: 'partnership',     unit: 'Unit V',   label: 'Partnership Accounts',           short: 'Partnership',     keywords: ['partnership','partner','profit sharing','admission','retirement','death','dissolution','garner','goodwill','revaluation'] },
  ],
};

// Fallback syllabus for any unrecognised subject
function getTopicsForSubject(subject: string): OUTopic[] {
  const key = subject.toLowerCase();
  // Exact match
  if (OU_SYLLABUS[key]) return OU_SYLLABUS[key];
  // Substring match
  for (const [k, v] of Object.entries(OU_SYLLABUS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  // Default fallback — generic topics
  return [
    { id: 'unit1', unit: 'Unit I',   label: 'Unit I',   short: 'Unit I',   keywords: [] },
    { id: 'unit2', unit: 'Unit II',  label: 'Unit II',  short: 'Unit II',  keywords: [] },
    { id: 'unit3', unit: 'Unit III', label: 'Unit III', short: 'Unit III', keywords: [] },
    { id: 'unit4', unit: 'Unit IV',  label: 'Unit IV',  short: 'Unit IV',  keywords: [] },
    { id: 'unit5', unit: 'Unit V',   label: 'Unit V',   short: 'Unit V',   keywords: [] },
  ];
}

// Map an assignment to the best-matching OU topic
function mapAssignmentToTopic(assign: any, topics: OUTopic[]): string {
  const text = [
    assign.title || '',
    (assign.tasks || []).map((t: any) => [t.question, t.description, t.title, t.topic].filter(Boolean).join(' ')).join(' '),
    assign.instructions || '',
    (assign.objectives || []).join(' '),
    assign.subject || '',
    assign.topic || '',
  ].join(' ').toLowerCase();

  let bestTopic = topics[topics.length - 1]?.id || 'general'; // default = last (usually "General")
  let bestScore = 0;

  for (const topic of topics) {
    if (!topic.keywords.length) continue;
    const hits = topic.keywords.filter(kw => text.includes(kw)).length;
    if (hits > bestScore) { bestScore = hits; bestTopic = topic.id; }
  }
  return bestTopic;
}

// Fuzzy class name normalizer
function normCls(s: string | undefined): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function classMatches(a: string | undefined, b: string | undefined): boolean {
  const na = normCls(a); const nb = normCls(b);
  if (!na || !nb) return true;
  return na === nb || na.includes(nb) || nb.includes(na);
}
// Fuzzy subject match
function subjectMatches(assignSub: string | undefined, teacherSub: string): boolean {
  if (!assignSub) return true; // no subject → include always
  const a = assignSub.toLowerCase(); const b = teacherSub.toLowerCase();
  return a === b || b.includes(a) || a.includes(b);
}

// Score → label + CSS classes
function scoreLevel(score: number | null): { label: string; bg: string; text: string; bar: string } {
  if (score === null)  return { label: '—',        bg: 'bg-gray-100',            text: 'text-gray-400',   bar: 'bg-gray-200' };
  if (score >= 75)     return { label: `${score}%`, bg: 'bg-emerald-50',          text: 'text-emerald-700',bar: 'bg-emerald-500' };
  if (score >= 50)     return { label: `${score}%`, bg: 'bg-amber-50',            text: 'text-amber-700',  bar: 'bg-amber-400' };
  return               { label: `${score}%`, bg: 'bg-red-50',              text: 'text-red-700',    bar: 'bg-red-500' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function TeacherHeatmap() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [selectedClass,    setSelectedClass]    = useState<string>('');
  const [selectedSubject,  setSelectedSubject]  = useState<string>('');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [teacherSubjects,  setTeacherSubjects]  = useState<string[]>([]);
  const [students,         setStudents]         = useState<any[]>([]);
  const [topicCols,        setTopicCols]        = useState<OUTopic[]>([]);
  // topicScores[studentId][topicId] = score | null
  const [topicScores,      setTopicScores]      = useState<Record<string, Record<string, number | null>>>({});
  const [overallScores,    setOverallScores]    = useState<Record<string, number | null>>({});
  const [isLoading,        setIsLoading]        = useState(false);
  const [showTooltip,      setShowTooltip]      = useState<string | null>(null);

  // ── Guard ──
  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) router.push('/login');
  }, [profile, loading, router]);

  // ── Derive teacher subjects + classes from profile ──
  useEffect(() => {
    if (!profile?.assignments) return;
    const subs: string[] = [...new Set((profile.assignments as any[]).map((a: any) => a.subject).filter(Boolean))];
    const clss: string[] = [...new Set((profile.assignments as any[]).map((a: any) => a.class).filter(Boolean))];
    setTeacherSubjects(subs);
    if (!selectedSubject && subs.length > 0) setSelectedSubject(subs[0]);
    if (!selectedClass   && clss.length > 0) setSelectedClass(clss[0]);
  }, [profile?.assignments]);

  // ── Fetch data whenever class or subject changes ──
  useEffect(() => {
    if (!profile?.schoolId || !selectedSubject) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const idToken = await getAuth().currentUser?.getIdToken();
        const headers = {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        };
        const schoolId = profile.schoolId;

        // 1. Fetch all students
        const studRes = await fetch('/api/teacher/get-students', {
          method: 'POST', headers,
          body: JSON.stringify({ schoolId }),
        });
        const studJson = await studRes.json();
        const allStudents: any[] = studJson.students || [];

        // 2. Determine which students to show
        // Stage A: If the admin has explicitly assigned students to this teacher via the Edit button,
        //          use ONLY those students for the selected subject.
        // Stage B: If no assignments have been configured yet, fall back to class-based filter
        //          (same behaviour as before — shows all students in the teacher's class).
        const teacherHasAssignedStudents = ((profile as any).assignments || []).some(
          (a: any) => Array.isArray(a.assignedStudents) && a.assignedStudents.length > 0
        );

        let classStudents: any[];
        if (teacherHasAssignedStudents) {
          // Strict filter: only students explicitly assigned for the selected subject
          const assignedIds = new Set<string>(
            ((profile as any).assignments || [])
              .filter((a: any) => subjectMatches(a.subject, selectedSubject))
              .flatMap((a: any) => a.assignedStudents || [])
          );
          classStudents = allStudents.filter((s: any) => assignedIds.has(s.id));
        } else {
          // Fallback: show students that match the teacher's class/branch
          // Check studentClass (school) and branch (college) fields
          const normS = (v: any) => (v || '').toLowerCase().replace(/[\s.]/g, '');
          const teacherClasses = new Set<string>(
            ((profile as any).assignments || []).map((a: any) => normS(a.class)).filter(Boolean)
          );
          classStudents = allStudents.filter((s: any) => {
            if (selectedClass) {
              return classMatches(s.studentClass || s.branch || s.class, selectedClass);
            }
            if (teacherClasses.size > 0) {
              const sClass = normS(s.studentClass || s.branch || s.class || '');
              return !sClass || teacherClasses.has(sClass) ||
                [...teacherClasses].some(c => c.includes(sClass) || sClass.includes(c));
            }
            return true; // no class info → show all
          });
        }

        setStudents(classStudents);

        if (classStudents.length === 0) { setTopicCols([]); setTopicScores({}); setOverallScores({}); return; }

        // Update available classes
        const clsSet = [...new Set(allStudents.map(s => s.studentClass || s.branch || s.class).filter(Boolean))] as string[];
        setAvailableClasses(clsSet);

        // 3. Fetch all school assignments (no teacherId filter — catches all variants)
        const assignRes = await fetch('/api/teacher/get-assignments', {
          method: 'POST', headers,
          body: JSON.stringify({ schoolId }),
        });
        const assignJson = await assignRes.json();
        const allAssignments: any[] = assignJson.assignments || [];

        // 4. Filter to selected subject + class
        const relevant = allAssignments.filter(a =>
          classMatches(a.class || a.targetClass, selectedClass) &&
          subjectMatches(a.subject, selectedSubject)
        );

        // 5. Get OU topics for the selected subject
        const topics = getTopicsForSubject(selectedSubject);
        setTopicCols(topics);

        // 6. Build: topicId → assignments
        const byTopic: Record<string, any[]> = {};
        topics.forEach(t => { byTopic[t.id] = []; });
        relevant.forEach(a => {
          const tid = mapAssignmentToTopic(a, topics);
          if (!byTopic[tid]) byTopic[tid] = [];
          byTopic[tid].push(a);
        });

        // 7. Compute per-student, per-topic scores (most recent submission)
        const newTopicScores: Record<string, Record<string, number | null>> = {};
        const newOverall: Record<string, number | null> = {};

        classStudents.forEach(s => {
          newTopicScores[s.id] = {};
          topics.forEach(t => { newTopicScores[s.id][t.id] = null; });
        });

        for (const topic of topics) {
          const assigns = byTopic[topic.id] || [];

          // Track most-recent submission per student for this topic
          const latestDate:  Record<string, number>         = {};
          const latestScore: Record<string, number | null>  = {};
          classStudents.forEach(s => { latestDate[s.id] = 0; latestScore[s.id] = null; });

          for (const assign of assigns) {
            const subData = assign.submittedData || {};

            // Build 3-way lookup (doc-key, customStudentId, studentId field)
            const byKey:      Record<string, any> = {};
            const byCustomId: Record<string, any> = {};
            const byStdId:    Record<string, any> = {};
            Object.entries(subData).forEach(([key, sub]: [string, any]) => {
              byKey[key] = sub;
              if (sub?.customStudentId) byCustomId[sub.customStudentId] = sub;
              if (sub?.studentId && sub.studentId !== key) byStdId[sub.studentId] = sub;
            });

            classStudents.forEach(s => {
              const sub = byKey[s.id] ||
                          (s.customStudentId ? byCustomId[s.customStudentId] : null) ||
                          byStdId[s.id] || null;
              if (!sub) return;

              // Resolve timestamp
              const ts =
                sub.submittedAt?.seconds ? sub.submittedAt.seconds * 1000
                : sub.submittedAt?.toDate ? sub.submittedAt.toDate().getTime()
                : assign.createdAt ? (typeof assign.createdAt === 'number' ? assign.createdAt : assign.createdAt?.seconds * 1000 || 0)
                : 0;

              if (ts >= latestDate[s.id]) {
                latestDate[s.id] = ts;
                const rawScore = sub.score ?? sub.aiResult?.totalScore;
                const maxScore = sub.maxScore ?? sub.aiResult?.maxTotalScore ?? 10;
                latestScore[s.id] = rawScore != null ? Math.round((rawScore / maxScore) * 100) : 0;
              }
            });
          }

          classStudents.forEach(s => {
            newTopicScores[s.id][topic.id] = latestScore[s.id];
          });
        }

        // 8. Compute overall per student = average of all topics that have data
        classStudents.forEach(s => {
          const vals = topics.map(t => newTopicScores[s.id][t.id]).filter(v => v !== null) as number[];
          newOverall[s.id] = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
        });

        setTopicScores(newTopicScores);
        setOverallScores(newOverall);
      } catch (err: any) {
        console.error('[heatmap]', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [profile?.schoolId, selectedClass, selectedSubject]);

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const avatarBg = (name: string) => {
    const colors = ['bg-indigo-500','bg-violet-500','bg-sky-500','bg-emerald-500','bg-rose-500','bg-amber-500','bg-teal-500','bg-pink-500'];
    return colors[name.charCodeAt(0) % colors.length];
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-full px-4 py-3 flex items-center gap-3">
          <Link href="/teacher" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-base leading-tight">Class Heatmap</h1>
              <p className="text-xs text-gray-500">OU B.Com Topic-wise Mastery</p>
            </div>
          </div>
          {isLoading && <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />}
        </div>

        {/* Filters */}
        <div className="px-4 pb-3 flex gap-2 flex-wrap">
          {/* Subject */}
          <div className="relative">
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="appearance-none bg-indigo-600 text-white text-sm font-semibold pl-3 pr-8 py-2 rounded-xl cursor-pointer"
            >
              {teacherSubjects.length === 0 && <option value="">No subjects</option>}
              {teacherSubjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-white pointer-events-none" />
          </div>

          {/* Class */}
          <div className="relative">
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="appearance-none bg-white border border-gray-200 text-gray-700 text-sm font-medium pl-3 pr-8 py-2 rounded-xl cursor-pointer"
            >
              <option value="">All Classes</option>
              {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 ml-auto text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />≥75% Excellent</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />50–74% Average</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />&lt;50% At Risk</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-200 inline-block" />No Data</span>
          </div>
        </div>
      </div>

      {/* ── Subject + Unit label ── */}
      {selectedSubject && (
        <div className="px-4 pt-4 pb-1">
          <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">
            {selectedSubject} — Osmania University B.Com Syllabus
          </p>
        </div>
      )}

      {/* ── Loading State ── */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading topic-wise mastery…</p>
        </div>
      )}

      {/* ── Empty State ── */}
      {!isLoading && students.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <BookOpen className="w-12 h-12 opacity-30" />
          <p className="text-base font-medium">No students found for this class</p>
        </div>
      )}

      {/* ── Main Grid ── */}
      {!isLoading && students.length > 0 && topicCols.length > 0 && (
        <div className="px-2 pb-8 pt-2 overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: `${Math.max(700, topicCols.length * 110 + 220)}px` }}>
            <thead>
              <tr>
                {/* Student header */}
                <th className="sticky left-0 z-20 bg-white border-b-2 border-gray-200 text-left px-4 py-3 w-44">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Student</span>
                </th>
                {/* Topic headers */}
                {topicCols.map(topic => (
                  <th
                    key={topic.id}
                    className="border-b-2 border-gray-200 px-2 py-3 text-center min-w-[100px] max-w-[130px] cursor-help"
                    onMouseEnter={() => setShowTooltip(topic.id)}
                    onMouseLeave={() => setShowTooltip(null)}
                  >
                    <div className="relative">
                      <p className="text-xs font-bold text-gray-700 leading-tight">{topic.short}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{topic.unit}</p>
                      {showTooltip === topic.id && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap z-50 shadow-xl">
                          {topic.label}
                        </div>
                      )}
                    </div>
                  </th>
                ))}
                {/* Overall header */}
                <th className="border-b-2 border-gray-200 px-3 py-3 text-center min-w-[90px] bg-indigo-50">
                  <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Overall</p>
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, idx) => {
                const overall = overallScores[student.id];
                const ovLevel = scoreLevel(overall);
                return (
                  <tr key={student.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                    {/* Student cell */}
                    <td className="sticky left-0 z-10 px-4 py-3 border-b border-gray-100"
                        style={{ background: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarBg(student.name || 'S')}`}>
                          {initials(student.name || 'S')}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{student.name}</p>
                          <p className="text-xs text-gray-400 truncate">{student.studentClass || student.branch || student.class || '—'}</p>
                        </div>
                      </div>
                    </td>

                    {/* Topic cells */}
                    {topicCols.map(topic => {
                      const score = topicScores[student.id]?.[topic.id] ?? null;
                      const lv = scoreLevel(score);
                      return (
                        <td key={topic.id} className={`px-2 py-3 text-center border-b border-gray-100 ${lv.bg}`}>
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-sm font-bold ${lv.text}`}>{lv.label}</span>
                            {score !== null && (
                              <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${lv.bar} transition-all duration-500`}
                                  style={{ width: `${score}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Overall cell */}
                    <td className={`px-3 py-3 text-center border-b border-gray-100 bg-indigo-50/60`}>
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-base font-bold ${ovLevel.text}`}>{ovLevel.label}</span>
                        {overall !== null && (
                          <div className="w-14 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${ovLevel.bar} transition-all duration-500`}
                              style={{ width: `${overall}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ── Topic Legend Cards ── */}
          <div className="mt-6 px-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              OU {selectedSubject} — Unit breakdown
            </p>
            <div className="flex flex-wrap gap-2">
              {topicCols.map(topic => (
                <div key={topic.id} className="bg-white border border-gray-100 rounded-xl px-3 py-2 flex items-center gap-2 shadow-sm">
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{topic.unit}</span>
                  <span className="text-xs text-gray-700 font-medium">{topic.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Submission count info ── */}
          <div className="mt-4 px-2 flex items-start gap-2 text-xs text-gray-400">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              Each cell shows the score from the student&apos;s most recent submission for that OU topic.
              Topics are automatically matched from assignment titles and tasks.
              Scores &lt;50% = At Risk, 50–74% = Average, ≥75% = Excellent.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
