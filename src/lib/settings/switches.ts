/**
 * Per-school kill switches: parts of the product an operator can turn off for one school
 * without suspending it (an incident, a runaway cost, a feature the school has not bought).
 *
 * Stored on the school as settings.switches = { <key>: false }; only what is off is stored,
 * so everything is on unless switched off. Enforced in aiGate() for the AI areas and in
 * sendWhatsApp() for WhatsApp. The platform-wide and school-wide AI switches still apply
 * on top. Pure, so it is unit-tested.
 */
export const SWITCHES = {
  tutor: { label: 'AI tutor', note: 'Students’ tutor sessions.', ai: true },
  practice: { label: 'Student practice and AI grading', note: 'Student quiz generation, quiz grading and homework photo grading.', ai: true },
  teacherTools: { label: 'Teacher AI tools', note: 'Teaching copilot, quiz, homework and paper creators, lesson drafting, capture grading.', ai: true },
  ask: { label: 'Ask the School OS', note: 'Questions from parents, teachers and leadership, in the app and on WhatsApp.', ai: true },
  whatsapp: { label: 'WhatsApp messages', note: 'Every outgoing WhatsApp message to this school’s people, including alerts and sign-in codes.', ai: false },
} as const;
export type SwitchKey = keyof typeof SWITCHES;
export const SWITCH_KEYS = Object.keys(SWITCHES) as SwitchKey[];
export const isSwitchKey = (v: unknown): v is SwitchKey => typeof v === 'string' && Object.hasOwn(SWITCHES, v);

/** The switches that are off, read from a school's settings. Anything unknown or not exactly `false` counts as on. */
export function switchesOff(settings: unknown): SwitchKey[] {
  const s = (settings as { switches?: unknown } | null)?.switches;
  if (!s || typeof s !== 'object') return [];
  return SWITCH_KEYS.filter(k => (s as Record<string, unknown>)[k] === false);
}

/** The settings.switches value after turning one switch on or off (null when nothing is off, so the key is removed). */
export function withSwitch(settings: unknown, key: SwitchKey, on: boolean): Record<string, false> | null {
  const off = new Set(switchesOff(settings));
  if (on) off.delete(key); else off.add(key);
  return off.size ? Object.fromEntries(SWITCH_KEYS.filter(k => off.has(k)).map(k => [k, false as const])) : null;
}

/** The journal key a switch change is recorded under, and how it reads. */
export const switchJournalKey = (key: SwitchKey) => `switch.${key}`;
export function switchJournalLabel(journalKey: string): string | null {
  const k = journalKey.startsWith('switch.') ? journalKey.slice(7) : '';
  return isSwitchKey(k) ? `Switch: ${SWITCHES[k].label}` : null;
}
