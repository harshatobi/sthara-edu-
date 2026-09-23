'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { PaperPlaneRightIcon as PaperPlaneRight } from '@phosphor-icons/react/dist/ssr/PaperPlaneRight';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { MagnifyingGlassIcon as MagnifyingGlass } from '@phosphor-icons/react/dist/ssr/MagnifyingGlass';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { ArrowClockwiseIcon as ArrowClockwise } from '@phosphor-icons/react/dist/ssr/ArrowClockwise';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useAuth } from '@/contexts/AuthContext';
import { courseChapters, getCurriculum } from '@/lib/curriculum';
import { STUDIO, threadTitle, type AskItem, type ChatTurn, type CopilotReply, type StudioKind } from '@/lib/teacher/copilot';
import { buildInsights, type Insight, type InsightAction } from '@/lib/teacher/insights';
import { studentTml } from '@/lib/teacher/desk';
import { normClass } from '@/lib/teacher/scope';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import ScopePicker, { useScopeSelection } from '../ScopePicker';
import ArtifactView from './ArtifactView';
import StudioPanel, { StudioTiles, type StudioPreset, type StudioRequest } from './StudioPanel';

interface Thread { id: string; title: string; cls: string; subject: string; turns: ChatTurn[]; updated: number }
interface SendOpts { studio?: StudioRequest | null; cls?: string; subject?: string; fresh?: boolean }

const STORE = 'sthara.copilot.v1';
const MAX_THREADS = 20;
const STARTERS = [
  'Who needs my help most this week, and why?',
  'What should I teach next, given where the class is?',
  'Why might quiz scores be lower than homework?',
  'Plan tomorrow’s lesson with me',
];

function loadThreads(uid: string): Thread[] {
  if (typeof window === 'undefined') return [];
  try { const raw = localStorage.getItem(`${STORE}.${uid}`); return raw ? (JSON.parse(raw) as Thread[]) : []; } catch { return []; }
}
function saveThreads(uid: string, threads: Thread[]) {
  try { localStorage.setItem(`${STORE}.${uid}`, JSON.stringify(threads.slice(0, MAX_THREADS))); } catch { /* storage full or blocked: threads just won't persist */ }
}
/** Event-time clock (module-level so it's clearly outside render). */
const now = () => Date.now();
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(now()));

/** What the model needs to remember of a past turn (the latest artifact in full, so "make it easier" works). */
function turnText(t: ChatTurn, includeArtifact: boolean): string {
  if (t.role === 'teacher') return t.text;
  const r = t.reply;
  if (!r) return t.text;
  const parts = [r.say];
  if (r.ask.length) parts.push(`[Asked: ${r.ask.map(a => a.question).join(' / ')}]`);
  if (r.artifact) parts.push(includeArtifact ? `[Artifact JSON: ${JSON.stringify(r.artifact).slice(0, 7000)}]` : `[Produced ${r.artifact.kind}: ${r.artifact.title}]`);
  return parts.filter(Boolean).join('\n');
}

/** A Studio request written the way a teacher would say it (no student names: those travel as ids). */
function studioText(r: StudioRequest, cls: string): string {
  const t = STUDIO.find(x => x.kind === r.kind)!;
  const bits = [
    r.chapter && `on ${r.chapter}`,
    t.items && `${r.count} ${r.kind === 'discussion' ? 'prompts' : 'questions'}`,
    t.level && r.difficulty !== 'Mixed' && `${r.difficulty.toLowerCase()} difficulty`,
    t.minutes && `${r.duration} minutes`,
    t.who === 'many' && (r.targets.length ? `for the ${r.targets.length} selected student${r.targets.length === 1 ? '' : 's'}` : `for all of ${cls}`),
    t.who === 'one' && 'about the selected student',
  ].filter(Boolean).join(', ');
  return `${t.label}${bits ? ` ${bits}` : ''}.${r.note ? ` ${r.note}` : ''}`;
}

function AskCard({ items, disabled, onAnswer }: { items: AskItem[]; disabled: boolean; onAnswer: (text: string) => void }) {
  const [pick, setPick] = useState<Record<string, string[]>>({});
  const toggle = (q: AskItem, o: string) => setPick(p => {
    const cur = p[q.id] ?? [];
    return { ...p, [q.id]: q.multi ? (cur.includes(o) ? cur.filter(x => x !== o) : [...cur, o]) : [o] };
  });
  const ready = items.every(q => (pick[q.id] ?? []).length);
  return (
    <div className="cp-ask">
      <div className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', marginBottom: 8 }}>A QUICK CHECK BEFORE I MAKE IT</div>
      {items.map(q => (
        <div key={q.id}>
          <div className="q">{q.question}{q.multi && <span className="muted" style={{ fontWeight: 600 }}> (pick any)</span>}</div>
          <div>{q.options.map(o => (
            <button key={o} className={`opt${(pick[q.id] ?? []).includes(o) ? ' on' : ''}`} aria-pressed={(pick[q.id] ?? []).includes(o)} disabled={disabled} onClick={() => toggle(q, o)}>{o}</button>
          ))}</div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button className="btn sm red" disabled={disabled || !ready} onClick={() => onAnswer(items.map(q => `${q.question} → ${(pick[q.id] ?? []).join(', ')}`).join('\n'))}>Continue</button>
        <button className="btn sm" disabled={disabled} onClick={() => onAnswer('Use your best judgement on those and go ahead.')}>You decide</button>
      </div>
    </div>
  );
}

function InsightCard({ i, onAct, onWhy }: { i: Insight; onAct: (a: InsightAction) => void; onWhy: (i: Insight) => void }) {
  return (
    <div className={`ins ${i.tone}`}>
      <b>{i.title}</b>
      <p>{i.detail}</p>
      <div className="acts">
        {i.actions.map(a => <button key={a.label} className="btn sm" onClick={() => onAct(a)}>{a.label}</button>)}
        <button className="btn sm" onClick={() => onWhy(i)}><MagnifyingGlass size={12} weight="bold" /> Ask why</button>
      </div>
    </div>
  );
}

/**
 * Teacher Copilot (mockup teacher:ai, taken further). Two ways in: "Make
 * something" (pick a tile, see a free example, set it up, create), or just
 * ask. It probes the class data for what needs attention, asks before it
 * assumes, pushes back when a request doesn't fit the evidence, and hands back
 * artifacts with real actions (send to class, save to planner, print).
 */
export default function Copilot() {
  const { profile } = useAuth();
  const { desk, error: deskError, call } = useTeacherDesk();
  const { classes, cls, subjects, subject, go } = useScopeSelection(desk?.scope ?? []);
  const [toast, toastEl] = useToast();
  const uid = profile?.uid ?? 'anon';
  const [threads, setThreads] = useState<Thread[]>(() => loadThreads(uid));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ message: string; text: string; opts: SendOpts } | null>(null);
  const [studio, setStudio] = useState<{ kind: StudioKind; preset: StudioPreset | null; key: number } | null>(null);
  const [ctx, setCtx] = useState<{ students: number; chaptersWithEvidence: number; assignments: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const active = threads.find(t => t.id === activeId) ?? null;
  const turns = active?.turns ?? [];
  const chapters = useMemo(() => { const c = getCurriculum(cls, subject); return c ? courseChapters(c) : []; }, [cls, subject]);
  const klass = desk?.classes.find(c => normClass(c.cls) === normClass(cls));
  const students = klass?.students ?? [];
  const belowForty = students.filter(s => { const v = studentTml(s, subject ? [subject] : []); return v !== null && v < 40; });
  const insights = useMemo(() => (desk ? buildInsights(desk) : []), [desk]);
  const classInsights = insights.filter(i => normClass(i.cls) === normClass(cls));
  const otherInsights = insights.filter(i => normClass(i.cls) !== normClass(cls));

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns.length, sending]);

  const persist = (next: Thread[]) => { setThreads(next); saveThreads(uid, next); };

  async function send(text: string, opts: SendOpts = {}) {
    const body = text.trim();
    if (!body || sending) return;
    const useCls = opts.cls ?? cls, useSubject = opts.subject ?? subject;
    if (!useCls || !useSubject) { setFailed({ message: 'Pick a class and subject first.', text: body, opts }); return; }
    setFailed(null); setInput('');
    const st = opts.studio ?? null;
    const teacherTurn: ChatTurn = { role: 'teacher', text: body, at: now(), ...(st?.targets.length ? { targets: st.targets } : {}) };
    const base: Thread = !opts.fresh && active && active.cls === useCls && active.subject === useSubject
      ? active : { id: newId(), title: threadTitle(body), cls: useCls, subject: useSubject, turns: [], updated: now() };
    const withTeacher: Thread = { ...base, turns: [...base.turns, teacherTurn], updated: now() };
    const others = threads.filter(t => t.id !== withTeacher.id);
    persist([withTeacher, ...others]);
    setActiveId(withTeacher.id);
    setSending(st ? `Writing your ${STUDIO.find(x => x.kind === st.kind)!.label.toLowerCase()} from ${useCls}'s results…` : `Reading ${useCls}'s results…`);
    chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const lastArtifactIdx = withTeacher.turns.map((t, i) => (t.reply?.artifact ? i : -1)).filter(i => i >= 0).pop();
      const res = await call<{ reply: CopilotReply; context: typeof ctx }>('/api/teacher/copilot', 'POST', {
        class: useCls, subject: useSubject, chapter: st?.chapter || undefined,
        studio: st ? { kind: st.kind, count: st.count, difficulty: st.difficulty, durationMin: st.duration, targets: st.targets } : undefined,
        messages: withTeacher.turns.map((t, i) => ({ role: t.role, text: turnText(t, i === lastArtifactIdx) })),
      });
      setCtx(res.context);
      // A reply inherits the targets of the request it answers (so "Send to class" goes to those students).
      const inherited = [...withTeacher.turns].reverse().find(t => t.role === 'teacher' && t.targets)?.targets;
      const done: Thread = { ...withTeacher, turns: [...withTeacher.turns, { role: 'copilot', text: res.reply.say, reply: res.reply, at: now(), ...(inherited ? { targets: inherited } : {}) }], updated: now() };
      persist([done, ...others]);
    } catch (e: any) {
      // Take the unanswered request back off the thread; "Try again" re-sends it.
      persist([{ ...withTeacher, turns: withTeacher.turns.slice(0, -1) }, ...others].filter(t => t.turns.length));
      setFailed({ message: e?.message || 'The Copilot didn’t answer.', text: body, opts: { ...opts, fresh: !base.turns.length } });
    } finally {
      setSending(null);
    }
  }

  const openStudio = (kind: StudioKind | null, preset: StudioPreset | null = null) =>
    setStudio(kind ? { kind, preset, key: now() } : null);

  function onGenerate(r: StudioRequest) {
    setStudio(null);
    send(studioText(r, cls), { studio: r, fresh: true });
  }

  function onInsightAction(a: InsightAction) {
    if (a.href) { window.location.assign(a.href); return; }
    if (!a.studio) return;
    if (normClass(a.studio.cls) !== normClass(cls) || (a.studio.subject && a.studio.subject !== subject)) go({ class: a.studio.cls, subject: a.studio.subject || null });
    openStudio(a.studio.kind, { chapter: a.studio.chapter, who: a.studio.who, student: a.studio.student, note: a.studio.note });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const onWhy = (i: Insight) => {
    const elsewhere = normClass(i.cls) !== normClass(cls);
    const sub = elsewhere ? desk?.classes.find(c => normClass(c.cls) === normClass(i.cls))?.subjects[0] ?? subject : subject;
    if (elsewhere) go({ class: i.cls, subject: sub || null });
    send(`You flagged: "${i.title}" (${i.detail}). What's most likely behind it, what should I check first, and what would you do this week?`, { cls: i.cls, subject: sub, fresh: true });
  };

  const newChat = () => { setActiveId(null); setFailed(null); setInput(''); inputRef.current?.focus(); };
  const removeThread = (id: string) => { persist(threads.filter(t => t.id !== id)); if (activeId === id) setActiveId(null); };
  const openThread = (t: Thread) => { setActiveId(t.id); setFailed(null); if (normClass(t.cls) !== normClass(cls) || t.subject !== subject) go({ class: t.cls, subject: t.subject }); };

  if (deskError) return <div className="note err" role="alert">Couldn&apos;t load your classes: {deskError}</div>;
  if (!desk) {
    return (
      <div aria-busy="true">
        <PageBar eyebrow="AI ASSISTANT" title="Teacher Copilot" sub={<Skeleton h={14} w={360} />} />
        <div className="cp-grid"><div className="card"><Skeleton h={420} /></div><div className="card"><Skeleton h={320} /></div></div>
      </div>
    );
  }
  if (!classes.length) {
    return (
      <>
        <PageBar eyebrow="AI ASSISTANT" title="Teacher Copilot" />
        <div className="card"><Empty icon={<Warning size={26} weight="duotone" />} title="No classes assigned yet">
          The Copilot works from your classes&apos; real data. Once your admin links you to classes and subjects, it&apos;s ready.
        </Empty></div>
      </>
    );
  }

  const lastReply = [...turns].reverse().find(t => t.reply)?.reply ?? null;
  const threadsHere = threads.filter(t => normClass(t.cls) === normClass(cls));

  return (
    <>
      <PageBar eyebrow="AI ASSISTANT" title="Teacher Copilot"
        sub="Make something for your class, or just ask. It works from your class's real results and checks with you before it assumes."
        actions={<>
          <ScopePicker classes={classes} cls={cls} subjects={subjects} subject={subject} onChange={n => { go({ class: n.class ?? cls, subject: n.subject ?? (n.class ? null : subject) }); setActiveId(null); setStudio(null); }} />
          {turns.length > 0 && <button className="btn" onClick={newChat}><Plus size={14} weight="bold" /> New conversation</button>}
        </>} />

      <div className="cp-grid">
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* ── Make something ────────────────────────────────────────────── */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>Make something for {cls}</h3>
              {!studio && <span className="muted" style={{ fontSize: 12.5 }}>Pick one to see an example first. Nothing is generated until you say so.</span>}
            </div>
            <StudioTiles selected={studio?.kind ?? null} compact={!!studio} onSelect={k => openStudio(k)} />
            {studio && (
              <StudioPanel key={studio.key} kind={studio.kind} preset={studio.preset} cls={cls} subject={subject} chapters={chapters}
                students={students} belowForty={belowForty} sending={!!sending} onGenerate={onGenerate} onClose={() => setStudio(null)} />
            )}
          </div>

          {/* ── Conversation ──────────────────────────────────────────────── */}
          <div className="card cp-chat" style={{ padding: 0 }} ref={chatRef}>
            <div className="cp-ctx">
              <Chip tone="b">{cls}</Chip><Chip tone="n">{subject || 'Subject'}</Chip>
              <span style={{ marginLeft: 'auto' }}>
                {ctx ? `Working from ${ctx.students} students · ${ctx.chaptersWithEvidence} chapter${ctx.chaptersWithEvidence === 1 ? '' : 's'} with results · ${ctx.assignments} assignment${ctx.assignments === 1 ? '' : 's'}` : 'Student names stay on Sthara’s servers'}
              </span>
            </div>

            <div className="cp-stream" aria-live="polite">
              {!turns.length && (
                <div className="cp-ai">
                  <div className="cp-av"><Sparkle size={17} weight="fill" /></div>
                  <div className="cp-body">
                    <div className="cp-say">
                      <b>Hi {desk.me.name.split(' ')[0]}. Ask me anything about {cls} {subject}</b>, or pick something to make above.
                      {' '}I&apos;ll use your class&apos;s results, and if something doesn&apos;t add up I&apos;ll say so before I make it.
                    </div>
                    <div className="sugg">{STARTERS.map(s => <button key={s} disabled={!!sending} onClick={() => send(s)}>{s}</button>)}</div>
                  </div>
                </div>
              )}

              {turns.map((t, idx) => t.role === 'teacher'
                ? <div key={idx} className="cp-me">{t.text}</div>
                : (
                  <div key={idx} className="cp-ai">
                    <div className="cp-av"><Sparkle size={17} weight="fill" /></div>
                    <div className="cp-body">
                      {t.reply?.say && <div className="cp-say md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{t.reply.say}</ReactMarkdown></div>}
                      {t.reply?.ask.length ? <AskCard items={t.reply.ask} disabled={!!sending || idx !== turns.length - 1} onAnswer={a => send(a)} /> : null}
                      {t.reply?.artifact && (
                        <ArtifactView artifact={t.reply.artifact} cls={active?.cls ?? cls} subject={active?.subject ?? subject} targets={t.targets ?? []} onToast={toast}
                          onRefine={r => send(`${r} — revise the ${t.reply!.artifact!.kind === 'questions' ? 'questions' : t.reply!.artifact!.kind === 'lesson' ? 'lesson plan' : 'document'} you just made.`)} />
                      )}
                      {idx === turns.length - 1 && t.reply?.suggestions.length ? (
                        <div className="sugg">{t.reply.suggestions.map(s => <button key={s} disabled={!!sending} onClick={() => send(s)}>{s}</button>)}</div>
                      ) : null}
                    </div>
                  </div>
                ))}

              {sending && (
                <div className="cp-ai"><div className="cp-av"><Sparkle size={17} weight="fill" /></div>
                  <div className="cp-body"><div className="cp-say"><span className="typing"><i /><i /><i /></span> <span className="muted" style={{ fontSize: 12.5, marginLeft: 6 }}>{sending}</span></div></div></div>
              )}
              {failed && (
                <div className="err" role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1 }}>{failed.message}</span>
                  <button className="btn sm" onClick={() => send(failed.text, failed.opts)}><ArrowClockwise size={13} weight="bold" /> Try again</button>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <form className="cp-input" onSubmit={e => { e.preventDefault(); send(input); }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <textarea ref={inputRef} rows={2} value={input} maxLength={4000} aria-label="Ask the Copilot"
                  placeholder={lastReply?.ask.length ? 'Answer above, or reply in your own words…' : `Ask about ${cls}, e.g. "Who's struggling with ${chapters[0]?.name ?? 'this chapter'}?"`}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
                <span className="muted" style={{ fontSize: 11 }}>Enter to send · Shift+Enter for a new line</span>
              </div>
              <button className="btn red" type="submit" disabled={!!sending || !input.trim()} aria-label="Send"><PaperPlaneRight size={16} weight="fill" /></button>
            </form>
          </div>
        </div>

        {/* ── Worth a look (probe) ──────────────────────────────────────── */}
        <div className="cp-rail cp-probe">
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><MagnifyingGlass size={16} weight="bold" /> Worth a look</h3>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 12px' }}>Spotted in your marks, submissions and coverage. Actions open with a preview; nothing runs until you say so.</p>
            {classInsights.length ? classInsights.map(i => <InsightCard key={i.id} i={i} onAct={onInsightAction} onWhy={onWhy} />)
              : <p className="muted" style={{ fontSize: 12.5 }}>Nothing flagged for {cls} right now.</p>}
            {otherInsights.length > 0 && (
              <>
                <div className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', margin: '14px 0 8px' }}>YOUR OTHER CLASSES</div>
                {otherInsights.slice(0, 3).map(i => <InsightCard key={i.id} i={i} onAct={onInsightAction} onWhy={onWhy} />)}
              </>
            )}
          </div>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Past conversations · {cls}</h3>
            {threadsHere.length ? threadsHere.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button className={`thread${t.id === activeId ? ' on' : ''}`} onClick={() => openThread(t)}>
                  {t.title}<span>{t.subject} · {new Date(t.updated).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {t.turns.length} message{t.turns.length === 1 ? '' : 's'}</span>
                </button>
                <button className="btn sm" aria-label={`Delete conversation ${t.title}`} onClick={() => removeThread(t.id)}><Trash size={12} weight="bold" /></button>
              </div>
            )) : <p className="muted" style={{ fontSize: 12.5 }}>Conversations are kept on this device.</p>}
          </div>
        </div>
      </div>
      {toastEl}
    </>
  );
}
