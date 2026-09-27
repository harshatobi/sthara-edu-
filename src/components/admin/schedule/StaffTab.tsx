'use client';

import { useMemo, useState } from 'react';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { UsersFourIcon as UsersFour } from '@phosphor-icons/react/dist/ssr/UsersFour';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { Chip, Empty } from '@/components/canon/ui';
import { CardHead, Kpi, downloadCsv } from '@/components/admin/kit';
import { daysBetween, fmtDate, isoDay } from '@/lib/admin/format';
import { EMPLOYMENT, STAFF_CATEGORIES, type Employment, type ScheduleRows, type StaffCategory, type StaffMember } from '@/lib/schedule/types';
import Pop, { run } from '@/components/schedule/Pop';

type Call = <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const API = '/api/admin/schedule/staff';

interface Person { key: string; member: StaffMember | null; userId: string | null; name: string; category: StaffCategory; login: 'teacher' | 'admin' | null; designation: string; active: boolean }

/**
 * Everyone who works at the school. Teacher and office accounts are listed automatically; support
 * staff with no login (drivers, security, ayahs, housekeeping) are added here, with a phone number
 * for their WhatsApp roster. Shifts and staff attendance build on this register next.
 */
export default function StaffTab({ rows, call, reload, toast, canEdit }: { rows: ScheduleRows; call: Call; reload: () => void; toast: (m: string) => void; canEdit: boolean }) {
  const [filter, setFilter] = useState<StaffCategory | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Partial<StaffMember> | null>(null);
  const people: Person[] = useMemo(() => {
    const byUser = new Map(rows.staff.filter(s => s.user_id).map(s => [s.user_id!, s]));
    const logins: Person[] = rows.people.map(p => {
      const m = byUser.get(p.id) ?? null;
      return { key: p.id, member: m, userId: p.id, name: m?.name || p.name, category: m?.category || (p.role === 'teacher' ? 'teaching' : 'office'), login: p.role, designation: m?.designation || (p.role === 'teacher' ? 'Teacher' : 'Office'), active: m ? m.active : true };
    });
    const others: Person[] = rows.staff.filter(s => !s.user_id || !rows.people.some(p => p.id === s.user_id)).map(s => ({
      key: s.id, member: s, userId: null, name: s.name, category: s.category, login: null, designation: s.designation, active: s.active,
    }));
    return [...logins, ...others].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows.people, rows.staff]);
  const active = people.filter(p => p.active);
  const shown = people.filter(p => (showInactive || p.active) && (filter === 'all' || p.category === filter));
  const count = (c: StaffCategory) => active.filter(p => p.category === c).length;
  const wing = (id: string | null) => (id ? rows.wings.find(w => w.id === id)?.name ?? '' : '');
  const today = isoDay();
  const ending = rows.staff.filter(m => m.active && m.contract_to && m.contract_to >= today && daysBetween(today, m.contract_to) <= 21);
  const sessions = (id: string) => rows.visits.filter(v => v.staff_member_id === id && v.status === 'taken').length;

  return (
    <>
      <div className="kpis">
        <Kpi label="ON THE REGISTER" value={active.length} note={`${active.filter(p => !p.login).length} without a Sthara login`} />
        <Kpi label="TEACHING" value={count('teaching')} />
        <Kpi label="OFFICE" value={count('office')} />
        <Kpi label="SUPPORT, LAB, LIBRARY AND IT" value={count('support') + count('assistant')} note={`${active.filter(p => (p.category === 'support' || p.category === 'assistant') && !p.member?.phone_e164).length} with no phone number`} />
      </div>
      {ending.length > 0 && (
        <div className="note" style={{ marginBottom: 18 }}>
          <b>Contracts ending soon:</b> {ending.map(m => `${m.name} (${fmtDate(m.contract_to, true)})`).join(', ')}. Renew them in the register, or they drop off schedules after that date.
        </div>
      )}
      <div className="card">
        <CardHead title="Staff register" sub="Teachers and office accounts appear automatically. Add support staff here; they get their schedule on WhatsApp and a printed roster, no login needed."
          right={<div style={{ display: 'flex', gap: 6 }}>
            <button className="btn sm" onClick={() => downloadCsv(`staff-register-${isoDay()}.csv`, [
              ['Name', 'Category', 'Designation', 'Employment', 'Contract to', 'Wing', 'Phone', 'WhatsApp consent', 'Employee code', 'Joined', 'Login', 'Sessions taken', 'Active'],
              ...people.map(p => [p.name, STAFF_CATEGORIES[p.category], p.designation, EMPLOYMENT[p.member?.employment || 'permanent'], p.member?.contract_to ?? '', wing(p.member?.wing_id ?? null), p.member?.phone_e164 ?? '',
                p.login ? 'n/a' : p.member?.whatsapp_opt_in ? 'yes' : 'no', p.member?.employee_code ?? '', p.member?.joined_on ?? '', p.login ?? 'none', p.member && !p.login ? sessions(p.member.id) : '', p.active ? 'yes' : 'no']),
            ])}><DownloadSimple size={13} /> Export</button>
            {canEdit && <button className="btn sm pri" onClick={() => setEditing({ category: 'support', active: true })}><Plus size={12} weight="bold" /> Add staff member</button>}
          </div>} />
        <div className="sch-bar">
          <div className="sch-seg" role="tablist" aria-label="Category">
            <button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
            {(Object.keys(STAFF_CATEGORIES) as StaffCategory[]).map(c => (
              <button key={c} role="tab" aria-selected={filter === c} className={filter === c ? 'on' : ''} onClick={() => setFilter(c)}>{STAFF_CATEGORIES[c]}</button>
            ))}
          </div>
          <span className="sp" />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show people who have left</label>
        </div>
        {shown.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Role</th><th>Wing</th><th>Phone</th><th className="c">Login</th>{canEdit && <th />}</tr></thead>
              <tbody>{shown.map(p => (
                <tr key={p.key} style={p.active ? undefined : { opacity: 0.5 }}>
                  <td><b>{p.name}</b>{(p.member?.employee_code || (p.member?.employment && p.member.employment !== 'permanent')) && (
                    <div className="muted" style={{ fontSize: 12 }}>{[p.member?.employee_code, p.member?.employment && p.member.employment !== 'permanent' ? `${EMPLOYMENT[p.member.employment]} to ${fmtDate(p.member.contract_to, true)}` : ''].filter(Boolean).join(' · ')}</div>
                  )}</td>
                  <td>{p.designation || STAFF_CATEGORIES[p.category]}{p.designation && p.designation !== STAFF_CATEGORIES[p.category] && <div className="muted" style={{ fontSize: 12 }}>{STAFF_CATEGORIES[p.category]}</div>}</td>
                  <td>{wing(p.member?.wing_id ?? null) || <span className="muted">—</span>}</td>
                  <td className="num">{p.member?.phone_e164 || <span className="muted">—</span>}{!p.login && p.member?.phone_e164 && <div style={{ fontSize: 11.5, fontWeight: 700, color: p.member.whatsapp_opt_in ? 'var(--green)' : 'var(--mut)' }}>{p.member.whatsapp_opt_in ? 'WhatsApp roster on' : 'No WhatsApp consent'}</div>}</td>
                  <td className="c">{p.login ? <Chip tone="b">{p.login === 'teacher' ? 'TEACHER' : 'OFFICE'}</Chip> : <Chip tone="n">NONE</Chip>}</td>
                  {canEdit && <td className="r"><button className="sch-icon" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p.member ?? { user_id: p.userId, name: p.name, category: p.category, active: true })}><PencilSimple size={15} /></button></td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty icon={<UsersFour size={26} weight="duotone" />} title="Nobody here yet">Add drivers, security, housekeeping, ayahs, lab attendants and anyone else who works at the school.</Empty>}
      </div>
      {editing && <MemberEditor m={editing} rows={rows} call={call} onClose={() => setEditing(null)} onSaved={msg => { setEditing(null); reload(); toast(msg); }} />}
    </>
  );
}

function MemberEditor({ m, rows, call, onClose, onSaved }: { m: Partial<StaffMember>; rows: ScheduleRows; call: Call; onClose: () => void; onSaved: (msg: string) => void }) {
  const [v, setV] = useState({
    name: m.name || '', category: (m.category || 'support') as StaffCategory, designation: m.designation || '', wingId: m.wing_id || '',
    phone: m.phone_e164 || '', code: m.employee_code || '', joined: m.joined_on || '', active: m.active !== false,
    employment: (m.employment || 'permanent') as Employment, from: m.contract_from || '', to: m.contract_to || '', optIn: !!m.whatsapp_opt_in,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const linked = m.user_id ? rows.people.find(p => p.id === m.user_id) : null;
  const save = (active: boolean) => run(setBusy, setErr, () => call(API, 'PUT', {
    id: m.id, userId: m.user_id || null, name: v.name, category: v.category, designation: v.designation, wingId: v.wingId || null,
    phone: v.phone || null, employeeCode: v.code, joinedOn: v.joined || null, active,
    employment: v.employment, contractFrom: v.from || null, contractTo: v.to || null, whatsappOptIn: v.optIn,
  }));
  return (
    <Pop wide title={m.id || linked ? `${v.name || 'Staff member'}` : 'Add a staff member'} sub={linked ? `Linked to their ${linked.role === 'teacher' ? 'teacher' : 'office'} login.` : 'No login needed. A phone number lets them get their roster on WhatsApp.'} onClose={onClose}>
      <div className="sch-fields">
        <div className="cmp-fld"><label htmlFor="m-n">NAME</label><input id="m-n" className="cmp-in" value={v.name} maxLength={120} onChange={e => setV({ ...v, name: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="m-c">CATEGORY</label>
          <select id="m-c" className="cmp-sel" value={v.category} onChange={e => setV({ ...v, category: e.target.value as StaffCategory })}>
            {Object.entries(STAFF_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></div>
        <div className="cmp-fld"><label htmlFor="m-d">DESIGNATION</label><input id="m-d" className="cmp-in" list="sch-designations" value={v.designation} maxLength={80} onChange={e => setV({ ...v, designation: e.target.value })} placeholder="Driver" /></div>
        <div className="cmp-fld"><label htmlFor="m-w">WING</label>
          <select id="m-w" className="cmp-sel" value={v.wingId} onChange={e => setV({ ...v, wingId: e.target.value })}>
            <option value="">Whole school</option>{rows.wings.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select></div>
        <div className="cmp-fld"><label htmlFor="m-p">MOBILE</label><input id="m-p" className="cmp-in" inputMode="tel" value={v.phone} maxLength={20} onChange={e => setV({ ...v, phone: e.target.value })} placeholder="98xxxxxxxx" /></div>
        <div className="cmp-fld"><label htmlFor="m-e">EMPLOYEE CODE</label><input id="m-e" className="cmp-in" value={v.code} maxLength={40} onChange={e => setV({ ...v, code: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="m-j">JOINED ON</label><input id="m-j" type="date" className="cmp-in" value={v.joined} onChange={e => setV({ ...v, joined: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="m-m">EMPLOYMENT</label>
          <select id="m-m" className="cmp-sel" value={v.employment} onChange={e => setV({ ...v, employment: e.target.value as Employment })}>
            {Object.entries(EMPLOYMENT).map(([k, l]) => <option key={k} value={k}>{l}{k === 'visiting' ? ' (dance, music, event trainers)' : ''}</option>)}
          </select></div>
        {v.employment !== 'permanent' && <>
          <div className="cmp-fld"><label htmlFor="m-cf">CONTRACT FROM</label><input id="m-cf" type="date" className="cmp-in" value={v.from} onChange={e => setV({ ...v, from: e.target.value })} /></div>
          <div className="cmp-fld"><label htmlFor="m-ct">CONTRACT TO</label><input id="m-ct" type="date" className="cmp-in" min={v.from || undefined} value={v.to} onChange={e => setV({ ...v, to: e.target.value })} /></div>
        </>}
      </div>
      {v.employment === 'visiting' && <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Visiting teachers can hold timetable periods (pick them in the timetable under Staff register). They show in schedules only between their contract dates, and each session is confirmed on the cover board for per-session pay.</p>}
      {!linked && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginBottom: 6 }}>
          <input type="checkbox" checked={v.optIn} onChange={e => setV({ ...v, optIn: e.target.checked })} style={{ marginTop: 3 }} />
          <span>They agreed to get their roster, duties and covers on WhatsApp at this number. <span className="muted">Nothing is sent without this.</span></span>
        </label>
      )}
      <datalist id="sch-designations">
        {['Driver', 'Conductor', 'Security guard', 'Housekeeping', 'Ayah', 'Gardener', 'Cook', 'Electrician', 'Lab attendant', 'Librarian', 'IT support', 'PT instructor', 'Nurse', 'Receptionist', 'Clerk'].map(d => <option key={d} value={d} />)}
      </datalist>
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {m.id && !linked && (v.active
          ? <button className="btn" disabled={busy} onClick={async () => { if (await run(setBusy, setErr, () => call(API, 'DELETE', { id: m.id }))) onSaved(`${v.name} marked as left`); }}>Mark as left</button>
          : <button className="btn" disabled={busy} onClick={async () => { if (await save(true)) onSaved(`${v.name} is back on the register`); }}>Back on the register</button>)}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || !v.name.trim()} onClick={async () => { if (await save(v.active)) onSaved('Register updated'); }}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Pop>
  );
}
