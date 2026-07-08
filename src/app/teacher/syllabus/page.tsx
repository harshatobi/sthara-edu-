'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, BookOpen, Calendar, Plus, X, BrainCircuit, Loader2,
  Sparkles, Target, FileText, Lightbulb, PlayCircle, FileCheck,
  Trash2, CheckSquare, Send, Edit2, GraduationCap, ClipboardList,
  Tag, Clock, MoreVertical, ChevronDown
} from 'lucide-react';
import Link from 'next/link';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';

const MONTHS = ['June','July','August','September','October','November','December','January','February','March','April','May'];
const SUBJECTS = ['Mathematics','Science','Physics','Chemistry','Biology','English','Hindi','Social Studies','History','Geography','Computer Science','Art','Physical Education','Other'];
const TEACHING_METHODS = ['Lecture + Discussion','Inquiry-Based Learning','Project-Based Learning','Flipped Classroom','Socratic Method','Collaborative Learning','Direct Instruction','Problem-Based Learning'];
const ASSESSMENT_TYPES = ['Written Test','Practical/Lab','Project Submission','Presentation','Quiz','Group Activity','Portfolio','Observation'];

// generateAIPath is now replaced by the /api/teacher/curriculum-gen endpoint
// which returns topic-specific content via Gemini AI


const emptyForm = () => ({
  month: '',
  topic: '',
  subject: '',
  grade: '',
  weeks: '',
  objectives: '',
  teachingMethod: '',
  assessmentType: '',
  notes: '',
});

export default function TeacherSyllabus() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [syllabus, setSyllabus] = useState<{ [key: string]: any[] }>(
    Object.fromEntries(MONTHS.map(m => [m, []]))
  );

  const [selectedModule, setSelectedModule] = useState<any | null>(null);
  const [activeResource, setActiveResource] = useState<any | null>(null);
  const [resourceData, setResourceData] = useState<any>(null);
  const [isResourceLoading, setIsResourceLoading] = useState(false);
  const [isSuggested, setIsSuggested] = useState(false);

  // Add / Edit modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<any | null>(null); // null = add, else edit
  const [form, setForm] = useState(emptyForm());
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  // Quick Add
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddMonth, setQuickAddMonth] = useState('');
  const [quickAddPrompt, setQuickAddPrompt] = useState('');

  // Delete confirmation
  const [deletingModule, setDeletingModule] = useState<any | null>(null);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
      return;
    }
    if (profile?.schoolId && profile?.uid) {
      (async () => {
        try {
          const { getAuth } = await import('firebase/auth');
          const idToken = await getAuth().currentUser?.getIdToken();
          const res = await fetch(
            `/api/teacher/syllabus?schoolId=${profile.schoolId}&teacherId=${profile.uid}`,
            { headers: idToken ? { Authorization: `Bearer ${idToken}` } : {} }
          );
          const data = await res.json();
          const loaded: { [key: string]: any[] } = Object.fromEntries(MONTHS.map(m => [m, []]));
          (data.modules || []).forEach((mod: any) => {
            if (loaded[mod.month] !== undefined) {
              loaded[mod.month].push(mod);
            }
          });
          setSyllabus(loaded);
        } catch (err) { console.error('[syllabus load]', err); }
      })();
    }
  }, [profile, loading, router]);


  const simulateAI = async (cb: (aiPath: any) => Promise<void>) => {
    setIsAIGenerating(true);
    const steps = [
      'Analysing curriculum requirements…',
      'Building topic-specific milestones…',
      'Generating targeted resources…',
      'Finalising AI curriculum path…',
    ];
    let aiPath: any = null;
    // Run steps concurrently with the actual API call
    const stepsPromise = (async () => {
      for (const s of steps) {
        setLoadingText(s);
        await new Promise(r => setTimeout(r, 600));
      }
    })();
    // Fetch AI curriculum from Gemini
    const apiPromise = fetch('/api/teacher/curriculum-gen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: form.topic,
        subject: form.subject,
        grade: form.grade,
        objectives: form.objectives,
        teachingMethod: form.teachingMethod,
        assessmentType: form.assessmentType,
        month: form.month,
      }),
    }).then(r => r.json()).catch(() => null);
    await Promise.all([stepsPromise, apiPromise.then(d => { aiPath = d; })]);
    setIsAIGenerating(false);
    await cb(aiPath);
  };


  const openAddModal = (defaultMonth = '') => {
    setEditingModule(null);
    setForm({ ...emptyForm(), month: defaultMonth });
    setIsFormOpen(true);
  };

  const openEditModal = (mod: any) => {
    setEditingModule(mod);
    setForm({
      month: mod.month || '',
      topic: mod.topic || '',
      subject: mod.subject || '',
      grade: mod.grade || '',
      weeks: mod.weeks || '',
      objectives: mod.objectives || '',
      teachingMethod: mod.teachingMethod || '',
      assessmentType: mod.assessmentType || '',
      notes: mod.notes || '',
    });
    setSelectedModule(null);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.topic || !form.month || !profile?.schoolId) return;

    const { getAuth } = await import('firebase/auth');
    const idToken = await getAuth().currentUser?.getIdToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    };

    if (editingModule) {
      // ── EDIT ──
      const updated = { ...editingModule, ...form };
      await fetch('/api/teacher/syllabus', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ schoolId: profile.schoolId, id: editingModule.id, ...form }),
      });
      setSyllabus(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(m => {
          next[m] = next[m].filter((x: any) => x.id !== editingModule.id);
        });
        next[form.month] = [...(next[form.month] || []), updated];
        return next;
      });
      setIsFormOpen(false);
      setSelectedModule(updated);
    } else {
      // ── ADD ──
      await simulateAI(async (aiPath: any) => {
        const newId = `syl_${Date.now()}`;
        const fallbackAiPath = {
          overview: `A curriculum path for "${form.topic}" — blending foundational theory with real-world application.`,
          milestones: [
            { title: 'Phase 1: Introduction', description: `Introduce key concepts of ${form.topic}.` },
            { title: 'Phase 2: Core Practice', description: `Work through examples of ${form.topic}.` },
            { title: 'Phase 3: Application', description: `Apply ${form.topic} to real-world problems.` },
            { title: 'Phase 4: Assessment', description: `Assess understanding of ${form.topic}.` },
          ],
          resources: [
            { id: 'res_1', title: `Concept Map: ${form.topic}`, type: 'interactive' },
            { id: 'res_2', title: `${form.topic} Study Guide`, type: 'document' },
            { id: 'res_3', title: `${form.topic} Video Lesson`, type: 'video' },
          ],
          teacherNotes: `Focus on common misconceptions students have with ${form.topic}. Use visual aids and worked examples.`,
        };
        const newMod = {
          teacherId: profile.uid,
          status: 'planned',
          aiPath: aiPath && aiPath.overview ? aiPath : fallbackAiPath,
          createdAt: new Date().toISOString(),
          ...form,
        };

        const res = await fetch('/api/teacher/syllabus', {
          method: 'POST',
          headers,
          body: JSON.stringify({ schoolId: profile.schoolId, id: newId, ...newMod }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create module');
        setSyllabus(prev => ({
          ...prev,
          [form.month]: [...(prev[form.month] || []), { id: newId, ...newMod }],
        }));
        setIsFormOpen(false);
        setForm(emptyForm());
        setSelectedModule({ id: newId, ...newMod });
      });
    }
  };


  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddPrompt || !profile?.schoolId) return;
    await simulateAI(async (aiPath: any) => {
      const { getAuth } = await import('firebase/auth');
      const idToken = await getAuth().currentUser?.getIdToken();
      const topic = quickAddPrompt.length > 40 ? quickAddPrompt.slice(0, 40) + '…' : quickAddPrompt;
      const newId = `syl_${Date.now()}`;
      const fallbackAiPath = {
        overview: `A curriculum path for "${topic}" — structured for maximum understanding.`,
        milestones: [
          { title: 'Phase 1: Introduction', description: `Introduce key concepts of ${topic}.` },
          { title: 'Phase 2: Practice', description: `Guided practice on ${topic}.` },
          { title: 'Phase 3: Application', description: `Apply ${topic} to problems.` },
          { title: 'Phase 4: Assessment', description: `Assess understanding of ${topic}.` },
        ],
        resources: [
          { id: 'res_1', title: `${topic} Concept Map`, type: 'interactive' },
          { id: 'res_2', title: `${topic} Study Guide`, type: 'document' },
          { id: 'res_3', title: `${topic} Video`, type: 'video' },
        ],
        teacherNotes: `Watch for misconceptions in ${topic}. Use real examples to build intuition.`,
      };
      const newMod = {
        teacherId: profile.uid, month: quickAddMonth,
        topic, subject: '', grade: '', weeks: 'TBD',
        objectives: quickAddPrompt, teachingMethod: '', assessmentType: '', notes: '',
        status: 'planned', aiPath: aiPath?.overview ? aiPath : fallbackAiPath,
        createdAt: new Date().toISOString(),
      };
      const res = await fetch('/api/teacher/syllabus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ schoolId: profile.schoolId, id: newId, ...newMod }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setSyllabus(prev => ({
        ...prev,
        [quickAddMonth]: [...(prev[quickAddMonth] || []), { id: newId, ...newMod }],
      }));
      setIsQuickAddOpen(false); setQuickAddPrompt('');
      setSelectedModule({ id: newId, ...newMod });
    });
  };




  const markCompleted = async (mod: any) => {
    if (!profile?.schoolId) return;
    const { getAuth } = await import('firebase/auth');
    const idToken = await getAuth().currentUser?.getIdToken();
    await fetch('/api/teacher/syllabus', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ schoolId: profile.schoolId, id: mod.id, status: 'completed' }),
    });
    setSyllabus(prev => {
      const next = { ...prev };
      const idx = next[mod.month].findIndex((m: any) => m.id === mod.id);
      if (idx !== -1) next[mod.month][idx] = { ...next[mod.month][idx], status: 'completed' };
      return next;
    });
    setSelectedModule({ ...mod, status: 'completed' });
  };


  const confirmDelete = async () => {
    if (!deletingModule || !profile?.schoolId) return;
    const { getAuth } = await import('firebase/auth');
    const idToken = await getAuth().currentUser?.getIdToken();
    await fetch('/api/teacher/syllabus', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ schoolId: profile.schoolId, id: deletingModule.id }),
    });
    setSyllabus(prev => {
      const next = { ...prev };
      next[deletingModule.month] = next[deletingModule.month].filter((m: any) => m.id !== deletingModule.id);
      return next;
    });

    if (selectedModule?.id === deletingModule.id) setSelectedModule(null);
    setDeletingModule(null);
  };

  const handleExport = () => {
    let txt = 'STHARA — CURRICULUM PLANNER\n' + '='.repeat(60) + '\n\n';
    MONTHS.forEach(m => {
      const items = syllabus[m] || [];
      if (!items.length) return;
      txt += `📅 ${m.toUpperCase()}\n${'─'.repeat(40)}\n`;
      items.forEach((it, i) => {
        txt += `  ${i+1}. ${it.topic}\n`;
        if (it.subject) txt += `     Subject   : ${it.subject}\n`;
        if (it.grade) txt += `     Grade     : ${it.grade}\n`;
        txt += `     Timeline  : ${it.weeks}\n`;
        if (it.teachingMethod) txt += `     Method    : ${it.teachingMethod}\n`;
        if (it.assessmentType) txt += `     Assessment: ${it.assessmentType}\n`;
        if (it.objectives) txt += `     Objectives: ${it.objectives}\n`;
        txt += `     Status    : ${it.status}\n\n`;
      });
    });
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `Curriculum_${profile?.name?.replace(' ','_') || 'Teacher'}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleResourceClick = async (res: any, topic: string) => {
    setActiveResource(res);
    setIsResourceLoading(true);
    setResourceData(null);
    setIsSuggested(false);

    if (res.type === 'video') {
      try {
        const r = await fetch(`/api/youtube?q=${encodeURIComponent(topic + ' educational explanation')}`);
        const d = await r.json();
        setResourceData(d.videos?.[0] || null);
      } catch {
        setResourceData(null);
      } finally {
        setIsResourceLoading(false); // ✓ inside async branch
      }
    } else if (res.type === 'document') {
      setTimeout(() => {
        setResourceData({
          title: `Real-World Case Study: ${topic}`,
          content: `📌 Context\nIn recent years, the principles of "${topic}" have been applied across multiple real-world domains — from engineering to public policy — yielding measurable improvements in outcomes.\n\n📊 Key Finding\nOrganizations that applied structured approaches to ${topic} saw a 35–40% improvement in efficiency and a significant reduction in error rates.\n\n🧠 Student Discussion Questions\n1. How does ${topic} connect to challenges we see in everyday life?\n2. Can you identify a local or national problem where knowledge of ${topic} could help?\n3. What would you do differently knowing what you now know about ${topic}?\n\n📝 Activity\nIn pairs, design a 2-minute presentation on one real-world application of ${topic}. Use at least one specific example.`
        });
        setIsResourceLoading(false); // ✓ inside setTimeout
      }, 1000);
    } else {
      // Interactive concept map — rich structured data
      setTimeout(() => {
        setResourceData({
          center: topic,
          branches: [
            { label: 'Core Concepts', color: 'bg-blue-100 text-blue-800 border-blue-300', items: ['Definition & Scope', 'Key Principles', 'Foundational Theory'] },
            { label: 'Real-World Use', color: 'bg-green-100 text-green-800 border-green-300', items: ['Industry Examples', 'Case Studies', 'Problem Solving'] },
            { label: 'Historical Context', color: 'bg-orange-100 text-orange-800 border-orange-300', items: ['Origins & Evolution', 'Key Figures', 'Major Milestones'] },
            { label: 'Student Activities', color: 'bg-purple-100 text-purple-800 border-purple-300', items: ['Group Discussion', 'Hands-on Project', 'Quiz & Review'] },
          ]
        });
        setIsResourceLoading(false); // ✓ inside setTimeout
      }, 600);
    }
    // REMOVED: setIsResourceLoading(false) — was incorrectly called synchronously before setTimeout fired
  };


  const handleSuggestResource = async () => {
    setIsSuggested(true);
    if (profile?.schoolId && activeResource) {
      try {
        await addDoc(collection(db, 'schools', profile.schoolId, 'notifications'), {
          type: 'resource_suggestion',
          message: `Your teacher suggested: ${activeResource.title}`,
          targetAudience: 'students',
          createdAt: new Date().toISOString(),
        });
      } catch { /* ignore */ }
    }
  };

  const statusColor = (s: string) => s === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : s === 'in-progress' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-500 border-gray-200';
  const statusBar = (s: string) => s === 'completed' ? 'bg-emerald-400' : s === 'in-progress' ? 'bg-blue-400' : 'bg-gray-300';

  const Field = ({ label, value }: { label: string; value?: string }) =>
    value ? <div><span className="text-xs font-bold uppercase tracking-wider text-[#002147]/40">{label}</span><p className="text-[#002147] font-semibold mt-0.5">{value}</p></div> : null;

  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-12 font-sans">
      <style dangerouslySetInnerHTML={{__html:`
        .hide-scrollbar::-webkit-scrollbar{display:none}
        .hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
        @media print{body *{visibility:hidden}#printable-area,#printable-area *{visibility:visible}#printable-area{position:absolute;left:0;top:0;width:100%}.no-print{display:none!important}}
      `}} />

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-[#002147] via-[#003366] to-[#001a33] text-white pt-12 pb-24 px-8 relative overflow-hidden shadow-xl no-print">
        <div className="absolute inset-0 opacity-5"><BookOpen className="w-96 h-96 absolute -right-16 -top-16 rotate-12" /></div>
        <div className="max-w-7xl mx-auto relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center space-x-5">
            <Link href="/teacher" className="p-3 bg-white/10 rounded-full border border-white/20 hover:bg-white/20 transition-all hover:-translate-x-1">
              <ArrowLeft className="w-6 h-6 text-white" />
            </Link>
            <div>
              <div className="inline-flex items-center space-x-2 bg-orange-500/20 text-orange-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 border border-orange-500/30">
                <Calendar className="w-3 h-3" /><span>Academic Year 2026–27</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Curriculum Planner</h1>
              <p className="text-blue-200 mt-2 text-lg font-medium">Plan months, track objectives, and orchestrate learning milestones.</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={handleExport} className="bg-white/10 border border-white/20 text-white px-5 py-3 rounded-xl font-bold hover:bg-white/20 transition-all shadow-lg">Export</button>
            <button onClick={() => openAddModal()} className="bg-gradient-to-r from-orange-400 to-orange-500 text-white px-6 py-3 rounded-xl font-bold flex items-center space-x-2 hover:from-orange-500 hover:to-orange-600 transition-all shadow-lg hover:-translate-y-0.5">
              <Plus className="w-5 h-5" /><span>Add Module</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Kanban Board ── */}
      <div id="printable-area" className="max-w-7xl mx-auto px-4 sm:px-8 -mt-16 relative z-20">
        <div className="flex overflow-x-auto pb-8 space-x-5 snap-x hide-scrollbar">
          {MONTHS.map((month) => (
            <div key={month} className="snap-start shrink-0 w-80 flex flex-col h-[750px]">
              {/* Column header */}
              <div className="bg-white rounded-t-2xl p-4 shadow-sm border-b-4 border-[#002147] flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-full bg-[#002147]/5 text-[#002147] flex items-center justify-center font-bold text-sm border border-[#002147]/10">{month.slice(0,3)}</div>
                  <h2 className="font-extrabold text-[#002147] text-lg tracking-tight">{month}</h2>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2 py-1 rounded-md no-print">{syllabus[month]?.length || 0} items</span>
                  <button onClick={() => openAddModal(month)} title="Add to this month" className="no-print p-1.5 rounded-lg hover:bg-[#002147]/5 transition-colors text-[#002147]/40 hover:text-[#002147]">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 bg-gray-50/70 rounded-b-2xl p-3 border border-gray-200 border-t-0 shadow-inner overflow-y-auto space-y-3">
                {!syllabus[month]?.length ? (
                  <div className="h-full border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 space-y-2 bg-white/50 no-print">
                    <Calendar className="w-8 h-8 opacity-20" />
                    <span className="text-sm font-medium">Drop modules here</span>
                  </div>
                ) : (
                  syllabus[month]?.map((item: any) => (
                    <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group relative overflow-hidden" onClick={() => setSelectedModule(item)}>
                      {/* Status bar */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusBar(item.status)}`} />

                      <div className="p-4 ml-2">
                        {/* Top row */}
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full border ${statusColor(item.status)}`}>
                            {item.status.replace('-',' ')}
                          </span>
                          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity no-print" onClick={e => e.stopPropagation()}>
                            <button onClick={() => openEditModal(item)} className="p-1 rounded hover:bg-blue-50 text-[#002147]/40 hover:text-blue-600 transition-colors" title="Edit">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeletingModule(item)} className="p-1 rounded hover:bg-red-50 text-[#002147]/40 hover:text-red-500 transition-colors" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Topic */}
                        <h3 className="font-bold text-[#002147] text-sm leading-tight mb-2 group-hover:text-blue-600 transition-colors">{item.topic}</h3>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {item.subject && <span className="inline-flex items-center space-x-1 text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100"><Tag className="w-2.5 h-2.5" /><span>{item.subject}</span></span>}
                          {item.grade && <span className="inline-flex items-center space-x-1 text-[10px] font-bold bg-orange-50 text-orange-600 px-2 py-0.5 rounded border border-orange-100"><GraduationCap className="w-2.5 h-2.5" /><span>{item.grade}</span></span>}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between mt-2">
                          <span className="flex items-center space-x-1 text-gray-400 text-xs font-medium"><Clock className="w-3 h-3" /><span>{item.weeks || 'TBD'}</span></span>
                          {item.assessmentType && <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 truncate max-w-[100px]">{item.assessmentType}</span>}
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {/* Quick Add */}
                <button onClick={() => { setQuickAddMonth(month); setIsQuickAddOpen(true); }} className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-xs font-bold text-gray-400 hover:bg-white hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center space-x-1.5 no-print">
                  <Sparkles className="w-3.5 h-3.5" /><span>Quick Add AI</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════ MODALS ══════════════════════════ */}

      {/* ── Add / Edit Module Modal ── */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-[#002147]/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
            {isAIGenerating ? (
              <div className="p-12 flex flex-col items-center justify-center text-center space-y-6">
                <div className="relative"><div className="absolute inset-0 bg-blue-400 blur-xl opacity-20 rounded-full animate-pulse" /><BrainCircuit className="w-20 h-20 text-blue-600 relative z-10 animate-pulse" /></div>
                <div><h3 className="text-2xl font-extrabold text-[#002147] mb-2">AI Architect Working</h3><p className="text-blue-600 font-medium animate-pulse">{loadingText}</p></div>
              </div>
            ) : (
              <>
                <div className="bg-gradient-to-r from-[#002147] to-[#003366] p-6 flex justify-between items-center text-white shrink-0">
                  <div>
                    <h3 className="text-xl font-bold flex items-center"><Sparkles className="w-5 h-5 mr-2 text-orange-400" />{editingModule ? 'Edit Module' : 'Create New Module'}</h3>
                    <p className="text-blue-200 text-sm mt-1">{editingModule ? 'Update curriculum details' : 'Fill in details — AI will generate a teaching path'}</p>
                  </div>
                  <button onClick={() => setIsFormOpen(false)} className="text-white/50 hover:text-white bg-white/10 p-2 rounded-full"><X className="w-5 h-5" /></button>
                </div>

                <form onSubmit={handleFormSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
                  {/* Month — REQUIRED, no default */}
                  <div>
                    <label className="block text-sm font-bold text-[#002147] mb-1.5">Month <span className="text-red-500">*</span></label>
                    <select required value={form.month} onChange={e => setForm(f => ({...f, month: e.target.value}))} className="w-full bg-[#f8fafc] border border-[#002147]/15 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20 font-medium">
                      <option value="">— Select Month —</option>
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  {/* Topic */}
                  <div>
                    <label className="block text-sm font-bold text-[#002147] mb-1.5">Topic / Module Name <span className="text-red-500">*</span></label>
                    <input required autoFocus type="text" value={form.topic} onChange={e => setForm(f => ({...f, topic: e.target.value}))} placeholder="e.g. Quadratic Equations" className="w-full bg-[#f8fafc] border border-[#002147]/15 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20 font-medium" />
                  </div>

                  {/* Subject + Grade (2 col) */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-[#002147] mb-1.5">Subject</label>
                      <select value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} className="w-full bg-[#f8fafc] border border-[#002147]/15 rounded-xl px-3 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20 font-medium text-sm">
                        <option value="">— Select —</option>
                        {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-[#002147] mb-1.5">Grade / Class</label>
                      <input type="text" value={form.grade} onChange={e => setForm(f => ({...f, grade: e.target.value}))} placeholder="e.g. Class 10A" className="w-full bg-[#f8fafc] border border-[#002147]/15 rounded-xl px-3 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20 font-medium text-sm" />
                    </div>
                  </div>

                  {/* Timeline */}
                  <div>
                    <label className="block text-sm font-bold text-[#002147] mb-1.5">Estimated Timeline</label>
                    <input type="text" value={form.weeks} onChange={e => setForm(f => ({...f, weeks: e.target.value}))} placeholder="e.g. Weeks 1–3 (3 classes)" className="w-full bg-[#f8fafc] border border-[#002147]/15 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20 font-medium" />
                  </div>

                  {/* Learning Objectives */}
                  <div>
                    <label className="block text-sm font-bold text-[#002147] mb-1.5">Learning Objectives</label>
                    <textarea rows={3} value={form.objectives} onChange={e => setForm(f => ({...f, objectives: e.target.value}))} placeholder="What should students be able to do by end of this module?" className="w-full bg-[#f8fafc] border border-[#002147]/15 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20 font-medium resize-none text-sm" />
                  </div>

                  {/* Teaching Method + Assessment (2 col) */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-[#002147] mb-1.5">Teaching Method</label>
                      <select value={form.teachingMethod} onChange={e => setForm(f => ({...f, teachingMethod: e.target.value}))} className="w-full bg-[#f8fafc] border border-[#002147]/15 rounded-xl px-3 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20 font-medium text-sm">
                        <option value="">— Select —</option>
                        {TEACHING_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-[#002147] mb-1.5">Assessment Type</label>
                      <select value={form.assessmentType} onChange={e => setForm(f => ({...f, assessmentType: e.target.value}))} className="w-full bg-[#f8fafc] border border-[#002147]/15 rounded-xl px-3 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20 font-medium text-sm">
                        <option value="">— Select —</option>
                        {ASSESSMENT_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-bold text-[#002147] mb-1.5">Teacher Notes</label>
                    <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Any personal notes or reminders for this module…" className="w-full bg-[#f8fafc] border border-[#002147]/15 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20 font-medium resize-none text-sm" />
                  </div>

                  <div className="flex space-x-3 pt-2">
                    <button type="button" onClick={() => setIsFormOpen(false)} className="flex-1 py-3 border-2 border-[#002147]/10 rounded-xl font-bold text-[#002147]/60 hover:bg-gray-50 transition-colors">Cancel</button>
                    <button type="submit" className="flex-2 flex-grow py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center space-x-2">
                      <BrainCircuit className="w-4 h-4" />
                      <span>{editingModule ? 'Save Changes' : 'Generate AI Path'}</span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      {deletingModule && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in no-print">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 className="w-8 h-8 text-red-500" /></div>
            <h3 className="text-xl font-extrabold text-[#002147] mb-2">Delete Module?</h3>
            <p className="text-[#002147]/60 font-medium mb-6">"{deletingModule.topic}" will be permanently removed from {deletingModule.month}.</p>
            <div className="flex space-x-3">
              <button onClick={() => setDeletingModule(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-colors shadow-md">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Module Detail Slide-over ── */}
      {selectedModule && !activeResource && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex justify-end animate-in fade-in no-print">
          <div className="bg-white w-full max-w-3xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#002147] to-[#003366] p-8 text-white shrink-0 relative overflow-hidden">
              <div className="absolute right-0 top-0 opacity-5"><BrainCircuit className="w-64 h-64 -mt-10 -mr-10" /></div>
              <button onClick={() => setSelectedModule(null)} className="absolute top-6 right-6 text-white/50 hover:text-white bg-white/10 p-2 rounded-full transition-colors"><X className="w-5 h-5" /></button>

              <div className="inline-flex items-center space-x-2 bg-blue-500/20 text-blue-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border border-blue-400/30">
                <Sparkles className="w-3 h-3" /><span>AI Curriculum Path</span>
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight leading-tight max-w-xl">{selectedModule.topic}</h2>

              {/* Meta chips */}
              <div className="flex flex-wrap gap-3 mt-4">
                {selectedModule.month && <div className="flex items-center space-x-1.5 bg-white/10 px-3 py-1.5 rounded-lg text-sm font-medium"><Calendar className="w-3.5 h-3.5" /><span>{selectedModule.month}</span></div>}
                {selectedModule.weeks && <div className="flex items-center space-x-1.5 bg-white/10 px-3 py-1.5 rounded-lg text-sm font-medium"><Clock className="w-3.5 h-3.5" /><span>{selectedModule.weeks}</span></div>}
                {selectedModule.subject && <div className="flex items-center space-x-1.5 bg-white/10 px-3 py-1.5 rounded-lg text-sm font-medium"><Tag className="w-3.5 h-3.5" /><span>{selectedModule.subject}</span></div>}
                {selectedModule.grade && <div className="flex items-center space-x-1.5 bg-white/10 px-3 py-1.5 rounded-lg text-sm font-medium"><GraduationCap className="w-3.5 h-3.5" /><span>{selectedModule.grade}</span></div>}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-8 bg-[#f8fafc] space-y-8">

              {/* Details grid */}
              {(selectedModule.objectives || selectedModule.teachingMethod || selectedModule.assessmentType || selectedModule.notes) && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#002147]/5 grid grid-cols-2 gap-5">
                  {selectedModule.objectives && (
                    <div className="col-span-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#002147]/40 flex items-center mb-1"><Target className="w-3 h-3 mr-1" />Learning Objectives</span>
                      <p className="text-[#002147] font-medium text-sm leading-relaxed">{selectedModule.objectives}</p>
                    </div>
                  )}
                  {selectedModule.teachingMethod && (
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#002147]/40 block mb-1">Teaching Method</span>
                      <p className="text-[#002147] font-semibold text-sm">{selectedModule.teachingMethod}</p>
                    </div>
                  )}
                  {selectedModule.assessmentType && (
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#002147]/40 block mb-1">Assessment</span>
                      <p className="text-[#002147] font-semibold text-sm">{selectedModule.assessmentType}</p>
                    </div>
                  )}
                  {selectedModule.notes && (
                    <div className="col-span-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#002147]/40 block mb-1">Teacher Notes</span>
                      <p className="text-[#002147]/70 font-medium text-sm leading-relaxed">{selectedModule.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* AI Overview */}
              <section>
                <h3 className="text-lg font-bold text-[#002147] flex items-center border-b border-[#002147]/10 pb-2 mb-4"><FileText className="w-5 h-5 mr-2 text-blue-600" />AI Executive Overview</h3>
                <p className="text-[#002147]/70 leading-relaxed font-medium bg-white p-5 rounded-2xl shadow-sm border border-[#002147]/5">{selectedModule.aiPath?.overview}</p>
              </section>

              {/* Milestones */}
              <section>
                <h3 className="text-lg font-bold text-[#002147] flex items-center border-b border-[#002147]/10 pb-2 mb-5"><Target className="w-5 h-5 mr-2 text-orange-500" />Step-by-Step Milestones</h3>
                <div className="space-y-4">
                  {selectedModule.aiPath?.milestones?.map((m: any, i: number) => (
                    <div key={i} className="flex space-x-4">
                      <div className="shrink-0 w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow">{i+1}</div>
                      <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#002147]/8 flex-1 hover:shadow-md transition-shadow">
                        <h4 className="font-bold text-[#002147] mb-1">{m.title}</h4>
                        <p className="text-sm text-[#002147]/60 font-medium leading-relaxed">{m.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Teaching Tips */}
              <section>
                <h3 className="text-lg font-bold text-[#002147] flex items-center border-b border-[#002147]/10 pb-2 mb-4"><Lightbulb className="w-5 h-5 mr-2 text-yellow-500" />AI Teaching Strategy</h3>
                <div className="bg-gradient-to-br from-yellow-50 to-orange-50 p-6 rounded-2xl border border-yellow-200 shadow-sm">
                  <p className="text-yellow-900 font-medium leading-relaxed">{selectedModule.aiPath?.teacherNotes}</p>
                </div>
              </section>

              {/* Resources */}
              <section>
                <h3 className="text-lg font-bold text-[#002147] flex items-center border-b border-[#002147]/10 pb-2 mb-4"><BookOpen className="w-5 h-5 mr-2 text-indigo-500" />Generated Resources</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {selectedModule.aiPath?.resources?.map((res: any, i: number) => (
                    <div key={i} onClick={() => handleResourceClick(res, selectedModule.topic)} className="bg-white p-4 rounded-xl border border-[#002147]/8 flex items-start space-x-3 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group">
                      <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                        {res.type === 'video' ? <PlayCircle className="w-5 h-5" /> : <FileCheck className="w-5 h-5" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-[#002147] text-xs leading-tight mb-1">{res.title}</h4>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">{res.type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="bg-white p-5 border-t border-[#002147]/8 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-3">
                {selectedModule.status !== 'completed' ? (
                  <button onClick={() => markCompleted(selectedModule)} className="flex items-center space-x-2 text-green-700 font-bold text-sm bg-green-50 px-4 py-2.5 rounded-xl border border-green-200 hover:bg-green-100 transition-colors">
                    <CheckSquare className="w-4 h-4" /><span>Mark Completed</span>
                  </button>
                ) : (
                  <span className="text-green-700 font-bold text-sm bg-green-50 px-4 py-2.5 rounded-xl border border-green-200 flex items-center space-x-1"><CheckSquare className="w-4 h-4" /><span>Completed</span></span>
                )}
                <button onClick={() => openEditModal(selectedModule)} className="flex items-center space-x-2 text-blue-700 font-bold text-sm bg-blue-50 px-4 py-2.5 rounded-xl border border-blue-200 hover:bg-blue-100 transition-colors">
                  <Edit2 className="w-4 h-4" /><span>Edit</span>
                </button>
                <button onClick={() => setDeletingModule(selectedModule)} className="flex items-center space-x-2 text-red-600 font-bold text-sm bg-red-50 px-4 py-2.5 rounded-xl border border-red-200 hover:bg-red-100 transition-colors">
                  <Trash2 className="w-4 h-4" /><span>Delete</span>
                </button>
              </div>
              <button onClick={() => setSelectedModule(null)} className="bg-[#002147] hover:bg-[#003366] text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Add Modal ── */}
      {isQuickAddOpen && (
        <div className="fixed inset-0 bg-[#002147]/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
            {isAIGenerating ? (
              <div className="p-12 flex flex-col items-center justify-center text-center space-y-6">
                <div className="relative"><div className="absolute inset-0 bg-orange-400 blur-xl opacity-20 rounded-full animate-pulse" /><BrainCircuit className="w-20 h-20 text-orange-500 relative z-10 animate-pulse" /></div>
                <div><h3 className="text-2xl font-extrabold text-[#002147] mb-2">Drafting Quick Plan</h3><p className="text-orange-600 font-medium animate-pulse">{loadingText}</p></div>
              </div>
            ) : (
              <>
                <div className="bg-[#f8fafc] border-b border-[#002147]/10 p-6 flex justify-between items-center">
                  <h3 className="text-xl font-bold text-[#002147] flex items-center"><Sparkles className="w-5 h-5 mr-2 text-orange-500" />Quick Add to {quickAddMonth}</h3>
                  <button onClick={() => setIsQuickAddOpen(false)} className="text-[#002147]/40 hover:text-red-500 transition-colors p-2 bg-white rounded-full shadow-sm border border-[#002147]/5"><X className="w-5 h-5" /></button>
                </div>
                <form onSubmit={handleQuickAddSubmit} className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-[#002147] mb-2">What do you want to teach?</label>
                    <textarea autoFocus required rows={4} value={quickAddPrompt} onChange={e => setQuickAddPrompt(e.target.value)} placeholder="e.g. I need to teach basic fractions to 4th graders with a fun quiz at the end." className="w-full bg-[#f8fafc] border border-[#002147]/20 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-medium shadow-inner resize-none" />
                  </div>
                  <button type="submit" className="w-full bg-[#002147] text-white py-3.5 rounded-xl font-bold hover:bg-[#002147]/90 transition-colors flex items-center justify-center space-x-2">
                    <Sparkles className="w-4 h-4 text-orange-400" /><span>Generate Task & Plan</span>
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Resource Viewer ── */}
      {activeResource && (
        <div className="fixed inset-0 bg-[#002147]/80 backdrop-blur-md z-[120] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="bg-gradient-to-r from-[#002147] to-[#003366] p-6 flex justify-between items-center text-white shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/10 rounded-lg">{activeResource.type === 'video' ? <PlayCircle className="w-6 h-6" /> : <FileCheck className="w-6 h-6" />}</div>
                <div><h3 className="text-xl font-bold">{activeResource.title}</h3><span className="text-xs font-bold uppercase tracking-wider text-blue-300">{activeResource.type} Resource</span></div>
              </div>
              <button onClick={() => setActiveResource(null)} className="text-white/50 hover:text-white bg-white/10 p-2 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 bg-[#f8fafc] flex flex-col">
              {isResourceLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-4"><Loader2 className="w-12 h-12 text-[#002147] animate-spin" /><p className="text-[#002147]/60 font-bold animate-pulse">Loading resource…</p></div>
              ) : resourceData ? (
                <div className="flex-1 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {activeResource.type === 'video' ? (
                    <div className="flex flex-col h-full bg-black rounded-2xl overflow-hidden shadow-2xl">
                      <iframe className="w-full aspect-video" src={`https://www.youtube.com/embed/${resourceData.videoId}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                      <div className="p-6 bg-white flex justify-between items-start">
                        <div><h4 className="font-bold text-xl text-[#002147] mb-1">{resourceData.title}</h4><p className="text-sm text-[#002147]/60">Curated video for this module.</p></div>
                        <button onClick={handleSuggestResource} disabled={isSuggested} className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold transition-all shrink-0 ml-4 ${isSuggested ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'}`}>
                          {isSuggested ? <CheckSquare className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                          <span>{isSuggested ? 'Suggested!' : 'Suggest to Students'}</span>
                        </button>
                      </div>
                    </div>
                  ) : activeResource.type === 'interactive' ? (
                    <div className="flex-1 bg-white border border-[#002147]/10 rounded-2xl shadow-sm p-6 w-full overflow-y-auto">
                      <div className="flex flex-col items-center">
                        {/* Center topic */}
                        <div className="bg-gradient-to-br from-[#002147] to-[#003d80] text-white font-extrabold px-10 py-4 rounded-2xl shadow-xl text-center text-lg mb-8 max-w-sm w-full">
                          {resourceData.center}
                        </div>
                        {/* Branch grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-3xl">
                          {resourceData.branches?.map((branch: any, bi: number) => (
                            <div key={bi} className={`rounded-2xl border-2 p-5 ${branch.color} transition-all hover:shadow-lg`}>
                              <h4 className="font-extrabold text-sm uppercase tracking-wider mb-3">{branch.label}</h4>
                              <ul className="space-y-2">
                                {branch.items.map((item: string, ii: number) => (
                                  <li key={ii} className="flex items-center space-x-2 text-sm font-medium">
                                    <span className="w-5 h-5 rounded-full bg-white/70 flex items-center justify-center text-xs font-bold shrink-0">{ii + 1}</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                        <p className="mt-6 text-xs text-[#002147]/30 font-medium">Interactive Concept Map · Click any card to explore</p>
                      </div>
                    </div>

                  ) : (
                    <div className="flex-1 bg-white border border-[#002147]/10 rounded-2xl shadow-sm p-8 max-w-3xl mx-auto w-full">
                      <h2 className="text-2xl font-extrabold text-[#002147] mb-6 border-b border-[#002147]/10 pb-4">{resourceData.title}</h2>
                      <div className="text-[#002147]/80 leading-relaxed font-medium whitespace-pre-line">{resourceData.content}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-red-500"><X className="w-12 h-12 mb-2" /><p className="font-bold">Failed to load resource.</p></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
