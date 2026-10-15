'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ANALYTE, BURETTE_ML, INDICATOR_LABEL, curve, equivalenceVolume, indicatorColour, maxVolume, phAt, phNature, type TitrationParams } from '@/lib/lab/engines/acidBase';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';

const W = 1000, H = 480;
const CX0 = 430, CX1 = 960, CY0 = 440, CY1 = 40; // chart box
const RUN_MS = 9000; // a full run, start to double the neutralising volume

/** Burette, flask and the pH curve. Running adds titrant smoothly; the steps nudge it by hand. */
export default function TitrationView({ params, conceal, runKey, locked }: ViewProps<TitrationParams>) {
  const p = params;
  const max = maxVolume(p), ve = equivalenceVolume(p);
  const [added, setAdded] = useState(0);
  const raf = useRef<number | null>(null);
  const key = `${p.analyte}|${p.ca}|${p.va}|${p.ct}`;

  // A new setup starts from an empty burette reading (reset while rendering, not in an effect).
  const [seen, setSeen] = useState(key);
  if (seen !== key) { setSeen(key); setAdded(0); }

  useEffect(() => {
    if (!runKey || conceal) return;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const k = Math.min(1, (t - start) / RUN_MS);
      setAdded(max * k);
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [runKey, conceal, max]);

  const shown = conceal ? 0 : added;
  const ph = phAt(p, shown);
  const colour = indicatorColour(p.indicator, ph);
  const pts = useMemo(() => curve(p, 160), [p]);
  const a = ANALYTE[p.analyte];

  const X = (v: number) => CX0 + ((CX1 - CX0) * v) / max;
  const Y = (h: number) => CY0 - ((CY0 - CY1) * h) / 14;
  const drawn = pts.filter(q => q.v <= shown + 1e-9);
  const path = drawn.map((q, i) => `${i ? 'L' : 'M'}${X(q.v).toFixed(1)} ${Y(q.ph).toFixed(1)}`).join(' ');

  // Apparatus geometry
  const bTop = 30, bBot = 250, level = bTop + 10 + ((bBot - bTop - 20) * shown) / BURETTE_ML; // filled to the 0 mark
  const fillTop = 420 - Math.min(60, 30 + (shown / BURETTE_ML) * 30);
  const nudge = (d: number) => setAdded(x => Math.max(0, Math.min(max, x + d)));

  return (
    <div>
      <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Titration of ${a.label} with ${a.titrant}; ${fmt(shown, 1)} millilitres added, pH ${fmt(ph, 2)}`}>
        {/* Burette */}
        <rect x={140} y={bTop} width={34} height={bBot - bTop} rx={4} fill="#fff" stroke="#002147" strokeWidth={2.5} />
        <rect x={142} y={level} width={30} height={Math.max(0, bBot - level - 2)} fill="#DCEBFF" />
        {[0, 10, 20, 30, 40, 50].map(m => (
          <g key={m}>
            <line x1={174} x2={186} y1={bTop + 10 + ((bBot - bTop - 20) * m) / BURETTE_ML} y2={bTop + 10 + ((bBot - bTop - 20) * m) / BURETTE_ML} stroke="#002147" strokeWidth={1.5} />
            <text className="lb-sm" x={192} y={bTop + 14 + ((bBot - bTop - 20) * m) / BURETTE_ML}>{m}</text>
          </g>
        ))}
        <rect x={147} y={bBot} width={20} height={14} rx={3} fill="#002147" />
        <path d={`M153 ${bBot + 14} L157 ${bBot + 44} L161 ${bBot + 14}Z`} fill="#002147" />
        <text className="lb-sm" x={130} y={bTop + 12} textAnchor="end">{fmt(p.ct, 2)} M</text>
        <text className="lb-sm" x={130} y={bTop + 30} textAnchor="end">{a.titrant}</text>

        {/* Flask */}
        <path d="M137 330 V350 L72 440 Q68 452 82 452 H232 Q246 452 242 440 L177 350 V330 Z" fill="#fff" stroke="#002147" strokeWidth={2.5} />
        <clipPath id="lab-flask"><path d="M137 330 V350 L72 440 Q68 452 82 452 H232 Q246 452 242 440 L177 350 V330 Z" /></clipPath>
        <rect clipPath="url(#lab-flask)" x={60} y={fillTop} width={200} height={460 - fillTop} fill={colour.hex} style={{ transition: 'fill .4s' }} />
        <text className="lb-lbl" x={157} y={474} textAnchor="middle">{fmt(p.va, 0)} mL {a.formula}</text>

        {/* Chart */}
        {[0, 2, 4, 6, 7, 8, 10, 12, 14].map(h => (
          <g key={h}>
            <line className="lb-grid" x1={CX0} x2={CX1} y1={Y(h)} y2={Y(h)} style={h === 7 ? { stroke: '#C9D6E8', strokeWidth: 1.5 } : undefined} />
            <text className="lb-sm" x={CX0 - 10} y={Y(h) + 4} textAnchor="end">{h}</text>
          </g>
        ))}
        <line className="lb-tick" x1={CX0} y1={CY0} x2={CX1} y2={CY0} />
        <line className="lb-tick" x1={CX0} y1={CY0} x2={CX0} y2={CY1} />
        {[0, 0.25, 0.5, 0.75, 1].map(k => <text key={k} className="lb-sm" x={X(max * k)} y={CY0 + 20} textAnchor="middle">{fmt(max * k, 1)}</text>)}
        <text className="lb-sm" x={(CX0 + CX1) / 2} y={H - 2} textAnchor="middle">{a.titrant} added (mL)</text>
        <text className="lb-sm" x={CX0 - 36} y={CY1 - 12}>pH</text>
        {!conceal && shown >= ve && (
          <g>
            <line className="lb-eq" x1={X(ve)} x2={X(ve)} y1={CY0} y2={CY1} />
            <text className="lb-sm" x={X(ve) + 6} y={CY1 + 14}>Neutralised at {fmt(ve, 1)} mL, pH {fmt(phAt(p, ve), 2)}</text>
          </g>
        )}
        {path && <path className="lb-curve" d={path} />}
        <circle cx={X(shown)} cy={Y(ph)} r={7} fill={colour.hex} stroke="#002147" strokeWidth={2} />
      </svg>

      <div className="lab-bottom" style={{ marginTop: 8 }}>
        <span className="muted" style={{ flex: 1, minWidth: 220 }}>
          {conceal ? 'Nothing added yet.' : <>Added <b className="mono">{fmt(shown, 1)} mL</b> · pH <b className="mono">{fmt(ph, 2)}</b> ({phNature(ph).toLowerCase()}) · {INDICATOR_LABEL[p.indicator]}: <b>{colour.name.toLowerCase()}</b></>}
        </span>
        {!conceal && !locked && (
          <>
            <button className="btn sm" onClick={() => nudge(-1)} disabled={shown <= 0}>−1 mL</button>
            <button className="btn sm" onClick={() => nudge(0.1)} disabled={shown >= max}>+0.1 mL</button>
            <button className="btn sm" onClick={() => nudge(1)} disabled={shown >= max}>+1 mL</button>
            <button className="btn sm" onClick={() => setAdded(0)}>Empty</button>
          </>
        )}
      </div>
    </div>
  );
}
