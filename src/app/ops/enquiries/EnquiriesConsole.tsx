'use client';

import { useCallback, useEffect, useState } from 'react';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { useOpsApi } from '../useOpsApi';
import OpsFrame from '../OpsFrame';

interface Enquiry {
  id: string; name: string; email: string; school: string; role: string; phone: string | null; message: string;
  source_origin: string; status: string; note: string | null; created_at: string;
}
const ROLE: Record<string, string> = { 'school-leader': 'School leader', administrator: 'Administrator', teacher: 'Teacher', parent: 'Parent', other: 'Other' };
const STATUS: Record<string, { t: string; tone: Tone }> = {
  new: { t: 'NEW', tone: 'r' }, contacted: { t: 'CONTACTED', tone: 'a' }, qualified: { t: 'QUALIFIED', tone: 'g' }, closed: { t: 'CLOSED', tone: 'n' }, spam: { t: 'SPAM', tone: 'n' },
};
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Website enquiries from www.sthara.in/contact, for the operator team to follow up. */
export default function EnquiriesConsole({ devPreview }: { devPreview: boolean }) {
  const api = useOpsApi();
  const [rows, setRows] = useState<Enquiry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [nonce, setNonce] = useState(0);
  const load = useCallback(() => setNonce(n => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    api<Enquiry[]>('/enquiries')
      .then(data => { if (!cancelled) { setRows(data); setErr(null); } })
      .catch((e: any) => { if (!cancelled) { setErr(e.message); setRows([]); } });
    return () => { cancelled = true; };
  }, [api, nonce]);

  const update = async (id: string, body: { status?: string; note?: string }) => {
    try { await api('/enquiries', { method: 'PATCH', body: { id, ...body } }); load(); } catch (e: any) { setErr(e.message); }
  };
  const shown = (rows || []).filter(r => filter === 'all' || !['closed', 'spam'].includes(r.status));
  const fresh = (rows || []).filter(r => r.status === 'new').length;

  return (
    <OpsFrame devPreview={devPreview}>
      <PageBar eyebrow="OPERATOR CONSOLE" title="Website enquiries"
        sub={rows ? `${fresh} new · ${rows.length} in total · from the contact form on www.sthara.in` : 'Loading…'}
        actions={<div className="seg" role="group" aria-label="Filter">
          <button className={filter === 'open' ? 'on' : ''} aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>Open</button>
          <button className={filter === 'all' ? 'on' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
        </div>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {!rows ? (
        <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={70} style={{ marginBottom: 12 }} />)}</div>
      ) : shown.length ? shown.map(r => (
        <div className="card" key={r.id} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 16 }}>{r.name}</b><Chip tone={STATUS[r.status]?.tone ?? 'n'}>{STATUS[r.status]?.t ?? r.status}</Chip>
                <span className="muted" style={{ fontSize: 12.5 }}>{when(r.created_at)}</span>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {ROLE[r.role] ?? r.role} · {r.school} · <a href={`mailto:${r.email}`} style={{ color: 'var(--blue)' }}>{r.email}</a>{r.phone ? ` · ${r.phone}` : ''}
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 10, whiteSpace: 'pre-wrap' }}>{r.message}</p>
            </div>
            <select className="cmp-sel" style={{ width: 160, padding: '9px 12px' }} aria-label={`Status of ${r.name}'s enquiry`} value={r.status}
              onChange={e => update(r.id, { status: e.target.value })}>
              {Object.keys(STATUS).map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input className="cmp-in" style={{ flex: 1 }} aria-label="Internal note" placeholder="Internal note (not sent to the enquirer)"
              value={notes[r.id] ?? r.note ?? ''} maxLength={2000} onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} />
            <button className="btn sm" disabled={(notes[r.id] ?? r.note ?? '') === (r.note ?? '')} onClick={() => update(r.id, { note: notes[r.id] })}>Save note</button>
          </div>
        </div>
      )) : (
        <div className="card"><Empty icon={<EnvelopeSimple size={26} weight="duotone" />} title={rows.length ? 'No open enquiries' : 'No enquiries yet'}>
          Enquiries sent from the contact form on www.sthara.in appear here.
        </Empty></div>
      )}
    </OpsFrame>
  );
}
