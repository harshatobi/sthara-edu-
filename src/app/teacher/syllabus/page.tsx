'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, Calendar, Plus, MoreVertical, X, BrainCircuit, Loader2, Sparkles, Target, FileText, Lightbulb, PlayCircle, FileCheck, Trash2, CheckSquare, Send } from 'lucide-react';
import Link from 'next/link';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';

// Intelligent Mock data generation for AI paths based on Topic
const generateMockAIPath = (topic: string) => ({
  overview: `This AI-designed curriculum path provides a comprehensive structure for teaching "${topic}". It combines foundational theory with real-world application, optimized for maximum student retention and engagement.`,
  milestones: [
    { title: "Phase 1: Conceptual Hook", description: `Begin by asking students how ${topic} impacts their daily lives. Avoid complex terminology in the first 20 minutes to build curiosity.` },
    { title: "Phase 2: Core Foundations", description: `Introduce the formal definitions of ${topic}. Have students pair up and explain the base mechanics to each other.` },
    { title: "Phase 3: Guided Practice", description: `Walk through 3 practical examples of ${topic} together on the board. Gradually release responsibility.` },
    { title: "Phase 4: Independent Mastery", description: `Assign a situational case study where students must apply ${topic} to solve a real-world problem.` }
  ],
  resources: [
    { id: 'res_1', title: `Interactive Concept Map: ${topic}`, type: "interactive" },
    { id: 'res_2', title: `Real-world Case Study: ${topic}`, type: "document" },
    { id: 'res_3', title: `Animated Explainer Video`, type: "video" }
  ],
  teacherNotes: `Common Pitfall: Students often confuse the terminology when first learning ${topic}. Analogy to use: Think of it like a library system—the index is the theory, but checking out the books is the application. Keep checking for understanding every 15 minutes.`
});

export default function TeacherSyllabus() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [months] = useState(['August', 'September', 'October', 'November', 'December']);
  const [syllabus, setSyllabus] = useState<{ [key: string]: any[] }>({
    'August': [], 'September': [], 'October': [], 'November': [], 'December': []
  });

  // UI States
  const [selectedModule, setSelectedModule] = useState<any | null>(null);
  const [isAddModuleOpen, setIsAddModuleOpen] = useState(false);
  const [targetMonth, setTargetMonth] = useState('October');
  const [newTopic, setNewTopic] = useState('');
  const [newWeeks, setNewWeeks] = useState('');
  
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddMonth, setQuickAddMonth] = useState('');
  const [quickAddPrompt, setQuickAddPrompt] = useState('');
  
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  // Resource Modal States
  const [activeResource, setActiveResource] = useState<any | null>(null);
  const [resourceData, setResourceData] = useState<any>(null);
  const [isResourceLoading, setIsResourceLoading] = useState(false);
  const [isSuggested, setIsSuggested] = useState(false);

  const handleSuggestResource = async () => {
    setIsSuggested(true);
    if (profile?.schoolId && activeResource) {
      try {
        await addDoc(collection(db, 'schools', profile.schoolId, 'notifications'), {
          type: 'resource_suggestion',
          message: `Your teacher suggested a resource: ${activeResource.title}`,
          targetAudience: 'students',
          createdAt: new Date().toISOString()
        });
      } catch (err) { console.error(err); }
    }
  };

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
      return;
    }

    // Load only THIS teacher's syllabus entries
    if (profile?.schoolId && profile?.uid) {
      const fetchSyllabus = async () => {
        try {
          const q = query(
            collection(db, 'schools', profile.schoolId, 'syllabus'),
            where('teacherId', '==', profile.uid)
          );
          const snap = await getDocs(q);
          const loaded: { [key: string]: any[] } = {
            'August': [], 'September': [], 'October': [], 'November': [], 'December': []
          };
          
          snap.forEach(doc => {
            const data = doc.data();
            if (loaded[data.month]) {
              loaded[data.month].push({ id: doc.id, ...data });
            }
          });
          setSyllabus(loaded);
        } catch (err) {
          console.error("Failed to load syllabus", err);
        }
      };
      fetchSyllabus();
    }
  }, [profile, loading, router]);

  const handleExport = () => {
    // Build a text summary of the entire syllabus for download
    let content = 'STHARA CURRICULUM PLANNER — FALL SEMESTER 2026\n';
    content += `Teacher: ${profile?.name || ''}  |  School: ${profile?.schoolId || ''}\n`;
    content += '='.repeat(60) + '\n\n';

    months.forEach(month => {
      const items = syllabus[month] || [];
      content += `📅 ${month.toUpperCase()}\n`;
      content += '-'.repeat(40) + '\n';
      if (items.length === 0) {
        content += '  (No modules planned)\n';
      } else {
        items.forEach((item, i) => {
          content += `  ${i + 1}. ${item.topic}\n`;
          content += `     Timeline : ${item.weeks}\n`;
          content += `     Status   : ${item.status}\n`;
          if (item.aiPath?.overview) {
            content += `     Overview : ${item.aiPath.overview.substring(0, 120)}...\n`;
          }
        });
      }
      content += '\n';
    });

    content += `\nExported on ${new Date().toLocaleDateString()} via Sthara School OS`;

    // Trigger file download — works on mobile and desktop
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sthara_Syllabus_${profile?.name?.replace(' ', '_') || 'Teacher'}_2026.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const simulateAIGeneration = async (callback: () => void) => {
    setIsAIGenerating(true);
    setLoadingText("Analyzing curriculum requirements...");
    await new Promise(r => setTimeout(r, 800));
    setLoadingText("Structuring milestones & objectives...");
    await new Promise(r => setTimeout(r, 800));
    setLoadingText("Generating teaching resources...");
    await new Promise(r => setTimeout(r, 800));
    setLoadingText("Finalizing AI path...");
    await new Promise(r => setTimeout(r, 400));
    setIsAIGenerating(false);
    callback();
  };

  const handleAddModuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic || !profile?.schoolId) return;
    
    await simulateAIGeneration(async () => {
      const newId = Date.now().toString();
      const newMod = {
        teacherId: profile.uid,
        month: targetMonth,
        topic: newTopic,
        weeks: newWeeks || 'Week 1',
        status: 'planned',
        aiPath: generateMockAIPath(newTopic)
      };
      
      await setDoc(doc(db, 'schools', profile.schoolId, 'syllabus', newId), newMod);
      
      setSyllabus(prev => ({
        ...prev,
        [targetMonth]: [...prev[targetMonth], { id: newId, ...newMod }]
      }));
      
      setIsAddModuleOpen(false);
      setNewTopic('');
      setNewWeeks('');
      setSelectedModule({ id: newId, ...newMod });
    });
  };

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddPrompt || !profile?.schoolId) return;

    await simulateAIGeneration(async () => {
      const derivedTopic = quickAddPrompt.length > 30 ? quickAddPrompt.substring(0, 30) + '...' : quickAddPrompt;
      const newId = Date.now().toString();
      const newMod = {
        teacherId: profile.uid,
        month: quickAddMonth,
        topic: derivedTopic,
        weeks: 'TBD',
        status: 'planned',
        aiPath: generateMockAIPath(quickAddPrompt)
      };
      
      await setDoc(doc(db, 'schools', profile.schoolId, 'syllabus', newId), newMod);
      
      setSyllabus(prev => ({
        ...prev,
        [quickAddMonth]: [...prev[quickAddMonth], { id: newId, ...newMod }]
      }));
      
      setIsQuickAddOpen(false);
      setQuickAddPrompt('');
      setSelectedModule({ id: newId, ...newMod });
    });
  };

  const markAsCompleted = async (mod: any) => {
    if (!profile?.schoolId) return;
    try {
      await updateDoc(doc(db, 'schools', profile.schoolId, 'syllabus', mod.id), { status: 'completed' });
      setSyllabus(prev => {
        const updated = { ...prev };
        const idx = updated[mod.month].findIndex(m => m.id === mod.id);
        if (idx !== -1) updated[mod.month][idx].status = 'completed';
        return updated;
      });
      setSelectedModule({ ...mod, status: 'completed' });
    } catch (err) {
      console.error(err);
    }
  };

  const deleteModule = async (mod: any) => {
    if (!profile?.schoolId) return;
    try {
      await deleteDoc(doc(db, 'schools', profile.schoolId, 'syllabus', mod.id));
      setSyllabus(prev => {
        const updated = { ...prev };
        updated[mod.month] = updated[mod.month].filter(m => m.id !== mod.id);
        return updated;
      });
      setSelectedModule(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResourceClick = async (resource: any, topic: string) => {
    setActiveResource(resource);
    setIsResourceLoading(true);
    setResourceData(null);
    setIsSuggested(false);

    if (resource.type === 'video') {
      try {
        const res = await fetch(`/api/youtube?q=${encodeURIComponent(topic + " educational concept explanation")}`);
        const data = await res.json();
        setResourceData(data.videos?.[0] || null);
      } catch (err) {
        console.error(err);
      }
    } else if (resource.type === 'document') {
      setTimeout(() => {
        setResourceData({ 
          title: `Real-World Case Study: ${topic}`,
          content: `In 2024, engineers applied the principles of ${topic} to solve a massive infrastructure challenge. By leveraging the foundational core concepts, they were able to reduce inefficiencies by 40%.\n\nDiscussion Question: How might this apply to our local community?`
        });
      }, 1500);
    } else if (resource.type === 'interactive') {
      setTimeout(() => {
        setResourceData({ 
          nodes: [topic, "Real World Applications", "Theoretical Fundamentals", "Historical Context"] 
        });
      }, 1000);
    }
    setIsResourceLoading(false);
  };

  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading Syllabus Planner...</div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-12 animate-in fade-in duration-700 font-sans">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden; }
          #printable-area, #printable-area * { visibility: visible; }
          #printable-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0;}
          .no-print { display: none !important; }
          /* OVERRIDE HORIZONTAL SCROLL FOR PRINT */
          .snap-x, .hide-scrollbar, .overflow-x-auto { display: block !important; overflow: visible !important; white-space: normal !important; height: auto !important; }
          .w-80 { width: 100% !important; margin-bottom: 30px !important; page-break-inside: avoid; }
          .h-[700px] { height: auto !important; max-height: none !important; }
          .bg-gray-50\\/50 { background: white !important; border: none !important; }
          .shadow-inner, .shadow-sm, .shadow-xl { box-shadow: none !important; border: 1px solid #ccc !important; }
        }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />

      {/* Premium Header */}
      <div className="bg-gradient-to-br from-[#002147] via-[#003366] to-[#001a33] text-white pt-12 pb-24 px-8 relative overflow-hidden shadow-xl no-print">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="absolute top-0 right-0 p-12 opacity-5">
          <BookOpen className="w-64 h-64 transform rotate-12" />
        </div>
        
        <div className="max-w-7xl mx-auto relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center space-x-5">
            <Link href="/teacher" className="p-3 bg-white/10 backdrop-blur-md rounded-full border border-white/20 hover:bg-white/20 transition-all hover:-translate-x-1 shadow-lg group">
              <ArrowLeft className="w-6 h-6 text-white group-hover:text-blue-200" />
            </Link>
            <div>
              <div className="inline-flex items-center space-x-2 bg-orange-500/20 text-orange-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 border border-orange-500/30">
                <Calendar className="w-3 h-3" />
                <span>Fall Semester 2026</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight flex items-center space-x-3">
                <span>Curriculum Planner</span>
              </h1>
              <p className="text-blue-200 mt-2 text-lg max-w-xl font-medium">
                Map out your semester timeline, track objectives, and orchestrate learning milestones.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button onClick={handleExport} className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-5 py-3 rounded-xl font-bold flex items-center space-x-2 hover:bg-white/20 transition-all shadow-lg">
              <span>Export</span>
            </button>
            <button onClick={() => setIsAddModuleOpen(true)} className="bg-gradient-to-r from-orange-400 to-orange-500 text-white px-6 py-3 rounded-xl font-bold flex items-center space-x-2 hover:from-orange-500 hover:to-orange-600 transition-all shadow-lg hover:shadow-orange-500/25 hover:-translate-y-0.5">
              <Plus className="w-5 h-5" />
              <span>Add Module</span>
            </button>
          </div>
        </div>
      </div>

      {/* Kanban Board Container */}
      <div id="printable-area" className="max-w-7xl mx-auto px-4 sm:px-8 -mt-16 relative z-20">
        <div className="flex overflow-x-auto pb-8 space-x-6 snap-x hide-scrollbar">
          {months.map((month, idx) => (
            <div key={month} className="snap-start shrink-0 w-80 flex flex-col h-[700px]">
              {/* Column Header */}
              <div className="bg-white rounded-t-2xl p-4 shadow-sm border-b-4 border-[#002147] flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg border border-blue-100 shadow-inner">
                    {idx + 8}
                  </div>
                  <h2 className="font-extrabold text-[#002147] text-xl tracking-tight">{month}</h2>
                </div>
                <div className="bg-gray-100 text-gray-500 text-xs font-bold px-2 py-1 rounded-md no-print">
                  {syllabus[month]?.length || 0} items
                </div>
              </div>

              {/* Column Body */}
              <div className="flex-1 bg-gray-50/50 rounded-b-2xl p-3 border border-gray-200 border-t-0 shadow-inner overflow-y-auto space-y-4">
                {syllabus[month]?.length === 0 ? (
                  <div className="h-full border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 space-y-2 bg-white/50 no-print">
                    <Calendar className="w-8 h-8 opacity-20" />
                    <span className="text-sm font-medium">Drop modules here</span>
                  </div>
                ) : (
                  syllabus[month]?.map((item: any) => (
                    <div 
                      key={item.id} 
                      onClick={() => setSelectedModule(item)}
                      className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group relative overflow-hidden page-break-inside-avoid"
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                        item.status === 'completed' ? 'bg-emerald-400' :
                        item.status === 'in-progress' ? 'bg-blue-400' :
                        'bg-gray-300'
                      }`} />

                      <div className="flex justify-between items-start mb-3 ml-2">
                        <span className={`text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full ${
                          item.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                          item.status === 'in-progress' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                          'bg-gray-100 text-gray-500 border border-gray-200'
                        }`}>
                          {item.status.replace('-', ' ')}
                        </span>
                        <div className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded flex items-center no-print">
                          <Sparkles className="w-3 h-3 mr-1" /> AI Path
                        </div>
                      </div>
                      
                      <h3 className="font-bold text-[#002147] text-base leading-tight mb-3 ml-2 group-hover:text-blue-600 transition-colors">{item.topic}</h3>
                      
                      <div className="flex items-center justify-between mt-auto ml-2">
                        <div className="flex items-center space-x-1.5 text-gray-500 text-xs font-medium bg-gray-50 px-2 py-1 rounded-md">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>{item.weeks}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                
                <button 
                  onClick={() => { setQuickAddMonth(month); setIsQuickAddOpen(true); }}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm font-bold text-gray-400 hover:bg-white hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center space-x-2 mt-4 shadow-sm group no-print"
                >
                  <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span>Quick Add AI</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------- MODALS ---------------- */}

      {/* Detailed AI Path Modal */}
      {selectedModule && !activeResource && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex justify-end animate-in fade-in no-print">
          <div className="bg-white w-full max-w-3xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="bg-gradient-to-r from-[#002147] to-[#003366] p-8 text-white shrink-0 relative overflow-hidden">
              <div className="absolute right-0 top-0 opacity-10">
                <BrainCircuit className="w-64 h-64 -mt-10 -mr-10" />
              </div>
              <button onClick={() => setSelectedModule(null)} className="absolute top-6 right-6 text-white/50 hover:text-white bg-white/10 p-2 rounded-full backdrop-blur-md transition-colors">
                <X className="w-6 h-6" />
              </button>
              
              <div className="inline-flex items-center space-x-2 bg-blue-500/20 text-blue-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border border-blue-400/30">
                <Sparkles className="w-3 h-3" />
                <span>AI Generated Curriculum Path</span>
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight leading-tight max-w-xl">{selectedModule.topic}</h2>
              <div className="flex items-center space-x-4 mt-4 text-blue-200 font-medium text-sm">
                <div className="flex items-center"><Calendar className="w-4 h-4 mr-1"/> {selectedModule.weeks}</div>
                <div className="flex items-center"><Target className="w-4 h-4 mr-1"/> {selectedModule.status.toUpperCase()}</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-[#f8fafc]">
              <div className="max-w-2xl mx-auto space-y-10">
                <section>
                  <h3 className="text-lg font-bold text-[#002147] flex items-center border-b border-[#002147]/10 pb-2 mb-4">
                    <FileText className="w-5 h-5 mr-2 text-blue-600" /> Executive Overview
                  </h3>
                  <p className="text-[#002147]/70 leading-relaxed font-medium bg-white p-5 rounded-2xl shadow-sm border border-[#002147]/5">
                    {selectedModule.aiPath?.overview}
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-[#002147] flex items-center border-b border-[#002147]/10 pb-2 mb-4">
                    <Target className="w-5 h-5 mr-2 text-orange-500" /> Step-by-Step Milestones
                  </h3>
                  <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-blue-200 before:to-indigo-200">
                    {selectedModule.aiPath?.milestones?.map((m: any, i: number) => (
                      <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-blue-500 text-white font-bold shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                          {i + 1}
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-5 rounded-2xl shadow-sm border border-[#002147]/10 hover:shadow-md transition-shadow">
                          <h4 className="font-bold text-[#002147] text-lg mb-2">{m.title}</h4>
                          <p className="text-sm text-[#002147]/60 font-medium leading-relaxed">{m.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-[#002147] flex items-center border-b border-[#002147]/10 pb-2 mb-4">
                    <Lightbulb className="w-5 h-5 mr-2 text-yellow-500" /> AI Teaching Strategy
                  </h3>
                  <div className="bg-gradient-to-br from-yellow-50 to-orange-50 p-6 rounded-2xl border border-yellow-200 shadow-sm relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 opacity-10"><Lightbulb className="w-24 h-24 text-yellow-600" /></div>
                    <p className="text-yellow-900 font-medium leading-relaxed relative z-10">
                      {selectedModule.aiPath?.teacherNotes}
                    </p>
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-[#002147] flex items-center border-b border-[#002147]/10 pb-2 mb-4">
                    <BookOpen className="w-5 h-5 mr-2 text-indigo-500" /> Generated Resources
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedModule.aiPath?.resources?.map((res: any, i: number) => (
                      <div 
                        key={i} 
                        onClick={() => handleResourceClick(res, selectedModule.topic)}
                        className="bg-white p-4 rounded-xl border border-[#002147]/10 flex items-start space-x-3 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          {res.type === 'video' ? <PlayCircle className="w-5 h-5" /> : <FileCheck className="w-5 h-5" />}
                        </div>
                        <div>
                          <h4 className="font-bold text-[#002147] text-sm leading-tight mb-1">{res.title}</h4>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">{res.type}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

              </div>
            </div>
            
            <div className="bg-white p-6 border-t border-[#002147]/10 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-4">
                {selectedModule.status !== 'completed' ? (
                  <button onClick={() => markAsCompleted(selectedModule)} className="flex items-center space-x-2 text-green-600 font-bold text-sm bg-green-50 px-4 py-2 rounded-xl border border-green-200 hover:bg-green-100 transition-colors">
                    <CheckSquare className="w-4 h-4" />
                    <span>Mark as Completed</span>
                  </button>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span className="text-green-600 font-bold text-sm bg-green-50 px-4 py-2 rounded-xl border border-green-200 flex items-center space-x-1">
                      <CheckSquare className="w-4 h-4" /> <span>Completed</span>
                    </span>
                    <button onClick={() => deleteModule(selectedModule)} className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-200" title="Delete Task">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedModule(null)} className="bg-[#002147] hover:bg-[#003366] text-white px-8 py-3 rounded-xl font-bold shadow-md transition-colors">
                Done Reviewing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resource Viewer Modal */}
      {activeResource && (
        <div className="fixed inset-0 bg-[#002147]/80 backdrop-blur-md z-[120] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="bg-gradient-to-r from-[#002147] to-[#003366] p-6 flex justify-between items-center text-white shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  {activeResource.type === 'video' ? <PlayCircle className="w-6 h-6 text-white" /> : <FileCheck className="w-6 h-6 text-white" />}
                </div>
                <div>
                  <h3 className="text-xl font-bold">{activeResource.title}</h3>
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-300">{activeResource.type} Resource Viewer</span>
                </div>
              </div>
              <button onClick={() => setActiveResource(null)} className="text-white/50 hover:text-white transition-colors bg-white/10 p-2 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 bg-[#f8fafc] flex flex-col relative">
              {isResourceLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="w-12 h-12 text-[#002147] animate-spin" />
                  <p className="text-[#002147]/60 font-bold animate-pulse">
                    {activeResource.type === 'video' ? "Searching Web for Best Educational Video..." : 
                     activeResource.type === 'document' ? "Generating Real-World Case Study..." : 
                     "Designing Interactive Concept Map..."}
                  </p>
                </div>
              ) : resourceData ? (
                <div className="flex-1 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {activeResource.type === 'video' ? (
                    <div className="flex flex-col h-full bg-black rounded-2xl overflow-hidden shadow-2xl">
                      <iframe 
                        className="w-full aspect-video"
                        src={`https://www.youtube.com/embed/${resourceData.videoId}`} 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen
                      ></iframe>
                      <div className="p-6 bg-white flex-1 flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-xl text-[#002147] mb-2">{resourceData.title}</h4>
                          <p className="text-sm text-[#002147]/60 line-clamp-2">Animated explainer video curated specifically for this module.</p>
                        </div>
                        <button 
                          onClick={handleSuggestResource}
                          disabled={isSuggested}
                          className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold transition-all shrink-0 ml-4 ${isSuggested ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 shadow-sm hover:-translate-y-0.5'}`}
                        >
                          {isSuggested ? <CheckSquare className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                          <span>{isSuggested ? 'Suggested to Class!' : 'Suggest to Students'}</span>
                        </button>
                      </div>
                    </div>
                  ) : activeResource.type === 'interactive' ? (
                    <div className="flex-1 bg-white border border-[#002147]/10 rounded-2xl shadow-sm p-8 flex flex-col items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-30"></div>
                      <div className="relative z-10 w-full max-w-lg">
                        <div className="bg-blue-600 text-white font-bold p-4 rounded-xl text-center shadow-lg mb-8 transform hover:scale-105 transition-transform">{resourceData.nodes[0]}</div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="bg-orange-50 text-orange-700 font-bold p-4 rounded-xl text-center border border-orange-200 text-sm">{resourceData.nodes[1]}</div>
                          <div className="bg-green-50 text-green-700 font-bold p-4 rounded-xl text-center border border-green-200 text-sm">{resourceData.nodes[2]}</div>
                          <div className="bg-purple-50 text-purple-700 font-bold p-4 rounded-xl text-center border border-purple-200 text-sm">{resourceData.nodes[3]}</div>
                        </div>
                      </div>
                      <p className="mt-12 text-sm text-[#002147]/40 font-medium italic relative z-10">Interactive diagram features simulated for this demonstration.</p>
                    </div>
                  ) : (
                    <div className="flex-1 bg-white border border-[#002147]/10 rounded-2xl shadow-sm p-8 max-w-3xl mx-auto w-full">
                      <h2 className="text-2xl font-extrabold text-[#002147] mb-6 border-b border-[#002147]/10 pb-4">{resourceData.title}</h2>
                      <div className="prose prose-blue max-w-none text-[#002147]/80 leading-relaxed font-medium whitespace-pre-line">
                        {resourceData.content}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-red-500">
                  <X className="w-12 h-12 mb-2" />
                  <p className="font-bold">Failed to load resource.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Other Modals (Add / Quick Add) remain identical but are included below */}
      {isAddModuleOpen && (
        <div className="fixed inset-0 bg-[#002147]/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
            {isAIGenerating ? (
              <div className="p-12 flex flex-col items-center justify-center text-center space-y-6 bg-gradient-to-b from-[#f8fafc] to-white">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-400 blur-xl opacity-20 rounded-full animate-pulse"></div>
                  <BrainCircuit className="w-20 h-20 text-blue-600 relative z-10 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-2xl font-extrabold text-[#002147] mb-2">AI Architect Working</h3>
                  <p className="text-blue-600 font-medium animate-pulse">{loadingText}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-gradient-to-r from-[#002147] to-[#003366] p-6 flex justify-between items-center text-white">
                  <div>
                    <h3 className="text-xl font-bold flex items-center"><Sparkles className="w-5 h-5 mr-2 text-orange-400"/> Create New Module</h3>
                    <p className="text-blue-200 text-sm mt-1">Provide requirements for AI curriculum generation</p>
                  </div>
                  <button onClick={() => setIsAddModuleOpen(false)} className="text-white/50 hover:text-white transition-colors bg-white/10 p-2 rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleAddModuleSubmit} className="p-6 space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-[#002147] mb-2">Target Month</label>
                    <select value={targetMonth} onChange={e => setTargetMonth(e.target.value)} className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20 font-medium">
                      {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[#002147] mb-2">Core Topic / Module Name</label>
                    <input autoFocus required type="text" value={newTopic} onChange={e => setNewTopic(e.target.value)} placeholder="e.g. Cellular Respiration" className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20 font-medium" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[#002147] mb-2">Estimated Timeline</label>
                    <input type="text" value={newWeeks} onChange={e => setNewWeeks(e.target.value)} placeholder="e.g. Weeks 1-2" className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-[#002147]/20 font-medium" />
                  </div>
                  <div className="pt-2">
                    <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-xl font-bold hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center space-x-2 text-lg">
                      <BrainCircuit className="w-5 h-5" />
                      <span>Generate AI Syllabus Path</span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {isQuickAddOpen && (
        <div className="fixed inset-0 bg-[#002147]/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
            {isAIGenerating ? (
              <div className="p-12 flex flex-col items-center justify-center text-center space-y-6 bg-gradient-to-b from-[#f8fafc] to-white">
                <div className="relative">
                  <div className="absolute inset-0 bg-orange-400 blur-xl opacity-20 rounded-full animate-pulse"></div>
                  <BrainCircuit className="w-20 h-20 text-orange-500 relative z-10 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-2xl font-extrabold text-[#002147] mb-2">Drafting Quick Plan</h3>
                  <p className="text-orange-600 font-medium animate-pulse">{loadingText}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-[#f8fafc] border-b border-[#002147]/10 p-6 flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-bold text-[#002147] flex items-center">⚡ Quick Add to {quickAddMonth}</h3>
                  </div>
                  <button onClick={() => setIsQuickAddOpen(false)} className="text-[#002147]/40 hover:text-red-500 transition-colors p-2 bg-white rounded-full shadow-sm border border-[#002147]/5">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleQuickAddSubmit} className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-[#002147] mb-2">What do you want to teach?</label>
                    <textarea 
                      autoFocus required 
                      rows={4}
                      value={quickAddPrompt} 
                      onChange={e => setQuickAddPrompt(e.target.value)} 
                      placeholder="Type a rough idea like: 'I need to teach basic fractions to 4th graders and include a fun pop quiz at the end.'" 
                      className="w-full bg-white border border-[#002147]/20 rounded-xl px-4 py-3 text-[#002147] focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-medium shadow-inner" 
                    />
                  </div>
                  <button type="submit" className="w-full bg-[#002147] text-white py-3.5 rounded-xl font-bold hover:bg-[#002147]/90 transition-colors flex items-center justify-center space-x-2">
                    <Sparkles className="w-4 h-4 text-orange-400" />
                    <span>Generate Task & Plan</span>
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
