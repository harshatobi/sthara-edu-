'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { Chip, PageBar, Skeleton } from '@/components/canon/ui';
import { PRIORITIES, PRIORITY_LABEL, SOURCES, STATUS_LABEL, dueText, type CaseSource, type CaseStatus, type Priority, type ReplyThen, type SlaState } from '@/lib/ops/desk';
import { roleLabel, type OperatorRole } from '@/lib/ops/roles';
import { Facts, Section, errText, fmtDateTime } from '../../_ui';
import { useOpsApi } from '../../useOpsApi';
import { CaseStatusChip, PriorityChip, SlaChip } from '../parts';

interface Case {
  id: string; number: number; ref: string; subject: string; category: string; priority: Priority; status: CaseStatus; source: CaseSource;
  schoolId: string; school: string; schoolCode: string | null; raisedByName: string | null; ownerId: string | null; owner: string | null;
  createdAt: string; firstResponseDue: string; resolveDue: string; firstRespondedAt: string | null; resolvedAt: string | null; closedAt: string | null;
  reopened: number; sla: SlaState;
}
interface Message { id: string; author_kind: 'school' | 'operator' | 'system'; author_name: string | null; body: string; internal: boolean; created_at: string }
interface Data {
  case: Case; messages: Message[];
  links: { id: string; kind: string; ref: string; label: string | null }[];
  categories: { key: string; label: string; active: boolean }[];
  owners: { id: string; name: string; role: OperatorRole }[];
  canned: { id: string; title: string; body: string }[];
  windows: { id: string; operator_email: string; started_at: string; reason: string }[];
  otherCases: { id: string; ref: string; subject: string; status: CaseStatus; created_at: string }[];
  can: { work: boolean; breakglass: boolean }; me: string;
}

const LINK_KIND: Record<string, string> = { error: 'Error (fingerprint)', record: 'Record (table/id)', audit: 'Audit entry', request: 'Request', url: 'Link' };
const STATUS_MOVES: CaseStatus[] = ['open', 'waiting_school', 'resolved', 'closed'];

/** Platform Manager > Service desk > one case: the conversation, its clock, and everything attached to it. */
export default function CaseView({ id }: { id: string }) {
  const api = useOpsApi();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState({ kind: 'error', ref: '', label: '' });

  const load = useCallback(() => {
    api<Data>(`/desk/${id}`).then(x => { setD(x); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api, id]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); load(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const patch = (body: Record<string, unknown>) => run(() => api(`/desk/${id}`, { method: 'PATCH', body }));
  const send = (then: ReplyThen) => run(async () => {
    await api(`/desk/${id}`, { method: 'POST', body: { action: 'message', body: text, internal, then } });
    setText('');
  });

  if (err && !d) return <><Link className="btn sm" href="/ops/desk"><ArrowLeft size={14} weight="bold" /> Service desk</Link><div className="note err" style={{ marginTop: 14 }} role="alert">{err}</div></>;
  if (!d) return <div className="card"><Skeleton h={260} /></div>;
  const c = d.case;
  const closed = c.status === 'closed';
  const catLabel = d.categories.find(x => x.key === c.category)?.label ?? c.category;

  return (
    <>
      <div style={{ marginBottom: 12 }}><Link className="btn sm" href="/ops/desk"><ArrowLeft size={14} weight="bold" /> Service desk</Link></div>
      <PageBar eyebrow={c.ref} title={c.subject}
        sub={<span className="acts" style={{ gap: 8 }}><CaseStatusChip s={c.status} /><PriorityChip p={c.priority} /><SlaChip sla={c.sla} />{c.reopened > 0 && <Chip tone="a">REOPENED {c.reopened}×</Chip>}</span>}
        actions={<Link className="btn" href={`/ops/schools/${c.schoolId}?tab=crm`}>{c.school}</Link>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}

      <div className="g2" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div>
          <Section title="Conversation" sub="The school sees replies and status changes. Internal notes are for Sthara only and never reach the school.">
            <div style={{ display: 'grid', gap: 12 }}>
              {d.messages.map(m => (
                <div key={m.id} style={{
                  padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)',
                  background: m.internal ? '#FFFBEB' : m.author_kind === 'school' ? 'var(--body)' : m.author_kind === 'system' ? 'transparent' : '#fff',
                  borderStyle: m.author_kind === 'system' ? 'dashed' : 'solid',
                }}>
                  <div className="acts" style={{ gap: 8, marginBottom: 6 }}>
                    <b style={{ fontSize: 13 }}>{m.author_kind === 'system' ? 'Status' : m.author_name ?? (m.author_kind === 'school' ? 'School' : 'Sthara')}</b>
                    {m.internal ? <Chip tone="a">INTERNAL</Chip> : m.author_kind === 'school' ? <Chip tone="b">SCHOOL</Chip> : m.author_kind === 'operator' ? <Chip tone="g">REPLY</Chip> : null}
                    <span className="muted" style={{ fontSize: 12 }}>{fmtDateTime(m.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</div>
                </div>
              ))}
              {!d.messages.length && <p className="muted" style={{ fontSize: 13.5 }}>Nothing written yet.</p>}
            </div>

            {d.can.work && (
              <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
                <div className="acts" style={{ marginBottom: 10 }}>
                  <div className="seg" role="tablist" aria-label="Message kind">
                    <button type="button" role="tab" aria-selected={!internal} className={!internal ? 'on' : ''} disabled={closed} onClick={() => setInternal(false)}>Reply to the school</button>
                    <button type="button" role="tab" aria-selected={internal} className={internal ? 'on' : ''} onClick={() => setInternal(true)}>Internal note</button>
                  </div>
                  {!internal && d.canned.length > 0 && (
                    <select className="cmp-sel" style={{ width: 'auto', maxWidth: 260 }} aria-label="Insert a canned reply" value="" onChange={e => {
                      const r = d.canned.find(x => x.id === e.target.value);
                      if (r) setText(t => (t ? `${t}\n\n${r.body}` : r.body));
                    }}>
                      <option value="">Insert a canned reply</option>
                      {d.canned.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                    </select>
                  )}
                </div>
                <textarea className="cmp-in" rows={5} maxLength={8000} aria-label={internal ? 'Internal note' : 'Reply to the school'} value={text} onChange={e => setText(e.target.value)}
                  placeholder={internal ? 'Seen by Sthara only' : closed ? 'Reopen the case to reply' : 'The school reads this in their Help and support page'}
                  style={internal ? { background: '#FFFBEB' } : undefined} disabled={closed && !internal} />
                <div className="acts" style={{ marginTop: 10 }}>
                  {internal ? <button className="btn pri" disabled={busy || !text.trim()} onClick={() => send('none')}>Add note</button> : (
                    <>
                      <button className="btn pri" disabled={busy || !text.trim() || closed} onClick={() => send('none')}>Send reply</button>
                      <button className="btn" disabled={busy || !text.trim() || closed} onClick={() => send('wait')}>Send, then wait for the school</button>
                      <button className="btn" disabled={busy || !text.trim() || closed} onClick={() => send('resolve')}>Send and resolve</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </Section>
        </div>

        <div>
          <Section title="Case">
            <Facts rows={[
              ['School', <Link key="s" href={`/ops/schools/${c.schoolId}`} style={{ color: 'var(--blue)' }}>{c.school}</Link>],
              ['Raised by', c.raisedByName ?? 'Not recorded'],
              ['Came in', SOURCES[c.source]],
              ['Raised', fmtDateTime(c.createdAt)],
            ]} />
            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              <div>
                <label className="lbl" htmlFor="k-status">STATUS</label>
                <select id="k-status" className="cmp-sel" disabled={!d.can.work || busy} value={c.status} onChange={e => patch({ status: e.target.value })}>
                  {c.status === 'new' && <option value="new">{STATUS_LABEL.new}</option>}
                  {STATUS_MOVES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="k-owner">OWNER</label>
                <select id="k-owner" className="cmp-sel" disabled={!d.can.work || busy} value={c.ownerId ?? ''} onChange={e => patch({ ownerId: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {c.ownerId && !d.owners.some(o => o.id === c.ownerId) && <option value={c.ownerId}>{c.owner}</option>}
                  {d.owners.map(o => <option key={o.id} value={o.id}>{o.name}{o.id === d.me ? ' (you)' : ''} · {roleLabel(o.role)}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="k-pri">PRIORITY</label>
                <select id="k-pri" className="cmp-sel" disabled={!d.can.work || busy} value={c.priority} onChange={e => patch({ priority: e.target.value })}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="k-cat">CATEGORY</label>
                <select id="k-cat" className="cmp-sel" disabled={!d.can.work || busy} value={c.category} onChange={e => patch({ category: e.target.value })}>
                  {!d.categories.some(x => x.key === c.category && x.active) && <option value={c.category}>{catLabel}</option>}
                  {d.categories.filter(x => x.active).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </div>
            </div>
          </Section>

          <Section title="Deadlines" sub="Calendar time from when the case was raised. Changing the priority moves them.">
            <Facts rows={[
              ['First reply', c.firstRespondedAt ? <>{fmtDateTime(c.firstRespondedAt)} {c.firstRespondedAt > c.firstResponseDue ? <Chip tone="r">LATE</Chip> : <Chip tone="g">ON TIME</Chip>}</> : <>Due {fmtDateTime(c.firstResponseDue)}</>],
              ['Resolution', c.resolvedAt ? <>{fmtDateTime(c.resolvedAt)} {c.resolvedAt > c.resolveDue ? <Chip tone="r">LATE</Chip> : <Chip tone="g">ON TIME</Chip>}</> : <>Due {fmtDateTime(c.resolveDue)}</>],
              ...(c.sla.minutesLeft !== null ? [['Now', `${c.sla.stage === 'first_response' ? 'First reply' : 'Resolution'} ${dueText(c.sla.minutesLeft)}`] as [string, string]] : []),
            ]} />
          </Section>

          <Section title="Attached" sub="Errors, records and audit entries that belong to this case.">
            {d.links.map(l => (
              <div key={l.id} className="acts" style={{ marginBottom: 8, gap: 8 }}>
                <Chip tone="n">{l.kind.toUpperCase()}</Chip>
                {l.kind === 'url' ? <a href={l.ref} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', overflowWrap: 'anywhere', fontSize: 13 }}>{l.label || l.ref}</a>
                  : l.kind === 'error' ? <Link href="/ops/errors" className="mono" style={{ color: 'var(--blue)', fontSize: 12.5, overflowWrap: 'anywhere' }}>{l.label || l.ref}</Link>
                  : <span className="mono" style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{l.ref}{l.label ? ` · ${l.label}` : ''}</span>}
                {d.can.work && <button className="btn sm" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => run(() => api(`/desk/${id}`, { method: 'POST', body: { action: 'unlink', linkId: l.id } }))}>Remove</button>}
              </div>
            ))}
            {!d.links.length && <p className="muted" style={{ fontSize: 13.5 }}>Nothing attached.</p>}
            {d.can.work && (
              <form style={{ display: 'grid', gap: 8, marginTop: 12 }} onSubmit={e => { e.preventDefault(); void run(async () => { await api(`/desk/${id}`, { method: 'POST', body: { action: 'link', ...link } }); setLink({ kind: link.kind, ref: '', label: '' }); }); }}>
                <select className="cmp-sel" aria-label="What to attach" value={link.kind} onChange={e => setLink(l => ({ ...l, kind: e.target.value }))}>
                  {Object.entries(LINK_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input className="cmp-in" aria-label="Reference" placeholder={link.kind === 'url' ? 'https://…' : link.kind === 'record' ? 'fee_invoices/3f2a…' : 'Paste the reference'} maxLength={400} value={link.ref} onChange={e => setLink(l => ({ ...l, ref: e.target.value }))} />
                <button className="btn sm" disabled={busy || !link.ref.trim()}>Attach</button>
              </form>
            )}
          </Section>

          <Section title="Access to the school's records" sub={`Windows opened with ${c.ref} as their case.`}>
            {d.windows.map(w => <div key={w.id} style={{ fontSize: 13, marginBottom: 8 }}><b>{w.operator_email}</b> · {fmtDateTime(w.started_at)}<div className="muted">{w.reason}</div></div>)}
            {!d.windows.length && <p className="muted" style={{ fontSize: 13.5 }}>None.</p>}
            {d.can.breakglass && <Link className="btn sm" style={{ marginTop: 8, display: 'inline-flex' }} href={`/ops/schools/${c.schoolId}?tab=account`}>Open a window (quote {c.ref})</Link>}
          </Section>

          {d.otherCases.length > 0 && (
            <Section title="This school's other cases">
              {d.otherCases.map(o => (
                <div key={o.id} style={{ marginBottom: 8, fontSize: 13 }}>
                  <Link href={`/ops/desk/${o.id}`} style={{ color: 'var(--blue)' }}><span className="mono">{o.ref}</span> {o.subject}</Link>
                  <div className="muted">{STATUS_LABEL[o.status]} · {fmtDateTime(o.created_at)}</div>
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
