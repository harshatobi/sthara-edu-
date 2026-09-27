'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { CaretLeftIcon as CaretLeft } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon as CaretRight } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { UploadSimpleIcon as UploadSimple } from '@phosphor-icons/react/dist/ssr/UploadSimple';
import { FingerprintIcon as Fingerprint } from '@phosphor-icons/react/dist/ssr/Fingerprint';
import { GearIcon as Gear } from '@phosphor-icons/react/dist/ssr/Gear';
import { CalendarBlankIcon as CalendarBlank } from '@phosphor-icons/react/dist/ssr/CalendarBlank';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { MapPinIcon as MapPin } from '@phosphor-icons/react/dist/ssr/MapPin';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { CardHead, Kpi, downloadCsv } from '@/components/admin/kit';
import { LEAVE_TYPES } from '@/lib/admin/constants';
import { fmtDate, plural } from '@/lib/admin/format';
import { dayOf, hm, localOf, monthOf, parsePunchTable, type Day, type Person } from '@/lib/attendance/engine';
import { useAttendance } from '@/lib/attendance/useAttendance';
import { parseCsv, readXlsx } from '@/lib/schedule/importer';
import { addDays, hhmm, weekdayOf } from '@/lib/schedule/engine';
import { DAY_NAMES } from '@/lib/schedule/types';
import Pop, { run } from '@/components/schedule/Pop';
import { STATUS } from '@/components/schedule/CheckInCard';

type Call = <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const API = '/api/admin/attendance';
const KIND: Record<Person['kind'], string> = { teacher: 'Teacher', office: 'Office', register: 'Staff' };
const SRC: Record<string, string> = { register: 'register', override: 'correction', biometric: 'biometric', app: 'app', whatsapp: 'WhatsApp' };
const t = (m: number | null) => (m === null ? '—' : hhmm(hm(m), true));

/**
 * Staff attendance (schedule.workforce edits; workforce.read reads): the day's board, register marks and
 * corrections, biometric import and devices, settings and rules, leave for staff with no login, month review.
 */
export default function AttendanceTab({ toast, canEdit }: { toast: (m: string) => void; canEdit: boolean }) {
  // The school-local clock, read once when the board opens.
  const [now] = useState(() => localOf(Date.now()));
  const [date, setDate] = useState(now.date);
  const [month, setMonth] = useState(now.date.slice(0, 7));
  const monthFirst = `${month}-01`;
  const monthLast = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const from = date < monthFirst ? date : monthFirst, to = date > monthLast ? date : monthLast;
  const { data, error, reload, call } = useAttendance(from, to);
  const [marking, setMarking] = useState<{ p: Person; d: Day } | null>(null);
  const [dialog, setDialog] = useState<null | 'import' | 'settings' | 'leave' | 'device'>(null);
  const [filter, setFilter] = useState<'all' | 'teacher' | 'office' | 'register' | 'issues'>('all');

  // The no-show check runs whenever the board is opened on a school day (idempotent).
  useEffect(() => { if (date === now.date) call(API, 'POST', { entity: 'noshow_check' }).catch(() => {}); }, [date, now.date, call]);

  const days = useMemo(() => (data ? data.people.map(p => ({ p, d: dayOf(date, p, data.rows, date === now.date ? now.min : null) })) : []), [data, date, now.date, now.min]);
  if (error) return <div className="note err" role="alert">Couldn&apos;t load attendance: {error}</div>;
  if (!data) return <div className="card" aria-busy="true">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={44} style={{ marginBottom: 12 }} />)}</div>;
  if (data.missing.length) return <div className="card"><Empty icon={<Fingerprint size={26} weight="duotone" />} title="Attendance isn't switched on yet">The staff attendance tables arrive with the attendance migration.</Empty></div>;

  const count = (s: string[]) => days.filter(x => s.includes(x.d.status)).length;
  const shown = days.filter(x => filter === 'all' || (filter === 'issues' ? ['late', 'absent', 'not_in', 'half_day'].includes(x.d.status) || x.d.flags.length > 0 : x.p.kind === filter))
    .filter(x => x.d.status !== 'off' || filter === 'all');

  return (
    <>
      <div className="sch-bar">
        <button className="btn sm" aria-label="Previous day" onClick={() => setDate(d => addDays(d, -1))}><CaretLeft size={14} weight="bold" /></button>
        <button className="btn sm" onClick={() => setDate(now.date)} disabled={date === now.date}>Today</button>
        <button className="btn sm" aria-label="Next day" disabled={date >= now.date} onClick={() => setDate(d => addDays(d, 1))}><CaretRight size={14} weight="bold" /></button>
        <input type="date" className="sch-sel" aria-label="Date" max={now.date} value={date} onChange={e => e.target.value && setDate(e.target.value)} />
        <b style={{ fontSize: 15 }}>{DAY_NAMES[weekdayOf(date)]}, {fmtDate(date)}</b>
        <span className="sp" />
        {canEdit && <>
          <button className="btn sm" onClick={() => setDialog('import')}><UploadSimple size={13} /> Import biometric</button>
          <button className="btn sm" onClick={() => setDialog('leave')}><CalendarBlank size={13} /> Leave for staff</button>
          <button className="btn sm" onClick={() => setDialog('settings')}><Gear size={13} /> Settings</button>
        </>}
      </div>

      <div className="kpis">
        <Kpi label="PRESENT" value={count(['present', 'late', 'half_day'])} note={`${count(['late'])} late`} valueColor="var(--green)" />
        <Kpi label={date === now.date ? 'NOT IN YET' : 'ABSENT'} value={count(date === now.date ? ['not_in'] : ['absent'])} valueColor={count(['not_in', 'absent']) ? 'var(--red)' : undefined}
          note={date === now.date ? `${count(['absent'])} absent after the day ended` : 'Expected but no record'} />
        <Kpi label="ON LEAVE" value={count(['leave'])} />
        <Kpi label="OFF" value={count(['off'])} note="Weekly off, holiday or not rostered" />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="The day" sub="A supervisor's register mark or an HR correction beats the biometric device, which beats app and WhatsApp check-ins. Every punch is kept." />
        <div className="sch-seg" role="tablist" aria-label="Who" style={{ marginBottom: 14 }}>
          {(['all', 'issues', 'teacher', 'office', 'register'] as const).map(f => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'Everyone' : f === 'issues' ? 'Needs a look' : f === 'register' ? 'Support staff' : KIND[f]}</button>
          ))}
        </div>
        {shown.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Expected</th><th className="c">In</th><th className="c">Out</th><th>Status</th>{canEdit && <th />}</tr></thead>
              <tbody>{shown.map(({ p, d }) => (
                <tr key={p.key}>
                  <td><b>{p.name}</b><div className="muted" style={{ fontSize: 12 }}>{KIND[p.kind]}{p.employeeCode ? ` · ${p.employeeCode}` : ''}</div></td>
                  <td style={{ fontSize: 13 }}>{d.expected.kind === 'work' ? `${d.expected.label}, ${t(d.expected.start)}–${t(d.expected.end)}` : d.expected.kind === 'leave' ? `Leave (${LEAVE_TYPES[d.expected.label] || d.expected.label})` : 'Off'}</td>
                  <td className="c num">{t(d.inMin)}</td>
                  <td className="c num">{t(d.outMin)}</td>
                  <td>
                    <Chip tone={STATUS[d.status].tone}>{STATUS[d.status].t}</Chip>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                      {[d.lateMin ? `${d.lateMin} min late` : '', d.flags.includes('short') ? 'short day' : '', d.flags.includes('no_out') ? 'no check-out' : '', d.flags.includes('off_campus') ? 'off campus' : '', d.flags.includes('early_out') ? 'left early' : '', d.source ? `via ${SRC[d.source]}` : ''].filter(Boolean).join(' · ')}
                      {d.mark?.reason ? ` · "${d.mark.reason}"` : ''}
                    </div>
                  </td>
                  {canEdit && <td className="r"><button className="btn sm" onClick={() => setMarking({ p, d })}>{d.mark ? 'Change' : 'Mark'}</button></td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted">Nobody here for this view.</p>}
      </div>

      <MonthReview data={data} month={month} setMonth={setMonth} today={now.date} canEdit={canEdit} call={call} reload={reload} toast={toast} />

      {canEdit && <Devices data={data} call={call} reload={reload} toast={toast} onAdd={() => setDialog('device')} />}

      {marking && <MarkEditor p={marking.p} d={marking.d} date={date} call={call} onClose={() => setMarking(null)} onSaved={() => { setMarking(null); reload(); toast('Saved'); }} />}
      {dialog === 'import' && <ImportPunches people={data.people} call={call} onClose={() => setDialog(null)} onDone={m => { setDialog(null); reload(); toast(m); }} />}
      {dialog === 'settings' && <SettingsEditor data={data} call={call} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); reload(); toast('Settings saved'); }} />}
      {dialog === 'leave' && <RegisterLeave data={data} call={call} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); toast('Leave request saved. Approve it in Staff & Leave.'); }} />}
      {dialog === 'device' && <AddDevice call={call} onClose={() => { setDialog(null); reload(); }} />}
    </>
  );
}

function MarkEditor({ p, d, date, call, onClose, onSaved }: { p: Person; d: Day; date: string; call: Call; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ status: d.mark?.status || (d.inMin !== null ? 'present' : 'absent'), inAt: d.mark?.in_at || (d.inMin !== null ? hm(d.inMin) : ''), outAt: d.mark?.out_at || (d.outMin !== null ? hm(d.outMin % 1440) : ''), source: d.mark?.source || (d.inMin !== null ? 'override' : 'register'), reason: d.mark?.reason || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title={`${p.name} · ${fmtDate(date)}`} sub="A register mark is the supervisor's attendance for the day. A correction overrides the device or check-ins and needs a reason (it's audited)." onClose={onClose}>
      <div className="sch-fields">
        <div className="cmp-fld"><label htmlFor="mk-s">STATUS</label>
          <select id="mk-s" className="cmp-sel" value={v.status} onChange={e => setV({ ...v, status: e.target.value as any })}>
            <option value="present">Present</option><option value="half_day">Half day</option><option value="absent">Absent</option><option value="off">Off</option>
          </select></div>
        <div className="cmp-fld"><label htmlFor="mk-t">KIND</label>
          <select id="mk-t" className="cmp-sel" value={v.source} onChange={e => setV({ ...v, source: e.target.value as any })}>
            <option value="register">Register mark</option><option value="override">Correction</option>
          </select></div>
        {(v.status === 'present' || v.status === 'half_day') && <>
          <div className="cmp-fld"><label htmlFor="mk-i">IN</label><input id="mk-i" type="time" className="cmp-in" value={v.inAt} onChange={e => setV({ ...v, inAt: e.target.value })} /></div>
          <div className="cmp-fld"><label htmlFor="mk-o">OUT</label><input id="mk-o" type="time" className="cmp-in" value={v.outAt} onChange={e => setV({ ...v, outAt: e.target.value })} /></div>
        </>}
      </div>
      <div className="cmp-fld"><label htmlFor="mk-r">REASON {v.source === 'override' ? '(REQUIRED)' : '(OPTIONAL)'}</label><input id="mk-r" className="cmp-in" maxLength={300} value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} placeholder="Device was down at the gate" /></div>
      {err && <div className="err" role="alert">{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        {d.mark && <button className="btn" disabled={busy} onClick={async () => { if (await run(setBusy, setErr, () => call(API, 'DELETE', { entity: 'mark', id: (d.mark as any).id }))) onSaved(); }}>Remove mark</button>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || (v.source === 'override' && !v.reason.trim())} onClick={async () => {
          if (await run(setBusy, setErr, () => call(API, 'PUT', { entity: 'mark', person: p.key, date, status: v.status, inAt: v.inAt || null, outAt: v.outAt || null, source: v.source, reason: v.reason }))) onSaved();
        }}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Pop>
  );
}

function ImportPunches({ people, call, onClose, onDone }: { people: Person[]; call: Call; onClose: () => void; onDone: (m: string) => void }) {
  const [parsed, setParsed] = useState<ReturnType<typeof parsePunchTable> | null>(null);
  const [file, setFile] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const codes = new Set(people.map(p => (p.employeeCode || '').toLowerCase()).filter(Boolean));
  const unmatched = parsed ? [...new Set(parsed.punches.map(p => p.code).filter(c => !codes.has(c.toLowerCase())))] : [];
  return (
    <Pop wide title="Import biometric punches" onClose={onClose}
      sub="Export the day (or month) from the device software as CSV or Excel. Sthara matches each row to a person by the employee code on the staff register; importing the same file twice is harmless.">
      <label className="btn" style={{ cursor: 'pointer' }}>
        <UploadSimple size={15} /> {file ? 'Choose another file' : 'Choose the export'}
        <input type="file" hidden accept=".csv,.txt,.xlsx" onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          setFile(f.name); setErr(null);
          try { setParsed(parsePunchTable(f.name.toLowerCase().endsWith('.xlsx') ? await readXlsx(await f.arrayBuffer()) : parseCsv(await f.text()))); }
          catch (x: any) { setErr(x.message); }
        }} />
      </label>
      {file && <span className="muted" style={{ marginLeft: 10 }}>{file}</span>}
      {parsed && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <Chip tone={parsed.punches.length ? 'g' : 'r'}>{plural(parsed.punches.length, 'PUNCH', 'PUNCHES')}</Chip>
            {unmatched.length > 0 && <Chip tone="a">{plural(unmatched.length, 'UNKNOWN CODE')}</Chip>}
          </div>
          {parsed.problems.length > 0 && <div className="note" style={{ marginBottom: 10 }}>{parsed.problems.map((p, i) => <div key={i}>{p}</div>)}</div>}
          {unmatched.length > 0 && <p style={{ fontSize: 13 }}>No one on the register has these codes, so their rows are skipped: {unmatched.slice(0, 20).join(', ')}{unmatched.length > 20 ? '…' : ''}. Add the codes in the staff register first.</p>}
        </div>
      )}
      {err && <div className="err" role="alert" style={{ marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || !parsed?.punches.length} onClick={async () => {
          let r = { imported: 0, duplicates: 0, unmatched: [] as string[] };
          if (await run(setBusy, setErr, async () => { r = await call(API, 'POST', { entity: 'import', punches: parsed!.punches }); })) {
            onDone(`Imported ${plural(r.imported, 'punch', 'punches')}${r.duplicates ? `, ${r.duplicates} already there` : ''}${r.unmatched.length ? `, ${r.unmatched.length} unknown codes skipped` : ''}`);
          }
        }}>{busy ? 'Importing…' : 'Import'}</button>
      </div>
    </Pop>
  );
}

function SettingsEditor({ data, call, onClose, onSaved }: { data: NonNullable<ReturnType<typeof useAttendance>['data']>; call: Call; onClose: () => void; onSaved: () => void }) {
  const s = data.rows.settings;
  const [v, setV] = useState({
    teacherStart: s.teacher_start, teacherEnd: s.teacher_end, officeStart: s.office_start, officeEnd: s.office_end, graceMin: String(s.grace_min),
    latesRule: s.lates_rule, latesPerHalfDay: String(s.lates_per_half_day), shortRule: s.short_rule, minFullHours: String(s.min_full_hours), absentRule: s.absent_rule,
    geofenceLat: s.geofence_lat === null ? '' : String(s.geofence_lat), geofenceLng: s.geofence_lng === null ? '' : String(s.geofence_lng), geofenceRadius: String(s.geofence_radius_m), noshowAlerts: s.noshow_alerts,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = (k: 'latesRule' | 'shortRule' | 'absentRule' | 'noshowAlerts', label: string) => (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '6px 0' }}><input type="checkbox" checked={v[k]} onChange={e => setV({ ...v, [k]: e.target.checked })} /> {label}</label>
  );
  return (
    <Pop wide title="Attendance settings" sub="Rules only propose deductions; HR or the principal confirms or waives them in the month review before payroll. Switch every rule off to just record." onClose={onClose}>
      <div className="sch-fields">
        <div className="cmp-fld"><label htmlFor="st-1">TEACHERS REPORT</label><input id="st-1" type="time" className="cmp-in" value={v.teacherStart} onChange={e => setV({ ...v, teacherStart: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="st-2">TEACHERS&apos; DAY ENDS</label><input id="st-2" type="time" className="cmp-in" value={v.teacherEnd} onChange={e => setV({ ...v, teacherEnd: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="st-3">OFFICE OPENS</label><input id="st-3" type="time" className="cmp-in" value={v.officeStart} onChange={e => setV({ ...v, officeStart: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="st-4">OFFICE CLOSES</label><input id="st-4" type="time" className="cmp-in" value={v.officeEnd} onChange={e => setV({ ...v, officeEnd: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="st-5">GRACE (MINUTES)</label><input id="st-5" className="cmp-in" inputMode="numeric" value={v.graceMin} onChange={e => setV({ ...v, graceMin: e.target.value.replace(/\D/g, '') })} /></div>
      </div>
      <div className="lbl" style={{ marginTop: 6 }}>RULES</div>
      {box('absentRule', 'An absence without leave proposes a day of loss of pay')}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {box('latesRule', 'Every')}<input aria-label="Lates per half day" className="cmp-in" style={{ width: 70, padding: '6px 10px' }} inputMode="numeric" value={v.latesPerHalfDay} onChange={e => setV({ ...v, latesPerHalfDay: e.target.value.replace(/\D/g, '') })} /><span style={{ fontSize: 13 }}>lates in a month propose a half day</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {box('shortRule', 'A day under')}<input aria-label="Hours for a full day" className="cmp-in" style={{ width: 70, padding: '6px 10px' }} inputMode="decimal" value={v.minFullHours} onChange={e => setV({ ...v, minFullHours: e.target.value.replace(/[^\d.]/g, '') })} /><span style={{ fontSize: 13 }}>hours proposes a half day</span>
      </div>
      {box('noshowAlerts', 'No-show alerts: WhatsApp a teacher who hasn\'t checked in by reporting time + grace, and alert whoever arranges cover')}
      <div className="lbl" style={{ marginTop: 12 }}>CAMPUS LOCATION (FOR APP CHECK-IN)</div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Check-ins are compared with this point and only &quot;on campus: yes or no&quot; is kept; nobody&apos;s coordinates are stored.</p>
      <div className="sch-fields">
        <div className="cmp-fld"><label htmlFor="st-la">LATITUDE</label><input id="st-la" className="cmp-in" value={v.geofenceLat} onChange={e => setV({ ...v, geofenceLat: e.target.value })} placeholder="17.385044" /></div>
        <div className="cmp-fld"><label htmlFor="st-lo">LONGITUDE</label><input id="st-lo" className="cmp-in" value={v.geofenceLng} onChange={e => setV({ ...v, geofenceLng: e.target.value })} placeholder="78.486671" /></div>
        <div className="cmp-fld"><label htmlFor="st-r">RADIUS (METRES)</label><input id="st-r" className="cmp-in" inputMode="numeric" value={v.geofenceRadius} onChange={e => setV({ ...v, geofenceRadius: e.target.value.replace(/\D/g, '') })} /></div>
      </div>
      <button className="btn sm" onClick={() => navigator.geolocation?.getCurrentPosition(p => setV(x => ({ ...x, geofenceLat: p.coords.latitude.toFixed(6), geofenceLng: p.coords.longitude.toFixed(6) })), () => setErr('Location wasn\'t shared.'))}><MapPin size={13} /> Use where I am now (at school)</button>
      {err && <div className="err" role="alert" style={{ marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy} onClick={async () => {
          if (await run(setBusy, setErr, () => call(API, 'PUT', {
            entity: 'settings', ...v, graceMin: Number(v.graceMin), latesPerHalfDay: Number(v.latesPerHalfDay), minFullHours: Number(v.minFullHours),
            geofenceLat: v.geofenceLat || null, geofenceLng: v.geofenceLng || null, geofenceRadius: Number(v.geofenceRadius),
          }))) onSaved();
        }}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Pop>
  );
}

function RegisterLeave({ data, call, onClose, onSaved }: { data: NonNullable<ReturnType<typeof useAttendance>['data']>; call: Call; onClose: () => void; onSaved: () => void }) {
  const register = data.staff.filter(s => !s.user_id && s.active);
  const [today] = useState(() => localOf(Date.now()).date);
  const [v, setV] = useState({ staffMemberId: '', type: 'casual', from: today, to: today, halfDay: false, reason: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title="Leave for staff with no login" sub="For drivers, security, ayahs and others who can't apply in the app. It goes to Staff & Leave for approval like any other request; they can also send LEAVE on WhatsApp if they agreed to messages." onClose={onClose}>
      <div className="sch-fields">
        <div className="cmp-fld"><label htmlFor="rl-p">WHO</label>
          <select id="rl-p" className="cmp-sel" value={v.staffMemberId} onChange={e => setV({ ...v, staffMemberId: e.target.value })}>
            <option value="">Pick someone</option>{register.map(s => <option key={s.id} value={s.id}>{s.name}{s.designation ? ` (${s.designation})` : ''}</option>)}
          </select></div>
        <div className="cmp-fld"><label htmlFor="rl-t">TYPE</label>
          <select id="rl-t" className="cmp-sel" value={v.type} onChange={e => setV({ ...v, type: e.target.value })}>{Object.entries(LEAVE_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="cmp-fld"><label htmlFor="rl-f">FROM</label><input id="rl-f" type="date" className="cmp-in" value={v.from} onChange={e => setV({ ...v, from: e.target.value, to: v.to < e.target.value ? e.target.value : v.to })} /></div>
        <div className="cmp-fld"><label htmlFor="rl-to">TO</label><input id="rl-to" type="date" className="cmp-in" min={v.from} value={v.halfDay ? v.from : v.to} disabled={v.halfDay} onChange={e => setV({ ...v, to: e.target.value })} /></div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 10 }}><input type="checkbox" checked={v.halfDay} onChange={e => setV({ ...v, halfDay: e.target.checked })} /> Half day</label>
      <div className="cmp-fld"><label htmlFor="rl-r">REASON</label><input id="rl-r" className="cmp-in" maxLength={1000} value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} /></div>
      {err && <div className="err" role="alert">{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || !v.staffMemberId || !v.reason.trim()} onClick={async () => {
          if (await run(setBusy, setErr, () => call(API, 'PUT', { entity: 'leave', ...v, to: v.halfDay ? v.from : v.to }))) onSaved();
        }}>{busy ? 'Saving…' : 'Save request'}</button>
      </div>
    </Pop>
  );
}

function Devices({ data, call, reload, toast, onAdd }: { data: NonNullable<ReturnType<typeof useAttendance>['data']>; call: Call; reload: () => void; toast: (m: string) => void; onAdd: () => void }) {
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <CardHead title="Biometric devices" sub="Devices can push punches straight to Sthara. Until a device is connected, export its punches and use Import biometric."
        right={<button className="btn sm" onClick={onAdd}><Fingerprint size={13} /> Connect a device</button>} />
      {data.devices.length ? data.devices.map(d => (
        <div className="row" key={d.id} style={{ opacity: d.active ? 1 : 0.5 }}>
          <span style={{ flex: 1 }}><b>{d.name}</b>{d.vendor && <span className="muted"> · {d.vendor}</span>}<div className="muted" style={{ fontSize: 12 }}>{d.last_seen_at ? `Last punch received ${new Date(d.last_seen_at).toLocaleString('en-IN')}` : 'Nothing received yet'}</div></span>
          {d.active ? <button className="btn sm" onClick={async () => { try { await call(API, 'DELETE', { entity: 'device', id: d.id }); reload(); toast('Device switched off'); } catch (e: any) { toast(e.message); } }}>Switch off</button> : <Chip tone="n">OFF</Chip>}
        </div>
      )) : <p className="muted">No devices connected.</p>}
    </div>
  );
}

function AddDevice({ call, onClose }: { call: Call; onClose: () => void }) {
  const [name, setName] = useState('');
  const [vendor, setVendor] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/api/attendance/device` : '/api/attendance/device';
  return (
    <Pop title="Connect a biometric device" onClose={onClose} sub="The device (or its vendor's cloud) sends punches to Sthara with a secret token. The token is shown once.">
      {!token ? (
        <>
          <div className="sch-fields">
            <div className="cmp-fld"><label htmlFor="dv-n">NAME</label><input id="dv-n" className="cmp-in" value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Main gate biometric" /></div>
            <div className="cmp-fld"><label htmlFor="dv-v">MAKE</label><input id="dv-v" className="cmp-in" value={vendor} maxLength={60} onChange={e => setVendor(e.target.value)} placeholder="eSSL, ZKTeco, Realtime" /></div>
          </div>
          {err && <div className="err" role="alert">{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn pri" disabled={busy || !name.trim()} onClick={async () => { await run(setBusy, setErr, async () => { const r = await call<{ token: string }>(API, 'POST', { entity: 'device', name, vendor }); setToken(r.token); }); }}>{busy ? 'Creating…' : 'Create token'}</button>
          </div>
        </>
      ) : (
        <>
          <div className="note info" style={{ marginBottom: 12 }}>Copy the token now: it isn&apos;t shown again. Switch the device off here to revoke it.</div>
          <div className="lbl">PUSH ADDRESS</div><div className="mono-blk" style={{ padding: '10px 14px', lineHeight: 1.6 }}>POST {url}</div>
          <div className="lbl" style={{ marginTop: 10 }}>TOKEN (Authorization: Bearer …)</div><div className="mono-blk" style={{ padding: '10px 14px', lineHeight: 1.6, wordBreak: 'break-all' }}>{token}</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Body: {'{ "punches": [{ "code": "E104", "at": "2026-10-05 07:52", "direction": "in" }] }'}. Most eSSL and ZKTeco devices push through their vendor cloud or the ADMS protocol; that connector is set up per school with the vendor.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button className="btn pri" onClick={onClose}>Done</button></div>
        </>
      )}
    </Pop>
  );
}

function MonthReview({ data, month, setMonth, today, canEdit, call, reload, toast }: {
  data: NonNullable<ReturnType<typeof useAttendance>['data']>; month: string; setMonth: (m: string) => void; today: string; canEdit: boolean; call: Call; reload: () => void; toast: (m: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [waived, setWaived] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const summaries = useMemo(() => data.people.map(p => ({ p, m: monthOf(`${month}-01`, p, data.rows, today), review: data.reviews.find(r => (r.user_id ?? `s:${r.staff_member_id}`) === p.key && String(r.month).slice(0, 7) === month) })), [data, month, today]);
  const confirm = async (key: string) => {
    setBusy(true);
    try { const r = await call<{ lopDays: number }>(API, 'POST', { entity: 'review', person: key, month, waived, note }); setOpen(null); reload(); toast(`Confirmed: ${r.lopDays} day${r.lopDays === 1 ? '' : 's'} loss of pay`); }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <CardHead title="Month review" sub="What the rules propose for each person. Confirm, or waive any item, before the month goes to payroll. A confirmed month is closed to register changes until you reopen it."
        right={<div style={{ display: 'flex', gap: 6 }}>
          <input type="month" className="sch-sel" aria-label="Month" max={today.slice(0, 7)} value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
          <button className="btn sm" onClick={() => downloadCsv(`attendance-${month}.csv`, [
            ['Name', 'Kind', 'Employee code', 'Working days', 'Not tracked', 'Present', 'Late', 'Half days', 'Absent', 'Leave days', 'Loss of pay proposed', 'Loss of pay confirmed', 'Status'],
            ...summaries.map(({ p, m, review }) => [p.name, KIND[p.kind], p.employeeCode ?? '', m.workDays, m.untracked, m.present, m.late, m.halfDays, m.absent, m.leaveDays, m.lopProposed, review ? Number(review.lop_days) : '', review ? 'confirmed' : 'open']),
          ])}><DownloadSimple size={13} /> Export for payroll</button>
        </div>} />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th className="c">Days</th><th className="c">Present</th><th className="c">Late</th><th className="c">Absent</th><th className="c">Leave</th><th className="c">Loss of pay</th><th /></tr></thead>
          <tbody>{summaries.filter(x => x.m.workDays || x.review).map(({ p, m, review }) => (
            <Fragment key={p.key}>
              <tr>
                <td><b>{p.name}</b><div className="muted" style={{ fontSize: 12 }}>{KIND[p.kind]}</div></td>
                <td className="c num">{m.workDays}{m.untracked > 0 && <div className="muted" style={{ fontSize: 11 }}>+{m.untracked} not tracked</div>}</td><td className="c num">{m.present}</td><td className="c num">{m.late}</td><td className="c num">{m.absent}</td><td className="c num">{m.leaveDays}</td>
                <td className="c">{review ? <b className="num">{Number(review.lop_days)}</b> : <span className="num">{m.lopProposed || '—'}</span>}{review && <div><Chip tone="g">CONFIRMED</Chip></div>}</td>
                <td className="r">{canEdit && (review
                  ? <button className="btn sm" onClick={async () => { try { await call(API, 'DELETE', { entity: 'review', id: review.id }); reload(); toast('Reopened'); } catch (e: any) { toast(e.message); } }}>Reopen</button>
                  : <button className="btn sm" onClick={() => { setOpen(o => (o === p.key ? null : p.key)); setWaived([]); setNote(''); }}>{open === p.key ? 'Close' : 'Review'}</button>)}</td>
              </tr>
              {open === p.key && (
                <tr><td colSpan={8} style={{ background: '#F7F9FB' }}>
                  {m.proposals.length ? m.proposals.map(x => (
                    <label key={x.key} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, padding: '4px 0' }}>
                      <input type="checkbox" checked={!waived.includes(x.key)} onChange={e => setWaived(w => (e.target.checked ? w.filter(k => k !== x.key) : [...w, x.key]))} />
                      <b style={{ width: 70 }}>{fmtDate(x.date, true)}</b><span style={{ flex: 1 }}>{x.detail}</span><span className="num">{x.days} day</span>
                    </label>
                  )) : <p className="muted">Nothing proposed. Confirming records a clean month.</p>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <input className="cmp-in" style={{ flex: 1, minWidth: 200, padding: '8px 12px' }} aria-label="Note" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
                    <button className="btn sm pri" disabled={busy} onClick={() => confirm(p.key)}>Confirm {m.proposals.filter(x => !waived.includes(x.key)).reduce((n, x) => n + x.days, 0)} day(s)</button>
                  </div>
                </td></tr>
              )}
            </Fragment>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
