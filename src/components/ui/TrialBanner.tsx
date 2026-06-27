'use client';

import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, X, Mail } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

/**
 * Shows a dismissible warning banner when trial expires in ≤ 7 days.
 * Disappears entirely for paid plans or superadmins.
 */
export default function TrialBanner() {
  const { profile } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (!profile) return null;
  if (profile.role === 'superadmin') return null;
  if (dismissed) return null;

  const days = profile.daysLeftInTrial ?? 30;
  const expired = profile.trialExpired ?? false;

  // Only show banner when 7 or fewer days remain
  if (!expired && days > 7) return null;

  const isUrgent = days <= 3 || expired;

  return (
    <div className={`w-full px-4 py-2.5 flex items-center justify-between text-sm font-semibold gap-3 ${
      isUrgent
        ? 'bg-red-600 text-white'
        : 'bg-amber-500 text-white'
    }`}>
      <div className="flex items-center space-x-2 min-w-0">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="truncate">
          {expired
            ? 'Your free trial has ended. Upgrade to continue using Sthara.'
            : `Your free trial expires in ${days} day${days === 1 ? '' : 's'}.`}
        </span>
      </div>
      <div className="flex items-center space-x-3 shrink-0">
        <a
          href="mailto:sales@sthara.in?subject=Upgrade Inquiry"
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg font-bold text-xs transition-colors ${
            isUrgent
              ? 'bg-white text-red-600 hover:bg-red-50'
              : 'bg-white text-amber-700 hover:bg-amber-50'
          }`}
        >
          <Mail className="w-3 h-3" />
          <span>Upgrade Now</span>
        </a>
        {!expired && (
          <button
            onClick={() => setDismissed(true)}
            className="text-white/70 hover:text-white transition-colors"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
