'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { InfoIcon as Info } from '@phosphor-icons/react/dist/ssr/Info';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { WarningOctagonIcon as WarningOctagon } from '@phosphor-icons/react/dist/ssr/WarningOctagon';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import type { AttentionAction, AttentionItem, RegistrySchool, Severity } from '@/lib/ops/attention';
import { CURRICULA, PLANS, PLAN_INFO, annualValue, effectivePrice } from '@/lib/settings/registry';
import { Kpi, PlanChip, ReasonAction, Section, StatusChip, Table, errText, fmtDate, fmtDateTime, inr, num, plural } from './_ui';
import { useOpsApi } from './useOpsApi';
import { extendedEnd, useSchoolPatch } from './useSchoolPatch';

interface JournalRow { id: number; at: string; actor_email: string | null; scope: string; school_id: string | null; key: string; old_value: unknown; new_value: unknown; reason: string }
interface Data {
  schools: RegistrySchool[];
  attention: AttentionItem[];
  health: { crit: number; warn: number; info: number; ok: number };
  enquiries: { new: number; open: number; total: number };
  ai: { costUsd: number; calls: number; failed: number; days: number } | null;
  usdToInr: number;
  journal: JournalRow[];
  operators: number | null;
  checkedAt: string;
}

const SEV: Record<Severity, { icon: typeof Warning; color: string; label: string }> = {
  crit: { icon: WarningOctagon, color: '#E11D48', label: 'Critical' },
  warn: { icon: Warning, color: '#F59E0B', label: 'Warning' },
  info: { icon: Info, color: '#4C8DFF', label: 'Note' },
};

/** Platform Manager > Overview: the state of the business and everything that needs a person. */
export default function OverviewConsole() {
  const api = useOpsApi();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [toast, toastEl] = useToast(3200);
  const reload = useCallback(() => { setLoading(true); setNonce(n => n + 1); }, []);

  useEffect(() => {
    let live = true;
    api<Data>('/overview')
      .then(d => { if (live) { setData(d); setErr(null); } })
      .catch(e => { if (live) setErr(errText(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [api, nonce]);

  const m = useMemo(() => {
    if (!data) return null;
    const s = data.schools;
    const students = s.reduce((n, x) => n + (x.roles.student ?? 0), 0);
    const paying = s.filter(x => x.plan !== 'pilot' && x.active);
    const pilots = s.filter(x => x.plan === 'pilot' && x.active);
    const arr = paying.reduce((n, x) => n + (annualValue(x, x.roles.student ?? 0) ?? 0), 0);
    const pipeline = pilots.reduce((n, x) => n + (annualValue(x, x.roles.student ?? 0) ?? 0), 0);
    const byTier = PLANS.map(p => {
      const list = s.filter(x => x.plan === p);
      return {
        plan: p, schools: list.length,
        students: list.reduce((n, x) => n + (x.roles.student ?? 0), 0),
        value: list.reduce((n, x) => n + (annualValue(x, x.roles.student ?? 0) ?? 0), 0),
      };
    });
    return { students, paying, pilots, arr, pipeline, byTier, suspended: s.filter(x => !x.active).length };
  }, [data]);

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Overview"
        sub={data ? <>Every school on Sthara and what needs attention · updated {fmtDateTime(data.checkedAt)}</> : 'Every school on Sthara and what needs attention.'}
        actions={<>
          <button className="btn" onClick={reload} disabled={loading}><ArrowsClockwise size={15} weight="bold" /> {loading ? 'Loading…' : 'Refresh'}</button>
          <Link className="btn pri" href="/ops/schools?new=1"><Plus size={15} weight="bold" /> New school</Link>
        </>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}

      {!data || !m ? (err ? null : (
        <>
          <div className="kpis">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={140} style={{ borderRadius: 20 }} />)}</div>
          <Skeleton h={320} style={{ borderRadius: 20 }} />
        </>
      )) : (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <div className="kpis">
            <Kpi label="SCHOOLS" value={num(data.schools.length)} onClick={() => router.push('/ops/schools')}
              note={<>{m.paying.length} live · {m.pilots.length} in pilot{m.suspended ? ` · ${m.suspended} suspended` : ''}</>} />
            <Kpi label="CONTRACT VALUE / YR" value={inr(m.arr)} tone={m.arr ? 'g' : undefined}
              note={m.pipeline ? <>{inr(m.pipeline)} more when pilots convert</> : 'Live schools, at contract or list price'} />
            <Kpi label="STUDENTS" value={num(m.students)} onClick={() => router.push('/ops/people?role=student')}
              note={`${num(data.schools.reduce((n, x) => n + (x.roles.teacher ?? 0), 0))} teachers · ${num(data.schools.reduce((n, x) => n + (x.roles.parent ?? 0), 0))} parents`} />
            <Kpi label="AI SPEND THIS MONTH" value={data.ai ? inr(data.ai.costUsd * data.usdToInr, data.ai.costUsd * data.usdToInr < 1e5) : '—'}
              onClick={() => router.push('/ops/usage?range=mtd')}
              note={data.ai ? `${num(data.ai.calls)} calls${data.ai.failed ? ` · ${data.ai.failed} failed` : ''}` : 'Metering not set up'} />
          </div>

          <Section title="Needs attention"
            sub={data.attention.length ? `${plural(data.attention.length, 'item')}, most urgent first. Each change asks for a reason and is kept in the audit log.` : undefined}
            actions={<>
              <Link className="btn sm" href="/ops/health">System health {data.health.crit ? <Chip tone="r">{data.health.crit}</Chip> : data.health.warn ? <Chip tone="a">{data.health.warn}</Chip> : null}</Link>
            </>}>
            {data.attention.length === 0
              ? <Empty icon={<CheckCircle size={28} weight="duotone" />} title="Nothing needs you right now">Every school is set up, no pilot is ending and every check is healthy.</Empty>
              : <div>{data.attention.map(a => <AttentionRow key={a.id} a={a} schools={data.schools} onDone={msg => { toast(msg); reload(); }} />)}</div>}
          </Section>

          <div className="g2">
            <Section title="Revenue by tier" sub="Per student per year. Seats are the contracted student count, else the students on the platform.">
              <Table head={<tr><th>Tier</th><th className="r">List price</th><th className="r">Schools</th><th className="r">Students</th><th className="r">Annual value</th></tr>}>
                {m.byTier.map(t => (
                  <tr key={t.plan}>
                    <td><PlanChip plan={t.plan} /> <span className="muted" style={{ fontSize: 12 }}>{PLAN_INFO[t.plan].position}</span></td>
                    <td className="r">{PLAN_INFO[t.plan].price ? inr(PLAN_INFO[t.plan].price, true) : t.plan === 'pilot' ? 'Tier price' : 'Custom'}</td>
                    <td className="r">{t.schools}</td>
                    <td className="r">{num(t.students)}</td>
                    <td className="r" style={{ fontWeight: 700 }}>{t.value ? inr(t.value) : '—'}{t.plan === 'pilot' && t.value ? <div className="sub">if converted</div> : null}</td>
                  </tr>
                ))}
              </Table>
            </Section>

            <Section title="Pilots" sub="One grade, one term, fully credited on conversion."
              actions={<Link className="btn sm" href="/ops/schools?status=pilot">All pilots <ArrowRight size={13} weight="bold" /></Link>}>
              {m.pilots.length === 0 ? <Empty icon={<CheckCircle size={26} weight="duotone" />} title="No pilots running" /> : (
                <Table head={<tr><th>School</th><th>Ends</th><th className="r">Converts at</th></tr>}>
                  {[...m.pilots].sort((a, b) => (a.trialEndsAt ?? '').localeCompare(b.trialEndsAt ?? '')).map(s => (
                    <tr key={s.id} className="click" onClick={() => router.push(`/ops/schools/${s.id}`)}>
                      <td><div className="nm">{s.name}</div><div className="sub mono">{s.code}</div></td>
                      <td>{fmtDate(s.trialEndsAt)}<div className="sub">{s.trialExpired ? 'Ended' : `${plural(s.trialDaysLeft ?? 0, 'day')} left`}</div></td>
                      <td className="r">{inr(annualValue(s, s.roles.student ?? 0))}<div className="sub">{effectivePrice(s) ? `${inr(effectivePrice(s), true)}/student` : 'at Shikhara'}</div></td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
          </div>

          <Section title="Recent changes" actions={<Link className="btn sm" href="/ops/audit">Audit log <ArrowRight size={13} weight="bold" /></Link>}>
            {data.journal.length === 0 ? <Empty icon={<CheckCircle size={26} weight="duotone" />} title="No changes yet" /> : (
              <Table head={<tr><th>When</th><th>What</th><th>Change</th><th>Why</th><th>By</th></tr>}>
                {data.journal.map(j => (
                  <tr key={j.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(j.at)}</td>
                    <td className="nm">{j.scope === 'platform' ? 'Platform' : data.schools.find(s => s.id === j.school_id)?.name ?? 'Deleted school'} · {j.key}</td>
                    <td><span className="muted">{show(j.old_value)}</span> → <b>{show(j.new_value)}</b></td>
                    <td>{j.reason}</td>
                    <td className="muted" style={{ overflowWrap: 'anywhere' }}>{j.actor_email ?? '—'}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>
        </div>
      )}
      {toastEl}
    </>
  );
}

const show = (v: unknown) => (v === null || v === undefined ? 'None' : typeof v === 'boolean' ? (v ? 'On' : 'Off') : typeof v === 'string' ? (/^\d{4}-\d{2}-\d{2}T/.test(v) ? fmtDate(v) : v || 'Empty') : JSON.stringify(v));

function AttentionRow({ a, schools, onDone }: { a: AttentionItem; schools: RegistrySchool[]; onDone: (msg: string) => void }) {
  const patch = useSchoolPatch();
  const sev = SEV[a.severity];
  const Icon = sev.icon;
  const school = a.schoolId ? schools.find(s => s.id === a.schoolId) : undefined;
  return (
    <div className="ops-q">
      <Icon size={20} weight="fill" color={sev.color} className="ic" aria-label={sev.label} />
      <div className="tx">
        <b>{a.title}</b>
        <p>{a.detail}</p>
        {school && <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}><PlanChip plan={school.plan} /><StatusChip s={school} /></div>}
      </div>
      <div className="ac">
        {a.actions.map((x, i) => <ActionButton key={i} x={x} school={school} patch={patch} onDone={onDone} />)}
      </div>
    </div>
  );
}

function ActionButton({ x, school, patch, onDone }: { x: AttentionAction; school?: RegistrySchool; patch: ReturnType<typeof useSchoolPatch>; onDone: (m: string) => void }) {
  const [curriculum, setCurriculum] = useState<string>('CBSE');
  if (x.kind === 'open') return <Link className="btn sm" href={x.href}>{x.label} <ArrowRight size={13} weight="bold" /></Link>;
  if (!school) return null;
  if (x.kind === 'extend-trial') {
    const to = extendedEnd(school.trialEndsAt, x.days);
    return (
      <ReasonAction label={`Extend ${x.days} days`} confirm={`Extend to ${fmtDate(`${to}T12:00:00+05:30`)}`}
        placeholder="e.g. Pilot review meeting moved to next month"
        run={async reason => { await patch(school.id, { trialEndsAt: to }, reason, school.updatedAt); onDone(`${school.name}: pilot extended to ${fmtDate(`${to}T12:00:00+05:30`)}.`); }} />
    );
  }
  if (x.kind === 'reactivate') {
    return (
      <ReasonAction label="Reactivate" confirm="Reactivate school" placeholder="e.g. Invoice paid"
        run={async reason => { const r = await patch(school.id, { active: true }, reason, school.updatedAt); onDone(`${school.name} reactivated.${r.access ? ` ${r.access.changed} logins unlocked.` : ''}`); }} />
    );
  }
  return (
    <ReasonAction label="Set curriculum" confirm={`Set ${curriculum}`} placeholder="e.g. Confirmed with the principal"
      extra={
        <select className="cmp-sel" value={curriculum} onChange={e => setCurriculum(e.target.value)} aria-label="Curriculum">
          {CURRICULA.map(c => <option key={c}>{c}</option>)}
        </select>
      }
      run={async reason => { await patch(school.id, { curriculum }, reason, school.updatedAt); onDone(`${school.name}: curriculum set to ${curriculum}.`); }} />
  );
}

