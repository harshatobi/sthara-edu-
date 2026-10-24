/**
 * Co-curricular (brief 06): houses, clubs and teams, and Kirti, the record of a student's achievements and
 * participation. Teachers record, the academic coordinator or principal approves; only approved entries show on the
 * student and parent portals and on the TC (fields 16 and 17). Pure: screens, server, importer and tests share it.
 */

export const LEVELS = ['class', 'house', 'school', 'inter_school', 'zone', 'district', 'state', 'national', 'international'] as const;
export type Level = typeof LEVELS[number];
export const LEVEL_LABEL: Record<Level, string> = {
  class: 'Class', house: 'House', school: 'School', inter_school: 'Inter-school', zone: 'Zone / cluster', district: 'District', state: 'State',
  national: 'National', international: 'International',
};

export const POSITIONS = ['participant', 'first', 'second', 'third', 'special', 'other'] as const;
export type Position = typeof POSITIONS[number];
export const POSITION_LABEL: Record<Position, string> = { participant: 'Participant', first: '1st', second: '2nd', third: '3rd', special: 'Special mention', other: 'Other' };

export const CATEGORIES = ['sports', 'academic', 'arts', 'music_dance', 'literary', 'science', 'cultural', 'community', 'leadership', 'other'] as const;
export type Category = typeof CATEGORIES[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  sports: 'Sports and games', academic: 'Academic (olympiads, quizzes)', arts: 'Art and craft', music_dance: 'Music and dance', literary: 'Literary (debate, essay, elocution)',
  science: 'Science and technology', cultural: 'Cultural', community: 'Community service', leadership: 'Leadership', other: 'Other',
};

export const GROUP_KINDS = ['club', 'team', 'ncc', 'scouts_guides', 'other'] as const;
export type GroupKind = typeof GROUP_KINDS[number];
export const GROUP_KIND_LABEL: Record<GroupKind, string> = { club: 'Club', team: 'Sports team', ncc: 'NCC', scouts_guides: 'Scouts / Guides', other: 'Other group' };

export type HouseRule = 'lifelong' | 'session';
export interface CcSettings { houseRule: HouseRule; keepSiblings: boolean }
export function ccSettings(settings: unknown): CcSettings {
  const c = (settings && typeof settings === 'object' ? (settings as Record<string, any>).cocurricular : null) || {};
  return { houseRule: c.houseRule === 'session' ? 'session' : 'lifelong', keepSiblings: c.keepSiblings !== false };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (s: string) => ISO.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export interface KirtiInput {
  title: string; category: Category; level: Level; position: Position; position_note: string | null; on_date: string;
  house_points: number | null; notes: string | null;
}

/** An achievement or participation as a teacher records it. Points go to the student's house, if the school awards them. */
export function checkKirti(input: Record<string, unknown>, today: string): { value: KirtiInput } | { error: string } {
  const title = typeof input.title === 'string' ? input.title.trim().replace(/\s+/g, ' ') : '';
  if (title.length < 2 || title.length > 160) return { error: 'Name the event or award, up to 160 characters.' };
  if (!CATEGORIES.includes(input.category as Category)) return { error: 'Pick a category.' };
  if (!LEVELS.includes(input.level as Level)) return { error: 'Pick the level.' };
  if (!POSITIONS.includes(input.position as Position)) return { error: 'Pick the position.' };
  const note = typeof input.position_note === 'string' ? input.position_note.trim() : '';
  if (input.position === 'other' && !note) return { error: 'Say what the position or award was.' };
  if (note.length > 60) return { error: 'Keep the position under 60 characters.' };
  const on = typeof input.on_date === 'string' ? input.on_date : '';
  if (!realDay(on)) return { error: 'Give the date.' };
  if (on > today) return { error: 'The date is in the future.' };
  let pts: number | null = null;
  if (input.house_points != null && input.house_points !== '') {
    pts = Number(input.house_points);
    if (!Number.isInteger(pts) || pts < -100 || pts > 1000) return { error: 'House points are a whole number up to 1,000.' };
  }
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 500) || null : null;
  return { value: { title, category: input.category as Category, level: input.level as Level, position: input.position as Position, position_note: note || null, on_date: on, house_points: pts, notes } };
}

export const placeOf = (position: Position, note: string | null) => (position === 'other' ? note ?? 'Other' : position === 'participant' ? 'Participated' : POSITION_LABEL[position]);

// ── The TC (fields 16 and 17) ───────────────────────────────────────────────

export interface MemberLite { kind: GroupKind; name: string; role: string | null; session: string }
export interface KirtiLite { title: string; category: Category; level: Level; position: Position; position_note: string | null; on_date: string }

/**
 * What the TC says, from approved records: field 16 (NCC, Scouts, Guides) and field 17 (games and activities, with
 * the highest level reached in each). Empty strings when there is nothing, so the registrar writes it.
 */
export function tcLines(members: MemberLite[], entries: KirtiLite[]): { ncc: string; activities: string } {
  const uniformed = members.filter(m => m.kind === 'ncc' || m.kind === 'scouts_guides');
  // One line per unit, with the years served: "NCC Junior Division (Cadet), 2024-25 to 2025-26".
  const units = new Map<string, MemberLite[]>();
  for (const m of uniformed) units.set(`${m.kind}|${m.name}`, [...(units.get(`${m.kind}|${m.name}`) ?? []), m]);
  const ncc = [...units.values()].map(list => {
    const s = list.map(m => m.session).sort(), last = list.find(m => m.session === s[s.length - 1])!;
    return `${last.name}${last.role ? ` (${last.role})` : ''}, ${s[0]}${s.length > 1 ? ` to ${s[s.length - 1]}` : ''}`;
  }).join('; ');
  const rank = (l: Level) => LEVELS.indexOf(l);
  const best = new Map<string, KirtiLite>();
  for (const e of entries) {
    const k = e.title.toLowerCase();
    const cur = best.get(k);
    if (!cur || rank(e.level) > rank(cur.level) || (rank(e.level) === rank(cur.level) && e.position !== 'participant' && cur.position === 'participant')) best.set(k, e);
  }
  const wins = [...best.values()].sort((a, b) => rank(b.level) - rank(a.level) || b.on_date.localeCompare(a.on_date)).slice(0, 8)
    .map(e => `${e.title} (${LEVEL_LABEL[e.level].toLowerCase()} level${e.position === 'participant' ? '' : `, ${placeOf(e.position, e.position_note).toLowerCase()}`})`);
  const teams = members.filter(m => m.kind === 'team' || m.kind === 'club').map(m => `${m.name}${m.role ? ` (${m.role})` : ''}`);
  const activities = [...new Set([...wins, ...teams])].join('; ');
  return { ncc, activities };
}

// ── Houses ──────────────────────────────────────────────────────────────────

/**
 * Places new students across houses: a sibling's house first (when the school keeps siblings together), otherwise the
 * house with the fewest members, ties by name. Returns studentId -> houseId. Pure, so the balance is testable.
 */
export function balanceHouses(houses: { id: string; name: string }[], counts: Map<string, number>, students: string[], siblingHouse: Map<string, string>, keepSiblings: boolean): Map<string, string> {
  const n = new Map(houses.map(h => [h.id, counts.get(h.id) ?? 0]));
  const out = new Map<string, string>();
  const order = [...houses].sort((a, b) => a.name.localeCompare(b.name));
  for (const s of students) {
    const sib = keepSiblings ? siblingHouse.get(s) : undefined;
    const h = sib && n.has(sib) ? sib : order.reduce((best, x) => (n.get(x.id)! < n.get(best.id)! ? x : best), order[0]).id;
    out.set(s, h);
    n.set(h, n.get(h)! + 1);
  }
  return out;
}
