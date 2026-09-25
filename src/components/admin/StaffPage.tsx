'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { NotePencilIcon as NotePencil } from '@phosphor-icons/react/dist/ssr/NotePencil';
import { CalendarBlankIcon as CalendarBlank } from '@phosphor-icons/react/dist/ssr/CalendarBlank';
import { HourglassIcon as Hourglass } from '@phosphor-icons/react/dist/ssr/Hourglass';
import { ChalkboardTeacherIcon as ChalkboardTeacher } from '@phosphor-icons/react/dist/ssr/ChalkboardTeacher';
import { UserPlusIcon as UserPlus } from '@phosphor-icons/react/dist/ssr/UserPlus';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { Chip, Empty, PageBar, hmColor, type Tone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { LEAVE_TYPES, subjectName, subjectKey, type AdminDesk, type LeaveRow, type TeacherRow } from '@/lib/admin/desk';
import { ago, daysBetween, fmtDate, isoDay, plural } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { CardHead, DeskGate, Field, Kpi, MissingNotice, Workspace, downloadCsv } from './kit';
import { BALANCE_TYPES, DEFAULT_POLICY, type Balance } from '@/lib/admin/leave';

const ACTIVITY: Record<TeacherRow['activity'], { t: string; tone: Tone }> = {
  high: { t: 'HIGH', tone: 'g' }, medium: { t: 'SOME', tone: 'a' }, none: { t: 'NONE', tone: 'r' },
};
const LEAVE_CHIP: Record<LeaveRow['status'], { t: string; tone: Tone }> = {
  pending: { t: 'PENDING', tone: 'a' }, approved: { t: 'APPROVED', tone: 'g' }, rejected: { t: 'REJECTED', tone: 'r' }, cancelled: { t: 'WITHDRAWN', tone: 'n' },
};

export default function StaffPage() {
  return <DeskGate need="workforce.read">{desk => <Staff desk={desk} />}</DeskGate>;
}

const range = (l: LeaveRow) => `${fmtDate(l.from, true)}${l.to !== l.from ? ` to ${fmtDate(l.to, true)}` : ''}${l.halfDay ? ' (half day)' : ''}`;

function Staff({ desk }: { desk: AdminDesk }) {
  const { call, reload } = useAdminDesk();
  const router = useRouter();
  const params = useSearchParams();
  const [toast, toastEl] = useToast();
  const wf = desk.workforce;
  const selected = wf.teachers.find(t => t.id === params.get('teacher')) ?? null;
  const [showAll, setShowAll] = useState(false);

  // The canon "three signals correlate" call-out, only when the data actually shows it.
  const concern = wf.teachers
    .filter(t => (t.delta ?? 0) < 0 && (t.activity === 'none' || t.backlog >= 10))
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0];

  const exportCsv = () => downloadCsv(`workforce-${isoDay()}.csv`, [
    ['Teacher', 'Email', 'Classes', 'Subjects', 'Students', 'Class TML (%)', 'TML 14 days ago (%)', 'Change', 'Grading backlog', 'Oldest pending (days)',
      'Work posted (30d)', 'Lessons planned (30d)', 'Grades confirmed (30d)', 'Last active'],
    ...wf.teachers.map(t => [t.name, t.email, t.classes.join(' / '), t.subjects.join(' / '), t.students, t.tml, t.before, t.delta, t.backlog, t.oldestPendingDays,
      t.posted30, t.lessons30, t.graded30, t.lastActive?.slice(0, 10) ?? '']),
    [],
    ['Leave', 'Type', 'From', 'To', 'Days', 'Status', 'Reason', 'Decided by', 'Decision note'],
    ...wf.leave.map(l => [l.staffName, LEAVE_TYPES[l.type] || l.type, l.from, l.to, l.days, l.status, l.reason, l.decidedBy, l.note]),
  ]);

  const history = wf.leave.filter(l => l.status !== 'pending');

  return (
    <>
      {toastEl}
      <PageBar eyebrow="STAFF & LEAVE" title="Workforce"
        sub={`${plural(wf.teachers.length, 'teacher')} · ${plural(wf.admins.length, 'admin')}${wf.ratio ? ` · 1:${wf.ratio} student-teacher ratio` : ''}`}
        actions={<>
          <button className="btn" onClick={exportCsv}><DownloadSimple size={16} /> Export</button>
          <Link className="btn pri" href="/admin/directory"><UserPlus size={16} weight="bold" /> Add staff</Link>
        </>} />
      <MissingNotice desk={desk} tables={['leave_requests', 'lesson_plans']} />

      <div className="kpis">
        <Kpi label="ACTIVE ON STHARA" value={wf.activeShare !== null ? `${wf.activeShare}%` : '—'} icon={ChalkboardTeacher}
          valueColor={wf.activeShare !== null && wf.activeShare < 70 ? 'var(--amber)' : undefined}
          note={`${wf.teachers.filter(t => t.activity === 'none').length} with no activity in 30 days`} />
        <Kpi label="GRADING BACKLOG" value={wf.backlog} icon={NotePencil} valueColor={wf.backlog > 30 ? 'var(--red)' : wf.backlog ? 'var(--amber)' : 'var(--green)'}
          note={wf.backlog ? 'Submissions waiting for a teacher to confirm' : 'Every submission is graded'} />
        <Kpi label="ON LEAVE TODAY" value={wf.onLeaveToday.length} icon={CalendarBlank}
          note={wf.onLeaveToday.length ? wf.onLeaveToday.map(l => l.staffName.split(' ')[0]).join(', ') : 'Everyone is in'} />
        <Kpi label="LEAVE REQUESTS" value={wf.pendingLeave.length} icon={Hourglass} valueColor={wf.pendingLeave.length ? 'var(--amber)' : 'var(--green)'}
          note={wf.pendingLeave.length ? 'Awaiting your decision' : 'None pending'} noteColor={wf.pendingLeave.length ? 'var(--amber)' : 'var(--mut)'}
          onClick={() => document.getElementById('leave')?.scrollIntoView({ behavior: 'smooth' })} />
      </div>

      <div className="card" id="leave" style={{ marginBottom: 22 }}>
        <CardHead title="Leave requests" sub="Teachers apply from their own desk. A rejection needs a reason; the teacher is notified either way." />
        {wf.pendingLeave.length ? wf.pendingLeave.map(l => (
          <PendingLeave key={l.id} l={l} teacher={wf.teachers.find(t => t.id === l.staffId)} canDecide={desk.me.access.can('leave.approve')}
            balance={wf.balances[l.staffId]?.find(b => b.type === l.type)}
            onDecide={async (decision, note, override) => {
            await call('/api/admin/leave', 'PATCH', { id: l.id, decision, note, override });
            toast(decision === 'approve' ? `Leave approved for ${l.staffName}` : `Leave not approved for ${l.staffName}`);
            reload();
          }} />
        )) : <p className="muted" style={{ fontSize: 13.5, marginBottom: history.length ? 12 : 0 }}>No requests waiting.</p>}
        {history.length > 0 && (
          <>
            <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', margin: '16px 0 4px' }}>DECIDED THIS SESSION</div>
            {(showAll ? history : history.slice(0, 5)).map(l => (
              <div className="row" key={l.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{l.staffName} · {LEAVE_TYPES[l.type] || l.type}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{range(l)} · {plural(l.days, 'day')}{l.decidedBy ? ` · ${l.decidedBy}` : ''}{l.note ? ` · "${l.note}"` : ''}</div>
                </div>
                <Chip tone={LEAVE_CHIP[l.status].tone}>{LEAVE_CHIP[l.status].t}</Chip>
              </div>
            ))}
            {history.length > 5 && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show all ${history.length}`}</button>}
          </>
        )}
      </div>

      <LeavePolicy desk={desk} />

      <div className="card">
        <CardHead title="Teacher effectiveness" sub="Class TML is scored only on the subjects each teacher teaches that class. Activity counts work posted, lessons planned and grades confirmed in the last 30 days." />
        {wf.teachers.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Teacher</th><th>Teaches</th><th className="c">Students</th><th className="c">Class TML</th><th className="c">Δ fortnight</th><th className="c">Activity</th><th className="c">Grading backlog</th></tr></thead>
              <tbody>{wf.teachers.map(t => (
                <tr key={t.id} className="click" tabIndex={0} onClick={() => router.replace(`/admin/staff?teacher=${t.id}`, { scroll: false })}
                  onKeyDown={e => { if (e.key === 'Enter') router.replace(`/admin/staff?teacher=${t.id}`, { scroll: false }); }}>
                  <td><div className="who"><span className="ic" aria-hidden="true"><ChalkboardTeacher size={17} weight="duotone" /></span>
                    <div><b style={{ fontSize: 14 }}>{t.name}</b>{t.onLeaveToday && <div style={{ fontSize: 11.5, color: 'var(--amber)', fontWeight: 700 }}>On leave today</div>}</div></div></td>
                  <td style={{ fontSize: 13 }}>{t.scope.length ? t.scope.map(e => `${e.cls}${e.subject ? ` ${subjectName(subjectKey(e.subject))}` : ''}`).join(', ') : <span className="muted">No classes assigned</span>}</td>
                  <td className="c num">{t.students}</td>
                  <td className="c">{t.tml !== null ? <b style={{ color: hmColor(t.tml), fontSize: 16 }}>{t.tml}%</b> : <span className="muted">—</span>}</td>
                  <td className="c">{t.delta !== null ? <Chip tone={t.delta > 0 ? 'g' : t.delta < 0 ? 'r' : 'n'}>{t.delta > 0 ? '+' : t.delta < 0 ? '−' : ''}{Math.abs(t.delta)} PTS</Chip> : <span className="muted">—</span>}</td>
                  <td className="c"><Chip tone={ACTIVITY[t.activity].tone}>{ACTIVITY[t.activity].t}</Chip></td>
                  <td className="c"><b className="num" style={{ color: t.backlog > 30 ? 'var(--red)' : t.backlog > 10 ? 'var(--amber)' : 'var(--green)', fontSize: 15 }}>{t.backlog}</b>
                    {t.oldestPendingDays ? <div className="muted" style={{ fontSize: 11.5 }}>oldest {t.oldestPendingDays} d</div> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty icon={<UsersThree size={26} weight="duotone" />} title="No teachers yet">Add teachers in the user directory and assign their classes and subjects.</Empty>}
        {concern && (
          <div className="note" style={{ marginTop: 18 }}>
            <b>{concern.name}</b>: class TML down {Math.abs(concern.delta!)} points in a fortnight
            {concern.activity === 'none' ? ', no activity on Sthara in 30 days' : ''}{concern.backlog >= 10 ? `, ${concern.backlog} submissions waiting to be graded` : ''}.
            Worth a conversation before it shows up in results.
          </div>
        )}
      </div>

      {selected && <TeacherDetail t={selected} desk={desk} onClose={() => router.replace('/admin/staff', { scroll: false })} />}
    </>
  );
}

function PendingLeave({ l, teacher, balance, canDecide, onDecide }: {
  l: LeaveRow; teacher?: TeacherRow; balance?: Balance; canDecide: boolean;
  onDecide: (d: 'approve' | 'reject', note: string, override?: boolean) => Promise<void>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lead = daysBetween(isoDay(), l.from);
  const starts = lead <= 0 ? 'already started' : lead === 1 ? 'starts tomorrow' : `starts in ${lead} days`;
  // Balance before this request (its own days are already counted as pending).
  const leftAfter = balance && balance.entitled !== null ? balance.left! : null;
  const go = async (d: 'approve' | 'reject', override?: boolean) => {
    setBusy(true); setErr(null);
    try { await onDecide(d, note, override); }
    catch (e: any) {
      if (d === 'approve' && !override && /left this session/.test(e.message)) setOver(e.message);
      else setErr(e.message);
      setBusy(false);
    }
  };
  return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '14px 0' }}>
      <div className="row" style={{ padding: 0, border: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{l.staffName} · {LEAVE_TYPES[l.type] || l.type}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {range(l)} · {plural(l.days, 'day')} · {starts}{teacher?.classes.length ? ` · covers ${teacher.classes.join(', ')}` : ''}
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }}>&ldquo;{l.reason}&rdquo;</div>
          {leftAfter !== null && (
            <div style={{ fontSize: 12, marginTop: 4, color: leftAfter < 0 ? 'var(--red)' : 'var(--mut)', fontWeight: 600 }}>
              {leftAfter < 0 ? `${Math.abs(leftAfter)} day${Math.abs(leftAfter) === 1 ? '' : 's'} beyond entitlement` : `${leftAfter} ${balance!.label.toLowerCase()} left after this`} ({balance!.entitled} a year, {balance!.used} taken)
            </div>
          )}
        </div>
        {canDecide && !rejecting && !over && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" disabled={busy} onClick={() => setRejecting(true)}>Reject</button>
            <button className="btn sm pri" disabled={busy} onClick={() => go('approve')}>{busy ? 'Saving…' : 'Approve'}</button>
          </div>
        )}
      </div>
      {rejecting && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <input className="cmp-in" style={{ flex: 1, minWidth: 220 }} aria-label="Reason the teacher will see" placeholder="Reason the teacher will see" value={note} autoFocus maxLength={1000} onChange={e => setNote(e.target.value)} />
          <button className="btn sm" onClick={() => { setRejecting(false); setNote(''); }}>Cancel</button>
          <button className="btn sm red" disabled={busy || !note.trim()} onClick={() => go('reject')}>Confirm reject</button>
        </div>
      )}
      {over && (
        <div className="note" style={{ marginTop: 10 }}>
          <b>Beyond entitlement.</b> {over}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <input className="cmp-in" style={{ flex: 1, minWidth: 220 }} aria-label="Why approve beyond entitlement" placeholder="Why approve anyway (recorded on the request)" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} />
            <button className="btn sm" onClick={() => { setOver(null); setNote(''); }}>Cancel</button>
            <button className="btn sm pri" disabled={busy || !note.trim()} onClick={() => go('approve', true)}>Approve anyway</button>
          </div>
        </div>
      )}
      {err && <div className="err" role="alert" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}

function LeavePolicy({ desk }: { desk: AdminDesk }) {
  const { call, reload } = useAdminDesk();
  const can = desk.me.access.can('leave.policy');
  const current = Object.fromEntries(desk.workforce.policies.map(p => [p.leave_type, String(p.days_per_year)]));
  const [days, setDays] = useState<Record<string, string>>(() => (desk.workforce.policies.length ? current
    : Object.fromEntries(BALANCE_TYPES.map(t => [t, String(DEFAULT_POLICY[t])]))));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const unset = !desk.workforce.policies.length;
  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try { await call('/api/admin/leave-policy', 'PUT', { days }); setMsg('Saved'); reload(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <CardHead title={`Leave entitlements · AY ${desk.session.replace('-', '–')}`}
        sub={unset ? 'Not set yet, so leave is uncapped. The figures below are common defaults; save them or change them.' : "Days per year. Teachers can't apply beyond their balance, except for leave without pay and on-duty."}
        right={can ? <button className="btn sm pri" disabled={busy} onClick={save}>{busy ? 'Saving…' : unset ? 'Set entitlements' : 'Save'}</button> : undefined} />
      <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {BALANCE_TYPES.map(t => (
          <Field key={t} label={LEAVE_TYPES[t].toUpperCase()} htmlFor={`lp-${t}`}>
            <input id={`lp-${t}`} className="cmp-in num" inputMode="decimal" disabled={!can} value={days[t] ?? ''} placeholder="No cap"
              onChange={e => setDays(d => ({ ...d, [t]: e.target.value.replace(/[^\d.]/g, '') }))} />
          </Field>
        ))}
      </div>
      {msg && <div className="muted" style={{ fontSize: 12.5 }}>{msg}</div>}
      {err && <div className="err" role="alert">{err}</div>}
    </div>
  );
}

function TeacherDetail({ t, desk, onClose }: { t: TeacherRow; desk: AdminDesk; onClose: () => void }) {
  const leave = desk.workforce.leave.filter(l => l.staffId === t.id);
  const taken = leave.filter(l => l.status === 'approved').reduce((n, l) => n + l.days, 0);
  const stat = (label: string, value: ReactNode, note?: string) => (
    <div className="kpi"><div className="lb">{label}</div><div className="vl" style={{ fontSize: 30 }}>{value}</div>{note && <div className="nt" style={{ color: 'var(--mut)' }}>{note}</div>}</div>
  );
  return (
    <Workspace wide title={t.name} sub={`${t.email || 'No email'} · last active ${ago(t.lastActive)}`} onClose={onClose}>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
        {stat('CLASS TML', t.tml !== null ? <span style={{ color: hmColor(t.tml) }}>{t.tml}%</span> : '—', t.before !== null ? `${t.before}% a fortnight ago` : 'No earlier figure')}
        {stat('STUDENTS', t.students, plural(t.classes.length, 'class', 'classes'))}
        {stat('GRADING BACKLOG', t.backlog, t.oldestPendingDays ? `Oldest waiting ${plural(t.oldestPendingDays, 'day')}` : 'Nothing waiting')}
        {stat('LEAVE TAKEN', taken, `${plural(leave.filter(l => l.status === 'pending').length, 'request')} pending`)}
      </div>
      <div className="g2">
        <div className="card">
          <CardHead title="Last 30 days" />
          <div className="row"><span style={{ flex: 1 }}>Homework, quizzes and classwork posted</span><b className="num">{t.posted30}</b></div>
          <div className="row"><span style={{ flex: 1 }}>Lessons planned</span><b className="num">{t.lessons30}</b></div>
          <div className="row"><span style={{ flex: 1 }}>of which drafted with the AI copilot</span><b className="num">{t.aiLessons30}</b></div>
          <div className="row"><span style={{ flex: 1 }}>Grades confirmed</span><b className="num">{t.graded30}</b></div>
        </div>
        <div className="card">
          <CardHead title="Teaching assignment" sub="Edit in the user directory." />
          {t.scope.length ? t.scope.map(e => (
            <div className="row" key={`${e.cls}-${e.subject}`}><b style={{ flex: '0 0 110px' }}>{e.cls}</b><span>{e.subject ? subjectName(subjectKey(e.subject)) : 'Class teacher'}</span></div>
          )) : <p className="muted">No classes assigned yet.</p>}
          {(desk.workforce.balances[t.id] || []).some(b => b.entitled !== null) && (
            <>
              <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', margin: '18px 0 4px' }}>LEAVE BALANCES</div>
              {desk.workforce.balances[t.id].filter(b => b.entitled !== null).map(b => (
                <div className="row" key={b.type}><span style={{ flex: 1, fontSize: 13 }}>{b.label}</span>
                  <span className="muted num" style={{ fontSize: 12.5 }}>{b.used} taken{b.pending ? ` · ${b.pending} pending` : ''} of {b.entitled}</span>
                  <b className="num" style={{ width: 60, textAlign: 'right', color: (b.left ?? 0) < 0 ? 'var(--red)' : undefined }}>{b.left} left</b></div>
              ))}
            </>
          )}
          {leave.length > 0 && (
            <>
              <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', margin: '18px 0 4px' }}>LEAVE THIS SESSION</div>
              {leave.map(l => (
                <div className="row" key={l.id}><span style={{ flex: 1, fontSize: 13 }}>{LEAVE_TYPES[l.type]} · {range(l)}</span><Chip tone={LEAVE_CHIP[l.status].tone}>{LEAVE_CHIP[l.status].t}</Chip></div>
              ))}
            </>
          )}
        </div>
      </div>
    </Workspace>
  );
}
