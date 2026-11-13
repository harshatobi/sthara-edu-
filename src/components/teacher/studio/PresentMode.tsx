'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { EyeIcon as Eye } from '@phosphor-icons/react/dist/ssr/Eye';
import { TimerIcon as Timer } from '@phosphor-icons/react/dist/ssr/Timer';
import { HandPalmIcon as HandPalm } from '@phosphor-icons/react/dist/ssr/HandPalm';
import { isChoice, type StudioItem } from '@/lib/studio/types';
import { LETTERS } from '@/lib/studio/handout';
import { isRtl } from '@/lib/studio/languages';
import BankFigures from '@/components/studio/BankFigures';

/**
 * The set on the projector, one question at a time: big text, a timer, and the answer revealed when the teacher
 * chooses. Keyboard: arrows move, space reveals, Escape closes. For a choice question the teacher can count hands
 * per option (H): the count is class-level evidence for the question, never a mark against any student.
 */
export default function PresentMode({ title, items, language, onClose, onCount }: {
  title: string; items: StudioItem[]; language: string; onClose: () => void;
  /** Saves a hands count for one question; resolves to a line for the teacher, or throws with the reason. */
  onCount?: (itemId: string, counts: number[]) => Promise<string>;
}) {
  const [i, setI] = useState(0);
  const [counting, setCounting] = useState(false);
  const [counts, setCounts] = useState<number[]>([]);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [countError, setCountError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [secs, setSecs] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const it = items[i];
  /** Moving to another question hides the answer and stops the timer. */
  const goTo = (n: number) => { setI(Math.max(0, Math.min(items.length - 1, n))); setShown(false); setSecs(null); setCounting(false); setCounts([]); setCountError(null); };
  const canCount = !!onCount && !!it && isChoice(it.qtype) && !!it.options?.length;
  async function saveCount() {
    if (!onCount || !it) return;
    setCountError(null);
    try { const line = await onCount(it.id, it.options!.map((_, k) => counts[k] ?? 0)); setSaved(x => ({ ...x, [it.id]: line })); setCounting(false); setShown(true); }
    catch (e: any) { setCountError(e?.message || 'The count couldn’t be saved.'); }
  }

  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => {
    if (secs === null || secs <= 0) return;
    const t = setTimeout(() => setSecs(s => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [secs]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      // Typing a count: the keys belong to the box.
      if ((e.target as HTMLElement)?.tagName === 'INPUT') { if (e.key === 'Escape') setCounting(false); return; }
      if (e.key === 'h' || e.key === 'H') { if (canCount) setCounting(c => !c); return; }
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goTo(i + 1);
      else if (e.key === 'ArrowLeft') goTo(i - 1);
      else if (e.key === ' ') { e.preventDefault(); setShown(s => !s); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  if (!it) return null;
  return createPortal(
    <div className="sd-present" role="dialog" aria-modal="true" aria-label={`Presenting ${title}`} tabIndex={-1} ref={box} dir={isRtl(language) ? 'rtl' : undefined} lang={language}>
      <div className="bar">
        <span style={{ fontWeight: 700, fontSize: 16 }}>{title}: question {i + 1} of {items.length}</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {secs !== null && <span className="timer" aria-live="polite">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>}
          <button onClick={() => setSecs(it.marks * 60)}><Timer size={18} weight="bold" /> {it.marks} min</button>
          <button onClick={onClose}><X size={18} weight="bold" /> Close</button>
        </span>
      </div>
      <div className="q">
        <h2>{it.text}</h2>
        {it.figure?.alt && <p className="ans">Figure: {it.figure.alt}</p>}
        <BankFigures figs={it.figures} scale={1.4} />
        {isChoice(it.qtype) && it.options && (
          <ol>{it.options.map((o, k) => (
            <li key={k} className={shown && k === it.answer ? 'right' : ''}><b>{LETTERS[k]}</b><span style={{ flex: 1 }}>{o}</span>
              {counting && <input type="number" min={0} max={500} inputMode="numeric" aria-label={`Hands for ${LETTERS[k]}`} className="hands" value={counts[k] ?? ''}
                autoFocus={k === 0} onChange={e => setCounts(c => { const n = [...c]; n[k] = Math.max(0, Math.min(500, Number(e.target.value) || 0)); return n; })}
                onKeyDown={e => { if (e.key === 'Enter') saveCount(); }} />}
            </li>
          ))}</ol>
        )}
        {shown && !isChoice(it.qtype) && <p className="ans">{it.qtype === 'numerical' && it.value !== null && it.value !== undefined ? `Answer: ${it.value}${it.unit ? ` ${it.unit}` : ''}. ` : ''}{it.scheme}</p>}
        {shown && isChoice(it.qtype) && it.scheme && <p className="ans">{it.scheme}</p>}
        {saved[it.id] && <p className="ans" aria-live="polite">{saved[it.id]}</p>}
        {countError && <p className="ans" role="alert" style={{ color: '#FCA5A5' }}>{countError}</p>}
      </div>
      <div className="bar">
        <button onClick={() => goTo(i - 1)} disabled={i === 0}><ArrowLeft size={18} weight="bold" /> Back</button>
        <span style={{ display: 'flex', gap: 8 }}>
          {canCount && (counting
            ? <><button onClick={saveCount}><HandPalm size={18} weight="bold" /> Save the count</button><button onClick={() => setCounting(false)}>Cancel</button></>
            : <button onClick={() => setCounting(true)} aria-keyshortcuts="h"><HandPalm size={18} weight="bold" /> Count hands</button>)}
          <button onClick={() => setShown(s => !s)}><Eye size={18} weight="bold" /> {shown ? 'Hide the answer' : 'Show the answer'}</button>
        </span>
        <button onClick={() => goTo(i + 1)} disabled={i === items.length - 1}>Next <ArrowRight size={18} weight="bold" /></button>
      </div>
    </div>,
    document.body,
  );
}
