'use client';

import * as THREE from 'three';
import { motorForce, solenoidPoles, wireField, type MagParams } from '@/lib/lab/engines/magnetism';
import { fmt } from '@/lib/lab/types';
import { COLOUR, line, makeArrow, makeFlow, smooth, type Stage, type StageOptions, type Vec3 } from './lab3d';

/**
 * The 3D scenes for magnetism and induction. Axes are the engine's: x to the
 * right, y up, z out of the board towards the class, so "towards you" really
 * is towards the class. Every direction drawn comes from the engine's own
 * answer (wireField, solenoidPoles, motorForce, deflection); nothing here
 * works a direction out for itself.
 */

export interface Tag { at: THREE.Vector3; text: string | null }
export interface Scene3D { tags: Tag[]; update: (t: number, dt: number) => void }
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const tag = (x = 0, y = 0, z = 0): Tag => ({ at: v3(x, y, z), text: null });

export const MAG_VIEWS: Record<MagParams['scenario'], StageOptions & { looks: { label: string; from: Vec3 }[] }> = {
  wire: { target: [0, 0, 1], span: 12, wide: 1.25, from: [0.55, 0.42, 1], looks: [{ label: 'Along the wire', from: [0, 0.02, 1] }, { label: 'From the side', from: [1, 0.35, 0.3] }] },
  solenoid: { target: [0, 0, 0], span: 5.6, wide: 1.5, from: [0.75, 0.35, 1], looks: [{ label: 'Near end', from: [0, 0.02, 1] }, { label: 'From the side', from: [1, 0.3, 0.12] }] },
  motor: { target: [0, -0.3, 0], span: 5.2, wide: 1.5, from: [0.6, 0.42, 1], shadows: true, shine: true, tip: [0.1, 0.5], looks: [{ label: 'From the front', from: [0, 0.12, 1] }, { label: 'From above', from: [0.02, 1, 0.25] }] },
  induction: { target: [0.2, -0.9, 0.4], span: 4.6, wide: 1.9, from: [0.25, 0.3, 1], shadows: true, shine: true, tip: [0.1, 0.5], looks: [{ label: 'From the front', from: [0, 0.15, 1] }, { label: 'Along the coil', from: [1, 0.25, 0.35] }] },
};

/** A long straight wire coming through a card, with the field circling it and compasses on the card. */
export function wireScene(stage: Stage, live: () => { p: MagParams; conceal: boolean }): Scene3D {
  const { root, mesh, solid, G, M } = stage, CM = 1; // 1 unit = 1 cm
  mesh(root, G(new THREE.CircleGeometry(11.6, 72)), M(new THREE.MeshBasicMaterial({ color: '#FBF8F1', side: THREE.DoubleSide })), [0, 0, -0.02]);
  mesh(root, G(new THREE.TorusGeometry(11.6, 0.06, 8, 96)), solid('#CBD5E1', 0.8), [0, 0, -0.02]);
  const wire = mesh(root, G(new THREE.CylinderGeometry(0.2, 0.2, 24, 20)), solid(COLOUR.copper, 0.35, 0.6));
  wire.rotation.x = Math.PI / 2;
  const flow = makeFlow(stage, root, line([0, 0, -12], [0, 0, 12]), 9, COLOUR.current, 0.3);
  const along = makeArrow(stage, root, COLOUR.current, 0.16);

  // Field circles on the card; the heads are turned to the engine's sense.
  const blue = M(new THREE.MeshBasicMaterial({ color: COLOUR.field })), headShape = G(new THREE.ConeGeometry(0.28, 0.75, 14));
  const heads: { m: THREE.Mesh; a: number }[] = [];
  for (const r of [2, 4, 6, 8, 10]) {
    const ringStuff = M(new THREE.MeshBasicMaterial({ color: COLOUR.field, transparent: true, opacity: Math.min(1, 0.3 + 1.6 / r) }));
    mesh(root, G(new THREE.TorusGeometry(r * CM, 0.045, 8, 120)), ringStuff, [0, 0, 0.03]);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + r * 0.4; const m = mesh(root, headShape, blue, [Math.cos(a) * r, Math.sin(a) * r, 0.03]); heads.push({ m, a }); }
  }
  // Four compasses on the circle the teacher chose: each needle lies along the field there.
  const needleRed = solid(COLOUR.north, 0.5), needleWhite = solid('#F8FAFC', 0.5), body = solid('#FFFFFF', 0.4), rim = solid('#334155', 0.5, 0.4);
  const compasses = [0.6, 0.6 + Math.PI / 2, 0.6 + Math.PI, 0.6 + (3 * Math.PI) / 2].map(a => {
    const g = new THREE.Group(); root.add(g);
    const dial = mesh(g, G(new THREE.CylinderGeometry(0.6, 0.6, 0.14, 36)), body); dial.rotation.x = Math.PI / 2;
    mesh(g, G(new THREE.TorusGeometry(0.6, 0.05, 8, 36)), rim, [0, 0, 0.07]);
    const needle = new THREE.Group(); needle.position.z = 0.16; g.add(needle);
    mesh(needle, G(new THREE.BoxGeometry(0.46, 0.14, 0.04)), needleRed, [0.23, 0, 0]);
    mesh(needle, G(new THREE.BoxGeometry(0.46, 0.14, 0.04)), needleWhite, [-0.23, 0, 0]);
    return { g, needle, a };
  });
  const tags = [tag(), tag(), tag()];
  const from = v3(0, 0, 0), to = v3(0, 0, 0);

  return {
    tags,
    update: (t, dt) => {
      const { p, conceal } = live(), f = wireField(p), out = p.flow === 'out', acw = f.sense === 'anticlockwise';
      flow.update(dt, (out ? 1 : -1) * (0.05 + p.current * 0.012));
      along.set(from.set(1.1, 1.1, out ? 6 : 10.5), to.set(1.1, 1.1, out ? 10.5 : 6));
      tags[0].at.set(0, 1.6, 11.5); tags[0].text = `Current ${fmt(p.current, 1)} A, ${out ? 'towards you' : 'away from you'}`;
      for (const h of heads) { h.m.visible = !conceal; h.m.rotation.z = h.a + (acw ? Math.PI / 2 : -Math.PI / 2) - Math.PI / 2; }
      compasses.forEach((c, i) => {
        c.g.position.set(Math.cos(c.a) * p.r, Math.sin(c.a) * p.r, 0.1);
        // Close to the wire there is room for only one.
        c.g.visible = i === 0 || p.r >= 2.5;
        // The red end points the way the field goes: along the circle, in the engine's sense.
        c.needle.visible = !conceal;
        c.needle.rotation.z = c.a + (acw ? Math.PI / 2 : -Math.PI / 2) + (i === 0 ? 0.03 * Math.sin(t * 5) : 0);
      });
      tags[1].at.set(Math.cos(0.6) * p.r + 2.4, Math.sin(0.6) * p.r + 1.5, 0.4);
      tags[1].text = conceal ? 'Which way will the needle point?' : `${fmt(f.B * 1e6, 1)} μT at ${fmt(p.r, 1)} cm`;
      tags[2].at.set(-6.6, -6.6, 0.1); tags[2].text = conceal ? null : `Field: ${f.sense}`;
    },
  };
}

/** A solenoid end-on to the class: the current going round, the field through it and looping back outside. */
export function solenoidScene(stage: Stage, live: () => { p: MagParams; conceal: boolean }): Scene3D {
  const { root, mesh, solid, G, M } = stage, R = 1.7, L = 7, TURNS = 9;
  class Helix extends THREE.Curve<THREE.Vector3> {
    constructor() { super(); }
    getPoint(u: number, out = new THREE.Vector3()) { const a = u * TURNS * Math.PI * 2; return out.set(R * Math.cos(a), R * Math.sin(a), -L / 2 + L * u); }
  }
  const helix = new Helix();
  mesh(root, G(new THREE.TubeGeometry(helix, 420, 0.11, 10)), solid(COLOUR.copper, 0.35, 0.6));
  // Travelling with u increasing, the current is anticlockwise seen from the near (+z) end.
  const flow = makeFlow(stage, root, helix, 60, COLOUR.current, 0.17);
  // The leads.
  mesh(root, G(new THREE.CylinderGeometry(0.11, 0.11, 2.6, 10)), solid(COLOUR.copper, 0.35, 0.6), [R, -1.3, -L / 2]);
  mesh(root, G(new THREE.CylinderGeometry(0.11, 0.11, 2.6, 10)), solid(COLOUR.copper, 0.35, 0.6), [R, -1.3, L / 2]);

  // Field lines: straight through the middle, out of one end, round the outside and back in at the other.
  const blue = M(new THREE.MeshBasicMaterial({ color: COLOUR.field, transparent: true, opacity: 0.75 })), headStuff = M(new THREE.MeshBasicMaterial({ color: COLOUR.field }));
  const headShape = G(new THREE.ConeGeometry(0.16, 0.48, 14)), heads: { m: THREE.Mesh; q: THREE.Quaternion }[] = [];
  const Y = v3(0, 1, 0), E = L / 2 + 1.5;
  for (let k = 0; k < 6; k++) {
    const phi = (k / 6) * Math.PI * 2 + 0.26, cx = Math.cos(phi), cy = Math.sin(phi), rho0 = 0.75;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI, rho = rho0 + 3.1 * Math.sin(a); pts.push(v3(rho * cx, rho * cy, E * Math.cos(a))); }
    const loop = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    mesh(root, G(new THREE.TubeGeometry(loop, 120, 0.045, 6, true)), blue);
    // One head on the outside (pointing from the near end to the far end when the near end is north) and one inside (far to near).
    const outer = mesh(root, headShape, headStuff, [(rho0 + 3.1) * cx, (rho0 + 3.1) * cy, 0]);
    heads.push({ m: outer, q: new THREE.Quaternion().setFromUnitVectors(Y, v3(0, 0, -1)) });
    const inner = mesh(root, headShape, headStuff, [rho0 * cx, rho0 * cy, 0]);
    heads.push({ m: inner, q: new THREE.Quaternion().setFromUnitVectors(Y, v3(0, 0, 1)) });
  }
  const flip = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI);
  const tags = [tag(0, 0, L / 2 + 1.1), tag(0, 0, -L / 2 - 1.1), tag(0, R + 0.9, L / 2)];

  return {
    tags,
    update: (_t, dt) => {
      const { p, conceal } = live(), poles = solenoidPoles(p), nearNorth = poles.left === 'N';
      flow.update(dt, (p.wind === 'acw' ? 1 : -1) * (0.01 + p.current * 0.004));
      // Heads are stored for a north pole at the near end; the other way round they all turn about.
      for (const h of heads) { h.m.visible = !conceal; h.m.quaternion.copy(h.q); if (!nearNorth) h.m.quaternion.premultiply(flip); }
      tags[0].text = conceal ? '?' : `${poles.left} (near end)`;
      tags[1].text = conceal ? '?' : `${poles.right} (far end)`;
      tags[2].text = `Current ${p.wind === 'cw' ? 'clockwise' : 'anticlockwise'} seen from here`;
    },
  };
}

/** A rod on rails between the poles of a magnet: field, current and the push on the rod, all at right angles. */
export function motorScene(stage: Stage, live: () => { p: MagParams; conceal: boolean; k: number }): Scene3D {
  const { root, mesh, solid, G } = stage;
  mesh(root, G(new THREE.BoxGeometry(14, 0.3, 11)), solid('#E9EEF5', 0.95), [0, -3.25, 0], false);
  const topStuff = solid(COLOUR.north, 0.5), bottomStuff = solid(COLOUR.south, 0.5);
  mesh(root, G(new THREE.BoxGeometry(4.2, 1.3, 3.4)), topStuff, [0, 2.35, -0.3]);
  mesh(root, G(new THREE.BoxGeometry(4.2, 1.3, 3.4)), bottomStuff, [0, -2.45, -0.3]);
  mesh(root, G(new THREE.BoxGeometry(4.2, 6.1, 1)), solid('#64748B', 0.5, 0.3), [0, -0.05, -2.5]);
  // Rails the rod can roll along, towards the class or away.
  const steel = solid(COLOUR.steel, 0.25, 0.9);
  for (const x of [-3.6, 3.6]) {
    mesh(root, G(new THREE.CylinderGeometry(0.07, 0.07, 9, 12)), steel, [x, -0.2, 0.6]).rotation.x = Math.PI / 2;
    for (const z of [-3.6, 4.8]) mesh(root, G(new THREE.CylinderGeometry(0.07, 0.07, 2.9, 10)), steel, [x, -1.65, z]);
  }
  const rod = new THREE.Group(); root.add(rod);
  mesh(rod, G(new THREE.CylinderGeometry(0.13, 0.13, 8.4, 20)), solid(COLOUR.copper, 0.3, 0.7)).rotation.z = Math.PI / 2;
  const flow = makeFlow(stage, rod, line([-4.2, 0, 0], [4.2, 0, 0]), 9, COLOUR.current, 0.2);
  const fieldArrows = [[-1.2, -0.9], [1.2, -0.9], [0, 0.3], [-1.2, 1.1], [1.2, 1.1]].map(() => makeArrow(stage, root, COLOUR.field, 0.05));
  const spots: [number, number][] = [[-1.3, -1.1], [1.3, -1.1], [0, 0.1], [-1.3, 0.9], [1.3, 0.9]];
  const current = makeArrow(stage, rod, COLOUR.current, 0.09), force = makeArrow(stage, rod, COLOUR.force, 0.11);
  const tags = [tag(), tag(), tag(), tag(0, 3.35, -0.3), tag(0, -3.5, 1.6)];
  const a = v3(0, 0, 0), b = v3(0, 0, 0);

  return {
    tags,
    update: (_t, dt) => {
      const { p, conceal, k } = live(), f = motorForce(p), down = p.field === 'down', right = p.dirI === 'lr';
      // The engine's word says which way; the rod can only roll along the rails.
      const push = f.word.startsWith('Out') ? 1 : f.word.startsWith('Into') ? -1 : 0, travel = 1 + 1.6 * Math.min(1, f.size / 0.5);
      // Pushed in, it stops short of the back of the magnet.
      const z = conceal ? 0 : push * Math.min(travel, push < 0 ? 1.7 : 3) * smooth(k);
      rod.position.set(0, 0, 0.6 + z); rod.children[0].rotation.x = z * 6;
      topStuff.color.set(down ? COLOUR.north : COLOUR.south); bottomStuff.color.set(down ? COLOUR.south : COLOUR.north);
      flow.update(dt, (right ? 1 : -1) * (0.08 + p.current * 0.02));
      fieldArrows.forEach((ar, i) => { const [x, zz] = spots[i]; ar.set(a.set(x, down ? 1.6 : -1.7, zz - 0.3), b.set(x, down ? -1.7 : 1.6, zz - 0.3)); });
      current.set(a.set(right ? -1.3 : 1.3, 0.55, 0), b.set(right ? 1.3 : -1.3, 0.55, 0));
      force.group.visible = !conceal && push !== 0;
      force.set(a.set(0, 0, push * 0.3), b.set(0, 0, push * 2.1));
      tags[0].at.set(right ? 3.4 : -3.4, 0.75, rod.position.z); tags[0].text = `Current ${fmt(p.current, 1)} A`;
      tags[1].at.set(-3.1, down ? 1.5 : -1.6, -0.3); tags[1].text = `Field ${fmt(p.b, 2)} T, ${p.field}`;
      tags[2].at.set(0, 0.55, rod.position.z + push * 2.3); tags[2].text = conceal || !push ? null : `Force ${fmt(f.size, 3)} N`;
      tags[3].text = down ? 'N' : 'S'; tags[4].text = down ? 'S' : 'N';
    },
  };
}

export interface InductionState {
  pole: 'N' | 'S'; move: 'in' | 'out' | 'still';
  /** How far the push or pull has got, 0 → 1 (0 while the class predicts). */
  k: number;
  /** The needle's biggest swing, −1 (hard left) … +1 (hard right), from the engine. */
  swing: number;
  /** The pole the coil's near face becomes while the magnet moves, where the engine works that out. */
  face?: 'N' | 'S' | 'none';
  conceal: boolean;
}

/** A bar magnet pushed into a coil wired to a galvanometer: the needle moves only while the magnet does. */
export function inductionScene(stage: Stage, turns: number, live: () => InductionState): Scene3D {
  const { root, mesh, solid, G, M } = stage, R = 1.25, X0 = 0.6, LEN = 3.4;
  mesh(root, G(new THREE.BoxGeometry(17, 0.3, 9)), solid('#E9EEF5', 0.95), [0, -3.4, 0.6], false);
  class Helix extends THREE.Curve<THREE.Vector3> {
    constructor() { super(); }
    getPoint(u: number, out = new THREE.Vector3()) { const a = u * turns * Math.PI * 2 - Math.PI / 2; return out.set(X0 + LEN * u, R * Math.sin(a), R * Math.cos(a)); }
  }
  const copper = solid(COLOUR.copper, 0.3, 0.7);
  mesh(root, G(new THREE.TubeGeometry(new Helix(), turns * 40, 0.075, 8)), copper);
  // Leads from the two ends of the coil down to the galvanometer's terminals.
  const lead = (x: number, tx: number) => mesh(root, G(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v3(x, -R, 0), v3(x, -2.4, 0.4), v3(tx, -3.1, 1.6), v3(tx, -2.9, 2.5)]), 30, 0.05, 8)), copper);
  lead(X0, 1.4); lead(X0 + LEN, 3.2);
  // Coil stand.
  mesh(root, G(new THREE.BoxGeometry(LEN + 0.6, 0.2, 2.4)), solid('#CBD5E1', 0.7), [X0 + LEN / 2, -1.5, 0]);
  for (const x of [X0 + 0.2, X0 + LEN - 0.2]) mesh(root, G(new THREE.BoxGeometry(0.2, 1.8, 2)), solid('#CBD5E1', 0.7), [x, -2.4, 0]);

  // Galvanometer, its face tipped up towards the class.
  const meter = new THREE.Group(); meter.position.set(2.3, -2.55, 3); meter.rotation.x = -0.5; root.add(meter);
  mesh(meter, G(new THREE.BoxGeometry(3, 1.9, 0.7)), solid(COLOUR.dark, 0.5, 0.2));
  mesh(meter, G(new THREE.PlaneGeometry(2.6, 1.5)), M(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.6 })), [0, 0, 0.36], false);
  const tick = solid('#334155', 0.6);
  for (let i = -4; i <= 4; i++) { const a = (i * 11 * Math.PI) / 180, m = mesh(meter, G(new THREE.BoxGeometry(0.03, i % 2 ? 0.1 : 0.18, 0.01)), tick, [Math.sin(a) * 1.05, -0.55 + Math.cos(a) * 1.05, 0.37], false); m.rotation.z = -a; }
  const needle = new THREE.Group(); needle.position.set(0, -0.55, 0.39); meter.add(needle);
  mesh(needle, G(new THREE.BoxGeometry(0.035, 1, 0.012)), solid(COLOUR.north, 0.5), [0, 0.5, 0], false);
  mesh(meter, G(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16)), tick, [0, -0.55, 0.39], false).rotation.x = Math.PI / 2;

  // The bar magnet: the pole facing the coil is its right-hand end.
  const magnet = new THREE.Group(); root.add(magnet);
  const nearStuff = solid(COLOUR.north, 0.45), farStuff = solid(COLOUR.south, 0.45);
  mesh(magnet, G(new THREE.BoxGeometry(2, 0.9, 0.9)), nearStuff, [-1, 0, 0]);
  mesh(magnet, G(new THREE.BoxGeometry(2, 0.9, 0.9)), farStuff, [-3, 0, 0]);
  const FAR = -1.6, NEAR = X0 + 1.5; // where the magnet's right-hand end is
  const tags = [tag(), tag(), tag(2.3, -1.2, 3.2), tag(X0 - 0.2, R + 0.75, 0), tag(X0 + LEN / 2, R + 0.9, 0)];

  return {
    tags,
    update: () => {
      const s = live(), k = s.conceal ? 0 : s.k, e = smooth(k);
      const x = s.move === 'still' ? NEAR : s.move === 'in' ? FAR + (NEAR - FAR) * e : NEAR + (FAR - NEAR) * e;
      magnet.position.set(x, 0, 0);
      nearStuff.color.set(s.pole === 'N' ? COLOUR.north : COLOUR.south); farStuff.color.set(s.pole === 'N' ? COLOUR.south : COLOUR.north);
      // The needle is off zero only while the magnet is moving, most in the middle of the stroke.
      const moving = s.move !== 'still' && k > 0 && k < 1;
      needle.rotation.z = moving ? -s.swing * 0.72 * Math.sin(Math.PI * k) : 0;
      tags[0].at.set(x - 1, 0.95, 0); tags[0].text = s.pole;
      tags[1].at.set(x - 3, 0.95, 0); tags[1].text = s.pole === 'N' ? 'S' : 'N';
      tags[2].text = 'Galvanometer';
      tags[3].text = !s.conceal && moving && s.face && s.face !== 'none' ? `This face becomes ${s.face}` : null;
      tags[4].text = !s.conceal && k === 1 ? (s.move === 'still' ? 'Magnet still: no change in the field, no current' : 'Magnet stopped: the needle is back at zero') : null;
    },
  };
}
