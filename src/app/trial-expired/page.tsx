'use client';

import Link from 'next/link';
import { AlertTriangle, Mail, ArrowRight, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function TrialExpiredPage() {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001233] via-[#002147] to-[#003580] flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-10 text-center">

        {/* Icon */}
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-amber-200">
          <AlertTriangle className="w-10 h-10 text-amber-500" />
        </div>

        <h1 className="text-3xl font-black text-[#002147] mb-2">Trial Period Ended</h1>
        <p className="text-gray-500 font-medium mb-8">
          Your 30-day free trial has expired.
          {profile?.name && <> Hi <strong>{profile.name}</strong>,</>} to continue using Sthara,
          please upgrade to a paid plan.
        </p>

        {/* What you keep */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-8 text-left space-y-2">
          <p className="text-sm font-bold text-[#002147] mb-3">✅ Your data is safe</p>
          {[
            'All student records and grades preserved',
            'All assignments and submissions intact',
            'Data held for 60 days after trial ends',
          ].map(item => (
            <div key={item} className="flex items-center space-x-2.5 text-sm text-gray-600 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="bg-[#002147] text-white rounded-2xl p-6 mb-6">
          <div className="text-xs font-black uppercase tracking-widest text-white/50 mb-2">School Plan</div>
          <div className="text-4xl font-black mb-1">₹4,999<span className="text-xl font-semibold text-white/60">/month</span></div>
          <div className="text-white/60 text-sm font-medium mb-4">Unlimited teachers · Unlimited students · All AI features</div>
          <a
            href={`mailto:sales@sthara.in?subject=Subscription Inquiry - ${profile?.name || 'School'}&body=Hi Sthara team,%0A%0AI'd like to upgrade from the trial plan.%0A%0ASchool name: %0AContact person: ${profile?.name || ''}%0AEmail: ${profile?.email || ''}%0A%0APlease send me payment details.`}
            className="flex items-center justify-center space-x-2 w-full py-3 bg-white text-[#002147] rounded-xl font-bold hover:bg-gray-100 transition-colors"
          >
            <Mail className="w-4 h-4" />
            <span>Contact Sales to Upgrade</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        <p className="text-xs text-gray-400 mb-6">
          We'll respond within 24 hours with payment options including UPI, NEFT, and credit card.
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
