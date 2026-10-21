'use client';

import { useState } from 'react';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { ADDRESS_PARTS, EDUCATION, EDUCATION_LABEL, RELATION_LABEL, RELATIONS, type Address, type Education, type Relation } from '@/lib/students/register';
import { Field, Workspace } from '@/components/admin/kit';
import { ALLERGY_KINDS, SEVERITIES, type Allergy, type Condition, type HealthCard, type Medication } from '@/lib/students/health';

/** Forms shared by the office (student record) and parents (family details): address, a family member, emergency contacts. */

export interface FamilyMember {
  id: string; relation: Relation; name: string; phone: string | null; email: string | null; education: Education | null;
  occupation: string | null; annual_income: number | null; is_primary: boolean; lives_with: boolean; user_id: string | null;
}
export interface Emergency { id: string; position: number; family_member_id: string | null; name: string | null; relation: string | null; phone: string | null }
export function AddressInputs({ title, value, onChange, prefix }: { title: string; value: Partial<Address>; onChange: (a: Partial<Address>) => void; prefix: string }) {
  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>{title}</h3>
      <div className="g2">
        {ADDRESS_PARTS.map(p => (
          <Field key={p.key} label={p.label.toUpperCase()} htmlFor={`${prefix}-${p.key}`}>
            <input id={`${prefix}-${p.key}`} className="cmp-in" maxLength={p.max} inputMode={p.key === 'pin' ? 'numeric' : undefined}
              value={value[p.key] ?? ''} onChange={e => onChange({ ...value, [p.key]: e.target.value })} />
          </Field>
        ))}
      </div>
    </div>
  );
}

export function MemberForm({ member, onClose, onSave, onRemove, title }: {
  member: Partial<FamilyMember> | null; onClose: () => void; onSave: (m: Record<string, unknown>) => void; onRemove?: () => void; title?: string;
}) {
  const [m, setM] = useState<Record<string, unknown>>({ relation: 'mother', lives_with: true, is_primary: false, ...(member ?? {}) });
  const set = (k: string, v: unknown) => setM(x => ({ ...x, [k]: v }));
  return (
    <Workspace title={title ?? (member?.id ? `Edit ${member.name}` : 'Add a family member')} onClose={onClose}
      actions={<>{onRemove && <button className="btn" onClick={onRemove}>Remove</button>}<button className="btn pri" disabled={!String(m.name ?? '').trim()} onClick={() => onSave(m)}>Save</button></>}>
      <div className="g2">
        <Field label="RELATION" htmlFor="fm-rel"><select id="fm-rel" className="cmp-sel" value={String(m.relation)} onChange={e => set('relation', e.target.value)}>
          {RELATIONS.map(r => <option key={r} value={r}>{RELATION_LABEL[r]}</option>)}</select></Field>
        <Field label="NAME" htmlFor="fm-name"><input id="fm-name" className="cmp-in" maxLength={120} value={String(m.name ?? '')} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="PHONE" htmlFor="fm-phone"><input id="fm-phone" className="cmp-in" inputMode="tel" maxLength={16} value={String(m.phone ?? '')} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="EMAIL" htmlFor="fm-email"><input id="fm-email" className="cmp-in" type="email" maxLength={160} value={String(m.email ?? '')} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="EDUCATION" htmlFor="fm-edu"><select id="fm-edu" className="cmp-sel" value={String(m.education ?? '')} onChange={e => set('education', e.target.value || null)}>
          <option value="">Not recorded</option>{EDUCATION.map(x => <option key={x} value={x}>{EDUCATION_LABEL[x]}</option>)}</select></Field>
        <Field label="OCCUPATION" htmlFor="fm-occ"><input id="fm-occ" className="cmp-in" maxLength={80} value={String(m.occupation ?? '')} onChange={e => set('occupation', e.target.value)} /></Field>
        <Field label="INCOME A YEAR (₹)" htmlFor="fm-inc"><input id="fm-inc" className="cmp-in" inputMode="numeric" value={m.annual_income == null ? '' : String(m.annual_income)} onChange={e => set('annual_income', e.target.value)} /></Field>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginTop: 6 }}><input type="checkbox" checked={!!m.is_primary} onChange={e => set('is_primary', e.target.checked)} /> Primary contact (the school calls them first)</label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginTop: 8 }}><input type="checkbox" checked={m.lives_with !== false} onChange={e => set('lives_with', e.target.checked)} /> Lives with the student</label>
    </Workspace>
  );
}

export interface EmergencyDraft { familyMemberId?: string; name?: string; relation?: string; phone?: string }
export function EmergencyForm({ family, current, onClose, onSave }: { family: { id: string; name: string; relation: Relation }[]; current: Emergency[]; onClose: () => void; onSave: (list: EmergencyDraft[]) => void }) {
  const [list, setList] = useState<EmergencyDraft[]>(() => current.map(e => (e.family_member_id ? { familyMemberId: e.family_member_id } : { name: e.name ?? '', relation: e.relation ?? '', phone: e.phone ?? '' })));
  const upd = (i: number, d: EmergencyDraft) => setList(l => l.map((x, j) => (j === i ? d : x)));
  return (
    <Workspace title="Emergency contacts" sub="Up to three, in the order the school calls them." onClose={onClose}
      actions={<button className="btn pri" onClick={() => onSave(list)}>Save</button>}>
      {list.map((e, i) => (
        <div key={i} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><b>{i === 0 ? 'Call first' : i === 1 ? 'Then' : 'Last'}</b>
            <div style={{ display: 'flex', gap: 6 }}>
              {i > 0 && <button className="btn sm" onClick={() => setList(l => { const c = [...l]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })}>Move up</button>}
              <button className="btn sm" onClick={() => setList(l => l.filter((_, j) => j !== i))}>Remove</button>
            </div></div>
          <Field label="WHO" htmlFor={`em-${i}`}>
            <select id={`em-${i}`} className="cmp-sel" value={e.familyMemberId ?? ''} onChange={ev => upd(i, ev.target.value ? { familyMemberId: ev.target.value } : { name: '', relation: '', phone: '' })}>
              <option value="">Someone else</option>
              {family.map(f => <option key={f.id} value={f.id}>{f.name} ({RELATION_LABEL[f.relation]})</option>)}
            </select>
          </Field>
          {!e.familyMemberId && <div className="g2">
            <Field label="NAME" htmlFor={`em-n-${i}`}><input id={`em-n-${i}`} className="cmp-in" value={e.name ?? ''} onChange={ev => upd(i, { ...e, name: ev.target.value })} /></Field>
            <Field label="RELATION" htmlFor={`em-r-${i}`}><input id={`em-r-${i}`} className="cmp-in" value={e.relation ?? ''} placeholder="Neighbour, aunt" onChange={ev => upd(i, { ...e, relation: ev.target.value })} /></Field>
            <Field label="PHONE" htmlFor={`em-p-${i}`}><input id={`em-p-${i}`} className="cmp-in" inputMode="tel" value={e.phone ?? ''} onChange={ev => upd(i, { ...e, phone: ev.target.value })} /></Field>
          </div>}
        </div>
      ))}
      {list.length < 3 && <button className="btn" onClick={() => setList(l => [...l, family[0] ? { familyMemberId: family[0].id } : { name: '', relation: '', phone: '' }])}><Plus size={14} /> Add a contact</button>}
    </Workspace>
  );
}

/** Allergies, conditions and medication editors (also used by parents to propose changes). */
export function CareForm({ card, onClose, onSave, title }: { card: Partial<HealthCard>; onClose: () => void; onSave: (v: Record<string, unknown>) => void; title?: string }) {
  const [al, setAl] = useState<Allergy[]>(card.allergies ?? []);
  const [co, setCo] = useState<Condition[]>(card.conditions ?? []);
  const [me, setMe] = useState<Medication[]>(card.medication ?? []);
  return (
    <Workspace title={title ?? 'Allergies, conditions and medication'} onClose={onClose} wide actions={<button className="btn pri" onClick={() => onSave({ allergies: al, conditions: co, medication: me })}>Save</button>}>
      <h3 style={{ fontSize: 15, fontWeight: 800 }}>Allergies</h3>
      {al.map((a, i) => (
        <div key={i} className="g2" style={{ alignItems: 'end', marginBottom: 6 }}>
          <Field label="ALLERGIC TO" htmlFor={`a-w-${i}`}><input id={`a-w-${i}`} className="cmp-in" value={a.what} onChange={e => setAl(l => l.map((x, j) => j === i ? { ...x, what: e.target.value } : x))} /></Field>
          <Field label="KIND · SEVERITY" htmlFor={`a-k-${i}`}><div style={{ display: 'flex', gap: 6 }}>
            <select id={`a-k-${i}`} className="cmp-sel" value={a.kind} onChange={e => setAl(l => l.map((x, j) => j === i ? { ...x, kind: e.target.value as Allergy['kind'] } : x))}>{ALLERGY_KINDS.map(k => <option key={k} value={k}>{k}</option>)}</select>
            <select className="cmp-sel" aria-label="Severity" value={a.severity} onChange={e => setAl(l => l.map((x, j) => j === i ? { ...x, severity: e.target.value as Allergy['severity'] } : x))}>{SEVERITIES.map(k => <option key={k} value={k}>{k}</option>)}</select>
            <button className="btn sm" onClick={() => setAl(l => l.filter((_, j) => j !== i))}>Remove</button></div></Field>
          <Field label="WHAT TO DO" htmlFor={`a-a-${i}`}><input id={`a-a-${i}`} className="cmp-in" value={a.action ?? ''} placeholder="EpiPen in the front pocket of the bag" onChange={e => setAl(l => l.map((x, j) => j === i ? { ...x, action: e.target.value } : x))} /></Field>
        </div>
      ))}
      <button className="btn sm" onClick={() => setAl(l => [...l, { kind: 'food', what: '', severity: 'moderate', action: null }])}><Plus size={14} /> Allergy</button>
      <h3 style={{ fontSize: 15, fontWeight: 800, marginTop: 18 }}>Conditions</h3>
      {co.map((c, i) => (
        <div key={i} className="g2" style={{ alignItems: 'end', marginBottom: 6 }}>
          <Field label="CONDITION" htmlFor={`c-n-${i}`}><input id={`c-n-${i}`} className="cmp-in" value={c.name} placeholder="Asthma" onChange={e => setCo(l => l.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></Field>
          <Field label="EMERGENCY PLAN" htmlFor={`c-p-${i}`}><input id={`c-p-${i}`} className="cmp-in" value={c.plan ?? ''} onChange={e => setCo(l => l.map((x, j) => j === i ? { ...x, plan: e.target.value } : x))} /></Field>
          <label style={{ display: 'flex', gap: 8, fontSize: 14 }}><input type="checkbox" checked={c.serious} onChange={e => setCo(l => l.map((x, j) => j === i ? { ...x, serious: e.target.checked } : x))} /> Show as an alert to teachers</label>
          <button className="btn sm" onClick={() => setCo(l => l.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button className="btn sm" onClick={() => setCo(l => [...l, { name: '', plan: null, serious: false }])}><Plus size={14} /> Condition</button>
      <h3 style={{ fontSize: 15, fontWeight: 800, marginTop: 18 }}>Medication</h3>
      {me.map((m, i) => (
        <div key={i} className="g2" style={{ alignItems: 'end', marginBottom: 6 }}>
          <Field label="MEDICINE" htmlFor={`m-n-${i}`}><input id={`m-n-${i}`} className="cmp-in" value={m.name} onChange={e => setMe(l => l.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></Field>
          <Field label="DOSE · WHEN" htmlFor={`m-d-${i}`}><div style={{ display: 'flex', gap: 6 }}>
            <input id={`m-d-${i}`} className="cmp-in" value={m.dose ?? ''} placeholder="2 puffs" onChange={e => setMe(l => l.map((x, j) => j === i ? { ...x, dose: e.target.value } : x))} />
            <input className="cmp-in" aria-label="When" value={m.timing ?? ''} placeholder="Before games" onChange={e => setMe(l => l.map((x, j) => j === i ? { ...x, timing: e.target.value } : x))} /></div></Field>
          <label style={{ display: 'flex', gap: 8, fontSize: 14 }}><input type="checkbox" checked={m.schoolGives} onChange={e => setMe(l => l.map((x, j) => j === i ? { ...x, schoolGives: e.target.checked } : x))} /> The school gives it</label>
          <button className="btn sm" onClick={() => setMe(l => l.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button className="btn sm" onClick={() => setMe(l => [...l, { name: '', dose: null, timing: null, schoolGives: false }])}><Plus size={14} /> Medicine</button>
    </Workspace>
  );
}
