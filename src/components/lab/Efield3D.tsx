'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { efield, neutralPoint, SEP, type EfieldParams } from '@/lib/lab/engines/efield';
import { fmt } from '@/lib/lab/types';
import { COLOUR, createStage, makeArrow, type Stage, type StageOptions, type Vec3 } from './lab3d';
import type { ViewProps } from './types';

/**
 * Electric field lines and equipotentials in 3D (prototype). A page can only
 * show the lines in one plane; here they leave the charge in every direction,
 * which is what "the field falls as 1/r²" is about: the same lines spread over
 * a bigger sphere. Lines are traced by stepping along the field of the charges
 * (Coulomb's law, superposed), as the flat view does. The charges, where the
 * point P and the neutral point are, and every number shown are the engine's.
 */

const VIEW: StageOptions = { target: [0, -0.9, 0], span: 9.5, wide: 1.5, from: [0.45, 0.35, 1] };
const LOOKS: { label: string; from: Vec3 }[] = [{ label: 'Face on', from: [0, 0.02, 1] }, { label: 'End on', from: [1, 0.12, 0.12] }];
const TAGS = 6, REACH = 8.2, WIDE = 13.5; // how far out (in scene units) the lines are followed
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

interface Charge { x: number; q: number } // cm along the axis, μC

/** The charges of each set-up, as the engine places them (cm). */
function chargesOf(p: EfieldParams): Charge[] {
  if (p.setup === 'single') return [{ x: 0, q: p.q }];
  if (p.setup === 'dipole') return [{ x: -SEP / 2, q: p.q }, { x: SEP / 2, q: -p.q }];
  return [{ x: -1.5 * SEP, q: p.q }, { x: 1.5 * SEP, q: p.q2 }];
}

function build(stage: Stage, live: () => { p: EfieldParams; conceal: boolean }) {
  const { root, mesh, solid, M } = stage;
  const lineStuff = M(new THREE.MeshBasicMaterial({ color: COLOUR.field, transparent: true, opacity: 0.8 }));
  const headStuff = M(new THREE.MeshBasicMaterial({ color: COLOUR.field }));
  const shell = M(new THREE.MeshStandardMaterial({ color: '#10B981', transparent: true, opacity: 0.13, roughness: 0.4, side: THREE.DoubleSide, depthWrite: false }));
  const plus = solid(COLOUR.north, 0.35), minus = solid(COLOUR.south, 0.35), amber = solid(COLOUR.current, 0.4);
  const probe = makeArrow(stage, root, COLOUR.current, 0.07);
  let made = new THREE.Group(), sig = '', sc = 0.5, charges: Charge[] = [];
  root.add(made);
  const tags = Array.from({ length: TAGS }, () => ({ at: v3(), text: null as string | null }));
  const e = v3(), at = v3(), to = v3();

  /** The field at a point (cm), up to a constant: only its direction is used. */
  const field = (pt: THREE.Vector3, out: THREE.Vector3) => {
    out.set(0, 0, 0);
    for (const c of charges) { const dx = pt.x - c.x, r2 = dx * dx + pt.y * pt.y + pt.z * pt.z, r = Math.sqrt(r2) || 1e-6, k = c.q / (r2 * r); out.x += k * dx; out.y += k * pt.y; out.z += k * pt.z; }
    return out;
  };

  const lay = (p: EfieldParams) => {
    root.remove(made);
    made.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    made = new THREE.Group(); root.add(made);
    charges = chargesOf(p);
    // Scale so the point P (or both charges) sits comfortably inside the stage.
    // One charge: P is always drawn the same distance out, so its sphere and the one at twice the distance both fit.
    // A dipole is drawn as large as keeps P on the stage, but never so small that its charges merge; a very far point runs off, as in the flat view.
    sc = p.setup === 'like' ? 0.62 : p.setup === 'dipole' ? Math.max(0.36, Math.min(0.9, 11 / (p.r + 2))) : 6.4 / Math.max(2 * p.r, 20);
    const far = REACH / sc;
    for (const c of charges) mesh(made, new THREE.SphereGeometry(Math.min(0.34 + 0.05 * Math.abs(c.q), p.setup === 'dipole' ? sc * SEP * 0.36 : 1), 28, 20), c.q > 0 ? plus : minus, [c.x * sc, 0, 0]);

    // Lines start evenly round each positive charge (more for a bigger charge) and follow the field.
    const head = new THREE.ConeGeometry(0.11, 0.36, 10), Y = v3(0, 1, 0);
    for (const c of charges.filter(x => x.q > 0)) {
      const n = Math.max(10, Math.min(34, Math.round(9 * c.q)));
      for (let i = 0; i < n; i++) {
        const yy = 1 - (2 * (i + 0.5)) / n, rr = Math.sqrt(1 - yy * yy), a = i * 2.39996;
        const pt = v3(c.x + 0.6 * rr * Math.cos(a), 0.6 * yy, 0.6 * rr * Math.sin(a)), pts = [pt.clone().multiplyScalar(sc)];
        for (let s = 0; s < 900; s++) {
          field(pt, e);
          if (!e.lengthSq()) break;
          pt.addScaledVector(e.normalize(), 0.25);
          if (pt.length() > far) break;
          if (s % 4 === 3) pts.push(pt.clone().multiplyScalar(sc));
          if (charges.some(o => o.q < 0 && Math.hypot(pt.x - o.x, pt.y, pt.z) < 0.6)) break;
        }
        if (pts.length < 3) continue;
        const curve = new THREE.CatmullRomCurve3(pts);
        made.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(140, pts.length * 2), 0.028, 5), lineStuff));
        const m = new THREE.Mesh(head, headStuff), u = Math.min(0.5, 2.2 / curve.getLength());
        m.position.copy(curve.getPointAt(u)); m.quaternion.setFromUnitVectors(Y, curve.getTangentAt(u)); made.add(m);
      }
    }
    // Equipotentials: spheres round one charge (the one through P is the stronger); the plane V = 0 midway between a dipole's charges.
    if (p.setup === 'single') for (const [r, o] of [[p.r, 2], [p.r * 2, 1]] as const) { if (r * sc < REACH) { const s = new THREE.Mesh(new THREE.SphereGeometry(r * sc, 48, 32), shell); s.renderOrder = o; made.add(s); } }
    if (p.setup === 'dipole') { const d = new THREE.Mesh(new THREE.CircleGeometry(REACH * 0.62, 64), shell); d.rotation.y = Math.PI / 2; made.add(d); }
    if (p.setup !== 'like' && p.r * sc < WIDE) mesh(made, new THREE.SphereGeometry(0.2, 20, 14), amber, [p.r * sc, 0, 0]);
    if (p.setup === 'like') mesh(made, new THREE.SphereGeometry(0.2, 20, 14), amber, [(charges[0].x + neutralPoint(p.q, p.q2)) * sc, 0, 0]).name = 'neutral';
  };

  return {
    tags,
    update: () => {
      const { p, conceal } = live(), now = `${p.setup}|${p.q}|${p.q2}|${p.r}`;
      if (now !== sig) { sig = now; lay(p); }
      const reads = efield.readouts(p);
      charges.forEach((c, i) => { tags[i].at.set(c.x * sc, -0.95, 0); tags[i].text = `${c.q > 0 ? '+' : '−'}${fmt(Math.abs(c.q), 1)} μC`; });
      if (charges.length === 1) tags[1].text = null;
      const hasPoint = p.setup !== 'like', inView = p.r * sc < WIDE;
      probe.group.visible = hasPoint && inView;
      if (hasPoint) {
        // The arrow at P shows which way the field points there.
        field(at.set(p.r, 0, 0), e).normalize();
        probe.set(to.set(p.r * sc, 0, 0), at.set(p.r * sc, 0, 0).addScaledVector(e, 1.7));
        tags[2].at.set(Math.min(p.r * sc, WIDE - 2), 0.75, 0); tags[2].text = inView ? `P, ${fmt(p.r, 0)} cm` : `P is ${fmt(p.r, 0)} cm out, off to the right`;
        tags[3].at.set(Math.min(p.r * sc, WIDE - 2), -1.3, 0);
        tags[3].text = conceal ? null : p.setup === 'single' ? `E = ${reads[0].value} · V = ${reads[1].value}` : `E = ${reads[1].value}`;
        tags[4].at.set(p.setup === 'single' ? -p.r * sc * 0.71 : 0, p.setup === 'single' ? p.r * sc * 0.71 : REACH * 0.5, 0);
        tags[4].text = p.setup === 'single' ? 'Equipotential surface: a sphere' : 'Equipotential surface: V = 0';
      } else {
        const neutral = made.getObjectByName('neutral');
        if (neutral) neutral.visible = !conceal;
        tags[2].at.set((charges[0].x + neutralPoint(p.q, p.q2)) * sc, 0.8, 0); tags[2].text = conceal ? null : `E = 0, ${reads[0].value}`;
        tags[3].text = null; tags[4].text = null;
      }
      tags[5].at.set(0, -REACH * 0.62, 0);
      tags[5].text = p.setup === 'single' ? null : p.setup === 'dipole' ? `Dipole, ${SEP} cm apart` : `Like charges, ${SEP * 3} cm apart`;
    },
    dispose: () => { made.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); },
  };
}

export default function Efield3D({ params: p, conceal, onFail }: ViewProps<EfieldParams> & { onFail: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const tags = useRef<(HTMLSpanElement | null)[]>([]);
  const stage = useRef<Stage | null>(null);
  const live = useRef({ p, conceal });
  useEffect(() => { live.current = { p, conceal }; });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const s = createStage(el, VIEW);
    if (!s) { onFail(); return; }
    stage.current = s;
    const scene = build(s, () => live.current);
    s.onFrame(() => {
      scene.update();
      for (let i = 0; i < TAGS; i++) s.tag(tags.current[i], scene.tags[i].at, scene.tags[i].text);
    });
    return () => { stage.current = null; scene.dispose(); s.dispose(); };
  }, [onFail]);

  return (
    <div className="lab-3d" role="img" aria-label="Electric field lines around the charges, in 3D">
      <div className="lab-3d-stage" ref={host} />
      {Array.from({ length: TAGS }, (_, i) => <span key={i} className="lab-3d-label lab-3d-tag" ref={n => { tags.current[i] = n; }} style={{ opacity: 0 }} />)}
      <div className="lab-3d-looks">{LOOKS.map(l => <button key={l.label} type="button" onClick={() => stage.current?.view(l.from)}>{l.label}</button>)}</div>
      <div className="lab-3d-foot">
        <div className="lab-3d-key">
          <span><i style={{ background: COLOUR.field }} />Field lines</span>
          {p.setup !== 'like' && <span><i style={{ background: '#10B981' }} />Equipotential surface</span>}
          {p.setup !== 'like' && <span><i style={{ background: COLOUR.current }} />Field at P</span>}
        </div>
        <p className="lab-3d-note">{conceal ? 'Drag to turn it. The values are left off until you reveal.' : 'Drag to turn it: the lines leave the charge in every direction.'}</p>
      </div>
    </div>
  );
}
