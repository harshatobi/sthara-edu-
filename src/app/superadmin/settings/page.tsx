'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Settings, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function PlatformSettings() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Settings State
  const [platformName, setPlatformName] = useState('Sthara School OS');
  const [supportEmail, setSupportEmail] = useState('support@sthara.com');
  const [defaultModel, setDefaultModel] = useState('gemini-2.0-flash');
  const [requireMfa, setRequireMfa] = useState(false);
  const [enableProctoring, setEnableProctoring] = useState(true);
  const [maxStudentsPerSchool, setMaxStudentsPerSchool] = useState('500');
  const [defaultPasswordPolicy, setDefaultPasswordPolicy] = useState('Sthara@123');

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  // Load settings from Supabase on mount
  useEffect(() => {
    if (!profile?.schoolId) return;

    const loadSettings = async () => {
      setFetching(true);
      try {
        const { data, error: fetchErr } = await supabase
          .from('platform_settings')
          .select('*')
          .limit(1)
          .maybeSingle();

        if (fetchErr) throw fetchErr;

        if (data) {
          setPlatformName(data.platform_name || 'Sthara School OS');
          setSupportEmail(data.support_email || 'support@sthara.com');
          setDefaultModel(data.default_ai_model || 'gemini-2.0-flash');
          setRequireMfa(data.require_mfa || false);
          setEnableProctoring(data.enable_proctoring !== false);
          setMaxStudentsPerSchool(String(data.max_students_per_school || 500));
          setDefaultPasswordPolicy(data.default_password || 'Sthara@123');
        }
      } catch (err: any) {
        console.warn('[settings] Load failed (table may not exist yet):', err.message);
        // Settings table may not exist yet — that's OK, defaults will be used
      } finally {
        setFetching(false);
      }
    };

    loadSettings();
  }, [profile?.schoolId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError('');

    try {
      const settingsData = {
        platform_name: platformName,
        support_email: supportEmail,
        default_ai_model: defaultModel,
        require_mfa: requireMfa,
        enable_proctoring: enableProctoring,
        max_students_per_school: parseInt(maxStudentsPerSchool) || 500,
        default_password: defaultPasswordPolicy,
        updated_at: new Date().toISOString(),
        updated_by: profile?.id,
      };

      // Upsert platform settings (single row)
      const { error: saveErr } = await supabase
        .from('platform_settings')
        .upsert({ id: 1, ...settingsData }, { onConflict: 'id' });

      if (saveErr) {
        // If the table doesn't exist, show a friendly message but don't crash
        if (saveErr.code === '42P01') {
          console.warn('platform_settings table not found. Run the migration to create it.');
          setError('DB table not found. Settings displayed but not persisted. Run Supabase migration to enable persistence.');
        } else {
          throw saveErr;
        }
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Platform Settings...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div>
        <h1 className="text-3xl font-extrabold text-[#002147]">Global Platform Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Configure global AI models, system defaults, &amp; security policies</p>
      </div>

      {fetching ? (
        <div className="flex items-center gap-3 p-8 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading current settings...
        </div>
      ) : (
        <form onSubmit={handleSave} className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
          {success && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-2xl flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>Platform settings saved successfully to database.</span>
            </div>
          )}
          {error && (
            <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-2xl">
              ⚠️ {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Platform Name</label>
              <input
                type="text"
                value={platformName}
                onChange={e => setPlatformName(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Support Email</label>
              <input
                type="email"
                value={supportEmail}
                onChange={e => setSupportEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Default AI Engine Model</label>
              <select
                value={defaultModel}
                onChange={e => setDefaultModel(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              >
                <option value="gemini-2.0-flash">Gemini 2.0 Flash (Fast & Accurate)</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep Reasoning)</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Legacy)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Max Students per School</label>
              <input
                type="number"
                value={maxStudentsPerSchool}
                onChange={e => setMaxStudentsPerSchool(e.target.value)}
                min="1"
                max="10000"
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Default User Password</label>
              <input
                type="text"
                value={defaultPasswordPolicy}
                onChange={e => setDefaultPasswordPolicy(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">Password used when creating new school admin accounts</p>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Security &amp; Features</h3>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-200">
              <div>
                <div className="font-bold text-sm text-[#002147]">AI-Powered Proctoring</div>
                <div className="text-xs text-gray-500">Monitor student activity during online exams</div>
              </div>
              <button
                type="button"
                onClick={() => setEnableProctoring(p => !p)}
                className={`relative w-12 h-6 rounded-full transition-colors ${enableProctoring ? 'bg-indigo-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${enableProctoring ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-200">
              <div>
                <div className="font-bold text-sm text-[#002147]">Require MFA for Admins</div>
                <div className="text-xs text-gray-500">Force multi-factor authentication on admin accounts</div>
              </div>
              <button
                type="button"
                onClick={() => setRequireMfa(m => !m)}
                className={`relative w-12 h-6 rounded-full transition-colors ${requireMfa ? 'bg-indigo-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${requireMfa ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-2xl transition-all shadow-md flex items-center space-x-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? 'Saving Settings...' : 'Save Settings'}</span>
          </button>
        </form>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-xs text-gray-500">
        <strong>Note:</strong> To enable full settings persistence, run this SQL in your Supabase SQL editor:<br/>
        <code className="font-mono bg-gray-100 px-2 py-1 rounded mt-1 inline-block">
          {`CREATE TABLE IF NOT EXISTS platform_settings (id int PRIMARY KEY DEFAULT 1, platform_name text, support_email text, default_ai_model text, require_mfa boolean DEFAULT false, enable_proctoring boolean DEFAULT true, max_students_per_school int DEFAULT 500, default_password text, updated_at timestamptz, updated_by uuid);`}
        </code>
      </div>
    </div>
  );
}
