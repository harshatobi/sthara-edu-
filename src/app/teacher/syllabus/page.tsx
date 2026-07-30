'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, X, Loader2, Trash2, Send,
  BookOpen, Library, CheckCircle2
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';

const MONTHS = ['June','July','August','September','October','November','December','January','February','March','April','May'];

// ── Publisher / Board options ────────────────────────────────────────────────
const PUBLISHERS = [
  { value: 'NCERT',          label: 'NCERT',                     color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'CBSE Generic',   label: 'CBSE (Generic)',            color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { value: 'ICSE',           label: 'ICSE / ISC',                color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'State Board',    label: 'State Board',               color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'SSC',            label: 'SSC (Maharashtra)',         color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { value: 'IGCSE',          label: 'Cambridge IGCSE',           color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'IB',             label: 'IB (International)',        color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { value: 'S. Chand',       label: 'S. Chand',                  color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { value: 'RD Sharma',      label: 'RD Sharma',                 color: 'bg-teal-50 text-teal-700 border-teal-200' },
  { value: 'Lakhmir Singh',  label: 'Lakhmir Singh',             color: 'bg-sky-50 text-sky-700 border-sky-200' },
  { value: 'Custom',         label: 'Custom / School-specific',  color: 'bg-gray-100 text-gray-700 border-gray-300' },
];

function publisherStyle(val: string) {
  return PUBLISHERS.find(p => p.value === val)?.color ?? 'bg-gray-100 text-gray-600 border-gray-200';
}

export default function SyllabusPlanner() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [syllabus, setSyllabus] = useState<{ [key: string]: any[] }>({});
  const [selectedMonth, setSelectedMonth] = useState('June');

  // Add Topic Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newObjectives, setNewObjectives] = useState('');
  const [newClass, setNewClass] = useState('');
  const [newPublisher, setNewPublisher] = useState('NCERT');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState(false);

  // Filter state
  const [filterPublisher, setFilterPublisher] = useState<string>('All');
  const [filterSubject, setFilterSubject] = useState<string>('All');

  const teacherSubjects = [...new Set(
    ((profile?.assignments || []) as any[]).map((a: any) => a.subject).filter(Boolean)
  )] as string[];

  const teacherClasses = [...new Set(
    ((profile?.assignments || []) as any[]).map((a: any) => a.class).filter(Boolean)
  )] as string[];

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
          const loaded: { [key: string]: any[] } = Object.fromEntries(MONTHS.map(m => [m, []]));
          
          (data.modules || []).forEach((mod: any) => {
            if (loaded[mod.month] !== undefined) {
              loaded[mod.month].push(mod);
            }
          });
          setSyllabus(loaded);
        } catch (err) {
          console.error('[syllabus load]', err);
        }
      };

      fetchSyllabus();
    }
  }, [profile, loading, router]);

  // Pre-fill subject/class from teacher assignments
  useEffect(() => {
    if (teacherSubjects.length > 0 && !newSubject) setNewSubject(teacherSubjects[0]);
    if (teacherClasses.length > 0 && !newClass) setNewClass(teacherClasses[0]);
  }, [teacherSubjects, teacherClasses]);

  const handleDeleteModule = async (modId: string) => {
    if (!confirm('Are you sure you want to delete this syllabus topic?')) return;
    try {
      const authToken = await getAuthToken();
      const res = await fetch('/api/teacher/syllabus', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ schoolId: profile!.schoolId, id: modId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');

      setSyllabus(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(m => {
          next[m] = next[m].filter(mod => mod.id !== modId);
        });
        return next;
      });
    } catch (e: any) {
      alert('Delete failed: ' + e.message);
    }
  };

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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          schoolId: profile.schoolId,
          teacherId: profile.uid,
          month: selectedMonth,
          topic: newTopic.trim(),
          subject: newSubject.trim(),
          objectives: newObjectives.trim(),
          grade: newClass.trim(),
          publisher: newPublisher,
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

      setSyllabus(prev => ({
        ...prev,
        [selectedMonth]: [...(prev[selectedMonth] || []), newMod],
      }));

      setAddSuccess(true);
      setNewTopic('');
      setNewObjectives('');
      setTimeout(() => {
        setIsAddModalOpen(false);
        setAddSuccess(false);
      }, 1200);
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  // ── Filtering ──────────────────────────────────────────────────────────────
  const monthTopics = syllabus[selectedMonth] || [];
  const visibleTopics = monthTopics.filter(mod => {
    const pubMatch = filterPublisher === 'All' || (mod.publisher || 'NCERT') === filterPublisher;
    const subMatch = filterSubject === 'All' || mod.subject === filterSubject;
    return pubMatch && subMatch;
  });

  const allSubjectsInMonth = [...new Set(monthTopics.map((m: any) => m.subject).filter(Boolean))];
  const totalTopics = Object.values(syllabus).reduce((acc, arr) => acc + arr.length, 0);

  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading Syllabus Planner...</div>;

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
          <Plus className="w-4 h-4" />
          Add Topic
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

        {/* Publisher filter */}
        <select
          value={filterPublisher}
          onChange={e => setFilterPublisher(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="All">All Publishers</option>
          {PUBLISHERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>

        {/* Subject filter */}
        <select
          value={filterSubject}
          onChange={e => setFilterSubject(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="All">All Subjects</option>
          {allSubjectsInMonth.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {(filterPublisher !== 'All' || filterSubject !== 'All') && (
          <button
            onClick={() => { setFilterPublisher('All'); setFilterSubject('All'); }}
            className="text-xs text-rose-500 font-bold hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Topics Grid */}
      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4">
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
            <div key={mod.id} className="p-5 bg-gray-50 border border-gray-200 rounded-2xl space-y-2.5 relative group hover:border-indigo-200 transition-colors">
              {/* Subject + Publisher badges */}
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
                <button
                  onClick={() => handleDeleteModule(mod.id)}
                  className="text-rose-500 hover:underline flex items-center gap-1 font-bold"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
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

      {/* Add Topic Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#002147]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-[#f8fafc] rounded-t-2xl">
              <div>
                <h3 className="text-xl font-bold text-[#002147]">Add Syllabus Topic</h3>
                <p className="text-sm text-gray-500 mt-1">Adding to <strong>{selectedMonth}</strong></p>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 rounded-full border border-gray-200 hover:bg-gray-100 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTopic} className="p-6 space-y-4">
              {addError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">{addError}</div>
              )}
              {addSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Topic added successfully!
                </div>
              )}

              {/* Topic Name */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Topic / Chapter Name *</label>
                <input
                  required
                  value={newTopic}
                  onChange={e => setNewTopic(e.target.value)}
                  placeholder="e.g. Quadratic Equations, Photosynthesis..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Publisher / Board */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  <Library className="w-3.5 h-3.5 inline-block mr-1 -mt-px" />
                  Publisher / Board / Curriculum
                </label>
                <div className="grid grid-cols-3 gap-2">
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

              {/* Subject + Class */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Subject</label>
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
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Class</label>
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

              {/* Learning Objectives */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Learning Objectives <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  rows={3}
                  value={newObjectives}
                  onChange={e => setNewObjectives(e.target.value)}
                  placeholder="e.g. Students will understand how to solve quadratic equations using factorization..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isAdding || !newTopic.trim()}
                className="w-full py-3.5 bg-[#002147] hover:bg-[#003b80] text-white font-bold rounded-xl text-sm transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isAdding ? 'Adding Topic...' : 'Add to Syllabus'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
