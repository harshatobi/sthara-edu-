'use client';

import { useMemo, useState } from 'react';
import { ShieldWarningIcon as ShieldWarning } from '@phosphor-icons/react/dist/ssr/ShieldWarning';
import { Chip, hmColor } from '@/components/canon/ui';
import { BAND_LABEL } from '@/lib/teacher/mastery';
import { explainTopic, simulateTopic, type EngagementInputs, type Evidence, type TmlComponentType } from '@/lib/tml/engine';
import { rankOf, spread } from '@/lib/teacher/masteryTrend';
import { DotStrip, Score, firstName } from './parts';

const COMP_LABEL: Record<TmlComponentType, string> = { homework: 'Homework & classwork', quiz: 'Quizzes & tests', tutor: 'AI Tutor depth' };
// One navy-to-sky family, so evidence colours never read as the red / amber / green mastery bands.
const COMP_COLOR: Record<TmlComponentType, string> = { homework: '#002147', quiz: '#2F6BFF', tutor: '#8FB3FF' };
const ENG_COLOR = '#C9D3E1';
const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const day = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const band = (v: number) => (v >= 75 ? 'green' : v >= 40 ? 'amber' : 'red');

export interface DrillInput {
  chapterName: string;
  /** This student's evidence on the chapter (engine topic), from /api/teacher/mastery/student. */
  evidence: Evidence[];
  nowMs: number;
  engagement: EngagementInputs;
  flagged: boolean;
  /** Stored score (the number every other screen shows) for a consistency check. */
  stored: number | null;
  student: string;
  classScores: number[];
}

type Tab = 'why' | 'whatif' | 'class';

export default function ChapterDrill(p: DrillInput) {
  const [tab, setTab] = useState<Tab>('why');
  const x = useMemo(() => explainTopic(p.evidence, { nowMs: p.nowMs, engagement: p.engagement, hadIntegrityViolation: p.flagged }), [p.evidence, p.nowMs, p.engagement, p.flagged]);
  return (
    <div className="ms-drill">
      <div className="ms-seg" role="tablist" aria-label={`${p.chapterName} detail`}>
        {([['why', 'Why this score'], ['whatif', 'What if'], ['class', 'Against the class']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'why' && <Why x={x} p={p} />}
      {tab === 'whatif' && <WhatIf p={p} current={x.finalTml} band={x.confidenceBand} />}
      {tab === 'class' && <AgainstClass p={p} me={x.finalTml === null ? p.stored : Math.round(x.finalTml)} />}
    </div>
  );
}

// ── Why this score: the waterfall, then every piece of evidence ────────────────
function Why({ x, p }: { x: ReturnType<typeof explainTopic>; p: DrillInput }) {
  if (x.finalTml === null) return <p className="muted">No graded evidence on this chapter yet.</p>;
  const comps: TmlComponentType[] = ['homework', 'quiz', 'tutor'];
  const compPts = Object.fromEntries(comps.map(c => [c, x.items.filter(i => i.component === c).reduce((a, i) => a + i.points, 0)])) as Record<TmlComponentType, number>;
  const engPts = x.engagement.reduce((a, e) => a + e.points, 0);
  const segs = [...comps.filter(c => x.componentWeights[c] > 0).map(c => ({ key: c, label: COMP_LABEL[c], pts: compPts[c], color: COMP_COLOR[c] })),
    { key: 'eng', label: 'Engagement', pts: engPts, color: ENG_COLOR }];
  // Group per-question marks of one paper on one day into a single line.
  const groups = new Map<string, { title: string; kind: string; component: TmlComponentType; atMs: number; age: number; decay: number; n: number; pctSum: number; points: number }>();
  for (const i of x.items) {
    const k = `${i.ref.title}|${i.component}|${day(i.atMs)}`;
    const g = groups.get(k) ?? { title: i.ref.title, kind: i.ref.kind, component: i.component, atMs: i.atMs, age: i.ageDays, decay: i.decay, n: 0, pctSum: 0, points: 0 };
    g.n++; g.pctSum += i.pct; g.points += i.points;
    groups.set(k, g);
  }
  const rows = [...groups.values()].sort((a, b) => b.atMs - a.atMs);
  const drift = p.stored !== null && Math.abs(p.stored - x.finalTml) >= 1;
  return (
    <div>
      <div className="ms-wf" role="img" aria-label={`Score built from ${segs.map(s => `${s.label} ${fmt1(s.pts)} points`).join(', ')}, total ${x.finalTml}`}>
        {segs.map(s => <i key={s.key} style={{ width: `${Math.max(0, s.pts)}%`, background: s.color }} title={`${s.label}: ${fmt1(s.pts)} points`} />)}
        <span className="ms-wf-total" style={{ left: `${Math.min(100, x.finalTml)}%` }}>{Math.round(x.finalTml)}</span>
      </div>
      <ol className="ms-wf-list">
        {comps.filter(c => x.componentWeights[c] > 0).map(c => (
          <li key={c}>
            <i style={{ background: COMP_COLOR[c] }} />
            <span><b>{COMP_LABEL[c]}</b> averages <b>{Math.round(x.componentScores[c]!)}%</b> after time decay, and carries {Math.round(x.componentWeights[c] * 70)}% of the score
              {x.componentWeights[c] !== { homework: 0.4, quiz: 0.4, tutor: 0.2 }[c] && <span className="muted"> (re-weighted: no {comps.filter(o => x.componentWeights[o] === 0).map(o => COMP_LABEL[o].toLowerCase()).join(' or ')} yet)</span>}</span>
            <b className="ms-pts">+{fmt1(compPts[c])}</b>
          </li>
        ))}
        {x.engagement.map(e => (
          <li key={e.key}>
            <i style={{ background: ENG_COLOR }} />
            <span><b>{e.label}</b> {e.measured ? <>at <b>{Math.round(e.value)}%</b></> : <span className="muted">not measured yet, counted as neutral 100%</span>}, {Math.round(e.weight * 100)}% of the score</span>
            <b className="ms-pts">+{fmt1(e.points)}</b>
          </li>
        ))}
        <li className="ms-wf-sum"><span><b>True Mastery Level</b></span><b className="ms-pts" style={{ color: hmColor(x.finalTml) }}>{x.finalTml}%</b></li>
      </ol>
      <div className="ms-notes">
        <Chip tone={x.confidenceBand === 'firm' ? 'g' : x.confidenceBand === 'provisional' ? 'a' : 'n'}>{(BAND_LABEL[x.confidenceBand] ?? x.confidenceBand).toUpperCase()}</Chip>
        <span>{x.confidenceBand === 'firm' ? 'Five or more graded pieces: the score is firm.'
          : x.confidenceBand === 'provisional' ? `Fewer than five graded pieces: read it as ${Math.round(x.finalTml)} ± ${x.margin}.`
            : 'Too little evidence to rely on yet.'}</span>
        {x.integrityPenaltyApplied && <span className="ms-flag"><ShieldWarning size={15} weight="fill" /> A tab switch during a proctored paper on this chapter lowered confidence by 15% (the score itself is unchanged).</span>}
        {drift && <span className="muted">Shown live from today&apos;s evidence; the stored score ({p.stored}%) updates at the next recompute.</span>}
      </div>
      <h4 className="ms-h4">Every piece of evidence</h4>
      <p className="muted ms-sub">Newer work counts more: a result&apos;s weight halves every 14 days. Points are what each result adds to the {Math.round(x.finalTml)}.</p>
      <div className="tbl-wrap">
        <table className="tbl ms-ev">
          <thead><tr><th scope="col">Date</th><th scope="col">Evidence</th><th scope="col">Score</th><th scope="col" className="ms-num">Weight now</th><th scope="col" style={{ textAlign: 'right' }}>Points</th></tr></thead>
          <tbody>
            {rows.map((g, i) => {
              const pct = Math.round(g.pctSum / g.n);
              return (
                <tr key={i}>
                  <td className="nowrap">{day(g.atMs)}<div className="muted ms-tiny">{g.age < 1 ? 'today' : `${Math.round(g.age)} days ago`}</div></td>
                  <td><b>{g.title}</b><div className="muted ms-tiny ms-meta"><span><i className="ms-key" style={{ background: COMP_COLOR[g.component] }} />{g.kind === 'tutor' ? 'Tutor session' : g.kind[0].toUpperCase() + g.kind.slice(1)}</span>{g.n > 1 && <span>{g.n} questions</span>}</div></td>
                  <td><b style={{ color: hmColor(pct) }}>{pct}%</b></td>
                  <td className="ms-num">{Math.round(g.decay * 100)}%</td>
                  <td style={{ textAlign: 'right' }}><b>+{fmt1(g.points)}</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── What if: one more result, rescored by the same engine ──────────────────────
function WhatIf({ p, current, band: conf }: { p: DrillInput; current: number | null; band: string }) {
  const [comp, setComp] = useState<TmlComponentType>('quiz');
  const [pct, setPct] = useState(80);
  const opts = { nowMs: p.nowMs, engagement: p.engagement, hadIntegrityViolation: p.flagged };
  const sim = simulateTopic(p.evidence, { component: comp, pct }, opts);
  const now = current === null ? null : Math.round(current);
  const next = sim.finalTml === null ? null : Math.round(sim.finalTml);
  // The lowest single result that reaches green (75), if one can.
  const target = useMemo(() => {
    if (now !== null && now >= 75) return 'already';
    for (let v = 0; v <= 100; v++) if ((simulateTopic(p.evidence, { component: comp, pct: v }, opts).finalTml ?? 0) >= 74.5) return v;
    return null;
  }, [p.evidence, comp, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = firstName(p.student);
  return (
    <div className="ms-whatif">
      <fieldset className="ms-radios">
        <legend>If {name}&apos;s next result on {p.chapterName} is a</legend>
        {(['quiz', 'homework', 'tutor'] as TmlComponentType[]).map(c => (
          <label key={c} className={comp === c ? 'on' : ''}><input type="radio" name="wi-comp" checked={comp === c} onChange={() => setComp(c)} /> {c === 'tutor' ? 'Tutor session' : c === 'quiz' ? 'Quiz or test' : 'Homework'}</label>
        ))}
      </fieldset>
      <label className="ms-slider">
        <span>scoring <b>{pct}%</b>{comp === 'tutor' ? ' depth' : ''}</span>
        <input type="range" min={0} max={100} step={5} value={pct} onChange={e => setPct(Number(e.target.value))} aria-valuetext={`${pct}%`} />
      </label>
      <div className="ms-wi-out" role="status">
        <div><span className="muted">Now</span><b style={{ color: now === null ? 'var(--mut2)' : hmColor(now) }}>{now === null ? 'Not yet' : `${now}%`}</b><small>{BAND_LABEL[conf] ?? conf}</small></div>
        <span className="ms-wi-arrow" aria-hidden>→</span>
        <div><span className="muted">Then</span><b style={{ color: next === null ? 'var(--mut2)' : hmColor(next) }}>{next === null ? 'Not yet' : `${next}%`}</b><small>{BAND_LABEL[sim.confidenceBand] ?? sim.confidenceBand}</small></div>
        {now !== null && next !== null && <div className={`ms-wi-chg ${next - now >= 0 ? 'up' : 'down'}`}>{next - now >= 0 ? '+' : '−'}{Math.abs(next - now)} points{band(now) !== band(next) ? `, moves to ${band(next)}` : ''}</div>}
      </div>
      <p className="muted ms-sub">
        {target === 'already' ? `${name} is already in the green on this chapter.`
          : target === null ? `One ${comp === 'tutor' ? 'tutor session' : comp} alone can't lift this chapter to 75%; it needs a run of strong results.`
            : `A ${comp === 'tutor' ? 'tutor session at' : comp + ' of'} ${target}% or better would bring ${name} to 75% (green) on this chapter.`}
        {' '}Computed by the same engine as the real score, as if the result came in today.
      </p>
    </div>
  );
}

// ── Against the class ──────────────────────────────────────────────────────────
function AgainstClass({ p, me }: { p: DrillInput; me: number | null }) {
  const sp = spread(p.classScores);
  const name = firstName(p.student);
  if (!sp) return <p className="muted">No one in the class has a score on this chapter yet.</p>;
  const rank = me === null ? null : rankOf(me, p.classScores);
  const diff = me === null ? null : me - sp.avg;
  return (
    <div>
      <DotStrip values={p.classScores} me={me} sp={sp} label={`${p.chapterName}: ${sp.n} students scored, average ${sp.avg}, ${name} ${me ?? 'not scored'}`} />
      <div className="ms-facts">
        <div><span>{name}</span><Score v={me} size={20} /></div>
        <div><span>Class average</span><b>{sp.avg}%</b></div>
        <div><span>Middle half</span><b>{sp.q1}-{sp.q3}%</b></div>
        <div><span>Rank</span><b>{rank === null ? 'Not ranked' : `${rank} of ${sp.n}`}</b></div>
        <div><span>In the red / green</span><b>{p.classScores.filter(v => v < 40).length} / {p.classScores.filter(v => v >= 75).length}</b></div>
      </div>
      {diff !== null && <p className="muted ms-sub">{name} is {diff === 0 ? 'right at' : `${Math.abs(diff)} points ${diff > 0 ? 'above' : 'below'}`} the class average on this chapter.</p>}
    </div>
  );
}
