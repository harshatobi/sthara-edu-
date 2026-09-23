'use client';

import Link from 'next/link';
import { LightningIcon as Lightning } from '@phosphor-icons/react/dist/ssr/Lightning';
import { CrosshairIcon as Crosshair } from '@phosphor-icons/react/dist/ssr/Crosshair';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { Bar, Chip, Empty, PageBar, Skeleton, hmColor } from '@/components/canon/ui';
import Radar from '@/components/canon/Radar';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { normClass, normSubject } from '@/lib/teacher/scope';
import { BAND_LABEL, chaptersFor, scoreFor, shortLabel, studentOverall } from '@/lib/teacher/mastery';
import type { TopicScore } from '@/lib/teacher/desk';
import ScopePicker, { useScopeSelection } from './ScopePicker';

const initials = (n: string) => n.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
const COMPONENTS = [
  { key: 'homework', label: 'Homework', weight: '40%' },
  { key: 'quiz', label: 'Quiz', weight: '40%' },
  { key: 'tutor', label: 'AI Tutor depth', weight: '20%' },
] as const;

function Component({ label, weight, value }: { label: string; weight: string; value: number | null }) {
  return (
    <div className="row" style={{ padding: '9px 0', border: 0 }}>
      <b style={{ flex: '0 0 auto', minWidth: 150, fontSize: 13.5 }}>{label} <span className="muted" style={{ fontWeight: 600, fontSize: 11.5 }}>{weight}</span></b>
      {value !== null ? <Bar value={value} /> : <div className="bar"><i style={{ width: 0 }} /></div>}
      <b style={{ width: 46, textAlign: 'right', fontSize: 14, color: value !== null ? hmColor(value) : 'var(--mut2)' }}>{value !== null ? `${value}%` : '—'}</b>
    </div>
  );
}

/**
 * Mastery Tracker (mockup teacher:mast): one student, chapter by chapter.
 * Each chapter's score is the student's TML snapshot for it; underneath is
 * the evidence it's built from (homework 40%, quiz 40%, tutor depth 20%).
 */
export default function MasteryTracker() {
  const { desk, error } = useTeacherDesk();
  const { classes, cls, subjects, subject, params, go } = useScopeSelection(desk?.scope ?? []);

  if (error) return <div className="note err" role="alert">Couldn&apos;t load your classes: {error}</div>;
  if (!desk) {
    return (
      <div aria-busy="true">
        <PageBar eyebrow="MASTERY TRACKER" title="Student Progress" sub={<Skeleton h={14} w={300} />} />
        <div className="g2" style={{ gridTemplateColumns: '340px 1fr' }}><div className="card"><Skeleton h={300} /></div><div className="card"><Skeleton h={300} /></div></div>
      </div>
    );
  }
  const roster = desk.classes.find(c => normClass(c.cls) === normClass(cls))?.students ?? [];
  const picker = <ScopePicker classes={classes} cls={cls} subjects={subjects} subject={subject}
    onChange={n => go({ class: n.class ?? cls, subject: n.subject ?? (n.class ? null : subject), student: n.class ? null : params.get('student') })} />;

  if (!classes.length || !roster.length) {
    return (
      <>
        <PageBar eyebrow="MASTERY TRACKER" title="Student Progress" actions={picker} />
        <div className="card"><Empty icon={<Warning size={26} weight="duotone" />} title={classes.length ? `No students in ${cls} yet` : 'No classes assigned yet'}>
          {classes.length ? 'Students appear here once they are enrolled in this class.' : 'Your school admin hasn’t linked you to any classes and subjects yet.'}
        </Empty></div>
      </>
    );
  }

  const student = roster.find(s => s.id === params.get('student')) ?? roster[0];
  const chapters = chaptersFor(cls, subject, roster).map(c => ({ ...c, t: scoreFor(student, subject, c.key) }));
  const scored = chapters.filter((c): c is typeof c & { t: TopicScore } => c.t !== null);
  const unscored = chapters.filter(c => c.t === null);
  const overall = studentOverall(student, subject);
  const weakest = scored.length ? scored.reduce((m, c) => (c.t.score < m.t.score ? c : m)) : null;
  const evaluated = desk.assignments.filter(a => normClass(a.cls) === normClass(cls) && normSubject(a.subject) === normSubject(subject)
    && a.submissions.some(s => s.studentId === student.id && s.state === 'graded')).length;
  const practiceHref = weakest
    ? `/teacher/homework?${new URLSearchParams({ new: '1', class: cls, subject, chapter: weakest.name, for: student.id })}`
    : null;

  return (
    <>
      <PageBar eyebrow="MASTERY TRACKER" title="Student Progress" sub="A closer look at how this student is doing, chapter by chapter."
        actions={<>
          {picker}
          <select className="cmp-sel" style={{ width: 'auto', minWidth: 220 }} aria-label="Student" value={student.id} onChange={e => go({ student: e.target.value })}>
            {roster.map(s => <option key={s.id} value={s.id}>Viewing: {s.name}</option>)}
          </select>
        </>} />
      <div className="g2" style={{ gridTemplateColumns: 'minmax(0, 340px) minmax(0, 1fr)' }}>
        <div>
          <div className="card" style={{ background: 'var(--ink)', color: '#fff', marginBottom: 18, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -18, top: 14, width: 130, height: 130, borderRadius: '50%', border: '16px solid rgba(255,255,255,.05)' }} />
            <div style={{ position: 'absolute', right: 22, top: 54, width: 50, height: 50, borderRadius: '50%', border: '9px solid rgba(255,255,255,.06)' }} />
            <div className="av" style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 22, marginBottom: 16 }}>{initials(student.name)}</div>
            <h2 style={{ fontSize: 29, fontWeight: 800 }}>{student.name}</h2>
            <div style={{ color: '#9FBBE0', fontSize: 14, marginTop: 4 }}>{cls} · {subject || 'All subjects'}{student.rollNo ? ` · ${student.rollNo}` : ''}</div>
            <span className="chip" style={{ marginTop: 12, display: 'inline-block' }}>{evaluated} Assignment{evaluated === 1 ? '' : 's'} Evaluated</span>
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', color: '#9FBBE0' }}>OVERALL MASTERY</div>
              <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1, marginTop: 6 }}>{overall !== null ? `${overall}%` : '—'}</div>
              {overall === null && <div style={{ color: '#9FBBE0', fontSize: 13, marginTop: 8 }}>Builds as graded work comes in</div>}
            </div>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><Lightning size={18} weight="fill" color="#EAB308" /> Chapter Distribution</h3>
            <p className="muted" style={{ margin: '6px 0 10px' }}>Where they&apos;re strong, and where they&apos;re not, at a glance.</p>
            {scored.length >= 3
              ? <div style={{ display: 'grid', placeItems: 'center' }}><Radar values={scored.map(c => c.t.score)} labels={scored.map(c => shortLabel(c.name))} title={`${student.name}'s mastery by chapter`} /></div>
              : <p className="muted" style={{ fontSize: 13 }}>{scored.length ? `Only ${scored.length} chapter${scored.length === 1 ? ' has' : 's have'} graded evidence so far; the chart appears from three.` : 'No chapters have graded evidence yet.'}</p>}
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 23, fontWeight: 800 }}>Chapter by Chapter</h3>
            <p className="muted" style={{ margin: '6px 0 22px' }}>Each chapter&apos;s score is this student&apos;s True Mastery Level for it, built from the evidence underneath.</p>
            {scored.length ? scored.map(c => {
              const isWeak = weakest?.key === c.key;
              return (
                <div key={c.key} style={{ border: isWeak ? '2px solid var(--blue)' : '1px solid var(--line)', borderRadius: 16, padding: 20, marginBottom: 12, background: isWeak ? '#FAFCFF' : '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                    <div className="av" style={{ background: hmColor(c.t.score), color: '#fff', borderRadius: 11 }}>{c.seq}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: 18 }}>{c.name}</b>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        {c.t.band && <Chip tone={c.t.band === 'firm' ? 'g' : c.t.band === 'provisional' ? 'a' : 'n'}>{(BAND_LABEL[c.t.band] ?? c.t.band).toUpperCase()}</Chip>}
                        <span className="muted" style={{ fontSize: 12 }}>{c.t.items} piece{c.t.items === 1 ? '' : 's'} of evidence{isWeak ? ' · lowest chapter' : ''}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em' }}>MASTERY</div>
                      <b style={{ fontSize: 22, color: hmColor(c.t.score) }}>{c.t.score}%</b>
                    </div>
                  </div>
                  {COMPONENTS.map(k => <Component key={k.key} label={k.label} weight={k.weight} value={c.t[k.key]} />)}
                </div>
              );
            }) : <p className="muted" style={{ marginBottom: 12 }}>Nothing graded for {student.name.split(' ')[0]} in {subject || 'this subject'} yet. Confirmed homework and quiz grades appear here chapter by chapter.</p>}
            {unscored.length > 0 && (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 6 }}>
                <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em', marginBottom: 8 }}>NOT YET ASSESSED ({unscored.length})</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{unscored.map(c => <Chip key={c.key} tone="n">{c.name}</Chip>)}</div>
              </div>
            )}
          </div>

          <div className="card" style={{ background: 'linear-gradient(120deg,#1652C9,#2F6BFF)', color: '#fff' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: 'rgba(255,255,255,.18)', display: 'grid', placeItems: 'center', flex: '0 0 46px' }}><Crosshair size={22} weight="bold" /></div>
              <div>
                <h3 style={{ fontSize: 22, fontWeight: 800 }}>Learning Path</h3>
                <p style={{ color: '#D3E2FA', fontSize: 15, lineHeight: 1.7, marginTop: 10 }}>
                  {weakest
                    ? <><b style={{ color: '#FFD466', borderBottom: '2px solid #FFD466' }}>{weakest.name} ({weakest.t.score}%)</b> is {student.name.split(' ')[0]}&apos;s lowest-scoring chapter{scored.length > 1 ? '' : ' so far'}. Targeted practice here is the fastest way to move it.</>
                    : <>Once {student.name.split(' ')[0]} has graded work in {subject || 'this subject'}, the chapter to focus on shows up here.</>}
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                  {practiceHref
                    ? <Link className="btn" style={{ background: '#fff', color: 'var(--ink)' }} href={practiceHref}>Assign practice to {student.name.split(' ')[0]}</Link>
                    : <Link className="btn" style={{ background: '#fff', color: 'var(--ink)' }} href={`/teacher/homework?${new URLSearchParams({ new: '1', class: cls, subject })}`}>Assign {subject || 'homework'} work to {cls}</Link>}
                  {weakest && (
                    <Link className="btn" style={{ background: 'rgba(255,255,255,.14)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }}
                      href={`/teacher/heatmap?${new URLSearchParams({ class: cls, subject, chapter: weakest.key })}`}>See the class on this chapter</Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
