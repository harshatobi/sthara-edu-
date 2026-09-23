'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRole, isRole } from './roles';

export function useRoleGuard(role: string) {
  const { profile, loading, error } = useAuth();
  const router = useRouter();
  const authorized = !loading && !error && canAccessRole(profile?.role, role);

  useEffect(() => {
    if (loading || error) return;
    if (!profile || !isRole(profile.role)) router.replace('/login');
    else if (!canAccessRole(profile.role, role)) router.replace(`/${profile.role}`);
    else if (profile.trialExpired && profile.role !== 'superadmin') router.replace('/trial-expired');
  }, [profile, loading, error, role, router]);

  return { profile, loading, error, authorized: authorized && !profile?.trialExpired };
}
