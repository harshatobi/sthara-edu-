'use client';

import Link from 'next/link';
import { useState } from 'react';
import { HandHeartIcon as HandHeart } from '@phosphor-icons/react/dist/ssr/HandHeart';
import { LockKeyIcon as LockKey } from '@phosphor-icons/react/dist/ssr/LockKey';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { fmtDate, isoDay } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { CASE_LABEL, type CaseStatus, type ReferralStatus } from '@/lib/conduct/rules';
import { CardHead, DeskGate, Field, Workspace } from '../kit';

interface CaseRow { id: string; studentId: string; student: string; admissionNo: string; status: CaseStatus; openedOn: string; closedOn: string | null; sessions: number; lastSession: string | null; counsellor: string | null }
interface Referral { id: string; studentId: string; student: string; admissionNo: string; fromKind: string; from: string | null; reason: string; status: ReferralStatus; caseId: string | null; createdAt: string }
interface Data { referrals: Referral[] | null; cases: CaseRow[] | null; hasCounsellor: boolean; can: { notes: boolean; overview: boolean } }
const FROM: Record<string, string> = { teacher: 'Teacher', parent: 'Parent', office: 'Office' };

/**
 * Admin › Counselling. The counsellor: referrals, cases and session notes (every look recorded). The principal and
 * school admin: which students have counselling, its dates and status; never what was said.
 */
export default function CounsellingPage() {
  return <DeskGate need={['counselling.notes', 'counselling.overview']}>{() => <Body />}</DeskGate>;
}

function Body() {
  const { data, error, reload } = useGet<Data>('/api/admin/counselling');
  const [toast, toastEl] = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { call } = useAdminDesk();
  const counsellor = !!data?.can.notes;
  const fresh = (data?.referrals ?? []).filter(r => r.status === 'new');
  const post = async (body: Record<string, unknown>, msg: string) => {
    try { const r = await call<{ id?: string }>('/api/admin/counselling', 'POST', body); toast(msg); reload(); return r; }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not save.'); return null; }
  };
  return (
    <>
      {toastEl}
      <PageBar eyebrow="COUNSELLING" title="Counselling"
        sub={counsellor ? 'Referrals from teachers, parents and the office, your cases and session notes. Notes are encrypted and only counsellors read them; every look is recorded.' : 'Which students are seeing the counsellor, since when, and the status. What is said stays with the counsellor.'}
        actions={counsellor ? <button className="btn pri" onClick={() => setAdding(true)}><Plus size={16} weight="bold" /> Open a case</button> : undefined} />
      {error && <div className="note err" role="alert">{error}</div>}
      {data && !data.hasCounsellor && <div className="note info" style={{ marginBottom: 16 }}>No one holds the Counsellor role yet, so teachers and parents can&apos;t refer students. A school admin assigns it in Roles &amp; Access.</div>}
      {!data ? <div className="card">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div> : (
        <>
          {counsellor && (
            <div className="card" style={{ marginBottom: 18 }}>
              <CardHead title={`Referrals${fresh.length ? ` (${fresh.length} new)` : ''}`} sub="New ones first, and the last 90 days. The person who referred sees only that you have seen it." />
              {!data.referrals?.length ? <Empty icon={<HandHeart size={26} weight="duotone" />} title="No referrals" /> : (
                <div style={{ overflowX: 'auto' }}><table className="tbl"><tbody>{data.referrals.map(r => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.createdAt.slice(0, 10))}</td>
                    <td><b>{r.student}</b><div className="muted mono" style={{ fontSize: 12 }}>{r.admissionNo}</div></td>
                    <td style={{ maxWidth: 420 }}><div style={{ whiteSpace: 'pre-wrap' }}>{r.reason}</div><div className="muted" style={{ fontSize: 12 }}>{FROM[r.fromKind]}{r.from ? `: ${r.from}` : ''}</div></td>
                    <td>{r.status === 'new' ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn sm pri" onClick={async () => { const x = await post({ action: 'open', referralId: r.id }, 'Case opened.'); if (x?.id) setOpen(x.id); }}>Open a case</button>
                      <button className="btn sm" onClick={() => post({ action: 'seen', referralId: r.id }, 'Marked as seen.')}>Seen, no case</button>
                    </div> : r.caseId ? <button className="btn sm" onClick={() => setOpen(r.caseId)}>Open the case</button> : <Chip tone="n">SEEN</Chip>}</td>
                  </tr>
                ))}</tbody></table></div>
              )}
            </div>
          )}
          <div className="card">
            <CardHead title="Cases" sub={counsellor ? 'Ongoing first.' : 'Dates and status only.'} />
            {!data.cases?.length ? <Empty icon={<HandHeart size={26} weight="duotone" />} title="No cases yet" /> : (
              <div style={{ overflowX: 'auto' }}><table className="tbl">
                <thead><tr><th>Student</th><th>Since</th><th>Status</th><th>Sessions</th><th /></tr></thead>
                <tbody>{[...data.cases].sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open')).map(c => (
                  <tr key={c.id}>
                    <td><Link href={`/admin/students/${c.studentId}`}><b>{c.student}</b></Link><div className="muted mono" style={{ fontSize: 12 }}>{c.admissionNo}</div></td>
                    <td>{fmtDate(c.openedOn)}{c.closedOn ? ` to ${fmtDate(c.closedOn)}` : ''}</td>
                    <td><Chip tone={c.status === 'open' ? 'a' : 'n'}>{CASE_LABEL[c.status].toUpperCase()}</Chip></td>
                    <td>{c.sessions}{c.lastSession ? <span className="muted"> · last {fmtDate(c.lastSession)}</span> : ''}</td>
                    <td>{counsellor ? <button className="btn sm" onClick={() => setOpen(c.id)}>Open</button> : <LockKey size={16} aria-label="Notes are the counsellor's" />}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </>
      )}
      {open && <CaseWorkspace id={open} onClose={() => { setOpen(null); reload(); }} />}
      {adding && <NewCase onClose={() => setAdding(false)} onOpened={id => { setAdding(false); reload(); setOpen(id); }} />}
    </>
  );
}

interface CaseData { id: string; student: string; admissionNo: string; status: CaseStatus; openedOn: string; closedOn: string | null; notes: { id: string; onDate: string; text: string; by: string | null }[]; referrals: { id: string; fromKind: string; reason: string; createdAt: string }[] }

function CaseWorkspace({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error, reload } = useGet<CaseData>(`/api/admin/counselling?caseId=${id}`);
  const { call } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const [onDate, setOnDate] = useState(isoDay());
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const post = async (body: Record<string, unknown>, msg: string) => {
    setErr(null);
    try { await call('/api/admin/counselling', 'POST', { caseId: id, ...body }); toast(msg); reload(); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); return false; }
  };
  return (
    <Workspace wide title={data ? `Counselling: ${data.student}` : 'Counselling'} sub={data ? `${data.admissionNo} · since ${fmtDate(data.openedOn)} · ${CASE_LABEL[data.status]}` : undefined} onClose={onClose}
      actions={data ? <>
        {data.status === 'open' ? <>
          <button className="btn" onClick={() => post({ action: 'status', status: 'closed' }, 'Case closed.')}>Close the case</button>
          <button className="btn" onClick={() => post({ action: 'status', status: 'referred' }, 'Marked as referred outside.')}>Referred outside</button>
        </> : <button className="btn" onClick={() => post({ action: 'status', status: 'open' }, 'Case reopened.')}>Reopen</button>}
      </> : undefined}>
      {toastEl}
      {error && <div className="note err" role="alert">{error}</div>}
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {!data ? [0, 1, 2].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <CardHead title="Add a session note" sub="Notes can't be edited; add a later note to correct one. Who the student was referred to belongs here too." />
            <div className="g2"><Field label="SESSION DATE" htmlFor="cn-date"><input id="cn-date" type="date" className="cmp-in" max={isoDay()} value={onDate} onChange={e => setOnDate(e.target.value)} /></Field></div>
            <Field label="NOTE" htmlFor="cn-text"><textarea id="cn-text" className="cmp-in" rows={5} maxLength={8000} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
            <button className="btn pri" disabled={notes.trim().length < 3} onClick={async () => { if (await post({ action: 'note', onDate, notes }, 'Note saved.')) setNotes(''); }}>Save the note</button>
          </div>
          {data.notes.map(n => (
            <div className="card" key={n.id} style={{ marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{fmtDate(n.onDate)}{n.by ? ` · ${n.by}` : ''}</div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>{n.text}</div>
            </div>
          ))}
          {data.referrals.length > 0 && (
            <div className="card">
              <CardHead title="Referrals that led here" />
              {data.referrals.map(r => <p key={r.id} style={{ fontSize: 13.5, marginBottom: 8 }}><span className="muted">{fmtDate(r.createdAt.slice(0, 10))} · {FROM[r.fromKind]}:</span> {r.reason}</p>)}
            </div>
          )}
        </>
      )}
    </Workspace>
  );
}

function NewCase({ onClose, onOpened }: { onClose: () => void; onOpened: (id: string) => void }) {
  const { call } = useAdminDesk();
  const [q, setQ] = useState('');
  const found = useGet<{ students: { id: string; name: string; admissionNo: string }[] }>(q.trim().length >= 2 ? `/api/admin/counselling?q=${encodeURIComponent(q.trim())}` : null);
  const [err, setErr] = useState<string | null>(null);
  const go = async (studentId: string) => {
    setErr(null);
    try { const r = await call<{ id: string }>('/api/admin/counselling', 'POST', { action: 'open', studentId }); onOpened(r.id); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not open the case.'); }
  };
  return (
    <Workspace title="Open a case" sub="For a student who came to you directly. If they already have an ongoing case, it opens that one." onClose={onClose}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <Field label="STUDENT" htmlFor="nc-q"><input id="nc-q" className="cmp-in" value={q} placeholder="Name or admission no." onChange={e => setQ(e.target.value)} /></Field>
      {(found.data?.students ?? []).map(s => (
        <div className="row" key={s.id}><div style={{ flex: 1 }}><b>{s.name}</b> <span className="muted mono">{s.admissionNo}</span></div><button className="btn sm pri" onClick={() => go(s.id)}>Open</button></div>
      ))}
    </Workspace>
  );
}
