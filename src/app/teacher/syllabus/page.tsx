'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, X, Loader2, Trash2, Send,
  Library, CheckCircle2, Sparkles, AlertCircle,
  BookOpen, ChevronRight, Map, Lightbulb, Target,
} from 'lucide-react';

import Link from 'next/link';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import { lookupCurriculum, type CurriculumChapter } from '@/lib/curriculumDb';

const MONTHS = ['June','July','August','September','October','November','December','January','February','March','April','May'];

const PUBLISHERS = [
  { value: 'NCERT',        label: 'NCERT',                    color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'CBSE Generic', label: 'CBSE (Generic)',           color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { value: 'ICSE',         label: 'ICSE / ISC',               color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'State Board',  label: 'State Board / OU',         color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'SSC',          label: 'SSC (Maharashtra)',        color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { value: 'IGCSE',        label: 'Cambridge IGCSE',          color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'IB',           label: 'IB (International)',       color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { value: 'Custom',       label: 'Custom / School-specific', color: 'bg-gray-100 text-gray-700 border-gray-300' },
];

function publisherStyle(val: string) {
  return PUBLISHERS.find(p => p.value === val)?.color ?? 'bg-gray-100 text-gray-600 border-gray-200';
}

interface LearningPath {
  overview: string;
  milestones: { title: string; description: string }[];
  resources: { id: string; title: string; type: string }[];
  teacherNotes: string;
}

export default function SyllabusPlanner() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [syllabus, setSyllabus] = useState<{ [key: string]: any[] }>({});
  const [selectedMonth, setSelectedMonth] = useState('June');

  // ── Add Topic Modal ───────────────────────────────────────────────────────
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTopic, setNewTopic]         = useState('');
  const [newSubject, setNewSubject]     = useState('');
  const [newObjectives, setNewObjectives] = useState('');
  const [newClass, setNewClass]         = useState('');
  const [newPublisher, setNewPublisher] = useState('NCERT');
  const [isAdding, setIsAdding]         = useState(false);
  const [addError, setAddError]         = useState('');
  const [addSuccess, setAddSuccess]     = useState(false);

  // ── Auto-syllabus state ───────────────────────────────────────────────────
  const [autoPreview, setAutoPreview]   = useState<CurriculumChapter[] | null>(null);
  const [autoDesc, setAutoDesc]         = useState('');
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const [autoLoadDone, setAutoLoadDone] = useState(false);

  // ── Filter state ─────────────────────────────────────────────────────────
  const [filterPublisher, setFilterPublisher] = useState<string>('All');
  const [filterSubject,   setFilterSubject]   = useState<string>('All');

  // ── Learning Path Panel ───────────────────────────────────────────────────
  const [selectedChapter, setSelectedChapter] = useState<any | null>(null);
  const [learningPath, setLearningPath]       = useState<LearningPath | null>(null);
  const [isLoadingPath, setIsLoadingPath]     = useState(false);
  const [pathError, setPathError]             = useState('');

  const teacherSubjects = [...new Set(
    ((profile?.assignments || []) as any[]).map((a: any) => a.subject).filter(Boolean)
  )] as string[];

  const teacherClasses = [...new Set(
    ((profile?.assignments || []) as any[]).map((a: any) => a.class).filter(Boolean)
  )] as string[];

  // ── Load syllabus from DB ─────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'teacher')) {
      router.push('/login');
      return;
    }
    if (profile?.schoolId && profile?.uid) {
      const fetchSyllabus = async () => {
        try {
          const authToken = await getAuthToken();
          const res = await fetch(
            `/api/teacher/syllabus?schoolId=${profile.schoolId}&teacherId=${profile.uid}`,
            { headers: { Authorization: `Bearer ${authToken}` } }
          );
          const data = await res.json();

          // Deduplicate by ID before setting state
          const seen = new Set<string>();
          const uniqueModules = (data.modules || []).filter((mod: any) => {
            if (seen.has(mod.id)) return false;
            seen.add(mod.id);
            return true;
          });

          const loaded: { [key: string]: any[] } = Object.fromEntries(MONTHS.map(m => [m, []]));
          uniqueModules.forEach((mod: any) => {
            if (loaded[mod.month] !== undefined) loaded[mod.month].push(mod);
          });
          setSyllabus(loaded);
        } catch (err) {
          console.error('[syllabus load]', err);
        }
      };
      fetchSyllabus();
    }
  }, [profile, loading, router]);

  // Pre-fill subject/class
  useEffect(() => {
    if (teacherSubjects.length > 0 && !newSubject) setNewSubject(teacherSubjects[0]);
    if (teacherClasses.length  > 0 && !newClass)   setNewClass(teacherClasses[0]);
  }, [teacherSubjects, teacherClasses]);

  // ── Auto-preview ──────────────────────────────────────────────────────────
  useEffect(() => {
    setAutoPreview(null);
    setAutoDesc('');
    setAutoLoadDone(false);
    if (!newPublisher || !newSubject || !newClass) return;
    const entry = lookupCurriculum(newPublisher, newSubject, newClass);
    if (entry) {
      setAutoPreview(entry.chapters);
      setAutoDesc(entry.description);
    }
  }, [newPublisher, newSubject, newClass]);

  // ── Auto-load: bulk insert with server-side dedup ─────────────────────────
  const handleAutoLoad = async () => {
    if (!autoPreview || !profile?.schoolId || !profile?.uid) return;
    setIsAutoLoading(true);
    try {
      const authToken = await getAuthToken();
      const newMods: any[] = [];
      for (const ch of autoPreview) {
        const res = await fetch('/api/teacher/syllabus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            schoolId:   profile.schoolId,
            teacherId:  profile.uid,
            month:      ch.month,
            topic:      ch.topic,
            subject:    newSubject,
            objectives: ch.objectives,
            grade:      newClass,
            publisher:  newPublisher,
            unitId:     ch.unitId,
          }),
        });
        const data = await res.json();
        if (res.ok && data.id) {
          // Only add to local state if it's NOT a duplicate already in our state
          newMods.push({
            id:         data.id,
            month:      ch.month,
            topic:      ch.topic,
            subject:    newSubject,
            objectives: ch.objectives,
            grade:      newClass,
            publisher:  newPublisher,
            unitId:     ch.unitId,
          });
        }
      }

      // Merge into state — de-duplicate by ID to prevent visual doubles
      setSyllabus(prev => {
        const next = { ...prev };
        const existingIds = new Set(
          Object.values(next).flat().map((m: any) => m.id)
        );
        newMods.forEach(mod => {
          if (!existingIds.has(mod.id) && next[mod.month] !== undefined) {
            next[mod.month] = [...next[mod.month], mod];
            existingIds.add(mod.id);
          }
        });
        return next;
      });

      setAutoLoadDone(true);
    } catch (err: any) {
      alert('Auto-load failed: ' + err.message);
    } finally {
      setIsAutoLoading(false);
    }
  };

  // ── Delete a module ───────────────────────────────────────────────────────
  const handleDeleteModule = async (modId: string) => {
    if (!confirm('Are you sure you want to delete this syllabus topic?')) return;
    try {
      const authToken = await getAuthToken();
      const res = await fetch('/api/teacher/syllabus', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ schoolId: profile!.schoolId, id: modId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setSyllabus(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(m => { next[m] = next[m].filter(mod => mod.id !== modId); });
        return next;
      });
      if (selectedChapter?.id === modId) setSelectedChapter(null);
    } catch (e: any) {
      alert('Delete failed: ' + e.message);
    }
  };

  // ── Add a single topic ────────────────────────────────────────────────────
  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic.trim() || !profile?.schoolId) return;
    setIsAdding(true);
    setAddError('');
    setAddSuccess(false);
    try {
      const authToken = await getAuthToken();
      const res = await fetch('/api/teacher/syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          schoolId:   profile.schoolId,
          teacherId:  profile.uid,
          month:      selectedMonth,
          topic:      newTopic.trim(),
          subject:    newSubject.trim(),
          objectives: newObjectives.trim(),
          grade:      newClass.trim(),
          publisher:  newPublisher,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add topic');

      const newMod = {
        id: data.id || Date.now().toString(),
        month: selectedMonth,
        topic: newTopic.trim(),
        subject: newSubject.trim(),
        objectives: newObjectives.trim(),
        grade: newClass.trim(),
        publisher: newPublisher,
      };

      // Only add if ID not already present (dedup)
      setSyllabus(prev => {
        const existing = (prev[selectedMonth] || []).some((m: any) => m.id === newMod.id);
        if (existing) return prev;
        return { ...prev, [selectedMonth]: [...(prev[selectedMonth] || []), newMod] };
      });
      setAddSuccess(true);
      setNewTopic('');
      setNewObjectives('');
      setTimeout(() => { setIsAddModalOpen(false); setAddSuccess(false); }, 1200);
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  // ── Open Learning Path Panel ──────────────────────────────────────────────
  const openLearningPath = async (mod: any) => {
    setSelectedChapter(mod);
    setLearningPath(null);
    setPathError('');
    setIsLoadingPath(true);
    try {
      const res = await fetch('/api/teacher/curriculum-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic:      mod.topic,
          subject:    mod.subject,
          grade:      mod.grade || mod.class,
          objectives: mod.objectives,
          month:      mod.month,
          publisher:  mod.publisher,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate learning path');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLearningPath(data);
    } catch (err: any) {
      setPathError(err.message || 'Failed to generate learning path');
    } finally {
      setIsLoadingPath(false);
    }
  };

  // ── Computed values ───────────────────────────────────────────────────────
  const monthTopics    = syllabus[selectedMonth] || [];
  const visibleTopics  = monthTopics.filter(mod => {
    const pubMatch = filterPublisher === 'All' || (mod.publisher || 'NCERT') === filterPublisher;
    const subMatch = filterSubject   === 'All' || mod.subject === filterSubject;
    return pubMatch && subMatch;
  });
  const allSubjectsInMonth = [...new Set(monthTopics.map((m: any) => m.subject).filter(Boolean))];
  const totalTopics = Object.values(syllabus).reduce((acc, arr) => acc + arr.length, 0);

  if (loading || !profile) return (
    <div className="p-10 text-[#002147] text-center font-medium">Loading Syllabus Planner…</div>
  );

  const resourceIcon = (type: string) => {
    if (type === 'video')       return '🎥';
    if (type === 'interactive') return '🧩';
    if (type === 'document')    return '📄';
    return '📚';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-4">
          <Link href="/teacher" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-[#002147]">Syllabus &amp; Lesson Planner</h1>
            <p className="text-gray-500 text-sm mt-1">
              {totalTopics} topic{totalTopics !== 1 ? 's' : ''} planned across the year
            </p>
          </div>
        </div>
        <button
          onClick={() => { setIsAddModalOpen(true); setAddError(''); setAddSuccess(false); }}
          className="flex items-center gap-2 px-5 py-3 bg-[#002147] hover:bg-[#003b80] text-white font-bold rounded-2xl shadow-md text-sm transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> Add Topic
        </button>
      </div>

      {/* Month Tabs */}
      <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
        {MONTHS.map(month => (
          <button
            key={month}
            onClick={() => setSelectedMonth(month)}
            className={`px-5 py-2.5 rounded-2xl font-bold text-sm transition-all whitespace-nowrap ${
              selectedMonth === month
                ? 'bg-[#002147] text-white shadow-md'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {month} <span className="opacity-60">({(syllabus[month] || []).length})</span>
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Filter:</span>
        <select
          value={filterPublisher}
          onChange={e => setFilterPublisher(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="All">All Publishers</option>
          {PUBLISHERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select
          value={filterSubject}
          onChange={e => setFilterSubject(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="All">All Subjects</option>
          {allSubjectsInMonth.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(filterPublisher !== 'All' || filterSubject !== 'All') && (
          <button onClick={() => { setFilterPublisher('All'); setFilterSubject('All'); }} className="text-xs text-rose-500 font-bold hover:underline">
            Clear
          </button>
        )}
      </div>

      {/* Two-column layout when learning path is open */}
      <div className={`flex gap-6 ${selectedChapter ? 'items-start' : ''}`}>

        {/* Topics Grid */}
        <div className={`bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4 transition-all ${selectedChapter ? 'flex-1 min-w-0' : 'w-full'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[#002147]">
              {selectedMonth} Topics
              {visibleTopics.length !== monthTopics.length && (
                <span className="ml-2 text-sm text-indigo-600 font-semibold">
                  ({visibleTopics.length} of {monthTopics.length} shown)
                </span>
              )}
            </h2>
            <button
              onClick={() => { setIsAddModalOpen(true); setAddError(''); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Add to {selectedMonth}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleTopics.map(mod => (
              <div
                key={mod.id}
                className={`p-5 bg-gray-50 border rounded-2xl space-y-2.5 relative group hover:border-indigo-200 transition-colors cursor-pointer ${
                  selectedChapter?.id === mod.id ? 'border-indigo-400 bg-indigo-50/40' : 'border-gray-200'
                }`}
                onClick={() => openLearningPath(mod)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md uppercase border border-blue-100">
                    {mod.subject || 'Subject'}
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${publisherStyle(mod.publisher || 'NCERT')}`}>
                    <Library className="w-3 h-3 inline-block mr-1 -mt-px" />
                    {mod.publisher || 'NCERT'}
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#002147]">{mod.topic}</h3>
                {mod.objectives && <p className="text-xs text-gray-500 leading-relaxed">{mod.objectives}</p>}
                <div className="flex items-center justify-between pt-1 text-xs text-gray-400">
                  <span>Class: {mod.grade || mod.class || 'All'}</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-indigo-500 font-bold">
                      <BookOpen className="w-3.5 h-3.5" /> Learning Path
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteModule(mod.id); }}
                      className="text-rose-500 hover:underline flex items-center gap-1 font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {visibleTopics.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-400">
                {monthTopics.length === 0 ? (
                  <>
                    <p>No syllabus topics planned for {selectedMonth}.</p>
                    <button
                      onClick={() => setIsAddModalOpen(true)}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#002147] text-white rounded-xl text-sm font-bold hover:bg-[#003b80] transition-all"
                    >
                      <Plus className="w-4 h-4" /> Add First Topic
                    </button>
                  </>
                ) : (
                  <p>No topics match the current filters.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Learning Path Slide-Over Panel ─────────────────────────────────── */}
        {selectedChapter && (
          <div className="w-96 shrink-0 bg-white rounded-3xl border border-indigo-200 shadow-lg overflow-hidden animate-in slide-in-from-right duration-300">
            {/* Panel header */}
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white relative">
              <button
                onClick={() => { setSelectedChapter(null); setLearningPath(null); }}
                className="absolute top-4 right-4 p-1.5 bg-white/20 hover:bg-white/30 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-3">
                <Map className="w-5 h-5 opacity-80" />
                <span className="text-xs font-bold uppercase tracking-wider opacity-80">AI Learning Path</span>
              </div>
              <h3 className="text-lg font-black leading-tight">{selectedChapter.topic}</h3>
              <p className="text-sm opacity-70 mt-1">{selectedChapter.subject} · Class {selectedChapter.grade || selectedChapter.class}</p>
            </div>

            <div className="overflow-y-auto max-h-[70vh] p-6 space-y-6">
              {isLoadingPath && (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
                    <Sparkles className="w-5 h-5 text-indigo-600 absolute inset-0 m-auto" />
                  </div>
                  <p className="text-sm text-gray-500 font-medium">Generating learning path…</p>
                  <p className="text-xs text-gray-400">This takes 5–10 seconds</p>
                </div>
              )}

              {pathError && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-700">Failed to generate</p>
                    <p className="text-xs text-red-600 mt-1">{pathError}</p>
                    <button
                      onClick={() => openLearningPath(selectedChapter)}
                      className="mt-2 text-xs font-bold text-red-600 hover:underline"
                    >
                      Try again →
                    </button>
                  </div>
                </div>
              )}

              {learningPath && !isLoadingPath && (
                <>
                  {/* Overview */}
                  <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-black text-indigo-700 uppercase tracking-wider">Overview</span>
                    </div>
                    <p className="text-sm text-indigo-900 leading-relaxed">{learningPath.overview}</p>
                  </div>

                  {/* Milestones / Teaching Phases */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-gray-600" />
                      <span className="text-xs font-black text-gray-700 uppercase tracking-wider">Teaching Phases</span>
                    </div>
                    {learningPath.milestones.map((ms, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                            {i + 1}
                          </div>
                          {i < learningPath.milestones.length - 1 && (
                            <div className="w-0.5 flex-1 bg-indigo-100 mt-1.5 mb-0" />
                          )}
                        </div>
                        <div className="pb-4 flex-1">
                          <p className="text-sm font-bold text-[#002147]">{ms.title}</p>
                          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{ms.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Resources */}
                  {learningPath.resources && learningPath.resources.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-black text-gray-700 uppercase tracking-wider">Resources</span>
                      {learningPath.resources.map(res => (
                        <div key={res.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <span className="text-base">{resourceIcon(res.type)}</span>
                          <span className="text-xs text-gray-700 font-medium">{res.title}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-400 ml-auto shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Teacher Notes */}
                  {learningPath.teacherNotes && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                      <p className="text-xs font-black text-amber-700 uppercase tracking-wider mb-2">📌 Teacher Notes</p>
                      <p className="text-xs text-amber-900 leading-relaxed">{learningPath.teacherNotes}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Add Topic / Auto-Load Modal ──────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#002147]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            
            {/* Modal header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-[#f8fafc] rounded-t-2xl shrink-0">
              <div>
                <h3 className="text-xl font-bold text-[#002147]">Add Syllabus Topics</h3>
                <p className="text-sm text-gray-500 mt-1">Auto-load from curriculum database or add a single topic manually</p>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 rounded-full border border-gray-200 hover:bg-gray-100 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">

              {/* ── STEP 1: Select Publisher / Board ── */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  <Library className="w-3.5 h-3.5 inline-block mr-1 -mt-px" />
                  Step 1 — Select Board / Publisher
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PUBLISHERS.map(pub => (
                    <button
                      key={pub.value}
                      type="button"
                      onClick={() => setNewPublisher(pub.value)}
                      className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all text-left ${
                        newPublisher === pub.value
                          ? `${pub.color} border-2 shadow-sm scale-[1.02]`
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {pub.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── STEP 2: Subject + Class ── */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Step 2 — Subject</label>
                  <select
                    value={newSubject}
                    onChange={e => setNewSubject(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {teacherSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                    <option value="">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Class / Year</label>
                  <select
                    value={newClass}
                    onChange={e => setNewClass(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {teacherClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="">All</option>
                  </select>
                </div>
              </div>

              {/* ── AUTO-SYLLABUS PANEL ── */}
              {autoPreview && autoPreview.length > 0 && (
                <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 overflow-hidden">
                  {/* Banner */}
                  <div className="flex items-center justify-between p-4 bg-indigo-100 border-b border-indigo-200">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-indigo-600" />
                      <div>
                        <p className="font-black text-indigo-800 text-sm">✅ Curriculum Found!</p>
                        <p className="text-xs text-indigo-600 mt-0.5">{autoDesc}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold bg-indigo-200 text-indigo-800 px-2.5 py-1 rounded-full">
                      {autoPreview.length} chapters
                    </span>
                  </div>

                  {/* Preview */}
                  <div className="p-4 space-y-2 max-h-52 overflow-y-auto">
                    {autoPreview.map((ch, i) => (
                      <div key={i} className="flex items-start gap-3 p-2.5 bg-white rounded-xl border border-indigo-100">
                        <span className="shrink-0 mt-0.5 text-[10px] font-black bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md">
                          {ch.unitId.replace('unit_', 'U')} · {ch.month.slice(0,3)}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-[#002147]">{ch.topic}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed line-clamp-1">{ch.objectives}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Load button */}
                  <div className="p-4 border-t border-indigo-200">
                    {autoLoadDone ? (
                      <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                        <CheckCircle2 className="w-5 h-5" />
                        All {autoPreview.length} chapters loaded into your syllabus!
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleAutoLoad}
                        disabled={isAutoLoading}
                        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-sm transition-all shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        {isAutoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {isAutoLoading ? 'Loading syllabus…' : `Auto-Load All ${autoPreview.length} Chapters into My Syllabus`}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* No match notice */}
              {newPublisher && newSubject && newClass && !autoPreview && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-800">No built-in curriculum found</p>
                    <p className="text-xs text-amber-700 mt-1">
                      No preset chapters for <strong>{newSubject}</strong> ({newPublisher}, Class {newClass}). Use the manual form below.
                    </p>
                  </div>
                </div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Or add a single topic manually</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Manual form */}
              <form onSubmit={handleAddTopic} className="space-y-4">
                {addError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">{addError}</div>
                )}
                {addSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Topic added successfully!
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">
                    Topic / Chapter Name * <span className="text-gray-400 font-normal text-xs">(adding to <strong>{selectedMonth}</strong>)</span>
                  </label>
                  <input
                    value={newTopic}
                    onChange={e => setNewTopic(e.target.value)}
                    placeholder="e.g. Issue of Shares, Quadratic Equations…"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Learning Objectives <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea
                    rows={2}
                    value={newObjectives}
                    onChange={e => setNewObjectives(e.target.value)}
                    placeholder="Students will be able to…"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isAdding || !newTopic.trim()}
                  className="w-full py-3.5 bg-[#002147] hover:bg-[#003b80] text-white font-bold rounded-xl text-sm transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {isAdding ? 'Adding…' : 'Add to Syllabus'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
