'use client';

import { useMemo, useState } from 'react';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { PaperPlaneTiltIcon as PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { Chip, Empty } from '@/components/canon/ui';
import { CardHead, downloadCsv } from '@/components/admin/kit';
import { fmtDate, isoDay, sessionOf, sessionStart } from '@/lib/admin/format';
import { fairness } from '@/lib/schedule/cover';
import { hhmm, namesOf, teachingDays } from '@/lib/schedule/engine';
import { DAY_SHORT, DAY_NAMES, DUTY_KINDS, personKey, type DatedDuty, type DutyKind, type DutyPost, type PersonKey, type ScheduleRows } from '@/lib/schedule/types';
import Pop, { run } from '@/components/schedule/Pop';
import { PersonSelect, peopleOptions } from '@/components/schedule/people';
import { printTable } from '@/components/schedule/print';

type Call = <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
const API = '/api/admin/schedule/duties';

/**
 * Duties: posts and the fixed weekly roster, dated duties (exam invigilation, event duty), comp-off
 * and the fairness picture. Posts, roster, event duty and comp-off need schedule.workforce;
 * invigilation needs schedule.academic.
 */
export default function DutiesTab({ rows, call, reload, toast, canWorkforce, canAcademic }: {
  rows: ScheduleRows; call: Call; reload: () => void; toast: (m: string) => void; canWorkforce: boolean; canAcademic: boolean;
}) {
  const today = isoDay();
  const names = useMemo(() => namesOf(rows), [rows]);
  const days = teachingDays(rows.bells);
  const [post, setPost] = useState<Partial<DutyPost> | null>(null);
  const [cell, setCell] = useState<{ post: DutyPost; weekday: number } | null>(null);
  const [duty, setDuty] = useState<Partial<DatedDuty> | null>(null);
  const [comp, setComp] = useState<{ person?: PersonKey; source?: 'roster' | 'duty' | 'cover' | 'other'; sourceId?: string; dutyOn?: string; note?: string } | null>(null);
  const [sending, setSending] = useState(false);
  const upcoming = rows.duties.filter(d => d.on_date >= today).sort((a, b) => a.on_date.localeCompare(b.on_date) || a.starts_at.localeCompare(b.starts_at));
  const recent = rows.duties.filter(d => d.on_date < today).sort((a, b) => b.on_date.localeCompare(a.on_date)).slice(0, 12);
  const session = sessionOf(new Date(`${today}T12:00:00`));
  const fair = useMemo(() => fairness(rows, sessionStart(session), today), [rows, session, today]);
  const act = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); reload(); toast(done); } catch (e: any) { toast(e.message); } };
  const rosterAt = (p: DutyPost, wd: number) => rows.roster.filter(r => r.post_id === p.id && r.weekday === wd);
  const activePosts = rows.dutyPosts.filter(p => p.active);

  const printRoster = () => {
    try {
      printTable({
        title: 'Duty roster', subtitle: `Weekly · as of ${fmtDate(today)}`, school: rows.schoolName, landscape: true,
        head: ['Post', 'Time', ...days.map(d => DAY_NAMES[d])],
        rows: activePosts.map(p => [`${p.name}${p.location ? `\n${p.location}` : ''}`, `${hhmm(p.starts_at)}–${hhmm(p.ends_at)}`,
          ...days.map(d => (p.weekdays.includes(d) ? rosterAt(p, d).map(r => names.get(personKey(r.user_id, r.staff_member_id)!) || '').join('\n') || '(nobody)' : '—'))]),
      });
    } catch (e: any) { toast(e.message); }
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Weekly duty roster" sub="The same people on the same posts every week until you change it. Nobody can be rostered while they're teaching or on another post; holidays switch the roster off."
          right={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {activePosts.length > 0 && <button className="btn sm" onClick={printRoster}><Printer size={13} /> Print</button>}
            {canWorkforce && activePosts.length > 0 && <button className="btn sm" disabled={sending} onClick={async () => {
              setSending(true);
              try { const r = await call<{ people: number }>(API, 'POST', { entity: 'notify', weekOf: today }); toast(`Sent this week's duties to ${r.people} ${r.people === 1 ? 'person' : 'people'}`); }
              catch (e: any) { toast(e.message); } finally { setSending(false); }
            }}><PaperPlaneTilt size={13} /> {sending ? 'Sending…' : 'Send this week'}</button>}
            {canWorkforce && <button className="btn sm pri" onClick={() => setPost({ name: '', kind: 'gate', weekdays: [1, 2, 3, 4, 5], starts_at: '07:30', ends_at: '08:00', needed: 1, active: true })}><Plus size={12} weight="bold" /> Add post</button>}
          </div>} />
        {rows.dutyPosts.length ? (
          <div className="tbl-wrap">
            <table className="tbl sch-roster">
              <thead><tr><th>Post</th>{days.map(d => <th key={d}>{DAY_SHORT[d]}</th>)}{canWorkforce && <th />}</tr></thead>
              <tbody>{rows.dutyPosts.map(p => (
                <tr key={p.id} style={p.active ? undefined : { opacity: 0.5 }}>
                  <td style={{ minWidth: 150 }}><b>{p.name}</b><div className="muted" style={{ fontSize: 12 }}>{DUTY_KINDS[p.kind]} · {hhmm(p.starts_at, true)}–{hhmm(p.ends_at, true)}{p.location ? ` · ${p.location}` : ''}{p.needed > 1 ? ` · needs ${p.needed}` : ''}</div></td>
                  {days.map(d => {
                    if (!p.weekdays.includes(d)) return <td key={d} className="muted">—</td>;
                    const here = rosterAt(p, d);
                    const short = p.needed - here.length;
                    const body = (
                      <>
                        {here.map(r => <span key={r.id} className="sch-chipbtn">{(names.get(personKey(r.user_id, r.staff_member_id)!) || 'Staff').split(' ')[0]}</span>)}
                        {short > 0 && <span className="sch-chipbtn none">{here.length ? `${short} short` : 'Nobody'}</span>}
                      </>
                    );
                    return <td key={d}>{canWorkforce && p.active ? <button type="button" style={{ textAlign: 'left' }} aria-label={`${p.name}, ${DAY_NAMES[d]}: edit`} onClick={() => setCell({ post: p, weekday: d })}>{body}</button> : body}</td>;
                  })}
                  {canWorkforce && <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    <button className="sch-icon" aria-label={`Edit ${p.name}`} onClick={() => setPost(p)}><PencilSimple size={15} /></button>
                    <button className="sch-icon" aria-label={`Remove ${p.name}`} onClick={() => act(() => call(API, 'DELETE', { entity: 'post', id: p.id }), 'Post removed')}><Trash size={15} /></button>
                  </td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty icon={<ShieldCheck size={26} weight="duotone" />} title="No duty posts yet">Add the posts your school staffs every week: morning gate, bus loading, lunch supervision, corridors, assembly.</Empty>}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Dated duties" sub="Exam invigilation, event duty and one-offs. Each person is told in the app or on WhatsApp."
          right={<div style={{ display: 'flex', gap: 6 }}>
            {canAcademic && <button className="btn sm" onClick={() => setDuty({ kind: 'invigilation', on_date: today, starts_at: '09:00', ends_at: '12:00' })}><Plus size={12} weight="bold" /> Invigilation</button>}
            {canWorkforce && <button className="btn sm" onClick={() => setDuty({ kind: 'event', on_date: today, starts_at: '09:00', ends_at: '13:00' })}><Plus size={12} weight="bold" /> Event duty</button>}
          </div>} />
        {upcoming.length ? upcoming.slice(0, 40).map(d => (
          <div className="row" key={d.id}>
            <div style={{ width: 92, flex: '0 0 92px' }}><b>{fmtDate(d.on_date, true)}</b><div className="muted" style={{ fontSize: 12 }}>{hhmm(d.starts_at, true)}–{hhmm(d.ends_at, true)}</div></div>
            <div style={{ flex: 1, minWidth: 0 }}><b>{names.get(personKey(d.user_id, d.staff_member_id)!)}</b><div className="muted" style={{ fontSize: 12.5 }}>{d.title}{d.room_id ? ` · ${rows.rooms.find(r => r.id === d.room_id)?.name || ''}` : ''}</div></div>
            <Chip tone={d.kind === 'invigilation' ? 'p' : 'b'}>{d.kind === 'invigilation' ? 'INVIGILATION' : d.kind === 'event' ? 'EVENT' : 'DUTY'}</Chip>
            {((d.kind === 'invigilation' && canAcademic) || (d.kind !== 'invigilation' && canWorkforce)) && <>
              <button className="sch-icon" aria-label="Edit" onClick={() => setDuty(d)}><PencilSimple size={15} /></button>
              <button className="sch-icon" aria-label="Remove" onClick={() => act(() => call(API, 'DELETE', { entity: 'duty', id: d.id }), 'Duty removed')}><Trash size={15} /></button>
            </>}
          </div>
        )) : <p className="muted">No dated duties coming up.</p>}
      </div>

      <div className="g2">
        <div className="card">
          <CardHead title="Fairness this session" sub="Covers taken, roster slots a week, dated duties and comp-off days per person, with their own weekly teaching load."
            right={<button className="btn sm" onClick={() => downloadCsv(`duty-fairness-${session}.csv`, [
              ['Person', 'Periods a week', 'Covers', 'Roster slots a week', 'Dated duties', 'Comp-off days'],
              ...fair.map(r => [r.name, r.periodsPerWeek, r.covers, r.rosterPerWeek, r.duties, r.compOffDays]),
            ])}><DownloadSimple size={13} /> Export</button>} />
          {fair.length ? (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Person</th><th className="c">Periods</th><th className="c">Covers</th><th className="c">Roster</th><th className="c">Duties</th><th className="c">Comp-off</th></tr></thead>
                <tbody>{fair.slice(0, 30).map(r => {
                  // Compared among teachers only: a driver on gate duty every day is doing their job, not carrying extra.
                  const teachers = fair.filter(x => x.periodsPerWeek > 0);
                  const total = r.covers + r.rosterPerWeek + r.duties;
                  const avg = r.periodsPerWeek > 0 && teachers.length ? teachers.reduce((n, x) => n + x.covers + x.rosterPerWeek + x.duties, 0) / teachers.length : 0;
                  return (
                    <tr key={r.person}>
                      <td><b>{r.name}</b>{avg > 0 && total > avg * 1.75 && total >= 4 && <div style={{ fontSize: 11.5, color: 'var(--amber)', fontWeight: 700 }}>Carrying more than most</div>}</td>
                      <td className="c num">{r.periodsPerWeek || '—'}</td><td className="c num">{r.covers}</td><td className="c num">{r.rosterPerWeek}</td><td className="c num">{r.duties}</td><td className="c num">{r.compOffDays || '—'}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : <p className="muted">Nothing recorded yet.</p>}
        </div>
        <div className="card">
          <CardHead title="Comp-off" sub="Granted case by case from a duty record. For staff with a login it adds to their Compensatory leave balance."
            right={canWorkforce ? <button className="btn sm pri" onClick={() => setComp({})}><Plus size={12} weight="bold" /> Grant</button> : undefined} />
          {canWorkforce && recent.length > 0 && (
            <>
              <div className="lbl">RECENT DATED DUTIES</div>
              {recent.slice(0, 5).map(d => {
                const who = personKey(d.user_id, d.staff_member_id)!;
                const granted = rows.compOffs.some(g => g.source_id === d.id && !g.revoked_at);
                return (
                  <div className="row" key={d.id} style={{ padding: '9px 0' }}>
                    <span style={{ flex: 1, fontSize: 13 }}><b>{names.get(who)}</b> · {d.title} · {fmtDate(d.on_date, true)}</span>
                    {granted ? <Chip tone="g">GRANTED</Chip> : <button className="btn sm" onClick={() => setComp({ person: who, source: 'duty', sourceId: d.id, dutyOn: d.on_date, note: d.title })}>Grant comp-off</button>}
                  </div>
                );
              })}
            </>
          )}
          <div className="lbl" style={{ marginTop: 14 }}>GRANTED THIS SESSION</div>
          {rows.compOffs.length ? rows.compOffs.slice().reverse().slice(0, 15).map(g => (
            <div className="row" key={g.id} style={{ padding: '9px 0', opacity: g.revoked_at ? 0.5 : 1 }}>
              <span style={{ flex: 1, fontSize: 13 }}><b>{names.get(personKey(g.user_id, g.staff_member_id)!)}</b> · {g.days === 1 ? '1 day' : 'half day'} for {fmtDate(g.duty_on, true)}<div className="muted" style={{ fontSize: 12 }}>{g.note}</div></span>
              {g.revoked_at ? <Chip tone="n">WITHDRAWN</Chip> : canWorkforce && <button className="btn sm" onClick={() => act(() => call('/api/admin/schedule/compoff', 'DELETE', { id: g.id }), 'Comp-off withdrawn')}>Withdraw</button>}
            </div>
          )) : <p className="muted">None yet.</p>}
        </div>
      </div>

      {post && <PostEditor post={post} call={call} onClose={() => setPost(null)} onSaved={() => { setPost(null); reload(); toast('Post saved'); }} />}
      {cell && <RosterEditor post={cell.post} weekday={cell.weekday} rows={rows} call={call} onClose={() => setCell(null)} onSaved={m => { setCell(null); reload(); toast(m); }} />}
      {duty && <DutyEditor duty={duty} rows={rows} call={call} canAcademic={canAcademic} canWorkforce={canWorkforce} onClose={() => setDuty(null)} onSaved={() => { setDuty(null); reload(); toast('Duty saved; they have been told'); }} />}
      {comp && <CompOffEditor init={comp} rows={rows} call={call} onClose={() => setComp(null)} onSaved={() => { setComp(null); reload(); toast('Comp-off granted'); }} />}
    </>
  );
}

function Actions({ busy, err, onClose, onSave, disabled, label = 'Save' }: { busy: boolean; err: string | null; onClose: () => void; onSave: () => void; disabled?: boolean; label?: string }) {
  return (
    <>
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || disabled} onClick={onSave}>{busy ? 'Saving…' : label}</button>
      </div>
    </>
  );
}

function PostEditor({ post, call, onClose, onSaved }: { post: Partial<DutyPost>; call: Call; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: post.name || '', kind: (post.kind || 'gate') as DutyKind, weekdays: post.weekdays || [1, 2, 3, 4, 5], startsAt: post.starts_at || '07:30', endsAt: post.ends_at || '08:00', location: post.location || '', needed: String(post.needed || 1), active: post.active !== false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title={post.id ? `Edit ${post.name}` : 'Add a duty post'} onClose={onClose}>
      <div className="sch-fields">
        <div className="cmp-fld"><label htmlFor="dp-n">NAME</label><input id="dp-n" className="cmp-in" maxLength={80} value={v.name} onChange={e => setV({ ...v, name: e.target.value })} placeholder="Main gate, morning" /></div>
        <div className="cmp-fld"><label htmlFor="dp-k">KIND</label>
          <select id="dp-k" className="cmp-sel" value={v.kind} onChange={e => setV({ ...v, kind: e.target.value as DutyKind })}>{Object.entries(DUTY_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="cmp-fld"><label htmlFor="dp-s">FROM</label><input id="dp-s" type="time" className="cmp-in" value={v.startsAt} onChange={e => setV({ ...v, startsAt: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="dp-e">TO</label><input id="dp-e" type="time" className="cmp-in" value={v.endsAt} onChange={e => setV({ ...v, endsAt: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="dp-l">WHERE</label><input id="dp-l" className="cmp-in" maxLength={80} value={v.location} onChange={e => setV({ ...v, location: e.target.value })} placeholder="Gate 1" /></div>
        <div className="cmp-fld"><label htmlFor="dp-p">PEOPLE NEEDED</label><input id="dp-p" className="cmp-in" inputMode="numeric" value={v.needed} onChange={e => setV({ ...v, needed: e.target.value.replace(/\D/g, '') })} /></div>
      </div>
      <div className="cmp-fld"><label>DAYS</label>
        <div className="sch-days">{[1, 2, 3, 4, 5, 6, 7].map(d => (
          <button key={d} type="button" aria-pressed={v.weekdays.includes(d)} className={v.weekdays.includes(d) ? 'on' : ''} onClick={() => setV({ ...v, weekdays: v.weekdays.includes(d) ? v.weekdays.filter(x => x !== d) : [...v.weekdays, d].sort() })}>{DAY_SHORT[d]}</button>
        ))}</div>
      </div>
      {post.id && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={v.active} onChange={e => setV({ ...v, active: e.target.checked })} /> In use</label>}
      <Actions busy={busy} err={err} onClose={onClose} disabled={!v.name.trim() || !v.weekdays.length} onSave={async () => {
        if (await run(setBusy, setErr, () => call(API, 'PUT', { entity: 'post', id: post.id, name: v.name, kind: v.kind, weekdays: v.weekdays, startsAt: v.startsAt, endsAt: v.endsAt, location: v.location, needed: Number(v.needed) || 1, active: v.active }))) onSaved();
      }} />
    </Pop>
  );
}

function RosterEditor({ post, weekday, rows, call, onClose, onSaved }: { post: DutyPost; weekday: number; rows: ScheduleRows; call: Call; onClose: () => void; onSaved: (m: string) => void }) {
  const current = rows.roster.filter(r => r.post_id === post.id && r.weekday === weekday).map(r => personKey(r.user_id, r.staff_member_id)!);
  const [picked, setPicked] = useState<string[]>(current);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clash, setClash] = useState(false);
  const options = peopleOptions(rows).filter(o => !q || o.name.toLowerCase().includes(q.toLowerCase()) || picked.includes(o.key));
  const groups = [...new Set(options.map(o => o.group))];
  const save = async (force: boolean) => {
    setBusy(true); setErr(null);
    try {
      const r = await call<{ short: number }>(API, 'PUT', { entity: 'roster', postId: post.id, weekday, people: picked, force });
      onSaved(r.short ? `Saved; still ${r.short} short` : 'Roster saved');
    } catch (e: any) { setErr(e.message); setClash(/teaches|already on/.test(e.message)); } finally { setBusy(false); }
  };
  return (
    <Pop title={`${post.name} · ${DAY_NAMES[weekday]}s`} sub={`${hhmm(post.starts_at, true)}–${hhmm(post.ends_at, true)}${post.location ? ` · ${post.location}` : ''} · needs ${post.needed}`} onClose={onClose}>
      <input className="cmp-in" placeholder="Search staff" aria-label="Search staff" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 12, padding: '4px 12px' }}>
        {groups.map(g => (
          <div key={g}>
            <div className="lbl" style={{ margin: '10px 0 4px' }}>{g.toUpperCase()}</div>
            {options.filter(o => o.group === g).map(o => (
              <label key={o.key} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', fontSize: 13.5 }}>
                <input type="checkbox" checked={picked.includes(o.key)} onChange={e => setPicked(ps => (e.target.checked ? [...ps, o.key] : ps.filter(x => x !== o.key)))} />
                {o.name}{o.note && <span className="muted"> · {o.note}</span>}
              </label>
            ))}
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{picked.length} of {post.needed} picked.</p>
      {err && <div className="err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        {clash && <button className="btn" disabled={busy} onClick={() => save(true)}>Assign anyway</button>}
        <button className="btn pri" disabled={busy} onClick={() => save(false)}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Pop>
  );
}

function DutyEditor({ duty, rows, call, canAcademic, canWorkforce, onClose, onSaved }: {
  duty: Partial<DatedDuty>; rows: ScheduleRows; call: Call; canAcademic: boolean; canWorkforce: boolean; onClose: () => void; onSaved: () => void;
}) {
  const exams = rows.events.filter(e => e.kind === 'exam' && e.ends_on >= isoDay());
  const [v, setV] = useState({
    kind: (duty.kind || (canAcademic ? 'invigilation' : 'event')) as DatedDuty['kind'], date: duty.on_date || isoDay(), startsAt: duty.starts_at || '09:00', endsAt: duty.ends_at || '12:00',
    title: duty.title || '', eventId: duty.event_id || (duty.kind === 'invigilation' ? exams[0]?.id ?? '' : ''), roomId: duty.room_id || '',
    person: duty.user_id || (duty.staff_member_id ? `s:${duty.staff_member_id}` : ''), note: duty.note || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clash, setClash] = useState(false);
  const exam = exams.find(e => e.id === v.eventId);
  const room = rows.rooms.find(r => r.id === v.roomId);
  const title = v.title || (v.kind === 'invigilation' ? `Invigilation${room ? ` · ${room.name}` : ''}${exam ? ` · ${exam.title}` : ''}` : '');
  const save = async (force: boolean) => {
    setBusy(true); setErr(null);
    try {
      await call(API, 'PUT', { entity: 'duty', id: duty.id, kind: v.kind, date: v.date, startsAt: v.startsAt, endsAt: v.endsAt, title, eventId: v.eventId || null, roomId: v.roomId || null, person: v.person, note: v.note, force });
      onSaved();
    } catch (e: any) { setErr(e.message); setClash(/ has | is away/.test(e.message)); } finally { setBusy(false); }
  };
  return (
    <Pop wide title={duty.id ? 'Edit duty' : v.kind === 'invigilation' ? 'Add invigilation' : 'Add a duty'} onClose={onClose}>
      <div className="sch-fields">
        <div className="cmp-fld"><label htmlFor="dd-k">KIND</label>
          <select id="dd-k" className="cmp-sel" value={v.kind} disabled={!!duty.id} onChange={e => setV({ ...v, kind: e.target.value as DatedDuty['kind'] })}>
            {canAcademic && <option value="invigilation">Invigilation</option>}
            {canWorkforce && <option value="event">Event duty</option>}
            {canWorkforce && <option value="other">Other</option>}
          </select></div>
        {v.kind === 'invigilation' && (
          <div className="cmp-fld"><label htmlFor="dd-x">EXAM</label>
            <select id="dd-x" className="cmp-sel" value={v.eventId} onChange={e => { const ex = exams.find(x => x.id === e.target.value); setV({ ...v, eventId: e.target.value, date: ex && (v.date < ex.starts_on || v.date > ex.ends_on) ? ex.starts_on : v.date }); }}>
              <option value="">Not linked to the calendar</option>{exams.map(e => <option key={e.id} value={e.id}>{e.title} ({fmtDate(e.starts_on, true)}–{fmtDate(e.ends_on, true)})</option>)}
            </select></div>
        )}
        <div className="cmp-fld"><label htmlFor="dd-d">DATE</label><input id="dd-d" type="date" className="cmp-in" min={exam?.starts_on} max={exam?.ends_on} value={v.date} onChange={e => setV({ ...v, date: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="dd-s">FROM</label><input id="dd-s" type="time" className="cmp-in" value={v.startsAt} onChange={e => setV({ ...v, startsAt: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="dd-e">TO</label><input id="dd-e" type="time" className="cmp-in" value={v.endsAt} onChange={e => setV({ ...v, endsAt: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="dd-r">ROOM</label>
          <select id="dd-r" className="cmp-sel" value={v.roomId} onChange={e => setV({ ...v, roomId: e.target.value })}><option value="">None</option>{rows.rooms.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        <div className="cmp-fld"><label htmlFor="dd-p">WHO</label><PersonSelect id="dd-p" value={v.person} onChange={p => setV({ ...v, person: p })} options={peopleOptions(rows, v.date)} /></div>
        <div className="cmp-fld" style={{ gridColumn: '1 / -1' }}><label htmlFor="dd-t">TITLE</label><input id="dd-t" className="cmp-in" maxLength={120} value={v.title} placeholder={title || 'Annual Day: stage and green room'} onChange={e => setV({ ...v, title: e.target.value })} /></div>
      </div>
      {err && <div className="err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        {clash && <button className="btn" disabled={busy} onClick={() => save(true)}>Assign anyway</button>}
        <button className="btn pri" disabled={busy || !v.person || !title} onClick={() => save(false)}>{busy ? 'Saving…' : 'Save and tell them'}</button>
      </div>
    </Pop>
  );
}

function CompOffEditor({ init, rows, call, onClose, onSaved }: {
  init: { person?: PersonKey; source?: 'roster' | 'duty' | 'cover' | 'other'; sourceId?: string; dutyOn?: string; note?: string }; rows: ScheduleRows; call: Call; onClose: () => void; onSaved: () => void;
}) {
  const [v, setV] = useState({ person: init.person || '', days: '1', dutyOn: init.dutyOn || isoDay(), source: init.source || 'other', note: init.note || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title="Grant comp-off" sub="For a duty outside normal working time: a holiday, a Sunday, an evening event." onClose={onClose}>
      <div className="sch-fields">
        <div className="cmp-fld"><label htmlFor="co-p">WHO</label><PersonSelect id="co-p" value={v.person} onChange={p => setV({ ...v, person: p })} options={peopleOptions(rows)} /></div>
        <div className="cmp-fld"><label htmlFor="co-d">DUTY DATE</label><input id="co-d" type="date" className="cmp-in" value={v.dutyOn} onChange={e => setV({ ...v, dutyOn: e.target.value })} /></div>
        <div className="cmp-fld"><label htmlFor="co-n">DAYS</label>
          <select id="co-n" className="cmp-sel" value={v.days} onChange={e => setV({ ...v, days: e.target.value })}><option value="1">One day</option><option value="0.5">Half day</option></select></div>
        <div className="cmp-fld"><label htmlFor="co-s">EARNED BY</label>
          <select id="co-s" className="cmp-sel" value={v.source} onChange={e => setV({ ...v, source: e.target.value as typeof v.source })} disabled={!!init.sourceId}>
            <option value="duty">A dated duty</option><option value="roster">A roster post</option><option value="cover">Extra cover</option><option value="other">Other</option>
          </select></div>
      </div>
      <div className="cmp-fld"><label htmlFor="co-t">NOTE (WHAT THE DUTY WAS)</label><input id="co-t" className="cmp-in" maxLength={500} value={v.note} onChange={e => setV({ ...v, note: e.target.value })} placeholder="Annual Day on Sunday, 8 am to 2 pm" /></div>
      <Actions busy={busy} err={err} onClose={onClose} disabled={!v.person || !v.note.trim()} label="Grant" onSave={async () => {
        if (await run(setBusy, setErr, () => call('/api/admin/schedule/compoff', 'POST', { person: v.person, days: Number(v.days), dutyOn: v.dutyOn, source: v.source, sourceId: init.sourceId, note: v.note }))) onSaved();
      }} />
    </Pop>
  );
}
