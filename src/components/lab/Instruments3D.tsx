'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { solveInstrument, type InstrumentParams } from '@/lib/lab/engines/instruments';
import { COLOUR, createStage, makeText, progress, smooth, usePlay, type Stage, type StageOptions, type Vec3 } from './lab3d';
import type { ViewProps } from './types';

/**
 * Vernier callipers and the screw gauge in 3D (prototype), drawn to scale with
 * every division engraved: the main scale in millimetres with ten vernier
 * divisions in nine of them, and a 1 mm pitch screw with a hundred divisions
 * round the thimble. The instrument closes on the object and the class moves
 * in to read it, as they would at the bench. Where the scales stand is the
 * engine's reading (solveInstrument), zero error included: the moving scale is
 * shifted on its jaw by exactly that much.
 */

type Tool = 'vernier' | 'screw';
const TAGS = 4;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const STEEL = '#C9D2DD', INK = '#0F172A';
const VIEWS: Record<Tool, StageOptions> = {
  vernier: { target: [6.6, -1.9, 0], span: 4.6, wide: 2.25, from: [0.22, 0.2, 1], shadows: true, shine: true },
  screw: { target: [7.3, -2.7, 0], span: 5.4, wide: 1.75, from: [0.3, 0.22, 1], shadows: true, shine: true },
};
const WHOLE: Vec3 = [0.22, 0.2, 1], CLOSE: Vec3 = [0, 0.04, 1];

interface Built { tags: { at: THREE.Vector3; text: string | null }[]; update: () => void; scaleAt: () => { target: Vec3; span: number } }
type Live = () => { p: InstrumentParams; conceal: boolean; k: number };

/** Vernier callipers, 1 unit = 1 cm. */
function vernier(stage: Stage, live: Live): Built {
  const { root, mesh, solid, G, M } = stage, FACE = 0.152, EDGE = -0.8; // front of the beam, and its lower edge where the scales meet
  const steel = solid(STEEL, 0.28, 0.85), ink = M(new THREE.MeshBasicMaterial({ color: INK })), red = M(new THREE.MeshBasicMaterial({ color: COLOUR.north }));
  mesh(root, G(new THREE.BoxGeometry(15.8, 1.6, 0.3)), steel, [6.7, 0, 0]);
  mesh(root, G(new THREE.BoxGeometry(0.8, 3.6, 0.3)), steel, [-0.4, -2.6, 0]);
  mesh(root, G(new THREE.BoxGeometry(22, 0.2, 9)), solid('#EDF1F7', 0.95), [6.5, -4.9, 0], false);
  const m4 = new THREE.Matrix4();
  // Main scale: a mark every millimetre, longer at every fifth and tenth, numbered in centimetres.
  const marks = new THREE.InstancedMesh(G(new THREE.BoxGeometry(0.013, 1, 0.004)), ink, 141);
  for (let i = 0; i <= 140; i++) { const h = i % 10 === 0 ? 0.5 : i % 5 === 0 ? 0.36 : 0.25; marks.setMatrixAt(i, m4.makeScale(1, h, 1).setPosition(i / 10, EDGE + h / 2, FACE)); }
  root.add(marks);
  for (let c = 0; c <= 14; c++) { const t = makeText(stage, String(c), 0.26, INK); t.position.set(c, EDGE + 0.66, FACE + 0.002); root.add(t); }
  const cm = makeText(stage, 'cm', 0.2, INK); cm.position.set(14.45, EDGE + 0.3, FACE + 0.002); root.add(cm);

  // The sliding jaw: its vernier plate lies under the main scale, ten divisions in nine millimetres.
  const slide = new THREE.Group(); root.add(slide);
  mesh(slide, G(new THREE.BoxGeometry(2.7, 0.36, 0.5)), steel, [0.85, 0.98, 0]);
  mesh(slide, G(new THREE.BoxGeometry(2.7, 2.6, 0.06)), steel, [0.85, -0.2, -0.19]);
  mesh(slide, G(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 20)), solid('#5B6676', 0.4, 0.7), [1.5, 1.28, 0]);
  mesh(slide, G(new THREE.BoxGeometry(1.6, 0.8, 0.34)), solid('#E4EAF2', 0.3, 0.6), [0.45, EDGE - 0.4, 0.01]);
  const fine = new THREE.InstancedMesh(G(new THREE.BoxGeometry(0.013, 1, 0.004)), ink, 11);
  for (let i = 0; i <= 10; i++) { const h = i % 5 === 0 ? 0.36 : 0.22; fine.setMatrixAt(i, m4.makeScale(1, h, 1).setPosition(i * 0.09, EDGE - h / 2, 0.185)); }
  slide.add(fine);
  for (const n of [0, 5, 10]) { const t = makeText(stage, String(n), 0.2, INK); t.position.set(n * 0.09, EDGE - 0.56, 0.187); slide.add(t); }
  const hit = mesh(slide, G(new THREE.BoxGeometry(0.022, 0.4, 0.004)), red, [0, EDGE - 0.2, 0.188], false);
  const hitMain = mesh(root, G(new THREE.BoxGeometry(0.022, 0.5, 0.004)), red, [0, EDGE + 0.25, FACE + 0.003], false);
  const jaw = mesh(slide, G(new THREE.BoxGeometry(0.8, 2.75, 0.3)), steel, [0.4, -3.02, 0]);
  const thing = mesh(root, G(new THREE.CylinderGeometry(0.55, 0.55, 1, 28)), solid(COLOUR.current, 0.5), [0, -3.3, 0]);
  thing.rotation.z = Math.PI / 2;
  const tags = Array.from({ length: TAGS }, () => ({ at: v3(), text: null as string | null }));
  let at = 0;

  return {
    tags,
    update: () => {
      const { p, conceal, k } = live(), r = solveInstrument(p), open = 1.6 * (1 - smooth(k));
      // Opened for the object, then closed on it. The jaw face is where the object ends; the vernier zero is past it by the zero error.
      at = r.observed + open;
      slide.position.x = at; jaw.position.x = 0.4 - r.zeroError;
      thing.scale.y = p.len; thing.position.x = p.len / 2;
      const closed = open < 0.001, show = !conceal && closed, div = r.div;
      hit.visible = hitMain.visible = show;
      hit.position.x = div * 0.09; hitMain.position.x = r.observed + div * 0.09;
      tags[0].at.set(r.main, EDGE + 1.25, FACE); tags[0].text = show ? `Main scale: ${r.main.toFixed(1)} cm` : null;
      tags[1].at.set(r.observed + div * 0.09, EDGE - 1.15, 0.2); tags[1].text = show ? `Vernier division ${div} lines up` : null;
      tags[2].at.set(p.len / 2, -4.3, 0.6); tags[2].text = show ? `${r.label} = ${r.main.toFixed(1)} + ${div} × ${r.lc} ${p.zero ? `− (${r.zeroError.toFixed(2)}) ` : ''}= ${r.corrected.toFixed(2)} cm` : conceal ? 'Read the two scales' : null;
      tags[3].at.set(at + 2.6, 1.5, 0); tags[3].text = p.zero ? `Zero error ${p.zero > 0 ? '+' : ''}${p.zero} divisions` : null;
    },
    scaleAt: () => ({ target: [at + 0.45, EDGE - 0.25, 0], span: 0.95 }),
  };
}

/** Screw gauge, drawn in millimetres and scaled down. */
function screw(stage: Stage, live: Live): Built {
  const { root, mesh, solid, G, M } = stage, S = 0.24, ZERO = 34, SLEEVE = 4.2, RIM = 4.7, BODY = 6.8, SLOPE = Math.atan((BODY - RIM) / 3);
  const g = new THREE.Group(); g.scale.setScalar(S); root.add(g);
  mesh(root, G(new THREE.BoxGeometry(22, 0.2, 9)), solid('#EDF1F7', 0.95), [7.3, -6.6, 0], false);
  const frame = solid('#3F6A8F', 0.45, 0.25), steel = solid(STEEL, 0.25, 0.9), ink = M(new THREE.MeshBasicMaterial({ color: INK })), red = M(new THREE.MeshBasicMaterial({ color: COLOUR.north }));
  mesh(g, G(new THREE.BoxGeometry(34, 6, 5)), frame, [15, -24, 0]);
  mesh(g, G(new THREE.BoxGeometry(6, 28, 5)), frame, [1, -10, 0]);
  mesh(g, G(new THREE.BoxGeometry(6, 28, 5)), frame, [29, -10, 0]);
  const along = (m: THREE.Mesh) => { m.rotation.z = -Math.PI / 2; return m; };
  along(mesh(g, G(new THREE.CylinderGeometry(3, 3, 6, 28)), steel, [7, 0, 0]));
  const rodShape = G(new THREE.CylinderGeometry(3, 3, 1, 28)); rodShape.translate(0, 0.5, 0);
  const spindle = along(mesh(g, rodShape, steel));
  along(mesh(g, G(new THREE.CylinderGeometry(SLEEVE, SLEEVE, 22, 40)), solid('#E4EAF2', 0.3, 0.7), [43, 0, 0]));
  // Pitch scale along the sleeve: a mark every millimetre above the reference line, on the side facing the class.
  mesh(g, G(new THREE.BoxGeometry(18, 0.14, 0.04)), ink, [ZERO + 8, 0, SLEEVE + 0.02], false);
  // Each mark is a strip of the sleeve's own curve, rising from the reference line.
  const strip = (h: number) => { const s = G(new THREE.CylinderGeometry(SLEEVE + 0.02, SLEEVE + 0.02, 0.14, 6, 1, true, -h / SLEEVE, h / SLEEVE)); s.rotateZ(-Math.PI / 2); return s; };
  const short = strip(1.3), long = strip(2.2), m4 = new THREE.Matrix4();
  const shorts = new THREE.InstancedMesh(short, ink, 17), longs = new THREE.InstancedMesh(long, ink, 17);
  for (let i = 0; i <= 16; i++) { m4.makeScale(i % 5 ? 1 : 0, i % 5 ? 1 : 0, i % 5 ? 1 : 0).setPosition(ZERO + i, 0, 0); shorts.setMatrixAt(i, m4); m4.makeScale(i % 5 ? 0 : 1, i % 5 ? 0 : 1, i % 5 ? 0 : 1).setPosition(ZERO + i, 0, 0); longs.setMatrixAt(i, m4); }
  g.add(shorts, longs);
  for (const n of [0, 5, 10, 15]) { const t = makeText(stage, String(n), 1.5, INK), a = 3.3 / SLEEVE; t.position.set(ZERO + n, (SLEEVE + 0.05) * Math.sin(a), (SLEEVE + 0.05) * Math.cos(a)); t.rotation.x = -a; g.add(t); }

  // The thimble: it turns once for every millimetre it travels; its bevelled rim carries a hundred divisions.
  const thimble = new THREE.Group(), turn = new THREE.Group(); g.add(thimble); thimble.add(turn);
  along(mesh(turn, G(new THREE.CylinderGeometry(BODY, RIM, 3, 72, 1, true)), solid('#E4EAF2', 0.3, 0.7), [1.5, 0, 0]));
  along(mesh(turn, G(new THREE.CylinderGeometry(BODY, BODY, 20, 72)), solid('#B8C2CF', 0.5, 0.8), [13, 0, 0]));
  along(mesh(turn, G(new THREE.CylinderGeometry(3.4, 3.4, 5, 24)), solid('#5B6676', 0.5, 0.7), [25.5, 0, 0]));
  const tick = G(new THREE.BoxGeometry(1, 0.09, 0.04)), rim = new THREE.InstancedMesh(tick, ink, 100);
  const spin = new THREE.Matrix4(), lean = new THREE.Matrix4().makeRotationY(-SLOPE), put = new THREE.Matrix4();
  /** Places something on the bevel `d` mm up the slope from the rim, at division `j`. */
  const onRim = (j: number, d: number, out: THREE.Matrix4) => {
    spin.makeRotationX((j / 100) * Math.PI * 2);
    put.makeTranslation(d * Math.cos(SLOPE), 0, RIM + d * Math.sin(SLOPE) + 0.03);
    return out.copy(spin).multiply(put).multiply(lean);
  };
  for (let j = 0; j < 100; j++) { const len = j % 10 === 0 ? 2.1 : j % 5 === 0 ? 1.5 : 1; rim.setMatrixAt(j, onRim(j, len / 2, m4).multiply(put.makeScale(len, 1, 1))); }
  turn.add(rim);
  for (let j = 0; j < 100; j += 10) { const t = makeText(stage, String(j), 1.05, INK); t.matrixAutoUpdate = false; t.matrix.copy(onRim(j, 2.85, m4)); turn.add(t); }
  const hit = mesh(g, G(new THREE.BoxGeometry(2.6, 0.2, 0.04)), red, [0, 0, 0], false);
  const wire = mesh(g, G(new THREE.CylinderGeometry(0.5, 0.5, 15, 24)), solid(COLOUR.current, 0.45, 0.3), [0, 0, 0]);
  wire.rotation.x = Math.PI / 2;
  const tags = Array.from({ length: TAGS }, () => ({ at: v3(), text: null as string | null }));
  let edge = ZERO;

  return {
    tags,
    update: () => {
      const { p, conceal, k } = live(), r = solveInstrument(p), open = 4 * (1 - smooth(k)), now = r.observed + open;
      // The spindle's face is the object's width from the anvil; the thimble's edge reads that plus the zero error.
      edge = ZERO + now;
      thimble.position.x = edge;
      // Division `div` meets the reference line when the screw is home; before that it is still turning in.
      turn.rotation.x = -(now % 1) * Math.PI * 2;
      const face = 10 + p.dia + open;
      spindle.position.set(face, 0, 0); spindle.scale.y = Math.max(0.1, edge + 3 - face);
      wire.scale.set(p.dia, 1, p.dia); wire.position.x = 10 + p.dia / 2;
      const closed = open < 0.001, show = !conceal && closed;
      hit.visible = show; hit.position.set(edge + 1.1 * Math.cos(SLOPE), 0, RIM + 1.1 * Math.sin(SLOPE) + 0.06); hit.rotation.y = -SLOPE;
      const W = (x: number, y: number, z: number, out: THREE.Vector3) => out.set(x * S, y * S, z * S);
      W(ZERO + r.main / 2, 9.5, 0, tags[0].at); tags[0].text = show ? `Pitch scale: ${r.main.toFixed(0)} mm showing` : null;
      W(edge + 9, -9.5, 4, tags[1].at); tags[1].text = show ? `Thimble division ${r.div} on the line` : null;
      W(14, -31.5, 4, tags[2].at); tags[2].text = show ? `${r.label} = ${r.main.toFixed(0)} + ${r.div} × ${r.lc} ${p.zero ? `− (${r.zeroError.toFixed(2)}) ` : ''}= ${r.corrected.toFixed(2)} mm` : conceal ? 'Read the two scales' : null;
      W(edge + 14, 11, 0, tags[3].at); tags[3].text = p.zero ? `Zero error ${p.zero > 0 ? '+' : ''}${p.zero} divisions` : null;
    },
    scaleAt: () => ({ target: [(edge - 2) * S, -0.35, 0], span: 2 }),
  };
}

export default function Instruments3D({ params: p, conceal, runKey, onFail }: ViewProps<InstrumentParams> & { onFail: () => void }) {
  const tool: Tool = p.tool === 'screw' ? 'screw' : 'vernier';
  const host = useRef<HTMLDivElement>(null);
  const tags = useRef<(HTMLSpanElement | null)[]>([]);
  const stage = useRef<Stage | null>(null);
  const built = useRef<Built | null>(null);
  const live = useRef({ p, conceal });
  useEffect(() => { live.current = { p, conceal }; });
  const play = usePlay(runKey, conceal, 2600);
  const [close, setClose] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const s = createStage(el, VIEWS[tool]);
    if (!s) { onFail(); return; }
    stage.current = s;
    // Before the first Run, and while the class predicts, the instrument is shown closed on the object.
    const scene = (tool === 'screw' ? screw : vernier)(s, () => ({ ...live.current, k: play.current.playing ? progress(play) : 1 }));
    built.current = scene;
    s.onFrame(() => {
      scene.update();
      for (let i = 0; i < TAGS; i++) s.tag(tags.current[i], scene.tags[i].at, scene.tags[i].text);
    });
    return () => { stage.current = null; built.current = null; s.dispose(); };
  }, [tool, onFail, play]);

  // Moving in on the scale follows it when the reading changes.
  useEffect(() => {
    const s = stage.current, b = built.current;
    if (!s || !b) return;
    const t = setTimeout(() => { if (close) s.view(CLOSE, b.scaleAt()); else s.view(WHOLE, { target: VIEWS[tool].target, span: VIEWS[tool].span }); }, 60);
    return () => clearTimeout(t);
  }, [close, tool, p.len, p.dia, p.zero]);

  return (
    <div className="lab-3d" role="img" aria-label={tool === 'screw' ? 'A screw gauge in 3D' : 'Vernier callipers in 3D'}>
      <div className="lab-3d-stage" ref={host} />
      {Array.from({ length: TAGS }, (_, i) => <span key={i} className="lab-3d-label lab-3d-tag" ref={n => { tags.current[i] = n; }} style={{ opacity: 0 }} />)}
      <div className="lab-3d-looks">
        <button type="button" aria-pressed={!close} onClick={() => setClose(false)}>Whole instrument</button>
        <button type="button" aria-pressed={close} onClick={() => setClose(true)}>Read the scale</button>
      </div>
      <div className="lab-3d-foot">
        <p className="lab-3d-note">{conceal ? 'Move in to read the scales. The answer is left off until you reveal.' : 'Drag to turn it. Press Run to close it on the object; move in to read the scale.'}</p>
      </div>
    </div>
  );
}
