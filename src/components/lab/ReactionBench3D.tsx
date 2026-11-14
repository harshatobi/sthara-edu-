'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { equationText, solveReaction, type ReactionParams } from '@/lib/lab/engines/reactions';
import { BENCHES, type BenchSpec } from '@/lib/lab/benches';
import type { ViewProps } from './types';

/**
 * The reaction as it looks on the lab bench (prototype): the apparatus in 3D
 * and what the class would see change. Everything drawn is a function of how
 * far the reaction has gone (0 → 1), so the slider can run it back and forth;
 * only flicker, bubbles and fumes use the clock. While the class predicts it
 * shows the starting set-up and nothing happens.
 */

const DURATION = 9000;
const TAU = Math.PI * 2;
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, x: number) => a + (b - a) * x;
const rnd = (n: number) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
const v2 = (x: number, y: number) => new THREE.Vector2(x, y);

interface Bench { update: (k: number, t: number) => void; glow: () => number; centre: THREE.Vector3; span: number; dispose: () => void }

/** Builds the apparatus for one reaction into `root`. */
function makeBench(spec: BenchSpec, root: THREE.Group): Bench {
  const keep: { dispose: () => void }[] = [];
  const G = <T extends THREE.BufferGeometry>(g: T) => { keep.push(g); return g; };
  const M = <T extends THREE.Material>(m: T) => { keep.push(m); return m; };
  const updates: ((k: number, t: number) => void)[] = [];
  let glow = 0;
  // Where the camera looks: a little under the middle of the apparatus, so it clears the slider along the bottom.
  const centre = new THREE.Vector3(0, 1.25, 0);
  // Half the height the camera takes in: taller set-ups (fumes above a tilted tube) need more.
  let span = 2.75;
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, cast = true) => {
    const x = new THREE.Mesh(g, m); x.castShadow = cast; x.receiveShadow = true; parent.add(x); return x;
  };
  const solid = (colour: string, roughness = 0.6, metalness = 0) => M(new THREE.MeshStandardMaterial({ color: colour, roughness, metalness }));
  const glass = () => M(new THREE.MeshPhysicalMaterial({ color: '#C6D9EE', transparent: true, opacity: 0.3, roughness: 0.04, side: THREE.DoubleSide, depthWrite: false }));
  const m4 = new THREE.Matrix4();

  // The bench top.
  const top = add(root, G(new THREE.CircleGeometry(7.5, 72)), solid('#EDF1F7', 0.95), false);
  top.rotation.x = -Math.PI / 2;

  /** Small things that rise in a column and start again: bubbles in a liquid. */
  const bubbles = (count: number, radius: number, height: () => number, strength: (k: number) => number) => {
    const im = new THREE.InstancedMesh(G(new THREE.SphereGeometry(1, 10, 8)), M(new THREE.MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.8, roughness: 0.1 })), count);
    root.add(im);
    updates.push((k, t) => {
      const s = strength(k), h = height();
      for (let i = 0; i < count; i++) {
        const a = rnd(i * 4 + 1) * TAU, r = Math.sqrt(rnd(i * 4 + 2)) * radius, ph = rnd(i * 4 + 4);
        const y = ((t * (0.35 + rnd(i * 4 + 3) * 0.45) + ph) % 1) * (h - 0.2) + 0.12;
        const size = i < count * s ? 0.035 + 0.045 * ph : 0;
        im.setMatrixAt(i, m4.makeScale(size, size, size).setPosition(Math.cos(a) * r + Math.sin(t * 3 + i) * 0.03, y, Math.sin(a) * r));
      }
      im.instanceMatrix.needsUpdate = true;
    });
  };

  /** Puffs that rise from a point, spread and thin out: steam or fumes. */
  const plume = (count: number, from: THREE.Vector3, colour: string, opacity: number, strength: (k: number) => number, height = 2.6) => {
    const im = new THREE.InstancedMesh(G(new THREE.SphereGeometry(1, 12, 10)), M(new THREE.MeshStandardMaterial({ color: colour, transparent: true, opacity, roughness: 1, depthWrite: false })), count);
    im.renderOrder = 4;
    root.add(im);
    updates.push((k, t) => {
      const s = strength(k);
      for (let i = 0; i < count; i++) {
        const f = (t * (0.16 + rnd(i * 5 + 1) * 0.12) + rnd(i * 5 + 2)) % 1, a = rnd(i * 5 + 3) * TAU + t * 0.4;
        const size = i < count * s ? (0.1 + 0.42 * f) * (1 - f * f) : 0;
        im.setMatrixAt(i, m4.makeScale(size, size, size).setPosition(from.x + Math.cos(a) * 0.55 * f, from.y + f * height, from.z + Math.sin(a) * 0.55 * f));
      }
      im.instanceMatrix.needsUpdate = true;
    });
  };

  /** A burner flame: a blue cone with a paler core, standing on `at`. */
  const flame = (at: THREE.Vector3, size: number, strength: (k: number) => number) => {
    const cone = (r: number, h: number, colour: string, opacity: number) => {
      const g = G(new THREE.ConeGeometry(r * size, h * size, 28, 1, true)); g.translate(0, (h * size) / 2, 0);
      const m = add(root, g, M(new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })), false);
      m.position.copy(at); m.renderOrder = 5; m.receiveShadow = false;
      return m;
    };
    const outer = cone(0.2, 1.15, '#2F7BFF', 0.6), inner = cone(0.1, 0.6, '#C8E8FF', 0.9);
    const light = new THREE.PointLight('#7FB0FF', 0, 6); light.position.copy(at).y += 0.5 * size; root.add(light);
    updates.push((k, t) => {
      const s = strength(k), f = 1 + 0.07 * Math.sin(t * 19) + 0.04 * Math.sin(t * 31);
      outer.visible = inner.visible = s > 0.01;
      outer.scale.set(s, s * f, s); inner.scale.set(s, s * (2 - f), s);
      light.intensity = 2.5 * s * size;
    });
  };

  const burner = (at: THREE.Vector3, height = 1.1) => {
    add(root, G(new THREE.CylinderGeometry(0.55, 0.62, 0.14, 40)), solid('#2B3340', 0.5, 0.3)).position.set(at.x, 0.07, at.z);
    add(root, G(new THREE.CylinderGeometry(0.13, 0.15, height, 28)), solid('#9AA4B2', 0.3, 0.7)).position.set(at.x, 0.14 + height / 2, at.z);
    add(root, G(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 28)), solid('#5B6676', 0.4, 0.5)).position.set(at.x, 0.42, at.z);
    return new THREE.Vector3(at.x, 0.14 + height, at.z);
  };

  if (spec.kind === 'beaker') {
    const R = 1.5, H = 3.1, from = spec.pour ? 1.45 : 1.95, to = spec.pour ? 2.05 : 1.95;
    let level = from;
    const liquidStuff = M(new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.12, depthWrite: false }));
    const liquid = add(root, G(new THREE.CylinderGeometry(R - 0.05, R - 0.05, 1, 64)), liquidStuff, false);
    liquid.renderOrder = 2;
    const wall = add(root, G(new THREE.LatheGeometry([v2(0, 0.03), v2(R, 0.03), v2(R, H), v2(R + 0.1, H + 0.06)], 64)), glass(), false);
    wall.renderOrder = 3;
    add(root, G(new THREE.TorusGeometry(R + 0.06, 0.035, 10, 64)), glass(), false).rotateX(Math.PI / 2).position.setY(H + 0.04);
    const c0 = new THREE.Color(spec.liquid[0]), c1 = new THREE.Color(spec.liquid[1]);
    updates.push(k => {
      const x = smooth((k - 0.1) / 0.75);
      liquidStuff.color.copy(c0).lerp(c1, x);
      liquidStuff.opacity = mix(spec.opacity[0], spec.opacity[1], x);
      level = mix(from, to, smooth((k - 0.06) / 0.24));
      liquid.scale.y = level; liquid.position.y = level / 2 + 0.05;
    });

    if (spec.solid === 'nail') {
      // A nail leaning in the beaker; the part under the liquid takes on a coat of copper.
      const foot = new THREE.Vector3(-0.75, 0.12, 0.2), head = new THREE.Vector3(1.25, H + 0.35, -0.1), along = head.clone().sub(foot), len = along.length();
      const nail = new THREE.Group(); nail.position.copy(foot); nail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.clone().normalize()); root.add(nail);
      const shaft = G(new THREE.CylinderGeometry(0.07, 0.05, 1, 20)); shaft.translate(0, 0.5, 0);
      add(nail, shaft, solid('#8B939E', 0.35, 0.8)).scale.y = len;
      add(nail, G(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24)), solid('#8B939E', 0.35, 0.8)).position.y = len;
      const coatStuff = M(new THREE.MeshStandardMaterial({ color: spec.coat ?? '#9A4A22', roughness: 0.85, transparent: true }));
      const coatShape = G(new THREE.CylinderGeometry(0.085, 0.065, 1, 20)); coatShape.translate(0, 0.5, 0);
      const coat = add(nail, coatShape, coatStuff);
      updates.push(k => { coatStuff.opacity = smooth((k - 0.12) / 0.7); coat.visible = coatStuff.opacity > 0.01; coat.scale.y = ((level - foot.y) / along.y) * len; });
    }
    if (spec.solid === 'granules' || spec.solid === 'lumps') {
      const lumps = spec.solid === 'lumps', n = lumps ? 5 : 8;
      const stuff = lumps ? solid('#F3F1E8', 0.95) : solid('#8E97A3', 0.4, 0.75);
      const shape = G(new THREE.DodecahedronGeometry(1, 0));
      const bits = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * TAU + rnd(i) * 0.8, r = (lumps ? 0.55 : 0.75) * Math.sqrt(rnd(i * 3 + 1)), size = (lumps ? 0.3 : 0.17) * (0.75 + 0.5 * rnd(i * 3 + 2));
        const b = add(root, shape, stuff); b.position.set(Math.cos(a) * r, 0.05 + size * 0.8, Math.sin(a) * r); b.rotation.set(rnd(i) * 3, rnd(i + 9) * 3, 0);
        return { b, size };
      });
      // Quicklime breaks up into the milky suspension; zinc is only slowly eaten away.
      updates.push(k => bits.forEach(({ b, size }) => b.scale.setScalar(size * (lumps ? 1 - 0.75 * smooth((k - 0.1) / 0.7) : 1 - 0.2 * k))));
    }
    if (spec.bubbles) bubbles(70, R * 0.7, () => level, k => (spec.steam ? smooth(k / 0.12) * (1 - smooth((k - 0.75) / 0.2)) : smooth(k / 0.12)));
    if (spec.steam) plume(22, new THREE.Vector3(0, H * 0.8, 0), '#FFFFFF', 0.22, k => smooth((k - 0.1) / 0.15) * (1 - smooth((k - 0.8) / 0.2)));

    if (spec.pour) {
      // A test tube tips the second solution in; its mouth is the point it turns about.
      const tube = new THREE.Group(); tube.position.set(0.75, H + 0.75, 0); root.add(tube);
      const L = 2.3, r = 0.24;
      const wallPts = [...Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * Math.PI / 2; return v2(r * Math.sin(a), -L + r - r * Math.cos(a)); }), v2(r, 0), v2(r + 0.04, 0.03)];
      add(tube, G(new THREE.LatheGeometry(wallPts, 32)), glass(), false).renderOrder = 3;
      const inside = G(new THREE.CylinderGeometry(r - 0.04, r - 0.04, 1, 24)); inside.translate(0, 0.5, 0);
      const charge = add(tube, inside, M(new THREE.MeshStandardMaterial({ color: '#DCEBFF', transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false })), false);
      charge.position.y = -L + 0.06;
      const stream = add(root, G(new THREE.CylinderGeometry(0.035, 0.03, 1, 12)), M(new THREE.MeshStandardMaterial({ color: '#DCEBFF', transparent: true, opacity: 0.6, roughness: 0.1 })), false);
      updates.push(k => {
        const tip = smooth(k / 0.08) * (1 - smooth((k - 0.3) / 0.08));
        tube.rotation.z = mix(0.75, 1.95, tip);
        charge.scale.y = Math.max(0.02, (L - 0.5) * (1 - smooth((k - 0.06) / 0.24)));
        charge.visible = charge.scale.y > 0.05;
        stream.visible = k > 0.07 && k < 0.31;
        const fall = tube.position.y - level;
        stream.scale.y = fall; stream.position.set(tube.position.x - 0.05, level + fall / 2, 0);
      });

      // The precipitate: a white cloud where the solutions meet, which then settles.
      const count = 320;
      const grains = new THREE.InstancedMesh(G(new THREE.SphereGeometry(1, 8, 6)), solid(spec.precipitate ?? '#FFFFFF', 0.95), count);
      root.add(grains);
      updates.push((k, t) => {
        for (let i = 0; i < count; i++) {
          const a = rnd(i * 7 + 1) * TAU, born = 0.1 + 0.28 * rnd(i * 7 + 2), sink = smooth((k - born - 0.12 - 0.22 * rnd(i * 7 + 3)) / 0.32);
          const rc = 0.9 * Math.sqrt(rnd(i * 7 + 4)), rs = (R - 0.2) * Math.sqrt(rnd(i * 7 + 5));
          const drift = (1 - sink) * 0.06;
          const size = 0.045 * (0.6 + 0.8 * rnd(i * 7 + 6)) * smooth((k - born) / 0.06);
          const x = mix(0.45 + Math.cos(a) * rc, Math.cos(a) * rs, sink) + Math.sin(t * 1.3 + i) * drift;
          const y = mix(level * (0.45 + 0.45 * rnd(i * 7 + 7)), 0.09 + 0.2 * rnd(i * 7 + 8) * (1 - rs / R), sink) + Math.cos(t * 1.1 + i * 2) * drift;
          grains.setMatrixAt(i, m4.makeScale(size, size, size).setPosition(x, y, mix(Math.sin(a) * rc, Math.sin(a) * rs, sink)));
        }
        grains.instanceMatrix.needsUpdate = true;
      });
      centre.set(0.3, 1.75, 0);
    }
  }

  if (spec.kind === 'tube') {
    const tilt = 0.96, L = 2.9, r = 0.3, foot = new THREE.Vector3(0, 2.05, 0), dir = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), 0);
    const mouth = foot.clone().addScaledVector(dir, L), grip = foot.clone().addScaledVector(dir, L * 0.78);
    flame(burner(new THREE.Vector3(0, 0, 0)), 1, k => smooth((k - 0.02) / 0.06));
    // Retort stand and clamp.
    add(root, G(new THREE.BoxGeometry(2, 0.12, 1.5)), solid('#3A4452', 0.6, 0.3)).position.set(grip.x + 1.5, 0.06, 0);
    add(root, G(new THREE.CylinderGeometry(0.06, 0.06, 4.6, 16)), solid('#9AA4B2', 0.3, 0.8)).position.set(grip.x + 2, 2.3, 0);
    add(root, G(new THREE.CylinderGeometry(0.045, 0.045, 2, 14)), solid('#5B6676', 0.4, 0.6)).rotateZ(Math.PI / 2).position.set(grip.x + 1, grip.y, 0);
    const ring = add(root, G(new THREE.TorusGeometry(r + 0.05, 0.05, 10, 28)), solid('#5B6676', 0.4, 0.6));
    ring.position.copy(grip); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

    const tube = new THREE.Group(); tube.position.copy(foot); tube.rotation.z = -tilt; root.add(tube);
    const wallPts = [...Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * Math.PI / 2; return v2(r * Math.sin(a), r - r * Math.cos(a)); }), v2(r, L), v2(r + 0.05, L + 0.04)];
    add(tube, G(new THREE.LatheGeometry(wallPts, 36)), glass(), false).renderOrder = 3;
    // The powder lies along the lower side of the tilted tube.
    const stuff = solid(spec.solid[0], 0.9), c0 = new THREE.Color(spec.solid[0]), c1 = new THREE.Color(spec.solid[1]);
    const grain = G(new THREE.DodecahedronGeometry(1, 0));
    for (let i = 0; i < 26; i++) {
      const g = add(tube, grain, stuff), y = 0.1 + rnd(i * 3 + 1) * 0.95;
      g.position.set(0.05 + rnd(i * 3 + 2) * (r - 0.14), y, (rnd(i * 3 + 3) - 0.5) * 0.3);
      g.scale.setScalar(0.06 + 0.05 * rnd(i + 40)); g.rotation.set(rnd(i) * 3, rnd(i + 5) * 3, 0);
    }
    updates.push(k => { stuff.color.copy(c0).lerp(c1, smooth((k - 0.18) / 0.62)); });
    if (spec.fumes) plume(26, mouth, spec.fumes, 0.42, k => smooth((k - 0.25) / 0.2), 2.2);
    centre.set(1.4, 2.3, 0); span = 3.8;
  }

  if (spec.kind === 'burner') {
    flame(burner(new THREE.Vector3(0, 0, 0), 1.5), 1.7, k => smooth((k - 0.06) / 0.1));
    // The gas pipe.
    add(root, G(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 14)), solid('#C2410C', 0.7)).rotateZ(Math.PI / 2).position.set(1.75, 0.42, 0);
    centre.set(0, 1.75, 0); span = 3.25;
  }

  if (spec.kind === 'ribbon') {
    const L = 2.7, start = new THREE.Vector3(-0.9, 2.9, 0);
    for (const z of [-0.07, 0.07]) {
      const a = new THREE.Vector3(-3.1, 4.3, z * 3), d = start.clone().sub(a);
      const jaw = G(new THREE.CylinderGeometry(0.06, 0.045, d.length(), 12));
      const j = add(root, jaw, solid('#3A4452', 0.4, 0.8));
      j.position.copy(a).addScaledVector(d, 0.5); j.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
    const strip = new THREE.Group(); strip.position.copy(start); strip.rotation.set(0.55, 0, -0.22); root.add(strip);
    const shape = G(new THREE.BoxGeometry(1, 0.03, 0.34)); shape.translate(0.5, 0, 0);
    const ribbon = add(strip, shape, solid('#AEB6C1', 0.3, 0.85));
    // Watch glass and the white ash that collects in it.
    const dishAt = new THREE.Vector3(0.9, 0, 0);
    add(root, G(new THREE.LatheGeometry([v2(0, 0.04), v2(0.7, 0.08), v2(1.25, 0.24), v2(1.3, 0.3)], 48)), glass(), false).position.copy(dishAt);
    const heap = add(root, G(new THREE.SphereGeometry(1, 28, 14)), solid('#F8F8F3', 1));
    heap.position.set(dishAt.x, 0.1, 0);
    const flakes = new THREE.InstancedMesh(G(new THREE.DodecahedronGeometry(1, 0)), solid('#F8F8F3', 1), 18);
    root.add(flakes);

    // The burning end: a white-hot core, a wide glare and the light it throws.
    const core = add(root, G(new THREE.SphereGeometry(1, 20, 14)), M(new THREE.MeshBasicMaterial({ color: '#FFFFFF' })), false);
    const spot = document.createElement('canvas'); spot.width = spot.height = 128;
    const ctx = spot.getContext('2d')!, grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,.75)'); grad.addColorStop(0.6, 'rgba(210,230,255,.22)'); grad.addColorStop(1, 'rgba(210,230,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(spot); keep.push(tex);
    const glare = new THREE.Sprite(M(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })));
    glare.renderOrder = 6; root.add(glare);
    const light = new THREE.PointLight('#FFFFFF', 0, 14); root.add(light);
    const front = new THREE.Vector3();
    updates.push((k, t) => {
      const b = smooth((k - 0.08) / 0.8), left = L * (1 - b);
      ribbon.scale.x = Math.max(left, 0.001); ribbon.visible = left > 0.02;
      strip.updateMatrixWorld();
      front.set(left, 0, 0).applyMatrix4(strip.matrixWorld);
      const lit = smooth(b / 0.04) * (1 - smooth((b - 0.96) / 0.04)), f = 1 + 0.18 * Math.sin(t * 23) + 0.1 * Math.sin(t * 37);
      glow = lit;
      core.visible = glare.visible = lit > 0.01;
      core.position.copy(front); core.scale.setScalar(0.13 * lit * f);
      glare.position.copy(front); glare.scale.setScalar(5.2 * lit * f);
      light.position.copy(front); light.intensity = 60 * lit * f;
      heap.scale.set(0.75 * Math.sqrt(b) + 0.001, 0.16 * b + 0.001, 0.75 * Math.sqrt(b) + 0.001);
      for (let i = 0; i < 18; i++) {
        const f2 = (t * (0.5 + rnd(i * 3 + 1) * 0.4) + rnd(i * 3 + 2)) % 1, size = i < 18 * lit ? 0.035 * (1 - f2 * 0.4) : 0;
        flakes.setMatrixAt(i, m4.makeScale(size, size * 0.5, size).setPosition(mix(front.x, dishAt.x + (rnd(i) - 0.5) * 0.9, f2), mix(front.y, 0.18, f2 * f2), (rnd(i + 20) - 0.5) * 0.5 * f2));
      }
      flakes.instanceMatrix.needsUpdate = true;
    });
    centre.set(-0.2, 1.65, 0);
  }

  return {
    update: (k, t) => { for (const u of updates) u(k, t); },
    glow: () => glow,
    centre,
    span,
    dispose: () => { for (const x of keep) x.dispose(); },
  };
}

export default function ReactionBench3D({ params: p, conceal, runKey, onFail }: ViewProps<ReactionParams> & { onFail: () => void }) {
  const r = solveReaction(p), spec = BENCHES[p.reaction];
  const host = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const note = useRef<HTMLParagraphElement>(null);
  const live = useRef({ k: 0, playing: false, from: 0 });
  const after = `${r.rx.type}. ${r.rx.observe}`;

  // A new reaction (or the reveal) starts from the set-up.
  useEffect(() => { live.current.k = 0; live.current.playing = false; }, [p.reaction, conceal]);

  useEffect(() => {
    if (!runKey || conceal) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    live.current = { k: still ? 1 : 0, playing: !still, from: performance.now() };
  }, [runKey, conceal]);

  useEffect(() => {
    const el = host.current;
    if (!el || !spec) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { onFail(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const sky = new THREE.HemisphereLight(0xffffff, 0xb4c0d2, 1.05); scene.add(sky);
    const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(-4, 9, 6); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.radius = 5; sun.shadow.bias = -0.0005;
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    scene.add(sun);
    const root = new THREE.Group(); scene.add(root);
    const bench = makeBench(spec, root);
    const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 200);
    camera.position.set(bench.centre.x, bench.centre.y + 2.2, 12);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(bench.centre);
    controls.enablePan = false; controls.enableZoom = false; controls.enableDamping = true; controls.rotateSpeed = 0.6;
    controls.minPolarAngle = Math.PI * 0.22; controls.maxPolarAngle = Math.PI * 0.5;

    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // A narrow stage steps back to keep the width of the apparatus in.
      const t = Math.tan((camera.fov * Math.PI) / 360), d = Math.max(bench.span / t, (bench.span * 1.42) / (t * camera.aspect));
      camera.position.sub(controls.target).setLength(d).add(controls.target);
      camera.updateProjectionMatrix();
    };
    fit();

    let raf = 0, said = '';
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const L = live.current;
      if (L.playing) { L.k = Math.min(1, (now - L.from) / DURATION); if (L.k >= 1) L.playing = false; }
      const k = conceal ? 0 : L.k;
      bench.update(k, now / 1000);
      // A burning ribbon is far brighter than the room: the room goes dark around it.
      const glow = bench.glow();
      sky.intensity = 1.05 * (1 - 0.8 * glow); sun.intensity = 1.7 * (1 - 0.85 * glow);
      if (dim.current) dim.current.style.opacity = String(0.88 * glow);
      controls.update();
      renderer.render(scene, camera);
      if (slider.current && document.activeElement !== slider.current) slider.current.value = String(Math.round(k * 1000));
      const say = conceal || k < 0.05 ? spec.before : k > 0.9 ? after : spec.pace ?? '';
      if (note.current && say !== said) { said = say; note.current.textContent = say; }
      if (note.current) note.current.style.color = glow > 0.4 ? '#fff' : '';
    };
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); bench.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [spec, conceal, onFail, after]);

  if (!spec) return null;
  const scrub = (v: string) => { live.current.playing = false; live.current.k = Number(v) / 1000; };

  return (
    <div className="lab-3d" role="img" aria-label={`${r.rx.label} on the lab bench: ${r.rx.observe}`}>
      <div className="lab-3d-dim" ref={dim} />
      <div className="lab-3d-stage" ref={host} />
      <div className="lab-3d-top lab-3d-plate">
        <b>{equationText(p, conceal)}</b>
        {r.rx.condition && <span>({r.rx.condition})</span>}
      </div>
      <div className="lab-3d-foot">
        {!conceal && (
          <label className="lab-3d-scrub lab-3d-plate">
            <span>Before</span>
            <input ref={slider} type="range" min={0} max={1000} defaultValue={0} aria-label="How far the reaction has gone" onInput={e => scrub((e.target as HTMLInputElement).value)} />
            <span>After</span>
          </label>
        )}
        <p className="lab-3d-note" ref={note}>{spec.before}</p>
      </div>
    </div>
  );
}
