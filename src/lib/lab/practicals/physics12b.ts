import { pick, read, shuffled } from '../noise';
import { combined, imageOf } from '../engines/lensBench';
import { deviationAt, minDeviation, nFrom } from '../engines/prismDev';
import { lateralShift, liquidLens, mirrorLiquid } from '../engines/refractive';
import { DIODES, diodeCurrent, ldrResistance, LDR } from '../engines/diode';
import { widthOf } from '../engines/waveOptics';
import { ITEMS } from '../engines/components';
import { mean, numeric, observation, r, tol } from './helpers';
import type { Practical } from './types';

/**
 * CBSE Class XII Physics (042) practicals, 2026-27, Section B: experiments 1-9
 * and activities 1-7 (Physics_SecP2_2026-27.pdf). Official wording kept as printed.
 */

const base = { cls: 12 as const, subject: 'Physics' as const, section: 'B' as const };
const id = (part: 'e' | 'a', no: number) => `p12-b${part}${String(no).padStart(2, '0')}`;
const RAY = 'Ray Optics and Optical Instruments';
const MIRROR = 'Reflection; spherical mirrors; mirror formula';
const LENS = "Refraction at spherical surfaces; lenses; thin lens formula; lens maker's formula";
const MAG = 'Magnification; power of a lens; combination of thin lenses in contact';
const REFRACTION = 'Refraction; total internal reflection and optical fibres';
const SEMICON = 'Semiconductor Electronics: Materials, Devices and Simple Circuits';
const SEMI = 'Semiconductor diode: I-V characteristics in forward and reverse bias';
const BENCH = { f: 15, u: 25, f2: 20 };
const RF = { n: 1.5, t: 3, f1: 15, R: 40, i: 45 };
const DIODE = { material: 'si', bias: 'forward', V: 0.7, d: 20, wave: 'half', Vm: 12 };
const PARTS = { core: 'none', bulbs: 2, heater: 'off', fault: 'ammeter-parallel' };

/** A bench position read off the scale: to 0.1 cm, with the parallax of locating the image. */
const pos = (rng: () => number, x: number) => read(rng, x, 0.1, { abs: 0.25 });
const LIQUIDS: Record<string, number> = { Water: 1.33, Kerosene: 1.44, Glycerine: 1.47, Turpentine: 1.47 };

/** u-v readings for a converging element of focal length f, with f = uv/(u + v) worked for each. */
function uvRows(rng: () => number, f: number) {
  return [1.4, 1.6, 1.8, 2, 2.4, 3].map(k => {
    const u = Math.round(k * f), v = pos(rng, imageOf(f, u));
    return { u, v, f: r((u * v) / (u + v), 2) };
  });
}
const uvCols = [{ key: 'u', label: 'u', unit: 'cm' }, { key: 'v', label: 'v', unit: 'cm' }, { key: 'f', label: 'f = uv/(u + v)', unit: 'cm' }];

export const PHYSICS12_B: Practical[] = [
  {
    ...base, id: id('e', 1), no: 1, part: 'experiment', kind: 'numeric',
    official: 'To find the value of v for different values of u in case of a concave mirror and to find the focal length.',
    title: 'Concave mirror: u-v and focal length',
    chapter: RAY, topic: MIRROR,
    aim: 'To find the image distance v for different object distances u for a concave mirror, and its focal length.',
    apparatus: ['Optical bench with three uprights', 'Concave mirror with holder', 'Two optical needles', 'Index rod', 'Half-metre scale'],
    procedure: [
      'Find the rough focal length by forming the image of a distant object on a wall.',
      'Fix the mirror and put the object needle beyond its focus; locate the inverted image with the image needle by removing parallax tip to tip.',
      'Note the positions of the mirror, object and image needles. Take six readings for different u.',
      'Work out f = uv/(u + v) for each, and plot v against u and 1/v against 1/u.',
    ],
    precautions: ['Remove parallax tip to tip.', 'Apply the index correction for each distance.', 'Keep the needle tips at the height of the pole of the mirror.'],
    setups: [{ engine: 'lens-bench', params: { device: 'concave-mirror', ...BENCH }, label: 'Concave mirror on the bench' }],
    readings: rng => {
      const f = pick(rng, [10, 12, 15, 18, 20]), rows = uvRows(rng, f), fm = r(mean(rows.map(x => x.f)), 2);
      return numeric(['Distances measured from the pole, index correction applied'], uvCols, rows, ['f'], [
        { label: 'Focal length of the mirror', unit: 'cm', value: fm, tolerance: tol(fm, 0.02, 0.3), working: `Mean of uv/(u + v) for the six readings = ${fm} cm.`, accepted: `${f} cm (the mirror's marked focal length)` },
      ]);
    },
    viva: [
      { q: 'Where is the image when the object is at the centre of curvature?', a: 'At the centre of curvature too: real, inverted and the same size (u = v = 2f).', source: 'authored' },
      { q: 'Why do we remove parallax rather than use a screen?', a: 'The needle image is in the air; parallax disappears only when the image needle is exactly where the image is.', source: 'authored' },
    ],
    conclusion: 'v falls as u increases; uv/(u + v) is the same for every reading and gives the focal length of the mirror.',
  },
  {
    ...base, id: id('e', 2), no: 2, part: 'experiment', kind: 'numeric',
    official: 'To find the focal length of a convex mirror, using a convex lens.',
    title: 'Convex mirror, with a convex lens',
    chapter: RAY, topic: MIRROR,
    aim: 'To find the focal length of a convex mirror with the help of a convex lens.',
    apparatus: ['Optical bench with four uprights', 'Convex lens', 'Convex mirror', 'Two optical needles', 'Index rod'],
    procedure: [
      'With the lens alone, find the real image I of the object needle and mark it with the image needle.',
      'Put the convex mirror between the lens and I, and move it until the image of the object coincides with the object itself (no parallax).',
      'The rays now fall normally on the mirror, so I is its centre of curvature: R = (lens to I) − (lens to mirror).',
      'Repeat for three object distances; f = R/2.',
    ],
    precautions: ['Use a lens of larger focal length than the mirror, so I lies beyond the mirror.', 'Keep the principal axes of the lens and the mirror in one line.'],
    setups: [{ engine: 'lens-bench', params: { device: 'convex-mirror', f: 15, u: 22, f2: 10 }, label: 'Convex mirror, with a convex lens' }],
    readings: rng => {
      const fl = pick(rng, [15, 18, 20]), fm = pick(rng, [8, 10, 12]), R = 2 * fm;
      const rows = [1.3, 1.4, 1.5].map(k => {
        const u = Math.round(k * fl), v1 = pos(rng, imageOf(fl, u)), x = pos(rng, imageOf(fl, u) - R);
        return { u, v1, x, R: r(v1 - x, 1), f: r((v1 - x) / 2, 2) };
      });
      const f = r(mean(rows.map(x => x.f)), 2);
      return numeric([`Convex lens of focal length about ${fl} cm`], [{ key: 'u', label: 'Object to lens', unit: 'cm' }, { key: 'v1', label: 'Lens to image I', unit: 'cm' }, { key: 'x', label: 'Lens to mirror', unit: 'cm' }, { key: 'R', label: 'R', unit: 'cm' }, { key: 'f', label: 'f = R/2', unit: 'cm' }], rows, ['R', 'f'], [
        { label: 'Focal length of the convex mirror', unit: 'cm', value: f, tolerance: tol(f, 0.04, 0.3), working: `R = v₁ − x for each reading; mean f = R/2 = ${f} cm.`, accepted: `${fm} cm` },
      ]);
    },
    viva: [
      { q: 'Why can the focal length of a convex mirror not be found directly?', a: 'It always forms a virtual image of a real object, which cannot be located on a needle or screen.', source: 'authored' },
      { q: 'Why does the image coincide with the object when the mirror is placed correctly?', a: 'The rays strike the mirror along its radii (normally), so they retrace their path back through the lens.', source: 'authored' },
      { q: 'Why must the lens have a larger focal length than the convex mirror?', a: 'The image I must be farther than R from where the mirror can be placed, so the mirror fits between the lens and I.', source: 'authored' },
    ],
    conclusion: 'The focal length of the convex mirror is half the distance from the mirror to the point I, as found.',
  },
  {
    ...base, id: id('e', 3), no: 3, part: 'experiment', kind: 'numeric',
    official: 'To find the focal length of a convex lens by plotting graphs between u and v or between 1/u and 1/v.',
    title: 'Convex lens: u-v and 1/u-1/v graphs',
    chapter: RAY, topic: LENS,
    aim: 'To find the focal length of a convex lens from graphs of u against v and 1/u against 1/v.',
    apparatus: ['Optical bench with three uprights', 'Convex lens with holder', 'Two optical needles', 'Index rod'],
    procedure: [
      'Find the rough focal length by focusing a distant object on a screen.',
      'Place the object needle beyond the focus and find the image on the other side by removing parallax.',
      'Take six readings of u and v.',
      'Plot v against u (a rectangular hyperbola; the line u = v meets it at 2f) and 1/v against 1/u (a straight line meeting each axis at 1/f).',
    ],
    precautions: ['Keep the lens vertical and the needles at the height of its optical centre.', 'Remove parallax tip to tip.', 'Take u from just above f to beyond 2f.'],
    setups: [{ engine: 'lens-bench', params: { device: 'convex-lens', ...BENCH }, label: 'Convex lens on the bench' }],
    readings: rng => {
      const f = pick(rng, [10, 12, 15, 18, 20]), rows = uvRows(rng, f).map(x => ({ ...x, iu: r(1 / x.u, 4), iv: r(1 / (x.v as number), 4) }));
      const fm = r(mean(rows.map(x => x.f)), 2);
      return numeric(['Distances from the optical centre, index correction applied'], [...uvCols.slice(0, 2), { key: 'iu', label: '1/u', unit: 'cm⁻¹' }, { key: 'iv', label: '1/v', unit: 'cm⁻¹' }, uvCols[2]], rows, ['iu', 'iv', 'f'], [
        { label: 'Focal length of the lens', unit: 'cm', value: fm, tolerance: tol(fm, 0.02, 0.3), working: `Mean of uv/(u + v) = ${fm} cm; the 1/u-1/v line cuts each axis at about ${r(1 / fm, 4)} cm⁻¹.`, accepted: `${f} cm` },
      ]);
    },
    viva: [
      { q: 'What does the 1/v against 1/u graph look like?', a: 'A straight line with slope −1 cutting both axes at 1/f.', source: 'authored' },
      { q: 'What is the least distance between an object and its real image?', a: '4f, when u = v = 2f.', source: 'authored' },
    ],
    conclusion: 'Both graphs give the same focal length for the convex lens, as found.',
  },
  {
    ...base, id: id('e', 4), no: 4, part: 'experiment', kind: 'numeric',
    official: 'To find the focal length of a concave lens, using a convex lens.',
    title: 'Concave lens, with a convex lens',
    chapter: RAY, topic: LENS,
    aim: 'To find the focal length of a concave lens with the help of a convex lens.',
    apparatus: ['Optical bench with four uprights', 'Convex lens', 'Concave lens (weaker than the convex lens)', 'Two optical needles', 'Index rod'],
    procedure: [
      'With the convex lens alone, form the real image I₁ of the object needle and note its position.',
      'Put the concave lens between the convex lens and I₁. The image moves away to I₂; locate it with the image needle.',
      'I₁ is a virtual object for the concave lens: u = (concave lens to I₁), v = (concave lens to I₂).',
      'f = uv/(u − v) for a concave lens; repeat for five positions of the concave lens.',
    ],
    precautions: ['The concave lens must be weaker than the convex lens, so the pair still forms a real image.', 'Keep both lenses coaxial.'],
    setups: [{ engine: 'lens-bench', params: { device: 'concave-lens', f: 15, u: 25, f2: 20 }, label: 'Concave lens, with a convex lens' }],
    readings: rng => {
      const fc = pick(rng, [15, 20, 25]), fx = pick(rng, [10, 12]), u0 = Math.round(1.6 * fx), I1 = imageOf(fx, u0);
      const rows = [0.55, 0.6, 0.65, 0.7, 0.75].map(k => {
        const uc = k * fc, vc = (uc * fc) / (fc - uc), d = I1 - uc;
        const p1 = pos(rng, I1), pl = pos(rng, d), p2 = pos(rng, d + vc), u = r(p1 - pl, 1), v = r(p2 - pl, 1);
        return { I1: p1, L: pl, I2: p2, u, v, f: r((u * v) / (v - u), 2) };
      });
      const f = r(mean(rows.map(x => x.f)), 2);
      return numeric([`Convex lens ${fx} cm, object ${u0} cm in front of it; positions measured from the convex lens`], [{ key: 'I1', label: 'I₁ (lens alone)', unit: 'cm' }, { key: 'L', label: 'Concave lens at', unit: 'cm' }, { key: 'I2', label: 'I₂', unit: 'cm' }, { key: 'u', label: 'u', unit: 'cm' }, { key: 'v', label: 'v', unit: 'cm' }, { key: 'f', label: '|f| = uv/(v − u)', unit: 'cm' }], rows, ['u', 'v', 'f'], [
        { label: 'Focal length of the concave lens (magnitude)', unit: 'cm', value: f, tolerance: tol(f, 0.08, 0.5), working: `|f| = uv/(v − u) for each position; mean ${f} cm, so f = −${f} cm.`, accepted: `${fc} cm (marked −${fc} cm)` },
      ]);
    },
    viva: [
      { q: 'Why is a convex lens needed?', a: 'A concave lens alone forms only virtual images of real objects; the convex lens gives it a virtual object, so it forms a real image.', source: 'authored' },
      { q: 'Why must the concave lens be weaker?', a: 'Otherwise the combination diverges and no real image is formed.', source: 'authored' },
      { q: 'Why is the image formed farther away when the concave lens is added?', a: 'The diverging lens bends the converging rays less sharply together, so they meet farther away.', source: 'authored' },
    ],
    conclusion: 'The focal length of the concave lens is as found, with a negative sign.',
  },
  {
    ...base, id: id('e', 5), no: 5, part: 'experiment', kind: 'numeric',
    official: 'To determine angle of minimum deviation for a given prism by plotting a graph between angle of incidence and angle of deviation.',
    title: 'Prism: i-δ graph and minimum deviation',
    chapter: RAY, topic: 'Refraction through a prism',
    aim: 'To find the angle of minimum deviation of a prism from the graph of angle of incidence against angle of deviation.',
    apparatus: ['Glass prism', 'Drawing board and white sheet', 'Drawing pins', 'Four pins', 'Protractor', 'Scale'],
    procedure: [
      'Trace the prism outline on the sheet. Draw a normal on one face and an incident ray at angle i.',
      'Fix two pins on the incident ray, look through the other face and fix two pins in line with their images.',
      'Join the emergent ray, extend both rays and measure the deviation δ.',
      'Repeat for i from 30° to 60°; plot δ against i. The lowest point of the curve is δₘ; n = sin((A + δₘ)/2)/sin(A/2).',
    ],
    precautions: ['Keep the pins vertical and at least 5 cm apart.', 'Look at the feet of the pins.', 'Keep the prism on its outline for every reading.'],
    setups: [{ engine: 'prism-dev', params: { n: 1.52, A: 60, i: 40 }, label: 'Ray through the prism' }],
    readings: rng => {
      const n = pick(rng, [1.48, 1.5, 1.52, 1.55]), A = 60;
      const rows = [30, 35, 40, 45, 48, 51, 55, 60].filter(i => deviationAt(n, A, i)).map(i => ({ i, d: read(rng, deviationAt(n, A, i)!.d, 0.5, { abs: 0.3 }) }));
      const dm = Math.min(...rows.map(x => x.d)), nn = r(nFrom(A, dm), 3);
      return numeric([`Prism angle A = ${A}°`], [{ key: 'i', label: 'Angle of incidence i', unit: '°' }, { key: 'd', label: 'Angle of deviation δ', unit: '°' }], rows, [], [
        { label: 'Angle of minimum deviation', unit: '°', value: dm, tolerance: 1, working: `The lowest point of the i-δ graph: δₘ = ${dm}°.`, accepted: `${r(minDeviation(n, A), 1)}°` },
        { label: 'Refractive index of the glass', unit: '', value: nn, tolerance: 0.02, working: `n = sin((60 + ${dm})/2)/sin 30° = ${nn}.`, accepted: `${n}` },
      ]);
    },
    viva: [
      { q: 'What is true of the ray at minimum deviation?', a: 'It passes through the prism symmetrically: i = e and r₁ = r₂ = A/2.', source: 'authored' },
      { q: 'Does δₘ depend on the colour of the light?', a: 'Yes. n is larger for violet, so violet is deviated more than red.', source: 'authored' },
    ],
    conclusion: 'δ first falls and then rises with i; the angle of minimum deviation is as found.',
  },
  {
    ...base, id: id('e', 6), no: 6, part: 'experiment', kind: 'numeric',
    official: 'To determine refractive index of a glass slab using a travelling microscope.',
    title: 'Glass slab: n with a travelling microscope',
    chapter: RAY, topic: REFRACTION,
    aim: 'To find the refractive index of a glass slab from its real and apparent thickness, using a travelling microscope.',
    apparatus: ['Travelling microscope', 'Glass slab', 'Lycopodium powder or chalk dust', 'Paper with an ink cross'],
    procedure: [
      'Find the least count of the microscope scale. Focus on the cross on the base: reading R₁.',
      'Put the slab on the cross and refocus on the cross seen through the glass: R₂.',
      'Sprinkle a little powder on top of the slab and focus on it: R₃.',
      'Real thickness R₃ − R₁, apparent thickness R₃ − R₂, n = (R₃ − R₁)/(R₃ − R₂). Take three sets.',
    ],
    precautions: ['Move the microscope only upwards, in one direction, to avoid backlash.', 'Focus on the cross, not on scratches on the glass.', 'Use a thin layer of powder.'],
    setups: [{ engine: 'refractive', params: { mode: 'microscope', ...RF }, label: 'Slab under the microscope' }],
    readings: rng => {
      const n = pick(rng, [1.48, 1.5, 1.52, 1.55]), t = pick(rng, [2, 2.5, 3, 3.5]);
      const rows = [0, 1, 2].map(() => {
        const R1 = read(rng, 4 + rng() * 2, 0.001), R2 = read(rng, R1 + t - t / n, 0.001, { abs: 0.003 }), R3 = read(rng, R1 + t, 0.001, { abs: 0.003 });
        return { R1, R2, R3, real: r(R3 - R1, 3), app: r(R3 - R2, 3), n: r((R3 - R1) / (R3 - R2), 3) };
      });
      const nm = r(mean(rows.map(x => x.n)), 3);
      return numeric(['Least count of the microscope 0.001 cm'], [{ key: 'R1', label: 'R₁ (cross)', unit: 'cm' }, { key: 'R2', label: 'R₂ (cross through slab)', unit: 'cm' }, { key: 'R3', label: 'R₃ (powder on top)', unit: 'cm' }, { key: 'real', label: 'R₃ − R₁', unit: 'cm' }, { key: 'app', label: 'R₃ − R₂', unit: 'cm' }, { key: 'n', label: 'n', unit: '' }], rows, ['real', 'app', 'n'], [
        { label: 'Refractive index of the slab', unit: '', value: nm, tolerance: tol(nm, 0.02, 0.02), working: `n = (R₃ − R₁)/(R₃ − R₂) for each set; mean ${nm}.`, accepted: `${n}` },
      ]);
    },
    viva: [
      { q: 'Why does the cross appear raised through the slab?', a: 'Light from it bends away from the normal as it leaves the glass, so it seems to come from a point nearer the top.', source: 'authored' },
      { q: 'What is backlash error?', a: 'The screw moves a little before the scale does when its direction is reversed; moving only one way avoids it.', source: 'authored' },
    ],
    photos: ['travelling-microscope'],
    conclusion: 'The refractive index of the glass slab, from real and apparent thickness, is as found.',
  },
  {
    ...base, id: id('e', 7), no: 7, part: 'experiment', kind: 'numeric',
    official: 'To find the refractive index of a liquid using convex lens and plane mirror.',
    title: 'Liquid: n with a convex lens and plane mirror',
    chapter: RAY, topic: LENS,
    aim: 'To find the refractive index of a liquid using a convex lens and a plane mirror.',
    apparatus: ['Equiconvex lens', 'Plane mirror', 'Optical needle on a clamp stand', 'The liquid', 'Spherometer', 'Plumb line and metre scale'],
    procedure: [
      'Put the lens on the mirror and move the needle above it until its inverted image coincides with it (no parallax). The needle is at f₁ from the lens.',
      'Put a few drops of liquid between the lens and the mirror (a plano-concave liquid lens) and find the new no-parallax height F.',
      'Find the radius R of the lens surface with the spherometer.',
      'f_l = f₁F/(F − f₁) (a concave liquid lens), n = 1 + R/f_l.',
    ],
    precautions: ['Use only a little liquid, with no air bubbles.', 'Measure each height to the middle of the lens, from both faces, and take the mean.'],
    setups: [{ engine: 'refractive', params: { mode: 'lens-liquid', ...RF }, label: 'Liquid under the lens' }],
    readings: rng => {
      const liq = pick(rng, Object.keys(LIQUIDS)), n = LIQUIDS[liq], f1 = pick(rng, [15, 18, 20, 25]), L = liquidLens(f1, n);
      const rows = [0, 1, 2].map(k => ({ set: k + 1, f1: pos(rng, f1), F: pos(rng, L.F) }));
      const a = mean(rows.map(x => x.f1)), b = mean(rows.map(x => x.F)), fl = (a * b) / (b - a), Rm = read(rng, L.R, 0.01, { abs: 0.05 });
      const nn = r(1 + Rm / fl, 3);
      return numeric([`Liquid: ${liq}`, `Radius of the lens surface (spherometer) R = ${Rm} cm`], [{ key: 'set', label: 'Set' }, { key: 'f1', label: 'Lens alone, f₁', unit: 'cm' }, { key: 'F', label: 'Lens with liquid, F', unit: 'cm' }], rows, [], [
        { label: 'Refractive index of the liquid', unit: '', value: nn, tolerance: 0.03, working: `Mean f₁ = ${r(a, 2)} cm, F = ${r(b, 2)} cm; f_l = f₁F/(F − f₁) = ${r(fl, 2)} cm; n = 1 + R/f_l = ${nn}.`, accepted: `${n} (${liq.toLowerCase()})` },
      ]);
    },
    viva: [
      { q: 'What kind of lens does the liquid form?', a: 'A plano-concave lens: flat on the mirror side, concave where it touches the convex lens.', source: 'authored' },
      { q: 'Why does the needle have to be raised after adding the liquid?', a: 'The diverging liquid lens makes the pair weaker, so its focal length F is longer than f₁.', source: 'authored' },
    ],
    conclusion: 'The refractive index of the liquid, from the liquid lens it forms, is as found.',
  },
  {
    ...base, id: id('e', 8), no: 8, part: 'experiment', kind: 'numeric',
    official: 'To find the refractive index of a liquid using a concave mirror and a plane mirror.',
    title: 'Liquid: n with a concave mirror',
    chapter: RAY, topic: REFRACTION,
    aim: 'To find the refractive index of a liquid poured into a concave mirror.',
    apparatus: ['Concave mirror', 'Optical needle on a clamp stand', 'The liquid', 'Plane mirror strip (for the reference level)', 'Metre scale and plumb line'],
    procedure: [
      'Lay the mirror on the table and move the needle above it until the image coincides with it: the needle is at the centre of curvature, height R.',
      'Pour a little liquid into the mirror and find the new no-parallax height R′.',
      'The rays now bend at the liquid surface: n = R/R′. Take three sets.',
    ],
    precautions: ['Use a thin layer of liquid.', 'Measure both heights from the same point (the pole), using the plane mirror strip as a level.'],
    setups: [{ engine: 'refractive', params: { mode: 'mirror-liquid', ...RF }, label: 'Liquid in the mirror' }],
    readings: rng => {
      const liq = pick(rng, Object.keys(LIQUIDS)), n = LIQUIDS[liq], R = pick(rng, [30, 36, 40, 50]);
      const rows = [0, 1, 2].map(k => { const a = pos(rng, R), b = pos(rng, mirrorLiquid(R, n)); return { set: k + 1, R: a, R2: b, n: r(a / b, 3) }; });
      const nn = r(mean(rows.map(x => x.n)), 3);
      return numeric([`Liquid: ${liq}`], [{ key: 'set', label: 'Set' }, { key: 'R', label: 'Empty mirror, R', unit: 'cm' }, { key: 'R2', label: 'With liquid, R′', unit: 'cm' }, { key: 'n', label: 'n = R/R′', unit: '' }], rows, ['n'], [
        { label: 'Refractive index of the liquid', unit: '', value: nn, tolerance: 0.03, working: `n = R/R′ for each set; mean ${nn}.`, accepted: `${n} (${liq.toLowerCase()})` },
      ]);
    },
    viva: [{ q: 'Why does the no-parallax point come down when liquid is added?', a: 'The rays bend towards the normal on entering the liquid, so they meet the mirror normally when coming from a lower point.', source: 'authored' }, { q: 'Why must only a thin layer of liquid be used?', a: 'The method treats the liquid as a thin layer at the pole; a thick layer adds a shift of its own.', source: 'authored' }, { q: 'What happens to R′ for a liquid of higher refractive index?', a: 'R′ = R/n gets smaller: the no-parallax point comes lower still.', source: 'authored' }],
    conclusion: 'The refractive index of the liquid is R/R′, as found.',
  },
  {
    ...base, id: id('e', 9), no: 9, part: 'experiment', kind: 'numeric',
    official: 'To draw the I-V characteristic curve for a p-n junction diode in forward and reverse bias.',
    title: 'p-n junction diode: I-V curve',
    chapter: SEMICON, topic: SEMI,
    aim: 'To draw the I-V characteristic curves of a p-n junction diode in forward and reverse bias.',
    apparatus: ['p-n junction diode', 'DC supply (0-3 V and 0-30 V)', 'Potential divider (rheostat)', 'Milliammeter and microammeter', 'Voltmeters (0-1 V and 0-30 V)', 'Plug key and protective resistor'],
    procedure: [
      'Connect the diode in forward bias (p to +) through the potential divider, with the milliammeter in series and the voltmeter across the diode.',
      'Raise V in small steps and read I; take close readings near the knee.',
      'Reverse the diode, use the microammeter and the higher-range voltmeter, and read I for V up to about 10 V.',
      'Plot both on one graph, forward in the first quadrant and reverse in the third, with different scales.',
    ],
    precautions: ['Use a protective resistor; never exceed the rated forward current.', 'Stay well below the breakdown voltage in reverse.', 'Change to the microammeter for reverse bias.'],
    setups: [
      { engine: 'diode', params: { mode: 'iv', ...DIODE }, label: 'Forward bias' },
      { engine: 'diode', params: { mode: 'iv', ...DIODE, bias: 'reverse', V: 5 }, label: 'Reverse bias' },
    ],
    readings: rng => {
      const m = pick(rng, ['si', 'si', 'ge']), D = DIODES[m];
      const fv = m === 'si' ? [0.2, 0.3, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75] : [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35];
      const fwd = fv.map(V => ({ bias: 'Forward', V, I: read(rng, diodeCurrent(m, 'forward', V) * 1000, 0.01, { sd: 0.02 }), unit: 'mA' }));
      const rev = [2, 4, 6, 8, 10].map(V => ({ bias: 'Reverse', V, I: read(rng, -diodeCurrent(m, 'reverse', V) * 1e6, m === 'si' ? 0.01 : 0.1, { sd: 0.03 }), unit: 'μA' }));
      // The knee: where the forward current reaches 2 mA, read off the student's own curve.
      const j = fwd.findIndex(x => x.I >= 2), a = fwd[Math.max(0, j - 1)], b = fwd[Math.max(0, j)];
      const knee = r(b.I === a.I ? b.V : a.V + ((2 - a.I) * (b.V - a.V)) / (b.I - a.I), 2);
      return numeric([`A ${D.label.toLowerCase()} diode`], [{ key: 'bias', label: 'Bias' }, { key: 'V', label: 'Voltage', unit: 'V' }, { key: 'I', label: 'Current' }, { key: 'unit', label: 'Unit' }], [...fwd, ...rev], [], [
        { label: 'Knee voltage (current reaches 2 mA)', unit: 'V', value: knee, tolerance: 0.03, working: `On the forward curve the current reaches 2 mA at about ${knee} V; beyond it the current rises steeply.`, accepted: `${D.cutIn} V (${D.label.toLowerCase()})` },
      ]);
    },
    viva: [
      { q: 'Why does almost no current flow below the knee voltage?', a: 'The applied voltage must first overcome the barrier potential of the depletion layer.', source: 'authored' },
      { q: 'What carries the small reverse current?', a: 'Minority carriers, made by heat; it hardly changes with voltage until breakdown.', source: 'authored' },
    ],
    conclusion: 'In forward bias the current is tiny until the knee and then rises steeply; in reverse bias only a tiny, almost constant current flows.',
  },

  // Activities
  {
    ...base, id: id('a', 1), no: 1, part: 'activity', kind: 'observation',
    official: 'To identify a diode, an LED, a resistor and a capacitor from a mixed collection of such items.',
    title: 'Identifying diode, LED, resistor, capacitor',
    chapter: SEMICON, topic: SEMI,
    aim: 'To pick out a diode, an LED, a resistor and a capacitor from a mixed collection, by their look and with a multimeter.',
    apparatus: ['A mixed collection of diodes, LEDs, resistors and capacitors', 'Multimeter'],
    procedure: ['Sort the items by appearance.', 'Check each with the multimeter on the diode/resistance range, both ways round.', 'Name each item from both checks.'],
    precautions: ['Discharge a capacitor before testing it.', 'Use the diode-test range for diodes and LEDs.'],
    setups: [{ engine: 'components', params: { mode: 'identify', ...PARTS, item: 'led' }, label: 'Identify a component' }],
    readings: rng => observation(['Each student gets the items in a different order'], [{ key: 'no', label: 'Item' }, { key: 'looks', label: 'What it looks like' }, { key: 'meter', label: 'Multimeter, one way / the other' }, { key: 'is', label: 'It is a' }],
      shuffled(rng, Object.values(ITEMS)).map((it, k) => ({ no: k + 1, looks: it.looks, meter: `${it.forward} / ${it.reverse}`, is: it.label })), ['is']),
    viva: [{ q: 'How can a diode be told from a resistor with a multimeter?', a: 'A diode conducts one way only; a resistor reads the same both ways.', source: 'authored' }, { q: 'How is the cathode of a diode marked?', a: 'By a band (usually silver or white) at that end.', source: 'authored' }, { q: 'How can the longer leg of an LED be used?', a: 'The longer leg is the anode: it goes to the + side for the LED to glow.', source: 'authored' }],
    photos: ['electronic-components'],
    conclusion: 'A diode and an LED conduct one way only (the LED glows); a resistor reads the same both ways; a capacitor charges and then reads open.',
  },
  {
    ...base, id: id('a', 2), no: 2, part: 'activity', kind: 'observation',
    official: 'Use of multimeter to see the unidirectional flow of current in case of a diode and an LED and check whether a given electronic component (e.g., diode) is in working order.',
    title: 'Multimeter: one-way current in a diode and LED',
    chapter: SEMICON, topic: SEMI,
    aim: 'To see with a multimeter that a diode and an LED let current flow one way only, and to check whether a diode works.',
    apparatus: ['Multimeter', 'Diode', 'LED', 'Diodes to test (one may be faulty)'],
    procedure: ['Set the multimeter to the diode range.', 'Put the red lead on the anode and the black on the cathode, then reverse them.', 'A good diode reads about 0.6 V one way and OL the other; a faulty one reads OL both ways (open) or near 0 both ways (shorted).'],
    precautions: ['Do not test components in a live circuit.', 'Note which lead is the anode before testing.'],
    setups: [{ engine: 'components', params: { mode: 'diode', ...PARTS, item: 'diode' }, label: 'Diode on the multimeter' }],
    readings: rng => {
      const fault = pick(rng, ['open', 'shorted']), order = shuffled(rng, ['Diode A', 'Diode B', 'Diode C']);
      const rows = [
        { item: 'LED', fwd: '1.8 V, glows faintly', rev: 'OL', verdict: 'Works: conducts one way' },
        { item: order[0], fwd: '0.6 V', rev: 'OL', verdict: 'Works: conducts one way' },
        { item: order[1], fwd: fault === 'open' ? 'OL' : '0.0 V', rev: fault === 'open' ? 'OL' : '0.0 V', verdict: fault === 'open' ? 'Faulty: open' : 'Faulty: shorted' },
        { item: order[2], fwd: '0.6 V', rev: 'OL', verdict: 'Works: conducts one way' },
      ];
      return observation([], [{ key: 'item', label: 'Item' }, { key: 'fwd', label: 'Red on anode' }, { key: 'rev', label: 'Leads reversed' }, { key: 'verdict', label: 'Conclusion' }], rows, ['verdict']);
    },
    viva: [{ q: 'A diode reads OL both ways. What is wrong?', a: 'The junction is open (burnt out): no current flows either way.', source: 'authored' }, { q: 'Why does a diode conduct only one way?', a: 'In forward bias the depletion layer narrows and charges cross; in reverse bias it widens and blocks them.', source: 'authored' }, { q: 'A diode reads near 0 V both ways. What is wrong?', a: 'It is shorted: it conducts both ways and no longer rectifies.', source: 'authored' }],
    conclusion: 'A working diode or LED conducts in one direction only; the multimeter shows which one is faulty.',
  },
  {
    ...base, id: id('a', 3), no: 3, part: 'activity', kind: 'numeric',
    official: 'To study effect of intensity of light (by varying distance of the source) on an LDR.',
    title: 'LDR and the distance of a lamp',
    chapter: SEMICON, topic: 'Energy bands in conductors, semiconductors and insulators',
    aim: 'To study how the resistance of an LDR changes with the intensity of light, by moving a lamp away.',
    apparatus: ['LDR', 'Lamp (60 W) on a stand', 'Multimeter', 'Metre scale', 'Dark room or box'],
    procedure: ['Fix the LDR facing the lamp in a darkened room.', 'Read the LDR resistance with the lamp 10 cm away.', 'Move the lamp away in steps and read the resistance each time.', 'Plot R against d, and log R against log d.'],
    precautions: ['Keep stray light out.', 'Keep the lamp and the LDR on one line.', 'Wait for the reading to settle.'],
    setups: [{ engine: 'diode', params: { mode: 'ldr', ...DIODE }, label: 'LDR and lamp' }],
    readings: rng => {
      const rows = [10, 15, 20, 30, 40, 50].map(d => { const R = read(rng, ldrResistance(d), 1, { sd: 0.02 }); return { d, R, lr: r(Math.log10(R), 3), ld: r(Math.log10(d), 3) }; });
      const xs = rows.map(x => Math.log10(x.d)), ys = rows.map(x => Math.log10(x.R)), mx = mean(xs), my = mean(ys);
      const k = r(xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0), 2);
      return numeric([`${LDR.E} V across the LDR, lamp in a dark room`], [{ key: 'd', label: 'Lamp distance d', unit: 'cm' }, { key: 'R', label: 'LDR resistance', unit: 'Ω' }, { key: 'ld', label: 'log d' }, { key: 'lr', label: 'log R' }], rows, ['ld', 'lr'], [
        { label: 'Slope of log R against log d', unit: '', value: k, tolerance: 0.1, working: `The log-log graph is a straight line of slope ${k}: R rises as about d^${k}.`, accepted: `${LDR.gamma}` },
      ]);
    },
    viva: [{ q: 'Why does an LDR conduct better in bright light?', a: 'Light gives electrons enough energy to cross the band gap, making more free charge carriers.', source: 'authored' }, { q: 'Give two uses of an LDR.', a: 'Street lamps that switch on at dusk, and light meters in cameras.', source: 'authored' }, { q: 'Why does the light intensity fall as the lamp moves away?', a: 'It spreads over a larger area: intensity falls as 1/d².', source: 'authored' }],
    conclusion: 'The resistance of the LDR rises as the lamp moves away (less intense light) and falls in brighter light.',
  },
  {
    ...base, id: id('a', 4), no: 4, part: 'activity', kind: 'numeric',
    official: 'To observe refraction and lateral deviation of a beam of light incident obliquely on a glass slab.',
    title: 'Glass slab: refraction and lateral shift',
    chapter: RAY, topic: REFRACTION,
    aim: 'To observe that a ray through a glass slab comes out parallel to itself but shifted sideways, and to measure the shift.',
    apparatus: ['Rectangular glass slab', 'Drawing board, sheet and pins', 'Protractor and scale'],
    procedure: ['Trace the slab. Draw an incident ray at angle i and fix two pins on it.', 'Look through the opposite face and fix two pins in line with their images.', 'Join the emergent ray and the ray inside the glass; measure r and the perpendicular distance between the incident ray (produced) and the emergent ray.', 'Repeat for three angles.'],
    precautions: ['Keep the slab on its outline.', 'Keep the pins vertical and well apart.'],
    setups: [{ engine: 'refractive', params: { mode: 'slab', ...RF }, label: 'Ray through the slab' }],
    readings: rng => {
      const n = pick(rng, [1.48, 1.5, 1.52]), t = pick(rng, [4, 5, 6]);
      const rows = [30, 45, 60].map(i => { const s = lateralShift(t, n, i), rr = read(rng, s.r, 0.5, { abs: 0.4 }); return { i, r: rr, ratio: r(Math.sin((i * Math.PI) / 180) / Math.sin((rr * Math.PI) / 180), 3), d: read(rng, s.d * 10, 1, { abs: 0.6 }) }; });
      const nm = r(mean(rows.map(x => x.ratio)), 3);
      return numeric([`Slab ${t} cm thick`], [{ key: 'i', label: 'i', unit: '°' }, { key: 'r', label: 'r', unit: '°' }, { key: 'ratio', label: 'sin i / sin r' }, { key: 'd', label: 'Lateral shift', unit: 'mm' }], rows, ['ratio'], [
        { label: 'Refractive index of the glass', unit: '', value: nm, tolerance: 0.05, working: `Mean of sin i / sin r = ${nm}.`, accepted: `${n}` },
      ]);
    },
    viva: [{ q: 'Why does the ray come out parallel to the incident ray?', a: 'The two faces are parallel, so the bending at the second face exactly undoes the bending at the first.', source: 'authored' }, { q: 'On what does the lateral shift depend?', a: 'The thickness of the slab, the angle of incidence and the refractive index; it grows with each.', source: 'authored' }, { q: 'Is there a lateral shift at normal incidence?', a: 'No: a ray along the normal goes straight through with no shift.', source: 'authored' }],
    conclusion: 'The emergent ray is parallel to the incident ray; the lateral shift grows with the angle of incidence and the thickness of the slab.',
  },
  {
    ...base, id: id('a', 5), no: 5, part: 'activity', kind: 'observation',
    official: 'To observe diffraction of light due to a thin slit.',
    title: 'Diffraction at a thin slit',
    chapter: 'Wave Optics', topic: 'Diffraction due to a single slit; width of central maximum',
    aim: 'To observe the diffraction pattern of light through a thin slit and how it changes with the slit width.',
    apparatus: ['Two razor blades (or an adjustable slit)', 'Glass plate', 'Laser pointer or a bulb with a straight filament', 'Screen'],
    procedure: ['Hold two razor blades edge to edge to form a narrow slit.', 'Look at the lamp filament through the slit, or shine the laser through it on a screen 1 m away.', 'Narrow and widen the slit and note the pattern.'],
    precautions: ['Never look into a laser beam.', 'Keep the slit parallel to the filament.'],
    setups: [{ engine: 'wave-optics', params: { mode: 'single', lambda: 650, gap: 0.2, D: 1 }, label: 'Single slit' }],
    readings: rng => {
      const lambda = pick(rng, [532, 650]), slits = shuffled(rng, [0.1, 0.2, 0.3]);
      return observation([`${lambda === 650 ? 'Red' : 'Green'} laser (${lambda} nm), screen 1 m away`], [{ key: 'a', label: 'Slit width', unit: 'mm' }, { key: 'w', label: 'Central band width', unit: 'mm' }, { key: 'seen', label: 'What is seen' }],
        slits.map(a => ({ a, w: r(widthOf({ mode: 'single', lambda, gap: a, D: 1 }), 1), seen: a === 0.1 ? 'Widest central band, faint side bands spread out' : a === 0.2 ? 'Central band narrower, side bands closer' : 'Narrowest central band; pattern close together' })), ['seen']);
    },
    viva: [{ q: 'What happens to the central band as the slit is narrowed?', a: 'It widens: its width 2λD/a is inversely proportional to the slit width.', source: 'authored' }, { q: 'How is diffraction different from interference?', a: 'Diffraction is from different parts of one wavefront through one slit; its bands are of unequal brightness and the central one is twice as wide.', source: 'authored' }],
    conclusion: 'Light spreads past a thin slit into a bright central band with fainter bands on each side; the narrower the slit, the wider the pattern.',
  },
  {
    ...base, id: id('a', 6), no: 6, part: 'activity', kind: 'observation',
    official: 'To study the nature and size of the image formed by a (i) convex lens, or (ii) concave mirror, on a screen by using a candle and a screen (for different distances of the candle from the lens/mirror).',
    title: 'Images of a candle: lens or mirror',
    chapter: RAY, topic: MAG,
    aim: 'To study the nature and size of the image a convex lens or a concave mirror forms of a candle at different distances.',
    apparatus: ['Convex lens or concave mirror with stand', 'Candle', 'Screen', 'Metre scale'],
    procedure: ['Find the rough focal length using a distant object.', 'Place the candle well beyond 2F and move the screen to get a sharp image; note its size and nature.', 'Move the candle to 2F, between F and 2F, at F and within F, noting the image each time.'],
    precautions: ['Keep the flame, the centre of the lens or mirror and the screen at one height.', 'Shield the candle from draughts.'],
    setups: [{ engine: 'lens-bench', params: { device: 'convex-lens', ...BENCH }, label: 'Candle and lens' }],
    readings: rng => {
      const dev = pick(rng, ['Convex lens', 'Concave mirror']), f = pick(rng, [10, 15, 20]);
      const at = [{ k: 3, where: 'Beyond 2F' }, { k: 2, where: 'At 2F' }, { k: 1.5, where: 'Between F and 2F' }, { k: 1, where: 'At F' }, { k: 0.6, where: 'Within F' }];
      const rows = at.map(({ k, where }) => {
        const u = Math.round(k * f);
        if (k === 1) return { where, u, v: 'At infinity', nature: 'Real, inverted', size: 'Highly enlarged (no sharp image)' };
        if (k < 1) return { where, u, v: 'None on the screen', nature: dev === 'Convex lens' ? 'Virtual, erect (seen through the lens)' : 'Virtual, erect (seen in the mirror)', size: 'Enlarged' };
        const v = r(imageOf(f, u), 1);
        return { where, u, v, nature: 'Real, inverted', size: k > 2 ? 'Diminished' : k === 2 ? 'Same size' : 'Enlarged' };
      });
      return observation([`${dev}, focal length ${f} cm`], [{ key: 'where', label: 'Candle' }, { key: 'u', label: 'u', unit: 'cm' }, { key: 'v', label: 'Screen at', unit: 'cm' }, { key: 'nature', label: 'Nature' }, { key: 'size', label: 'Size' }], rows, ['nature', 'size']);
    },
    viva: [{ q: 'Where must the candle be to get an image of the same size?', a: 'At 2F (the centre of curvature for a mirror); the image is then also at 2F.', source: 'authored' }],
    conclusion: 'The image is real and inverted while the candle is beyond F, getting larger as it approaches F; within F it is virtual, erect and enlarged.',
  },
  {
    ...base, id: id('a', 7), no: 7, part: 'activity', kind: 'numeric',
    official: 'To obtain a lens combination with the specified focal length by using two lenses from the given set of lenses.',
    title: 'Lens combination of a given focal length',
    chapter: RAY, topic: MAG,
    aim: 'To choose two lenses from a set that together have a given focal length, and check it on the bench.',
    apparatus: ['A set of convex lenses of known focal length', 'Optical bench', 'Object and image needles'],
    procedure: ['Work out which pair gives the required F from 1/F = 1/f₁ + 1/f₂.', 'Put the two lenses in contact on one upright.', 'Find v for three values of u and work out F = uv/(u + v).'],
    precautions: ['Keep the lenses in close contact and coaxial.', 'Remove parallax tip to tip.'],
    setups: [{ engine: 'lens-bench', params: { device: 'combo', f: 15, u: 25, f2: 30 }, label: 'Two lenses in contact' }],
    readings: rng => {
      const set = [10, 15, 20, 30, 40], [a, b] = shuffled(rng, set).slice(0, 2), F = r(combined(a, b), 2);
      const rows = [2, 2.5, 3].map(k => { const u = Math.round(k * F), v = pos(rng, imageOf(F, u)); return { u, v, F: r((u * v) / (u + v), 2) }; });
      const Fm = r(mean(rows.map(x => x.F)), 2);
      return numeric([`Lenses available: ${set.join(', ')} cm`, `Required focal length: ${F} cm (pair: ${Math.min(a, b)} cm and ${Math.max(a, b)} cm)`], [{ key: 'u', label: 'u', unit: 'cm' }, { key: 'v', label: 'v', unit: 'cm' }, { key: 'F', label: 'F = uv/(u + v)', unit: 'cm' }], rows, ['F'], [
        { label: 'Focal length of the combination', unit: 'cm', value: Fm, tolerance: tol(Fm, 0.04, 0.3), working: `Mean F = ${Fm} cm; 1/F = 1/${a} + 1/${b} gives ${F} cm.`, accepted: `${F} cm` },
      ]);
    },
    viva: [{ q: 'What is the power of two lenses in contact?', a: 'The sum of their powers: P = P₁ + P₂ (in dioptres, with f in metres).', source: 'authored' }, { q: 'Can a convex and a concave lens make a converging pair?', a: 'Yes, if the convex lens is stronger: 1/F = 1/f₁ − 1/|f₂| stays positive.', source: 'authored' }, { q: 'Why must the lenses be in close contact?', a: 'The formula 1/F = 1/f₁ + 1/f₂ holds only for thin lenses with no gap; a gap d changes it.', source: 'authored' }],
    conclusion: 'The chosen pair in contact has the required focal length, as checked on the bench.',
  },
];
