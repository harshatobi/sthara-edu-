'use client';

import { useState } from 'react';
import { CertificateIcon as Certificate } from '@phosphor-icons/react/dist/ssr/Certificate';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { HandPalmIcon as HandPalm } from '@phosphor-icons/react/dist/ssr/HandPalm';
import { Empty, Skeleton } from '@/components/canon/ui';
import { fmtDate } from '@/lib/admin/format';
import type { ReportCardSnapshot } from '@/lib/exams/card';
import { useApi } from '@/lib/exams/useApi';
import ReportCard, { printCards } from './ReportCard';
import '@/styles/exams.css';

interface MyCard {
  id: string; studentId: string; termId: string; termName: string; session: string; version: number; revised: boolean; revisionReason: string | null;
  publishedAt: string; held: boolean; snapshot: ReportCardSnapshot | null;
}

/**
 * Published report cards for a student or (with `childId`) one of a parent's children: the latest version of each
 * term, newest first, printable. A card the school is holding shows only that it is with the office.
 */
export default function Results({ childId, audience }: { childId?: string; audience: 'parent' | 'student' }) {
  const { data, error } = useApi<{ children: { id: string; name: string }[]; cards: MyCard[] }>('/api/me/report-cards');
  const [pick, setPick] = useState<string | null>(null);
  if (error) return <div className="note err" role="alert">Couldn&apos;t load report cards: {error}</div>;
  if (!data) return <div className="card" aria-busy="true">{[0, 1, 2].map(i => <Skeleton key={i} h={50} style={{ marginBottom: 12 }} />)}</div>;
  const who = childId ?? data.children[0]?.id;
  const cards = data.cards.filter(c => c.studentId === who);
  const card = cards.find(c => c.id === pick) ?? cards[0] ?? null;
  if (!card) {
    return (
      <div className="card"><Empty icon={<Certificate size={26} weight="duotone" />} title="No report cards yet">
        {audience === 'parent' ? 'Report cards appear here when the school publishes them. You are told on the app and on WhatsApp if you have linked it.' : 'Your report cards appear here when the school publishes them.'}
      </Empty></div>
    );
  }
  return (
    <>
      {cards.length > 1 && (
        <div className="tabs" role="tablist" aria-label="Report cards">
          {cards.map(c => <button key={c.id} role="tab" aria-selected={c.id === card.id} className={`tab${c.id === card.id ? ' on blue' : ''}`} onClick={() => setPick(c.id)}>{c.termName} {c.session}</button>)}
        </div>
      )}
      {card.held ? (
        <div className="card"><Empty icon={<HandPalm size={26} weight="duotone" />} title={`${card.termName} report card is with the school office`}>
          {audience === 'parent' ? 'The report card is ready. Please contact the school office to receive it. It appears here once the office releases it.' : 'Your report card is ready. The school office will share it.'}
        </Empty></div>
      ) : card.snapshot && <>
        <div className="sch-bar" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <span className="muted">Published {fmtDate(card.publishedAt.slice(0, 10))}{card.revised ? ` · revised (version ${card.version})` : ''}</span>
          <span style={{ flex: 1 }} />
          <button className="btn sm" onClick={printCards}><Printer size={14} weight="bold" /> Print or save as PDF</button>
        </div>
        {card.revised && card.revisionReason && <div className="note" style={{ marginBottom: 14 }}>The school revised this report card: {card.revisionReason}</div>}
        <ReportCard card={card.snapshot} doc={false} />
      </>}
      <div className="rc-print">{!card.held && card.snapshot && <ReportCard card={card.snapshot} />}</div>
    </>
  );
}
