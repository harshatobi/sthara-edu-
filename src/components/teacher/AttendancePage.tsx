'use client';

import { useCallback, useMemo, useState } from 'react';
import { FilePdfIcon as FilePdf } from '@phosphor-icons/react/dist/ssr/FilePdf';
import { CalendarBlankIcon as CalendarBlank } from '@phosphor-icons/react/dist/ssr/CalendarBlank';
import { ListChecksIcon as ListChecks } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useAuth } from '@/contexts/AuthContext';
import { istDay } from '@/lib/feed/rules';
import { BACKDATE_DAYS, monthDays, recentSchoolDays, schoolDays, addDay } from '@/lib/attendance/register';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { displayClass, normClass } from '@/lib/teacher/scope';
import DayRegister, { dayLabel, type SavePayload } from './attendance/DayRegister';
import MonthSheet from './attendance/MonthSheet';
import RegisterDoc, { printRegister } from './attendance/RegisterDoc';
import { sessionFrom, useCalendar, useHistory, wingIdOf } from './attendance/useRegister';

type View = 'day' | 'month';

/** The class register: mark a day fast, read the month as the paper register, export either as a PDF. */
export default function AttendancePage() {
  const { profile } = useAuth();
  const { desk, error: deskErr, call } = useTeacherDesk();
  const [toast, toastEl] = useToast(3200);
  const today = useMemo(() => istDay(), []);
  const sessionStart = sessionFrom(today);
  const cal = useCalendar(profile?.schoolId);

  const ownClass = profile?.teacherClass ? displayClass(profile.teacherClass) : '';
  const classes = useMemo(() => {
    const list = (desk?.classes || []).map(c => c.cls);
    return ownClass && !list.some(c => normClass(c) === normClass(ownClass)) ? [ownClass, ...list] : list;
  }, [desk, ownClass]);
  const [picked, setCls] = useState('');
  const cls = picked || ownClass || classes[0] || '';
  const isOwn = !!ownClass && normClass(ownClass) === normClass(cls);
  const roster = useMemo(() => (desk?.classes.find(c => normClass(c.cls) === normClass(cls))?.students || [])
    .slice().sort((a, b) => (a.rollNo || '').localeCompare(b.rollNo || '', 'en', { numeric: true }) || a.name.localeCompare(b.name)), [desk, cls]);

  const calFor = useMemo(() => (cal ? { workingDays: cal.workingDays, events: cal.events, wingId: wingIdOf(cls, cal) } : null), [cal, cls]);
  const window_ = useMemo(() => (calFor ? recentSchoolDays(today, 8, BACKDATE_DAYS, calFor) : []), [calFor, today]);
  const todayOff = useMemo(() => (calFor ? schoolDays([today], calFor)[0].off : null), [calFor, today]);

  const [view, setView] = useState<View>('day');
  const [pickedDay, setDay] = useState<string | null>(null);
  const day = pickedDay && window_.some(d => d.date === pickedDay) ? pickedDay : window_[0]?.date ?? today;
  const [month, setMonth] = useState(today.slice(0, 7));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const ids = useMemo(() => roster.map(s => s.id), [roster]);
  const { history, err: loadErr, version } = useHistory(ids, nonce);
  const monthSheetDays = useMemo(() => (calFor ? schoolDays(monthDays(month), calFor) : []), [calFor, month]);
  // The days before the chosen day, for each student's trail (oldest first).
  const trail = useMemo(() => (calFor ? recentSchoolDays(addDay(day, -1), 5, 14, calFor).reverse() : []), [calFor, day]);
  const canMark = isOwn || !ownClass;
  const onDirty = useCallback((d: boolean) => setDirty(d), []);

  const save = async (p: SavePayload) => {
    setBusy(true); setErr(null);
    try {
      const r = await call('/api/teacher/attendance', 'POST', { className: cls, day, marks: p.marks });
      const absent = r.counts?.absent || 0;
      toast(`Register saved for ${dayLabel(day)} · ${absent ? `${absent} absent` : 'everyone in'}${p.newlyAbsent ? ` · ${p.newlyAbsent} ${p.newlyAbsent === 1 ? 'family' : 'families'} told` : ''}${r.raised ? ` · ${r.raised} new in the feed` : ''}`);
      setNonce(n => n + 1);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save the register.'); } finally { setBusy(false); }
  };
  const go = (fn: () => void) => {
    if (dirty) { setErr('Save or undo your changes first.'); return; }
    setErr(null); fn();
  };

  if (deskErr) return <div className="note err" role="alert">{deskErr}</div>;
  const ready = !!desk && !!cal && !!history;
  const dayMarked = history ? roster.filter(s => history.marks[s.id]?.[day]).length : 0;

  return (
    <>
      {toastEl}
      <div className="no-print">
        <PageBar eyebrow="ATTENDANCE" title={cls ? `${cls} register` : 'Class register'}
          sub={!ready ? 'Loading the register…' : view === 'day'
            ? (dayMarked === roster.length && roster.length ? `Marked for ${dayLabel(day)}` : dayMarked ? `${dayMarked} of ${roster.length} marked for ${dayLabel(day)}` : `Not marked yet for ${dayLabel(day)}`)
            : 'The month as the paper register, with each student’s trend.'}
          actions={
            <div className="reg-actions">
              {classes.length > 1 && (
                <select className="cmp-sel" aria-label="Class" value={cls} onChange={e => go(() => setCls(e.target.value))}>
                  {classes.map(c => <option key={c} value={c}>{c}{normClass(c) === normClass(ownClass) ? ' (my class)' : ''}</option>)}
                </select>
              )}
              <div className="seg" role="tablist" aria-label="View">
                <button role="tab" aria-selected={view === 'day'} className={view === 'day' ? 'on' : ''} onClick={() => go(() => setView('day'))}><ListChecks size={14} weight="bold" /> Day</button>
                <button role="tab" aria-selected={view === 'month'} className={view === 'month' ? 'on' : ''} onClick={() => go(() => setView('month'))}><CalendarBlank size={14} weight="bold" /> Month</button>
              </div>
              {view === 'day' && <button className="btn sm" disabled={!ready || !dayMarked} title={dayMarked ? 'The saved register for this day' : 'Save the register first'} onClick={printRegister}><FilePdf size={14} weight="bold" />PDF</button>}
            </div>
          } />

        {!canMark && cls && <div className="note" style={{ marginBottom: 14, fontSize: 13 }}>You are not the class teacher of {cls}, so this register is read-only for you. Only a class without a class teacher can be marked by its other teachers.</div>}
        {loadErr && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{loadErr}</div>}
        {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}

        {!ready ? (
          <div className="card">{[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} h={52} style={{ margin: '10px 0' }} />)}</div>
        ) : view === 'day' ? (
          <>
            {todayOff && day !== today && <div className="note info" style={{ marginBottom: 14 }}>No classes today ({todayOff.label}). Showing the last school day.</div>}
            <div className="reg-days" role="tablist" aria-label="Day to mark">
              {window_.map(d => {
                const n = roster.filter(s => history.marks[s.id]?.[d.date]).length;
                const state = !roster.length ? 'none' : n === roster.length ? 'done' : n ? 'part' : 'none';
                return (
                  <button key={d.date} role="tab" aria-selected={d.date === day} className={`reg-day ${d.date === day ? 'on' : ''} ${state}`}
                    onClick={() => go(() => setDay(d.date))}>
                    <span className="wd">{d.date === today ? 'Today' : dayLabel(d.date, { weekday: 'short' })}</span>
                    <b>{Number(d.date.slice(8))}</b>
                    <span className="st">{state === 'done' ? 'Marked' : state === 'part' ? `${n}/${roster.length}` : 'Open'}</span>
                  </button>
                );
              })}
            </div>
            <DayRegister key={`${cls}|${day}|${version}`} day={day} isToday={day === today} roster={roster} history={history} recent={trail}
              canMark={canMark} busy={busy} onSave={save} onDirty={onDirty} />
          </>
        ) : (
          <MonthSheet cls={cls} month={month} setMonth={setMonth} minMonth={sessionStart.slice(0, 7)} maxMonth={today.slice(0, 7)}
            days={monthSheetDays} roster={roster} history={history} today={today} editableFrom={window_[window_.length - 1]?.date ?? today}
            sessionStart={sessionStart} onPdf={printRegister}
            onOpenDay={d => { setDay(d); setView('day'); }} />
        )}
      </div>

      {ready && (
        <RegisterDoc kind={view} school={cal!.schoolName} cls={cls} teacher={isOwn ? profile?.name || desk!.me.name : ''}
          roster={roster} history={history!} today={today} sessionStart={sessionStart} day={day} month={month} days={monthSheetDays} />
      )}
    </>
  );
}
