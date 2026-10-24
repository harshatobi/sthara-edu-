'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FirstAidKitIcon as FirstAidKit } from '@phosphor-icons/react/dist/ssr/FirstAidKit';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { Chip, Empty, PageBar } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { useAuth } from '@/contexts/AuthContext';
import { fmtDate } from '@/lib/admin/format';
import { IMPAIRMENT_LABEL, type HealthCard as Card } from '@/lib/students/health';
import { CareForm } from '@/components/students/forms';
import { ChildSwitcher, FamilyGate } from './common';

interface View {
  consent: boolean; card: Partial<Card> | null;
  events: { kind: 'checkup' | 'vaccination'; on_date: string; data: Record<string, any> }[];
  requests: { id: string; status: string; decision_note: string | null; created_at: string }[];
}

/** The child's health card as the school holds it; changes go to the school health officer. */
export default function HealthCard() {
  return <FamilyGate>{({ child: c }) => <Body childId={c.id} firstName={c.firstName} />}</FamilyGate>;
}

function Body({ childId, firstName }: { childId: string; firstName: string }) {
  const { data, error, reload } = useGet<{ children: { studentId: string; view: View }[] }>('/api/parent/health');
  const { getAuthToken } = useAuth();
  const [toast, toastEl] = useToast();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const v = data?.children.find(x => x.studentId === childId)?.view;
  const c = v?.card ?? {};
  const send = async (proposed: Record<string, unknown>) => {
    setErr(null);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/parent/health', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: childId, proposed }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not send.');
      toast('Sent to the school health officer.'); setEditing(false); reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send.'); }
  };
  return (
    <>
      {toastEl}
      <ChildSwitcher />
      <PageBar eyebrow="HEALTH" title={`${firstName}'s health card`} sub="What the school knows, so it can look after your child. Changes go to the school health officer."
        actions={v?.consent ? <button className="btn" onClick={() => setEditing(true)}><PencilSimple size={16} /> Tell the school about a change</button> : undefined} />
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {error && <div className="note err" role="alert">{error}</div>}
      {data && !v && <div className="card"><Empty icon={<FirstAidKit size={30} weight="duotone" />} title="Not on the school register yet" /></div>}
      {v && (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="pa-card-hd flat"><div><h3>Basic health (UDISE+)</h3><p className="muted">The school keeps these for the government school census.</p></div></div>
            <p><b>Blood group:</b> {c.blood_group ?? 'Not known'} · <b>Height:</b> {c.height_cm ? `${c.height_cm} cm` : '—'} · <b>Weight:</b> {c.weight_kg ? `${c.weight_kg} kg` : '—'}</p>
            {c.cwsn && <p><b>Special needs:</b> {(c.impairments ?? []).map(i => IMPAIRMENT_LABEL[i]).join(', ') || 'Yes'}</p>}
          </div>
          {!v.consent ? (
            <div className="card"><Empty icon={<FirstAidKit size={30} weight="duotone" />} title="Give health consent to share allergies and medication">
              With your consent, the school keeps {firstName}&apos;s allergies, conditions, medication, check-ups and vaccinations, and shows a short alert to their teachers.
              You can withdraw it any time; the school then deletes those details. <Link className="pa-link" href="/parent/settings#privacy">Give consent</Link>
            </Empty></div>
          ) : (
            <>
              <div className="g2" style={{ marginBottom: 18 }}>
                <div className="card"><div className="pa-card-hd flat"><div><h3>Allergies and conditions</h3></div></div>
                  {!(c.allergies ?? []).length && !(c.conditions ?? []).length ? <p className="muted">None recorded.</p> : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {(c.allergies ?? []).map((a, i) => <li key={`a${i}`}>Allergic to <b>{a.what}</b> <Chip tone={a.severity === 'severe' ? 'r' : 'a'}>{a.severity.toUpperCase()}</Chip>{a.action && <div className="muted" style={{ fontSize: 12 }}>{a.action}</div>}</li>)}
                      {(c.conditions ?? []).map((x, i) => <li key={`c${i}`}><b>{x.name}</b>{x.plan && <div className="muted" style={{ fontSize: 12 }}>{x.plan}</div>}</li>)}
                    </ul>
                  )}
                </div>
                <div className="card"><div className="pa-card-hd flat"><div><h3>Medication</h3></div></div>
                  {!(c.medication ?? []).length ? <p className="muted">None recorded.</p> : <ul style={{ margin: 0, paddingLeft: 18 }}>{c.medication!.map((m, i) => <li key={i}><b>{m.name}</b> {[m.dose, m.timing].filter(Boolean).join(', ')}{m.schoolGives && <> <Chip tone="b">SCHOOL GIVES</Chip></>}</li>)}</ul>}
                </div>
              </div>
              <div className="card" style={{ marginBottom: 18 }}><div className="pa-card-hd flat"><div><h3>Check-ups and vaccinations</h3></div></div>
                {!v.events.length ? <p className="muted">Nothing recorded yet.</p> : (
                  <div className="pa-tbl-wrap"><table className="tbl pa-tbl"><thead><tr><th>Date</th><th>What</th></tr></thead>
                    <tbody>{v.events.map((e, i) => <tr key={i}><td>{fmtDate(e.on_date)}</td><td>{e.kind === 'vaccination' ? `Vaccination: ${e.data.vaccine}${e.data.dose ? ` (dose ${e.data.dose})` : ''}` : `Check-up${e.data.remarks ? `: ${e.data.remarks}` : ''}`}</td></tr>)}</tbody></table></div>
                )}
              </div>
            </>
          )}
          {v.requests.length > 0 && (
            <div className="card"><div className="pa-card-hd flat"><div><h3>What you have told the school</h3></div></div>
              <div className="pa-tbl-wrap"><table className="tbl pa-tbl"><thead><tr><th>Sent</th><th>Status</th><th>School&apos;s note</th></tr></thead>
                <tbody>{v.requests.map(r => <tr key={r.id}><td>{fmtDate(r.created_at)}</td><td><Chip tone={r.status === 'approved' ? 'g' : r.status === 'rejected' ? 'r' : 'b'}>{r.status === 'pending' ? 'WITH THE SCHOOL' : r.status.toUpperCase()}</Chip></td><td>{r.decision_note ?? ''}</td></tr>)}</tbody></table></div>
            </div>
          )}
          {editing && <CareForm card={c} title="Tell the school about a change" onClose={() => setEditing(false)} onSave={p => send(p)} />}
        </>
      )}
    </>
  );
}
