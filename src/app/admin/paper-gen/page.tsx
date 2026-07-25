'use client';

import { useState, useEffect } from 'react';
import { Settings, FileText, CheckCircle2, Loader2, Save, Sparkles, BookOpen } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function PaperGenPage() {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [generatedData, setGeneratedData] = useState<any>(null);
  const [error, setError] = useState('');
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (profile && profile.role !== 'admin') router.push('/login');
  }, [profile, router]);

  const [sectionClass, setSectionClass] = useState('Class 10-A');
  const [subject, setSubject] = useState('Mathematics');
  const [difficulty, setDifficulty] = useState('CBSE Standard');

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Generate a 5-question exam paper for ${sectionClass} ${subject} with difficulty ${difficulty}. Format strictly as JSON with "title" and "questions" array.`,
        }),
      });
      const data = await res.json();
      setGeneratedData(data);
    } catch (err: any) {
      setError(err.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveAssignment = async () => {
    if (!profile?.schoolId || !generatedData) return;
    setSaving(true);
    try {
      const { error: insertErr } = await supabase.from('assignments').insert({
        school_id: profile.schoolId,
        teacher_id: profile.uid,
        title: `${subject} Question Paper — ${sectionClass}`,
        type: 'exam',
        class: sectionClass,
        subject: subject,
        questions: generatedData.questions || [],
      });

      if (insertErr) throw insertErr;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Question Paper Generator...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div>
        <h1 className="text-3xl font-extrabold text-[#002147]">AI Question Paper Generator</h1>
        <p className="text-gray-500 text-sm mt-1">Formulate CBSE & State Board aligned exam papers</p>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
        {saveSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-2xl flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Question Paper saved & assigned to class!</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Class / Section</label>
            <input
              type="text"
              value={sectionClass}
              onChange={e => setSectionClass(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm transition-all shadow-md flex items-center space-x-2"
        >
          <Sparkles className="w-4 h-4" />
          <span>{generating ? 'Generating Question Paper...' : 'Generate AI Question Paper'}</span>
        </button>

        {generatedData && (
          <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200 space-y-4">
            <h3 className="font-bold text-base text-[#002147]">Generated Question Paper Preview</h3>
            <pre className="text-xs bg-white p-4 rounded-xl border border-gray-200 overflow-x-auto">
              {JSON.stringify(generatedData, null, 2)}
            </pre>
            <button
              onClick={handleSaveAssignment}
              disabled={saving}
              className="px-6 py-3 bg-[#002147] hover:bg-blue-900 text-white rounded-2xl font-bold text-sm transition-all shadow-md flex items-center space-x-2"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Publishing to Class...' : 'Publish to Class'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
