'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { CircleIcon as Circle } from '@phosphor-icons/react/dist/ssr/Circle';
import { PaperPlaneRightIcon as PaperPlaneRight } from '@phosphor-icons/react/dist/ssr/PaperPlaneRight';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { TrendDownIcon as TrendDown } from '@phosphor-icons/react/dist/ssr/TrendDown';
import { TrendUpIcon as TrendUp } from '@phosphor-icons/react/dist/ssr/TrendUp';
import InteractiveIcon from '@/components/ui/InteractiveIcon';
import { subjectIcon } from '@/components/canon/subjectIcon';
import { subjectColor } from '@/lib/student/shape';
import { Chip, Donut, PageBar, Skeleton, hmColor } from '@/components/canon/ui';
import DemoNote from '@/components/canon/DemoNote';
import { useAuth } from '@/contexts/AuthContext';
import { useStudentDesk } from '@/lib/student/useStudentDesk';
import { DEMO_TUTOR } from '@/lib/demo/student';
import { getTutorDepthScore } from '@/lib/tml/engine';
import { flattenChapters, getCurriculum, subjectsForClass } from '@/lib/curriculum';

type Line = { who: 'ai' | 'me' | 'done'; text: string; good?: boolean };
interface Topic { subject: string; name: string; start: number | null }
interface Result { depth: number; topicScore: number | null }

const MAX_HINTS_SHOWN = 3;
const depthLabel = (hints: number, revealed: boolean) =>
  revealed ? 'answer revealed' : hints === 0 ? 'unaided' : hints === 1 ? 'one hint' : `${hints} hints`;

export default function TutorPage() {
  return <Suspense fallback={<Skeleton h={600} style={{ borderRadius: 20 }} />}><Tutor /></Suspense>;
}

function Tutor() {
  const { desk } = useStudentDesk();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const fromUrl = params.get('topic');
  const topic: Topic | null = useMemo(() => {
    if (!fromUrl) return null;
    const subject = params.get('subject') || 'General';
    const s = Number(params.get('score'));
    return { subject, name: fromUrl, start: Number.isFinite(s) && params.get('score') !== null ? s : null };
  }, [fromUrl, params]);

  const choose = (t: Topic) => {
    const p = new URLSearchParams({ topic: t.name, subject: t.subject });
    if (t.start !== null) p.set('score', String(t.start));
    router.replace(`${pathname}?${p}`);
  };
  const reset = () => router.replace(pathname);

  if (!desk) return <Skeleton h={600} style={{ borderRadius: 20 }} />;
  const demo = desk.mode === 'demo';

  return (
    <>
      {demo && <DemoNote />}
      {topic
        ? <Session key={`${topic.subject}:${topic.name}`} topic={topic} demo={demo} onNew={reset} />
        : <Picker desk={desk} onPick={choose} />}
    </>
  );
}

// ── Topic picker: weakest micro-topics first, or any topic typed in ─────────
function Picker({ desk, onPick }: { desk: NonNullable<ReturnType<typeof useStudentDesk>['desk']>; onPick: (t: Topic) => void }) {
  const weakest = desk.subjects
    .flatMap(s => s.topics.filter(t => t.score !== null).map(t => ({ subject: s.subject, name: t.name, start: t.score })))
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
    .slice(0, 5);
  // Subjects offered: the official 2026-27 curriculum for the student's class
  // first, then anything the student already has graded work in.
  const official = subjectsForClass(desk.me.cls);
  const subjectOptions = [...new Set([...official, ...desk.subjects.map(s => s.subject)])];
  const [subject, setSubject] = useState(subjectOptions[0] || 'Mathematics');
  const curriculum = getCurriculum(desk.me.cls, subject);
  const chapters = curriculum ? flattenChapters(curriculum) : [];
  const [chapter, setChapter] = useState('');
  const [custom, setCustom] = useState('');
  const OTHER = '__other__';
  const topicName = chapter === OTHER || !curriculum ? custom.trim() : chapter;

  return (
    <>
      <PageBar eyebrow="SOCRATIC AI TUTOR" title="Pick a micro-topic"
        sub="We'll ask a question, then a hint, then the answer — never straight to the answer first." />
      <div className="g2">
        <div className="card">
          <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>Where you&apos;ll gain the most</h3>
          <p className="muted" style={{ marginBottom: 12 }}>Your lowest-scoring micro-topics right now. Getting there with fewer hints counts for more.</p>
          {weakest.length === 0 ? <p className="muted">Nothing scored yet — pick a chapter on the right.</p> : weakest.map(t => (
            <button key={`${t.subject}:${t.name}`} className="row" onClick={() => onPick(t)}>
              <div className="av" style={{ background: `color-mix(in srgb, ${subjectColor(t.subject)} 10%, #fff)` }}><InteractiveIcon icon={subjectIcon(t.subject)} color={subjectColor(t.subject)} size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t.subject}</div>
              </div>
              <b style={{ color: hmColor(t.start ?? 0), fontSize: 15 }}>{t.start}%</b>
            </button>
          ))}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>From your syllabus</h3>
          <p className="muted" style={{ marginBottom: 18 }}>
            {curriculum
              ? <>Chapters from the CBSE {curriculum.session} curriculum for Class {curriculum.class} {curriculum.subject}. The tutor sticks to what the syllabus prescribes.</>
              : 'Name a topic from class and the tutor will build a short three-step session around it.'}
          </p>
          <form onSubmit={e => { e.preventDefault(); if (topicName) onPick({ subject, name: topicName, start: null }); }}>
            <label className="lbl" htmlFor="tp-subj">SUBJECT</label>
            <select id="tp-subj" className="tin" style={{ width: '100%', marginBottom: 14 }} value={subject}
              onChange={e => { setSubject(e.target.value); setChapter(''); }}>
              {subjectOptions.map(s => <option key={s}>{s}</option>)}
            </select>
            {curriculum && (
              <>
                <label className="lbl" htmlFor="tp-ch">CHAPTER</label>
                <select id="tp-ch" className="tin" style={{ width: '100%', marginBottom: 14 }} value={chapter} onChange={e => setChapter(e.target.value)}>
                  <option value="" disabled>Choose a chapter</option>
                  {curriculum.units.map(u => (
                    <optgroup key={u.code} label={u.marks !== null ? `${u.name} (${u.marks} marks)` : u.name}>
                      {chapters.filter(c => c.unitCode === u.code).map(c => (
                        <option key={c.name} value={c.name}>{c.name}{c.formativeOnly ? ' (not in board exam)' : ''}</option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={OTHER}>Something else…</option>
                </select>
              </>
            )}
            {(!curriculum || chapter === OTHER) && (
              <>
                <label className="lbl" htmlFor="tp-topic">MICRO-TOPIC</label>
                <input id="tp-topic" className="tin" style={{ width: '100%' }} maxLength={120} placeholder="e.g. Circles — Tangents" value={custom} onChange={e => setCustom(e.target.value)} />
              </>
            )}
            <button className="btn pri" style={{ marginTop: 16 }} disabled={!topicName}>Start session <ArrowRight size={15} weight="bold" /></button>
          </form>
        </div>
      </div>
    </>
  );
}

// ── One Socratic session ─────────────────────────────────────────────────────
function Session({ topic, demo, onNew }: { topic: Topic; demo: boolean; onNew: () => void }) {
  const { getAuthToken } = useAuth();
  const scripted = demo; // no live session to call the model with
  const title = scripted ? DEMO_TUTOR.topic : topic.name;
  const start = scripted ? (topic.name === DEMO_TUTOR.topic ? topic.start ?? DEMO_TUTOR.start : DEMO_TUTOR.start) : topic.start;

  const [log, setLog] = useState<Line[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [steps, setSteps] = useState(3);
  const [hints, setHints] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [log, busy]);

  const call = async (payload: Record<string, unknown>) => {
    const auth = await getAuthToken();
    const res = await fetch('/api/tutor/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'The tutor had trouble answering. Try again.');
    return data;
  };

  const finish = (h: number, rev: boolean, r: Result) => {
    setDone(true); setResult(r);
    const earned = !rev && h <= 1;
    const moved = r.topicScore !== null && start !== null ? ` ${title.split(' — ')[0]} moved from ${start}% to ${Math.round(r.topicScore)}%.` : r.topicScore !== null ? ` ${title.split(' — ')[0]} is now ${Math.round(r.topicScore)}%.` : '';
    setLog(l => [...l, {
      who: 'done', good: earned,
      text: earned
        ? `You got there ${h === 0 ? 'without me giving the answer' : 'with just one nudge'} — that is worth more to your TML than a correct copy.${moved}`
        : `Recorded — since you needed more help this time, it counts for less evidence, but it still moved the needle.${moved}`,
    }]);
  };

  // Open with the first question.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (scripted) { setSteps(DEMO_TUTOR.steps.length); setLog([{ who: 'ai', text: DEMO_TUTOR.steps[0].prompt }]); return; }
    setBusy(true);
    call({ action: 'start', subject: topic.subject, topic: topic.name })
      .then(d => { setLog([{ who: 'ai', text: d.text }]); setToken(d.token); setStep(d.step); setSteps(d.steps); })
      .catch(e => setErr(e.message))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const history = () => log.filter(l => l.who !== 'done').map(l => ({ who: l.who, text: l.text }));

  const send = async () => {
    const text = input.trim();
    if (!text || done || busy) return;
    setInput(''); setErr(null);
    setLog(l => [...l, { who: 'me', text }]);

    if (scripted) {
      const s = DEMO_TUTOR.steps[step - 1];
      if (s.accept.test(text)) {
        if (step < DEMO_TUTOR.steps.length) { setStep(step + 1); setLog(l => [...l, { who: 'ai', text: DEMO_TUTOR.steps[step].prompt }]); }
        else { setLog(l => [...l, { who: 'ai', text: `${DEMO_TUTOR.answer} is right.` }]); finish(hints, false, { depth: getTutorDepthScore(hints, false), topicScore: null }); }
      } else {
        const h = hints + 1; setHints(h);
        setLog(l => [...l, { who: 'ai', text: `Hint ${Math.min(h, MAX_HINTS_SHOWN)} of ${MAX_HINTS_SHOWN}. ${s.hint}` }]);
      }
      return;
    }

    setBusy(true);
    try {
      const d = await call({ action: 'answer', token, answer: text, history: history() });
      setToken(d.token); setStep(d.step); setHints(d.hints);
      setLog(l => [...l, { who: 'ai', text: d.verdict === 'hint' ? `Hint ${Math.min(d.hints, MAX_HINTS_SHOWN)} of ${MAX_HINTS_SHOWN}. ${d.text}` : d.text }]);
      if (d.verdict === 'complete') finish(d.hints, false, d.result);
    } catch (e: any) {
      setErr(e.message); setInput(text); setLog(l => l.slice(0, -1));
    } finally {
      setBusy(false); inputRef.current?.focus();
    }
  };

  const reveal = async () => {
    if (done || busy) return;
    setErr(null); setRevealed(true);
    setLog(l => [...l, { who: 'me', text: 'I’m stuck — just tell me.' }]);
    if (scripted) {
      const s = DEMO_TUTOR.steps[step - 1];
      setLog(l => [...l, { who: 'ai', text: `No problem. ${s.hint} The answer is ${DEMO_TUTOR.answer}.` }]);
      finish(hints, true, { depth: getTutorDepthScore(hints, true), topicScore: null });
      return;
    }
    setBusy(true);
    try {
      const d = await call({ action: 'reveal', token, history: history() });
      setToken(d.token);
      setLog(l => [...l, { who: 'ai', text: d.text }]);
      finish(d.hints, true, d.result);
    } catch (e: any) {
      setErr(e.message); setRevealed(false); setLog(l => l.slice(0, -1));
    } finally {
      setBusy(false);
    }
  };

  const after = result?.topicScore ?? null;
  const impact = done ? (after ?? result?.depth ?? 0) : start ?? 0;
  const impactColor = done ? hmColor(impact) : '#CBD5E1';

  return (
    <>
      <PageBar eyebrow="SOCRATIC AI TUTOR" title={title}
        sub="We'll ask a question, then a hint, then the answer — never straight to the answer first."
        actions={<>
          <Chip tone={done ? 'g' : 'p'}>{done ? 'ALL DONE' : `HINTS USED: ${Math.min(hints, MAX_HINTS_SHOWN)} OF ${MAX_HINTS_SHOWN}`}</Chip>
          <button className="btn" onClick={onNew}>New session</button>
        </>}
      />
      {scripted && topic.name !== DEMO_TUTOR.topic && (
        <div className="note" style={{ marginBottom: 18 }}>
          Routed here from <b>{topic.name}</b>. Without a live session the tutor runs its scripted Circles · Tangents example instead — sign in to get a real session on this topic.
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <b style={{ fontSize: 15 }}>Session · step {Math.min(step, steps)} of {steps}</b>
          {!scripted && <span className="muted" style={{ fontSize: 12 }}>{topic.subject}</span>}
        </div>
        <div className="tlog" ref={logRef} aria-live="polite">
          {log.map((l, i) => l.who === 'me'
            ? <div key={i} className="bub-me">{l.text}</div>
            : l.who === 'done'
              ? <div key={i} className={`bub-ai bub-done ${l.good ? 'good' : 'meh'}`}>
                  <div className="av">{l.good ? <Check size={17} weight="bold" /> : <Circle size={13} weight="fill" />}</div>
                  <div>{l.text}</div>
                </div>
              : <div key={i} className="bub-ai"><div className="av"><Sparkle size={17} weight="fill" /></div><div>{l.text}</div></div>)}
          {busy && <div className="bub-ai"><div className="av"><Sparkle size={17} weight="fill" /></div><div><span className="typing" aria-label="Tutor is thinking"><i /><i /><i /></span></div></div>}
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {err && <div className="note err" role="alert">{err}</div>}
          <form style={{ display: 'flex', gap: 10 }} onSubmit={e => { e.preventDefault(); void send(); }}>
            <input ref={inputRef} className="tin" value={input} onChange={e => setInput(e.target.value)} maxLength={1500}
              aria-label="Your answer" placeholder={done ? 'Session finished — start a new one to keep going' : 'Type your answer…'} disabled={done || (busy && !log.length)} />
            <button className="btn red" disabled={done || busy || !input.trim()}><PaperPlaneRight size={15} weight="fill" /> Send</button>
          </form>
          {!done && (
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={reveal} disabled={busy || !log.length}>
              I&apos;m stuck — just tell me
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Session impact</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <Donut value={impact} color={impactColor} />
          <div>
            <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em' }}>{title.split(' — ')[0].toUpperCase()} — MICRO-TOPIC</div>
            <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, margin: '8px 0', color: done ? undefined : 'var(--mut2)' }}>
              {done ? `${Math.round(impact)}%` : start !== null ? `${start}%` : '—'}
            </div>
            {done ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {after !== null && start !== null && (
                  <Chip tone={after >= start ? 'g' : 'a'}>{after >= start ? <TrendUp size={13} weight="bold" /> : <TrendDown size={13} weight="bold" />} {Math.abs(Math.round(after - start))} pts this session</Chip>
                )}
                <Chip tone="p">Tutor depth {result?.depth} · {depthLabel(hints, revealed)}</Chip>
                {after === null && <span className="muted" style={{ fontSize: 12 }}>{scripted ? 'Demo sessions aren’t written to your TML.' : 'Saved — your TML updates on the next recompute.'}</span>}
              </div>
            ) : <div className="muted" style={{ fontSize: 12 }}>{start !== null ? 'Where this topic stands now · updates once you finish' : 'Updates once you finish'}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
