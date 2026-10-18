import { choices, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Tropic movements (NCERT Class 10 "Control and Coordination", Activity 6.2:
 * a seedling in a conical flask, lit from one side; a potted plant laid on
 * its side). Shoots grow towards light (positive phototropism) and away from
 * gravity (negative geotropism); roots grow towards gravity (positive
 * geotropism) and away from light. Auxin made at the shoot tip collects on
 * the shaded side, making those cells grow longer, so the shoot bends towards
 * the light. Light wins over gravity for the shoot.
 */

export type Light = 'above' | 'left' | 'right' | 'dark';
export type TropismParams = { light: Light; pot: 'upright' | 'side'; days: number };

export type Dir = 'up' | 'down' | 'left' | 'right';

export function solveTropism(p: TropismParams): { shoot: Dir; root: Dir; auxin: string; kind: string } {
  // "up" is always away from the ground; laying the pot on its side doesn't change which way is up.
  const shoot: Dir = p.light === 'left' ? 'left' : p.light === 'right' ? 'right' : 'up';
  const root: Dir = 'down';
  const auxin = p.light === 'left' ? 'the right (shaded) side' : p.light === 'right' ? 'the left (shaded) side' : p.light === 'dark' && p.pot === 'side' ? 'the lower side' : 'evenly all round';
  const kind = p.light === 'left' || p.light === 'right' ? 'Phototropism (shoot) and geotropism (root)' : p.pot === 'side' ? 'Geotropism: shoot away from gravity, root towards it' : 'Straight growth: no one-sided stimulus';
  return { shoot, root, auxin, kind };
}

const SHOOT_TEXT: Record<Dir, string> = { up: 'Straight up, away from the ground', down: 'Downwards', left: 'Bends to the left, towards the light', right: 'Bends to the right, towards the light' };

const predictions: PredictionTemplate<TropismParams>[] = [
  {
    id: 'shoot', label: 'Which way the shoot grows', topic: 'Tropic movements in plants',
    build: p => {
      const s = solveTropism(p);
      const c = choices(SHOOT_TEXT[s.shoot], Object.values(SHOOT_TEXT), 341);
      return { prompt: `${p.pot === 'side' ? 'The pot is laid on its side' : 'The pot stands upright'}${p.light === 'dark' ? ' in the dark' : `, lit from ${p.light === 'above' ? 'above' : `the ${p.light}`}`}. After a few days, which way does the shoot grow?`, ...c, explain: `${s.kind}. Shoots grow towards light and away from gravity; with light from one side, the light wins.` };
    },
  },
  {
    id: 'root', label: 'Which way the root grows', topic: 'Tropic movements in plants',
    applies: p => p.pot === 'side',
    build: () => {
      const c = choices('Bends downwards, towards gravity', ['Bends upwards, away from gravity', 'Keeps growing sideways', 'Stops growing'], 342);
      return { prompt: 'With the pot on its side, which way does the root grow?', ...c, explain: 'Roots show positive geotropism: they turn to grow downwards, towards the pull of gravity, wherever the pot is.' };
    },
  },
  {
    id: 'auxin', label: 'Where the auxin collects', topic: 'Introduction to plant hormones',
    applies: p => p.light === 'left' || p.light === 'right',
    build: p => {
      const s = solveTropism(p);
      const shaded = p.light === 'left' ? 'right' : 'left', lit = p.light;
      const c = choices(`On the ${shaded} side, away from the light`, [`On the ${lit} side, facing the light`, 'Evenly all round the tip', 'Only in the root'], 343);
      return { prompt: 'Where does the hormone auxin collect in the shoot tip?', ...c, explain: `Auxin moves away from the light to ${s.auxin}. It makes the cells there grow longer, so that side grows faster and the shoot bends towards the light.` };
    },
  },
];

export const tropism: LabEngine<TropismParams> = {
  id: 'tropism',
  title: 'Tropic movements',
  blurb: 'Light a seedling from one side or lay the pot down, and see the shoot and root turn: phototropism, geotropism and auxin.',
  subject: 'Science',
  classes: [10],
  chapters: ['Control and Coordination'],
  params: [
    { kind: 'choice', key: 'light', label: 'Light', default: 'left', options: [{ value: 'above', label: 'From above' }, { value: 'left', label: 'From the left' }, { value: 'right', label: 'From the right' }, { value: 'dark', label: 'Dark' }] },
    { kind: 'choice', key: 'pot', label: 'Pot', default: 'upright', options: [{ value: 'upright', label: 'Upright' }, { value: 'side', label: 'Laid on its side' }] },
    { kind: 'number', key: 'days', label: 'Days', unit: '', min: 0, max: 7, step: 1, default: 4 },
  ],
  readouts: p => {
    const s = solveTropism(p);
    return [
      { label: 'Shoot', value: SHOOT_TEXT[s.shoot] },
      { label: 'Root', value: 'Grows downwards' },
      { label: 'Auxin collects', value: s.auxin },
      { label: 'Response', value: s.kind },
    ];
  },
  predictions,
};
