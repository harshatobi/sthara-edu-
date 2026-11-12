'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { circle, lorentz, PARTICLES, selectorSpeed, type LorentzParams } from '@/lib/lab/engines/lorentz';
import { fmt } from '@/lib/lab/types';
import { COLOUR, createStage, makeArrow, progress, usePlay, type Stage, type StageOptions, type Vec3 } from './lab3d';
import type { ViewProps } from './types';

/**
 * A charge in magnetic and electric fields, in 3D (prototype). On a page the
 * field "into the paper" is a grid of crosses; here it is arrows that really
 * point away from the class, so the velocity, the field and the force can be
 * seen to be at right angles as the particle goes round. As in the flat view,
 * B points into the board, the particle enters moving right, and the circle is
 * drawn to fit (real radii run from millimetres to metres). Radius, speeds and
 * which way it bends are the engine's.
 */

const E_COLOUR = '#A855F7', V_COLOUR = COLOUR.current;
const VIEW: StageOptions = { target: [0, -0.7, 0], span: 5.3, wide: 1.6, from: [0.5, 0.32, 1] };
const LOOKS: { label: string; from: Vec3 }[] = [{ label: 'Face on', from: [0, 0.02, 1] }, { label: 'From the side', from: [1, 0.3, 0.3] }];
const TAGS = 7;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** The path drawn: in from the left, then round the circle (or across the plates, bending). */
class Track extends THREE.Curve<THREE.Vector3> {
  private readonly at: (u: number, out: THREE.Vector3) => THREE.Vector3;
  constructor(at: (u: number, out: THREE.Vector3) => THREE.Vector3) { super(); this.at = at; }
  getPoint(u: number, out = new THREE.Vector3()) { return this.at(u, out); }
}

function build(stage: Stage, live: () => { p: LorentzParams; conceal: boolean; k: number }) {
  const { root, mesh, solid, G, M } = stage;
  // The region of field, and B as arrows pointing into the board.
  const box = new THREE.LineSegments(G(new THREE.EdgesGeometry(new THREE.BoxGeometry(10.4, 6.6, 2.2))), M(new THREE.LineBasicMaterial({ color: '#B6C2D2' })));
  root.add(box);
  const a = v3(), b = v3();
  for (let x = -4; x <= 4; x += 2) for (const y of [-2.2, 0, 2.2]) { const ar = makeArrow(stage, root, COLOUR.field, 0.035); ar.stuff.opacity = 0.55; ar.set(a.set(x, y, 1), b.set(x, y, -1)); }
  // Velocity selector plates and the electric field between them.
  const plates = new THREE.Group(); root.add(plates);
  mesh(plates, G(new THREE.BoxGeometry(8.4, 0.14, 2)), solid(COLOUR.north, 0.5), [0, 2.95, 0]);
  mesh(plates, G(new THREE.BoxGeometry(8.4, 0.14, 2)), solid(COLOUR.south, 0.5), [0, -2.95, 0]);
  for (const x of [-3, -1, 1, 3]) { const ar = makeArrow(stage, plates, E_COLOUR, 0.035); ar.stuff.opacity = 0.6; ar.set(a.set(x, 2.8, 0.75), b.set(x, -2.8, 0.75)); }

  const ball = mesh(root, G(new THREE.SphereGeometry(0.2, 28, 20)), solid('#111827', 0.3, 0.2));
  const vel = makeArrow(stage, root, V_COLOUR, 0.06), fMag = makeArrow(stage, root, COLOUR.force, 0.06), fEl = makeArrow(stage, root, E_COLOUR, 0.06);
  const trailStuff = M(new THREE.MeshBasicMaterial({ color: COLOUR.north }));
  let trail: THREE.Mesh | null = null, track: Track | null = null, sig = '', lap = 0, R = 1, up = 1, bend = 0;
  const tags = Array.from({ length: TAGS }, () => ({ at: v3(), text: null as string | null }));
  const at = v3(), ahead = v3(), tangent = v3(), towards = v3();

  const lay = (p: LorentzParams) => {
    const s = PARTICLES[p.particle] ?? PARTICLES.proton;
    up = s.q > 0 ? 1 : -1; // B into the board: a positive charge moving right is pushed up
    if (p.mode === 'circle') {
      R = Math.max(1.1, Math.min(2.9, 1.6 * Math.log10(1 + circle(p).r)));
      const y0 = -up * R, entry = 5.2, total = entry + 2 * Math.PI * R;
      track = new Track((u, out) => {
        const d = u * total;
        if (d <= entry) return out.set(-entry + d, y0, 0);
        const ang = (d - entry) / R;
        return out.set(R * Math.sin(ang), y0 + up * R * (1 - Math.cos(ang)), 0);
      });
      lap = (2 * Math.PI * R) / total;
    } else {
      const v0 = selectorSpeed(p.E, p.B);
      bend = Math.max(-1, Math.min(1, (p.v - v0) / v0)) * up;
      track = new Track((u, out) => out.set(-5 + 10 * u, bend * 2.4 * u * u, 0));
      lap = 0;
    }
    if (trail) { root.remove(trail); trail.geometry.dispose(); }
    trail = new THREE.Mesh(new THREE.TubeGeometry(track, 240, 0.045, 8), trailStuff);
    root.add(trail);
  };

  return {
    tags,
    update: (t: number) => {
      const { p, conceal, k } = live(), s = PARTICLES[p.particle] ?? PARTICLES.proton, round = p.mode === 'circle';
      const now = `${p.mode}|${p.particle}|${p.v}|${p.B}|${p.E}`;
      if (now !== sig) { sig = now; lay(p); }
      plates.visible = !round;
      // Once it has gone round, it keeps going round: the force never stops turning it.
      let u = conceal ? 0 : k;
      if (round && !conceal && k >= 1) u = 1 - lap + ((t * 0.28) % 1) * lap;
      track!.getPointAt(Math.min(u, 0.9999), at); track!.getPointAt(Math.min(u + 0.0005, 1), ahead);
      tangent.subVectors(ahead, at).normalize();
      ball.position.copy(at);
      trail!.geometry.setDrawRange(0, conceal ? 0 : Math.floor((round && k >= 1 ? 1 : u) * 240) * 8 * 6);
      vel.set(at, b.copy(at).addScaledVector(tangent, 1.5));
      // Magnetic force: at right angles to the velocity and to B, towards the centre of the turn for this charge.
      towards.set(-tangent.y, tangent.x, 0).multiplyScalar(up);
      const inField = !round || u > 0.001, v0 = selectorSpeed(p.E, p.B);
      const magLen = round ? 1.3 : Math.max(0.35, Math.min(2.4, 1.1 * (p.v / v0)));
      fMag.group.visible = !conceal && inField; fMag.set(at, b.copy(at).addScaledVector(towards, magLen));
      // Electric force: along E (down) for a positive charge, against it for a negative one.
      fEl.group.visible = !conceal && !round; fEl.set(at, b.copy(at).add(a.set(0, -up * 1.1, 0)));

      tags[0].at.copy(at).add(a.set(0, 0, 0.55)); tags[0].text = `${s.label} (${s.q > 0 ? '+' : '−'})`;
      tags[1].at.copy(at).addScaledVector(tangent, 1.8); tags[1].text = 'v';
      tags[2].at.set(4, 2.2, -1.35); tags[2].text = `B = ${fmt(p.B, 0)} mT, into the board`;
      tags[3].at.copy(at).addScaledVector(towards, magLen + 0.35); tags[3].text = fMag.group.visible ? (round ? 'F = qvB' : 'qvB') : null;
      tags[4].at.copy(at).add(a.set(0, -up * 1.45, 0)); tags[4].text = fEl.group.visible ? 'qE' : null;
      tags[5].at.set(-3.4, round ? -3.6 : 3.4, 0);
      tags[5].text = round ? (conceal ? null : `r = ${lorentz.readouts(p)[0].value} (drawn to fit)`) : `+ plate · E = ${fmt(p.E, 0)} kV/m, downwards`;
      tags[6].at.set(2.6, -3.6, 0);
      tags[6].text = conceal ? null : round ? `Period ${lorentz.readouts(p)[1].value}` : `This particle ${lorentz.readouts(p)[1].value}`;
    },
    dispose: () => { trail?.geometry.dispose(); },
  };
}

export default function Lorentz3D({ params: p, conceal, runKey, onFail }: ViewProps<LorentzParams> & { onFail: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const tags = useRef<(HTMLSpanElement | null)[]>([]);
  const stage = useRef<Stage | null>(null);
  const live = useRef({ p, conceal });
  useEffect(() => { live.current = { p, conceal }; });
  const play = usePlay(runKey, conceal, 3200);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const s = createStage(el, VIEW);
    if (!s) { onFail(); return; }
    stage.current = s;
    const scene = build(s, () => ({ ...live.current, k: progress(play) }));
    s.onFrame(t => {
      scene.update(t);
      for (let i = 0; i < TAGS; i++) s.tag(tags.current[i], scene.tags[i].at, scene.tags[i].text);
    });
    return () => { stage.current = null; scene.dispose(); s.dispose(); };
  }, [onFail, play]);

  const round = p.mode === 'circle';
  return (
    <div className="lab-3d" role="img" aria-label="A charged particle crossing the field, in 3D">
      <div className="lab-3d-stage" ref={host} />
      {Array.from({ length: TAGS }, (_, i) => <span key={i} className="lab-3d-label lab-3d-tag" ref={n => { tags.current[i] = n; }} style={{ opacity: 0 }} />)}
      <div className="lab-3d-looks">{LOOKS.map(l => <button key={l.label} type="button" onClick={() => stage.current?.view(l.from)}>{l.label}</button>)}</div>
      <div className="lab-3d-foot">
        <div className="lab-3d-key">
          <span><i style={{ background: V_COLOUR }} />Velocity</span>
          <span><i style={{ background: COLOUR.field }} />Magnetic field</span>
          <span><i style={{ background: COLOUR.force }} />Magnetic force</span>
          {!round && <span><i style={{ background: E_COLOUR }} />Electric field and force</span>}
        </div>
        <p className="lab-3d-note">{conceal ? 'Drag to turn it. The path is left off until you reveal.' : 'Drag to turn it. Press Run to send the particle in.'}</p>
      </div>
    </div>
  );
}
