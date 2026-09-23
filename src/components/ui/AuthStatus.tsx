'use client';

import { useAuth } from '@/contexts/AuthContext';

export default function AuthStatus() {
  const { error, signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-6">
      <div className="max-w-md text-center space-y-4" role={error ? 'alert' : 'status'}>
        <h1 className="text-xl font-semibold text-[#002147]">{error ? 'Unable to load your workspace' : 'Loading your workspace…'}</h1>
        {error ? <>
          <p className="text-sm text-slate-600">{error}</p>
          <button className="rounded-xl bg-[#002147] px-5 py-3 text-white" onClick={() => window.location.reload()}>Try again</button>
          <button className="ml-3 rounded-xl border px-5 py-3" onClick={() => void signOut()}>Sign out</button>
        </> : <p className="text-sm text-slate-600">Checking your account and school access.</p>}
      </div>
    </div>
  );
}
