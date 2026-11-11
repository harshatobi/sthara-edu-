'use client';

import { useEffect, useMemo, useState } from 'react';
import { InfoIcon as Info } from '@phosphor-icons/react/dist/ssr/Info';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { TextAaIcon as TextAa } from '@phosphor-icons/react/dist/ssr/TextAa';
import { AiTag } from '@/components/canon/ui';
import type { TStudent } from '@/lib/teacher/desk';
import { MARK_COLUMNS, defaultBlueprint, itemCount, markTotal, minutesFor, slotsOf, isNumericSubject, type Blueprint, type MarkValue } from '@/lib/studio/blueprint';
import { assembleClass } from '@/lib/studio/pick';
import { ACCESS_LABEL, COMPETENCIES, COMPETENCY_LABEL, SET_KIND_LABEL, type AccessNeed, type Audience, type SetKind, type StudioItem } from '@/lib/studio/types';
import { languageOf } from '@/lib/studio/languages';
import { designsFor } from '@/lib/papers/designs';
import { useStudioApi, type HomeData, type Material, type SetupPreset } from './api';

const KINDS: SetKind[] = ['worksheet', 'quiz', 'catchup', 'exit_ticket', 'test'];
const STEPS = ['Picking questions from the bank', 'Writing the ones the bank doesn’t have', 'Solving each new question separately to check the answer', 'Checking the syllabus and your class’s past work'];

/** Set up a question set: kind, chapter and topics, who it's for, the blueprint, then build it (one request). */
export default function SetupView({ cls, subject, home, students, language, preset, onBuilt, onCancel, onBoardPaper }: {
  cls: string; subject: string; home: HomeData | null; students: TStudent[]; language: string; preset: SetupPreset | null;
  /** A full CBSE board-pattern paper is its own generator (fixed design, marking scheme): open it. */
  onBoardPaper?: () => void;
  onBuilt: (m: Material, summary: { fromBank: number; written: number; flagged: number; unfilled: number }) => void; onCancel: () => void;
}) {
  const api = useStudioApi();
  const chapters = home?.chapters ?? [];
  const startKind = (KINDS as string[]).includes(preset?.setKind ?? '') ? preset!.setKind as SetKind : 'worksheet';
  const [kind, setKind] = useState<SetKind>(startKind);
  const [chapter, setChapter] = useState(preset?.chapter && chapters.some(c => c.name === preset.chapter) ? preset.chapter : home?.tiles.lowest?.chapter ?? chapters[0]?.name ?? '');
  const ch = chapters.find(c => c.name === chapter);
  const [topics, setTopics] = useState<string[]>([]);
  const [audience, setAudience] = useState<Audience>((['class', 'per_student', 'abc'] as string[]).includes(preset?.audience ?? '') ? preset!.audience as Audience : startKind === 'test' ? 'abc' : 'class');
  const [picked, setPicked] = useState<string[]>(preset?.students?.length ? preset.students : (home?.tiles.needSupport ?? []).map(s => s.id));
  const [bp, setBp] = useState<Blueprint>(defaultBlueprint(startKind));
  const [handout, setHandout] = useState<'online' | 'paper' | 'both'>('online');
  const [title, setTitle] = useState('');
  const [bankFor, setBankFor] = useState<{ chapter: string; items: StudioItem[] } | null>(null);
  const [needs, setNeeds] = useState<Map<string, AccessNeed[]>>(new Map());
  const [building, setBuilding] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // What the bank already holds for this chapter, so the teacher sees how much will be new before anything is spent.
  useEffect(() => {
    if (!chapter) return;
    let live = true;
    api<{ items: StudioItem[] }>(`/api/teacher/bank?${new URLSearchParams({ class: cls, subject, chapter })}`)
      .then(r => { if (live) setBankFor({ chapter, items: r.items }); }).catch(() => { if (live) setBankFor({ chapter, items: [] }); });
    return () => { live = false; };
  }, [api, cls, subject, chapter]);
  const bank = bankFor?.chapter === chapter ? bankFor.items : null;
  const pickKind = (k: SetKind) => { setKind(k); setBp(defaultBlueprint(k)); if (k === 'quiz') setHandout('online'); };
  const pickChapter = (c: string) => { setChapter(c); setTopics([]); };
  useEffect(() => {
    let live = true;
    api<{ students: { id: string; needs: AccessNeed[] }[] }>(`/api/teacher/access-needs?${new URLSearchParams({ class: cls })}`)
      .then(r => { if (live) setNeeds(new Map(r.students.filter(s => s.needs.length).map(s => [s.id, s.needs]))); }).catch(() => {});
    return () => { live = false; };
  }, [api, cls]);

  const n = itemCount(bp), marks = markTotal(bp);
  const fromBank = useMemo(() => {
    if (!bank) return null;
    const slots = slotsOf(bp, { numeric: isNumericSubject(subject), quiz: kind === 'quiz' });
    const per = audience === 'abc' ? 3 : 1;
    const filled = assembleClass(slots, bank, { topics }).picked.filter(Boolean).length;
    return Math.min(n * per, filled * per);
  }, [bank, bp, subject, kind, audience, topics, n]);
  const versions = audience === 'per_student' ? picked.length : audience === 'abc' ? 3 : 1;
  const forWhom = audience === 'per_student' ? picked : audience === 'abc' || audience === 'class' ? students.map(s => s.id) : [];
  const access = useMemo(() => {
    const out = new Map<AccessNeed, number>();
    for (const id of forWhom) for (const x of needs.get(id) ?? []) out.set(x, (out.get(x) ?? 0) + 1);
    return [...out];
  }, [forWhom, needs]);

  const bump = (c: typeof COMPETENCIES[number], m: MarkValue, d: number) => setBp(p => {
    const next = { cells: { ...p.cells, [c]: { ...p.cells[c], [m]: Math.max(0, Math.min(10, p.cells[c][m] + d)) } } };
    return itemCount(next) <= 30 ? next : p;
  });

  async function build() {
    if (!ch) { setError('Pick a chapter.'); return; }
    if (!n) { setError('Add at least one question to the blueprint.'); return; }
    if (audience === 'per_student' && !picked.length) { setError('Choose the students to make versions for.'); return; }
    setError(null); setBuilding(0);
    const tick = setInterval(() => setBuilding(s => (s === null ? null : Math.min(STEPS.length - 1, s + 1))), 7000);
    try {
      const r = await api<{ material: Material; summary: any }>('/api/teacher/studio/build', 'POST', {
        class: cls, subject, chapter, topics, setKind: kind, blueprint: bp, audience, students: picked, language, handout, title: title.trim() || undefined, basis: preset?.basis,
      });
      onBuilt(r.material, r.summary);
    } catch (e: any) { setError(e?.message || 'The set couldn’t be built.'); }
    finally { clearInterval(tick); setBuilding(null); }
  }

  if (building !== null) {
    return (
      <div className="sd-card" aria-live="polite" aria-busy="true">
        <div className="sd-building"><span className="typing"><i /><i /><i /></span><div><h2 style={{ fontSize: 17, fontWeight: 800 }}>Building {versions > 1 ? `${versions} versions` : 'your set'}</h2><p className="sd-mut" style={{ fontSize: 14, marginTop: 4 }}>{STEPS[building]}…</p></div></div>
      </div>
    );
  }

  return (
    <div className="sd-card">
      <div className="sd-dh"><div><h2>{title.trim() || `${SET_KIND_LABEL[kind]}${chapter ? `: ${topics.length === 1 ? topics[0] : chapter}` : ''}`}</h2><p>Question set for {cls} {subject}</p></div>
        <button className="btn sm" onClick={onCancel}><X size={13} weight="bold" /> Close</button></div>
      <div className="sd-setup">
        <div>
          {preset?.basis && <div className="sd-why"><Info size={19} weight="duotone" style={{ color: 'var(--role-deep)', flex: 'none' }} /><div>{preset.basis} Change anything.</div></div>}
          <div className="sd-fld"><span className="lb" id="sd-kind">Kind</span>
            <div className="sd-seg" role="group" aria-labelledby="sd-kind">{KINDS.map(k => <button key={k} aria-pressed={kind === k} onClick={() => pickKind(k)}>{SET_KIND_LABEL[k]}</button>)}</div></div>
          {kind === 'test' && onBoardPaper && designsFor(cls, subject).length > 0 && (
            <div className="sd-why" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div>Need the whole syllabus instead? A board exam paper follows the CBSE 2026-27 design, with its marking scheme.</div>
              <button className="btn sm" onClick={onBoardPaper}>Board exam paper</button>
            </div>
          )}
          <div className="sd-fld"><label htmlFor="sd-ch">Chapter</label>
            <select id="sd-ch" className="cmp-sel" value={chapter} onChange={e => pickChapter(e.target.value)}>
              {chapters.map(c => <option key={c.name} value={c.name}>{c.seq}. {c.name}{home?.tiles.lowest?.chapter === c.name ? ` (weakest, ${home.tiles.lowest.score}%)` : ''}</option>)}
            </select></div>
          {ch && <div className="sd-fld"><span className="lb">Topics <span className="sd-mut" style={{ fontWeight: 600 }}>(none picked = the whole chapter)</span></span>
            <div className="sd-topics">{ch.topics.map(t => <button key={t} aria-pressed={topics.includes(t)} onClick={() => setTopics(x => (x.includes(t) ? x.filter(y => y !== t) : [...x, t]))}>{t}</button>)}</div></div>}
          <div className="sd-fld"><span className="lb">Who it&apos;s for</span>
            <div role="radiogroup" aria-label="Who it's for">
              <button className="sd-opt" role="radio" aria-checked={audience === 'class'} onClick={() => setAudience('class')}><span className="rb" /><div><b>Whole class, one set</b><p>All {students.length} get the same questions.</p></div></button>
              <button className="sd-opt" role="radio" aria-checked={audience === 'per_student'} onClick={() => setAudience('per_student')}><span className="rb" /><div><b>One version for each student{picked.length ? ` (${picked.length})` : ''}</b><p>Same marks and difficulty; each version leans on that student&apos;s own weak topics.</p></div></button>
              <button className="sd-opt" role="radio" aria-checked={audience === 'abc'} onClick={() => setAudience('abc')}><span className="rb" /><div><b>A, B and C sets</b><p>Three equal versions, handed out round the register so neighbours can&apos;t copy.</p></div></button>
            </div>
            {audience === 'per_student' && (
              <div className="sd-pick" role="group" aria-label="Students">
                {students.map(s => (
                  <label key={s.id}><input type="checkbox" checked={picked.includes(s.id)} onChange={e => setPicked(p => (e.target.checked ? [...p, s.id] : p.filter(x => x !== s.id)))} />{s.name}</label>
                ))}
              </div>
            )}</div>
          <div className="sd-fld"><span className="lb" id="sd-hand">Hand out as</span>
            <div className="sd-seg" role="group" aria-labelledby="sd-hand">
              {(['online', 'paper', 'both'] as const).map(h => <button key={h} aria-pressed={handout === h} disabled={kind === 'quiz' && h !== 'online'} onClick={() => setHandout(h)}>{h === 'online' ? 'On Sthara' : h === 'paper' ? 'On paper' : 'Both'}</button>)}
            </div></div>
          <div className="sd-fld" style={{ margin: 0 }}><label htmlFor="sd-title">Title <span className="sd-mut" style={{ fontWeight: 600 }}>(optional)</span></label>
            <input id="sd-title" className="cmp-in" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder="We’ll name it from the chapter" /></div>
        </div>

        <div>
          <div className="sd-fld"><span className="lb">Blueprint</span>
            <table className="sd-bp" aria-label="Questions by CBSE competency and marks">
              <thead><tr><th /><th>1 mark</th><th>2 marks</th><th>3 marks</th><th>5 marks</th></tr></thead>
              <tbody>{COMPETENCIES.map(c => (
                <tr key={c}><td>{COMPETENCY_LABEL[c]}</td>
                  {MARK_COLUMNS.map(m => {
                    const v = bp.cells[c][m];
                    const quizLocked = kind === 'quiz' && m !== 1;
                    return (
                      <td key={m}><div className={`sd-cell${v ? ' f' : ''}`}>
                        <button aria-label={`One fewer ${m}-mark ${COMPETENCY_LABEL[c]} question`} disabled={!v} onClick={() => bump(c, m, -1)}>−</button>
                        <span aria-live="polite">{v}</span>
                        <button aria-label={`One more ${m}-mark ${COMPETENCY_LABEL[c]} question`} disabled={quizLocked} onClick={() => bump(c, m, 1)}>+</button>
                      </div></td>
                    );
                  })}
                </tr>
              ))}</tbody>
            </table>
            <p className="sd-mut" style={{ fontSize: 13, marginTop: 4 }}>{n} question{n === 1 ? '' : 's'}, {marks} marks, about {minutesFor(bp)} minutes.{kind === 'quiz' ? ' Quizzes are 1-mark choice questions, marked the moment they hand in.' : ''}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '10px 0 14px' }}>
            <div className="sd-card" style={{ boxShadow: 'none', border: '1px solid var(--sd-line)', padding: '10px 12px', fontSize: 13 }}>
              <b className="mono" style={{ fontSize: 22, color: 'var(--role-deep)', display: 'block' }}>{fromBank === null ? '…' : fromBank}</b>from the question bank, tried and checked
            </div>
            <div className="sd-card" style={{ boxShadow: 'none', border: '1px solid var(--sd-line)', padding: '10px 12px', fontSize: 13 }}>
              <b className="mono" style={{ fontSize: 22, color: 'var(--ai-ink)', display: 'block' }}>{fromBank === null ? '…' : Math.max(0, n * (audience === 'abc' ? 3 : 1) - fromBank)}</b>new, written by AI and checked before you see them{audience === 'per_student' ? ' (students with the same weak topic share one)' : ''}
            </div>
          </div>
          <div className="sd-fld" style={{ margin: 0 }}><span className="lb">Made accessible automatically</span>
            {access.length ? access.map(([need, count]) => (
              <p key={need} style={{ fontSize: 13.5, display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}><TextAa size={17} weight="duotone" color="var(--role-deep)" /><span><b>{ACCESS_LABEL[need]}</b> for {count} student{count === 1 ? '' : 's'} with this need on record</span></p>
            )) : <p className="sd-mut" style={{ fontSize: 13.5 }}>No access needs on record for these students. The class teacher can add them under Access needs.</p>}
            {language !== 'en' && <p style={{ fontSize: 13.5, marginTop: 6 }}>Made in <b>{languageOf(language).name}</b> ({languageOf(language).native}), after the checks run in English.</p>}
          </div>
        </div>
      </div>
      <div className="sd-foot">
        <span>{error ? <span className="err" role="alert">{error}</span> : 'Nothing goes to students until you choose. New questions count toward the school’s AI allowance.'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn ai" onClick={build} disabled={!ch || !n}><Sparkle size={15} weight="fill" /> {audience === 'per_student' ? `Build ${picked.length} version${picked.length === 1 ? '' : 's'}` : audience === 'abc' ? 'Build 3 sets' : 'Build the set'} <AiTag /></button>
        </div>
      </div>
    </div>
  );
}
