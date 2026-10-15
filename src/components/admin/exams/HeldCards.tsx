'use client';

import { useState } from 'react';
import { HandPalmIcon as HandPalm } from '@phosphor-icons/react/dist/ssr/HandPalm';
import { Empty, Skeleton } from '@/components/canon/ui';
import { CardHead } from '@/components/admin/kit';
import { fmtDate, inr } from '@/lib/admin/format';
import { useApi } from '@/lib/exams/useApi';

interface Held { id: string; studentId: string; name: string; admissionNo: string | null; cls: string; term: string; session: string; version: number; reason: string | null; heldAt: string | null; overdue: number }

/**
 * Report cards the school is holding, for the fees office and the principal: who, why, what is still overdue, and
 * a release once it is settled (the family is told). Shows no marks.
 */
export default function HeldCards({ toast }: { toast: (m: string) => void }) {
  const { data, error, reload, call } = useApi<{ cards: Held[] }>('/api/admin/exams?held=1');
  const [busy, setBusy] = useState<string | null>(null);
  const release = async (c: Held) => {
    setBusy(c.id);
    try { await call('/api/admin/exams', 'POST', { action: 'release', cardId: c.id }); toast(`${c.name}'s ${c.term.toLowerCase()} card released. The family has been told.`); reload(); }
    catch (e: any) { toast(e.message); } finally { setBusy(null); }
  };
  if (error) return <div className="note err" role="alert">Couldn&apos;t load the held report cards: {error}</div>;
  if (!data) return <div className="card" aria-busy="true">{[0, 1, 2].map(i => <Skeleton key={i} h={44} style={{ marginBottom: 12 }} />)}</div>;
  const settled = data.cards.filter(c => c.overdue <= 0).length;
  return (
    <div className="card">
      <CardHead title="Report cards held" sub={data.cards.length ? `${data.cards.length} held${settled ? `; ${settled} of them now have nothing overdue and can be released` : ''}. Families see only that the card is with the office.` : 'Nothing is held.'} />
      {!data.cards.length ? <Empty icon={<HandPalm size={26} weight="duotone" />} title="No cards held">Cards are held when the school holds report cards for overdue fees, or when the principal holds one.</Empty> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Student</th><th>Class</th><th>Card</th><th>Why</th><th className="c">Overdue now</th><th>Held</th><th /></tr></thead>
          <tbody>{data.cards.map(c => (
            <tr key={c.id}>
              <td><b>{c.name}</b><div className="muted" style={{ fontSize: 12 }}>{c.admissionNo ?? ''}</div></td>
              <td>{c.cls}</td>
              <td>{c.term} {c.session}{c.version > 1 ? <span className="muted"> v{c.version}</span> : null}</td>
              <td className="muted">{c.reason ?? ''}</td>
              <td className="c">{c.overdue > 0 ? <span className="ex-pill r">{inr(c.overdue)}</span> : <span className="ex-pill g">SETTLED</span>}</td>
              <td className="muted">{c.heldAt ? fmtDate(c.heldAt.slice(0, 10), true) : ''}</td>
              <td><button className="btn sm" disabled={busy === c.id} onClick={() => release(c)}>Release</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
