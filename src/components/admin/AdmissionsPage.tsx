'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { UserPlusIcon as UserPlus } from '@phosphor-icons/react/dist/ssr/UserPlus';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { TargetIcon as Target } from '@phosphor-icons/react/dist/ssr/Target';
import { HourglassIcon as Hourglass } from '@phosphor-icons/react/dist/ssr/Hourglass';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { Bar, Chip, Empty, PageBar, type Tone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import {
  nextStage, SOURCES, STAGE_COLOR, STAGE_LABEL, STAGE_ONE, STAGES, STALE_DAYS, type Applicant, type ApplicantStage,
} from '@/lib/admin/admissions';
import type { AdminDesk } from '@/lib/admin/desk';
import { ago, fmtDate, isoDay, plural } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { CardHead, DeskGate, Field, Kpi, MissingNotice, Workspace, downloadCsv } from './kit';
import { FinanceTabs } from './fees/FeesPage';

const STAGE_TONE: Record<ApplicantStage, Tone> = {
  enquiry: 'b', application: 'b', assessment: 'p', offer: 'a', enrolled: 'g', rejected: 'r', withdrawn: 'n',
};
type View = ApplicantStage | 'open' | 'all';

export default function AdmissionsPage() {
  return <DeskGate need="admissions.read">{desk => <Admissions desk={desk} />}</DeskGate>;
}

function Admissions({ desk }: { desk: AdminDesk }) {
  const { call, reload } = useAdminDesk();
  const router = useRouter();
  const params = useSearchParams();
  const [toast, toastEl] = useToast();
  const P = desk.admissions;
  const [view, setView] = useState<View>('open');
  const [adding, setAdding] = useState(false);
  const openId = params.get('applicant');
  const current = openId ? P.applicants.find(a => a.id === openId) ?? null : null;
  const setOpen = useCallback((id: string | null) => router.replace(id ? `/admin/admissions?applicant=${id}` : '/admin/admissions', { scroll: false }), [router]);
  const done = (msg: string) => { toast(msg); reload(); };

  const rows = useMemo(() => P.applicants.filter(a =>
    view === 'all' ? true : view === 'open' ? a.open : a.stage === view), [P.applicants, view]);

  const exportCsv = () => downloadCsv(`admissions-${P.session}-${isoDay()}.csv`, [
    ['Name', 'Grade', 'Stage', 'Furthest stage', 'Days in stage', 'Source', 'Previous school', 'Guardian', 'Phone', 'Email', 'Assessment on', 'Added'],
    ...P.applicants.map(a => [a.name, a.grade, STAGE_ONE[a.stage], STAGE_ONE[a.furthest], a.open ? a.daysInStage : '', SOURCES[a.source] || a.source,
      a.previousSchool, a.guardianName, a.guardianPhone, a.guardianEmail, a.assessmentOn, a.createdAt.slice(0, 10)]),
  ]);

  return (
    <>
      {toastEl}
      <PageBar eyebrow="ADMISSIONS & FEES" title={`Admissions · AY ${P.session.replace('-', '–')}`}
        sub={`${plural(P.total, 'applicant')} · ${P.enrolled} enrolled · ${plural(P.closed.rejected, 'rejection')} · ${P.closed.withdrawn} withdrawn`}
        actions={<>
          <button className="btn" onClick={exportCsv} disabled={!P.total}><DownloadSimple size={16} /> Export</button>
          {desk.me.access.can('admissions.manage') && <button className="btn pri" onClick={() => setAdding(true)}><UserPlus size={16} weight="bold" /> New enquiry</button>}
        </>} />
      <FinanceTabs />
      <MissingNotice desk={desk} tables={['admission_applicants']} />

      <div className="kpis">
        <Kpi label="APPLICANTS" value={P.total} icon={UsersThree} note={`${P.applicants.filter(a => a.open).length} still open`} onClick={() => setView('open')} />
        <Kpi label="ENROLLED" value={P.enrolled} icon={CheckCircle} valueColor="var(--green)" note={`for AY ${P.session.replace('-', '–')}`} onClick={() => setView('enrolled')} />
        <Kpi label="CONVERSION" value={P.conversion !== null ? `${P.conversion}%` : '—'} icon={Target}
          note={P.conversion !== null ? 'Enrolled, of applicants with an outcome' : 'Once applicants are decided'} />
        <Kpi label="IDLE OVER 2 WEEKS" value={P.stale.length} icon={Hourglass} valueColor={P.stale.length ? 'var(--amber)' : undefined}
          note={P.stale.length ? `Longest: ${P.stale[0].name}, ${P.stale[0].daysInStage} days` : 'Every open applicant moved recently'}
          noteColor={P.stale.length ? 'var(--amber)' : 'var(--mut)'} />
      </div>

      <div className="g2" style={{ marginBottom: 22 }}>
        <div className="card">
          <CardHead title="Funnel" sub="Everyone who reached each stage, including those later rejected or withdrawn. Pick a stage to list who's there now." />
          {STAGES.map((s, i) => {
            const f = P.funnel[i];
            return (
              <button key={s} className="row-btn" onClick={() => setView(s)} aria-pressed={view === s}>
                <b style={{ flex: '0 0 150px', fontSize: 14 }}>{STAGE_LABEL[s]}</b>
                <Bar value={f.share ?? 0} color={STAGE_COLOR[s]} />
                <b className="num" style={{ width: 40, textAlign: 'right' }}>{f.reached}</b>
                <span className="muted num" style={{ width: 70, textAlign: 'right', fontSize: 12.5 }}>{i && f.fromPrev !== null ? `${f.fromPrev}% on` : f.share !== null ? `${f.share}%` : ''}</span>
              </button>
            );
          })}
          {P.leak ? (
            <div className="note" style={{ marginTop: 16 }}>
              <b>Biggest drop: {STAGE_ONE[P.leak.from].toLowerCase()} to {STAGE_ONE[P.leak.to].toLowerCase()}</b>. Only {P.leak.rate}% move on at that step.
            </div>
          ) : P.total > 0 && <div className="note" style={{ marginTop: 16 }}>Conversion between stages is shown once at least three applicants reach a stage.</div>}
        </div>
        <div className="card">
          <CardHead title="By grade and source" />
          {P.byGrade.length ? (
            <>
              {P.byGrade.map(g => (
                <div className="row" key={g.grade}>
                  <b style={{ flex: '0 0 84px', fontSize: 14 }}>Grade {g.grade}</b>
                  <span style={{ flex: 1 }} className="muted">{plural(g.total, 'applicant')} · {g.open} open</span>
                  <Chip tone={g.enrolled ? 'g' : 'n'}>{g.enrolled} ENROLLED</Chip>
                </div>
              ))}
              <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', margin: '18px 0 4px' }}>WHERE THEY HEARD OF US</div>
              {P.bySource.map(s => (
                <div className="row" key={s.source}>
                  <span style={{ flex: '0 0 130px', fontSize: 13.5 }}>{SOURCES[s.source] || s.source}</span>
                  <Bar value={(s.total / Math.max(1, P.total)) * 100} color="#7C5CFC" />
                  <span className="muted num" style={{ width: 100, textAlign: 'right', fontSize: 12.5 }}>{s.total} · {s.enrolled} enrolled</span>
                </div>
              ))}
            </>
          ) : <Empty icon={<UsersThree size={26} weight="duotone" />} title="No applicants yet">Log each enquiry as it comes in; the funnel and conversion build from there.</Empty>}
        </div>
      </div>

      <div className="card">
        <CardHead title="Applicants" right={
          <div className="seg" role="group" aria-label="Filter applicants" style={{ flexWrap: 'wrap' }}>
            {(['open', ...STAGES, 'rejected', 'withdrawn', 'all'] as View[]).map(v => (
              <button key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
                {v === 'open' ? 'Open' : v === 'all' ? 'All' : STAGE_ONE[v as ApplicantStage]}
              </button>
            ))}
          </div>} />
        {rows.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Applicant</th><th className="c">Grade</th><th>Stage</th><th className="c">In stage</th><th>Source</th><th /></tr></thead>
              <tbody>{rows.map(a => (
                <ApplicantRow key={a.id} a={a} canManage={desk.me.access.can('admissions.manage')} onOpen={() => setOpen(a.id)}
                  onAdvance={async () => {
                    const to = nextStage(a.stage)!;
                    await call('/api/admin/admissions', 'PATCH', { id: a.id, to });
                    done(`${a.name} moved to ${STAGE_ONE[to].toLowerCase()}`);
                  }} />
              ))}</tbody>
            </table>
          </div>
        ) : (
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
      {current && <ApplicantRecord a={current} desk={desk} call={call} onClose={() => setOpen(null)} onChanged={done} />}
    </>
  );
}

function ApplicantRow({ a, canManage, onOpen, onAdvance }: { a: Applicant; canManage: boolean; onOpen: () => void; onAdvance: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = a.open && canManage ? nextStage(a.stage) : null;
  return (
    <tr className="click" onClick={onOpen} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}>
      <td><b style={{ fontSize: 14 }}>{a.name}</b><div className="muted" style={{ fontSize: 12 }}>{a.previousSchool || 'Previous school not recorded'}</div>
        {err && <div style={{ color: 'var(--red)', fontSize: 12 }}>{err}</div>}</td>
      <td className="c num">{a.grade}</td>
      <td><Chip tone={STAGE_TONE[a.stage]}>{STAGE_ONE[a.stage].toUpperCase()}</Chip></td>
      <td className="c num" style={{ color: a.daysInStage > STALE_DAYS ? 'var(--amber)' : undefined }}>{a.open ? `${a.daysInStage} d` : '—'}</td>
      <td className="muted" style={{ fontSize: 13 }}>{SOURCES[a.source] || a.source}</td>
      <td className="r" onClick={e => e.stopPropagation()}>
        {next && (
          <button className="btn sm pri" disabled={busy} onClick={async () => {
            setBusy(true); setErr(null);
            try { await onAdvance(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
          }}>{busy ? 'Moving…' : <>To {STAGE_ONE[next].toLowerCase()} <ArrowRight size={13} weight="bold" /></>}</button>
        )}
      </td>
    </tr>
  );
}

interface Draft { name: string; grade: string; dob: string; guardianName: string; guardianPhone: string; guardianEmail: string; previousSchool: string; source: string; notes: string }

function DetailsForm({ d, set }: { d: Draft; set: (k: keyof Draft, v: string) => void }) {
  return (
    <>
      <div className="g2" style={{ gap: 16 }}>
        <Field label="APPLICANT'S FULL NAME" htmlFor="ap-name"><input id="ap-name" className="cmp-in" value={d.name} maxLength={120} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="GRADE APPLIED FOR" htmlFor="ap-grade">
          <select id="ap-grade" className="cmp-sel" value={d.grade} onChange={e => set('grade', e.target.value)}>
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

function NewApplicant({ session, onClose, onSave }: { session: string; onClose: () => void; onSave: (b: any) => Promise<void> }) {
  const [d, setD] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!d.name.trim()) { setErr('Enter the applicant\'s name.'); return; }
    if (!d.grade) { setErr('Pick the grade applied for.'); return; }
    setBusy(true); setErr(null);
    try { await onSave({ ...d, grade: Number(d.grade), session }); } catch (e: any) { setErr(e.message); setBusy(false); }
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

function ApplicantRecord({ a, desk, call, onClose, onChanged }: {
  a: Applicant; desk: AdminDesk; call: (p: string, m: 'PATCH', b: unknown) => Promise<any>; onClose: () => void; onChanged: (m: string) => void;
}) {
  const [d, setD] = useState<Draft>({
    name: a.name, grade: String(a.grade), dob: a.dob || '', guardianName: a.guardianName || '', guardianPhone: a.guardianPhone || '',
    guardianEmail: a.guardianEmail || '', previousSchool: a.previousSchool || '', source: a.source, notes: a.notes || '',
  });
  const [assessmentOn, setAssessmentOn] = useState(a.assessmentOn || '');
  const [closing, setClosing] = useState<'rejected' | 'withdrawn' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const names = new Map(desk.workforce.admins.map(x => [x.id, x.name]));
  const manage = desk.me.access.can('admissions.manage');
  const next = a.open && manage ? nextStage(a.stage) : null;

  const act = async (body: any, msg: string) => {
    setBusy(true); setErr(null);
    try { await call('/api/admin/admissions', 'PATCH', { id: a.id, ...body }); setClosing(null); setNote(''); onChanged(msg); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Workspace wide title={a.name} sub={`Grade ${a.grade} · ${STAGE_ONE[a.stage]}${a.open ? ` for ${plural(a.daysInStage, 'day')}` : ''} · added ${fmtDate(a.createdAt)}`} onClose={onClose}
      actions={<div className="acts">
        {manage && a.open && <button className="btn" disabled={busy} onClick={() => setClosing('withdrawn')}>Withdrawn</button>}
        {manage && a.open && <button className="btn" disabled={busy} onClick={() => setClosing('rejected')}>Reject</button>}
        {manage && !a.open && a.stage !== 'enrolled' && <button className="btn" disabled={busy} onClick={() => act({ to: 'reopen' }, `${a.name} reopened`)}>Reopen</button>}
        {next && <button className="btn pri" disabled={busy} onClick={() => act({ to: next }, `${a.name} moved to ${STAGE_ONE[next].toLowerCase()}`)}>Move to {STAGE_ONE[next].toLowerCase()} <ArrowRight size={13} weight="bold" /></button>}
      </div>}>
      {err && <div className="err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {closing && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--red)' }}>
          <Field label={closing === 'rejected' ? 'REASON FOR REJECTION' : 'WHY DID THEY WITHDRAW?'} htmlFor="close-why" hint="Stays on the applicant's record.">
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
          <CardHead title="Details" right={manage && <button className="btn sm" disabled={busy} onClick={() => act({ fields: { ...d, grade: Number(d.grade), assessmentOn } }, 'Details saved')}>Save details</button>} />
          <DetailsForm d={d} set={(k, v) => setD(x => ({ ...x, [k]: v }))} />
          {(a.stage === 'assessment' || a.assessmentOn) && (
            <Field label="ASSESSMENT DATE" htmlFor="ap-assess"><input id="ap-assess" type="date" className="cmp-in" value={assessmentOn} onChange={e => setAssessmentOn(e.target.value)} /></Field>
          )}
        </div>
        <div className="card">
          <CardHead title="History" />
          {a.events.length ? a.events.map(e => (
            <div className="row" key={e.id} style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.from ? `${STAGE_ONE[e.from as ApplicantStage] ?? e.from} to ${STAGE_ONE[e.to as ApplicantStage] ?? e.to}` : `Added as ${STAGE_ONE[e.to as ApplicantStage]?.toLowerCase() ?? e.to}`}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{e.actorId ? names.get(e.actorId) ?? 'Admin' : 'Admin'} · {ago(e.at)}</div>
                {e.note && <div style={{ fontSize: 12.5, marginTop: 4 }}>&ldquo;{e.note}&rdquo;</div>}
              </div>
            </div>
          )) : <p className="muted" style={{ fontSize: 13 }}>No stage changes recorded.</p>}
        </div>
      </div>
    </Workspace>
  );
}
