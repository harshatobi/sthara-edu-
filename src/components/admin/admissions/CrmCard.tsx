'use client';

import { useState } from 'react';
import { PhoneIcon as Phone } from '@phosphor-icons/react/dist/ssr/Phone';
import { Chip, Skeleton, type Tone } from '@/components/canon/ui';
import { useGet } from '@/components/canon/useGet';
import { CONTACT_KINDS, OUTCOMES, type ContactKind } from '@/lib/admin/crm';
import { ago, fmtDate, isoDay } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { CardHead, Field } from '../kit';

interface Contact { id: string; kind: ContactKind; direction: 'in' | 'out' | null; outcome: keyof typeof OUTCOMES | null; note: string | null; follow_up_on: string | null; auto: boolean; at: string; by: string }
interface Message { id: string; stage: string; body: string; status: 'queued' | 'sending' | 'sent' | 'simulated' | 'skipped' | 'failed'; error: string | null; created_at: string; sent_at: string | null }
interface Crm { counsellors: { id: string; name: string }[]; contacts: Contact[]; messages: Message[] }

const MSG_TONE: Record<Message['status'], Tone> = { queued: 'b', sending: 'b', sent: 'g', simulated: 'n', skipped: 'a', failed: 'r' };
const MSG_LABEL: Record<Message['status'], string> = { queued: 'QUEUED', sending: 'SENDING', sent: 'SENT', simulated: 'SIMULATED', skipped: 'NOT SENT', failed: 'FAILED' };

/** Working the applicant: who owns them, when they are next due, every contact with the family, and their messages. */
export default function CrmCard({ applicantId, ownerId, followUpOn, optOut, open, canManage, onChanged }: {
  applicantId: string; ownerId: string | null; followUpOn: string | null; optOut: boolean; open: boolean; canManage: boolean; onChanged: (m: string) => void;
}) {
  const { call } = useAdminDesk();
  const { data, error, reload } = useGet<Crm>(`/api/admin/admissions/crm?applicant=${applicantId}`);
  const today = isoDay();
  const [kind, setKind] = useState<ContactKind>('call');
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const post = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true); setErr(null);
    try { await call('/api/admin/admissions/crm', 'POST', { applicantId, ...body }); reload(); onChanged(msg); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); return false; } finally { setBusy(false); }
  };
  const log = async () => {
    if (await post({ action: 'log', kind, outcome: kind === 'call' ? outcome : null, note, followUpOn: next || null }, next ? `Logged; next follow-up ${fmtDate(next)}` : 'Logged')) {
      setOutcome(''); setNote(''); setNext('');
    }
  };
  const overdue = !!followUpOn && followUpOn < today;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <CardHead title="Follow-up"
        sub={open ? (followUpOn ? `${overdue ? 'Overdue: was due' : 'Next follow-up'} ${fmtDate(followUpOn)}.` : 'No follow-up set.') : 'Closed or enrolled: nothing to follow up.'}
        right={followUpOn && <Chip tone={overdue ? 'r' : followUpOn === today ? 'a' : 'b'}>{overdue ? 'OVERDUE' : followUpOn === today ? 'DUE TODAY' : 'SCHEDULED'}</Chip>} />
      {err && <div className="note err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {!data && !error ? <Skeleton h={20} /> : error ? <div className="note err">{error}</div> : (<>
        <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 6 }}>
          <Field label="COUNSELLOR" htmlFor="crm-owner">
            <select id="crm-owner" className="cmp-sel" value={ownerId ?? ''} disabled={!canManage || busy}
              onChange={e => post({ action: 'assign', ownerId: e.target.value || null }, e.target.value ? 'Counsellor set' : 'Counsellor removed')}>
              <option value="">Nobody yet</option>
              {data!.counsellors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              {ownerId && !data!.counsellors.some(c => c.id === ownerId) && <option value={ownerId}>Someone who no longer works admissions</option>}
            </select>
          </Field>
          <Field label="NEXT FOLLOW-UP" htmlFor="crm-follow" hint="Blank: none.">
            <input id="crm-follow" type="date" className="cmp-in" min={today} value={followUpOn ?? ''} disabled={!canManage || busy || !open}
              onChange={e => post({ action: 'follow-up', on: e.target.value || null }, e.target.value ? `Follow-up set for ${fmtDate(e.target.value)}` : 'Follow-up cleared')} />
          </Field>
          <Field label="WHATSAPP MESSAGES" htmlFor="crm-opt" hint={optOut ? 'The family asked for none (STOP, or told you).' : 'Stage messages go to the family’s phone.'}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, paddingTop: 10 }}>
              <input id="crm-opt" type="checkbox" checked={!optOut} disabled={!canManage || busy}
                onChange={e => post({ action: 'opt-out', out: !e.target.checked }, e.target.checked ? 'Messages on again' : 'Messages stopped')} /> Send stage messages
            </label>
          </Field>
        </div>

        {canManage && open && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginBottom: 12 }}>
            <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
              <Field label="LOG" htmlFor="crm-kind">
                <select id="crm-kind" className="cmp-sel" value={kind} onChange={e => setKind(e.target.value as ContactKind)}>
                  {Object.entries(CONTACT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              {kind === 'call' && (
                <Field label="HOW IT WENT" htmlFor="crm-out">
                  <select id="crm-out" className="cmp-sel" value={outcome} onChange={e => setOutcome(e.target.value)}>
                    <option value="">Pick one</option>
                    {Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
              )}
              <Field label="NEXT FOLLOW-UP (OPTIONAL)" htmlFor="crm-next"><input id="crm-next" type="date" className="cmp-in" min={today} value={next} onChange={e => setNext(e.target.value)} /></Field>
            </div>
            <Field label={kind === 'note' ? 'NOTE' : 'NOTE (OPTIONAL)'} htmlFor="crm-note">
              <textarea id="crm-note" className="cmp-in" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="What was said, what they asked for…" />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12.5 }}>{kind === 'note' ? 'A note leaves the follow-up date as it is.' : 'Logging a contact without a next date clears the follow-up.'}</span>
              <button className="btn pri" disabled={busy || (kind === 'call' && !outcome) || (kind === 'note' && !note.trim())} onClick={log}><Phone size={14} /> Log it</button>
            </div>
          </div>
        )}

        {data!.contacts.length || data!.messages.length ? (
          <div>
            {data!.contacts.map(c => (
              <div className="row" key={c.id} style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {CONTACT_KINDS[c.kind]}{c.direction === 'in' ? ' from the family' : ''}{c.outcome ? `: ${OUTCOMES[c.outcome].toLowerCase()}` : ''}
                    {c.follow_up_on ? ` · next ${fmtDate(c.follow_up_on)}` : ''}
                  </div>
                  {c.note && <div style={{ fontSize: 13, marginTop: 2, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{c.note}</div>}
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{c.by} · {ago(c.at)}</div>
                </div>
              </div>
            ))}
            {data!.messages.filter(m => m.status !== 'sent' && m.status !== 'simulated').map(m => (
              <div className="row" key={m.id} style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Stage message</div>
                  <div style={{ fontSize: 13, marginTop: 2, overflowWrap: 'anywhere' }}>{m.body}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{m.error ?? ''}{m.error ? ' · ' : ''}{ago(m.created_at)}</div>
                </div>
                <Chip tone={MSG_TONE[m.status]}>{MSG_LABEL[m.status]}</Chip>
              </div>
            ))}
          </div>
        ) : <p className="muted" style={{ fontSize: 13 }}>No contact with the family logged yet.</p>}
      </>)}
    </div>
  );
}
