'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { Chip, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { POWERED_BY_FALLBACK_HEAD, POWERED_BY_PAGE_CSS } from '@/components/schedule/print';
import { roleLabel, type OperatorRole } from '@/lib/ops/roles';
import { OPP_KINDS, QUOTE_PLANS, QUOTE_STATUS, approvalNeeded, quoteMath, type DiscountLimits, type OppKind, type QuoteMath, type QuotePlan, type QuoteStatus, type Stage } from '@/lib/ops/sales';
import { INDIAN_STATES } from '@/lib/ops/territories';
import { PLAN_INFO, REASON_MIN, type Plan } from '@/lib/settings/registry';
import { Facts, ReasonAction, Section, errText, fmtDate, fmtDateTime, inr, num } from '../../_ui';
import { useOperator } from '../../OpsShell';
import { useOpsApi } from '../../useOpsApi';

interface Opp {
  id: string; ref: string; name: string; kind: OppKind; stage: string; stageKind: Stage['kind']; probability: number; amount: number; plan: Plan | null; students: number | null;
  pricePerStudent: number | null; expectedClose: string | null; nextStep: string | null; contactName: string | null; contactPhone: string | null; contactEmail: string | null;
  state: string | null; district: string | null; territory: string | null; ownerId: string | null; owner: string | null; schoolId: string | null; school: string | null; schoolPlan: string | null;
  enquiryId: string | null; lossReason: string | null; closedNote: string | null; closedAt: string | null; createdAt: string; daysInStage: number;
}
interface Quote extends QuoteMath {
  id: string; ref: string; version: number; plan: QuotePlan; students: number; pricePerStudent: number; termMonths: number; validUntil: string; notes: string | null;
  status: QuoteStatus; needsRole: string | null; createdByName: string | null; createdAt: string; moves: string[]; wouldNeed: string | null; canDecide: boolean;
  approvals: { decision: string; by_name: string | null; by_role: string | null; note: string | null; at: string }[];
}
interface Data {
  opp: Opp; enquiry: { school: string; message: string; student_count: number | null; board: string | null; created_at: string } | null;
  stages: Stage[]; events: { id: number; at: string; kind: string; body: string | null; from: string | null; to: string | null; by_name: string | null }[];
  quotes: Quote[]; tasks: { id: string; title: string; due_on: string | null; status: string; owner: string | null }[];
  lossReasons: { key: string; label: string; active: boolean }[]; limits: DiscountLimits; myLimit: number | null;
  owners: { id: string; name: string; role: OperatorRole }[]; schools: { id: string; name: string }[];
  can: { work: boolean; assign: boolean; policy: boolean; createSchool: boolean }; me: string; today: string;
}
const QUOTE_TONE: Record<QuoteStatus, Tone> = { draft: 'n', pending_approval: 'a', approved: 'b', rejected: 'r', sent: 'p', accepted: 'g', declined: 'r', expired: 'n' };
const EVENT: Record<string, string> = { created: 'Created', stage: 'Stage', note: 'Note', call: 'Call', meeting: 'Meeting', email: 'Email', whatsapp: 'WhatsApp', visit: 'Visit', quote: 'Quote', approval: 'Approval', owner: 'Owner', change: 'Change' };
const MOVE: Record<string, string> = { submit: 'Submit', send: 'Mark as sent', accept: 'School accepted', decline: 'School declined', revise: 'New version' };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function printQuote(o: Opp, q: Quote) {
  const w = window.open('', '_blank', 'width=820,height=980');
  if (!w) return;
  const row = (a: string, b: string, strong = false) => `<tr><td>${a}</td><td class="r">${strong ? `<b>${b}</b>` : b}</td></tr>`;
  w.document.write(`<!doctype html><html><head><title>Quotation ${esc(q.ref)}</title><style>
    body{font-family:system-ui,sans-serif;color:#002147;padding:40px;font-size:13.5px;max-width:720px;margin:0 auto;line-height:1.5}
    h1{font-size:24px;margin:0} .m{color:#64748B} .top{display:flex;justify-content:space-between;gap:24px;margin-bottom:28px}
    table{width:100%;border-collapse:collapse;margin:18px 0} td{padding:9px 8px;border-bottom:1px solid #E2E8F0} .r{text-align:right}
    tr.t td{border-top:2px solid #002147;border-bottom:0;font-size:15px} .note{white-space:pre-wrap;margin-top:18px}
    .fine{color:#64748B;font-size:12px;margin-top:28px} @page{${POWERED_BY_PAGE_CSS}}
  </style>${POWERED_BY_FALLBACK_HEAD}</head><body>
  <div class="top"><div><h1>Sthara</h1><div class="m">The Institutional OS for schools</div></div>
    <div class="r"><b>Quotation ${esc(q.ref)}</b><br><span class="m">Dated ${fmtDate(q.createdAt)}<br>Valid until ${fmtDate(q.validUntil)}</span></div></div>
  <div><span class="m">For</span><br><b style="font-size:16px">${esc(o.school ?? o.name)}</b>${o.contactName ? `<br>${esc(o.contactName)}` : ''}${[o.district, o.state].filter(Boolean).length ? `<br><span class="m">${esc([o.district, o.state].filter(Boolean).join(', '))}</span>` : ''}</div>
  <table>
    ${row('Tier', esc(PLAN_INFO[q.plan].label))}
    ${row('Students', q.students.toLocaleString('en-IN'))}
    ${q.listPrice && q.discountPct ? row('List price per student, per year', inr(q.listPrice, true)) : ''}
    ${row(`Price per student, per year${q.discountPct ? ` (${q.discountPct}% off list)` : ''}`, inr(q.pricePerStudent, true))}
    ${row('Annual fee', inr(q.annual, true))}
    ${row(`Term`, `${q.termMonths} months`)}
    ${row('Fee for the term', inr(q.subtotal, true))}
    ${row('GST at 18%', inr(q.gst, true))}
    <tr class="t"><td><b>Total payable</b></td><td class="r"><b>${inr(q.total, true)}</b></td></tr>
  </table>
  ${q.notes ? `<div class="note"><b>Terms</b><br>${esc(q.notes)}</div>` : ''}
  <div class="fine">Prices are in Indian rupees. Seats are counted as students on the roll during the term. This quotation is not a tax invoice.</div>
  <script>window.print()</script></body></html>`);
  w.document.close();
}

/** Platform Manager > Pipeline > one deal: where it stands, what it is worth, its quotes and everything that has happened. */
export default function OpportunityView({ id }: { id: string }) {
  const api = useOpsApi();
  const { role } = useOperator();
  const params = useSearchParams();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 'asked' until the person acts: the board can send a deal here to be marked won or lost.
  const [closingState, setClosing] = useState<'won' | 'lost' | null | 'asked'>('asked');
  const [log, setLog] = useState({ kind: 'note', body: '' });
  const [task, setTask] = useState({ title: '', dueOn: '' });

  const load = useCallback(() => {
    api<Data>(`/pipeline/${id}`).then(x => { setD(x); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api, id]);
  useEffect(() => { load(); }, [load]);
  const askedKind = d?.stages.find(s => s.key === params.get('close'))?.kind;
  const closing = closingState === 'asked' ? (askedKind === 'won' || askedKind === 'lost' ? askedKind : null) : closingState;

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true); setErr(null); setNotice(null);
    try { await fn(); if (done) setNotice(done); load(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const patch = (body: Record<string, unknown>, done?: string) => run(() => api(`/pipeline/${id}`, { method: 'PATCH', body }), done);
  const post = (body: Record<string, unknown>, done?: string) => run(() => api(`/pipeline/${id}`, { method: 'POST', body }), done);

  if (err && !d) return <><Link className="btn sm" href="/ops/pipeline"><ArrowLeft size={14} weight="bold" /> Pipeline</Link><div className="note err" style={{ marginTop: 14 }} role="alert">{err}</div></>;
  if (!d) return <div className="card"><Skeleton h={280} /></div>;
  const o = d.opp;
  const open = o.stageKind === 'open';
  const stageNow = d.stages.find(s => s.key === o.stage);
  const openStages = d.stages.filter(s => s.kind === 'open' && (s.active || s.key === o.stage));
  const wonStage = d.stages.find(s => s.kind === 'won'), lostStage = d.stages.find(s => s.kind === 'lost');
  const accepted = d.quotes.find(q => q.status === 'accepted');
  const reasonLabel = d.lossReasons.find(r => r.key === o.lossReason)?.label ?? o.lossReason;

  return (
    <>
      <div style={{ marginBottom: 12 }}><Link className="btn sm" href="/ops/pipeline"><ArrowLeft size={14} weight="bold" /> Pipeline</Link></div>
      <PageBar eyebrow={`${o.ref} · ${OPP_KINDS[o.kind].toUpperCase()}`} title={o.name}
        sub={<span className="acts" style={{ gap: 8 }}>
          <Chip tone={o.stageKind === 'won' ? 'g' : o.stageKind === 'lost' ? 'r' : 'b'}>{(stageNow?.label ?? o.stage).toUpperCase()}</Chip>
          <b>{o.amount ? `${inr(o.amount)} a year` : 'No value yet'}</b>
          {open && <span className="muted">{o.probability}% chance · {o.daysInStage} day{o.daysInStage === 1 ? '' : 's'} in this stage</span>}
        </span>}
        actions={o.schoolId ? <Link className="btn" href={`/ops/schools/${o.schoolId}?tab=crm`}>{o.school}</Link> : undefined} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {notice && <div className="note info" style={{ marginBottom: 18 }} role="status">{notice}</div>}

      <div className="ops-path" role="group" aria-label="Stage">
        {openStages.map(s => {
          const state = !open ? 'done' : s.key === o.stage ? 'now' : (stageNow && s.sort < stageNow.sort) ? 'done' : 'todo';
          return <button key={s.key} data-state={state} disabled={!d.can.work || busy || s.key === o.stage || !open} onClick={() => patch({ stage: s.key })} title={`${s.probability}% chance`}>{s.label}</button>;
        })}
        {wonStage && <button data-state={o.stageKind === 'won' ? 'won' : 'todo'} disabled={!d.can.work || busy || !open} onClick={() => setClosing('won')}>{wonStage.label}</button>}
        {lostStage && <button data-state={o.stageKind === 'lost' ? 'lost' : 'todo'} disabled={!d.can.work || busy || !open} onClick={() => setClosing('lost')}>{lostStage.label}</button>}
      </div>

      {closing && open && <CloseForm kind={closing} d={d} hasAccepted={!!accepted} busy={busy} onCancel={() => setClosing(null)}
        onClose={(body) => { void patch({ stage: closing === 'won' ? wonStage!.key : lostStage!.key, ...body }, closing === 'won' ? 'Marked won.' : 'Marked lost.').then(() => setClosing(null)); }} />}

      {!open && (
        <div className={`note ${o.stageKind === 'won' ? 'info' : ''}`} style={{ marginBottom: 18 }}>
          <b>{o.stageKind === 'won' ? 'Won' : 'Lost'} on {fmtDate(o.closedAt)}.</b>{o.stageKind === 'lost' && reasonLabel ? ` Reason: ${reasonLabel}.` : ''}{o.closedNote ? ` ${o.closedNote}` : ''}
          {d.can.work && openStages.length > 0 && <button className="btn sm" style={{ marginLeft: 10 }} disabled={busy} onClick={() => patch({ stage: openStages[openStages.length - 1].key }, 'Reopened.')}>Reopen</button>}
          {o.stageKind === 'won' && <WonNext d={d} accepted={accepted} onApplied={msg => { setNotice(msg); load(); }} onError={setErr} />}
        </div>
      )}

      <div className="g2" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div>
          <Section title="Quotes" sub={d.myLimit === null ? 'Each new version replaces the last; an accepted quote sets the deal’s value.' : `You can give up to ${d.myLimit}% off list on your own word. More than that goes for approval.`}>
            {d.quotes.map(q => <QuoteCard key={q.id} q={q} o={o} busy={busy} post={post} />)}
            {!d.quotes.length && <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>No quote yet.</p>}
            {d.can.work && open && <QuoteForm key={d.quotes.length} d={d} role={role} busy={busy} create={body => post({ action: 'quote', ...body }, 'Quote drafted. Submit it when it is right.')} />}
          </Section>

          <Section title="History" sub="Stage moves, quotes and approvals are recorded on their own. Log calls, meetings and notes here.">
            {d.can.work && (
              <form className="ops-reason" style={{ marginBottom: 16, minWidth: 0 }} onSubmit={e => { e.preventDefault(); void post({ action: 'log', ...log }).then(() => setLog(l => ({ ...l, body: '' }))); }}>
                <div className="acts">
                  <select className="cmp-sel" style={{ width: 'auto' }} aria-label="What happened" value={log.kind} onChange={e => setLog(l => ({ ...l, kind: e.target.value }))}>
                    {['note', 'call', 'meeting', 'email', 'whatsapp', 'visit'].map(k => <option key={k} value={k}>{EVENT[k]}</option>)}
                  </select>
                  <input className="cmp-in" style={{ flex: '1 1 260px', width: 'auto' }} aria-label="What was said or agreed" placeholder="What was said or agreed" maxLength={6000} value={log.body} onChange={e => setLog(l => ({ ...l, body: e.target.value }))} />
                  <button className="btn sm pri" disabled={busy || !log.body.trim()}>Log it</button>
                </div>
              </form>
            )}
            <div style={{ display: 'grid', gap: 12 }}>
              {d.events.map(e => (
                <div key={e.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 92, flexShrink: 0 }}><Chip tone={e.kind === 'stage' ? 'b' : e.kind === 'quote' ? 'p' : e.kind === 'approval' ? 'a' : 'n'}>{(EVENT[e.kind] ?? e.kind).toUpperCase()}</Chip></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {e.kind === 'stage' ? <><b>{e.from ?? 'Start'}</b> to <b>{e.to}</b>{e.body ? `: ${e.body}` : ''}</> : e.kind === 'created' ? <>Deal opened at <b>{e.to}</b>.{e.body ? ` ${e.body}` : ''}</> : e.body}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>{fmtDateTime(e.at)}{e.by_name ? ` · ${e.by_name}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div>
          <Section title="Deal">
            <DealForm key={`${o.stage}|${o.amount}|${o.expectedClose}|${o.ownerId}|${o.nextStep}`} d={d} busy={busy} save={body => patch(body, 'Saved.')} />
          </Section>

          <Section title="Follow-ups" sub="Also on the Follow-ups page.">
            {d.tasks.map(t => <div key={t.id} style={{ fontSize: 13.5, marginBottom: 8, opacity: t.status === 'open' ? 1 : .55 }}><b>{t.title}</b><div className="muted" style={{ fontSize: 12 }}>{t.due_on ? `Due ${fmtDate(t.due_on)}` : 'No date'} · {t.owner ?? 'nobody'}{t.status !== 'open' ? ` · ${t.status}` : ''}</div></div>)}
            {!d.tasks.length && <p className="muted" style={{ fontSize: 13.5 }}>None.</p>}
            {d.can.work && (
              <form style={{ display: 'grid', gap: 8, marginTop: 10 }} onSubmit={e => { e.preventDefault(); void post({ action: 'task', ...task }).then(() => setTask({ title: '', dueOn: '' })); }}>
                <input className="cmp-in" aria-label="What needs doing" placeholder="What needs doing" maxLength={200} value={task.title} onChange={e => setTask(t => ({ ...t, title: e.target.value }))} />
                <div className="acts"><input className="cmp-in" type="date" style={{ width: 'auto' }} aria-label="Due" value={task.dueOn} onChange={e => setTask(t => ({ ...t, dueOn: e.target.value }))} /><button className="btn sm" disabled={busy || task.title.trim().length < 2}>Add</button></div>
              </form>
            )}
          </Section>

          {d.enquiry && (
            <Section title="From the website enquiry" sub={fmtDate(d.enquiry.created_at)}>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{d.enquiry.message}</p>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{[d.enquiry.student_count ? `${num(d.enquiry.student_count)} students` : null, d.enquiry.board?.toUpperCase()].filter(Boolean).join(' · ')}</p>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

function CloseForm({ kind, d, hasAccepted, busy, onCancel, onClose }: { kind: 'won' | 'lost'; d: Data; hasAccepted: boolean; busy: boolean; onCancel: () => void; onClose: (body: Record<string, unknown>) => void }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="card" style={{ marginBottom: 18, borderColor: kind === 'won' ? '#047857' : 'var(--red)' }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>{kind === 'won' ? 'Mark this deal won' : 'Mark this deal lost'}</h2>
      {kind === 'won' && !hasAccepted && <div className="note" style={{ marginBottom: 12 }}>No quote on this deal is marked accepted. It will be won at the value on the deal: {d.opp.amount ? `${inr(d.opp.amount)} a year` : 'nothing yet (set tier, students and price first)'}.</div>}
      <div className="g2">
        {kind === 'lost' && (
          <div>
            <label className="lbl" htmlFor="x-reason">WHY IT WAS LOST</label>
            <select id="x-reason" className="cmp-sel" value={reason} onChange={e => setReason(e.target.value)}>
              <option value="">Pick a reason</option>
              {d.lossReasons.filter(r => r.active).map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="lbl" htmlFor="x-note">{kind === 'won' ? 'WHAT WON IT (OPTIONAL)' : 'WHAT HAPPENED (OPTIONAL)'}</label>
          <input id="x-note" className="cmp-in" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />
        </div>
      </div>
      <div className="acts" style={{ marginTop: 14 }}>
        <button className={`btn ${kind === 'won' ? 'pri' : 'red'}`} disabled={busy || (kind === 'lost' && !reason)} onClick={() => onClose({ lossReason: reason || undefined, closedNote: note })}>{kind === 'won' ? 'Mark won' : 'Mark lost'}</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** After a win: put the agreed terms on the school's subscription, or create the school. */
function WonNext({ d, accepted, onApplied, onError }: { d: Data; accepted: Quote | undefined; onApplied: (msg: string) => void; onError: (m: string) => void }) {
  const api = useOpsApi();
  const o = d.opp;
  const plan = accepted?.plan ?? (o.plan && o.plan !== 'pilot' ? o.plan : null), students = accepted?.students ?? o.students, price = accepted?.pricePerStudent ?? o.pricePerStudent;
  if (!o.schoolId) {
    return d.can.createSchool ? (
      <div style={{ marginTop: 10 }}>
        <Link className="btn sm pri" href={`/ops/schools?new=1${o.enquiryId ? `&enquiry=${o.enquiryId}` : ''}&name=${encodeURIComponent(o.name)}&state=${encodeURIComponent(o.state ?? '')}&district=${encodeURIComponent(o.district ?? '')}`}>Create the school</Link>
        <span className="muted" style={{ fontSize: 12.5, marginLeft: 10 }}>Then come back and pick it as this deal&apos;s school (Deal &gt; Change).</span>
      </div>
    ) : null;
  }
  if (!d.can.policy || !plan || !students || !price) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <ReasonAction label={`Put these terms on ${o.school}'s subscription`} confirm="Apply to the school"
        placeholder={`Reason, e.g. ${o.ref} won`}
        run={async reason => {
          try {
            await api(`/schools/${o.schoolId}/settings`, { method: 'PATCH', body: { changes: { plan, contractStudents: students, pricePerStudent: price }, reason: reason.length >= REASON_MIN ? reason : `${o.ref} won` } });
            onApplied(`${o.school} is now on ${PLAN_INFO[plan].label}: ${num(students)} students at ${inr(price, true)}.`);
          } catch (e) { onError(errText(e)); throw e; }
        }} />
      <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{PLAN_INFO[plan].label}, {num(students)} students at {inr(price, true)} a year{o.schoolPlan ? ` (the school is on ${o.schoolPlan} now)` : ''}.</div>
    </div>
  );
}

function QuoteCard({ q, o, busy, post }: { q: Quote; o: Opp; busy: boolean; post: (body: Record<string, unknown>, done?: string) => Promise<void> }) {
  const [refusing, setRefusing] = useState(false);
  const [note, setNote] = useState('');
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 14, marginBottom: 12, opacity: ['expired', 'declined', 'rejected'].includes(q.status) ? .7 : 1 }}>
      <div className="acts" style={{ gap: 8 }}>
        <b className="mono" style={{ fontSize: 13 }}>{q.ref}</b><Chip tone={QUOTE_TONE[q.status]}>{QUOTE_STATUS[q.status].toUpperCase()}</Chip>
        {q.status === 'pending_approval' && <span className="muted" style={{ fontSize: 12.5 }}>needs a {q.needsRole === 'director' ? 'director' : 'regional lead'}</span>}
        <span className="muted" style={{ fontSize: 12.5, marginLeft: 'auto' }}>{q.createdByName} · {fmtDate(q.createdAt)} · valid to {fmtDate(q.validUntil)}</span>
      </div>
      <Facts rows={[
        ['Offer', `${PLAN_INFO[q.plan].label} · ${num(q.students)} students`],
        ['Price per student', <>{inr(q.pricePerStudent, true)}{q.listPrice ? <span className="muted"> · list {inr(q.listPrice, true)}</span> : <span className="muted"> · custom price</span>}</>],
        ['Off list', q.listPrice ? <b style={{ color: q.discountPct ? '#B45309' : undefined }}>{q.discountPct}%</b> : '—'],
        [`${q.termMonths} months`, <>{inr(q.subtotal, true)} <span className="muted">+ GST {inr(q.gst, true)} = </span><b>{inr(q.total, true)}</b></>],
      ]} />
      {q.notes && <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 10 }}>{q.notes}</p>}
      {q.approvals.length > 0 && (
        <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          {q.approvals.map((a, i) => <div key={i}>{a.decision === 'requested' ? 'Sent for approval' : a.decision === 'approved' ? 'Approved' : 'Refused'} by {a.by_name ?? 'someone'}{a.by_role ? ` (${roleLabel(a.by_role)})` : ''} on {fmtDate(a.at)}{a.note ? `: ${a.note}` : ''}</div>)}
        </div>
      )}
      <div className="acts" style={{ marginTop: 12 }}>
        {q.moves.includes('submit') && <button className="btn sm pri" disabled={busy} onClick={() => post({ action: 'quote-submit', quoteId: q.id }, q.wouldNeed ? `Sent to a ${q.wouldNeed === 'director' ? 'director' : 'regional lead'} for approval.` : 'Approved: within your limit.')}>
          {q.wouldNeed ? `Submit for ${q.wouldNeed === 'director' ? 'director' : 'regional lead'} approval` : 'Submit (within your limit)'}</button>}
        {q.moves.filter(m => m !== 'submit').map(m => <button key={m} className={`btn sm${m === 'accept' ? ' pri' : ''}`} disabled={busy} onClick={() => post({ action: 'quote-move', quoteId: q.id, move: m }, m === 'accept' ? 'Accepted: the deal now carries these terms.' : m === 'revise' ? 'New draft made from this quote.' : undefined)}>{MOVE[m]}</button>)}
        {q.canDecide && !refusing && <>
          <button className="btn sm pri" disabled={busy} onClick={() => post({ action: 'quote-decide', quoteId: q.id, approve: true }, 'Approved.')}>Approve</button>
          <button className="btn sm red" disabled={busy} onClick={() => setRefusing(true)}>Refuse</button>
        </>}
        {['approved', 'sent', 'accepted'].includes(q.status) && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => printQuote(o, q)}><Printer size={14} weight="bold" /> Print</button>}
      </div>
      {refusing && (
        <div className="acts" style={{ marginTop: 10 }}>
          <input className="cmp-in" style={{ flex: '1 1 240px', width: 'auto' }} aria-label="Why" placeholder="Why (the writer sees this)" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />
          <button className="btn sm red" disabled={busy || !note.trim()} onClick={() => { void post({ action: 'quote-decide', quoteId: q.id, approve: false, note }, 'Refused.').then(() => setRefusing(false)); }}>Confirm refusal</button>
          <button className="btn sm" onClick={() => setRefusing(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function QuoteForm({ d, role, busy, create }: { d: Data; role: OperatorRole; busy: boolean; create: (body: Record<string, unknown>) => Promise<void> }) {
  const o = d.opp;
  const last = d.quotes[0];
  const [open, setOpen] = useState(false);
  const startPlan: QuotePlan = (last?.plan ?? (o.plan && o.plan !== 'pilot' ? o.plan : 'shikhara')) as QuotePlan;
  const [f, setF] = useState({
    plan: startPlan, students: String(last?.students ?? o.students ?? ''), pricePerStudent: String(last?.pricePerStudent ?? o.pricePerStudent ?? PLAN_INFO[startPlan].price ?? ''),
    termMonths: String(last?.termMonths ?? 12), validUntil: new Date(Date.parse(`${d.today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10), notes: last?.notes ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  if (!open) return <button className="btn sm pri" onClick={() => setOpen(true)}>{last ? 'New quote version' : 'Write a quote'}</button>;
  const students = Number(f.students), price = Number(f.pricePerStudent), term = Number(f.termMonths);
  const m = students > 0 && price > 0 ? quoteMath(f.plan, students, price, term || 12) : null;
  const needs = m ? approvalNeeded(d.limits, role, f.plan, m.discountPct) : null;
  return (
    <form className="ops-reason" style={{ minWidth: 0 }} onSubmit={e => { e.preventDefault(); void create({ ...f, students, pricePerStudent: price, termMonths: term }).then(() => setOpen(false)); }}>
      <div className="g3">
        <div><label className="lbl" htmlFor="q-plan">TIER</label>
          <select id="q-plan" className="cmp-sel" value={f.plan} onChange={e => { const p = e.target.value as QuotePlan; setF(x => ({ ...x, plan: p, pricePerStudent: String(PLAN_INFO[p].price ?? x.pricePerStudent) })); }}>
            {QUOTE_PLANS.map(p => <option key={p} value={p}>{PLAN_INFO[p].label}{PLAN_INFO[p].price ? ` (list ${PLAN_INFO[p].price})` : ' (custom)'}</option>)}
          </select></div>
        <div><label className="lbl" htmlFor="q-students">STUDENTS</label><input id="q-students" type="number" min={1} className="cmp-in" required value={f.students} onChange={e => set('students', e.target.value)} /></div>
        <div><label className="lbl" htmlFor="q-price">PRICE / STUDENT / YEAR</label><input id="q-price" type="number" min={1} step="0.01" className="cmp-in" required value={f.pricePerStudent} onChange={e => set('pricePerStudent', e.target.value)} /></div>
        <div><label className="lbl" htmlFor="q-term">TERM (MONTHS)</label><input id="q-term" type="number" min={1} max={60} className="cmp-in" value={f.termMonths} onChange={e => set('termMonths', e.target.value)} /></div>
        <div><label className="lbl" htmlFor="q-valid">VALID UNTIL</label><input id="q-valid" type="date" className="cmp-in" min={d.today} value={f.validUntil} onChange={e => set('validUntil', e.target.value)} /></div>
      </div>
      <textarea className="cmp-in" rows={2} aria-label="Terms" placeholder="Terms (optional): payment schedule, pilot credit, what is included" maxLength={3000} value={f.notes} onChange={e => set('notes', e.target.value)} />
      {m && (
        <div className="note info">
          {inr(m.subtotal, true)} for {term || 12} months + GST {inr(m.gst, true)} = <b>{inr(m.total, true)}</b>.
          {m.listPrice ? <> That is <b>{m.discountPct}% off list</b>.</> : <> This tier has no list price.</>}{' '}
          {needs ? <b>It will need a {needs === 'director' ? 'director' : 'regional lead'} to approve.</b> : 'You can approve it yourself.'}
        </div>
      )}
      <div className="acts"><button className="btn sm pri" disabled={busy || !m}>Save draft</button><button type="button" className="btn sm" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}

function DealForm({ d, busy, save }: { d: Data; busy: boolean; save: (body: Record<string, unknown>) => Promise<void> }) {
  const o = d.opp;
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({
    name: o.name, plan: o.plan ?? '', students: String(o.students ?? ''), pricePerStudent: String(o.pricePerStudent ?? ''), expectedClose: o.expectedClose ?? '', nextStep: o.nextStep ?? '',
    contactName: o.contactName ?? '', contactPhone: o.contactPhone ?? '', contactEmail: o.contactEmail ?? '', state: o.state ?? '', district: o.district ?? '', ownerId: o.ownerId ?? '',
    schoolId: o.schoolId ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  if (!edit) {
    return (
      <>
        <Facts rows={[
          ['Value', o.amount ? `${inr(o.amount, true)} a year` : 'Not set'],
          ['Offer', o.plan ? `${PLAN_INFO[o.plan].label}${o.students ? ` · ${num(o.students)} students` : ''}${o.pricePerStudent ? ` at ${inr(o.pricePerStudent, true)}` : ''}` : 'Not set'],
          ['Expected close', o.expectedClose ? <span style={o.stageKind === 'open' && o.expectedClose < d.today ? { color: 'var(--red)' } : undefined}>{fmtDate(o.expectedClose)}</span> : 'Not set'],
          ['Next step', o.nextStep ?? 'Not set'],
          ['Owner', o.owner ?? 'Nobody'],
          ['Territory', o.territory ?? ([o.district, o.state].filter(Boolean).join(', ') || 'Not placed')],
          ['Contact', [o.contactName, o.contactPhone, o.contactEmail].filter(Boolean).join(' · ') || 'Not set'],
          ['School on Sthara', o.school ?? 'Not yet'],
        ]} />
        {d.can.work && <button className="btn sm" style={{ marginTop: 14 }} onClick={() => setEdit(true)}>Change</button>}
      </>
    );
  }
  return (
    <form style={{ display: 'grid', gap: 10 }} onSubmit={e => {
      e.preventDefault();
      void save({
        name: f.name, plan: f.plan || null, students: f.students || null, pricePerStudent: f.pricePerStudent || null, expectedClose: f.expectedClose || null, nextStep: f.nextStep,
        contactName: f.contactName, contactPhone: f.contactPhone, contactEmail: f.contactEmail,
        ...(f.state !== (o.state ?? '') || f.district !== (o.district ?? '') ? { state: f.state || null, district: f.district || null } : {}),
        ...(f.ownerId !== (o.ownerId ?? '') ? { ownerId: f.ownerId || null } : {}),
        ...(f.schoolId !== (o.schoolId ?? '') ? { schoolId: f.schoolId || null } : {}),
      }).then(() => setEdit(false));
    }}>
      <input className="cmp-in" aria-label="Name" required minLength={2} maxLength={160} value={f.name} onChange={e => set('name', e.target.value)} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <select className="cmp-sel" aria-label="Tier" value={f.plan} onChange={e => set('plan', e.target.value)}>
          <option value="">Tier</option>
          {QUOTE_PLANS.map(p => <option key={p} value={p}>{PLAN_INFO[p].label}</option>)}
        </select>
        <input className="cmp-in" type="number" min={1} aria-label="Students" placeholder="Students" value={f.students} onChange={e => set('students', e.target.value)} />
        <input className="cmp-in" type="number" min={1} step="0.01" aria-label="Price per student" placeholder="Price" value={f.pricePerStudent} onChange={e => set('pricePerStudent', e.target.value)} />
      </div>
      <label className="muted" style={{ fontSize: 12.5 }}>Expected close <input className="cmp-in" type="date" value={f.expectedClose} onChange={e => set('expectedClose', e.target.value)} /></label>
      <input className="cmp-in" aria-label="Next step" placeholder="Next step" maxLength={300} value={f.nextStep} onChange={e => set('nextStep', e.target.value)} />
      <select className="cmp-sel" aria-label="Owner" value={f.ownerId} disabled={!d.can.assign} onChange={e => set('ownerId', e.target.value)}>
        <option value="">The territory&apos;s default owner</option>
        {o.ownerId && !d.owners.some(x => x.id === o.ownerId) && <option value={o.ownerId}>{o.owner}</option>}
        {d.owners.map(x => <option key={x.id} value={x.id}>{x.name} ({roleLabel(x.role)})</option>)}
      </select>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <select className="cmp-sel" aria-label="State" value={f.state} onChange={e => set('state', e.target.value)}>
          <option value="">State not set</option>
          {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
        </select>
        <input className="cmp-in" aria-label="District" placeholder="District" maxLength={80} disabled={!f.state} value={f.district} onChange={e => set('district', e.target.value)} />
      </div>
      <input className="cmp-in" aria-label="Contact name" placeholder="Contact name" maxLength={120} value={f.contactName} onChange={e => set('contactName', e.target.value)} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input className="cmp-in" aria-label="Contact phone" placeholder="Phone" maxLength={30} value={f.contactPhone} onChange={e => set('contactPhone', e.target.value)} />
        <input className="cmp-in" type="email" aria-label="Contact email" placeholder="Email" maxLength={200} value={f.contactEmail} onChange={e => set('contactEmail', e.target.value)} />
      </div>
      <select className="cmp-sel" aria-label="School on Sthara" value={f.schoolId} onChange={e => set('schoolId', e.target.value)}>
        <option value="">Not on Sthara yet</option>
        {d.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <div className="acts"><button className="btn sm pri" disabled={busy}>Save</button><button type="button" className="btn sm" onClick={() => setEdit(false)}>Cancel</button></div>
    </form>
  );
}
