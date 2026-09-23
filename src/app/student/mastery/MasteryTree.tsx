/**
 * Branch diagram from the mockup's buildTree(): each evidence bubble merges
 * into its topic node, and every topic merges into the subject TML trunk.
 * Column width grows with a topic's evidence count so bubbles and their
 * titles never overlap (the mockup assumed at most two items per topic).
 */
import { HourglassIcon as Hourglass } from '@phosphor-icons/react/dist/ssr/Hourglass';
import { hmColor } from '@/components/canon/ui';
import { dmy } from '@/lib/student/shape';
import type { Gate, SubjectMastery } from '@/lib/student/types';

const GATE_LABEL: Record<Gate, string> = { firm: 'Confirmed', provisional: 'Still building', insufficient: 'Not enough yet' };
const TRUNK = 300, PAD = 40, EVR = 23, TOPR = 30, H = 600, MIN_COL = 190, EV_GAP = 124;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function MasteryTree({ m }: { m: SubjectMastery }) {
  const cols = m.topics.map(t => Math.max(MIN_COL, t.items.length > 1 ? ((t.items.length - 1) * EV_GAP) / 0.68 + 40 : MIN_COL));
  const W = PAD + cols.reduce((s, c) => s + c, 0) + 210;
  const trunkEnd = W - 200;
  const branches: React.ReactNode[] = [];
  const joints: React.ReactNode[] = [];
  const nodes: React.ReactNode[] = [];

  let x0 = PAD;
  m.topics.forEach((t, ti) => {
    const w = cols[ti];
    const above = ti % 2 === 0;
    const topicX = x0 + w * 0.62;
    const topicY = above ? TRUNK - 105 : TRUNK + 105;
    const evY = above ? TRUNK - 230 : TRUNK + 230;
    const n = t.items.length;

    t.items.forEach((e, ei) => {
      const evX = n === 1 ? topicX : x0 + w * 0.28 + ei * ((w * 0.68) / (n - 1));
      const pending = e.pct === null;
      const y1 = above ? evY + EVR : evY - EVR;
      const y2 = above ? topicY - TOPR : topicY + TOPR;
      const d = (y2 - y1) / 2;
      const desc = `${e.title} · ${e.kind} · ${pending ? e.label : `${e.pct}%`} · ${dmy(e.at)}`;
      branches.push(<path key={`b${ti}-${ei}`} className="tr-branch" d={`M ${evX} ${y1} C ${evX} ${y1 + d}, ${topicX} ${y2 - d}, ${topicX} ${y2}`} />);
      nodes.push(
        <g key={`e${ti}-${ei}`} className="tr-node" tabIndex={0} role="img" aria-label={desc}>
          <title>{desc}</title>
          {!pending && e.pct! >= 90 && <circle className="tr-best" cx={evX} cy={evY} r={30} fill={hmColor(e.pct!)} opacity={0.3} />}
          <circle className="ev" cx={evX} cy={evY} r={EVR} fill={pending ? '#fff' : hmColor(e.pct!)} stroke={pending ? '#C9D6E8' : '#fff'}
            strokeWidth={3} strokeDasharray={pending ? '5 4' : undefined} />
          {pending
            ? <Hourglass x={evX - 9} y={evY - 9} width={18} height={18} weight="duotone" color="#9AA6B8" aria-hidden="true" />
            : <text className="tr-ev-txt" x={evX} y={evY}>{e.pct}</text>}
          <text className="tr-title" x={evX} y={above ? evY - EVR - 20 : evY + EVR + 22}>{clip(e.title, 20)}</text>
          <text className="tr-sub" x={evX} y={above ? evY - EVR - 7 : evY + EVR + 35}>{e.kind} · {e.pct === null ? e.label : dmy(e.at)}</text>
        </g>,
      );
    });

    const scored = t.score !== null;
    branches.push(<path key={`t${ti}`} className="tr-branch" d={`M ${topicX} ${above ? topicY + TOPR : topicY - TOPR} L ${topicX} ${TRUNK}`} />);
    joints.push(<circle key={`j${ti}`} className="tr-join" cx={topicX} cy={TRUNK} r={7} />);
    const tdesc = `Topic ${t.name} · ${scored ? `${t.score}%` : 'not scored yet'} · ${GATE_LABEL[t.gate]}`;
    nodes.push(
      <g key={`n${ti}`} className="tr-node" role="img" aria-label={tdesc}>
        <title>{tdesc}</title>
        <circle cx={topicX} cy={topicY} r={TOPR} fill={scored ? hmColor(t.score!) : '#fff'} stroke={scored ? '#fff' : '#C9D6E8'}
          strokeWidth={scored ? 4 : 2.5} strokeDasharray={scored ? undefined : '5 4'} opacity={0.92} />
        {scored
          ? <text className="tr-topic-txt" x={topicX} y={topicY}>{t.score}%</text>
          : <Hourglass x={topicX - 11} y={topicY - 11} width={22} height={22} weight="duotone" color="#9AA6B8" aria-hidden="true" />}
        <text className="tr-topic-lbl" x={topicX} y={above ? topicY + TOPR + 18 : topicY - TOPR - 10}>{clip(t.name, 26)}</text>
      </g>,
    );
    x0 += w;
  });

  return (
    <svg className="tree" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
      aria-label={`Branch diagram: each assignment, quiz and tutor session merges into its topic, and every topic merges into the ${m.subject} True Mastery Level of ${m.tml ?? 'not yet scored'}${m.tml !== null ? ' percent' : ''}.`}>
      <defs>
        {/* userSpaceOnUse: a bounding-box gradient on a zero-height line renders nothing */}
        <linearGradient id="trunkg" gradientUnits="userSpaceOnUse" x1={PAD - 20} y1={TRUNK} x2={trunkEnd} y2={TRUNK}><stop offset="0" stopColor="#4C8DFF" /><stop offset="1" stopColor="#002147" /></linearGradient>
      </defs>
      <line className="tr-trunk" x1={PAD - 20} y1={TRUNK} x2={trunkEnd} y2={TRUNK} stroke="url(#trunkg)" />
      {branches}{joints}{nodes}
      <g>
        <rect x={trunkEnd} y={TRUNK - 26} width={186} height={52} rx={13} fill="#002147" />
        <text x={trunkEnd + 16} y={TRUNK - 6} fontSize={11} fontWeight={800} fill="#9FBBE0">{clip(m.subject.toUpperCase(), 18)} TML</text>
        <text x={trunkEnd + 16} y={TRUNK + 16} fontSize={19} fontWeight={800} fill="#fff">{m.tml !== null ? `${m.tml}%` : '—'}</text>
      </g>
    </svg>
  );
}

export { GATE_LABEL };
