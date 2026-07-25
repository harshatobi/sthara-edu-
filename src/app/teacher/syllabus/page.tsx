'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, X, Loader2, Trash2, Send } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';

const MONTHS = ['June','July','August','September','October','November','December','January','February','March','April','May'];

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
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');

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

    if (profile?.schoolId && profile?.id) {
      const fetchSyllabus = async () => {
        try {
          const authToken = await getAuthToken();
          const res = await fetch(
            `/api/teacher/syllabus?schoolId=${profile.schoolId}&teacherId=${profile.id}`,
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
      const { error } = await supabase.from('syllabus').delete().eq('id', modId);
      if (error) throw error;

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
          teacherId: profile.id,
          month: selectedMonth,
          topic: newTopic.trim(),
          subject: newSubject.trim(),
          objectives: newObjectives.trim(),
          grade: newClass.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add topic');

      // Optimistically update local state
      const newMod = {
        id: data.id || Date.now().toString(),
        month: selectedMonth,
        topic: newTopic.trim(),
        subject: newSubject.trim(),
        objectives: newObjectives.trim(),
        grade: newClass.trim(),
      };

      setSyllabus(prev => ({
        ...prev,
        [selectedMonth]: [...(prev[selectedMonth] || []), newMod],
      }));

      // Reset form
      setNewTopic('');
      setNewObjectives('');
      setIsAddModalOpen(false);
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-[#002147] text-center font-medium">Loading Syllabus Planner...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/teacher" className="p-2 bg-white rounded-full border border-gray-200 hover:bg-gray-50 text-[#002147]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-[#002147]">Syllabus & Lesson Planner</h1>
            <p className="text-gray-500 text-sm mt-1">Plan, schedule, and track monthly curriculum topics</p>
          </div>
        </div>

        {/* ✅ Add Topic button */}
        <button
          onClick={() => { setIsAddModalOpen(true); setAddError(''); }}
          className="flex items-center gap-2 px-5 py-3 bg-[#002147] hover:bg-[#003b80] text-white font-bold rounded-2xl shadow-md text-sm transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Add Topic
        </button>
      </div>

      {/* Month selector */}
      <div className="flex space-x-2 overflow-x-auto pb-2">
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
            {month} ({(syllabus[month] || []).length})
          </button>
        ))}
      </div>

      {/* Topics List */}
      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[#002147]">{selectedMonth} Topics</h2>
          <button
            onClick={() => { setIsAddModalOpen(true); setAddError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Add to {selectedMonth}
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(syllabus[selectedMonth] || []).map(mod => (
            <div key={mod.id} className="p-5 bg-gray-50 border border-gray-200 rounded-2xl space-y-2 relative group">
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md uppercase">{mod.subject || 'Subject'}</span>
              <h3 className="text-lg font-bold text-[#002147]">{mod.topic}</h3>
              {mod.objectives && <p className="text-xs text-gray-600">{mod.objectives}</p>}
              <div className="flex items-center justify-between pt-2 text-xs text-gray-400">
                <span>Class: {mod.grade || mod.class || 'All'}</span>
                <button onClick={() => handleDeleteModule(mod.id)} className="text-rose-500 hover:underline flex items-center gap-1 font-bold">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}

          {(syllabus[selectedMonth] || []).length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-400">
              <p>No syllabus topics planned for {selectedMonth}.</p>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#002147] text-white rounded-xl text-sm font-bold hover:bg-[#003b80] transition-all"
              >
                <Plus className="w-4 h-4" /> Add First Topic
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ✅ Add Topic Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#002147]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-[#f8fafc]">
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

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Topic / Chapter Name *</label>
                <input
                  required
                  value={newTopic}
                  onChange={e => setNewTopic(e.target.value)}
                  placeholder="e.g. Quadratic Equations"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

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

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Learning Objectives (optional)</label>
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
