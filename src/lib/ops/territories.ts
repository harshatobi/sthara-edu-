/**
 * Sales and service territories: region > state > district.
 *
 * A school or enquiry is placed by its address (the district's territory if one exists,
 * else its state's) and owned by the nearest territory's default owner. An operator with
 * the 'territory' reach sees a record when it sits in one of their territories (or below),
 * or when they or someone reporting to them owns it. Pure, so it is unit-tested.
 */

export const TERRITORY_LEVELS = ['region', 'state', 'district'] as const;
export type TerritoryLevel = typeof TERRITORY_LEVELS[number];

export interface Territory {
  id: string;
  name: string;
  level: TerritoryLevel;
  parentId: string | null;
  state: string | null;
  district: string | null;
  defaultOwnerId: string | null;
}

/** States and union territories of India, as the address pickers list them. */
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
] as const;

const key = (s: string | null | undefined) => (s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

/** The listed spelling of a state ("  tamil nadu " -> "Tamil Nadu"), or null when it is not one. */
export function canonicalState(v: unknown): string | null {
  const k = typeof v === 'string' ? key(v) : '';
  return k ? INDIAN_STATES.find(s => s.toLowerCase() === k) ?? null : null;
}

/** A district name tidied for storing: single spaces, trimmed, at most 80 characters; null when empty. */
export function cleanDistrict(v: unknown): string | null {
  const d = typeof v === 'string' ? v.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return d || null;
}

/** The most specific territory for an address: its district's, else its state's. */
export function matchTerritory(territories: Territory[], state: string | null, district: string | null): Territory | null {
  const s = key(state);
  if (!s) return null;
  const d = key(district);
  return (d ? territories.find(t => t.level === 'district' && key(t.state) === s && key(t.district) === d) : undefined)
    ?? territories.find(t => t.level === 'state' && key(t.state) === s)
    ?? null;
}

/** The territory and every ancestor, nearest first. */
export function lineage(territories: Territory[], id: string | null): Territory[] {
  const byId = new Map(territories.map(t => [t.id, t]));
  const out: Territory[] = [];
  for (let t = id ? byId.get(id) : undefined; t && !out.includes(t); t = t.parentId ? byId.get(t.parentId) : undefined) out.push(t);
  return out;
}

/** Who new records in this territory go to: its default owner, else the nearest ancestor's. */
export const defaultOwner = (territories: Territory[], id: string | null) => lineage(territories, id).find(t => t.defaultOwnerId)?.defaultOwnerId ?? null;

/** "South > Tamil Nadu > Coimbatore". */
export const territoryPath = (territories: Territory[], id: string | null) => lineage(territories, id).reverse().map(t => t.name).join(' > ');

/** The given territories and everything beneath them. */
export function subtree(territories: Territory[], roots: Iterable<string>): Set<string> {
  const children = new Map<string, string[]>();
  for (const t of territories) if (t.parentId) children.set(t.parentId, [...(children.get(t.parentId) ?? []), t.id]);
  const out = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const id = queue.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return out;
}

/** What an operator can see: everything, or their territories (with descendants) and the owners they answer for. */
export type Sight = { all: true } | { all: false; territories: Set<string>; owners: Set<string> };

export const sees = (sight: Sight, rec: { territoryId: string | null; ownerId: string | null }) =>
  sight.all || (!!rec.territoryId && sight.territories.has(rec.territoryId)) || (!!rec.ownerId && sight.owners.has(rec.ownerId));

/** Why a territory cannot be saved as given, or null when it can. */
export function territoryProblem(territories: Territory[], t: Omit<Territory, 'id' | 'defaultOwnerId'> & { id?: string }): string | null {
  if (t.name.trim().length < 2) return 'Give the territory a name.';
  const parent = t.parentId ? territories.find(x => x.id === t.parentId) : null;
  if (t.parentId && !parent) return 'The parent territory no longer exists.';
  if (t.id && t.parentId && subtree(territories, [t.id]).has(t.parentId)) return 'A territory cannot sit beneath itself.';
  if (t.level === 'region') {
    if (parent) return 'A region is the top level: it has no parent.';
    if (t.state || t.district) return 'A region has no state or district of its own.';
  } else if (t.level === 'state') {
    if (!canonicalState(t.state)) return 'Pick the state.';
    if (t.district) return 'A state territory has no district.';
    if (parent && parent.level !== 'region') return 'A state sits under a region, or at the top.';
  } else {
    if (!canonicalState(t.state) || !cleanDistrict(t.district)) return 'A district territory needs its state and district.';
    if (!parent || parent.level !== 'state' || key(parent.state) !== key(t.state)) return 'A district sits under its own state.';
  }
  const clash = territories.find(x => x.id !== t.id && x.level === t.level
    && (t.level === 'region' ? key(x.name) === key(t.name) : key(x.state) === key(t.state) && key(x.district) === key(t.district)));
  return clash ? `${clash.name} already covers that.` : null;
}
