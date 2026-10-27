'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { StudentIcon as Student } from '@phosphor-icons/react/dist/ssr/Student';
import { UserPlusIcon as UserPlus } from '@phosphor-icons/react/dist/ssr/UserPlus';
import { MagnifyingGlassIcon as MagnifyingGlass } from '@phosphor-icons/react/dist/ssr/MagnifyingGlass';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { UserMinusIcon as UserMinus } from '@phosphor-icons/react/dist/ssr/UserMinus';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import type { AdminDesk } from '@/lib/admin/desk';
import { isoDay, plural } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { FIELDS, GROUPS, gradeLabel, type Field as RegField } from '@/lib/students/register';
import { CardHead, DeskGate, Field, Kpi, Workspace, downloadCsv } from '../kit';
import { useGet } from '@/components/canon/useGet';
import YearEnd from './YearEnd';
import RegisterSettings from './RegisterSettings';
import Requests from './Requests';

interface Applicant { id: string; name: string; grade: number; dob: string | null; previousSchool: string | null; guardian: string | null; phone: string | null; email: string | null; session: string; family: number; fields: number; documents: number }

export interface ListRow {
  id: string; admissionNo: string; name: string; status: string; gender: string | null; dob: string | null; hasLogin: boolean;
  className: string | null; grade: number | null; section: string | null; rollNo: string | null; pen: boolean; apaar: boolean; aadhaar: boolean;
}
interface ListData {
  session: string; total: number; page: number; size: number; rows: ListRow[]; classes: string[];
  counts: { active: number; left: number; cancelled: number; missing: { pen: number; apaar: number; aadhaar: number } };
  can: { manage: boolean; aadhaar: boolean };
}

const TABS = [['register', 'Register'], ['requests', 'Requests'], ['year', 'Year end'], ['settings', 'Settings']] as const;

/** Admin › Students: the admission register, the year-end chain and the register settings. */
export default function StudentsPage() {
  return <DeskGate need={['students.read', 'outcomes.approve', 'session.manage', 'compliance.act']}>{desk => <Students desk={desk} />}</DeskGate>;
}

function Students({ desk }: { desk: AdminDesk }) {
  const params = useSearchParams();
  const path = usePathname();
  const a = desk.me.access;
  const tabs = TABS.filter(([k]) => k === 'register' ? a.can('students.read') : k === 'requests' ? a.any('students.read', 'compliance.act') : k === 'year' ? a.any('students.read', 'outcomes.approve') : a.any('students.read', 'session.manage'));
  const tab = tabs.find(([k]) => k === params.get('tab'))?.[0] ?? tabs[0]?.[0] ?? 'register';
  return (
    <>
      <PageBar eyebrow="STUDENTS" title="Student register" sub="One permanent record per student: the admission register, government and board IDs, and the class every year." />
      <div className="tabs" role="tablist" aria-label="Students" style={{ marginBottom: 20 }}>
        {tabs.map(([k, label]) => (
          <Link key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} href={`${path}?tab=${k}`}>{label}</Link>
        ))}
      </div>
      {tab === 'register' && <Register />}
      {tab === 'requests' && <Requests />}
      {tab === 'year' && <YearEnd />}
      {tab === 'settings' && <RegisterSettings />}
    </>
  );
}

function Register() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState({ search: '', cls: '', status: 'active', page: 1 });
  const url = `/api/admin/students?${new URLSearchParams({ search: q.search, cls: q.cls, status: q.status, page: String(q.page) })}`;
  const { data, error, reload } = useGet<ListData>(url);
  const [adding, setAdding] = useState(false);
  const [toast, toastEl] = useToast();

  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div aria-busy="true"><div className="kpis">{[0, 1, 2, 3].map(i => <div className="kpi" key={i}><Skeleton h={12} w={110} /><Skeleton h={40} w={80} style={{ marginTop: 12 }} /></div>)}</div><div className="card">{[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div></div>;
  const pages = Math.max(1, Math.ceil(data.total / data.size));
  const exportCsv = () => downloadCsv(`register-${data.session}-${isoDay()}.csv`, [
    ['Admission no', 'Name', 'Class', 'Roll no', 'Status', 'Gender', 'Date of birth', 'PEN', 'APAAR', 'Aadhaar', 'Login'],
    ...data.rows.map(r => [r.admissionNo, r.name, r.className, r.rollNo, r.status, r.gender, r.dob, r.pen ? 'Yes' : 'Missing', r.apaar ? 'Yes' : 'Missing', r.aadhaar ? 'Yes' : 'Missing', r.hasLogin ? 'Yes' : 'No']),
  ]);
  return (
    <>
      {toastEl}
      <div className="kpis">
        <Kpi label="ON THE REGISTER" value={data.counts.active} icon={Student} note={`Session ${data.session.replace('-', '–')}`} onClick={() => setQ({ ...q, status: 'active', page: 1 })} />
        <Kpi label="LEFT" value={data.counts.left} icon={UserMinus} note="Kept with their history" onClick={() => setQ({ ...q, status: 'left', page: 1 })} />
        <Kpi label="MISSING PEN" value={data.counts.missing.pen} icon={Warning} valueColor={data.counts.missing.pen ? 'var(--amber)' : undefined} note="Needed for UDISE+" />
        <Kpi label="MISSING APAAR / AADHAAR" value={`${data.counts.missing.apaar} / ${data.counts.missing.aadhaar}`} icon={Warning}
          valueColor={data.counts.missing.apaar + data.counts.missing.aadhaar ? 'var(--amber)' : undefined} note="APAAR needs Aadhaar first" />
      </div>
      <div className="card">
        <CardHead title={`${plural(data.total, 'student')}`} sub={q.status === 'active' ? 'Current students and their class this session' : `Showing: ${q.status}`}
          right={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={exportCsv} disabled={!data.rows.length}><DownloadSimple size={16} /> Export page</button>
            {data.can.manage && <button className="btn pri" onClick={() => setAdding(true)}><UserPlus size={16} weight="bold" /> Admit a student</button>}
          </div>} />
        <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }} onSubmit={e => { e.preventDefault(); setQ({ ...q, search, page: 1 }); }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <MagnifyingGlass size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--mut)' }} aria-hidden="true" />
            <input className="cmp-in" style={{ paddingLeft: 36, width: '100%' }} placeholder="Name or admission number" aria-label="Search the register" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="cmp-sel" aria-label="Class" value={q.cls} onChange={e => setQ({ ...q, cls: e.target.value, page: 1 })}>
            <option value="">Every class</option>
            {data.classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="cmp-sel" aria-label="Status" value={q.status} onChange={e => setQ({ ...q, status: e.target.value, page: 1 })}>
            <option value="active">Current students</option><option value="left">Left</option><option value="cancelled">Cancelled entries</option><option value="all">Everyone</option>
          </select>
          <button className="btn" type="submit">Search</button>
        </form>
        {!data.rows.length ? (
          <Empty icon={<Student size={26} weight="duotone" />} title="No students here">
            {q.search || q.cls ? 'Nothing matches that search.' : 'Admit a student, or bring the register in from Data Import.'}
          </Empty>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Admission no</th><th>Name</th><th>Class</th><th className="c">Roll</th><th>IDs</th><th>Login</th></tr></thead>
              <tbody>{data.rows.map(r => (
                <tr key={r.id} className="click" tabIndex={0} onClick={() => router.push(`/admin/students/${r.id}`)}
                  onKeyDown={e => { if (e.key === 'Enter') router.push(`/admin/students/${r.id}`); }}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.admissionNo}</td>
                  <td><b>{r.name}</b>{r.status !== 'active' && <> <Chip tone={r.status === 'left' ? 'n' : 'r'}>{r.status.toUpperCase()}</Chip></>}</td>
                  <td>{r.className ?? <span className="muted">No class</span>}</td>
                  <td className="c">{r.rollNo ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Chip tone={r.pen ? 'g' : 'a'}>PEN</Chip> <Chip tone={r.apaar ? 'g' : 'a'}>APAAR</Chip> <Chip tone={r.aadhaar ? 'g' : 'a'}>AADHAAR</Chip>
                  </td>
                  <td>{r.hasLogin ? <Chip tone="b">LOGIN</Chip> : <span className="muted">Record only</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
            <span className="muted">Page {data.page} of {pages}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" disabled={data.page <= 1} onClick={() => setQ({ ...q, page: data.page - 1 })}>Previous</button>
              <button className="btn" disabled={data.page >= pages} onClick={() => setQ({ ...q, page: data.page + 1 })}>Next</button>
            </div>
          </div>
        )}
      </div>
      {adding && <Admit classes={data.classes} onClose={() => setAdding(false)} onDone={(no, id, docs) => { setAdding(false); toast(`Admitted with number ${no}.${docs?.moved ? ` ${plural(docs.moved, 'document')} moved to the record.` : ''}${docs?.failed ? ` ${docs.failed} could not move: they stay with the application.` : ''}`); reload(); router.push(`/admin/students/${id}`); }} />}
    </>
  );
}

/** One register field as a form control. */
export function FieldInput({ f, value, onChange, id }: { f: RegField; value: unknown; onChange: (v: unknown) => void; id: string }) {
  if (f.kind === 'enum') return (
    <select className="cmp-sel" id={id} value={String(value ?? '')} onChange={e => onChange(e.target.value || null)}>
      <option value="">Not recorded</option>
      {f.values!.map(v => <option key={v} value={v}>{f.labels?.[v] ?? v}</option>)}
    </select>
  );
  if (f.kind === 'bool') return (
    <select className="cmp-sel" id={id} value={value == null ? '' : value ? 'yes' : 'no'} onChange={e => onChange(e.target.value === '' ? null : e.target.value === 'yes')}>
      <option value="">Not recorded</option><option value="yes">Yes</option><option value="no">No</option>
    </select>
  );
  if (f.kind === 'grade') return (
    <select className="cmp-sel" id={id} value={value == null ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}>
      <option value="">Not recorded</option>
      {[-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(g => <option key={g} value={g}>{gradeLabel(g)}</option>)}
    </select>
  );
  return <input className="cmp-in" id={id} type={f.kind === 'date' ? 'date' : 'text'} inputMode={f.kind === 'digits' || f.kind === 'amount' ? 'numeric' : undefined}
    maxLength={f.kind === 'digits' ? (f.len ?? 12) + 4 : f.max} value={value == null ? '' : String(value)} onChange={e => onChange(e.target.value)} />;
}

function Admit({ classes, onClose, onDone }: { classes: string[]; onClose: () => void; onDone: (admissionNo: string, id: string, docs?: { moved: number; failed: number }) => void }) {
  const { call } = useAdminDesk();
  const [fields, setFields] = useState<Record<string, unknown>>({ indian_national: true, admitted_on: isoDay() });
  const [admissionNo, setAdmissionNo] = useState('');
  const [className, setClassName] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [noAadhaar, setNoAadhaar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [applicantId, setApplicantId] = useState('');
  const { data: apps } = useGet<{ applicants: Applicant[] }>('/api/admin/students/applicants');
  const fromApplicant = (id: string) => {
    setApplicantId(id);
    const ap = apps?.applicants.find(x => x.id === id);
    if (!ap) return;
    setFields(f => ({ ...f, full_name: ap.name, date_of_birth: ap.dob ?? f.date_of_birth, previous_school: ap.previousSchool ?? f.previous_school, admitted_grade: ap.grade }));
    const cls = classes.find(c => (c.match(/\d{1,2}/) || [])[0] === String(ap.grade));
    if (cls && !className) setClassName(cls);
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await call<{ id: string; admissionNo: string; documents?: { moved: number; failed: number } }>('/api/admin/students', 'POST', { fields, admissionNo: admissionNo.trim() || undefined, className, aadhaar: noAadhaar ? undefined : aadhaar, noAadhaar, applicantId: applicantId || undefined });
      onDone(r.admissionNo, r.id, r.documents);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not admit the student.'); setBusy(false); }
  };
  return (
    <Workspace title="Admit a student" sub="Creates the register entry and the class from the admission date. The login is issued by Sthara and links by admission number." onClose={onClose}
      actions={<button className="btn pri" onClick={save} disabled={busy || !String(fields.full_name ?? '').trim() || !className}>{busy ? 'Saving' : 'Admit'}</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 16 }}>{err}</div>}
      {!!apps?.applicants.length && (
        <Field label="FROM AN ADMITTED APPLICANT" htmlFor="adm-app" hint="Fills the form from the admission application. Anything you leave blank is taken from it; its family becomes the family record and its documents move to the student record, keeping their checks.">
          <select id="adm-app" className="cmp-sel" value={applicantId} onChange={e => fromApplicant(e.target.value)}>
            <option value="">Type the details instead</option>
            {apps.applicants.map(x => <option key={x.id} value={x.id}>{x.name} · {gradeLabel(x.grade)} · {x.session}{x.guardian ? ` · ${x.guardian}` : ''}</option>)}
          </select>
        </Field>
      )}
      {applicantId && (() => {
        const ap = apps?.applicants.find(x => x.id === applicantId);
        if (!ap) return null;
        const parts = [ap.fields ? plural(ap.fields, 'register detail') : '', ap.family ? plural(ap.family, 'family member') : ap.guardian ? `${ap.guardian} as the first family contact` : '', ap.documents ? plural(ap.documents, 'document') : ''].filter(Boolean);
        return parts.length ? <div className="note info" style={{ marginBottom: 12 }}>From the application: {parts.join(', ')}.</div> : null;
      })()}
      <div className="g2">
        <Field label="ADMISSION NUMBER" htmlFor="adm-no" hint="Leave blank for the next number in the school format.">
          <input className="cmp-in" id="adm-no" value={admissionNo} maxLength={30} onChange={e => setAdmissionNo(e.target.value)} />
        </Field>
        <Field label="CLASS" htmlFor="adm-class">
          <select className="cmp-sel" id="adm-class" value={className} onChange={e => setClassName(e.target.value)}>
            <option value="">Pick the class</option>{classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      {GROUPS.map(g => (
        <div key={g.key} style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>{g.label}</h3>
          <div className="g2">
            {FIELDS.filter(f => f.group === g.key).map(f => (
              <Field key={f.key} label={f.label.toUpperCase()} htmlFor={`f-${f.key}`} hint={f.hint}>
                <FieldInput f={f} id={`f-${f.key}`} value={fields[f.key]} onChange={v => setFields(x => ({ ...x, [f.key]: v }))} />
              </Field>
            ))}
            {g.key === 'ids' && (
              <Field label="AADHAAR NUMBER" htmlFor="f-aadhaar" hint="Encrypted as soon as it is saved. Only the last 4 digits show afterwards.">
                <input className="cmp-in" id="f-aadhaar" inputMode="numeric" maxLength={14} value={aadhaar} disabled={noAadhaar} onChange={e => setAadhaar(e.target.value)} />
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
