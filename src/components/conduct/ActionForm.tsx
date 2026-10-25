'use client';

import { useState } from 'react';
import { Field } from '@/components/admin/kit';
import { isoDay } from '@/lib/admin/format';
import { ACTION_KINDS, ACTION_LABEL, type ActionKind } from '@/lib/conduct/rules';

export interface ActionBody { kind: ActionKind; onDate: string; untilDate: string | null; reason: string; details: string | null; incidentId: string | null; notify: boolean }

/**
 * The fields of a discipline action, shared by the teacher's proposal and the office's record. `approver` adds the
 * choice to tell the parent (only an approved action reaches parents).
 */
export function ActionFields({ incidents, approver, onChange }: { incidents: { id: string; label: string }[]; approver: boolean; onChange: (b: ActionBody) => void }) {
  const [b, setB] = useState<ActionBody>({ kind: 'warning', onDate: isoDay(), untilDate: null, reason: '', details: null, incidentId: null, notify: false });
  const set = (patch: Partial<ActionBody>) => setB(x => { const n = { ...x, ...patch }; onChange(n); return n; });
  const ranged = b.kind === 'suspension' || b.kind === 'detention';
  return (
    <>
      <Field label="ACTION" htmlFor="da-kind">
        <select id="da-kind" className="cmp-sel" value={b.kind} onChange={e => set({ kind: e.target.value as ActionKind, untilDate: null })}>
          {ACTION_KINDS.map(k => <option key={k} value={k}>{ACTION_LABEL[k]}</option>)}
        </select>
      </Field>
      <div className="g2">
        <Field label={b.kind === 'suspension' ? 'FIRST DAY' : 'DATE'} htmlFor="da-on"><input id="da-on" type="date" className="cmp-in" value={b.onDate} onChange={e => set({ onDate: e.target.value })} /></Field>
        {ranged && <Field label={b.kind === 'suspension' ? 'LAST DAY' : 'LAST DAY (IF MORE THAN ONE)'} htmlFor="da-until"><input id="da-until" type="date" className="cmp-in" value={b.untilDate ?? ''} min={b.onDate} onChange={e => set({ untilDate: e.target.value || null })} /></Field>}
      </div>
      <Field label="REASON" htmlFor="da-reason" hint="One line. Once approved, this is what the parent reads.">
        <input id="da-reason" className="cmp-in" maxLength={300} value={b.reason} placeholder="Used a phone during the class test" onChange={e => set({ reason: e.target.value })} />
      </Field>
      <Field label="DETAILS FOR THE SCHOOL (OPTIONAL)" htmlFor="da-details" hint="Staff only; parents never see this.">
        <textarea id="da-details" className="cmp-in" rows={3} maxLength={2000} value={b.details ?? ''} onChange={e => set({ details: e.target.value || null })} />
      </Field>
      {incidents.length > 0 && (
        <Field label="LINKED INCIDENT (OPTIONAL)" htmlFor="da-inc">
          <select id="da-inc" className="cmp-sel" value={b.incidentId ?? ''} onChange={e => set({ incidentId: e.target.value || null })}>
            <option value="">None</option>{incidents.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        </Field>
      )}
      {approver && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={b.notify} onChange={e => set({ notify: e.target.checked })} /> Tell the parents now (portal and WhatsApp)</label>}
    </>
  );
}
