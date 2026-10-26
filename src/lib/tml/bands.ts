/**
 * The five TML mastery bands: the one place their ranges, labels, colours and text colours live. Every mastery
 * score in every role (numbers, bars, chart bars, heat-map cells, band pills) takes its colour from here, so a
 * score reads the same to a student, a teacher, a parent and the principal. Non-score numbers (fees,
 * attendance, counts) keep the role colour instead.
 *
 * Labels differ by audience only at the bottom band: staff see "Severe need", students and parents
 * "Needs support". The engine's own band names (MasteryBand in engine.ts) are data and don't change.
 */

export type TmlBandKey = 'exemplary' | 'proficient' | 'developing' | 'critical' | 'severe';
/** Who is reading: staff (teachers, office, ops) or family (students and parents). */
export type BandAudience = 'staff' | 'family';

export interface TmlBand {
  key: TmlBandKey;
  /** Lowest score in the band (inclusive). */
  min: number;
  range: string;
  /** Fill colour. */
  color: string;
  /** Text on the fill: navy, except white on the crimson bottom band (every pair passes 4.5:1; see lib/ui/contrast.test). */
  ink: string;
  label: Record<BandAudience, string>;
}

export const TML_BANDS: readonly TmlBand[] = [
  { key: 'exemplary', min: 90, range: '90–100', color: '#10B981', ink: '#0B1F3A', label: { staff: 'Exemplary', family: 'Exemplary' } },
  { key: 'proficient', min: 75, range: '75–89', color: '#34D399', ink: '#0B1F3A', label: { staff: 'Proficient', family: 'Proficient' } },
  { key: 'developing', min: 50, range: '50–74', color: '#F5B60B', ink: '#0B1F3A', label: { staff: 'Developing', family: 'Developing' } },
  { key: 'critical', min: 35, range: '35–49', color: '#F98A4B', ink: '#0B1F3A', label: { staff: 'Critical gap', family: 'Critical gap' } },
  { key: 'severe', min: -Infinity, range: 'under 35', color: '#E11D48', ink: '#FFFFFF', label: { staff: 'Severe need', family: 'Needs support' } },
];

export const tmlBand = (score: number): TmlBand => TML_BANDS.find(b => score >= b.min)!;
export const tmlBandByKey = (key: TmlBandKey): TmlBand => TML_BANDS.find(b => b.key === key)!;
export const bandColor = (score: number) => tmlBand(score).color;
export const bandInk = (score: number) => tmlBand(score).ink;
export const bandLabel = (score: number, audience: BandAudience) => tmlBand(score).label[audience];

const ENGINE_KEY: Record<string, TmlBandKey> = {
  Exemplary: 'exemplary', Proficient: 'proficient', Developing: 'developing', 'Critical Gap': 'critical', 'Severe Need': 'severe',
};
/** Display wording for a band name the engine produced (mapMasteryBand's band), for the given reader. */
export const engineBandLabel = (name: string, audience: BandAudience) => {
  const key = ENGINE_KEY[name];
  return key ? tmlBandByKey(key).label[audience] : name;
};
