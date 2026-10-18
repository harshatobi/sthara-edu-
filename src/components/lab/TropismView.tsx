'use client';

import { solveTropism, type TropismParams } from '@/lib/lab/engines/tropism';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/**
 * A seedling in a pot (upright or on its side). The shoot and root grow day by
 * day and curve towards their stimulus; dots in the shoot tip show where auxin
 * collects.
 */
export default function TropismView({ params: p, conceal, runKey }: ViewProps<TropismParams>) {
  const s = solveTropism(p);
  const k = useRun(runKey, conceal, 4000);
  const grow = conceal ? 0 : (p.days / 7) * k;
  const side = p.pot === 'side';
  // The seed sits at the pot's centre; growth curves from the pot's own "up" towards the stimulus.
  const cx = 420, cy = 300;
  const potUp = side ? { x: 1, y: 0 } : { x: 0, y: -1 };
  const target = s.shoot === 'left' ? { x: -1, y: 0 } : s.shoot === 'right' ? { x: 1, y: 0 } : { x: 0, y: -1 };
  const L = 40 + 180 * grow;
  const ctrl = { x: cx + potUp.x * L * 0.6, y: cy + potUp.y * L * 0.6 };
  const tip = { x: ctrl.x + target.x * L * 0.6, y: ctrl.y + target.y * L * 0.6 };
  const rootDown = { x: -potUp.x, y: -potUp.y };
  const R = 30 + 110 * grow;
  const rctrl = { x: cx + rootDown.x * R * 0.6, y: cy + rootDown.y * R * 0.6 };
  const rtip = { x: rctrl.x, y: rctrl.y + R * 0.6 };
  const lightAt = p.light === 'left' ? { x: 120, y: 200 } : p.light === 'right' ? { x: 860, y: 200 } : p.light === 'above' ? { x: 560, y: 130 } : null;
  const shadedDx = p.light === 'left' ? 8 : p.light === 'right' ? -8 : 0;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Seedling, light ${p.light}, pot ${p.pot}`}>
      <rect x={0} y={0} width={W} height={H} fill={p.light === 'dark' ? '#1F2937' : 'transparent'} opacity={0.08} />
      {lightAt && <g><circle cx={lightAt.x} cy={lightAt.y} r={26} fill="#FCD34D" /><text className="lb-sm" x={lightAt.x} y={lightAt.y + 46} textAnchor="middle">light</text></g>}
      <g transform={`rotate(${side ? 90 : 0} ${cx} ${cy})`}>
        <path d={`M${cx - 90} ${cy - 40} L${cx + 90} ${cy - 40} L${cx + 70} ${cy + 120} L${cx - 70} ${cy + 120} Z`} fill="#C08A4B" stroke="#002147" strokeWidth={2.5} />
        <rect x={cx - 86} y={cy - 40} width={172} height={40} fill="#7C5A3A" />
      </g>
      <path d={`M${cx} ${cy} Q${ctrl.x} ${ctrl.y} ${tip.x} ${tip.y}`} fill="none" stroke="#16A34A" strokeWidth={7} strokeLinecap="round" />
      <path d={`M${tip.x} ${tip.y} q${-18} -10 -30 4 M${tip.x} ${tip.y} q18 -10 30 4`} fill="none" stroke="#16A34A" strokeWidth={4} />
      <path d={`M${cx} ${cy} Q${rctrl.x} ${rctrl.y} ${rtip.x} ${rtip.y}`} fill="none" stroke="#E7D3A1" strokeWidth={5} strokeLinecap="round" />
      <ellipse cx={cx} cy={cy} rx={14} ry={10} fill="#D9B26B" stroke="#7A5A2F" />
      {!conceal && shadedDx !== 0 && grow > 0.2 && [0, 1, 2].map(i => <circle key={i} cx={tip.x + shadedDx * (1 + (i % 2))} cy={tip.y + 12 + i * 10} r={4} fill="#7C5CFC" />)}
      <text className="lb-lbl" x={40} y={50}>Day {Math.round(p.days * (conceal ? 0 : k))} · pot {side ? 'on its side' : 'upright'} · {p.light === 'dark' ? 'in the dark' : `light from ${p.light === 'above' ? 'above' : `the ${p.light}`}`}</text>
      {!conceal && <text className="lb-sm" x={40} y={76}>{s.kind}. Purple dots: auxin, on {s.auxin}.</text>}
    </svg>
  );
}
