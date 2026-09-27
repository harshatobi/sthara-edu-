'use client';

import { useMemo, useState } from 'react';
import { CaretLeftIcon as CaretLeft } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon as CaretRight } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { UserMinusIcon as UserMinus } from '@phosphor-icons/react/dist/ssr/UserMinus';
import { ClockCountdownIcon as ClockCountdown } from '@phosphor-icons/react/dist/ssr/ClockCountdown';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { ChatCircleTextIcon as ChatCircleText } from '@phosphor-icons/react/dist/ssr/ChatCircleText';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { Chip, Empty, type Tone } from '@/components/canon/ui';
import { CardHead, Kpi, downloadCsv } from '@/components/admin/kit';
import { LEAVE_TYPES } from '@/lib/admin/constants';
import { fmtDate, isoDay, plural, sessionOf, sessionStart } from '@/lib/admin/format';
import { candidatesFor, fairness, lessonsOn, needsOn, type Candidate, type Need } from '@/lib/schedule/cover';
import { addDays, awayOn, hhmm, namesOf, versionOn, weekdayOf } from '@/lib/schedule/engine';
import { DAY_NAMES, personKey, type Absence, type PersonKey, type ScheduleRows } from '@/lib/schedule/types';
import Pop, { run } from '@/components/schedule/Pop';
import { PersonSelect, peopleOptions } from '@/components/schedule/people';
import { printTable } from '@/components/schedule/print';

type Call = <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const API = '/api/admin/schedule/cover';
const REASON: Record<Need['reason'], { t: string; tone: Tone }> = { leave: { t: 'ON LEAVE', tone: 'a' }, absent: { t: 'ABSENT', tone: 'r' }, release: { t: 'RELEASED', tone: 'p' } };
const PORTION: Record<Absence['portion'], string> = { full: 'full day', am: 'morning', pm: 'afternoon', periods: 'periods' };

/**
 * The cover board (schedule.academic): who is away on a day, every lesson that needs cover, ranked
 * substitutes, WhatsApp-reported absences to confirm, and visiting teachers' sessions to confirm.
 */
export default function CoverTab({ rows, call, reload, toast }: { rows: ScheduleRows; call: Call; reload: () => void; toast: (m: string) => void }) {
  const today = isoDay();
  const [date, setDate] = useState(today);
  const [open, setOpen] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'absent' | 'release'>(null);
  const names = useMemo(() => namesOf(rows), [rows]);
  const { needs, stale } = useMemo(() => needsOn(date, rows), [date, rows]);
  const reported = rows.absences.filter(a => a.on_date === date && a.status === 'reported');
  const awayPeople = useMemo(() => {
    const keys = new Set<PersonKey>();
    for (const l of rows.leave) if (l.status === 'approved' && l.from_date <= date && l.to_date >= date) keys.add(l.staff_id);
    for (const a of rows.absences) if (a.on_date === date && a.status === 'confirmed') keys.add(personKey(a.user_id, a.staff_member_id)!);
    return [...keys].map(k => ({ key: k, away: awayOn(date, k, rows) })).filter(x => x.away.length).sort((a, b) => (names.get(a.key) || '').localeCompare(names.get(b.key) || ''));
  }, [rows, date, names]);
  const openCount = needs.filter(n => n.state === 'open').length;
  const visiting = useMemo(() => lessonsOn(date, rows).filter(l => l.slot.staff_member_id && rows.staff.find(m => m.id === l.slot.staff_member_id)?.employment === 'visiting'), [rows, date]);
  const act = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); reload(); toast(done); } catch (e: any) { toast(e.message); } };

  const printSheet = () => {
    try {
      printTable({
        title: `Cover · ${DAY_NAMES[weekdayOf(date)]} ${fmtDate(date)}`, subtitle: `${plural(needs.length, 'lesson')} to cover · ${awayPeople.length} away`, school: rows.schoolName,
        head: ['Period', 'Time', 'Class', 'Subject', 'Away', 'Covered by', 'Signature'],
        rows: needs.map(n => [`P${n.period_no}`, `${hhmm(n.startAt)}–${hhmm(n.endAt)}`, n.classes, n.subject, names.get(n.person) || '', n.state === 'assigned' ? names.get(n.sub!) || '' : n.state === 'not_needed' ? 'Not needed' : '', '']),
      });
    } catch (e: any) { toast(e.message); }
  };
  const session = sessionOf(new Date(`${today}T12:00:00`));
  const exportCovers = () => downloadCsv(`covers-${session}.csv`, [
    ['Person', 'Covers this session', 'Periods a week (own timetable)'],
    ...fairness(rows, sessionStart(session), today).filter(r => r.covers).map(r => [r.name, r.covers, r.periodsPerWeek]),
    [],
    ['Date', 'Period', 'Class', 'Subject', 'Away', 'Why', 'Covered by'],
    ...rows.covers.filter(c => c.status === 'assigned').sort((a, b) => a.on_date.localeCompare(b.on_date)).map(c => [c.on_date, c.period_no, c.class, c.subject,
      names.get(personKey(c.absent_user_id, c.absent_staff_member_id) || '') || '', c.reason, names.get(personKey(c.sub_user_id, c.sub_staff_member_id) || '') || '']),
  ]);

  return (
    <>
      <div className="sch-bar">
        <button className="btn sm" aria-label="Previous day" onClick={() => setDate(d => addDays(d, -1))}><CaretLeft size={14} weight="bold" /></button>
        <button className="btn sm" onClick={() => setDate(today)} disabled={date === today}>Today</button>
        <button className="btn sm" aria-label="Next day" onClick={() => setDate(d => addDays(d, 1))}><CaretRight size={14} weight="bold" /></button>
        <input type="date" className="sch-sel" aria-label="Date" value={date} onChange={e => e.target.value && setDate(e.target.value)} />
        <b style={{ fontSize: 15 }}>{DAY_NAMES[weekdayOf(date)]}, {fmtDate(date)}</b>
        <span className="sp" />
        <button className="btn sm" onClick={() => setDialog('absent')}><UserMinus size={13} /> Mark absent</button>
        <button className="btn sm" onClick={() => setDialog('release')}><ClockCountdown size={13} /> Release for periods</button>
        <button className="btn sm" onClick={printSheet} disabled={!needs.length}><Printer size={13} /> Print cover sheet</button>
      </div>

      <div className="kpis">
        <Kpi label="NEED COVER" value={openCount} valueColor={openCount ? 'var(--red)' : 'var(--green)'} note={openCount ? 'Lessons with nobody yet' : needs.length ? 'Every lesson is covered' : 'Nothing to cover'} />
        <Kpi label="COVERED" value={needs.filter(n => n.state === 'assigned').length} note={`${needs.filter(n => n.state === 'not_needed').length} marked not needed`} />
        <Kpi label="AWAY" value={awayPeople.length} note={awayPeople.length ? awayPeople.slice(0, 3).map(a => (names.get(a.key) || '').split(' ')[0]).join(', ') + (awayPeople.length > 3 ? '…' : '') : 'Everyone is in'} />
        <Kpi label="TO CONFIRM" value={reported.length} valueColor={reported.length ? 'var(--amber)' : undefined} note="Absences reported on WhatsApp" />
      </div>

      {!versionOn(rows.versions, date) && <div className="note info" style={{ marginBottom: 18 }}>No timetable is in force on this date, so there are no lessons to cover.</div>}

      {reported.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <CardHead title="Reported on WhatsApp" sub="Confirm to put their lessons on the board, or cancel if it was a mistake." />
          {reported.map(a => (
            <div className="row" key={a.id}>
              <ChatCircleText size={18} weight="duotone" color="var(--amber)" />
              <span style={{ flex: 1 }}><b>{names.get(personKey(a.user_id, a.staff_member_id) || '')}</b> · off {PORTION[a.portion]} · reported {new Date(a.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
              <button className="btn sm" onClick={() => act(() => call(API, 'POST', { action: 'cancel', id: a.id }), 'Cancelled')}>Cancel</button>
              <button className="btn sm pri" onClick={() => act(() => call(API, 'POST', { action: 'confirm', id: a.id }), 'Absence confirmed')}>Confirm</button>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Lessons to cover" sub="Substitutes are ranked: teaches the subject, teaches the class, fewest covers this term, lightest day. Nobody gets more than two covers a day unless you confirm it. The substitute is told in the app and on WhatsApp." />
        {needs.length ? needs.map(n => (
          <div key={n.key}>
            <div className="sch-need">
              <div className="t"><b>P{n.period_no}</b>{hhmm(n.startAt, true)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{n.subject} · {n.classes}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {names.get(n.person)} <Chip tone={REASON[n.reason].tone}>{REASON[n.reason].t}</Chip>
                  {n.unsureHalf && <span>half-day leave: check whether this period is in their half</span>}
                  {n.state === 'assigned' && <span>· covered by <b style={{ color: 'var(--ink)' }}>{names.get(n.sub!)}</b></span>}
                  {n.flagged !== null && <span style={{ color: 'var(--red)', fontWeight: 700 }}><Warning size={12} weight="fill" /> flagged{n.flagged ? `: "${n.flagged}"` : ''}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {n.state === 'open' && <>
                  <button className="btn sm" onClick={() => act(() => call(API, 'PUT', { action: 'not_needed', date, slotIds: n.lessons.map(l => l.slot.id) }), 'Marked not needed')}>Not needed</button>
                  <button className="btn sm pri" onClick={() => setOpen(o => (o === n.key ? null : n.key))}>{open === n.key ? 'Close' : 'Find cover'}</button>
                </>}
                {n.state === 'assigned' && <>
                  <button className="btn sm" onClick={() => setOpen(o => (o === n.key ? null : n.key))}>{open === n.key ? 'Close' : 'Change'}</button>
                  <button className="btn sm" onClick={() => act(() => call(API, 'DELETE', { date, slotIds: n.lessons.map(l => l.slot.id) }), 'Cover removed')}>Undo</button>
                </>}
                {n.state === 'not_needed' && <><Chip tone="n">NOT NEEDED</Chip><button className="btn sm" onClick={() => act(() => call(API, 'DELETE', { date, slotIds: n.lessons.map(l => l.slot.id) }), 'Back on the board')}>Undo</button></>}
              </div>
            </div>
            {open === n.key && <Candidates need={n} date={date} rows={rows} onPick={async (c, overCap) => {
              try {
                await call(API, 'PUT', { action: 'assign', date, slotIds: n.lessons.map(l => l.slot.id), sub: c.person, overCap });
                setOpen(null); reload(); toast(`${c.name} covers ${n.subject}, P${n.period_no}`);
              } catch (e: any) { toast(e.message); }
            }} />}
          </div>
        )) : <Empty icon={<CheckCircle size={26} weight="duotone" />} title="Nothing to cover">Nobody who teaches is away on this day. Mark someone absent or release them for periods to put their lessons here.</Empty>}
        {stale.length > 0 && (
          <div className="note" style={{ marginTop: 14 }}>
            <b>{plural(stale.length, 'cover')} no longer needed</b> (the teacher is back): {stale.map(c => `${c.subject} ${c.class} P${c.period_no}`).join(', ')}.
            <button className="btn sm" style={{ marginLeft: 10 }} onClick={() => act(() => call(API, 'DELETE', { date, slotIds: stale.map(c => c.slot_id) }), 'Removed')}>Remove</button>
          </div>
        )}
      </div>

      <div className="g2">
        <div className="card">
          <CardHead title="Away" sub="Approved leave, and absences or releases you've recorded." />
          {awayPeople.length ? awayPeople.map(({ key, away }) => (
            <div className="row" key={key}>
              <span style={{ flex: 1 }}><b>{names.get(key)}</b>
                <span className="muted"> · {away.map(a => a.reason === 'leave' ? `${LEAVE_TYPES[a.leaveType || ''] || 'leave'}${a.unsureHalf ? ' (half day)' : ''}` : a.reason === 'release' ? `released P${a.periods.join(', P')}` : `absent, ${PORTION[a.portion]}`).join('; ')}</span></span>
              {away.filter(a => a.absenceId).map(a => (
                <button key={a.absenceId} className="btn sm" onClick={() => act(() => call(API, 'POST', { action: 'cancel', id: a.absenceId }), 'Cancelled; their covers are removed')}>Cancel {a.reason === 'release' ? 'release' : 'absence'}</button>
              ))}
            </div>
          )) : <p className="muted">Nobody is away.</p>}
        </div>
        <div className="card">
          <CardHead title="Visiting teachers today" sub="Confirm each session for per-session pay." right={<button className="btn sm" onClick={exportCovers}><DownloadSimple size={13} /> Cover records</button>} />
          {visiting.length ? visiting.map(l => {
            const done = rows.visits.find(v => v.slot_id === l.slot.id && v.on_date === date);
            const future = date > today;
            return (
              <div className="row" key={l.slot.id}>
                <span style={{ flex: 1 }}><b>{names.get(`s:${l.slot.staff_member_id}`)}</b><span className="muted"> · {l.slot.subject}, {l.slot.class}, {hhmm(l.startAt, true)}</span></span>
                {done && <Chip tone={done.status === 'taken' ? 'g' : 'r'}>{done.status.toUpperCase()}</Chip>}
                {!future && (['taken', 'missed'] as const).filter(st => done?.status !== st).map(st => (
                  <button key={st} className={`btn sm${st === 'taken' ? ' pri' : ''}`} onClick={() => act(() => call('/api/admin/schedule/visits', 'PUT', { staffMemberId: l.slot.staff_member_id, date, slotId: l.slot.id, status: st }), st === 'taken' ? 'Session confirmed' : 'Marked missed')}>{st === 'taken' ? 'Taken' : 'Missed'}</button>
                ))}
              </div>
            );
          }) : <p className="muted">No visiting teachers are timetabled on this day.</p>}
        </div>
      </div>

      {dialog && <AbsenceEditor kind={dialog} rows={rows} date={date} call={call} onClose={() => setDialog(null)} onDone={m => { setDialog(null); reload(); toast(m); }} />}
    </>
  );
}

function Candidates({ need, date, rows, onPick }: { need: Need; date: string; rows: ScheduleRows; onPick: (c: Candidate, overCap?: boolean) => Promise<void> }) {
  const { ranked, atCap } = useMemo(() => candidatesFor(need, date, rows), [need, date, rows]);
  const [showCap, setShowCap] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const pick = async (c: Candidate, overCap?: boolean) => { setBusy(c.person); try { await onPick(c, overCap); } finally { setBusy(null); } };
  const line = (c: Candidate) => [c.sameSubject ? `teaches ${need.subject}` : '', c.teachesClass ? `teaches ${need.classes}` : '',
    `${plural(c.coversTerm, 'cover')} this term`, `${plural(c.lessonsToday, 'lesson')} that day`].filter(Boolean).join(' · ');
  return (
    <div style={{ background: '#F7F9FB', borderRadius: 14, padding: 14, margin: '0 0 12px' }}>
      {ranked.length ? ranked.slice(0, 8).map((c, i) => (
        <button key={c.person} className="sch-cand" disabled={!!busy} onClick={() => pick(c)}>
          <div className="m"><b>{c.name}</b> {i === 0 && <Chip tone="g">BEST FIT</Chip>}<div>{line(c)}</div></div>
          <span className="btn sm pri" aria-hidden="true">{busy === c.person ? 'Assigning…' : 'Assign'}</span>
        </button>
      )) : <p className="muted">Nobody is free for this period.{atCap.length ? ' Some teachers are free but already have two covers that day.' : ''}</p>}
      {ranked.length > 8 && <p className="muted" style={{ fontSize: 12 }}>and {ranked.length - 8} more free</p>}
      {atCap.length > 0 && (
        <>
          <button className="btn sm" onClick={() => setShowCap(v => !v)}>{showCap ? 'Hide' : 'Show'} {plural(atCap.length, 'teacher')} already at two covers</button>
          {showCap && <div style={{ marginTop: 8 }}>{atCap.map(c => (
            <button key={c.person} className="sch-cand" disabled={!!busy} onClick={() => pick(c, true)}>
              <div className="m"><b>{c.name}</b><div>{plural(c.coversToday, 'cover')} that day already · {line(c)}</div></div>
              <span className="btn sm" aria-hidden="true">Assign anyway</span>
            </button>
          ))}</div>}
        </>
      )}
    </div>
  );
}

function AbsenceEditor({ kind, rows, date, call, onClose, onDone }: { kind: 'absent' | 'release'; rows: ScheduleRows; date: string; call: Call; onClose: () => void; onDone: (m: string) => void }) {
  const [who, setWho] = useState('');
  const [portion, setPortion] = useState<'full' | 'am' | 'pm'>('full');
  const [periods, setPeriods] = useState<number[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const theirs = useMemo(() => (who ? lessonsOn(date, rows).filter(l => personKey(l.slot.teacher_id, l.slot.staff_member_id) === who) : []), [who, date, rows]);
  return (
    <Pop title={kind === 'absent' ? `Mark absent · ${fmtDate(date)}` : `Release for periods · ${fmtDate(date)}`}
      sub={kind === 'absent' ? 'Their lessons that day go on the board for cover.' : 'For training, an event or another duty: the periods you pick go on the board for cover.'} onClose={onClose}>
      <div className="cmp-fld"><label htmlFor="ab-w">WHO</label><PersonSelect id="ab-w" value={who} onChange={setWho} options={peopleOptions(rows, date)} /></div>
      {kind === 'absent' ? (
        <div className="cmp-fld"><label>HOW LONG</label>
          <div className="sch-days">{(['full', 'am', 'pm'] as const).map(p => (
            <button key={p} type="button" aria-pressed={portion === p} className={portion === p ? 'on' : ''} style={{ width: 'auto', padding: '0 14px' }} onClick={() => setPortion(p)}>{p === 'full' ? 'Full day' : p === 'am' ? 'Morning' : 'Afternoon'}</button>
          ))}</div>
        </div>
      ) : (
        <div className="cmp-fld"><label>PERIODS</label>
          {who && !theirs.length && <p className="muted">They have no lessons on this day.</p>}
          <div className="sch-days">{theirs.sort((a, b) => a.start - b.start).map(l => (
            <button key={l.slot.id} type="button" aria-pressed={periods.includes(l.slot.period_no)} className={periods.includes(l.slot.period_no) ? 'on' : ''} style={{ width: 'auto', padding: '0 12px' }}
              onClick={() => setPeriods(ps => (ps.includes(l.slot.period_no) ? ps.filter(x => x !== l.slot.period_no) : [...ps, l.slot.period_no]))}>P{l.slot.period_no} {l.slot.class}</button>
          ))}</div>
        </div>
      )}
      {kind === 'absent' && who && <p className="muted" style={{ fontSize: 12.5 }}>{plural(theirs.length, 'lesson')} that day.</p>}
      <div className="cmp-fld"><label htmlFor="ab-r">REASON {kind === 'absent' ? '(OPTIONAL, ONLY THE OFFICE SEES IT)' : ''}</label><input id="ab-r" className="cmp-in" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder={kind === 'absent' ? 'Unwell' : 'CBSE training workshop'} /></div>
      {err && <div className="err" role="alert">{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || !who || (kind === 'release' && (!periods.length || !reason.trim()))} onClick={async () => {
          if (await run(setBusy, setErr, () => call(API, 'POST', kind === 'absent' ? { action: 'absent', person: who, date, portion, reason } : { action: 'release', person: who, date, periods, reason }))) {
            onDone(kind === 'absent' ? 'Marked absent. Their lessons are on the board.' : 'Released. Those periods are on the board.');
          }
        }}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Pop>
  );
}
