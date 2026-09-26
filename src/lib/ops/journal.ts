/**
 * How a change-journal entry (public.settings_changes) reads to a person.
 *
 * One formatter for every place the journal is shown (Overview, Platform
 * settings history, a school's Activity tab, the Audit log and its CSV), so a
 * change reads the same everywhere. Pure, so it is unit-tested.
 */
import {
  PLATFORM_SETTINGS, SCHOOL_FIELD_LABELS, isPlatformKey, planLabel, planOf,
  type SchoolPatch, type SettingDef,
} from '@/lib/settings/registry';

export type JournalScope = 'platform' | 'school';

const TZ = 'Asia/Kolkata';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const isSchoolField = (k: string): k is keyof SchoolPatch => Object.hasOwn(SCHOOL_FIELD_LABELS, k);

/** The setting's human name; unknown keys fall back to the raw key. */
const EVENTS: Record<string, string> = { 'school.deleted': 'School deleted', 'account.deleted': 'Account deleted' };

export function journalLabel(scope: JournalScope, key: string): string {
  if (Object.hasOwn(EVENTS, key)) return EVENTS[key];
  if (scope === 'platform') return isPlatformKey(key) ? PLATFORM_SETTINGS[key].label : key;
  return isSchoolField(key) ? SCHOOL_FIELD_LABELS[key] : key;
}

/** A platform setting's value as it reads to an operator. */
export function platformValue(d: SettingDef, v: unknown): string {
  switch (d.type) {
    case 'boolean': return v ? 'On' : 'Off';
    case 'enum': return d.options.find(o => o.value === v)?.label ?? String(v);
    case 'integer': return `${v}${d.unit ? ` ${d.unit}` : ''}`;
    case 'text': return typeof v === 'string' && v ? `"${v}"` : 'Empty';
  }
}

/** A stored old/new value as it reads to an operator. */
export function journalValue(scope: JournalScope, key: string, v: unknown): string {
  // Deletions store a snapshot of what was removed as the old value, and nothing as the new one.
  if (Object.hasOwn(EVENTS, key)) {
    if (v === null || v === undefined) return 'Deleted';
    const o = (typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return key === 'school.deleted'
      ? `${o.name ?? 'School'}${o.code ? ` (${o.code})` : ''}, ${Number(o.accounts ?? 0).toLocaleString('en-IN')} accounts`
      : `${o.name ?? 'Account'} (${o.role ?? 'user'})${o.email ? `, ${o.email}` : ''}`;
  }
  if (scope === 'platform') {
    if (!isPlatformKey(key)) return v === null || v === undefined ? 'Default' : typeof v === 'string' ? v : JSON.stringify(v);
    const d: SettingDef = PLATFORM_SETTINGS[key];
    // No stored row means the code default was in force.
    return v === null || v === undefined ? `${platformValue(d, d.default)} (default)` : platformValue(d, v);
  }
  switch (key) {
    // Old rows may hold pre-tier names ('trial', 'standard'): planOf reads them as their tier.
    case 'plan': return v === null || v === undefined ? 'None' : planLabel(planOf(v));
    case 'active': return v === true || v === 'active' ? 'Active' : v === false || v === 'suspended' ? 'Suspended' : String(v ?? 'None');
    case 'aiEnabled': return v === null || v === undefined ? 'None' : v ? 'On' : 'Off';
    case 'trialEndsAt': return typeof v === 'string' && v ? day(v) : 'None';
    case 'pricePerStudent': return typeof v === 'number' ? `${rupees(v)} / student / yr` : 'List price';
    case 'contractStudents': return typeof v === 'number' ? `${v.toLocaleString('en-IN')} students` : 'Students on the platform';
    case 'institutionType': return v === 'college' ? 'College' : v === 'school' ? 'School' : String(v ?? 'None');
  }
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  return typeof v === 'string' ? v || 'Empty' : JSON.stringify(v);
}
