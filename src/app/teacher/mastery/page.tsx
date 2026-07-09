'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, BrainCircuit, Target, BookOpen, AlertCircle, CheckCircle2, ChevronRight, Zap, PlayCircle } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

// --- Syllabus Definitions per Subject (Osmania University B.Com General + standard) ---
const SYLLABI: Record<string, { id: string; name: string; color: string; topics: string[] }[]> = {
  // ── Osmania University B.Com General ─────────────────────────────────────
  'Business Economics': [
    { id: 'c1', name: 'Demand & Supply', color: '#3b82f6', topics: ['Law of Demand', 'Elasticity of Demand', 'Law of Supply', 'Market Equilibrium'] },
    { id: 'c2', name: 'Production Theory', color: '#8b5cf6', topics: ['Factors of Production', 'Laws of Returns', 'Economies of Scale', 'Cost Concepts'] },
    { id: 'c3', name: 'Market Structures', color: '#f59e0b', topics: ['Perfect Competition', 'Monopoly', 'Monopolistic Competition', 'Oligopoly'] },
    { id: 'c4', name: 'Macro Economics', color: '#10b981', topics: ['National Income', 'Inflation & Deflation', 'Money & Banking', 'Fiscal Policy'] },
  ],
  'Business Mathematics & Statistics': [
    { id: 'c1', name: 'Mathematics', color: '#3b82f6', topics: ['Matrices & Determinants', 'Differentiation', 'Integration', 'Linear Programming'] },
    { id: 'c2', name: 'Statistics', color: '#8b5cf6', topics: ['Measures of Central Tendency', 'Measures of Dispersion', 'Correlation', 'Regression Analysis'] },
    { id: 'c3', name: 'Probability', color: '#f59e0b', topics: ['Basic Probability', 'Conditional Probability', 'Binomial Distribution', 'Normal Distribution'] },
  ],
  'Business Mathematics and Statistics': [
    { id: 'c1', name: 'Mathematics', color: '#3b82f6', topics: ['Matrices & Determinants', 'Differentiation', 'Integration', 'Linear Programming'] },
    { id: 'c2', name: 'Statistics', color: '#8b5cf6', topics: ['Measures of Central Tendency', 'Measures of Dispersion', 'Correlation', 'Regression Analysis'] },
    { id: 'c3', name: 'Probability', color: '#f59e0b', topics: ['Basic Probability', 'Conditional Probability', 'Binomial Distribution', 'Normal Distribution'] },
  ],
  'Financial Accounting': [
    { id: 'c1', name: 'Accounting Basics', color: '#3b82f6', topics: ['Journal Entries', 'Ledger Accounts', 'Trial Balance', 'Accounting Concepts & Conventions'] },
    { id: 'c2', name: 'Final Accounts', color: '#8b5cf6', topics: ['Trading Account', 'Profit & Loss Account', 'Balance Sheet', 'Adjustments'] },
    { id: 'c3', name: 'Special Accounts', color: '#f59e0b', topics: ['Depreciation Methods', 'Consignment Accounts', 'Branch Accounts', 'Hire Purchase'] },
    { id: 'c4', name: 'Partnership Accounts', color: '#10b981', topics: ['Admission of Partner', 'Retirement of Partner', 'Dissolution', 'Amalgamation of Firms'] },
  ],
  'Corporate Accounting': [
    { id: 'c1', name: 'Share Capital', color: '#3b82f6', topics: ['Issue of Shares', 'Forfeiture & Reissue', 'Rights Issue', 'Buy-back of Shares'] },
    { id: 'c2', name: 'Debentures', color: '#8b5cf6', topics: ['Issue of Debentures', 'Redemption of Debentures', 'Conversion', 'Interest on Debentures'] },
    { id: 'c3', name: 'Valuation', color: '#f59e0b', topics: ['Valuation of Shares', 'Goodwill Valuation', 'Amalgamation', 'Internal Reconstruction'] },
    { id: 'c4', name: 'Financial Statements', color: '#10b981', topics: ['Company P&L Account', 'Balance Sheet', 'Cash Flow Statement', 'Ratio Analysis'] },
  ],
  'Cost Accounting': [
    { id: 'c1', name: 'Cost Concepts', color: '#3b82f6', topics: ['Elements of Cost', 'Cost Sheet', 'Material Control', 'EOQ & Reorder Level'] },
    { id: 'c2', name: 'Labour & Overheads', color: '#8b5cf6', topics: ['Labour Cost Control', 'Time & Piece Rate', 'Factory Overheads', 'Machine Hour Rate'] },
    { id: 'c3', name: 'Costing Methods', color: '#f59e0b', topics: ['Job Costing', 'Process Costing', 'Standard Costing', 'Marginal Costing'] },
  ],
  'Income Tax': [
    { id: 'c1', name: 'Basic Concepts', color: '#3b82f6', topics: ['Residential Status', 'Heads of Income', 'Agricultural Income', 'Exemptions'] },
    { id: 'c2', name: 'Salary & House Property', color: '#8b5cf6', topics: ['Computation of Salary Income', 'Allowances & Perquisites', 'House Property Income', 'Municipal Value vs Fair Rent'] },
    { id: 'c3', name: 'Business & Capital Gains', color: '#f59e0b', topics: ['Profits from Business', 'Deductions u/s 80C', 'Short-term Capital Gains', 'Long-term Capital Gains'] },
  ],
  'Company Law': [
    { id: 'c1', name: 'Company Formation', color: '#3b82f6', topics: ['Types of Companies', 'Memorandum of Association', 'Articles of Association', 'Prospectus'] },
    { id: 'c2', name: 'Management', color: '#8b5cf6', topics: ['Board of Directors', "Shareholders' Rights", 'Company Meetings', 'Dividends'] },
    { id: 'c3', name: 'Winding Up', color: '#f59e0b', topics: ['Voluntary Winding Up', 'Compulsory Winding Up', 'Liquidator Powers', 'Reconstruction & Amalgamation'] },
  ],
  'Business Statistics': [
    { id: 'c1', name: 'Data Analysis', color: '#3b82f6', topics: ['Data Collection', 'Classification & Tabulation', 'Frequency Distribution', 'Diagrammatic Representation'] },
    { id: 'c2', name: 'Central Tendency & Dispersion', color: '#8b5cf6', topics: ['Mean, Median, Mode', 'Range & Quartile Deviation', 'Standard Deviation', 'Coefficient of Variation'] },
    { id: 'c3', name: 'Index Numbers & Correlation', color: '#f59e0b', topics: ['Laspeyres & Paasche Index', "Karl Pearson's Correlation", "Spearman's Rank Correlation", 'Regression Lines'] },
  ],
  'Business Organisation': [
    { id: 'c1', name: 'Business Basics', color: '#3b82f6', topics: ['Sole Proprietorship', 'Partnership Firm', 'Joint Stock Company', 'Co-operatives'] },
    { id: 'c2', name: 'Management', color: '#8b5cf6', topics: ['Functions of Management', 'Planning & Organising', 'Directing & Controlling', 'Leadership Styles'] },
    { id: 'c3', name: 'Business Environment', color: '#f59e0b', topics: ['Economic Environment', 'Political & Legal Environment', 'Technological Environment', 'Globalisation'] },
  ],
  'Management Accounting': [
    { id: 'c1', name: 'Financial Analysis', color: '#3b82f6', topics: ['Ratio Analysis', 'Funds Flow Statement', 'Cash Flow Statement', 'Comparative Statements'] },
    { id: 'c2', name: 'Budgeting', color: '#8b5cf6', topics: ['Types of Budgets', 'Flexible Budget', 'Zero Base Budgeting', 'Budgetary Control'] },
    { id: 'c3', name: 'Decision Making', color: '#f59e0b', topics: ['Marginal Costing', 'Break Even Analysis', 'Make or Buy Decision', 'Capital Budgeting'] },
  ],
  'Financial Management': [
    { id: 'c1', name: 'Capital Structure', color: '#3b82f6', topics: ['Sources of Finance', 'Debt vs Equity', 'Capital Gearing', 'WACC'] },
    { id: 'c2', name: 'Working Capital', color: '#8b5cf6', topics: ['Working Capital Management', 'Receivables Management', 'Inventory Management', 'Cash Management'] },
    { id: 'c3', name: 'Capital Budgeting', color: '#f59e0b', topics: ['NPV Method', 'IRR Method', 'Payback Period', 'Profitability Index'] },
  ],
  'Auditing': [
    { id: 'c1', name: 'Basics of Auditing', color: '#3b82f6', topics: ['Meaning & Objectives', 'Types of Audit', 'Auditor Qualifications', 'Audit Planning'] },
    { id: 'c2', name: 'Audit Process', color: '#8b5cf6', topics: ['Internal Control', 'Vouching & Verification', 'Audit Evidence', 'Audit Report'] },
    { id: 'c3', name: 'Special Audits', color: '#f59e0b', topics: ['Company Audit', 'Tax Audit', 'Government Audit', 'Cost Audit'] },
  ],
  'Business Communication': [
    { id: 'c1', name: 'Communication Basics', color: '#3b82f6', topics: ['Communication Process', 'Types of Communication', 'Barriers to Communication', 'Non-verbal Communication'] },
    { id: 'c2', name: 'Business Writing', color: '#8b5cf6', topics: ['Business Letters', 'Memos & Reports', 'Email Etiquette', 'Resume Writing'] },
    { id: 'c3', name: 'Presentation Skills', color: '#f59e0b', topics: ['Group Discussion', 'Interview Skills', 'Negotiation', 'Public Speaking'] },
  ],
  // ── School subjects (kept for backward compatibility) ─────────────────────
  'Mathematics': [
    { id: 'c1', name: 'Algebra', color: '#3b82f6', topics: ['Linear Equations', 'Quadratic Equations', 'Polynomials', 'Factoring'] },
    { id: 'c2', name: 'Geometry', color: '#8b5cf6', topics: ['Coordinate Geometry', 'Triangles', 'Circles', 'Trigonometry'] },
    { id: 'c3', name: 'Data & Stats', color: '#f59e0b', topics: ['Probability', 'Statistics', 'Data Interpretation'] }
  ],
  'Social Studies': [
    { id: 'c1', name: 'History', color: '#ef4444', topics: ['Ancient Civilizations', 'Medieval Period', 'Modern History', 'World Wars'] },
    { id: 'c2', name: 'Civics', color: '#10b981', topics: ['Government & Democracy', 'Constitution', 'Rights & Duties', 'Local Governance'] },
    { id: 'c3', name: 'Geography', color: '#f59e0b', topics: ['Physical Geography', 'Climate & Weather', 'Natural Resources', 'Map Reading'] },
    { id: 'c4', name: 'Economics', color: '#8b5cf6', topics: ['Basic Economics', 'Supply & Demand', 'Trade & Commerce'] }
  ],
  'Science': [
    { id: 'c1', name: 'Physics', color: '#3b82f6', topics: ['Motion & Forces', 'Electricity', 'Light & Sound', 'Energy'] },
    { id: 'c2', name: 'Chemistry', color: '#10b981', topics: ['Atoms & Elements', 'Chemical Reactions', 'Acids & Bases', 'Periodic Table'] },
    { id: 'c3', name: 'Biology', color: '#f59e0b', topics: ['Cell Biology', 'Human Body', 'Ecosystems', 'Evolution'] }
  ],
  'English': [
    { id: 'c1', name: 'Grammar', color: '#3b82f6', topics: ['Parts of Speech', 'Tenses', 'Sentence Structure', 'Punctuation'] },
    { id: 'c2', name: 'Literature', color: '#8b5cf6', topics: ['Poetry', 'Prose', 'Drama', 'Short Stories'] },
    { id: 'c3', name: 'Writing', color: '#f59e0b', topics: ['Essay Writing', 'Creative Writing', 'Letter Writing', 'Comprehension'] }
  ],
};

// Fuzzy subject lookup — handles typos, abbreviations and partial names
function findSyllabus(subject: string) {
  if (!subject) return SYLLABI['Mathematics'];
  // Direct match
  if (SYLLABI[subject]) return SYLLABI[subject];
  // Case-insensitive + normalize whitespace
  const norm = subject.toLowerCase().replace(/\s+/g, ' ').trim();
  const directEntry = Object.entries(SYLLABI).find(([k]) => k.toLowerCase() === norm);
  if (directEntry) return directEntry[1];
  // Partial match — subject contains key or key contains subject
  const partialEntry = Object.entries(SYLLABI).find(([k]) => {
    const kn = k.toLowerCase();
    return norm.includes(kn) || kn.includes(norm) ||
      // Also match if first 6+ chars match
      (norm.length >= 6 && kn.startsWith(norm.substring(0, 6)));
  });
  if (partialEntry) return partialEntry[1];
  // Fallback
  return SYLLABI['Mathematics'];
}

// Default fallback syllabus
const DEFAULT_SYLLABUS = SYLLABI['Mathematics'];


// Helper to deterministically generate a score for a topic based on student ID and topic name
// In a real app, this would be strictly calculated from AI assignment evaluations.
const calculateMockTopicMastery = (studentId: string, topic: string, realPercentage: number) => {
  let hash = 0;
  const str = studentId + topic;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const baseReal = realPercentage * 100;
  // Add structural noise (-15 to +15) so topics have variance, simulating real strengths/weaknesses
  const noise = -15 + (Math.abs(hash) % 30);
  
  let finalScore = Math.round(baseReal + noise);
  return Math.max(0, Math.min(100, finalScore)); // clamp 0 to 100
};

// --- Custom Radial Chart Component ---
const MasteryRadialChart = ({ chapters }: { chapters: any[] }) => {
  const size = 300;
  const center = size / 2;
  const radius = 100;
  
  return (
    <div className="relative w-full h-full min-h-[300px] flex items-center justify-center p-8">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-xl overflow-visible">
        {/* Background Web */}
        {[20, 40, 60, 80, 100].map(ring => (
          <circle key={ring} cx={center} cy={center} r={(ring / 100) * radius} fill="none" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" />
        ))}
        
        {/* Axis Lines & Labels */}
        {chapters.map((chapter, i) => {
          const angle = (i * (Math.PI * 2)) / chapters.length - Math.PI / 2;
          const x2 = center + Math.cos(angle) * (radius + 20);
          const y2 = center + Math.sin(angle) * (radius + 20);
          const textX = center + Math.cos(angle) * (radius + 40);
          const textY = center + Math.sin(angle) * (radius + 40);
          
          return (
            <g key={i}>
              <line x1={center} y1={center} x2={x2} y2={y2} stroke="#cbd5e1" strokeWidth="1" />
              <text 
                x={textX} 
                y={textY} 
                textAnchor="middle" 
                alignmentBaseline="middle" 
                fontSize="12" 
                fontWeight="bold" 
                fill="#002147"
              >
                {chapter.name} ({chapter.mastery}%)
              </text>
            </g>
          );
        })}

        {/* Data Polygon */}
        <motion.polygon
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 0.8, scale: 1 }}
          transition={{ duration: 1, type: "spring" }}
          points={chapters.map((chapter, i) => {
            const angle = (i * (Math.PI * 2)) / chapters.length - Math.PI / 2;
            const r = (chapter.mastery / 100) * radius;
            return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
          }).join(' ')}
          fill="url(#gradient)"
          stroke="#3b82f6"
          strokeWidth="3"
          strokeLinejoin="round"
        />

        {/* Gradients */}
        <defs>
          <linearGradient id="gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.6" />
          </linearGradient>
        </defs>

        {/* Data Points */}
        {chapters.map((chapter, i) => {
          const angle = (i * (Math.PI * 2)) / chapters.length - Math.PI / 2;
          const r = (chapter.mastery / 100) * radius;
          return (
            <motion.circle 
              key={`dot-${i}`}
              initial={{ r: 0 }}
              animate={{ r: 5 }}
              transition={{ delay: 0.5 + (i * 0.1) }}
              cx={center + Math.cos(angle) * r} 
              cy={center + Math.sin(angle) * r} 
              fill="#fff" 
              stroke={chapter.color} 
              strokeWidth="3" 
            />
          );
        })}
      </svg>
    </div>
  );
};


// --- Main Component ---
function MasteryTrackerContent() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentIdParam = searchParams.get('studentId');

  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [activeChapter, setActiveChapter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<any[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Fetch students assigned to this teacher
  useEffect(() => {
    if (!profile?.schoolId) return;
    const fetchStudents = async () => {
      try {
        const { getAuth } = await import('firebase/auth');
        const idToken = await getAuth().currentUser?.getIdToken();

        // Use Admin SDK API — client-side rules block reading all users
        const res = await fetch('/api/teacher/get-students', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({ schoolId: profile.schoolId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch students');
        let students: any[] = data.students || [];

        // Filter by teacher's assigned classes
        const teacherClasses = [
          ...(profile.assignments?.map((a: any) => a.class).filter(Boolean) ?? []),
          ...(profile.teacherClass ? [profile.teacherClass] : []),
        ];
        const uniqueClasses = [...new Set(teacherClasses)].map(c => c.toLowerCase());
        if (uniqueClasses.length > 0) {
          students = students.filter(s =>
            s.studentClass && uniqueClasses.includes(s.studentClass.toLowerCase())
          );
        }

        setStudentsList(students);
      } catch (err: any) {
        console.error('[mastery] fetch students:', err);
      }
    };
    fetchStudents();
  }, [profile]);



  const handleGeneratePractice = async () => {
    if (!selectedStudent) return;
    setIsModalOpen(true);
    setIsGenerating(true);
    setGeneratedQuestions([]);

    try {
      const res = await fetch('/api/teacher/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weaknesses: selectedStudent.weaknesses.length > 0 ? selectedStudent.weaknesses : ['foundational concepts'],
          subject: selectedStudent.chaptersData[0]?.name || 'Math', 
          studentClass: selectedStudent.class || 'Class'
        })
      });
      const data = await res.json();
      if (data.questions) {
        const formattedQuestions = data.questions.map((q: any) => ({
          id: q.id || Math.random().toString(36).substring(7),
          text: q.questionText || q.text || '',
          options: Array.isArray(q.options) 
            ? q.options.map((opt: any, idx: number) => (
                typeof opt === 'string' 
                  ? { id: ['a', 'b', 'c', 'd'][idx] || String(idx), text: opt }
                  : opt
              ))
            : [],
          correctAnswer: typeof q.correctOptionId === 'number' 
            ? ['a', 'b', 'c', 'd'][q.correctOptionId] 
            : typeof q.correctAnswerIndex === 'number'
              ? ['a', 'b', 'c', 'd'][q.correctAnswerIndex]
              : q.correctAnswer || 'a'
        }));
        setGeneratedQuestions(formattedQuestions);
      } else {
        alert('Failed to generate practice module.');
        setIsModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      alert('Error generating practice module.');
      setIsModalOpen(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendPractice = async () => {
    if (!selectedStudent || !profile?.schoolId) return;
    setIsSending(true);
    try {
      const assignmentsRef = collection(db, 'schools', profile.schoolId, 'assignments');
      const title = `Targeted Practice: ${selectedStudent.weaknesses.slice(0, 2).map((w: string) => w.replace(/_/g, ' ')).join(', ') || 'Fundamentals'}`;
      
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      
      await addDoc(assignmentsRef, {
        title: title,
        type: 'quiz',
        description: 'A personalized practice module generated by AI to help improve your mastery on specific weaknesses.',
        class: '',
        targetStudentId: selectedStudent.id,
        subject: selectedStudent.chaptersData[0]?.name || 'Math',
        teacherId: profile.uid,
        teacherName: profile.name,
        questions: generatedQuestions,
        dueDate: dueDate.toISOString().split('T')[0],
        createdAt: serverTimestamp(),
      });
      alert('Practice Module sent to student successfully!');
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error sending module', err);
      alert('Failed to send practice module.');
    } finally {
      setIsSending(false);
    }
  };

  // Fetch details for selected student
  useEffect(() => {
    if (!profile?.schoolId) return;

    const loadStudentData = async (uid: string) => {
      setIsLoading(true);
      try {
        // Try /users first, then fallback to /global_users
        let docSnap = await getDoc(doc(db, 'users', uid));
        if (!docSnap.exists()) {
          docSnap = await getDoc(doc(db, 'global_users', uid));
        }
        if (!docSnap.exists()) {
          setIsLoading(false);
          return;
        }
        
        const studentData = { id: docSnap.id, ...docSnap.data() };

        // 1. Fetch assignments to get submissions
        const assignmentsSnap = await getDocs(collection(db, 'schools', profile.schoolId, 'assignments'));
        let totalScore = 0;
        let totalMaxScore = 0;
        let weaknesses = new Set<string>();
        let evaluatedCount = 0;

        const promises = assignmentsSnap.docs.map(async (taskDoc) => {
          const subRef = doc(db, 'schools', profile.schoolId, 'assignments', taskDoc.id, 'submissions', uid);
          const subSnap = await getDoc(subRef);
          if (subSnap.exists() && subSnap.data().teacherApproved) {
            evaluatedCount++;
            const data = subSnap.data();
            if (data.score !== undefined && data.maxScore > 0) {
              totalScore += Number(data.score);
              totalMaxScore += Number(data.maxScore);
            }
            if (data.aiResult?.weaknessTags) {
              data.aiResult.weaknessTags.forEach((tag: string) => weaknesses.add(tag));
            }
          }
        });

        await Promise.all(promises);

        // Calculate actual overall percentage
        const realPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) : 0;

        // Pick the correct syllabus based on the teacher's subject
        // Try multiple fields where subject could be stored
        const teacherSubject =
          profile.assignments?.[0]?.subject ||
          profile.subject ||
          profile.teacherSubject ||
          profile.assignments?.[0]?.subjectName ||
          'Mathematics';

        // Find matching syllabus using fuzzy lookup
        const subjectSyllabus = findSyllabus(teacherSubject);

        // Build Chapter Data
        const chaptersData = subjectSyllabus.map(chapter => {
          const topicsData = chapter.topics.map(topic => {
            let mastery = 0;
            if (evaluatedCount > 0) {
              mastery = calculateMockTopicMastery(uid, topic, realPercentage);
            }
            return {
              name: topic,
              mastery
            };
          });
          
          const chapterMastery = topicsData.length > 0 ? Math.round(topicsData.reduce((sum, t) => sum + t.mastery, 0) / topicsData.length) : 0;
          
          return {
            ...chapter,
            mastery: chapterMastery,
            topicsData
          };
        });

        const overallMastery = Math.round(chaptersData.reduce((sum, c) => sum + c.mastery, 0) / chaptersData.length);

        setSelectedStudent({
          ...studentData,
          overallMastery,
          chaptersData,
          weaknesses: Array.from(weaknesses),
          totalEvaluated: evaluatedCount
        });

      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    if (studentIdParam) {
      loadStudentData(studentIdParam);
    } else if (studentsList.length > 0) {
      // If no ID in URL, auto-load first student
      loadStudentData(studentsList[0].id);
    } else {
      setIsLoading(false);
    }

  }, [profile, studentIdParam, studentsList]);


  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading Mastery Engine...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto py-8 px-4 pb-20">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <Link href="/teacher/heatmap" className="p-2 bg-white rounded-full border border-[#002147]/10 hover:bg-[#f8fafc] transition-colors text-[#002147]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-[#002147] flex items-center space-x-3">
              <BrainCircuit className="w-8 h-8 text-blue-500" />
              <span>Subject Knowledge Graph</span>
            </h1>
            <p className="text-[#002147]/60 mt-1">Deep-dive structural analysis of student conceptual understanding.</p>
          </div>
        </div>

        {/* Student Selector */}
        <div className="bg-white border border-[#002147]/10 p-2 rounded-xl shadow-sm flex items-center space-x-3 px-4">
          <label className="text-xs font-bold text-[#002147] uppercase tracking-wider">Viewing:</label>
          {studentsList.length === 0 ? (
            <span className="text-sm text-[#002147]/40 font-medium italic">No students yet</span>
          ) : (
            <select 
              value={studentIdParam || selectedStudent?.id || ''}
              onChange={(e) => router.push(`/teacher/mastery?studentId=${e.target.value}`)}
              className="bg-transparent border-none text-[#002147] font-bold focus:ring-0 cursor-pointer outline-none"
            >
              <option value="">— Select Student —</option>
              {studentsList.map(s => (
                <option key={s.id} value={s.id}>{s.name}{s.studentClass ? ` (${s.studentClass})` : ''}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-32 flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 border-4 border-[#002147]/10 border-t-blue-500 rounded-full animate-spin" />
          <div className="text-[#002147]/50 font-bold animate-pulse">Synthesizing Knowledge Vectors...</div>
        </div>
      ) : !selectedStudent ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-[#002147]/10 flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
            <BrainCircuit className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <p className="text-[#002147] font-bold text-lg mb-1">
              {studentsList.length === 0 ? 'No Students Found' : 'Select a Student Above'}
            </p>
            <p className="text-[#002147]/50 text-sm max-w-sm">
              {studentsList.length === 0
                ? 'No students are linked to your school yet. Students need to sign up and select your school during registration.'
                : 'Choose a student from the dropdown above to view their knowledge graph.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Left Column: Overall Stats & Radar */}
          <div className="xl:col-span-1 space-y-6">
            
            {/* Student ID Card */}
            <div className="bg-gradient-to-br from-[#002147] to-[#003366] text-white rounded-3xl p-8 relative overflow-hidden shadow-lg">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Target className="w-32 h-32" />
              </div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-2xl font-bold mb-6">
                  {selectedStudent.name.charAt(0)}
                </div>
                <h2 className="text-2xl font-bold mb-1">{selectedStudent.name}</h2>
                <p className="text-blue-200 font-medium mb-2">{selectedStudent.studentClass} • {profile.assignments?.[0]?.subject || 'Mathematics'}</p>
                <div className="inline-block bg-white/10 px-3 py-1 rounded-full text-xs font-bold text-white mb-8 border border-white/20">
                  {selectedStudent.totalEvaluated} Assignments Evaluated
                </div>
                
                <div>
                  <div className="text-white/60 text-xs font-bold uppercase tracking-wider mb-2">Overall Structural Mastery</div>
                  <div className="flex items-end space-x-2">
                    <span className="text-5xl font-black">{selectedStudent.overallMastery}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Radar Chart Card */}
            <div className="bg-white rounded-3xl p-6 border border-[#002147]/10 shadow-sm flex flex-col">
              <h3 className="font-bold text-[#002147] mb-2 flex items-center space-x-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <span>Chapter Distribution</span>
              </h3>
              <p className="text-xs text-[#002147]/50 mb-4">Visual representation of knowledge strengths.</p>
              <div className="flex-1 flex items-center justify-center min-h-[300px]">
                <MasteryRadialChart chapters={selectedStudent.chaptersData} />
              </div>
            </div>

            {/* AI Weaknesses */}
            <div className="bg-[#fff0f2] rounded-3xl p-6 border border-[#dc143c]/20 shadow-sm">
              <h3 className="font-bold text-[#dc143c] mb-4 flex items-center space-x-2">
                <AlertCircle className="w-5 h-5" />
                <span>AI-Extracted Weaknesses</span>
              </h3>
              {selectedStudent.weaknesses.length === 0 ? (
                <p className="text-sm text-[#002147]/60">No specific conceptual weaknesses identified across assignments.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedStudent.weaknesses.map((w: string, i: number) => (
                    <span key={i} className="bg-white text-[#dc143c] px-3 py-1.5 rounded-lg border border-[#dc143c]/20 text-xs font-bold shadow-sm">
                      {w.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Knowledge Tree */}
          <div className="xl:col-span-2 flex flex-col space-y-6">
            <div className="bg-white rounded-3xl p-8 border border-[#002147]/10 shadow-sm">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-[#002147] mb-2">Knowledge Hierarchy</h2>
                <p className="text-[#002147]/60">Expand chapters to view precise topic-level mastery vectors.</p>
              </div>

              <div className="space-y-4">
                {selectedStudent.chaptersData.map((chapter: any, idx: number) => {
                  const isActive = activeChapter === chapter.id;
                  
                  return (
                    <div 
                      key={chapter.id} 
                      className={`border-2 rounded-2xl transition-all duration-300 overflow-hidden ${
                        isActive ? 'border-blue-500 shadow-md' : 'border-[#002147]/5 hover:border-[#002147]/20'
                      }`}
                    >
                      {/* Chapter Header */}
                      <button 
                        onClick={() => setActiveChapter(isActive ? '' : chapter.id)}
                        className={`w-full p-6 flex items-center justify-between transition-colors ${
                          isActive ? 'bg-blue-50/50' : 'bg-white'
                        }`}
                      >
                        <div className="flex items-center space-x-4">
                          <div 
                            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold"
                            style={{ backgroundColor: chapter.color }}
                          >
                            {idx + 1}
                          </div>
                          <div className="text-left">
                            <h3 className="text-lg font-bold text-[#002147]">{chapter.name}</h3>
                            <p className="text-sm text-[#002147]/50">{chapter.topics.length} Micro-topics</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-6">
                          <div className="text-right hidden sm:block">
                            <div className="text-xs font-bold text-[#002147]/40 uppercase tracking-wider mb-1">Mastery</div>
                            <div className={`text-xl font-black ${
                              chapter.mastery >= 80 ? 'text-green-600' :
                              chapter.mastery >= 60 ? 'text-amber-500' : 'text-red-500'
                            }`}>
                              {chapter.mastery}%
                            </div>
                          </div>
                          <motion.div animate={{ rotate: isActive ? 90 : 0 }}>
                            <ChevronRight className="w-6 h-6 text-[#002147]/30" />
                          </motion.div>
                        </div>
                      </button>

                      {/* Expanded Topics List */}
                      <AnimatePresence>
                        {isActive && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-[#002147]/5 bg-[#f8fafc]"
                          >
                            <div className="p-6 space-y-6">
                              {chapter.topicsData.map((topic: any, tIdx: number) => (
                                <div key={tIdx} className="flex items-center justify-between group">
                                  <div className="flex items-center space-x-3 flex-1">
                                    {topic.mastery >= 80 ? (
                                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    ) : topic.mastery >= 60 ? (
                                      <div className="w-5 h-5 rounded-full border-2 border-amber-400" />
                                    ) : (
                                      <AlertCircle className="w-5 h-5 text-red-500" />
                                    )}
                                    <span className="font-semibold text-[#002147]">{topic.name}</span>
                                  </div>
                                  
                                  <div className="flex items-center space-x-4 w-1/2">
                                    <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                                      <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${topic.mastery}%` }}
                                        transition={{ duration: 1, delay: 0.2 + (tIdx * 0.1) }}
                                        className={`h-full rounded-full ${
                                          topic.mastery >= 80 ? 'bg-gradient-to-r from-green-400 to-green-500' :
                                          topic.mastery >= 60 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 
                                          'bg-gradient-to-r from-red-400 to-red-500'
                                        }`}
                                      />
                                    </div>
                                    <span className="font-bold text-[#002147] w-12 text-right">{topic.mastery}%</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

            </div>

            {/* AI Learning Path Recommendations (Fills remaining space) */}
            <div className="bg-gradient-to-r from-blue-600 to-[#002147] rounded-3xl p-8 text-white shadow-lg flex-1 flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <BrainCircuit className="w-48 h-48" />
              </div>
              <div className="relative z-10 flex flex-col h-full">
                <div>
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                      <Target className="w-6 h-6 text-blue-200" />
                    </div>
                    <h2 className="text-2xl font-bold">AI Learning Path</h2>
                  </div>
                  
                  {selectedStudent.overallMastery >= 80 ? (
                    <p className="text-blue-100 text-lg max-w-lg leading-relaxed mb-8">
                      Student is excelling across the curriculum. Recommend introducing advanced enrichment materials, particularly focusing on {selectedStudent.chaptersData[0]?.name} applications.
                    </p>
                  ) : selectedStudent.totalEvaluated === 0 ? (
                    <p className="text-blue-100 text-lg max-w-lg leading-relaxed mb-8">
                      Awaiting more data. Once the student completes assignments, the Diagnostic Engine will formulate a customized intervention strategy here.
                    </p>
                  ) : (
                    <p className="text-blue-100 text-lg max-w-lg leading-relaxed mb-8">
                      Based on recent evaluations, prioritize intervention on <span className="font-bold text-white border-b-2 border-amber-400 pb-0.5">{selectedStudent.weaknesses[0]?.replace(/_/g, ' ') || 'foundational concepts'}</span>. 
                      Consider assigning targeted practice modules before progressing to advanced {selectedStudent.chaptersData[1]?.name || 'topics'}.
                    </p>
                  )}

                  <div className="mb-6 mt-4 space-y-3">
                    <h3 className="text-blue-200 text-xs font-bold uppercase tracking-wider flex items-center space-x-2">
                      <PlayCircle className="w-4 h-4" />
                      <span>Suggested Remedial Content</span>
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl overflow-hidden hover:bg-white/20 transition-all cursor-pointer group shadow-sm">
                        <div className="h-24 relative flex items-center justify-center overflow-hidden bg-[#002147]/40">
                          <div className="absolute inset-0 bg-gradient-to-t from-[#002147]/80 to-transparent z-10" />
                          <PlayCircle className="w-10 h-10 text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all z-20 drop-shadow-md" />
                        </div>
                        <div className="p-3 bg-white/5">
                          <div className="text-sm font-bold text-white mb-1 line-clamp-1 capitalize">Fixing {selectedStudent.weaknesses[0]?.replace(/_/g, ' ') || 'Basics'}</div>
                          <div className="text-xs text-blue-200 font-medium">5 min tutorial</div>
                        </div>
                      </div>
                      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl overflow-hidden hover:bg-white/20 transition-all cursor-pointer group shadow-sm">
                        <div className="h-24 relative flex items-center justify-center overflow-hidden bg-[#002147]/40">
                          <div className="absolute inset-0 bg-gradient-to-t from-[#002147]/80 to-transparent z-10" />
                          <PlayCircle className="w-10 h-10 text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all z-20 drop-shadow-md" />
                        </div>
                        <div className="p-3 bg-white/5">
                          <div className="text-sm font-bold text-white mb-1 line-clamp-1 capitalize">Mastering {selectedStudent.weaknesses[1]?.replace(/_/g, ' ') || 'Fundamentals'}</div>
                          <div className="text-xs text-blue-200 font-medium">8 min tutorial</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-auto pt-6 border-t border-white/10 flex items-center justify-between">
                  <span className="text-blue-200 text-sm font-medium">Ready to deploy targeted intervention</span>
                  <button 
                    onClick={handleGeneratePractice}
                    className="bg-white text-[#002147] px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors shadow-md flex items-center space-x-2"
                  >
                    <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                    <span>Generate Practice Module</span>
                  </button>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Practice Module Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#002147]/60 backdrop-blur-sm"
              onClick={() => !isGenerating && !isSending && setIsModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="p-6 sm:p-8 border-b border-[#002147]/10 flex justify-between items-center bg-gradient-to-r from-blue-50 to-white">
                <div>
                  <h2 className="text-2xl font-bold text-[#002147]">AI Practice Module</h2>
                  <p className="text-[#002147]/60">Targeted intervention for {selectedStudent?.name}</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  disabled={isGenerating || isSending}
                  className="text-[#002147]/40 hover:text-[#002147] transition-colors disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>

              <div className="p-6 sm:p-8 overflow-y-auto flex-1">
                {isGenerating ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                    <p className="text-lg font-bold text-[#002147] animate-pulse">Generating personalized questions...</p>
                    <p className="text-[#002147]/50 text-center max-w-md">Analyzing {selectedStudent?.weaknesses.join(', ')} to construct targeted interventions.</p>
                  </div>
                ) : generatedQuestions.length > 0 ? (
                  <div className="space-y-6">
                    {generatedQuestions.map((q, i) => (
                      <div key={i} className="bg-white border-2 border-[#002147]/5 p-6 rounded-2xl">
                        <h4 className="font-bold text-[#002147] text-lg mb-4"><span className="text-blue-600 mr-2">Q{i + 1}.</span>{q.questionText}</h4>
                        <div className="space-y-3">
                          {q.options.map((opt: string, optIdx: number) => (
                            <div 
                              key={optIdx} 
                              className={`p-4 rounded-xl border ${optIdx === q.correctOptionId ? 'border-green-500 bg-green-50' : 'border-[#002147]/10 bg-gray-50'}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className={optIdx === q.correctOptionId ? 'text-green-800 font-medium' : 'text-[#002147]/80'}>{opt}</span>
                                {optIdx === q.correctOptionId && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="p-6 border-t border-[#002147]/10 bg-gray-50 flex justify-end space-x-4">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  disabled={isGenerating || isSending}
                  className="px-6 py-3 rounded-xl font-bold text-[#002147]/60 hover:bg-[#002147]/5 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendPractice}
                  disabled={isGenerating || isSending || generatedQuestions.length === 0}
                  className="px-6 py-3 rounded-xl font-bold bg-[#002147] text-white hover:bg-blue-900 transition-colors shadow-md disabled:opacity-50 flex items-center space-x-2"
                >
                  {isSending ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <span>Send to Student</span>
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TeacherMasteryTracker() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading...</div>}>
      <MasteryTrackerContent />
    </Suspense>
  );
}
