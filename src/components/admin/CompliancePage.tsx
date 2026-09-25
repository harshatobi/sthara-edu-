'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { DatabaseIcon as Database } from '@phosphor-icons/react/dist/ssr/Database';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { Bar, Chip, Empty, PageBar, type Tone } from '@/components/canon/ui';
import type { AdminDesk } from '@/lib/admin/desk';
import { ago, fmtDate, isoDay, plural } from '@/lib/admin/format';
import { CardHead, DeskGate, Kpi, downloadCsv } from './kit';

export default function CompliancePage() {
  return <DeskGate need={['compliance.read', 'audit.read']}>{desk => <Compliance desk={desk} />}</DeskGate>;
}

/**
 * What Sthara holds and why, and the retention policy for each. Keep in step
 * with the schema when a new kind of personal data is added. Retention is
 * policy: end-of-period deletion isn't automated yet, and the page says so.
 */
const REGISTER: [string, string, string, Tone, string][] = [
  ['Academic records and grades', 'Needed to teach', 'Session + 7 years', 'g', 'OK'],
  ['TML diagnostics', 'Needed to teach', 'Session + 7 years', 'g', 'OK'],
  ['Wellness check-ins', "Parent's consent", 'Session + 1 year', 'a', 'CONSENT'],
  ['Journal entries', "Parent's consent", 'Session only', 'a', 'CONSENT'],
  ['AI tutor sessions', "Parent's consent", 'Session + 1 year', 'a', 'CONSENT'],
  ['Proctoring flags', "Parent's consent", '14-day working window', 'a', 'CONSENT'],
  ['Fee and payment records', 'Contract; required by law', '8 years', 'g', 'OK'],
  ['Admission enquiries', 'Pre-contract, for this intake', 'Intake + 1 year', 'g', 'OK'],
];

const ACCESS: [string, string, string, Tone][] = [
  ['Student', 'Their own records and journal', 'Own data', 'g'],
  ['Subject teacher', 'TML and work for classes they teach; wellness energy, never the journal unless shared', 'Their classes', 'b'],
  ['Parent', 'Verified children only; wellness as a fortnightly summary', 'Own children', 'b'],
  ['School admin', 'School-wide; wellness only as anonymised aggregates of 5 or more', 'School-wide', 'b'],
  ['Sthara staff', 'No access to school data from the product', 'None', 'n'],
];

function Compliance({ desk }: { desk: AdminDesk }) {
  const C = desk.compliance;
  const [table, setTable] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const tables = useMemo(() => [...new Set(C.audit.map(a => a.table))].sort(), [C.audit]);
  const audit = C.audit.filter(a => table === 'all' || a.table === table);
  const minConsent = Math.min(...C.consents.map(c => c.coverage ?? 0));

  const a = desk.me.access;
  const exportAudit = () => downloadCsv(`audit-trail-${isoDay()}.csv`, [
    ['When', 'Who', 'Role', 'Record', 'Action', 'What changed'],
    ...C.audit.map(a => [a.at, a.actor, a.actorRole, a.table, a.action, a.summary]),
  ]);

  return (
    <>
      <PageBar eyebrow="DPDP & COMPLIANCE" title="Data protection register"
        sub={`Digital Personal Data Protection Act · minors' data · ${plural(desk.students.length, 'student record')}`}
        actions={<>
          <Chip tone={C.flags.length ? 'a' : 'g'}>{C.flags.length ? `${plural(C.flags.length, 'OPEN ITEM')}`.toUpperCase() : 'NO OPEN ITEMS'}</Chip>
          {a.can('audit.read') && <button className="btn" onClick={exportAudit} disabled={!C.audit.length}><DownloadSimple size={16} /> Download audit trail</button>}
        </>} />

      {a.can('compliance.read') && <>
      <div className="kpis">
        <Kpi label="LOWEST CONSENT COVERAGE" value={`${minConsent}%`} icon={ShieldCheck} valueColor={minConsent < 100 ? 'var(--amber)' : 'var(--green)'}
          note={minConsent < 100 ? `${C.consents.find(c => (c.coverage ?? 0) === minConsent)?.label}` : 'Every purpose covered'} />
        <Kpi label="VERIFIED PARENT LINKED" value={C.guardianCoverage !== null ? `${C.guardianCoverage}%` : '—'} icon={UsersThree}
          valueColor={C.guardianCoverage !== null && C.guardianCoverage < 100 ? 'var(--amber)' : 'var(--green)'}
          note={C.studentsWithoutGuardian.length ? `${plural(C.studentsWithoutGuardian.length, 'student')} without one` : 'Every student'} href="/admin/directory" />
        <Kpi label="DATA RESIDENCY" value="India" small icon={Database} note="Stored in Mumbai (AWS ap-south-1)" />
        <Kpi label="OPEN FLAGS" value={C.flags.length} icon={Warning} valueColor={C.flags.length ? 'var(--amber)' : 'var(--green)'}
          note={C.flags[0]?.title ?? 'Nothing open'} noteColor={C.flags.length ? 'var(--amber)' : 'var(--mut)'} />
      </div>

      {C.flags.map(f => (
        <div className="card" key={f.key} style={{ borderLeft: `4px solid ${f.tone === 'r' ? 'var(--red)' : 'var(--amber)'}`, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="av" style={{ background: f.tone === 'r' ? '#FFE4EA' : '#FEF3C7', color: f.tone === 'r' ? 'var(--red)' : '#92600A', width: 46, height: 46 }} aria-hidden="true"><Warning size={22} weight="fill" /></div>
            <div style={{ flex: 1, minWidth: 280 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>{f.title}</h3>
              <p className="muted" style={{ marginTop: 6, lineHeight: 1.7, fontSize: 14 }}>{f.detail}</p>
            </div>
            {f.href.startsWith('/admin/compliance')
              ? <a className="btn sm" href={f.href.slice('/admin/compliance'.length)}>See coverage <ArrowRight size={13} weight="bold" /></a>
              : <Link className="btn sm" href={f.href}>{f.href.startsWith('/admin/directory') ? 'Link parents' : 'Open'} <ArrowRight size={13} weight="bold" /></Link>}
          </div>
        </div>
      ))}

      <div className="g2" style={{ marginTop: C.flags.length ? 8 : 0, marginBottom: 18 }}>
        <div className="card" id="consent">
          <CardHead title="Consent by purpose" sub="Given or withdrawn by a verified parent from their own account. Every change is audited." />
          {C.consents.map(c => (
            <div key={c.type} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                <div><b style={{ fontSize: 14 }}>{c.label}</b><div className="muted" style={{ fontSize: 12 }}>{c.purpose}</div></div>
                <div style={{ textAlign: 'right' }}><b className="num">{c.granted}/{desk.students.length}</b>{c.revoked ? <div className="muted" style={{ fontSize: 11.5 }}>{c.revoked} withdrawn</div> : null}</div>
              </div>
              <Bar value={c.coverage ?? 0} color={(c.coverage ?? 0) >= 100 ? '#10B981' : (c.coverage ?? 0) >= 60 ? '#F5B60B' : '#E11D48'} />
            </div>
          ))}
          {C.studentsWithoutGuardian.length > 0 && (
            <div className="note" style={{ marginTop: 8 }}>
              <b>{plural(C.studentsWithoutGuardian.length, 'student')} can&apos;t be consented for yet</b> because no verified parent is linked:
              {' '}{C.studentsWithoutGuardian.slice(0, 5).map(s => s.name).join(', ')}{C.studentsWithoutGuardian.length > 5 ? '…' : ''}.
            </div>
          )}
        </div>
        <div className="card">
          <CardHead title="Who can see what" sub="Enforced by row-level security in the database, not only by the app's screens." />
          {ACCESS.map(([w, s, lv, c]) => (
            <div className="row" key={w}><div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{w}</div><div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{s}</div></div><Chip tone={c}>{lv.toUpperCase()}</Chip></div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Data we hold, and why" sub="The school's register of personal data processed through Sthara. Retention periods are policy: deletion at the end of a period is carried out on request and isn't automated yet." />
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Data</th><th>Lawful basis</th><th>Retention policy</th><th className="c">Status</th></tr></thead>
            <tbody>{REGISTER.map(([d, b, r, tone, t]) => (
              <tr key={d}><td><b>{d}</b></td><td>{b}</td><td className="muted">{r}</td><td className="c"><Chip tone={tone}>{t}</Chip></td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      </>}

      {a.can('audit.read') && <div className="card" id="audit">
        <CardHead title="Audit trail" sub="Grades, roles, consent, guardians, fees, admissions, leave and filings. Nobody can edit or delete these entries."
          right={tables.length > 1 && (
            <select className="cmp-sel" style={{ width: 200, padding: '9px 12px' }} aria-label="Filter by record type" value={table} onChange={e => setTable(e.target.value)}>
              <option value="all">All records</option>
              {tables.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )} />
        {audit.length ? (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>When</th><th>What</th><th>Who</th><th>Record</th></tr></thead>
                <tbody>{(showAll ? audit : audit.slice(0, 15)).map(a => (
                  <tr key={a.id}>
                    <td className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }} title={a.at}>{fmtDate(a.at)} · {ago(a.at)}</td>
                    <td><b style={{ fontSize: 13.5 }}>{a.summary}</b></td>
                    <td style={{ fontSize: 13 }}>{a.actor}{a.actorRole && a.actorRole !== 'server' ? <span className="muted"> · {a.actorRole}</span> : null}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{a.table}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {audit.length > 15 && <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show all ${audit.length}`}</button>}
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Showing the latest {Math.min(300, C.audit.length)} entries. The download includes the same set.</p>
          </>
        ) : (
          <Empty icon={<ClockCounterClockwise size={26} weight="duotone" />} title="No audited changes yet">Changes to grades, roles, consent, fees and the rest appear here as they happen.</Empty>
        )}
      </div>}
      {a.can('compliance.read') && !C.flags.length && (
        <div className="note" style={{ marginTop: 18, background: '#F0FDF7', borderLeftColor: 'var(--green)', color: '#0B7A54', display: 'flex', gap: 8 }}>
          <CheckCircle size={18} weight="fill" /> No open compliance items.
        </div>
      )}
    </>
  );
}
