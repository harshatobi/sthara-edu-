'use client';

import { useMemo, useState } from 'react';
import { FirstAidKitIcon as FirstAidKit } from '@phosphor-icons/react/dist/ssr/FirstAidKit';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { HandHeartIcon as HandHeart } from '@phosphor-icons/react/dist/ssr/HandHeart';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { fmtDate } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { CardHead, DeskGate, Field, Kpi, Workspace } from './kit';
import DocumentsPanel from './students/DocumentsPanel';
import Requests from './students/Requests';
import HealthPanel from './students/HealthPanel';

interface Row { id: string; name: string; admissionNo: string; className: string | null; consent: boolean; hasLogin: boolean; bloodGroup: string | null; cwsn: boolean; alert: string | null; medicines: number }
interface Data {
  session: string; rows: Row[]; can: { manage: boolean }; settings: { retentionDays: number };
  counts: { students: number; consent: number; alerts: number; cwsn: number; noBloodGroup: number; schoolGives: number };
  requests: { id: string; studentId: string; student: string; admissionNo: string; proposed: any; note: string | null; createdAt: string; by: string }[];
}
type View = 'all' | 'alerts' | 'cwsn' | 'noconsent';

/** Admin › Health: the health officer's desk. */
export default function HealthPage() {
  return <DeskGate need="health.read">{() => <Health />}</DeskGate>;
}

function Health() {
  const { data, error, reload } = useGet<Data>('/api/admin/health');
  const { call } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const [view, setView] = useState<View>('alerts');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Row | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [days, setDays] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const rows = useMemo(() => (data?.rows ?? []).filter(r => (view === 'all' || (view === 'alerts' ? r.alert : view === 'cwsn' ? r.cwsn : !r.consent))
    && (!q || r.name.toLowerCase().includes(q.toLowerCase()) || r.admissionNo.toLowerCase().includes(q.toLowerCase()))).slice(0, 300), [data, view, q]);
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div aria-busy="true"><div className="kpis">{[0, 1, 2, 3].map(i => <div className="kpi" key={i}><Skeleton h={12} w={110} /><Skeleton h={40} w={80} style={{ marginTop: 12 }} /></div>)}</div></div>;
  const post = async (body: Record<string, unknown>, ok: string) => {
    setErr(null);
    try { await call('/api/admin/health', 'POST', body); toast(ok); reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  const C = data.counts;
  return (
    <>
      {toastEl}
      <PageBar eyebrow="HEALTH" title="Student health" sub={`Session ${data.session.replace('-', '–')}. Every look at a student's full record is recorded.`} />
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <Requests documentsOnly />
      <div className="kpis">
        <Kpi label="ALERTS" value={C.alerts} icon={Warning} valueColor={C.alerts ? 'var(--red)' : undefined} note="Shown to the class's teachers" onClick={() => setView('alerts')} />
        <Kpi label="SPECIAL NEEDS (CWSN)" value={C.cwsn} icon={HandHeart} note="For UDISE+ and support" onClick={() => setView('cwsn')} />
        <Kpi label="HEALTH CONSENT" value={`${C.consent} / ${C.students}`} icon={ShieldCheck} note="Parents give it on the portal" onClick={() => setView('noconsent')} />
        <Kpi label="SCHOOL GIVES MEDICINE" value={C.schoolGives} icon={FirstAidKit} note={`${C.noBloodGroup} without a blood group`} />
      </div>
      {data.requests.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <CardHead title="Changes parents have asked for" sub="Nothing changes until you apply it. A rejection needs a note, which the parent sees." />
          <div style={{ overflowX: 'auto' }}><table className="tbl">
            <thead><tr><th>Asked</th><th>Student</th><th>Proposed</th><th>Decision</th></tr></thead>
            <tbody>{data.requests.map(r => (
              <tr key={r.id}>
                <td>{fmtDate(r.createdAt)}<div className="muted" style={{ fontSize: 12 }}>{r.by}</div></td>
                <td><b>{r.student}</b><div className="muted" style={{ fontSize: 12 }}>{r.admissionNo}</div></td>
                <td style={{ fontSize: 13 }}>{[r.proposed.blood_group ? `Blood group ${r.proposed.blood_group}` : null,
                  r.proposed.allergies ? `Allergies: ${(r.proposed.allergies as { what: string }[]).map(a => a.what).join(', ') || 'none'}` : null,
                  r.proposed.conditions ? `Conditions: ${(r.proposed.conditions as { name: string }[]).map(c => c.name).join(', ') || 'none'}` : null,
                  r.proposed.medication ? `Medication: ${(r.proposed.medication as { name: string }[]).map(m => m.name).join(', ') || 'none'}` : null].filter(Boolean).join(' · ')}
                  {r.note && <div className="muted" style={{ fontSize: 12 }}>{r.note}</div>}</td>
                <td>{data.can.manage ? <div style={{ display: 'grid', gap: 6, minWidth: 200 }}>
                  <input className="cmp-in" placeholder="Note for the parent" aria-label="Note" value={notes[r.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} />
                  <div style={{ display: 'flex', gap: 6 }}><button className="btn sm pri" onClick={() => post({ action: 'decide', id: r.id, approve: true, note: notes[r.id] ?? '' }, 'Applied.')}>Apply</button>
                    <button className="btn sm" disabled={(notes[r.id] ?? '').trim().length < 3} onClick={() => post({ action: 'decide', id: r.id, approve: false, note: notes[r.id] ?? '' }, 'Rejected.')}>Reject</button></div>
                </div> : <span className="muted">Waiting</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Students" right={<div className="seg" role="group" aria-label="Show">{(['alerts', 'cwsn', 'noconsent', 'all'] as View[]).map(v => (
          <button key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'alerts' ? 'Alerts' : v === 'cwsn' ? 'Special needs' : v === 'noconsent' ? 'No consent' : 'Everyone'}</button>))}</div>} />
        <input className="cmp-in" style={{ marginBottom: 12, maxWidth: 320 }} placeholder="Name or admission number" aria-label="Search" value={q} onChange={e => setQ(e.target.value)} />
        {!rows.length ? <Empty icon={<FirstAidKit size={26} weight="duotone" />} title="No one here" /> : (
          <div style={{ overflowX: 'auto' }}><table className="tbl">
            <thead><tr><th>Student</th><th>Class</th><th>Blood group</th><th>Alert</th><th>Consent</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id} className="click" tabIndex={0} onClick={() => setOpen(r)} onKeyDown={e => { if (e.key === 'Enter') setOpen(r); }}>
                <td><b>{r.name}</b><div className="muted" style={{ fontSize: 12 }}>{r.admissionNo}</div></td>
                <td>{r.className ?? '—'}</td>
                <td>{r.bloodGroup ?? <span className="muted">Not known</span>}{r.cwsn && <> <Chip tone="p">CWSN</Chip></>}</td>
                <td style={{ fontSize: 13 }}>{r.alert ?? <span className="muted">None</span>}</td>
                <td>{r.consent ? <Chip tone="g">GIVEN</Chip> : <Chip tone="n">{r.hasLogin ? 'NOT YET' : 'NO LOGIN'}</Chip>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <div className="card">
        <CardHead title="Retention" sub="After a student leaves, care details and the timeline are erased after this many days (unless kept on request or under a legal hold). UDISE+ details stay with the register." />
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="DAYS AFTER LEAVING" htmlFor="h-days"><input id="h-days" className="cmp-in" inputMode="numeric" disabled={!data.can.manage} value={days || String(data.settings.retentionDays)} onChange={e => setDays(e.target.value)} /></Field>
          {data.can.manage && <button className="btn" disabled={!days || Number(days) === data.settings.retentionDays} onClick={() => post({ action: 'retention', days: Number(days) }, 'Saved.')}>Save</button>}
        </div>
      </div>
      {open && <Workspace title={open.name} sub={`${open.admissionNo}${open.className ? ` · ${open.className}` : ''}`} onClose={() => { setOpen(null); reload(); }} wide><HealthPanel studentId={open.id} /><h3 style={{ fontSize: 17, fontWeight: 800, margin: '22px 0 12px' }}>Documents</h3><DocumentsPanel studentId={open.id} /></Workspace>}
    </>
  );
}
