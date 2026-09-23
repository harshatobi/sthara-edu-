'use client';

import Link from 'next/link';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { CaretRightIcon as CaretRight } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { ChartBarIcon as ChartBar } from '@phosphor-icons/react/dist/ssr/ChartBar';
import { BookOpenIcon as BookOpen } from '@phosphor-icons/react/dist/ssr/BookOpen';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { TargetIcon as Target } from '@phosphor-icons/react/dist/ssr/Target';
import { Empty, PageBar, Skeleton, hmColor } from '@/components/canon/ui';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { normClass } from '@/lib/teacher/scope';
import { BAND_LABEL, chapterStats, chaptersFor, scoreFor } from '@/lib/teacher/mastery';
import ScopePicker, { useScopeSelection } from './ScopePicker';

const COMPONENTS = [
  { key: 'homework', label: 'Homework' },
  { key: 'quiz', label: 'Quiz' },
  { key: 'tutor', label: 'Tutor depth' },
] as const;
const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const initials = (n: string) => n.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();

function Legend() {
  return (
    <div className="legend">
      <span><i style={{ background: 'var(--red)' }} />&lt;40%</span>
      <span><i style={{ background: 'var(--amber)' }} />40–74%</span>
      <span><i style={{ background: 'var(--green)' }} />≥75%</span>
    </div>
  );
}

/**
 * Class Heat Map (mockup teacher:heat). Chapter list with a red/amber/green
 * split of the class, then a chapter drill-down: every student against the
 * evidence behind their chapter TML (homework, quiz, tutor depth).
 */
export default function ClassHeatMap() {
  const { desk, error } = useTeacherDesk();
  const { classes, cls, subjects, subject, params, go } = useScopeSelection(desk?.scope ?? []);

  if (error) return <div className="note err" role="alert">Couldn&apos;t load your classes: {error}</div>;
  if (!desk) {
    return (
      <div aria-busy="true">
        <PageBar eyebrow="CLASS HEAT MAP" title="Topic-level TML" sub={<Skeleton h={14} w={320} />} />
        <div className="kpis">{[0, 1, 2].map(i => <div className="kpi" key={i}><Skeleton h={70} /></div>)}</div>
        <div className="card"><Skeleton h={260} /></div>
      </div>
    );
  }
  if (!classes.length) {
    return (
      <>
        <PageBar eyebrow="CLASS HEAT MAP" title="Topic-level TML" />
        <div className="card"><Empty icon={<Warning size={26} weight="duotone" />} title="No classes assigned yet">
          Your school admin hasn&apos;t linked you to any classes and subjects yet.
        </Empty></div>
      </>
    );
  }

  const roster = desk.classes.find(c => normClass(c.cls) === normClass(cls))?.students ?? [];
  const chapters = chaptersFor(cls, subject, roster);
  const stats = chapterStats(chapters, roster, subject);
  const picker = <ScopePicker classes={classes} cls={cls} subjects={subjects} subject={subject}
    onChange={n => go({ class: n.class ?? cls, subject: n.subject ?? (n.class ? null : subject), chapter: null })} />;
  const chapterKey = params.get('chapter');
  const chap = stats.find(c => c.key === chapterKey);

  // ── Chapter list ──────────────────────────────────────────────────────────
  if (!chap) {
    const graded = stats.filter(c => c.avg !== null);
    const classAvg = mean(graded.map(c => c.avg!));
    const evidenced = roster.filter(s => chapters.some(c => scoreFor(s, subject, c.key))).length;
    return (
      <>
        <PageBar eyebrow="CLASS HEAT MAP" title={`Topic-level TML · ${cls}`}
          sub="Open a chapter to see how every student is doing on it. Scores come from graded homework, quizzes and AI Tutor depth."
          actions={picker} />
        <div className="kpis">
          <div className="kpi"><div className="lb">CLASS AVERAGE TML</div>
            <div className="vl" style={{ color: classAvg !== null ? hmColor(classAvg) : 'var(--mut2)' }}>{classAvg !== null ? `${classAvg}%` : '—'}</div>
            <div className="nt" style={{ color: 'var(--mut)' }}>{graded.length ? `Across ${graded.length} graded chapter${graded.length === 1 ? '' : 's'}` : 'No graded evidence yet'}</div>
            <div className="gh"><ChartBar size={72} weight="fill" /></div></div>
          <div className="kpi"><div className="lb">CHAPTERS</div><div className="vl">{chapters.length}</div>
            <div className="nt" style={{ color: 'var(--mut)' }}>{graded.length} with scored evidence</div>
            <div className="gh"><BookOpen size={72} weight="fill" /></div></div>
          <div className="kpi"><div className="lb">STUDENTS</div><div className="vl">{roster.length}</div>
            <div className="nt" style={{ color: 'var(--mut)' }}>{evidenced} with graded evidence in {subject || 'this subject'}</div>
            <div className="gh"><UsersThree size={72} weight="fill" /></div></div>
        </div>
        <div className="card" style={{ padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px 14px', flexWrap: 'wrap', gap: 10 }}>
            <b style={{ fontSize: 15 }}>Chapters{subject ? ` · ${subject}` : ''}</b><Legend />
          </div>
          {stats.length ? stats.map(c => (
            <button key={c.key} className="chap-row" onClick={() => go({ chapter: c.key })}>
              <div className="num">{String(c.seq).padStart(2, '0')}</div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{c.name}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {c.ncert ? `NCERT Ch ${c.ncert} · ` : ''}{c.unit ? `${c.unit} · ` : c.inCurriculum ? '' : 'Outside the curriculum list · '}
                  {c.scored ? `${c.scored} of ${roster.length} student${roster.length === 1 ? '' : 's'} scored` : 'No graded evidence yet'}
                </div>
              </div>
              <div className="track" style={{ maxWidth: 220 }}>
                {c.scored > 0 && <>
                  <i style={{ width: `${(c.r / c.scored) * 100}%`, background: 'var(--red)' }} />
                  <i style={{ width: `${(c.a / c.scored) * 100}%`, background: 'var(--amber)' }} />
                  <i style={{ width: `${(c.g / c.scored) * 100}%`, background: 'var(--green)' }} />
                </>}
              </div>
              <div style={{ width: 54, textAlign: 'right', fontWeight: 800, fontSize: 16, color: c.avg !== null ? hmColor(c.avg) : 'var(--mut2)' }}>{c.avg !== null ? `${c.avg}%` : '—'}</div>
              <CaretRight size={14} weight="bold" color="var(--mut2)" />
            </button>
          )) : (
            <Empty icon={<BookOpen size={26} weight="duotone" />} title={`No ${subject || 'subject'} chapters for ${cls}`}>
              The official curriculum for this class and subject isn&apos;t loaded yet, and nothing has been graded in it.
            </Empty>
          )}
        </div>
      </>
    );
  }

  // ── Chapter drill-down: student × evidence ────────────────────────────────
  const rows = roster.map(s => ({ s, t: scoreFor(s, subject, chap.key) }));
  const scored = rows.filter(r => r.t);
  const compAvg = COMPONENTS.map(c => ({ ...c, avg: mean(scored.map(r => r.t![c.key]).filter((v): v is number => v !== null)) }));
  const weakestComp = compAvg.filter(c => c.avg !== null).sort((a, b) => a.avg! - b.avg!)[0];
  const below = scored.filter(r => r.t!.score < 40);
  const remedialHref = `/teacher/homework?${new URLSearchParams({ new: '1', class: cls, subject, chapter: chap.name, for: below.map(r => r.s.id).join(',') })}`;

  return (
    <>
      <PageBar eyebrow="CLASS HEAT MAP" title={chap.name} sub={`${cls} · ${roster.length} student${roster.length === 1 ? '' : 's'} · ${subject}`}
        actions={<>
          <button className="btn" onClick={() => go({ chapter: null })}><ArrowLeft size={14} weight="bold" /> All chapters</button>
          {below.length > 0 && <Link className="btn pri" href={remedialHref}>Assign remedial to {below.length} below 40%</Link>}
        </>} />
      <div className="kpis">
        <div className="kpi"><div className="lb">CHAPTER TML</div>
          <div className="vl" style={{ color: chap.avg !== null ? hmColor(chap.avg) : 'var(--mut2)' }}>{chap.avg !== null ? `${chap.avg}%` : '—'}</div>
          <div className="nt" style={{ color: 'var(--mut)' }}>{chap.scored} of {roster.length} scored</div>
          <div className="gh"><ChartBar size={72} weight="fill" /></div></div>
        <div className="kpi"><div className="lb">WEAKEST EVIDENCE</div>
          <div className="vl" style={{ fontSize: 26 }}>{weakestComp ? weakestComp.label : '—'}</div>
          <div className="nt" style={{ color: weakestComp ? hmColor(weakestComp.avg!) : 'var(--mut)' }}>{weakestComp ? `${weakestComp.avg}% class average` : 'Nothing graded yet'}</div>
          <div className="gh"><Warning size={72} weight="fill" /></div></div>
        <div className="kpi"><div className="lb">BELOW 40% TML</div>
          <div className="vl" style={{ color: below.length ? 'var(--red)' : undefined }}>{below.length}</div>
          <div className="nt" style={{ color: below.length ? 'var(--red)' : 'var(--mut)' }}>{below.length ? 'Remedial recommended' : 'No one below the line'}</div>
          <div className="gh"><UsersThree size={72} weight="fill" /></div></div>
        <div className="kpi"><div className="lb">MASTERED / GAP</div>
          <div className="vl" style={{ fontSize: 30 }}><span style={{ color: 'var(--green)' }}>{chap.g}</span> / <span style={{ color: 'var(--red)' }}>{chap.r}</span></div>
          <div className="nt" style={{ color: 'var(--mut)' }}>Students ≥75% vs &lt;40%</div>
          <div className="gh"><Target size={72} weight="fill" /></div></div>
      </div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ fontSize: 19, fontWeight: 800 }}>Student × evidence</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700, color: 'var(--mut)', flexWrap: 'wrap' }}>
            <span>Low</span>{[15, 30, 48, 65, 85].map(v => <span key={v} style={{ width: 26, height: 14, borderRadius: 4, background: hmColor(v) }} />)}<span>High</span>
            <span style={{ marginLeft: 10, display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 26, height: 14, borderRadius: 4, background: '#F1F5F9', border: '1px dashed var(--line)' }} />No evidence</span>
          </div>
        </div>
        {roster.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="hm">
              <thead><tr><th scope="col">Student</th>{COMPONENTS.map(c => <th key={c.key} scope="col" style={{ textAlign: 'center' }}>{c.label}</th>)}<th scope="col" style={{ textAlign: 'center' }}>TML</th><th scope="col" style={{ textAlign: 'center' }}>Confidence</th></tr></thead>
              <tbody>
                {rows.map(({ s, t }) => (
                  <tr key={s.id}>
                    <td className="nm">
                      <Link href={`/teacher/mastery?${new URLSearchParams({ class: cls, subject, student: s.id })}`} style={{ display: 'flex', alignItems: 'center', gap: 9 }} title="Open in Mastery Tracker">
                        <span className="heat-av" style={{ background: t ? hmColor(t.score) : '#9AA6B8' }}>{initials(s.name)}</span>{s.name}
                      </Link>
                    </td>
                    {COMPONENTS.map(c => {
                      const v = t?.[c.key] ?? null;
                      return v === null
                        ? <td key={c.key} className="cell na" title={`${s.name} · ${c.label} · no evidence`}>–</td>
                        : <td key={c.key} className="cell" style={{ background: hmColor(v) }} title={`${s.name} · ${c.label} · ${v}%`}>{v}</td>;
                    })}
                    {t ? <td className="cell" style={{ background: hmColor(t.score) }}>{t.score}</td> : <td className="cell na">–</td>}
                    <td className="cell na" style={{ fontSize: 11 }}>{t?.band ? BAND_LABEL[t.band] ?? t.band : '–'}</td>
                  </tr>
                ))}
                <tr>
                  <td className="nm" style={{ color: 'var(--mut)' }}>Class average</td>
                  {compAvg.map(c => c.avg === null ? <td key={c.key} className="cell na">–</td> : <td key={c.key} className="cell" style={{ background: hmColor(c.avg), opacity: 0.75 }}>{c.avg}</td>)}
                  <td className="cell" style={{ background: '#94A3B8' }}>{chap.avg ?? '–'}</td><td />
                </tr>
              </tbody>
            </table>
          </div>
        ) : <p className="muted">No students in {cls} yet.</p>}
        <div className="note" style={{ marginTop: 22 }}>
          {!chap.scored
            ? <>Nothing on <b>{chap.name}</b> has been graded for {cls} yet. Post homework or a quiz on this chapter and confirm the grades to start the map.</>
            : weakestComp
              ? <><b>{weakestComp.label} is the chapter-wide gap</b> at {weakestComp.avg}% on average. {weakestComp.key === 'tutor' ? 'Students are leaning on hints in AI Tutor; a worked-example lesson before more practice usually helps.' : weakestComp.key === 'quiz' ? 'Quiz recall is lagging homework; a short retrieval quiz on this chapter will show whether it sticks.' : 'Homework is where marks are dropping; re-teach before setting more.'}</>
              : <>Graded evidence exists, but not enough to split by homework, quiz and tutor depth yet.</>}
        </div>
      </div>
    </>
  );
}
