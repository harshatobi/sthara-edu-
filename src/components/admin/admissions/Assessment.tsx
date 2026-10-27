'use client';

import { useState } from 'react';
import { CalendarPlusIcon as CalendarPlus } from '@phosphor-icons/react/dist/ssr/CalendarPlus';
import { Chip, Empty, Skeleton, type Tone } from '@/components/canon/ui';
import { useGet } from '@/components/canon/useGet';
import type { AssessmentRules } from '@/lib/admin/merit';
import { fmtDate } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { GRADES, gradeLabel } from '@/lib/students/register';
import { CardHead, Field, Workspace } from '../kit';

/** The admission assessment in the office (admissions phase 4a): an applicant's booking and score, the slots, the merit list. */

interface Slot { id: string; grade: number | null; starts_at: string; minutes: number; place: string | null; capacity: number; note: string | null; cancelled_at: string | null; booked: number; when: string }
interface Booking { id: string; status: 'booked' | 'attended' | 'no_show' | 'cancelled'; score: number | null; note: string | null; booked_at: string; slot: Slot | null; byFamily: boolean }
interface ForApplicant { score: number | null; maxScore: number; bookings: Booking[]; open: Slot[] }

const BOOK_TONE: Record<Booking['status'], Tone> = { booked: 'b', attended: 'g', no_show: 'r', cancelled: 'n' };
const BOOK_LABEL: Record<Booking['status'], string> = { booked: 'BOOKED', attended: 'SAT IT', no_show: 'DID NOT COME', cancelled: 'CANCELLED' };

export function AssessmentCard({ applicantId, open, canManage, onChanged }: { applicantId: string; open: boolean; canManage: boolean; onChanged: (m: string) => void }) {
  const { call } = useAdminDesk();
  const { data, error, reload } = useGet<ForApplicant>(`/api/admin/admissions/assessment?applicant=${applicantId}`);
  const [slot, setSlot] = useState('');
  const [score, setScore] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const post = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true); setErr(null);
    try { await call('/api/admin/admissions/assessment', 'POST', body); reload(); onChanged(msg); setScore(''); setNote(''); setSlot(''); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };
  if (error) return <div className="note err" style={{ marginBottom: 16 }}>{error}</div>;
  if (!data) return <div className="card" style={{ marginBottom: 16 }}><Skeleton h={20} /></div>;
  const live = data.bookings.find(b => b.status === 'booked');
  const due = live?.slot && new Date(live.slot.starts_at) <= new Date();
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <CardHead title="Assessment" sub={data.score != null ? `Score ${data.score} of ${data.maxScore}.` : live?.slot ? `Booked: ${live.slot.when}${live.slot.place ? `, ${live.slot.place}` : ''}${live.byFamily ? ' (by the family)' : ''}.` : 'Not booked.'}
        right={data.score != null && <Chip tone="g">{`${data.score} / ${data.maxScore}`}</Chip>} />
      {err && <div className="note err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {canManage && open && live && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
          <Field label={`SCORE (0 TO ${data.maxScore})`} htmlFor="as-score"><input id="as-score" className="cmp-in" style={{ width: 120 }} inputMode="decimal" value={score} onChange={e => setScore(e.target.value)} /></Field>
          <Field label="NOTE (OPTIONAL)" htmlFor="as-note"><input id="as-note" className="cmp-in" maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></Field>
          <button className="btn pri" disabled={busy || score.trim() === ''} onClick={() => post({ action: 'result', bookingId: live.id, status: 'attended', score, note }, 'Score saved')}>Save score</button>
          <button className="btn" disabled={busy} onClick={() => post({ action: 'result', bookingId: live.id, status: 'no_show' }, 'Marked as did not come')}>Did not come</button>
          {!due && <button className="btn" disabled={busy} onClick={() => post({ action: 'cancel-booking', applicantId }, 'Booking cancelled')}>Cancel booking</button>}
        </div>
      )}
      {canManage && open && (
        data.open.length ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
            <Field label={live ? 'MOVE TO ANOTHER SLOT' : 'BOOK A SLOT'} htmlFor="as-slot">
              <select id="as-slot" className="cmp-sel" value={slot} onChange={e => setSlot(e.target.value)}>
                <option value="">Pick a slot</option>
                {data.open.filter(s => s.id !== live?.slot?.id).map(s => <option key={s.id} value={s.id}>{s.when}{s.place ? `, ${s.place}` : ''} · {s.capacity - s.booked} left</option>)}
              </select>
            </Field>
            <button className="btn pri" disabled={busy || !slot} onClick={() => post({ action: 'book', applicantId, slotId: slot }, 'Booked')}><CalendarPlus size={14} /> Book</button>
          </div>
        ) : <p className="muted" style={{ fontSize: 13 }}>No open slots for this class. Add some in Set up › Assessment.</p>
      )}
      {data.bookings.filter(b => b !== live).map(b => (
        <div className="row" key={b.id}>
          <span style={{ flex: 1, fontSize: 13 }}>{b.slot?.when ?? 'A slot since removed'}{b.note ? ` · ${b.note}` : ''}</span>
          <Chip tone={BOOK_TONE[b.status]}>{b.status === 'attended' && b.score != null ? `SCORED ${b.score}` : BOOK_LABEL[b.status]}</Chip>
        </div>
      ))}
    </div>
  );
}

/** Set up › Assessment: the highest score, family booking, merit points, and the slots of the admission year. */
export function AssessmentSetup({ session, rules, onSaved }: { session: string; rules: AssessmentRules; onSaved: (m: string) => void }) {
  const { call } = useAdminDesk();
  const { data, reload } = useGet<{ slots: Slot[] }>(`/api/admin/admissions/assessment?slots=1&session=${session}`);
  const [r, setR] = useState({ maxScore: String(rules.maxScore), familyBooking: rules.familyBooking, siblingPoints: String(rules.siblingPoints), staffPoints: String(rules.staffPoints) });
  const [s, setS] = useState({ day: '', time: '10:00', minutes: '60', capacity: '20', grade: '', place: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (f: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErr(null);
    try { await f(); onSaved(msg); reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };
  const ahead = (data?.slots || []).filter(x => !x.cancelled_at && new Date(x.starts_at) > new Date());
  const past = (data?.slots || []).filter(x => x.cancelled_at || new Date(x.starts_at) <= new Date());
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <CardHead title="Score and merit" sub="One score per applicant. The merit list ranks a class by the score plus these points; the waitlist of a full class fills in merit order." />
        <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Field label="HIGHEST SCORE" htmlFor="ar-max"><input id="ar-max" className="cmp-in" inputMode="numeric" value={r.maxScore} onChange={e => setR(x => ({ ...x, maxScore: e.target.value }))} /></Field>
          <Field label="POINTS FOR A SIBLING AT SCHOOL" htmlFor="ar-sib"><input id="ar-sib" className="cmp-in" inputMode="decimal" value={r.siblingPoints} onChange={e => setR(x => ({ ...x, siblingPoints: e.target.value }))} /></Field>
          <Field label="POINTS FOR A STAFF WARD" htmlFor="ar-staff"><input id="ar-staff" className="cmp-in" inputMode="decimal" value={r.staffPoints} onChange={e => setR(x => ({ ...x, staffPoints: e.target.value }))} /></Field>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, margin: '6px 0 12px' }}>
          <input type="checkbox" checked={r.familyBooking} onChange={e => setR(x => ({ ...x, familyBooking: e.target.checked }))} /> Families book a slot themselves on the apply page once they have sent the application
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn pri" disabled={busy} onClick={() => run(() => call('/api/admin/admissions/setup', 'POST', { kind: 'assessment', ...r }), 'Assessment rules saved')}>Save</button>
        </div>
      </div>
      <div className="card">
        <CardHead title={`Assessment slots · AY ${session.replace('-', '–')}`} sub="A time, a place and how many can sit. Cancelling a slot unbooks everyone in it and puts them on your follow-up list." />
        <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="DAY" htmlFor="sl-day"><input id="sl-day" type="date" className="cmp-in" value={s.day} onChange={e => setS(x => ({ ...x, day: e.target.value }))} /></Field>
          <Field label="TIME" htmlFor="sl-time"><input id="sl-time" type="time" className="cmp-in" value={s.time} onChange={e => setS(x => ({ ...x, time: e.target.value }))} /></Field>
          <Field label="MINUTES" htmlFor="sl-min"><input id="sl-min" className="cmp-in" inputMode="numeric" value={s.minutes} onChange={e => setS(x => ({ ...x, minutes: e.target.value }))} /></Field>
          <Field label="SEATS" htmlFor="sl-cap"><input id="sl-cap" className="cmp-in" inputMode="numeric" value={s.capacity} onChange={e => setS(x => ({ ...x, capacity: e.target.value }))} /></Field>
          <Field label="CLASS" htmlFor="sl-grade">
            <select id="sl-grade" className="cmp-sel" value={s.grade} onChange={e => setS(x => ({ ...x, grade: e.target.value }))}>
              <option value="">Every class</option>
              {GRADES.map(g => <option key={g} value={String(g)}>{gradeLabel(g)}</option>)}
            </select>
          </Field>
          <Field label="PLACE" htmlFor="sl-place"><input id="sl-place" className="cmp-in" maxLength={120} value={s.place} onChange={e => setS(x => ({ ...x, place: e.target.value }))} placeholder="Room 12, main block" /></Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '10px 0 14px' }}>
          <button className="btn pri" disabled={busy || !s.day || !s.time} onClick={() => run(() => call('/api/admin/admissions/assessment', 'POST', {
            action: 'add-slot', session, startsAt: new Date(`${s.day}T${s.time}:00+05:30`).toISOString(), minutes: Number(s.minutes), capacity: Number(s.capacity),
            grade: s.grade === '' ? null : Number(s.grade), place: s.place, note: s.note,
          }), 'Slot added')}><CalendarPlus size={14} /> Add slot</button>
        </div>
        {err && <div className="err" role="alert" style={{ marginBottom: 10 }}>{err}</div>}
        {!data ? <Skeleton h={20} /> : !ahead.length && !past.length ? (
          <Empty icon={<CalendarPlus size={26} weight="duotone" />} title="No slots yet">Add the days and times children can sit the assessment.</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>When</th><th>Class</th><th>Place</th><th className="c">Booked</th><th /></tr></thead>
              <tbody>{[...ahead, ...past].map(x => (
                <tr key={x.id} style={{ opacity: x.cancelled_at || new Date(x.starts_at) <= new Date() ? 0.6 : 1 }}>
                  <td>{x.when}</td>
                  <td>{x.grade == null ? 'Every class' : gradeLabel(x.grade)}</td>
                  <td>{x.place ?? '—'}</td>
                  <td className="c num">{x.booked} / {x.capacity}</td>
                  <td className="r">{x.cancelled_at ? <Chip tone="n">CANCELLED</Chip> : new Date(x.starts_at) <= new Date() ? <Chip tone="n">DONE</Chip>
                    : <button className="btn sm" disabled={busy} onClick={() => run(() => call('/api/admin/admissions/assessment', 'POST', { action: 'cancel-slot', slotId: x.id }), 'Slot cancelled')}>Cancel</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

interface MeritLine { id: string; name: string; score: number | null; sibling: boolean; staff: boolean; bonus: number; merit: number | null; rank: number | null; appliedOn: string | null; createdAt: string; stage: string }

/** The merit list of a class: rank, score, points, and where each applicant is. */
export function MeritList({ session, stageName, onClose, onOpen }: { session: string; stageName: (k: string) => string; onClose: () => void; onOpen: (id: string) => void }) {
  const [grade, setGrade] = useState<number>(1);
  const { data, error } = useGet<{ rules: AssessmentRules; lines: MeritLine[] }>(`/api/admin/admissions/assessment?merit=${grade}&session=${session}`);
  return (
    <Workspace wide title={`Merit list · AY ${session.replace('-', '–')}`} sub="Score plus the sibling and staff-ward points; equal merit goes to whoever applied first. Propose offers from the top." onClose={onClose}>
      <div style={{ marginBottom: 14, maxWidth: 260 }}>
        <Field label="CLASS" htmlFor="ml-grade">
          <select id="ml-grade" className="cmp-sel" value={grade} onChange={e => setGrade(Number(e.target.value))}>
            {GRADES.map(g => <option key={g} value={g}>{gradeLabel(g)}</option>)}
          </select>
        </Field>
      </div>
      <div className="card">
        {error ? <div className="note err">{error}</div> : !data ? <Skeleton h={22} /> : !data.lines.length ? (
          <Empty icon={<CalendarPlus size={26} weight="duotone" />} title="Nobody in this class yet">Open applicants appear here; ranked once they have a score.</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th className="c">Rank</th><th>Applicant</th><th className="c">Score</th><th className="c">Points</th><th className="c">Merit</th><th>Stage</th><th>Applied</th></tr></thead>
              <tbody>{data.lines.map(l => (
                <tr key={l.id} className="click" onClick={() => onOpen(l.id)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpen(l.id); }}>
                  <td className="c num"><b>{l.rank ?? '—'}</b></td>
                  <td><b>{l.name}</b>{l.sibling && <> <Chip tone="p">SIBLING</Chip></>}{l.staff && <> <Chip tone="p">STAFF WARD</Chip></>}</td>
                  <td className="c num">{l.score ?? <span className="muted">No score</span>}</td>
                  <td className="c num">{l.bonus ? `+${l.bonus}` : '—'}</td>
                  <td className="c num"><b>{l.merit ?? '—'}</b></td>
                  <td>{stageName(l.stage)}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{fmtDate(l.appliedOn ?? l.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </Workspace>
  );
}
