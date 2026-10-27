'use client';

import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { Field } from '@/components/admin/kit';
import { APPLICATION_FIELDS, MAX_FAMILY, type ApplicationForm } from '@/lib/admin/application';
import {
  ADDRESS_PARTS, EDUCATION, EDUCATION_LABEL, GROUPS, RELATION_LABEL, RELATIONS, type Address, type Field as RegField,
} from '@/lib/students/register';

/**
 * The application form's fields (the register's own fields, address, family), shared by the admissions office's
 * screen and the family's (the apply page and the parent portal), so both fill in exactly the same thing.
 */

export type Draft = { fields: Record<string, string>; address: Record<string, string>; permanent_same: boolean; permanent_address: Record<string, string>; family: Record<string, string | boolean>[] };

export const toDraft = (f: ApplicationForm): Draft => ({
  fields: Object.fromEntries(Object.entries(f.fields).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)])),
  address: Object.fromEntries(Object.entries(f.address || {}).map(([k, v]) => [k, v ?? ''])),
  permanent_same: f.permanent_same,
  permanent_address: Object.fromEntries(Object.entries(f.permanent_address || {}).map(([k, v]) => [k, v ?? ''])),
  family: f.family.map(m => ({ relation: m.relation, name: m.name, phone: m.phone ?? '', email: m.email ?? '', occupation: m.occupation ?? '', education: m.education ?? '', is_primary: m.is_primary })),
});

/** The draft as the API takes it (the server checks it with the register's rules). */
export const draftToForm = (d: Draft) => ({
  fields: Object.fromEntries(Object.entries(d.fields).filter(([, v]) => v !== '')),
  address: Object.values(d.address).some(v => v.trim()) ? d.address : null,
  permanent_same: d.permanent_same, permanent_address: d.permanent_same ? null : d.permanent_address,
  family: d.family,
});

function FieldInput({ f, value, set, disabled }: { f: RegField; value: string; set: (v: string) => void; disabled: boolean }) {
  const id = `af-${f.key}`;
  const control = f.kind === 'enum' ? (
    <select id={id} className="cmp-sel" value={value} disabled={disabled} onChange={e => set(e.target.value)}>
      <option value="">Not given</option>
      {f.values!.map(v => <option key={v} value={v}>{f.labels?.[v] ?? v}</option>)}
    </select>
  ) : f.kind === 'bool' ? (
    <select id={id} className="cmp-sel" value={value} disabled={disabled} onChange={e => set(e.target.value)}>
      <option value="">Not given</option><option value="yes">Yes</option><option value="no">No</option>
    </select>
  ) : (
    <input id={id} className="cmp-in" value={value} disabled={disabled} type={f.kind === 'date' ? 'date' : 'text'}
      inputMode={f.kind === 'digits' || f.kind === 'amount' ? 'numeric' : undefined} maxLength={f.kind === 'digits' ? (f.len ?? 12) + 4 : f.max}
      onChange={e => set(e.target.value)} />
  );
  return <Field label={f.label.toUpperCase()} htmlFor={id} hint={f.hint}>{control}</Field>;
}

function AddressInputs({ prefix, value, set, disabled }: { prefix: string; value: Record<string, string>; set: (k: keyof Address, v: string) => void; disabled: boolean }) {
  return (
    <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      {ADDRESS_PARTS.map(p => (
        <Field key={p.key} label={p.label.toUpperCase()} htmlFor={`${prefix}-${p.key}`}>
          <input id={`${prefix}-${p.key}`} className="cmp-in" maxLength={p.max} value={value[p.key] ?? ''} disabled={disabled}
            inputMode={p.key === 'pin' ? 'numeric' : undefined} onChange={e => set(p.key, e.target.value)} />
        </Field>
      ))}
    </div>
  );
}

const Heading = ({ children, first }: { children: string; first?: boolean }) => (
  <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', margin: first ? '6px 0 8px' : '14px 0 8px' }}>{children}</div>
);

export default function ApplicationFields({ d, setD, disabled }: { d: Draft; setD: (f: (x: Draft) => Draft) => void; disabled: boolean }) {
  const groups = GROUPS.filter(g => APPLICATION_FIELDS.some(f => f.group === g.key));
  const setField = (k: string, v: string) => setD(x => ({ ...x, fields: { ...x.fields, [k]: v } }));
  const setMember = (i: number, k: string, v: string | boolean) => setD(x => ({ ...x, family: x.family.map((m, j) => (j === i ? { ...m, [k]: v } : k === 'is_primary' && v ? { ...m, is_primary: false } : m)) }));
  return (
    <>
      {groups.map((g, gi) => (
        <div key={g.key} style={{ marginBottom: 14 }}>
          <Heading first={gi === 0}>{g.label.toUpperCase()}</Heading>
          <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {APPLICATION_FIELDS.filter(f => f.group === g.key).map(f => (
              <FieldInput key={f.key} f={f} value={d.fields[f.key] ?? ''} set={v => setField(f.key, v)} disabled={disabled} />
            ))}
          </div>
        </div>
      ))}
      <Heading first>ADDRESS</Heading>
      <AddressInputs prefix="adr" value={d.address} disabled={disabled} set={(k, v) => setD(x => ({ ...x, address: { ...x.address, [k]: v } }))} />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '4px 0 12px' }}>
        <input type="checkbox" checked={d.permanent_same} disabled={disabled} onChange={e => setD(x => ({ ...x, permanent_same: e.target.checked }))} /> The permanent address is the same
      </label>
      {!d.permanent_same && <AddressInputs prefix="padr" value={d.permanent_address} disabled={disabled} set={(k, v) => setD(x => ({ ...x, permanent_address: { ...x.permanent_address, [k]: v } }))} />}

      <Heading>FAMILY</Heading>
      {d.family.map((m, i) => (
        <div key={i} className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end', paddingBottom: 10, borderBottom: '1px solid var(--line)', marginBottom: 10 }}>
          <Field label="RELATION" htmlFor={`fm-r-${i}`}>
            <select id={`fm-r-${i}`} className="cmp-sel" value={String(m.relation)} disabled={disabled} onChange={e => setMember(i, 'relation', e.target.value)}>
              {RELATIONS.map(r => <option key={r} value={r}>{RELATION_LABEL[r]}</option>)}
            </select>
          </Field>
          <Field label="NAME" htmlFor={`fm-n-${i}`}><input id={`fm-n-${i}`} className="cmp-in" maxLength={120} value={String(m.name)} disabled={disabled} onChange={e => setMember(i, 'name', e.target.value)} /></Field>
          <Field label="MOBILE" htmlFor={`fm-p-${i}`}><input id={`fm-p-${i}`} className="cmp-in" inputMode="tel" maxLength={20} value={String(m.phone)} disabled={disabled} onChange={e => setMember(i, 'phone', e.target.value)} /></Field>
          <Field label="EMAIL" htmlFor={`fm-e-${i}`}><input id={`fm-e-${i}`} className="cmp-in" maxLength={160} value={String(m.email)} disabled={disabled} onChange={e => setMember(i, 'email', e.target.value)} /></Field>
          <Field label="OCCUPATION" htmlFor={`fm-o-${i}`}><input id={`fm-o-${i}`} className="cmp-in" maxLength={80} value={String(m.occupation)} disabled={disabled} onChange={e => setMember(i, 'occupation', e.target.value)} /></Field>
          <Field label="EDUCATION" htmlFor={`fm-ed-${i}`}>
            <select id={`fm-ed-${i}`} className="cmp-sel" value={String(m.education)} disabled={disabled} onChange={e => setMember(i, 'education', e.target.value)}>
              <option value="">Not given</option>
              {EDUCATION.map(x => <option key={x} value={x}>{EDUCATION_LABEL[x]}</option>)}
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingBottom: 8 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="radio" name="fm-primary" checked={m.is_primary === true} disabled={disabled} onChange={() => setMember(i, 'is_primary', true)} /> Main contact</label>
            {!disabled && <button type="button" className="btn sm" aria-label={`Remove family member ${i + 1}`} onClick={() => setD(x => ({ ...x, family: x.family.filter((_, j) => j !== i) }))}><Trash size={13} /></button>}
          </div>
        </div>
      ))}
      {!disabled && d.family.length < MAX_FAMILY && (
        <button type="button" className="btn sm" onClick={() => setD(x => ({ ...x, family: [...x.family, { relation: x.family.length ? 'father' : 'mother', name: '', phone: '', email: '', occupation: '', education: '', is_primary: !x.family.length }] }))}>
          <Plus size={13} /> Add a family member
        </button>
      )}
      {!d.family.length && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>The transfer certificate names the mother and the father or guardian: add them here.</p>}
    </>
  );
}
