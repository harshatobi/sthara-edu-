'use client';

import { useEffect, useState } from 'react';
import { WarningCircleIcon as WarningCircle } from '@phosphor-icons/react/dist/ssr/WarningCircle';
import { LightbulbIcon as Lightbulb } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { DatabaseIcon as Database } from '@phosphor-icons/react/dist/ssr/Database';
import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { CaretRightIcon as CaretRight } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { Skeleton } from '@/components/canon/ui';
import { LETTERS } from '@/lib/studio/handout';
import { useStudioApi, type SetupPreset } from './api';

interface Q {
  key: string; n: number; answers: number; text: string; marks: number; topic: string | null; options: string[] | null; answer: number | null; bank: boolean;
  facility: number | null; full: number; discrimination: number | null; picks: number[] | null; popularWrong: { option: number; count: number } | null;
  missed: string[]; missedNames: string[]; flags: string[]; flagText: string[];
  misconception: { label: string; thinking: string; reteach: string; fromBank: boolean } | null;
}
interface Data {
  assignment: { id: string; title: string; class: string; subject: string; due: string | null; mode: string };
  material: { id: string; title: string; chapter: string | null } | null;
  chapter: string | null;
  counts: { students: number; handedIn: number; marked: number };
  questions: Q[];
  topics: { topic: string; facility: number; students: number; missed: string[]; missedNames: string[] }[];
  retest: { topics: string[]; students: { id: string; name: string; topics: string[] }[] };
  retention: { id: string; due_on: string; status: string; note: string | null; assignment_id: string | null } | null;
  wordingNote: string | null;
}

const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`);
const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * After marking (PR B): how one piece of work went, question by question, and what to do about it. The retest is
 * only proposed here: making it opens the Studio set-up with the students and topics filled in, and nothing reaches
 * students until the teacher checks and assigns it.
 */
export default function AnalysisView({ assignmentId, onRetest, onOpenMaterial, onToast }: {
  assignmentId: string; onRetest: (p: SetupPreset) => void; onOpenMaterial: (id: string) => void; onToast: (m: string) => void;
}) {
  const api = useStudioApi();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [left, setLeft] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    api<Data>(`/api/teacher/studio/analysis?assignmentId=${assignmentId}`)
      .then(r => {
        if (!live) return;
        setD(r);
        // Open the first question that needs a look.
        setOpen(o => o ?? r.questions.find(q => q.misconception || q.flags.length)?.key ?? null);
      })
      .catch(e => { if (live) setError(e?.message || 'Couldn’t load this.'); });
    return () => { live = false; };
  }, [api, assignmentId, tick]);

  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!d) return <div aria-busy="true"><Skeleton h={120} /><div style={{ height: 12 }} /><Skeleton h={360} /></div>;

  const { counts } = d;
  const notYet = counts.marked === 0;
  const reteach = d.questions.filter(q => q.misconception?.reteach);
  const retestStudents = d.retest.students.filter(s => !left.has(s.id));

  return (
    <div className="sd-ws">
      <div>
        <div className="sd-card" style={{ overflow: 'hidden' }}>
          <div className="sd-dh">
            <div style={{ flex: 1, minWidth: 220 }}>
              <h2>How {d.assignment.title} went</h2>
              <p>{d.assignment.class} {d.assignment.subject}{d.chapter ? `, ${d.chapter}` : ''}. {counts.handedIn} of {counts.students} handed in, {counts.marked} marked{d.assignment.due ? `; was due ${fmt(d.assignment.due)}` : ''}.</p>
            </div>
            {d.material && <button className="btn sm" onClick={() => onOpenMaterial(d.material!.id)}>Open the set</button>}
          </div>
          {notYet ? (
            <p className="sd-mut" style={{ padding: 18, fontSize: 14 }}>Nothing is marked yet. Once you confirm marks (or students hand in a quiz that marks itself), each question&apos;s results show here.</p>
          ) : (
            <table className="sd-tbl sd-an" aria-label="Question by question">
              <thead><tr><th>#</th><th>QUESTION</th><th>RIGHT</th><th>MISSED</th></tr></thead>
              <tbody>
                {d.questions.map(q => {
                  const isOpen = open === q.key;
                  const needs = !!(q.misconception || q.flags.length);
                  return [
                    <tr key={q.key} className={needs ? 'needs' : undefined}>
                      <td className="mono">{q.n}</td>
                      <td>
                        <button className="sd-an-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : q.key)}>
                          {isOpen ? <CaretDown size={13} weight="bold" /> : <CaretRight size={13} weight="bold" />}
                          <span>{q.text.length > 140 ? `${q.text.slice(0, 140)}…` : q.text}</span>
                        </button>
                        <small style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
                          {q.topic && <span className="sd-chip">{q.topic}</span>}
                          <span className="sd-chip">{q.marks} mark{q.marks === 1 ? '' : 's'}</span>
                          {q.bank && <span className="sd-chip t"><Database size={12} weight="bold" /> Bank</span>}
                          {q.flags.length > 0 && <span className="sd-chip a"><WarningCircle size={12} weight="bold" /> Check this</span>}
                          {q.misconception && <span className="sd-chip r"><Lightbulb size={12} weight="bold" /> Misconception</span>}
                        </small>
                      </td>
                      <td>
                        <b className="mono">{pct(q.facility)}</b>
                        <div className="sd-bar" aria-hidden="true"><i style={{ width: `${Math.round((q.facility ?? 0) * 100)}%` }} /></div>
                        <small>{q.full} of {q.answers} full marks</small>
                      </td>
                      <td><b className="mono">{q.missed.length}</b><small>{q.missed.length ? 'under half marks' : 'nobody'}</small></td>
                    </tr>,
                    isOpen && (
                      <tr key={`${q.key}-x`} className="sd-an-x"><td /><td colSpan={3}>
                        {q.options && q.picks && (
                          <div className="sd-picks" role="list" aria-label="Which option students chose">
                            {q.options.map((o, k) => {
                              const n = q.picks![k], total = q.picks!.reduce((a, b) => a + b, 0) || 1;
                              const right = k === q.answer, popular = q.popularWrong?.option === k;
                              return (
                                <div key={k} role="listitem" className={right ? 'right' : popular ? 'wrong' : undefined}>
                                  <span className="l">{LETTERS[k]}</span>
                                  <span className="o">{o}{right ? ' (answer)' : ''}</span>
                                  <span className="sd-bar" aria-hidden="true"><i style={{ width: `${Math.round((n / total) * 100)}%` }} /></span>
                                  <span className="mono n">{n}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {q.misconception && (
                          <div className="sd-mis">
                            <Lightbulb size={19} weight="duotone" style={{ flex: 'none' }} />
                            <div>
                              <b>{q.misconception.label}</b>{q.misconception.fromBank && <span className="sd-chip t" style={{ marginLeft: 6 }}>Seen before in this school</span>}
                              {q.misconception.thinking && <p>{q.misconception.thinking}</p>}
                              {q.misconception.reteach && <p><b style={{ display: 'inline' }}>Reteach: </b>{q.misconception.reteach}</p>}
                            </div>
                          </div>
                        )}
                        {q.flagText.map(f => <div key={f} className="sd-flagline"><WarningCircle size={15} weight="bold" /> {f}</div>)}
                        {q.discrimination !== null && <p className="sd-mut" style={{ fontSize: 12.5, marginTop: 6 }}>Separates stronger from weaker students: {q.discrimination >= 0.3 ? 'well' : q.discrimination >= 0.15 ? 'somewhat' : 'hardly'} ({q.discrimination.toFixed(2)}).</p>}
                        {q.missedNames.length > 0 && <p style={{ fontSize: 13, marginTop: 6 }}><b style={{ display: 'inline' }}>Missed it:</b> {q.missedNames.join(', ')}</p>}
                      </td></tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          )}
          {d.wordingNote && <div className="note info" style={{ margin: 12 }}>{d.wordingNote}</div>}
        </div>

        {d.topics.length > 0 && (
          <div className="sd-card sd-pad" style={{ marginTop: 14 }}>
            <div className="sd-hd"><div><h2>By topic</h2><p>Share of the marks on each topic, weakest first.</p></div></div>
            <table className="sd-tbl" aria-label="By topic">
              <thead><tr><th>TOPIC</th><th>CLASS</th><th>UNDER HALF</th></tr></thead>
              <tbody>{d.topics.map(t => (
                <tr key={t.topic}>
                  <td><b>{t.topic}</b></td>
                  <td><b className="mono">{pct(t.facility)}</b><div className="sd-bar" aria-hidden="true"><i style={{ width: `${Math.round(t.facility * 100)}%` }} /></div></td>
                  <td>{t.missed.length ? <><b className="mono">{t.missed.length}</b><small>{t.missedNames.slice(0, 6).join(', ')}{t.missedNames.length > 6 ? ` and ${t.missedNames.length - 6} more` : ''}</small></> : <span className="sd-mut">Nobody</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="sd-rail">
        {!notYet && (
          <div className="sd-card sd-pad">
            <h2 style={{ fontSize: 17, fontWeight: 800, display: 'flex', gap: 7, alignItems: 'center' }}><Lightbulb size={18} weight="duotone" /> Reteach</h2>
            {reteach.length ? (
              <ol className="sd-steps">{reteach.map(q => <li key={q.key}><b>Q{q.n}: {q.misconception!.label}.</b> {q.misconception!.reteach}</li>)}</ol>
            ) : <p className="sd-mut" style={{ fontSize: 13.5, marginTop: 6 }}>No wrong idea stood out. {d.questions.some(q => q.flags.includes('hard')) ? 'The questions marked "Check this" were hard for most of the class.' : 'The class did well on this.'}</p>}
          </div>
        )}
        {!notYet && (
          <div className="sd-card sd-pad">
            <h2 style={{ fontSize: 17, fontWeight: 800, display: 'flex', gap: 7, alignItems: 'center' }}><ArrowsClockwise size={18} weight="duotone" /> Retest</h2>
            {d.retest.students.length ? (
              <>
                <p className="sd-mut" style={{ fontSize: 13.5, marginTop: 4 }}>Only for those who missed {d.retest.topics.length === 1 ? d.retest.topics[0] : 'a weak topic'}: one version each, on their own gaps. Untick anyone you&apos;ve already helped.</p>
                <div className="sd-who" role="group" aria-label="Students for the retest">
                  {d.retest.students.map(s => (
                    <label key={s.id}><input type="checkbox" checked={!left.has(s.id)} onChange={e => setLeft(x => { const n = new Set(x); if (e.target.checked) n.delete(s.id); else n.add(s.id); return n; })} />
                      <span>{s.name}<small>{s.topics.join(', ')}</small></span></label>
                  ))}
                </div>
                <button className="btn sm pri" style={{ marginTop: 10 }} disabled={!retestStudents.length || !d.chapter}
                  onClick={() => onRetest({
                    setKind: 'catchup', audience: 'per_student', chapter: d.chapter ?? undefined, students: retestStudents.map(s => s.id),
                    topics: [...new Set(retestStudents.flatMap(s => s.topics))],
                    basis: `${retestStudents.length} student${retestStudents.length === 1 ? '' : 's'} missed ${d.retest.topics.join(', ')} in ${d.assignment.title}.`,
                  })}>Make their retest ({retestStudents.length})</button>
                {!d.chapter && <p className="sd-mut" style={{ fontSize: 12.5, marginTop: 6 }}>This work isn&apos;t linked to a chapter, so make the retest from the Studio home.</p>}
              </>
            ) : <p className="sd-mut" style={{ fontSize: 13.5, marginTop: 6 }}><CheckCircle size={14} weight="bold" /> {d.topics.length ? 'No topic fell below 60%, so no retest is needed.' : 'Topics are known for bank questions only, so there is no retest to propose here.'}</p>}
          </div>
        )}
        <RetentionCard r={d.retention} onChanged={m => { onToast(m); setTick(t => t + 1); }} />
      </div>
    </div>
  );
}

/** The retention check that follows this work: when it goes out, and the teacher's say over it. */
export function RetentionCard({ r, onChanged }: { r: Data['retention']; onChanged: (msg: string) => void }) {
  const api = useStudioApi();
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!r) return null;
  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setError(null);
    try { await api('/api/teacher/studio/followups', 'PATCH', { id: r.id, ...body }); onChanged(done); }
    catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="sd-card sd-pad">
      <h2 style={{ fontSize: 17, fontWeight: 800, display: 'flex', gap: 7, alignItems: 'center' }}><ClockCounterClockwise size={18} weight="duotone" /> Retention check</h2>
      <p className="sd-mut" style={{ fontSize: 13.5, marginTop: 4 }}>
        {r.status === 'scheduled' ? <>Goes out on its own on <b style={{ display: 'inline' }}>{fmt(r.due_on)}</b>: a few quick bank questions on the same topics, marked instantly, counted as retention in mastery.</>
          : r.status === 'assigned' ? 'Handed out. Results show with the class’s other work.'
            : r.status === 'skipped' ? 'Skipped.'
              : r.note || 'It couldn’t go out on its own.'}
      </p>
      {r.status !== 'assigned' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
          <input type="date" className="cmp-in" aria-label="New date" min={today} value={date} onChange={e => setDate(e.target.value)} style={{ width: 'auto', padding: '6px 8px' }} />
          <button className="btn sm" disabled={!date || busy} onClick={() => act({ action: 'move', date }, `Moved to ${fmt(date)}`)}>Move</button>
          <button className="btn sm" disabled={busy} onClick={() => act({ action: 'now' }, 'Retention check handed out')}>Hand out now</button>
          {r.status === 'scheduled' && <button className="btn sm" disabled={busy} onClick={() => act({ action: 'skip' }, 'Skipped')}>Skip</button>}
        </div>
      )}
      {error && <div className="note err" role="alert" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
