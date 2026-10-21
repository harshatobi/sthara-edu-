'use client';

import Link from 'next/link';
import { useState } from 'react';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { PhoneIcon as Phone } from '@phosphor-icons/react/dist/ssr/Phone';
import { Chip, Empty } from '@/components/canon/ui';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { inr } from '@/lib/admin/format';
import { EDUCATION_LABEL, RELATION_LABEL } from '@/lib/students/register';
import { EmergencyForm, MemberForm } from '@/components/students/forms';
import { CardHead } from '../kit';

export type { FamilyMember, Emergency } from '@/components/students/forms';
import type { FamilyMember, Emergency } from '@/components/students/forms';
export interface Sibling { linkId: string; studentId: string; status: 'suggested' | 'confirmed'; source: string; name: string; admissionNo: string }
export interface FamilyData { family: FamilyMember[]; emergency: Emergency[]; siblings: Sibling[]; requests: { id: string; kind: string }[] }

const SOURCE: Record<string, string> = { phone: 'same parent phone', login: 'same parent login', family_code: 'same family code', office: 'linked by the office' };

/** The Family tab of a student record: contacts, emergency calling order and siblings. */
export default function FamilyTab({ studentId, data, canManage, onChanged }: { studentId: string; data: FamilyData; canManage: boolean; onChanged: (msg: string) => void }) {
  const { call } = useAdminDesk();
  const [edit, setEdit] = useState<FamilyMember | 'new' | null>(null);
  const [emergency, setEmergency] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const post = async (body: Record<string, unknown>, ok: string) => {
    setErr(null);
    try { await call(`/api/admin/students/${studentId}`, 'POST', body); onChanged(ok); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); return false; }
  };
  const byId = new Map(data.family.map(f => [f.id, f]));
  return (
    <>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {data.requests.length > 0 && (
        <div className="note info" style={{ marginBottom: 14 }}>
          A parent has proposed {data.requests.length} change{data.requests.length === 1 ? '' : 's'} to this record. <Link href="/admin/students?tab=requests">Review in Requests</Link>.
        </div>
      )}
      <div className="card" style={{ marginBottom: 14 }}>
        <CardHead title="Family" sub="Contacts on the record. A parent with a Sthara login is linked to their entry here."
          right={canManage ? <button className="btn sm" onClick={() => setEdit('new')}><Plus size={14} weight="bold" /> Add</button> : undefined} />
        {!data.family.length ? <Empty icon={<UsersThree size={26} weight="duotone" />} title="No family on the record yet">Add them here, or bring them in from Data Import (Family and emergency contacts).</Empty> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Name</th><th>Relation</th><th>Phone</th><th>Email</th><th>Education · occupation</th><th className="r">Income a year</th><th /></tr></thead>
              <tbody>{data.family.map(f => (
                <tr key={f.id}>
                  <td><b>{f.name}</b> {f.is_primary && <Chip tone="b">PRIMARY</Chip>} {f.user_id && <Chip tone="g">LOGIN</Chip>}</td>
                  <td>{RELATION_LABEL[f.relation]}{!f.lives_with && <span className="muted"> · lives apart</span>}</td>
                  <td>{f.phone ?? '—'}</td>
                  <td>{f.email ?? '—'}</td>
                  <td>{[f.education ? EDUCATION_LABEL[f.education] : null, f.occupation].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="r">{f.annual_income != null ? inr(f.annual_income) : '—'}</td>
                  <td>{canManage && <button className="btn sm" onClick={() => setEdit(f)}>Edit</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="g2">
        <div className="card">
          <CardHead title="Emergency contacts" sub="Called in this order." right={canManage ? <button className="btn sm" onClick={() => setEmergency(true)}>Change</button> : undefined} />
          {!data.emergency.length ? <p className="muted">None set.</p> : (
            <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
              {data.emergency.map(e => {
                const f = e.family_member_id ? byId.get(e.family_member_id) : null;
                return <li key={e.id}><b>{f?.name ?? e.name}</b> <span className="muted">{f ? RELATION_LABEL[f.relation] : e.relation ?? ''}</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><Phone size={13} /> {f?.phone ?? e.phone ?? 'No phone on the record'}</div></li>;
              })}
            </ol>
          )}
        </div>
        <div className="card">
          <CardHead title="Siblings" sub="Suggested from shared parent phones, logins and family codes. Confirmed siblings show to the fees office for concessions." />
          {!data.siblings.length ? <p className="muted">No siblings at this school found.</p> : (
            <div style={{ display: 'grid', gap: 10 }}>
              {data.siblings.map(s => (
                <div key={s.linkId} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div><Link href={`/admin/students/${s.studentId}`}><b>{s.name}</b></Link> <span className="muted">{s.admissionNo}</span>
                    <div className="muted" style={{ fontSize: 12 }}>{s.status === 'confirmed' ? 'Confirmed' : `Suggested: ${SOURCE[s.source] ?? s.source}`}</div></div>
                  {canManage && s.status === 'suggested' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn sm pri" onClick={() => post({ action: 'sibling', otherId: s.studentId, decision: 'confirmed' }, 'Sibling confirmed.')}>Confirm</button>
                      <button className="btn sm" onClick={() => post({ action: 'sibling', otherId: s.studentId, decision: 'rejected' }, 'Not a sibling.')}>Not a sibling</button>
                    </div>
                  )}
                  {canManage && s.status === 'confirmed' && <button className="btn sm" onClick={() => post({ action: 'sibling', otherId: s.studentId, decision: 'rejected' }, 'Sibling link removed.')}>Remove</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {edit && <MemberForm member={edit === 'new' ? null : edit} onClose={() => setEdit(null)}
        onSave={(member) => post({ action: 'family-save', member, memberId: edit === 'new' ? undefined : edit.id }, edit === 'new' ? 'Added.' : 'Saved.').then(ok => { if (ok) setEdit(null); })}
        onRemove={edit !== 'new' && !edit.user_id ? () => post({ action: 'family-remove', memberId: edit.id }, 'Removed.').then(ok => { if (ok) setEdit(null); }) : undefined} />}
      {emergency && <EmergencyForm family={data.family} current={data.emergency} onClose={() => setEmergency(false)}
        onSave={list => post({ action: 'emergency', list }, 'Emergency contacts saved.').then(ok => { if (ok) setEmergency(false); })} />}
    </>
  );
}
