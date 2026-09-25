'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { CurrencyInrIcon as CurrencyInr } from '@phosphor-icons/react/dist/ssr/CurrencyInr';
import { HeartIcon as Heart } from '@phosphor-icons/react/dist/ssr/Heart';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { ChalkboardTeacherIcon as ChalkboardTeacher } from '@phosphor-icons/react/dist/ssr/ChalkboardTeacher';
import { TargetIcon as Target } from '@phosphor-icons/react/dist/ssr/Target';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { Bar, Empty, hmColor } from '@/components/canon/ui';
import InteractiveIcon from '@/components/ui/InteractiveIcon';
import { colorForIcon } from '@/lib/iconColors';
import { subjectName, type AdminDesk } from '@/lib/admin/desk';
import { STAGE_LABEL } from '@/lib/admin/admissions';
import { ago, daysBetween, fmtDate, inr, inrShort, isoDay, pct, plural } from '@/lib/admin/format';
import { probe, type Level } from '@/lib/admin/probe';
import { CardHead, DeskGate, Kpi } from './kit';

const TONE: Record<Level, 'r' | 'a' | 'n'> = { critical: 'r', high: 'r', medium: 'a', low: 'n' };
const TONE_BG = { r: '#FFE4EA', a: '#FEF3C7', n: '#F1F5F9' } as const;
const TONE_FG = { r: 'var(--red)', a: '#92600A', n: 'var(--mut)' } as const;

export default function CommandCentre() {
  return <DeskGate>{desk => <Dashboard desk={desk} />}</DeskGate>;
}

/** "up 4 pts in a fortnight", or null when there's no earlier figure to compare. */
function deltaText(now: number | null, before: number | null): string | null {
  if (now === null || before === null) return null;
  const d = now - before;
  return d ? `${d > 0 ? 'up' : 'down'} ${Math.abs(d)} pts in a fortnight` : 'level with a fortnight ago';
}

function Dashboard({ desk }: { desk: AdminDesk }) {
  const router = useRouter();
  const { academics: ac, fees, workforce: wf, wellness: wl, filing, admissions: adm } = desk;
  const a = desk.me.access;
  const found = a.can('probe.view') ? probe(desk).findings : [];
  const list = found.slice(0, 6).map(f => {
    return { key: f.key, tone: TONE[f.level], title: f.title, detail: f.summary, action: 'Look into it', href: `/admin/probe?f=${encodeURIComponent(f.key)}` };
  });
  const today = isoDay();
  const sections = ac.sections.length;
  const evidence = pct(ac.evidenced, desk.students.length);
  const dueIn = filing.dueOn ? daysBetween(today, filing.dueOn) : null;
  const weakGrade = ac.grades.filter(g => g.tml !== null).sort((a, b) => a.tml! - b.tml!)[0];


  return (
    <>
      <div className="hero">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <h1>{desk.school.name}</h1>
            <div className="hsub">
              Command Centre · AY {desk.session.replace('-', '–')}
              {desk.school.code && <span className="chip mono">{desk.school.code}</span>}
              <span className="chip">{desk.school.plan ? `${desk.school.plan.replace(/^\w/, c => c.toUpperCase())} plan · ` : ''}{plural(desk.students.length, 'student')}</span>
            </div>
          </div>
          {a.can('boardpack.view') && <Link className="btn" style={{ background: '#fff', color: 'var(--ink)' }} href="/admin/board-pack">
            <DownloadSimple size={16} weight="bold" /> Export board pack
          </Link>}
        </div>
        <div className="hgrid">
          {a.can('academics.read') && <button className="hstat" onClick={() => router.push('/admin/academic')}>
            <div>
              <div className="lb">SCHOOL-WIDE TML</div>
              <div className="vl">{ac.schoolTml !== null ? `${ac.schoolTml}%` : '—'}</div>
              <div className="nt">{ac.schoolTml === null ? 'Builds as teachers confirm grades' : deltaText(ac.schoolTml, ac.schoolTmlBefore) ?? `${plural(ac.evidenced, 'student')} with evidence`}</div>
            </div>
            <div className="ic"><InteractiveIcon icon={ChartLineUp} color={colorForIcon(ChartLineUp)} size={21} /></div>
          </button>}
          {a.can('fees.read') && <button className="hstat" onClick={() => router.push('/admin/fees')}>
            <div>
              <div className="lb">FEE COLLECTION</div>
              <div className="vl">{fees.totals.collectionRate !== null ? `${Math.round(fees.totals.collectionRate)}%` : '—'}</div>
              <div className="nt">{fees.totals.billed ? `${inrShort(fees.totals.outstanding)} outstanding` : fees.structures.length ? 'No invoices raised yet' : 'Set fee structures to start billing'}</div>
            </div>
            <div className="ic"><InteractiveIcon icon={CurrencyInr} color={colorForIcon(CurrencyInr)} size={21} /></div>
          </button>}
          {a.can('wellness.read') && <button className="hstat" onClick={() => router.push('/admin/wellness')}
            style={filing.status === 'draft' && dueIn !== null && dueIn <= 30 ? { background: 'rgba(245,182,11,.16)', borderColor: 'rgba(245,182,11,.3)' } : undefined}>
            <div>
              <div className="lb">CBSE WELLNESS FILING</div>
              <div className="vl" style={{ fontSize: 26 }}>
                {filing.status === 'filed' ? 'Filed' : filing.dueOn ? (dueIn! < 0 ? 'Overdue' : `Due ${fmtDate(filing.dueOn, true)}`) : 'Draft'}
              </div>
              <div className="nt">
                {filing.status === 'filed' ? `On ${fmtDate(filing.filedAt)}` : wl.participation !== null ? `${Math.min(100, wl.participation)}% of students checking in` : 'No check-ins yet this session'}
              </div>
            </div>
            <div className="ic"><InteractiveIcon icon={Heart} color={colorForIcon(Heart)} size={21} /></div>
          </button>}
        </div>
      </div>

      <div className="kpis">
        <Kpi href="/admin/directory" label="ENROLMENT" value={desk.students.length} icon={UsersThree}
          note={`${plural(sections, 'section')} · ${plural(desk.parents, 'parent account')}`} />
        {a.can('workforce.read') && <Kpi href="/admin/staff" label="TEACHING STAFF" value={wf.teachers.length} icon={ChalkboardTeacher}
          note={wf.ratio ? `1:${wf.ratio} student-teacher ratio${wf.onLeaveToday.length ? ` · ${wf.onLeaveToday.length} on leave today` : ''}` : 'Add teachers in the directory'} />}
        {a.can('academics.read') && <><Kpi href="/admin/academic" label="EVIDENCE COVERAGE" value={evidence !== null ? `${evidence}%` : '—'} icon={Target}
          note={`${ac.evidenced} of ${desk.students.length} with graded work`} noteColor={evidence !== null && evidence < 60 ? 'var(--amber)' : 'var(--mut)'} />
        <Kpi href="/admin/academic#at-risk" label="STUDENTS AT RISK" value={ac.atRisk.length} icon={Warning}
          valueColor={ac.atRisk.length ? 'var(--red)' : 'var(--green)'} note="TML below 40%" noteColor={ac.atRisk.length ? 'var(--red)' : 'var(--mut)'} /></>}
        {a.can('fees.read') && !a.can('academics.read') && <>
          <Kpi href="/admin/fees?view=overdue" label="OVERDUE" value={inrShort(fees.totals.overdue)} small icon={Warning} valueColor={fees.totals.overdue ? 'var(--red)' : undefined}
            note={plural(fees.totals.familiesOverdue, 'family', 'families')} />
          <Kpi href="/admin/fees?tab=daybook" label="COLLECTED TODAY" value={inrShort(desk.dayBook.find(x => x.day === today)?.total ?? 0)} small icon={CurrencyInr}
            note={desk.dayBook.find(x => x.day === today)?.close?.status === 'closed' ? 'Day closed' : 'Day open'} />
        </>}
      </div>

      <div className="g2" style={a.can('academics.read') ? undefined : { gridTemplateColumns: '1fr' }}>
        {a.can('academics.read') && <div className="card">
          <CardHead title="TML by grade" sub="Where the school is structurally weak, visible before term-end results rather than after." />
          {ac.grades.some(g => g.tml !== null) ? (
            <>
              {ac.grades.map(g => (
                <Link key={g.grade} href={`/admin/academic?grade=${g.grade}`} className="row" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <b style={{ flex: '0 0 84px', fontSize: 14 }}>Grade {g.grade}</b>
                  {g.tml !== null ? <Bar value={g.tml} /> : <div className="bar" />}
                  <b style={{ width: 46, textAlign: 'right', color: g.tml !== null ? hmColor(g.tml) : 'var(--mut2)' }}>{g.tml !== null ? `${g.tml}%` : '—'}</b>
                  <span className="muted num" style={{ width: 70, textAlign: 'right', fontSize: 12 }}>{g.evidenced}/{g.students}</span>
                </Link>
              ))}
              {ac.weakest && ac.weakest.tml! < 60 ? (
                <div className="note" style={{ marginTop: 18 }}>
                  <b>Grade {ac.weakest.grade} {subjectName(ac.weakest.subject)} is the weakest cell at {ac.weakest.tml}%</b>
                  {ac.weakest.sections > 1 ? `, with ${ac.weakest.sectionsBelow} of ${ac.weakest.sections} sections below 60%.` : '.'}
                </div>
              ) : ac.weakest ? (
                <div className="note" style={{ marginTop: 18, background: '#F0FDF7', borderLeftColor: 'var(--green)', color: '#0B7A54' }}>
                  No grade-and-subject cell with two or more students is below 60%.{weakGrade ? ` The lowest grade is Grade ${weakGrade.grade} at ${weakGrade.tml}%.` : ''}
                </div>
              ) : (
                <div className="note" style={{ marginTop: 18 }}>
                  Too little evidence per grade and subject to single out a weak spot yet. A cell needs graded work from at least two students.
                </div>
              )}
            </>
          ) : (
            <Empty icon={<ChartLineUp size={26} weight="duotone" />} title="No graded evidence yet">
              TML appears here as teachers confirm homework and quiz grades. Students with no confirmed work aren&apos;t averaged in.
            </Empty>
          )}
        </div>}

        <div>
          <div className="card" style={{ marginBottom: 18 }}>
            <CardHead title="What needs a decision" sub={a.can('probe.view') ? `Top findings from Probe, for the areas your role covers.` : 'Your role doesn\'t include Probe.'}
              right={found.length > list.length ? <Link className="btn sm" href="/admin/probe">All {found.length} <ArrowRight size={13} weight="bold" /></Link> : undefined} />
            {list.length ? list.slice(0, 7).map(d => (
              <div className="row" key={d.key}>
                <div className="av" style={{ background: TONE_BG[d.tone], color: TONE_FG[d.tone] }} aria-hidden="true"><Sparkle size={17} weight="fill" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{d.title}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{d.detail}</div>
                </div>
                <Link className="btn sm" href={d.href}>{d.action} <ArrowRight size={13} weight="bold" /></Link>
              </div>
            )) : (
              <Empty icon={<CheckCircle size={26} weight="duotone" />} title="Nothing needs you right now">
                Leave, overdue fees, weak subjects, grading backlogs and compliance gaps show up here as they arise.
              </Empty>
            )}
          </div>
          {a.can('audit.read') && <div className="card">
            <CardHead title="Recent activity" sub="From the audit log." right={<Link className="btn sm" href="/admin/compliance#audit">Full trail</Link>} />
            {desk.compliance.audit.length ? desk.compliance.audit.slice(0, 6).map(a => (
              <div className="row" key={a.id}>
                <div className="av" style={{ background: 'var(--pale)', color: 'var(--blue)' }} aria-hidden="true"><ClockCounterClockwise size={17} weight="bold" /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{a.summary}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{a.actor} · {ago(a.at)}</div>
                </div>
              </div>
            )) : <p className="muted" style={{ fontSize: 13.5 }}>No recorded changes yet.</p>}
          </div>}
        </div>
      </div>

      {((a.can('fees.read') && fees.totals.billed > 0) || (a.can('admissions.read') && adm.total > 0)) && (
        <div className="g2" style={{ marginTop: 18 }}>
          {a.can('fees.read') && fees.totals.billed > 0 && (
            <Link href="/admin/fees" className="card" style={{ color: 'inherit', textDecoration: 'none' }}>
              <CardHead title="Fees at a glance" sub={`${desk.session} so far`} />
              <div className="row"><span style={{ flex: 1 }}>Billed</span><b className="num">{inr(fees.totals.billed)}</b></div>
              <div className="row"><span style={{ flex: 1 }}>Collected</span><b className="num" style={{ color: 'var(--green)' }}>{inr(fees.totals.collected)}</b></div>
              <div className="row"><span style={{ flex: 1 }}>Overdue</span><b className="num" style={{ color: fees.totals.overdue ? 'var(--red)' : 'var(--mut)' }}>{inr(fees.totals.overdue)}</b></div>
            </Link>
          )}
          {a.can('admissions.read') && adm.total > 0 && (
            <Link href="/admin/admissions" className="card" style={{ color: 'inherit', textDecoration: 'none' }}>
              <CardHead title={`Admissions · AY ${adm.session.replace('-', '–')}`} sub={`${plural(adm.total, 'applicant')} · ${adm.enrolled} enrolled`} />
              {adm.funnel.map(f => (
                <div className="row" key={f.stage}><span style={{ flex: '0 0 150px', fontSize: 13.5 }}>{STAGE_LABEL[f.stage]}</span><Bar value={f.share ?? 0} color="#4C8DFF" /><b className="num" style={{ width: 40, textAlign: 'right' }}>{f.reached}</b></div>
              ))}
            </Link>
          )}
        </div>
      )}
    </>
  );
}
