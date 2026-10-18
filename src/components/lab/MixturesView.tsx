'use client';

import { BEHAVIOUR, INK_DYES, PROPERTIES, SUBSTANCES, TECHNIQUES, type Kind, type MixturesParams } from '@/lib/lab/engines/mixtures';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

const LOOK: Record<Kind, { fill: string; opacity: number }> = {
  'True solution': { fill: '#DCEBFF', opacity: 0.55 },
  Colloid: { fill: '#F1F3F6', opacity: 0.85 },
  Suspension: { fill: '#B08B5B', opacity: 0.9 },
};

export default function MixturesView(props: ViewProps<MixturesParams>) {
  return props.params.scenario === 'classify' ? <Classify {...props} /> : <Separate {...props} />;
}

function Note({ conceal, text, ask }: { conceal: boolean; text: string; ask: string }) {
  return (
    <foreignObject x={600} y={120} width={360} height={260}>
      <div style={{ fontSize: 17, lineHeight: 1.45, color: '#002147', fontWeight: 600 }}>{conceal ? ask : `${text}.`}</div>
    </foreignObject>
  );
}

function Classify({ params: p, conceal, runKey }: ViewProps<MixturesParams>) {
  const s = SUBSTANCES[p.substance], look = LOOK[s.kind];
  const k = useRun(runKey, conceal, 2400);
  const done = !conceal && k > 0.3;
  const beaker = (x: number, y: number, w: number, h: number, settled: boolean) => (
    <g>
      <path d={`M${x} ${y} V${y + h} H${x + w} V${y}`} fill="none" stroke="#002147" strokeWidth={3} />
      <rect x={x + 2} y={y + h * 0.25} width={w - 4} height={h * 0.75 - 2} fill={settled ? '#E3F0FF' : look.fill} opacity={settled ? 0.6 : look.opacity} />
      {settled && <rect x={x + 2} y={y + h - 22} width={w - 4} height={20} fill="#8B6A43" />}
    </g>
  );
  let drawing;
  if (p.property === 'transparency') {
    drawing = (
      <g>
        <text x={240} y={300} textAnchor="middle" style={{ fontSize: 34, fontWeight: 800, fill: '#002147' }}>STHARA</text>
        {beaker(150, 150, 180, 230, false)}
        <text className="lb-sm" x={240} y={410} textAnchor="middle">Read the word through the beaker</text>
      </g>
    );
  } else if (p.property === 'filtration') {
    drawing = (
      <g>
        <path d="M150 140 L330 140 L255 260 V320 H225 V260 Z" fill="#F5F8FC" stroke="#002147" strokeWidth={3} />
        {done && s.kind === 'Suspension' && <path d="M195 200 L285 200 L255 250 H225 Z" fill="#8B6A43" />}
        {beaker(170, 330, 140, 110, false)}
        <text className="lb-sm" x={240} y={128} textAnchor="middle">filter paper in a funnel</text>
      </g>
    );
  } else if (p.property === 'stability') {
    drawing = <g>{beaker(150, 150, 180, 230, done && s.kind === 'Suspension')}<text className="lb-sm" x={240} y={410} textAnchor="middle">{done ? 'after standing 15 minutes' : 'just stirred'}</text></g>;
  } else {
    drawing = (
      <g>
        <rect x={40} y={250} width={60} height={40} rx={6} fill="#002147" />
        <text className="lb-sm" x={70} y={310} textAnchor="middle">torch</text>
        <path d="M100 262 L520 250 L520 290 L100 278 Z" fill="#FDE68A" opacity={0.35} />
        {beaker(200, 150, 220, 250, false)}
        {done && s.kind !== 'True solution' && <path d="M202 262 L418 256 L418 284 L202 278 Z" fill="#FCD34D" opacity={0.9} />}
      </g>
    );
  }
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.label}: ${PROPERTIES[p.property]}`}>
      <text className="lb-lbl" x={40} y={50}>{s.label} · {PROPERTIES[p.property]}</text>
      {drawing}
      <Note conceal={conceal} ask="What will you observe?" text={`${s.kind}: ${BEHAVIOUR[s.kind][p.property]}`} />
    </svg>
  );
}

function Separate({ params: p, conceal, runKey }: ViewProps<MixturesParams>) {
  const t = TECHNIQUES[p.technique];
  const k = useRun(runKey, conceal, 3200);
  const prog = conceal ? 0 : k;
  let drawing;
  if (p.technique === 'funnel') {
    drawing = (
      <g>
        <path d="M200 110 Q240 90 280 110 L300 260 L250 320 V380 H230 V320 L180 260 Z" fill="#F5F8FC" stroke="#002147" strokeWidth={3} />
        <path d="M188 200 L292 200 L299 258 L181 258 Z" fill="#FCD34D" opacity={0.8} />
        <path d={`M181 258 L299 258 L250 ${318 - 30 * prog} H230 Z`} fill="#BFDBFE" opacity={1 - 0.6 * prog} />
        <rect x={222} y={330} width={36} height={10} fill="#002147" />
        <path d="M190 400 V460 H290 V400" fill="none" stroke="#002147" strokeWidth={3} />
        <rect x={192} y={460 - 50 * prog} width={96} height={50 * prog} fill="#BFDBFE" />
        <text className="lb-sm" x={320} y={230}>oil</text><text className="lb-sm" x={320} y={280}>water</text>
      </g>
    );
  } else if (p.technique === 'chromatography') {
    const front = 100 + (1 - prog) * 230;
    drawing = (
      <g>
        <rect x={200} y={90} width={80} height={290} fill="#FFFFFF" stroke="#9AA6B8" strokeWidth={2} />
        <rect x={160} y={340} width={160} height={70} fill="#DCEBFF" opacity={0.7} stroke="#002147" strokeWidth={2} />
        <line className="lb-axis" x1={200} x2={280} y1={front} y2={front} />
        {prog < 0.05 ? <circle cx={240} cy={330} r={8} fill="#111827" /> : INK_DYES.map(d => (
          <ellipse key={d.colour} cx={240} cy={330 - (330 - front) * d.rf} rx={22} ry={8} fill={d.hex} opacity={0.85} />
        ))}
        <text className="lb-sm" x={290} y={front + 4}>solvent front</text>
        <text className="lb-sm" x={290} y={334}>ink spot</text>
      </g>
    );
  } else if (p.technique === 'sublimation') {
    drawing = (
      <g>
        <path d="M150 300 Q240 350 330 300" fill="#F5F8FC" stroke="#002147" strokeWidth={3} />
        <path d="M160 160 L320 160 L255 250 V300 H225 V250 Z" fill="none" stroke="#002147" strokeWidth={3} transform="rotate(180 240 230)" />
        <rect x={232} y={136} width={16} height={18} rx={4} fill="#FFFFFF" stroke="#9AA6B8" />
        {Array.from({ length: Math.round(16 * prog) }, (_, i) => <circle key={i} cx={190 + ((i * 29) % 100)} cy={200 + ((i * 13) % 60)} r={4} fill="#FFFFFF" stroke="#9AA6B8" />)}
        <path d={`M170 310 Q240 ${330 - 6 * (1 - prog)} 310 310`} fill="none" stroke="#E5E7EB" strokeWidth={10} />
        <path d="M200 380 l40 -40 l40 40 Z" fill="#F59E0B" opacity={0.85} />
        <text className="lb-sm" x={340} y={220}>white solid on the funnel</text>
        <text className="lb-sm" x={340} y={318}>salt left in the dish</text>
      </g>
    );
  } else {
    drawing = (
      <g>
        <path d="M150 140 V400 H330 V140" fill="none" stroke="#002147" strokeWidth={3} />
        <rect x={152} y={180} width={176} height={218} fill="#B08B5B" opacity={0.85 - 0.75 * prog} />
        <rect x={152} y={398 - 40 * prog} width={176} height={40 * prog} fill="#8B6A43" />
        <text className="lb-sm" x={350} y={200}>{prog > 0.5 ? 'clear water' : 'muddy water + alum'}</text>
        {prog > 0.5 && <text className="lb-sm" x={350} y={390}>settled clumps</text>}
      </g>
    );
  }
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t.label}: ${t.mixture}`}>
      <text className="lb-lbl" x={40} y={50}>{t.label}: {t.mixture.toLowerCase()}</text>
      {drawing}
      <Note conceal={conceal} ask="What will you see at the end?" text={`${t.result} ${t.principle}`.replace(/\.$/, '')} />
    </svg>
  );
}
