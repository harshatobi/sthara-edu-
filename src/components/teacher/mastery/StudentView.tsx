'use client';

import Link from 'next/link';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { CaretLeftIcon as CaretLeft } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon as CaretRight } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { CrosshairIcon as Crosshair } from '@phosphor-icons/react/dist/ssr/Crosshair';
import { Chip, Skeleton, hmColor, hmInk } from '@/components/canon/ui';
import { Sparkline, TrendChart } from '@/components/canon/TrendLine';
import { useGet } from '@/components/canon/useGet';
import { BAND_LABEL, chaptersFor, scoreFor, studentOverall, type ChapterRef } from '@/lib/teacher/mastery';
import { change, meanSeries, rankOf, type StudentTrend } from '@/lib/teacher/masteryTrend';
import { topicKey } from '@/lib/teacher/topicKey';
import type { TStudent } from '@/lib/teacher/desk';
import type { EngagementInputs, Evidence } from '@/lib/tml/engine';
import { TutorAssign, type useTutorAssignments } from '../TutorAssign';
import ChapterDrill from './ChapterDrill';
import { Delta, Score, firstName, initials, pts } from './parts';

interface EvidenceResp { nowMs: number; evidence: Evidence[]; flagged: string[]; engagement: EngagementInputs }
export interface TrendResp { weeks: string[]; students: Record<string, StudentTrend> }

export default function StudentView({ student, roster, cls, subject, trends, evaluated, go, chapterKey, tutor }: {
  student: TStudent; roster: TStudent[]; cls: string; subject: string; trends: TrendResp | null; evaluated: number;
  go: (n: Record<string, string | null>) => void; chapterKey: string | null; tutor: ReturnType<typeof useTutorAssignments>;
}) {
  const ev = useGet<EvidenceResp>(subject ? `/api/teacher/mastery/student?${new URLSearchParams({ student: student.id, subject })}` : null);
  const name = firstName(student.name);
  const chapters = chaptersFor(cls, subject, roster);
  const scored = chapters.map(c => ({ c, t: scoreFor(student, subject, c.key) })).filter(x => x.t !== null) as { c: ChapterRef; t: NonNullable<ReturnType<typeof scoreFor>> }[];
  const unscored = chapters.filter(c => !scoreFor(student, subject, c.key));
  const overall = studentOverall(student, subject);
  const classOveralls = roster.map(s => studentOverall(s, subject)).filter((v): v is number => v !== null);
  const rank = overall === null ? null : rankOf(overall, classOveralls);
  const my = trends?.students[student.id];
  const classMean = trends ? meanSeries(Object.values(trends.students).map(s => s.subject), trends.weeks.length) : null;
  const overallChange = my ? change(my.subject) : null;
  const weakest = scored.length ? scored.reduce((m, x) => (x.t.score < m.t.score ? x : m)) : null;
  const idx = roster.findIndex(s => s.id === student.id);
  const prev = idx > 0 ? roster[idx - 1] : null, next = idx < roster.length - 1 ? roster[idx + 1] : null;
  const evidenceFor = (c: ChapterRef) => (ev.data?.evidence ?? []).filter(e => topicKey(e.topicName) === c.key);

  return (
    <>
      <div className="ms-nav">
        <button className="btn" onClick={() => go({ student: null, chapter: null })}><ArrowLeft size={15} weight="bold" /> All of {cls}</button>
        <div className="ms-nav-r">
          <button className="btn" disabled={!prev} onClick={() => prev && go({ student: prev.id, chapter: null })} aria-label={prev ? `Previous: ${prev.name}` : 'No previous student'}><CaretLeft size={15} weight="bold" /></button>
          <select className="cmp-sel" aria-label="Student" value={student.id} onChange={e => go({ student: e.target.value, chapter: null })}>
            {roster.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn" disabled={!next} onClick={() => next && go({ student: next.id, chapter: null })} aria-label={next ? `Next: ${next.name}` : 'No next student'}><CaretRight size={15} weight="bold" /></button>
        </div>
      </div>

      <div className="ms-top">
        <div className="card dark-card ms-hero">
          <div className="av ms-hero-av">{initials(student.name)}</div>
          <h2>{student.name}</h2>
          <div className="ms-hero-sub ms-meta"><span>{cls}</span><span>{subject}</span>{student.rollNo && <span>Roll {student.rollNo}</span>}</div>
          <div className="ms-hero-lb">{subject} mastery</div>
          <div className="ms-hero-row">
            <div className="ms-hero-vl">{overall !== null ? `${overall}%` : 'Not yet'}</div>
            {overall !== null && <Delta v={overallChange} />}
          </div>
          <div className="ms-hero-facts">
            {rank !== null && <span><b>{rank} of {classOveralls.length}</b> in class</span>}
            <span><b>{scored.length}</b> of {chapters.length} chapters scored</span>
            <span><b>{evaluated}</b> assignment{evaluated === 1 ? '' : 's'} graded</span>
          </div>
        </div>
        <div className="card ms-trend">
          <h3 className="ms-h3">Mastery over time</h3>
          <p className="muted ms-sub">{name}&apos;s {subject} mastery week by week, against the class average (dashed).</p>
          {!trends ? <Skeleton h={200} /> : (
            <TrendChart points={pts(my?.subject ?? trends.weeks.map(() => null), trends.weeks)} compare={pts(classMean!, trends.weeks)}
              refValue={75} refLabel="75% green" title={`${student.name}: ${subject} mastery by week`} seriesLabel={name} />
          )}
        </div>
      </div>

      <div className="card">
        <div className="ms-card-h">
          <div>
            <h3 className="ms-h3">Chapter by chapter</h3>
            <p className="muted ms-sub">Open a chapter to see why it scores what it does, what would move it, and how {name} compares with the class.</p>
          </div>
        </div>
        {!scored.length && <p className="muted">Nothing graded for {name} in {subject} yet. Confirmed homework and quiz marks appear here chapter by chapter.</p>}
        <ul className="ms-chapters">
          {scored.map(({ c, t }) => {
            const open = chapterKey === c.key;
            const series = my?.chapters[c.key];
            const classScores = roster.map(s => scoreFor(s, subject, c.key)?.score).filter((v): v is number => typeof v === 'number');
            const avg = classScores.length ? Math.round(classScores.reduce((a, b) => a + b, 0) / classScores.length) : null;
            const chEvidence = evidenceFor(c);
            const flagged = chEvidence.some(e => e.assignmentId && ev.data?.flagged.includes(e.assignmentId));
            return (
              <li key={c.key} className={`ms-ch${open ? ' open' : ''}${weakest?.c.key === c.key ? ' weak' : ''}`}>
                <button className="ms-ch-row" aria-expanded={open} onClick={() => go({ chapter: open ? null : c.key })}>
                  <span className="av ms-ch-av" style={{ background: hmColor(t.score), color: hmInk(t.score) }}>{c.seq}</span>
                  <span className="ms-ch-name">
                    <b>{c.name}</b>
                    <span className="ms-ch-meta">
                      {t.band && <Chip tone={t.band === 'firm' ? 'g' : t.band === 'provisional' ? 'a' : 'n'}>{(BAND_LABEL[t.band] ?? t.band).toUpperCase()}</Chip>}
                      <span className="muted">{t.items} piece{t.items === 1 ? '' : 's'}</span>
                      {avg !== null && <span className="muted">Class avg {avg}%</span>}
                      {weakest?.c.key === c.key && scored.length > 1 && <span className="ms-weak-tag">Lowest chapter</span>}
                    </span>
                  </span>
                  <span className="ms-ch-spark">{series && trends ? <Sparkline points={pts(series, trends.weeks)} label={`${c.name} by week`} /> : null}</span>
                  <span className="ms-ch-chg"><Delta v={series ? change(series) : null} /></span>
                  <span className="ms-ch-score"><Score v={Math.round(t.score)} size={20} /></span>
                  <CaretDown className="ms-ch-caret" size={16} weight="bold" aria-hidden />
                </button>
                {open && (
                  <div className="ms-ch-body">
                    {ev.error ? <div className="note err" role="alert">{ev.error}</div> : !ev.data ? <Skeleton h={220} /> : (
                      <ChapterDrill chapterName={c.name} evidence={chEvidence} nowMs={ev.data.nowMs} engagement={ev.data.engagement} flagged={flagged}
                        stored={Math.round(t.score)} student={student.name} classScores={classScores} />
                    )}
                    <div className="ms-ch-actions">
                      <TutorAssign cls={cls} subject={subject} chapter={c.name} score={t.score} student={student.id} firstName={name} api={tutor} />
                      <Link className="btn" href={`/teacher/homework?${new URLSearchParams({ new: '1', class: cls, subject, chapter: c.name, for: student.id })}`}>Assign practice on this chapter</Link>
                      <Link className="btn" href={`/teacher/heatmap?${new URLSearchParams({ class: cls, subject, chapter: c.key })}`}>The class on this chapter</Link>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {unscored.length > 0 && (
          <div className="ms-unscored">
            <h4 className="ms-h4">Not assessed yet ({unscored.length})</h4>
            <div className="ms-chips">{unscored.map(c => <Chip key={c.key} tone="n">{c.name}</Chip>)}</div>
          </div>
        )}
      </div>

      {weakest && (
        <div className="card ms-path">
          <div className="ms-path-ic"><Crosshair size={22} weight="bold" /></div>
          <div>
            <h3>Where to focus</h3>
            <p><b>{weakest.c.name} ({Math.round(weakest.t.score)}%)</b> is {name}&apos;s lowest chapter. Open it above and use <b>What if</b> to see the result that would lift it to green.</p>
          </div>
          <button className="btn" onClick={() => go({ chapter: weakest.c.key })}>Open {weakest.c.name}</button>
        </div>
      )}
    </>
  );
}
