'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { CurrencyInrIcon as CurrencyInr } from '@phosphor-icons/react/dist/ssr/CurrencyInr';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { MagnifyingGlassIcon as MagnifyingGlass } from '@phosphor-icons/react/dist/ssr/MagnifyingGlass';
import { ReceiptIcon as Receipt } from '@phosphor-icons/react/dist/ssr/Receipt';
import { Pager, usePaged } from '@/components/canon/Pager';
import { Bar, Chip, Empty, PageBar } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { familyBucket, PAY_MODES, type Family } from '@/lib/admin/fees';
import type { AdminDesk } from '@/lib/admin/desk';
import { ago, fmtDate, inr, inrShort, isoDay, plural } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { CardHead, DeskGate, Kpi, MissingNotice, downloadCsv } from '../kit';
import Counter from './Counter';
import FamilyLedger, { STATUS_CHIP } from './FamilyLedger';
import ReminderPanel from './ReminderPanel';
import StructureEditor from './StructureEditor';
import DayBook from './DayBook';
import Concessions from './Concessions';
import Forecast from './Forecast';

export function FinanceTabs() {
  const path = usePathname();
  const { desk } = useAdminDesk();
  const a = desk?.me.access;
  // Only worth a tab strip when this role sees both halves.
  if (!a?.can('fees.read') || !a.can('admissions.read')) return null;
  return (
    <div className="tabs" role="tablist" aria-label="Admissions and fees" style={{ marginBottom: 20 }}>
      <Link role="tab" aria-selected={path === '/admin/fees'} className={`tab${path === '/admin/fees' ? ' on' : ''}`} href="/admin/fees">Fees</Link>
      <Link role="tab" aria-selected={path === '/admin/admissions'} className={`tab${path === '/admin/admissions' ? ' on' : ''}`} href="/admin/admissions">Admissions</Link>
    </div>
  );
}

const FEE_TABS = [['counter', 'Counter'], ['ledger', 'Ledger'], ['daybook', 'Day book'], ['concessions', 'Concessions'], ['forecast', 'Forecast']] as const;
type FeeTab = typeof FEE_TABS[number][0];

const FEE_TABLES = ['fee_structures', 'fee_invoices', 'fee_payments', 'fee_reminders'];
type Filter = 'all' | 'overdue' | 'outstanding' | 'paid';

export default function FeesPage() {
  return <DeskGate full need="fees.read">{desk => <Fees desk={desk} />}</DeskGate>;
}

function Fees({ desk }: { desk: AdminDesk }) {
  const { call, reload } = useAdminDesk();
  const router = useRouter();
  const params = useSearchParams();
  const [toast, toastEl] = useToast();
  const L = desk.fees;
  const [filter, setFilter] = useState<Filter>(params.get('view') === 'overdue' ? 'overdue' : 'all');
  const [q, setQ] = useState('');
  const [bucket, setBucket] = useState<string | null>(null);
  const [editGrade, setEditGrade] = useState<number | null>(null);
  const [reminding, setReminding] = useState<Family[] | null>(null);
  const [raising, setRaising] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const a = desk.me.access;
  // Someone whose job is taking payments (no billing rights) starts at the counter; everyone else at the ledger.
  const home: FeeTab = a.can('fees.collect') && !a.can('fees.bill') ? 'counter' : 'ledger';
  const asked = params.get('tab') || '';
  const tab: FeeTab = (FEE_TABS.map(t => t[0]) as string[]).includes(asked) && (asked !== 'counter' || a.can('fees.collect')) ? asked as FeeTab : home;
  const setTab = (t: FeeTab) => router.replace(t === home ? '/admin/fees' : `/admin/fees?tab=${t}`, { scroll: false });
  const pendingConcessions = desk.concessions.filter(c => c.status === 'pending').length;
  const openDays = desk.dayBook.filter(d => d.receipts > 0 && d.close?.status !== 'closed' && d.day < isoDay()).length;
  const studentId = params.get('student');
  const family = studentId ? L.families.find(f => f.studentId === studentId) ?? null : null;
  const setStudent = useCallback((id: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (id) p.set('student', id); else p.delete('student');
    router.replace(`/admin/fees${p.toString() ? `?${p}` : ''}`, { scroll: false });
  }, [params, router]);

  const verified = useMemo(() => new Map(desk.students.map(s => [s.id, s.verifiedGuardians])), [desk.students]);
  const done = (msg: string) => { toast(msg); reload(); };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return L.families.filter(f => {
      if (filter === 'overdue' && !(f.overdue > 0)) return false;
      if (filter === 'outstanding' && !(f.outstanding > 0)) return false;
      if (filter === 'paid' && f.outstanding > 0) return false;
      if (bucket && !(f.outstanding > 0 && familyBucket(f) === bucket)) return false;
      return !needle || f.name.toLowerCase().includes(needle) || f.cls.toLowerCase().includes(needle);
    });
  }, [L.families, filter, q, bucket]);
  const { shown: shownRows, pager } = usePaged(rows, `${filter}|${q}|${bucket}`);

  const raise = async (no: number) => {
    setRaising(no); setErr(null);
    try { const r = await call('/api/admin/fees', 'POST', { action: 'raise', instalment: no }); done(r.raised ? `${plural(r.raised, 'invoice')} raised` : 'Everyone eligible is already invoiced'); }
    catch (e: any) { setErr(e.message); }
    finally { setRaising(null); }
  };

  const exportLedger = () => downloadCsv(`fee-ledger-${desk.session}-${isoDay()}.csv`, [
    ['Invoice', 'Student', 'Class', 'Instalment', 'Due on', 'Amount', 'Concession', 'Concession reason', 'Paid', 'Balance', 'Status', 'Days overdue'],
    ...L.invoices.map(i => {
      const s = desk.students.find(x => x.id === i.studentId);
      return [i.invoiceNo, s?.name ?? '', s?.cls ?? '', i.label, i.dueOn, i.amount, i.concession, i.concessionReason, i.paid, i.balance, i.status, i.daysOverdue];
    }),
    [],
    ['Receipt', 'Invoice', 'Student', 'Received on', 'Mode', 'Reference', 'Amount', 'Void', 'Void reason'],
    ...L.receipts.map(p => {
      const i = L.invoices.find(x => x.id === p.invoiceId);
      return [p.receiptNo, i?.invoiceNo ?? '', desk.students.find(x => x.id === p.studentId)?.name ?? '', p.paidOn, PAY_MODES[p.mode] || p.mode, p.reference, p.amount, p.voided ? 'yes' : '', p.voidReason];
    }),
  ]);

  const overdueFamilies = L.families.filter(f => f.overdue > 0);
  const maxAgeing = Math.max(1, ...L.ageing.map(b => b.amount));
  const oldestOpen = Math.max(0, ...L.families.map(f => f.maxDaysOverdue));
  const owing = L.families.filter(f => f.outstanding > 0).length;
  const name = (id: string) => desk.students.find(s => s.id === id)?.name ?? 'a student';
  const T = L.totals;

  return (
    <>
      {toastEl}
      <PageBar eyebrow="ADMISSIONS & FEES" title="Fee ledger"
        sub={`AY ${desk.session.replace('-', '–')} · ${plural(desk.students.length, 'student')} on roll · ${L.structures.length ? `${inrShort(L.totals.expectedAnnual)} expected this year` : 'no fees set yet'}`}
        actions={<>
          <button className="btn" onClick={exportLedger} disabled={!L.invoices.length}><DownloadSimple size={16} /> Export ledger</button>
          {a.can('fees.remind') && <button className="btn pri" disabled={!L.families.some(f => f.outstanding > 0)}
            onClick={() => setReminding((overdueFamilies.length ? overdueFamilies : L.families.filter(f => f.outstanding > 0)))}>
            {overdueFamilies.length ? `Stage ${plural(overdueFamilies.length, 'reminder')}` : 'Send reminders'}
          </button>}
        </>} />
      <FinanceTabs />
      <MissingNotice desk={desk} tables={FEE_TABLES} />
      {err && <div className="err" role="alert" style={{ marginBottom: 16 }}>{err}</div>}
      <div className="seg" role="tablist" aria-label="Fee views" style={{ marginBottom: 18 }}>
        {FEE_TABS.filter(([k]) => k !== 'counter' || a.can('fees.collect')).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}{k === 'concessions' && pendingConcessions ? ` · ${pendingConcessions}` : ''}{k === 'daybook' && openDays ? ` · ${openDays} open` : ''}
          </button>
        ))}
      </div>
      {tab === 'counter' && <Counter desk={desk} call={call} onDone={done} openAccount={setStudent}
        requestConcession={id => router.replace(`/admin/fees?tab=concessions&for=${id}`, { scroll: false })} />}
      {tab === 'daybook' && <DayBook desk={desk} call={call} onDone={done} />}
      {tab === 'concessions' && <Concessions desk={desk} call={call} onDone={done} forStudent={params.get('for')} openAccount={setStudent} />}
      {tab === 'forecast' && <Forecast desk={desk} />}
      {tab === 'ledger' && <>

      <div className="kpis">
        <Kpi label="BILLED SO FAR" value={<span className="num">{inrShort(T.billed)}</span>} small
          note={L.runs.length ? `${L.runs.filter(r => r.raised).length} of ${L.runs.length} instalments raised` : 'No instalments scheduled'} />
        <Kpi label="COLLECTED" value={<span className="num">{inrShort(T.collected)}</span>} small valueColor="var(--green)"
          note={T.collectionRate !== null ? `${T.collectionRate}% of what's been billed` : 'Nothing billed yet'} />
        <Kpi label="OUTSTANDING" value={<span className="num">{inrShort(T.outstanding)}</span>} small
          valueColor={T.overdue ? 'var(--red)' : undefined}
          note={!T.outstanding ? 'Nothing owed'
            : T.overdue >= T.outstanding ? `All past due · ${plural(T.familiesOverdue, 'family', 'families')}`
            : T.overdue ? `${inrShort(T.overdue)} past due · ${plural(T.familiesOverdue, 'family', 'families')}`
            : `None past due yet · ${plural(owing, 'family', 'families')}`}
          noteColor={T.overdue ? 'var(--red)' : 'var(--mut)'} onClick={() => setFilter('overdue')} />
        <Kpi label="PAID LATE BY" value={T.avgDaysLate === null ? 'None yet' : <span className="num">{T.avgDaysLate} d</span>} small={T.avgDaysLate === null}
          note={T.avgDaysLate === null ? 'Shows once instalments are paid'
            : `Average, on instalments already paid.${oldestOpen ? ` Oldest still open: ${oldestOpen} days.` : ''}`} />
      </div>

      <div className="card" id="structure" style={{ marginBottom: 22 }}>
        <CardHead title="Fee structure by grade" sub="Sets what each grade is billed this session, and in how many instalments." />
        {L.grades.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Grade</th><th className="c">Students</th><th className="r">Annual fee</th><th className="c">Instalments</th><th className="r">Expected</th><th /></tr></thead>
              <tbody>{L.grades.map(g => (
                <tr key={g.grade}>
                  <td><b>Grade {g.grade}</b>{g.structure?.note && <div className="muted" style={{ fontSize: 12 }}>{g.structure.note}</div>}</td>
                  <td className="c num">{g.students}</td>
                  <td className="r num"><b>{g.structure ? inr(g.structure.annualFee) : '—'}</b></td>
                  <td className="c">{g.structure ? g.structure.schedule.length : <Chip tone="a">NOT SET</Chip>}</td>
                  <td className="r num muted">{g.structure ? inr(g.expected) : '—'}</td>
                  <td className="r">{a.can('fees.bill') && <button className={`btn sm${g.structure ? '' : ' pri'}`} onClick={() => setEditGrade(g.grade)}>{g.structure ? 'Edit' : 'Set fee'}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty icon={<CurrencyInr size={26} weight="duotone" />} title="No students on roll yet">Students join through Admissions (Sthara creates their logins); their grades appear here to price.</Empty>}
      </div>

      {L.runs.length > 0 && (
        <div className="card" id="runs" style={{ marginBottom: 22 }}>
          <CardHead title="Instalments" sub="Raising an instalment creates a numbered invoice for every eligible student. Students already invoiced are skipped." />
          {L.runs.map(r => {
            const left = r.eligible - r.raised;
            return (
              <div className="row" key={r.no}>
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 14 }}>{r.label}</b>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Due {fmtDate(r.dueOn)} · {r.raised} of {r.eligible} invoiced
                    {r.raised > 0 && left > 0 && left <= 3 && <> · not yet billed: {r.missing.map(name).join(', ')}</>}</div>
                </div>
                <div style={{ width: 160 }}><Bar value={r.eligible ? (r.raised / r.eligible) * 100 : 0} color="var(--ink)" /></div>
                {left > 0 && !a.can('fees.bill') ? <Chip tone="a">{left} TO RAISE</Chip> : left > 0
                  ? <button className="btn sm pri" disabled={raising !== null} onClick={() => raise(r.no)}>{raising === r.no ? 'Raising…' : left <= 3 && r.raised > 0 ? `Bill ${r.missing.length === 1 ? name(r.missing[0]).split(' ')[0] : plural(left, 'student')}` : `Raise for ${plural(left, 'student')}`}</button>
                  : <Chip tone="g">ALL RAISED</Chip>}
              </div>
            );
          })}
        </div>
      )}

      <div className="g2" style={{ marginBottom: 22 }}>
        <div className="card" id="ageing">
          <CardHead title="Ageing" sub="Unpaid amounts by days past due. Each family is counted once, at its oldest unpaid instalment. Pick a row to list them." />
          {L.ageing.map(b => (
            <button key={b.key} className="row-btn" onClick={() => { setBucket(bucket === b.key ? null : b.key); setFilter('all'); document.getElementById('ledger')?.scrollIntoView({ behavior: 'smooth' }); }}
              aria-pressed={bucket === b.key} style={bucket === b.key ? { background: 'var(--pale)', borderRadius: 10 } : undefined}>
              <b style={{ flex: '0 0 100px', fontSize: 14 }}>{b.label}</b>
              <Bar value={(b.amount / maxAgeing) * 100} color={b.tone === 'r' ? '#E11D48' : b.tone === 'a' ? '#F59E0B' : '#10B981'} />
              <span className="muted num" style={{ width: 88, textAlign: 'right', fontSize: 13 }}>{plural(b.families, 'family', 'families')}</span>
              <b className="num" style={{ width: 84, textAlign: 'right', fontSize: 14.5 }}>{inrShort(b.amount)}</b>
            </button>
          ))}
          <div className="row" style={{ borderTop: '1px solid var(--line)', marginTop: 4 }}>
            <b style={{ flex: 1, fontSize: 14 }}>Total owed</b>
            <span className="muted num" style={{ width: 88, textAlign: 'right', fontSize: 13 }}>{plural(owing, 'family', 'families')}</span>
            <b className="num" style={{ width: 84, textAlign: 'right', fontSize: 14.5 }}>{inrShort(T.outstanding)}</b>
          </div>
          <div className="note" style={{ marginTop: 16 }}>Reminder tone is matched to each family&apos;s history: gentle for families who pay on time, firm for repeat late payers, final after 60 days.</div>
        </div>
        <div className="card">
          <CardHead title="Collections" sub="Receipts this session, by how families paid." />
          {L.byMode.length ? L.byMode.map(m => (
            <div className="row" key={m.mode}>
              <b style={{ flex: '0 0 120px', fontSize: 14 }}>{PAY_MODES[m.mode] || m.mode}</b>
              <Bar value={(m.amount / Math.max(1, L.totals.collected)) * 100} color="var(--ink)" />
              <span className="muted num" style={{ width: 70, textAlign: 'right', fontSize: 13 }}>{plural(m.count, 'receipt')}</span>
              <b className="num" style={{ width: 84, textAlign: 'right' }}>{inrShort(m.amount)}</b>
            </div>
          )) : <Empty icon={<Receipt size={26} weight="duotone" />} title="No receipts yet">Record a payment from a family&apos;s account to issue the first receipt.</Empty>}
          {L.receipts.length > 0 && (
            <>
              <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', margin: '18px 0 4px' }}>LATEST RECEIPTS</div>
              {L.receipts.filter(p => !p.voided).slice(0, 4).map(p => (
                <button key={p.id} className="row-btn" onClick={() => setStudent(p.studentId)}>
                  <span className="mono" style={{ fontSize: 12.5, flex: '0 0 150px' }}>{p.receiptNo}</span>
                  <span style={{ flex: 1, fontSize: 13.5 }}>{desk.students.find(s => s.id === p.studentId)?.name ?? 'Student'}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{ago(p.recordedAt)}</span>
                  <b className="num" style={{ width: 84, textAlign: 'right' }}>{inr(p.amount)}</b>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="card" id="ledger">
        <CardHead title="Family accounts" sub={bucket ? <>Balances {L.ageing.find(b => b.key === bucket)?.label.toLowerCase()} · <button className="lbl" style={{ color: 'var(--blue)', fontWeight: 700 }} onClick={() => setBucket(null)}>Show all</button></> : 'Pick a family to see invoices, record a payment or print a statement.'}
          right={<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <MagnifyingGlass size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--mut)' }} aria-hidden="true" />
              <input className="cmp-in" style={{ padding: '9px 12px 9px 34px', width: 210 }} placeholder="Search name or class" aria-label="Search families" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="seg" role="group" aria-label="Filter families">
              {(['all', 'overdue', 'outstanding', 'paid'] as Filter[]).map(f => (
                <button key={f} className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => { setFilter(f); setBucket(null); }}>{f[0].toUpperCase() + f.slice(1)}</button>
              ))}
            </div>
          </div>} />
        {rows.length ? (<>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Student</th><th className="r">Billed</th><th className="r">Paid</th><th className="r">Outstanding</th><th>Status</th><th>Last reminder</th></tr></thead>
              <tbody>{shownRows.map(f => {
                const worst = f.invoices.find(i => i.status === 'overdue') ?? f.invoices.find(i => i.status === 'partial' || i.status === 'due') ?? f.invoices[0];
                return (
                  <tr key={f.studentId} className="click" onClick={() => setStudent(f.studentId)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setStudent(f.studentId); }}>
                    <td><b style={{ fontSize: 14 }}>{f.name}</b><div className="muted" style={{ fontSize: 12 }}>{f.cls}</div></td>
                    <td className="r num">{inr(f.billed)}</td>
                    <td className="r num">{f.paid ? inr(f.paid) : <span className="muted">Nothing yet</span>}</td>
                    <td className="r num"><b style={{ color: f.overdue ? 'var(--red)' : undefined }}>{f.outstanding ? inr(f.outstanding) : <span className="muted" style={{ fontWeight: 400 }}>Clear</span>}</b></td>
                    <td>{f.maxDaysOverdue
                      ? <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13 }}>{plural(f.maxDaysOverdue, 'day')} overdue</span>
                      : worst && <Chip tone={STATUS_CHIP[worst.status].tone}>{STATUS_CHIP[worst.status].t}</Chip>}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{f.outstanding > 0
                      ? <>{f.lastReminderAt ? ago(f.lastReminderAt) : 'Never'}<div style={{ fontSize: 11.5 }}>Next tone: {f.tone}</div></>
                      : f.lastReminderAt ? ago(f.lastReminderAt) : ''}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <Pager {...pager} noun="families" />
        </>) : (
          <Empty icon={<Receipt size={26} weight="duotone" />} title={L.families.length ? 'No families match' : 'No invoices yet'}>
            {L.families.length ? 'Try another filter or search.' : L.structures.length ? 'Raise an instalment above to bill families for it.' : 'Set a fee structure for each grade, then raise the first instalment.'}
          </Empty>
        )}
      </div>

      </>}

      {editGrade !== null && (
        <StructureEditor grade={editGrade} session={desk.session} students={L.grades.find(g => g.grade === editGrade)?.students ?? 0}
          existing={L.structures.find(s => s.grade === editGrade) ?? null} onClose={() => setEditGrade(null)}
          onSave={async body => {
            const r = await call('/api/admin/fees', 'POST', { action: 'structure', ...body });
            setEditGrade(null);
            done(r.alreadyInvoiced ? `Grade ${body.grade} saved · ${plural(r.alreadyInvoiced, 'raised invoice')} unchanged` : `Grade ${body.grade} fee structure saved`);
          }} />
      )}
      {family && (
        <FamilyLedger family={family} school={desk.school.name} session={desk.session} call={call} access={a}
          pendingConcession={new Set(desk.concessions.filter(c => c.status === 'pending').map(c => c.invoiceId))}
          onChanged={done} onClose={() => setStudent(null)} onRemind={() => { setReminding([family]); setStudent(null); }} />
      )}
      {reminding && (
        <ReminderPanel families={reminding} school={desk.school.name} guardianCount={id => verified.get(id) ?? 0} call={call}
          onClose={() => setReminding(null)} onSent={msg => { setReminding(null); done(msg); }} />
      )}
    </>
  );
}

