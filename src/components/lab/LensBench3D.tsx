'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { solveBench, type BenchParams, type BenchSolution } from '@/lib/lab/engines/lensBench';
import { fmt } from '@/lib/lab/types';
import { COLOUR, createStage, makeRod, type Stage, type StageOptions, type Vec3 } from './lab3d';
import type { ViewProps } from './types';

/**
 * The optical bench in 3D (prototype): a candle, the lens or mirror on its
 * stand, and a screen the class slides along the bench until the image is
 * sharp, which is how the experiment is done. Rays from the tip of the flame
 * meet at the image; with the screen anywhere else they arrive spread out, and
 * the picture on the screen is blurred by that much. Every position is the
 * engine's (solveBench); only where the screen stands is chosen here. While the
 * class predicts, the rays and the image are left off.
 */

type Device = 'concave-mirror' | 'convex-lens' | 'convex-mirror' | 'concave-lens' | 'combo';
const VIEW: StageOptions = { target: [0, -0.6, 0], span: 4.3, wide: 1.8, shadows: true, shine: true, tip: [0.12, 0.5] };
const LOOKS: { label: string; from: Vec3 }[] = [{ label: 'From the side', from: [0, 0.06, 1] }, { label: 'From above', from: [0, 1, 0.12] }, { label: 'From the candle', from: [-1, 0.25, 0.5] }];
const TAGS = 7, H = 1, APERTURE = 1.35, AXIS = 0, RAIL = -2.7, LENGTH = 13.2; // scene units
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const RAY = '#F59E0B';

/** Where things stand along the bench (cm from the lens or mirror; the candle side is negative). */
function plan(p: BenchParams, screenAt: number, conceal: boolean) {
  const s = solveBench(p) as Required<BenchSolution>, device = p.device as Device;
  const mirror = device === 'concave-mirror';
  // The sharp image, and the screen, are on the candle's side for a mirror and beyond the lens otherwise.
  const sharp = device === 'concave-lens' ? s.v2 : s.v, side = mirror ? -1 : 1;
  // While the class predicts, the bench is laid out without using where the image is.
  const reach = conceal ? screenAt : Math.max(sharp, screenAt);
  const lo = -Math.max(p.u, mirror ? reach : 0), hi = mirror ? 0 : device === 'convex-mirror' ? s.x : reach;
  const span = hi - lo + 16, sc = LENGTH / span, mid = (lo + hi) / 2;
  return { s, device, mirror, sharp, side, sc, X: (cm: number) => (cm - mid) * sc };
}

function build(stage: Stage, device: Device, live: () => { p: BenchParams; conceal: boolean; screenAt: number }) {
  const { root, mesh, solid, G, M } = stage;
  // Bench, with a mark every 10 cm set each frame (the scale changes with the set-up).
  mesh(root, G(new THREE.BoxGeometry(LENGTH + 1.6, 0.22, 1)), solid('#CBD5E1', 0.6, 0.4), [0, RAIL, 0]);
  mesh(root, G(new THREE.BoxGeometry(LENGTH + 3, 0.16, 5)), solid('#EDF1F7', 0.95), [0, RAIL - 0.2, 0], false);
  const marks = new THREE.InstancedMesh(G(new THREE.BoxGeometry(0.03, 0.02, 0.5)), solid('#334155', 0.6), 40);
  root.add(marks);
  const glass = () => M(new THREE.MeshPhysicalMaterial({ color: '#BFE0FF', transparent: true, opacity: 0.42, roughness: 0.02, side: THREE.DoubleSide, depthWrite: false }));
  const post = solid('#64748B', 0.4, 0.6), rider = solid(COLOUR.dark, 0.5, 0.3);
  /** Something on a stand that slides along the bench. */
  const stand = () => {
    const z = 0;
    const g = new THREE.Group(); root.add(g);
    mesh(g, G(new THREE.CylinderGeometry(0.05, 0.05, 0.85, 12)), post, [0, RAIL + 0.72, z]);
    mesh(g, G(new THREE.BoxGeometry(0.5, 0.3, 1.2)), rider, [0, RAIL + 0.2, 0]);
    return g;
  };
  /** A lens turned to face along the bench: thick in the middle (convex) or at the rim (concave). */
  const lens = (g: THREE.Group, concave: boolean) => {
    const pts = Array.from({ length: 13 }, (_, i) => { const r = (i / 12) * 1.6, t = concave ? 0.07 + 0.2 * (r / 1.6) ** 2 : 0.27 * (1 - (r / 1.6) ** 2) + 0.02; return new THREE.Vector2(r, t); });
    for (const sgn of [1, -1]) { const half = mesh(g, G(new THREE.LatheGeometry(pts, 48)), glass(), [0, AXIS, 0], false); half.rotation.z = sgn * -Math.PI / 2; half.renderOrder = 3; }
    mesh(g, G(new THREE.TorusGeometry(1.62, 0.05, 8, 48)), post, [0, AXIS, 0]).rotation.y = Math.PI / 2;
  };
  /** A mirror facing the candle: hollow towards it (concave) or bulging towards it (convex). */
  const mirrorOn = (g: THREE.Group, concave: boolean) => {
    const pts = Array.from({ length: 13 }, (_, i) => { const r = (i / 12) * 1.6; return new THREE.Vector2(r, (concave ? -1 : 1) * 0.13 * r * r); });
    const m = mesh(g, G(new THREE.LatheGeometry(pts, 48)), M(new THREE.MeshStandardMaterial({ color: '#E5EAF0', roughness: 0.08, metalness: 1, side: THREE.DoubleSide })), [0, AXIS, 0]);
    m.rotation.z = -Math.PI / 2;
  };

  // The candle: its flame tip is the object point the rays leave from.
  const candle = stand();
  mesh(candle, G(new THREE.CylinderGeometry(0.16, 0.16, 2.3, 20)), solid('#FFF7E0', 0.7), [0, AXIS + H - 0.55 - 1.15, 0]);
  const flameShape = G(new THREE.ConeGeometry(0.14, 0.55, 16));
  mesh(candle, flameShape, M(new THREE.MeshBasicMaterial({ color: '#FFB020' })), [0, AXIS + H - 0.28, 0], false);
  const glow = new THREE.PointLight('#FFC766', 6, 9); glow.position.set(0, AXIS + H, 0.3); candle.add(glow);

  const first = stand(), second = stand();
  if (device === 'concave-mirror') mirrorOn(first, true); else lens(first, false);
  if (device === 'combo') { const twin = new THREE.Group(); twin.position.x = 0.34; first.add(twin); lens(twin, false); }
  if (device === 'convex-mirror') mirrorOn(second, false);
  if (device === 'concave-lens') lens(second, true);
  second.visible = device === 'convex-mirror' || device === 'concave-lens';

  // The screen, with the picture that falls on it painted onto a canvas.
  const screen = stand(), paper = document.createElement('canvas'); paper.width = paper.height = 256;
  const ink = paper.getContext('2d')!, picture = M(new THREE.CanvasTexture(paper));
  mesh(screen, G(new THREE.BoxGeometry(0.08, 3.5, 3.5)), solid('#F8FAFC', 0.9), [0, AXIS, 0]);
  const face = mesh(screen, G(new THREE.PlaneGeometry(3.3, 3.3)), M(new THREE.MeshBasicMaterial({ map: picture })), [0, AXIS, 0], false);
  screen.visible = device !== 'convex-mirror';
  let painted = '';
  /** The inverted flame as it lands on the screen: bigger with magnification, softer the further from focus. */
  const paint = (m: number, blur: number, shown: boolean) => {
    const key = `${m.toFixed(2)}|${blur.toFixed(1)}|${shown}`;
    if (key === painted) return;
    painted = key;
    ink.shadowBlur = 0; ink.fillStyle = '#FBFBF8'; ink.fillRect(0, 0, 256, 256);
    if (shown) {
      const size = Math.max(0.25, Math.min(2.4, m)) * 34, soft = Math.min(1, blur / 34);
      ink.save(); ink.translate(128, 128); ink.globalAlpha = 0.95 - 0.6 * soft;
      ink.shadowColor = '#FFB020'; ink.shadowBlur = 4 + blur * 1.6;
      // Upside down: the flame points down, with the candle above it.
      ink.fillStyle = '#FFB020'; ink.beginPath(); ink.moveTo(0, size * 1.05 + blur * 0.2); ink.quadraticCurveTo(size * 0.42 + blur * 0.3, size * 0.25, 0, 0); ink.quadraticCurveTo(-size * 0.42 - blur * 0.3, size * 0.25, 0, size * 1.05 + blur * 0.2); ink.fill();
      ink.shadowColor = '#D8CFB4'; ink.fillStyle = '#E9DFC4'; ink.fillRect(-size * 0.2 - blur * 0.15, -size * 1.7, size * 0.4 + blur * 0.3, size * 1.7);
      ink.restore();
    }
    picture.needsUpdate = true;
  };

  const rays = Array.from({ length: 9 }, () => makeRod(stage, root, RAY, 0.022, 0.85));
  const guide = makeRod(stage, root, '#10B981', 0.02, 0.9);
  const tags = Array.from({ length: TAGS }, () => ({ at: v3(), text: null as string | null }));
  const tip = v3(), a = v3(), b = v3(), c = v3(), m4 = new THREE.Matrix4();
  const clampY = (y: number) => Math.max(-2.5, Math.min(2.5, y));

  return {
    tags,
    update: () => {
      const { p, conceal, screenAt } = live(), L = plan(p, screenAt, conceal), { s, X, side } = L, show = !conceal;
      // Marks every 10 cm from the candle.
      for (let i = 0; i < 40; i++) { const x = X(-p.u + i * 10); marks.setMatrixAt(i, m4.makeScale(1, Math.abs(x) < LENGTH / 2 ? 1 : 0, i % 5 ? 0.6 : 1).setPosition(x, RAIL + 0.12, 0.3)); }
      marks.instanceMatrix.needsUpdate = true;
      candle.position.x = X(-p.u); first.position.x = X(0);
      if (device === 'convex-mirror') second.position.x = X(s.x);
      if (device === 'concave-lens') second.position.x = X(s.d);
      screen.position.x = X(side * screenAt); face.position.x = -side * 0.05; face.rotation.y = -side * Math.PI / 2;
      tip.set(X(-p.u), AXIS + H, 0);

      // Rays from the flame tip: through the top, middle and bottom of the first element, on to where the image is.
      const m1 = (device === 'combo' || device === 'convex-lens' || device === 'concave-mirror' ? s.v : s.v1) / p.u;
      const img1 = device === 'combo' || device === 'convex-lens' || device === 'concave-mirror' ? s.v : s.v1;
      rays.forEach(r => { r.rod.visible = false; });
      if (show) [APERTURE, 0, -APERTURE].forEach((y, j) => {
        const draw = (i: number, from: THREE.Vector3, to: THREE.Vector3) => { const r = rays[j * 3 + i]; r.rod.visible = true; r.set(from, to); };
        a.set(X(0), AXIS + y, 0); draw(0, tip, a);
        // A point `cm` along the bench on the straight line from (x0, y0) aimed at the image point (xi, yi).
        const on = (x0: number, y0: number, xi: number, yi: number, cm: number, out: THREE.Vector3) => out.set(X(cm), AXIS + clampY(y0 + ((yi - y0) * (cm - x0)) / (xi - x0)), 0);
        const y1 = -H * m1;
        if (device === 'convex-mirror') { on(0, y, img1, y1, s.x, b); draw(1, a, b); return; }
        if (device === 'concave-lens') {
          on(0, y, img1, y1, s.d, b); draw(1, a, b);
          const yc = b.y - AXIS, y2 = y1 * (s.vc / s.uc);
          on(s.d, yc, s.v2, y2, Math.max(screenAt, s.d + 1), c); draw(2, b, c);
          return;
        }
        on(0, y, side * img1, y1, side * screenAt, b); draw(1, a, b);
      });

      const blur = Math.abs(screenAt - L.sharp) * (2.6 / Math.max(L.sharp, 20)) * 34;
      paint(device === 'concave-lens' ? (s.v1 / p.u) * (s.vc / s.uc) : s.v / p.u, Math.min(60, blur), show);
      // Where the convex lens alone would have formed its image.
      const mark = show && (device === 'convex-mirror' || device === 'concave-lens');
      guide.rod.visible = mark;
      if (mark) guide.set(a.set(X(s.v1), AXIS - 1.6, 0), b.set(X(s.v1), AXIS + 1.6, 0));

      const sharpNow = Math.abs(screenAt - L.sharp) < 0.35;
      tags[0].at.set(X(-p.u), AXIS + H + 0.75, 0); tags[0].text = `Candle, u = ${fmt(p.u, 0)} cm`;
      tags[1].at.set(X(0), AXIS + 2.2, 0);
      tags[1].text = device === 'concave-mirror' ? `Concave mirror, f = ${fmt(p.f, 0)} cm` : device === 'combo' ? `Lenses in contact, ${fmt(p.f, 0)} cm + ${fmt(p.f2, 0)} cm` : `Convex lens, f = ${fmt(p.f, 0)} cm`;
      tags[2].at.set(second.position.x, AXIS + 2.85, 0);
      tags[2].text = device === 'convex-mirror' ? `Convex mirror, ${fmt(s.x, 1)} cm from the lens` : device === 'concave-lens' ? `Concave lens, ${fmt(s.d, 1)} cm from the first` : null;
      tags[3].at.set(X(side * screenAt) + side * 0.9, AXIS + 2.3, 0); tags[3].text = device === 'convex-mirror' ? null : show ? `Screen at ${fmt(screenAt, 1)} cm` : 'Screen: where will the image be sharp?';
      tags[4].at.set(X(side * screenAt) + side * 0.9, AXIS - 1.5, 1.9);
      tags[4].text = device === 'convex-mirror' || !show ? null : sharpNow ? `Sharp: v = ${fmt(L.sharp, 1)} cm` : screenAt < L.sharp ? 'Blurred: the rays have not met yet' : 'Blurred: the rays met and spread again';
      tags[5].at.set(X(s.v1 ?? 0), AXIS - 2.05, 0.6);
      tags[5].text = !mark ? null : device === 'convex-mirror' ? `Lens image I = centre of the mirror, R = ${fmt(s.R, 1)} cm` : 'I₁: image of the convex lens alone';
      tags[6].at.set(X(-p.u), AXIS - 0.9, 0.9);
      tags[6].text = show && device === 'convex-mirror' ? 'The rays come back on themselves: the image falls on the candle' : null;
    },
  };
}

export default function LensBench3D({ params: p, conceal, onFail }: ViewProps<BenchParams> & { onFail: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const tags = useRef<(HTMLSpanElement | null)[]>([]);
  const stage = useRef<Stage | null>(null);
  const device = p.device as Device, sol = solveBench(p) as Required<BenchSolution>, sharp = device === 'concave-lens' ? sol.v2 : sol.v;
  // How far the screen has been slid from where the image is sharp; a new set-up puts it back in focus.
  const sig = `${p.device}|${p.f}|${p.u}|${p.f2}`;
  const [moved, setMoved] = useState({ sig, by: 0 });
  const by = moved.sig === sig ? moved.by : 0;
  const nearest = device === 'concave-lens' ? sol.d + 2 : 4;
  // While the class predicts, the screen is parked as far out as the candle, not at the answer.
  const screenAt = Math.max(nearest, conceal ? p.u : sharp + by);
  const live = useRef({ p, conceal, screenAt });
  useEffect(() => { live.current = { p, conceal, screenAt }; });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // Seen from the side the screen's face is turned to: the candle's side for a lens, the far side for a mirror.
    const s = createStage(el, { ...VIEW, from: [device === 'concave-mirror' ? 0.6 : -0.6, 0.32, 1] });
    if (!s) { onFail(); return; }
    stage.current = s;
    const scene = build(s, device, () => live.current);
    s.onFrame(() => {
      scene.update();
      for (let i = 0; i < TAGS; i++) s.tag(tags.current[i], scene.tags[i].at, scene.tags[i].text);
    });
    return () => { stage.current = null; s.dispose(); };
  }, [device, onFail]);

  return (
    <div className="lab-3d" role="img" aria-label="The optical bench in 3D">
      <div className="lab-3d-stage" ref={host} />
      {Array.from({ length: TAGS }, (_, i) => <span key={i} className="lab-3d-label lab-3d-tag" ref={n => { tags.current[i] = n; }} style={{ opacity: 0 }} />)}
      <div className="lab-3d-looks">{LOOKS.map(l => <button key={l.label} type="button" onClick={() => stage.current?.view(l.from)}>{l.label}</button>)}</div>
      <div className="lab-3d-foot">
        {device !== 'convex-mirror' && !conceal && (
          <label className="lab-3d-scrub lab-3d-plate">
            <span>Move the screen</span>
            <input type="range" min={nearest - sharp} max={Math.min(60, 200 - sharp)} step={0.1} value={by} aria-label="Move the screen along the bench" onChange={e => setMoved({ sig, by: Number(e.target.value) })} />
            <button type="button" className="lab-3d-mini" onClick={() => setMoved({ sig, by: 0 })}>Sharpest</button>
          </label>
        )}
        <p className="lab-3d-note">{conceal ? 'Drag to turn it. The rays and the image are left off until you reveal.' : device === 'convex-mirror' ? 'Drag to turn it.' : 'Drag to turn it. Slide the screen: the image is sharp only where the rays meet.'}</p>
      </div>
    </div>
  );
}
