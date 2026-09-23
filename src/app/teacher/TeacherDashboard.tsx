'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { NotePencilIcon as NotePencil } from '@phosphor-icons/react/dist/ssr/NotePencil';
import { BookOpenIcon as BookOpen } from '@phosphor-icons/react/dist/ssr/BookOpen';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { CalendarBlankIcon as CalendarBlank } from '@phosphor-icons/react/dist/ssr/CalendarBlank';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { Bar, Chip, Empty, Skeleton, hmColor, type Tone } from '@/components/canon/ui';
import InteractiveIcon from '@/components/ui/InteractiveIcon';
import { colorForIcon } from '@/lib/iconColors';
import { dueIn } from '@/lib/student/shape';
import { dmy, TYPE_CHIP, type TClass } from '@/lib/teacher/desk';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const q = (p: Record<string, string>) => new URLSearchParams(p).toString();

/** A class card's status chip (mockup TEACHER_CLASSES note/colour), from real signals only. */
function classNote(c: TClass): { text: string; tone: Tone } {
  if (c.proctorFlags) return { text: `${c.proctorFlags} PROCTOR FLAG${c.proctorFlags === 1 ? '' : 'S'}`, tone: 'r' };
  if (c.pendingReview) return { text: `${c.pendingReview} TO REVIEW`, tone: 'a' };
  if (c.belowForty.length) return { text: `${c.belowForty.length} BELOW 40%`, tone: 'a' };
  if (c.tml === null) return { text: 'NO EVIDENCE YET', tone: 'n' };
  return { text: 'ON TRACK', tone: 'g' };
}

/** Teacher dashboard (mockup teacher:dash), built only from this teacher's real classes and work. */
export default function TeacherDashboard() {
  const router = useRouter();
  const { desk, error } = useTeacherDesk();

  if (error) return <div className="note err" role="alert">Couldn&apos;t load your desk: {error}</div>;
  if (!desk) return <DashboardSkeleton />;

  const students = desk.classes.reduce((n, c) => n + c.students.length, 0);
  const tmls = desk.classes.map(c => c.tml).filter((v): v is number => v !== null);
  const avgTml = tmls.length ? Math.round(tmls.reduce((a, b) => a + b, 0) / tmls.length) : null;
  const pending = desk.assignments.reduce((n, a) => n + a.pendingCount, 0);
  const pendingIn = desk.assignments.filter(a => a.pendingCount > 0);
  const subjects = [...new Set(desk.scope.map(e => e.subject).filter(Boolean))];
  const lowest = desk.classes.filter(c => c.tml !== null).sort((a, b) => a.tml! - b.tml!)[0];

  const upcoming = desk.assignments
    .filter(a => a.status === 'published' && a.dueAt && !dueIn(a.dueAt).text.startsWith('Overdue'))
    .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1))
    .slice(0, 5);
  const drafts = desk.assignments.filter(a => a.status === 'draft');

  type Need = { key: string; title: string; sub: string; tone: 'r' | 'a'; href: string };
  const needs: Need[] = [
    ...pendingIn.map(a => ({
      key: `rev-${a.id}`, tone: 'r' as const,
      title: `${a.pendingCount} submission${a.pendingCount === 1 ? '' : 's'} awaiting your review`,
      sub: `${a.cls} · ${a.title}`,
      href: `/teacher/${a.type === 'quiz' ? 'quiz' : 'homework'}?${q({ class: a.cls, a: a.id, s: a.submissions.find(s => s.state === 'pending')!.id })}`,
    })),
    ...(desk.flags.length ? [{
      key: 'flags', tone: 'r' as const,
      title: `${desk.flags.length} proctoring flag${desk.flags.length === 1 ? '' : 's'} in the last 14 days`,
      sub: [...new Set(desk.flags.map(f => f.assignmentTitle))].slice(0, 2).join(' · '), href: '/teacher/feed',
    }] : []),
    ...desk.classes.filter(c => c.belowForty.length).map(c => ({
      key: `low-${c.cls}`, tone: 'a' as const,
      title: `${c.belowForty.length} student${c.belowForty.length === 1 ? '' : 's'} below 40% TML`,
      sub: `${c.cls} · ${c.belowForty.slice(0, 3).map(s => s.name.split(' ')[0]).join(', ')}${c.belowForty.length > 3 ? '…' : ''}`,
      href: `/teacher/heatmap?${q({ class: c.cls })}`,
    })),
    ...drafts.slice(0, 3).map(a => ({
      key: `draft-${a.id}`, tone: 'a' as const, title: `Draft not posted: ${a.title}`, sub: `${a.cls} · students can't see it yet`,
      href: `/teacher/${a.type === 'quiz' ? 'quiz' : 'homework'}?${q({ class: a.cls, a: a.id })}`,
    })),
  ];

  return (
    <>
      <div className="hero">
        <div>
          <h1>{greeting()}, {desk.me.name.split(' ')[0]}</h1>
          <div className="hsub">
            Teacher Portal{subjects.length ? ` · ${subjects.join(', ')}` : ''}
            <span className="chip">{desk.classes.length} class{desk.classes.length === 1 ? '' : 'es'} · {students} student{students === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div className="hgrid">
          <button className="hstat" onClick={() => router.push('/teacher/heatmap')}>
            <div>
              <div className="lb">CLASS AVERAGE TML</div>
              <div className="vl">{avgTml !== null ? `${avgTml}%` : '—'}</div>
              <div className="nt">{avgTml === null ? 'Builds as you confirm grades' : lowest && desk.classes.length > 1 ? `Lowest: ${lowest.cls} at ${lowest.tml}%` : 'Across your classes'}</div>
            </div>
            <div className="ic"><InteractiveIcon icon={ChartLineUp} color={colorForIcon(ChartLineUp)} size={21} /></div>
          </button>
          <button className="hstat" onClick={() => router.push('/teacher/feed')}
            style={desk.flags.length ? { background: 'rgba(225,29,72,.16)', borderColor: 'rgba(225,29,72,.3)' } : undefined}>
            <div>
              <div className="lb">PROCTORING ALERTS</div>
              <div className="vl">{desk.flags.length}</div>
              <div className="nt">{desk.flags.length ? `Tab-switch flags · ${desk.flags[0].studentName}` : 'None in the last 14 days'}</div>
            </div>
            <div className="ic"><InteractiveIcon icon={Warning} color={colorForIcon(Warning)} size={21} /></div>
          </button>
          <button className="hstat" onClick={() => router.push(pendingIn[0] ? `/teacher/${pendingIn[0].type === 'quiz' ? 'quiz' : 'homework'}?${q({ class: pendingIn[0].cls, a: pendingIn[0].id })}` : '/teacher/homework')}>
            <div>
              <div className="lb">AWAITING YOUR REVIEW</div>
              <div className="vl">{pending}</div>
              <div className="nt">{pending ? 'Needs your confirmation before it counts' : 'All caught up'}</div>
            </div>
            <div className="ic"><InteractiveIcon icon={NotePencil} color={colorForIcon(NotePencil)} size={21} /></div>
          </button>
        </div>
      </div>

      <h3 className="sec"><span className="dot" style={{ background: '#FFE4EA', color: 'var(--red)' }}><BookOpen size={15} weight="bold" /></span>Your assigned classes</h3>
      {desk.classes.length ? (
        <div className="g3">
          {desk.classes.map(c => {
            const note = classNote(c);
            return (
              <div className="card" key={c.cls}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 10 }}>
                  <div><h3 style={{ fontSize: 26, fontWeight: 800 }}>{c.cls}</h3><div className="muted">{c.subjects.join(', ') || 'Class teacher'} · {c.students.length} student{c.students.length === 1 ? '' : 's'}</div></div>
                  <Chip tone={note.tone}>{note.text}</Chip>
                </div>
                <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em' }}>CLASS TRUE MASTERY LEVEL</div>
                {c.tml !== null ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '8px 0 4px' }}>
                    <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, color: hmColor(c.tml) }}>{c.tml}%</div><Bar value={c.tml} />
                  </div>
                ) : <div style={{ fontSize: 15, fontWeight: 700, margin: '12px 0 8px', color: 'var(--mut)' }}>No graded evidence yet</div>}
                <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>{c.evidenced} of {c.students.length} student{c.students.length === 1 ? '' : 's'} with graded evidence</div>
                <div style={{ display: 'flex', gap: 9 }}>
                  <Link className="btn" style={{ flex: 1, justifyContent: 'center' }} href={`/teacher/heatmap?${q({ class: c.cls })}`}>Heat map</Link>
                  <Link className="btn pri" style={{ flex: 1, justifyContent: 'center' }} href={`/teacher/homework?${q({ class: c.cls })}`}>Open class</Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card"><Empty icon={<Warning size={26} weight="duotone" />} title="No classes assigned yet">
          Your school admin hasn&apos;t linked you to any classes and subjects. Once they do, your classes, students and their mastery appear here.
        </Empty></div>
      )}

      <div className="g2" style={{ marginTop: 22 }}>
        <div className="card">
          <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 10 }}>Needs you today</h3>
          {needs.length ? needs.slice(0, 7).map(n => (
            <Link key={n.key} href={n.href} className="row">
              <div className="av" style={{ background: n.tone === 'r' ? '#FFE4EA' : '#FEF3C7', color: n.tone === 'r' ? 'var(--red)' : '#92600A' }}>
                <Warning size={17} weight="bold" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{n.title}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{n.sub}</div>
              </div>
              <ArrowRight size={15} weight="bold" color="var(--mut2)" />
            </Link>
          )) : (
            <div className="row"><div className="av" style={{ background: '#DCFCE7', color: 'var(--green)' }}><CheckCircle size={18} weight="bold" /></div>
              <div className="muted" style={{ fontSize: 13.5 }}>Nothing waiting on you. New submissions and flags show up here.</div></div>
          )}
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10 }}>
            <h3 style={{ fontSize: 19, fontWeight: 800 }}>Due soon</h3>
            <Link className="btn sm" href={`/teacher/homework?${q({ new: '1' })}`}>+ Assign</Link>
          </div>
          {upcoming.length ? upcoming.map(a => {
            const d = dueIn(a.dueAt);
            return (
              <Link key={a.id} href={`/teacher/${a.type === 'quiz' ? 'quiz' : 'homework'}?${q({ class: a.cls, a: a.id })}`} className="row">
                <div className="av" style={{ width: 34, height: 34, flex: '0 0 34px' }}><CalendarBlank size={16} weight="bold" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{a.cls} · {TYPE_CHIP[a.type].toLowerCase()} · {a.submissions.length}/{a.roster.length} in · due {dmy(a.dueAt)}</div>
                </div>
                <Chip tone={d.tone === 'n' ? 'n' : d.tone === 'a' ? 'a' : 'r'}>{d.text.toUpperCase()}</Chip>
              </Link>
            );
          }) : <p className="muted" style={{ fontSize: 13.5, paddingTop: 6 }}>Nothing posted is due. Assign homework or a quiz to get evidence flowing.</p>}
        </div>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true">
      <div className="hero"><Skeleton h={40} w={320} style={{ opacity: 0.2 }} /><div className="hgrid">{[0, 1, 2].map(i => <Skeleton key={i} h={96} style={{ opacity: 0.15 }} />)}</div></div>
      <div className="g3">{[0, 1, 2].map(i => <div className="card" key={i}><Skeleton h={150} /></div>)}</div>
    </div>
  );
}
