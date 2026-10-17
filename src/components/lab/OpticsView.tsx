'use client';

import { useRef } from 'react';
import { solveOptics, isMirror, isConverging, type OpticsParams } from '@/lib/lab/engines/optics';
import type { ViewProps } from './types';

const W = 1000, H = 480, CX = 500, CY = 240;

/**
 * The bench, drawn from the engine's own numbers. Horizontal and vertical
 * scales differ (as in the textbook diagrams, where a 2 cm object 30 cm away
 * would otherwise be a speck); straight lines and where they meet survive that,
 * so every ray still passes exactly through the image the engine computed.
 */
export default function OpticsView({ params, setParam, conceal, runKey, locked }: ViewProps<OpticsParams>) {
  const p = params;
  const r = solveOptics(p);
  const svg = useRef<SVGSVGElement>(null);
  const mirror = isMirror(p.device);

  const sx = (CX - 40) / r.extent;
  const hiShown = r.atInfinity ? p.h : Math.min(Math.abs(r.hi), p.h * 6);
  const sy = (CY - 50) / (Math.max(p.h, hiShown) * 1.15);
  const X = (x: number) => CX + x * sx;
  const Y = (y: number) => CY - y * sy;

  const dragTo = (clientX: number) => {
    if (!svg.current || locked) return;
    const box = svg.current.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * W;
    const u = Math.round(-(x - CX) / sx);
    setParam('u', Math.min(100, Math.max(2, u)));
  };

  const fAbs = p.f;
  const marks: { x: number; label: string }[] = mirror
    ? [{ x: -fAbs, label: 'F' }, { x: -2 * fAbs, label: 'C' }].map(m => (p.device === 'convex_mirror' ? { x: -m.x, label: m.label } : m))
    : [{ x: -fAbs, label: 'F₁' }, { x: -2 * fAbs, label: '2F₁' }, { x: fAbs, label: 'F₂' }, { x: 2 * fAbs, label: '2F₂' }];
  const elemH = CY - 30;

  const element = () => {
    if (!mirror) {
      const w = 18;
      const d = isConverging(p.device)
        ? `M${CX} ${CY - elemH} Q${CX + w * 2} ${CY} ${CX} ${CY + elemH} Q${CX - w * 2} ${CY} ${CX} ${CY - elemH}Z`
        : `M${CX - w} ${CY - elemH} L${CX + w} ${CY - elemH} Q${CX + 2} ${CY} ${CX + w} ${CY + elemH} L${CX - w} ${CY + elemH} Q${CX - 2} ${CY} ${CX - w} ${CY - elemH}Z`;
      return <path className="lb-glass" d={d} />;
    }
    // Concave faces the object (bulges away, to the right); convex bulges towards it.
    const bulge = p.device === 'concave_mirror' ? 26 : -26;
    const d = `M${CX} ${CY - elemH} Q${CX + bulge * 2} ${CY} ${CX} ${CY + elemH}`;
    const back = `M${CX + 8} ${CY - elemH} Q${CX + 8 + bulge * 2} ${CY} ${CX + 8} ${CY + elemH}`;
    return <g><path className="lb-mirror-back" d={back} /><path className="lb-mirror" d={d} /></g>;
  };

  const arrow = (x: number, h: number, cls: string, key?: string) => {
    const y1 = Y(0), y2 = Y(h), dir = h >= 0 ? 1 : -1;
    return (
      <g className={cls} key={key}>
        <line x1={X(x)} y1={y1} x2={X(x)} y2={y2 + dir * 10} />
        <path d={`M${X(x)} ${y2} l-9 ${dir * 16} h18 Z`} strokeWidth={0} />
      </g>
    );
  };

  return (
    <svg ref={svg} className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${p.device.replace('_', ' ')}, focal length ${p.f} cm, object ${p.u} cm away`}
      onPointerMove={e => { if (e.buttons === 1 && (e.target as Element).closest?.('.lb-grab')) dragTo(e.clientX); }}>
      <defs><clipPath id="lab-optics-clip"><rect x={0} y={0} width={W} height={H} /></clipPath></defs>
      <line className="lb-axis" x1={10} y1={CY} x2={W - 10} y2={CY} />
      {marks.map(m => Math.abs(m.x) <= r.extent && (
        <g key={m.label}>
          <line className="lb-tick" x1={X(m.x)} y1={CY - 7} x2={X(m.x)} y2={CY + 7} />
          <text className="lb-lbl" x={X(m.x)} y={CY + 28} textAnchor="middle">{m.label}</text>
        </g>
      ))}
      <text className="lb-sm" x={CX} y={H - 6} textAnchor="middle">{mirror ? 'P' : 'O'}</text>
      {element()}

      <g clipPath="url(#lab-optics-clip)" key={runKey}>
        {r.rays.map((s, i) => (conceal && s.out) ? null : (
          <line key={i} className={`lb-ray${s.virtual ? ' lb-virtual' : ''}${runKey ? ' lb-draw' : ''}`}
            x1={X(s.from[0])} y1={Y(s.from[1])} x2={X(s.to[0])} y2={Y(s.to[1])}
            style={runKey && s.out && !s.virtual ? { animationDelay: '.45s' } : undefined} />
        ))}
      </g>

      {/* Object: drag it along the axis. */}
      <g className={locked ? '' : 'lb-grab'} onPointerDown={e => { (e.target as Element).setPointerCapture?.(e.pointerId); dragTo(e.clientX); }}>
        <rect x={X(r.u) - 22} y={Math.min(Y(p.h), Y(0)) - 10} width={44} height={Math.abs(Y(p.h) - Y(0)) + 20} fill="transparent" />
        {arrow(r.u, p.h, 'lb-obj')}
      </g>
      <text className="lb-sm" x={X(r.u)} y={Y(p.h) - 14} textAnchor="middle">Object</text>

      {!conceal && !r.atInfinity && Math.abs(r.v) <= r.extent * 1.02 && (
        <g>
          {arrow(r.v, Math.max(-hiShown, Math.min(hiShown, r.hi)), `lb-img${r.real ? '' : ' lb-virtual'}`)}
          <text className="lb-sm" x={X(r.v)} y={r.hi >= 0 ? Y(Math.min(hiShown, r.hi)) - 14 : Y(-Math.min(hiShown, -r.hi)) + 26} textAnchor="middle">
            Image{Math.abs(r.hi) > hiShown ? ' (taller than shown)' : ''}
          </text>
        </g>
      )}
      {!conceal && !r.atInfinity && Math.abs(r.v) > r.extent * 1.02 && (
        <text className="lb-sm" x={r.v > 0 ? W - 20 : 20} y={40} textAnchor={r.v > 0 ? 'end' : 'start'}>Image {Math.round(Math.abs(r.v))} cm away, off the bench</text>
      )}
      {!conceal && r.atInfinity && <text className="lb-lbl" x={mirror ? 30 : W - 30} y={40} textAnchor={mirror ? 'start' : 'end'}>Rays leave parallel: image at infinity</text>}
    </svg>
  );
}
