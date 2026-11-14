import type { MicroscopeParams } from './engines/microscope';

/**
 * Focusing the 3D microscope. `z` is how far the stage has been raised (mm)
 * from where the 10× objective is roughly in focus: coarse knob + fine knob.
 *
 * The objectives are nearly parfocal: each is sharp at a slightly different
 * height, so after turning the nosepiece only a touch of fine focus is needed.
 * The depth of field shrinks fast with magnification, which is why the coarse
 * knob is useless at 40× — and the working distance there is under a
 * millimetre, which is why it is dangerous. Figures are typical of a school
 * compound microscope.
 */

type Objective = MicroscopeParams['objective'];

export const FOCUS: Record<Objective, { sharpAt: number; depth: number; working: number }> = {
  '4': { sharpAt: 0, depth: 0.12, working: 17 },
  '10': { sharpAt: 0.02, depth: 0.03, working: 7 },
  '40': { sharpAt: 0.05, depth: 0.006, working: 0.6 },
};

/** How far each knob travels (mm) and the smallest step it can make. */
export const COARSE = { min: -3, max: 3, step: 0.05 };
export const FINE = { min: -0.15, max: 0.15, step: 0.002 };
export const MAX_BLUR = 16;

/** How blurred the image is (px on the eyepiece view): 0 inside the depth of field, growing with the distance from it. */
export function blurOf(objective: Objective, z: number): number {
  const f = FOCUS[objective];
  return Math.min(MAX_BLUR, Math.max(0, (Math.abs(z - f.sharpAt) / f.depth - 1) * 2.2));
}

/** Has the stage been raised until the slide touches the objective? */
export const touching = (objective: Objective, z: number) => z - FOCUS[objective].sharpAt >= FOCUS[objective].working;
