'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { equationText, parseFormula, pretty, solveReaction, type ReactionParams } from '@/lib/lab/engines/reactions';
import { ATOM_COLOUR, halfSizeOf, modelOf, radiusOf, type Model } from '@/lib/lab/molecules';
import type { ViewProps } from './types';

/**
 * The reaction bench in 3D (prototype). Every atom is one ball that lasts the
 * whole reaction: on Run the reactants' bonds let go, each atom travels to its
 * place in a product, and the new bonds form, so the class sees that no atom
 * is made or lost. The counts come from the engine's balancer; the shapes from
 * lib/lab/molecules. While the class predicts, one of each species is shown
 * and nothing moves (the coefficients are the answer).
 */

const DURATION = 5200;
const GAP = 1.6; // half the empty middle between reactants and products, Å
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
/** A repeatable "random" number in 0-1 for the nth thing, so a scene looks the same every time. */
const rnd = (n: number) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

interface Mol { centre: THREE.Vector3; axis: THREE.Vector3; speed: number }
interface Place { mol: number; local: THREE.Vector3 }
interface AtomPlan { el: string; a: Place; b: Place | null; bulge: THREE.Vector3 }
interface Label { text: string; side: 'reactant' | 'product'; at: THREE.Vector3 }
interface Plan { mols: Mol[]; atoms: AtomPlan[]; bondsA: [number, number][]; bondsB: [number, number][]; labels: Label[]; w: number; h: number; moves: boolean }

/** Where every molecule sits and where every atom goes. Null when a species has no shape yet. */
function planOf(p: ReactionParams, conceal: boolean): Plan | null {
  const r = solveReaction(p);
  const mols: Mol[] = [], atoms: AtomPlan[] = [], bondsA: [number, number][] = [], bondsB: [number, number][] = [], labels: Label[] = [];
  let tall = 0;
  const wide = { reactant: GAP, product: GAP };
  // Product places waiting for an atom, and the reactant atoms of each element not yet given one.
  const free: Record<string, number[]> = {};

  // Reactants are placed from the middle outwards, so they go in last-first to read left to right like the equation.
  for (const s of [...r.reactants].reverse().concat(r.products)) {
    const model = modelOf(s.formula);
    if (!model) return null;
    const count = conceal ? 1 : s.coef, dir = s.side === 'reactant' ? -1 : 1;
    const cols = count > 3 ? 2 : 1, rows = Math.ceil(count / cols), [hx, hy] = halfSizeOf(model);
    // Molecules rock gently instead of tumbling, so each keeps its shape on screen and needs only its own width and height.
    const cellW = 2 * hx + 0.8, cell = 2 * hy + 1;
    const mid = dir * (wide[s.side] + (cols * cellW) / 2);
    wide[s.side] += cols * cellW + 0.5;
    tall = Math.max(tall, rows * cell);
    labels.push({ text: `${!conceal && s.coef > 1 ? s.coef : ''}${pretty(s.formula)}`, side: s.side, at: new THREE.Vector3(mid, -(rows * cell) / 2 - 0.55, 0) });
    for (let k = 0; k < count; k++) {
      const m = mols.length;
      mols.push({
        centre: new THREE.Vector3(mid + ((k % cols) - (cols - 1) / 2) * cellW, ((rows - 1) / 2 - Math.floor(k / cols)) * cell, 0),
        axis: new THREE.Vector3((rnd(m * 3 + 1) - 0.5) * 0.6, 1, (rnd(m * 3 + 2) - 0.5) * 0.6).normalize(),
        speed: 0.5 + rnd(m * 3 + 3) * 0.5,
      });
      const ids = placeAtoms(model, m, s.side === 'product' && !conceal);
      for (const [a, b] of model.bonds) (s.side === 'product' && !conceal ? bondsB : bondsA).push([ids[a], ids[b]]);
    }
  }

  /** Reactant atoms (and, while concealed, product atoms too) are new balls; a product's atoms are reactant balls given a second place. */
  function placeAtoms(model: Model, mol: number, arriving: boolean): number[] {
    return model.atoms.map(a => {
      const place: Place = { mol, local: new THREE.Vector3(...a.at) };
      if (arriving) {
        const id = free[a.el]?.shift();
        if (id === undefined) throw new Error(`No ${a.el} atom left for the products`);
        atoms[id].b = place;
        return id;
      }
      const id = atoms.length;
      // Each atom swings out a little on its way, so paths don't pass through each other.
      atoms.push({ el: a.el, a: place, b: null, bulge: new THREE.Vector3(rnd(id * 5 + 1) - 0.5, rnd(id * 5 + 2) - 0.5, (rnd(id * 5 + 3) - 0.5) * 3).multiplyScalar(1.6) });
      if (!conceal) (free[a.el] ??= []).push(id);
      return id;
    });
  }

  // The equation sits over the top of the stage and the key and slider over the bottom: the molecules and
  // their labels get the middle 60%, a little above centre.
  const h = Math.max((tall + 1.3) / 0.6, 8), lift = 0.06 * h + 0.65;
  for (const m of mols) m.centre.y += lift;
  for (const lb of labels) lb.at.y += lift;
  return { mols, atoms, bondsA, bondsB, labels, w: 2 * Math.max(wide.reactant, wide.product), h, moves: !conceal };
}

export default function Reactions3D({ params: p, conceal, runKey, onFail }: ViewProps<ReactionParams> & { onFail: () => void }) {
  const plan = useMemo(() => { try { return planOf(p, conceal); } catch { return null; } }, [p.reaction, conceal]); // eslint-disable-line react-hooks/exhaustive-deps -- the mass doesn't change the picture
  const r = solveReaction(p);
  const els = Object.keys(parseFormula(r.rx.reactants.join('')));
  const tally = (list: typeof r.all) => list.reduce((s, x) => { for (const [el, n] of Object.entries(parseFormula(x.formula))) s[el] = (s[el] ?? 0) + x.coef * n; return s; }, {} as Record<string, number>);
  const left = tally(r.reactants), right = tally(r.products);

  const host = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const done = useRef<HTMLParagraphElement>(null);
  const labelEls = useRef<(HTMLSpanElement | null)[]>([]);
  // What the drawing loop reads: how far the reaction has got (0 reactants → 1 products) and whether it is playing.
  const live = useRef({ k: 0, playing: false, from: 0, plan: null as Plan | null, rebuild: 0 });

  useEffect(() => { if (!plan) onFail(); }, [plan, onFail]);

  // A new reaction (or the reveal) starts from the reactants.
  useEffect(() => {
    live.current.plan = plan;
    live.current.k = 0;
    live.current.playing = false;
    live.current.rebuild++;
  }, [plan]);

  // Run: play the reaction from the start.
  useEffect(() => {
    if (!runKey || conceal) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    live.current.k = still ? 1 : 0;
    live.current.playing = !still;
    live.current.from = performance.now();
  }, [runKey, conceal]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { onFail(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xaab6c8, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(5, 9, 12); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdbe7ff, 0.5); fill.position.set(-8, -3, 6); scene.add(fill);
    const camera = new THREE.PerspectiveCamera(32, 2, 0.1, 500);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.enableZoom = false; controls.enableDamping = true; controls.rotateSpeed = 0.6;
    controls.minPolarAngle = Math.PI * 0.2; controls.maxPolarAngle = Math.PI * 0.8;

    const ball = new THREE.SphereGeometry(1, 40, 28), stick = new THREE.CylinderGeometry(0.11, 0.11, 1, 14);
    const paint = new Map<string, THREE.MeshStandardMaterial>();
    const paintOf = (e: string) => paint.get(e) ?? paint.set(e, new THREE.MeshStandardMaterial({ color: ATOM_COLOUR[e] ?? '#9AA6B8', roughness: 0.32, metalness: 0.08 })).get(e)!;
    const stickA = new THREE.MeshStandardMaterial({ color: '#8794A8', roughness: 0.5, transparent: true });
    const stickB = stickA.clone();

    let group = new THREE.Group(), balls: THREE.Mesh[] = [], sticksA: THREE.Mesh[] = [], sticksB: THREE.Mesh[] = [], built = -1, plan: Plan | null = null;
    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      if (plan) {
        const t = Math.tan((camera.fov * Math.PI) / 360);
        const d = Math.max(plan.h / 2 / t, plan.w / 2 / (t * camera.aspect)) * 1.02;
        camera.position.setLength(d);
      }
      camera.updateProjectionMatrix();
    };
    const build = () => {
      scene.remove(group);
      group = new THREE.Group(); balls = []; sticksA = []; sticksB = [];
      plan = live.current.plan; built = live.current.rebuild;
      if (!plan) return;
      for (const a of plan.atoms) { const m = new THREE.Mesh(ball, paintOf(a.el)); m.scale.setScalar(radiusOf(a.el)); balls.push(m); group.add(m); }
      plan.bondsA.forEach(() => { const m = new THREE.Mesh(stick, stickA); sticksA.push(m); group.add(m); });
      plan.bondsB.forEach(() => { const m = new THREE.Mesh(stick, stickB); sticksB.push(m); group.add(m); });
      scene.add(group);
      camera.position.set(0, 0, 10); controls.target.set(0, 0, 0);
      fit();
    };

    const UP = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), va = new THREE.Vector3(), vb = new THREE.Vector3(), dir = new THREE.Vector3(), scr = new THREE.Vector3();
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const at = (pl: Place, time: number, out: THREE.Vector3) => {
      const m = plan!.mols[pl.mol];
      q.setFromAxisAngle(m.axis, still ? 0.3 : 0.5 * Math.sin(time * m.speed + pl.mol * 1.7));
      return out.copy(pl.local).applyQuaternion(q).add(m.centre);
    };
    const link = (mesh: THREE.Mesh, [i, j]: [number, number]) => {
      const a = balls[i].position, b = balls[j].position;
      dir.subVectors(b, a);
      const len = dir.length();
      mesh.position.addVectors(a, b).multiplyScalar(0.5);
      mesh.scale.set(1, len, 1);
      mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(len || 1));
    };

    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const L = live.current;
      if (built !== L.rebuild) build();
      if (!plan) return;
      if (L.playing) { L.k = Math.min(1, (now - L.from) / DURATION); if (L.k >= 1) L.playing = false; }
      const k = plan.moves ? L.k : 0, e = smooth((k - 0.18) / 0.64), time = now / 1000;
      plan.atoms.forEach((a, i) => {
        at(a.a, time, va);
        if (a.b) { at(a.b, time, vb); va.lerp(vb, e).addScaledVector(a.bulge, Math.sin(Math.PI * e)); }
        balls[i].position.copy(va);
      });
      stickA.opacity = plan.moves ? 1 - smooth(k / 0.2) : 1;
      stickB.opacity = smooth((k - 0.8) / 0.2);
      sticksA.forEach((m, i) => { m.visible = stickA.opacity > 0.02; if (m.visible) link(m, plan!.bondsA[i]); });
      sticksB.forEach((m, i) => { m.visible = stickB.opacity > 0.02; if (m.visible) link(m, plan!.bondsB[i]); });
      controls.update();
      renderer.render(scene, camera);

      // The labels, slider and closing line follow the picture without re-rendering React every frame.
      const w = el.clientWidth, h = el.clientHeight;
      plan.labels.forEach((lb, i) => {
        const node = labelEls.current[i];
        if (!node) return;
        scr.copy(lb.at).project(camera);
        node.style.transform = `translate(-50%, 0) translate(${((scr.x + 1) / 2) * w}px, ${((1 - scr.y) / 2) * h}px)`;
        node.style.opacity = String(!plan!.moves ? 1 : lb.side === 'reactant' ? 1 - 0.65 * e : 0.35 + 0.65 * e);
      });
      if (slider.current && document.activeElement !== slider.current) slider.current.value = String(Math.round(k * 1000));
      if (done.current) done.current.style.opacity = String(smooth((k - 0.9) / 0.1));
    };
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      ball.dispose(); stick.dispose(); stickA.dispose(); stickB.dispose(); paint.forEach(m => m.dispose());
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [onFail]);

  if (!plan) return null;
  const scrub = (v: string) => { live.current.playing = false; live.current.k = Number(v) / 1000; };

  return (
    <div className="lab-3d" role="img" aria-label={`${r.rx.label}: ${equationText(p)}`}>
      <div className="lab-3d-stage" ref={host} />
      <div className="lab-3d-top">
        <b>{equationText(p, conceal)}</b>
        {r.rx.condition && <span>({r.rx.condition})</span>}
      </div>
      {plan.labels.map((lb, i) => <span key={`${p.reaction}:${i}:${lb.text}`} className="lab-3d-label" ref={n => { labelEls.current[i] = n; }}>{lb.text}</span>)}
      <div className="lab-3d-foot">
        <div className="lab-3d-key">
          {els.map(el => <span key={el}><i style={{ background: ATOM_COLOUR[el] ?? '#9AA6B8' }} />{el}{!conceal && <>: {left[el]} → {right[el]}</>}</span>)}
        </div>
        {conceal
          ? <p className="lab-3d-note">{r.rx.label}: one of each shown, before balancing. Drag to turn.</p>
          : (
            <>
              <label className="lab-3d-scrub">
                <span>Reactants</span>
                <input ref={slider} type="range" min={0} max={1000} defaultValue={0} aria-label="How far the reaction has gone" onInput={e => scrub((e.target as HTMLInputElement).value)} />
                <span>Products</span>
              </label>
              <p className="lab-3d-note" ref={done} style={{ opacity: 0 }}>{r.rx.type}. {r.rx.observe}</p>
            </>
          )}
      </div>
    </div>
  );
}
