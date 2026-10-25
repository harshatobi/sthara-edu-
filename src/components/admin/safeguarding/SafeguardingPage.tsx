'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ShieldWarningIcon as ShieldWarning } from '@phosphor-icons/react/dist/ssr/ShieldWarning';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { fmtDate, isoDay } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { CP_STEPS, CP_STEP_LABEL, type CpStep } from '@/lib/conduct/rules';
import { CardHead, DeskGate, Field, Workspace } from '../kit';

interface CaseRow { id: string; student: string | null; className: string | null; summary: string; open: boolean; occurredAt: string; loggedBy: string | null; reported: boolean; steps: number }
interface CaseData {
  id: string; student: string | null; className: string | null; summary: string; details: string | null; location: string | null; open: boolean; occurredAt: string; loggedBy: string | null;
  steps: { id: string; kind: CpStep; onDate: string; ref: string | null; details: string | null; by: string | null }[]; reported: boolean; nudge: string | null;
}

/**
 * Admin › Safeguarding: child-protection cases for the Safeguarding lead (the principal while the school has none).
 * The steps record the POCSO report and how the parent was told; details are encrypted and every look recorded.
 */
export default function SafeguardingPage() {
  return <DeskGate>{() => <Body />}</DeskGate>;
}

function Body() {
  const params = useSearchParams();
  const { data, error, reload } = useGet<{ cases: CaseRow[]; lead: boolean }>('/api/admin/safeguarding');
  const [open, setOpen] = useState<string | null>(params.get('case'));
  return (
    <>
      <PageBar eyebrow="SAFEGUARDING" title="Child protection"
        sub="Cases teachers logged as child protection. Only you see them. Under POCSO, suspected abuse must be reported to the police (or the Special Juvenile Police Unit) or the Child Welfare Committee without delay; not reporting is an offence." />
      {error && <div className="card"><Empty icon={<ShieldWarning size={26} weight="duotone" />} title="Not for your role">{error}</Empty></div>}
      {data && !data.lead && <div className="note info" style={{ marginBottom: 16 }}>The school has no Safeguarding lead yet, so these come to you as principal. A school admin assigns one in Roles &amp; Access; from then on only the lead sees them.</div>}
      {!data && !error ? <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div> : data && (
        <div className="card">
          <CardHead title="Cases" sub="Open first." />
          {!data.cases.length ? <Empty icon={<ShieldWarning size={26} weight="duotone" />} title="No child-protection cases" /> : (
            <div style={{ overflowX: 'auto' }}><table className="tbl">
              <thead><tr><th>Logged</th><th>Student</th><th>Summary</th><th>Status</th><th /></tr></thead>
              <tbody>{data.cases.map(c => (
                <tr key={c.id}>
                  <td>{fmtDate(c.occurredAt.slice(0, 10))}<div className="muted" style={{ fontSize: 12 }}>{c.loggedBy ?? ''}</div></td>
                  <td><b>{c.student ?? 'No student named'}</b><div className="muted" style={{ fontSize: 12 }}>{c.className ?? ''}</div></td>
                  <td>{c.summary}</td>
                  <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Chip tone={c.open ? 'r' : 'n'}>{c.open ? 'OPEN' : 'CLOSED'}</Chip>{c.open && !c.reported && <Chip tone="a">NOT REPORTED</Chip>}</div></td>
                  <td><button className="btn sm" onClick={() => setOpen(c.id)}>Open</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}
      {open && <CaseWorkspace id={open} onClose={() => { setOpen(null); reload(); }} />}
    </>
  );
}

function CaseWorkspace({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error, reload } = useGet<CaseData>(`/api/admin/safeguarding?id=${id}`);
  const { call } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const [kind, setKind] = useState<CpStep>('note');
  const [onDate, setOnDate] = useState(isoDay());
  const [ref, setRef] = useState('');
  const [details, setDetails] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setErr(null);
    try { await call('/api/admin/safeguarding', 'POST', { action: 'step', id, kind, onDate, ref, details }); toast('Recorded.'); setDetails(''); setRef(''); setKind('note'); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  const steps = data?.open ? CP_STEPS : (['note'] as const);
  return (
    <Workspace wide title={data ? `Child protection: ${data.student ?? 'no student named'}` : 'Child protection'} sub={data ? `Logged ${fmtDate(data.occurredAt.slice(0, 10))}${data.loggedBy ? ` by ${data.loggedBy}` : ''} · ${data.open ? 'Open' : 'Closed'}` : undefined} onClose={onClose}>
      {toastEl}
      {error && <div className="note err" role="alert">{error}</div>}
      {!data ? [0, 1, 2].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />) : (
        <>
          {data.open && data.nudge && <div className="note err" style={{ marginBottom: 14 }}>{data.nudge}</div>}
          <div className="card" style={{ marginBottom: 14 }}>
            <CardHead title="As logged" />
            <p style={{ fontWeight: 700 }}>{data.summary}</p>
            {data.details && <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, marginTop: 6 }}>{data.details}</p>}
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{[data.className, data.location].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="card" style={{ marginBottom: 14 }}>
            <CardHead title="Steps" />
            {!data.steps.length ? <p className="muted" style={{ fontSize: 13.5 }}>Nothing recorded yet.</p> : data.steps.map(s => (
              <div key={s.id} className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 110 }} className="muted">{fmtDate(s.onDate)}</div>
                <div style={{ flex: 1 }}><b>{CP_STEP_LABEL[s.kind]}</b>{s.ref ? <span className="mono"> · {s.ref}</span> : ''}{s.details && <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, marginTop: 4 }}>{s.details}</div>}<div className="muted" style={{ fontSize: 12 }}>{s.by ?? ''}</div></div>
              </div>
            ))}
          </div>
          <div className="card">
            <CardHead title="Record a step" sub="Telling the parent happens in person or by phone; the portal never shows a child-protection case." />
            {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
            <div className="g2">
              <Field label="STEP" htmlFor="sg-kind"><select id="sg-kind" className="cmp-sel" value={kind} onChange={e => setKind(e.target.value as CpStep)}>{steps.map(k => <option key={k} value={k}>{CP_STEP_LABEL[k]}</option>)}</select></Field>
              <Field label="DATE" htmlFor="sg-date"><input id="sg-date" type="date" className="cmp-in" max={isoDay()} value={onDate} onChange={e => setOnDate(e.target.value)} /></Field>
            </div>
            {(kind === 'reported_police' || kind === 'reported_cwc' || kind === 'referred') && <Field label="REFERENCE (FIR, DD OR CWC NUMBER)" htmlFor="sg-ref"><input id="sg-ref" className="cmp-in" maxLength={80} value={ref} onChange={e => setRef(e.target.value)} /></Field>}
            <Field label={kind === 'closed' ? 'HOW THE CASE WAS CLOSED' : 'DETAILS'} htmlFor="sg-details"><textarea id="sg-details" className="cmp-in" rows={4} maxLength={8000} value={details} onChange={e => setDetails(e.target.value)} /></Field>
            <button className="btn pri" onClick={go}>Record</button>
          </div>
        </>
      )}
    </Workspace>
  );
}
