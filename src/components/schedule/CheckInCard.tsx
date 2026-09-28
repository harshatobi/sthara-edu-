'use client';

import { useMemo, useState } from 'react';
import { SignInIcon as SignIn } from '@phosphor-icons/react/dist/ssr/SignIn';
import { SignOutIcon as SignOut } from '@phosphor-icons/react/dist/ssr/SignOut';
import { Chip, Skeleton, type Tone } from '@/components/canon/ui';
import { dayOf, hm, localOf, monthOf, type DayStatus } from '@/lib/attendance/engine';
import { useAttendance } from '@/lib/attendance/useAttendance';
import { hhmm } from '@/lib/schedule/engine';
import '@/styles/schedule.css';

export const STATUS: Record<DayStatus, { t: string; tone: Tone }> = {
  present: { t: 'PRESENT', tone: 'g' }, late: { t: 'LATE', tone: 'a' }, half_day: { t: 'HALF DAY', tone: 'a' }, absent: { t: 'ABSENT', tone: 'r' },
  not_in: { t: 'NOT IN YET', tone: 'n' }, off: { t: 'OFF', tone: 'n' }, leave: { t: 'ON LEAVE', tone: 'p' }, unexpected: { t: 'IN ON A DAY OFF', tone: 'b' }, untracked: { t: 'NOT TRACKED', tone: 'n' },
};

/** Today's check-in for the signed-in teacher or office account, with this month so far. */
export default function CheckInCard() {
  const [now] = useState(() => localOf(Date.now()));
  const { data, error, reload, call, me } = useAttendance(`${now.date.slice(0, 7)}-01`, now.date);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const person = data?.people.find(p => p.key === me);
  const day = useMemo(() => (data && person ? dayOf(now.date, person, data.rows, now.min) : null), [data, person, now.date, now.min]);
  const month = useMemo(() => (data && person ? monthOf(now.date, person, data.rows, now.date) : null), [data, person, now.date]);
  if (error || (data && data.missing.includes('staff_punches'))) return null;
  if (!data) return <div className="card" style={{ marginBottom: 18 }}><Skeleton h={48} /></div>;
  if (!person || !day) return null;

  const punch = async (direction: 'in' | 'out') => {
    setBusy(true); setMsg(null);
    const pos = await new Promise<GeolocationPosition | null>(res => {
      if (!('geolocation' in navigator)) return res(null);
      navigator.geolocation.getCurrentPosition(p => res(p), () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 });
    });
    try {
      const r = await call<{ onCampus: boolean | null; distance: number | null }>('/api/me/attendance', 'POST', { direction, lat: pos?.coords.latitude, lng: pos?.coords.longitude, accuracy: pos?.coords.accuracy });
      setMsg(r.onCampus === false ? `Recorded, but you look ${r.distance} m from school, so it's marked off campus.` : direction === 'in' ? 'Checked in.' : 'Checked out.');
      reload();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const exp = day.expected;
  return (
    <div className="card" style={{ marginBottom: 18, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 16 }}>Today</b>
          <Chip tone={STATUS[day.status].tone}>{STATUS[day.status].t}</Chip>
        </div>
        <div className="muted" style={{ marginTop: 4 }}>
          {exp.kind === 'work' ? `${exp.label}, ${hhmm(hm(exp.start), true)} to ${hhmm(hm(exp.end), true)}` : exp.kind === 'leave' ? 'On leave' : 'A day off'}
          {day.inMin !== null && ` · in ${hhmm(hm(day.inMin), true)}`}{day.outMin !== null && ` · out ${hhmm(hm(day.outMin), true)}`}
          {month && ` · this month: ${month.present} present, ${month.late} late${month.absent ? `, ${month.absent} absent` : ''}`}
        </div>
        {msg && <div style={{ fontSize: 12.5, marginTop: 6, fontWeight: 600 }}>{msg}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {day.inMin === null ? <button className="btn pri" disabled={busy} onClick={() => punch('in')}><SignIn size={15} weight="bold" /> {busy ? 'Checking in…' : 'Check in'}</button>
          : <button className="btn" disabled={busy} onClick={() => punch('out')}><SignOut size={15} weight="bold" /> {busy ? 'Checking out…' : 'Check out'}</button>}
      </div>
    </div>
  );
}
