/**
 * The Schools list's views and the reasons a school needs someone's attention. Pure, so it is unit-tested.
 */
import type { RegistrySchool } from './attention';

export const SCHOOL_VIEWS = ['all', 'mine', 'attention', 'live', 'pilots', 'ending', 'unowned', 'suspended'] as const;
export type SchoolView = typeof SCHOOL_VIEWS[number];
export const isSchoolView = (v: unknown): v is SchoolView => typeof v === 'string' && (SCHOOL_VIEWS as readonly string[]).includes(v);
export const VIEW_LABEL: Record<SchoolView, string> = {
  all: 'All schools', mine: 'My schools', attention: 'Needs attention', live: 'Live', pilots: 'Pilots', ending: 'Pilot ending or ended',
  unowned: 'No owner', suspended: 'Suspended',
};

type S = RegistrySchool & { ownerId?: string | null };
const DAY = 86_400_000;

/** Why this school needs a person, most pressing first. Empty when nothing does. */
export function attentionReasons(s: S, now: number): string[] {
  const out: string[] = [];
  if (!s.active) return ['Suspended'];
  if ((s.lateCases ?? 0) > 0) out.push(`${s.lateCases} case${s.lateCases === 1 ? '' : 's'} past deadline`);
  if (s.plan === 'pilot' && s.trialExpired) out.push('Pilot has ended');
  else if (s.plan === 'pilot' && s.trialDaysLeft !== null && s.trialDaysLeft <= 14) out.push(`Pilot ends in ${s.trialDaysLeft} day${s.trialDaysLeft === 1 ? '' : 's'}`);
  if (s.health?.band === 'critical') out.push('Health is critical');
  if ((s.overdueTasks ?? 0) > 0) out.push(`${s.overdueTasks} follow-up${s.overdueTasks === 1 ? '' : 's'} overdue`);
  if (s.schoolAdmins === 0) out.push('No school admin');
  if (!s.curriculum) out.push('Curriculum not set');
  if (s.classes === 0) out.push('No classes');
  if (s.health?.band === 'weak') out.push('Health is weak');
  // A school with people in it that nobody has opened for two weeks.
  if (s.people > 0 && (!s.lastSignIn || now - Date.parse(s.lastSignIn) > 14 * DAY)) out.push(s.lastSignIn ? 'Nobody has signed in for two weeks' : 'Nobody has ever signed in');
  if ((s.unassignedCases ?? 0) > 0) out.push(`${s.unassignedCases} case${s.unassignedCases === 1 ? '' : 's'} with nobody on ${s.unassignedCases === 1 ? 'it' : 'them'}`);
  return out;
}

export function inSchoolView(s: S, view: SchoolView, me: string, now: number): boolean {
  switch (view) {
    case 'all': return true;
    case 'mine': return !!s.ownerId && s.ownerId === me;
    case 'attention': return attentionReasons(s, now).length > 0;
    case 'live': return s.active && s.plan !== 'pilot';
    case 'pilots': return s.active && s.plan === 'pilot';
    case 'ending': return s.active && s.plan === 'pilot' && (s.trialExpired || (s.trialDaysLeft !== null && s.trialDaysLeft <= 14));
    case 'unowned': return !s.ownerId;
    case 'suspended': return !s.active;
  }
}

/** "today", "3 days ago", "5 weeks ago", "never". */
export function sinceText(iso: string | null | undefined, now: number): string {
  if (!iso) return 'never';
  const days = Math.floor((now - Date.parse(iso)) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 14 ? `${days} days ago` : days < 70 ? `${Math.round(days / 7)} weeks ago` : `${Math.round(days / 30)} months ago`;
}
