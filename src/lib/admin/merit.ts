/**
 * The admission assessment and merit (admissions phase 4a): the school's settings for both, the score's checks, the
 * merit of an applicant (their score plus the school's points for a sibling at the school or a parent on the staff)
 * and the merit list of a class. Pure, so the office screens, the server and the tests share it.
 */

export interface AssessmentRules {
  /** The highest score (scores run from 0 to this). */
  maxScore: number;
  /** Families can book a slot themselves on the apply page once they have sent the application. */
  familyBooking: boolean;
  /** Points added to the score for a sibling at the school, and for a parent on the staff. */
  siblingPoints: number;
  staffPoints: number;
}
export const DEFAULT_ASSESSMENT: AssessmentRules = { maxScore: 100, familyBooking: false, siblingPoints: 0, staffPoints: 0 };

const num = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 100) / 100 : dflt;
};

/** settings.admissions.assessment over the defaults; anything malformed is dropped. */
export function assessmentOf(settings: unknown): AssessmentRules {
  const raw = (settings as { admissions?: { assessment?: Record<string, unknown> } } | null)?.admissions?.assessment;
  if (!raw || typeof raw !== 'object') return DEFAULT_ASSESSMENT;
  return {
    maxScore: num(raw.maxScore, 1, 1000, 100), familyBooking: raw.familyBooking === true,
    siblingPoints: num(raw.siblingPoints, 0, 1000, 0), staffPoints: num(raw.staffPoints, 0, 1000, 0),
  };
}

export function checkAssessmentRules(raw: unknown): { value: AssessmentRules } | { error: string } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const max = Number(o.maxScore);
  if (!Number.isInteger(max) || max < 1 || max > 1000) return { error: 'The highest score is a whole number from 1 to 1,000.' };
  const pts = (v: unknown, what: string) => {
    const n = v === '' || v == null ? 0 : Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max ? { n: Math.round(n * 100) / 100 } : { error: `${what} points run from 0 to the highest score.` };
  };
  const s = pts(o.siblingPoints, 'Sibling'), t = pts(o.staffPoints, 'Staff ward');
  if ('error' in s) return { error: s.error! };
  if ('error' in t) return { error: t.error! };
  return { value: { maxScore: max, familyBooking: o.familyBooking === true, siblingPoints: s.n, staffPoints: t.n } };
}

/** A score as typed (blank: none), within 0 and the highest score, to two decimals. */
export function checkScore(v: unknown, max: number): { value: number | null } | { error: string } {
  if (v === '' || v == null) return { value: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) return { error: `A score runs from 0 to ${max}.` };
  return { value: Math.round(n * 100) / 100 };
}

// ── Merit ───────────────────────────────────────────────────────────────────
export interface MeritInput { id: string; name: string; score: number | null; sibling: boolean; staff: boolean; appliedOn: string | null; createdAt: string }
export interface MeritLine extends MeritInput { bonus: number; merit: number | null; rank: number | null }

export const meritOf = (a: { score: number | null; sibling: boolean; staff: boolean }, r: AssessmentRules): number | null =>
  a.score == null ? null : Math.round((a.score + (a.sibling ? r.siblingPoints : 0) + (a.staff ? r.staffPoints : 0)) * 100) / 100;

/**
 * The merit list: highest merit first; on a tie, whoever applied first. Those without a score come after, unranked,
 * in the order they applied. Equal merit and date share a rank (1, 2, 2, 4).
 */
export function meritList(list: MeritInput[], r: AssessmentRules): MeritLine[] {
  const applied = (a: MeritInput) => a.appliedOn ?? a.createdAt.slice(0, 10);
  const lines = list.map(a => ({ ...a, bonus: (a.sibling ? r.siblingPoints : 0) + (a.staff ? r.staffPoints : 0), merit: meritOf(a, r), rank: null as number | null }));
  const scored = lines.filter(l => l.merit != null).sort((a, b) => b.merit! - a.merit! || applied(a).localeCompare(applied(b)) || a.name.localeCompare(b.name));
  scored.forEach((l, i) => {
    const prev = scored[i - 1];
    l.rank = prev && prev.merit === l.merit && applied(prev) === applied(l) ? prev.rank : i + 1;
  });
  const rest = lines.filter(l => l.merit == null).sort((a, b) => applied(a).localeCompare(applied(b)) || a.name.localeCompare(b.name));
  return [...scored, ...rest];
}

// ── Slots ───────────────────────────────────────────────────────────────────
export interface SlotLite { id: string; grade: number | null; starts_at: string; minutes: number; capacity: number; cancelled_at: string | null; booked: number }

/** Slots a family (or the office) can book for this class: ahead, not cancelled, not full; soonest first. */
export function openSlots<T extends SlotLite>(slots: T[], grade: number, now: Date = new Date()): T[] {
  return slots.filter(s => !s.cancelled_at && (s.grade == null || s.grade === grade) && new Date(s.starts_at) > now && s.booked < s.capacity)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** "Sat 14 Nov 2026, 10:00 am (60 min)" in India time. */
export function slotWhen(s: { starts_at: string; minutes: number }) {
  const d = new Date(s.starts_at);
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  return `${day}, ${time} (${s.minutes} min)`;
}
