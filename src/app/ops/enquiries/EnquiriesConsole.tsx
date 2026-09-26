'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BuildingsIcon as Buildings } from '@phosphor-icons/react/dist/ssr/Buildings';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { downloadCsv, errText, fmtDateTime, num } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface Enquiry {
  id: string; name: string; email: string; school: string; role: string; phone: string | null; message: string;
  source_origin: string; status: string; note: string | null; created_at: string;
}
const ROLE: Record<string, string> = { 'school-leader': 'School leader', administrator: 'Administrator', teacher: 'Teacher', parent: 'Parent', other: 'Other' };
const STATUS: Record<string, { t: string; tone: Tone }> = {
  new: { t: 'New', tone: 'r' }, contacted: { t: 'Contacted', tone: 'a' }, qualified: { t: 'Qualified', tone: 'g' }, closed: { t: 'Closed', tone: 'n' }, spam: { t: 'Spam', tone: 'n' },
};
const VIEWS = [['open', 'Open'], ['new', 'New'], ['contacted', 'Contacted'], ['qualified', 'Qualified'], ['closed', 'Closed'], ['spam', 'Spam'], ['all', 'All']] as const;
type View = (typeof VIEWS)[number][0];
const inView = (e: Enquiry, v: View) => v === 'all' || (v === 'open' ? ['new', 'contacted', 'qualified'].includes(e.status) : e.status === v);

/** Platform Manager > Enquiries: the sales inbox from the contact form on www.sthara.in. */
export default function EnquiriesConsole() {
  const api = useOpsApi();
  const [rows, setRows] = useState<Enquiry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>('open');
  const [q, setQ] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [nonce, setNonce] = useState(0);
  const load = useCallback(() => setNonce(n => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    api<Enquiry[]>('/enquiries')
      .then(data => { if (!cancelled) { setRows(data); setErr(null); } })
      .catch(e => { if (!cancelled) { setErr(errText(e)); setRows([]); } });
    return () => { cancelled = true; };
  }, [api, nonce]);

  const update = async (id: string, body: { status?: string; note?: string }) => {
    try { await api('/enquiries', { method: 'PATCH', body: { id, ...body } }); load(); } catch (e) { setErr(errText(e)); }
  };
  const counts = useMemo(() => Object.fromEntries(VIEWS.map(([v]) => [v, (rows ?? []).filter(e => inView(e, v)).length])), [rows]);
  const needle = q.trim().toLowerCase();
  const shown = (rows ?? []).filter(r => inView(r, view) && (!needle || `${r.name} ${r.email} ${r.school} ${r.message}`.toLowerCase().includes(needle)));

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Enquiries"
        sub={rows ? `${counts.new} new · ${counts.open} open · ${num(rows.length)} in total · from the contact form on www.sthara.in` : 'Loading…'}
        actions={<button className="btn" disabled={!shown.length} onClick={() => downloadCsv(`sthara-enquiries-${new Date().toISOString().slice(0, 10)}.csv`,
          [['Received (IST)', 'Status', 'Name', 'Role', 'School', 'Email', 'Phone', 'Message', 'Note'], ...shown.map(r => [fmtDateTime(r.created_at), r.status, r.name, ROLE[r.role] ?? r.role, r.school, r.email, r.phone, r.message, r.note])])}>
          <DownloadSimple size={15} weight="bold" /> Export CSV
        </button>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}

      <div className="seg" role="tablist" aria-label="Pipeline stage" style={{ marginBottom: 14 }}>
        {VIEWS.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
            {l}{rows ? <span className="muted" style={{ marginLeft: 6, fontWeight: 600 }}>{counts[v]}</span> : null}
          </button>
        ))}
      </div>
      <div className="ops-filters">
        <input className="cmp-in" placeholder="Search name, email, school or message" aria-label="Search enquiries" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {!rows ? (
        <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={70} style={{ marginBottom: 12 }} />)}</div>
      ) : shown.length ? shown.map(r => (
        <div className="card" key={r.id} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 16 }}>{r.school || r.name}</b><Chip tone={STATUS[r.status]?.tone ?? 'n'}>{(STATUS[r.status]?.t ?? r.status).toUpperCase()}</Chip>
                <span className="muted" style={{ fontSize: 12.5 }}>{fmtDateTime(r.created_at)}</span>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {r.name} · {ROLE[r.role] ?? r.role} · <a href={`mailto:${r.email}`} style={{ color: 'var(--blue)' }}>{r.email}</a>{r.phone ? <> · <a href={`tel:${r.phone}`} style={{ color: 'var(--blue)' }}>{r.phone}</a></> : ''}
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 10, whiteSpace: 'pre-wrap' }}>{r.message}</p>
            </div>
            <div style={{ display: 'grid', gap: 8, width: 190 }}>
              <select className="cmp-sel" aria-label={`Stage of ${r.name}'s enquiry`} value={r.status} onChange={e => update(r.id, { status: e.target.value })}>
                {Object.entries(STATUS).map(([s, x]) => <option key={s} value={s}>{x.t}</option>)}
              </select>
              {r.status !== 'spam' && r.status !== 'closed' && (
                <Link className="btn sm pri" href={`/ops/schools?new=1&enquiry=${r.id}&name=${encodeURIComponent(r.school || '')}`}>
                  <Buildings size={13} weight="bold" /> Create school
                </Link>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <textarea className="cmp-in" rows={2} style={{ flex: '1 1 260px' }} aria-label="Internal note" placeholder="Internal note (not sent to the enquirer)"
              value={notes[r.id] ?? r.note ?? ''} maxLength={2000} onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} />
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={(notes[r.id] ?? r.note ?? '') === (r.note ?? '')} onClick={() => update(r.id, { note: notes[r.id] })}>Save note</button>
          </div>
        </div>
      )) : (
        <div className="card"><Empty icon={<EnvelopeSimple size={26} weight="duotone" />} title={rows.length ? 'Nothing in this stage' : 'No enquiries yet'}>
          Enquiries sent from the contact form on www.sthara.in appear here.
        </Empty></div>
      )}
    </>
  );
}
