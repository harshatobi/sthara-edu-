'use client';

import { AlertTriangle, Mail, ArrowRight, CheckCircle, ShieldCheck, PauseCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PLAN_INFO } from '@/lib/settings/registry';

export default function TrialExpiredPage() {
  const { profile, signOut } = useAuth();

  // Suspended by Sthara (operator console): nothing to buy here, the school office talks to us.
  if (profile?.schoolSuspended) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#001233] via-[#002147] to-[#003580] flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 sm:p-10 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-slate-200">
            <PauseCircle className="w-10 h-10 text-slate-500" />
          </div>
          <h1 className="text-3xl font-black text-[#002147] mb-2">Account paused</h1>
          <p className="text-gray-500 font-medium mb-8">
            {profile?.name && <>Hi <strong>{profile.name}</strong>. </>}
            Your school&apos;s Sthara account is suspended, so sign-in is paused for everyone at your school. Your school office can tell you more.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-8 text-left">
            <p className="text-sm font-bold text-[#002147] mb-2 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600" /> Your data is safe</p>
            <p className="text-sm text-gray-600 font-medium">Records, grades and submissions are kept as they are. Nothing is deleted while an account is paused.</p>
          </div>
          <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-700 transition-colors underline">Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001233] via-[#002147] to-[#003580] flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-10 text-center">

        {/* Icon */}
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-amber-200">
          <AlertTriangle className="w-10 h-10 text-amber-500" />
        </div>

        <h1 className="text-3xl font-black text-[#002147] mb-2">Your pilot has ended</h1>
        <p className="text-gray-500 font-medium mb-8">
          {profile?.name && <>Hi <strong>{profile.name}</strong>. </>}
          Your school&apos;s Sthara pilot has finished. To continue, your school moves to an annual plan, and everything paid for the pilot is credited to it.
        </p>

        {/* What you keep */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-8 text-left space-y-2">
          <p className="text-sm font-bold text-[#002147] mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600" /> Your data is safe</p>
          {[
            'All student records and grades preserved',
            'All assignments and submissions intact',
            'Data held for 60 days after the pilot ends',
          ].map(item => (
            <div key={item} className="flex items-center space-x-2.5 text-sm text-gray-600 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="bg-[#002147] text-white rounded-2xl p-6 mb-6">
          <div className="text-xs font-black uppercase tracking-widest text-white/50 mb-3">Annual plans, per student per year</div>
          <div className="space-y-2 mb-3 text-left">
            {(['aadhara', 'sthamba', 'shikhara'] as const).map(p => (
              <div key={p} className="flex items-baseline justify-between">
                <span className="font-bold">{PLAN_INFO[p].label}</span>
                <span className="text-lg font-black">₹{PLAN_INFO[p].price!.toLocaleString('en-IN')}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between">
              <span className="font-bold">{PLAN_INFO.mandala.label}</span>
              <span className="text-sm font-semibold text-white/70">School groups and trusts</span>
            </div>
          </div>
          <div className="text-white/60 text-sm font-medium mb-4">Your pilot payment is credited in full to the annual plan.</div>
          <a
            href={`mailto:sales@sthara.in?subject=Continuing after our Sthara pilot - ${profile?.name || 'School'}&body=Hi Sthara team,%0A%0AOur pilot has ended and we'd like to continue on an annual plan.%0A%0ASchool name: %0AContact person: ${profile?.name || ''}%0AEmail: ${profile?.email || ''}%0A%0APlease send me payment details.`}
            className="flex items-center justify-center space-x-2 w-full py-3 bg-white text-[#002147] rounded-xl font-bold hover:bg-gray-100 transition-colors"
          >
            <Mail className="w-4 h-4" />
            <span>Talk to us about continuing</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        <p className="text-xs text-gray-400 mb-6">
          We&apos;ll respond within 24 hours with payment options including UPI, NEFT, and credit card.
        </p>

        <button
          onClick={signOut}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors underline"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
