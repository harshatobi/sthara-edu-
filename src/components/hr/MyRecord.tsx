'use client';

import { useEffect, useState } from 'react';
import { IdentificationCardIcon as IdentificationCard } from '@phosphor-icons/react/dist/ssr/IdentificationCard';
import { SealCheckIcon as SealCheck } from '@phosphor-icons/react/dist/ssr/SealCheck';
import { useAuth } from '@/contexts/AuthContext';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { CardHead } from '@/components/admin/kit';
import { fmtDate } from '@/lib/admin/format';
import { EMPLOYMENT, STAFF_CATEGORIES } from '@/lib/schedule/types';
import { DOC_KINDS, EVENT_KINDS, GENDERS, JOB_ACTIONS, QUAL_KINDS, ageOn, tenure, type DocRow, type Employee, type Job, type ProfileRow, type StatutoryRow } from '@/lib/hr/engine';
import '@/styles/people.css';

interface Mine {
  person: Employee | null; today: string; jobs: Job[]; events: { id: string; kind: keyof typeof EVENT_KINDS; onDate: string }[];
  qualifications: { id: string; kind: keyof typeof QUAL_KINDS; title: string; institution: string | null; year: number | null; result: string | null; verifiedOn: string | null }[];
  documents: DocRow[]; profile: ProfileRow | null; statutory: StatutoryRow | null;
  departments: { id: string; name: string }[]; grades: { id: string; name: string }[]; manager: { id: string; name: string } | null;
}
const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => {
  const empty = children === null || children === undefined || children === '';
  return <div><dt>{label}</dt><dd className={empty ? 'none' : undefined}>{empty ? 'Not on record' : children}</dd></div>;
};

/** What the school holds about the signed-in teacher or office account. Read-only: HR keeps the record. */
export default function MyRecord() {
  const { user, loading, getAuthToken } = useAuth();
  const [d, setD] = useState<Mine | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    (async () => {
      const token = await getAuthToken();
      const res = await fetch('/api/me/employee', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.ok) setD(json); else setError(json?.error || 'Could not load your record.');
    })().catch(() => { if (!cancelled) setError('Could not load your record.'); });
    return () => { cancelled = true; };
  }, [loading, user, getAuthToken]);

  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!d) return <div className="card" aria-busy="true">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={44} style={{ marginBottom: 12 }} />)}</div>;
  const e = d.person;
  if (!e) return <div className="card"><Empty icon={<IdentificationCard size={26} weight="duotone" />} title="No record yet">The school hasn&apos;t set up your employee record. Ask the office.</Empty></div>;
  const p = d.profile, s = d.statutory;
  const dept = d.departments.find(x => x.id === e.departmentId)?.name, grade = d.grades.find(x => x.id === e.gradeId)?.name;
  const timeline = [...d.jobs.map(j => ({ at: j.effectiveFrom, id: `j${j.id}`, what: `${JOB_ACTIONS[j.action]}${j.designation ? `: ${j.designation}` : ''}`, ev: false })),
    ...d.events.map(x => ({ at: x.onDate, id: `e${x.id}`, what: EVENT_KINDS[x.kind], ev: true }))].filter(t => !/^Correction/.test(t.what)).sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <div className="note info" style={{ marginBottom: 18 }}>This is the record the school keeps about you. If anything is wrong or missing, tell the HR office: only they can change it.</div>
      <div className="g2" style={{ marginBottom: 18 }}>
        <div className="card">
          <CardHead title={e.name} sub={[e.employeeCode, e.joinedOn ? `${tenure(e.joinedOn, d.today)} at the school` : ''].filter(Boolean).join(' · ') || undefined} />
          <dl className="hr-kv">
            <Fact label="Designation">{e.designation}</Fact>
            <Fact label="Category">{STAFF_CATEGORIES[e.category]}</Fact>
            <Fact label="Department">{dept}</Fact>
            <Fact label="Grade">{grade}</Fact>
            <Fact label="Reports to">{d.manager?.name}</Fact>
            <Fact label="Employment">{EMPLOYMENT[e.employment]}{e.contractTo ? ` to ${fmtDate(e.contractTo)}` : ''}</Fact>
            <Fact label="Joined">{e.joinedOn ? fmtDate(e.joinedOn) : ''}</Fact>
            {e.employment === 'permanent' && (e.probationUntil || e.confirmedOn) && <Fact label="Probation">{e.confirmedOn ? `Confirmed ${fmtDate(e.confirmedOn)}` : `Until ${fmtDate(e.probationUntil)}`}</Fact>}
            <Fact label="Mobile">{e.phone}</Fact>
          </dl>
        </div>
        <div className="card">
          <CardHead title="History" />
          <ul className="hr-tl">{timeline.map(t => <li key={t.id} className={t.ev ? 'ev' : undefined}><div className="when">{fmtDate(t.at)}</div><div className="what">{t.what}</div></li>)}</ul>
        </div>
      </div>
      <div className="g2" style={{ marginBottom: 18 }}>
        <div className="card">
          <CardHead title="Personal details" />
          <dl className="hr-kv">
            <Fact label="Date of birth">{p?.date_of_birth ? `${fmtDate(p.date_of_birth)} (${ageOn(p.date_of_birth, d.today)})` : ''}</Fact>
            <Fact label="Gender">{p?.gender ? GENDERS[p.gender as keyof typeof GENDERS] : ''}</Fact>
            <Fact label="Blood group">{p?.blood_group}</Fact>
            <Fact label="Father or spouse">{p?.kin_name}</Fact>
            <Fact label="Address">{[p?.address, p?.city, p?.state, p?.pincode].filter(Boolean).join(', ')}</Fact>
            <Fact label="Emergency contact">{[p?.emergency_name, p?.emergency_relation, p?.emergency_phone].filter(Boolean).join(' · ')}</Fact>
          </dl>
        </div>
        <div className="card">
          <CardHead title="Statutory and bank" sub="Numbers are shown by their last four characters." />
          <dl className="hr-kv">
            <Fact label="PAN"><span className="num">{s?.pan}</span></Fact>
            <Fact label="UAN (PF)"><span className="num">{s?.uan}</span></Fact>
            <Fact label="ESI number"><span className="num">{s?.esi_no}</span></Fact>
            <Fact label="Aadhaar"><span className="num">{s?.aadhaar_last4 ? `ends ${s.aadhaar_last4}` : ''}</span></Fact>
            <Fact label="Bank account"><span className="num">{s?.bank_account}</span></Fact>
            <Fact label="Bank">{[s?.bank_name, s?.bank_ifsc].filter(Boolean).join(' · ')}</Fact>
            <Fact label="Nominee">{[s?.nominee_name, s?.nominee_relation].filter(Boolean).join(' · ')}</Fact>
          </dl>
        </div>
      </div>
      <div className="g2">
        <div className="card">
          <CardHead title="Qualifications" />
          {d.qualifications.length ? d.qualifications.map(q => (
            <div key={q.id} className="row">
              <div style={{ flex: 1 }}><b>{q.title}</b><div className="muted" style={{ fontSize: 12.5 }}>{[QUAL_KINDS[q.kind], q.institution, q.year, q.result].filter(Boolean).join(' · ')}</div></div>
              {q.verifiedOn ? <Chip tone="g">VERIFIED</Chip> : <Chip tone="a">NOT VERIFIED</Chip>}
            </div>
          )) : <Empty icon={<SealCheck size={26} weight="duotone" />} title="None on record">Give the HR office copies of your certificates.</Empty>}
        </div>
        <div className="card">
          <CardHead title="Documents on file" />
          {d.documents.length ? d.documents.map(doc => (
            <div key={doc.id} className="row">
              <div style={{ flex: 1 }}><b>{doc.title}</b><div className="muted" style={{ fontSize: 12.5 }}>{DOC_KINDS[doc.kind]}{doc.expiresOn ? ` · expires ${fmtDate(doc.expiresOn)}` : ''}</div></div>
            </div>
          )) : <Empty icon={<IdentificationCard size={26} weight="duotone" />} title="Nothing on file" />}
        </div>
      </div>
    </>
  );
}
