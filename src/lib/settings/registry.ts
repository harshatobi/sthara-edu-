/**
 * The settings the operator console can change, and the rules for each.
 *
 * Pure (no server imports) so the console UI, the API and the tests share one
 * definition. Every entry lists where it is enforced: a setting only belongs
 * here if changing it changes what the product does.
 */

export type PlatformKey = keyof typeof PLATFORM_SETTINGS;

interface Base { label: string; group: string; help: string; enforcedAt: string[] }
export type SettingDef =
  | (Base & { type: 'boolean'; default: boolean; danger?: 'off' | 'on' })
  | (Base & { type: 'integer'; default: number; min: number; max: number; unit?: string })
  | (Base & { type: 'text'; default: string; maxLength: number })
  | (Base & { type: 'enum'; default: string; options: { value: string; label: string }[] });

export const PLATFORM_SETTINGS = {
  'ai.enabled': {
    type: 'boolean', default: true, danger: 'off', group: 'AI',
    label: 'AI features',
    help: 'Master switch for every Gemini call: tutor, grading, homework and quiz generation, the teaching copilot and the admin assistant. Off returns a clear "paused" message instead of calling the model.',
    enforcedAt: ['src/lib/settings/server.ts aiGate()', 'every route under /api that calls Gemini'],
  },
  'onboarding.self_serve': {
    type: 'boolean', default: true, danger: 'on', group: 'Accounts',
    label: 'Self-serve school sign-up',
    help: 'Lets anyone create a school and admin login from /onboard without an operator. Off: new schools can only be created here in the console.',
    enforcedAt: ['/api/onboard'],
  },
  'trial.default_days': {
    type: 'integer', default: 30, min: 7, max: 180, unit: 'days', group: 'Accounts',
    label: 'Default pilot length',
    help: 'Pilot length given to schools created through self-serve sign-up, and the starting value when an operator creates a pilot school. A pilot is one term.',
    enforcedAt: ['/api/onboard', '/api/ops/schools (POST default)'],
  },
  'notice.message': {
    type: 'text', default: '', maxLength: 240, group: 'Communication',
    label: 'Sign-in notice',
    help: 'Shown on the sign-in page and at the top of every portal, to every school. Use it for planned downtime or incidents. Empty hides it.',
    enforcedAt: ['/api/platform/notice', 'src/components/ui/PlatformNotice.tsx (login, portal shells)'],
  },
  'notice.tone': {
    type: 'enum', default: 'info', group: 'Communication',
    options: [{ value: 'info', label: 'Information' }, { value: 'warning', label: 'Warning' }, { value: 'critical', label: 'Incident' }],
    label: 'Notice style',
    help: 'Colour of the sign-in notice.',
    enforcedAt: ['src/components/ui/PlatformNotice.tsx'],
  },
} as const satisfies Record<string, SettingDef>;

export type PlatformValues = { [K in PlatformKey]: (typeof PLATFORM_SETTINGS)[K]['default'] extends boolean ? boolean
  : (typeof PLATFORM_SETTINGS)[K]['default'] extends number ? number : string };

export const PLATFORM_DEFAULTS = Object.fromEntries(
  Object.entries(PLATFORM_SETTINGS).map(([k, d]) => [k, d.default]),
) as PlatformValues;

export const isPlatformKey = (k: unknown): k is PlatformKey => typeof k === 'string' && Object.hasOwn(PLATFORM_SETTINGS, k);

/** Validates and normalises a value for `key`; returns an error message on failure. */
export function parsePlatformValue(key: PlatformKey, raw: unknown): { value: boolean | number | string } | { error: string } {
  const d: SettingDef = PLATFORM_SETTINGS[key];
  switch (d.type) {
    case 'boolean':
      return typeof raw === 'boolean' ? { value: raw } : { error: `${d.label} must be on or off.` };
    case 'integer': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
      if (!Number.isInteger(n) || n < d.min || n > d.max) return { error: `${d.label} must be a whole number from ${d.min} to ${d.max}.` };
      return { value: n };
    }
    case 'text': {
      if (typeof raw !== 'string') return { error: `${d.label} must be text.` };
      const v = raw.replace(/\s+/g, ' ').trim();
      if (v.length > d.maxLength) return { error: `${d.label} can be at most ${d.maxLength} characters.` };
      return { value: v };
    }
    case 'enum':
      return d.options.some(o => o.value === raw) ? { value: raw as string } : { error: `Pick a valid ${d.label.toLowerCase()}.` };
  }
}

/** Stored rows over defaults; unknown keys and values that no longer validate fall back to the default. */
export function resolvePlatform(rows: { key: string; value: unknown }[]): PlatformValues {
  const out: Record<string, unknown> = { ...PLATFORM_DEFAULTS };
  for (const r of rows) {
    if (!isPlatformKey(r.key)) continue;
    const p = parsePlatformValue(r.key, r.value);
    if ('value' in p) out[r.key] = p.value;
  }
  return out as PlatformValues;
}

// ---------------------------------------------------------------------------
// Per-school settings (stored on public.schools: columns and the settings jsonb)
// ---------------------------------------------------------------------------

/**
 * Sthara's commercial tiers, priced per student per year (INR). There are no
 * free trials: a school starts on a paid pilot (one grade, one term, full
 * price, 100% credited to the annual contract on conversion). A pilot is the
 * only time-bound plan; its end date lives in schools.trial_expires_at.
 */
export const PLANS = ['pilot', 'aadhara', 'sthamba', 'shikhara', 'mandala'] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_INFO: Record<Plan, { label: string; price: number | null; position: string; note: string }> = {
  pilot:    { label: 'Paid pilot', price: null, position: 'Pilot', note: 'One grade, one term, at full tier price. 100% credited to the annual contract on conversion.' },
  aadhara:  { label: 'Aadhara',  price: 2000, position: 'Floor',    note: 'Entry tier. Offer only when price is the blocker.' },
  sthamba:  { label: 'Sthamba',  price: 2500, position: 'Standard', note: 'Standard tier.' },
  shikhara: { label: 'Shikhara', price: 3500, position: 'Anchor',   note: 'Anchor tier: lead with this one.' },
  mandala:  { label: 'Mandala',  price: null, position: 'Custom',   note: 'School groups and trusts, multi-campus. Price agreed per contract.' },
};
/** Plan names used before the tiers were named; read as their tier so old rows keep working. */
const LEGACY_PLANS: Record<string, Plan> = { trial: 'pilot', standard: 'sthamba', premium: 'shikhara', enterprise: 'mandala' };
export const planOf = (v: unknown): Plan =>
  (PLANS as readonly unknown[]).includes(v) ? (v as Plan) : (typeof v === 'string' && LEGACY_PLANS[v]) || 'pilot';
export const planLabel = (p: Plan) => PLAN_INFO[p].label;
/** Price per student per year in force for a school: its contract price, else the tier's list price. */
export const effectivePrice = (p: Pick<SchoolPolicy, 'plan' | 'pricePerStudent'>) => p.pricePerStudent ?? PLAN_INFO[p.plan].price;
/** Annual contract value in INR, or null when there's no price or seat count to work from. */
export function annualValue(p: Pick<SchoolPolicy, 'plan' | 'pricePerStudent' | 'contractStudents'>, students: number): number | null {
  const price = effectivePrice(p) ?? (p.plan === 'pilot' ? PLAN_INFO.shikhara.price : null);
  const seats = p.contractStudents ?? students;
  return price !== null && seats > 0 ? price * seats : null;
}
export const CURRICULA = ['CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge IGCSE', 'Other'] as const;

/** The keys of schools.settings the product reads. Stored as jsonb, so every field is checked on read. */
export interface SchoolSettings {
  code?: unknown; plan?: unknown; active?: unknown; aiEnabled?: unknown; curriculum?: unknown; testSchool?: unknown;
  contractStudents?: unknown; pricePerStudent?: unknown;
  suspension?: { at?: unknown; reason?: unknown } | null;
  [k: string]: unknown;
}

export interface SchoolRow {
  id: string;
  name: string;
  institution_type: string | null;
  trial_expires_at: string | null;
  settings: SchoolSettings | null;
}

/** The load-bearing view of one school, as the product enforces it. */
export interface SchoolPolicy {
  id: string;
  name: string;
  code: string | null;
  plan: Plan;
  active: boolean;
  aiEnabled: boolean;
  trialEndsAt: string | null;
  /** True when on the trial plan and the end date has passed. */
  trialExpired: boolean;
  /** Whole days left on a running trial; null when not on trial or no end date. */
  trialDaysLeft: number | null;
  curriculum: string | null;
  institutionType: 'school' | 'college';
  testSchool: boolean;
  suspension: { at: string; reason: string } | null;
  /** Students on the contract (billing seats); null = bill on actual head count. */
  contractStudents: number | null;
  /** Agreed INR per student per year; null = the tier's list price. Required for Mandala. */
  pricePerStudent: number | null;
}

const posInt = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);

export function schoolPolicy(s: SchoolRow, now = Date.now()): SchoolPolicy {
  const st = s.settings || {};
  const plan = planOf(st.plan);
  const onTrial = plan === 'pilot';
  const ends = onTrial && s.trial_expires_at ? new Date(s.trial_expires_at).getTime() : null;
  const daysLeft = ends === null || Number.isNaN(ends) ? null : Math.max(0, Math.ceil((ends - now) / 86_400_000));
  return {
    id: s.id,
    name: s.name,
    code: typeof st.code === 'string' && st.code ? st.code : null,
    plan,
    // Legacy rows have no flag: a school is active unless explicitly suspended.
    active: st.active !== false,
    aiEnabled: st.aiEnabled !== false,
    trialEndsAt: onTrial ? s.trial_expires_at : null,
    trialExpired: daysLeft === 0,
    trialDaysLeft: daysLeft,
    curriculum: typeof st.curriculum === 'string' ? st.curriculum : null,
    institutionType: s.institution_type === 'college' ? 'college' : 'school',
    testSchool: st.testSchool === true,
    suspension: st.active === false && st.suspension ? { at: String(st.suspension.at || ''), reason: String(st.suspension.reason || '') } : null,
    contractStudents: posInt(st.contractStudents),
    pricePerStudent: posInt(st.pricePerStudent),
  };
}

/** Why a school's users may not use the product right now, or null. Operators are never blocked. */
export function accessBlock(p: Pick<SchoolPolicy, 'active' | 'trialExpired'>): { code: 'suspended' | 'trial_expired'; message: string } | null {
  if (!p.active) return { code: 'suspended', message: 'Your school’s Sthara account is suspended. Contact your school office.' };
  if (p.trialExpired) return { code: 'trial_expired', message: 'Your school’s Sthara pilot has ended. Contact your school office.' };
  return null;
}

export const normaliseCode = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') : '');

export interface SchoolPatch {
  name?: string;
  code?: string;
  plan?: Plan;
  trialEndsAt?: string | null;
  active?: boolean;
  aiEnabled?: boolean;
  curriculum?: string;
  institutionType?: 'school' | 'college';
  contractStudents?: number | null;
  pricePerStudent?: number | null;
}

/**
 * Validates an operator's edit to one school. Returns the normalised patch
 * (only fields that actually change) or the first error.
 */
export function parseSchoolPatch(current: SchoolPolicy, raw: Record<string, unknown>, now = Date.now()): { patch: SchoolPatch } | { error: string } {
  const patch: SchoolPatch = {};
  if (raw.name !== undefined) {
    const v = typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim() : '';
    if (v.length < 2 || v.length > 120) return { error: 'School name must be 2 to 120 characters.' };
    if (v !== current.name) patch.name = v;
  }
  if (raw.code !== undefined) {
    const v = normaliseCode(raw.code);
    if (v.length < 3 || v.length > 12) return { error: 'School code must be 3 to 12 letters, digits or hyphens.' };
    if (v !== current.code) patch.code = v;
  }
  if (raw.plan !== undefined) {
    if (!(PLANS as readonly unknown[]).includes(raw.plan)) return { error: 'Pick a valid tier.' };
    if (raw.plan !== current.plan) patch.plan = raw.plan as Plan;
  }
  const plan = patch.plan ?? current.plan;
  if (raw.trialEndsAt !== undefined && plan === 'pilot') {
    if (typeof raw.trialEndsAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trialEndsAt)) return { error: 'Pilot end must be a date.' };
    // End of that day, India time.
    const t = new Date(`${raw.trialEndsAt}T23:59:59+05:30`);
    if (Number.isNaN(t.getTime())) return { error: 'Pilot end must be a date.' };
    if (t.getTime() > now + 730 * 86_400_000) return { error: 'A pilot can run at most two years ahead.' };
    const iso = t.toISOString();
    if (!current.trialEndsAt || new Date(current.trialEndsAt).toISOString() !== iso) patch.trialEndsAt = iso;
  }
  if (patch.plan === 'pilot' && patch.trialEndsAt === undefined && !current.trialEndsAt) {
    return { error: 'Moving a school to a pilot needs a pilot end date.' };
  }
  for (const k of ['contractStudents', 'pricePerStudent'] as const) {
    if (raw[k] === undefined) continue;
    const v = raw[k] === null || raw[k] === '' ? null : Number(raw[k]);
    const max = k === 'contractStudents' ? 200_000 : 100_000;
    if (v !== null && (!Number.isInteger(v) || v < 1 || v > max)) {
      return { error: k === 'contractStudents' ? `Contracted students must be a whole number from 1 to ${max.toLocaleString('en-IN')}, or empty.` : `Price per student must be whole rupees from 1 to ${max.toLocaleString('en-IN')}, or empty for the list price.` };
    }
    if (v !== current[k]) patch[k] = v;
  }
  const touchesPrice = patch.plan !== undefined || patch.pricePerStudent !== undefined;
  if (touchesPrice && plan === 'mandala' && (patch.pricePerStudent === undefined ? current.pricePerStudent : patch.pricePerStudent) === null) {
    return { error: 'Mandala has no list price: set the agreed price per student.' };
  }
  if (raw.active !== undefined) {
    if (typeof raw.active !== 'boolean') return { error: 'Status must be active or suspended.' };
    if (raw.active !== current.active) patch.active = raw.active;
  }
  if (raw.aiEnabled !== undefined) {
    if (typeof raw.aiEnabled !== 'boolean') return { error: 'AI must be on or off.' };
    if (raw.aiEnabled !== current.aiEnabled) patch.aiEnabled = raw.aiEnabled;
  }
  if (raw.curriculum !== undefined) {
    if (!(CURRICULA as readonly unknown[]).includes(raw.curriculum)) return { error: 'Pick a valid curriculum.' };
    if (raw.curriculum !== current.curriculum) patch.curriculum = raw.curriculum as string;
  }
  if (raw.institutionType !== undefined) {
    if (raw.institutionType !== 'school' && raw.institutionType !== 'college') return { error: 'Pick school or college.' };
    if (raw.institutionType !== current.institutionType) patch.institutionType = raw.institutionType;
  }
  return { patch };
}

/** Human labels for journal entries and the change preview. */
export const SCHOOL_FIELD_LABELS: Record<keyof SchoolPatch, string> = {
  name: 'School name', code: 'School code', plan: 'Tier', trialEndsAt: 'Pilot ends', active: 'Status',
  aiEnabled: 'AI features', curriculum: 'Curriculum', institutionType: 'Institution type',
  contractStudents: 'Contracted students', pricePerStudent: 'Price per student',
};

export const REASON_MIN = 4;
export const parseReason = (v: unknown): string | null => {
  const r = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return r.length >= REASON_MIN && r.length <= 500 ? r : null;
};
