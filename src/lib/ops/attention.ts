/**
 * The operator's work queue: everything on the platform that needs a person,
 * ranked, each with the action that resolves it.
 *
 * Pure (no server imports) so the rules are unit-tested and the console and
 * API share them.
 */
import type { InventoryItem, SchoolFacts } from '@/lib/settings/inventory';

export type Severity = 'crit' | 'warn' | 'info';

/** What the console offers to do about an item. */
export type AttentionAction =
  | { kind: 'extend-trial'; schoolId: string; days: number }
  | { kind: 'set-curriculum'; schoolId: string }
  | { kind: 'reactivate'; schoolId: string }
  | { kind: 'open'; href: string; label: string };

export interface AttentionItem {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** The school it is about, if any (for grouping and links). */
  schoolId?: string;
  actions: AttentionAction[];
}

export interface RegistrySchool extends SchoolFacts {
  createdAt: string | null;
  roles: Record<string, number>;
  classes: number;
  /** Classes whose subject list is empty. */
  classesWithoutSubjects: number;
}

const RANK: Record<Severity, number> = { crit: 0, warn: 1, info: 2 };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function buildAttention(x: {
  schools: RegistrySchool[];
  health: InventoryItem[];
  newEnquiries: number;
}): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const s of x.schools) {
    const open = (tab: string, label: string): AttentionAction => ({ kind: 'open', href: `/ops/schools/${s.id}?tab=${tab}`, label });
    if (!s.active) {
      out.push({
        id: `suspended:${s.id}`, severity: 'info', schoolId: s.id,
        title: `${s.name} is suspended`,
        detail: `${plural(s.people, 'account')} locked out${s.suspension?.reason ? `: ${s.suspension.reason}` : ''}.`,
        actions: [{ kind: 'reactivate', schoolId: s.id }, open('access', 'Open')],
      });
      continue; // a suspended school's setup gaps are not today's problem
    }
    if (s.plan === 'pilot' && s.trialExpired) {
      out.push({
        id: `trial-expired:${s.id}`, severity: 'crit', schoolId: s.id,
        title: `${s.name}: pilot has ended`,
        detail: `${plural(s.people, 'account')} can't use Sthara. Extend the pilot or convert the school to a tier.`,
        actions: [{ kind: 'extend-trial', schoolId: s.id, days: 30 }, open('access', 'Convert to a tier')],
      });
    } else if (s.plan === 'pilot' && s.trialDaysLeft !== null && s.trialDaysLeft <= 14) {
      out.push({
        id: `trial-ending:${s.id}`, severity: 'warn', schoolId: s.id,
        title: `${s.name}: pilot ends in ${plural(s.trialDaysLeft, 'day')}`,
        detail: 'Time for the conversion conversation. Convert the school to a tier, or extend the pilot.',
        actions: [{ kind: 'extend-trial', schoolId: s.id, days: 30 }, open('access', 'Convert to a tier')],
      });
    }
    if (!s.code) {
      out.push({
        id: `no-code:${s.id}`, severity: 'crit', schoolId: s.id,
        title: `${s.name} has no sign-in code`,
        detail: 'Nobody at this school can sign in until it has one.',
        actions: [open('access', 'Set code')],
      });
    }
    if (!s.curriculum) {
      out.push({
        id: `no-curriculum:${s.id}`, severity: 'warn', schoolId: s.id,
        title: `${s.name}: curriculum not set`,
        detail: 'The planner, tutor and question generators fall back to generic content.',
        actions: [{ kind: 'set-curriculum', schoolId: s.id }],
      });
    }
    if (s.schoolAdmins === 0) {
      out.push({
        id: `no-admin:${s.id}`, severity: 'warn', schoolId: s.id,
        title: `${s.name} has no school admin`,
        detail: 'Nobody there can grant office roles or manage people. Add an admin account.',
        actions: [open('people', 'Add people')],
      });
    }
    if (s.classes === 0) {
      out.push({
        id: `no-classes:${s.id}`, severity: 'warn', schoolId: s.id,
        title: `${s.name} has no classes`,
        detail: 'Students and teacher assignments are checked against classes. Set them up first.',
        actions: [open('classes', 'Set up classes')],
      });
    } else if (s.classesWithoutSubjects > 0) {
      out.push({
        id: `no-subjects:${s.id}`, severity: 'info', schoolId: s.id,
        title: `${s.name}: ${plural(s.classesWithoutSubjects, 'class', 'classes')} without subjects`,
        detail: 'Teachers can only be assigned to subjects listed on a class.',
        actions: [open('classes', 'Add subjects')],
      });
    }
  }
  if (x.newEnquiries > 0) {
    out.push({
      id: 'enquiries', severity: 'info',
      title: `${plural(x.newEnquiries, 'new website enquiry', 'new website enquiries')}`,
      detail: 'Sent from the contact form on www.sthara.in and not yet picked up.',
      actions: [{ kind: 'open', href: '/ops/enquiries', label: 'Review' }],
    });
  }
  // Health problems that aren't about one school (those are covered above).
  for (const h of x.health) {
    if ((h.status !== 'crit' && h.status !== 'warn') || h.source === 'school') continue;
    out.push({
      id: `health:${h.id}`, severity: h.status,
      title: `${h.label}: ${h.value}`,
      detail: h.detail,
      actions: [{ kind: 'open', href: `/ops/health#${h.id}`, label: 'View check' }],
    });
  }
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

/** A readiness checklist for one school's setup, in the order an operator does it. */
export function setupChecklist(s: RegistrySchool, teacherCoverage: { total: number; covered: number }) {
  return [
    { key: 'code', label: 'Sign-in code set', done: !!s.code, tab: 'access' },
    { key: 'curriculum', label: 'Curriculum chosen', done: !!s.curriculum, tab: 'access' },
    { key: 'classes', label: 'Classes created', done: s.classes > 0, tab: 'classes' },
    { key: 'subjects', label: 'Every class has subjects', done: s.classes > 0 && s.classesWithoutSubjects === 0, tab: 'classes' },
    { key: 'admin', label: 'A school admin exists', done: s.schoolAdmins > 0, tab: 'people' },
    { key: 'teachers', label: 'Teachers added', done: (s.roles.teacher ?? 0) > 0, tab: 'people' },
    { key: 'coverage', label: 'Every class subject has a teacher', done: teacherCoverage.total > 0 && teacherCoverage.covered === teacherCoverage.total, tab: 'teaching' },
    { key: 'students', label: 'Students added', done: (s.roles.student ?? 0) > 0, tab: 'people' },
    { key: 'parents', label: 'Parents added', done: (s.roles.parent ?? 0) > 0, tab: 'people' },
  ];
}
