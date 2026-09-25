'use client';

import { useEffect, useState } from 'react';
import { CalendarBlankIcon as CalendarBlank } from '@phosphor-icons/react/dist/ssr/CalendarBlank';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { LEAVE_TYPES } from '@/lib/admin/constants';
import { daysBetween, fmtDate, isoDay, plural, sessionOf, sessionStart } from '@/lib/admin/format';
import { balances, isCapped } from '@/lib/admin/leave';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';

const CHIP: Record<string, { t: string; tone: Tone }> = {
  pending: { t: 'AWAITING APPROVAL', tone: 'a' }, approved: { t: 'APPROVED', tone: 'g' }, rejected: { t: 'NOT APPROVED', tone: 'r' }, cancelled: { t: 'WITHDRAWN', tone: 'n' },
};

interface Row { id: string; leave_type: string; from_date: string; to_date: string; half_day: boolean; reason: string; status: string; decision_note: string | null; decided_at: string | null; created_at: string }

/** A teacher's own leave (mockup teacher:leave): apply, see decisions, withdraw. */
export default function LeavePage() {
  const { profile } = useAuth();
  const { call } = useTeacherDesk();
  const [toast, toastEl] = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [policies, setPolicies] = useState<{ leave_type: string; days_per_year: number }[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [type, setType] = useState('casual');
  const [from, setFrom] = useState(isoDay());
  const [to, setTo] = useState(isoDay());
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [nonce, setNonce] = useState(0);
  const load = () => setNonce(n => n + 1);
  useEffect(() => {
    if (!profile?.uid) return;
    let cancelled = false;
    createClient().from('leave_policies').select('leave_type, days_per_year').eq('session', sessionOf())
      .then(({ data }) => { if (!cancelled) setPolicies(data || []); });
    createClient().from('leave_requests')
      .select('id, leave_type, from_date, to_date, half_day, reason, status, decision_note, decided_at, created_at')
      .eq('staff_id', profile.uid).gte('to_date', sessionStart(sessionOf())).order('from_date', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setLoadErr(/does not exist|schema cache/i.test(error.message) ? 'Leave isn\'t switched on for this school yet.' : error.message);
        else { setRows(data || []); setLoadErr(null); }
      });
    return () => { cancelled = true; };
  }, [profile?.uid, nonce]);

  const days = halfDay ? 0.5 : to >= from ? daysBetween(from, to) + 1 : 0;
  const submit = async () => {
    if (!reason.trim()) { setErr('Give a reason.'); return; }
    if (to < from) { setErr('The end date must be on or after the start date.'); return; }
    setBusy(true); setErr(null);
    try {
      await call('/api/teacher/leave', 'POST', { type, from, to: halfDay ? from : to, halfDay, reason });
      setReason(''); setHalfDay(false); toast('Leave request sent'); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const withdraw = async (id: string) => {
    try { await call('/api/teacher/leave', 'PATCH', { id, cancel: true }); toast('Request withdrawn'); load(); }
    catch (e: any) { setErr(e.message); }
  };

  const approvedDays = (rows || []).filter(r => r.status === 'approved').reduce((n, r) => n + (r.half_day ? 0.5 : daysBetween(r.from_date, r.to_date) + 1), 0);
  const bal = balances(policies, (rows || []).map(r => ({ ...r, staff_id: profile?.uid })), profile?.uid || '', sessionOf()).filter(b => b.entitled !== null);
  const typeBal = bal.find(b => b.type === type);
  const overBy = typeBal && isCapped(type) ? days - (typeBal.left ?? 0) : 0;

  return (
    <>
      {toastEl}
      <PageBar eyebrow="LEAVE" title="Apply for leave" sub={`AY ${sessionOf().replace('-', '–')} · ${plural(approvedDays, 'day')} approved so far`} />
      {bal.length > 0 && (
        <div className="kpis" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(170px, 1fr))` }}>
          {bal.map(b => (
            <div className="kpi" key={b.type}>
              <div className="lb">{b.label.toUpperCase()}</div>
              <div className="vl" style={{ fontSize: 34, color: (b.left ?? 0) <= 0 ? 'var(--red)' : undefined }}>{b.left}</div>
              <div className="nt" style={{ color: 'var(--mut)' }}>left of {b.entitled}{b.pending ? ` · ${b.pending} awaiting approval` : ''}</div>
            </div>
          ))}
        </div>
      )}
      <div className="g2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>New request</h3>
          <div className="cmp-fld"><label htmlFor="lv-type">LEAVE TYPE</label>
            <select id="lv-type" className="cmp-sel" value={type} onChange={e => setType(e.target.value)}>
              {Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div className="g2" style={{ gap: 14 }}>
            <div className="cmp-fld"><label htmlFor="lv-from">FROM</label>
              <input id="lv-from" type="date" className="cmp-in" value={from} onChange={e => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} /></div>
            <div className="cmp-fld"><label htmlFor="lv-to">TO</label>
              <input id="lv-to" type="date" className="cmp-in" value={halfDay ? from : to} min={from} disabled={halfDay} onChange={e => setTo(e.target.value)} /></div>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>
            <input type="checkbox" checked={halfDay} onChange={e => setHalfDay(e.target.checked)} /> Half day
          </label>
          <div className="cmp-fld"><label htmlFor="lv-why">REASON</label>
            <textarea id="lv-why" className="cmp-in" value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} placeholder="Seen by the school office only" /></div>
          {err && <div className="err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span className="muted" style={{ fontSize: 13, color: overBy > 0 ? 'var(--red)' : undefined }}>
              {days ? plural(days, 'day') : ''}{overBy > 0 ? ` · ${overBy} more than your balance` : typeBal ? ` · ${(typeBal.left ?? 0) - days} left after` : ''}
            </span>
            <button className="btn pri" disabled={busy} onClick={submit}>{busy ? 'Sending…' : 'Send for approval'}</button>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>My requests</h3>
          {loadErr ? <div className="note err" role="alert">{loadErr}</div>
            : !rows ? [0, 1, 2].map(i => <Skeleton key={i} h={46} style={{ marginBottom: 10 }} />)
            : rows.length ? rows.map(r => {
              const canWithdraw = r.status === 'pending' || (r.status === 'approved' && r.from_date > isoDay());
              return (
                <div className="row" key={r.id} style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{LEAVE_TYPES[r.leave_type] || r.leave_type}</div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                      {fmtDate(r.from_date, true)}{r.to_date !== r.from_date ? ` to ${fmtDate(r.to_date, true)}` : ''}{r.half_day ? ' (half day)' : ''} · &ldquo;{r.reason}&rdquo;
                    </div>
                    {r.decision_note && <div style={{ fontSize: 12.5, marginTop: 4, color: r.status === 'rejected' ? 'var(--red)' : 'var(--mut)' }}>Office: &ldquo;{r.decision_note}&rdquo;</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <Chip tone={CHIP[r.status]?.tone ?? 'n'}>{CHIP[r.status]?.t ?? r.status.toUpperCase()}</Chip>
                    {canWithdraw && <button className="btn sm" onClick={() => withdraw(r.id)}>Withdraw</button>}
                  </div>
                </div>
              );
            }) : <Empty icon={<CalendarBlank size={26} weight="duotone" />} title="No leave this session">Requests you send appear here with the office&apos;s decision.</Empty>}
        </div>
      </div>
    </>
  );
}
