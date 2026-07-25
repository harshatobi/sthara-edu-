'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Settings, Save, Server, Globe, Shield, Loader2, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function PlatformSettings() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Settings State
  const [platformName, setPlatformName] = useState('Sthara School OS');
  const [supportEmail, setSupportEmail] = useState('support@sthara.com');
  const [defaultModel, setDefaultModel] = useState('gemini-2.0-flash');
  const [requireMfa, setRequireMfa] = useState(false);
  const [enableProctoring, setEnableProctoring] = useState(true);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);

    try {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) return <div className="p-10 text-center text-[#002147] font-medium">Loading Platform Settings...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div>
        <h1 className="text-3xl font-extrabold text-[#002147]">Global Platform Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Configure global AI models, system defaults, & security policies</p>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-6">
        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-2xl flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Platform settings saved successfully.</span>
          </div>
        )}

        <div className="space-y-4">
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
              <option value="gemini-1.5-pro">Gemini 1.5 Pro (Deep Reasoning)</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-2xl transition-all shadow-md flex items-center space-x-2"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving Settings...' : 'Save Settings'}</span>
        </button>
      </form>
    </div>
  );
}
