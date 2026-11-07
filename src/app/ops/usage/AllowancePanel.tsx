'use client';

import { useEffect, useState } from 'react';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { GaugeIcon as Gauge } from '@phosphor-icons/react/dist/ssr/Gauge';
import { useOpsApi } from '../useOpsApi';

/**
 * The AI cost cap by school this academic session (Moses, 2026-11-06: AI per student per year never above 50% of the
 * price, designed for 25%). Schools with paused or economy students first.
 */
interface Row { id: string; name: string; spentInr: number; used: number; level: 'normal' | 'economy' | 'paused' }
interface School {
  id: string; name: string; session: string; students: number; priceInr: number; capInr: number; sharedPerStudentInr: number;
  avgShareOfPrice: number; economy: number; paused: number; top: Row[];
}
interface Data { schools: School[]; designShare: number; capShare: number; economyAt: number; checkedAt: string }

const inr = (v: number) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: v < 10 ? 2 : 0 })}`;
const pctOf = (x: number) => `${Math.round(x * 1000) / 10}%`;

export default function AllowancePanel() {
  const api = useOpsApi();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api<Data>('/usage/allowance').then(d => { if (live) setData(d); }).catch((e: unknown) => { if (live) setErr(e instanceof Error ? e.message : 'Could not load.'); });
    return () => { live = false; };
  }, [api]);
  if (err) return <div className="note err" role="alert">{err}</div>;
  if (!data) return <Skeleton h={220} style={{ borderRadius: 20 }} />;
  if (!data.schools.length) return <div className="card"><Empty icon={<Gauge size={28} weight="duotone" />} title="No students yet">Allowances appear once a school has students.</Empty></div>;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
        Each student may use AI worth up to {pctOf(data.capShare)} of what the school pays per student this academic session, designed for {pctOf(data.designShare)}.
        Past {pctOf(data.economyAt)} of the cap, Sonnet work runs on Haiku; at the cap, new tutor sessions and self-quizzes pause.
      </p>
      {data.schools.map(s => {
        const over = s.avgShareOfPrice > data.designShare;
        return (
          <section key={s.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>{s.name}</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {s.paused > 0 && <Chip tone="r">{s.paused} PAUSED</Chip>}
                {s.economy > 0 && <Chip tone="a">{s.economy} ECONOMY</Chip>}
                <Chip tone={over ? 'a' : 'g'}>AVERAGE {pctOf(s.avgShareOfPrice)} OF PRICE</Chip>
              </div>
            </div>
            <dl style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 28px', margin: '10px 0 0' }}>
              {[['Price per student', inr(s.priceInr)], ['Cap per student', inr(s.capInr)], ['Shared AI per student', inr(s.sharedPerStudentInr)], ['Students', s.students.toLocaleString('en-IN')], ['Session', s.session]].map(([k, v]) => (
                <div key={k}><dt className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{k}</dt><dd style={{ margin: '2px 0 0', fontWeight: 800 }}>{v}</dd></div>
              ))}
            </dl>
            {s.top.length > 0 && (
              <div className="tbl-wrap" style={{ marginTop: 12 }}><table className="tbl">
                <thead><tr><th>Closest to the cap</th><th style={{ textAlign: 'right' }}>Spent</th><th style={{ textAlign: 'right' }}>Of cap</th><th>State</th></tr></thead>
                <tbody>
                  {s.top.map(r => (
                    <tr key={r.id}><td>{r.name}</td><td className="num" style={{ textAlign: 'right' }}>{inr(r.spentInr)}</td><td className="num" style={{ textAlign: 'right' }}>{pctOf(r.used)}</td>
                      <td>{r.level === 'paused' ? <Chip tone="r">PAUSED</Chip> : r.level === 'economy' ? <Chip tone="a">ECONOMY</Chip> : <Chip tone="g">NORMAL</Chip>}</td></tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </section>
        );
      })}
    </div>
  );
}
