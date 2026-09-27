'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { UserPlusIcon as UserPlus } from '@phosphor-icons/react/dist/ssr/UserPlus';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { ReasonAction, downloadCsv, errText, fmtDateTime, plural } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface Person { role: string; name: string; email: string; className?: string; rollNo?: string; children?: string[] }
interface Req {
  id: string; school_id: string; school: string; schoolCode: string | null; kind: 'enrolment' | 'accounts';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'; people: Person[];
  options: { className?: string; rollNo?: string; studentEmail?: string | null; parentEmail?: string | null; billFees?: boolean };
  note: string | null; created_at: string; decided_at: string | null; decision_note: string | null;
  requestedByName: string | null; decidedByName: string | null;
  applicant: { name: string; grade: number; guardian_name: string | null; guardian_email: string | null; guardian_phone: string | null; stage: string } | null;
  result: Record<string, unknown> | null;
}
interface Issued { role: string; name: string; email: string; tempPassword?: string; linked?: boolean }
interface RowIssue { row: number; field: string; message: string }

const STATUS: Record<Req['status'], { t: string; tone: Tone }> = {
  pending: { t: 'WAITING', tone: 'a' }, approved: { t: 'CREATED', tone: 'g' }, rejected: { t: 'REJECTED', tone: 'r' }, cancelled: { t: 'WITHDRAWN', tone: 'n' },
};
const ROLE_TONE: Record<string, Tone> = { admin: 'r', teacher: 'b', student: 'g', parent: 'p' };

/**
 * Platform Manager > Requests: schools ask for logins (enrolments from admissions, and staff, students or parents),
 * and only operators create them. Approving makes the accounts and shows the temporary passwords once, to hand over.
 */
export default function RequestsConsole() {
  const api = useOpsApi();
  const school = useSearchParams().get('school') || '';
  const [rows, setRows] = useState<Req[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<'pending' | 'decided'>('pending');
  const [issued, setIssued] = useState<{ req: Req; list: Issued[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, { error: string; issues: RowIssue[] }>>({});
  const [nonce, setNonce] = useState(0);
  const load = useCallback(() => setNonce(n => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    api<{ requests: Req[] }>(`/requests${school ? `?school=${encodeURIComponent(school)}` : ''}`)
      .then(d => { if (!cancelled) { setRows(d.requests); setErr(null); } })
      .catch(e => { if (!cancelled) { setErr(errText(e)); setRows([]); } });
    return () => { cancelled = true; };
  }, [api, school, nonce]);

  const pending = useMemo(() => (rows ?? []).filter(r => r.status === 'pending'), [rows]);
  const decided = useMemo(() => (rows ?? []).filter(r => r.status !== 'pending'), [rows]);
  const shown = view === 'pending' ? pending : decided;

  const approve = async (r: Req) => {
    setBusy(r.id); setErr(null);
    setProblems(p => { const n = { ...p }; delete n[r.id]; return n; });
    try {
      const out = await api<{ issued: Issued[] }>('/requests', { method: 'PATCH', body: { id: r.id, decision: 'approve' } });
      setIssued({ req: r, list: out.issued });
      load();
    } catch (e) {
      const data = (e as { data?: { issues?: RowIssue[] } }).data;
      setProblems(p => ({ ...p, [r.id]: { error: errText(e), issues: data?.issues ?? [] } }));
    } finally { setBusy(null); }
  };

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Login requests"
        sub={rows ? `${plural(pending.length, 'request')} waiting${school && rows[0] ? ` from ${rows[0].school}` : ''} · Sthara creates every login, so schools ask here` : 'Loading…'}
        actions={school ? <Link className="btn" href="/ops/requests">All schools</Link> : undefined} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}

      {issued && (
        <div className="card" style={{ marginBottom: 18, borderLeft: '4px solid var(--green)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>Logins created for {issued.req.school}</h3>
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>The temporary passwords are shown once and not stored. Hand them to the school securely; each person sets their own on first sign-in{issued.req.schoolCode ? ` with school code ${issued.req.schoolCode}` : ''}.</p>
            </div>
            <button className="btn" onClick={() => downloadCsv(`sthara-logins-${issued.req.schoolCode ?? 'school'}-${new Date().toISOString().slice(0, 10)}.csv`,
              [['School code', 'Role', 'Name', 'Email', 'Temporary password'], ...issued.list.map(i => [issued.req.schoolCode, i.role, i.name, i.email, i.linked ? '(existing account, now linked)' : i.tempPassword])])}>
              <DownloadSimple size={15} weight="bold" /> Download CSV
            </button>
            <button className="btn" onClick={() => setIssued(null)}>Done</button>
          </div>
          {issued.list.map(i => (
            <div key={i.email} className="row">
              <Chip tone={ROLE_TONE[i.role] ?? 'n'}>{i.role.toUpperCase()}</Chip>
              <div style={{ flex: 1, minWidth: 0 }}><b>{i.name}</b> <span className="muted">{i.email}</span></div>
              {i.linked ? <span className="muted">Existing account, now linked</span> : <code className="mono" style={{ fontWeight: 700 }}>{i.tempPassword}</code>}
            </div>
          ))}
        </div>
      )}

      <div className="seg" role="tablist" aria-label="Requests" style={{ marginBottom: 14 }}>
        <button role="tab" aria-selected={view === 'pending'} className={view === 'pending' ? 'on' : ''} onClick={() => setView('pending')}>Waiting <span className="muted" style={{ marginLeft: 6 }}>{pending.length}</span></button>
        <button role="tab" aria-selected={view === 'decided'} className={view === 'decided' ? 'on' : ''} onClick={() => setView('decided')}>Decided <span className="muted" style={{ marginLeft: 6 }}>{decided.length}</span></button>
      </div>

      {!rows ? (
        <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={70} style={{ marginBottom: 12 }} />)}</div>
      ) : shown.length ? shown.map(r => (
        <div className="card" key={r.id} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Link href={`/ops/schools/${r.school_id}?tab=people`} style={{ fontWeight: 800, fontSize: 16 }}>{r.school}</Link>
                <Chip tone={STATUS[r.status].tone}>{STATUS[r.status].t}</Chip>
                <Chip tone="n">{r.kind === 'enrolment' ? 'ENROLMENT' : plural(r.people.length, 'LOGIN').toUpperCase()}</Chip>
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                Asked by {r.requestedByName ?? 'someone at the school'} · {fmtDateTime(r.created_at)}
                {r.decided_at && <> · {STATUS[r.status].t.toLowerCase()} {fmtDateTime(r.decided_at)}{r.decidedByName ? ` by ${r.decidedByName}` : ''}</>}
              </div>
              {r.note && <p style={{ fontSize: 13.5, marginTop: 8 }}>&ldquo;{r.note}&rdquo;</p>}
              {r.decision_note && <p style={{ fontSize: 13, marginTop: 6 }} className="muted">Decision note: &ldquo;{r.decision_note}&rdquo;</p>}
            </div>
            {r.status === 'pending' && (
              <div className="acts" style={{ alignItems: 'flex-start' }}>
                <button className="btn sm pri" disabled={busy === r.id} onClick={() => approve(r)}><Check size={13} weight="bold" /> {busy === r.id ? 'Creating…' : 'Approve and create'}</button>
                <ReasonAction label="Reject" danger confirm="Reject" placeholder="Why, for the school (they see this)"
                  run={async note => { await api('/requests', { method: 'PATCH', body: { id: r.id, decision: 'reject', note } }); load(); }} />
              </div>
            )}
          </div>

          {r.kind === 'enrolment' ? (
            <div className="row" style={{ marginTop: 8 }}>
              <Chip tone="g">STUDENT</Chip>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                <b>{r.applicant?.name ?? 'Applicant removed'}</b> <span className="muted">grade {r.applicant?.grade ?? '?'} · {r.options.className} · admission no. {r.options.rollNo}</span>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  Student login: {r.options.studentEmail || 'a school login ID'} · Parent: {r.applicant?.guardian_name ?? 'not named'}{(r.options.parentEmail || r.applicant?.guardian_email) ? ` (${r.options.parentEmail || r.applicant?.guardian_email})` : ', no email: no parent login'}
                  {r.options.billFees ? ' · bill the grade\'s instalments' : ''}
                </div>
              </div>
            </div>
          ) : r.people.map((p, i) => (
            <div key={i} className="row">
              <Chip tone={ROLE_TONE[p.role] ?? 'n'}>{p.role.toUpperCase()}</Chip>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                <b>{p.name}</b> <span className="muted">{p.email}</span>
                {(p.className || p.rollNo || p.children?.length) && <div className="muted" style={{ fontSize: 12.5 }}>
                  {[p.className, p.rollNo && `admission no. ${p.rollNo}`, p.children?.length && `children: ${p.children.join(', ')}`].filter(Boolean).join(' · ')}
                </div>}
                {problems[r.id]?.issues.filter(x => x.row === i + 1).map((x, k) => <div key={k} style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700 }}>{x.field}: {x.message}</div>)}
              </div>
            </div>
          ))}
          {problems[r.id] && <div className="note err" role="alert" style={{ marginTop: 10 }}>Nothing was created: {problems[r.id].error} Fix it with the school, or reject the request with a note.</div>}
        </div>
      )) : (
        <div className="card"><Empty icon={<UserPlus size={26} weight="duotone" />} title={view === 'pending' ? 'No requests waiting' : 'Nothing decided yet'}>
          When a school asks for logins (an enrolment from admissions, or staff, students and parents from its directory) it lands here.
        </Empty></div>
      )}
    </>
  );
}
