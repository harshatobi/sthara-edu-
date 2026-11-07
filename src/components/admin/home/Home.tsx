'use client';

import CommandCentre from '../CommandCentre';
import { DeskGate } from '../kit';
import RoleHome, { homeNeedsFull } from './RoleHome';

/**
 * /admin: who lands where (Moses, 2026-11-06). The principal, the school admin and the vice principal run the whole
 * school from the Command Centre; every other office role gets a home built from the roles they hold.
 */
const RUNS_SCHOOL = ['principal', 'school_admin', 'vice_principal'];

export default function Home() {
  return (
    <DeskGate>{desk => {
      const roles = desk.me.access.roles;
      if (desk.me.access.superadmin || roles.some(r => RUNS_SCHOOL.includes(r))) return <CommandCentre />;
      return <RoleHome full={homeNeedsFull(roles)} />;
    }}</DeskGate>
  );
}
