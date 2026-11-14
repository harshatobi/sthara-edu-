'use client';

import { useEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { optics, SLIDES, suits, type MicroscopeParams } from '@/lib/lab/engines/microscope';
import { COARSE, FINE, FOCUS, blurOf, touching } from '@/lib/lab/focus';
import { fmt } from '@/lib/lab/types';
import { organism, tile } from './MicroscopeView';
import type { ViewProps } from './types';

/**
 * The microscope in 3D (prototype): a compound microscope the class works
 * like the real one. Click the nosepiece to change objective, raise the stage
 * with the coarse and fine knobs until the image is sharp, move the slide,
 * set the light. The eyepiece view is the engine's true-scale drawing, blurred
 * by how far out of focus the stage is (lib/lab/focus). Slide and objective
 * are the engine's values; focus, light and slide position live here.
 */

type Objective = MicroscopeParams['objective'];
const ORDER: Objective[] = ['4', '10', '40'];
// Barrel length (cm) and the standard colour band of each objective.
const BARREL: Record<Objective, { len: number; band: string }> = { '4': { len: 1.8, band: '#D92D20' }, '10': { len: 2.3, band: '#F5B301' }, '40': { len: 3.4, band: '#2F6BFF' } };
const TURRET_Y = 13.55, SLIDE_TOP = 9.65;
/** How far the stage is drawn to move for each real millimetre (so the 40× tip meets the slide exactly at its working distance). */
const RISE = (TURRET_Y - 0.25 - BARREL['40'].len - SLIDE_TOP) / FOCUS['40'].working;
const PAN_LIMIT = 6; // mm either way
const R = 200, C = 220; // eyepiece field radius and centre in its own drawing

const PARTS: { name: string; at: [number, number, number] }[] = [
  { name: 'Eyepiece', at: [0, 22.1, 1] }, { name: 'Body tube', at: [0, 18.6, 1] }, { name: 'Nosepiece', at: [0, 13.9, -0.3] },
  { name: 'Objectives', at: [0, 11.6, 1] }, { name: 'Stage', at: [3.6, 9.4, 1] }, { name: 'Coarse focus', at: [1.9, 6.5, -4.5] },
  { name: 'Fine focus', at: [2.5, 5.2, -4.5] }, { name: 'Arm', at: [0, 12.5, -4.2] }, { name: 'Light', at: [0, 1.9, 1] }, { name: 'Base', at: [3, 0.6, 3] },
];

interface Scope {
  turret: THREE.Group; stage: THREE.Group; slide: THREE.Group; coarse: THREE.Group[]; fine: THREE.Group[];
  lamp: THREE.MeshStandardMaterial; beam: THREE.MeshBasicMaterial; smear: THREE.MeshStandardMaterial; picks: THREE.Object3D[]; dispose: () => void;
}

function buildScope(root: THREE.Group): Scope {
  const keep: { dispose: () => void }[] = [];
  const G = <T extends THREE.BufferGeometry>(g: T) => { keep.push(g); return g; };
  const M = <T extends THREE.Material>(m: T) => { keep.push(m); return m; };
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, at: [number, number, number] = [0, 0, 0]) => {
    const x = new THREE.Mesh(g, m); x.position.set(...at); x.castShadow = true; x.receiveShadow = true; parent.add(x); return x;
  };
  const body = M(new THREE.MeshStandardMaterial({ color: '#2A4868', roughness: 0.38, metalness: 0.25 }));
  const dark = M(new THREE.MeshStandardMaterial({ color: '#161E2A', roughness: 0.5, metalness: 0.3 }));
  const chrome = M(new THREE.MeshStandardMaterial({ color: '#D5DCE5', roughness: 0.18, metalness: 0.95 }));
  const glass = M(new THREE.MeshPhysicalMaterial({ color: '#DCEBFA', transparent: true, opacity: 0.45, roughness: 0.03, depthWrite: false }));
  const cyl = (rt: number, rb: number, h: number, seg = 36) => G(new THREE.CylinderGeometry(rt, rb, h, seg));

  // Bench top, base and light.
  const top = add(root, G(new THREE.CircleGeometry(8.8, 72)), M(new THREE.MeshStandardMaterial({ color: '#EDF1F7', roughness: 0.95 })));
  top.rotation.x = -Math.PI / 2; top.castShadow = false;
  add(root, G(new THREE.BoxGeometry(8, 1, 11.5)), body, [0, 0.5, -0.6]);
  add(root, cyl(1.35, 1.5, 0.8), dark, [0, 1.4, 1]);
  const lamp = M(new THREE.MeshStandardMaterial({ color: '#FFF6D8', emissive: '#FFE9A8', emissiveIntensity: 1.5, roughness: 0.4 }));
  add(root, cyl(0.95, 0.95, 0.12), lamp, [0, 1.86, 1]).castShadow = false;
  const beam = M(new THREE.MeshBasicMaterial({ color: '#FFF1BF', transparent: true, opacity: 0.1, depthWrite: false }));
  const ray = add(root, cyl(0.55, 0.9, 6.4, 28), beam, [0, 5.1, 1]); ray.castShadow = false; ray.receiveShadow = false; ray.renderOrder = 4;

  // Arm, head, body tube and eyepiece.
  const spine = new THREE.CatmullRomCurve3([[0, 1, -4.2], [0, 7, -4.7], [0, 12.5, -4.2], [0, 15.5, -2.3], [0, 16, 0.1]].map(p => new THREE.Vector3(...p)));
  add(root, G(new THREE.TubeGeometry(spine, 48, 1.05, 18)), body);
  add(root, G(new THREE.BoxGeometry(3, 1.7, 3.6)), body, [0, 15.6, 0.5]);
  add(root, cyl(0.95, 0.95, 4.6), dark, [0, 18.7, 1]);
  add(root, cyl(1.02, 1.02, 0.3), chrome, [0, 16.6, 1]);
  add(root, cyl(0.72, 0.78, 1.3), dark, [0, 21.6, 1]);
  add(root, cyl(0.6, 0.6, 0.06), glass, [0, 22.27, 1]).castShadow = false;

  // Revolving nosepiece: the objective at the front sits on the optical axis.
  add(root, cyl(0.8, 0.9, 1), dark, [0, TURRET_Y + 0.75, -0.3]);
  const turret = new THREE.Group(); turret.position.set(0, TURRET_Y, -0.3); root.add(turret);
  add(turret, cyl(2.05, 2.15, 0.5, 48), chrome);
  const picks: THREE.Object3D[] = [];
  ORDER.forEach((o, i) => {
    const a = (i * Math.PI * 2) / 3, { len, band } = BARREL[o];
    const g = new THREE.Group(); g.position.set(Math.sin(a) * 1.3, -0.25, Math.cos(a) * 1.3); g.userData.objective = o; turret.add(g);
    add(g, cyl(0.5, 0.44, len - 0.3), chrome, [0, -(len - 0.3) / 2, 0]);
    add(g, cyl(0.44, 0.24, 0.3), chrome, [0, -len + 0.15, 0]);
    add(g, cyl(0.53, 0.53, 0.2), M(new THREE.MeshStandardMaterial({ color: band, roughness: 0.4 })), [0, -Math.min(0.9, len * 0.4), 0]);
    picks.push(g);
  });

  // Stage (moves up and down), with the condenser under it and the slide on it.
  const stage = new THREE.Group(); root.add(stage);
  add(stage, G(new THREE.BoxGeometry(8, 0.4, 8)), dark, [0, -0.5, 1]);
  add(stage, G(new THREE.BoxGeometry(2.4, 1.2, 3.4)), body, [0, -1.1, -2.6]);
  add(stage, cyl(0.9, 0.7, 1.2), dark, [0, -1.3, 1]);
  add(stage, cyl(0.6, 0.6, 0.02), lamp, [0, -0.29, 1]).castShadow = false;
  const slide = new THREE.Group(); slide.position.set(0, -0.3, 1); stage.add(slide);
  add(slide, G(new THREE.BoxGeometry(6.5, 0.1, 2.2)), glass, [0, 0.05, 0]).renderOrder = 3;
  const smear = M(new THREE.MeshStandardMaterial({ color: '#F2B8CC', roughness: 0.8, transparent: true, opacity: 0.85 }));
  add(slide, cyl(0.6, 0.6, 0.02), smear, [0, 0.11, 0]).castShadow = false;
  add(slide, G(new THREE.BoxGeometry(1.7, 0.03, 1.7)), glass, [0, 0.13, 0]).renderOrder = 3;
  for (const s of [-1, 1]) { const clip = add(stage, G(new THREE.BoxGeometry(3.1, 0.06, 0.32)), chrome, [s * 2.3, -0.16, 2.3]); clip.rotation.y = s * 0.5; }

  // Focus knobs on both sides of the arm: the big one is coarse, the small one fine.
  const knob = (r: number, w: number, x: number, y: number, stuff: THREE.Material) => {
    const g = new THREE.Group(); g.position.set(x, y, -4.5); root.add(g);
    add(g, cyl(r, r, w, 40), stuff).rotation.z = Math.PI / 2;
    add(g, G(new THREE.BoxGeometry(w + 0.04, 0.16, r * 0.9)), chrome, [0, 0, r * 0.5]);
    return g;
  };
  const coarse = [-1, 1].map(s => knob(1.25, 0.7, s * 1.5, 6.5, dark));
  const fine = [-1, 1].map(s => knob(0.68, 0.55, s * 2.1, 5.1, dark));

  return { turret, stage, slide, coarse, fine, lamp, beam, smear, picks, dispose: () => { for (const x of keep) x.dispose(); } };
}

/** What the eye sees: the slide at true scale, blurred when out of focus, moved (inverted) as the slide is moved. */
function Field({ p, blur, light, pan, shade }: { p: MicroscopeParams; blur: number; light: number; pan: [number, number]; shade: React.RefObject<SVGCircleElement | null> }) {
  const id = useId().replace(/:/g, '');
  const o = optics(p), pxPerUm = (2 * R) / (o.fov * 1000), half = (o.fov * 1000) / 2 + 40 / pxPerUm;
  const t = tile(p.slide), org = organism(p.slide);
  // The image is inverted: the slide going right shows as the picture going left.
  const dx = -pan[0] * 1000, dy = pan[1] * 1000;
  const target = (o.fov * 1000) / 5, mag = 10 ** Math.floor(Math.log10(target));
  const um = [1, 2, 5, 10].map(m => m * mag).reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
  return (
    <svg className="lab-svg lab-scope-field" viewBox={`0 0 ${2 * C} ${2 * C}`} role="img" aria-label={`The view down the eyepiece at ${o.total} times${blur > 2 ? ', out of focus' : ''}`}>
      <defs>
        <clipPath id={`f-${id}`}><circle cx={C} cy={C} r={R} /></clipPath>
        {t && <pattern id={`p-${id}`} patternUnits="userSpaceOnUse" width={t.w} height={t.h}>{t.body}</pattern>}
      </defs>
      <circle cx={C} cy={C} r={R + 16} fill="#0F172A" />
      <g clipPath={`url(#f-${id})`}>
        <rect x={C - R} y={C - R} width={2 * R} height={2 * R} fill="#FFFDF7" />
        <g style={{ filter: blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : undefined }}>
          <g transform={`translate(${C} ${C}) scale(${pxPerUm}) translate(${dx} ${dy})`}>
            {t && <rect x={-dx - half} y={-dy - half} width={2 * half} height={2 * half} fill={`url(#p-${id})`} />}
            {org}
          </g>
        </g>
        <rect x={C - R} y={C - R} width={2 * R} height={2 * R} fill="#0B1220" opacity={0.92 * (1 - light) ** 1.5} />
        <circle ref={shade} cx={C} cy={C} r={R} fill="#0B1220" opacity={0} />
      </g>
      <circle cx={C} cy={C} r={R} fill="none" stroke="#0F172A" strokeWidth={3} />
      {blur < 2 && light > 0.25 && (
        <g>
          <line x1={C - R + 34} x2={C - R + 34 + um * pxPerUm} y1={C + R - 30} y2={C + R - 30} stroke="#0F172A" strokeWidth={5} />
          <text className="lb-sm" x={C - R + 34} y={C + R - 40}>{um >= 1000 ? `${um / 1000} mm` : `${um} µm`}</text>
        </g>
      )}
    </svg>
  );
}

export default function Microscope3D({ params: p, setParam, conceal, locked, onFail }: ViewProps<MicroscopeParams> & { onFail: () => void }) {
  const [coarse, setCoarse] = useState(0);
  const [fine, setFine] = useState(0);
  const [light, setLight] = useState(0.9);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  const [parts, setParts] = useState(false);
  const z = coarse + fine, hit = touching(p.objective, z), o = optics(p), s = SLIDES[p.slide], fit = suits(p);
  const blur = blurOf(p.objective, z);

  const host = useRef<HTMLDivElement>(null);
  const shade = useRef<SVGCircleElement>(null);
  const tags = useRef<(HTMLSpanElement | null)[]>([]);
  // What the drawing loop reads each frame.
  const live = useRef({ z, coarse, fine, light, pan, objective: p.objective, stain: s.stain, kingdom: s.kingdom, parts, locked });
  useEffect(() => { live.current = { z, coarse, fine, light, pan, objective: p.objective, stain: s.stain, kingdom: s.kingdom, parts, locked }; });
  const turn = useRef<(o: Objective) => void>(() => {});
  useEffect(() => { turn.current = next => setParam('objective', next); }, [setParam]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { onFail(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    // A plain lit room for the chrome to reflect.
    const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), env = pmrem.fromScene(room, 0.04);
    scene.environment = env.texture; scene.environmentIntensity = 0.7;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb4c0d2, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-9, 26, 14); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.radius = 5; sun.shadow.bias = -0.0006;
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 26, bottom: -6, near: 1, far: 70 });
    scene.add(sun);
    const root = new THREE.Group(); scene.add(root);
    const scope = buildScope(root);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 300);
    const target = new THREE.Vector3(0, 10.6, -0.8);
    camera.position.copy(target).add(new THREE.Vector3(0.62, 0.2, 1).normalize().multiplyScalar(50));
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enablePan = false; controls.enableZoom = false; controls.enableDamping = true; controls.rotateSpeed = 0.6;
    controls.minPolarAngle = Math.PI * 0.2; controls.maxPolarAngle = Math.PI * 0.52;

    const size = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const t = Math.tan((camera.fov * Math.PI) / 360), d = Math.max(13.4 / t, 9.4 / (t * camera.aspect));
      camera.position.sub(controls.target).setLength(d).add(controls.target);
      camera.updateProjectionMatrix();
    };
    size();

    // A click (not a drag) on an objective turns the nosepiece to the next one.
    const ray = new THREE.Raycaster(), at = new THREE.Vector2();
    let down: [number, number] | null = null;
    const over = (e: PointerEvent) => {
      const b = renderer.domElement.getBoundingClientRect();
      at.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(at, camera);
      return ray.intersectObjects(scope.picks, true).length > 0 || ray.intersectObject(scope.turret.children[0]).length > 0;
    };
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      const moved = down ? Math.hypot(e.clientX - down[0], e.clientY - down[1]) : 99;
      down = null;
      if (moved > 5 || live.current.locked || !over(e)) return;
      turn.current(ORDER[(ORDER.indexOf(live.current.objective) + 1) % ORDER.length]);
    };
    const onMove = (e: PointerEvent) => { if (!down) renderer.domElement.style.cursor = !live.current.locked && over(e) ? 'pointer' : 'grab'; };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);

    const STAIN = new THREE.Color(), spot = new THREE.Vector3();
    let raf = 0, angle: number | null = null, last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // Eased by the clock, not by the frame count, so a slow machine gets there just as soon.
      const dt = Math.min(0.5, last ? (now - last) / 1000 : 0.016); last = now;
      const L = live.current, f = FOCUS[L.objective];
      // The nosepiece swings round to the chosen objective; the view is dark until it clicks into place.
      const want = -(ORDER.indexOf(L.objective) * Math.PI * 2) / 3;
      if (angle === null) angle = want;
      const gap = Math.atan2(Math.sin(want - angle), Math.cos(want - angle));
      angle += Math.abs(gap) < 0.004 ? gap : gap * (1 - Math.exp(-dt * 8));
      scope.turret.rotation.y = angle;
      if (shade.current) shade.current.setAttribute('opacity', String(Math.min(1, Math.abs(gap) * 4)));
      // The stage stops where the slide meets the objective.
      scope.stage.position.y = SLIDE_TOP + 0.3 - 0.13 + Math.min(L.z - f.sharpAt, f.working) * RISE;
      scope.slide.position.x = L.pan[0] * 0.28; scope.slide.position.z = 1 - L.pan[1] * 0.12;
      scope.coarse.forEach(k => { k.rotation.x = L.coarse * 2.2; });
      scope.fine.forEach(k => { k.rotation.x = L.fine * 40; });
      scope.lamp.emissiveIntensity = 0.15 + 2.4 * L.light; scope.beam.opacity = 0.16 * L.light;
      scope.smear.color.copy(STAIN.set(L.stain?.startsWith('Methylene') ? '#9DB7F5' : L.stain ? '#F2B8CC' : L.kingdom === 'Plant' ? '#BFE3B4' : '#E9DFC8'));
      controls.update();
      renderer.render(scene, camera);
      const w = el.clientWidth, h = el.clientHeight;
      PARTS.forEach((part, i) => {
        const node = tags.current[i];
        if (!node) return;
        spot.set(...part.at).project(camera);
        node.style.transform = `translate(-50%, -50%) translate(${((spot.x + 1) / 2) * w}px, ${((1 - spot.y) / 2) * h}px)`;
        node.style.opacity = L.parts ? '1' : '0';
      });
    };
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(size);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); scope.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
      env.dispose(); room.dispose(); pmrem.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [onFail]);

  const step = o.fov / 6;
  const move = (dx: number, dy: number) => setPan(([x, y]) => [Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, x + dx * step)), Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, y + dy * step))]);
  const sharp = () => { setCoarse(0); setFine(Math.round(FOCUS[p.objective].sharpAt / FINE.step) * FINE.step); };
  const state = hit ? 'The objective is touching the slide. Lower the stage: at high power use only the fine focus.'
    : light < 0.25 ? 'Too dark to see: turn the light up.'
      : blur > 6 ? (p.objective === '40' ? 'Out of focus. At 40× use the fine focus only.' : 'Out of focus: raise or lower the stage with the coarse focus.')
        : blur > 0.5 ? 'Nearly there: finish with the fine focus.'
          : fit === 'too-big' ? 'Sharp, but only part of it fits: go to low power (4×).'
            : fit === 'too-small' ? 'Sharp, but too small to make out: turn to a stronger objective.' : 'In focus.';

  return (
    <div className="lab-3d lab-scope">
      <div className="lab-scope-model">
        <div className="lab-3d-stage" ref={host} />
        {PARTS.map((part, i) => <span key={part.name} className="lab-3d-label lab-scope-tag" ref={n => { tags.current[i] = n; }} style={{ opacity: 0 }}>{part.name}</span>)}
        <p className="lab-scope-hint">{locked ? 'Drag to turn.' : 'Click the nosepiece to change objective. Drag to turn.'}</p>
        <button type="button" className="lab-scope-parts" aria-pressed={parts} onClick={() => setParts(v => !v)}>{parts ? 'Hide the names' : 'Name the parts'}</button>
      </div>

      <div className="lab-scope-eye">
        <Field p={p} blur={hit ? 16 : blur} light={light} pan={pan} shade={shade} />
        <p className="lab-scope-mag"><b>{o.total}×</b> · 10× eyepiece × {p.objective}× objective · field {fmt(o.fov, 2)} mm</p>
      </div>

      <div className="lab-scope-side">
        <b className="lab-scope-name">{conceal ? 'Unknown slide' : s.label}</b>
        <p className={`lab-scope-state${hit ? ' bad' : blur <= 0.5 && light >= 0.25 ? ' good' : ''}`} role="status">{state}</p>
        <label>Coarse focus<input type="range" min={COARSE.min} max={COARSE.max} step={COARSE.step} value={coarse} onChange={e => setCoarse(Number(e.target.value))} /></label>
        <label>Fine focus<input type="range" min={FINE.min} max={FINE.max} step={FINE.step} value={fine} onChange={e => setFine(Number(e.target.value))} /></label>
        <label>Light<input type="range" min={0} max={1} step={0.01} value={light} onChange={e => setLight(Number(e.target.value))} /></label>
        <div className="lab-scope-move">
          <span>Move the slide</span>
          <div>
            <button type="button" aria-label="Move the slide left" onClick={() => move(-1, 0)}>←</button>
            <button type="button" aria-label="Move the slide away from you" onClick={() => move(0, 1)}>↑</button>
            <button type="button" aria-label="Move the slide towards you" onClick={() => move(0, -1)}>↓</button>
            <button type="button" aria-label="Move the slide right" onClick={() => move(1, 0)}>→</button>
            <button type="button" className="wide" onClick={() => setPan([0, 0])}>Centre</button>
          </div>
          <small>The picture moves the opposite way: the image is inverted.</small>
        </div>
        <button type="button" className="lab-scope-sharp" onClick={sharp}>Focus it for me</button>
      </div>
    </div>
  );
}
