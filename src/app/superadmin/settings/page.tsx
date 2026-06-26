'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Settings, Save, Server, Globe, Shield, Loader2, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function PlatformSettings() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Settings State
  const [platformName, setPlatformName] = useState('Sthara School OS');
  const [supportEmail, setSupportEmail] = useState('support@sthara.com');
  const [defaultModel, setDefaultModel] = useState('gemini-2.5-flash');
  const [requireMfa, setRequireMfa] = useState(false);
  const [enableProctoring, setEnableProctoring] = useState(true);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'platform', 'settings');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setPlatformName(data.platformName || 'Sthara School OS');
          setSupportEmail(data.supportEmail || 'support@sthara.com');
          setDefaultModel(data.defaultModel || 'gemini-2.5-flash');
          setRequireMfa(data.requireMfa || false);
          setEnableProctoring(data.enableProctoring !== undefined ? data.enableProctoring : true);
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setFetching(false);
      }
    };

    if (profile?.role === 'superadmin') {
      fetchSettings();
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);

    try {
      const docRef = doc(db, 'platform', 'settings');
      await setDoc(docRef, {
        platformName,
        supportEmail,
        defaultModel,
        requireMfa,
        enableProctoring,
        updatedAt: new Date()
      }, { merge: true });
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading || fetching || !profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#002147]">Platform Settings</h1>
          <p className="text-gray-500 mt-1 font-medium">Configure global Sthara OS parameters and integration defaults.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-200/60 overflow-hidden">
        <form onSubmit={handleSave} className="p-8 md:p-10 space-y-10">
          
          <div className="space-y-6">
            <h2 className="text-xl font-black text-[#002147] flex items-center space-x-3 border-b border-gray-100 pb-4">
              <div className="p-2 bg-blue-50 rounded-xl">
                <Globe className="w-5 h-5 text-blue-600" />
              </div>
              <span>General Settings</span>
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Platform Name</label>
                <input 
                  type="text" 
                  required
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm" 
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Support Email</label>
                <input 
                  type="email" 
                  required
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm" 
                />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-xl font-black text-[#002147] flex items-center space-x-3 border-b border-gray-100 pb-4">
              <div className="p-2 bg-purple-50 rounded-xl">
                <Server className="w-5 h-5 text-purple-600" />
              </div>
              <span>AI Integration</span>
            </h2>
            
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Default LLM Model</label>
              <select 
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="w-full md:w-2/3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-[#002147] font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm cursor-pointer"
              >
                <optgroup label="Google (Default)">
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast & Efficient)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro (Advanced Reasoning)</option>
                </optgroup>
                <optgroup label="OpenAI">
                  <option value="gpt-4o">GPT-4o (High Performance)</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Cost Effective)</option>
                </optgroup>
                <optgroup label="Anthropic">
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (Balanced)</option>
                  <option value="claude-3-opus">Claude 3 Opus (Complex Tasks)</option>
                  <option value="claude-3-haiku">Claude 3 Haiku (Lightning Fast)</option>
                </optgroup>
                <optgroup label="Open Source / Other">
                  <option value="llama-3-70b">Llama 3 70B (Meta)</option>
                  <option value="mistral-large">Mistral Large 2</option>
                </optgroup>
              </select>
              <p className="text-xs font-medium text-gray-400 mt-2">
                This model will be used globally. To ensure high availability and prevent rate limits under heavy load, the system will automatically fallback to similar models across providers if the primary model fails.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-xl font-black text-[#002147] flex items-center space-x-3 border-b border-gray-100 pb-4">
              <div className="p-2 bg-emerald-50 rounded-xl">
                <Shield className="w-5 h-5 text-emerald-600" />
              </div>
              <span>Security & Access</span>
            </h2>
            
            <div className="space-y-4">
              <div 
                className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-200 cursor-pointer hover:bg-indigo-50/50 transition-colors"
                onClick={() => setRequireMfa(!requireMfa)}
              >
                <div>
                  <h4 className="font-bold text-[#002147]">Require MFA for Super Admins</h4>
                  <p className="text-xs text-gray-500 font-medium mt-1">Enforce multi-factor authentication for all platform owners.</p>
                </div>
                <div className={`w-12 h-6 rounded-full transition-colors relative shadow-inner flex items-center ${requireMfa ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-md absolute transition-transform ${requireMfa ? 'translate-x-6' : 'translate-x-1'}`}></div>
                </div>
              </div>

              <div 
                className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-200 cursor-pointer hover:bg-indigo-50/50 transition-colors"
                onClick={() => setEnableProctoring(!enableProctoring)}
              >
                <div>
                  <h4 className="font-bold text-[#002147]">Global Browser Proctoring</h4>
                  <p className="text-xs text-gray-500 font-medium mt-1">Aggressively monitor tab-switching and external tools during student exams.</p>
                </div>
                <div className={`w-12 h-6 rounded-full transition-colors relative shadow-inner flex items-center ${enableProctoring ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-md absolute transition-transform ${enableProctoring ? 'translate-x-6' : 'translate-x-1'}`}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-100 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-gradient-to-r from-[#002147] to-indigo-900 text-white px-8 py-3.5 rounded-xl font-black hover:shadow-lg hover:shadow-indigo-900/20 transition-all disabled:opacity-50 disabled:hover:shadow-none flex items-center space-x-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : success ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Settings Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>Save Configuration</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
