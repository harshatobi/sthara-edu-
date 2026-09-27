'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheckIcon as CalendarCheck } from '@phosphor-icons/react/dist/ssr/CalendarCheck';
import { UserListIcon as UserList } from '@phosphor-icons/react/dist/ssr/UserList';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { istDay } from '@/lib/feed/rules';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { displayClass, normClass } from '@/lib/teacher/scope';

type Status = 'present' | 'absent' | 'late' | 'excused';
const STATUS: { k: Status; short: string; label: string; color: string }[] = [
  { k: 'present', short: 'P', label: 'Present', color: 'var(--green)' },
  { k: 'absent', short: 'A', label: 'Absent', color: 'var(--red)' },
  { k: 'late', short: 'L', label: 'Late', color: 'var(--amber)' },
  { k: 'excused', short: 'E', label: 'Excused', color: 'var(--blue)' },
];
const COLOR = Object.fromEntries(STATUS.map(s => [s.k, s.color])) as Record<Status, string>;
const DAY = 86_400_000;

/** School days from today back (Sundays skipped), newest first. */
function recentDays(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < n && i < n * 2; i++) {
    const d = istDay(new Date(Date.now() - i * DAY));
    if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) out.push(d);
  }
  return out;
}
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Daily register for the class teacher (mockup teacher:attendance). */
export default function AttendancePage() {
  const { profile } = useAuth();
  const { desk, error: deskErr, call } = useTeacherDesk();
  const [toast, toastEl] = useToast();
  const days = useMemo(() => recentDays(7), []);
  const [day, setDay] = useState(days[0]);
  const ownClass = profile?.teacherClass ? displayClass(profile.teacherClass) : '';
  const classes = useMemo(() => {
    const list = (desk?.classes || []).map(c => c.cls);
    return ownClass && !list.some(c => normClass(c) === normClass(ownClass)) ? [ownClass, ...list] : list;
  }, [desk, ownClass]);
  const [picked, setCls] = useState('');
  const cls = picked || ownClass || classes[0] || '';

  const roster = useMemo(() => (desk?.classes.find(c => normClass(c.cls) === normClass(cls))?.students || [])
    .slice().sort((a, b) => (a.rollNo || '').localeCompare(b.rollNo || '', 'en', { numeric: true }) || a.name.localeCompare(b.name)), [desk, cls]);

  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const load = useCallback(() => setNonce(n => n + 1), []);

  // The register as stored, for this class, day and load; stale results are ignored by key.
  const rosterKey = roster.map(s => s.id).join(',');
  const key = `${normClass(cls)}|${day}|${nonce}|${rosterKey}`;
  const [reg, setReg] = useState<{ key: string; saved: Record<string, Status>; history: Record<string, Record<string, Status>>; err: string | null } | null>(null);
  useEffect(() => {
    if (!rosterKey) return;
    let alive = true;
    const ids = rosterKey.split(',');
    createClient().from('attendance').select('student_id, day, status').in('student_id', ids).gte('day', days[days.length - 1]).lte('day', days[0])
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setReg({ key, saved: {}, history: {}, err: /does not exist|schema cache/i.test(error.message) ? 'Attendance is not switched on for this school yet (database update pending).' : error.message });
          return;
        }
        const h: Record<string, Record<string, Status>> = {};
        for (const r of data || []) (h[r.student_id] ||= {})[r.day] = r.status as Status;
        const today: Record<string, Status> = {};
        for (const id of ids) if (h[id]?.[day]) today[id] = h[id][day];
        setReg({ key, saved: today, history: h, err: null });
        // New register: everyone present until marked otherwise.
        setMarks(Object.fromEntries(ids.map(id => [id, today[id] || 'present'])));
      });
    return () => { alive = false; };
  }, [key, rosterKey, day, days]);
  const saved = !rosterKey ? {} : reg?.key === key ? reg.saved : null;
  const history = reg?.key === key ? reg.history : {};
  const loadErr = reg?.key === key ? reg.err : null;

  const marked = saved ? Object.keys(saved).length : 0;
  const counts = STATUS.map(s => ({ ...s, n: roster.filter(r => marks[r.id] === s.k).length }));
  const dirty = !!saved && roster.some(s => saved[s.id] !== marks[s.id]);
  const isOwn = !!ownClass && normClass(ownClass) === normClass(cls);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await call('/api/teacher/attendance', 'POST', { className: cls, day, marks: roster.map(s => ({ studentId: s.id, status: marks[s.id] })) });
      const absent = r.counts?.absent || 0;
      toast(`Register saved · ${absent ? `${absent} absent` : 'everyone in'}${r.raised ? ` · ${r.raised} new in the feed` : ''}`);
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (deskErr) return <div className="note err" role="alert">{deskErr}</div>;
  return (
    <>
      {toastEl}
      <PageBar eyebrow="ATTENDANCE" title={cls ? `${cls} register` : 'Daily register'}
        sub={saved === null ? 'Loading…' : marked === roster.length && roster.length ? `Marked for ${dayLabel(day)}` : marked ? `${marked} of ${roster.length} marked for ${dayLabel(day)}` : `Not marked yet for ${dayLabel(day)}`}
        actions={classes.length > 1 ? (
          <select className="cmp-sel" aria-label="Class" style={{ margin: 0, minWidth: 150 }} value={cls} onChange={e => setCls(e.target.value)}>
            {classes.map(c => <option key={c} value={c}>{c}{normClass(c) === normClass(ownClass) ? ' (my class)' : ''}</option>)}
          </select>
        ) : undefined} />
      {!isOwn && cls && <div className="note" style={{ marginBottom: 14, fontSize: 13 }}>You are not the class teacher of {cls}. Only a class without a class teacher can be marked by its other teachers.</div>}
      {loadErr && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{loadErr}</div>}
      <div className="seg" role="group" aria-label="Day" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {days.map(d => <button key={d} className={d === day ? 'on' : ''} aria-pressed={d === day} onClick={() => setDay(d)}>{d === days[0] ? 'Today' : dayLabel(d)}</button>)}
      </div>
      {!desk ? <div className="card">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={48} style={{ margin: '10px 0' }} />)}</div>
        : !roster.length ? (
          <div className="card"><Empty icon={<UserList size={26} weight="duotone" />} title="No students in this class">
            Students appear here once the office adds them to {cls || 'your class'}.
          </Empty></div>
        ) : (
          <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 0', alignItems: 'center' }}>
              {counts.map(c => <Chip key={c.k} tone={c.k === 'present' ? 'g' : c.k === 'absent' ? 'r' : c.k === 'late' ? 'a' : 'b'}>{c.label.toUpperCase()} {c.n}</Chip>)}
              <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setMarks(Object.fromEntries(roster.map(s => [s.id, 'present' as Status])))}>Mark all present</button>
            </div>
            {roster.map(s => {
              const past = days.slice(1, 6).reverse();
              return (
                <div className="row" key={s.id} style={{ gap: 12 }}>
                  <div style={{ width: 34, textAlign: 'center', fontWeight: 800, color: 'var(--mut)', fontSize: 13 }}>{s.rollNo || '—'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 5 }} aria-label="Last five school days">
                      {past.map(d => {
                        const st = history[s.id]?.[d];
                        return <span key={d} title={`${dayLabel(d)}: ${st || 'not marked'}`}
                          style={{ width: 9, height: 9, borderRadius: 99, background: st ? COLOR[st] : 'var(--line)' }} />;
                      })}
                    </div>
                  </div>
                  <div className="seg" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                    {STATUS.map(o => (
                      <button key={o.k} role="radio" aria-checked={marks[s.id] === o.k} title={o.label}
                        className={marks[s.id] === o.k ? 'on' : ''}
                        style={marks[s.id] === o.k ? { color: o.color, minWidth: 38 } : { minWidth: 38 }}
                        onClick={() => setMarks(m => ({ ...m, [s.id]: o.k }))}>{o.short}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      {err && <div className="err" role="alert" style={{ margin: '12px 0' }}>{err}</div>}
      {roster.length > 0 && (
        <div className="card" style={{ position: 'sticky', bottom: 12, marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <CalendarCheck size={22} weight="duotone" color="var(--green)" />
          <div style={{ flex: 1, fontSize: 13.5 }}>
            <b>{dayLabel(day)}</b> · {counts.filter(c => c.n).map(c => `${c.n} ${c.label.toLowerCase()}`).join(', ')}
            <div className="muted" style={{ fontSize: 12 }}>Three absences in a row or a missed quiz shows up in the feed for the class&apos;s teachers.</div>
          </div>
          <button className="btn pri" disabled={busy || saved === null || (!dirty && marked === roster.length)} onClick={save}>
            {busy ? 'Saving…' : marked === roster.length && !dirty ? 'Saved' : marked ? 'Save changes' : 'Save register'}
          </button>
        </div>
      )}
    </>
  );
}
