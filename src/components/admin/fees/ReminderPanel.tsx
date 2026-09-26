'use client';

import { useMemo, useState } from 'react';
import { Chip } from '@/components/canon/ui';
import { reminderMessage, type Family } from '@/lib/admin/fees';
import { ago, fmtDate, inr, plural } from '@/lib/admin/format';
import { Workspace } from '../kit';
import { TONE_CHIP } from './FamilyLedger';

/**
 * Stage in-app reminders to parents. Tone per family comes from its own payment
 * history; the server recomputes balances and tone before anything is sent.
 */
export default function ReminderPanel({ families, school, guardianCount, call, onSent, onClose }: {
  families: Family[]; school: string; guardianCount: (studentId: string) => number;
  call: (path: string, method: 'POST', body: unknown) => Promise<any>; onSent: (msg: string) => void; onClose: () => void;
}) {
  const recent = (f: Family) => !!f.lastReminderAt && Date.now() - new Date(f.lastReminderAt).getTime() < 3 * 86_400_000;
  const eligible = (f: Family) => f.outstanding > 0 && guardianCount(f.studentId) > 0 && !recent(f);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(families.filter(eligible).map(f => f.studentId)));
  const [preview, setPreview] = useState<string | null>(families.find(eligible)?.studentId ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const shown = families.find(f => f.studentId === preview);
  const msg = useMemo(() => {
    if (!shown) return null;
    const oldest = shown.invoices.filter(i => i.balance > 0).map(i => i.dueOn).sort()[0];
    return reminderMessage(shown.tone, shown.name, inr(shown.outstanding), fmtDate(oldest), school);
  }, [shown, school]);

  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await call('/api/admin/fees', 'POST', { action: 'remind', studentIds: [...picked] });
      onSent(r.skipped?.length ? `${plural(r.sent, 'family', 'families')} reminded · ${r.skipped.length} skipped` : `${plural(r.sent, 'family', 'families')} reminded`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <Workspace wide title="Stage fee reminders" sub={`${plural(families.length, 'family', 'families')} with a balance · sent in-app to each verified parent`} onClose={onClose}
      actions={<button className="btn red" disabled={busy || !picked.size} onClick={send}>{busy ? 'Sending…' : `Send ${plural(picked.size, 'reminder')}`}</button>}>
      {err && <div className="err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <div className="g2" style={{ gridTemplateColumns: '1fr 360px', alignItems: 'start' }}>
        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th /><th>Family</th><th className="r">Outstanding</th><th className="c">Overdue</th><th className="c">Tone</th><th>Last reminder</th></tr></thead>
              <tbody>{families.map(f => {
                const can = eligible(f);
                const why = f.outstanding <= 0 ? 'Nothing due' : !guardianCount(f.studentId) ? 'No verified parent linked' : recent(f) ? 'Reminded in the last 3 days' : '';
                return (
                  <tr key={f.studentId} className={`click${preview === f.studentId ? ' sel' : ''}`} onClick={() => setPreview(f.studentId)}>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Remind ${f.name}'s family`} disabled={!can} checked={picked.has(f.studentId)} onChange={() => toggle(f.studentId)} />
                    </td>
                    <td><b style={{ fontSize: 14 }}>{f.name}</b><div className="muted" style={{ fontSize: 12 }}>{f.cls}{why ? ` · ${why}` : ''}</div></td>
                    <td className="r num">{inr(f.outstanding)}</td>
                    <td className="c num" style={{ color: f.maxDaysOverdue ? 'var(--red)' : 'var(--mut)' }}>{f.maxDaysOverdue ? `${f.maxDaysOverdue} d` : '—'}</td>
                    <td className="c"><Chip tone={TONE_CHIP[f.tone]}>{f.tone.toUpperCase()}</Chip></td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{f.lastReminderAt ? ago(f.lastReminderAt) : 'Never'}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
        <div className="card" style={{ position: 'sticky', top: 90 }}>
          <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', marginBottom: 12 }}>WHAT THE PARENT SEES</div>
          {msg && shown ? (
            <>
              <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 16, background: '#FCFDFE' }}>
                <b style={{ fontSize: 14.5 }}>{msg.title}</b>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 8 }}>{msg.body}</p>
              </div>
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 12 }}>
                {shown.tone === 'gentle' ? 'Gentle: this family usually pays on time.' : shown.tone === 'firm'
                  ? 'Firm: overdue beyond 30 days, a history of late payment, or already reminded once.'
                  : 'Final: over 60 days overdue, or three reminders already sent.'}
              </p>
            </>
          ) : <p className="muted" style={{ fontSize: 13.5 }}>Pick a family to preview its message.</p>}
          <div className="note" style={{ marginTop: 14 }}>Reminders go to the parent&apos;s Sthara inbox, and to WhatsApp for parents who linked their number and chose fee updates. Until the school&apos;s WhatsApp Business key is set, WhatsApp copies are logged, not sent.</div>
        </div>
      </div>
    </Workspace>
  );
}
