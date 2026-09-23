'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PaperPlaneTiltIcon as PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { CopyIcon as Copy } from '@phosphor-icons/react/dist/ssr/Copy';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { NotebookIcon as Notebook } from '@phosphor-icons/react/dist/ssr/Notebook';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { Chip } from '@/components/canon/ui';
import type { Artifact } from '@/lib/teacher/copilot';
import { topicKey } from '@/lib/teacher/desk';
import { totalMarks } from '@/lib/teacher/questions';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { writeCopilotSeed } from './handoff';

const LETTERS = 'ABCDEF';
const PURPOSE: Record<string, string> = { worksheet: 'WORKSHEET', quiz: 'QUIZ', remedial: 'REMEDIAL PACK', exit_tickets: 'EXIT TICKETS' };

/** Plain-text version for the clipboard (WhatsApp, email, a document). */
export function artifactText(a: Artifact): string {
  if (a.kind === 'questions') {
    return [a.title, a.chapter ? `Chapter: ${a.chapter}` : '', '',
      ...a.questions.map((q, i) => [`${i + 1}. ${q.questionText} (${q.marks} mark${q.marks === 1 ? '' : 's'})`,
        ...(q.options ?? []).map((o, oi) => `   ${LETTERS[oi]}. ${o}`)].join('\n')),
      '', 'Answers:', ...a.questions.map((q, i) => `${i + 1}. ${q.type === 'mcq' ? LETTERS[q.answer ?? 0] : ''}${q.why ? ` ${q.type === 'mcq' ? '— ' : ''}${q.why}` : ''}`),
      a.notes ? `\n${a.notes}` : ''].filter(x => x !== undefined).join('\n');
  }
  if (a.kind === 'lesson') {
    return [a.title, a.chapter ? `Chapter: ${a.chapter} · ${a.durationMin} min` : '', '', 'Objectives:', ...a.objectives.map(o => `- ${o}`),
      'Success criteria:', ...a.successCriteria.map(o => `- ${o}`), a.priorKnowledge ? `Prior knowledge: ${a.priorKnowledge}` : '', '',
      ...a.stages.map(s => `${s.name} (${s.minutes} min)\n  Teacher: ${s.teacher}\n  Students: ${s.students}`), '',
      `Support: ${a.differentiation.support}`, `Stretch: ${a.differentiation.stretch}`, `Exit check: ${a.checkForUnderstanding}`].join('\n');
  }
  if (a.kind === 'rubric') return [a.title, ...a.criteria.map(c => `${c.name}\n${c.levels.map(l => `  ${l.label} (${l.points}): ${l.descriptor}`).join('\n')}`)].join('\n\n');
  return `${a.title}\n\n${a.markdown}`;
}

/** One Copilot artifact, with the actions that make it useful. */
export default function ArtifactView({ artifact: a, cls, subject, onRefine, onToast, sample = null, targets = [] }: {
  artifact: Artifact; cls: string; subject: string; onRefine?: (text: string) => void; onToast?: (m: string) => void;
  /** Show as a static example ("what you'll get"), with its footnote; no actions. */
  sample?: string | null;
  /** Students a targeted request was for — carried into "Send to class". */
  targets?: string[];
}) {
  const router = useRouter();
  const { call } = useTeacherDesk();
  const box = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async () => {
    try { await navigator.clipboard.writeText(artifactText(a)); onToast?.('Copied'); }
    catch { setError('Your browser blocked the clipboard. Select the text to copy it.'); }
  };
  const print = () => {
    const el = box.current;
    if (!el) return;
    el.classList.add('print-me'); document.body.classList.add('print-one');
    const done = () => { el.classList.remove('print-me'); document.body.classList.remove('print-one'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };
  const sendToClass = (kind: 'homework' | 'quiz') => {
    if (a.kind !== 'questions') return;
    const questions = kind === 'quiz' ? a.questions.filter(q => q.type === 'mcq') : a.questions;
    if (!writeCopilotSeed({ title: a.title, questions })) { setError('Your browser blocked session storage, so the questions can’t be handed over. Copy them instead.'); return; }
    router.push(`/teacher/${kind}?${new URLSearchParams({ new: '1', seed: 'copilot', class: cls, subject, ...(a.chapter ? { chapter: a.chapter } : {}), ...(targets.length ? { for: targets.join(',') } : {}) })}`);
  };
  const saveLesson = async () => {
    if (a.kind !== 'lesson') return;
    setBusy(true); setError(null);
    try {
      const chapterName = a.chapter || 'General';
      const row = await call('/api/teacher/lessons', 'POST', {
        class: cls, subject, chapterKey: topicKey(chapterName), chapterName, topics: a.topics, title: a.title, durationMin: a.durationMin,
        objectives: a.objectives, successCriteria: a.successCriteria, priorKnowledge: a.priorKnowledge, materials: a.materials, stages: a.stages,
        differentiation: a.differentiation, checkForUnderstanding: a.checkForUnderstanding, status: 'draft', aiDrafted: true,
      });
      setSaved(row.id); onToast?.('Saved to your lesson planner');
    } catch (e: any) { setError(e?.message || 'Couldn’t save the lesson.'); } finally { setBusy(false); }
  };

  const mcqOnly = a.kind === 'questions' && a.questions.every(q => q.type === 'mcq');
  const hasMcq = a.kind === 'questions' && a.questions.some(q => q.type === 'mcq');

  return (
    <div className={`art${sample ? ' sample' : ''}`} ref={box}>
      <div className="art-hd">
        <div style={{ minWidth: 0 }}>
          {sample && <Chip tone="a">EXAMPLE</Chip>}{' '}
          <Chip tone="p">{a.kind === 'questions' ? PURPOSE[a.purpose] : a.kind === 'lesson' ? 'LESSON PLAN' : a.kind === 'rubric' ? 'RUBRIC' : a.audience === 'parent' ? 'PARENT NOTE' : 'DOCUMENT'}</Chip>
          <h3 style={{ fontSize: 17, fontWeight: 800, marginTop: 8 }}>{a.title}</h3>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {a.kind === 'questions' && `${a.chapter ? `${a.chapter} · ` : ''}${a.questions.length} question${a.questions.length === 1 ? '' : 's'} · ${totalMarks(a.questions)} marks`}
            {a.kind === 'lesson' && `${a.chapter ? `${a.chapter} · ` : ''}${a.durationMin} minutes · ${a.stages.length} stages`}
            {a.kind === 'rubric' && `${a.criteria.length} criteria`}
          </div>
        </div>
      </div>

      <div className="art-bd">
        {a.kind === 'questions' && (
          <>
            {a.questions.map((q, i) => (
              <div className="art-q" key={i}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <b>{i + 1}.</b><span style={{ flex: 1 }}>{q.questionText}</span>
                  <span className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{q.level ? `${q.level} · ` : ''}{q.marks}m</span>
                </div>
                {q.options && <div className="opts">{q.options.map((o, oi) => <span key={oi} className={oi === q.answer ? 'ok' : ''}>{LETTERS[oi]}. {o}{oi === q.answer && <Check size={11} weight="bold" />}</span>)}</div>}
                {q.why && <div className="why">{q.type === 'mcq' ? 'Why: ' : 'Marking: '}{q.why}</div>}
              </div>
            ))}
            {a.notes && <div className="note info" style={{ marginTop: 10 }}>{a.notes}</div>}
          </>
        )}
        {a.kind === 'lesson' && (
          <div style={{ display: 'grid', gap: 12 }}>
            {a.objectives.length > 0 && <div><b>Objectives</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{a.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul></div>}
            {a.successCriteria.length > 0 && <div><b>Success criteria</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{a.successCriteria.map((o, i) => <li key={i}>{o}</li>)}</ul></div>}
            <div className="timebar" aria-hidden="true">
              {a.stages.map((s, i) => <i key={i} style={{ width: `${(s.minutes / a.durationMin) * 100}%`, background: ['#4C8DFF', '#7C5CFC', '#10B981', '#F59E0B', '#F45E77', '#14B8A6'][i % 6] }} />)}
            </div>
            {a.stages.map((s, i) => (
              <div key={i} style={{ borderLeft: `3px solid ${['#4C8DFF', '#7C5CFC', '#10B981', '#F59E0B', '#F45E77', '#14B8A6'][i % 6]}`, paddingLeft: 12 }}>
                <b>{s.name}</b> <span className="muted">· {s.minutes} min</span>
                <div><span className="muted">Teacher:</span> {s.teacher}</div>
                <div><span className="muted">Students:</span> {s.students}</div>
              </div>
            ))}
            {(a.differentiation.support || a.differentiation.stretch) && (
              <div className="g2" style={{ gap: 10 }}>
                <div className="note info"><b>Support</b><br />{a.differentiation.support}</div>
                <div className="note info"><b>Stretch</b><br />{a.differentiation.stretch}</div>
              </div>
            )}
            {a.checkForUnderstanding && <div><b>Exit check</b><div>{a.checkForUnderstanding}</div></div>}
          </div>
        )}
        {a.kind === 'rubric' && (
          <div style={{ overflowX: 'auto' }}>
            <table className="rub">
              <thead><tr><th>Criterion</th>{a.criteria[0].levels.map((l, i) => <th key={i}>{l.label} ({l.points})</th>)}</tr></thead>
              <tbody>{a.criteria.map((c, i) => <tr key={i}><td><b>{c.name}</b></td>{c.levels.map((l, j) => <td key={j}>{l.descriptor}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
        {a.kind === 'document' && <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{a.markdown}</ReactMarkdown></div>}
        {error && <div className="err" role="alert" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {sample ? <div className="art-ft muted" style={{ fontSize: 12 }}>{sample}</div> : <div className="art-ft">
        {a.kind === 'questions' && !mcqOnly && <button className="btn sm red" onClick={() => sendToClass('homework')}><PaperPlaneTilt size={13} weight="fill" /> Send to {cls} as homework</button>}
        {a.kind === 'questions' && hasMcq && <button className={`btn sm ${mcqOnly ? 'red' : ''}`} onClick={() => sendToClass('quiz')}><PaperPlaneTilt size={13} weight={mcqOnly ? 'fill' : 'bold'} /> {mcqOnly ? `Send to ${cls} as a quiz` : 'MCQs as a quiz'}</button>}
        {a.kind === 'lesson' && (saved
          ? <Link className="btn sm" href={`/teacher/syllabus?${new URLSearchParams({ class: cls, subject, tab: 'lessons', lesson: saved })}`}><Check size={13} weight="bold" /> Open in planner</Link>
          : <button className="btn sm red" disabled={busy} onClick={saveLesson}><Notebook size={13} weight="bold" /> {busy ? 'Saving…' : 'Save to lesson planner'}</button>)}
        <button className="btn sm" onClick={copy}><Copy size={13} weight="bold" /> Copy</button>
        <button className="btn sm" onClick={print}><Printer size={13} weight="bold" /> Print</button>
        <span style={{ flex: 1 }} />
        {onRefine && a.kind === 'questions' && ['Make it easier', 'Make it harder', 'Add 2 HOTS questions'].map(r => <button key={r} className="btn sm" onClick={() => onRefine(r)}>{r}</button>)}
        {onRefine && a.kind === 'lesson' && ['Add a hands-on activity', 'Shorten to 30 minutes'].map(r => <button key={r} className="btn sm" onClick={() => onRefine(r)}>{r}</button>)}
        {onRefine && a.kind === 'document' && ['Make it shorter', 'Translate to Hindi'].map(r => <button key={r} className="btn sm" onClick={() => onRefine(r)}>{r}</button>)}
      </div>}
    </div>
  );
}
