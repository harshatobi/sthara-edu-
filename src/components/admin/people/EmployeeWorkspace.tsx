'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { EyeIcon as Eye } from '@phosphor-icons/react/dist/ssr/Eye';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { SealCheckIcon as SealCheck } from '@phosphor-icons/react/dist/ssr/SealCheck';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { LockKeyIcon as LockKey } from '@phosphor-icons/react/dist/ssr/LockKey';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { CardHead, Workspace } from '@/components/admin/kit';
import { daysBetween, fmtDate } from '@/lib/admin/format';
import { EMPLOYMENT, STAFF_CATEGORIES } from '@/lib/schedule/types';
import {
  DOC_KINDS, EVENT_KINDS, EXIT_KINDS, GENDERS, JOB_ACTIONS, MARITAL, QUAL_KINDS, STATUS, ageOn, jobDiff, statusOf, tenure,
  type DocRow, type Employee, type ExitRow, type Job, type JobAction, type ProfileRow, type StatutoryRow,
} from '@/lib/hr/engine';
import Pop from '@/components/schedule/Pop';
import type { Call, PeopleData } from '@/lib/hr/usePeople';
import { BasicsForm, DocForm, ExitForm, JobForm, NoteForm, ProbationForm, ProfileForm, QualForm, StatutoryForm, type Qual } from './forms';

const API = '/api/admin/people';
const DOCS = '/api/admin/people/documents';

interface Detail {
  person: Employee; today: string; can: { manage: boolean; sensitive: boolean };
  jobs: Job[]; events: { id: string; kind: keyof typeof EVENT_KINDS; onDate: string; note: string | null }[]; exits: ExitRow[];
  qualifications: Qual[]; documents: DocRow[]; reports: string[]; profile?: ProfileRow | null; statutory?: StatutoryRow | null;
}
type Open =
  | { k: 'basics' } | { k: 'job'; start?: JobAction } | { k: 'probation' } | { k: 'exit' } | { k: 'withdraw'; exit: ExitRow } | { k: 'rejoin' }
  | { k: 'link' } | { k: 'profile' } | { k: 'statutory'; full: StatutoryRow | null } | { k: 'doc' } | { k: 'qual'; q: Qual | null };

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === '';
  return <div><dt>{label}</dt><dd className={empty ? 'none' : undefined}>{empty ? 'Not set' : children}</dd></div>;
}

/** One employee's whole record: job and history, lifecycle, personal and statutory details, qualifications and documents. */
export default function EmployeeWorkspace({ id, data, call, onClose, onChanged, toast }: {
  id: string; data: PeopleData; call: Call; onClose: () => void; onChanged: () => void; toast: (m: string) => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [shown, setShown] = useState<StatutoryRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveTo, setMoveTo] = useState('');
  const load = useCallback(() => {
    call<Detail>(`${API}?id=${id}`, 'GET').then(x => { setD(x); setError(null); }).catch(e => setError(e.message));
  }, [call, id]);
  useEffect(load, [load]);
  // Escape closes the form on top first, and the workspace keeps one stable close handler so it doesn't
  // take focus back every time the page behind it refreshes.
  const live = useRef({ open: false, onClose });
  useEffect(() => { live.current = { open: !!open, onClose }; });
  const close = useCallback(() => { if (!live.current.open) live.current.onClose(); }, []);

  const saved = (msg: string) => { setOpen(null); setShown(null); load(); onChanged(); toast(msg); };
  /** A one-click action: run it, then refresh, or say why it failed. */
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); saved(msg); } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  const reveal = async () => (await call<{ statutory: StatutoryRow | null }>(API, 'POST', { action: 'reveal', id })).statutory;

  if (error) return <Workspace title="Employee" onClose={onClose}><div className="note err" role="alert">{error}</div></Workspace>;
  if (!d) return <Workspace title="Employee" onClose={onClose}><div aria-busy="true">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={90} style={{ marginBottom: 14 }} />)}</div></Workspace>;

  const e = d.person, today = d.today;
  const exit = d.exits.find(x => x.status === 'notice') ?? null;
  const status = statusOf(e, !!exit);
  const dept = (x: string | null) => data.departments.find(v => v.id === x)?.name ?? '';
  const grade = (x: string | null) => data.grades.find(v => v.id === x)?.name ?? '';
  const person = (x: string | null) => data.people.find(v => v.id === x)?.name ?? '';
  const manager = data.people.find(p => p.id === e.managerId);
  const names = { dept, grade, person };
  const form = { data, call, onClose: () => setOpen(null), onSaved: saved };
  const timeline = [
    ...d.jobs.map((j, i) => ({ at: j.effectiveFrom, job: j, prev: d.jobs[i - 1] ?? null })),
    ...d.events.map(ev => ({ at: ev.onDate, ev })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const p = d.profile, s = shown ?? d.statutory;
  const lastJob = d.jobs[d.jobs.length - 1];
  // Logins whose own record is still the bare one made with the account: the only ones that can be joined to this record.
  const candidates = data.people.filter(x => x.userId && x.active && x.id !== e.id && !x.employeeCode && !x.departmentId && !x.gradeId);
  const others = data.people.filter(x => x.active && x.id !== e.id);

  return (
    <Workspace wide title={e.name} onClose={close}
      sub={[e.employeeCode, e.designation || STAFF_CATEGORIES[e.category], dept(e.departmentId), e.joinedOn ? `${tenure(e.joinedOn, today)} at the school` : ''].filter(Boolean).join(' · ')}
      actions={<Chip tone={STATUS[status].tone}>{STATUS[status].label.toUpperCase()}</Chip>}>

      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Job" sub={e.login ? `Has a ${e.login === 'teacher' ? 'teacher' : 'office'} login (${e.email || 'no email'}).` : 'No Sthara login.'}
          right={e.active ? (
            <div className="hr-acts">
              <button className="btn sm" onClick={() => setOpen({ k: 'basics' })}><PencilSimple size={13} /> Basics</button>
              <button className="btn sm pri" onClick={() => setOpen({ k: 'job' })}>Change job</button>
              {e.employment !== 'permanent' && <button className="btn sm" onClick={() => setOpen({ k: 'job', start: 'renewal' })}>Renew contract</button>}
              {e.employment === 'permanent' && <button className="btn sm" onClick={() => setOpen({ k: 'probation' })}>{e.probationUntil && !e.confirmedOn ? 'Confirm or extend' : 'Probation'}</button>}
              {!e.userId && candidates.length > 0 && <button className="btn sm" onClick={() => setOpen({ k: 'link' })}>Link login</button>}
              {!exit && <button className="btn sm" onClick={() => setOpen({ k: 'exit' })}>Start exit</button>}
            </div>
          ) : <button className="btn sm pri" onClick={() => setOpen({ k: 'rejoin' })}>Record as rejoined</button>} />
        <dl className="hr-kv">
          <Fact label="Designation">{e.designation}</Fact>
          <Fact label="Category">{STAFF_CATEGORIES[e.category]}</Fact>
          <Fact label="Department">{dept(e.departmentId)}</Fact>
          <Fact label="Grade">{grade(e.gradeId)}</Fact>
          <Fact label="Reports to">{manager ? `${manager.name}${manager.active ? '' : ' (has left)'}` : ''}</Fact>
          <Fact label="Direct reports">{d.reports.length ? d.reports.map(person).join(', ') : ''}</Fact>
          <Fact label="Employment">{EMPLOYMENT[e.employment]}{e.contractTo ? ` to ${fmtDate(e.contractTo)}` : ''}</Fact>
          <Fact label="Joined">{e.joinedOn ? fmtDate(e.joinedOn) : ''}</Fact>
          <Fact label="Mobile">{e.phone}</Fact>
          {e.employment === 'permanent' && <Fact label="Probation">{e.confirmedOn ? `Confirmed ${fmtDate(e.confirmedOn)}` : e.probationUntil ? `Until ${fmtDate(e.probationUntil)}` : 'None recorded'}</Fact>}
          {!e.active && <Fact label="Left on">{e.exitOn ? fmtDate(e.exitOn) : 'Date not recorded'}</Fact>}
        </dl>
        {manager && !manager.active && <div className="note" style={{ marginTop: 14 }}>{manager.name} has left the school. Use Change job to set who {e.name} reports to now.</div>}
      </div>

      {exit && (
        <div className="card" style={{ marginBottom: 18 }}>
          <CardHead title={`${EXIT_KINDS[exit.kind]}: last day ${fmtDate(exit.lastDay)}`}
            sub={`Notice given ${fmtDate(exit.noticeOn)}.${exit.reason ? ` ${exit.reason}` : ''} ${exit.lastDay > today ? `${daysBetween(today, exit.lastDay)} days to go.` : 'The last day has passed: close the exit.'}`}
            right={<div className="hr-acts">
              <button className="btn sm" onClick={() => setOpen({ k: 'withdraw', exit })}>Withdraw</button>
              <button className="btn sm red" disabled={busy || exit.lastDay > today || (d.reports.length > 0 && moveTo === '')} title={exit.lastDay > today ? 'Available on the last working day' : undefined}
                onClick={() => act(() => call(API, 'POST', { action: 'exit_complete', exitId: exit.id, ...(d.reports.length ? { reportsTo: moveTo === 'none' ? null : moveTo } : {}) }), e.userId ? `${e.name} has left. Whoever manages logins was told to remove the account` : `${e.name} has left the register`)}>Close exit</button>
            </div>} />
          {exit.checklist.map(c => (
            <label key={c.key} className="hr-check">
              <input type="checkbox" checked={c.done} disabled={busy} onChange={ev => act(() => call(API, 'POST', { action: 'exit_check', exitId: exit.id, key: c.key, done: ev.target.checked }), 'Checklist updated')} />
              <span>{c.label}{c.done && c.by && <span className="by"> · {c.by}, {fmtDate(c.at, true)}</span>}</span>
            </label>
          ))}
          {d.reports.length > 0 && (
            <div className="cmp-fld" style={{ marginTop: 12, maxWidth: 420 }}>
              <label htmlFor="x-move">{d.reports.length === 1 ? `${person(d.reports[0])} REPORTS TO THEM. FROM THE LAST DAY, REPORTS TO` : `${d.reports.length} PEOPLE REPORT TO THEM. FROM THE LAST DAY, THEY REPORT TO`}</label>
              <select id="x-move" className="cmp-sel" value={moveTo} onChange={ev => setMoveTo(ev.target.value)}>
                <option value="">Choose before closing the exit</option>
                {others.map(x => <option key={x.id} value={x.id}>{x.name}{x.designation ? ` · ${x.designation}` : ''}</option>)}
                <option value="none">Nobody for now</option>
              </select>
            </div>
          )}
          {e.userId && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Closing the exit doesn&apos;t delete their login. Whoever manages logins at the school is notified to remove it.</p>}
        </div>
      )}

      <div className="g2" style={{ marginBottom: 18 }}>
        <div className="card">
          <CardHead title="Personal details" right={d.can.sensitive && <button className="btn sm" onClick={() => setOpen({ k: 'profile' })}><PencilSimple size={13} /> Edit</button>} />
          {!d.can.sensitive ? <Empty icon={<LockKey size={26} weight="duotone" />} title="Restricted">Personal details are visible to HR, the principal and the school admin.</Empty> : (
            <dl className="hr-kv">
              <Fact label="Date of birth">{p?.date_of_birth ? `${fmtDate(p.date_of_birth)} (${ageOn(p.date_of_birth, today)})` : ''}</Fact>
              <Fact label="Gender">{p?.gender ? GENDERS[p.gender as keyof typeof GENDERS] : ''}</Fact>
              <Fact label="Blood group">{p?.blood_group}</Fact>
              <Fact label="Marital status">{p?.marital_status ? MARITAL[p.marital_status as keyof typeof MARITAL] : ''}</Fact>
              <Fact label="Father or spouse">{p?.kin_name}</Fact>
              <Fact label="Personal email">{p?.personal_email}</Fact>
              <Fact label="Address">{[p?.address, p?.city, p?.state, p?.pincode].filter(Boolean).join(', ')}</Fact>
              <Fact label="Emergency contact">{[p?.emergency_name, p?.emergency_relation, p?.emergency_phone].filter(Boolean).join(' · ')}</Fact>
            </dl>
          )}
        </div>
        <div className="card">
          <CardHead title="Statutory and bank" sub={d.can.sensitive ? 'Numbers are masked. Showing them is recorded in the audit trail.' : undefined}
            right={d.can.sensitive && <div className="hr-acts">
              {d.statutory && !shown && <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); try { setShown(await reveal()); } catch (x: any) { toast(x.message); } finally { setBusy(false); } }}><Eye size={13} /> Show</button>}
              <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); try { setOpen({ k: 'statutory', full: d.statutory ? await reveal() : null }); } catch (x: any) { toast(x.message); } finally { setBusy(false); } }}><PencilSimple size={13} /> Edit</button>
            </div>} />
          {!d.can.sensitive ? <Empty icon={<LockKey size={26} weight="duotone" />} title="Restricted">PAN, PF, ESI and bank details are visible to HR, the principal and the school admin.</Empty> : (
            <dl className="hr-kv">
              <Fact label="PAN"><span className="num">{s?.pan}</span></Fact>
              <Fact label="UAN (PF)"><span className="num">{s?.uan}</span></Fact>
              <Fact label="ESI number"><span className="num">{s?.esi_no}</span></Fact>
              <Fact label="Aadhaar"><span className="num">{s?.aadhaar_last4 ? `ends ${s.aadhaar_last4}` : ''}</span></Fact>
              <Fact label="Bank account"><span className="num">{s?.bank_account}</span></Fact>
              <Fact label="IFSC"><span className="num">{s?.bank_ifsc}</span></Fact>
              <Fact label="Bank">{[s?.bank_name, s?.bank_holder].filter(Boolean).join(' · ')}</Fact>
              <Fact label="Nominee">{[s?.nominee_name, s?.nominee_relation].filter(Boolean).join(' · ')}</Fact>
            </dl>
          )}
        </div>
      </div>

      <div className="g2" style={{ marginBottom: 18 }}>
        <div className="card">
          <CardHead title="Qualifications" right={<button className="btn sm" onClick={() => setOpen({ k: 'qual', q: null })}><Plus size={12} weight="bold" /> Add</button>} />
          {d.qualifications.length ? (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Qualification</th><th className="c">Year</th><th className="c">Verified</th><th /></tr></thead>
              <tbody>{d.qualifications.map(q => (
                <tr key={q.id}>
                  <td><b>{q.title}</b><div className="muted" style={{ fontSize: 12 }}>{[QUAL_KINDS[q.kind as keyof typeof QUAL_KINDS], q.institution, q.result].filter(Boolean).join(' · ')}</div></td>
                  <td className="c num">{q.year ?? '—'}</td>
                  <td className="c">{q.verifiedOn ? <span title={`Original seen ${fmtDate(q.verifiedOn)}`}><SealCheck size={18} weight="fill" color="var(--green)" /></span> : <Chip tone="a">NOT YET</Chip>}</td>
                  <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    <button className="sch-icon" aria-label={`Edit ${q.title}`} onClick={() => setOpen({ k: 'qual', q })}><PencilSimple size={15} /></button>
                    <button className="sch-icon" aria-label={`Remove ${q.title}`} disabled={busy} onClick={() => act(() => call(DOCS, 'DELETE', { entity: 'qualification', id: q.id }), 'Qualification removed')}><Trash size={15} /></button>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty icon={<SealCheck size={26} weight="duotone" />} title="None recorded">Add degrees, B.Ed, CTET and other certificates. CBSE inspections ask for teachers&apos; qualifications.</Empty>}
        </div>
        <div className="card">
          <CardHead title="Documents" sub="Kept in private storage. Opening a file is recorded in the audit trail." right={<button className="btn sm" onClick={() => setOpen({ k: 'doc' })}><Plus size={12} weight="bold" /> Add</button>} />
          {d.documents.length ? (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Document</th><th>Expires</th><th /></tr></thead>
              <tbody>{d.documents.map(doc => {
                const left = doc.expiresOn ? daysBetween(today, doc.expiresOn) : null;
                return (
                  <tr key={doc.id}>
                    <td><b>{doc.title}</b><div className="muted" style={{ fontSize: 12 }}>{DOC_KINDS[doc.kind]}{doc.issuedOn ? ` · issued ${fmtDate(doc.issuedOn)}` : ''}{doc.hasFile ? '' : ' · no file'}</div></td>
                    <td>{doc.expiresOn ? <>{fmtDate(doc.expiresOn)} {left! < 0 ? <Chip tone="r">EXPIRED</Chip> : left! <= data.settings.alertDays ? <Chip tone="a">{left} DAYS</Chip> : null}</> : <span className="muted">—</span>}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      {doc.hasFile && d.can.sensitive && <button className="sch-icon" aria-label={`Open ${doc.title}`} disabled={busy} onClick={async () => {
                        setBusy(true);
                        try { const r = await call<{ url: string }>(`${DOCS}?id=${doc.id}`, 'GET'); window.open(r.url, '_blank', 'noopener'); } catch (x: any) { toast(x.message); } finally { setBusy(false); }
                      }}><DownloadSimple size={15} /></button>}
                      <button className="sch-icon" aria-label={`Remove ${doc.title}`} disabled={busy} onClick={() => act(() => call(DOCS, 'DELETE', { entity: 'document', id: doc.id }), 'Document removed')}><Trash size={15} /></button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          ) : <Empty icon={<FileText size={26} weight="duotone" />} title="No documents yet">Add ID and address proof, certificates, the appointment letter, and for support staff the police verification with its expiry date.</Empty>}
        </div>
      </div>

      <div className="card">
        <CardHead title="History" sub="Every job change with the date it took effect, and the lifecycle events between them. Changes dated ahead are marked and take effect on their day." />
        <ul className="hr-tl">
          {timeline.map(t => 'job' in t && t.job ? (
            <li key={`j${t.job.id}`} className={t.job.effectiveFrom > today ? 'due' : undefined}>
              <div className="when">{fmtDate(t.job.effectiveFrom)}{t.job.effectiveFrom > today && <> <Chip tone="a">TAKES EFFECT IN {daysBetween(today, t.job.effectiveFrom)} DAYS</Chip></>}</div>
              <div className="what">{JOB_ACTIONS[t.job.action]}{t.job.designation ? `: ${t.job.designation}` : ''}</div>
              <div className="why">
                {t.prev ? jobDiff(t.prev, t.job, names).join('. ') || 'No change to the job itself.' : [STAFF_CATEGORIES[t.job.category], dept(t.job.departmentId), grade(t.job.gradeId), EMPLOYMENT[t.job.employment]].filter(Boolean).join(' · ')}
                {t.job.reason && <div>{t.job.reason}{t.job.authority ? ` (approved by ${t.job.authority})` : ''}</div>}
                {t.prev && t.job.id === lastJob.id && e.active && (
                  <button className="btn sm" style={{ marginTop: 6 }} disabled={busy} onClick={() => act(() => call(API, 'POST', { action: 'job_delete', jobId: t.job.id }), 'Change removed')}>{t.job.effectiveFrom > today ? 'Cancel this change' : 'Undo this change'}</button>
                )}
              </div>
            </li>
          ) : 'ev' in t && t.ev ? (
            <li key={`e${t.ev.id}`} className="ev">
              <div className="when">{fmtDate(t.ev.onDate)}</div>
              <div className="what">{EVENT_KINDS[t.ev.kind]}</div>
              {t.ev.note && <div className="why">{t.ev.note}</div>}
            </li>
          ) : null)}
        </ul>
      </div>

      {open?.k === 'basics' && <BasicsForm e={e} {...form} />}
      {open?.k === 'job' && <JobForm e={e} start={open.start} {...form} />}
      {open?.k === 'probation' && <ProbationForm e={e} {...form} />}
      {open?.k === 'exit' && <ExitForm e={e} {...form} />}
      {open?.k === 'profile' && <ProfileForm e={e} profile={p ?? null} {...form} />}
      {open?.k === 'statutory' && <StatutoryForm e={e} full={open.full} {...form} />}
      {open?.k === 'doc' && <DocForm e={e} {...form} />}
      {open?.k === 'qual' && <QualForm e={e} q={open.q} docs={d.documents} {...form} />}
      {open?.k === 'withdraw' && (
        <NoteForm title={`${e.name}: withdraw the exit`} sub="They stay on the register as before. The exit and this note are kept on their history." label="WHY IT IS BEING WITHDRAWN" required cta="Withdraw exit"
          onClose={() => setOpen(null)} onSubmit={async note => { await call(API, 'POST', { action: 'exit_withdraw', exitId: open.exit.id, note }); saved('Exit withdrawn'); }} />
      )}
      {open?.k === 'link' && <LinkForm e={e} candidates={candidates} call={call} onClose={() => setOpen(null)} onSaved={saved} />}
      {open?.k === 'rejoin' && <RejoinForm e={e} today={today} call={call} onClose={() => setOpen(null)} onSaved={saved} />}
    </Workspace>
  );
}

function RejoinForm({ e, today, call, onClose, onSaved }: { e: Employee; today: string; call: Call; onClose: () => void; onSaved: (m: string) => void }) {
  const [on, setOn] = useState(today);
  const [to, setTo] = useState('');
  return (
    <NoteForm title={`${e.name}: record as rejoined`} sub="They come back on the register with the job they had. Change it afterwards if the role is different." label="NOTE" cta="Record as rejoined"
      extra={<div className="sch-fields">
        <div className="cmp-fld"><label htmlFor="rj-on">REJOINED ON</label><input id="rj-on" type="date" className="cmp-in" max={today} value={on} onChange={ev => setOn(ev.target.value)} /></div>
        {e.employment !== 'permanent' && <div className="cmp-fld"><label htmlFor="rj-to">NEW CONTRACT ENDS</label><input id="rj-to" type="date" className="cmp-in" min={on} value={to} onChange={ev => setTo(ev.target.value)} /></div>}
      </div>}
      onClose={onClose} onSubmit={async note => { await call(API, 'POST', { action: 'rehire', id: e.id, on, contractTo: to || null, note }); onSaved(`${e.name} is back on the register`); }} />
  );
}

function LinkForm({ e, candidates, call, onClose, onSaved }: { e: Employee; candidates: Employee[]; call: Call; onClose: () => void; onSaved: (m: string) => void }) {
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const link = async () => {
    setBusy(true); setErr(null);
    try { await call(API, 'POST', { action: 'link_login', id: e.id, userId }); onSaved(`${e.name} now has their login on this record`); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Pop title={`${e.name}: link their login`} onClose={onClose}
      sub="Use this when someone who was on the register without a login has now been given one. This record keeps its history, and their attendance, shifts, leave, duties and lessons move to the login. The empty record that came with the login is removed.">
      <div className="cmp-fld">
        <label htmlFor="lk-u">THEIR LOGIN</label>
        <select id="lk-u" className="cmp-sel" value={userId} onChange={ev => setUserId(ev.target.value)}>
          <option value="">Choose the login</option>
          {candidates.map(c => <option key={c.id} value={c.userId!}>{c.name} · {c.email || (c.login === 'teacher' ? 'teacher' : 'office')}</option>)}
        </select>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Only logins whose own record is still empty are listed. This can&apos;t be undone from here.</div>
      </div>
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div className="hr-form-acts">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || !userId} onClick={link}>{busy ? 'Linking…' : 'Link login'}</button>
      </div>
    </Pop>
  );
}
