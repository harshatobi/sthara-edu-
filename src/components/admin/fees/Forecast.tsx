'use client';

import { ChartBarIcon as ChartBar } from '@phosphor-icons/react/dist/ssr/ChartBar';
import { Empty } from '@/components/canon/ui';
import type { AdminDesk } from '@/lib/admin/desk';
import { inr, inrShort, isoDay } from '@/lib/admin/format';
import { CardHead } from '../kit';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (m: string) => `${MONTH[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;

/** Month by month: what falls due (invoiced, plus instalments not yet raised) against what came in. */
export default function Forecast({ desk }: { desk: AdminDesk }) {
  const F = desk.forecast;
  const now = isoDay().slice(0, 7);
  const max = Math.max(1, ...F.map(m => Math.max(m.due, m.collected)));
  const ahead = F.filter(m => m.month > now);
  const expectedAhead = ahead.reduce((s, m) => s + m.due, 0);
  const openPast = F.filter(m => m.month <= now).reduce((s, m) => s + m.open, 0);

  if (!F.some(m => m.due || m.collected)) {
    return (
      <div className="card">
        <Empty icon={<ChartBar size={26} weight="duotone" />} title="Nothing scheduled to forecast yet">
          Set a fee structure for each grade on the Ledger tab. The forecast then shows every month&apos;s dues against collections.
        </Empty>
      </div>
    );
  }
  return (
    <div className="card">
      <CardHead title={`Collection forecast · AY ${desk.session.replace('-', '–')}`}
        sub="Due is by the instalment's due date; collected is by the day money came in. The lighter part of a bar is scheduled but not yet invoiced." />
      <div className="probe-ev" style={{ marginTop: 0, marginBottom: 18 }}>
        <div><span>Still to fall due this year</span><b>{inr(expectedAhead)}</b></div>
        <div><span>Open on months already due</span><b style={{ color: openPast ? 'var(--red)' : undefined }}>{inr(openPast)}</b></div>
        <div><span>Not yet invoiced</span><b>{inr(F.reduce((s, m) => s + m.unraised, 0))}</b></div>
      </div>
      <div className="fc" role="img" aria-label={F.map(m => `${label(m.month)}: due ${inr(m.due)}, collected ${inr(m.collected)}`).join('; ')}>
        {F.map(m => (
          <div key={m.month} className={`fc-col${m.month === now ? ' now' : ''}`}>
            <div className="fc-bars">
              <div className="fc-due" style={{ height: `${(m.due / max) * 100}%` }}>
                {m.unraised > 0 && <i style={{ height: `${(m.unraised / Math.max(1, m.due)) * 100}%` }} />}
              </div>
              <div className="fc-got" style={{ height: `${(m.collected / max) * 100}%` }} />
            </div>
            <span className="fc-x">{label(m.month)}</span>
            <span className="fc-v">{m.due ? inrShort(m.due) : ''}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 18, fontSize: 12, marginTop: 12, color: 'var(--mut)' }}>
        <span><i className="fc-key" style={{ background: '#1E4FCC' }} /> Due (invoiced)</span>
        <span><i className="fc-key" style={{ background: '#A9C4F5' }} /> Due (not yet invoiced)</span>
        <span><i className="fc-key" style={{ background: '#10B981' }} /> Collected</span>
      </div>
    </div>
  );
}
