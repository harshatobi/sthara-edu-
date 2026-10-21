'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { CameraIcon as Camera } from '@phosphor-icons/react/dist/ssr/Camera';
import { EyeIcon as Eye } from '@phosphor-icons/react/dist/ssr/Eye';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { ArrowsLeftRightIcon as ArrowsLeftRight } from '@phosphor-icons/react/dist/ssr/ArrowsLeftRight';
import { UserMinusIcon as UserMinus } from '@phosphor-icons/react/dist/ssr/UserMinus';
import { ProhibitIcon as Prohibit } from '@phosphor-icons/react/dist/ssr/Prohibit';
import { StudentIcon as Student } from '@phosphor-icons/react/dist/ssr/Student';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { fmtDate, isoDay } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { addressLine, FIELD, FIELDS, GROUPS, gradeLabel, OUTCOME_LABEL, type Address, type Outcome } from '@/lib/students/register';
import { STAGE_LABEL, type Stage } from '@/lib/students/outcomes';
import { CardHead, DeskGate, Field, Workspace } from '../kit';
import { FieldInput } from './StudentsPage';
import { STAGE_TONE } from './YearEnd';
import FamilyTab, { type FamilyData } from './FamilyTab';
import { AddressInputs } from '@/components/students/forms';
import { useGet } from '@/components/canon/useGet';

interface Enrol {
  id: string; session: string; grade: number | null; section: string | null; class_name: string | null; roll_no: string | null; stream: string | null;
  starts_on: string; ends_on: string | null; end_reason: string | null; outcome: Outcome | null; proposed_outcome: Outcome | null; stage: Stage;
  proposedBy: string | null; approvedBy: string | null; finalisedBy: string | null; published_at: string | null;
}
interface Record_ extends FamilyData {
  student: Record<string, any> & { id: string; admission_no: string; full_name: string; status: string; aadhaar: string | null; no_aadhaar: boolean; user_id: string | null };
  photo: string | null; login: { email: string } | null; enrolments: Enrol[]; classes: string[];
  changes: { id: number; field: string; old_value: string | null; new_value: string | null; reason: string; by: string; changed_at: string }[];
  can: { manage: boolean; aadhaar: boolean };
}
const END_REASON: Record<string, string> = { class_change: 'Moved class', promoted: 'Promoted', retained: 'Stayed in the class', left: 'Left', correction: 'Corrected' };
const FIELD_LABEL = (k: string) => (k === 'aadhaar' ? 'Aadhaar' : k === 'admission_no' ? 'Admission number' : k === 'status' ? 'Status' : k === 'photo_path' ? 'Photo' : FIELD.get(k)?.label ?? k);

function show(k: string, v: unknown): string {
  if (v == null || v === '') return '—';
  const f = FIELD.get(k);
  if (f?.kind === 'bool') return v ? 'Yes' : 'No';
  if (f?.kind === 'grade') return gradeLabel(Number(v));
  if (f?.kind === 'date') return fmtDate(String(v));
  if (f?.kind === 'enum') return f.labels?.[String(v)] ?? String(v);
  if (f?.kind === 'amount') return `₹${Number(v).toLocaleString('en-IN')}`;
  return String(v);
}

export default function StudentRecord({ id }: { id: string }) {
  return <DeskGate need="students.read">{() => <Rec id={id} />}</DeskGate>;
}

function Rec({ id }: { id: string }) {
  const { data, error, reload } = useGet<Record_>(`/api/admin/students/${id}`);
  const { call } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const [tab, setTab] = useState<'register' | 'family' | 'enrolment' | 'history'>('register');
  const [panel, setPanel] = useState<null | 'correct' | 'move' | 'left' | 'rejoin' | 'cancel' | 'reveal'>(null);
  const [shown, setShown] = useState<string | null>(null);
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div aria-busy="true"><div className="pbar"><div style={{ flex: 1 }}><Skeleton h={12} w={140} /><Skeleton h={30} w={280} style={{ marginTop: 10 }} /></div></div><div className="card">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div></div>;
  const s = data.student;
  const cur = data.enrolments.find(e => !e.ends_on) ?? data.enrolments[0];
  const done = (msg: string) => { setPanel(null); toast(msg); reload(); };
  const uploadPhoto = async (file: File) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    try {
      const up = await call<{ url: string; path: string }>(`/api/admin/students/${id}`, 'POST', { action: 'photo-url', ext });
      const put = await fetch(up.url, { method: 'PUT', headers: { 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'true' }, body: file });
      if (!put.ok) throw new Error('The upload did not finish. Try again.');
      await call(`/api/admin/students/${id}`, 'POST', { action: 'photo-set', path: up.path });
      done('Photo updated.');
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not upload the photo.'); }
  };
  const active = s.status === 'active';
  return (
    <>
      {toastEl}
      <Link href="/admin/students" className="muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 10, fontSize: 13 }}><ArrowLeft size={14} /> Student register</Link>
      <PageBar eyebrow={`ADMISSION NO ${s.admission_no}`} title={<>{s.full_name} {s.status !== 'active' && <Chip tone={s.status === 'left' ? 'n' : 'r'}>{s.status.toUpperCase()}</Chip>}</>}
        sub={cur ? `${cur.class_name ?? gradeLabel(cur.grade)}${cur.roll_no ? ` · Roll ${cur.roll_no}` : ''} · Session ${cur.session.replace('-', '–')}${data.login ? ` · Login ${data.login.email}` : ' · No Sthara login yet'}` : undefined}
        actions={data.can.manage && s.status !== 'cancelled' ? <>
          <button className="btn" onClick={() => setPanel('correct')}><PencilSimple size={16} /> Correct</button>
          {active && <button className="btn" onClick={() => setPanel('move')}><ArrowsLeftRight size={16} /> Move class</button>}
          {active ? <button className="btn" onClick={() => setPanel('left')}><UserMinus size={16} /> Mark as left</button> : <button className="btn" onClick={() => setPanel('rejoin')}>Rejoin</button>}
          {!s.user_id && <button className="btn" onClick={() => setPanel('cancel')}><Prohibit size={16} /> Cancel entry</button>}
        </> : undefined} />
      {s.status === 'cancelled' && <div className="note err" style={{ marginBottom: 16 }}>Entry cancelled: {s.cancel_reason}. The number {s.admission_no} is never reused.</div>}
      {s.status === 'left' && <div className="note info" style={{ marginBottom: 16 }}>Left on {fmtDate(s.left_on)}{s.leaving_reason ? `: ${s.leaving_reason}` : ''}. The record and its history are kept.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 180px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }} className="rec-grid">
        <div className="card" style={{ textAlign: 'center' }}>
          {data.photo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={data.photo} alt={`Photo of ${s.full_name}`} style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 10 }} />
            : <div style={{ aspectRatio: '3 / 4', display: 'grid', placeItems: 'center', background: 'var(--pale)', borderRadius: 10 }}><Student size={48} weight="duotone" color="var(--mut)" /></div>}
          {data.can.manage && s.status !== 'cancelled' && (
            <label className="btn sm" style={{ marginTop: 10, cursor: 'pointer' }}>
              <Camera size={14} /> {data.photo ? 'Replace' : 'Add photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f); e.target.value = ''; }} />
            </label>
          )}
        </div>
        <div>
          <div className="tabs" role="tablist" aria-label="Record" style={{ marginBottom: 16 }}>
            {(['register', 'family', 'enrolment', 'history'] as const).map(t => (
              <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                {t === 'register' ? 'Register' : t === 'family' ? `Family${data.requests.length ? ` (${data.requests.length} to review)` : ''}` : t === 'enrolment' ? 'Enrolment' : `Changes (${data.changes.length})`}
              </button>
            ))}
          </div>
          {tab === 'register' && GROUPS.map(g => (
            <div className="card" key={g.key} style={{ marginBottom: 14 }}>
              <CardHead title={g.label} />
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px 20px', margin: 0 }}>
                {FIELDS.filter(f => f.group === g.key).map(f => (
                  <div key={f.key}><dt className="muted" style={{ fontSize: 12 }}>{f.label}</dt><dd style={{ margin: 0, fontWeight: 600 }}>{show(f.key, s[f.key])}</dd></div>
                ))}
                {g.key === 'ids' && (
                  <div><dt className="muted" style={{ fontSize: 12 }}>Aadhaar</dt><dd style={{ margin: 0, fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}>
                    {s.no_aadhaar ? 'No Aadhaar' : shown ?? s.aadhaar ?? '—'}
                    {data.can.aadhaar && s.aadhaar && !shown && <button className="btn sm" onClick={() => setPanel('reveal')}><Eye size={14} /> Show</button>}
                  </dd></div>
                )}
              </dl>
            </div>
          ))}
          {tab === 'register' && (
            <div className="card" style={{ marginBottom: 14 }}>
              <CardHead title="Address" />
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px 20px', margin: 0 }}>
                <div><dt className="muted" style={{ fontSize: 12 }}>Current address</dt><dd style={{ margin: 0, fontWeight: 600 }}>{addressLine(s.address) || '\u2014'}</dd></div>
                <div><dt className="muted" style={{ fontSize: 12 }}>Permanent address</dt><dd style={{ margin: 0, fontWeight: 600 }}>{s.permanent_same ? 'Same as current' : addressLine(s.permanent_address) || '\u2014'}</dd></div>
              </dl>
            </div>
          )}
          {tab === 'family' && <FamilyTab studentId={id} data={data} canManage={data.can.manage && s.status !== 'cancelled'} onChanged={msg => { toast(msg); reload(); }} />}
          {tab === 'enrolment' && (
            <div className="card">
              <CardHead title="Year by year" sub="Every class this student has been in, with dates. A move closes one row and opens the next." />
              {!data.enrolments.length ? <Empty icon={<Student size={26} weight="duotone" />} title="No enrolment yet" /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="tbl">
                    <thead><tr><th>Session</th><th>Class</th><th className="c">Roll</th><th>From</th><th>To</th><th>Year end</th></tr></thead>
                    <tbody>{data.enrolments.map(e => (
                      <tr key={e.id}>
                        <td>{e.session.replace('-', '–')}</td>
                        <td><b>{e.class_name ?? gradeLabel(e.grade)}</b>{e.stream && <span className="muted"> · {e.stream}</span>}</td>
                        <td className="c">{e.roll_no ?? '—'}</td>
                        <td>{fmtDate(e.starts_on)}</td>
                        <td>{e.ends_on ? <>{fmtDate(e.ends_on)} <span className="muted">· {END_REASON[e.end_reason ?? ''] ?? e.end_reason}</span></> : <Chip tone="g">CURRENT</Chip>}</td>
                        <td>{e.outcome ? <b>{OUTCOME_LABEL[e.outcome]}</b> : e.stage !== 'open' ? <Chip tone={STAGE_TONE[e.stage]}>{STAGE_LABEL[e.stage].toUpperCase()}</Chip> : <span className="muted">{'—'}</span>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {tab === 'history' && (
            <div className="card">
              <CardHead title="Corrections" sub="Nothing on the register is overwritten without a trace: each change keeps the old value, who changed it and why." />
              {!data.changes.length ? <p className="muted">No corrections yet.</p> : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="tbl">
                    <thead><tr><th>When</th><th>Field</th><th>Was</th><th>Now</th><th>Why</th><th>By</th></tr></thead>
                    <tbody>{data.changes.map(c => (
                      <tr key={c.id}><td>{fmtDate(c.changed_at)}</td><td>{FIELD_LABEL(c.field)}</td><td>{show(c.field, c.old_value)}</td><td>{show(c.field, c.new_value)}</td><td>{c.reason}</td><td>{c.by}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {panel === 'correct' && <Correct rec={data} onClose={() => setPanel(null)} onDone={n => done(n ? `${n} field${n === 1 ? '' : 's'} corrected.` : 'Nothing changed.')} />}
      {panel === 'reveal' && <Reveal id={id} onClose={() => setPanel(null)} onShown={a => { setShown(a); setPanel(null); }} />}
      {panel && ['move', 'left', 'rejoin', 'cancel'].includes(panel) && <Act id={id} classes={data.classes} kind={panel as 'move' | 'left' | 'rejoin' | 'cancel'} onClose={() => setPanel(null)} onDone={done} />}
    </>
  );
}

function Correct({ rec, onClose, onDone }: { rec: Record_; onClose: () => void; onDone: (n: number) => void }) {
  const { call } = useAdminDesk();
  const s = rec.student;
  const [vals, setVals] = useState<Record<string, unknown>>(() => Object.fromEntries(FIELDS.map(f => [f.key, s[f.key] ?? null])));
  const [adm, setAdm] = useState(s.admission_no);
  const [aadhaar, setAadhaar] = useState('');
  const [noAadhaar, setNoAadhaar] = useState<boolean>(s.no_aadhaar);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addr, setAddr] = useState<Partial<Address>>(s.address ?? {});
  const [perm, setPerm] = useState<Partial<Address>>(s.permanent_address ?? {});
  const [permSame, setPermSame] = useState<boolean>(s.permanent_same !== false);
  const addrChanged = JSON.stringify(addr) !== JSON.stringify(s.address ?? {}) || JSON.stringify(perm) !== JSON.stringify(s.permanent_address ?? {}) || permSame !== (s.permanent_same !== false);
  const changed = Object.fromEntries(Object.entries(vals).filter(([k, v]) => (v ?? null) !== (s[k] ?? null) && !(v === '' && s[k] == null)));
  const any = Object.keys(changed).length > 0 || adm.trim() !== s.admission_no || !!aadhaar.trim() || noAadhaar !== s.no_aadhaar || addrChanged;
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await call<{ changed: number }>(`/api/admin/students/${s.id}`, 'POST', {
        action: 'correct', fields: changed, reason, ...(adm.trim() !== s.admission_no ? { admissionNo: adm } : {}),
        ...(aadhaar.trim() ? { aadhaar } : {}), ...(noAadhaar !== s.no_aadhaar ? { noAadhaar } : {}),
        ...(addrChanged ? { address: addr, permanent_same: permSame, permanent_address: permSame ? null : perm } : {}),
      });
      onDone(r.changed);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); setBusy(false); }
  };
  return (
    <Workspace title={`Correct ${s.full_name}`} sub="Only what you change is saved. Each change keeps the old value in the record's history." onClose={onClose}
      actions={<button className="btn pri" disabled={busy || !any || reason.trim().length < 3} onClick={save}>{busy ? 'Saving' : 'Save correction'}</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <Field label="WHY THIS IS BEING CORRECTED" htmlFor="c-why" hint="For example: as per birth certificate, parent's request with Aadhaar card.">
        <input id="c-why" className="cmp-in" value={reason} maxLength={300} onChange={e => setReason(e.target.value)} />
      </Field>
      <Field label="ADMISSION NUMBER" htmlFor="c-adm"><input id="c-adm" className="cmp-in" value={adm} maxLength={30} onChange={e => setAdm(e.target.value)} /></Field>
      <AddressInputs title="Current address" value={addr} onChange={setAddr} prefix="c-addr" />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, margin: '8px 0' }}><input type="checkbox" checked={permSame} onChange={e => setPermSame(e.target.checked)} /> Permanent address is the same</label>
      {!permSame && <AddressInputs title="Permanent address" value={perm} onChange={setPerm} prefix="c-perm" />}
      {GROUPS.map(g => (
        <div key={g.key} style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>{g.label}</h3>
          <div className="g2">
            {FIELDS.filter(f => f.group === g.key).map(f => (
              <Field key={f.key} label={f.label.toUpperCase()} htmlFor={`c-${f.key}`} hint={f.hint}>
                <FieldInput f={f} id={`c-${f.key}`} value={vals[f.key]} onChange={v => setVals(x => ({ ...x, [f.key]: v }))} />
              </Field>
            ))}
            {g.key === 'ids' && (
              <Field label={s.aadhaar ? `AADHAAR (NOW ${s.aadhaar})` : 'AADHAAR'} htmlFor="c-aadhaar" hint="Type a number only to replace the one on file.">
                <input id="c-aadhaar" className="cmp-in" inputMode="numeric" maxLength={14} value={aadhaar} disabled={noAadhaar} onChange={e => setAadhaar(e.target.value)} />
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={noAadhaar} onChange={e => setNoAadhaar(e.target.checked)} /> The student has no Aadhaar
                </label>
              </Field>
            )}
          </div>
        </div>
      ))}
    </Workspace>
  );
}

function Reveal({ id, onClose, onShown }: { id: string; onClose: () => void; onShown: (a: string) => void }) {
  const { call } = useAdminDesk();
  const [why, setWhy] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Workspace title="Show the full Aadhaar number" sub="Every look is recorded in the audit trail with your reason." onClose={onClose}
      actions={<button className="btn pri" disabled={why.trim().length < 3} onClick={async () => {
        try { const r = await call<{ aadhaar: string }>(`/api/admin/students/${id}`, 'POST', { action: 'reveal', why }); onShown(r.aadhaar.replace(/(\d{4})(?=\d)/g, '$1 ')); }
        catch (e) { setErr(e instanceof Error ? e.message : 'Could not show it.'); }
      }}>Show</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <Field label="WHY YOU NEED IT" htmlFor="r-why" hint="For example: APAAR creation, scholarship application."><input id="r-why" className="cmp-in" value={why} maxLength={200} onChange={e => setWhy(e.target.value)} /></Field>
    </Workspace>
  );
}

function Act({ id, kind, classes, onClose, onDone }: { id: string; kind: 'move' | 'left' | 'rejoin' | 'cancel'; classes: string[]; onClose: () => void; onDone: (msg: string) => void }) {
  const { call } = useAdminDesk();
  const [cls, setCls] = useState('');
  const [on, setOn] = useState(isoDay());
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const title = kind === 'move' ? 'Move to another class' : kind === 'left' ? 'Mark as left' : kind === 'rejoin' ? 'Rejoin the school' : 'Cancel this entry';
  const ok = kind === 'cancel' ? 'Entry cancelled.' : kind === 'move' ? 'Moved.' : kind === 'left' ? 'Marked as left.' : 'Back on the register.';
  const go = async () => {
    setErr(null);
    try { await call(`/api/admin/students/${id}`, 'POST', { action: kind, className: cls, from: on, on, reason }); onDone(ok); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  const needCls = kind === 'move' || kind === 'rejoin';
  return (
    <Workspace title={title} sub={kind === 'cancel' ? 'For an entry made by mistake. The number is kept and never reused.' : kind === 'left' ? 'The record and its history stay. A Sthara login is blocked from signing in.' : undefined} onClose={onClose}
      actions={<button className="btn pri" disabled={(needCls && !cls) || (kind !== 'rejoin' && reason.trim().length < 3)} onClick={go}>{title}</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {needCls && <Field label="CLASS" htmlFor="a-cls"><select id="a-cls" className="cmp-sel" value={cls} onChange={e => setCls(e.target.value)}><option value="">Pick the class</option>{classes.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>}
      {kind !== 'cancel' && <Field label={kind === 'move' ? 'FROM' : 'ON'} htmlFor="a-on"><input id="a-on" type="date" className="cmp-in" value={on} onChange={e => setOn(e.target.value)} /></Field>}
      <Field label={kind === 'rejoin' ? 'NOTE (OPTIONAL)' : 'WHY'} htmlFor="a-why"><input id="a-why" className="cmp-in" value={reason} maxLength={300} onChange={e => setReason(e.target.value)} /></Field>
    </Workspace>
  );
}
