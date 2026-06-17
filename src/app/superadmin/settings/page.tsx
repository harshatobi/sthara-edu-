'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Settings, Save, Server, Globe, Shield } from 'lucide-react';

export default function PlatformSettings() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }, 1000);
  };

  if (loading || !profile) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-[#002147]">Platform Settings</h1>
          <p className="text-[#002147]/60 mt-1">Configure global Sthara OS parameters.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#002147]/10 overflow-hidden">
        <form onSubmit={handleSave} className="p-8 space-y-8">
          
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-[#002147] flex items-center space-x-2 border-b border-[#002147]/10 pb-2">
              <Globe className="w-5 h-5 text-blue-500" />
              <span>General Settings</span>
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-[#002147]/70 mb-2">Platform Name</label>
                <input type="text" defaultValue="Sthara School OS" className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:ring-2 focus:ring-[#002147]/20 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#002147]/70 mb-2">Support Email</label>
                <input type="email" defaultValue="support@sthara.com" className="w-full bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:ring-2 focus:ring-[#002147]/20 outline-none" />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-xl font-bold text-[#002147] flex items-center space-x-2 border-b border-[#002147]/10 pb-2">
              <Server className="w-5 h-5 text-purple-500" />
              <span>AI Integration</span>
            </h2>
            
            <div>
              <label className="block text-sm font-semibold text-[#002147]/70 mb-2">Default LLM Model</label>
              <select className="w-full md:w-1/2 bg-[#f8fafc] border border-[#002147]/10 rounded-xl px-4 py-3 text-[#002147] focus:ring-2 focus:ring-[#002147]/20 outline-none">
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast)</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro (Advanced reasoning)</option>
              </select>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-xl font-bold text-[#002147] flex items-center space-x-2 border-b border-[#002147]/10 pb-2">
              <Shield className="w-5 h-5 text-green-500" />
              <span>Security & Access</span>
            </h2>
            
            <div className="flex items-center space-x-3">
              <input type="checkbox" id="mfa" className="w-5 h-5 rounded border-[#002147]/20 text-[#002147] focus:ring-[#002147]" />
              <label htmlFor="mfa" className="text-sm font-medium text-[#002147]">Require MFA for Super Admins</label>
            </div>
            <div className="flex items-center space-x-3">
              <input type="checkbox" id="proctoring" defaultChecked className="w-5 h-5 rounded border-[#002147]/20 text-[#002147] focus:ring-[#002147]" />
              <label htmlFor="proctoring" className="text-sm font-medium text-[#002147]">Enable aggressive browser proctoring globally</label>
            </div>
          </div>

          <div className="pt-6 border-t border-[#002147]/10 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#002147] text-white px-8 py-3 rounded-xl font-bold hover:bg-[#002147]/90 transition-colors disabled:opacity-50 flex items-center space-x-2 shadow-sm"
            >
              {saving ? (
                <span>Saving...</span>
              ) : success ? (
                <span>Settings Saved!</span>
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
