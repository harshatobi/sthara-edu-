'use client';

import { useSearchParams } from 'next/navigation';
import CommandCentre from '../CommandCentre';
import { DeskGate, PageSkeleton } from '../kit';
import RoleHome, { homeNeedsFull } from './RoleHome';
import SetupHub from './SetupHub';
import { useSetup } from '@/lib/admin/useSetup';

/**
 * /admin: who lands where (Moses, 2026-11-06). The principal, the school admin and the vice principal run the whole
 * school from the Command Centre; every other office role gets a home built from the roles they hold.
 */
const RUNS_SCHOOL = ['principal', 'school_admin', 'vice_principal'];

export default function Home() {
  return (
    <DeskGate>{desk => {
      const roles = desk.me.access.roles;
      // The school admin sets the school up: the checklist is their home until the essentials are done.
      if (roles.includes('school_admin') && !roles.includes('principal')) return <AdminHome />;
      if (desk.me.access.superadmin || roles.some(r => RUNS_SCHOOL.includes(r))) return <CommandCentre />;
      return <RoleHome full={homeNeedsFull(roles)} />;
    }}</DeskGate>
  );
}

function AdminHome() {
  const params = useSearchParams();
  const centre = params.get('view') === 'centre';
  const { setup, loading } = useSetup(!centre);
  if (centre) return <CommandCentre />;
  if (loading) return <PageSkeleton />;
  return setup && !setup.ready ? <SetupHub asHome /> : <CommandCentre />;
}
