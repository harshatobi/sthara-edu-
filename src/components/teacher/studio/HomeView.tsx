'use client';

import type { ReactNode } from 'react';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { ChalkboardTeacherIcon as ChalkboardTeacher } from '@phosphor-icons/react/dist/ssr/ChalkboardTeacher';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { ListChecksIcon as ListChecks } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { ExamIcon as Exam } from '@phosphor-icons/react/dist/ssr/Exam';
import { LightbulbIcon as Lightbulb } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { ShapesIcon as Shapes } from '@phosphor-icons/react/dist/ssr/Shapes';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { WarningCircleIcon as WarningCircle } from '@phosphor-icons/react/dist/ssr/WarningCircle';
import { PlusCircleIcon as PlusCircle } from '@phosphor-icons/react/dist/ssr/PlusCircle';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { ChartBarIcon as ChartBar } from '@phosphor-icons/react/dist/ssr/ChartBar';
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { Skeleton } from '@/components/canon/ui';
import type { ReadyItem, WeekPeriod } from '@/lib/studio/home';
import type { HomeData } from './api';

export type Tool = 'questions' | 'test' | 'lesson' | 'ideas' | 'visual' | 'parent_note';

const READY_ICON: Record<ReadyItem['kind'], ReactNode> = {
  catchup: <ArrowsClockwise size={19} weight="duotone" />, lesson: <ChalkboardTeacher size={19} weight="duotone" />,
  parent_note: <EnvelopeSimple size={19} weight="duotone" />, draft: <FileText size={19} weight="duotone" />, test: <Exam size={19} weight="duotone" />,
  marked: <ChartBar size={19} weight="duotone" />, retention: <ClockCounterClockwise size={19} weight="duotone" />,
};

export const TOOLS: { key: Tool; label: string; blurb: string; icon: ReactNode }[] = [
  { key: 'questions', label: 'Question set', blurb: 'Worksheet, quiz, catch-up or exit ticket, built to a blueprint', icon: <ListChecks size={21} weight="duotone" /> },
  { key: 'lesson', label: 'Lesson', blurb: 'A period plan with stages, support and stretch', icon: <ChalkboardTeacher size={21} weight="duotone" /> },
  { key: 'test', label: 'Test or paper', blurb: 'Unit test with A, B and C sets, or a CBSE board-pattern paper', icon: <Exam size={21} weight="duotone" /> },
  { key: 'ideas', label: 'Teaching ideas', blurb: 'Explain it three ways, discussion prompts, fix wrong ideas', icon: <Lightbulb size={21} weight="duotone" /> },
  { key: 'visual', label: 'Visual or Live Lab', blurb: 'Labelled diagram, picture, or a simulation for the board', icon: <Shapes size={21} weight="duotone" /> },
  { key: 'parent_note', label: 'Parent note', blurb: 'For one family, with one thing to do at home', icon: <EnvelopeSimple size={21} weight="duotone" /> },
];

const STATE: Record<WeekPeriod['state'], { icon: ReactNode; word: string }> = {
  done: { icon: <CheckCircle size={14} weight="bold" />, word: 'Done' },
  ready: { icon: <CheckCircle size={14} weight="bold" />, word: 'Ready' },
  partial: { icon: <WarningCircle size={14} weight="bold" />, word: 'Add materials' },
  none: { icon: <PlusCircle size={14} weight="bold" />, word: 'Make' },
  test: { icon: <Exam size={14} weight="bold" />, word: 'Test' },
  off: { icon: null, word: 'No classes' },
};

export default function HomeView({ cls, data, error, onReady, onTool, onOpen, onTile, onPeriod, onLibrary }: {
  cls: string; data: HomeData | null; error: string | null;
  onReady: (r: ReadyItem) => void; onTool: (t: Tool) => void; onOpen: (materialId: string) => void;
  onTile: (t: 'mastery' | 'support' | 'pace' | 'test') => void; onPeriod: (p: WeekPeriod) => void; onLibrary: () => void;
}) {
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div aria-busy="true"><Skeleton h={150} /><div className="sd-two" style={{ marginTop: 14 }}><Skeleton h={280} /><Skeleton h={280} /></div></div>;
  const t = data.tiles;
  const paceText = t.pace === null ? 'No course plan yet' : t.pace >= 0 ? (t.pace === 0 ? 'On pace' : `${t.pace} ahead`) : `${-t.pace} behind`;
  return (
    <>
      <section className="sd-hero" aria-label={`Where ${cls} stands`}>
        <div className="top">
          <div><h2>Where {cls} stands</h2><p>Each number opens what will move it.</p></div>
          <span className="chip">{t.students} students, {t.chaptersStarted} of {t.chapters} chapters started</span>
        </div>
        <div className="sd-tiles">
          <button className="sd-tile" onClick={() => onTile('mastery')}>
            <span className="lb">CLASS MASTERY</span><b className="sd-am">{t.mastery === null ? '–' : `${t.mastery}%`}</b>
            <span>{t.lowest ? `Lowest: ${t.lowest.chapter} ${t.lowest.score}%` : 'No graded work yet'}</span>
            <span className="fix">{t.lowest ? 'Catch-up set' : 'Set a quick quiz'} <ArrowRight size={13} weight="bold" /></span>
          </button>
          <button className="sd-tile" onClick={() => onTile('support')}>
            <span className="lb">NEED SUPPORT</span><b className={t.needSupport.length ? 'sd-rd' : 'sd-gr'}>{t.needSupport.length}</b>
            <span>below 40%</span>
            <span className="fix">{t.needSupport.length ? 'One version each' : 'Stretch set'} <ArrowRight size={13} weight="bold" /></span>
          </button>
          <button className="sd-tile" onClick={() => onTile('pace')}>
            <span className="lb">SYLLABUS PACE</span><b className={t.pace !== null && t.pace < 0 ? 'sd-am' : 'sd-gr'}>{paceText}</b>
            <span>{t.pace === null ? 'Set periods in Syllabus' : 'periods, against your course plan'}</span>
            <span className="fix">Open the syllabus <ArrowRight size={13} weight="bold" /></span>
          </button>
          <button className="sd-tile" onClick={() => onTile('test')}>
            <span className="lb">NEXT TEST</span><b className="sd-gr">{t.nextTest ? new Date(`${t.nextTest.on}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'None'}</b>
            <span>{t.nextTest ? t.nextTest.title : 'No exam on the calendar'}</span>
            <span className="fix">{t.nextTest ? 'Revision test' : 'Make a unit test'} <ArrowRight size={13} weight="bold" /></span>
          </button>
        </div>
      </section>

      <div className="sd-two">
        <section className="sd-card sd-pad" aria-label="Worth doing this week">
          <div className="sd-hd"><h2>Worth doing this week {data.ready.length > 0 && <span className="sd-chip t">{data.ready.length}</span>}</h2><p>From {cls}&apos;s results and your week. Opens set up; nothing is made until you say so.</p></div>
          {data.ready.length ? data.ready.map(r => (
            <div className="sd-ri" key={r.id}>
              <span className="sd-ic">{READY_ICON[r.kind]}</span>
              <div><h3>{r.title}</h3><p>{r.detail}</p></div>
              <button className="btn sm pri" onClick={() => onReady(r)}>{r.kind === 'draft' ? 'Open' : 'Set it up'}</button>
            </div>
          )) : <p className="sd-mut" style={{ fontSize: 14 }}>Nothing pressing for {cls}. Pick a tool to make something.</p>}
        </section>

        <section className="sd-card sd-pad" aria-label="Make something">
          <div className="sd-hd"><h2>Make something</h2><p>Bank first. AI writes only what&apos;s missing.</p></div>
          <div className="sd-tools">
            {TOOLS.map(x => (
              <button key={x.key} className="sd-tool" onClick={() => onTool(x.key)}>
                <span className="sd-ic">{x.icon}</span><h3>{x.label}</h3><p>{x.blurb}</p>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="sd-card sd-pad" style={{ marginBottom: 14 }} aria-label={`Your week with ${cls}`}>
        <div className="sd-hd"><h2>Your week with {cls}</h2><p>{data.hasTimetable ? 'Is every period ready?' : 'Your periods appear here once the timetable is published.'}</p></div>
        {data.hasTimetable && (
          <>
            <div className="sd-wk">
              {data.week.map(d => (
                <div className="sd-day" key={d.date}>
                  <div className={`d${d.today ? ' today' : ''}`}>{d.label}</div>
                  {d.periods.length ? d.periods.map((p, i) => (
                    <button key={i} className={`sd-per ${p.state}`} onClick={() => onPeriod(p)} disabled={p.state === 'off'} aria-label={`${d.label}, ${p.title}: ${STATE[p.state].word}`}>
                      <b>{p.title}</b>{p.detail}
                      {STATE[p.state].icon && <span className="s">{STATE[p.state].icon} {STATE[p.state].word}</span>}
                    </button>
                  )) : <div className="sd-per off">No period</div>}
                </div>
              ))}
            </div>
            <div className="sd-legend"><span><CheckCircle size={14} weight="bold" color="#0F7A55" /> Ready or done</span><span><WarningCircle size={14} weight="bold" color="#B45309" /> Plan only</span><span><PlusCircle size={14} weight="bold" /> Nothing yet</span></div>
          </>
        )}
      </section>

      <section className="sd-card sd-pad" aria-label="Recently made">
        <div className="sd-hd"><h2>Recently made</h2><button className="btn sm" onClick={onLibrary}>All my materials <ArrowRight size={13} weight="bold" /></button></div>
        {data.recent.length ? (
          <table className="sd-tbl">
            <thead><tr><th>MATERIAL</th><th>STATUS</th><th>UPDATED</th><th /></tr></thead>
            <tbody>{data.recent.map(m => (
              <tr key={m.id}>
                <td><b>{m.title}</b><small>{KIND_LABEL[m.kind] ?? m.kind}</small></td>
                <td><StatusChip status={m.status} /></td>
                <td>{new Date(m.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                <td style={{ textAlign: 'right' }}><button className="btn sm" onClick={() => onOpen(m.id)}>Open</button></td>
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="sd-mut" style={{ fontSize: 14 }}>Things you make are saved here and in My materials.</p>}
      </section>
    </>
  );
}

export const KIND_LABEL: Record<string, string> = { worksheet: 'Worksheet', quiz: 'Quiz', catchup: 'Catch-up', exit_ticket: 'Exit ticket', test: 'Unit test', board_paper: 'Board paper', lesson: 'Lesson', ideas: 'Teaching ideas', visual: 'Visual', lab: 'Live Lab', parent_note: 'Parent note', rubric: 'Rubric' };

export function StatusChip({ status }: { status: string }) {
  if (status === 'assigned') return <span className="sd-chip g"><CheckCircle size={13} weight="bold" /> Assigned</span>;
  if (status === 'ready') return <span className="sd-chip t"><CheckCircle size={13} weight="bold" /> Ready</span>;
  if (status === 'archived') return <span className="sd-chip">Archived</span>;
  return <span className="sd-chip a"><FileText size={13} weight="bold" /> Draft</span>;
}
