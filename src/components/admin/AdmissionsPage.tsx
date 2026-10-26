'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserPlusIcon as UserPlus } from '@phosphor-icons/react/dist/ssr/UserPlus';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { HourglassIcon as Hourglass } from '@phosphor-icons/react/dist/ssr/Hourglass';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { ArrowUpIcon as ArrowUp } from '@phosphor-icons/react/dist/ssr/ArrowUp';
import { ArrowDownIcon as ArrowDown } from '@phosphor-icons/react/dist/ssr/ArrowDown';
import { ArmchairIcon as Armchair } from '@phosphor-icons/react/dist/ssr/Armchair';
import { SealCheckIcon as SealCheck } from '@phosphor-icons/react/dist/ssr/SealCheck';
import { GearSixIcon as GearSix } from '@phosphor-icons/react/dist/ssr/GearSix';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { Pager, usePaged } from '@/components/canon/Pager';
import { Bar, Chip, Empty, PageBar, type Tone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import {
  activeStages, isClosed, nextStage, OFFER_LABEL, SOURCES, STALE_DAYS, stageName,
  type Applicant, type Offer, type OfferStatus, type Pipeline, type StageDef,
} from '@/lib/admin/admissions';
import type { AdminDesk } from '@/lib/admin/desk';
import { ago, fmtDate, gradeOf, isoDay, plural } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { CardHead, DeskGate, Field, Kpi, MissingNotice, Workspace, downloadCsv } from './kit';
import { FinanceTabs } from './fees/FeesPage';

const OFFER_TONE: Record<OfferStatus, Tone> = {
  proposed: 'a', returned: 'r', waitlisted: 'p', issued: 'a', accepted: 'g', declined: 'n', lapsed: 'n', withdrawn: 'n', enrolled: 'g',
};
type View = string; // a stage key, or 'open' | 'all' | 'approval' | 'waitlist' | 'rejected' | 'withdrawn'

const stageTone = (stages: StageDef[], key: string): Tone => {
  if (key === 'rejected') return 'r';
  if (key === 'withdrawn') return 'n';
  const s = stages.find(x => x.key === key);
  return s?.system === 'enrolled' ? 'g' : s?.system === 'offer' ? 'a' : 'b';
};

export default function AdmissionsPage() {
  return <DeskGate need="admissions.read">{desk => <Admissions desk={desk} />}</DeskGate>;
}

function Admissions({ desk }: { desk: AdminDesk }) {
  const { call, reload } = useAdminDesk();
  const router = useRouter();
  const params = useSearchParams();
  const [toast, toastEl] = useToast();
  const P = desk.admissions;
  const can = desk.me.access.can.bind(desk.me.access);
  const [view, setView] = useState<View>(() => params.get('view') || 'open');
  // ?new=1 (from "New enquiry" on the dashboard) opens the form straight away.
  const [adding, setAdding] = useState(() => params.get('new') === '1' && can('admissions.manage'));
  const [setup, setSetup] = useState(false);
  const openId = params.get('applicant');
  const current = openId ? P.applicants.find(a => a.id === openId) ?? null : null;
  const setOpen = useCallback((id: string | null) => router.replace(id ? `/admin/admissions?applicant=${id}` : '/admin/admissions', { scroll: false }), [router]);
  const done = (msg: string) => { toast(msg); reload(); };
  const shown = activeStages(P.stages);

  const rows = useMemo(() => P.applicants.filter(a =>
    view === 'all' ? true : view === 'open' ? a.open
      : view === 'approval' ? a.offer?.status === 'proposed'
      : view === 'waitlist' ? a.offer?.status === 'waitlisted'
      : a.stage === view), [P.applicants, view]);
  const { shown: shownRows, pager } = usePaged(rows, view);

  const capped = P.seats.filter(s => s.capacity !== null);
  const seatsLeft = capped.reduce((n, s) => n + Math.max(0, s.left ?? 0), 0);

  const exportCsv = () => downloadCsv(`admissions-${P.session}-${isoDay()}.csv`, [
    ['Name', 'Grade', 'Stage', 'Furthest stage', 'Offer', 'Reply by', 'Days in stage', 'Source', 'Previous school', 'Guardian', 'Phone', 'Email', 'Assessment on', 'Added'],
    ...P.applicants.map(a => [a.name, a.grade, stageName(P.stages, a.stage), stageName(P.stages, a.furthest), a.offer ? OFFER_LABEL[a.offer.status] : '',
      a.offer?.status === 'issued' ? a.offer.respondBy : '', a.open ? a.daysInStage : '', SOURCES[a.source] || a.source,
      a.previousSchool, a.guardianName, a.guardianPhone, a.guardianEmail, a.assessmentOn, a.createdAt.slice(0, 10)]),
  ]);

  const views: [View, string][] = [['open', 'Open'], ...(P.approvals.length ? [['approval', `Approval · ${P.approvals.length}`] as [View, string]] : []),
    ...(P.waitlisted ? [['waitlist', `Waitlist · ${P.waitlisted}`] as [View, string]] : []),
    ...shown.map(s => [s.key, s.label] as [View, string]), ['rejected', 'Rejected'], ['withdrawn', 'Withdrawn'], ['all', 'All']];

  return (
    <>
      {toastEl}
      <PageBar eyebrow="ADMISSIONS & FEES" title={`Admissions · AY ${P.session.replace('-', '–')}`}
        sub={`${plural(P.total, 'applicant')} · ${P.enrolled} enrolled · ${plural(P.closed.rejected, 'rejection')} · ${P.closed.withdrawn} withdrawn`}
        actions={<>
          <button className="btn" onClick={exportCsv} disabled={!P.total}><DownloadSimple size={16} /> Export</button>
          {can('admissions.setup') && <button className="btn" onClick={() => setSetup(true)}><GearSix size={16} /> Set up</button>}
          {can('admissions.manage') && <button className="btn pri" onClick={() => setAdding(true)}><UserPlus size={16} weight="bold" /> New enquiry</button>}
        </>} />
      <FinanceTabs />
      <MissingNotice desk={desk} tables={['admission_applicants']} />

      <div className="kpis">
        <Kpi label="APPLICANTS" value={P.total} icon={UsersThree} note={`${P.applicants.filter(a => a.open).length} still open${P.conversion !== null ? ` · ${P.conversion}% of decided enrolled` : ''}`} onClick={() => setView('open')} />
        <Kpi label="ENROLLED" value={P.enrolled} icon={CheckCircle} valueColor="var(--green)" note={`for AY ${P.session.replace('-', '–')}`} onClick={() => setView('enrolled')} />
        <Kpi label="SEATS LEFT" value={capped.length ? seatsLeft : '—'} icon={Armchair}
          valueColor={capped.length && !seatsLeft ? 'var(--amber)' : undefined}
          note={capped.length ? `${plural(capped.length, 'grade')} with a limit${P.waitlisted ? ` · ${P.waitlisted} waitlisted` : ''}` : 'No seat limits set'}
          onClick={P.waitlisted ? () => setView('waitlist') : undefined} />
        <Kpi label="OFFERS TO APPROVE" value={P.approvals.length} icon={SealCheck} valueColor={P.approvals.length ? 'var(--amber)' : undefined}
          note={P.approvals.length ? `Oldest: ${P.approvals[0].name}, ${ago(P.approvals[0].offer!.proposedAt)}` : 'None waiting'}
          onClick={P.approvals.length ? () => setView('approval') : undefined} />
        <Kpi label="IDLE OVER 2 WEEKS" value={P.stale.length} icon={Hourglass} valueColor={P.stale.length ? 'var(--amber)' : undefined}
          note={P.stale.length ? `Longest: ${P.stale[0].name}, ${P.stale[0].daysInStage} days` : 'Every open applicant moved recently'}
          noteColor={P.stale.length ? 'var(--amber)' : 'var(--mut)'} />
      </div>

      {P.approvals.length > 0 && (can('admissions.approve') || can('admissions.manage')) && (
        <Approvals P={P} desk={desk} call={call} onDone={done} onOpen={setOpen} />
      )}

      <div className="g2" style={{ marginBottom: 22 }}>
        <div className="card">
          <CardHead title="Funnel" sub="Everyone who reached each stage, including those later rejected or withdrawn. Pick a stage to list who's there now." />
          {P.funnel.map((f, i) => (
            <button key={f.stage} className="row-btn" onClick={() => setView(f.stage)} aria-pressed={view === f.stage}>
              <b style={{ flex: '0 0 150px', fontSize: 14 }}>{f.label}</b>
              <Bar value={f.share ?? 0} color={f.color} />
              <b className="num" style={{ width: 40, textAlign: 'right' }}>{f.reached}</b>
              <span className="muted num" style={{ width: 70, textAlign: 'right', fontSize: 12.5 }}>{i && f.fromPrev !== null ? `${f.fromPrev}% on` : f.share !== null ? `${f.share}%` : ''}</span>
            </button>
          ))}
          {P.leak ? (
            <div className="note" style={{ marginTop: 16 }}>
              <b>Biggest drop: {P.leak.fromLabel.toLowerCase()} to {P.leak.toLabel.toLowerCase()}</b>. Only {P.leak.rate}% move on at that step.
            </div>
          ) : P.total > 0 && <div className="note" style={{ marginTop: 16 }}>Conversion between stages is shown once at least three applicants reach a stage.</div>}
        </div>
        <div className="card">
          <CardHead title="Seats by grade" sub={capped.length ? 'Held: at Offer or enrolled. When a grade is full, approved offers wait on the list and go out as seats free.' : undefined}
            right={can('admissions.setup') && <button className="btn sm" onClick={() => setSetup(true)}>Set seats</button>} />
          {P.seats.length ? (
            <>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Grade</th><th className="c">Seats</th><th className="c">Held</th><th className="c">Accepted</th><th className="c">Waitlist</th><th className="c">Left</th></tr></thead>
                  <tbody>{P.seats.map(s => (
                    <tr key={s.grade}>
                      <td><b>Grade {s.grade}</b></td>
                      <td className="c num">{s.capacity ?? <span className="muted">No limit</span>}</td>
                      <td className="c num">{s.held}</td>
                      <td className="c num">{s.accepted + s.enrolled}</td>
                      <td className="c num">{s.waitlisted || ''}</td>
                      <td className="c num" style={{ color: s.left !== null && s.left <= 0 ? 'var(--amber)' : undefined, fontWeight: 700 }}>{s.left ?? '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', margin: '18px 0 4px' }}>WHERE THEY HEARD OF US</div>
              {P.bySource.map(s => (
                <div className="row" key={s.source}>
                  <span style={{ flex: '0 0 130px', fontSize: 13.5 }}>{SOURCES[s.source] || s.source}</span>
                  <Bar value={(s.total / Math.max(1, P.total)) * 100} color="#7C5CFC" />
                  <span className="muted num" style={{ width: 100, textAlign: 'right', fontSize: 12.5 }}>{s.total} · {s.enrolled} enrolled</span>
                </div>
              ))}
            </>
          ) : <Empty icon={<UsersThree size={26} weight="duotone" />} title="No applicants yet">Log each enquiry as it comes in; the funnel, seats and conversion build from there.</Empty>}
        </div>
      </div>

      <div className="card">
        <CardHead title="Applicants" right={
          <div className="seg" role="group" aria-label="Filter applicants" style={{ flexWrap: 'wrap' }}>
            {views.map(([v, label]) => (
              <button key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>{label}</button>
            ))}
          </div>} />
        {rows.length ? (<>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Applicant</th><th className="c">Grade</th><th>Stage</th><th>Offer</th><th className="c">In stage</th><th>Source</th><th /></tr></thead>
              <tbody>{shownRows.map(a => (
                <ApplicantRow key={a.id} a={a} stages={P.stages} canManage={can('admissions.manage')} onOpen={() => setOpen(a.id)}
                  onAdvance={async to => {
                    await call('/api/admin/admissions', 'PATCH', { id: a.id, from: a.stage, to });
                    done(`${a.name} moved to ${stageName(P.stages, to).toLowerCase()}`);
                  }} />
              ))}</tbody>
            </table>
          </div>
          <Pager {...pager} noun="applicants" />
        </>) : (
          <Empty icon={<UsersThree size={26} weight="duotone" />} title={P.total ? 'Nobody here' : 'No applicants yet'}>
            {P.total ? 'Pick another stage.' : 'Add an enquiry to start the pipeline.'}
          </Empty>
        )}
      </div>

      {adding && <NewApplicant session={P.session} onClose={() => setAdding(false)} onSave={async body => {
        const r = await call('/api/admin/admissions', 'POST', body);
        setAdding(false);
        done(`${body.name} added as an enquiry`);
        setOpen(r.id);
      }} />}
      {setup && <Setup P={P} call={call} onClose={() => setSetup(false)} onSaved={m => done(m)} />}
      {current && <ApplicantRecord a={current} P={P} desk={desk} call={call} onClose={() => setOpen(null)} onChanged={done} />}
    </>
  );
}

type Call = (p: string, m: 'PATCH' | 'POST' | 'DELETE', b: unknown) => Promise<any>;

function OfferChip({ o }: { o: Offer | null }) {
  if (!o) return <span className="muted">—</span>;
  const extra = o.status === 'waitlisted' && o.waitPosition ? ` #${o.waitPosition}`
    : o.status === 'issued' && o.daysLeft !== null ? ` · ${o.daysLeft < 0 ? 'past date' : `${o.daysLeft} d`}` : '';
  return <Chip tone={OFFER_TONE[o.status]}>{OFFER_LABEL[o.status].toUpperCase()}{extra}</Chip>;
}

function ApplicantRow({ a, stages, canManage, onOpen, onAdvance }: {
  a: Applicant; stages: StageDef[]; canManage: boolean; onOpen: () => void; onAdvance: (to: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = a.open && canManage ? nextStage(stages, a.stage) : null;
  const sys = next ? stages.find(s => s.key === next)?.system : null;
  const offerBusy = a.offer?.live;
  return (
    <tr className="click" onClick={onOpen} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}>
      <td><b style={{ fontSize: 14 }}>{a.name}</b><div className="muted" style={{ fontSize: 12 }}>{a.previousSchool || 'Previous school not recorded'}</div>
        {err && <div style={{ color: 'var(--red)', fontSize: 12 }}>{err}</div>}</td>
      <td className="c num">{a.grade}</td>
      <td><Chip tone={stageTone(stages, a.stage)}>{stageName(stages, a.stage).toUpperCase()}</Chip></td>
      <td><OfferChip o={a.offer?.live || a.offer?.status === 'returned' ? a.offer : null} /></td>
      <td className="c num" style={{ color: a.daysInStage > STALE_DAYS ? 'var(--amber)' : undefined }}>{a.open ? `${a.daysInStage} d` : '—'}</td>
      <td className="muted" style={{ fontSize: 13 }}>{SOURCES[a.source] || a.source}</td>
      <td className="r" onClick={e => e.stopPropagation()}>
        {next && sys === 'enrolled' && a.offer?.status === 'accepted' && <button className="btn sm" onClick={onOpen}>Enrol <ArrowRight size={13} weight="bold" /></button>}
        {next && sys === 'offer' && !offerBusy && <button className="btn sm" onClick={onOpen}>Propose offer <ArrowRight size={13} weight="bold" /></button>}
        {next && !sys && !offerBusy && (
          <button className="btn sm pri" disabled={busy} onClick={async () => {
            setBusy(true); setErr(null);
            try { await onAdvance(next); } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Could not move them.'); } finally { setBusy(false); }
          }}>{busy ? 'Moving…' : <>To {stageName(stages, next).toLowerCase()} <ArrowRight size={13} weight="bold" /></>}</button>
        )}
      </td>
    </tr>
  );
}

/** Offers waiting for the principal. The person who proposed one sees it but can't approve it. */
function Approvals({ P, desk, call, onDone, onOpen }: { P: Pipeline; desk: AdminDesk; call: Call; onDone: (m: string) => void; onOpen: (id: string) => void }) {
  const names = new Map(desk.workforce.admins.map(x => [x.id, x.name]));
  const approver = desk.me.access.can('admissions.approve');
  return (
    <div className="card" style={{ marginBottom: 22, borderLeft: '4px solid var(--amber)' }}>
      <CardHead title="Offers waiting for approval" sub={approver ? 'Approving sends the offer when the grade has a seat, or puts the applicant on the waitlist when it is full.' : 'The principal approves these before they go to families.'} />
      {P.approvals.map(a => {
        const seat = P.seats.find(s => s.grade === a.grade);
        return (
          <DecideRow key={a.id} a={a} seatNote={seat?.left === null || !seat ? 'no seat limit' : seat.left > 0 ? `${plural(seat.left, 'seat')} left` : 'grade full: goes to the waitlist'}
            proposer={a.offer!.proposedBy ? names.get(a.offer!.proposedBy) ?? 'Admissions' : 'Admissions'}
            canDecide={approver && a.offer!.proposedBy !== desk.me.id} mine={a.offer!.proposedBy === desk.me.id}
            call={call} onDone={onDone} onOpen={() => onOpen(a.id)} />
        );
      })}
    </div>
  );
}

function DecideRow({ a, seatNote, proposer, canDecide, mine, call, onDone, onOpen }: {
  a: Applicant; seatNote: string; proposer: string; canDecide: boolean; mine: boolean; call: Call; onDone: (m: string) => void; onOpen: () => void;
}) {
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const o = a.offer!;
  const decide = async (action: 'approve' | 'return') => {
    setBusy(true); setErr(null);
    try {
      const r = await call('/api/admin/admissions/offers', 'POST', { action, offerId: o.id, note: note || undefined });
      onDone(action === 'return' ? `Offer for ${a.name} sent back` : r.status === 'waitlisted' ? `${a.name} approved and put on the grade ${a.grade} waitlist` : `Offer for ${a.name} approved and out`);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Could not record the decision.'); setBusy(false); }
  };
  return (
    <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
      <button onClick={onOpen} style={{ flex: '1 1 260px', textAlign: 'left', background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', font: 'inherit' }}>
        <b style={{ fontSize: 14 }}>{a.name}</b> <span className="muted">· Grade {a.grade} · {seatNote}</span>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Proposed by {proposer} {ago(o.proposedAt)}{o.respondBy ? ` · reply by ${fmtDate(o.respondBy)}` : ''}</div>
        {o.proposalNote && <div style={{ fontSize: 12.5, marginTop: 4 }}>&ldquo;{o.proposalNote}&rdquo;</div>}
      </button>
      {canDecide && !returning && (
        <div className="acts">
          <button className="btn sm" disabled={busy} onClick={() => setReturning(true)}>Send back</button>
          <button className="btn sm pri" disabled={busy} onClick={() => decide('approve')}>{busy ? 'Saving…' : 'Approve'}</button>
        </div>
      )}
      {mine && <span className="muted" style={{ fontSize: 12.5 }}>You proposed this: someone else approves it.</span>}
      {returning && (
        <div style={{ flex: '1 1 100%', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="cmp-in" style={{ flex: '1 1 260px' }} value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder="What needs another look (it goes back to the proposer)" aria-label="Why send it back" />
          <button className="btn sm" onClick={() => { setReturning(false); setNote(''); }}>Cancel</button>
          <button className="btn sm red" disabled={busy || !note.trim()} onClick={() => decide('return')}>Send back</button>
        </div>
      )}
      {err && <div className="err" role="alert" style={{ flex: '1 1 100%' }}>{err}</div>}
    </div>
  );
}

interface Draft { name: string; grade: string; dob: string; guardianName: string; guardianPhone: string; guardianEmail: string; previousSchool: string; source: string; notes: string }

function DetailsForm({ d, set, gradeLocked }: { d: Draft; set: (k: keyof Draft, v: string) => void; gradeLocked?: boolean }) {
  return (
    <>
      <div className="g2" style={{ gap: 16 }}>
        <Field label="APPLICANT'S FULL NAME" htmlFor="ap-name"><input id="ap-name" className="cmp-in" value={d.name} maxLength={120} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="GRADE APPLIED FOR" htmlFor="ap-grade" hint={gradeLocked ? 'Fixed while an offer is in progress: it holds a seat in this grade.' : undefined}>
          <select id="ap-grade" className="cmp-sel" value={d.grade} disabled={gradeLocked} onChange={e => set('grade', e.target.value)}>
            <option value="">Pick a grade</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(g => <option key={g} value={g}>Grade {g}</option>)}
          </select>
        </Field>
        <Field label="DATE OF BIRTH" htmlFor="ap-dob"><input id="ap-dob" type="date" className="cmp-in" value={d.dob} max={isoDay()} onChange={e => set('dob', e.target.value)} /></Field>
        <Field label="CURRENT SCHOOL" htmlFor="ap-prev"><input id="ap-prev" className="cmp-in" value={d.previousSchool} maxLength={160} onChange={e => set('previousSchool', e.target.value)} /></Field>
        <Field label="PARENT OR GUARDIAN" htmlFor="ap-gname"><input id="ap-gname" className="cmp-in" value={d.guardianName} maxLength={120} onChange={e => set('guardianName', e.target.value)} /></Field>
        <Field label="MOBILE" htmlFor="ap-phone"><input id="ap-phone" className="cmp-in" inputMode="tel" value={d.guardianPhone} maxLength={20} onChange={e => set('guardianPhone', e.target.value)} placeholder="98xxxxxxxx" /></Field>
        <Field label="EMAIL" htmlFor="ap-email"><input id="ap-email" type="email" className="cmp-in" value={d.guardianEmail} maxLength={160} onChange={e => set('guardianEmail', e.target.value)} /></Field>
        <Field label="HOW THEY HEARD OF US" htmlFor="ap-src">
          <select id="ap-src" className="cmp-sel" value={d.source} onChange={e => set('source', e.target.value)}>
            {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="NOTES" htmlFor="ap-notes"><textarea id="ap-notes" className="cmp-in" value={d.notes} maxLength={2000} onChange={e => set('notes', e.target.value)} /></Field>
    </>
  );
}

const blank: Draft = { name: '', grade: '', dob: '', guardianName: '', guardianPhone: '', guardianEmail: '', previousSchool: '', source: 'walk_in', notes: '' };

function NewApplicant({ session, onClose, onSave }: { session: string; onClose: () => void; onSave: (b: Record<string, unknown>) => Promise<void> }) {
  const [d, setD] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!d.name.trim()) { setErr('Enter the applicant\'s name.'); return; }
    if (!d.grade) { setErr('Pick the grade applied for.'); return; }
    setBusy(true); setErr(null);
    try { await onSave({ ...d, grade: Number(d.grade), session }); } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Could not save.'); setBusy(false); }
  };
  return (
    <Workspace title="New enquiry" sub={`Admissions · AY ${session.replace('-', '–')}`} onClose={onClose}
      actions={<button className="btn pri" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Add enquiry'}</button>}>
      <div className="card">
        <DetailsForm d={d} set={(k, v) => setD(x => ({ ...x, [k]: v }))} />
        {err && <div className="err" role="alert">{err}</div>}
      </div>
    </Workspace>
  );
}

/** The latest enrolment request for an applicant (Sthara creates the logins when it approves one). */
interface EnrolRequest { status: 'pending' | 'approved' | 'rejected' | 'cancelled'; options: { className?: string; rollNo?: string }; created_at: string; decision_note: string | null }
function useEnrolRequest(applicantId: string) {
  const [req, setReq] = useState<EnrolRequest | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    createClient().from('account_requests').select('status, options, created_at, decision_note').eq('applicant_id', applicantId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (!cancelled) setReq((data as EnrolRequest | null) ?? null); });
    return () => { cancelled = true; };
  }, [applicantId, tick]);
  return { req, refresh: () => setTick(t => t + 1) };
}

const OFFER_EVENT: Record<OfferStatus, string> = {
  proposed: 'Offer proposed', returned: 'Offer sent back', waitlisted: 'Approved: on the waitlist', issued: 'Offer out', accepted: 'Family accepted the offer',
  declined: 'Family declined the offer', lapsed: 'Offer lapsed', withdrawn: 'Offer cancelled', enrolled: 'Enrolled',
};

function ApplicantRecord({ a, P, desk, call, onClose, onChanged }: {
  a: Applicant; P: Pipeline; desk: AdminDesk; call: Call; onClose: () => void; onChanged: (m: string) => void;
}) {
  const stages = P.stages;
  const [d, setD] = useState<Draft>({
    name: a.name, grade: String(a.grade), dob: a.dob || '', guardianName: a.guardianName || '', guardianPhone: a.guardianPhone || '',
    guardianEmail: a.guardianEmail || '', previousSchool: a.previousSchool || '', source: a.source, notes: a.notes || '',
  });
  const [assessmentOn, setAssessmentOn] = useState(a.assessmentOn || '');
  const [closing, setClosing] = useState<'rejected' | 'withdrawn' | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const names = new Map(desk.workforce.admins.map(x => [x.id, x.name]));
  const manage = desk.me.access.can('admissions.manage');
  const next = a.open && manage ? nextStage(stages, a.stage) : null;
  const nextSys = next ? stages.find(s => s.key === next)?.system ?? null : null;
  const live = a.offer?.live ? a.offer : null;
  const { req, refresh } = useEnrolRequest(a.id);
  const pending = req?.status === 'pending';
  const first = a.name.split(' ')[0];

  const act = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true); setErr(null);
    try { await call('/api/admin/admissions', 'PATCH', { id: a.id, from: a.stage, ...body }); setClosing(null); setNote(''); onChanged(msg); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  return (
    <Workspace wide title={a.name} sub={`Grade ${a.grade} · ${stageName(stages, a.stage)}${a.open ? ` for ${plural(a.daysInStage, 'day')}` : ''} · added ${fmtDate(a.createdAt)}`} onClose={onClose}
      actions={<div className="acts">
        {manage && a.open && <button className="btn" disabled={busy} onClick={() => setClosing('withdrawn')}>Withdrawn</button>}
        {manage && a.open && <button className="btn" disabled={busy} onClick={() => setClosing('rejected')}>Reject</button>}
        {manage && isClosed(a.stage) && <button className="btn" disabled={busy} onClick={() => act({ to: 'reopen' }, `${a.name} reopened`)}>Reopen</button>}
        {next && !nextSys && !live && <button className="btn pri" disabled={busy} onClick={() => act({ to: next }, `${a.name} moved to ${stageName(stages, next).toLowerCase()}`)}>Move to {stageName(stages, next).toLowerCase()} <ArrowRight size={13} weight="bold" /></button>}
        {nextSys === 'enrolled' && !a.studentId && req !== undefined && !pending && a.offer?.status === 'accepted' && <button className="btn pri" disabled={busy} onClick={() => setEnrolling(true)}>Request enrolment <ArrowRight size={13} weight="bold" /></button>}
      </div>}>
      {err && <div className="err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <OfferCard a={a} P={P} desk={desk} call={call} names={names} canPropose={nextSys === 'offer' && !live} onChanged={onChanged} />
      {pending && req && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--amber)' }}>
          <CardHead title="Enrolment is with Sthara"
            sub={`Requested ${fmtDate(req.created_at)}: ${req.options.className ?? ''}, admission no. ${req.options.rollNo ?? ''}. Sthara creates the student's and parent's logins, and ${first} moves to ${stageName(stages, 'enrolled')} once they are made.`}
            right={manage && <button className="btn sm" disabled={busy} onClick={async () => {
              setBusy(true); setErr(null);
              try { await call('/api/admin/admissions/enrol', 'DELETE', { applicantId: a.id }); refresh(); }
              catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Could not withdraw the request.'); } finally { setBusy(false); }
            }}>Withdraw request</button>} />
        </div>
      )}
      {req?.status === 'rejected' && a.stage === 'offer' && (
        <div className="note" style={{ marginBottom: 16 }}>Sthara didn&apos;t enrol {first}{req.decision_note ? `: "${req.decision_note}"` : '.'} Fix the details and request again.</div>
      )}
      {a.studentId && desk.me.access.can('students.manage') && (
        <div className="note info" style={{ marginBottom: 16 }}>
          {first} has a Sthara login. If they aren&apos;t on the student register yet, <Link href="/admin/students?tab=register">admit them there</Link>: the form fills in from this application.
        </div>
      )}
      {enrolling && <EnrolPanel a={a} call={call} onCancel={() => setEnrolling(false)} onDone={m => { setEnrolling(false); refresh(); onChanged(m); }} />}
      {closing && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--red)' }}>
          <Field label={closing === 'rejected' ? 'REASON FOR REJECTION' : 'WHY DID THEY WITHDRAW?'} htmlFor="close-why"
            hint={`Stays on the applicant's record.${a.stage === 'offer' ? ' Their seat goes to the next family on the waitlist.' : ''}`}>
            <input id="close-why" className="cmp-in" value={note} maxLength={1000} onChange={e => setNote(e.target.value)}
              placeholder={closing === 'rejected' ? 'Assessment below the grade threshold, no seats in Grade 6…' : 'Chose another school, relocating…'} />
          </Field>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setClosing(null)}>Cancel</button>
            <button className="btn red" disabled={busy || !note.trim()} onClick={() => act({ to: closing, note }, `${a.name} marked ${closing}`)}>Confirm</button>
          </div>
        </div>
      )}
      <div className="g2" style={{ gridTemplateColumns: '1fr 340px', alignItems: 'start' }}>
        <div className="card">
          <CardHead title="Details" right={manage && <button className="btn sm" disabled={busy} onClick={async () => {
            setBusy(true); setErr(null);
            try { await call('/api/admin/admissions', 'PATCH', { id: a.id, fields: { ...d, grade: Number(d.grade), assessmentOn } }); onChanged('Details saved'); }
            catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
          }}>Save details</button>} />
          <DetailsForm d={d} set={(k, v) => setD(x => ({ ...x, [k]: v }))} gradeLocked={!!live} />
          <Field label="ASSESSMENT DATE" htmlFor="ap-assess"><input id="ap-assess" type="date" className="cmp-in" value={assessmentOn} onChange={e => setAssessmentOn(e.target.value)} /></Field>
        </div>
        <div className="card">
          <CardHead title="History" />
          {a.events.length ? a.events.map(e => (
            <div className="row" key={e.id} style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                  {e.offer && e.from === e.to ? OFFER_EVENT[e.offer]
                    : e.from ? `${stageName(stages, e.from)} to ${stageName(stages, e.to)}` : `Added as ${stageName(stages, e.to).toLowerCase()}`}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{e.actorId ? names.get(e.actorId) ?? 'Admin' : 'Sthara'} · {ago(e.at)}</div>
                {e.note && <div style={{ fontSize: 12.5, marginTop: 4 }}>&ldquo;{e.note}&rdquo;</div>}
              </div>
            </div>
          )) : <p className="muted" style={{ fontSize: 13 }}>No stage changes recorded.</p>}
        </div>
      </div>
    </Workspace>
  );
}

/** Where the applicant's offer stands, and the next step on it for whoever is looking. */
function OfferCard({ a, P, desk, call, names, canPropose, onChanged }: {
  a: Applicant; P: Pipeline; desk: AdminDesk; call: Call; names: Map<string, string>; canPropose: boolean; onChanged: (m: string) => void;
}) {
  const access = desk.me.access;
  const o = a.offer;
  const [mode, setMode] = useState<null | 'propose' | 'return' | 'decline' | 'cancel'>(null);
  const [note, setNote] = useState('');
  const [respondBy, setRespondBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const offerStage = P.stages.find(s => s.system === 'offer')!;
  const seat = P.seats.find(s => s.grade === a.grade);
  const first = a.name.split(' ')[0];
  const run = async (body: Record<string, unknown>, msg: (r: any) => string) => {
    setBusy(true); setErr(null);
    try { const r = await call('/api/admin/admissions/offers', 'POST', body); setMode(null); setNote(''); onChanged(msg(r)); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };
  const who = (id: string | null) => (id ? names.get(id) ?? 'Admin' : 'Sthara');

  const showPropose = canPropose && access.can('admissions.manage');
  if (!o?.live && !showPropose && o?.status !== 'returned') return null;

  let title = 'Offer';
  let sub: string | null = null;
  let tone = 'var(--blue)';
  if (o?.live) {
    tone = o.status === 'accepted' ? 'var(--green)' : o.status === 'waitlisted' ? 'var(--purple, #7C5CFC)' : 'var(--amber)';
    if (o.status === 'proposed') { title = 'Offer waiting for approval'; sub = `Proposed by ${who(o.proposedBy)} ${ago(o.proposedAt)}.${o.proposalNote ? ` "${o.proposalNote}"` : ''}`; }
    if (o.status === 'waitlisted') { title = `On the grade ${a.grade} waitlist${o.waitPosition ? `, number ${o.waitPosition}` : ''}`; sub = `Approved by ${who(o.decidedBy)}. The offer goes out by itself when a seat frees, and ${who(o.proposedBy)} is told.`; }
    if (o.status === 'issued') {
      title = 'Offer is out';
      sub = o.respondBy ? `The family has until ${fmtDate(o.respondBy)} to accept (${o.daysLeft! < 0 ? 'past the date: it lapses tonight' : plural(o.daysLeft!, 'day') + ' left'}). After that it lapses and the seat goes to the waitlist.`
        : 'Recorded before offers needed approval, so it has no reply-by date.';
    }
    if (o.status === 'accepted') { title = 'Offer accepted'; sub = `Recorded ${o.respondedAt ? ago(o.respondedAt) : ''}. Request enrolment to have Sthara make the logins.`; }
  } else if (o?.status === 'returned' && !showPropose) {
    return <div className="note" style={{ marginBottom: 16 }}>Offer sent back by {who(o.decidedBy)}: &ldquo;{o.decisionNote}&rdquo;</div>;
  } else {
    title = `Propose an offer for ${first}`;
    sub = `${o?.status === 'returned' ? `Sent back by ${who(o.decidedBy)}: "${o.decisionNote}". ` : ''}The principal approves it before it goes to the family. ${seat?.capacity === null || !seat ? 'Grade ' + a.grade + ' has no seat limit.' : seat.left! > 0 ? `${plural(seat.left!, 'seat')} left in grade ${a.grade}.` : `Grade ${a.grade} is full: once approved, ${first} waits on the list.`}`;
  }

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${tone}` }}>
      <CardHead title={title} sub={sub ?? undefined} right={
        <div className="acts">
          {showPropose && !o?.live && mode !== 'propose' && <button className="btn sm pri" onClick={() => setMode('propose')}>Propose offer</button>}
          {o?.status === 'proposed' && access.can('admissions.approve') && o.proposedBy !== desk.me.id && !mode && <>
            <button className="btn sm" disabled={busy} onClick={() => setMode('return')}>Send back</button>
            <button className="btn sm pri" disabled={busy} onClick={() => run({ action: 'approve', offerId: o.id }, r => r.status === 'waitlisted' ? `${a.name} approved and put on the waitlist` : `Offer for ${a.name} approved and out`)}>Approve</button>
          </>}
          {o && (o.status === 'proposed' || o.status === 'waitlisted') && access.can('admissions.manage') && !mode && <button className="btn sm" disabled={busy} onClick={() => setMode('cancel')}>Cancel offer</button>}
          {o?.status === 'issued' && access.can('admissions.manage') && !mode && <>
            <button className="btn sm" disabled={busy} onClick={() => setMode('decline')}>Family declined</button>
            <button className="btn sm pri" disabled={busy} onClick={() => run({ action: 'accept', offerId: o.id }, () => `${a.name}'s family accepted the offer`)}>Family accepted</button>
          </>}
        </div>} />
      {mode === 'propose' && (
        <div className="g2" style={{ gap: 12 }}>
          <Field label="REPLY BY (OPTIONAL)" htmlFor="of-by" hint={`Blank: ${plural(offerStage.respondDays ?? 14, 'day')} from when the offer goes out.`}>
            <input id="of-by" type="date" className="cmp-in" min={isoDay()} value={respondBy} onChange={e => setRespondBy(e.target.value)} />
          </Field>
          <Field label="NOTE FOR THE PRINCIPAL" htmlFor="of-note"><input id="of-note" className="cmp-in" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="Assessment 78%, sibling in Grade 4…" /></Field>
        </div>
      )}
      {(mode === 'return' || mode === 'decline' || mode === 'cancel') && (
        <Field label={mode === 'return' ? 'WHAT NEEDS ANOTHER LOOK' : mode === 'decline' ? 'WHY DID THEY DECLINE?' : 'WHY CANCEL? (OPTIONAL)'} htmlFor="of-why"
          hint={mode === 'decline' ? `${first} is marked withdrawn and the seat goes to the next family on the waitlist.` : undefined}>
          <input id="of-why" className="cmp-in" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />
        </Field>
      )}
      {mode && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={() => { setMode(null); setNote(''); }}>Back</button>
          {mode === 'propose' && <button className="btn pri" disabled={busy} onClick={() => run({ action: 'propose', applicantId: a.id, note: note || undefined, respondBy: respondBy || undefined }, () => `Offer for ${a.name} sent for approval`)}>{busy ? 'Sending…' : 'Send for approval'}</button>}
          {mode === 'return' && <button className="btn red" disabled={busy || !note.trim()} onClick={() => run({ action: 'return', offerId: o!.id, note }, () => `Offer for ${a.name} sent back`)}>Send back</button>}
          {mode === 'decline' && <button className="btn red" disabled={busy || !note.trim()} onClick={() => run({ action: 'decline', offerId: o!.id, note }, () => `${a.name} declined; the seat is free`)}>Record decline</button>}
          {mode === 'cancel' && <button className="btn red" disabled={busy} onClick={() => run({ action: 'cancel', offerId: o!.id, note: note || undefined }, () => `Offer for ${a.name} cancelled`)}>Cancel offer</button>}
        </div>
      )}
      {err && <div className="err" role="alert" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}

/**
 * Enrolment request: the section and admission number (and optional emails). Sthara creates the logins when it
 * approves the request: the student's, the parent's (or a link to their existing account), the fees already raised
 * for the grade, and the move to Enrolled. Sections come from the school's class list.
 */
function EnrolPanel({ a, call, onCancel, onDone }: { a: Applicant; call: Call; onCancel: () => void; onDone: (m: string) => void }) {
  const [sections, setSections] = useState<string[] | null>(null);
  const [v, setV] = useState({ className: '', rollNo: '', studentEmail: '', parentEmail: a.guardianEmail || '', billFees: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    createClient().from('classes').select('name').then(({ data }) => {
      if (cancelled) return;
      const list = (data || []).map(c => c.name as string).filter(n => gradeOf(n) === a.grade).sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
      setSections(list);
      setV(x => (x.className ? x : { ...x, className: list[0] ?? '' }));
    });
    return () => { cancelled = true; };
  }, [a.grade]);
  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--blue)' }}>
      <CardHead title={`Request enrolment for ${a.name}`} sub={`Grade ${a.grade}. Sthara creates the student's login and the parent's (or links their existing account), raises the fees if you ask, and moves them to Enrolled. You'll get the sign-in details from Sthara.`} />
      {sections && !sections.length && <div className="note" style={{ marginBottom: 12 }}>Your class list has no grade {a.grade} section yet. Ask Sthara to add one.</div>}
      <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Field label="SECTION" htmlFor="en-c">
          <select id="en-c" className="cmp-sel" value={v.className} onChange={e => setV({ ...v, className: e.target.value })} disabled={!sections?.length}>
            {!sections && <option value="">Loading…</option>}
            {(sections || []).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="ADMISSION NO." htmlFor="en-r"><input id="en-r" className="cmp-in" value={v.rollNo} onChange={e => setV({ ...v, rollNo: e.target.value })} /></Field>
        <Field label="STUDENT EMAIL (OPTIONAL)" htmlFor="en-s" hint="Leave blank for a school login ID"><input id="en-s" className="cmp-in" value={v.studentEmail} onChange={e => setV({ ...v, studentEmail: e.target.value })} /></Field>
        <Field label="PARENT EMAIL" htmlFor="en-p" hint="An existing parent account is linked, not duplicated"><input id="en-p" className="cmp-in" value={v.parentEmail} onChange={e => setV({ ...v, parentEmail: e.target.value })} /></Field>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '4px 0 12px' }}><input type="checkbox" checked={v.billFees} onChange={e => setV({ ...v, billFees: e.target.checked })} /> Raise the fee instalments already billed to grade {a.grade} this session</label>
      {err && <div className="err" role="alert" style={{ marginBottom: 10 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" disabled={busy || !v.className.trim() || !v.rollNo.trim()} onClick={async () => {
          setBusy(true); setErr(null);
          try { await call('/api/admin/admissions/enrol', 'POST', { applicantId: a.id, ...v }); onDone(`Enrolment request for ${a.name} sent to Sthara`); }
          catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Could not send the request.'); } finally { setBusy(false); }
        }}>{busy ? 'Sending…' : 'Send to Sthara'}</button>
      </div>
    </div>
  );
}

// ── Set up: stages and seats ────────────────────────────────────────────────
interface StageDraft { key: string | null; label: string; active: boolean; open: number }

function Setup({ P, call, onClose, onSaved }: { P: Pipeline; call: Call; onClose: () => void; onSaved: (m: string) => void }) {
  const [tab, setTab] = useState<'stages' | 'seats'>('stages');
  return (
    <Workspace wide title="Set up admissions" sub={`Stages for every session · seats for AY ${P.session.replace('-', '–')}`} onClose={onClose}>
      <div className="seg" role="tablist" aria-label="Set-up" style={{ marginBottom: 16 }}>
        <button role="tab" aria-selected={tab === 'stages'} className={tab === 'stages' ? 'on' : ''} onClick={() => setTab('stages')}>Stages</button>
        <button role="tab" aria-selected={tab === 'seats'} className={tab === 'seats' ? 'on' : ''} onClick={() => setTab('seats')}>Seats</button>
      </div>
      {tab === 'stages' ? <StagesEditor P={P} call={call} onSaved={onSaved} /> : <SeatsEditor P={P} call={call} onSaved={onSaved} />}
    </Workspace>
  );
}

function StagesEditor({ P, call, onSaved }: { P: Pipeline; call: Call; onSaved: (m: string) => void }) {
  const openIn = (key: string) => P.applicants.filter(a => a.stage === key).length;
  const [own, setOwn] = useState<StageDraft[]>(() => P.stages.filter(s => !s.system).map(s => ({ key: s.key, label: s.label, active: s.active, open: openIn(s.key) })));
  const offer = P.stages.find(s => s.system === 'offer')!;
  const enrolled = P.stages.find(s => s.system === 'enrolled')!;
  const [offerLabel, setOfferLabel] = useState(offer.label);
  const [days, setDays] = useState(String(offer.respondDays ?? 14));
  const [enrolledLabel, setEnrolledLabel] = useState(enrolled.label);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (i: number, patch: Partial<StageDraft>) => setOwn(xs => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) => setOwn(xs => {
    const j = i + by;
    if (j < 0 || j >= xs.length) return xs;
    const copy = [...xs];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await call('/api/admin/admissions/setup', 'POST', {
        kind: 'stages', own: own.map(s => ({ key: s.key, label: s.label, active: s.active })),
        offer: { label: offerLabel, respondDays: Number(days) }, enrolled: { label: enrolledLabel },
      });
      onSaved('Admissions stages saved');
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Could not save the stages.'); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <CardHead title="Stages" sub="Your own stages run in this order before the offer. Rename, reorder, add or retire them; a retired stage keeps its name in past records. Offer and Enrolled always come last: they can be renamed, not moved." />
      {own.map((s, i) => (
        <div className="row" key={s.key ?? `new-${i}`} style={{ gap: 10, flexWrap: 'wrap', opacity: s.active ? 1 : 0.6 }}>
          <span className="muted num" style={{ width: 22 }}>{i + 1}</span>
          <input className="cmp-in" style={{ flex: '1 1 200px' }} value={s.label} maxLength={40} aria-label={`Stage ${i + 1} name`} onChange={e => set(i, { label: e.target.value })} />
          <span className="muted" style={{ fontSize: 12.5, width: 90 }}>{s.key ? plural(s.open, 'applicant') : 'New'}</span>
          <button className="btn sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
          <button className="btn sm" aria-label="Move down" disabled={i === own.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
          {s.key ? (
            <button className="btn sm" disabled={s.active && s.open > 0} title={s.active && s.open > 0 ? 'Move its applicants on first' : undefined}
              onClick={() => set(i, { active: !s.active })}>{s.active ? 'Retire' : 'Use again'}</button>
          ) : <button className="btn sm" onClick={() => setOwn(xs => xs.filter((_, j) => j !== i))}>Remove</button>}
        </div>
      ))}
      <button className="btn sm" style={{ margin: '10px 0 18px' }} disabled={own.length >= 12} onClick={() => setOwn(xs => [...xs, { key: null, label: '', active: true, open: 0 }])}><Plus size={13} /> Add a stage</button>
      <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Field label="OFFER STAGE NAME" htmlFor="st-offer"><input id="st-offer" className="cmp-in" maxLength={40} value={offerLabel} onChange={e => setOfferLabel(e.target.value)} /></Field>
        <Field label="DAYS TO ACCEPT AN OFFER" htmlFor="st-days" hint="After this the offer lapses and the seat goes to the waitlist.">
          <input id="st-days" type="number" min={1} max={90} className="cmp-in" value={days} onChange={e => setDays(e.target.value)} />
        </Field>
        <Field label="ENROLLED STAGE NAME" htmlFor="st-enr"><input id="st-enr" className="cmp-in" maxLength={40} value={enrolledLabel} onChange={e => setEnrolledLabel(e.target.value)} /></Field>
      </div>
      {err && <div className="err" role="alert" style={{ marginBottom: 10 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn pri" disabled={busy || own.some(s => !s.label.trim()) || !own.some(s => s.active)} onClick={save}>{busy ? 'Saving…' : 'Save stages'}</button>
      </div>
    </div>
  );
}

function SeatsEditor({ P, call, onSaved }: { P: Pipeline; call: Call; onSaved: (m: string) => void }) {
  const line = (g: number) => P.seats.find(s => s.grade === g);
  const [cap, setCap] = useState<Record<number, string>>(() =>
    Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, line(i + 1)?.capacity != null ? String(line(i + 1)!.capacity) : ''])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const changed = Array.from({ length: 12 }, (_, i) => i + 1).filter(g => (line(g)?.capacity ?? null) !== (cap[g] === '' ? null : Number(cap[g])));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await call('/api/admin/admissions/setup', 'POST', { kind: 'seats', session: P.session, seats: changed.map(g => ({ grade: g, capacity: cap[g] === '' ? null : Number(cap[g]) })) });
      onSaved(r.issued ? `Seats saved; ${plural(r.issued, 'offer')} went out from the waitlist` : 'Seats saved');
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Could not save the seats.'); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <CardHead title={`Seats for new admissions · AY ${P.session.replace('-', '–')}`} sub="Blank means no limit. Fewer seats than are already held never takes an offer back; new offers wait on the list until seats free." />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Grade</th><th className="c">Seats</th><th className="c">Held</th><th className="c">Waitlist</th><th className="c">Left after saving</th></tr></thead>
          <tbody>{Array.from({ length: 12 }, (_, i) => i + 1).map(g => {
            const l = line(g);
            const c = cap[g] === '' ? null : Number(cap[g]);
            return (
              <tr key={g}>
                <td><b>Grade {g}</b></td>
                <td className="c"><input className="cmp-in" style={{ width: 90, textAlign: 'center' }} inputMode="numeric" aria-label={`Seats in grade ${g}`} value={cap[g]}
                  onChange={e => setCap(x => ({ ...x, [g]: e.target.value.replace(/\D/g, '').slice(0, 4) }))} placeholder="No limit" /></td>
                <td className="c num">{l?.held ?? 0}</td>
                <td className="c num">{l?.waitlisted || ''}</td>
                <td className="c num">{c === null ? '—' : c - (l?.held ?? 0)}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {err && <div className="err" role="alert" style={{ margin: '10px 0' }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn pri" disabled={busy || !changed.length} onClick={save}>{busy ? 'Saving…' : changed.length ? `Save ${plural(changed.length, 'grade')}` : 'No changes'}</button>
      </div>
    </div>
  );
}
