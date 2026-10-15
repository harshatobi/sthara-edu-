'use client';

import { solveCircuit, type CircuitParams } from '@/lib/lab/engines/circuits';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';

const W = 1000, H = 480;
const BX = 110, TOP = 90, BOT = 400, PLUS = 232, MINUS = 258; // battery on the left, + plate on top

interface Seg { d: string; i: number }
interface Res { name: string; ohms: number; x: number; y: number; vertical: boolean; i: number; v: number; p: number }

/** Seconds for one dash cycle: more current, faster flow (absolute, so raising the voltage visibly speeds it up). */
const flowSeconds = (i: number) => Math.min(6, Math.max(0.15, 0.5 / Math.max(i, 1e-6)));

/**
 * The schematic, laid out per connection. Each wire segment carries the
 * current the engine computed for it (conventional current, out of the +
 * plate), so branch flows visibly split and rejoin.
 */
export default function CircuitView({ params, conceal, runKey }: ViewProps<CircuitParams>) {
  const p = params;
  const r = solveCircuit(p);
  const b = r.branches;
  const segs: Seg[] = [];
  const res: Res[] = [];
  const add = (k: number, x: number, y: number, vertical: boolean) => res.push({ name: b[k].name, ohms: b[k].r, x, y, vertical, i: b[k].i, v: b[k].v, p: b[k].p });

  if (p.topology === 'series') {
    segs.push({ d: `M${BX} ${PLUS} V${TOP} H890 V${BOT} H${BX} V${MINUS}`, i: r.i });
    b.forEach((_, k) => add(k, BX + (780 * (k + 1)) / (b.length + 1), TOP, false));
  } else if (p.topology === 'parallel') {
    const xs = b.length === 3 ? [400, 620, 840] : [480, 800];
    let carried = r.i, prev = BX;
    xs.forEach((x, k) => {
      segs.push({ d: `M${prev} ${prev === BX ? PLUS : TOP} ${prev === BX ? `V${TOP}` : ''} H${x}`, i: carried });
      segs.push({ d: `M${x} ${TOP} V${BOT}`, i: b[k].i });
      add(k, x, (TOP + BOT) / 2, true);
      carried -= b[k].i;
      prev = x;
    });
    // Bottom rail, right to left: currents rejoin.
    let back = 0;
    for (let k = xs.length - 1; k >= 0; k--) {
      back += b[k].i;
      const to = k === 0 ? BX : xs[k - 1];
      segs.push({ d: `M${xs[k]} ${BOT} H${to}${k === 0 ? ` V${MINUS}` : ''}`, i: back });
    }
  } else {
    segs.push({ d: `M${BX} ${PLUS} V${TOP} H560`, i: r.i });
    segs.push({ d: `M560 ${TOP} H820`, i: b[2].i });
    segs.push({ d: `M560 ${TOP} V${BOT}`, i: b[1].i });
    segs.push({ d: `M820 ${TOP} V${BOT}`, i: b[2].i });
    segs.push({ d: `M820 ${BOT} H560`, i: b[2].i });
    segs.push({ d: `M560 ${BOT} H${BX} V${MINUS}`, i: r.i });
    add(0, 300, TOP, false);
    add(1, 560, (TOP + BOT) / 2, true);
    add(2, 820, (TOP + BOT) / 2, true);
  }

  const maxP = Math.max(...res.map(x => x.p), 1e-9);
  const heat = (pw: number) => {
    const t = pw / maxP; // white → coral by share of the hottest resistor
    const mix = (a: number, z: number) => Math.round(a + (z - a) * t * 0.85);
    return `rgb(${mix(255, 244)},${mix(255, 94)},${mix(255, 119)})`;
  };
  const flowing = runKey > 0 && !conceal;

  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.topology} circuit, ${p.v} volt cell, ${res.map(x => `${x.name} ${x.ohms} ohms`).join(', ')}`}>
      {segs.map((s, k) => <path key={k} className="lb-wire" d={s.d} />)}
      {flowing && segs.map((s, k) => s.i > 1e-9 && (
        <path key={`f${runKey}-${k}`} className="lb-flow" d={s.d} style={{ animationDuration: `${flowSeconds(s.i)}s` }} />
      ))}

      {/* Cell: long plate +, short plate − */}
      <rect x={BX - 34} y={PLUS - 2} width={68} height={MINUS - PLUS + 4} fill="#F7F9FB" />
      <line x1={BX - 30} y1={PLUS} x2={BX + 30} y2={PLUS} stroke="#002147" strokeWidth={4} />
      <line x1={BX - 15} y1={MINUS} x2={BX + 15} y2={MINUS} stroke="#002147" strokeWidth={8} />
      <text className="lb-lbl" x={BX - 44} y={PLUS + 5} textAnchor="end">+</text>
      <text className="lb-lbl" x={BX - 44} y={MINUS + 6} textAnchor="end">−</text>
      <text className="lb-lbl" x={BX + 42} y={(PLUS + MINUS) / 2 + 5}>{fmt(p.v, 1)} V</text>

      {/* Ammeter in the main line */}
      <g transform={`translate(${BX} ${TOP + 60})`}>
        <circle className="lb-meter" r={22} />
        <text className="lb-lbl" textAnchor="middle" y={6}>A</text>
        <text className="lb-lbl" x={32} y={6}>{conceal ? '? A' : `${fmt(r.i, 3)} A`}</text>
      </g>

      {res.map(x => {
        const w = x.vertical ? 38 : 96, h = x.vertical ? 96 : 38;
        return (
          <g key={x.name}>
            <rect className="lb-res" x={x.x - w / 2} y={x.y - h / 2} width={w} height={h} rx={6} fill={conceal ? '#fff' : heat(x.p)} />
            <text className="lb-lbl" x={x.vertical ? x.x + 30 : x.x} y={x.vertical ? x.y - 8 : x.y - 30} textAnchor={x.vertical ? 'start' : 'middle'}>{x.name} = {fmt(x.ohms, 0)} Ω</text>
            {!conceal && (
              <text className="lb-sm" x={x.vertical ? x.x + 30 : x.x} y={x.vertical ? x.y + 14 : x.y + 44} textAnchor={x.vertical ? 'start' : 'middle'}>
                {fmt(x.i, 3)} A · {fmt(x.v, 2)} V · {fmt(x.p, 2)} W
              </text>
            )}
          </g>
        );
      })}
      {!conceal && <text className="lb-sm" x={W - 20} y={H - 14} textAnchor="end">Shading: share of the heat produced</text>}
    </svg>
  );
}
