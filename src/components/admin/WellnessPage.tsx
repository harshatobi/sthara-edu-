'use client';

import { useState } from 'react';
import { HeartIcon as Heart } from '@phosphor-icons/react/dist/ssr/Heart';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { BatteryMediumIcon as BatteryMedium } from '@phosphor-icons/react/dist/ssr/BatteryMedium';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { NotePencilIcon as NotePencil } from '@phosphor-icons/react/dist/ssr/NotePencil';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { SealCheckIcon as SealCheck } from '@phosphor-icons/react/dist/ssr/SealCheck';
import { Bar, Chip, Empty, PageBar, hmColor } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import type { AdminDesk } from '@/lib/admin/desk';
import { daysBetween, fmtDate, isoDay, plural } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { CardHead, DeskGate, Field, Kpi, MissingNotice } from './kit';

export default function WellnessPage() {
  return <DeskGate need="wellness.read">{desk => <Wellness desk={desk} />}</DeskGate>;
}

interface Section { title: string; detail: string; auto: boolean; done: boolean }

function Wellness({ desk }: { desk: AdminDesk }) {
  const { call, reload } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const W = desk.wellness;
  const F = desk.filing;
  const canFile = desk.me.access.can('wellness.file');
  const filed = F.status === 'filed';
  const [form, setForm] = useState({
    interventions: F.data.interventions ?? '', counsellorReferrals: F.data.counsellorReferrals ?? '', trainingHours: F.data.trainingHours ?? '',
    signatoryName: F.data.signatoryName ?? '', signatoryTitle: F.data.signatoryTitle ?? 'Principal', dueOn: F.dueOn ?? '',
  });
  const [busy, setBusy] = useState<'save' | 'file' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const consents = desk.compliance.consents.find(c => c.type === 'wellness_checkin')!;
  const has = (v: unknown) => v !== '' && v !== undefined && v !== null;
  const sections: Section[] = [
    { title: 'How we measure student wellbeing', detail: 'Daily energy check-ins on a 1 to 5 scale, with an optional private journal.', auto: true, done: W.checkins > 0 },
    { title: 'How many students took part', detail: W.students ? `${W.students} of ${desk.students.length} students, ${plural(W.checkins, 'check-in')} this session.` : 'No check-ins yet this session.', auto: true, done: W.students > 0 },
    { title: 'How we flag students at risk', detail: 'A check-in at energy 2 or below is flagged in the wellness feed of every teacher of that student.', auto: true, done: true },
    { title: 'Parent consent records', detail: `${consents.granted} of ${desk.students.length} students have wellness consent on file.`, auto: true, done: consents.granted > 0 },
    { title: 'Support given', detail: has(form.interventions) ? `${form.interventions} interventions recorded.` : 'Number of interventions this session. Manual entry.', auto: false, done: has(F.data.interventions) },
    { title: 'Counsellor referrals', detail: has(form.counsellorReferrals) ? `${form.counsellorReferrals} referrals.` : 'Manual entry.', auto: false, done: has(F.data.counsellorReferrals) },
    { title: 'Staff wellness training hours', detail: has(form.trainingHours) ? `${form.trainingHours} hours.` : 'Manual entry.', auto: false, done: has(F.data.trainingHours) },
    { title: 'Signature', detail: F.data.signatoryName ? `${F.data.signatoryName}, ${F.data.signatoryTitle}` : 'Name and title of the person signing. Manual entry.', auto: false, done: has(F.data.signatoryName) && has(F.data.signatoryTitle) },
  ];
  const doneCount = sections.filter(s => s.done).length;
  const autoDone = sections.filter(s => s.auto && s.done).length;
  const dueIn = F.dueOn ? daysBetween(isoDay(), F.dueOn) : null;

  const save = async () => {
    setBusy('save'); setErr(null);
    try {
      await call('/api/admin/filings', 'PUT', {
        dueOn: form.dueOn || null,
        data: { interventions: form.interventions, counsellorReferrals: form.counsellorReferrals, trainingHours: form.trainingHours, signatoryName: form.signatoryName, signatoryTitle: form.signatoryTitle },
      });
      toast('Draft saved'); reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  const file = async () => {
    setBusy('file'); setErr(null);
    try { await call('/api/admin/filings', 'POST', { file: true }); setConfirming(false); toast('Report filed'); reload(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  const maxWeek = Math.max(1, ...W.weeks.map(w => w.energy ?? 0));

  return (
    <>
      {toastEl}
      <PageBar eyebrow="CBSE WELLNESS MANDATE" title={`Wellness report · AY ${desk.session.replace('-', '–')}`}
        sub={`${F.dueOn ? `Filing due ${fmtDate(F.dueOn)}${dueIn !== null && !filed ? (dueIn < 0 ? ` · ${plural(-dueIn, 'day')} overdue` : ` · ${plural(dueIn, 'day')} left`) : ''} · ` : ''}${autoDone} of ${sections.filter(s => s.auto).length} sections fill from live data`}
        actions={<>
          <Chip tone={filed ? 'g' : 'a'}>{filed ? 'FILED' : 'DRAFT'}</Chip>
          <button className="btn" onClick={() => window.print()}><Printer size={16} /> Print</button>
          {!filed && canFile && <button className="btn red" disabled={doneCount < sections.length || busy !== null} onClick={() => setConfirming(true)}
            title={doneCount < sections.length ? 'Complete every section first' : undefined}><SealCheck size={16} weight="bold" /> File report</button>}
        </>} />
      <MissingNotice desk={desk} tables={['school_filings', 'school_wellness_report']} />
      {err && <div className="err" role="alert" style={{ marginBottom: 16 }}>{err}</div>}
      {confirming && (
        <div className="card" style={{ marginBottom: 18, borderLeft: '4px solid var(--red)' }}>
          <b style={{ fontSize: 15 }}>File the report now?</b>
          <p className="muted" style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.6 }}>The live figures are frozen as they stand today and the report can no longer be edited. The filing is recorded in the audit log under your name.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn" onClick={() => setConfirming(false)}>Not yet</button>
            <button className="btn red" disabled={busy !== null} onClick={file}>{busy === 'file' ? 'Filing…' : 'File report'}</button>
          </div>
        </div>
      )}

      <div className="kpis">
        <Kpi label="SECTIONS COMPLETE" value={`${doneCount}/${sections.length}`} icon={Check} valueColor={doneCount === sections.length ? 'var(--green)' : undefined}
          note={`${autoDone} filled from live data`} noteColor="var(--green)" />
        <Kpi label="CHECK-IN PARTICIPATION" value={W.participation !== null ? `${Math.min(100, W.participation)}%` : '—'} icon={UsersThree}
          note={`${W.students} of ${plural(desk.students.length, 'student')} this session`} />
        <Kpi label="SCHOOL AVG ENERGY" value={W.energy !== null ? `${W.energy}%` : '—'} icon={BatteryMedium}
          valueColor={W.energy !== null ? hmColor(W.energy) : undefined}
          note={W.energy !== null ? `${W.lowShare}% of check-ins at energy 2 or below` : W.students ? 'Hidden until 5 or more students check in' : 'No check-ins yet'} />
        <Kpi label="WELLNESS CONSENT" value={consents.coverage !== null ? `${consents.coverage}%` : '—'} icon={Heart}
          valueColor={consents.coverage !== null && consents.coverage < 100 ? 'var(--amber)' : 'var(--green)'} note={`${consents.granted} parents have consented`} />
      </div>

      {filed && F.snapshot && (
        <div className="note" style={{ marginBottom: 18, background: '#F0FDF7', borderLeftColor: 'var(--green)', color: '#0B7A54' }}>
          <b>Filed on {fmtDate(F.filedAt)}.</b> Frozen figures: {F.snapshot.participants} of {F.snapshot.enrolled} students took part ({F.snapshot.checkins} check-ins),
          {F.snapshot.avgEnergyPct !== null ? ` average energy ${F.snapshot.avgEnergyPct}%,` : ''} {F.snapshot.consentsOnFile} consents on file.
        </div>
      )}

      <div className="g2" style={{ alignItems: 'start' }}>
        <div>
          <div className="card" style={{ marginBottom: 18 }}>
            <CardHead title="Filing checklist" />
            {sections.map(s => (
              <div className="row" key={s.title}>
                <div className="av" style={{ background: s.done ? '#DCFCE7' : '#FEF3C7', color: s.done ? 'var(--green)' : '#92600A' }} aria-hidden="true">
                  {s.done ? <Check size={17} weight="bold" /> : <NotePencil size={17} weight="bold" />}
                </div>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{s.title}</div><div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{s.detail}</div></div>
                <Chip tone={s.auto ? (s.done ? 'g' : 'n') : s.done ? 'g' : 'a'}>{s.auto ? 'AUTO' : s.done ? 'ENTERED' : 'ACTION'}</Chip>
              </div>
            ))}
          </div>
          <div className="card">
            <CardHead title="Manual sections" sub={filed ? 'Filed reports are read-only.' : canFile ? 'Saved as a draft until you file.' : 'Your role can view the report; a principal or school admin fills it in and files it.'} />
            <fieldset disabled={filed || !canFile} style={{ border: 0, padding: 0, margin: 0 }}>
              <div className="g2" style={{ gap: 14 }}>
                <Field label="INTERVENTIONS THIS SESSION" htmlFor="cb-int"><input id="cb-int" className="cmp-in num" inputMode="numeric" value={form.interventions} onChange={e => set('interventions', e.target.value.replace(/\D/g, ''))} /></Field>
                <Field label="COUNSELLOR REFERRALS" htmlFor="cb-ref"><input id="cb-ref" className="cmp-in num" inputMode="numeric" value={form.counsellorReferrals} onChange={e => set('counsellorReferrals', e.target.value.replace(/\D/g, ''))} /></Field>
                <Field label="STAFF TRAINING HOURS" htmlFor="cb-hrs"><input id="cb-hrs" className="cmp-in num" inputMode="decimal" value={form.trainingHours} onChange={e => set('trainingHours', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
                <Field label="FILING DUE ON" htmlFor="cb-due"><input id="cb-due" type="date" className="cmp-in" value={form.dueOn} onChange={e => set('dueOn', e.target.value)} /></Field>
                <Field label="SIGNED BY" htmlFor="cb-sig"><input id="cb-sig" className="cmp-in" value={form.signatoryName} maxLength={120} onChange={e => set('signatoryName', e.target.value)} placeholder="Full name" /></Field>
                <Field label="TITLE" htmlFor="cb-title"><input id="cb-title" className="cmp-in" value={form.signatoryTitle} maxLength={120} onChange={e => set('signatoryTitle', e.target.value)} /></Field>
              </div>
              {!filed && canFile && <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn pri" disabled={busy !== null} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button></div>}
            </fieldset>
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 18 }}>
            <CardHead title="Energy trend · school-wide, 12 weeks" sub="Weekly average. Weeks with fewer than 5 students checking in are hidden to protect privacy." />
            {W.weeks.some(w => w.students > 0) ? (
              <>
                <div className="spark" role="img" aria-label={`School-wide energy by week: ${W.weeks.map(w => (w.energy !== null ? `${w.energy}%` : 'hidden')).join(', ')}`}>
                  {W.weeks.map(w => (
                    <div key={w.week} className={w.energy === null ? 'na' : undefined} title={`Week of ${fmtDate(w.week, true)}: ${w.energy !== null ? `${w.energy}%` : w.students ? `${w.students} students, hidden` : 'no check-ins'}`}
                      style={{ height: `${w.energy !== null ? Math.max(6, (w.energy / maxWeek) * 100) : 18}%`, background: w.energy !== null ? hmColor(w.energy) : undefined, opacity: 0.92 }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                  {W.weeks.map(w => <span key={w.week} className="spark-lbl" style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 9, color: 'var(--mut2)', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtDate(w.week, true).replace(' ', ' ')}</span>)}
                </div>
              </>
            ) : <Empty icon={<Heart size={26} weight="duotone" />} title="No check-ins yet">Students check in from their wellness page; the trend builds week by week.</Empty>}
          </div>
          <div className="card">
            <CardHead title="By grade" sub="Same privacy rule: fewer than 5 students and the figure stays hidden." />
            {W.grades.length ? W.grades.map(g => (
              <div className="row" key={g.grade}>
                <b style={{ flex: '0 0 84px', fontSize: 14 }}>Grade {g.grade}</b>
                {g.energy !== null ? <Bar value={g.energy} /> : <div className="bar" />}
                <b style={{ width: 70, textAlign: 'right', color: g.energy !== null ? hmColor(g.energy) : 'var(--mut2)', fontSize: g.energy !== null ? 15 : 12 }}>{g.energy !== null ? `${g.energy}%` : 'hidden'}</b>
              </div>
            )) : <p className="muted" style={{ fontSize: 13.5 }}>No check-ins yet.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
