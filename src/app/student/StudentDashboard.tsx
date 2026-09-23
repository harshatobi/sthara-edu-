'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BatteryLowIcon as BatteryLow } from '@phosphor-icons/react/dist/ssr/BatteryLow';
import { BatteryMediumIcon as BatteryMedium } from '@phosphor-icons/react/dist/ssr/BatteryMedium';
import { BatteryHighIcon as BatteryHigh } from '@phosphor-icons/react/dist/ssr/BatteryHigh';
import { BatteryFullIcon as BatteryFull } from '@phosphor-icons/react/dist/ssr/BatteryFull';
import { RocketIcon as Rocket } from '@phosphor-icons/react/dist/ssr/Rocket';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { TargetIcon as Target } from '@phosphor-icons/react/dist/ssr/Target';
import { TrophyIcon as Trophy } from '@phosphor-icons/react/dist/ssr/Trophy';
import { BrainIcon as Brain } from '@phosphor-icons/react/dist/ssr/Brain';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { Bar, Chip, Skeleton, hmColor } from '@/components/canon/ui';
import DemoNote from '@/components/canon/DemoNote';
import { useToast } from '@/components/canon/useToast';
import InteractiveIcon from '@/components/ui/InteractiveIcon';
import { colorForIcon } from '@/lib/iconColors';
import { subjectIcon } from '@/components/canon/subjectIcon';
import { mapMasteryBand } from '@/lib/tml/engine';
import { useStudentDesk } from '@/lib/student/useStudentDesk';
import { ENERGY_LEVELS, useWellness } from '@/lib/student/useWellness';
import { dmy, dueIn, mostRecentGraded, openAssignments, weakestSubject, weakestTopicOverall } from '@/lib/student/shape';

const ENERGY_ICONS = [BatteryLow, BatteryMedium, BatteryHigh, BatteryFull, Rocket];

export default function StudentDashboard() {
  const router = useRouter();
  const { desk, error } = useStudentDesk();
  const wellness = useWellness();
  const [toast, toastEl] = useToast();

  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!desk) return <DashboardSkeleton />;

  const open = openAssignments(desk.assignments);
  const next = open[0];
  const recent = mostRecentGraded(desk.assignments);
  const weakTopic = weakestTopicOverall(desk.subjects);
  const weakSubj = weakestSubject(desk.subjects);
  const today = wellness.state?.today ?? null;
  const band = mapMasteryBand(desk.overallTml);
  const logEnergy = async (i: number) => {
    await wellness.setEnergy(i);
    toast(`Energy logged as ${ENERGY_LEVELS[i].label}`);
  };
  const q = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();

  return (
    <>
      {desk.mode === 'demo' && <DemoNote />}

      <div className="hero">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {desk.me.id && <span className="chip mono">{desk.me.id}</span>}
              {desk.me.cls && <span className="chip">Class: {desk.me.cls}</span>}
              {desk.me.school && <span className="chip">{desk.me.school}</span>}
            </div>
            <h1>Welcome back, <span style={{ color: '#F5B60B' }}>{desk.me.name.split(' ')[0]}</span>!</h1>
            <div className="hsub">Ready to unleash yourself today? Your personalised learning path awaits.</div>
          </div>
          <div className="energy" role="group" aria-label="Today's energy">
            <b>ENERGY</b>
            {ENERGY_LEVELS.map((lvl, i) => {
              const Icon = ENERGY_ICONS[i];
              return (
                <button key={lvl.label} className={today === i ? 'on' : ''} aria-pressed={today === i}
                  aria-label={`Set today's energy: ${lvl.label}`} title={lvl.label}
                  style={{ '--lvl': hmColor(lvl.value) } as React.CSSProperties}
                  disabled={!wellness.state} onClick={() => logEnergy(i)}>
                  <Icon size={17} weight={today === i ? 'fill' : 'duotone'} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="hgrid">
          <button className="hstat" onClick={() => router.push(weakSubj ? `/student/mastery?${q({ subject: weakSubj })}` : '/student/mastery')}>
            <div>
              <div className="lb">TRUE MASTERY LEVEL</div>
              <div className="vl">{desk.overallTml !== null ? `${desk.overallTml}%` : '—'}</div>
              <div className="nt">{band ? `${band.band} · see your weakest subject` : 'Builds as your work is graded'}</div>
            </div>
            <div className="ic"><InteractiveIcon icon={ChartLineUp} color={colorForIcon(ChartLineUp)} size={21} /></div>
          </button>
          <button className="hstat" onClick={() => router.push('/student/homework')}>
            <div>
              <div className="lb">PENDING TASKS</div>
              <div className="vl">{open.length}</div>
              <div className="nt">{next ? `Next: ${dueIn(next.dueAt).text.toLowerCase()}` : 'All caught up'}</div>
            </div>
            <div className="ic"><InteractiveIcon icon={Target} color={colorForIcon(Target)} size={21} /></div>
          </button>
          <button className="hstat" disabled={!recent} onClick={() => recent && router.push(`/student/homework?${q({ tab: 'done', report: recent.id })}`)}>
            <div style={{ minWidth: 0 }}>
              <div className="lb">RECENT SCORE</div>
              <div className="vl">
                {recent?.submission ? recent.submission.score : '—'}
                {recent?.submission?.total ? <span style={{ fontSize: 20, color: '#8FAED6' }}>/{recent.submission.total}</span> : null}
              </div>
              <div className="nt" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recent ? recent.title : 'Nothing graded yet'}</div>
            </div>
            <div className="ic"><InteractiveIcon icon={Trophy} color={colorForIcon(Trophy)} size={21} /></div>
          </button>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h3 style={{ fontSize: 19, fontWeight: 800 }}>Your TML by subject</h3>
            <Chip tone={desk.mode === 'live' ? 'b' : 'n'}>{desk.mode === 'live' ? 'LIVE' : 'DEMO'}</Chip>
          </div>
          <p className="muted" style={{ marginBottom: 18 }}>
            True Mastery Level is built from your homework, quizzes and how independently you work through AI Tutor sessions.
            Attendance and engagement add a smaller share on top.
          </p>
          {desk.subjects.length === 0 ? (
            <p className="muted">Nothing graded yet — your first graded assignment starts your TML.</p>
          ) : desk.subjects.map(s => (
            <Link key={s.subject} className="row" style={{ display: 'flex' }} href={`/student/mastery?${q({ subject: s.subject })}`}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.subject}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{s.note}</div>
              </div>
              {s.tml !== null ? <Bar value={s.tml} /> : <div className="bar" />}
              <b style={{ width: 44, textAlign: 'right', fontSize: 15, color: s.tml !== null ? hmColor(s.tml) : 'var(--mut2)' }}>
                {s.tml !== null ? `${s.tml}%` : '—'}
              </b>
            </Link>
          ))}
        </div>

        <div>
          <div className="card" style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>Due next</h3>
            {open.length === 0 ? (
              <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <InteractiveIcon icon={CheckCircle} color={colorForIcon(CheckCircle)} size={18} active /> Nothing outstanding. Every posted assignment is submitted.
              </p>
            ) : open.slice(0, 3).map(a => (
              <Link key={a.id} className="row" style={{ display: 'flex' }} href={`/student/homework/${a.id}`}>
                <div className="av" style={{ background: `color-mix(in srgb, ${a.color} 9%, #fff)` }}><InteractiveIcon icon={subjectIcon(a.subject)} color={a.color} size={18} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Chip tone="n" className="xs">{a.subject}</Chip>
                  <div style={{ fontWeight: 700, fontSize: 14, marginTop: 5 }}>{a.title}</div>
                </div>
                <Chip tone={dueIn(a.dueAt).tone} title={a.dueAt ? `Due ${dmy(a.dueAt)}` : undefined}>{dueIn(a.dueAt).text}</Chip>
              </Link>
            ))}
          </div>

          <div className="card" style={{ background: 'linear-gradient(120deg,#123F84,#0F5AB8)', color: '#fff' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,.16)', display: 'grid', placeItems: 'center', flex: '0 0 42px' }}>
                <InteractiveIcon icon={Brain} color="#F5B60B" size={21} active />
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800 }}>Your AI Learning Path</h3>
                {weakTopic ? (
                  <>
                    <p style={{ color: '#BBD3F2', fontSize: 13.5, lineHeight: 1.65, marginTop: 8 }}>
                      {weakTopic.name} is your lowest micro-topic at <b style={{ color: '#F5B60B' }}>{weakTopic.score}%</b>, in {weakTopic.subject}.
                      A focused Socratic session is the fastest way to move it.
                    </p>
                    <Link className="btn" style={{ background: '#fff', color: 'var(--ink)', marginTop: 16 }}
                      href={`/student/tutor?${q({ topic: weakTopic.name, subject: weakTopic.subject, score: weakTopic.score })}`}>
                      Start with the AI Tutor <ArrowRight size={15} weight="bold" />
                    </Link>
                  </>
                ) : (
                  <>
                    <p style={{ color: '#BBD3F2', fontSize: 13.5, lineHeight: 1.65, marginTop: 8 }}>
                      Once a few pieces of work are graded, this points you at your weakest micro-topic. Until then, the tutor is open for anything.
                    </p>
                    <Link className="btn" style={{ background: '#fff', color: 'var(--ink)', marginTop: 16 }} href="/student/tutor">Open the AI Tutor <ArrowRight size={15} weight="bold" /></Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {wellness.error && <div className="note err" style={{ marginTop: 18 }} role="alert">{wellness.error}</div>}
      {toastEl}
    </>
  );
}


function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your desk">
      <Skeleton h={300} style={{ borderRadius: 24, marginBottom: 22 }} />
      <div className="g2"><Skeleton h={360} style={{ borderRadius: 20 }} /><Skeleton h={360} style={{ borderRadius: 20 }} /></div>
    </div>
  );
}
