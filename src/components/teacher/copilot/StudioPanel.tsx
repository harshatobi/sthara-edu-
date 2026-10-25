'use client';

import { useEffect, useRef, useState } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { ClipboardTextIcon as ClipboardText } from '@phosphor-icons/react/dist/ssr/ClipboardText';
import { LifebuoyIcon as Lifebuoy } from '@phosphor-icons/react/dist/ssr/Lifebuoy';
import { TicketIcon as Ticket } from '@phosphor-icons/react/dist/ssr/Ticket';
import { NotebookIcon as Notebook } from '@phosphor-icons/react/dist/ssr/Notebook';
import { LightbulbIcon as Lightbulb } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { ChatsCircleIcon as ChatsCircle } from '@phosphor-icons/react/dist/ssr/ChatsCircle';
import { TableIcon as Table } from '@phosphor-icons/react/dist/ssr/Table';
import { CheckSquareOffsetIcon as CheckSquareOffset } from '@phosphor-icons/react/dist/ssr/CheckSquareOffset';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { FlaskIcon as Flask } from '@phosphor-icons/react/dist/ssr/Flask';
import { CrosshairIcon as Crosshair } from '@phosphor-icons/react/dist/ssr/Crosshair';
import { StackIcon as Stack } from '@phosphor-icons/react/dist/ssr/Stack';
import { ShapesIcon as Shapes } from '@phosphor-icons/react/dist/ssr/Shapes';
import { ImageIcon as ImageGlyph } from '@phosphor-icons/react/dist/ssr/Image';
import { ExamIcon as Exam } from '@phosphor-icons/react/dist/ssr/Exam';
import { designsFor } from '@/lib/papers/designs';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import InteractiveIcon from '@/components/ui/InteractiveIcon';
import type { CourseChapter } from '@/lib/curriculum';
import { STUDIO, STUDIO_GROUPS, studioFor, type StudioKind } from '@/lib/teacher/copilot';
import { SAMPLES, sampleContext } from '@/lib/teacher/copilotSamples';
import type { TStudent } from '@/lib/teacher/desk';
import ArtifactView from './ArtifactView';
import { AiTag } from '@/components/canon/ui';

export const STUDIO_LOOK: Record<StudioKind, { icon: PhosphorIcon; color: string }> = {
  worksheet: { icon: FileText, color: '#3B82F6' },
  quiz: { icon: ClipboardText, color: '#14B8A6' },
  remedial: { icon: Lifebuoy, color: '#F97316' },
  exit_tickets: { icon: Ticket, color: '#A855F7' },
  lesson: { icon: Notebook, color: '#6366F1' },
  explain: { icon: Lightbulb, color: '#EAB308' },
  discussion: { icon: ChatsCircle, color: '#0EA5E9' },
  rubric: { icon: Table, color: '#10B981' },
  answer_key: { icon: CheckSquareOffset, color: '#22C55E' },
  parent_note: { icon: EnvelopeSimple, color: '#F43F5E' },
  lab_demo: { icon: Flask, color: '#7C5CFC' },
  misconceptions: { icon: Crosshair, color: '#E11D48' },
  bundle: { icon: Stack, color: '#0F766E' },
  diagram: { icon: Shapes, color: '#2563EB' },
  illustration: { icon: ImageGlyph, color: '#DB2777' },
  board_paper: { icon: Exam, color: '#B45309' },
};

export interface StudioRequest {
  kind: StudioKind; chapter: string; count: number; difficulty: string; duration: number;
  targets: string[]; note: string;
  /** Board paper: which design (Class 10 Maths has Standard and Basic). */
  design?: string;
}

type Who = 'all' | 'below' | 'pick';

function Seg<T extends string | number>({ label, value, options, onChange, format }: {
  label: string; value: T; options: T[]; onChange: (v: T) => void; format?: (v: T) => string;
}) {
  return (
    <div className="cmp-fld">
      <label>{label}</label>
      <div className="seg" role="group" aria-label={label}>
        {options.map(o => <button key={String(o)} type="button" className={o === value ? 'on' : ''} aria-pressed={o === value} onClick={() => onChange(o)}>{format ? format(o) : String(o)}</button>)}
      </div>
    </div>
  );
}

/** The tile row (always visible). Picking a tile opens the panel below it. */
export function StudioTiles({ selected, onSelect, compact, subject, cls }: { selected: StudioKind | null; onSelect: (k: StudioKind | null) => void; compact: boolean; subject: string; cls: string }) {
  const types = studioFor(subject, cls);
  return (
    <div className={`st-tiles${compact ? ' compact' : ''}`}>
      {STUDIO_GROUPS.map(g => (
        <div key={g.key} className="st-group">
          <div className="st-glabel">{g.label}</div>
          <div className="st-row">
            {types.filter(t => t.group === g.key).map(t => {
              const look = STUDIO_LOOK[t.kind];
              const on = selected === t.kind;
              return (
                <button key={t.kind} className={`st-tile${on ? ' on' : ''}`} aria-pressed={on} title={t.blurb} onClick={() => onSelect(on ? null : t.kind)}>
                  <InteractiveIcon icon={look.icon} color={look.color} active={on} size={18} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export interface StudioPreset { chapter?: string; who?: 'all' | 'below'; student?: string; note?: string }

/**
 * The open Studio panel: a few plain settings on the left; on the right, a
 * finished example of what this produces (free, no request spent) and the
 * exact spec of what will be generated.
 */
export default function StudioPanel({ kind, cls, subject, chapters, students, belowForty, sending, preset, onGenerate, onClose }: {
  kind: StudioKind; cls: string; subject: string; chapters: CourseChapter[]; students: TStudent[]; belowForty: TStudent[];
  sending: boolean; preset?: StudioPreset | null; onGenerate: (r: StudioRequest) => void; onClose: () => void;
}) {
  const t = STUDIO.find(x => x.kind === kind)!;
  const firstOpen = chapters[0]?.name ?? '';
  const [chapter, setChapter] = useState(preset?.chapter ?? (t.needsChapter ? firstOpen : ''));
  const [count, setCount] = useState(kind === 'quiz' ? 5 : kind === 'discussion' ? 4 : 8);
  const [difficulty, setDifficulty] = useState('Mixed');
  const [duration, setDuration] = useState(40);
  const designs = kind === 'board_paper' ? designsFor(cls, subject) : [];
  const [design, setDesign] = useState(designs[0]?.key ?? '');
  const [who, setWho] = useState<Who>(preset?.who ?? (kind === 'remedial' && belowForty.length ? 'below' : 'all'));
  const [picked, setPicked] = useState<string[]>([]);
  const [one, setOne] = useState(preset?.student ?? '');
  const [note, setNote] = useState(preset?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Opening a tile brings its panel into view.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    // Bring the panel up, keeping a strip of the tiles above it in view.
    const top = el.getBoundingClientRect().top + window.scrollY - 140;
    if (top > window.scrollY) window.scrollTo({ top, behavior: 'smooth' });
  }, []);

  const targets = t.who === 'one' ? (one ? [one] : []) : who === 'below' ? belowForty.map(s => s.id) : who === 'pick' ? picked : [];
  const forText = t.who === 'one'
    ? (students.find(s => s.id === one)?.name ?? 'one student')
    : who === 'all' ? `the whole of ${cls}` : `${targets.length} student${targets.length === 1 ? '' : 's'}${who === 'below' ? ' below 40%' : ''}`;
  const oneName = students.find(s => s.id === one)?.name;
  const spec = kind === 'parent_note'
    ? (oneName ? `A note to ${oneName}'s parents` : 'A note to one family: choose the student on the left')
    : [
      t.items && `${count} ${kind === 'discussion' ? 'prompts' : kind === 'quiz' ? 'MCQs' : 'questions'}`,
      kind === 'exit_tickets' && '3 MCQs',
      t.level && difficulty.toLowerCase() + (difficulty === 'Mixed' ? ' difficulty' : ''),
      t.minutes && `${duration}-minute lesson`,
      chapter ? `on ${chapter}` : t.needsChapter ? 'no chapter picked' : `${t.label} for ${subject}`,
      t.who && `for ${forText}`,
    ].filter(Boolean).join(' · ');

  function generate() {
    if (t.needsChapter && !chapter) { setError('Pick a chapter.'); return; }
    if (t.who === 'one' && !one) { setError('Pick the student this note is about.'); return; }
    if (t.who === 'many' && who === 'pick' && !picked.length) { setError('Tick at least one student, or choose the whole class.'); return; }
    setError(null);
    onGenerate({ kind, chapter: kind === 'board_paper' ? '' : chapter, count: kind === 'exit_tickets' ? 3 : count, difficulty, duration, targets, note: note.trim(), ...(kind === 'board_paper' ? { design: design || designs[0]?.key } : {}) });
  }

  return (
    <div className="st-panel" ref={panel}>
      <div className="st-panel-hd">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <InteractiveIcon icon={STUDIO_LOOK[kind].icon} color={STUDIO_LOOK[kind].color} active size={20} />
          <div><h3 style={{ fontSize: 18, fontWeight: 800 }}>{t.label}</h3><div className="muted" style={{ fontSize: 12.5 }}>{t.blurb}</div></div>
        </div>
        <button className="btn sm" onClick={onClose} aria-label="Close studio"><X size={13} weight="bold" /></button>
      </div>

      <div className="st-body">
        <div className="st-settings">
          <div className="st-step">1 · Set it up</div>
          {kind === 'board_paper' && designs.length > 1 && (
            <Seg label="PAPER" value={design} options={designs.map(d => d.key)} onChange={setDesign} format={k => designs.find(d => d.key === k)?.variant ?? k} />
          )}
          {kind === 'board_paper' && designs[0] && (
            <p className="muted" style={{ fontSize: 12.5 }}>
              {designs[0].maxMarks} marks, {designs[0].sections.reduce((n, sec) => n + sec.slots.length, 0)} questions, laid out exactly as CBSE&apos;s 2026-27 sample paper, chapters weighted as the syllabus weights them. It takes a minute or two: each section is written and then checked against the board design.
            </p>
          )}
          {(t.needsChapter || chapters.length > 0) && kind !== 'answer_key' && kind !== 'parent_note' && kind !== 'rubric' && kind !== 'board_paper' && (
            <div className="cmp-fld"><label htmlFor="st-ch">CHAPTER</label>
              <select id="st-ch" className="cmp-sel" value={chapter} onChange={e => setChapter(e.target.value)}>
                {!t.needsChapter && <option value="">Any / not chapter-specific</option>}
                {chapters.map(c => <option key={c.name} value={c.name}>{c.seq}. {c.name}</option>)}
              </select></div>
          )}
          {t.items && kind !== 'exit_tickets' && <Seg label={kind === 'discussion' ? 'PROMPTS' : 'QUESTIONS'} value={count} options={kind === 'discussion' ? [3, 4, 6] : [3, 5, 8, 10, 15]} onChange={setCount} />}
          {t.level && <Seg label="DIFFICULTY" value={difficulty} options={['Mixed', 'Easy', 'Medium', 'Hard']} onChange={setDifficulty} />}
          {t.minutes && <Seg label="LESSON LENGTH" value={duration} options={[30, 35, 40, 45, 60]} onChange={setDuration} format={v => `${v} min`} />}
          {t.who === 'many' && (
            <>
              <Seg label="WHO IS IT FOR" value={who} options={['all', 'below', 'pick'] as Who[]} onChange={setWho}
                format={v => (v === 'all' ? `Whole class (${students.length})` : v === 'below' ? `Below 40% (${belowForty.length})` : 'Choose students')} />
              {who === 'below' && !belowForty.length && <div className="muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 12 }}>No one in {cls} is below 40% in {subject} yet.</div>}
              {who === 'pick' && (
                <div className="st-pick">
                  {students.map(s => (
                    <label key={s.id} className="tp-pick">
                      <input type="checkbox" checked={picked.includes(s.id)} onChange={e => setPicked(p => (e.target.checked ? [...p, s.id] : p.filter(x => x !== s.id)))} />
                      <span>{s.name}</span>
                    </label>
                  ))}
                  {!students.length && <span className="muted" style={{ fontSize: 12 }}>No students in {cls} yet.</span>}
                </div>
              )}
            </>
          )}
          {t.who === 'one' && (
            <div className="cmp-fld"><label htmlFor="st-one">ABOUT WHICH STUDENT</label>
              <select id="st-one" className="cmp-sel" value={one} onChange={e => setOne(e.target.value)}>
                <option value="">— Choose a student —</option>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
          )}
          <div className="cmp-fld"><label htmlFor="st-note">{kind === 'answer_key' ? 'PASTE THE QUESTION PAPER' : 'ANYTHING ELSE? (optional)'}</label>
            <textarea id="st-note" className="cmp-in" rows={kind === 'answer_key' ? 6 : 3} maxLength={3000} value={note} onChange={e => setNote(e.target.value)}
              placeholder={kind === 'answer_key' ? 'Paste the questions you want a marking scheme for' : kind === 'parent_note' ? 'e.g. mention the science fair; keep it encouraging' : 'e.g. include one diagram question; avoid long calculations'} /></div>
        </div>

        <div className="st-preview">
          <div className="st-step">2 · What you&apos;ll get</div>
          <div className="st-spec"><b>{spec}</b><span>About {t.seconds} seconds · one AI request · nothing is posted until you choose to</span></div>
          <div className="st-sample">
            <ArtifactView artifact={SAMPLES[kind]} cls={cls} subject={subject}
              sample={`Example from ${sampleContext(kind)}. Yours is ${kind === 'lab_demo' ? 'set up' : 'written'} for ${chapter || subject} in ${cls}, using your class's own results.`} />
          </div>
        </div>
      </div>

      <div className="st-ft">
        {error && <span className="err" role="alert" style={{ padding: '8px 12px' }}>{error}</span>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn ai" disabled={sending || (kind === 'answer_key' && !note.trim())} onClick={generate}>
          <Sparkle size={15} weight="fill" /> {sending ? 'Creating…' : `Create ${t.label.toLowerCase()}`} <AiTag />
        </button>
      </div>
    </div>
  );
}
