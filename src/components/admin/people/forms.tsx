'use client';

import { useState, type ReactNode } from 'react';
import Pop, { run } from '@/components/schedule/Pop';
import { fmtDate } from '@/lib/admin/format';
import { EMPLOYMENT, STAFF_CATEGORIES, type Employment, type StaffCategory } from '@/lib/schedule/types';
import {
  BLOOD_GROUPS, DOC_KINDS, EXIT_KINDS, GENDERS, JOB_ACTIONS, JOB_CHANGE_ACTIONS, MARITAL, QUAL_KINDS, addDays, addMonths,
  type DocRow, type Employee, type ExitKind, type JobAction, type ProfileRow, type StatutoryRow,
} from '@/lib/hr/engine';
import type { Call, PeopleData } from '@/lib/hr/usePeople';

const API = '/api/admin/people';
export interface FormProps { data: PeopleData; call: Call; onClose: () => void; onSaved: (msg: string) => void }

// ── Small field helpers ─────────────────────────────────────────────────────
export function In({ id, label, value, onChange, hint, ...rest }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'id'>) {
  return (
    <div className="cmp-fld">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="cmp-in" value={value} onChange={e => onChange(e.target.value)} {...rest} />
      {hint && <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}
export function Sel({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <div className="cmp-fld">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="cmp-sel" value={value} onChange={e => onChange(e.target.value)}>{children}</select>
    </div>
  );
}
function Area({ id, label, value, onChange, placeholder, max = 500 }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; max?: number }) {
  return (
    <div className="cmp-fld" style={{ marginTop: 10 }}>
      <label htmlFor={id}>{label}</label>
      <textarea id={id} className="hr-ta" value={value} maxLength={max} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
function Acts({ busy, err, onClose, onSave, label, disabled, danger }: { busy: boolean; err: string | null; onClose: () => void; onSave: () => void; label: string; disabled?: boolean; danger?: boolean }) {
  return (
    <>
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div className="hr-form-acts">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${danger ? 'red' : 'pri'}`} disabled={busy || disabled} onClick={onSave}>{busy ? 'Saving…' : label}</button>
      </div>
    </>
  );
}

// ── The job (shared by hire and job change) ─────────────────────────────────
export interface JobValues { category: StaffCategory; designation: string; departmentId: string; gradeId: string; managerId: string; employment: Employment; contractFrom: string; contractTo: string }
export const jobValues = (e?: Partial<Employee> | null): JobValues => ({
  category: e?.category ?? 'teaching', designation: e?.designation ?? '', departmentId: e?.departmentId ?? '', gradeId: e?.gradeId ?? '',
  managerId: e?.managerId ?? '', employment: e?.employment ?? 'permanent', contractFrom: e?.contractFrom ?? '', contractTo: e?.contractTo ?? '',
});
const jobBody = (v: JobValues) => ({
  category: v.category, designation: v.designation, departmentId: v.departmentId || null, gradeId: v.gradeId || null, managerId: v.managerId || null,
  employment: v.employment, contractFrom: v.contractFrom || null, contractTo: v.contractTo || null,
});

function JobFields({ v, set, data, selfId, p }: { v: JobValues; set: (v: JobValues) => void; data: PeopleData; selfId?: string; p: string }) {
  const grades = data.grades.filter(g => (g.active || g.id === v.gradeId) && (!g.category || g.category === v.category));
  return (
    <div className="sch-fields">
      <Sel id={`${p}-cat`} label="CATEGORY" value={v.category} onChange={x => set({ ...v, category: x as StaffCategory })}>
        {Object.entries(STAFF_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </Sel>
      <In id={`${p}-des`} label="DESIGNATION" value={v.designation} maxLength={80} onChange={x => set({ ...v, designation: x })} placeholder="TGT Mathematics" />
      <Sel id={`${p}-dep`} label="DEPARTMENT" value={v.departmentId} onChange={x => set({ ...v, departmentId: x })}>
        <option value="">Not set</option>
        {data.departments.filter(d => d.active || d.id === v.departmentId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </Sel>
      <Sel id={`${p}-gr`} label="GRADE" value={v.gradeId} onChange={x => set({ ...v, gradeId: x })}>
        <option value="">Not set</option>
        {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
      </Sel>
      <Sel id={`${p}-mgr`} label="REPORTS TO" value={v.managerId} onChange={x => set({ ...v, managerId: x })}>
        <option value="">Nobody set</option>
        {data.people.filter(x => (x.active || x.id === v.managerId) && x.id !== selfId).map(x => <option key={x.id} value={x.id}>{x.name}{x.designation ? ` · ${x.designation}` : ''}</option>)}
      </Sel>
      <Sel id={`${p}-emp`} label="EMPLOYMENT" value={v.employment} onChange={x => set({ ...v, employment: x as Employment })}>
        {Object.entries(EMPLOYMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </Sel>
      {v.employment !== 'permanent' && <>
        <In id={`${p}-cf`} label="CONTRACT FROM" type="date" value={v.contractFrom} onChange={x => set({ ...v, contractFrom: x })} />
        <In id={`${p}-ct`} label="CONTRACT TO" type="date" min={v.contractFrom || undefined} value={v.contractTo} onChange={x => set({ ...v, contractTo: x })} />
      </>}
    </div>
  );
}

// ── Hire ────────────────────────────────────────────────────────────────────
export function HireForm({ data, call, onClose, onSaved }: FormProps) {
  const [name, setName] = useState('');
  const [job, setJob] = useState<JobValues>(jobValues({ category: 'support' }));
  const [joined, setJoined] = useState(data.today);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [months, setMonths] = useState(String(data.settings.probationMonths));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = `${data.settings.codePrefix}${String(data.settings.codeLastNo + 1).padStart(data.settings.codeWidth, '0')}`;
  const m = Number(months);
  const save = async () => {
    let issued = '';
    if (await run(setBusy, setErr, async () => {
      const r = await call<{ employeeCode: string }>(API, 'POST', { action: 'hire', name, ...jobBody(job), joinedOn: joined, phone: phone || null, employeeCode: code, probationMonths: Number.isInteger(m) ? m : undefined });
      issued = r.employeeCode;
    })) onSaved(`${name} added as ${issued}`);
  };
  return (
    <Pop wide title="Add an employee" sub="For staff with no Sthara login: drivers, security, housekeeping, visiting teachers. Teachers and office staff who need a login are requested in the user directory and appear here automatically." onClose={onClose}>
      <div className="sch-fields" style={{ marginBottom: 10 }}>
        <In id="h-n" label="NAME" value={name} maxLength={120} onChange={setName} />
        <In id="h-j" label="JOINING DATE" type="date" value={joined} onChange={setJoined} />
        <In id="h-p" label="MOBILE" inputMode="tel" value={phone} maxLength={20} onChange={setPhone} placeholder="98xxxxxxxx" />
        <In id="h-c" label="EMPLOYEE CODE" value={code} maxLength={40} onChange={setCode} placeholder={next} hint={`Leave blank to issue the next code (about ${next}).`} />
      </div>
      <JobFields v={job} set={setJob} data={data} p="h" />
      {job.employment === 'permanent' && (
        <div className="sch-fields" style={{ marginTop: 10 }}>
          <In id="h-m" label="PROBATION (MONTHS)" type="number" min={0} max={36} value={months} onChange={setMonths}
            hint={m > 0 && joined ? `Ends ${fmtDate(addMonths(joined, m))}. HR is reminded before it does.` : 'No probation: they join as confirmed.'} />
        </div>
      )}
      <Acts busy={busy} err={err} onClose={onClose} onSave={save} label="Add employee" disabled={!name.trim() || !joined} />
    </Pop>
  );
}

// ── Basics ──────────────────────────────────────────────────────────────────
export function BasicsForm({ e, data, call, onClose, onSaved }: FormProps & { e: Employee }) {
  const [v, setV] = useState({ name: e.name, phone: e.phone ?? '', code: e.employeeCode ?? '', joined: e.joinedOn ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = (issueCode = false) => run(setBusy, setErr, () => call(API, 'POST', { action: 'basics', id: e.id, name: v.name, phone: v.phone || null, employeeCode: v.code, issueCode, joinedOn: v.joined || null }));
  return (
    <Pop title={`${e.name}: basics`} sub={e.userId ? 'Their name comes from their Sthara login; rename them in the user directory.' : undefined} onClose={onClose}>
      <div className="sch-fields">
        {!e.userId && <In id="b-n" label="NAME" value={v.name} maxLength={120} onChange={x => setV({ ...v, name: x })} />}
        <In id="b-c" label="EMPLOYEE CODE" value={v.code} maxLength={40} onChange={x => setV({ ...v, code: x })} />
        <In id="b-j" label="JOINING DATE" type="date" max={data.today} value={v.joined} onChange={x => setV({ ...v, joined: x })} hint="Correcting this moves the start of their job history." />
        <In id="b-p" label="MOBILE" inputMode="tel" value={v.phone} maxLength={20} onChange={x => setV({ ...v, phone: x })} />
      </div>
      {!v.code && <button className="btn sm" style={{ marginTop: 10 }} disabled={busy} onClick={async () => { if (await save(true)) onSaved('Employee code issued'); }}>Issue the next employee code</button>}
      <Acts busy={busy} err={err} onClose={onClose} onSave={async () => { if (await save()) onSaved('Saved'); }} label="Save" />
    </Pop>
  );
}

// ── Job change ──────────────────────────────────────────────────────────────
const ACTION_HELP: Partial<Record<JobAction, string>> = {
  promotion: 'A higher grade or post.', transfer: 'A move to another department or reporting line.', redesignation: 'A new title in the same post.',
  employment_change: 'Contract to permanent, or the other way.', renewal: 'A new end date for a contract or visiting engagement.',
  correction: 'Fixes a mistake in the record; not a real change to their job.',
};
export function JobForm({ e, start, data, call, onClose, onSaved }: FormProps & { e: Employee; start?: JobAction }) {
  const [kind, setKind] = useState<JobAction>(start ?? 'promotion');
  const [from, setFrom] = useState(data.today);
  const [job, setJob] = useState<JobValues>(() => {
    const v = jobValues(e);
    // A renewal starts the day after the current contract ends.
    return start === 'renewal' && e.contractTo ? { ...v, contractFrom: addDays(e.contractTo, 1), contractTo: '' } : v;
  });
  const [reason, setReason] = useState('');
  const [authority, setAuthority] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const future = from > data.today;
  const save = async () => {
    if (await run(setBusy, setErr, () => call(API, 'POST', { action: 'job', id: e.id, kind, effectiveFrom: from, reason, authority, ...jobBody(job) }))) {
      onSaved(future ? `Saved. It takes effect on ${fmtDate(from)}` : `${JOB_ACTIONS[kind]} recorded`);
    }
  };
  return (
    <Pop wide title={`${e.name}: job change`} sub="Set the job as it will be from the date. The record keeps what it was before, so you can always see their job on any past date." onClose={onClose}>
      <div className="sch-fields" style={{ marginBottom: 10 }}>
        <Sel id="j-k" label="WHAT IS CHANGING" value={kind} onChange={x => setKind(x as JobAction)}>
          {JOB_CHANGE_ACTIONS.map(a => <option key={a} value={a}>{JOB_ACTIONS[a]}</option>)}
        </Sel>
        <In id="j-f" label="TAKES EFFECT ON" type="date" value={from} onChange={setFrom} hint={future ? 'A future date: the register changes on that day.' : ACTION_HELP[kind]} />
        <In id="j-a" label="APPROVED BY" value={authority} maxLength={120} onChange={setAuthority} placeholder="Principal, order no. 14/2026" />
      </div>
      <JobFields v={job} set={setJob} data={data} selfId={e.id} p="j" />
      <Area id="j-r" label="REASON" value={reason} onChange={setReason} placeholder="Why this change is being made (kept on the record)." />
      <Acts busy={busy} err={err} onClose={onClose} onSave={save} label={future ? 'Schedule change' : 'Record change'} disabled={!from || !reason.trim()} />
    </Pop>
  );
}

// ── Probation ───────────────────────────────────────────────────────────────
export function ProbationForm({ e, data, call, onClose, onSaved }: FormProps & { e: Employee }) {
  const onProbation = !!e.probationUntil && !e.confirmedOn;
  const [op, setOp] = useState<'confirm' | 'set'>(onProbation ? 'confirm' : 'set');
  const [on, setOn] = useState(data.today);
  const [until, setUntil] = useState(e.probationUntil && e.probationUntil > data.today ? addMonths(e.probationUntil, 3) : addMonths(data.today, 3));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (await run(setBusy, setErr, () => call(API, 'POST', { action: 'probation', id: e.id, op, on, until, note }))) onSaved(op === 'confirm' ? `${e.name} confirmed` : 'Probation saved');
  };
  return (
    <Pop title={`${e.name}: probation`} sub={onProbation ? `On probation until ${fmtDate(e.probationUntil)}.` : e.confirmedOn ? `Confirmed on ${fmtDate(e.confirmedOn)}.` : 'No probation on record.'} onClose={onClose}>
      {onProbation && (
        <div className="sch-seg" role="tablist" aria-label="Decision" style={{ marginBottom: 14 }}>
          <button role="tab" aria-selected={op === 'confirm'} className={op === 'confirm' ? 'on' : ''} onClick={() => setOp('confirm')}>Confirm</button>
          <button role="tab" aria-selected={op === 'set'} className={op === 'set' ? 'on' : ''} onClick={() => setOp('set')}>Extend</button>
        </div>
      )}
      <div className="sch-fields">
        {op === 'confirm'
          ? <In id="pr-on" label="CONFIRMED ON" type="date" max={data.today} value={on} onChange={setOn} />
          : <In id="pr-un" label="PROBATION ENDS" type="date" value={until} onChange={setUntil} />}
      </div>
      <Area id="pr-n" label={op === 'set' && onProbation ? 'REASON FOR EXTENDING' : 'NOTE'} value={note} onChange={setNote} max={1000} />
      <Acts busy={busy} err={err} onClose={onClose} onSave={save} label={op === 'confirm' ? 'Confirm' : onProbation ? 'Extend probation' : 'Set probation'} />
    </Pop>
  );
}

// ── Exit, rejoin ────────────────────────────────────────────────────────────
export function ExitForm({ e, data, call, onClose, onSaved }: FormProps & { e: Employee }) {
  const contractEnd = e.employment !== 'permanent' && !!e.contractTo;
  const [kind, setKind] = useState<ExitKind>(contractEnd ? 'contract_end' : 'resignation');
  const [noticeOn, setNoticeOn] = useState(data.today);
  const [lastDay, setLastDay] = useState(contractEnd ? e.contractTo! : addDays(data.today, data.settings.noticeDays));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (await run(setBusy, setErr, () => call(API, 'POST', { action: 'exit_start', id: e.id, kind, noticeOn, lastDay, reason }))) onSaved(`Exit started. Last day ${fmtDate(lastDay)}`);
  };
  return (
    <Pop title={`${e.name}: start exit`} sub="They stay on the register and schedules until the exit is closed on their last working day." onClose={onClose}>
      <div className="sch-fields">
        <Sel id="x-k" label="KIND" value={kind} onChange={x => setKind(x as ExitKind)}>
          {Object.entries(EXIT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Sel>
        <In id="x-n" label="NOTICE GIVEN ON" type="date" max={data.today} value={noticeOn} onChange={x => { setNoticeOn(x); if (!contractEnd && x) setLastDay(addDays(x, data.settings.noticeDays)); }} />
        <In id="x-l" label="LAST WORKING DAY" type="date" min={noticeOn} value={lastDay} onChange={setLastDay} hint={`The school's notice period is ${data.settings.noticeDays} days.`} />
      </div>
      <Area id="x-r" label="REASON" value={reason} onChange={setReason} max={1000} placeholder={kind === 'termination' ? 'Required for a termination.' : 'Optional.'} />
      <Acts busy={busy} err={err} onClose={onClose} onSave={save} label="Start exit" danger disabled={!noticeOn || !lastDay} />
    </Pop>
  );
}

export function NoteForm({ title, sub, label, required, cta, danger, extra, onClose, onSubmit }: {
  title: string; sub?: string; label: string; required?: boolean; cta: string; danger?: boolean; extra?: ReactNode; onClose: () => void; onSubmit: (note: string) => Promise<unknown>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title={title} sub={sub} onClose={onClose}>
      {extra}
      <Area id="nf-n" label={label} value={note} onChange={setNote} max={1000} />
      <Acts busy={busy} err={err} onClose={onClose} onSave={() => run(setBusy, setErr, () => onSubmit(note))} label={cta} danger={danger} disabled={required && !note.trim()} />
    </Pop>
  );
}

// ── Personal details ────────────────────────────────────────────────────────
export function ProfileForm({ e, profile, call, onClose, onSaved }: Omit<FormProps, 'data'> & { e: Employee; profile: ProfileRow | null }) {
  const p = profile;
  const [v, setV] = useState({
    dateOfBirth: p?.date_of_birth ?? '', gender: p?.gender ?? '', bloodGroup: p?.blood_group ?? '', maritalStatus: p?.marital_status ?? '', kinName: p?.kin_name ?? '',
    personalEmail: p?.personal_email ?? '', address: p?.address ?? '', city: p?.city ?? '', state: p?.state ?? '', pincode: p?.pincode ?? '',
    emergencyName: p?.emergency_name ?? '', emergencyRelation: p?.emergency_relation ?? '', emergencyPhone: p?.emergency_phone ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const f = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });
  return (
    <Pop wide title={`${e.name}: personal details`} onClose={onClose}>
      <div className="sch-fields">
        <In id="pf-dob" label="DATE OF BIRTH" type="date" value={v.dateOfBirth} onChange={f('dateOfBirth')} />
        <Sel id="pf-g" label="GENDER" value={v.gender} onChange={f('gender')}><option value="">Not set</option>{Object.entries(GENDERS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>
        <Sel id="pf-b" label="BLOOD GROUP" value={v.bloodGroup} onChange={f('bloodGroup')}><option value="">Not set</option>{BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}</Sel>
        <Sel id="pf-m" label="MARITAL STATUS" value={v.maritalStatus} onChange={f('maritalStatus')}><option value="">Not set</option>{Object.entries(MARITAL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>
        <In id="pf-k" label="FATHER'S OR SPOUSE'S NAME" value={v.kinName} maxLength={120} onChange={f('kinName')} />
        <In id="pf-e" label="PERSONAL EMAIL" type="email" value={v.personalEmail} maxLength={200} onChange={f('personalEmail')} />
        <In id="pf-a" label="ADDRESS" value={v.address} maxLength={400} onChange={f('address')} />
        <In id="pf-c" label="CITY" value={v.city} maxLength={80} onChange={f('city')} />
        <In id="pf-s" label="STATE" value={v.state} maxLength={80} onChange={f('state')} />
        <In id="pf-p" label="PIN CODE" inputMode="numeric" value={v.pincode} maxLength={7} onChange={f('pincode')} />
        <In id="pf-en" label="EMERGENCY CONTACT" value={v.emergencyName} maxLength={120} onChange={f('emergencyName')} />
        <In id="pf-er" label="THEIR RELATION" value={v.emergencyRelation} maxLength={60} onChange={f('emergencyRelation')} />
        <In id="pf-ep" label="THEIR MOBILE" inputMode="tel" value={v.emergencyPhone} maxLength={20} onChange={f('emergencyPhone')} />
      </div>
      <Acts busy={busy} err={err} onClose={onClose} label="Save"
        onSave={async () => { if (await run(setBusy, setErr, () => call(API, 'POST', { action: 'profile', id: e.id, ...v }))) onSaved('Personal details saved'); }} />
    </Pop>
  );
}

// ── Statutory and bank ──────────────────────────────────────────────────────
/** `full` is the unmasked row, fetched (and audited) when HR chose to edit. */
export function StatutoryForm({ e, full, call, onClose, onSaved }: Omit<FormProps, 'data'> & { e: Employee; full: StatutoryRow | null }) {
  const s = full;
  const [v, setV] = useState({
    pan: s?.pan ?? '', uan: s?.uan ?? '', esiNo: s?.esi_no ?? '', aadhaarLast4: s?.aadhaar_last4 ?? '', bankAccount: s?.bank_account ?? '', bankIfsc: s?.bank_ifsc ?? '',
    bankName: s?.bank_name ?? '', bankHolder: s?.bank_holder ?? '', nomineeName: s?.nominee_name ?? '', nomineeRelation: s?.nominee_relation ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const f = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });
  return (
    <Pop wide title={`${e.name}: statutory and bank`} sub="Only people with the sensitive-details permission see these. Every time the full numbers are shown, it is recorded in the audit trail." onClose={onClose}>
      <div className="sch-fields">
        <In id="st-pan" label="PAN" value={v.pan} maxLength={12} onChange={x => f('pan')(x.toUpperCase())} placeholder="ABCDE1234F" autoComplete="off" />
        <In id="st-uan" label="UAN (PF)" inputMode="numeric" value={v.uan} maxLength={14} onChange={f('uan')} placeholder="12 digits" autoComplete="off" />
        <In id="st-esi" label="ESI NUMBER" inputMode="numeric" value={v.esiNo} maxLength={12} onChange={f('esiNo')} placeholder="10 digits" autoComplete="off" />
        <In id="st-aad" label="AADHAAR, LAST 4 DIGITS" inputMode="numeric" value={v.aadhaarLast4} maxLength={4} onChange={x => f('aadhaarLast4')(x.replace(/\D/g, ''))} hint="Only the last four. The full number is never stored." autoComplete="off" />
        <In id="st-acc" label="BANK ACCOUNT NUMBER" inputMode="numeric" value={v.bankAccount} maxLength={20} onChange={f('bankAccount')} autoComplete="off" />
        <In id="st-ifsc" label="IFSC" value={v.bankIfsc} maxLength={11} onChange={x => f('bankIfsc')(x.toUpperCase())} placeholder="HDFC0001234" autoComplete="off" />
        <In id="st-bn" label="BANK NAME" value={v.bankName} maxLength={80} onChange={f('bankName')} />
        <In id="st-bh" label="ACCOUNT HOLDER" value={v.bankHolder} maxLength={120} onChange={f('bankHolder')} placeholder={e.name} />
        <In id="st-nn" label="NOMINEE" value={v.nomineeName} maxLength={120} onChange={f('nomineeName')} />
        <In id="st-nr" label="NOMINEE'S RELATION" value={v.nomineeRelation} maxLength={60} onChange={f('nomineeRelation')} />
      </div>
      <Acts busy={busy} err={err} onClose={onClose} label="Save"
        onSave={async () => { if (await run(setBusy, setErr, () => call(API, 'POST', { action: 'statutory', id: e.id, ...v }))) onSaved('Statutory and bank details saved'); }} />
    </Pop>
  );
}

// ── Documents and qualifications ────────────────────────────────────────────
const DOCS = '/api/admin/people/documents';
const EXPIRING: string[] = ['police_verification', 'driving_licence', 'medical_fitness', 'contract'];
export function DocForm({ e, call, onClose, onSaved }: Omit<FormProps, 'data'> & { e: Employee }) {
  const [kind, setKind] = useState('id_proof');
  const [title, setTitle] = useState('');
  const [issued, setIssued] = useState('');
  const [expires, setExpires] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const form = new FormData();
    form.set('staffMemberId', e.id); form.set('kind', kind); form.set('title', title); form.set('issuedOn', issued); form.set('expiresOn', expires);
    if (file) form.set('file', file);
    if (await run(setBusy, setErr, () => call(DOCS, 'POST', form))) onSaved('Document saved');
  };
  return (
    <Pop title={`${e.name}: add a document`} sub="PDF, JPEG, PNG or WebP up to 10 MB. For a police verification or licence you can record just the dates and add the scan later." onClose={onClose}>
      <div className="sch-fields">
        <Sel id="d-k" label="KIND" value={kind} onChange={setKind}>{Object.entries(DOC_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>
        <In id="d-t" label="TITLE" value={title} maxLength={120} onChange={setTitle} placeholder={DOC_KINDS[kind as keyof typeof DOC_KINDS]} />
        <In id="d-i" label="ISSUED ON" type="date" value={issued} onChange={setIssued} />
        <In id="d-e" label="EXPIRES ON" type="date" min={issued || undefined} value={expires} onChange={setExpires} hint={EXPIRING.includes(kind) ? 'HR is alerted before this date.' : undefined} />
      </div>
      <div className="cmp-fld" style={{ marginTop: 10 }}>
        <label htmlFor="d-f">FILE</label>
        <input id="d-f" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={ev => setFile(ev.target.files?.[0] ?? null)} />
      </div>
      <Acts busy={busy} err={err} onClose={onClose} onSave={save} label="Save document" disabled={!file && !issued && !expires} />
    </Pop>
  );
}

export interface Qual { id: string; kind: string; title: string; institution: string | null; year: number | null; result: string | null; verifiedOn: string | null; documentId?: string | null }
export function QualForm({ e, q, docs, call, onClose, onSaved }: Omit<FormProps, 'data'> & { e: Employee; q: Qual | null; docs: DocRow[] }) {
  const [v, setV] = useState({ kind: q?.kind ?? 'graduate', title: q?.title ?? '', institution: q?.institution ?? '', year: q?.year ? String(q.year) : '', result: q?.result ?? '', verified: !!q?.verifiedOn, documentId: q?.documentId ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const certs = docs.filter(d => d.kind === 'qualification');
  const save = async () => {
    if (await run(setBusy, setErr, () => call(DOCS, 'POST', { entity: 'qualification', id: q?.id, staffMemberId: e.id, ...v, year: v.year ? Number(v.year) : null, documentId: v.documentId || null }))) onSaved('Qualification saved');
  };
  return (
    <Pop title={`${e.name}: ${q ? 'edit' : 'add a'} qualification`} onClose={onClose}>
      <div className="sch-fields">
        <Sel id="q-k" label="KIND" value={v.kind} onChange={x => setV({ ...v, kind: x })}>{Object.entries(QUAL_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>
        <In id="q-t" label="QUALIFICATION" value={v.title} maxLength={120} onChange={x => setV({ ...v, title: x })} placeholder="B.Sc Mathematics" />
        <In id="q-i" label="BOARD OR UNIVERSITY" value={v.institution} maxLength={160} onChange={x => setV({ ...v, institution: x })} />
        <In id="q-y" label="YEAR" type="number" min={1950} max={2100} value={v.year} onChange={x => setV({ ...v, year: x })} />
        <In id="q-r" label="RESULT" value={v.result} maxLength={60} onChange={x => setV({ ...v, result: x })} placeholder="First class, 72%" />
        {certs.length > 0 && (
          <Sel id="q-d" label="CERTIFICATE ON FILE" value={v.documentId} onChange={x => setV({ ...v, documentId: x })}>
            <option value="">None linked</option>{certs.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
          </Sel>
        )}
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginTop: 12 }}>
        <input type="checkbox" checked={v.verified} onChange={ev => setV({ ...v, verified: ev.target.checked })} style={{ marginTop: 3 }} />
        <span>I have seen the original certificate. <span className="muted">Your name and today&apos;s date are recorded as the verifier.</span></span>
      </label>
      <Acts busy={busy} err={err} onClose={onClose} onSave={save} label="Save" disabled={!v.title.trim()} />
    </Pop>
  );
}
