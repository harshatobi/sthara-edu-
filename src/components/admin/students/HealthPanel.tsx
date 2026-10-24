'use client';

import { useState } from 'react';
import { FirstAidKitIcon as FirstAidKit } from '@phosphor-icons/react/dist/ssr/FirstAidKit';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { fmtDate } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import {
  alertOf, BLOOD_GROUPS, IMPAIRMENT_LABEL, IMPAIRMENTS, SCREEN_LABEL, SCREEN_RESULT_LABEL, SCREEN_RESULTS, SCREENS, type HealthCard,
} from '@/lib/students/health';
import { CareForm } from '@/components/students/forms';
import { CardHead, Field, Workspace } from '../kit';

interface Data {
  card: (Partial<HealthCard> & { keep_after_leaving?: boolean; legal_hold?: boolean; erased_at?: string | null; erased_reason?: string | null }) | null;
  consent: boolean; full: boolean; hasLogin: boolean; can: { manage: boolean };
  events: { id: string; kind: 'checkup' | 'vaccination'; on_date: string; data: Record<string, any>; note: string | null }[];
}

const yes = (b: boolean | null | undefined) => (b == null ? '—' : b ? 'Yes' : 'No');

/** One student's health record: the UDISE+ part, and (with health.read and consent) care details and the timeline. */
export default function HealthPanel({ studentId }: { studentId: string }) {
  const { data, error, reload } = useGet<Data>(`/api/admin/students/${studentId}/health`);
  const { call } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const [edit, setEdit] = useState<null | 'udise' | 'care' | 'event'>(null);
  const [err, setErr] = useState<string | null>(null);
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div className="card">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div>;
  const c = data.card ?? {};
  const post = async (body: Record<string, unknown>, ok: string) => {
    setErr(null);
    try { await call(`/api/admin/students/${studentId}/health`, 'POST', body); toast(ok); setEdit(null); reload(); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); return false; }
  };
  const alert = data.full && c.allergies ? alertOf({ allergies: c.allergies ?? [], conditions: c.conditions ?? [] }) : null;
  return (
    <>
      {toastEl}
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {alert && <div className="note err" style={{ marginBottom: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}><Warning size={18} weight="fill" /> <span><b>Alert shown to the class&apos;s teachers:</b> {alert}</span></div>}
      <div className="card" style={{ marginBottom: 14 }}>
        <CardHead title="UDISE+ health" sub="Kept as a statutory record." right={data.can.manage ? <button className="btn sm" onClick={() => setEdit('udise')}>Edit</button> : undefined} />
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px 20px', margin: 0 }}>
          <div><dt className="muted" style={{ fontSize: 12 }}>Blood group</dt><dd style={{ margin: 0, fontWeight: 600 }}>{c.blood_group ?? '—'}</dd></div>
          <div><dt className="muted" style={{ fontSize: 12 }}>Height · weight</dt><dd style={{ margin: 0, fontWeight: 600 }}>{c.height_cm ? `${c.height_cm} cm` : '—'} · {c.weight_kg ? `${c.weight_kg} kg` : '—'}{c.measured_on ? <span className="muted"> ({fmtDate(c.measured_on)})</span> : null}</dd></div>
          <div><dt className="muted" style={{ fontSize: 12 }}>Special needs (CWSN)</dt><dd style={{ margin: 0, fontWeight: 600 }}>{c.cwsn ? (c.impairments ?? []).map(i => IMPAIRMENT_LABEL[i]).join(', ') || 'Yes' : 'No'}</dd></div>
          <div><dt className="muted" style={{ fontSize: 12 }}>Disability certificate</dt><dd style={{ margin: 0, fontWeight: 600 }}>{yes(c.disability_certificate)}{c.disability_percent != null ? ` · ${c.disability_percent}%` : ''}</dd></div>
          {SCREENS.map(k => <div key={k}><dt className="muted" style={{ fontSize: 12 }}>{SCREEN_LABEL[k]}</dt><dd style={{ margin: 0, fontWeight: 600 }}>{c.screening?.[k] ? SCREEN_RESULT_LABEL[c.screening[k] as keyof typeof SCREEN_RESULT_LABEL] : 'Not screened'}</dd></div>)}
        </dl>
      </div>

      {data.full && (!data.consent ? (
        <div className="card"><Empty icon={<FirstAidKit size={26} weight="duotone" />} title="Health consent needed">
          Allergies, conditions, medication, check-ups and vaccinations are kept only once a parent gives health consent on the parent portal (WhatsApp &amp; Privacy).
          {!data.hasLogin ? ' This student has no Sthara login yet, so a parent can’t give it until Sthara issues one.' : ''}
          {c.erased_at ? ` Earlier details were erased on ${fmtDate(c.erased_at)} (${c.erased_reason}).` : ''}
        </Empty></div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <CardHead title="Care" sub="Allergies, conditions and medication." right={data.can.manage ? <button className="btn sm" onClick={() => setEdit('care')}>Edit</button> : undefined} />
            <div className="g2">
              <div><h4 style={{ fontSize: 13, marginBottom: 6 }}>Allergies</h4>{(c.allergies ?? []).length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{c.allergies!.map((a, i) => <li key={i}><b>{a.what}</b> <Chip tone={a.severity === 'severe' ? 'r' : a.severity === 'moderate' ? 'a' : 'n'}>{a.severity.toUpperCase()}</Chip>{a.action && <div className="muted" style={{ fontSize: 12 }}>{a.action}</div>}</li>)}</ul> : <p className="muted">None known.</p>}</div>
              <div><h4 style={{ fontSize: 13, marginBottom: 6 }}>Conditions</h4>{(c.conditions ?? []).length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{c.conditions!.map((x, i) => <li key={i}><b>{x.name}</b>{x.serious && <> <Chip tone="r">ALERT</Chip></>}{x.plan && <div className="muted" style={{ fontSize: 12 }}>{x.plan}</div>}</li>)}</ul> : <p className="muted">None known.</p>}</div>
            </div>
            <h4 style={{ fontSize: 13, margin: '14px 0 6px' }}>Medication</h4>
            {(c.medication ?? []).length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{c.medication!.map((m, i) => <li key={i}><b>{m.name}</b> {[m.dose, m.timing].filter(Boolean).join(', ')}{m.schoolGives && <> <Chip tone="b">SCHOOL GIVES</Chip></>}</li>)}</ul> : <p className="muted">None.</p>}
          </div>
          <div className="card" style={{ marginBottom: 14 }}>
            <CardHead title="Check-ups and vaccinations" right={data.can.manage ? <button className="btn sm" onClick={() => setEdit('event')}><Plus size={14} weight="bold" /> Add</button> : undefined} />
            {!data.events.length ? <p className="muted">Nothing recorded yet.</p> : (
              <div style={{ overflowX: 'auto' }}><table className="tbl">
                <thead><tr><th>Date</th><th>What</th><th>Results</th><th /></tr></thead>
                <tbody>{data.events.map(e => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.on_date)}</td>
                    <td>{e.kind === 'vaccination' ? <>Vaccination: <b>{e.data.vaccine}</b>{e.data.dose ? ` (dose ${e.data.dose})` : ''}</> : 'Check-up'}</td>
                    <td>{e.kind === 'checkup' ? [e.data.vision_left || e.data.vision_right ? `Vision ${e.data.vision_left ?? '?'} / ${e.data.vision_right ?? '?'}` : null, e.data.hearing ? `Hearing ${e.data.hearing}` : null,
                      e.data.dental ? `Dental ${e.data.dental}` : null, e.data.height_cm ? `${e.data.height_cm} cm` : null, e.data.weight_kg ? `${e.data.weight_kg} kg` : null, e.data.bmi ? `BMI ${e.data.bmi}` : null, e.data.remarks].filter(Boolean).join(' · ') : (e.note ?? '')}</td>
                    <td>{data.can.manage && <button className="btn sm" onClick={() => post({ action: 'event-remove', eventId: e.id }, 'Removed.')}>Remove</button>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
          {data.can.manage && data.card && (
            <div className="card">
              <CardHead title="After the student leaves" sub="Care details and the timeline are erased after the school's retention period, unless one of these is on." />
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={!!c.keep_after_leaving} onChange={e => post({ action: 'flags', keep: e.target.checked }, 'Saved.')} /> The parent asked the school to keep them</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginTop: 8 }}><input type="checkbox" checked={!!c.legal_hold} onChange={e => post({ action: 'flags', hold: e.target.checked }, 'Saved.')} /> Legal hold</label>
            </div>
          )}
        </>
      ))}
      {edit === 'udise' && <UdiseForm card={c} onClose={() => setEdit(null)} onSave={v => post({ action: 'card', card: v }, 'Saved.')} />}
      {edit === 'care' && <CareForm card={c} onClose={() => setEdit(null)} onSave={v => post({ action: 'card', card: v }, 'Saved.')} />}
      {edit === 'event' && <EventForm onClose={() => setEdit(null)} onSave={v => post({ action: 'event-add', event: v }, 'Added.')} />}
    </>
  );
}

function UdiseForm({ card, onClose, onSave }: { card: Partial<HealthCard>; onClose: () => void; onSave: (v: Record<string, unknown>) => void }) {
  const [v, setV] = useState<Record<string, any>>({ blood_group: card.blood_group ?? '', height_cm: card.height_cm ?? '', weight_kg: card.weight_kg ?? '', measured_on: card.measured_on ?? '',
    cwsn: !!card.cwsn, impairments: card.impairments ?? [], disability_certificate: card.disability_certificate ?? null, disability_percent: card.disability_percent ?? '', screening: card.screening ?? {} });
  const set = (k: string, x: unknown) => setV(o => ({ ...o, [k]: x }));
  return (
    <Workspace title="UDISE+ health" onClose={onClose} actions={<button className="btn pri" onClick={() => onSave(v)}>Save</button>}>
      <div className="g2">
        <Field label="BLOOD GROUP" htmlFor="h-bg"><select id="h-bg" className="cmp-sel" value={v.blood_group} onChange={e => set('blood_group', e.target.value)}><option value="">Not known</option>{BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}</select></Field>
        <Field label="MEASURED ON" htmlFor="h-on"><input id="h-on" type="date" className="cmp-in" value={v.measured_on} onChange={e => set('measured_on', e.target.value)} /></Field>
        <Field label="HEIGHT (CM)" htmlFor="h-h"><input id="h-h" className="cmp-in" inputMode="decimal" value={v.height_cm} onChange={e => set('height_cm', e.target.value)} /></Field>
        <Field label="WEIGHT (KG)" htmlFor="h-w"><input id="h-w" className="cmp-in" inputMode="decimal" value={v.weight_kg} onChange={e => set('weight_kg', e.target.value)} /></Field>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: '8px 0' }}><legend style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Special needs</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 6 }}>
          {IMPAIRMENTS.map(i => <label key={i} style={{ display: 'flex', gap: 8, fontSize: 14 }}><input type="checkbox" checked={v.impairments.includes(i)} onChange={e => set('impairments', e.target.checked ? [...v.impairments, i] : v.impairments.filter((x: string) => x !== i))} /> {IMPAIRMENT_LABEL[i]}</label>)}
        </div>
      </fieldset>
      <div className="g2">
        <Field label="DISABILITY CERTIFICATE" htmlFor="h-dc"><select id="h-dc" className="cmp-sel" value={v.disability_certificate == null ? '' : v.disability_certificate ? 'y' : 'n'} onChange={e => set('disability_certificate', e.target.value === '' ? null : e.target.value === 'y')}><option value="">Not recorded</option><option value="y">Yes</option><option value="n">No</option></select></Field>
        <Field label="DISABILITY %" htmlFor="h-dp"><input id="h-dp" className="cmp-in" inputMode="numeric" value={v.disability_percent} onChange={e => set('disability_percent', e.target.value)} /></Field>
        {SCREENS.map(k => <Field key={k} label={SCREEN_LABEL[k].toUpperCase()} htmlFor={`h-s-${k}`}><select id={`h-s-${k}`} className="cmp-sel" value={v.screening[k] ?? ''} onChange={e => set('screening', { ...v.screening, [k]: e.target.value || undefined })}><option value="">Not screened</option>{SCREEN_RESULTS.filter(r => r !== 'not_screened').map(r => <option key={r} value={r}>{SCREEN_RESULT_LABEL[r]}</option>)}</select></Field>)}
      </div>
    </Workspace>
  );
}

function EventForm({ onClose, onSave }: { onClose: () => void; onSave: (v: Record<string, unknown>) => void }) {
  const [kind, setKind] = useState<'checkup' | 'vaccination'>('checkup');
  const [on, setOn] = useState('');
  const [d, setD] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const f = (k: string, label: string, ph = '') => <Field key={k} label={label} htmlFor={`e-${k}`}><input id={`e-${k}`} className="cmp-in" value={d[k] ?? ''} placeholder={ph} onChange={e => setD(x => ({ ...x, [k]: e.target.value }))} /></Field>;
  return (
    <Workspace title="Add a check-up or vaccination" onClose={onClose} actions={<button className="btn pri" disabled={!on} onClick={() => onSave({ kind, on_date: on, data: d, note })}>Save</button>}>
      <div className="g2">
        <Field label="WHAT" htmlFor="e-kind"><select id="e-kind" className="cmp-sel" value={kind} onChange={e => { setKind(e.target.value as 'checkup' | 'vaccination'); setD({}); }}><option value="checkup">Check-up</option><option value="vaccination">Vaccination</option></select></Field>
        <Field label="DATE" htmlFor="e-on"><input id="e-on" type="date" className="cmp-in" value={on} onChange={e => setOn(e.target.value)} /></Field>
        {kind === 'vaccination' ? [f('vaccine', 'VACCINE', 'MMR'), f('dose', 'DOSE', '2')] : [f('vision_left', 'VISION LEFT', '6/6'), f('vision_right', 'VISION RIGHT', '6/9'), f('hearing', 'HEARING', 'Normal'), f('dental', 'DENTAL', 'Caries, 2 teeth'), f('height_cm', 'HEIGHT (CM)'), f('weight_kg', 'WEIGHT (KG)'), f('remarks', "DOCTOR'S REMARKS")]}
      </div>
      <Field label="NOTE" htmlFor="e-note"><input id="e-note" className="cmp-in" value={note} maxLength={500} onChange={e => setNote(e.target.value)} /></Field>
    </Workspace>
  );
}
