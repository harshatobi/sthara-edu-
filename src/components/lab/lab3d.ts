'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * What every 3D lab view needs: a lit scene the class can turn by dragging, a
 * camera that keeps the apparatus in frame at any size, labels that follow
 * points in the scene, and clean-up. Plus the two things physics scenes draw
 * all the time: arrows (field, current, force) and dots flowing along a path.
 */

export type Vec3 = [number, number, number];
export const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
/** A repeatable "random" number in 0-1 for the nth thing, so a scene looks the same every time. */
export const rnd = (n: number) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
export const COLOUR = { current: '#F59E0B', field: '#2F6BFF', force: '#10B981', copper: '#B8692E', north: '#E11D48', south: '#2F6BFF', steel: '#8A94A3', dark: '#1B2533' };

export interface StageOptions {
  /** The point the camera looks at, and half the height it must take in around it. */
  target: Vec3; span: number;
  /** How wide the apparatus is compared with its height (a narrow stage steps back to keep it in). */
  wide?: number;
  /** The direction the camera starts from. */
  from?: Vec3;
  shadows?: boolean;
  /** A lit room for metal to reflect. */
  shine?: boolean;
  /** How far the class may tip the view, as fractions of a half turn from straight above. */
  tip?: [number, number];
}

export interface Stage {
  root: THREE.Group; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  /** Geometry and material made through these are freed with the stage. */
  G: <T extends THREE.BufferGeometry>(g: T) => T;
  M: <T extends THREE.Material | THREE.Texture>(m: T) => T;
  mesh: (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, at?: Vec3, cast?: boolean) => THREE.Mesh;
  solid: (colour: string, roughness?: number, metalness?: number) => THREE.MeshStandardMaterial;
  /** Called every frame with the time and the time since the last frame, both in seconds. */
  onFrame: (fn: (t: number, dt: number) => void) => void;
  /** Puts an HTML label over a point of the scene; null text hides it. */
  tag: (node: HTMLElement | null, at: THREE.Vector3, text: string | null) => void;
  /** Swings the camera round to look from this direction. */
  view: (from: Vec3) => void;
  dispose: () => void;
}

/** Null when the browser can't draw 3D. */
export function createStage(el: HTMLElement, o: StageOptions): Stage | null {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if (o.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  el.appendChild(renderer.domElement);

  const keep: { dispose: () => void }[] = [];
  const G = <T extends THREE.BufferGeometry>(g: T) => { keep.push(g); return g; };
  const M = <T extends THREE.Material | THREE.Texture>(m: T) => { keep.push(m); return m; };
  const scene = new THREE.Scene(), root = new THREE.Group();
  scene.add(root);
  if (o.shine) {
    const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), env = pmrem.fromScene(room, 0.04);
    scene.environment = env.texture; scene.environmentIntensity = 0.6;
    keep.push(env, room, pmrem);
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb4c0d2, o.shine ? 0.6 : 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, o.shine ? 1.5 : 1.8);
  const reach = o.span * 2.4;
  sun.position.set(o.target[0] - reach * 0.5, o.target[1] + reach * 1.3, o.target[2] + reach * 0.9);
  sun.target.position.set(...o.target); scene.add(sun.target);
  if (o.shadows) {
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.radius = 5; sun.shadow.bias = -0.0006;
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: reach * 6 });
  }
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdbe7ff, 0.45); fill.position.set(o.target[0] + reach, o.target[1], o.target[2] + reach * 0.5); scene.add(fill);

  const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 1000), target = new THREE.Vector3(...o.target);
  camera.position.copy(target).add(new THREE.Vector3(...(o.from ?? [0.5, 0.3, 1])).normalize().multiplyScalar(40));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enablePan = false; controls.enableZoom = false; controls.enableDamping = true; controls.rotateSpeed = 0.6;
  controls.minPolarAngle = Math.PI * (o.tip?.[0] ?? 0.08); controls.maxPolarAngle = Math.PI * (o.tip?.[1] ?? 0.92);

  const fit = () => {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan((camera.fov * Math.PI) / 360), d = Math.max(o.span / t, (o.span * (o.wide ?? 1.4)) / (t * camera.aspect));
    camera.position.sub(target).setLength(d).add(target);
    camera.updateProjectionMatrix();
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(el);

  // A view the class asked for: the camera eases round to it until they take hold again.
  let wanted: THREE.Vector3 | null = null;
  const letGo = () => { wanted = null; };
  controls.addEventListener('start', letGo);

  const frames: ((t: number, dt: number) => void)[] = [];
  const spot = new THREE.Vector3(), dirNow = new THREE.Vector3();
  let raf = 0, last = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    // Paced by the clock, not the frame count, so a slow machine keeps time.
    const dt = Math.min(0.25, last ? (now - last) / 1000 : 0.016); last = now;
    if (wanted) {
      const d = camera.position.distanceTo(target);
      dirNow.copy(camera.position).sub(target).normalize().lerp(wanted, 1 - Math.exp(-dt * 6)).normalize();
      camera.position.copy(target).addScaledVector(dirNow, d);
      if (dirNow.distanceTo(wanted) < 0.002) wanted = null;
    }
    for (const f of frames) f(now / 1000, dt);
    controls.update();
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  return {
    root, scene, camera, G, M,
    mesh: (parent, g, m, at = [0, 0, 0], cast = !!o.shadows) => { const x = new THREE.Mesh(g, m); x.position.set(...at); x.castShadow = cast; x.receiveShadow = !!o.shadows; parent.add(x); return x; },
    solid: (colour, roughness = 0.55, metalness = 0) => M(new THREE.MeshStandardMaterial({ color: colour, roughness, metalness })),
    onFrame: fn => { frames.push(fn); },
    tag: (node, at, text) => {
      if (!node) return;
      if (text === null) { node.style.opacity = '0'; return; }
      if (node.textContent !== text) node.textContent = text;
      spot.copy(at).project(camera);
      node.style.transform = `translate(-50%, -50%) translate(${((spot.x + 1) / 2) * el.clientWidth}px, ${((1 - spot.y) / 2) * el.clientHeight}px)`;
      node.style.opacity = spot.z < 1 ? '1' : '0';
    },
    view: from => { wanted = new THREE.Vector3(...from).normalize(); },
    dispose: () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.removeEventListener('start', letGo); controls.dispose();
      for (const x of keep) x.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}

const UP = new THREE.Vector3(0, 1, 0);

/** An arrow from one point to another: a field, a current or a force. */
export function makeArrow(stage: Stage, parent: THREE.Object3D, colour: string, thick = 0.07) {
  const group = new THREE.Group(), stuff = stage.M(new THREE.MeshStandardMaterial({ color: colour, roughness: 0.45, transparent: true }));
  const shaftShape = stage.G(new THREE.CylinderGeometry(thick, thick, 1, 14)); shaftShape.translate(0, 0.5, 0);
  const headLen = thick * 5.5, headShape = stage.G(new THREE.ConeGeometry(thick * 2.6, headLen, 18)); headShape.translate(0, headLen / 2, 0);
  const shaft = new THREE.Mesh(shaftShape, stuff), head = new THREE.Mesh(headShape, stuff);
  group.add(shaft, head); parent.add(group);
  const d = new THREE.Vector3();
  return {
    group, stuff,
    set: (from: THREE.Vector3, to: THREE.Vector3) => {
      d.subVectors(to, from);
      const len = Math.max(d.length(), headLen + 0.001);
      group.position.copy(from); group.quaternion.setFromUnitVectors(UP, d.normalize());
      shaft.scale.y = len - headLen; head.position.y = len - headLen;
    },
  };
}

/** A straight rod between two points that can be moved every frame: a ray of light, a wire. */
export function makeRod(stage: Stage, parent: THREE.Object3D, colour: string, thick = 0.03, opacity = 1) {
  const shape = stage.G(new THREE.CylinderGeometry(thick, thick, 1, 8)); shape.translate(0, 0.5, 0);
  const rod = new THREE.Mesh(shape, stage.M(new THREE.MeshBasicMaterial({ color: colour, transparent: opacity < 1, opacity })));
  parent.add(rod);
  const d = new THREE.Vector3();
  return {
    rod,
    set: (from: THREE.Vector3, to: THREE.Vector3) => { d.subVectors(to, from); const len = d.length(); rod.position.copy(from); rod.scale.y = Math.max(len, 0.0001); rod.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1)); },
  };
}

/** Dots moving along a path, to show which way something flows; a negative speed runs them backwards. */
export function makeFlow(stage: Stage, parent: THREE.Object3D, path: THREE.Curve<THREE.Vector3>, count: number, colour: string, size: number) {
  const dots = new THREE.InstancedMesh(stage.G(new THREE.SphereGeometry(1, 12, 10)), stage.M(new THREE.MeshBasicMaterial({ color: colour })), count);
  parent.add(dots);
  const m4 = new THREE.Matrix4(), at = new THREE.Vector3();
  let phase = 0;
  return {
    dots,
    update: (dt: number, speed: number) => {
      phase = (phase + dt * speed + 1) % 1;
      for (let i = 0; i < count; i++) { path.getPointAt((i / count + phase) % 1, at); dots.setMatrixAt(i, m4.makeScale(size, size, size).setPosition(at)); }
      dots.instanceMatrix.needsUpdate = true;
    },
  };
}

/** A straight path, for wires and rods. */
export const line = (a: Vec3, b: Vec3) => new THREE.LineCurve3(new THREE.Vector3(...a), new THREE.Vector3(...b));

/**
 * A run of the experiment, 0 → 1 over `ms`, read by the drawing loop. It stays
 * at 0 until the teacher runs it (and while the class predicts), then holds
 * at 1.
 */
export function usePlay(runKey: number, conceal: boolean, ms: number) {
  const play = useRef({ k: 0, playing: false, from: 0, ms });
  useEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    play.current = !runKey || conceal ? { k: 0, playing: false, from: 0, ms } : { k: still ? 1 : 0, playing: !still, from: performance.now(), ms };
  }, [runKey, conceal, ms]);
  return play;
}

/** How far the run has got at this moment. */
export function progress(play: { current: { k: number; playing: boolean; from: number; ms: number } }) {
  const p = play.current;
  if (p.playing) { p.k = Math.min(1, (performance.now() - p.from) / p.ms); if (p.k >= 1) p.playing = false; }
  return p.k;
}
